'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { InsightCard } from '@/components/ui/insight-card'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Crown, Target, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react'
import { getCategoryLabel } from '@/lib/category-labels'
import { cn } from '@/lib/utils'
import { fetchCompetition } from '@/lib/api'

export default function CompetitionPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [selectedCategory, setSelectedCategory] = useState(searchParams?.get('category') || '')
  const [showMatrix, setShowMatrix] = useState(false)
  const [showBonusTable, setShowBonusTable] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['competition', selectedCategory],
    queryFn: () => fetchCompetition(selectedCategory || undefined),
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Kampanya</TableHead>
                  <TableHead className="text-right">Aktif</TableHead>
                  <TableHead className="text-right">Aktif %</TableHead>
                  <TableHead className="text-right">Ort. Bonus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {siteRankings.slice(0, 10).map((site, idx) => (
                  <TableRow key={site.site_id}>
                    <TableCell className="font-medium">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {site.site_name}
                        {idx === 0 && <Badge variant="winner"><Crown className="h-3 w-3 mr-1" />Lider</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{site.total_campaigns}</TableCell>
                    <TableCell className="text-right">{site.active_campaigns}</TableCell>
                    <TableCell className="text-right">{(Number(site.active_rate) * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-mono">₺{Number(site.avg_bonus).toFixed(0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                                    'inline-flex min-w-[50px] flex-col items-center rounded-lg px-2 py-1',
                                    cell.is_winner && 'ring-1 ring-yellow-300'
                                  )}
                                  style={{ backgroundColor: `rgba(37, 99, 235, ${0.12 + intensity * 0.25})` }}
                                >
                                  <span className={cn('text-lg font-bold', cell.campaign_count === 0 && 'text-muted-foreground')}>
                                    {cell.campaign_count}
                                  </span>
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
                {(data?.bestDeals || []).slice(0, 6).map((deal) => (
                  <Card key={deal.campaign_id} className="border-border/70 bg-muted/10">
                    <CardContent className="p-4 space-y-2">
                      <div className="text-sm text-muted-foreground">{deal.site_name}</div>
                      <div className="font-medium line-clamp-2 text-sm">{deal.campaign_title}</div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">{getCategoryLabel(deal.category)}</Badge>
                        <Badge className={cn('text-xs', deal.status === 'active' && 'bg-green-100 text-green-800')}>
                          {deal.status}
                        </Badge>
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Bonus verisi bulunamadı.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
