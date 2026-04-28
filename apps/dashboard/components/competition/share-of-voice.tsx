'use client'

import { useMemo } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { Crown } from 'lucide-react'
import { formatCurrency, formatCurrencyCompact, formatNumber } from '@/lib/format/currency'
import { getSiteDisplayName } from '@/lib/i18n/site'
import { METRIC_TOOLTIPS } from '@/lib/i18n/metric-tooltips'

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

interface ShareOfVoiceProps {
  sites: SiteData[]
  isLoading?: boolean
}

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#6b7280', '#ec4899', '#06b6d4']

type Mode = 'campaigns' | 'bonus'

interface ViewItem {
  name: string
  value: number
  percentage: string
  fill: string
  isLeader: boolean
}

function buildView(sites: SiteData[], mode: Mode): ViewItem[] {
  if (!sites.length) return []

  const accessor = (s: SiteData) =>
    mode === 'campaigns' ? Number(s.total_campaigns) || 0 : Number(s.total_bonus) || 0

  const sorted = [...sites].sort((a, b) => accessor(b) - accessor(a))
  const total = sorted.reduce((sum, s) => sum + accessor(s), 0)
  const top5 = sorted.slice(0, 5)
  const others = sorted.slice(5)
  const othersTotal = others.reduce((sum, s) => sum + accessor(s), 0)

  const items: ViewItem[] = top5.map((site, idx) => {
    const value = accessor(site)
    return {
      // FE-8: Site adında merkezi i18n helper kullan; DB'den gelen `name`
      // tercih edilir, fallback olarak code → Title Case.
      name: getSiteDisplayName(site.site_code, site.site_name),
      value,
      percentage: total > 0 ? ((value / total) * 100).toFixed(1) : '0',
      fill: COLORS[idx % COLORS.length],
      isLeader: idx === 0,
    }
  })

  if (othersTotal > 0) {
    items.push({
      name: 'Diğerleri',
      value: othersTotal,
      percentage: total > 0 ? ((othersTotal / total) * 100).toFixed(1) : '0',
      fill: COLORS[5],
      isLeader: false,
    })
  }

  return items
}

function ShareView({ items, mode }: { items: ViewItem[]; mode: Mode }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Veri bulunamadı.
      </p>
    )
  }

  const totalValue = items.reduce((sum, i) => sum + i.value, 0)
  // FE-8: ₺ format'ı merkezi `lib/format/currency` üzerinden — locale tutarlı,
  // K/M kısaltması ortak helper'dan.
  const formatValue = (v: number) =>
    mode === 'campaigns' ? `${formatNumber(v)} kampanya` : formatCurrencyCompact(v)
  const tooltipFormatter = (value: unknown): [string, string] => {
    const v = typeof value === 'number' ? value : Number(value) || 0
    return [formatValue(v), mode === 'campaigns' ? 'Kampanya Sayısı' : 'Toplam Bonus']
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold">{items.length}</div>
          <div className="text-xs text-muted-foreground">Görünen Site</div>
        </div>
        <div>
          <div className="text-2xl font-bold">
            {mode === 'campaigns' ? formatNumber(totalValue) : formatCurrencyCompact(totalValue)}
          </div>
          <div className="text-xs text-muted-foreground">
            Toplam {mode === 'campaigns' ? 'Kampanya' : 'Bonus'}
          </div>
        </div>
        <div>
          {/* FE-9: % "Lider Payı" → mode'a göre map'ten context tooltip. */}
          <div
            className="text-2xl font-bold cursor-help"
            title={
              mode === 'campaigns'
                ? METRIC_TOOLTIPS['leader_share.campaigns']
                : METRIC_TOOLTIPS['leader_share.bonus']
            }
          >
            {items[0]?.percentage || '0'}%
          </div>
          <div className="text-xs text-muted-foreground">Lider Payı</div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} layout="vertical">
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) =>
                mode === 'bonus' ? formatCurrencyCompact(Number(v)) : formatNumber(Number(v))
              }
            />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
            <Tooltip formatter={tooltipFormatter} contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {items.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={item.name} className="flex items-center gap-3 text-sm">
            <span className="w-4 text-muted-foreground">{idx + 1}</span>
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: item.fill }}
            />
            <span className="flex-1 font-medium truncate">{item.name}</span>
            <span className="text-muted-foreground tabular-nums">{formatValue(item.value)}</span>
            <span className="font-semibold tabular-nums w-14 text-right">{item.percentage}%</span>
            {item.isLeader && <Crown className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ShareOfVoice({ sites, isLoading }: ShareOfVoiceProps) {
  const campaignsView = useMemo(() => buildView(sites, 'campaigns'), [sites])
  const bonusView = useMemo(() => buildView(sites, 'bonus'), [sites])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pazar Hakimiyeti</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-base">Pazar Hakimiyeti</CardTitle>
          {campaignsView[0] && (
            <Badge variant="winner" className="text-xs">
              <Crown className="h-3 w-3 mr-1" />
              Hacim Lideri: {campaignsView[0].name}
            </Badge>
          )}
          {bonusView[0] && (
            <Badge variant="winner" className="text-xs">
              <Crown className="h-3 w-3 mr-1" />
              Bonus Lideri: {bonusView[0].name}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs.Root defaultValue="campaigns" className="w-full">
          <Tabs.List
            aria-label="Pazar payı görünümü"
            className="inline-flex h-9 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground mb-4"
          >
            <Tabs.Trigger
              value="campaigns"
              className="inline-flex items-center justify-center whitespace-nowrap rounded px-3 py-1 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Kampanya Hacmi
            </Tabs.Trigger>
            <Tabs.Trigger
              value="bonus"
              className="inline-flex items-center justify-center whitespace-nowrap rounded px-3 py-1 text-xs font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Bonus Ağırlıklı
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="campaigns" className="focus-visible:outline-none">
            <ShareView items={campaignsView} mode="campaigns" />
          </Tabs.Content>
          <Tabs.Content value="bonus" className="focus-visible:outline-none">
            <ShareView items={bonusView} mode="bonus" />
          </Tabs.Content>
        </Tabs.Root>
      </CardContent>
    </Card>
  )
}

export default ShareOfVoice
