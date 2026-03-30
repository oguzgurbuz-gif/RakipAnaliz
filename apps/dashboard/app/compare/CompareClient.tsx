'use client'

import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { fetchCampaigns } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, getSentimentColor, getStatusColor, cn } from '@/lib/utils'
import { Star, X } from 'lucide-react'

function CompareClient() {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Kampanya Karşılaştırma</h1>
        {selectedIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
            <X className="h-4 w-4 mr-1" />
            Temizle ({selectedIds.length})
          </Button>
        )}
      </header>

      <main className="p-6">
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardHeader><div className="h-6 w-32 bg-muted animate-pulse rounded" /></CardHeader>
                <CardContent><div className="h-4 w-full bg-muted animate-pulse rounded" /></CardContent>
              </Card>
            ))
          ) : (
            data?.data.slice(0, 50).map(campaign => {
              const isSelected = selectedIds.includes(campaign.id)
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
                    {(campaign.metadata as any)?.ai_analysis?.campaign_type ? (
                      <div className="text-sm"><span className="font-medium">Tür:</span> {(campaign.metadata as any)?.ai_analysis?.campaign_type}</div>
                    ) : campaign.category && (
                      <div className="text-sm"><span className="font-medium">Kategori:</span> {campaign.category}</div>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {(campaign.sentiment || campaign.aiSentiment) && (
                        <Badge className={getSentimentColor(campaign.sentiment || campaign.aiSentiment || 'neutral')}>
                          {campaign.sentiment || campaign.aiSentiment}
                        </Badge>
                      )}
                      <Badge className={cn(getStatusColor(campaign.status))}>{campaign.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <div>Geçerlilik: {formatDate(campaign.validFrom || campaign.firstSeen)} - {formatDate(campaign.validTo || campaign.lastSeen)}</div>
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
                  <tr>
                    <td className="border p-3 font-medium">Site</td>
                    {selectedCampaigns.map(c => <td key={c.id} className="border p-3">{c.site?.name}</td>)}
                  </tr>
                  <tr className="bg-muted/50">
                    <td className="border p-3 font-medium">Tür</td>
                    {selectedCampaigns.map(c => <td key={c.id} className="border p-3">{c.category || '-'}</td>)}
                  </tr>
                  <tr>
                    <td className="border p-3 font-medium">Duygu</td>
                    {selectedCampaigns.map(c => (
                      <td key={c.id} className="border p-3">
                        <Badge className={getSentimentColor(c.sentiment || c.aiSentiment || 'neutral')}>
                          {c.sentiment || c.aiSentiment || '-'}
                        </Badge>
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-muted/50">
                    <td className="border p-3 font-medium">Durum</td>
                    {selectedCampaigns.map(c => (
                      <td key={c.id} className="border p-3">
                        <Badge className={cn(getStatusColor(c.status))}>{c.status}</Badge>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border p-3 font-medium">Başlangıç</td>
                    {selectedCampaigns.map(c => <td key={c.id} className="border p-3">{formatDate(c.validFrom || c.firstSeen)}</td>)}
                  </tr>
                  <tr className="bg-muted/50">
                    <td className="border p-3 font-medium">Bitiş</td>
                    {selectedCampaigns.map(c => <td key={c.id} className="border p-3">{formatDate(c.validTo || c.lastSeen)}</td>)}
                  </tr>
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