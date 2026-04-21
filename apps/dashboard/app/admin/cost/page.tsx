'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { useDateRange } from '@/lib/date-range/context'
import { Loader2, RefreshCw, DollarSign, Activity, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchAdminCost, type AiCostDashboardData } from '@/lib/api'

function formatUsd(usd: number): string {
  if (usd === 0) return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(6)}`
  if (usd < 1) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('tr-TR')
}

function shortDate(value: string): string {
  try {
    const d = new Date(value)
    return `${d.getMonth() + 1}/${d.getDate()}`
  } catch {
    return value
  }
}

/**
 * "Geçen Ay" için bir önceki takvim ayı sınırlarını local TZ'de döner.
 */
function getLastMonthRange(now: Date = new Date()): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last = new Date(now.getFullYear(), now.getMonth(), 0) // önceki ayın son günü
  const fmt = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return { from: fmt(first), to: fmt(last) }
}

function isLastMonthSelected(from: string, to: string): boolean {
  if (!from || !to) return false
  const r = getLastMonthRange()
  return r.from === from && r.to === to
}

export default function AdminCostPage() {
  const { from, to, applyPreset, setRange, preset } = useDateRange('admin-cost')

  const { data, isLoading, refetch, isFetching } = useQuery<AiCostDashboardData>({
    queryKey: ['admin-cost', { from, to }],
    queryFn: () => fetchAdminCost(from || undefined, to || undefined),
    refetchInterval: 60000,
  })

  const cost = data
  const hasData = !!cost && cost.daily.length > 0
  const lastMonthSelected = isLastMonthSelected(from, to)

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="AI Maliyeti"
        description={
          cost
            ? `Seçili dönem: ${from || '-'} → ${to || '-'} · ${cost.windowDays} gün`
            : 'DeepSeek (ve diğer model) token kullanımı ve USD maliyeti.'
        }
        actions={
          <div className="flex items-center gap-3">
            {cost && (
              <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Toplam (Seçili Dönem)
                </span>
                <span className="text-2xl font-bold tabular-nums text-emerald-600">
                  {formatUsd(cost.totals.usd)}
                </span>
              </div>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        }
      />

      <main className="space-y-6 p-6">
        {/* Global tarih aralığı + sayfa-spesifik hızlı erişim chip'leri.
            "Bu Ay" = thisMonth preset; "Geçen Ay" custom range setRange ile. */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[280px]">
            <DateRangePickerHeader scope="admin-cost" />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => applyPreset('thisMonth')}
              aria-pressed={preset === 'thisMonth'}
              className={cn(
                'inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium transition-colors',
                'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                preset === 'thisMonth' &&
                  'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
              )}
            >
              Bu Ay
            </button>
            <button
              type="button"
              onClick={() => {
                const r = getLastMonthRange()
                setRange(r.from, r.to)
              }}
              aria-pressed={lastMonthSelected}
              className={cn(
                'inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium transition-colors',
                'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                lastMonthSelected &&
                  'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
              )}
            >
              Geçen Ay
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !hasData ? (
          <EmptyState
            icon={Activity}
            title="Veri yok"
            description="Seçili dönem için campaign_ai_analyses kaydı bulunamadı."
          />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    Toplam ({cost!.windowDays}g)
                  </div>
                  <div className="text-2xl font-bold">{formatUsd(cost!.totals.usd)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Activity className="h-4 w-4" />
                    Çağrı Sayısı
                  </div>
                  <div className="text-2xl font-bold">{formatNumber(cost!.totals.calls)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    Input Token
                  </div>
                  <div className="text-2xl font-bold">{formatNumber(cost!.totals.inTokens)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    Output Token
                  </div>
                  <div className="text-2xl font-bold">{formatNumber(cost!.totals.outTokens)}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <SectionHeader
                  title="Günlük Maliyet (USD)"
                  description={`DeepSeek pricing: $${cost!.pricing.defaultInputPerMillionUSD}/M input · $${cost!.pricing.defaultOutputPerMillionUSD}/M output`}
                />
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={cost!.daily} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={shortDate} />
                    <YAxis tickFormatter={(v) => formatUsd(Number(v))} width={80} />
                    <Tooltip
                      labelFormatter={(value) => new Date(String(value)).toLocaleDateString('tr-TR')}
                      formatter={(value, name) => {
                        const num = Number(value ?? 0)
                        const label = String(name ?? '')
                        if (label === 'USD') return [formatUsd(num), 'USD']
                        return [formatNumber(num), label]
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="usd"
                      name="USD"
                      stroke="#059669"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionHeader
                  title="Günlük Token Hacmi"
                  description="Input vs Output token sayısı."
                />
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={cost!.daily} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tickFormatter={shortDate} />
                    <YAxis tickFormatter={(v) => formatNumber(Number(v))} width={80} />
                    <Tooltip
                      labelFormatter={(value) => new Date(String(value)).toLocaleDateString('tr-TR')}
                      formatter={(value) => formatNumber(Number(value ?? 0))}
                    />
                    <Legend />
                    <Bar dataKey="inTokens" name="Input" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outTokens" name="Output" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionHeader title="Model Kırılımı" description="Provider/model bazında seçili dönem toplamı." />
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Çağrı</TableHead>
                      <TableHead className="text-right">Input Token</TableHead>
                      <TableHead className="text-right">Output Token</TableHead>
                      <TableHead className="text-right">Toplam (USD)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cost!.byModel.map((row) => (
                      <TableRow key={`${row.modelProvider}::${row.modelName}`}>
                        <TableCell>{row.modelProvider}</TableCell>
                        <TableCell className="font-mono text-xs">{row.modelName}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.calls)}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.inTokens)}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.outTokens)}</TableCell>
                        <TableCell className="text-right font-medium">{formatUsd(row.usd)}</TableCell>
                      </TableRow>
                    ))}
                    {cost!.byModel.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                          Veri yok
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionHeader
                  title="En Maliyetli 10 Analiz"
                  description="Seçili dönem içindeki en yüksek toplam token kullanan analizler."
                />
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Kampanya</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Input</TableHead>
                      <TableHead className="text-right">Output</TableHead>
                      <TableHead className="text-right">Süre (ms)</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cost!.topAnalyses.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString('tr-TR')}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs">
                          {row.campaignTitle ?? row.campaignId}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.modelProvider} / <span className="font-mono">{row.modelName}</span>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(row.inTokens)}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.outTokens)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {row.durationMs ?? '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatUsd(row.usd)}</TableCell>
                      </TableRow>
                    ))}
                    {cost!.topAnalyses.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                          Veri yok
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
