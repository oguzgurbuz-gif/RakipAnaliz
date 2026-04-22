'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Link from 'next/link'
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorDisplay } from '@/components/ui/error'
import { EmptyState } from '@/components/ui/empty-state'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { SampleBadge } from '@/components/ui/sample-badge'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { useDateRange } from '@/lib/date-range/context'
import { fetchBonusIndex } from '@/lib/api'
import { getCategoryLabel } from '@/lib/category-labels'
import { Crown, TrendingUp, AlertTriangle, ExternalLink, BarChart3 } from 'lucide-react'

const SCOPE = 'insights-bonus'

const LINE_COLORS = [
  '#2563eb',
  '#0f766e',
  '#f59e0b',
  '#dc2626',
  '#8b5cf6',
  '#0891b2',
  '#84cc16',
  '#64748b',
]

function fmtTry(n: number): string {
  return `₺${Math.round(n).toLocaleString('tr-TR')}`
}

function fmtWeekLabel(week: string): string {
  // YYYY-MM-DD → "DD MMM"
  const d = new Date(`${week}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return week
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

export default function BonusIndexPage() {
  const { from, to } = useDateRange(SCOPE)
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['insights', 'bonus-index', from, to, selectedCategory],
    queryFn: () =>
      fetchBonusIndex({
        from: from || undefined,
        to: to || undefined,
        category: selectedCategory || undefined,
      }),
    enabled: Boolean(from && to),
  })

  if (error) {
    return <ErrorDisplay error={error} onRetry={() => refetch()} />
  }

  const hasData = (data?.perCategory?.length ?? 0) > 0
  // Çoklu kategori için lineChart anahtarları (weeklyAll içindeki cat key'leri)
  const lineChartCats = data?.categories ?? []

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Bonus Index"
        description="Pazar genelinde bonus enflasyonu ve outlier kampanyalar."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Yenile
          </Button>
        }
      />

      <main className="p-6 space-y-6">
        <DateRangePickerHeader scope={SCOPE} />

        {/* Kategori filtresi */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">Kategori filtresi:</span>
          <select
            className="border rounded px-3 py-1.5 bg-background"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">Tüm Kategoriler</option>
            {(data?.categories ?? []).map((cat) => (
              <option key={cat} value={cat}>
                {getCategoryLabel(cat)}
              </option>
            ))}
          </select>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <InsightCard
            icon={BarChart3}
            title="Pazar Median"
            value={isLoading ? '—' : fmtTry(data?.kpi.todayMedian ?? 0)}
            description={`Seçili dönem · n=${data?.kpi.sampleSize ?? 0}`}
            tone="info"
          />
          <InsightCard
            icon={Crown}
            title="P90 Bonus"
            value={isLoading ? '—' : fmtTry(data?.kpi.todayP90 ?? 0)}
            description="Üst %10 eşik"
            tone="positive"
          />
          <InsightCard
            icon={AlertTriangle}
            title="Outlier"
            value={isLoading ? '—' : data?.kpi.outlierCount ?? 0}
            description="P90'ı %50+ aşan kampanya"
            tone="warning"
          />
        </div>

        {/* Tablo: kategori başına */}
        <Card>
          <CardHeader>
            <SectionHeader
              title="Kategori Başına Median + Sparkline"
              description="P90 = üst %10 eşik. Outlier = P90'ı %50 aşan kampanya. Sparkline son 8 hafta median."
            />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !hasData ? (
              <EmptyState
                icon={BarChart3}
                title="Bu aralıkta yeterli bonus verisi yok"
                description="Tarih aralığını genişletin veya kategori filtresini kaldırın."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Kategori</th>
                      <th className="py-2 pr-4 font-medium text-right">Median</th>
                      <th className="py-2 pr-4 font-medium text-right">P90</th>
                      <th className="py-2 pr-4 font-medium text-right">Outlier</th>
                      <th className="py-2 pr-4 font-medium">n</th>
                      <th className="py-2 pr-4 font-medium">Son 8 Hafta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.perCategory.map((row) => (
                      <tr key={row.category} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 pr-4 font-medium">{getCategoryLabel(row.category)}</td>
                        <td className="py-2 pr-4 text-right">{fmtTry(row.median)}</td>
                        <td className="py-2 pr-4 text-right">{fmtTry(row.p90)}</td>
                        <td className="py-2 pr-4 text-right">
                          {row.outlierCount > 0 ? (
                            <Badge
                              variant="outline"
                              className="border-orange-300 bg-orange-50 text-orange-700"
                            >
                              {row.outlierCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <SampleBadge n={row.sampleSize} compact />
                          {row.sampleSize > 15 && (
                            <span className="text-xs text-muted-foreground">{row.sampleSize}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 w-32">
                          <Sparkline data={row.sparkline} color={LINE_COLORS[0]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Outliers */}
        <Card>
          <CardHeader>
            <SectionHeader
              title="Top Outlier Kampanyalar"
              description="P90 eşiğini aşan en yüksek 5 bonus."
            />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (data?.topOutliers?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Bu dönemde outlier kampanya yok.</p>
            ) : (
              <ul className="space-y-2">
                {data!.topOutliers.map((o) => (
                  <li
                    key={o.campaignId}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-background/60 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/campaigns/${o.campaignId}`}
                        className="text-sm font-medium hover:text-primary hover:underline flex items-center gap-1"
                      >
                        <span className="truncate">{o.title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                      </Link>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {o.siteName} · {getCategoryLabel(o.category)}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-emerald-300 bg-emerald-50 text-emerald-700 font-semibold"
                    >
                      {fmtTry(o.bonusAmount)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Trend grafiği */}
        <Card>
          <CardHeader>
            <SectionHeader
              title="Bonus Enflasyonu Trendi"
              description="Son 8 hafta — kategori başına median bonus."
            />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (data?.weeklyAll?.length ?? 0) < 2 || lineChartCats.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Trend grafiği için yeterli haftalık veri yok"
                description="Son 8 hafta içinde en az iki dolu hafta gereklidir."
              />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data!.weeklyAll}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" tickFormatter={fmtWeekLabel} />
                  <YAxis tickFormatter={(v) => `₺${v}`} />
                  <Tooltip
                    formatter={(value) => fmtTry(Number(value ?? 0))}
                    labelFormatter={(label) => fmtWeekLabel(String(label))}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '8px', fontSize: '12px' }}
                    formatter={(v) => getCategoryLabel(String(v))}
                  />
                  {lineChartCats.slice(0, 8).map((cat, idx) => (
                    <Line
                      key={cat}
                      type="monotone"
                      dataKey={cat}
                      stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

/**
 * Hücre içi mini AreaChart — recharts ile sade, axis'siz.
 * `data` boşsa veya tüm değerler 0 ise "—" gösterir.
 */
function Sparkline({
  data,
  color,
}: {
  data: { week: string; median: number }[]
  color: string
}) {
  const hasNonZero = data.some((d) => d.median > 0)
  if (!hasNonZero) return <span className="text-xs text-muted-foreground">—</span>

  return (
    <div className="h-8 w-32">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="median"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#spark-fill)"
            isAnimationActive={false}
          />
          <Tooltip
            formatter={(v) => fmtTry(Number(v ?? 0))}
            labelFormatter={(label) => fmtWeekLabel(String(label))}
            contentStyle={{ fontSize: 11, padding: '4px 6px' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
