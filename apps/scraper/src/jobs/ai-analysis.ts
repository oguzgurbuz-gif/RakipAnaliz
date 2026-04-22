import { logger } from '../utils/logger';
import { applyAiExtractedDates, getDb, recalculateCampaignStatus } from '../db';
import { publishCampaignEvent } from '../publish/sse';
import { Campaign } from '../types';
import * as queries from '../db/queries';
import { analyzeContent } from '../ai/content-analysis';
import { extractComprehensiveCampaignData } from '../ai/comprehensive-extraction';

export interface AiAnalysisPayload {
  campaignId: string;
  title: string;
  description: string | null;
  termsUrl: string | null;
  termsText: string | null;
  priority: 'low' | 'medium' | 'high';
  validFrom?: string | null;
  validTo?: string | null;
  bonusAmount?: number | null;
  bonusPercentage?: number | null;
  minDeposit?: number | null;
  maxBonus?: number | null;
  isFreebet?: boolean;
  isCashback?: boolean;
  sportsType?: string | null;
}

export interface ExtractedTags {
  min_deposit?: number | null;
  max_bonus?: number | null;
  turnover?: string | null;
  sports_type?: string | null;
  exclude_matches?: string | null;
  bonus_amount?: number | null;
  bonus_percentage?: number | null;
  free_bet?: boolean;
  free_bet_amount?: number | null;
  cashback?: boolean;
  cashback_percent?: number | null;
}

export type CompetitiveIntentCode = 'acquisition' | 'retention' | 'brand' | 'clearance' | 'unknown';

export interface AiAnalysisResult {
  campaignId: string;
  analysis: {
    category: string | null;
    tags: string[];
    /** Legacy sentiment field. Migration 018 deprecates this in favor of `competitiveIntent`. */
    sentiment: 'positive' | 'neutral' | 'negative';
    /** Migration 018 — growth-actionable taxonomy. */
    competitiveIntent: CompetitiveIntentCode;
    competitiveIntentConfidence: number | null;
    keyBenefits: string[];
    targetAudience: string | null;
    expirationRisk: 'low' | 'medium' | 'high';
    valueScore: number;
    summary: string;
    extractedTags: ExtractedTags;
  };
  confidence: number;
  processedAt: string;
}

export interface ComprehensiveAiAnalysisResult {
  campaignId: string;
  campaignType: string;
  typeConfidence: number;
  typeReasoning: string;
  conditions: {
    minDeposit: number | null;
    minBet: number | null;
    maxBet: number | null;
    maxBonus: number | null;
    bonusPercentage: number | null;
    freebetAmount: number | null;
    cashbackPercentage: number | null;
    turnover: string | null;
    promoCode: string | null;
    eligibleProducts: string[];
    depositMethods: string[];
    targetSegment: string[];
    maxUsesPerUser: string | null;
    requiredActions: string[];
    excludedGames: string[];
    timeRestrictions: string | null;
    membershipRequirements: string[];
  };
  summary: string;
  keyPoints: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  riskFlags: string[];
  validFrom: string | null;
  validTo: string | null;
  dateConfidence: number;
  extractionConfidence: number;
  processedAt: string;
}

export async function processAiAnalysisJob(
  payload: Record<string, unknown>
): Promise<AiAnalysisResult> {
  const { 
    campaignId, 
    title, 
    description, 
    priority,
    validFrom,
    validTo,
    bonusAmount,
    bonusPercentage,
    minDeposit,
    maxBonus,
    isFreebet,
    isCashback,
    sportsType
  } = payload as unknown as AiAnalysisPayload;

  logger.info(`Processing AI analysis for campaign ${campaignId}`, { priority });

  const analysis = await analyzeCampaign(campaignId, title, description, 'scraper', {
    validFrom,
    validTo,
    bonusAmount,
    bonusPercentage,
    minDeposit,
    maxBonus,
    isFreebet,
    isCashback,
    sportsType
  });

  await storeAiAnalysis(campaignId, analysis);

  if (description && description.length >= 20) {
    const comprehensiveResult = await processComprehensiveAiAnalysisJob({
      campaignId,
      title,
      description,
      rawDateText: [validFrom, validTo].filter(Boolean).join(' - ') || null,
      priority,
    });

    if (comprehensiveResult) {
      await applyComprehensiveDatesIfMissing(
        campaignId,
        { validFrom: validFrom ?? null, validTo: validTo ?? null },
        comprehensiveResult
      );
    }
  }

  if (priority === 'high') {
    await triggerDateExtractionIfNeeded(campaignId, analysis);
  }

  // Migration 022 — refresh campaign_similarities now that this new
  // campaign has category/bonus/extracted-tag features. Debounced so a
  // burst of inserts coalesces into a single recompute (~1s for the
  // current corpus).
  try {
    const { enqueueSimilarityRecalcDebounced } = await import('./similarity-calc');
    await enqueueSimilarityRecalcDebounced(`ai-analysis:${campaignId}`);
  } catch (error) {
    logger.warn(`Failed to enqueue similarity recalc after AI analysis for ${campaignId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logger.info(`AI analysis completed for campaign ${campaignId}`, {
    valueScore: analysis.valueScore,
    category: analysis.category,
  });

  return {
    campaignId,
    analysis,
    confidence: 0.85,
    processedAt: new Date().toISOString(),
  };
}

export async function processComprehensiveAiAnalysisJob(
  payload: Record<string, unknown>
): Promise<ComprehensiveAiAnalysisResult | null> {
  const { 
    campaignId, 
    title, 
    description,
    rawDateText,
    priority
  } = payload as { 
    campaignId: string; 
    title: string; 
    description: string | null;
    rawDateText?: string | null;
    priority?: 'low' | 'medium' | 'high';
  };

  if (!description || description.length < 20) {
    logger.warn(`Campaign ${campaignId} body too short for comprehensive extraction`);
    return null;
  }

  logger.info(`Processing comprehensive AI analysis for campaign ${campaignId}`);

  const result = await extractComprehensiveCampaignData({
    title,
    body: description,
    rawDateText,
  });

  if (!result.success || !result.data) {
    logger.error(`Comprehensive extraction failed for ${campaignId}: ${result.error}`);
    return null;
  }

  const data = result.data;

  const comprehensiveResult: ComprehensiveAiAnalysisResult = {
    campaignId,
    campaignType: data.campaign_type,
    typeConfidence: data.type_confidence,
    typeReasoning: data.type_reasoning,
    conditions: {
      minDeposit: data.conditions.min_deposit,
      minBet: data.conditions.min_bet,
      maxBet: data.conditions.max_bet,
      maxBonus: data.conditions.max_bonus,
      bonusPercentage: data.conditions.bonus_percentage,
      freebetAmount: data.conditions.freebet_amount,
      cashbackPercentage: data.conditions.cashback_percentage,
      turnover: data.conditions.turnover,
      promoCode: data.conditions.promo_code,
      eligibleProducts: data.conditions.eligible_products,
      depositMethods: data.conditions.deposit_methods,
      targetSegment: data.conditions.target_segment,
      maxUsesPerUser: data.conditions.max_uses_per_user,
      requiredActions: data.conditions.required_actions,
      excludedGames: data.conditions.excluded_games,
      timeRestrictions: data.conditions.time_restrictions,
      membershipRequirements: data.conditions.membership_requirements,
    },
    summary: data.summary,
    keyPoints: data.key_points,
    sentiment: data.sentiment,
    riskFlags: data.risk_flags,
    validFrom: data.valid_from,
    validTo: data.valid_to,
    dateConfidence: data.date_confidence,
    extractionConfidence: data.extraction_confidence,
    processedAt: new Date().toISOString(),
  };

  await storeComprehensiveAiAnalysis(campaignId, comprehensiveResult);

  logger.info(`Comprehensive AI analysis completed for campaign ${campaignId}`, {
    campaignType: comprehensiveResult.campaignType,
    extractionConfidence: comprehensiveResult.extractionConfidence,
  });

  return comprehensiveResult;
}

async function analyzeCampaign(
  campaignId: string,
  title: string,
  description: string | null,
  siteName: string,
  campaignData?: {
    validFrom?: string | null;
    validTo?: string | null;
    bonusAmount?: number | null;
    bonusPercentage?: number | null;
    minDeposit?: number | null;
    maxBonus?: number | null;
    isFreebet?: boolean;
    isCashback?: boolean;
    sportsType?: string | null;
  }
): Promise<AiAnalysisResult['analysis']> {
  const result = await analyzeContent({
    campaignId,
    title,
    body: description || '',
    siteName,
  });

  const regexExtractedTags = extractTagsAdvanced(title, description || '');
  const expirationRisk = calculateExpirationRisk(campaignData?.validTo);
  const valueScore = calculateValueScoreAdvanced(
    campaignData?.bonusAmount,
    campaignData?.bonusPercentage,
    campaignData?.minDeposit,
    campaignData?.maxBonus,
    campaignData?.isFreebet,
    campaignData?.isCashback,
    result.data?.sentimentScore || 0.5
  );
  const summary = generateSummary(title, description, result.data?.summary);

  if (!result.success || !result.data) {
    logger.warn(`DeepSeek analysis failed for campaign ${campaignId}: ${result.error}`);
    return {
      category: 'genel',
      tags: [],
      sentiment: 'neutral',
      competitiveIntent: 'unknown',
      competitiveIntentConfidence: null,
      keyBenefits: [],
      targetAudience: null,
      expirationRisk,
      valueScore,
      summary,
      extractedTags: regexExtractedTags,
    };
  }

  const data = result.data;

  const extractedTags: ExtractedTags = {
    ...regexExtractedTags,
    min_deposit: data.minDeposit ?? regexExtractedTags.min_deposit,
    max_bonus: data.maxBonus ?? regexExtractedTags.max_bonus,
    turnover: data.turnover ?? regexExtractedTags.turnover,
    free_bet: data.freeBetAmount ? true : (regexExtractedTags.free_bet ?? false),
    free_bet_amount: data.freeBetAmount ?? regexExtractedTags.free_bet_amount,
    cashback: data.cashbackPercent ? true : (regexExtractedTags.cashback ?? false),
    cashback_percent: data.cashbackPercent ?? regexExtractedTags.cashback_percent,
    bonus_amount: data.bonusAmount ?? regexExtractedTags.bonus_amount,
    bonus_percentage: data.bonusPercentage ?? regexExtractedTags.bonus_percentage,
  };

  return {
    category: data.categoryCode,
    tags: data.keyPoints,
    // Sentiment intentionally falls back to 'neutral'; new pipeline surfaces
    // intent instead. Persisted via competitiveIntent field below.
    sentiment: 'neutral',
    competitiveIntent: data.competitiveIntent,
    competitiveIntentConfidence: data.competitiveIntentConfidence,
    keyBenefits: data.keyPoints,
    targetAudience: null,
    expirationRisk,
    valueScore,
    summary,
    extractedTags,
  };
}

function detectCategory(text: string): string | null {
  const categoryPatterns: [RegExp, string][] = [
    [/spor|bahis|spor bahisleri/i, 'spor'],
    [/casino|canlı casino|slot|blackjack|rulet/i, 'casino'],
    [/poker|turnuva/i, 'poker'],
    [/e-?spor|esports|counter.?strike|league.?of.?legends/i, 'espor'],
    [/sanal|virtual/i, 'sanal'],
    [/piyango|lottery/i, 'piyango'],
    [/hoşgeldin|welcome|ilk.?yatırım/i, 'hosgeldin'],
    [/sadakat|loyalty|VIP|özel/i, 'sadakat'],
  ];

  for (const [pattern, category] of categoryPatterns) {
    if (pattern.test(text)) {
      return category;
    }
  }

  return 'genel';
}

function extractTags(text: string): string[] {
  const tags: string[] = [];

  const tagPatterns: [RegExp, string][] = [
    [/free.?bet|bedava.?bahis/i, 'freebet'],
    [/cashback|kesin.?iade/i, 'cashback'],
    [/deposit|yatırım/i, 'deposit'],
    [/high.?roller|yüksek.?limit/i, 'highroller'],
    [/new.?user|yeni.?üye/i, 'newuser'],
    [/daily|günlük/i, 'daily'],
    [/weekly|haftalık/i, 'weekly'],
    [/monthly|aylık/i, 'monthly'],
    [/exclusive|özel/i, 'exclusive'],
    [/limited|sınırlı/i, 'limited'],
  ];

  for (const [pattern, tag] of tagPatterns) {
    if (pattern.test(text)) {
      tags.push(tag);
    }
  }

  return [...new Set(tags)];
}

function extractTagsAdvanced(title: string, body: string): ExtractedTags {
  const fullText = `${title} ${body}`;
  const tags: ExtractedTags = {};

  const minDepositMatch = fullText.match(/min(?:imum)?[_\s]?deposit[:\s]*(\d+)|(\d+)[\s]*TL.*(?:min|minimum)/i);
  if (minDepositMatch) {
    tags.min_deposit = parseInt(minDepositMatch[1] || minDepositMatch[2], 10);
  }

  const maxBonusMatch = fullText.match(/max(?:imum)?[_\s]?bonus[:\s]*(\d+)|en[YÜKsek|yüksek][\s]*(\d+)/i);
  if (maxBonusMatch) {
    tags.max_bonus = parseInt(maxBonusMatch[1] || maxBonusMatch[2], 10);
  }

  const turnoverPatterns = [
    /(?:çevrim|turnover|wr| wagering)[:\s]*(\d+)x?/i,
    /(?:(\d+)x?|(\d+)\s*kez).*(?:çevrim|turnover)/i,
    /(?:bahis|bet).*(\d+).*kez/i,
  ];
  for (const pattern of turnoverPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      tags.turnover = match[1] || match[2];
      break;
    }
  }

  const sportsTypePatterns = [
    /(?:futbol|soccer)/i,
    /(?:basketbol|basketball)/i,
    /(?:tenis|tennis)/i,
    /(?:voleybol|volleyball)/i,
    /(?:e-?spor|esports)/i,
    /(?:ganyan|horse racing|at yarışı)/i,
  ];
  const sportsKeywords = ['futbol', 'basketbol', 'tenis', 'voleybol', 'e-spor', 'espor', 'ganyan'];
  for (const keyword of sportsKeywords) {
    if (fullText.toLowerCase().includes(keyword)) {
      tags.sports_type = keyword;
      break;
    }
  }

  const excludeMatchesPatterns = [
    /(?:hariç|excluded?|exclude)[:\s]*(.*?)(?:\.|$)/i,
    /(?:müsabakalar|matches?)[:\s]*(.*?)(?:\.|$)/i,
  ];
  for (const pattern of excludeMatchesPatterns) {
    const match = fullText.match(pattern);
    if (match && match[1] && match[1].length > 2 && match[1].length < 200) {
      tags.exclude_matches = match[1].trim();
      break;
    }
  }

  if (body.includes('freebet') || body.includes('free bet') || body.includes('bedava bahis')) {
    tags.free_bet = true;
  }

  if (body.includes('cashback') || body.includes('kesin iade') || body.includes('kayıp iadesi')) {
    tags.cashback = true;
  }

  return tags;
}

function calculateExpirationRisk(validTo: string | null | undefined): 'low' | 'medium' | 'high' {
  if (!validTo) return 'medium';

  try {
    const expirationDate = new Date(validTo);
    const now = new Date();
    const diffTime = expirationDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) return 'high';
    if (diffDays <= 14) return 'medium';
    return 'low';
  } catch {
    return 'medium';
  }
}

function calculateValueScoreAdvanced(
  bonusAmount: number | null | undefined,
  bonusPercentage: number | null | undefined,
  minDeposit: number | null | undefined,
  maxBonus: number | null | undefined,
  isFreebet: boolean | undefined,
  isCashback: boolean | undefined,
  sentimentScore: number
): number {
  let score = 50;

  if (bonusAmount !== null && bonusAmount !== undefined) {
    score += Math.min(bonusAmount / 10, 30);
  }

  if (bonusPercentage !== null && bonusPercentage !== undefined) {
    score += Math.min(bonusPercentage, 40);
  }

  if (maxBonus !== null && maxBonus !== undefined) {
    score += Math.min(maxBonus / 15, 25);
  }

  if (isFreebet) {
    score += 20;
  }

  if (isCashback) {
    score += 15;
  }

  score += (sentimentScore - 0.5) * 40;

  if (minDeposit !== null && minDeposit !== undefined && minDeposit > 500) {
    score -= 5;
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}

function generateSummary(title: string, body: string | null, aiSummary: string | undefined): string {
  if (aiSummary && aiSummary.length >= 10 && aiSummary.length <= 100) {
    return aiSummary;
  }

  const fullText = `${title} ${body || ''}`;
  const words = fullText.split(/\s+/).filter(w => w.length > 3);

  if (words.length <= 6) {
    return title.substring(0, 80);
  }

  const bonusMatch = fullText.match(/(?:%(\d+)|(\d+)\s*TL)/);
  let summary = '';

  if (bonusMatch) {
    if (bonusMatch[1]) {
      summary = `%${bonusMatch[1]} bonus kampanyası`;
    } else if (bonusMatch[2]) {
      summary = `${bonusMatch[2]} TL bonus kampanyası`;
    }
  }

  if (fullText.includes('freebet') || fullText.includes('free bet')) {
    summary = summary || 'Freebet kampanyası';
    summary += ' - Bedava bahis';
  } else if (fullText.includes('cashback')) {
    summary = summary || 'Cashback kampanyası';
    summary += ' - Kayıp iadesi';
  }

  if (!summary) {
    summary = title.substring(0, 60);
  }

  return summary.substring(0, 100);
}

function analyzeSentiment(text: string): 'positive' | 'neutral' | 'negative' {
  const positiveWords = [
    'kazan', 'bedava', 'extra', 'bonus', 'artır', 'yükselt',
    'win', 'free', 'extra', 'bonus', 'boost', 'increase',
  ];

  const negativeWords = [
    'Risk', 'uyan', 'dikkate', 'kayıp',
    'risk', 'loss', 'careful',
  ];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of positiveWords) {
    if (text.includes(word)) positiveCount++;
  }

  for (const word of negativeWords) {
    if (text.includes(word)) negativeCount++;
  }

  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

function extractKeyBenefits(text: string): string[] {
  const benefits: string[] = [];

  const benefitPatterns: [RegExp, string][] = [
    [/%\s*\d+\s*bonus/i, 'percentage_bonus'],
    [/\d+\s*TL.*bonus/i, 'amount_bonus'],
    [/free.?bet/i, 'free_bet'],
    [/cashback/i, 'cashback'],
    [/serbest.?bahis/i, 'free_bet'],
    [/ücretsiz/i, 'free'],
    [/süresiz/i, 'unlimited'],
  ];

  for (const [pattern, benefit] of benefitPatterns) {
    if (pattern.test(text)) {
      benefits.push(benefit);
    }
  }

  return [...new Set(benefits)];
}

function detectTargetAudience(text: string): string | null {
  if (/high.?roller|yüksek.?limit/i.test(text)) return 'highroller';
  if (/new.?user|yeni.?üye/i.test(text)) return 'newusers';
  if (/mevcut.?üye|existing/i.test(text)) return 'existingusers';
  if (/tüm.?üye|all.?users/i.test(text)) return 'allusers';
  return null;
}

async function storeAiAnalysis(
  campaignId: string,
  analysis: AiAnalysisResult['analysis']
): Promise<void> {
  const db = getDb();

  try {
    await queries.updateCampaignAiAnalysis(db, campaignId, {
      category: analysis.category,
      tags: JSON.stringify(analysis.tags),
      sentiment: analysis.sentiment,
      competitive_intent: analysis.competitiveIntent,
      competitive_intent_confidence: analysis.competitiveIntentConfidence,
      targetAudience: analysis.targetAudience,
      valueScore: analysis.valueScore,
      keyPoints: analysis.keyBenefits,
      key_points: analysis.keyBenefits,
      summary: analysis.summary,
      expirationRisk: analysis.expirationRisk,
      extractedTags: analysis.extractedTags as Record<string, unknown>,
      riskFlags: [],
      risk_flags: [],
    });

    logger.debug(`Stored AI analysis for campaign ${campaignId}`);
  } catch (error) {
    logger.error(`Failed to store AI analysis for campaign ${campaignId}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

async function storeComprehensiveAiAnalysis(
  campaignId: string,
  analysis: ComprehensiveAiAnalysisResult
): Promise<void> {
  const db = getDb();
  const extractedTags = {
    min_deposit: analysis.conditions.minDeposit,
    min_bet: analysis.conditions.minBet,
    max_bet: analysis.conditions.maxBet,
    max_bonus: analysis.conditions.maxBonus,
    bonus_percentage: analysis.conditions.bonusPercentage,
    free_bet_amount: analysis.conditions.freebetAmount,
    freebet_amount: analysis.conditions.freebetAmount,
    cashback_percent: analysis.conditions.cashbackPercentage,
    turnover: analysis.conditions.turnover,
    promo_code: analysis.conditions.promoCode,
    eligible_products: analysis.conditions.eligibleProducts,
    deposit_methods: analysis.conditions.depositMethods,
    target_segment: analysis.conditions.targetSegment,
    max_uses_per_user: analysis.conditions.maxUsesPerUser,
    required_actions: analysis.conditions.requiredActions,
    excluded_games: analysis.conditions.excludedGames,
    time_restrictions: analysis.conditions.timeRestrictions,
    membership_requirements: analysis.conditions.membershipRequirements,
  };
  const conditions = {
    min_deposit: analysis.conditions.minDeposit,
    min_bet: analysis.conditions.minBet,
    max_bet: analysis.conditions.maxBet,
    max_bonus: analysis.conditions.maxBonus,
    bonus_percentage: analysis.conditions.bonusPercentage,
    freebet_amount: analysis.conditions.freebetAmount,
    cashback_percentage: analysis.conditions.cashbackPercentage,
    turnover: analysis.conditions.turnover,
    promo_code: analysis.conditions.promoCode,
    eligible_products: analysis.conditions.eligibleProducts,
    deposit_methods: analysis.conditions.depositMethods,
    target_segment: analysis.conditions.targetSegment,
    max_uses_per_user: analysis.conditions.maxUsesPerUser,
    required_actions: analysis.conditions.requiredActions,
    excluded_games: analysis.conditions.excludedGames,
    time_restrictions: analysis.conditions.timeRestrictions,
    membership_requirements: analysis.conditions.membershipRequirements,
  };

  try {
    await queries.updateCampaignAiAnalysis(db, campaignId, {
      category: analysis.campaignType,
      tags: JSON.stringify(analysis.keyPoints),
      sentiment: analysis.sentiment,
      summary: analysis.summary,
      keyPoints: analysis.keyPoints,
      key_points: analysis.keyPoints,
      expirationRisk: 'medium',
      extractedTags: extractedTags as Record<string, unknown>,
      campaign_type: analysis.campaignType,
      type_confidence: analysis.typeConfidence,
      type_reasoning: analysis.typeReasoning,
      conditions,
      risk_flags: analysis.riskFlags,
      riskFlags: analysis.riskFlags,
      valid_from: analysis.validFrom,
      valid_to: analysis.validTo,
      date_confidence: analysis.dateConfidence,
      extraction_confidence: analysis.extractionConfidence,
    });

    logger.debug(`Stored comprehensive AI analysis for campaign ${campaignId}`);
  } catch (error) {
    logger.error(`Failed to store comprehensive AI analysis for campaign ${campaignId}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

async function applyComprehensiveDatesIfMissing(
  campaignId: string,
  currentDates: { validFrom: string | null; validTo: string | null },
  analysis: ComprehensiveAiAnalysisResult
): Promise<void> {
  const nextStart = !currentDates.validFrom && analysis.validFrom ? new Date(analysis.validFrom) : null;
  const nextEnd = !currentDates.validTo && analysis.validTo ? new Date(analysis.validTo) : null;

  if (!nextStart && !nextEnd) {
    return;
  }

  await applyAiExtractedDates(
    campaignId,
    nextStart,
    nextEnd,
    analysis.dateConfidence
  );

  await recalculateCampaignStatus(campaignId);
}

async function triggerDateExtractionIfNeeded(
  campaignId: string,
  analysis: AiAnalysisResult['analysis']
): Promise<void> {
  if (analysis.expirationRisk === 'high' || analysis.category === 'hosgeldin') {
    const { jobScheduler } = await import('./scheduler');

    await jobScheduler.scheduleJob(
      'date-extraction',
      { campaignId, priority: 'high' },
      { priority: 10 }
    );

    logger.info(`Triggered date extraction for campaign ${campaignId} based on AI analysis`);
  }
}

export async function getAiAnalysisSummary(): Promise<{
  totalAnalyzed: number;
  averageValueScore: number;
  categoryDistribution: Record<string, number>;
}> {
  const db = getDb();

  const result = await queries.getAiAnalysisStats(db);

  return {
    totalAnalyzed: (result?.total ?? 0) as number,
    averageValueScore: (result?.avg_value_score ?? 0) as number,
    categoryDistribution: result?.category_dist
      ? typeof result.category_dist === 'string'
        ? JSON.parse(result.category_dist as string)
        : (result.category_dist as Record<string, number>)
      : {},
  };
}
