export interface SimilarityCandidate {
  campaignId: string;
  title: string;
  body?: string | null;
  normalizedText: string;
  categoryCode?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  siteName?: string;
}

export interface SimilarityResult {
  campaignId: string;
  similarCampaignId: string;
  similarityScore: number;
  similarityReason?: string;
  method: string;
}

export interface FindSimilarOptions {
  maxResults?: number;
  minScore?: number;
  sameCategoryWeight?: number;
  timeProximityWeight?: number;
  textSimilarityWeight?: number;
}

const DEFAULT_OPTIONS: FindSimilarOptions = {
  maxResults: 10,
  minScore: 0.3,
  sameCategoryWeight: 0.3,
  timeProximityWeight: 0.2,
  textSimilarityWeight: 0.5,
};

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter(word => word.length > 2)
  );
}

export function computeJaccardSimilarity(tokens1: Set<string>, tokens2: Set<string>): number {
  if (tokens1.size === 0 && tokens2.size === 0) return 0;
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}

export function computeCosineSimilarity(tokens1: Set<string>, tokens2: Set<string>): number {
  if (tokens1.size === 0 && tokens2.size === 0) return 0;
  
  const intersection = [...tokens1].filter(x => tokens2.has(x)).length;
  const magnitude1 = Math.sqrt(tokens1.size);
  const magnitude2 = Math.sqrt(tokens2.size);
  
  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  
  return intersection / (magnitude1 * magnitude2);
}

function computeTextSimilarity(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  return computeCosineSimilarity(tokens1, tokens2);
}

function computeTimeProximity(
  date1From?: string | null,
  date1To?: string | null,
  date2From?: string | null,
  date2To?: string | null
): number {
  if (!date1From || !date2From) return 0.5;
  
  const d1Start = new Date(date1From).getTime();
  const d2Start = new Date(date2From).getTime();
  
  const daysDiff = Math.abs(d1Start - d2Start) / (1000 * 60 * 60 * 24);
  
  if (daysDiff <= 7) return 1;
  if (daysDiff <= 30) return 0.7;
  if (daysDiff <= 90) return 0.4;
  
  return 0.1;
}

export function computeSimilarity(
  candidate1: SimilarityCandidate,
  candidate2: SimilarityCandidate,
  options: FindSimilarOptions = DEFAULT_OPTIONS
): number {
  const { sameCategoryWeight, timeProximityWeight, textSimilarityWeight } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const text1 = candidate1.normalizedText || '';
  const text2 = candidate2.normalizedText || '';
  const textSim = computeTextSimilarity(text1, text2);

  let categorySim = 0;
  if (candidate1.categoryCode && candidate2.categoryCode) {
    categorySim = candidate1.categoryCode === candidate2.categoryCode ? 1 : 0;
  }

  const timeSim = computeTimeProximity(
    candidate1.validFrom,
    candidate1.validTo,
    candidate2.validFrom,
    candidate2.validTo
  );

  const totalScore =
    textSim * (textSimilarityWeight ?? 0.5) +
    categorySim * (sameCategoryWeight ?? 0.3) +
    timeSim * (timeProximityWeight ?? 0.2);

  return Math.min(1, Math.max(0, totalScore));
}

export function findSimilarCampaigns(
  sourceCampaign: SimilarityCandidate,
  candidates: SimilarityCandidate[],
  options: FindSimilarOptions = DEFAULT_OPTIONS
): SimilarityResult[] {
  const { maxResults, minScore } = { ...DEFAULT_OPTIONS, ...options };

  const results: SimilarityResult[] = [];

  for (const candidate of candidates) {
    if (candidate.campaignId === sourceCampaign.campaignId) {
      continue;
    }

    const score = computeSimilarity(sourceCampaign, candidate, options);

    if (score >= (minScore ?? 0.3)) {
      results.push({
        campaignId: sourceCampaign.campaignId,
        similarCampaignId: candidate.campaignId,
        similarityScore: Math.round(score * 10000) / 10000,
        method: 'text_similarity',
      });
    }
  }

  results.sort((a, b) => b.similarityScore - a.similarityScore);

  return results.slice(0, maxResults ?? 10);
}

export function buildFingerprintForSimilarity(
  title: string,
  body?: string | null
): string {
  const combined = `${title || ''} ${body || ''}`.toLowerCase().trim();
  const tokens = tokenize(combined);
  return [...tokens].sort().join(' ');
}

export interface SimilaritySearchParams {
  categoryCode?: string;
  dateFrom?: string;
  dateTo?: string;
  excludeCampaignIds?: string[];
  limit?: number;
}

export function buildSimilarityQuery(
  normalizedText: string,
  params: SimilaritySearchParams = {}
): {
  sql: string;
  args: unknown[];
} {
  const args: unknown[] = [normalizedText];
  let argIndex = 2;

  let sql = `
    SELECT
      c.id,
      c.title,
      c.body,
      c.normalized_text,
      ca.category_code,
      c.valid_from,
      c.valid_to,
      s.name as site_name,
      similarity(c.normalized_text, $1) as text_score
    FROM public.campaigns c
    LEFT JOIN public.campaign_ai_analyses ca ON ca.campaign_id = c.id AND ca.analysis_type = 'content_analysis'
    LEFT JOIN public.sites s ON s.id = c.site_id
    WHERE c.id != $2
      AND c.status = 'active'
      AND c.valid_to > NOW() - INTERVAL '120 days'
  `;

  if (params.categoryCode) {
    sql += ` AND ca.category_code = $${argIndex}`;
    args.push(params.categoryCode);
    argIndex++;
  }

  if (params.excludeCampaignIds && params.excludeCampaignIds.length > 0) {
    sql += ` AND c.id != ALL($${argIndex}::uuid[])`;
    args.push(params.excludeCampaignIds);
    argIndex++;
  }

  sql += `
    ORDER BY text_score DESC
    LIMIT $${argIndex}
  `;
  args.push(params.limit ?? 20);

  return { sql, args };
}

export function computeAiSimilarityReason(
  sourceCampaign: SimilarityCandidate,
  targetCampaign: SimilarityCandidate,
  score: number
): string {
  const parts: string[] = [];

  if (sourceCampaign.categoryCode && sourceCampaign.categoryCode === targetCampaign.categoryCode) {
    parts.push(`Aynı kategori: ${sourceCampaign.categoryCode}`);
  }

  if (sourceCampaign.validFrom && targetCampaign.validFrom) {
    const daysDiff = Math.abs(
      new Date(sourceCampaign.validFrom).getTime() - new Date(targetCampaign.validFrom).getTime()
    ) / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= 7) {
      parts.push(`Benzer başlangıç tarihi (${Math.round(daysDiff)} gün fark)`);
    }
  }

  parts.push(`Metin benzerliği: ${Math.round(score * 100)}%`);

  return parts.join('; ');
}
