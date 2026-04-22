import { logger } from '../utils/logger';
import { getDb } from '../db';

/**
 * Migration 022 — campaign_similarities feeder.
 *
 * Computes a hybrid similarity score for every (campaign_a, campaign_b) pair
 * where the two campaigns belong to *different* sites (we want competitor
 * comparisons, not self-similarity). The pipeline is intentionally
 * lightweight and AI-free so we don't trigger the DeepSeek cost guard for
 * what is essentially a join-time precomputation:
 *
 *   text_cosine    — TF-IDF cosine over (title + body) tokens, weighted 0.50
 *   category_match — same ai_analysis.category / campaign_type             0.25
 *   bonus_proximity— normalized 1 - |a-b| / max(a,b) for bonus_amount      0.15
 *   tag_jaccard    — Jaccard overlap of extractedTags keys (non-null)      0.10
 *
 * Final score is the weighted average of the four components and is clamped
 * to [0, 1]. We persist the top-5 most similar competitors per campaign in a
 * single INSERT ... ON DUPLICATE KEY UPDATE so re-runs refresh existing
 * pairs in place.
 *
 * `reason` is a short human-readable string the dashboard surfaces in the
 * "Benzer Kampanyalar" tab, e.g.:
 *   "ayni kategori (cashback) + benzer bonus (1500 vs 1400) + 78% metin ortusmesi"
 */

const TOP_N_PER_CAMPAIGN = 5;
const MIN_SCORE_TO_PERSIST = 0.05; // anything below is noise — skip insert

const WEIGHTS = {
  text: 0.5,
  category: 0.25,
  bonus: 0.15,
  tag: 0.1,
} as const;

interface CampaignFeatureRow extends Record<string, unknown> {
  id: string;
  site_id: string;
  title: string;
  body: string | null;
  metadata: unknown;
}

interface CampaignFeatures {
  id: string;
  siteId: string;
  /** Lowercased token list for TF-IDF (title + body merged). */
  tokens: string[];
  /** Token frequency map for the document. */
  tf: Map<string, number>;
  category: string | null;
  bonusAmount: number | null;
  /** Set of extracted-tag *keys* with non-null values, for Jaccard. */
  tagKeys: Set<string>;
  title: string;
}

export interface SimilarityCalcResult {
  campaignsConsidered: number;
  pairsEvaluated: number;
  pairsPersisted: number;
  averageScore: number;
  durationMs: number;
}

const STOPWORDS = new Set([
  // Turkish + filler tokens that dominate bonus copy without carrying signal.
  've', 'ile', 'icin', 'icin', 'bir', 'bu', 'da', 'de', 'mi', 'mu',
  'olan', 'olarak', 'tum', 'her', 'hem', 'ya', 'veya', 'siz', 'biz',
  'kampanya', 'kampanyasi', 'kampanyalar', 'bonus', 'sartlar', 'sart',
  'kosul', 'kosullar', 'detay', 'detaylar', 'tikla', 'tiklayin', 'tiklayiniz',
  'kazan', 'kazanin', 'kayit', 'uye', 'uyelik', 'simdi', 'hemen',
  'tl', 'try', 'sa', 'sa.',
]);

function normalizeText(value: string | null): string {
  if (!value) return '';
  // Best-effort Turkish-aware lowercase + diacritic strip.
  return value
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

function tokenize(input: string): string[] {
  if (!input) return [];
  const cleaned = normalizeText(input).replace(/[^a-z0-9\s%]/g, ' ');
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function buildTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const tok of tokens) {
    tf.set(tok, (tf.get(tok) ?? 0) + 1);
  }
  return tf;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function extractFeatures(row: CampaignFeatureRow): CampaignFeatures {
  // metadata is stored as JSON column — mysql2 returns it pre-parsed in
  // most modern drivers, but we defensively handle the string case too.
  let metaObj: Record<string, unknown> = {};
  if (typeof row.metadata === 'string') {
    try {
      metaObj = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metaObj = {};
    }
  } else {
    metaObj = asRecord(row.metadata);
  }

  const ai = asRecord(metaObj.ai_analysis);
  const extractedTags = asRecord(ai.extractedTags ?? ai.extracted_tags);

  const category =
    (typeof ai.category === 'string' ? ai.category : null) ??
    (typeof ai.campaign_type === 'string' ? ai.campaign_type : null) ??
    (typeof ai.campaignType === 'string' ? ai.campaignType : null);

  const bonusAmount =
    toFiniteNumber(extractedTags.bonus_amount) ??
    toFiniteNumber(extractedTags.max_bonus) ??
    toFiniteNumber(extractedTags.free_bet_amount) ??
    toFiniteNumber(extractedTags.freebet_amount);

  const tagKeys = new Set<string>();
  for (const [key, value] of Object.entries(extractedTags)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    tagKeys.add(key);
  }

  const tokens = tokenize(`${row.title ?? ''} ${row.body ?? ''}`);
  return {
    id: row.id,
    siteId: row.site_id,
    tokens,
    tf: buildTermFrequency(tokens),
    category,
    bonusAmount,
    tagKeys,
    title: row.title ?? '',
  };
}

/**
 * Computes IDF over the corpus once per run. doc-frequency is the number of
 * campaigns containing the token at least once.
 */
function computeIdf(corpus: CampaignFeatures[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of corpus) {
    for (const tok of doc.tf.keys()) {
      df.set(tok, (df.get(tok) ?? 0) + 1);
    }
  }
  const N = corpus.length;
  const idf = new Map<string, number>();
  for (const [tok, freq] of df.entries()) {
    // Smoothed idf, identical to scikit-learn's TfidfVectorizer(smooth_idf=true)
    idf.set(tok, Math.log((N + 1) / (freq + 1)) + 1);
  }
  return idf;
}

/**
 * Pre-compute a sparse TF-IDF vector + L2 norm for each campaign so the inner
 * loop only does dot products. Returns vectors keyed by token for efficient
 * intersection.
 */
interface TfidfVec {
  weights: Map<string, number>;
  norm: number;
}

function buildTfidfVector(
  doc: CampaignFeatures,
  idf: Map<string, number>
): TfidfVec {
  const weights = new Map<string, number>();
  let normSq = 0;
  const docLen = doc.tokens.length || 1;
  for (const [tok, count] of doc.tf.entries()) {
    const idfWeight = idf.get(tok) ?? 0;
    if (idfWeight === 0) continue;
    const w = (count / docLen) * idfWeight;
    weights.set(tok, w);
    normSq += w * w;
  }
  return { weights, norm: Math.sqrt(normSq) };
}

function cosine(a: TfidfVec, b: TfidfVec): number {
  if (a.norm === 0 || b.norm === 0) return 0;
  // Iterate the smaller map for the dot product.
  const [small, big] = a.weights.size <= b.weights.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [tok, w] of small.weights.entries()) {
    const other = big.weights.get(tok);
    if (other) dot += w * other;
  }
  return dot / (a.norm * b.norm);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const k of small) {
    if (big.has(k)) intersect++;
  }
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function bonusProximity(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0;
  if (a === 0 && b === 0) return 1;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return 0;
  const diff = Math.abs(a - b);
  return Math.max(0, 1 - diff / max);
}

interface ScoredPair {
  score: number;
  text: number;
  cat: number;
  bonus: number;
  tag: number;
  reason: string;
}

function scorePair(
  a: CampaignFeatures,
  b: CampaignFeatures,
  vecA: TfidfVec,
  vecB: TfidfVec
): ScoredPair {
  const text = cosine(vecA, vecB);
  const cat = a.category && b.category && a.category === b.category ? 1 : 0;
  const bonus = bonusProximity(a.bonusAmount, b.bonusAmount);
  const tag = jaccard(a.tagKeys, b.tagKeys);

  const score =
    WEIGHTS.text * text +
    WEIGHTS.category * cat +
    WEIGHTS.bonus * bonus +
    WEIGHTS.tag * tag;

  const fragments: string[] = [];
  if (cat === 1 && a.category) {
    fragments.push(`ayni kategori (${a.category})`);
  }
  if (bonus >= 0.7 && a.bonusAmount !== null && b.bonusAmount !== null) {
    fragments.push(`benzer bonus (${a.bonusAmount} vs ${b.bonusAmount})`);
  }
  if (text >= 0.2) {
    fragments.push(`${Math.round(text * 100)}% metin ortusmesi`);
  }
  if (tag >= 0.4) {
    fragments.push(`benzer kampanya parametreleri`);
  }
  const reason = fragments.length > 0
    ? fragments.join(' + ')
    : 'zayif eslesme';

  return {
    score: Math.max(0, Math.min(1, score)),
    text,
    cat,
    bonus,
    tag,
    reason,
  };
}

interface PersistRow {
  campaignId1: string;
  campaignId2: string;
  score: number;
  reason: string;
}

async function persistTopMatches(rows: PersistRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const db = getDb();

  // Chunk the upsert so we don't blow past max_allowed_packet for large runs.
  const CHUNK = 200;
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const placeholders: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const r of slice) {
      placeholders.push(
        `($${idx++}, $${idx++}, $${idx++}, 'hybrid', $${idx++})`
      );
      values.push(r.campaignId1, r.campaignId2, r.score.toFixed(4), r.reason);
    }
    const sql = `
      INSERT INTO campaign_similarities
        (campaign_id_1, campaign_id_2, similarity_score, comparison_type, reason)
      VALUES ${placeholders.join(', ')}
      ON DUPLICATE KEY UPDATE
        similarity_score = VALUES(similarity_score),
        comparison_type  = VALUES(comparison_type),
        reason           = VALUES(reason),
        updated_at       = CURRENT_TIMESTAMP(6)
    `;
    const res = await db.query(sql, values);
    written += res.rowCount;
  }
  return written;
}

async function loadCorpus(): Promise<CampaignFeatures[]> {
  const db = getDb();
  // Scope: anything that's been first-seen — we still want similarity for
  // expired competitors so the dashboard can show "this is what they did
  // last cycle". Hidden / pending campaigns are included; they can be
  // filtered at query time if needed.
  const res = await db.query<CampaignFeatureRow>(
    `SELECT id, site_id, title, body, metadata
       FROM campaigns
      WHERE title IS NOT NULL`
  );
  return res.rows.map(extractFeatures);
}

/**
 * Computes top-N most-similar competitors for every campaign in the corpus
 * and upserts the results into campaign_similarities. Designed to be cheap
 * enough to run on every scraper boot (catch-up) — at 65 campaigns the full
 * matrix is ~2k cross-site pairs and finishes in under a second.
 */
export async function processSimilarityCalcJob(
  _payload: Record<string, unknown> = {}
): Promise<SimilarityCalcResult> {
  const startTime = Date.now();
  logger.info('Similarity calculation started');

  const corpus = await loadCorpus();
  if (corpus.length < 2) {
    logger.info('Similarity calculation skipped — fewer than 2 campaigns', {
      campaignsConsidered: corpus.length,
    });
    return {
      campaignsConsidered: corpus.length,
      pairsEvaluated: 0,
      pairsPersisted: 0,
      averageScore: 0,
      durationMs: Date.now() - startTime,
    };
  }

  const idf = computeIdf(corpus);
  const vectors = new Map<string, TfidfVec>();
  for (const doc of corpus) {
    vectors.set(doc.id, buildTfidfVector(doc, idf));
  }

  // Per-campaign top-N buffer. We mirror writes for both directions
  // (a -> b and b -> a) so a single WHERE campaign_id_1 = ? lookup at read
  // time always finds the top-5 regardless of which side of the pair the
  // user opened.
  const topByCampaign = new Map<string, ScoredPair[] & { otherIds?: string[] }>();
  function pushTop(
    campaignId: string,
    otherId: string,
    pair: ScoredPair
  ): void {
    let list = topByCampaign.get(campaignId);
    if (!list) {
      list = Object.assign([] as ScoredPair[], { otherIds: [] as string[] });
      topByCampaign.set(campaignId, list);
    }
    list.push(pair);
    list.otherIds!.push(otherId);
  }

  let pairsEvaluated = 0;
  let scoreSum = 0;
  let scoreCount = 0;

  for (let i = 0; i < corpus.length; i++) {
    const a = corpus[i];
    const vecA = vectors.get(a.id)!;
    for (let j = i + 1; j < corpus.length; j++) {
      const b = corpus[j];
      // RULE: only score *cross-site* pairs. Same-site campaigns are not
      // considered "rakip" — that would be self-cannibalization data, not
      // competitor intel.
      if (a.siteId === b.siteId) continue;
      const vecB = vectors.get(b.id)!;
      const pair = scorePair(a, b, vecA, vecB);
      pairsEvaluated++;
      scoreSum += pair.score;
      scoreCount++;
      if (pair.score < MIN_SCORE_TO_PERSIST) continue;
      pushTop(a.id, b.id, pair);
      pushTop(b.id, a.id, pair);
    }
  }

  // Reduce each per-campaign buffer to top-N by score.
  const persistRows: PersistRow[] = [];
  for (const [campaignId, list] of topByCampaign.entries()) {
    const otherIds = list.otherIds!;
    // Sort indices by descending score, then take TOP_N_PER_CAMPAIGN.
    const ranked = list
      .map((pair, idx) => ({ pair, otherId: otherIds[idx] }))
      .sort((x, y) => y.pair.score - x.pair.score)
      .slice(0, TOP_N_PER_CAMPAIGN);
    for (const r of ranked) {
      persistRows.push({
        campaignId1: campaignId,
        campaignId2: r.otherId,
        score: r.pair.score,
        reason: r.pair.reason,
      });
    }
  }

  const pairsPersisted = await persistTopMatches(persistRows);
  const averageScore = scoreCount > 0 ? scoreSum / scoreCount : 0;
  const durationMs = Date.now() - startTime;

  logger.info('Similarity calculation completed', {
    campaignsConsidered: corpus.length,
    pairsEvaluated,
    pairsPersistedRows: persistRows.length,
    pairsPersisted,
    averageScore: Number(averageScore.toFixed(4)),
    durationMs,
  });

  return {
    campaignsConsidered: corpus.length,
    pairsEvaluated,
    pairsPersisted,
    averageScore,
    durationMs,
  };
}

/**
 * Convenience wrapper for callers that want the same boot-time semantics as
 * other recalc jobs. Errors are logged but swallowed so a similarity-calc
 * blip cannot crash the scraper boot.
 */
export async function runFullSimilarityScan(): Promise<void> {
  try {
    await processSimilarityCalcJob();
  } catch (error) {
    logger.error('Full similarity scan failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Periodic timer handle for the recurring run. Exposed so graceful shutdown
 * paths (or tests) can stop the loop.
 */
let recurringTimer: NodeJS.Timeout | null = null;

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/**
 * Runs an immediate catch-up similarity scan and then schedules a recurring
 * run every 12 hours. Safe to call multiple times — re-invocations are
 * no-ops if a timer is already registered.
 */
export async function startSimilarityCalcSchedule(
  intervalMs: number = TWELVE_HOURS_MS
): Promise<void> {
  await runFullSimilarityScan();

  if (recurringTimer) {
    logger.debug('Similarity recurring timer already started, skipping');
    return;
  }

  recurringTimer = setInterval(() => {
    runFullSimilarityScan().catch((error) => {
      logger.error('Recurring similarity scan failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  if (typeof recurringTimer.unref === 'function') {
    recurringTimer.unref();
  }

  logger.info('Similarity recurring schedule registered', {
    intervalMs,
    intervalHours: intervalMs / (60 * 60 * 1000),
  });
}

export function stopSimilarityCalcSchedule(): void {
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
    logger.info('Similarity recurring schedule stopped');
  }
}

/**
 * Debounced enqueue helper for the per-campaign trigger path. Called from
 * `processAiAnalysisJob` after a new campaign's AI analysis completes —
 * because the corpus IDF must be recomputed against the new doc, we just
 * schedule the full job rather than a one-vs-many comparison. To avoid
 * queue bloat when many campaigns insert in a burst (initial scrape), we
 * skip the enqueue if a pending/processing similarity-recalc job already
 * exists.
 */
export async function enqueueSimilarityRecalcDebounced(
  triggeredBy: string
): Promise<{ enqueued: boolean; reason: string }> {
  const db = getDb();
  try {
    const existing = await db.query<{ count: number | string }>(
      `SELECT COUNT(*) AS count
         FROM jobs
        WHERE type = 'similarity-recalc'
          AND status IN ('pending', 'processing')`
    );
    const count = Number(existing.rows[0]?.count ?? 0);
    if (count > 0) {
      return { enqueued: false, reason: 'already_pending' };
    }

    // Defer 30s so a burst of inserts coalesces into a single recompute.
    await db.query(
      `INSERT INTO jobs (type, payload, status, priority, max_attempts, scheduled_at)
       VALUES ($1, CAST($2 AS JSON), 'pending', $3, 1, DATE_ADD(NOW(), INTERVAL 30 SECOND))`,
      ['similarity-recalc', JSON.stringify({ triggeredBy }), 40]
    );
    return { enqueued: true, reason: 'queued' };
  } catch (error) {
    logger.warn('Failed to enqueue debounced similarity-recalc', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { enqueued: false, reason: 'error' };
  }
}
