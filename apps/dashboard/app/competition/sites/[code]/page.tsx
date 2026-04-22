'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts'
import { ArrowLeft, Calendar, Crown, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { BonusChips } from '@/components/ui/bonus-chips'
import { formatEffectiveBonus } from '@/lib/campaign-presentation'
import { MomentumBadge, MomentumStaleBadge } from '@/components/competition/competition-grid'
import { StanceBadge, formatStanceTooltip } from '@/components/ui/stance-badge'
import { getCategoryLabel } from '@/lib/category-labels'
import { cn } from '@/lib/utils'
import { fetchSiteProfile } from '@/lib/api'
import type { SiteProfileCategoryRow } from '@/lib/api'
import { useDateRange } from '@/lib/date-range/context'
import { PRESET_LABELS } from '@/lib/date-range/presets'

const COMPETITION_SCOPE = 'competition'

/**
 * "1 Nisan - 30 Nisan 2026" şeklinde insan-okur etiket üretir. `from`/`to`
 * YYYY-MM-DD; aynı yıldaysa yıl tek sefer gösterilir.
 */
function formatRangeLabel(from: string, to: string): string {
  if (!from || !to) return ''
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map((v) => parseInt(v, 10))
    if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null
    return new Date(y, m - 1, d)
  }
  const f = parse(from)
  const t = parse(to)
  if (!f || !t) return ''
  const sameYear = f.getFullYear() === t.getFullYear()
  const fmtDay = (d: Date, withYear: boolean) =>
    d.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    })
  if (from === to) return fmtDay(f, true)
  return `${fmtDay(f, !sameYear)} – ${fmtDay(t, true)}`
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function bonusVsLeaderTone(row: SiteProfileCategoryRow): string {
  if (row.is_leader) return 'text-yellow-700'
  if (row.leader_avg_bonus <= 0) return 'text-muted-foreground'
  const ratio = row.avg_bonus / row.leader_avg_bonus
  if (ratio >= 0.9) return 'text-green-600'
  if (ratio >= 0.5) return 'text-amber-600'
  return 'text-red-600'
}

export default function SiteProfilePage({ params }: { params: { code: string } }) {
  const { code } = params

  // /competition ile aynı `competition` scope'unu paylaşır — kullanıcının
  // ana sayfada seçtiği aralık burada da geçerli olsun. Default 'thisMonth'.
  const { from: dateFrom, to: dateTo, preset } = useDateRange(COMPETITION_SCOPE)

  const presetLabel = preset !== 'custom' ? PRESET_LABELS[preset] : 'Özel'
  const rangeLabel = formatRangeLabel(dateFrom, dateTo)

  const { data, isLoading, error } = useQuery({
    queryKey: ['site-profile', code, dateFrom, dateTo],
    queryFn: () => fetchSiteProfile(code, { from: dateFrom, to: dateTo }),
    enabled: Boolean(dateFrom && dateTo),
  })

  const site = data?.site ?? null
  const heatmap = data?.categoryHeatmap ?? []
  const activeCampaigns = data?.activeCampaigns ?? []
  const timeline = data?.momentumTimeline ?? []

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title={site?.site_name ?? code}
        description={site ? `Site kodu: ${site.site_code}` : 'Site profili yükleniyor…'}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/competition"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Rekabet Sayfasına Dön
            </Link>
            {site?.base_url && (
              <a
                href={site.base_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                {site.base_url} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        }
      >
        {site && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <MomentumBadge direction={site.momentum_direction} score={site.momentum_score} />
            <MomentumStaleBadge updatedAt={site.momentum_updated_at} />
            <StanceBadge
              stance={site.stance}
              velocityDelta={site.stance_velocity_delta}
              tooltip={formatStanceTooltip({
                stance: site.stance,
                velocityDelta: site.stance_velocity_delta,
                stanceScore: site.stance_score,
                last7dCount: site.momentum_last_7_days,
                updatedAt: site.stance_updated_at,
              })}
            />
            <Badge variant="outline" className="text-xs">
              Son scrape: {formatDateTime(site.last_scraped_at)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {site.total_campaigns} kampanya
            </Badge>
            <Badge variant="success" className="text-xs">
              {site.active_campaigns} aktif
            </Badge>
            <Badge variant="info" className="text-xs">
              {site.categories_count} kategori
            </Badge>
            <Badge variant="warning" className="text-xs">
              Ort. ₺{Number(site.avg_bonus).toFixed(0)}
            </Badge>
          </div>
        )}
      </PageHeader>

      <main className="p-6 space-y-6">
        {/* Tarih aralığı header'ı + karşılaştırma dönemi etiketi.
            Momentum timeline tarihten bağımsızdır (her zaman son 8 hafta). */}
        <div className="space-y-2">
          <DateRangePickerHeader scope={COMPETITION_SCOPE} />
          {rangeLabel && (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                Karşılaştırma dönemi:{' '}
                <span className="font-medium text-foreground">{presetLabel}</span>
                <span className="ml-1">({rangeLabel})</span>
              </span>
            </div>
          )}
        </div>

        {error && (
          <Card>
            <CardContent className="p-6 text-sm text-red-600">
              Site profili yüklenirken bir hata oluştu.
            </CardContent>
          </Card>
        )}

        {!isLoading && !site && !error && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Bu site için veri bulunamadı: <span className="font-mono">{code}</span>
            </CardContent>
          </Card>
        )}

        {/* Top stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-normal">
                Toplam Kampanya
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{site?.total_campaigns ?? '—'}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-normal">
                Aktif Kampanya
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {site?.active_campaigns ?? '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                {site ? `${(site.active_rate * 100).toFixed(1)}% aktif` : ''}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-normal">
                Ortalama Bonus
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                ₺{site ? Number(site.avg_bonus).toFixed(0) : '—'}
              </div>
              <div className="text-xs text-muted-foreground">
                Toplam ₺{site ? Number(site.total_bonus).toLocaleString('tr-TR') : '—'}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground font-normal">
                Son 7 / Önceki 7 Gün
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {site?.momentum_last_7_days ?? '—'}{' '}
                <span className="text-base text-muted-foreground">/</span>{' '}
                {site?.momentum_prev_7_days ?? '—'}
              </div>
              <div className="text-xs text-muted-foreground">Yeni kampanya</div>
            </CardContent>
          </Card>
        </div>

        {/* Momentum timeline */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Momentum Geçmişi (Son 8 Hafta)</CardTitle>
              <Badge variant="outline" className="text-xs">
                first_seen_at sayımından türetildi
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 bg-muted animate-pulse rounded" />
            ) : timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Yeterli geçmiş veri yok.
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis dataKey="week_label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[-100, 100]} />
                    <Tooltip
                      formatter={(value: unknown, key: unknown): [string, string] => {
                        const num = typeof value === 'number' ? value : Number(value) || 0
                        const k = typeof key === 'string' ? key : String(key)
                        if (k === 'score') return [`${num}%`, 'Momentum']
                        if (k === 'new_campaigns') return [String(num), 'Yeni Kampanya']
                        return [String(num), k]
                      }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="new_campaigns"
                      stroke="#22c55e"
                      strokeWidth={1.5}
                      dot={{ r: 2 }}
                      strokeDasharray="4 2"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category heatmap */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kategori Performansı</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-40 bg-muted animate-pulse rounded" />
            ) : heatmap.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Bu site için kategori verisi yok.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Sıra</TableHead>
                    <TableHead className="text-right">Kampanya</TableHead>
                    <TableHead className="text-right">Aktif</TableHead>
                    <TableHead className="text-right">Ort. Bonus</TableHead>
                    <TableHead className="text-right">Lider Bonus</TableHead>
                    <TableHead>Lider</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {heatmap.map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="font-medium">
                        {getCategoryLabel(row.category)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            'inline-flex min-w-[44px] items-center justify-center rounded px-2 py-0.5 text-xs font-semibold',
                            row.rank === 1 && 'bg-yellow-100 text-yellow-800',
                            row.rank === 2 && 'bg-gray-100 text-gray-700',
                            row.rank === 3 && 'bg-orange-100 text-orange-800',
                            row.rank > 3 && 'bg-muted text-muted-foreground'
                          )}
                        >
                          #{row.rank} / {row.total_sites}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.campaign_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">
                        {row.active_count}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums font-mono',
                          bonusVsLeaderTone(row)
                        )}
                      >
                        ₺{Math.round(row.avg_bonus).toLocaleString('tr-TR')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                        ₺{Math.round(row.leader_avg_bonus).toLocaleString('tr-TR')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs">
                          {row.is_leader ? (
                            <>
                              <Crown className="h-3 w-3 text-yellow-500" />
                              <span className="font-medium">Bu site</span>
                            </>
                          ) : (
                            <>
                              <Crown className="h-3 w-3 text-muted-foreground" />
                              <Link
                                href={`/competition/sites/${row.leader_site_code}`}
                                className="hover:underline text-muted-foreground"
                              >
                                {row.leader_site_name}
                              </Link>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Active campaigns */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Aktif Kampanyalar</CardTitle>
              <Badge variant="outline" className="text-xs">
                {activeCampaigns.length} kampanya
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-40 bg-muted animate-pulse rounded" />
            ) : activeCampaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Bu sitede şu anda aktif kampanya yok.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kampanya</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Bonus</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Aktif Olduğu Dönem</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeCampaigns.map((c) => {
                    // Tooltip için ham landing-page tarihlerini de göster ki
                    // "neden 2023?" sorusu çözülsün. Primary tarih artık
                    // effective_start/effective_end (scrape gözleminden türev).
                    const rawHint =
                      c.valid_from || c.valid_to
                        ? `Landing'de yazan: ${formatDate(c.valid_from)} → ${formatDate(
                            c.valid_to
                          )}`
                        : ''
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            href={`/campaigns/${c.id}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {c.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {c.category ? (
                            <Badge variant="outline" className="text-xs">
                              {getCategoryLabel(c.category)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {/* BonusChips için synthetic ai_analysis shape; API
                              alanlarını ham metadata'ya çevirip geçiriyoruz. */}
                          <BonusChips
                            campaign={{
                              metadata: {
                                ai_analysis: {
                                  extractedTags: {
                                    bonus_amount: c.bonus_amount,
                                    bonus_percentage: c.bonus_percentage,
                                    min_deposit: c.min_deposit ?? null,
                                    max_bonus: c.max_bonus ?? null,
                                    turnover: c.turnover ?? null,
                                  },
                                },
                              },
                            }}
                            compact
                            showEffective={false}
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {(() => {
                            // turnover string -> parse multiplier (BonusChips de
                            // aynı parser'ı kullanır).
                            const m = c.turnover
                              ? Number((c.turnover.match(/(\d+(?:\.\d+)?)/) || [])[1])
                              : null
                            const mult = m && Number.isFinite(m) && m > 0 ? m : null
                            const label = formatEffectiveBonus(c.bonus_amount, mult)
                            if (!label) return <span className="text-muted-foreground">—</span>
                            return (
                              <span
                                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                                title={
                                  mult
                                    ? `Çevrim sonrası tahmin (${mult}x)`
                                    : 'Çevrim verisi yok, raw bonus gösteriliyor'
                                }
                              >
                                {label}
                              </span>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-xs" title={rawHint}>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-foreground">
                              {formatDate(c.effective_start)}
                              <span className="mx-1 text-muted-foreground">→</span>
                              {c.still_active ? (
                                <span className="text-muted-foreground">devam ediyor</span>
                              ) : (
                                formatDate(c.effective_end)
                              )}
                            </span>
                            {rawHint && (
                              <span className="text-[10px] text-muted-foreground/70">
                                {rawHint}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.still_active ? (
                            <Badge variant="success" className="text-xs">
                              Devam ediyor
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Sona ermiş
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
