'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, ResponsiveContainer } from 'recharts'

interface SiteData {
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
}

interface RadarChartProps {
  sites: SiteData[]
  isLoading?: boolean
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

// All axes are normalized to a 0-100 scale so different sites can be compared
// fairly regardless of underlying unit (campaign count vs. TL bonus etc).
// Normalization strategy:
//   - bonus, campaign frequency, total bonus → divide by the max across sites
//   - diversity → categories_count / total_unique_categories
//   - active rate → already 0-1, multiplied by 100
//   - momentum → already a percentage, mapped from [-100,100] to [0,100]
type AxisDef = {
  key: string
  label: string
  // Compute the raw value for a single site.
  value: (d: SiteData) => number
  // Normalization mode controls how we scale the raw value into 0-100.
  normalize:
    | { type: 'max-of-sites'; cap?: number }
    | { type: 'static-max'; max: number }
    | { type: 'momentum' }
}

const AXES: AxisDef[] = [
  {
    key: 'bonus',
    label: 'Ortalama Bonus',
    value: (d) => Number(d.avg_bonus) || 0,
    normalize: { type: 'max-of-sites' },
  },
  {
    key: 'frequency',
    label: 'Kampanya Hacmi',
    value: (d) => Number(d.total_campaigns) || 0,
    normalize: { type: 'max-of-sites' },
  },
  {
    key: 'diversity',
    label: 'Çeşitlilik',
    value: (d) => Number(d.categories_count) || 0,
    normalize: { type: 'max-of-sites' },
  },
  {
    key: 'active',
    label: 'Aktif Oranı',
    value: (d) => Number(d.active_rate) || 0,
    // active_rate is in [0,1] — multiply by 100 to get a percent.
    normalize: { type: 'static-max', max: 1 },
  },
  {
    key: 'momentum',
    label: 'Momentum',
    value: (d) => Number(d.momentum_score) || 0,
    normalize: { type: 'momentum' },
  },
]

function computeMaxes(sites: SiteData[]): Record<string, number> {
  const maxes: Record<string, number> = {}
  for (const axis of AXES) {
    if (axis.normalize.type !== 'max-of-sites') continue
    let max = 0
    for (const s of sites) {
      const v = axis.value(s)
      if (Number.isFinite(v) && v > max) max = v
    }
    maxes[axis.key] = max
  }
  return maxes
}

function normalize(axis: AxisDef, raw: number, maxes: Record<string, number>): number {
  if (!Number.isFinite(raw)) return 0
  if (axis.normalize.type === 'static-max') {
    const max = axis.normalize.max
    if (max <= 0) return 0
    return Math.max(0, Math.min(100, (raw / max) * 100))
  }
  if (axis.normalize.type === 'momentum') {
    // momentum_score is roughly in [-100, 100]; map to [0, 100].
    return Math.max(0, Math.min(100, (raw + 100) / 2))
  }
  // max-of-sites
  const max = maxes[axis.key] ?? 0
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (raw / max) * 100))
}

export function RadarChartComponent({ sites, isLoading }: RadarChartProps) {
  const [selectedSites, setSelectedSites] = useState<string[]>([])

  const toggleSite = (siteId: string) => {
    setSelectedSites(prev => {
      if (prev.includes(siteId)) {
        return prev.filter(id => id !== siteId)
      }
      if (prev.length >= 3) {
        return [...prev.slice(1), siteId]
      }
      return [...prev, siteId]
    })
  }

  // Pre-compute per-axis maxes across all sites so that normalization is
  // stable as users toggle the selection (axis scale must not depend on
  // which sites happen to be active in the chart).
  const maxes = useMemo(() => computeMaxes(sites), [sites])

  const chartData = useMemo(() => {
    return AXES.map(axis => {
      const point: Record<string, number | string> = {
        axis: axis.label,
      }
      selectedSites.forEach(siteId => {
        const site = sites.find(s => s.site_id === siteId)
        if (site) {
          point[site.site_name] = Math.round(normalize(axis, axis.value(site), maxes) * 10) / 10
        }
      })
      return point
    })
  }, [selectedSites, sites, maxes])

  const activeSites = sites.filter(s => selectedSites.includes(s.site_id))

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Radar Karşılaştırma</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Radar Karşılaştırma</CardTitle>
            <Badge variant="outline" className="text-xs">0–100 normalize</Badge>
          </div>
          <Badge variant="outline" className="text-xs">
            En fazla 3 site seçin
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Site Selection */}
        <div className="flex flex-wrap gap-2">
          {sites.slice(0, 8).map((site, idx) => {
            const isSelected = selectedSites.includes(site.site_id)
            return (
              <button
                key={site.site_id}
                onClick={() => toggleSite(site.site_id)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-border'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1.5"
                  style={{ backgroundColor: isSelected ? '#fff' : COLORS[idx % COLORS.length] }}
                />
                {site.site_name}
              </button>
            )
          })}
        </div>

        {/* Chart */}
        {selectedSites.length > 0 ? (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData}>
                <PolarGrid stroke="#e5e5e5" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                {activeSites.map((site, idx) => (
                  <Radar
                    key={site.site_id}
                    name={site.site_name}
                    dataKey={site.site_name}
                    stroke={COLORS[idx % COLORS.length]}
                    fill={COLORS[idx % COLORS.length]}
                    fillOpacity={0.2}
                  />
                ))}
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-muted-foreground text-sm">
            Karşılaştırmak için site seçin
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Tüm eksenler 0–100 ölçeğinde normalize edildi. Bonus, hacim ve çeşitlilik
          eksenleri o eksenin maksimum değerine; aktif oranı 100&apos;e; momentum ise
          [-100,100] aralığından [0,100] aralığına eşlendi.
        </p>
      </CardContent>
    </Card>
  )
}

export default RadarChartComponent
