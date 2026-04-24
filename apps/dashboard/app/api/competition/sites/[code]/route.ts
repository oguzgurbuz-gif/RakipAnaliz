import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne } from '@/lib/db';
import { successResponse, errorResponse, getCorsHeaders } from '@/lib/response';

const paramsSchema = z.object({
  code: z.string().min(1).max(64),
});

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const queryParamsSchema = z.object({
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
});

const categoryExpr = `COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), '')
)`;

// Same effective_bonus_amount derivation as the main competition route. Kept
// inline (rather than imported) so this endpoint stays self-contained and
// changes to the main route's CTE do not silently affect site profiles.
//
// `from`/`to` filtreleri varsa CTE'ye "active_during_range" koşulu uygulanır —
// seçili [from, to] aralığında AKTİF olan kampanyalar (ilk görülenler değil).
//
// Bir kampanya aralığa şu şartla girer:
//   c.first_seen_at <= to+1day    -- defans: gelecekte oluşan kampanyayı sayma
//   AND (
//     -- Nominal aralık kesişiyor (landing'de yazan tarihler güvenilirse):
//     ((c.valid_from IS NULL OR c.valid_from <= to+1day)
//      AND (c.valid_to IS NULL OR c.valid_to >= from))
//     OR
//     -- VEYA scrape'te aralık içinde hala görülüyor. `valid_to` çoğu site için
//     -- landing'deki eski orijinal tarihtir ve yenilenmez; bu yüzden scrape
//     -- tabanlı `last_seen_at` gerçek "canlılığın" daha güvenilir sinyalidir.
//     c.last_seen_at >= from
//   )
//
// `to` günü dahil olsun diye `< to + 1 day` kullanırız.
function bonusMetricsCte(
  options: { from?: string; to?: string; startIndex?: number } = {}
): { sql: string; nextIndex: number; dateParams: string[] } {
  const { from, to } = options;
  const startIndex = options.startIndex ?? 1;
  const dateParams: string[] = [];
  const conditions: string[] = [];

  if (from && to) {
    const toIdx1 = startIndex + dateParams.length;
    conditions.push(`c.first_seen_at < DATE_ADD($${toIdx1}, INTERVAL 1 DAY)`);
    dateParams.push(to);

    const toIdx2 = startIndex + dateParams.length;
    dateParams.push(to);
    const fromIdx1 = startIndex + dateParams.length;
    dateParams.push(from);
    const fromIdx2 = startIndex + dateParams.length;
    dateParams.push(from);
    conditions.push(
      `(
        ((c.valid_from IS NULL OR c.valid_from < DATE_ADD($${toIdx2}, INTERVAL 1 DAY))
         AND (c.valid_to IS NULL OR c.valid_to >= $${fromIdx1}))
        OR c.last_seen_at >= $${fromIdx2}
      )`
    );
  } else if (to) {
    const toIdx1 = startIndex + dateParams.length;
    conditions.push(`(c.valid_from IS NULL OR c.valid_from < DATE_ADD($${toIdx1}, INTERVAL 1 DAY))`);
    dateParams.push(to);
    const toIdx2 = startIndex + dateParams.length;
    conditions.push(`c.first_seen_at < DATE_ADD($${toIdx2}, INTERVAL 1 DAY)`);
    dateParams.push(to);
  } else if (from) {
    const fromIdx1 = startIndex + dateParams.length;
    dateParams.push(from);
    const fromIdx2 = startIndex + dateParams.length;
    dateParams.push(from);
    conditions.push(
      `((c.valid_to IS NULL OR c.valid_to >= $${fromIdx1}) OR c.last_seen_at >= $${fromIdx2})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return {
    sql: `
      WITH campaign_bonus_metrics AS (
        SELECT
          c.id,
          c.site_id,
          c.title,
          c.status,
          c.valid_to,
          c.first_seen_at,
          c.last_seen_at,
          ${categoryExpr} as category,
          CAST(NULLIF(TRIM(COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_amount')),
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_amount'))
          )), '') AS DECIMAL(20,4)) as direct_bonus_amount,
          CAST(NULLIF(TRIM(COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.bonus_percentage')),
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.bonus_percentage'))
          )), '') AS DECIMAL(20,4)) as bonus_percentage,
          CAST(NULLIF(TRIM(COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.min_deposit')),
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.conditions.min_deposit'))
          )), '') AS DECIMAL(20,4)) as min_deposit,
          CAST(NULLIF(TRIM(COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.max_bonus')),
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.conditions.max_bonus'))
          )), '') AS DECIMAL(20,4)) as max_bonus,
          CAST(NULLIF(TRIM(COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.free_bet_amount')),
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.freebet_amount')),
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.conditions.freebet_amount'))
          )), '') AS DECIMAL(20,4)) as freebet_amount,
          CAST(NULLIF(TRIM(COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.cashback_percent')),
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.conditions.cashback_percentage'))
          )), '') AS DECIMAL(20,4)) as cashback_percent,
          -- Turnover string olarak gelir ("10x", "5 kez"); UI parse eder.
          NULLIF(TRIM(COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.extractedTags.turnover')),
            JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.conditions.turnover'))
          )), '') as turnover
        FROM campaigns c
        ${whereClause}
      ),
      campaign_bonus_values AS (
        SELECT
          cbm.*,
          CASE
            WHEN cbm.direct_bonus_amount IS NOT NULL AND cbm.direct_bonus_amount > 0 THEN cbm.direct_bonus_amount
            WHEN cbm.freebet_amount IS NOT NULL AND cbm.freebet_amount > 0 THEN cbm.freebet_amount
            WHEN cbm.bonus_percentage IS NOT NULL AND cbm.min_deposit IS NOT NULL THEN LEAST(
              cbm.min_deposit * cbm.bonus_percentage / 100.0,
              COALESCE(NULLIF(cbm.max_bonus, 0), cbm.min_deposit * cbm.bonus_percentage / 100.0)
            )
            WHEN cbm.cashback_percent IS NOT NULL AND cbm.min_deposit IS NOT NULL THEN cbm.min_deposit * cbm.cashback_percent / 100.0
            WHEN cbm.max_bonus IS NOT NULL AND cbm.max_bonus > 0 THEN cbm.max_bonus
            ELSE NULL
          END as effective_bonus_amount
        FROM campaign_bonus_metrics cbm
      )
    `,
    nextIndex: startIndex + dateParams.length,
    dateParams,
  };
}

type SiteRow = {
  site_id: string;
  site_name: string;
  site_code: string;
  base_url: string | null;
  last_scraped_at: Date | string | null;
  momentum_score: number | null;
  momentum_direction: 'up' | 'down' | 'stable' | null;
  momentum_last_7_days: number | null;
  momentum_prev_7_days: number | null;
  momentum_updated_at: Date | string | null;
  // Migration 020 — additive. Atak/Defans tutum kolonları.
  stance: 'aggressive' | 'neutral' | 'defensive' | 'unknown' | null;
  stance_velocity_delta: number | null;
  stance_score: number | null;
  stance_updated_at: Date | string | null;
  total_campaigns: number;
  active_campaigns: number;
  avg_bonus: number;
  total_bonus: number;
  categories_count: number;
  active_rate: number;
};

type SiteCategoryRow = {
  category: string;
  campaign_count: number;
  active_count: number;
  avg_bonus: number;
  total_bonus: number;
};

type ActiveCampaignRow = {
  id: string;
  title: string;
  category: string | null;
  bonus_amount: number | null;
  bonus_percentage: number | null;
  // Slice B: net (effective) bonus + çevrim chip için ek alanlar.
  min_deposit: number | null;
  max_bonus: number | null;
  turnover: string | null;
  status: string;
  valid_from: Date | null;
  valid_to: Date | null;
  first_seen_at: Date | null;
  last_seen_at: Date | null;
};

/**
 * Kampanya aktif olduğu DÖNEMİ türetir. DB'de `valid_from` / `valid_to` çoğu
 * zaman orijinal landing page'de yazan tarihtir (örn. "1 Ağustos 2023") ve
 * kampanya tekrar tekrar yenilense bile değişmez. Kullanıcı UI'da "kampanya
 * şu sıralar aktif" bilgisi görmek ister; bu yüzden:
 *   - effective_start = scrape ile ilk gördüğümüz an (`first_seen_at`),
 *     `valid_from` daha yeniyse onu tercih et (kampanya gelecekte başlıyor).
 *   - effective_end   = `valid_to` gelecekteyse onu kullan, değilse en son
 *     gördüğümüz an (`last_seen_at`).
 *   - still_active    = scrape'te son 7 gün içinde görüldü VE (valid_to yok
 *     ya da gelecekte). Yani UI'da "Devam ediyor" rozeti gösterilebilir.
 *
 * Tüm tarih karşılaştırmaları sunucu saatinde (Date.now()) yapılır.
 */
function deriveEffectiveDates(row: {
  valid_from: Date | string | null;
  valid_to: Date | string | null;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
}): {
  effective_start: Date | string | null;
  effective_end: Date | string | null;
  still_active: boolean;
} {
  const toDate = (v: Date | string | null): Date | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const validFrom = toDate(row.valid_from);
  const validTo = toDate(row.valid_to);
  const firstSeen = toDate(row.first_seen_at);
  const lastSeen = toDate(row.last_seen_at);
  const now = Date.now();

  // start: gelecek tarihli valid_from varsa o, aksi halde first_seen_at,
  // o da yoksa valid_from'a düş (en kötü ihtimal).
  let effectiveStart: Date | null = firstSeen;
  if (validFrom && validFrom.getTime() > now) {
    effectiveStart = validFrom;
  }
  if (!effectiveStart) effectiveStart = validFrom;

  // end: valid_to gelecekte ise onu kullan, değilse last_seen_at'i göster
  // (kampanyayı en son ne zaman canlı gördük). Hiçbiri yoksa null.
  let effectiveEnd: Date | null = null;
  if (validTo && validTo.getTime() >= now) {
    effectiveEnd = validTo;
  } else if (lastSeen) {
    effectiveEnd = lastSeen;
  } else {
    effectiveEnd = validTo;
  }

  // "Devam ediyor": son 7 gün içinde scrape'te yakalandı VE valid_to ya yok
  // ya da gelecekte. Bu, "şu anda gerçekten canlı" sinyalidir.
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recentlySeen = lastSeen ? now - lastSeen.getTime() <= sevenDaysMs : false;
  const validToOk = !validTo || validTo.getTime() >= now;
  const stillActive = recentlySeen && validToOk;

  return {
    effective_start: effectiveStart,
    effective_end: effectiveEnd,
    still_active: stillActive,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = paramsSchema.parse(await params);
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const { from, to } = queryParamsSchema.parse(searchParams);

    // 1. Site header + aggregate stats. We use a LEFT JOIN so that the row
    //    is returned even if the site has zero campaigns yet.
    const cteSiteRow = bonusMetricsCte({ from, to, startIndex: 1 });
    const codePlaceholder = `$${cteSiteRow.nextIndex}`;
    const siteRow = await queryOne<SiteRow>(
      `
      ${cteSiteRow.sql}
      SELECT
        s.id as site_id,
        s.name as site_name,
        s.code as site_code,
        s.base_url,
        s.last_scraped_at,
        s.momentum_score,
        s.momentum_direction,
        s.momentum_last_7_days,
        s.momentum_prev_7_days,
        s.momentum_updated_at,
        -- Migration 020 — Atak/Defans (additive). NULL fallback ENUM/INT
        -- default'lara güvenir; eski sites henüz hesaplanmamışsa 'unknown'.
        COALESCE(s.stance, 'unknown') as stance,
        COALESCE(s.stance_velocity_delta, 0) as stance_velocity_delta,
        s.stance_score as stance_score,
        s.stance_updated_at as stance_updated_at,
        COUNT(cbv.id) as total_campaigns,
        SUM(CASE WHEN cbv.status = 'active' THEN 1 ELSE 0 END) as active_campaigns,
        COALESCE(AVG(cbv.effective_bonus_amount), 0) as avg_bonus,
        COALESCE(SUM(cbv.effective_bonus_amount), 0) as total_bonus,
        COUNT(DISTINCT cbv.category) as categories_count,
        CASE WHEN COUNT(cbv.id) = 0 THEN 0
          ELSE SUM(CASE WHEN cbv.status = 'active' THEN 1 ELSE 0 END) / COUNT(cbv.id)
        END as active_rate
      FROM sites s
      LEFT JOIN campaign_bonus_values cbv ON cbv.site_id = s.id
      WHERE s.code = ${codePlaceholder}
      GROUP BY s.id, s.name, s.code, s.base_url, s.last_scraped_at,
               s.momentum_score, s.momentum_direction, s.momentum_last_7_days,
               s.momentum_prev_7_days, s.momentum_updated_at,
               s.stance, s.stance_velocity_delta, s.stance_score, s.stance_updated_at
      `,
      [...cteSiteRow.dateParams, code]
    );

    if (!siteRow) {
      return errorResponse('NOT_FOUND', `Site bulunamadı: ${code}`, 404);
    }

    const siteId = siteRow.site_id;

    // 2. Per-category breakdown for this site (heatmap rows).
    const cteSiteCat = bonusMetricsCte({ from, to, startIndex: 1 });
    const siteIdPlaceholderCat = `$${cteSiteCat.nextIndex}`;
    const siteCategoryRows = await query<SiteCategoryRow>(
      `
      ${cteSiteCat.sql}
      SELECT
        cbv.category as category,
        COUNT(*) as campaign_count,
        SUM(CASE WHEN cbv.status = 'active' THEN 1 ELSE 0 END) as active_count,
        COALESCE(AVG(cbv.effective_bonus_amount), 0) as avg_bonus,
        COALESCE(SUM(cbv.effective_bonus_amount), 0) as total_bonus
      FROM campaign_bonus_values cbv
      WHERE cbv.site_id = ${siteIdPlaceholderCat}
        AND cbv.category IS NOT NULL
        AND cbv.category != ''
      GROUP BY cbv.category
      ORDER BY campaign_count DESC, avg_bonus DESC
      `,
      [...cteSiteCat.dateParams, siteId]
    );

    // 3. For each category present on this site, compute the category-wide
    //    leader so we can show rank/avg vs leader in the heatmap.
    const cteCatAgg = bonusMetricsCte({ from, to, startIndex: 1 });
    const categoryAggRows = await query<{
      category: string;
      site_id: string;
      site_name: string;
      site_code: string;
      campaign_count: number;
      avg_bonus: number;
    }>(
      `
      ${cteCatAgg.sql}
      SELECT
        cbv.category as category,
        cbv.site_id,
        s.name as site_name,
        s.code as site_code,
        COUNT(*) as campaign_count,
        COALESCE(AVG(cbv.effective_bonus_amount), 0) as avg_bonus
      FROM campaign_bonus_values cbv
      JOIN sites s ON s.id = cbv.site_id
      WHERE cbv.category IS NOT NULL
        AND cbv.category != ''
      GROUP BY cbv.category, cbv.site_id, s.name, s.code
      `,
      [...cteCatAgg.dateParams]
    );

    type CategorySummary = {
      total_sites: number;
      total_campaigns: number;
      avg_of_avg_bonus: number;
      leader_site_id: string;
      leader_site_name: string;
      leader_site_code: string;
      leader_campaign_count: number;
      leader_avg_bonus: number;
      // ordered by campaign_count desc to compute rank
      ranking: Array<{ site_id: string; campaign_count: number }>;
    };
    const byCategory: Record<string, CategorySummary> = {};
    for (const row of categoryAggRows) {
      const cat = row.category;
      const count = Number(row.campaign_count) || 0;
      const avgBonus = Number(row.avg_bonus) || 0;
      if (!byCategory[cat]) {
        byCategory[cat] = {
          total_sites: 0,
          total_campaigns: 0,
          avg_of_avg_bonus: 0,
          leader_site_id: row.site_id,
          leader_site_name: row.site_name,
          leader_site_code: row.site_code,
          leader_campaign_count: count,
          leader_avg_bonus: avgBonus,
          ranking: [],
        };
      }
      const summary = byCategory[cat];
      summary.total_sites += 1;
      summary.total_campaigns += count;
      summary.avg_of_avg_bonus += avgBonus;
      summary.ranking.push({ site_id: row.site_id, campaign_count: count });
      if (
        count > summary.leader_campaign_count ||
        (count === summary.leader_campaign_count && avgBonus > summary.leader_avg_bonus)
      ) {
        summary.leader_site_id = row.site_id;
        summary.leader_site_name = row.site_name;
        summary.leader_site_code = row.site_code;
        summary.leader_campaign_count = count;
        summary.leader_avg_bonus = avgBonus;
      }
    }

    for (const cat of Object.keys(byCategory)) {
      const summary = byCategory[cat];
      summary.avg_of_avg_bonus =
        summary.total_sites > 0 ? summary.avg_of_avg_bonus / summary.total_sites : 0;
      summary.ranking.sort((a, b) => b.campaign_count - a.campaign_count);
    }

    const categoryHeatmap = siteCategoryRows.map((row) => {
      const summary = byCategory[row.category];
      const rank = summary
        ? Math.max(1, summary.ranking.findIndex((r) => r.site_id === siteId) + 1)
        : 1;
      const totalSites = summary?.total_sites ?? 1;
      const leaderAvg = (summary?.leader_avg_bonus ?? Number(row.avg_bonus)) || 0;
      const categoryAvg = (summary?.avg_of_avg_bonus ?? Number(row.avg_bonus)) || 0;
      return {
        category: row.category,
        campaign_count: Number(row.campaign_count) || 0,
        active_count: Number(row.active_count) || 0,
        avg_bonus: Number(row.avg_bonus) || 0,
        total_bonus: Number(row.total_bonus) || 0,
        rank,
        total_sites: totalSites,
        category_avg_bonus: categoryAvg,
        leader_site_id: summary?.leader_site_id ?? siteId,
        leader_site_name: summary?.leader_site_name ?? siteRow.site_name,
        leader_site_code: summary?.leader_site_code ?? siteRow.site_code,
        leader_campaign_count: (summary?.leader_campaign_count ?? Number(row.campaign_count)) || 0,
        leader_avg_bonus: leaderAvg,
        is_leader: summary?.leader_site_id === siteId,
      };
    });

    // 4. Active campaign list (status=active, ordered by effective bonus desc
    //    then valid_to asc to surface scarcity / urgency). Tarih filtresi
    //    CTE üzerinden uygulanır — yani "bu aralıkta ilk görülen + halen aktif"
    //    kampanyalar.
    const cteActive = bonusMetricsCte({ from, to, startIndex: 1 });
    const activeSiteIdPlaceholder = `$${cteActive.nextIndex}`;
    const activeCampaigns = await query<ActiveCampaignRow>(
      `
      ${cteActive.sql}
      SELECT
        cbv.id,
        cbv.title,
        cbv.category,
        cbv.effective_bonus_amount as bonus_amount,
        cbv.bonus_percentage,
        cbv.min_deposit,
        cbv.max_bonus,
        cbv.turnover,
        cbv.status,
        c.valid_from,
        cbv.valid_to,
        cbv.first_seen_at,
        cbv.last_seen_at
      FROM campaign_bonus_values cbv
      JOIN campaigns c ON c.id = cbv.id
      WHERE cbv.site_id = ${activeSiteIdPlaceholder} AND cbv.status = 'active'
      ORDER BY COALESCE(cbv.effective_bonus_amount, 0) DESC,
               cbv.valid_to ASC
      LIMIT 50
      `,
      [...cteActive.dateParams, siteId]
    );

    // 5. Momentum timeline. We don't yet have a historical momentum_score
    //    snapshot table, so we synthesise the last 8 weeks from raw
    //    campaign first_seen_at counts. The most recent week's score will
    //    match the live momentum_score column; older weeks are derived
    //    from the same week-over-week delta formula so the chart shape
    //    is consistent with how momentum_score itself is computed.
    const weekRows = await query<{ week_offset: number; new_campaigns: number }>(
      `
      SELECT
        FLOOR(TIMESTAMPDIFF(DAY, c.first_seen_at, NOW()) / 7) as week_offset,
        COUNT(*) as new_campaigns
      FROM campaigns c
      WHERE c.site_id = $1
        AND c.first_seen_at >= DATE_SUB(NOW(), INTERVAL 63 DAY)
      GROUP BY FLOOR(TIMESTAMPDIFF(DAY, c.first_seen_at, NOW()) / 7)
      `,
      [siteId]
    );

    const weekCounts = new Map<number, number>();
    for (const row of weekRows) {
      weekCounts.set(Number(row.week_offset), Number(row.new_campaigns) || 0);
    }

    // Build 8 weeks: index 0 = current week, 7 = oldest. Score for week N
    // is (week N - week N+1) / week N+1 * 100.
    const momentumTimeline: Array<{
      week_offset: number;
      week_label: string;
      new_campaigns: number;
      score: number;
      direction: 'up' | 'down' | 'stable';
    }> = [];
    for (let i = 0; i < 8; i += 1) {
      const current = weekCounts.get(i) ?? 0;
      const prev = weekCounts.get(i + 1) ?? 0;
      let score = 0;
      if (prev > 0) {
        score = Math.round(((current - prev) / prev) * 100);
      } else if (current > 0) {
        score = 100;
      }
      let direction: 'up' | 'down' | 'stable' = 'stable';
      if (prev > 0 && (current - prev) / prev >= 0.2) direction = 'up';
      else if (prev > 0 && (current - prev) / prev <= -0.2) direction = 'down';
      momentumTimeline.push({
        week_offset: i,
        week_label: i === 0 ? 'Bu hafta' : `${i} hafta önce`,
        new_campaigns: current,
        score,
        direction,
      });
    }
    // Reverse so the chart reads left→right as oldest→newest.
    momentumTimeline.reverse();

    return NextResponse.json(
      {
        success: true,
        data: {
          site: {
            site_id: siteRow.site_id,
            site_name: siteRow.site_name,
            site_code: siteRow.site_code,
            base_url: siteRow.base_url,
            last_scraped_at: siteRow.last_scraped_at,
            momentum_score: Number(siteRow.momentum_score) || 0,
            momentum_direction:
              (siteRow.momentum_direction as 'up' | 'down' | 'stable' | null) || 'stable',
            momentum_last_7_days: Number(siteRow.momentum_last_7_days) || 0,
            momentum_prev_7_days: Number(siteRow.momentum_prev_7_days) || 0,
            momentum_updated_at: siteRow.momentum_updated_at,
            // Migration 020 — Atak/Defans (additive). UI StanceBadge consumer.
            stance:
              (siteRow.stance as
                | 'aggressive'
                | 'neutral'
                | 'defensive'
                | 'unknown'
                | null) || 'unknown',
            stance_velocity_delta: Number(siteRow.stance_velocity_delta) || 0,
            stance_score:
              siteRow.stance_score == null ? null : Number(siteRow.stance_score),
            stance_updated_at: siteRow.stance_updated_at,
            total_campaigns: Number(siteRow.total_campaigns) || 0,
            active_campaigns: Number(siteRow.active_campaigns) || 0,
            avg_bonus: Number(siteRow.avg_bonus) || 0,
            total_bonus: Number(siteRow.total_bonus) || 0,
            categories_count: Number(siteRow.categories_count) || 0,
            active_rate: Number(siteRow.active_rate) || 0,
          },
          categoryHeatmap,
          activeCampaigns: activeCampaigns.map((c) => {
            const derived = deriveEffectiveDates(c);
            return {
              id: c.id,
              title: c.title,
              category: c.category,
              bonus_amount: c.bonus_amount !== null ? Number(c.bonus_amount) : null,
              bonus_percentage: c.bonus_percentage !== null ? Number(c.bonus_percentage) : null,
              // Slice B: BonusChips ve "Net" sütunu için ek alanlar.
              min_deposit: c.min_deposit !== null && c.min_deposit !== undefined ? Number(c.min_deposit) : null,
              max_bonus: c.max_bonus !== null && c.max_bonus !== undefined ? Number(c.max_bonus) : null,
              turnover: c.turnover ?? null,
              status: c.status,
              // Ham DB tarihleri — mevcut tüketiciler kırılmasın diye additive
              // tutuluyor. UI bunları artık primary olarak kullanmamalı.
              valid_from: c.valid_from,
              valid_to: c.valid_to,
              first_seen_at: c.first_seen_at,
              last_seen_at: c.last_seen_at,
              // Türev tarihler — UI bunları primary olarak göstermeli.
              effective_start: derived.effective_start,
              effective_end: derived.effective_end,
              still_active: derived.still_active,
            };
          }),
          momentumTimeline,
        },
      },
      { headers: getCorsHeaders(request) }
    );
  } catch (error) {
    console.error('Site profile API error:', error);
    return successResponse({
      site: null,
      categoryHeatmap: [],
      activeCampaigns: [],
      momentumTimeline: [],
      fallback: true,
    });
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
