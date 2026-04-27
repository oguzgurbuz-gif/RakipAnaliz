/**
 * BE-11 — Weekly report diff check.
 *
 * Compares this week's report against the previous week's stored report
 * and flags anomalies. Output is metadata-only: callers persist it on
 * the new row (`anomaly_flags` + `diff_metadata`) and emit log entries.
 * The dashboard does NOT surface these flags yet (per BE-11 spec).
 *
 * Thresholds (justification in commit body):
 *   - Total campaign volume swing > 50% → "campaign_volume_swing"
 *     (large enough to shrug off seasonal noise; small enough to catch
 *      partial scrape failures and bonus-week spikes early.)
 *   - Any new category appearing or any prior category disappearing →
 *     emits one flag per category. Rare in steady-state weeks; almost
 *     always indicates either a new market segment or a scrape gap.
 *   - AI confidence drop > 0.20 absolute → "ai_confidence_drop".
 *     Mirrors the band where downstream prose tends to hallucinate.
 */

export interface WeeklyReportSnapshot {
  totalCampaigns: number;
  categories: string[];
  aiConfidence: number | null;
}

export interface DiffThresholds {
  totalCampaignSwingRatio: number;
  aiConfidenceDropAbs: number;
}

export const DEFAULT_DIFF_THRESHOLDS: DiffThresholds = {
  totalCampaignSwingRatio: 0.5,
  aiConfidenceDropAbs: 0.2,
};

export interface DiffResult {
  hasAnomaly: boolean;
  flags: string[];
  thresholds: DiffThresholds;
  details: {
    previousTotal: number;
    currentTotal: number;
    totalDelta: number;
    totalDeltaRatio: number | null;
    addedCategories: string[];
    removedCategories: string[];
    previousAiConfidence: number | null;
    currentAiConfidence: number | null;
    aiConfidenceDelta: number | null;
  };
  comparedAgainst: 'previous_week' | 'none';
}

/**
 * Build a no-op diff result used when there is no prior report (first
 * week, fresh deploy). Callers still persist the metadata so we know
 * the comparison was attempted and intentionally skipped.
 */
export function emptyDiffResult(
  current: WeeklyReportSnapshot,
  thresholds: DiffThresholds = DEFAULT_DIFF_THRESHOLDS
): DiffResult {
  return {
    hasAnomaly: false,
    flags: [],
    thresholds,
    details: {
      previousTotal: 0,
      currentTotal: current.totalCampaigns,
      totalDelta: 0,
      totalDeltaRatio: null,
      addedCategories: [],
      removedCategories: [],
      previousAiConfidence: null,
      currentAiConfidence: current.aiConfidence,
      aiConfidenceDelta: null,
    },
    comparedAgainst: 'none',
  };
}

function uniqueLowerSet(values: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim().toLowerCase();
    if (trimmed.length > 0) out.add(trimmed);
  }
  return out;
}

export function computeDiff(
  current: WeeklyReportSnapshot,
  previous: WeeklyReportSnapshot,
  thresholds: DiffThresholds = DEFAULT_DIFF_THRESHOLDS
): DiffResult {
  const flags: string[] = [];

  // 1) Total campaign volume swing
  const previousTotal = Math.max(0, previous.totalCampaigns);
  const currentTotal = Math.max(0, current.totalCampaigns);
  const totalDelta = currentTotal - previousTotal;
  let totalDeltaRatio: number | null = null;
  if (previousTotal === 0) {
    // Going from 0 → N (first usable week) is informational, not an
    // anomaly per se. Going N → 0 IS an anomaly (everything dropped).
    if (currentTotal === 0) {
      totalDeltaRatio = 0;
    } else {
      totalDeltaRatio = null; // undefined ratio, caller can still see delta
    }
  } else {
    totalDeltaRatio = totalDelta / previousTotal;
    if (Math.abs(totalDeltaRatio) > thresholds.totalCampaignSwingRatio) {
      flags.push('campaign_volume_swing');
    }
  }
  if (previousTotal > 0 && currentTotal === 0) {
    // Catastrophic drop — call it out explicitly even if the ratio also
    // triggers, so log readers don't have to compute it.
    if (!flags.includes('campaign_volume_swing')) {
      flags.push('campaign_volume_swing');
    }
    flags.push('campaign_volume_collapsed');
  }

  // 2) Category set diff
  const prevCats = uniqueLowerSet(previous.categories);
  const currCats = uniqueLowerSet(current.categories);
  const added: string[] = [];
  const removed: string[] = [];
  for (const c of currCats) {
    if (!prevCats.has(c)) added.push(c);
  }
  for (const c of prevCats) {
    if (!currCats.has(c)) removed.push(c);
  }
  for (const c of added) flags.push(`category_appeared:${c}`);
  for (const c of removed) flags.push(`category_disappeared:${c}`);

  // 3) AI confidence drop
  let aiConfidenceDelta: number | null = null;
  if (
    typeof previous.aiConfidence === 'number' &&
    typeof current.aiConfidence === 'number'
  ) {
    aiConfidenceDelta = current.aiConfidence - previous.aiConfidence;
    if (aiConfidenceDelta < -thresholds.aiConfidenceDropAbs) {
      flags.push('ai_confidence_drop');
    }
  }

  return {
    hasAnomaly: flags.length > 0,
    flags,
    thresholds,
    details: {
      previousTotal,
      currentTotal,
      totalDelta,
      totalDeltaRatio,
      addedCategories: added,
      removedCategories: removed,
      previousAiConfidence: previous.aiConfidence,
      currentAiConfidence: current.aiConfidence,
      aiConfidenceDelta,
    },
    comparedAgainst: 'previous_week',
  };
}
