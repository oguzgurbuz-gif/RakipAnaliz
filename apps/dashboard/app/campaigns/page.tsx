'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { CampaignCard } from '@/components/campaign/campaign-card'
import { CampaignTable } from '@/components/campaign/campaign-table'
import { CampaignFilters } from '@/components/campaign/campaign-filters'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDisplay } from '@/components/ui/error'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { getCampaignQualitySignals } from '@/lib/campaign-presentation'
import { fetchCampaigns } from '@/lib/api'
import type { CampaignFilters as CampaignFiltersType, Campaign } from '@/types'
import { ChevronLeft, ChevronRight, Star, Download, LayoutGrid, TableProperties, CalendarClock, ShieldAlert, Activity } from 'lucide-react'

export default function CampaignsPage() {
  const [filters, setFilters] = useState<CampaignFiltersType>({})
  const [page, setPage] = useState(1)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const [sites, setSites] = useState<{id: string, name: string}[]>([])
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['campaigns', filters, page],
    queryFn: () => fetchCampaigns({ ...filters, page, limit: 20 }),
  })

  const handleFiltersChange = (newFilters: CampaignFiltersType) => {
    setFilters(newFilters)
    setPage(1)
  }

  const activeFilterEntries = Object.entries(filters).filter(([, value]) => value !== undefined && value !== '')
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

  const exportCSV = () => {
    const campaignsToExport = visibleCampaigns
    const headers = ['title', 'site', 'category', 'sentiment', 'valid_from', 'valid_to']
    const csvRows = [
      headers.join(','),
      ...campaignsToExport.map(c => [
        `"${(c.title || '').replace(/"/g, '""')}"`,
        `"${(c.site?.name || '').replace(/"/g, '""')}"`,
        `"${(c.category || '').replace(/"/g, '""')}"`,
        `"${(c.sentiment || c.aiSentiment || '').replace(/"/g, '""')}"`,
        `"${(c.validFrom || '').replace(/"/g, '""')}"`,
        `"${(c.validTo || '').replace(/"/g, '""')}"`,
      ].join(','))
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kampanyalar-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InsightCard title="Toplam Görünür Sonuç" value={data?.total ?? 0} description="Mevcut filtrelerle eşleşen toplam kayıt" />
          <InsightCard icon={Activity} title="Bu Sayfada Aktif" value={activeCount} description="Şu an aktif durumdaki kayıtlar" tone="positive" />
          <InsightCard icon={CalendarClock} title="Tarih Eksik" value={missingDateCount} description="Başlangıç veya bitiş tarihi eksik" tone="warning" />
          <InsightCard icon={ShieldAlert} title="Şüpheli Kayıt" value={suspiciousCount} description="Junk veya düşük güvenli scrape sonuçları" tone="warning" />
        </div>

        <CampaignFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          sites={sites}
        />

        {activeFilterEntries.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilterEntries.map(([key, value]) => (
              <span key={key} className="rounded-full border border-border/80 bg-background px-3 py-1 text-xs text-muted-foreground">
                {key}: {String(value)}
              </span>
            ))}
          </div>
        )}

        {isLoading ? (
          <CampaignTable campaigns={[]} isLoading />
        ) : visibleCampaigns.length === 0 ? (
          <EmptyState
            title="Kampanya bulunamadı"
            description="Seçili filtreler ve favori görünümü ile eşleşen kayıt yok. Filtreleri gevşetmeyi deneyin."
          />
        ) : viewMode === 'table' ? (
          <CampaignTable
            campaigns={visibleCampaigns}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
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
              onClick={() => setPage((p) => Math.max(1, p - 1))}
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
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
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
