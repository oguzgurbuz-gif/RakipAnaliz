import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { successResponse, handleApiError, getCorsHeaders } from '@/lib/response';

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

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const params = querySchema.parse(searchParams);
    const { category, metric } = params;

    const categoriesQuery = `
      SELECT DISTINCT c.metadata->'ai_analysis'->>'category' as category
      FROM campaigns c
      WHERE c.metadata->'ai_analysis'->>'category' IS NOT NULL
        AND c.metadata->'ai_analysis'->>'category' != ''
      ORDER BY c.metadata->'ai_analysis'->>'category'
    `;
    const categoriesResult = await query<{ category: string }>(categoriesQuery);
    const categories = categoriesResult.map(r => r.category);

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

    const statsQuery = `
      SELECT 
        c.metadata->'ai_analysis'->>'category' as category,
        c.site_id,
        s.name as site_name,
        s.code as site_code,
        COUNT(*) as campaign_count,
        COUNT(*) FILTER (WHERE c.status = 'active') as active_count,
        COALESCE(AVG((c.metadata->>'bonus_amount')::numeric), 0) as avg_bonus,
        COALESCE(SUM((c.metadata->>'bonus_amount')::numeric), 0) as total_bonus
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      WHERE c.metadata->'ai_analysis'->>'category' IS NOT NULL
        AND c.metadata->'ai_analysis'->>'category' != ''
        ${category ? `AND c.metadata->'ai_analysis'->>'category' = $1` : ''}
      GROUP BY c.metadata->'ai_analysis'->>'category', c.site_id, s.name, s.code
      ORDER BY c.metadata->'ai_analysis'->>'category', s.name
    `;
    const statsResult = await query<CategoryStats>(statsQuery, statsParams);

    const siteRankingsQuery = `
      SELECT 
        c.site_id,
        s.name as site_name,
        s.code as site_code,
        COUNT(*) as total_campaigns,
        COUNT(*) FILTER (WHERE c.status = 'active') as active_campaigns,
        COALESCE(AVG((c.metadata->>'bonus_amount')::numeric), 0) as avg_bonus,
        COALESCE(SUM((c.metadata->>'bonus_amount')::numeric), 0) as total_bonus,
        COUNT(DISTINCT c.metadata->'ai_analysis'->>'category') as categories_count,
        COUNT(*) FILTER (WHERE c.status = 'active')::numeric / NULLIF(COUNT(*), 0)::numeric as active_rate
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      GROUP BY c.site_id, s.name, s.code
      ORDER BY ${metric === 'avg_bonus' ? 'avg_bonus' : metric === 'total_bonus' ? 'total_bonus' : metric === 'active_rate' ? 'active_rate' : 'total_campaigns'} DESC
    `;
    const siteRankingsResult = await query<SiteRanking>(siteRankingsQuery);

    const bestDealsQuery = `
      SELECT 
        c.id as campaign_id,
        c.title as campaign_title,
        s.name as site_name,
        s.code as site_code,
        c.metadata->'ai_analysis'->>'category' as category,
        (c.metadata->>'bonus_amount')::numeric as bonus_amount,
        (c.metadata->>'bonus_percentage')::numeric as bonus_percentage,
        c.status,
        c.valid_to
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      WHERE ((c.metadata->>'bonus_amount')::numeric > 0 
         OR (c.metadata->>'bonus_percentage')::numeric > 0)
        ${category ? `AND c.metadata->'ai_analysis'->>'category' = $1` : ''}
      ORDER BY COALESCE((c.metadata->>'bonus_amount')::numeric, 0) DESC
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
      const best = sitesInCat.reduce((a, b) => (Number(a.campaign_count) > Number(b.campaign_count) ? a : b), sitesInCat[0]);
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

    const topByCategory: Record<string, Array<{ site_name: string; site_code: string; count: number; avg_bonus: number }>> = {};
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
    return handleApiError(error);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}