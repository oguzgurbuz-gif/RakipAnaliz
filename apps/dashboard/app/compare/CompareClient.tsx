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
import { getCampaignTypeLabel, getCampaignQualitySignals, getDisplaySentimentLabel } from '@/lib/campaign-presentation'
import { formatDate, getSentimentColor, getStatusColor, cn } from '@/lib/utils'
import { Search, Star, X } from 'lucide-react'

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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
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
          values: selectedCampaigns.map((c) => c.site?.name || '-'),
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
          values: selectedCampaigns.map((c) => c.status),
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
        {selectedCampaigns.length > 0 && (
          <div className="sticky top-24 z-20 rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Seçili Kampanyalar:</span>
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
              return (
                <Card
                  key={campaign.id}
                  className={cn('cursor-pointer transition-all', isSelected && 'ring-2 ring-primary')}
                  onClick={() => toggleSelect(campaign.id)}
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
                        <Badge className={getSentimentColor(campaign.sentiment || campaign.aiSentiment || 'neutral')}>
                          {getDisplaySentimentLabel(campaign.sentiment || campaign.aiSentiment)}
                        </Badge>
                      )}
                      <Badge className={cn(getStatusColor(campaign.status))}>{campaign.status}</Badge>
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
                        onChange={() => toggleSelect(campaign.id)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm text-muted-foreground">Karşılaştırmak için seç</span>
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

        {selectedCampaigns.length >= 2 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Karşılaştırma Görünümü</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse rounded-lg border">
                <thead>
                  <tr className="bg-muted">
                    <th className="border p-3 text-left">Özellik</th>
                    {selectedCampaigns.map(c => (
                      <th key={c.id} className="border p-3 text-left">{c.title.substring(0, 30)}...</th>
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
                              !allSame && value !== '-' && 'bg-blue-50/60'
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
        )}
      </main>
    </div>
  )
}

export default CompareClient
