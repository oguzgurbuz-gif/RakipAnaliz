'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import * as Tabs from '@radix-ui/react-tabs'
import { fetchCampaigns, fetchCompetition } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { PageHeader } from '@/components/ui/page-header'
import { StanceBadge, formatStanceTooltip } from '@/components/ui/stance-badge'
import { MomentumBadge } from '@/components/competition/competition-grid'
import { resolveCampaignDateDisplay } from '@/lib/campaign-dates'
import {
  getCampaignTypeLabel,
  getCampaignQualitySignals,
  getDisplaySentimentLabel,
  getDisplayStatusLabel,
  getCampaignBonusInfo,
} from '@/lib/campaign-presentation'
import { getSentimentColor, cn } from '@/lib/utils'
import { StatusBadge } from '@/components/campaign/status-badge'
import { getSiteDisplayName } from '@/lib/i18n/site'
import {
  Search,
  Star,
  X,
  Download,
  AlertTriangle,
  Calendar,
  Tag,
  ThumbsUp,
  ThumbsDown,
  Minus,
  TrendingUp,
  Info,
  CheckCircle,
  Trophy,
  GitCompareArrows,
  Building2,
} from 'lucide-react'
import { jsPDF } from 'jspdf'

// Color palette for site cards (up to 5 sites)
const SITE_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800', header: 'bg-blue-200' },
  { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800', header: 'bg-green-200' },
  { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-800', header: 'bg-purple-200' },
  { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-800', header: 'bg-orange-200' },
  { bg: 'bg-pink-100', border: 'border-pink-400', text: 'text-pink-800', header: 'bg-pink-200' },
]

type CompareTab = 'campaign' | 'brand'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrencyTry(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `₺${Math.round(value).toLocaleString('tr-TR')}`
}

function formatCurrencyCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (value >= 1_000_000) return `₺${(value / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}M`
  if (value >= 1_000) return `₺${(value / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}B`
  return `₺${Math.round(value).toLocaleString('tr-TR')}`
}

function formatPercent(value: number | null | undefined, fromRatio = true): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const pct = fromRatio ? value * 100 : value
  return `%${Math.round(pct)}`
}

/** Kampanya satırı için bonus display (string). Extracted tags önceliği:
 *  bonus_amount > bonus_percentage > free_bet_amount > cashback_percent. */
function getCampaignBonusRow(campaign: {
  metadata?: Record<string, unknown> | null
}): string {
  const info = getCampaignBonusInfo(campaign)
  // getCampaignBonusInfo zaten amount > percentage > free_bet sırasıyla
  // `display` üretiyor. Cashback onda yok — metadata'dan manuel bakalım.
  if (info.display) return info.display

  const aiAnalysis = (campaign.metadata?.ai_analysis ?? {}) as Record<string, unknown>
  const tags = (aiAnalysis.extractedTags ?? {}) as Record<string, unknown>
  const cashback =
    typeof tags.cashback_percent === 'number'
      ? tags.cashback_percent
      : typeof tags.cashback_percent === 'string'
      ? Number(tags.cashback_percent)
      : null
  if (cashback !== null && Number.isFinite(cashback) && cashback > 0) {
    return `Cashback %${Math.round(cashback)}`
  }
  return '—'
}

// Metric definition for brand comparison
interface BrandMetric {
  key: string
  label: string
  format: (value: number | null | undefined) => string
  /** Tie-breaker düşük değerin daha iyi olup olmadığını bilmemiz gerek.
   *  Tüm metrikler "yüksek iyi" olduğu için default higherIsBetter=true. */
  higherIsBetter?: boolean
}

const BRAND_METRICS: BrandMetric[] = [
  { key: 'total_campaigns', label: 'Toplam Kampanya', format: (v) => (v ?? 0).toString() },
  { key: 'active_campaigns', label: 'Aktif Kampanya', format: (v) => (v ?? 0).toString() },
  { key: 'active_rate', label: 'Aktif Oranı', format: (v) => formatPercent(v) },
  { key: 'avg_bonus', label: 'Ortalama Bonus', format: (v) => formatCurrencyTry(v) },
  { key: 'total_bonus', label: 'Toplam Bonus Hacmi', format: (v) => formatCurrencyCompact(v) },
  { key: 'categories_count', label: 'Kategori Çeşitliliği', format: (v) => (v ?? 0).toString() },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function CompareClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const rawTab = searchParams?.get('tab')
  const tab: CompareTab = rawTab === 'brand' ? 'brand' : 'campaign'

  const setTab = useCallback(
    (next: CompareTab) => {
      if (!pathname) return
      const params = new URLSearchParams(searchParams?.toString() || '')
      if (next === 'campaign') params.delete('tab')
      else params.set('tab', next)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    },
    [pathname, router, searchParams]
  )

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Karşılaştırma"
        description={`Kampanya bazlı veya marka bazlı karşılaştırma yapın. Farkları aynı ekranda görün.`}
      />

      <Tabs.Root
        value={tab}
        onValueChange={(v) => setTab(v as CompareTab)}
        className="w-full"
      >
        <div className="px-6 pt-4">
          <Tabs.List className="flex border-b">
            <Tabs.Trigger
              value="campaign"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <GitCompareArrows className="h-4 w-4" />
              Kampanya vs Kampanya
            </Tabs.Trigger>
            <Tabs.Trigger
              value="brand"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-foreground data-[state=active]:border-b-2 data-[state=active]:border-primary"
            >
              <Building2 className="h-4 w-4" />
              Marka vs Marka
            </Tabs.Trigger>
          </Tabs.List>
        </div>

        <Tabs.Content value="campaign" className="focus-visible:outline-none">
          <CampaignCompareTab />
        </Tabs.Content>
        <Tabs.Content value="brand" className="focus-visible:outline-none">
          <BrandCompareTab />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab 1 — Kampanya vs Kampanya
// ---------------------------------------------------------------------------

function CampaignCompareTab() {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', { limit: 100 }],
    queryFn: () => fetchCampaigns({ limit: 100 }),
  })

  useEffect(() => {
    setFavorites(JSON.parse(localStorage.getItem('favorites') || '[]'))
  }, [])

  const MAX_SELECTION = 5
  const isAtLimit = selectedIds.length >= MAX_SELECTION

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((prev) => prev.filter((x) => x !== id))
    } else if (!isAtLimit) {
      setSelectedIds((prev) => [...prev, id])
    }
  }

  const selectedCampaigns = data?.data.filter((c) => selectedIds.includes(c.id)) || []
  const filteredCampaigns = (data?.data || []).filter(
    (campaign) =>
      !search ||
      campaign.title.toLowerCase().includes(search.toLowerCase()) ||
      campaign.site?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const compareRows =
    selectedCampaigns.length >= 2
      ? [
          {
            label: 'Site',
            values: selectedCampaigns.map((c) => c.site?.name || '-'),
          },
          {
            label: 'Tür',
            values: selectedCampaigns.map((c) => getCampaignTypeLabel(c)),
          },
          {
            label: 'Bonus',
            values: selectedCampaigns.map((c) => getCampaignBonusRow(c)),
          },
          {
            label: 'Duygu',
            values: selectedCampaigns.map((c) =>
              getDisplaySentimentLabel(c.sentiment || c.aiSentiment)
            ),
          },
          {
            label: 'Durum',
            values: selectedCampaigns.map((c) => getDisplayStatusLabel(c.status)),
          },
          {
            label: 'Başlangıç',
            values: selectedCampaigns.map(
              (c) =>
                resolveCampaignDateDisplay(c.validFrom, c.validFromSource, c.body, 'start').value ||
                '-'
            ),
          },
          {
            label: 'Bitiş',
            values: selectedCampaigns.map(
              (c) =>
                resolveCampaignDateDisplay(c.validTo, c.validToSource, c.body, 'end').value || '-'
            ),
          },
        ]
      : []

  const generateComparisonAnalysis = () => {
    if (selectedCampaigns.length < 2) return null

    const analysis: {
      field: string
      values: { site: string; value: string }[]
      differences: boolean
    }[] = []

    const titles = selectedCampaigns.map((c) => ({
      site: c.site?.name || '-',
      value: c.title,
    }))
    analysis.push({
      field: 'Kampanya Adı',
      values: titles,
      differences: new Set(titles.map((t) => t.value)).size > 1,
    })

    const types = selectedCampaigns.map((c) => ({
      site: c.site?.name || '-',
      value: getCampaignTypeLabel(c),
    }))
    analysis.push({
      field: 'Tür',
      values: types,
      differences: new Set(types.map((t) => t.value)).size > 1,
    })

    const bonuses = selectedCampaigns.map((c) => ({
      site: c.site?.name || '-',
      value: getCampaignBonusRow(c),
    }))
    analysis.push({
      field: 'Bonus',
      values: bonuses,
      differences: new Set(bonuses.map((b) => b.value)).size > 1,
    })

    const sentiments = selectedCampaigns.map((c) => ({
      site: c.site?.name || '-',
      value: getDisplaySentimentLabel(c.sentiment || c.aiSentiment),
    }))
    analysis.push({
      field: 'Duygu',
      values: sentiments,
      differences: new Set(sentiments.map((s) => s.value)).size > 1,
    })

    const starts = selectedCampaigns.map((c) => ({
      site: c.site?.name || '-',
      value:
        resolveCampaignDateDisplay(c.validFrom, c.validFromSource, c.body, 'start').value || '-',
    }))
    analysis.push({
      field: 'Başlangıç',
      values: starts,
      differences: new Set(starts.map((s) => s.value)).size > 1,
    })

    const ends = selectedCampaigns.map((c) => ({
      site: c.site?.name || '-',
      value: resolveCampaignDateDisplay(c.validTo, c.validToSource, c.body, 'end').value || '-',
    }))
    analysis.push({
      field: 'Bitiş',
      values: ends,
      differences: new Set(ends.map((e) => e.value)).size > 1,
    })

    return analysis
  }

  const comparisonAnalysis = generateComparisonAnalysis()

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let yPos = 20

    doc.setFontSize(20)
    doc.setTextColor(40, 40, 40)
    doc.text('Karşılaştırma Raporu', pageWidth / 2, yPos, { align: 'center' })

    yPos += 10
    doc.setFontSize(12)
    doc.setTextColor(100, 100, 100)
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, pageWidth / 2, yPos, {
      align: 'center',
    })

    yPos += 15

    doc.setFillColor(240, 240, 240)
    doc.rect(20, yPos, 30, 20, 'F')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('LOGO', 27, yPos + 12, { align: 'center' })

    yPos += 30

    doc.setFontSize(14)
    doc.setTextColor(40, 40, 40)
    doc.text(
      `Seçili Siteler: ${selectedCampaigns.map((c) => c.site?.name).join(', ')}`,
      20,
      yPos
    )

    yPos += 15

    doc.setFillColor(60, 60, 60)
    doc.rect(20, yPos, pageWidth - 40, 10, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.text('Özellik', 25, yPos + 7)

    selectedCampaigns.forEach((c, i) => {
      const xPos = 60 + i * 30
      doc.text(`${c.site?.name}`.substring(0, 15), xPos, yPos + 7)
    })

    yPos += 10

    doc.setFontSize(9)
    compareRows.forEach((row, rowIndex) => {
      if (yPos > 270) {
        doc.addPage()
        yPos = 20
      }

      if (rowIndex % 2 === 1) {
        doc.setFillColor(248, 248, 248)
        doc.rect(20, yPos, pageWidth - 40, 8, 'F')
      }

      doc.setTextColor(60, 60, 60)
      doc.text(row.label, 25, yPos + 6)

      row.values.forEach((value, colIndex) => {
        const xPos = 60 + colIndex * 30
        const allSame = new Set(row.values).size === 1
        if (!allSame && value !== '-') {
          doc.setTextColor(180, 80, 80)
        } else {
          doc.setTextColor(60, 60, 60)
        }
        doc.text(`${value}`.substring(0, 15), xPos, yPos + 6)
      })

      yPos += 8
    })

    yPos += 15
    doc.setFontSize(14)
    doc.setTextColor(40, 40, 40)
    doc.text('Kampanya Detayları', 20, yPos)
    yPos += 10

    selectedCampaigns.forEach((c) => {
      if (yPos > 260) {
        doc.addPage()
        yPos = 20
      }

      doc.setFillColor(60, 60, 60)
      doc.rect(20, yPos, pageWidth - 40, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.text(`${c.site?.name} - ${c.title}`.substring(0, 70), 25, yPos + 6)

      yPos += 8

      const details = [
        `Tür: ${getCampaignTypeLabel(c)}`,
        `Bonus: ${getCampaignBonusRow(c)}`,
        `Duygu: ${getDisplaySentimentLabel(c.sentiment || c.aiSentiment)}`,
        `Durum: ${getDisplayStatusLabel(c.status)}`,
        `Başlangıç: ${
          resolveCampaignDateDisplay(c.validFrom, c.validFromSource, c.body, 'start').value ||
          'Belirsiz'
        }`,
        `Bitiş: ${
          resolveCampaignDateDisplay(c.validTo, c.validToSource, c.body, 'end').value || 'Belirsiz'
        }`,
      ]

      details.forEach((detail) => {
        doc.setTextColor(60, 60, 60)
        doc.text(detail, 25, yPos + 5)
        yPos += 6
      })

      yPos += 5
    })

    yPos = doc.internal.pageSize.getHeight() - 10
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('RakipAnaliz - Otomatik Oluşturuldu', pageWidth / 2, yPos, { align: 'center' })

    doc.save('karsilastirma-raporu.pdf')
  }

  return (
    <main className="p-6 space-y-6">
      {/* Search + clear */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kampanya veya site ara..."
            className="pl-9"
          />
        </div>
        {selectedIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
            <X className="h-4 w-4 mr-1" />
            Temizle ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Selection limit warning */}
      {isAtLimit && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">
            En fazla 5 site seçebilirsiniz. Daha fazla seçmek için seçimi temizleyin.
          </span>
        </div>
      )}

      {selectedCampaigns.length > 0 && (
        <div className="sticky top-24 z-20 rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              Seçili Kampanyalar ({selectedIds.length}/5):
            </span>
            {selectedCampaigns.map((campaign) => (
              <Badge key={campaign.id} variant="secondary" className="gap-2 px-3 py-1">
                <span className="max-w-[220px] truncate">{campaign.title}</span>
                <button
                  onClick={() => toggleSelect(campaign.id)}
                  className="opacity-70 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))
        ) : (
          filteredCampaigns.slice(0, 50).map((campaign) => {
            const isSelected = selectedIds.includes(campaign.id)
            const qualitySignals = getCampaignQualitySignals(campaign)
            const startDate = resolveCampaignDateDisplay(
              campaign.validFrom,
              campaign.validFromSource,
              campaign.body,
              'start'
            )
            const endDate = resolveCampaignDateDisplay(
              campaign.validTo,
              campaign.validToSource,
              campaign.body,
              'end'
            )
            const isDisabled = !isSelected && isAtLimit

            return (
              <Card
                key={campaign.id}
                className={cn(
                  'cursor-pointer transition-all',
                  isSelected && 'ring-2 ring-primary',
                  isDisabled && 'opacity-50 cursor-not-allowed'
                )}
                onClick={() => !isDisabled && toggleSelect(campaign.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-medium line-clamp-2">
                      {campaign.title}
                    </CardTitle>
                    {favorites.includes(campaign.id) && (
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{campaign.site?.name}</p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">Tür:</span> {getCampaignTypeLabel(campaign)}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(campaign.sentiment || campaign.aiSentiment) && (
                      <Badge
                        className={getSentimentColor(
                          (campaign.sentiment || campaign.aiSentiment) as string
                        )}
                      >
                        {getDisplaySentimentLabel(
                          (campaign.sentiment || campaign.aiSentiment) as string
                        )}
                      </Badge>
                    )}
                    <StatusBadge status={campaign.status} />
                    {qualitySignals.slice(0, 1).map((signal) => (
                      <Badge
                        key={signal.code}
                        variant={signal.variant === 'warning' ? 'warning' : 'info'}
                      >
                        {signal.label}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div>Başlangıç: {startDate.value || 'Belirsiz'}</div>
                    <div>Bitiş: {endDate.value || 'Belirsiz'}</div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => toggleSelect(campaign.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span
                      className={cn(
                        'text-sm',
                        isDisabled ? 'text-amber-600' : 'text-muted-foreground'
                      )}
                    >
                      {isDisabled
                        ? '5 site limitine ulaşıldı'
                        : 'Karşılaştırmak için seç'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {!isLoading && filteredCampaigns.length === 0 && (
        // FE-14: Empty state + somut aksiyon — aramayı temizle.
        <EmptyState
          title="Karşılaştırılacak kampanya bulunamadı"
          description="Arama ifadenizle eşleşen kampanya yok. Aramayı temizlemeyi veya farklı kelimelerle aramayı deneyin."
          action={
            search ? (
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                <X className="h-4 w-4 mr-1" />
                Aramayı temizle
              </Button>
            ) : null
          }
        />
      )}

      {/* Visual Side-by-Side Comparison View */}
      {selectedCampaigns.length >= 2 && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Görsel Karşılaştırma</h2>
            <Button onClick={exportToPDF} className="gap-2">
              <Download className="h-4 w-4" />
              PDF İndir
            </Button>
          </div>

          <div
            className="grid gap-6"
            style={{
              gridTemplateColumns: `repeat(${selectedCampaigns.length}, minmax(280px, 1fr))`,
            }}
          >
            {selectedCampaigns.map((campaign, index) => {
              const siteColor = SITE_COLORS[index % SITE_COLORS.length]
              const startDate = resolveCampaignDateDisplay(
                campaign.validFrom,
                campaign.validFromSource,
                campaign.body,
                'start'
              )
              const endDate = resolveCampaignDateDisplay(
                campaign.validTo,
                campaign.validToSource,
                campaign.body,
                'end'
              )
              const qualitySignals = getCampaignQualitySignals(campaign)
              const sentiment = campaign.sentiment || campaign.aiSentiment || 'neutral'
              const status = campaign.status || 'unknown'
              const bonusDisplay = getCampaignBonusRow(campaign)

              return (
                <div
                  key={campaign.id}
                  className={cn('rounded-xl border-2 overflow-hidden', siteColor.border)}
                >
                  <div
                    className={cn(
                      'px-4 py-3 text-center font-semibold',
                      siteColor.header,
                      siteColor.text
                    )}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      <span>{campaign.site?.name}</span>
                    </div>
                  </div>

                  <div className={cn('p-4 space-y-4', siteColor.bg)}>
                    <div className={cn('p-3 rounded-lg', siteColor.header)}>
                      <h3 className="font-medium text-sm line-clamp-2">{campaign.title}</h3>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', siteColor.header)}>
                          <Tag className={cn('h-4 w-4', siteColor.text)} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Tür</p>
                          <p className="text-sm font-medium">{getCampaignTypeLabel(campaign)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', siteColor.header)}>
                          <Trophy className={cn('h-4 w-4', siteColor.text)} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Bonus</p>
                          <p className="text-sm font-medium">{bonusDisplay}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', siteColor.header)}>
                          {sentiment === 'positive' ? (
                            <ThumbsUp className={cn('h-4 w-4', siteColor.text)} />
                          ) : sentiment === 'negative' ? (
                            <ThumbsDown className={cn('h-4 w-4', siteColor.text)} />
                          ) : (
                            <Minus className={cn('h-4 w-4', siteColor.text)} />
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Duygu</p>
                          <p className="text-sm font-medium">
                            {getDisplaySentimentLabel(sentiment)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', siteColor.header)}>
                          <Info className={cn('h-4 w-4', siteColor.text)} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Durum</p>
                          <p className="text-sm font-medium">{getDisplayStatusLabel(status)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', siteColor.header)}>
                          <Calendar className={cn('h-4 w-4', siteColor.text)} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Başlangıç</p>
                          <p className="text-sm font-medium">{startDate.value || 'Belirsiz'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', siteColor.header)}>
                          <Calendar className={cn('h-4 w-4', siteColor.text)} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Bitiş</p>
                          <p className="text-sm font-medium">{endDate.value || 'Belirsiz'}</p>
                        </div>
                      </div>

                      {qualitySignals.length > 0 && (
                        <div className="flex items-center gap-3">
                          <div className={cn('p-2 rounded-lg', siteColor.header)}>
                            <TrendingUp className={cn('h-4 w-4', siteColor.text)} />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Kalite Sinyalleri</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {qualitySignals.slice(0, 2).map((signal) => (
                                <Badge
                                  key={signal.code}
                                  variant="outline"
                                  className={cn('text-xs', siteColor.text)}
                                >
                                  {signal.label}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {comparisonAnalysis && comparisonAnalysis.some((a) => a.differences) && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Farklılıklar
              </h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-3 text-left font-medium">Özellik</th>
                      {selectedCampaigns.map((c, i) => (
                        <th
                          key={c.id}
                          className={cn(
                            'border p-3 text-left font-medium',
                            SITE_COLORS[i % SITE_COLORS.length].bg
                          )}
                        >
                          {c.site?.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonAnalysis.map((row, rowIndex) => {
                      if (!row.differences) return null
                      return (
                        <tr
                          key={row.field}
                          className={rowIndex % 2 === 1 ? 'bg-muted/40' : ''}
                        >
                          <td className="border p-3 font-medium">{row.field}</td>
                          {row.values.map((v, valIndex) => (
                            <td
                              key={`${row.field}-${valIndex}`}
                              className="border p-3 bg-red-50"
                            >
                              <span className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'w-2 h-2 rounded-full',
                                    SITE_COLORS[valIndex % SITE_COLORS.length].border.replace(
                                      'border-',
                                      'bg-'
                                    )
                                  )}
                                />
                                {v.value}
                              </span>
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Tablo Karşılaştırması</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-muted">
                    <th className="border p-3 text-left">Özellik</th>
                    {selectedCampaigns.map((c, i) => (
                      <th
                        key={c.id}
                        className={cn(
                          'border p-3 text-left',
                          SITE_COLORS[i % SITE_COLORS.length].bg
                        )}
                      >
                        {c.title.substring(0, 25)}...
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((row, index) => {
                    const normalizedValues = row.values.map((value) => value || '-')
                    const hasMissing = normalizedValues.some((value) => value === '-')
                    const allSame = new Set(normalizedValues).size === 1

                    return (
                      <tr key={row.label} className={index % 2 === 1 ? 'bg-muted/40' : ''}>
                        <td className="border p-3 font-medium">{row.label}</td>
                        {normalizedValues.map((value, valueIndex) => (
                          <td
                            key={`${row.label}-${valueIndex}`}
                            className={cn(
                              'border p-3',
                              hasMissing && value === '-' && 'bg-amber-50 text-amber-800',
                              !hasMissing && allSame && 'bg-emerald-50 text-emerald-800',
                              !allSame && value !== '-' && 'bg-red-50/50'
                            )}
                          >
                            {value}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Tab 2 — Marka vs Marka
// ---------------------------------------------------------------------------

function BrandCompareTab() {
  const [siteAId, setSiteAId] = useState<string>('')
  const [siteBId, setSiteBId] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['competition'],
    queryFn: () => fetchCompetition(),
  })

  const rankings = useMemo(() => data?.siteRankings ?? [], [data?.siteRankings])

  // Dropdown options — alfabetik, öncelik farkı etmiyor (marka karşılaştırma
  // priority-agnostik olsun).
  const options = useMemo(
    () =>
      [...rankings].sort((a, b) =>
        a.site_name.localeCompare(b.site_name, 'tr')
      ),
    [rankings]
  )

  const siteA = rankings.find((s) => s.site_id === siteAId) ?? null
  const siteB = rankings.find((s) => s.site_id === siteBId) ?? null

  const bothSelected = siteA !== null && siteB !== null
  const sameSite = siteA !== null && siteB !== null && siteA.site_id === siteB.site_id

  /**
   * Her metrik için iki değeri karşılaştırır. Döndürür:
   *  - leader: 'a' | 'b' | 'tie'
   *  - deltaPct: nispi fark (b'ye göre a ne kadar yukarı/aşağı). null olursa göstermiyoruz.
   */
  const compareMetric = (
    aVal: number | null | undefined,
    bVal: number | null | undefined,
    higherIsBetter = true
  ): { leader: 'a' | 'b' | 'tie'; deltaAbs: number | null; deltaPct: number | null } => {
    const a = typeof aVal === 'number' && Number.isFinite(aVal) ? aVal : 0
    const b = typeof bVal === 'number' && Number.isFinite(bVal) ? bVal : 0
    if (a === b) return { leader: 'tie', deltaAbs: 0, deltaPct: 0 }
    let leader: 'a' | 'b'
    if (higherIsBetter) leader = a > b ? 'a' : 'b'
    else leader = a < b ? 'a' : 'b'
    const deltaAbs = a - b
    const base = Math.max(Math.abs(a), Math.abs(b))
    const deltaPct = base > 0 ? (deltaAbs / base) * 100 : null
    return { leader, deltaAbs, deltaPct }
  }

  // Her kart için kaç metrikte lider sayımız — border highlight için.
  const metricWins = useMemo(() => {
    if (!bothSelected || !siteA || !siteB) return { a: 0, b: 0, ties: 0 }
    let a = 0
    let b = 0
    let ties = 0
    for (const m of BRAND_METRICS) {
      const aVal = (siteA as unknown as Record<string, number>)[m.key]
      const bVal = (siteB as unknown as Record<string, number>)[m.key]
      const res = compareMetric(aVal, bVal, m.higherIsBetter ?? true)
      if (res.leader === 'a') a++
      else if (res.leader === 'b') b++
      else ties++
    }
    return { a, b, ties }
  }, [bothSelected, siteA, siteB])

  return (
    <main className="p-6 space-y-6">
      {/* Site pickers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Marka Seç</CardTitle>
          <p className="text-xs text-muted-foreground">
            {`İki marka seç; toplam kampanya, bonus ve kategori çeşitliliği üzerinden karşılaştırma gör.`}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Marka A</label>
              <Select
                value={siteAId}
                onChange={(e) => setSiteAId(e.target.value)}
                disabled={isLoading}
              >
                <option value="">Seç…</option>
                {options.map((s) => (
                  <option key={s.site_id} value={s.site_id} disabled={s.site_id === siteBId}>
                    {s.site_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Marka B</label>
              <Select
                value={siteBId}
                onChange={(e) => setSiteBId(e.target.value)}
                disabled={isLoading}
              >
                <option value="">Seç…</option>
                {options.map((s) => (
                  <option key={s.site_id} value={s.site_id} disabled={s.site_id === siteAId}>
                    {s.site_name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {sameSite && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Aynı marka seçildi. Lütfen iki farklı marka seçin.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hint / empty state */}
      {!bothSelected && (
        <EmptyState
          title="İki marka seçin"
          description="Yukarıdaki iki dropdown'dan farklı markalar seçerek geniş metrik karşılaştırması görebilirsiniz."
        />
      )}

      {/* Comparison cards */}
      {bothSelected && !sameSite && siteA && siteB && (
        <div className="grid gap-6 md:grid-cols-2">
          {[{ site: siteA, role: 'a' as const }, { site: siteB, role: 'b' as const }].map(
            ({ site, role }) => {
              const other = role === 'a' ? siteB : siteA
              const winsForThis = role === 'a' ? metricWins.a : metricWins.b
              const winsForOther = role === 'a' ? metricWins.b : metricWins.a
              const isOverallLeader =
                winsForThis > winsForOther && winsForThis > 0

              return (
                <Card
                  key={site.site_id}
                  className={cn(
                    'relative overflow-hidden',
                    isOverallLeader && 'border-t-4 border-t-emerald-500'
                  )}
                >
                  {isOverallLeader && (
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-emerald-500 text-white px-2 py-1 text-xs font-semibold shadow">
                      <Trophy className="h-3 w-3" />
                      <span>Lider ({winsForThis}/{BRAND_METRICS.length})</span>
                    </div>
                  )}
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-lg truncate">
                          {getSiteDisplayName(site.site_code, site.site_name)}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">{site.site_code}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <MomentumBadge
                        direction={site.momentum_direction}
                        score={site.momentum_score}
                      />
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
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      {BRAND_METRICS.map((metric) => {
                        const thisVal = (site as unknown as Record<string, number>)[metric.key]
                        const otherVal = (other as unknown as Record<string, number>)[metric.key]
                        const cmp = compareMetric(thisVal, otherVal, metric.higherIsBetter ?? true)
                        const isWinner =
                          (cmp.leader === 'a' && role === 'a') ||
                          (cmp.leader === 'b' && role === 'b')
                        const isTie = cmp.leader === 'tie'

                        const bgTone = isTie
                          ? 'bg-muted/40 text-muted-foreground border-border'
                          : isWinner
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border-amber-200'

                        // Delta line for non-leader / non-tie
                        let deltaLabel: string | null = null
                        if (!isTie) {
                          const sign = isWinner ? '+' : '−'
                          if (
                            cmp.deltaPct !== null &&
                            Number.isFinite(cmp.deltaPct) &&
                            Math.abs(cmp.deltaPct) >= 1
                          ) {
                            deltaLabel = `${sign}${Math.abs(Math.round(cmp.deltaPct))}% rakibe göre`
                          } else if (cmp.deltaAbs !== null) {
                            const abs = Math.abs(cmp.deltaAbs)
                            if (metric.key === 'avg_bonus' || metric.key === 'total_bonus') {
                              deltaLabel = `${sign}${formatCurrencyCompact(abs)} rakibe göre`
                            } else if (metric.key === 'active_rate') {
                              deltaLabel = `${sign}${Math.round(abs * 100)} puan`
                            } else {
                              deltaLabel = `${sign}${Math.round(abs)} rakibe göre`
                            }
                          }
                        } else {
                          deltaLabel = 'Beraberlik'
                        }

                        return (
                          <div
                            key={metric.key}
                            className={cn('rounded-lg border p-3 space-y-1', bgTone)}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-[11px] uppercase tracking-wide opacity-75">
                                {metric.label}
                              </p>
                              {isWinner && <Trophy className="h-3.5 w-3.5" />}
                            </div>
                            <p className="text-lg font-semibold">
                              {metric.format(thisVal as number | null | undefined)}
                            </p>
                            {deltaLabel && (
                              <p className="text-[11px] opacity-75">{deltaLabel}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )
            }
          )}
        </div>
      )}
    </main>
  )
}

export default CompareClient
