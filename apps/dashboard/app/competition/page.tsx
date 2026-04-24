'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { Crown, Target, TrendingUp, ChevronDown, ChevronUp, Calendar } from 'lucide-react'
import { MomentumBadge } from '@/components/competition/competition-grid'
import { StanceBadge, formatStanceTooltip } from '@/components/ui/stance-badge'
import { SampleBadge } from '@/components/ui/sample-badge'
import { BonusChips } from '@/components/ui/bonus-chips'
import { RadarChartComponent } from '@/components/competition/radar-chart'
import { GapAnalysis } from '@/components/competition/gap-analysis'
import { ShareOfVoice } from '@/components/competition/share-of-voice'
import { PositioningMap } from '@/components/competition/positioning-map'
import { getCategoryLabel } from '@/lib/category-labels'
import { cn } from '@/lib/utils'
import { fetchCompetition } from '@/lib/api'
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

export default function CompetitionPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [selectedCategory, setSelectedCategory] = useState(searchParams?.get('category') || '')
  // Default açık: önceden kapalıydı ve kullanıcı scroll etmezse bu iki tabloyu
  // (Tür Bazlı Karşılaştırma + Site vs Site Matrisi) hiç görmüyordu.
  const [showMatrix, setShowMatrix] = useState(true)
  const [showBonusTable, setShowBonusTable] = useState(true)

  // Global tarih aralığı — `competition` scope'u, default 'thisMonth'.
  // Cookie + URL ile persist edilir.
  const { from: dateFrom, to: dateTo, preset } = useDateRange(COMPETITION_SCOPE)

  const presetLabel =
    preset !== 'custom' ? PRESET_LABELS[preset] : 'Özel'
  const rangeLabel = formatRangeLabel(dateFrom, dateTo)

  const { data, isLoading } = useQuery({
    queryKey: ['competition', selectedCategory, dateFrom, dateTo],
    queryFn: () =>
      fetchCompetition(selectedCategory || undefined, { from: dateFrom, to: dateTo }),
    // Tarih aralığı henüz hidrate olmadıysa boş string gelebilir; o durumda
    // çağrı yapma.
    enabled: Boolean(dateFrom && dateTo),
  })

  const siteRankings = data?.siteRankings || []
  const topCampaignSite = siteRankings[0]
  const topBonusSite = [...siteRankings].sort((a, b) => Number(b.avg_bonus) - Number(a.avg_bonus))[0]

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Rekabet Analizi"
        description="Rakiplerin kampanya hacmi ve bonus agresifliği karşılaştırması"
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="category" className="text-sm text-muted-foreground">Tür:</label>
            <Select
              id="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-48"
            >
              <option value="">Tüm Türler</option>
              {(data?.categories || []).map(cat => (
                <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
              ))}
            </Select>
          </div>
        }
      />

      <main className="p-6 space-y-6">
        {/* Tarih aralığı header'ı + karşılaştırma dönemi etiketi */}
        <div className="space-y-2">
          <DateRangePickerHeader scope={COMPETITION_SCOPE} />
          {rangeLabel && (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                Karşılaştırma dönemi:{' '}
                <span className="font-medium text-foreground">{presetLabel}</span>
                <span className="ml-1">({rangeLabel})</span>
                <span className="ml-1 italic">— bu dönemde aktif olan kampanyalar</span>
              </span>
            </div>
          )}
        </div>

        {/* Top 3 Leader Cards */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><div className="h-20 bg-muted animate-pulse rounded" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <InsightCard
              icon={Crown}
              title="Pazar Lideri"
              value={topCampaignSite?.site_name || '-'}
              description={`${topCampaignSite?.total_campaigns || 0} kampanya`}
              tone="positive"
            />
            <InsightCard
              icon={Target}
              title="Bonus Lideri"
              value={topBonusSite?.site_name || '-'}
              description={`Ort. ₺${(Number(topBonusSite?.avg_bonus) || 0).toFixed(0)}`}
              tone="warning"
            />
            <InsightCard
              icon={TrendingUp}
              title="En Aktif Tür"
              value={data?.comparisonTable[0] ? getCategoryLabel(data.comparisonTable[0].category) : '-'}
              description={`${data?.comparisonTable[0]?.total_campaigns || 0} kampanya`}
              tone="info"
            />
          </div>
        )}

        {/* Site Sıralaması - Main Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Site Sıralaması</CardTitle>
          </CardHeader>
          <CardContent>
            {!isLoading && siteRankings.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground/60" />
                <p className="text-sm font-medium text-muted-foreground">
                  Bu aralıkta veri yok
                </p>
                <p className="text-xs text-muted-foreground">
                  Seçili tarih aralığında ({rangeLabel || 'tarih yok'}) hiçbir sitede
                  kampanya bulunamadı. Üstteki preset&apos;lerle aralığı genişletmeyi
                  deneyin.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-right">Kampanya</TableHead>
                    <TableHead className="text-right">Aktif</TableHead>
                    <TableHead className="text-right">Aktif %</TableHead>
                    <TableHead className="text-right">Ort. Bonus</TableHead>
                    <TableHead>Momentum</TableHead>
                    <TableHead>Tutum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {siteRankings.slice(0, 10).map((site, idx) => (
                    <TableRow key={site.site_id}>
                      <TableCell className="font-medium">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/competition/sites/${site.site_code}`}
                            className="hover:underline"
                          >
                            {site.site_name}
                          </Link>
                          {idx === 0 && <Badge variant="winner"><Crown className="h-3 w-3 mr-1" />Lider</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{site.total_campaigns}</TableCell>
                      <TableCell className="text-right">{site.active_campaigns}</TableCell>
                      <TableCell className="text-right">{(Number(site.active_rate) * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono">₺{Number(site.avg_bonus).toFixed(0)}</TableCell>
                      <TableCell>
                        <MomentumBadge
                          direction={site.momentum_direction}
                          score={site.momentum_score}
                        />
                      </TableCell>
                      <TableCell>
                        <StanceBadge
                          stance={site.stance}
                          velocityDelta={site.stance_velocity_delta}
                          tooltip={formatStanceTooltip({
                            stance: site.stance,
                            velocityDelta: site.stance_velocity_delta,
                            stanceScore: site.stance_score,
                            updatedAt: site.stance_updated_at,
                          })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Tür Bazlı Karşılaştırma - Collapsible */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowBonusTable(!showBonusTable)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Tür Bazlı Karşılaştırma</CardTitle>
              {showBonusTable ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </CardHeader>
          {showBonusTable && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tür</TableHead>
                    <TableHead>En İyi Site</TableHead>
                    <TableHead className="text-right">Kampanya</TableHead>
                    <TableHead className="text-right">Toplam Site</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.comparisonTable || []).slice(0, 10).map((row) => (
                    <TableRow key={row.category}>
                      <TableCell className="font-medium">{getCategoryLabel(row.category)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.best_site}
                          {row.best_site_campaigns > 0 && <Badge variant="winner"><Crown className="h-3 w-3 mr-1" /></Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{row.best_site_campaigns}</TableCell>
                      <TableCell className="text-right">{row.total_sites}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>

        {/* Site vs Site Matrisi - Collapsible */}
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowMatrix(!showMatrix)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Site vs Site Matrisi</CardTitle>
              {showMatrix ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </CardHeader>
          {showMatrix && (
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background">Tür</TableHead>
                      {(data?.sites || []).slice(0, 8).map(s => (
                        <TableHead key={s.site_code} className="text-center">{s.site_code}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.categories || []).slice(0, 10).map(cat => (
                      <TableRow key={cat}>
                        <TableCell className="font-medium sticky left-0 bg-background">{getCategoryLabel(cat)}</TableCell>
                        {(data?.sites || []).slice(0, 8).map(s => {
                          const cell = data?.siteMatrix?.[cat]?.[s.site_code]
                          const intensity = Math.min(1, (cell?.campaign_count || 0) / Math.max(1, Number(topCampaignSite?.total_campaigns || 1)))
                          return (
                            <TableCell key={s.site_code} className="text-center">
                              {cell ? (
                                <div
                                  className={cn(
                                    'inline-flex min-w-[50px] flex-col items-center gap-1 rounded-lg px-2 py-1',
                                    cell.is_winner && 'ring-1 ring-yellow-300'
                                  )}
                                  style={{ backgroundColor: `rgba(37, 99, 235, ${0.12 + intensity * 0.25})` }}
                                >
                                  <span className={cn('text-lg font-bold', cell.campaign_count === 0 && 'text-muted-foreground')}>
                                    {cell.campaign_count}
                                  </span>
                                  {/* Wave 1 #1.3 — düşük örneklemli hücreye rozet */}
                                  <SampleBadge n={cell.campaign_count} compact />
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>

        {/* En İyi Bonus / Fırsatlar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">En İyi Bonus Fırsatları</CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.bestDeals || []).length > 0 ? (
              <div className="grid gap-4 md:grid-cols-3">
                {(data?.bestDeals || []).slice(0, 6).map((deal) => {
                  // Tarih: landing'de yazan valid_from/valid_to çoğu zaman
                  // güncel değil. Türev "aktif olduğu dönem" göster.
                  const start = deal.effective_start
                  const end = deal.effective_end
                  const fmt = (v: string | Date | null | undefined) => {
                    if (!v) return null
                    const d = v instanceof Date ? v : new Date(v)
                    if (Number.isNaN(d.getTime())) return null
                    return d.toLocaleDateString('tr-TR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })
                  }
                  const startStr = fmt(start)
                  const endStr = fmt(end)
                  return (
                    <Card key={deal.campaign_id} className="border-border/70 bg-muted/10">
                      <CardContent className="p-4 space-y-2">
                        <div className="text-sm text-muted-foreground">{deal.site_name}</div>
                        <div className="font-medium line-clamp-2 text-sm">{deal.campaign_title}</div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="text-xs">{getCategoryLabel(deal.category)}</Badge>
                          {deal.still_active ? (
                            <Badge variant="success" className="text-xs">Devam ediyor</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">Sona ermiş</Badge>
                          )}
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Bonus</div>
                            <div className="font-semibold">{deal.bonus_amount ? `₺${deal.bonus_amount.toLocaleString()}` : '-'}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">%</div>
                            <div className="font-semibold">{deal.bonus_percentage ? `%${deal.bonus_percentage}` : '-'}</div>
                          </div>
                        </div>
                        {/* BestDeal API'sı min_deposit/turnover'ı (henüz)
                            return etmiyor; var olan alanları synthetic
                            ai_analysis.extractedTags şeklinde shim'leyip
                            BonusChips'e geçiyoruz. min_deposit/turnover
                            yoksa chip render edilmez. */}
                        <div className="pt-1">
                          <BonusChips
                            campaign={{
                              metadata: {
                                ai_analysis: {
                                  extractedTags: {
                                    bonus_amount: deal.bonus_amount,
                                    bonus_percentage: deal.bonus_percentage,
                                  },
                                },
                              },
                            }}
                            compact
                            showEffective
                          />
                        </div>
                        {(startStr || endStr) && (
                          <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                            <span className="font-medium text-foreground">{startStr || '—'}</span>
                            <span className="mx-1">→</span>
                            {deal.still_active ? (
                              <span>devam ediyor</span>
                            ) : (
                              <span className="font-medium text-foreground">{endStr || '—'}</span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Bonus verisi bulunamadı.</p>
            )}
          </CardContent>
        </Card>

        {/* Share of Voice - Pazar Hakimiyeti */}
        <ShareOfVoice sites={siteRankings} isLoading={isLoading} />

        {/* 2D Positioning Map */}
        <PositioningMap sites={siteRankings} isLoading={isLoading} />

        {/* Radar Chart */}
        <RadarChartComponent sites={siteRankings} isLoading={isLoading} />

        {/* Gap Analysis */}
        <GapAnalysis
          gaps={data?.gaps || []}
          sites={data?.sites || []}
          isLoading={isLoading}
        />
      </main>
    </div>
  )
}
