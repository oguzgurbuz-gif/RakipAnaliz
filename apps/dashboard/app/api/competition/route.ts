import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { successResponse, getCorsHeaders } from '@/lib/response';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  category: z.string().optional(),
  metric: z.enum(['campaigns', 'avg_bonus', 'total_bonus', 'active_rate']).optional(),
  from: z.string().regex(dateRegex).optional(),
  to: z.string().regex(dateRegex).optional(),
});

type CategoryStats = {
  category: string;
  site_id: string;
  site_name: string;
  site_code: string;
  campaign_count: number;
  active_count: number;
  avg_bonus: number;
  total_bonus: number;
};

type SiteRanking = {
  site_id: string;
  site_name: string;
  site_code: string;
  total_campaigns: number;
  active_campaigns: number;
  avg_bonus: number;
  total_bonus: number;
  categories_count: number;
  active_rate: number;
  momentum_score: number;
  momentum_direction: 'up' | 'down' | 'stable';
  momentum_updated_at: Date | string | null;
  // Migration 020 — additive. Stance derives from competitive-stance-calc job
  // (24h cadence). Velocity delta = last_7d_count - last_4w_avg.
  stance: 'aggressive' | 'neutral' | 'defensive' | 'unknown';
  stance_velocity_delta: number;
  stance_score: number | null;
  stance_updated_at: Date | string | null;
};

type BestDeal = {
  campaign_id: string;
  campaign_title: string;
  site_name: string;
  site_code: string;
  category: string;
  bonus_amount: number | null;
  bonus_percentage: number | null;
  status: string;
  valid_from: Date | null;
  valid_to: Date | null;
  first_seen_at: Date | null;
  last_seen_at: Date | null;
};

/**
 * Bkz. apps/dashboard/app/api/competition/sites/[code]/route.ts — aynı semantik.
 * Burada self-contained tutuyoruz çünkü iki endpoint farklı evrim hızında
 * gelişebilir; ileride farklı ihtiyaç olursa biri diğerini kırmasın.
 *
 * effective_start: gelecekteki valid_from > first_seen_at; aksi halde first_seen_at.
 * effective_end:   valid_to gelecekteyse o, değilse last_seen_at.
 * still_active:    son 7 gün içinde scrape'te görüldü VE valid_to henüz geçmedi.
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

  let effectiveStart: Date | null = firstSeen;
  if (validFrom && validFrom.getTime() > now) effectiveStart = validFrom;
  if (!effectiveStart) effectiveStart = validFrom;

  let effectiveEnd: Date | null;
  if (validTo && validTo.getTime() >= now) effectiveEnd = validTo;
  else if (lastSeen) effectiveEnd = lastSeen;
  else effectiveEnd = validTo;

  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recentlySeen = lastSeen ? now - lastSeen.getTime() <= sevenDaysMs : false;
  const validToOk = !validTo || validTo.getTime() >= now;

  return {
    effective_start: effectiveStart,
    effective_end: effectiveEnd,
    still_active: recentlySeen && validToOk,
  };
}

type SiteCategoryMatrix = {
  category: string;
  site_name: string;
  site_code: string;
  campaign_count: number;
  avg_score: number;
  is_winner: boolean;
};

const categoryExpr = `COALESCE(
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), '')
)`;

/**
 * `from`/`to` filtreleri varsa CTE'ye "active_during_range" koşulu uygulanır —
 * seçili [from, to] aralığında AKTİF olan kampanyalar (ilk görülenler değil).
 *
 * Bir kampanya aralığa şu şartla girer:
 *   c.first_seen_at <= to+1day    -- defans: gelecekte oluşan kampanyayı sayma
 *   AND (
 *     -- Nominal aralık kesişiyor (landing'de yazan tarihler güvenilirse):
 *     ((c.valid_from IS NULL OR c.valid_from <= to+1day)
 *      AND (c.valid_to IS NULL OR c.valid_to >= from))
 *     OR
 *     -- VEYA scrape'te aralık içinde hala görülüyor. `valid_to` çoğu site için
 *     -- landing'deki eski orijinal tarihtir ve yenilenmez; bu yüzden scrape
 *     -- tabanlı `last_seen_at` gerçek "canlılığın" daha güvenilir sinyalidir.
 *     c.last_seen_at >= from
 *   )
 *
 * `to` günü dahil olsun diye `< to + 1 day` kullanırız (BETWEEN ile 'to 23:59'
 * kaydı kaçardı).
 *
 * `startIndex` — bu CTE içinde kullanılacak ilk pg parametre index'i (1 tabanlı).
 * Dönüş: `{ sql, nextIndex }` — caller bir sonraki index'i kendi placeholder'ları
 * için kullanır.
 */
function bonusMetricsCte(
  options: { from?: string; to?: string; startIndex?: number } = {}
): { sql: string; nextIndex: number; dateParams: string[] } {
  const { from, to } = options;
  const startIndex = options.startIndex ?? 1;
  const dateParams: string[] = [];
  const conditions: string[] = [];

  if (from && to) {
    // Defans: kampanya, seçili aralıktan sonra oluşmamış olmalı.
    const toIdx1 = startIndex + dateParams.length;
    conditions.push(`c.first_seen_at < DATE_ADD($${toIdx1}, INTERVAL 1 DAY)`);
    dateParams.push(to);

    // Nominal kesişim VEYA last_seen_at fallback.
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
    // Sadece üst sınır: alt sınır yok, last_seen_at fallback'e gerek yok.
    const toIdx1 = startIndex + dateParams.length;
    conditions.push(`(c.valid_from IS NULL OR c.valid_from < DATE_ADD($${toIdx1}, INTERVAL 1 DAY))`);
    dateParams.push(to);
    const toIdx2 = startIndex + dateParams.length;
    conditions.push(`c.first_seen_at < DATE_ADD($${toIdx2}, INTERVAL 1 DAY)`);
    dateParams.push(to);
  } else if (from) {
    // Sadece alt sınır: valid_to kesişimi VEYA last_seen_at fallback.
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
          c.valid_from,
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
          )), '') AS DECIMAL(20,4)) as cashback_percent
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

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const params = querySchema.parse(searchParams);
    const { category, metric, from, to } = params;

    // `categories` listesi her zaman tüm aralıkta — kategori filtresi global
    // (UI'da seçim ufak bir yardımcı). Tarih filtresi uygulanmaz.
    const categoriesQuery = `
      SELECT DISTINCT ${categoryExpr} as category
      FROM campaigns c
      WHERE ${categoryExpr} IS NOT NULL
        AND ${categoryExpr} != ''
      ORDER BY category
    `;
    const categoriesResult = await query<{ category: string }>(categoriesQuery);
    const categories = categoriesResult.map((r) => r.category);

    const sitesQuery = `
      SELECT id as site_id, name as site_name, code as site_code
      FROM sites
      ORDER BY name
    `;
    const sitesResult = await query<{ site_id: string; site_name: string; site_code: string }>(sitesQuery);
    const sites = sitesResult;

    // Her CTE çağrısı kendi date params'ını taşır; pg-style $N index'leri her
    // sorguda 1'den başlar (mysql converter sorgu-bazlı).
    const cteForStats = bonusMetricsCte({ from, to, startIndex: 1 });
    const statsParams: unknown[] = [...cteForStats.dateParams];
    if (category) {
      statsParams.push(category);
    }
    const categoryPlaceholder = `$${cteForStats.nextIndex}`;

    const statsQuery = `
      ${cteForStats.sql}
      SELECT
        cbv.category as category,
        cbv.site_id,
        s.name as site_name,
        s.code as site_code,
        COUNT(*) as campaign_count,
        SUM(CASE WHEN cbv.status = 'active' THEN 1 ELSE 0 END) as active_count,
        COALESCE(AVG(cbv.effective_bonus_amount), 0) as avg_bonus,
        COALESCE(SUM(cbv.effective_bonus_amount), 0) as total_bonus
      FROM campaign_bonus_values cbv
      JOIN sites s ON s.id = cbv.site_id
      WHERE cbv.category IS NOT NULL
        AND cbv.category != ''
        ${category ? `AND cbv.category = ${categoryPlaceholder}` : ''}
      GROUP BY cbv.category, cbv.site_id, s.name, s.code
      ORDER BY cbv.category, s.name
    `;
    const statsResult = await query<CategoryStats>(statsQuery, statsParams);

    const cteForRankings = bonusMetricsCte({ from, to, startIndex: 1 });
    const metricPlaceholder = `$${cteForRankings.nextIndex}`;
    const siteRankingsQuery = `
      ${cteForRankings.sql}
      SELECT * FROM (
        SELECT
          cbv.site_id,
          s.name as site_name,
          s.code as site_code,
          COUNT(*) as total_campaigns,
          SUM(CASE WHEN cbv.status = 'active' THEN 1 ELSE 0 END) as active_campaigns,
          COALESCE(AVG(cbv.effective_bonus_amount), 0) as avg_bonus,
          COALESCE(SUM(cbv.effective_bonus_amount), 0) as total_bonus,
          COUNT(DISTINCT cbv.category) as categories_count,
          CASE WHEN COUNT(*) = 0 THEN 0
            ELSE SUM(CASE WHEN cbv.status = 'active' THEN 1 ELSE 0 END) / COUNT(*)
          END as active_rate,
          COALESCE(s.momentum_score,
            CASE
              WHEN (
                SELECT COUNT(*) FROM campaigns c2
                WHERE c2.site_id = cbv.site_id
                  AND c2.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                  AND c2.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
              ) > 0
              THEN ROUND((
                (SELECT COUNT(*) FROM campaigns c3 WHERE c3.site_id = cbv.site_id AND c3.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
                -
                (SELECT COUNT(*) FROM campaigns c4 WHERE c4.site_id = cbv.site_id AND c4.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND c4.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
              ) /
              (SELECT COUNT(*) FROM campaigns c5 WHERE c5.site_id = cbv.site_id AND c5.first_seen_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND c5.first_seen_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
              * 100)
              WHEN (SELECT COUNT(*) FROM campaigns c6 WHERE c6.site_id = cbv.site_id AND c6.first_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) > 0 THEN 100
              ELSE 0
            END
          ) as momentum_score,
          COALESCE(s.momentum_direction, 'stable') as momentum_direction,
          s.momentum_updated_at as momentum_updated_at,
          -- Migration 020 — Atak/Defans tutum kolonları. NULL/eski sites
          -- migration uygulanmadıysa COALESCE ile 'unknown'/0 fallback'i.
          COALESCE(s.stance, 'unknown') as stance,
          COALESCE(s.stance_velocity_delta, 0) as stance_velocity_delta,
          s.stance_score as stance_score,
          s.stance_updated_at as stance_updated_at
        FROM campaign_bonus_values cbv
        JOIN sites s ON s.id = cbv.site_id
        GROUP BY cbv.site_id, s.name, s.code, s.momentum_score, s.momentum_direction, s.momentum_updated_at,
                 s.stance, s.stance_velocity_delta, s.stance_score, s.stance_updated_at
      ) ranked
      ORDER BY CASE
        WHEN ${metricPlaceholder} = 'avg_bonus' THEN ranked.avg_bonus
        WHEN ${metricPlaceholder} = 'total_bonus' THEN ranked.total_bonus
        WHEN ${metricPlaceholder} = 'active_rate' THEN ranked.active_rate
        ELSE ranked.total_campaigns
      END DESC
    `;
    const siteRankingsResult = await query<SiteRanking>(siteRankingsQuery, [
      ...cteForRankings.dateParams,
      metric || 'campaigns',
    ]);

    const cteForBestDeals = bonusMetricsCte({ from, to, startIndex: 1 });
    const bestDealsParams: unknown[] = [...cteForBestDeals.dateParams];
    if (category) bestDealsParams.push(category);
    const bestDealsCategoryPlaceholder = `$${cteForBestDeals.nextIndex}`;
    const bestDealsQuery = `
      ${cteForBestDeals.sql}
      SELECT
        cbv.id as campaign_id,
        cbv.title as campaign_title,
        s.name as site_name,
        s.code as site_code,
        cbv.category as category,
        cbv.effective_bonus_amount as bonus_amount,
        cbv.bonus_percentage,
        cbv.status,
        cbv.valid_from,
        cbv.valid_to,
        cbv.first_seen_at,
        cbv.last_seen_at
      FROM campaign_bonus_values cbv
      JOIN sites s ON s.id = cbv.site_id
      WHERE (cbv.effective_bonus_amount > 0 OR cbv.bonus_percentage > 0)
        ${category ? `AND cbv.category = ${bestDealsCategoryPlaceholder}` : ''}
      ORDER BY COALESCE(cbv.effective_bonus_amount, 0) DESC, COALESCE(cbv.bonus_percentage, 0) DESC
      LIMIT 20
    `;
    const bestDealsRaw = await query<BestDeal>(bestDealsQuery, bestDealsParams);
    // Türev tarihleri ekle. UI bestDeals kartlarında "Devam ediyor" rozeti
    // gösterebilsin ve gerçek aktif aralığı yansıtabilsin diye.
    const bestDealsResult = bestDealsRaw.map((d) => {
      const derived = deriveEffectiveDates(d);
      return {
        ...d,
        effective_start: derived.effective_start,
        effective_end: derived.effective_end,
        still_active: derived.still_active,
      };
    });

    const siteMatrix: Record<string, Record<string, SiteCategoryMatrix>> = {};
    for (const stat of statsResult) {
      const cat = stat.category;
      if (!siteMatrix[cat]) {
        siteMatrix[cat] = {};
      }
      siteMatrix[cat][stat.site_code] = {
        category: cat,
        site_name: stat.site_name,
        site_code: stat.site_code,
        campaign_count: stat.campaign_count,
        avg_score: stat.avg_bonus || 0,
        is_winner: false,
      };
    }

    for (const cat of Object.keys(siteMatrix)) {
      const sitesInCat = Object.values(siteMatrix[cat]);
      if (sitesInCat.length > 0) {
        const winner = sitesInCat.reduce((a, b) => (Number(a.campaign_count) > Number(b.campaign_count) ? a : b));
        if (winner.site_code && siteMatrix[cat][winner.site_code]) {
          siteMatrix[cat][winner.site_code].is_winner = true;
        }
      }
    }

    const comparisonTable: Array<{
      category: string;
      best_site: string;
      best_site_campaigns: number;
      total_sites: number;
      total_campaigns: number;
      avg_campaigns_per_site: number;
    }> = [];
    for (const cat of Object.keys(siteMatrix)) {
      const sitesInCat = Object.values(siteMatrix[cat]);
      const best = sitesInCat.reduce(
        (a, b) => (Number(a.campaign_count) > Number(b.campaign_count) ? a : b),
        sitesInCat[0]
      );
      const totalCampaigns = sitesInCat.reduce((sum, s) => sum + Number(s.campaign_count), 0);
      comparisonTable.push({
        category: cat,
        best_site: best?.site_name || '',
        best_site_campaigns: Number(best?.campaign_count) || 0,
        total_sites: sitesInCat.length,
        total_campaigns: totalCampaigns,
        avg_campaigns_per_site: sitesInCat.length > 0 ? totalCampaigns / sitesInCat.length : 0,
      });
    }

    comparisonTable.sort((a, b) => b.total_campaigns - a.total_campaigns);

    // ---------------------------------------------------------------------
    // Gap analysis: per-site, per-category gap detection
    // For each (site, category) pair, compare the site's campaign_count and
    // avg_bonus against the leader of that category. A gap exists when:
    //   - site has zero campaigns in that category, OR
    //   - site offers less than half of the leader's avg_bonus (and leader > 0)
    // Categories with only one site present are skipped (no meaningful leader).
    // ---------------------------------------------------------------------
    type GapItem = {
      site_id: string;
      site_name: string;
      site_code: string;
      category: string;
      site_campaign_count: number;
      leader_site_name: string;
      leader_site_code: string;
      leader_campaign_count: number;
      site_avg_bonus: number;
      leader_avg_bonus: number;
      campaign_delta: number;
      bonus_delta: number;
      priority: 'high' | 'medium' | 'low';
      score: number;
      reason: 'missing' | 'underbonus' | 'both';
    };

    // Build per-category leader (highest campaign_count) and category totals.
    type CategoryAgg = {
      leader_site_id: string;
      leader_site_name: string;
      leader_site_code: string;
      leader_campaign_count: number;
      leader_avg_bonus: number;
      total_sites_present: number;
      total_campaigns: number;
    };
    const categoryAgg: Record<string, CategoryAgg> = {};
    for (const stat of statsResult) {
      const cat = stat.category;
      if (!cat) continue;
      const count = Number(stat.campaign_count) || 0;
      const avgBonus = Number(stat.avg_bonus) || 0;
      const existing = categoryAgg[cat];
      if (!existing) {
        categoryAgg[cat] = {
          leader_site_id: stat.site_id,
          leader_site_name: stat.site_name,
          leader_site_code: stat.site_code,
          leader_campaign_count: count,
          leader_avg_bonus: avgBonus,
          total_sites_present: 1,
          total_campaigns: count,
        };
      } else {
        existing.total_sites_present += 1;
        existing.total_campaigns += count;
        // Tie-break: higher campaign_count wins; on tie, higher avg_bonus wins.
        if (
          count > existing.leader_campaign_count ||
          (count === existing.leader_campaign_count && avgBonus > existing.leader_avg_bonus)
        ) {
          existing.leader_site_id = stat.site_id;
          existing.leader_site_name = stat.site_name;
          existing.leader_site_code = stat.site_code;
          existing.leader_campaign_count = count;
          existing.leader_avg_bonus = avgBonus;
        }
      }
    }

    // Build per-site, per-category map for quick lookup of (count, avg_bonus).
    const sitePerCat: Record<string, Record<string, { count: number; avg_bonus: number }>> = {};
    for (const stat of statsResult) {
      if (!sitePerCat[stat.site_id]) sitePerCat[stat.site_id] = {};
      sitePerCat[stat.site_id][stat.category] = {
        count: Number(stat.campaign_count) || 0,
        avg_bonus: Number(stat.avg_bonus) || 0,
      };
    }

    const gaps: GapItem[] = [];
    for (const site of sitesResult) {
      for (const cat of Object.keys(categoryAgg)) {
        const agg = categoryAgg[cat];
        // Skip categories with only a single site present — no comparator.
        if (agg.total_sites_present < 2) continue;
        // Skip the leader itself.
        if (agg.leader_site_id === site.site_id) continue;

        const sitePresence = sitePerCat[site.site_id]?.[cat];
        const siteCount = sitePresence?.count ?? 0;
        const siteAvgBonus = sitePresence?.avg_bonus ?? 0;

        const campaignDelta = agg.leader_campaign_count - siteCount;
        const bonusDelta = agg.leader_avg_bonus - siteAvgBonus;

        const isMissing = siteCount === 0;
        const isUnderBonus =
          agg.leader_avg_bonus > 0 && siteAvgBonus < agg.leader_avg_bonus / 2;

        if (!isMissing && !isUnderBonus) continue;

        // Composite score: weight campaign-count delta + bonus-delta normalized.
        // Normalize bonus delta to roughly campaign-count scale by /100.
        const bonusComponent = Math.max(0, bonusDelta) / 100;
        const score = Math.max(0, campaignDelta) + bonusComponent;

        let priority: 'high' | 'medium' | 'low' = 'low';
        if (isMissing && agg.leader_campaign_count >= 5) priority = 'high';
        else if (isMissing) priority = 'medium';
        else if (isUnderBonus && bonusDelta > agg.leader_avg_bonus * 0.75) priority = 'high';
        else if (isUnderBonus) priority = 'medium';

        gaps.push({
          site_id: site.site_id,
          site_name: site.site_name,
          site_code: site.site_code,
          category: cat,
          site_campaign_count: siteCount,
          leader_site_name: agg.leader_site_name,
          leader_site_code: agg.leader_site_code,
          leader_campaign_count: agg.leader_campaign_count,
          site_avg_bonus: siteAvgBonus,
          leader_avg_bonus: agg.leader_avg_bonus,
          campaign_delta: campaignDelta,
          bonus_delta: bonusDelta,
          priority,
          score,
          reason: isMissing && isUnderBonus ? 'both' : isMissing ? 'missing' : 'underbonus',
        });
      }
    }

    // Sort: highest gap score first, then by leader_campaign_count.
    gaps.sort((a, b) => b.score - a.score || b.leader_campaign_count - a.leader_campaign_count);

    const topByCategory: Record<string, Array<{ site_name: string; site_code: string; count: number; avg_bonus: number }>> =
      {};
    for (const stat of statsResult) {
      if (!topByCategory[stat.category]) {
        topByCategory[stat.category] = [];
      }
      topByCategory[stat.category].push({
        site_name: stat.site_name,
        site_code: stat.site_code,
        count: Number(stat.campaign_count),
        avg_bonus: Number(stat.avg_bonus) || 0,
      });
    }
    for (const cat of Object.keys(topByCategory)) {
      topByCategory[cat].sort((a, b) => b.count - a.count);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          categories,
          sites,
          statsByCategory: statsResult,
          siteRankings: siteRankingsResult,
          bestDeals: bestDealsResult,
          comparisonTable,
          siteMatrix,
          topByCategory,
          gaps,
        },
      },
      { headers: getCorsHeaders(request) }
    );
  } catch (error) {
    console.error('Competition API fallback:', error);
    return successResponse({
      categories: [],
      sites: [],
      statsByCategory: [],
      siteRankings: [],
      bestDeals: [],
      comparisonTable: [],
      siteMatrix: {},
      topByCategory: {},
      gaps: [],
      fallback: true,
    });
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
