/**
 * Marketing pipeline (Bi'Talih weekly intelligence) — shared types.
 *
 * One-to-one mirror of the 8 MySQL tables introduced by migrations
 * 027..031 (config, mapping, metrics storage, snapshots, audit log).
 *
 * Lives in `@bitalih/shared` so both the scraper jobs and the dashboard
 * Next.js routes can import the same shape — there is no separate Drizzle
 * model layer in this codebase.
 *
 * Date / timestamp fields use `string` (ISO 8601) because the project's
 * existing DTO style serializes MySQL `DATE` / `TIMESTAMP` columns as
 * strings (see weekly-report-schema.ts and dto/report.ts).
 */

// ---------------------------------------------------------------------------
// Enums (string union helpers)
// ---------------------------------------------------------------------------

export const SourceSystem = {
  GA4: 'ga4',
  ADJUST: 'adjust',
  ADS: 'ads',
  ADJUST_EVENTS: 'adjust_events',
} as const;

export type SourceSystem = (typeof SourceSystem)[keyof typeof SourceSystem];

/**
 * Subset of SourceSystem that is allowed inside `channel_mappings`.
 * `ads` and `adjust_events` are pulled but not mapped here — `ads` rows
 * inherit category from the parent campaign / network and `adjust_events`
 * are joined against the install row's category at query time.
 */
export const MappableSourceSystem = {
  GA4: 'ga4',
  ADJUST: 'adjust',
} as const;

export type MappableSourceSystem =
  (typeof MappableSourceSystem)[keyof typeof MappableSourceSystem];

export const Segment = {
  PAID: 'Paid',
  UNPAID: 'Unpaid',
  OTHER: 'Other',
} as const;

export type Segment = (typeof Segment)[keyof typeof Segment];

export const OperatingSystem = {
  ANDROID: 'android',
  IOS: 'ios',
  WEB: 'web',
  ANDROID_TV: 'android-tv',
  OTHER: 'other',
} as const;

export type OperatingSystem =
  (typeof OperatingSystem)[keyof typeof OperatingSystem];

/**
 * Long-format metric names used in `marketing_metrics_daily.metric`.
 * PRD §2 Locked Decision #11 — ratio metrics (CR / CPC / CPM / ROAS / CPS /
 * CPP) are NOT stored, they are computed at query time from these primitives.
 */
export const MarketingMetricName = {
  SESSIONS: 'sessions',
  USERS: 'users',
  IMPRESSIONS: 'impressions',
  CLICKS: 'clicks',
  SPEND: 'spend',
  SIGNUPS: 'signups',
  PURCHASES: 'purchases',
  REVENUE: 'revenue',
  INSTALLS: 'installs',
} as const;

export type MarketingMetricName =
  (typeof MarketingMetricName)[keyof typeof MarketingMetricName];

export const SnapshotStatus = {
  PRELIMINARY: 'preliminary',
  FINAL: 'final',
} as const;

export type SnapshotStatus =
  (typeof SnapshotStatus)[keyof typeof SnapshotStatus];

export const UnmappedSourceSystem = {
  GA4: 'ga4',
  ADJUST: 'adjust',
  ADS: 'ads',
} as const;

export type UnmappedSourceSystem =
  (typeof UnmappedSourceSystem)[keyof typeof UnmappedSourceSystem];

export const MarketingAuditAction = {
  FETCH: 'fetch',
  MAP: 'map',
  SNAPSHOT: 'snapshot',
  FREEZE: 'freeze',
  MANUAL_EDIT: 'manual_edit',
  AI_GENERATE: 'ai_generate',
} as const;

export type MarketingAuditAction =
  (typeof MarketingAuditAction)[keyof typeof MarketingAuditAction];

// ---------------------------------------------------------------------------
// Row shapes (1:1 with DB tables)
// ---------------------------------------------------------------------------

/** `properties` row (multi-tenant anchor — MVP'de tek satır id=1). */
export interface Property {
  id: number;
  name: string;
  /** IANA TZ, e.g. "Europe/Istanbul". */
  timezone: string;
  /** ISO 8601 timestamp. */
  created_at: string;
}

/** `fx_rates` row. effective_to=null → currently active rate. */
export interface FxRate {
  id: number;
  from_currency: string; // CHAR(3)
  to_currency: string; // CHAR(3)
  rate: number; // DECIMAL(12,4)
  effective_from: string; // ISO date
  effective_to: string | null;
  source: string;
  notes: string | null;
  created_at: string;
}

/** `channel_mappings` row. */
export interface ChannelMapping {
  id: number;
  property_id: number;
  source_system: MappableSourceSystem;
  source_key: string;
  segment: Segment;
  category: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** `unmapped_sources` admin queue row. */
export interface UnmappedSource {
  id: number;
  property_id: number;
  source_system: UnmappedSourceSystem;
  source_key: string;
  first_seen: string; // ISO date
  last_seen: string; // ISO date
  occurrence_count: number;
  resolved: boolean;
  resolved_at: string | null;
  resolved_to_mapping_id: number | null;
}

/** `marketing_metrics_daily` long-format row. */
export interface MarketingMetricDaily {
  id: number;
  property_id: number;
  date: string; // ISO date
  source_system: SourceSystem;
  raw_source_key: string;
  category: string;
  segment: Segment;
  os: OperatingSystem | null;
  metric: MarketingMetricName;
  value: number;
  /** Only populated for spend rows ('USD' | 'TRY'). */
  currency: string | null;
  fetched_at: string;
  source_dsid: string | null;
  raw_payload: unknown;
}

/** `weekly_unique_users` row (GA4 USER metric — additive değil, ayrı tablo). */
export interface WeeklyUniqueUser {
  id: number;
  property_id: number;
  /** Pazartesi tarihi (ISO date). */
  week_start: string;
  raw_source_key: string;
  category: string;
  total_users: number;
  fetched_at: string;
}

// ---------------------------------------------------------------------------
// Snapshot payload shapes
// ---------------------------------------------------------------------------

/**
 * Per-channel matrix row. Mirrors the Master_Metric_Table block columns
 * for a single channel (e.g. "Google Ads") in either the GA4 (web) or
 * Adjust (mobile) block. Values are absolute totals for the period;
 * indices are dimensionless ratios (TW vs LW, TW vs 4-week average).
 */
export interface MarketingMatrixRow {
  category: string;
  segment: Segment;
  /** This-week absolute totals. */
  tw: Record<MarketingMetricName, number>;
  /** Last-week absolute totals. */
  lw: Record<MarketingMetricName, number>;
  /** 4-week trailing average. */
  fourWeekAvg: Record<MarketingMetricName, number>;
  /** TW / LW per-metric index (1.0 = flat). */
  twVsLwIndex: Record<MarketingMetricName, number>;
  /** TW / 4WA per-metric index (1.0 = flat). */
  twVs4waIndex: Record<MarketingMetricName, number>;
}

/**
 * Full matrix payload stored in `weekly_snapshots.matrix_payload`. GA4
 * (web) and Adjust (mobile) are kept side-by-side without summing —
 * PRD §2 Locked Decision #2.
 */
export interface WeeklyMatrixPayload {
  property_id: number;
  /** Pazartesi (ISO date). */
  week_start: string;
  /** Pazar (ISO date). */
  week_end: string;
  /** ISO 8601 week label, e.g. "2026-W17". */
  iso_week: string;
  /** Currency the spend totals are reported in (always 'TRY' post-FX). */
  reporting_currency: string;
  /** FX rate applied to USD spend (PRD §2 Locked Decision #1). */
  applied_fx: {
    from_currency: string;
    to_currency: string;
    rate: number;
    effective_from: string;
  } | null;
  ga4: {
    rows: MarketingMatrixRow[];
    /** GA4 weekly unique user totals (additive değil — ayrı tablo). */
    weekly_unique_users: Array<{
      category: string;
      total_users: number;
    }>;
  };
  adjust: {
    rows: MarketingMatrixRow[];
  };
  /** Aggregated paid ads spend (multi-network). */
  ads: {
    rows: MarketingMatrixRow[];
  } | null;
  /** Snapshot için flag düşen ham source key'leri özeti. */
  unmapped_sources_seen: Array<{
    source_system: UnmappedSourceSystem;
    source_key: string;
    occurrence_count: number;
  }>;
}

/**
 * Stored in `weekly_snapshots.ai_commentary`. Dalga 3'te DeepSeek üretir;
 * Dalga 1 sadece tipi tanımlar (henüz null yazılır).
 */
export interface MarketingAiCommentary {
  /** Türkçe executive summary (1-2 paragraf). */
  summary: string;
  /** Bullet — bu hafta en dikkat çeken pozitif gelişmeler. */
  highlights: string[];
  /** Bullet — bu hafta dikkat çeken negatif / risk noktaları. */
  risks: string[];
  /** Bullet — somut tavsiye / aksiyon. */
  recommendations: string[];
  /** Otomatik tespit edilen anomaliler (eşik aşımları). */
  anomalies: Array<{
    category: string;
    metric: MarketingMetricName;
    direction: 'spike' | 'drop';
    delta_pct: number;
    note: string;
  }>;
  /** AI'nın kendi raporladığı 0..1 güven skoru (opsiyonel). */
  confidence?: number;
}

/** `weekly_snapshots` row. */
export interface WeeklySnapshot {
  id: number;
  property_id: number;
  /** Pazartesi (ISO date). */
  week_start: string;
  status: SnapshotStatus;
  matrix_payload: WeeklyMatrixPayload;
  ai_commentary: MarketingAiCommentary | null;
  ai_commentary_generated_at: string | null;
  notification_sent_at: string | null;
  frozen_at: string | null;
  created_at: string;
  updated_at: string;
}

/** `marketing_audit_log` row. */
export interface MarketingAuditLog {
  id: number;
  property_id: number;
  actor: string | null;
  action: MarketingAuditAction | string;
  target_table: string | null;
  target_id: number | null;
  details: unknown;
  created_at: string;
}
