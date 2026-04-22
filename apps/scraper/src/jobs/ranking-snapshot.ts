import { logger } from '../utils/logger';
import { getDb, query } from '../db';

/**
 * Win/Loss Tracker — günlük site sıralaması snapshot job'ı.
 *
 * Her gün 04:00 UTC çalışır (24h cron, momentum-recalc pattern). 4 metric
 * için her site'in o günkü değerini ve sıralamasını ranking_snapshots'a
 * yazar. Aynı (date, site, metric) için INSERT IGNORE — re-run safe.
 *
 * Metrikler:
 *   - campaign_count:     o gün aktif campaign sayısı
 *                         (status='active' AND (valid_to IS NULL OR valid_to >= snapshot)
 *                          AND first_seen_at <= snapshot)
 *   - avg_bonus:          site için median bonus_amount (effective bonus)
 *                         JS tarafında hesaplanır (MySQL 8'de PERCENTILE_CONT yok)
 *   - category_diversity: distinct kategori sayısı
 *   - momentum:           sites.momentum_score (point-in-time için snapshot
 *                         alındığı andaki değer; geçmiş momentum geri-türetilemez)
 *
 * Catch-up: bootstrap'ta hiç snapshot yoksa son 30 günü retro doldurur.
 * Geçmiş momentum geri-hesaplanamadığı için retro snapshot'larda momentum =
 * şu anki sites.momentum_score kullanılır (best-effort fallback).
 */

const METRICS = ['campaign_count', 'avg_bonus', 'category_diversity', 'momentum'] as const;
type Metric = (typeof METRICS)[number];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CATCH_UP_DAYS = 30;

const categoryExpr = `COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), '')
)`;

/**
 * Bonus extraction — bonus-index/weekly-brief route'larıyla aynı kural.
 * direct bonus_amount → freebet → null.
 */
const effectiveBonusExpr = `
  CASE
    WHEN CAST(NULLIF(TRIM(COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_amount')),
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))
    )), '') AS DECIMAL(20,4)) > 0 THEN
      CAST(NULLIF(TRIM(COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_amount')),
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))
      )), '') AS DECIMAL(20,4))
    WHEN CAST(NULLIF(TRIM(COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.free_bet_amount')),
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.freebet_amount')),
      JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.conditions.freebet_amount'))
    )), '') AS DECIMAL(20,4)) > 0 THEN
      CAST(NULLIF(TRIM(COALESCE(
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.free_bet_amount')),
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.freebet_amount')),
        JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.conditions.freebet_amount'))
      )), '') AS DECIMAL(20,4))
    ELSE NULL
  END
`;

interface SiteRow {
  id: string;
  code: string;
  momentum_score: number | string | null;
}

interface CampaignCountRow {
  site_id: string;
  campaign_count: number | string;
}

interface CategoryDiversityRow {
  site_id: string;
  category_diversity: number | string;
}

interface BonusRow {
  site_id: string;
  bonus: number | string | null;
}

export interface RankingSnapshotResult {
  snapshotDate: string;
  rowsInserted: number;
  totalSites: number;
  metricsProcessed: number;
  durationMs: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function asNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Verilen tarih için her site'in metric değerlerini hesaplar.
 * Tarih, "günün sonu" olarak yorumlanır (snapshot_date + 23:59:59 UTC) —
 * o gün hâlâ aktif sayılan kampanyaları yakalar.
 */
async function computeMetricValues(
  snapshotDate: string,
  sites: SiteRow[]
): Promise<Map<string, Map<Metric, number>>> {
  const result = new Map<string, Map<Metric, number>>();
  for (const s of sites) {
    const m = new Map<Metric, number>();
    m.set('campaign_count', 0);
    m.set('avg_bonus', 0);
    m.set('category_diversity', 0);
    m.set('momentum', asNumber(s.momentum_score));
    result.set(s.id, m);
  }

  // "Günün sonu" — o gün için point-in-time snapshot.
  const cutoff = `${snapshotDate} 23:59:59`;

  // 1) campaign_count — o gün aktif olan kampanyalar.
  const countRows = await query<CampaignCountRow>(
    `
    SELECT c.site_id AS site_id, COUNT(*) AS campaign_count
    FROM campaigns c
    WHERE c.first_seen_at <= $1
      AND (c.valid_to IS NULL OR c.valid_to >= $1)
      AND c.status IN ('active', 'updated', 'pending')
    GROUP BY c.site_id
    `,
    [cutoff]
  );
  for (const row of countRows) {
    const m = result.get(row.site_id);
    if (m) m.set('campaign_count', asNumber(row.campaign_count));
  }

  // 2) category_diversity — o gün aktif kampanyalardan distinct kategori.
  const diversityRows = await query<CategoryDiversityRow>(
    `
    SELECT c.site_id AS site_id, COUNT(DISTINCT ${categoryExpr}) AS category_diversity
    FROM campaigns c
    WHERE c.first_seen_at <= $1
      AND (c.valid_to IS NULL OR c.valid_to >= $1)
      AND c.status IN ('active', 'updated', 'pending')
      AND ${categoryExpr} IS NOT NULL
      AND ${categoryExpr} != ''
    GROUP BY c.site_id
    `,
    [cutoff]
  );
  for (const row of diversityRows) {
    const m = result.get(row.site_id);
    if (m) m.set('category_diversity', asNumber(row.category_diversity));
  }

  // 3) avg_bonus — o gün aktif kampanyaların effective bonus median'ı.
  // MySQL 8'de PERCENTILE_CONT yok; ham değerleri çekip JS'te hesapla.
  const bonusRows = await query<BonusRow>(
    `
    SELECT c.site_id AS site_id, ${effectiveBonusExpr} AS bonus
    FROM campaigns c
    WHERE c.first_seen_at <= $1
      AND (c.valid_to IS NULL OR c.valid_to >= $1)
      AND c.status IN ('active', 'updated', 'pending')
    `,
    [cutoff]
  );
  const bonusBuckets = new Map<string, number[]>();
  for (const row of bonusRows) {
    const v = asNumber(row.bonus);
    if (v <= 0) continue;
    let bucket = bonusBuckets.get(row.site_id);
    if (!bucket) {
      bucket = [];
      bonusBuckets.set(row.site_id, bucket);
    }
    bucket.push(v);
  }
  for (const [siteId, vals] of bonusBuckets) {
    const m = result.get(siteId);
    if (m) m.set('avg_bonus', median(vals));
  }

  return result;
}

/**
 * Verilen metric için site'leri DESC sırala (büyük = lider) ve
 * INSERT IGNORE ile snapshot tablosuna yaz.
 */
async function persistMetricRanks(
  snapshotDate: string,
  metric: Metric,
  perSite: Array<{ siteId: string; value: number }>
): Promise<number> {
  if (perSite.length === 0) return 0;

  // Büyük değer = lider (1. sıra). Tüm 4 metrikte de "yukarı = iyi".
  const sorted = perSite.slice().sort((a, b) => b.value - a.value);
  const total = sorted.length;

  const db = getDb();
  let inserted = 0;

  // Tek tek insert — 12 site x 4 metric = 48 row/gün; bulk yapmaya değmez.
  for (let i = 0; i < sorted.length; i++) {
    const { siteId, value } = sorted[i];
    const position = i + 1;
    const result = await db.query(
      `INSERT IGNORE INTO ranking_snapshots
         (snapshot_date, site_id, metric, rank_value, rank_position, total_sites)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [snapshotDate, siteId, metric, value, position, total]
    );
    // mysql2 INSERT IGNORE: affectedRows 1 (inserted) veya 0 (ignored).
    if ((result.rowCount ?? 0) > 0) inserted++;
  }

  return inserted;
}

/**
 * Bir gün için tüm 4 metriği snapshot'la. Re-run safe (INSERT IGNORE).
 */
export async function snapshotForDate(snapshotDate: string): Promise<RankingSnapshotResult> {
  const startTime = Date.now();
  logger.info('Ranking snapshot started', { snapshotDate });

  const sites = await query<SiteRow>(
    `SELECT id, code, momentum_score FROM sites WHERE is_active = 1`
  );

  if (sites.length === 0) {
    logger.warn('Ranking snapshot: no active sites, skipping', { snapshotDate });
    return {
      snapshotDate,
      rowsInserted: 0,
      totalSites: 0,
      metricsProcessed: 0,
      durationMs: Date.now() - startTime,
    };
  }

  const valuesPerSite = await computeMetricValues(snapshotDate, sites);

  let totalInserted = 0;
  for (const metric of METRICS) {
    const perSite: Array<{ siteId: string; value: number }> = [];
    for (const s of sites) {
      const m = valuesPerSite.get(s.id);
      const v = m?.get(metric) ?? 0;
      perSite.push({ siteId: s.id, value: v });
    }
    const ins = await persistMetricRanks(snapshotDate, metric, perSite);
    totalInserted += ins;
  }

  const durationMs = Date.now() - startTime;
  logger.info('Ranking snapshots generated', {
    snapshotDate,
    totalSites: sites.length,
    rowsInserted: totalInserted,
    metricsProcessed: METRICS.length,
    durationMs,
  });

  return {
    snapshotDate,
    rowsInserted: totalInserted,
    totalSites: sites.length,
    metricsProcessed: METRICS.length,
    durationMs,
  };
}

/**
 * Catch-up: hiç snapshot yoksa son 30 günü retro doldurur. Mevcut
 * campaigns/sites verilerinden hesaplanır; first_seen_at <= günün sonu
 * filtresi sayesinde geçmiş günler için anlamlı approximation.
 */
export async function runCatchUpSnapshotsIfEmpty(): Promise<void> {
  const existing = await query<{ cnt: number | string }>(
    `SELECT COUNT(*) AS cnt FROM ranking_snapshots`
  );
  const count = asNumber(existing[0]?.cnt);
  if (count > 0) {
    logger.debug('Ranking snapshots catch-up: table not empty, skipping', { count });
    return;
  }

  logger.info('Ranking snapshots catch-up: backfilling last 30 days');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Eskiden bugüne — chronological insert daha okunaklı log üretir.
  for (let i = CATCH_UP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * ONE_DAY_MS);
    const date = isoDate(d);
    try {
      await snapshotForDate(date);
    } catch (error) {
      logger.error('Ranking snapshot catch-up day failed', {
        date,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/**
 * Periodic timer handle.
 */
let recurringTimer: NodeJS.Timeout | null = null;

/**
 * Bootstrap'ta:
 *   1) catch-up (tablo boşsa son 30g retro doldur)
 *   2) bugünün snapshot'ı (idempotent)
 *   3) 24h interval kaydı
 *
 * Hatalar log'lanır, scraper boot'unu çökertmez.
 */
export async function startRankingSnapshotSchedule(
  intervalMs: number = ONE_DAY_MS
): Promise<void> {
  try {
    await runCatchUpSnapshotsIfEmpty();
  } catch (error) {
    logger.error('Ranking snapshot catch-up failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const today = isoDate(new Date());
    await snapshotForDate(today);
  } catch (error) {
    logger.error('Initial ranking snapshot failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (recurringTimer) {
    logger.debug('Ranking snapshot recurring timer already started, skipping');
    return;
  }

  recurringTimer = setInterval(() => {
    const today = isoDate(new Date());
    snapshotForDate(today).catch((error) => {
      logger.error('Recurring ranking snapshot failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  if (typeof recurringTimer.unref === 'function') {
    recurringTimer.unref();
  }

  logger.info('Ranking snapshot recurring schedule registered', {
    intervalMs,
    intervalHours: intervalMs / (60 * 60 * 1000),
  });
}

export function stopRankingSnapshotSchedule(): void {
  if (recurringTimer) {
    clearInterval(recurringTimer);
    recurringTimer = null;
    logger.info('Ranking snapshot recurring schedule stopped');
  }
}
