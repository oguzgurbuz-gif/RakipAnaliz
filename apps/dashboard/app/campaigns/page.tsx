'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { CampaignTable } from '@/components/campaign/campaign-table'
import { CampaignFilters } from '@/components/campaign/campaign-filters'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { fetchCampaigns } from '@/lib/api'
import type { CampaignFilters as CampaignFiltersType, Campaign } from '@/types'
import { ChevronLeft, ChevronRight, Star, Download, Filter } from 'lucide-react'

export default function CampaignsPage() {
  const [filters, setFilters] = useState<CampaignFiltersType>({})
  const [page, setPage] = useState(1)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const [sites, setSites] = useState<{id: string, name: string}[]>([])

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

  const exportCSV = () => {
    const campaignsToExport = (showFavoritesOnly ? data?.data.filter(c => favorites.includes(c.id)) : data?.data) || []
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
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
          <h1 className="text-lg font-semibold">Kampanyalar</h1>
        </header>
        <main className="p-6">
          <ErrorDisplay error={error} onRetry={() => refetch()} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Kampanyalar</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Toplam: {data?.total ?? 0}
            {showFavoritesOnly && ` (${favorites.length} favoriler)`}
          </span>
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
        </div>
      </header>

      <main className="p-6 space-y-4">
        <CampaignFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          sites={sites}
        />

        {isLoading ? (
          <CampaignTable campaigns={[]} isLoading />
        ) : (
          <CampaignTable 
            campaigns={
              showFavoritesOnly 
                ? (data?.data.filter(c => favorites.includes(c.id)) || [])
                : (data?.data || [])
            } 
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
          />
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
