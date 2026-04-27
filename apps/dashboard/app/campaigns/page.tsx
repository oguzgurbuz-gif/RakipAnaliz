'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { CampaignCard } from '@/components/campaign/campaign-card'
import { CampaignTable } from '@/components/campaign/campaign-table'
import { CampaignFilters } from '@/components/campaign/campaign-filters'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDisplay } from '@/components/ui/error'
import { InsightCard } from '@/components/ui/insight-card'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { DateRangePickerHeader } from '@/components/ui/date-range-picker-header'
import { useDateRange } from '@/lib/date-range/context'
import { getCampaignBonusInfo, getCampaignQualitySignals } from '@/lib/campaign-presentation'
import { fetchCampaigns } from '@/lib/api'
import { useSSE } from '@/hooks/useSSE'
import { FILTER_FIELD_LABELS } from '@/lib/i18n/filters'
import type { CampaignFilters as CampaignFiltersType, Campaign } from '@/types'
import {
  ChevronLeft,
  ChevronRight,
  Star,
  Download,
  LayoutGrid,
  TableProperties,
  CalendarClock,
  ShieldAlert,
  Activity,
  CalendarRange,
} from 'lucide-react'

/** /campaigns scope için global tarih + activeOnly URL param adı. */
const DATE_RANGE_SCOPE = 'campaigns'
const ACTIVE_ONLY_PARAM = 'activeOnly'

export default function CampaignsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()

  const getParam = (key: string, defaultValue: string = ''): string => {
    if (!searchParams) return defaultValue
    return searchParams.get(key) || defaultValue
  }

  // Tarih aralığı artık global DateRangeProvider'dan geliyor (URL ?from/?to/?preset).
  const {
    from: dateFrom,
    to: dateTo,
    applyPreset,
  } = useDateRange(DATE_RANGE_SCOPE)

  // Tarih dışı filtreler. dateFrom/dateTo bilinçli olarak burada tutulmuyor:
  // global picker zaten kontrol ediyor; aşağıda effectiveFilters ile birleştiriliyor.
  const [filters, setFilters] = useState<CampaignFiltersType>({
    site: getParam('siteId') || undefined,
    status: getParam('status') || undefined,
    sentiment: getParam('sentiment') || undefined,
    dateMode: getParam('dateMode') || undefined,
    search: getParam('search') || undefined,
    sort: getParam('sort') || undefined,
    campaign_type: getParam('campaignType') || undefined,
    category: getParam('category') || undefined,
  })
  const [page, setPage] = useState(parseInt(getParam('page', '1'), 10))
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sites, setSites] = useState<{id: string, name: string}[]>([])
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

  // "Sadece aktif" toggle — URL ile senkron, default true.
  const [activeOnly, setActiveOnly] = useState<boolean>(() => {
    const raw = getParam(ACTIVE_ONLY_PARAM)
    if (raw === '') return true
    return raw !== 'false'
  })

  useSSE(useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['campaigns'] })
  }, [queryClient]))

  const updateUrl = useCallback((updates: Record<string, string | undefined | number | boolean>) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === '' || value === 1) {
        params.delete(key)
      } else {
        params.set(key, String(value))
      }
    }
    router.replace(`${pathname}?${params.toString()}`)
  }, [searchParams, router, pathname])

  const handleFiltersChange = (newFilters: CampaignFiltersType) => {
    // Tarih alanları globalde tutuluyor; CampaignFilters bileşeni de
    // bu alanları artık göstermiyor. Yine de güvenlik için sıyırıp at.
    const { dateFrom: _df, dateTo: _dt, ...rest } = newFilters
    setFilters(rest)
    setPage(1)
    updateUrl({
      ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== '')),
      page: undefined,
    })
  }

  const handleClear = () => {
    const emptyFilters: CampaignFiltersType = {
      site: undefined,
      status: undefined,
      sentiment: undefined,
      dateMode: undefined,
      campaign_type: undefined,
      category: undefined,
      search: undefined,
      sort: undefined,
      dateCompleteness: undefined,
    }
    setFilters(emptyFilters)
    setPage(1)
    // Sadece tarih dışı param'ları temizle; tarih aralığı global picker'a ait.
    const params = new URLSearchParams(searchParams?.toString() || '')
    const KEEP_KEYS = new Set(['from', 'to', 'preset', ACTIVE_ONLY_PARAM])
    for (const key of Array.from(params.keys())) {
      if (!KEEP_KEYS.has(key)) params.delete(key)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : (pathname || '/campaigns'))
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    updateUrl({ page: newPage })
  }

  const handleToggleActiveOnly = () => {
    const next = !activeOnly
    setActiveOnly(next)
    setPage(1)
    // Default true → URL'de yer kaplamasın; sadece false olduğunda yaz.
    updateUrl({ [ACTIVE_ONLY_PARAM]: next ? undefined : 'false', page: undefined })
  }

  const { data: sitesData } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const res = await fetch('/api/sites')
      if (!res.ok) return []
      const json = await res.json()
      return json.data || []
    },
  })

  useEffect(() => {
    if (sitesData) setSites(sitesData)
  }, [sitesData])

  useEffect(() => {
    setFavorites(JSON.parse(localStorage.getItem('favorites') || '[]'))
  }, [])

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newFavorites = favorites.includes(id)
      ? favorites.filter(x => x !== id)
      : [...favorites, id]
    setFavorites(newFavorites)
    localStorage.setItem('favorites', JSON.stringify(newFavorites))
  }

  /**
   * Backend'e gidecek nihai filtreler:
   * - tarih aralığı: global picker (useDateRange)
   * - dateMode default: 'active_during_range' (kullanıcı seçtiyse onu kullan)
   * - status: activeOnly true ise 'active' override (kullanıcı manuel status seçimi gizlenir)
   */
  const effectiveFilters: CampaignFiltersType = useMemo(() => {
    const merged: CampaignFiltersType = {
      ...filters,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      dateMode: filters.dateMode || 'active_during_range',
    }
    if (activeOnly) {
      merged.status = 'active'
    }
    return merged
  }, [filters, dateFrom, dateTo, activeOnly])

  // FE-5: Preview result count when filters are applied
  const { data: previewData, isLoading: isPreviewLoading } = useQuery({
    queryKey: ['campaigns-preview', effectiveFilters],
    queryFn: () => fetchCampaigns({ ...effectiveFilters, page: 1, limit: 1 }),
    enabled: Object.values(filters).some(v => v !== undefined && v !== ''),
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campaigns', effectiveFilters, page, dateFrom, dateTo, activeOnly],
    queryFn: () => fetchCampaigns({ ...effectiveFilters, page, limit: 20 }),
  })

  // Compute active filter entries (tarih + activeOnly hariç — onlar ayrı UI)
  const activeFilterEntries = Object.entries(filters).filter(([_, value]) => value !== undefined && value !== '')

  // FE-3 — URL paramı / filtre key'i → Türkçe etiket eşlemesi merkezi
  // `lib/i18n/filters.ts` dosyasından besleniyor (duplikasyon yok).
  const URL_PARAM_LABELS = FILTER_FIELD_LABELS

  // FE-6: Saved filter presets with localStorage
  const [presets, setPresets] = useState<{id: string; name: string; filters: CampaignFiltersType}[]>([])
  const [showPresetModal, setShowPresetModal] = useState(false)
  const [presetName, setPresetName] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('campaign-filter-presets')
    if (saved) {
      try {
        setPresets(JSON.parse(saved))
      } catch {}
    }
  }, [])

  const savePreset = () => {
    if (!presetName.trim()) return
    const newPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: { ...filters },
    }
    const updated = [...presets, newPreset]
    setPresets(updated)
    localStorage.setItem('campaign-filter-presets', JSON.stringify(updated))
    setPresetName('')
    setShowPresetModal(false)
  }

  const deletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id)
    setPresets(updated)
    localStorage.setItem('campaign-filter-presets', JSON.stringify(updated))
  }

  const applyFilterPreset = (preset: typeof presets[0]) => {
    handleFiltersChange(preset.filters)
  }
  const visibleCampaigns = showFavoritesOnly
    ? (data?.data.filter(c => favorites.includes(c.id)) || [])
    : (data?.data || [])
  const suspiciousCount = visibleCampaigns.filter((campaign) =>
    getCampaignQualitySignals(campaign).some((signal) => signal.code === 'suspicious')
  ).length
  const missingDateCount = visibleCampaigns.filter((campaign) =>
    getCampaignQualitySignals(campaign).some((signal) => signal.code === 'missing_dates')
  ).length
  const activeCount = visibleCampaigns.filter((campaign) => campaign.status === 'active').length

  const escapeCsv = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '""'
    return `"${String(value).replace(/"/g, '""')}"`
  }

  const buildCsvRows = (rows: Campaign[]): string => {
    const headers = [
      'title',
      'site',
      'category',
      'sentiment',
      'valid_from',
      'valid_to',
      'bonus_amount',
      'bonus_percentage',
      'min_deposit',
      'max_bonus',
      'free_bet_amount',
      // Slice B: çevrim ve net bonus sütunları (BonusChips ile aynı kaynak).
      'turnover',
      'effective_bonus',
      'summary',
      'ai_confidence',
    ]
    const lines = [headers.join(',')]
    for (const c of rows) {
      const bonus = getCampaignBonusInfo(c)
      const aiAnalysis = (c.metadata?.ai_analysis ?? {}) as Record<string, unknown>
      const summaryFromAi = typeof aiAnalysis.summary === 'string' ? aiAnalysis.summary : ''
      const summaryRaw = c.aiSummary || summaryFromAi || ''
      const summary = summaryRaw.replace(/\s+/g, ' ').slice(0, 200)
      // Turnover'ı "10x" formatlı yaz, multiplier null ise boş string.
      const turnoverCsv =
        bonus.turnoverMultiplier !== null
          ? Number.isInteger(bonus.turnoverMultiplier)
            ? `${bonus.turnoverMultiplier}x`
            : `${bonus.turnoverMultiplier}x`
          : ''
      // Effective bonus: yuvarlanmış sayı (Excel sayı olarak yorumlasın).
      const effectiveCsv =
        bonus.effectiveBonus !== null ? Math.round(bonus.effectiveBonus) : ''
      lines.push([
        escapeCsv(c.title || ''),
        escapeCsv(c.site?.name || ''),
        escapeCsv(c.category || ''),
        escapeCsv(c.sentiment || c.aiSentiment || ''),
        escapeCsv(c.validFrom || ''),
        escapeCsv(c.validTo || ''),
        escapeCsv(bonus.amount),
        escapeCsv(bonus.percentage),
        escapeCsv(bonus.minDeposit),
        escapeCsv(bonus.maxBonus),
        escapeCsv(bonus.freeBetAmount),
        escapeCsv(turnoverCsv),
        escapeCsv(effectiveCsv),
        escapeCsv(summary),
        escapeCsv(bonus.confidence),
      ].join(','))
    }
    return lines.join('\n')
  }

  const triggerCsvDownload = (csv: string, filename: string) => {
    // Prepend BOM so Excel correctly detects UTF-8 (Turkish characters).
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportCSV = () => {
    const csv = buildCsvRows(visibleCampaigns)
    triggerCsvDownload(csv, `kampanyalar-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleCampaigns.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleCampaigns.map(c => c.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const exportSelected = () => {
    const selected = visibleCampaigns.filter(c => selectedIds.has(c.id))
    const csv = buildCsvRows(selected)
    triggerCsvDownload(csv, `kampanyalar-secili-${selected.length}-${new Date().toISOString().split('T')[0]}.csv`)
  }

  const clearSelection = () => setSelectedIds(new Set())

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Kampanyalar" description="Kampanya havuzunu filtreleyin, veri kalitesini denetleyin ve detaylara hızla inin." />
        <main className="p-6">
          <ErrorDisplay error={error} onRetry={() => refetch()} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Kampanyalar"
        description="Liste, tarih tamamlığı, veri kalitesi ve favori seçimleri üzerinden kampanyaları hızlıca tarayın."
        actions={
          <>
            <span className="text-sm text-muted-foreground">
              Toplam: {data?.total ?? 0}
              {showFavoritesOnly && ` (${favorites.length} favoriler)`}
            </span>
            <div className="flex items-center rounded-xl border border-border/70 bg-background p-1">
              <Button variant={viewMode === 'table' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('table')}>
                <TableProperties className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === 'cards' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('cards')}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant={showFavoritesOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            >
              <Star className="h-4 w-4 mr-1" />
              Favoriler
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Yenile
            </Button>
          </>
        }
      />

      <main className="p-6 space-y-4">
        {/* Global tarih aralığı seçici (scope: campaigns). */}
        <DateRangePickerHeader scope={DATE_RANGE_SCOPE} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InsightCard title="Toplam Görünür Sonuç" value={data?.total ?? 0} description="Mevcut filtrelerle eşleşen toplam kayıt" />
          <InsightCard icon={Activity} title="Bu Sayfada Aktif" value={activeCount} description="Şu an aktif durumdaki kayıtlar" tone="positive" />
          <InsightCard icon={CalendarClock} title="Tarih Eksik" value={missingDateCount} description="Başlangıç veya bitiş tarihi eksik" tone="warning" />
          <InsightCard icon={ShieldAlert} title="Şüpheli Kayıt" value={suspiciousCount} description="Junk veya düşük güvenli scrape sonuçları" tone="warning" />
        </div>

        {/* Bulk Selection Bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <span className="text-sm font-medium">
              {selectedIds.size} seçildi
            </span>
            <Button variant="outline" size="sm" onClick={toggleSelectAll}>
              Tümünü Seç/Kaldır
            </Button>
            <Button variant="outline" size="sm" onClick={exportSelected}>
              <Download className="h-4 w-4 mr-1" />
              Seçili Export ({selectedIds.size})
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Seçimi Temizle
            </Button>
          </div>
        )}

        <CampaignFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          sites={sites}
        />

        {/* "Sadece aktif" toggle + filtre preset yönetimi. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={activeOnly}
            onClick={handleToggleActiveOnly}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              activeOnly
                ? 'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15'
                : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
            }`}
            title={activeOnly ? 'Tümünü göster' : 'Sadece aktif kampanyalar'}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${activeOnly ? 'bg-primary' : 'bg-muted-foreground/40'}`}
              aria-hidden="true"
            />
            Sadece aktif
          </button>

          <span className="text-muted-foreground">|</span>

          <Button variant="outline" size="sm" onClick={() => setShowPresetModal(true)} className="text-xs h-7">
            Filtre Kaydet
          </Button>
        </div>

        {/* FE-6: Saved filter presets */}
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground py-1">Kayıtlı Filtreler:</span>
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-1">
                <button
                  onClick={() => applyFilterPreset(preset)}
                  className="text-xs px-3 py-1 rounded-full border border-primary/30 bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  {preset.name}
                </button>
                <button
                  onClick={() => deletePreset(preset.id)}
                  className="text-xs text-muted-foreground hover:text-red-500"
                  title="Sil"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* FE-6: Save preset modal */}
        {showPresetModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-background rounded-lg p-6 shadow-lg max-w-sm w-full">
              <h3 className="text-lg font-semibold mb-4">Filtre Kaydet</h3>
              <Input
                placeholder="Filtre adı..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="mb-4"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowPresetModal(false)}>İptal</Button>
                <Button size="sm" onClick={savePreset}>Kaydet</Button>
              </div>
            </div>
          </div>
        )}

        {/* FE-5: Preview result count when filters are applied */}
        {activeFilterEntries.length > 0 && !isPreviewLoading && previewData && (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
            <span className="font-medium">{previewData.total}</span> kampanya bulundu
            {previewData.total > 20 && ` (ilk 20 gösteriliyor, ${previewData.total} toplam)`}
          </div>
        )}
        {activeFilterEntries.length > 0 && isPreviewLoading && (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2 animate-pulse">
            Sonuçlar kontrol ediliyor...
          </div>
        )}

        {activeFilterEntries.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilterEntries.map(([key, value]) => (
              <span key={key} className="rounded-full border border-border/80 bg-background px-3 py-1 text-xs text-muted-foreground">
                {URL_PARAM_LABELS[key] || key}: {String(value)}
              </span>
            ))}
          </div>
        )}

        {isLoading ? (
          <CampaignTable campaigns={[]} isLoading />
        ) : visibleCampaigns.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title={showFavoritesOnly ? 'Favori kampanya yok' : 'Bu tarih aralığında kampanya yok'}
            description={showFavoritesOnly
              ? 'Henüz favori kampanya eklemediniz. Kampanyaların yanındaki yıldız ikonuna tıklayarak favorilere ekleyebilirsiniz.'
              : 'Seçili tarih aralığı, "Sadece aktif" filtresi veya diğer arama kriterleri ile eşleşen kayıt bulunamadı.'}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                {showFavoritesOnly ? (
                  <Button variant="outline" onClick={() => setShowFavoritesOnly(false)}>
                    Tüm Kampanyaları Göster
                  </Button>
                ) : (
                  <>
                    <Button variant="default" onClick={() => applyPreset('last30d')}>
                      <CalendarRange className="h-4 w-4 mr-1" />
                      Tarih aralığını genişlet (Son 30 Gün)
                    </Button>
                    {activeOnly && (
                      <Button variant="outline" onClick={handleToggleActiveOnly}>
                        Pasif/Bitmiş kampanyaları da göster
                      </Button>
                    )}
                    {activeFilterEntries.length > 0 && (
                      <Button variant="outline" onClick={handleClear}>
                        Filtreleri Temizle
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => refetch()}>
                      Yenile
                    </Button>
                  </>
                )}
              </div>
            }
          />
        ) : viewMode === 'table' ? (
          <CampaignTable
            campaigns={visibleCampaigns}
            favorites={favorites}
            selectedIds={selectedIds}
            onToggleFavorite={toggleFavorite}
            onToggleSelect={toggleSelect}
            onSelectAll={toggleSelectAll}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCampaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        )}

        {data && data.totalPages > 1 && !showFavoritesOnly && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Sayfa {page} / {data.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(Math.min(data.totalPages, page + 1))}
              disabled={page >= data.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
