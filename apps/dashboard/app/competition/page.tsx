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
import { TableScroll } from '@/components/ui/table-scroll'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Crown, Target, TrendingUp, ChevronDown, ChevronUp, Calendar, CalendarRange, Layers } from 'lucide-react'
import { MomentumBadge } from '@/components/competition/competition-grid'
import { StanceBadge, formatStanceTooltip } from '@/components/ui/stance-badge'
import { SampleBadge } from '@/components/ui/sample-badge'
import { BonusChips } from '@/components/ui/bonus-chips'
import { RadarChartComponent } from '@/components/competition/radar-chart'
import { GapAnalysis } from '@/components/competition/gap-analysis'
import { ShareOfVoice } from '@/components/competition/share-of-voice'
import { PositioningMap } from '@/components/competition/positioning-map'
import { getCategoryLabel } from '@/lib/category-labels'
import { getSiteDisplayName } from '@/lib/i18n/site'
import { cn } from '@/lib/utils'
import { fetchCompetition, fetchWowDeltas } from '@/lib/api'
import { useDateRange } from '@/lib/date-range/context'
import { PRESET_LABELS } from '@/lib/date-range/presets'
import { METRIC_TOOLTIPS } from '@/lib/i18n/metric-tooltips'

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
  const { from: dateFrom, to: dateTo, preset, applyPreset } = useDateRange(COMPETITION_SCOPE)

  // FE-14: Boş state aksiyonları için yardımcı — kategoriyi temizle veya
  // tarih aralığını "Son 30 Gün"e genişlet (Batch B quick-range chip'i).
  const widenRangeToLast30 = () => applyPreset('last30d')
  const clearCategoryFilter = () => {
    setSelectedCategory('')
    if (searchParams) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('category')
      params.delete('cat')
      router.replace(`${pathname}?${params.toString()}`)
    }
  }

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

  // FE-11: Hero stats (InsightCard'lar) için "geçen haftaya göre delta"
  // benchmark'ı. Backend'de zaten /api/reports/wow-deltas (Wave 1 #1.2) var
  // — current dönem vs. eşit uzunlukta geçmiş dönem kampanya sayısı diff'i.
  // Endpoint çağırılamazsa (örn. henüz seed yok) `topChanges` boş döner ve
  // InsightCard "—" gösterir; yalan benchmark üretmiyoruz.
  const { data: wowData } = useQuery({
    queryKey: ['wow-deltas', dateFrom, dateTo],
    queryFn: () => fetchWowDeltas({ from: dateFrom, to: dateTo, limit: 50 }),
    enabled: Boolean(dateFrom && dateTo),
    staleTime: 15 * 60 * 1000,
  })

  const siteRankings = data?.siteRankings || []
  const topCampaignSite = siteRankings[0]
  const topBonusSite = [...siteRankings].sort((a, b) => Number(b.avg_bonus) - Number(a.avg_bonus))[0]

  // FE-11: Pazar liderinin önceki dönemden bu döneme delta'sı.
  // wow-deltas top liste'sinde liderin satırını ara; yoksa null.
  const leaderDelta =
    topCampaignSite && wowData
      ? wowData.topChanges.find((c) => c.siteId === topCampaignSite.site_id)?.diff ?? null
      : null
  const formatDelta = (d: number | null): string => {
    if (d === null) return '—' // benchmark verisi yok — yalan gösterme
    if (d === 0) return 'Geçen haftaya göre değişim yok'
    const sign = d > 0 ? '+' : ''
    return `Geçen haftaya göre ${sign}${d} kampanya`
  }

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
            {/* FE-11: Hero stats'a geçen haftaya göre delta benchmark'ı.
                wowData yoksa "—" gösterilir, yalan benchmark üretilmez. */}
            <InsightCard
              icon={Crown}
              title="Pazar Lideri"
              value={topCampaignSite?.site_name || '-'}
              description={`${topCampaignSite?.total_campaigns || 0} kampanya • ${formatDelta(leaderDelta)}`}
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
              // FE-14: Empty state + somut aksiyon — quick-range chip'lerinden
              // "Son 30 Gün"e genişlet ve/veya kategori filtresini temizle.
              <EmptyState
                icon={Calendar}
                title="Bu aralıkta veri yok"
                description={`Seçili tarih aralığında (${rangeLabel || 'tarih yok'}) hiçbir sitede kampanya bulunamadı. Tarih aralığını genişletmeyi veya kategori filtresini temizlemeyi deneyin.`}
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                    <Button variant="default" size="sm" onClick={widenRangeToLast30}>
                      <CalendarRange className="h-4 w-4 mr-1" />
                      Tarih aralığını genişlet (Son 30 Gün)
                    </Button>
                    {selectedCategory && (
                      <Button variant="outline" size="sm" onClick={clearCategoryFilter}>
                        <Layers className="h-4 w-4 mr-1" />
                        Tüm türleri göster
                      </Button>
                    )}
                  </div>
                }
              />
            ) : (
              // FE-12: Site Sıralaması tablosu — Momentum/Tutum chip'leri ile
              // 8 kolon, dar viewport'ta yatay scroll devreye girsin.
              <TableScroll minWidth={920} bordered={false}>
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead className="text-right">Kampanya</TableHead>
                    <TableHead className="text-right">Aktif</TableHead>
                    <TableHead
                      className="text-right cursor-help"
                      title={METRIC_TOOLTIPS['site.active_rate']}
                    >
                      {/* FE-9: % header'a "neyin yüzdesi" tooltip'i. */}
                      Aktif %
                    </TableHead>
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
              </TableScroll>
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
              {/* FE-12: 4 kolon ama "En İyi Site" + winner badge geniş yer
                  alabiliyor — minimum 640px ile dar viewport'ta scroll. */}
              <TableScroll minWidth={640} bordered={false}>
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
              </TableScroll>
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
              {/* FE-12: 9 kolon (Tür + 8 site) + Türkçe site adları —
                  matrix sticky left "Tür" kolonu ile yatay scroll. */}
              <TableScroll minWidth={920} bordered={false}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background">Tür</TableHead>
                      {(data?.sites || []).slice(0, 8).map(s => (
                        <TableHead key={s.site_code} className="text-center">
                          {getSiteDisplayName(s.site_code, s.site_name)}
                        </TableHead>
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
                          const siteDisplay = getSiteDisplayName(s.site_code, s.site_name)
                          return (
                            <TableCell key={s.site_code} className="text-center p-1">
                              {cell ? (
                                // FE-15: Matrix hücresi tıklanabilir → ilgili
                                // rakibin o kategoriye ait kampanyalarına yönlendir.
                                // siteId (UUID) + category short-form (`cat`) URL'ye yazılır.
                                <button
                                  type="button"
                                  onClick={() =>
                                    router.push(
                                      `/campaigns?siteId=${encodeURIComponent(s.site_id)}&cat=${encodeURIComponent(cat)}`
                                    )
                                  }
                                  aria-label={`${siteDisplay} rakibinin ${getCategoryLabel(cat)} kampanyalarını göster (${cell.campaign_count} kampanya)`}
                                  title={`${siteDisplay} — ${getCategoryLabel(cat)}: ${cell.campaign_count} kampanya. Listeyi göster.`}
                                  className={cn(
                                    'inline-flex min-w-[50px] flex-col items-center gap-1 rounded-lg px-2 py-1 cursor-pointer',
                                    'hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                                    'transition-all',
                                    cell.is_winner && 'ring-1 ring-yellow-300'
                                  )}
                                  style={{ backgroundColor: `rgba(37, 99, 235, ${0.12 + intensity * 0.25})` }}
                                >
                                  <span className={cn('text-lg font-bold', cell.campaign_count === 0 && 'text-muted-foreground')}>
                                    {cell.campaign_count}
                                  </span>
                                  {/* Wave 1 #1.3 — düşük örneklemli hücreye rozet */}
                                  <SampleBadge n={cell.campaign_count} compact />
                                </button>
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
              </TableScroll>
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
              // FE-14: "Bonus verisi yok" — quick-range chip aksiyonu önerisi.
              <EmptyState
                icon={Target}
                title="Bonus fırsatı bulunamadı"
                description="Seçili tarih aralığında listelenebilecek bonus kaydı yok. Aralığı genişletmeyi veya kategori filtresini temizlemeyi deneyin."
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                    <Button variant="default" size="sm" onClick={widenRangeToLast30}>
                      <CalendarRange className="h-4 w-4 mr-1" />
                      Son 30 Gün
                    </Button>
                    {selectedCategory && (
                      <Button variant="outline" size="sm" onClick={clearCategoryFilter}>
                        Tüm türleri göster
                      </Button>
                    )}
                  </div>
                }
              />
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
