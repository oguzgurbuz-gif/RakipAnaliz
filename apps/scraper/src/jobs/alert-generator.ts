import { logger } from '../utils/logger';
import { getDb } from '../db';
import type { CampaignDiff, NormalizedCampaignInput } from '../types';
import { createNotification } from './notifications';

/**
 * Smart Change Alert generator (migration 017).
 *
 * processCampaignDiff() is invoked from ScrapeManager.processNormalizedCampaign
 * after a `campaign_versions` row is written. It inspects the diff (which
 * fields changed + old/new values) and inserts one row per detected trigger
 * into `smart_alerts`. Triggers:
 *
 *   - bonus_change: bonus_amount delta percentage exceeds the configured
 *     threshold (alert_settings.bonus_change_threshold_pct, default 20%).
 *     Severity: >=50% → high, >=20% → medium, otherwise no alert.
 *
 *   - category_change: ai_analysis.category in campaigns.metadata changed.
 *     Severity: medium.
 *
 *   - new_campaign: dispatched separately via emitNewCampaignAlert() right
 *     after an `insertCampaign` call. Severity: medium.
 *
 *   - kvkk_change: NOT YET IMPLEMENTED (placeholder for later — needs a
 *     dedicated KVKK terms scraper). Schema is ready though.
 *
 * Each row's `payload` JSON carries old/new values, % delta, site name and
 * campaign URL so the Slack pusher can render rich messages without an
 * additional join.
 */

interface AlertSettingsRow extends Record<string, unknown> {
  slack_webhook_url: string | null;
  bonus_change_threshold_pct: string | number;
  digest_time_hour: number;
  enabled: number;
}

interface CampaignContextRow extends Record<string, unknown> {
  id: string;
  site_id: string;
  source_url: string | null;
  title: string | null;
  site_name: string | null;
  site_code: string | null;
  ai_category: string | null;
}

const DEFAULT_BONUS_THRESHOLD_PCT = 20;

let cachedSettings: { value: AlertSettingsRow; loadedAt: number } | null = null;
const SETTINGS_CACHE_MS = 60_000;

async function readAlertSettings(): Promise<AlertSettingsRow> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettings.loadedAt < SETTINGS_CACHE_MS) {
    return cachedSettings.value;
  }
  const db = getDb();
  try {
    const res = await db.query<AlertSettingsRow>(
      `SELECT slack_webhook_url, bonus_change_threshold_pct, digest_time_hour, enabled
         FROM alert_settings WHERE id = 1`
    );
    const row =
      res.rows[0] ??
      ({
        slack_webhook_url: null,
        bonus_change_threshold_pct: DEFAULT_BONUS_THRESHOLD_PCT,
        digest_time_hour: 9,
        enabled: 1,
      } as AlertSettingsRow);
    cachedSettings = { value: row, loadedAt: now };
    return row;
  } catch (err) {
    // Migration 017 might not have applied yet — return safe defaults so
    // scraping doesn't break.
    logger.warn('alert_settings unreadable, using defaults', {
      error: err instanceof Error ? err.message : String(err),
    });
    const fallback: AlertSettingsRow = {
      slack_webhook_url: null,
      bonus_change_threshold_pct: DEFAULT_BONUS_THRESHOLD_PCT,
      digest_time_hour: 9,
      enabled: 1,
    };
    cachedSettings = { value: fallback, loadedAt: now };
    return fallback;
  }
}

/**
 * Forces the next call to {@link readAlertSettings} to re-fetch from the DB.
 * Exposed for the dashboard PUT handler so threshold changes take effect on
 * the next scrape diff without a service restart.
 */
export function invalidateAlertSettingsCache(): void {
  cachedSettings = null;
}

async function loadCampaignContext(
  campaignId: string
): Promise<CampaignContextRow | null> {
  const db = getDb();
  const res = await db.query<CampaignContextRow>(
    `SELECT c.id, c.site_id, c.source_url, c.title,
            s.name AS site_name, s.code AS site_code,
            COALESCE(
              JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')),
              JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type'))
            ) AS ai_category
       FROM campaigns c
       LEFT JOIN sites s ON s.id = c.site_id
      WHERE c.id = $1`,
    [campaignId]
  );
  return res.rows[0] ?? null;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function severityFromBonusDelta(absPct: number, thresholdPct: number): 'high' | 'medium' | null {
  // Both severities still require the configured threshold; "high" simply
  // raises the bar at the 50% mark. If the threshold is set above 50%, that
  // wins (ie. nothing fires below threshold).
  if (absPct < thresholdPct) return null;
  if (absPct >= 50) return 'high';
  return 'medium';
}

async function insertAlert(params: {
  alertType: 'bonus_change' | 'category_change' | 'new_campaign' | 'kvkk_change';
  severity: 'low' | 'medium' | 'high';
  campaignId: string | null;
  siteId: string | null;
  title: string;
  description: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  await db.query(
    `INSERT INTO smart_alerts
       (alert_type, severity, campaign_id, site_id, title, description, payload)
     VALUES ($1, $2, $3, $4, $5, $6, CAST($7 AS JSON))`,
    [
      params.alertType,
      params.severity,
      params.campaignId,
      params.siteId,
      params.title,
      params.description,
      JSON.stringify(params.payload),
    ]
  );

  // Wave 4 — parallel notification record so the dashboard inbox surfaces the
  // change even if Slack push is disabled. Best-effort; failures are caught
  // inside createNotification so the smart_alerts insert above is the source
  // of truth either way.
  const linkUrl =
    typeof params.payload.campaign_url === 'string'
      ? (params.payload.campaign_url as string)
      : null;
  await createNotification({
    type: 'smart_alert',
    severity: params.severity,
    title: params.title,
    message: params.description,
    payload: { ...params.payload, alert_type: params.alertType },
    sourceTable: 'smart_alerts',
    // smart_alerts.id is auto-increment — we don't need it for dedupe and we
    // don't have it here; campaign_id keeps the source linkage usable.
    sourceId: params.campaignId,
    linkUrl,
  });
}

/**
 * Inspects a fresh diff for bonus/category changes and writes corresponding
 * smart_alerts rows. Safe to call after every successful campaign update —
 * sub-threshold bonus deltas are silently skipped.
 */
export async function processCampaignDiff(
  campaignId: string,
  _previousVersionId: string | null,
  diff: CampaignDiff | null
): Promise<void> {
  if (!diff || diff.changedFields.length === 0) return;

  const settings = await readAlertSettings();
  if (!settings.enabled) return;

  const thresholdPct = asNumber(settings.bonus_change_threshold_pct) ?? DEFAULT_BONUS_THRESHOLD_PCT;

  let context: CampaignContextRow | null = null;
  const ensureContext = async () => {
    if (context === null) {
      context = await loadCampaignContext(campaignId);
    }
    return context;
  };

  // ---- bonus_change ------------------------------------------------------
  if (diff.changedFields.includes('bonusAmount')) {
    const oldAmount = asNumber(diff.previousValues['bonusAmount']);
    const newAmount = asNumber(diff.newValues['bonusAmount']);

    if (oldAmount !== null && newAmount !== null && oldAmount > 0) {
      const deltaPct = ((newAmount - oldAmount) / oldAmount) * 100;
      const absPct = Math.abs(deltaPct);
      const severity = severityFromBonusDelta(absPct, thresholdPct);

      if (severity) {
        const ctx = await ensureContext();
        const direction = deltaPct >= 0 ? 'arttı' : 'azaldı';
        const siteLabel = ctx?.site_name ?? ctx?.site_code ?? 'Site';
        const titleText = ctx?.title ?? 'Kampanya';
        await insertAlert({
          alertType: 'bonus_change',
          severity,
          campaignId,
          siteId: ctx?.site_id ?? null,
          title: `${siteLabel}: bonus ${direction} (${oldAmount} → ${newAmount})`,
          description: `${titleText} bonusu ${oldAmount} TL'den ${newAmount} TL'ye değişti (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%).`,
          payload: {
            field: 'bonus_amount',
            old: oldAmount,
            new: newAmount,
            delta_pct: Number(deltaPct.toFixed(2)),
            threshold_pct: thresholdPct,
            site_name: ctx?.site_name ?? null,
            site_code: ctx?.site_code ?? null,
            campaign_url: ctx?.source_url ?? null,
            campaign_title: ctx?.title ?? null,
          },
        });
      }
    } else if (oldAmount === null && newAmount !== null) {
      // Brand new bonus value where previously unknown — surface as low.
      const ctx = await ensureContext();
      await insertAlert({
        alertType: 'bonus_change',
        severity: 'low',
        campaignId,
        siteId: ctx?.site_id ?? null,
        title: `${ctx?.site_name ?? 'Site'}: bonus tutarı tespit edildi (${newAmount} TL)`,
        description: `${ctx?.title ?? 'Kampanya'} için ilk kez bonus tutarı görüldü: ${newAmount} TL.`,
        payload: {
          field: 'bonus_amount',
          old: null,
          new: newAmount,
          delta_pct: null,
          threshold_pct: thresholdPct,
          site_name: ctx?.site_name ?? null,
          site_code: ctx?.site_code ?? null,
          campaign_url: ctx?.source_url ?? null,
          campaign_title: ctx?.title ?? null,
        },
      });
    }
  }

  // ---- category_change ---------------------------------------------------
  // The dedup diff tracks `category` from the normalized input. The richer
  // ai_analysis.category lives in campaigns.metadata and is updated by the
  // AI batch job; we surface either source.
  if (diff.changedFields.includes('category')) {
    const oldCat = diff.previousValues['category'];
    const newCat = diff.newValues['category'];
    if (oldCat !== newCat) {
      const ctx = await ensureContext();
      await insertAlert({
        alertType: 'category_change',
        severity: 'medium',
        campaignId,
        siteId: ctx?.site_id ?? null,
        title: `${ctx?.site_name ?? 'Site'}: kategori değişti (${oldCat ?? '-'} → ${newCat ?? '-'})`,
        description: `${ctx?.title ?? 'Kampanya'} kategorisi "${oldCat ?? '-'}" → "${newCat ?? '-'}" olarak güncellendi.`,
        payload: {
          field: 'category',
          old: oldCat ?? null,
          new: newCat ?? null,
          site_name: ctx?.site_name ?? null,
          site_code: ctx?.site_code ?? null,
          campaign_url: ctx?.source_url ?? null,
          campaign_title: ctx?.title ?? null,
        },
      });
    }
  }
}

/**
 * Emit a `new_campaign` alert immediately after insertCampaign. Splits out
 * from processCampaignDiff because brand-new campaigns have no previous
 * version to diff against.
 */
export async function emitNewCampaignAlert(
  campaignId: string,
  normalized: NormalizedCampaignInput
): Promise<void> {
  try {
    const settings = await readAlertSettings();
    if (!settings.enabled) return;

    const ctx = await loadCampaignContext(campaignId);
    const siteLabel = ctx?.site_name ?? normalized.siteCode;
    await insertAlert({
      alertType: 'new_campaign',
      severity: 'medium',
      campaignId,
      siteId: ctx?.site_id ?? null,
      title: `${siteLabel}: yeni kampanya yayınlandı`,
      description: `${normalized.title} (${normalized.url})`,
      payload: {
        site_name: ctx?.site_name ?? null,
        site_code: ctx?.site_code ?? normalized.siteCode,
        campaign_url: normalized.url,
        campaign_title: normalized.title,
        bonus_type: normalized.bonusType,
        bonus_amount: normalized.bonusAmount,
        bonus_percentage: normalized.bonusPercentage,
        category: normalized.category,
        valid_from: normalized.startDate?.toISOString() ?? null,
        valid_to: normalized.endDate?.toISOString() ?? null,
      },
    });
  } catch (error) {
    logger.warn('emitNewCampaignAlert failed', {
      campaignId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
