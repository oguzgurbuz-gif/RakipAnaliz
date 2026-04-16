import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { successResponse, getCorsHeaders } from '@/lib/response';

const querySchema = z.object({
  category: z.string().optional(),
  metric: z.enum(['campaigns', 'avg_bonus', 'total_bonus', 'active_rate']).optional(),
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
  valid_to: Date | null;
};

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

function bonusMetricsCte(): string {
  return `
      WITH campaign_bonus_metrics AS (
        SELECT
          c.id,
          c.site_id,
          c.title,
          c.status,
          c.valid_to,
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
    `;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const params = querySchema.parse(searchParams);
    const { category, metric } = params;

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

    let statsParams: unknown[] = [];
    if (category) {
      statsParams.push(category);
    }

    const cte = bonusMetricsCte();

    const statsQuery = `
      ${cte}
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
        ${category ? `AND cbv.category = $1` : ''}
      GROUP BY cbv.category, cbv.site_id, s.name, s.code
      ORDER BY cbv.category, s.name
    `;
    const statsResult = await query<CategoryStats>(statsQuery, statsParams);

    const siteRankingsQuery = `
      ${cte}
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
          END as active_rate
        FROM campaign_bonus_values cbv
        JOIN sites s ON s.id = cbv.site_id
        GROUP BY cbv.site_id, s.name, s.code
      ) ranked
      ORDER BY CASE
        WHEN $1 = 'avg_bonus' THEN ranked.avg_bonus
        WHEN $1 = 'total_bonus' THEN ranked.total_bonus
        WHEN $1 = 'active_rate' THEN ranked.active_rate
        ELSE ranked.total_campaigns
      END DESC
    `;
    const siteRankingsResult = await query<SiteRanking>(siteRankingsQuery, [metric || 'campaigns']);

    const bestDealsQuery = `
      ${cte}
      SELECT 
        cbv.id as campaign_id,
        cbv.title as campaign_title,
        s.name as site_name,
        s.code as site_code,
        cbv.category as category,
        cbv.effective_bonus_amount as bonus_amount,
        cbv.bonus_percentage,
        cbv.status,
        cbv.valid_to
      FROM campaign_bonus_values cbv
      JOIN sites s ON s.id = cbv.site_id
      WHERE (cbv.effective_bonus_amount > 0 OR cbv.bonus_percentage > 0)
        ${category ? `AND cbv.category = $1` : ''}
      ORDER BY COALESCE(cbv.effective_bonus_amount, 0) DESC, COALESCE(cbv.bonus_percentage, 0) DESC
      LIMIT 20
    `;
    const bestDealsResult = await query<BestDeal>(bestDealsQuery, category ? [category] : []);

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
        },
      },
      { headers: getCorsHeaders() }
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
      fallback: true,
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
