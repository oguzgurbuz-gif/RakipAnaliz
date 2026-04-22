import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { successResponse, getCorsHeaders } from '@/lib/response';
import { getCategoryLabel, isGenericCategory } from '@/lib/category-labels';

// Accept both `from`/`to` (canonical, matches campaigns/audit/etc) and the
// legacy `dateFrom`/`dateTo` aliases that lib/api.ts#fetchReportSummary still
// emits. Without the alias the API silently fell back to its default last-7d
// window even when the UI requested a real range — see audit notes.
const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

type SummaryRow = {
  started_count: string;
  ended_count: string;
  active_count: string;
  passive_count: string;
  changed_count: string;
  category: string;
  category_count: string;
  site_name: string;
  site_count: string;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = Object.fromEntries(new URLSearchParams(request.nextUrl.search));
    const parsed = querySchema.parse(searchParams);
    // Canonical from/to wins when both forms are present.
    const from = parsed.from ?? parsed.dateFrom;
    const to = parsed.to ?? parsed.dateTo;

    const dateFrom = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();

    // Previous period dates (same duration before dateFrom)
    const periodDuration = dateTo.getTime() - dateFrom.getTime();
    const prevDateTo = new Date(dateFrom.getTime() - 1); // 1ms before to keep same duration
    const prevDateFrom = new Date(prevDateTo.getTime() - periodDuration);

    const statusCounts = await query<{
      started_count: string;
      ended_count: string;
      active_count: string;
      passive_count: string;
      changed_count: string;
    }>(`
      SELECT 
        COUNT(CASE WHEN status = 'active' AND (valid_from >= $1 AND valid_from <= $2 OR (valid_from IS NULL AND created_at >= $1 AND created_at <= $2)) THEN 1 END) as started_count,
        COUNT(CASE WHEN status = 'active' AND valid_to >= $1 AND valid_to <= $2 THEN 1 END) as ended_count,
        COUNT(CASE WHEN status = 'active' AND (valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $1) OR (valid_from IS NULL AND created_at <= $2)) THEN 1 END) as active_count,
        COUNT(CASE WHEN status = 'pending' OR status = 'hidden' THEN 1 END) as passive_count,
        COUNT(CASE WHEN status = 'updated' AND updated_at >= $1 AND updated_at <= $2 THEN 1 END) as changed_count
      FROM campaigns
      WHERE (valid_from >= $1 AND valid_from <= $2)
         OR (valid_to >= $1 AND valid_to <= $2)
         OR (valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $1))
         OR (updated_at >= $1 AND updated_at <= $2)
         OR (valid_from IS NULL AND created_at >= $1 AND created_at <= $2)
    `, [dateFrom, dateTo]);

    const prevStatusCounts = await query<{
      started_count: string;
      ended_count: string;
      active_count: string;
      passive_count: string;
      changed_count: string;
    }>(`
      SELECT 
        COUNT(CASE WHEN status = 'active' AND (valid_from >= $1 AND valid_from <= $2 OR (valid_from IS NULL AND created_at >= $1 AND created_at <= $2)) THEN 1 END) as started_count,
        COUNT(CASE WHEN status = 'active' AND valid_to >= $1 AND valid_to <= $2 THEN 1 END) as ended_count,
        COUNT(CASE WHEN status = 'active' AND (valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $1) OR (valid_from IS NULL AND created_at <= $2)) THEN 1 END) as active_count,
        COUNT(CASE WHEN status = 'pending' OR status = 'hidden' THEN 1 END) as passive_count,
        COUNT(CASE WHEN status = 'updated' AND updated_at >= $1 AND updated_at <= $2 THEN 1 END) as changed_count
      FROM campaigns
      WHERE (valid_from >= $1 AND valid_from <= $2)
         OR (valid_to >= $1 AND valid_to <= $2)
         OR (valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $1))
         OR (updated_at >= $1 AND updated_at <= $2)
         OR (valid_from IS NULL AND created_at >= $1 AND created_at <= $2)
    `, [prevDateFrom, prevDateTo]);

    const topCategoriesRaw = await query<{ category: string; count: string }>(`
      SELECT 
        COALESCE(
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.campaign_type')), ''),
          NULLIF(JSON_UNQUOTE(JSON_EXTRACT(c.metadata, '$.ai_analysis.category')), ''),
          'unknown'
        ) as category,
        COUNT(*) as count
      FROM campaigns c
      WHERE (
            (c.valid_from >= $1 AND c.valid_from <= $2)
         OR (c.valid_from IS NULL AND c.created_at >= $1 AND c.created_at <= $2)
      )
        AND COALESCE(TRIM(c.title), '') <> ''
        AND LOWER(TRIM(c.title)) NOT IN ('kampanyalar', 'güncel kampanyalar')
        AND LOWER(c.title) NOT LIKE LOWER('%tarayıcı sürümü%')
        AND LOWER(COALESCE(c.body, '')) NOT LIKE LOWER('%desteklenmemektedir%')
        AND LOWER(COALESCE(c.body, '')) NOT LIKE LOWER('%güncel kampanya bulunmamaktadır%')
      GROUP BY category
      ORDER BY count DESC
      LIMIT 10
    `, [dateFrom, dateTo]);

    const topSites = await query<{ site_name: string; count: string }>(`
      SELECT
        s.name as site_name,
        COUNT(*) as count
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      WHERE (c.valid_from >= $1 AND c.valid_from <= $2)
         OR (c.valid_from IS NULL AND c.created_at >= $1 AND c.created_at <= $2)
      GROUP BY s.name
      ORDER BY count DESC
      LIMIT 5
    `, [dateFrom, dateTo]);

    // Wave 1 #1.1 — Quick stats için iki gerçek metrik:
    //   * activeCompetitors: izlenmekte olan (is_active=true) site sayısı.
    //   * lastUpdatedAt: campaigns.last_seen_at MAX değeri — "Son güncelleme"
    //     kartının gerçek karşılığı. Veri yoksa null döneriz, UI fallback gösterir.
    let activeCompetitors = 0;
    let lastUpdatedAt: string | null = null;
    try {
      const sitesCountRow = await query<{ count: string | number }>(
        `SELECT COUNT(*) AS count FROM sites WHERE is_active = TRUE`
      );
      activeCompetitors = parseInt(String(sitesCountRow[0]?.count ?? '0'), 10) || 0;
    } catch (sitesError) {
      console.warn('Sites count fallback:', sitesError);
    }
    try {
      const lastSeenRow = await query<{ last_seen: string | Date | null }>(
        `SELECT MAX(last_seen_at) AS last_seen FROM campaigns`
      );
      const raw = lastSeenRow[0]?.last_seen;
      if (raw) {
        lastUpdatedAt = raw instanceof Date ? raw.toISOString() : new Date(raw).toISOString();
      }
    } catch (lastSeenError) {
      console.warn('last_seen_at fallback:', lastSeenError);
    }

    const counts = statusCounts[0] || {
      started_count: '0',
      ended_count: '0',
      active_count: '0',
      passive_count: '0',
      changed_count: '0',
    };

    const prevCounts = prevStatusCounts[0] || {
      started_count: '0',
      ended_count: '0',
      active_count: '0',
      passive_count: '0',
      changed_count: '0',
    };

    // Helper to calculate delta with percentage
    const calcDelta = (current: number, prev: number) => {
      const diff = current - prev;
      const pct = prev > 0 ? Math.round((diff / prev) * 100) : current > 0 ? 100 : 0;
      return { diff, pct, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral' as const };
    };

    const activeDelta = calcDelta(parseInt(counts.active_count || '0', 10), parseInt(prevCounts.active_count || '0', 10));
    const startedDelta = calcDelta(parseInt(counts.started_count || '0', 10), parseInt(prevCounts.started_count || '0', 10));
    const endedDelta = calcDelta(parseInt(counts.ended_count || '0', 10), parseInt(prevCounts.ended_count || '0', 10));
    const changedDelta = calcDelta(parseInt(counts.changed_count || '0', 10), parseInt(prevCounts.changed_count || '0', 10));

    const parsedTopCategories = topCategoriesRaw.map((c) => ({
      category: c.category,
      label: getCategoryLabel(c.category),
      count: parseInt(c.count, 10),
    }));

    const specificTopCategories = parsedTopCategories.filter((item) => !isGenericCategory(item.category));
    const visibleTopCategories = (specificTopCategories.length > 0 ? specificTopCategories : parsedTopCategories).slice(0, 5);
    const totalVisibleCategoryCount = visibleTopCategories.reduce((sum, item) => sum + item.count, 0);

    const result = {
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      startedCount: parseInt(counts.started_count || '0', 10),
      endedCount: parseInt(counts.ended_count || '0', 10),
      activeCount: parseInt(counts.active_count || '0', 10),
      passiveCount: parseInt(counts.passive_count || '0', 10),
      changedCount: parseInt(counts.changed_count || '0', 10),
      // Period comparison deltas (vs previous period of same length)
      deltas: {
        active: activeDelta,
        started: startedDelta,
        ended: endedDelta,
        changed: changedDelta,
      },
      // Previous period dates for reference
      prevPeriodFrom: prevDateFrom.toISOString(),
      prevPeriodTo: prevDateTo.toISOString(),
      topCategories: visibleTopCategories.map((c) => ({
        category: c.category,
        label: c.label,
        count: c.count,
        share: totalVisibleCategoryCount > 0 ? c.count / totalVisibleCategoryCount : 0,
      })),
      topSites: topSites.map((s: { site_name: string; count: string }) => ({
        siteName: s.site_name,
        count: parseInt(s.count, 10),
      })),
      // Wave 1 #1.1: Quick Stats Row için gerçek backed metrikler.
      activeCompetitors,
      lastUpdatedAt,
    };

    return successResponse(result);
  } catch (error) {
    console.error('Report summary API fallback:', error);
    return successResponse({
      dateFrom: new Date(0).toISOString(),
      dateTo: new Date(0).toISOString(),
      startedCount: 0,
      endedCount: 0,
      activeCount: 0,
      passiveCount: 0,
      changedCount: 0,
      deltas: {
        active: { diff: 0, pct: 0, direction: 'neutral' },
        started: { diff: 0, pct: 0, direction: 'neutral' },
        ended: { diff: 0, pct: 0, direction: 'neutral' },
        changed: { diff: 0, pct: 0, direction: 'neutral' },
      },
      prevPeriodFrom: new Date(0).toISOString(),
      prevPeriodTo: new Date(0).toISOString(),
      topCategories: [],
      topSites: [],
      activeCompetitors: 0,
      lastUpdatedAt: null,
      fallback: true,
    });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}
