'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { fetchCampaigns } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { resolveCampaignDateDisplay } from '@/lib/campaign-dates'
import { getCampaignTypeLabel, getCampaignQualitySignals, getDisplaySentimentLabel, getDisplayStatusLabel } from '@/lib/campaign-presentation'
import { formatDate, getSentimentColor, cn } from '@/lib/utils'
import { StatusBadge } from '@/components/campaign/status-badge'
import { Search, Star, X, Download, AlertTriangle, Calendar, Tag, ThumbsUp, ThumbsDown, Minus, TrendingUp, Info, CheckCircle } from 'lucide-react'
import { jsPDF } from 'jspdf'

// FE-2/FE-17: Site code to friendly name mapping
const SITE_FRIENDLY_NAMES: Record<string, string> = {
  bitalih: 'Bitalih',
  nesine: 'Nesine',
  sondzulyuk: 'Sondüzlük',
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

// Color palette for site cards (up to 5 sites)
const SITE_COLORS = [
  { bg: 'bg-blue-100', border: 'border-blue-400', text: 'text-blue-800', header: 'bg-blue-200' },
  { bg: 'bg-green-100', border: 'border-green-400', text: 'text-green-800', header: 'bg-green-200' },
  { bg: 'bg-purple-100', border: 'border-purple-400', text: 'text-purple-800', header: 'bg-purple-200' },
  { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-800', header: 'bg-orange-200' },
  { bg: 'bg-pink-100', border: 'border-pink-400', text: 'text-pink-800', header: 'bg-pink-200' },
]

function CompareClient() {
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
      setSelectedIds(prev => prev.filter(x => x !== id))
    } else if (!isAtLimit) {
      setSelectedIds(prev => [...prev, id])
    }
  }

  const selectedCampaigns = data?.data.filter(c => selectedIds.includes(c.id)) || []
  const filteredCampaigns = (data?.data || []).filter((campaign) =>
    !search ||
    campaign.title.toLowerCase().includes(search.toLowerCase()) ||
    campaign.site?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const compareRows = selectedCampaigns.length >= 2
    ? [
        {
          label: 'Site',
          values: selectedCampaigns.map((c) => SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name || '-'),
        },
        {
          label: 'Tür',
          values: selectedCampaigns.map((c) => getCampaignTypeLabel(c)),
        },
        {
          label: 'Duygu',
          values: selectedCampaigns.map((c) => getDisplaySentimentLabel(c.sentiment || c.aiSentiment)),
        },
        {
          label: 'Durum',
          values: selectedCampaigns.map((c) => getDisplayStatusLabel(c.status)),
        },
        {
          label: 'Başlangıç',
          values: selectedCampaigns.map((c) => resolveCampaignDateDisplay(c.validFrom, c.validFromSource, c.body, 'start').value || '-'),
        },
        {
          label: 'Bitiş',
          values: selectedCampaigns.map((c) => resolveCampaignDateDisplay(c.validTo, c.validToSource, c.body, 'end').value || '-'),
        },
      ]
    : []

  // Generate comparison analysis
  const generateComparisonAnalysis = () => {
    if (selectedCampaigns.length < 2) return null

    const analysis: { field: string; values: { site: string; value: string }[]; differences: boolean }[] = []
    
    // Compare campaign titles
    const titles = selectedCampaigns.map((c, i) => ({ site: SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name || '-', value: c.title }))
    analysis.push({ field: 'Kampanya Adı', values: titles, differences: new Set(titles.map(t => t.value)).size > 1 })

    // Compare types
    const types = selectedCampaigns.map((c) => ({ site: SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name || '-', value: getCampaignTypeLabel(c) }))
    analysis.push({ field: 'Tür', values: types, differences: new Set(types.map(t => t.value)).size > 1 })

    // Compare sentiments
    const sentiments = selectedCampaigns.map((c) => ({ site: SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name || '-', value: getDisplaySentimentLabel(c.sentiment || c.aiSentiment) }))
    analysis.push({ field: 'Duygu', values: sentiments, differences: new Set(sentiments.map(s => s.value)).size > 1 })

    // Compare start dates
    const starts = selectedCampaigns.map((c) => ({ site: SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name || '-', value: resolveCampaignDateDisplay(c.validFrom, c.validFromSource, c.body, 'start').value || '-' }))
    analysis.push({ field: 'Başlangıç', values: starts, differences: new Set(starts.map(s => s.value)).size > 1 })

    // Compare end dates
    const ends = selectedCampaigns.map((c) => ({ site: SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name || '-', value: resolveCampaignDateDisplay(c.validTo, c.validToSource, c.body, 'end').value || '-' }))
    analysis.push({ field: 'Bitiş', values: ends, differences: new Set(ends.map(e => e.value)).size > 1 })

    return analysis
  }

  const comparisonAnalysis = generateComparisonAnalysis()

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let yPos = 20

    // Header
    doc.setFontSize(20)
    doc.setTextColor(40, 40, 40)
    doc.text('Karşılaştırma Raporu', pageWidth / 2, yPos, { align: 'center' })
    
    yPos += 10
    doc.setFontSize(12)
    doc.setTextColor(100, 100, 100)
    doc.text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, pageWidth / 2, yPos, { align: 'center' })

    yPos += 15

    // Company Logo Placeholder
    doc.setFillColor(240, 240, 240)
    doc.rect(20, yPos, 30, 20, 'F')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('LOGO', 27, yPos + 12, { align: 'center' })

    yPos += 30

    // Selected sites
    doc.setFontSize(14)
    doc.setTextColor(40, 40, 40)
    doc.text(`Seçili Siteler: ${selectedCampaigns.map(c => SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name).join(', ')}`, 20, yPos)
    
    yPos += 15

    // Table header
    doc.setFillColor(60, 60, 60)
    doc.rect(20, yPos, pageWidth - 40, 10, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(10)
    doc.text('Özellik', 25, yPos + 7)
    
    selectedCampaigns.forEach((c, i) => {
      const xPos = 60 + (i * 30)
      doc.text(`${SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name}`.substring(0, 15), xPos, yPos + 7)
    })

    yPos += 10

    // Table content
    doc.setFontSize(9)
    compareRows.forEach((row, rowIndex) => {
      if (yPos > 270) {
        doc.addPage()
        yPos = 20
      }

      // Alternating row background
      if (rowIndex % 2 === 1) {
        doc.setFillColor(248, 248, 248)
        doc.rect(20, yPos, pageWidth - 40, 8, 'F')
      }

      doc.setTextColor(60, 60, 60)
      doc.text(row.label, 25, yPos + 6)

      row.values.forEach((value, colIndex) => {
        const xPos = 60 + (colIndex * 30)
        // Highlight differences
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

    // Campaign details section
    yPos += 15
    doc.setFontSize(14)
    doc.setTextColor(40, 40, 40)
    doc.text('Kampanya Detayları', 20, yPos)
    yPos += 10

    selectedCampaigns.forEach((c, index) => {
      if (yPos > 260) {
        doc.addPage()
        yPos = 20
      }

      const siteColor = SITE_COLORS[index % SITE_COLORS.length]
      
      // Site header
      doc.setFillColor(60, 60, 60)
      doc.rect(20, yPos, pageWidth - 40, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.text(`${SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name} - ${c.title}`.substring(0, 70), 25, yPos + 6)
      
      yPos += 8

      const details = [
        `Tür: ${getCampaignTypeLabel(c)}`,
        `Duygu: ${getDisplaySentimentLabel(c.sentiment || c.aiSentiment)}`,
        `Durum: ${getDisplayStatusLabel(c.status)}`,
        `Başlangıç: ${resolveCampaignDateDisplay(c.validFrom, c.validFromSource, c.body, 'start').value || 'Belirsiz'}`,
        `Bitiş: ${resolveCampaignDateDisplay(c.validTo, c.validToSource, c.body, 'end').value || 'Belirsiz'}`,
      ]

      details.forEach((detail) => {
        doc.setTextColor(60, 60, 60)
        doc.text(detail, 25, yPos + 5)
        yPos += 6
      })

      yPos += 5
    })

    // Footer
    yPos = doc.internal.pageSize.getHeight() - 10
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('RakipAnaliz - Otomatik Oluşturuldu', pageWidth / 2, yPos, { align: 'center' })

    doc.save('karsilastirma-raporu.pdf')
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Kampanya Karşılaştırma"
        description="Kampanyaları seçin, filtreleyin ve farkları aynı tabloda hızlıca görün."
        actions={selectedIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
            <X className="h-4 w-4 mr-1" />
            Temizle ({selectedIds.length})
          </Button>
        )}
      >
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kampanya veya site ara..."
            className="pl-9"
          />
        </div>
      </PageHeader>

      <main className="p-6 space-y-6">
        {/* Selection limit warning */}
        {isAtLimit && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">En fazla 5 site seçebilirsiniz. Daha fazla seçmek için seçimi temizleyin.</span>
          </div>
        )}

        {selectedCampaigns.length > 0 && (
          <div className="sticky top-24 z-20 rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Seçili Kampanyalar ({selectedIds.length}/5):</span>
              {selectedCampaigns.map((campaign) => (
                <Badge key={campaign.id} variant="secondary" className="gap-2 px-3 py-1">
                  <span className="max-w-[220px] truncate">{campaign.title}</span>
                  <button onClick={() => toggleSelect(campaign.id)} className="opacity-70 hover:opacity-100">
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
                <CardHeader><div className="h-6 w-32 bg-muted animate-pulse rounded" /></CardHeader>
                <CardContent><div className="h-4 w-full bg-muted animate-pulse rounded" /></CardContent>
              </Card>
            ))
          ) : (
            filteredCampaigns.slice(0, 50).map(campaign => {
              const isSelected = selectedIds.includes(campaign.id)
              const qualitySignals = getCampaignQualitySignals(campaign)
              const startDate = resolveCampaignDateDisplay(campaign.validFrom, campaign.validFromSource, campaign.body, 'start')
              const endDate = resolveCampaignDateDisplay(campaign.validTo, campaign.validToSource, campaign.body, 'end')
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
                    <div className="text-sm"><span className="font-medium">Tür:</span> {getCampaignTypeLabel(campaign)}</div>
                    <div className="flex gap-2 flex-wrap">
                      {(campaign.sentiment || campaign.aiSentiment) && (
                        <Badge className={getSentimentColor((campaign.sentiment || campaign.aiSentiment) as string)}>
                          {getDisplaySentimentLabel((campaign.sentiment || campaign.aiSentiment) as string)}
                        </Badge>
                      )}
                      <StatusBadge status={campaign.status} />
                      {qualitySignals.slice(0, 1).map((signal) => (
                        <Badge key={signal.code} variant={signal.variant === 'warning' ? 'warning' : 'info'}>
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
                      <span className={cn("text-sm", isDisabled ? "text-amber-600" : "text-muted-foreground")}>
                        {isDisabled ? "5 site limitine ulaşıldı" : "Karşılaştırmak için seç"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>

        {!isLoading && filteredCampaigns.length === 0 && (
          <EmptyState title="Karşılaştırılacak kampanya bulunamadı" description="Arama ifadenizi veya filtre yaklaşımınızı değiştirin." />
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

            {/* Color-coded site columns */}
            <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${selectedCampaigns.length}, minmax(280px, 1fr))` }}>
              {selectedCampaigns.map((campaign, index) => {
                const siteColor = SITE_COLORS[index % SITE_COLORS.length]
                const startDate = resolveCampaignDateDisplay(campaign.validFrom, campaign.validFromSource, campaign.body, 'start')
                const endDate = resolveCampaignDateDisplay(campaign.validTo, campaign.validToSource, campaign.body, 'end')
                const qualitySignals = getCampaignQualitySignals(campaign)
                const sentiment = campaign.sentiment || campaign.aiSentiment || 'neutral'
                const status = campaign.status || 'unknown'

                return (
                  <div key={campaign.id} className={cn('rounded-xl border-2 overflow-hidden', siteColor.border)}>
                    {/* Site header */}
                    <div className={cn('px-4 py-3 text-center font-semibold', siteColor.header, siteColor.text)}>
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        <span>{SITE_FRIENDLY_NAMES[campaign.site?.name?.toLowerCase() || ''] || campaign.site?.name}</span>
                      </div>
                    </div>

                    <div className={cn('p-4 space-y-4', siteColor.bg)}>
                      {/* Campaign title */}
                      <div className={cn('p-3 rounded-lg', siteColor.header)}>
                        <h3 className="font-medium text-sm line-clamp-2">{campaign.title}</h3>
                      </div>

                      {/* Campaign info with icons */}
                      <div className="space-y-3">
                        {/* Type */}
                        <div className="flex items-center gap-3">
                          <div className={cn('p-2 rounded-lg', siteColor.header)}>
                            <Tag className={cn('h-4 w-4', siteColor.text)} />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Tür</p>
                            <p className="text-sm font-medium">{getCampaignTypeLabel(campaign)}</p>
                          </div>
                        </div>

                        {/* Sentiment */}
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
                            <p className="text-sm font-medium">{getDisplaySentimentLabel(sentiment)}</p>
                          </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-3">
                          <div className={cn('p-2 rounded-lg', siteColor.header)}>
                            <Info className={cn('h-4 w-4', siteColor.text)} />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Durum</p>
                            <p className="text-sm font-medium">{getDisplayStatusLabel(status)}</p>
                          </div>
                        </div>

                        {/* Start Date */}
                        <div className="flex items-center gap-3">
                          <div className={cn('p-2 rounded-lg', siteColor.header)}>
                            <Calendar className={cn('h-4 w-4', siteColor.text)} />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Başlangıç</p>
                            <p className="text-sm font-medium">{startDate.value || 'Belirsiz'}</p>
                          </div>
                        </div>

                        {/* End Date */}
                        <div className="flex items-center gap-3">
                          <div className={cn('p-2 rounded-lg', siteColor.header)}>
                            <Calendar className={cn('h-4 w-4', siteColor.text)} />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Bitiş</p>
                            <p className="text-sm font-medium">{endDate.value || 'Belirsiz'}</p>
                          </div>
                        </div>

                        {/* Quality Signals */}
                        {qualitySignals.length > 0 && (
                          <div className="flex items-center gap-3">
                            <div className={cn('p-2 rounded-lg', siteColor.header)}>
                              <TrendingUp className={cn('h-4 w-4', siteColor.text)} />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Kalite Sinyalleri</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {qualitySignals.slice(0, 2).map((signal) => (
                                  <Badge key={signal.code} variant="outline" className={cn('text-xs', siteColor.text)}>
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

            {/* Highlighted Differences Table */}
            {comparisonAnalysis && comparisonAnalysis.some(a => a.differences) && (
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
                          <th key={c.id} className={cn('border p-3 text-left font-medium', SITE_COLORS[i % SITE_COLORS.length].bg)}>
                            {SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase() || ''] || c.site?.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonAnalysis.map((row, rowIndex) => {
                        if (!row.differences) return null
                        return (
                          <tr key={row.field} className={rowIndex % 2 === 1 ? 'bg-muted/40' : ''}>
                            <td className="border p-3 font-medium">{row.field}</td>
                            {row.values.map((v, valIndex) => (
                              <td key={`${row.field}-${valIndex}`} className="border p-3 bg-red-50">
                                <span className="flex items-center gap-2">
                                  <span className={cn('w-2 h-2 rounded-full', SITE_COLORS[valIndex % SITE_COLORS.length].border.replace('border-', 'bg-'))} />
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

            {/* Traditional Comparison Table */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-4">Tablo Karşılaştırması</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-3 text-left">Özellik</th>
                      {selectedCampaigns.map((c, i) => (
                        <th key={c.id} className={cn('border p-3 text-left', SITE_COLORS[i % SITE_COLORS.length].bg)}>
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
    </div>
  )
}

export default CompareClient
