import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { handleApiError, getCorsHeaders } from '@/lib/response';

const querySchema = z.object({
  days: z.coerce.number().int().positive().max(90).default(30),
});

type TrendRow = {
  date: Date;
  count: string;
  category: string | null;
  sentiment: string | null;
  site_name: string | null;
  avg_value_score: number | null;
};

type SiteStatsRow = {
  site_name: string;
  campaign_count: string;
  avg_value_score: number | null;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const params = querySchema.parse(searchParams);
    const { days } = params;

    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const qualityFilter = `
      COALESCE(BTRIM(c.title), '') <> ''
      AND LOWER(BTRIM(c.title)) NOT IN ('kampanyalar', 'güncel kampanyalar')
      AND c.title NOT ILIKE '%tarayıcı sürümü%'
      AND COALESCE(c.body, '') NOT ILIKE '%desteklenmemektedir%'
      AND COALESCE(c.body, '') NOT ILIKE '%güncel kampanya bulunmamaktadır%'
    `;

    const campaignsOverTimeQuery = `
      SELECT 
        DATE(c.created_at) as date,
        COUNT(*) as count
      FROM campaigns c
      WHERE c.created_at >= $1
        AND ${qualityFilter}
      GROUP BY DATE(c.created_at)
      ORDER BY date ASC
    `;

    const categoryTrendQuery = `
      SELECT 
        DATE(c.created_at) as date,
        COALESCE(
          NULLIF(c.metadata->'ai_analysis'->>'campaign_type', ''),
          NULLIF(c.metadata->'ai_analysis'->>'category', ''),
          'unknown'
        ) as category,
        COUNT(*) as count
      FROM campaigns c
      WHERE c.created_at >= $1
        AND ${qualityFilter}
      GROUP BY DATE(c.created_at), 2
      ORDER BY date ASC, count DESC
    `;

    const sentimentDistributionQuery = `
      WITH latest_ai AS (
        SELECT DISTINCT ON (ai2.campaign_id)
          ai2.campaign_id,
          ai2.sentiment_label
        FROM campaign_ai_analyses ai2
        ORDER BY ai2.campaign_id, ai2.created_at DESC
      )
      SELECT 
        COALESCE(
          NULLIF(c.metadata->'ai_analysis'->>'sentiment', ''),
          NULLIF(ai.sentiment_label, ''),
          'unknown'
        ) as sentiment,
        COUNT(*) as count
      FROM campaigns c
      LEFT JOIN latest_ai ai ON ai.campaign_id = c.id
      WHERE c.created_at >= $1
        AND ${qualityFilter}
      GROUP BY 1
    `;

    const topCategoriesQuery = `
      SELECT 
        COALESCE(
          NULLIF(c.metadata->'ai_analysis'->>'campaign_type', ''),
          NULLIF(c.metadata->'ai_analysis'->>'category', ''),
          'unknown'
        ) as category,
        COUNT(*) as count
      FROM campaigns c
      WHERE c.created_at >= $1
        AND ${qualityFilter}
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `;

    const topSitesQuery = `
      SELECT 
        s.name as site_name,
        COUNT(*) as campaign_count
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      WHERE c.created_at >= $1
        AND ${qualityFilter}
      GROUP BY s.name
      ORDER BY campaign_count DESC
      LIMIT 10
    `;

    const valueScoreBySiteQuery = `
      SELECT 
        s.name as site_name,
        AVG((c.metadata->'ai_analysis'->>'valueScore')::numeric) as avg_value_score
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      WHERE c.created_at >= $1
        AND (c.metadata->'ai_analysis'->>'valueScore') IS NOT NULL
        AND ${qualityFilter}
      GROUP BY s.name
      ORDER BY avg_value_score DESC
      LIMIT 10
    `;

    const weeklyTopCategoriesQuery = `
      SELECT
        COALESCE(
          NULLIF(c.metadata->'ai_analysis'->>'campaign_type', ''),
          NULLIF(c.metadata->'ai_analysis'->>'category', ''),
          'unknown'
        ) as category,
        COUNT(*) as count
      FROM campaigns c
      WHERE c.created_at >= $1
        AND ${qualityFilter}
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `;

    const [
      campaignsOverTime,
      categoryTrends,
      sentimentDistribution,
      topCategories,
      topSites,
      valueScoreBySite,
      weeklyTopCategories,
    ] = await Promise.all([
      query<TrendRow>(campaignsOverTimeQuery, [dateFrom]),
      query<TrendRow>(categoryTrendQuery, [dateFrom]),
      query<TrendRow>(sentimentDistributionQuery, [dateFrom]),
      query<TrendRow>(topCategoriesQuery, [dateFrom]),
      query<SiteStatsRow>(topSitesQuery, [dateFrom]),
      query<SiteStatsRow>(valueScoreBySiteQuery, [dateFrom]),
      query<TrendRow>(weeklyTopCategoriesQuery, [dateFrom]),
    ]);

    const campaignsByDate = campaignsOverTime.map((row) => ({
      date: row.date.toISOString().split('T')[0],
      count: parseInt(row.count, 10),
    }));

    const categoryByDate: Record<string, Record<string, number>> = {};
    for (const row of categoryTrends) {
      const date = row.date.toISOString().split('T')[0];
      const category = row.category || 'Unknown';
      if (!categoryByDate[date]) {
        categoryByDate[date] = {};
      }
      categoryByDate[date][category] = parseInt(row.count, 10);
    }

    const categoryDistribution = topCategories.map((row) => ({
      category: row.category || 'Unknown',
      count: parseInt(row.count, 10),
    }));

    const sentimentDist = sentimentDistribution.map((row) => ({
      sentiment: row.sentiment || 'Unknown',
      count: parseInt(row.count, 10),
    }));

    const sites = topSites.map((row) => ({
      siteName: row.site_name,
      campaignCount: parseInt(row.campaign_count, 10),
    }));

    const valueScores = valueScoreBySite
      .filter((row) => row.avg_value_score !== null)
      .map((row) => ({
        siteName: row.site_name,
        avgValueScore: parseFloat(Number(row.avg_value_score).toFixed(2)),
      }));

    const weeklyCategories = weeklyTopCategories.map((row) => ({
      category: row.category || 'Unknown',
      count: parseInt(row.count, 10),
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          campaignsOverTime: campaignsByDate,
          categoryByDate,
          categoryDistribution,
          sentimentDistribution: sentimentDist,
          topSites: sites,
          valueScoresBySite: valueScores,
          topCategoriesThisWeek: weeklyCategories,
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
