# RakipAnaliz Dashboard Refactoring Risk Analysis

**Date:** 22 April 2026  
**Dashboard Path:** `apps/dashboard`  
**Tech Stack:** Next.js App Router, TypeScript, TanStack Query, Radix UI, Tailwind CSS

---

## Executive Summary

The dashboard has **no test coverage** — this is the highest risk factor. All planned changes require manual verification. Several hardcoded values and duplication issues exist that could cause subtle regressions.

---

## 1. API Response Shapes

### `/api/competition/route.ts` — Full Response Structure

The endpoint returns this shape (lines 578-594):

```typescript
{
  success: true,
  data: {
    categories: string[],
    sites: { site_id: string; site_name: string; site_code: string }[],
    statsByCategory: CategoryStats[],        // per-site per-category metrics
    siteRankings: SiteRanking[],              // sorted by metric
    bestDeals: BestDeal[],                    // top 20 campaigns with derived dates
    comparisonTable: ComparisonTableEntry[],  // per-category summary
    siteMatrix: Record<string, Record<string, SiteCategoryMatrix>>,
    topByCategory: Record<string, Array<{...}>>,
    gaps: GapItem[],                           // opportunity analysis
  }
}
```

**`comparisonTable` field (lines 398-421):**
```typescript
type ComparisonTableEntry = {
  category: string
  best_site: string           // site_name of leader
  best_site_campaigns: number
  total_sites: number
  total_campaigns: number
  avg_campaigns_per_site: number
}
```

**Gap Analysis fields (lines 433-449):**
```typescript
type GapItem = {
  site_id: string
  site_name: string
  site_code: string
  category: string
  site_campaign_count: number
  leader_site_name: string
  leader_site_code: string
  leader_campaign_count: number
  site_avg_bonus: number
  leader_avg_bonus: number
  campaign_delta: number
  bonus_delta: number
  priority: 'high' | 'medium' | 'low'
  score: number
  reason: 'missing' | 'underbonus' | 'both'
}
```

### `lib/api.ts` — TypeScript Types

```typescript
// Lines 295-355
export interface CompetitionData {
  categories: string[]
  sites: { site_id: string; site_name: string; site_code: string }[]
  siteRankings: {
    site_id: string
    site_name: string
    site_code: string
    total_campaigns: number
    active_campaigns: number
    avg_bonus: number
    total_bonus: number
    categories_count: number
    active_rate: number
    momentum_score: number
    momentum_direction: 'up' | 'down' | 'stable'
    stance?: 'aggressive' | 'neutral' | 'defensive' | 'unknown'
    stance_velocity_delta?: number
    stance_score?: number | null
    stance_updated_at?: string | Date | null
  }[]
  comparisonTable: {
    category: string
    best_site: string
    best_site_campaigns: number
    total_sites: number
    total_campaigns: number
    avg_campaigns_per_site: number
  }[]
  bestDeals: {
    campaign_id: string
    campaign_title: string
    site_name: string
    site_code: string
    category: string
    bonus_amount: number | null
    bonus_percentage: number | null
    status: string
    effective_start: string | Date | null
    effective_end: string | Date | null
    still_active: boolean
  }[]
  siteMatrix: Record<string, Record<string, {
    category: string
    site_name: string
    site_code: string
    campaign_count: number
    avg_score: number
    is_winner: boolean
  }>>
  gaps: GapItem[]
}
```

### `types/index.ts` — All Interfaces

Key interfaces defined: `Site`, `Campaign`, `CampaignNote`, `AIAnalysis`, `CampaignStatusHistory`, `CampaignVersion`, `SimilarCampaign`, `ScrapeRun`, `WeeklyReport`, `WeeklyReportDetail`, `ReportSummary`, `CampaignFilters`, `PaginatedResponse<T>`, `LiveEvent`.

---

## 2. CategoryWinnerWidget Architecture

**File:** `apps/dashboard/components/ui/category-winner.tsx`

### Current Implementation

```typescript
// Lines 10-76: MOCK DATA — hardcoded, no API
const MOCK_CATEGORY_WINNERS = [
  {
    category: 'casino',
    winner: { site_name: 'Bitalih', site_code: 'bitalih', campaign_count: 847, avg_bonus: 12500 },
    runner_up: { site_name: 'Nesine', site_code: 'nesine', campaign_count: 723, avg_bonus: 11200 },
    total_competitors: 11,
  },
  // ... 3 more categories
]

// Lines 164-184: Component — uses MOCK only, no useQuery
export function CategoryWinnerWidget() {
  return (
    <div className="space-y-4">
      {/* Renders MOCK_CATEGORY_WINNERS directly */}
    </div>
  )
}
```

### Key Findings

1. **Does NOT use context:** No React Context consumers
2. **Does NOT use useQuery:** Completely static, no data fetching
3. **Hardcoded MOCK_CATEGORY_WINNERS:** 4 categories with fake data
4. **CategoryWinnerWidget is NOT imported in page.tsx** — grep found 0 matches for `category-winner` or `CategoryWinnerWidget` in page.tsx. This component exists but is NOT currently rendered on the dashboard home page.

### API Data Available for Replacement

The `comparisonTable` from `/api/competition` provides per-category data:
```typescript
{
  category: string
  best_site: string
  best_site_campaigns: number
  total_sites: number
  total_campaigns: number
  avg_campaigns_per_site: number
}
```

**Missing from comparisonTable:** `runner_up` data and `total_competitors`. The API's `siteMatrix` has per-site per-category data that could reconstruct this.

---

## 3. SITE_FRIENDLY_NAMES Usages

Found in **2 locations** (not 3 — SUBAGENT_TODO_PLAN.md incorrectly said 3):

### Location 1: `apps/dashboard/app/page.tsx` (lines 28-41)

```typescript
const SITE_FRIENDLY_NAMES: Record<string, string> = {
  bitalih: 'Bitalih',
  nesine: 'Nesine',
  sondzulyuk: 'Sondüzlük',  // Correct spelling in page.tsx
  bilyoner: 'Bilyoner',
  misli: 'Misli',
  oley: 'Oley',
  hipodrom: 'Hipodrom',
  atyarisi: 'Atyarisi',
  birebin: 'Birebin',
  altiliganyan: 'Altiliganyan',
  ekuri: 'Ekuri',
  '4nala': '4nala',
}
```

**Usages in page.tsx:**
- Line 228: `title={siteCode ? `${SITE_FRIENDLY_NAMES[siteCode] || label}...`
- Line 532: `label={SITE_FRIENDLY_NAMES[site.site_code] || site.site_name}`
- Line 559: `label={SITE_FRIENDLY_NAMES[site.site_code] || site.site_name}`
- Line 610: `SITE_FRIENDLY_NAMES[bestCompetitor?.site_code || '']`

**Backend provides:** `site_name` (e.g., "Bitalih") directly in siteRankings

### Location 2: `apps/dashboard/app/compare/CompareClient.tsx` (lines 20-33)

```typescript
const SITE_FRIENDLY_NAMES: Record<string, string> = {
  bitalih: 'Bitalih',
  nesine: 'Nesine',
  sondzulyuk: 'Sondüzlük',  // Also correct here
  bilyoner: 'Bilyoner',
  misli: 'Misli',
  oley: 'Oley',
  hipodrom: 'Hipodrom',
  atyarisi: 'Atyarisi',
  birebin: 'Birebin',
  altiliganyan: 'Altiliganyan',
  ekuri: 'Ekuri',
  '4nala': '4nala',
}
```

**Problematic usage (line 79):**
```typescript
SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name
```

This is backwards:
1. `c.site?.name` comes from backend as "Bitalih" (proper case)
2. `.toLowerCase()` converts to "bitalih"
3. Then maps through SITE_FRIENDLY_NAMES

**Backend actually provides:** `c.site?.name` directly — no transformation needed. The double-lookup is redundant and fragile.

---

## 4. site-colors.ts Analysis

**File:** `apps/dashboard/lib/site-colors.ts`

```typescript
// Lines 6-22
export const SITE_COLORS: Record<string, string> = {
  bitalih:         '#3b82f6', // blue-500
  hipodrom:        '#ef4444', // red-500
  atyarisi:        '#f59e0b', // amber-500
  misli:           '#10b981', // emerald-500
  sonduzluk:       '#8b5cf6', // violet-500  ← TYPO: should be 'sondzulyuk'
  altiliganyan:    '#ec4899', // pink-500
  ekuri:           '#14b8a6', // teal-500
  '4nala':         '#f97316', // orange-500
  bilyoner:        '#22c55e', // green-500
  birebin:         '#6366f1', // indigo-500
  nesine:          '#a855f7', // purple-500
  oley:            '#0ea5e9', // sky-500
}

// Lines 55
export const PRIORITY_SITES = ['bitalih', 'hipodrom', 'atyarisi'] as const
```

### CRITICAL TYPO: `sonduzluk` vs `sondzulyuk`

In `SITE_COLORS`: `sonduzluk` (typo)  
In `SITE_FRIENDLY_NAMES`: `sondzulyuk` (correct)  

**This mismatch means:**
- If a campaign comes from site with code `sondzulyuk`, `SITE_COLORS['sondzulyuk']` returns `undefined`
- `getSiteColor('sondzulyuk')` falls back to hashed fallback color
- The color won't match the legend

### PRIORITY_SITES Usage (grep across dashboard)

Found in 3 files:
- `lib/site-colors.ts` line 55: definition
- `components/calendar/gantt-chart.tsx` line 8: `compareSitesByPriority`
- `components/calendar/overlap-heatmap.tsx` line 7: `getSiteColorEntries`
- `app/calendar/page.tsx` line 34: `getSiteColor, getSiteColorEntries`

**Used for:** Sorting site legend, Gantt chart ordering, overlap heatmap rows

---

## 5. AI Comparison Panel in page.tsx

**Lines 453-644:** The AI Comparison Panel card

### How it Renders bitalihData and avgCompetitorCampaigns

```typescript
// Lines 316-323
const bitalihData = competitionData?.siteRankings?.find(s => s.site_code === 'bitalih')
const otherSites = competitionData?.siteRankings?.filter(s => s.site_code !== 'bitalih') || []
const avgCompetitorCampaigns = otherSites.length > 0
  ? otherSites.reduce((sum, s) => sum + Number(s.total_campaigns), 0) / otherSites.length
  : 0
const bestCompetitor = otherSites.length > 0
  ? otherSites.reduce((best, s) => (Number(s.avg_bonus || 0) > Number(best?.avg_bonus || 0) ? s : best), otherSites[0])
  : null
```

### What competitionData Actually Contains

From `fetchCompetition()` → `/api/competition`:
```typescript
{
  categories: string[]
  sites: { site_id, site_name, site_code }[]
  siteRankings: SiteRanking[]      // ← used heavily here
  comparisonTable: {...}[]         // NOT used in AI panel
  bestDeals: {...}[]               // NOT used in AI panel
  siteMatrix: {...}                // NOT used in AI panel
  gaps: GapItem[]                  // NOT used in AI panel
}
```

**Key usage:**
- `bitalihData?.total_campaigns` — Bitalih campaign count
- `bitalihData?.avg_bonus` — Bitalih avg bonus
- `bitalihData?.active_rate` — Bitalih active rate
- `otherSites` — all non-bitalih sites
- `avgCompetitorCampaigns` — computed average
- `bestCompetitor` — site with highest avg_bonus

**NOT used from competitionData:** `comparisonTable`, `bestDeals`, `siteMatrix`, `gaps` — these are only used by the CategoryWinnerWidget (which isn't even rendered!)

---

## 6. Test Coverage

### Finding: ZERO test coverage

**No test files found.** Searched for:
- `*.test.ts` — 0 results
- `*.spec.ts` — 0 results
- `__tests__` directories — 0 results
- `vitest` or `jest` in package.json — NOT present

### package.json devDependencies (lines 39-49)

```json
"devDependencies": {
  "@types/node": "^20.11.0",
  "@types/nodemailer": "^7.0.11",
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "autoprefixer": "^10.4.0",
  "eslint": "^8.57.0",
  "eslint-config-next": "^14.2.0",
  "postcss": "^8.4.0",
  "tailwindcss": "^3.4.0",
  "typescript": "^5.4.0"
}
```

**No testing framework.** All planned changes require manual verification.

---

## 7. Risk Analysis by Planned Change

### Batch A-1: CategoryWinnerWidget API Connection

**What could break:**
- Widget renders wrong data if `comparisonTable` structure changes
- Missing `runner_up` data in current API — needs `siteMatrix` reconstruction
- Widget not currently rendered on page.tsx — needs import addition

**Likelihood:** MEDIUM — API structure is stable, but need to reconstruct runner_up from siteMatrix

**How to verify:**
1. Open dashboard home page
2. Find CategoryWinnerWidget section
3. Change date range — widget should update
4. Compare values against competition table on /competition page

**Risk Level:** MEDIUM

---

### Batch A-2: AI Comparison Panel Date Badge

**What could break:**
- Adding date badge with wrong date format
- Existing comparison logic might be affected
- `dateFrom`/`dateTo` might be empty string vs null

**Likelihood:** LOW — purely additive change, existing data flow unchanged

**How to verify:**
1. Set date range to "Bu Hafta" — badge should show "8 - 22 Nis 2026" format
2. Set to "Bu Ay" — badge should show "Nis 2026"
3. All existing metrics should remain unchanged

**Risk Level:** LOW

---

### Batch B-1: SITE_FRIENDLY_NAMES Cleanup

**What could break:**
- `site-colors.ts` typo `sonduzluk` causes color mismatch with code `sondzulyuk`
- CompareClient line 79: removing SITE_FRIENDLY_NAMES might break if `c.site?.name` isn't reliable
- page.tsx line 228: tooltip uses SITE_FRIENDLY_NAMES for display

**Likelihood:** HIGH for typo, MEDIUM for logic

**Current state:**
```typescript
// site-colors.ts line 13: TYPO
sonduzluk: '#8b5cf6'   // Wrong key!

// SITE_FRIENDLY_NAMES has correct key:
sondzulyuk: 'Sondüzlük'
```

**How to verify:**
1. Calendar page — `sondzulyuk` campaigns should show correct violet color
2. If color is wrong (gray fallback), typo is active
3. Compare page — site names should display correctly

**Risk Level:** HIGH for typo fix, but fix itself is trivial (rename key)

---

### Batch B-2: Priority Sites Backend Migration

**What could break:**
- If backend doesn't provide `is_priority`, priority sites won't be highlighted
- `compareSitesByPriority` function depends on hardcoded PRIORITY_SITES
- Calendar components sort by this — removing hardcode without backend causes wrong order

**Likelihood:** MEDIUM — requires backend schema change

**How to verify:**
1. Dashboard calendar — priority sites (bitalih, hipodrom, atyarisi) should appear first
2. Gantt chart — order should be bitalih → hipodrom → atyarisi → alphabetical
3. Check overlap heatmap legend order

**Risk Level:** MEDIUM

---

### Batch C-1: Turkish Month Names (gantt-strip.tsx)

**What could break:**
- MONTHS_TR hardcoded array might be used in other components
- Removing/replacing might cause undefined months

**Likelihood:** LOW — localized change, straightforward replacement

**How to verify:**
1. Open calendar page
2. Check month labels on Gantt strip
3. Should show "Oca", "Şub", "Mar"... using Intl API

**Risk Level:** LOW

---

## 8. Gotchas and Regression Triggers

### Gotcha 1: CategoryWinnerWidget Not Rendered
The component exists at `components/ui/category-winner.tsx` but is **NOT imported in page.tsx**. The TODO plan assumes it's on the page but it isn't. This means:
- Batch A-1 needs to first import the component
- Then connect to API

### Gotcha 2: site-colors.ts Typo
`sondzulyuk` is spelled correctly in SITE_FRIENDLY_NAMES but incorrectly as `sonduzluk` in SITE_COLORS. This causes the Sondüzlük site to get a fallback color (gray) instead of violet (#8b5cf6) on the calendar.

### Gotcha 3: comparisonTable Missing runner_up
The API's `comparisonTable` provides `best_site` and `best_site_campaigns` but NOT the runner-up. To fully replace MOCK_CATEGORY_WINNERS, need to:
1. Use `siteMatrix[category]` to get all sites in category
2. Sort by campaign_count descending
3. Pick [0] as winner, [1] as runner_up

### Gotcha 4: CompareClient Wrong Lookup
```typescript
SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || '']
```
The backend `c.site?.name` already provides proper display name (e.g., "Bitalih"). The `toLowerCase()` + mapping is redundant. However, if `c.site?.name` is ever `null` or malformed, this fallback would break.

### Gotcha 5: Zero Test Coverage
All changes must be verified manually. No regression test suite exists. Each change requires:
1. Manual testing in browser
2. Comparison against expected behavior
3. Edge case testing (empty data, null values, network errors)

---

## 9. Verification Checklist

Before starting refactoring, verify baseline:

- [ ] Dashboard loads without errors at `/`
- [ ] AI Comparison Panel shows bitalihData and competitor comparison
- [ ] Calendar page shows colored Gantt bars
- [ ] Sondüzlük (sondzulyuk) site shows violet color NOT gray fallback
- [ ] Competition page shows comparisonTable data
- [ ] No console errors on any page

---

## Summary Table

| Planned Change | Risk Level | Primary Concern |
|----------------|------------|-----------------|
| Batch A-1: CategoryWinnerWidget API | MEDIUM | Runner-up data reconstruction, component not imported |
| Batch A-2: AI Panel date badge | LOW | Date format localization |
| Batch B-1: SITE_FRIENDLY_NAMES cleanup | HIGH | site-colors.ts typo, CompareClient backward lookup |
| Batch B-2: Priority sites backend | MEDIUM | Requires backend schema change |
| Batch C-1: Turkish month names | LOW | Straightforward Intl API replacement |

**Overall Project Risk: HIGH** — no tests, typo mismatch, component not rendered as assumed.