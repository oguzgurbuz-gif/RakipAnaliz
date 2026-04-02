'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Trophy, Target, TrendingUp, Award, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchCompetition, CompetitionData } from '@/lib/api'

function WinnerBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn('bg-yellow-100 text-yellow-800 border-yellow-300', className)}>
      <Crown className="h-3 w-3 mr-1" />
      En İyi
    </Badge>
  )
}

function StatCard({ icon: Icon, label, value, subValue, highlight }: {
  icon: React.ElementType
  label: string
  value: string | number
  subValue?: string
  highlight?: boolean
}) {
  return (
    <Card className={cn(highlight && 'border-yellow-400 bg-yellow-50/50')}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', highlight ? 'bg-yellow-100' : 'bg-muted')}>
            <Icon className={cn('h-5 w-5', highlight ? 'text-yellow-700' : 'text-muted-foreground')} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CompetitionPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['competition', selectedCategory],
    queryFn: () => fetchCompetition(selectedCategory || undefined),
  })

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="p-6">
            <p className="text-destructive">Veriler yüklenirken hata oluştu.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const allCategories = data?.categories || []
  const siteCodes = data?.sites.map(s => s.site_code) || []
  const siteRankingsByCampaigns = data?.siteRankings || []
  const siteRankingsByBonus = [...siteRankingsByCampaigns].sort((a, b) => Number(b.avg_bonus) - Number(a.avg_bonus))
  const topCampaignSite = siteRankingsByCampaigns[0]
  const topBonusSite = siteRankingsByBonus[0]

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Rekabet Analizi</h1>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor="category" className="text-sm text-muted-foreground">Tür:</label>
            <Select
              id="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-48"
            >
              <option value="">Tüm Türler</option>
              {allCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </Select>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><div className="h-20 bg-muted animate-pulse rounded" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Trophy}
                label="En Çok Kampanya"
                value={topCampaignSite?.site_name || '-'}
                subValue={`${topCampaignSite?.total_campaigns || 0} kampanya`}
                highlight
              />
              <StatCard
                icon={Target}
                label="En Yüksek Ort. Bonus"
                value={topBonusSite?.site_name || '-'}
                subValue={`₺${(Number(topBonusSite?.avg_bonus) || 0).toFixed(2)} ortalama`}
              />
              <StatCard
                icon={TrendingUp}
                label="En Aktif Tür"
                value={data?.comparisonTable[0]?.category || '-'}
                subValue={`${data?.comparisonTable[0]?.total_campaigns || 0} kampanya`}
              />
              <StatCard
                icon={Award}
                label="Toplam Site"
                value={data?.sites.length || 0}
                subValue={`${data?.categories.length} kategori`}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Tür Bazlı Karşılaştırma</CardTitle>
                  <CardDescription>Her türde en iyi performans gösteren site</CardDescription>
                </CardHeader>
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
                      {data?.comparisonTable.slice(0, 10).map((row) => (
                        <TableRow key={row.category}>
                          <TableCell className="font-medium">{row.category}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {row.best_site}
                              {row.best_site_campaigns > 0 && <WinnerBadge />}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{row.best_site_campaigns}</TableCell>
                          <TableCell className="text-right">{row.total_sites}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Site Sıralaması</CardTitle>
                  <CardDescription>Kampanya sayısına göre genel performans</CardDescription>
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteRankingsByCampaigns.slice(0, 10).map((site, idx) => (
                        <TableRow key={site.site_id}>
                          <TableCell className="font-medium">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {site.site_name}
                              {idx === 0 && <WinnerBadge />}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{site.total_campaigns}</TableCell>
                          <TableCell className="text-right">{site.active_campaigns}</TableCell>
                          <TableCell className="text-right">{(Number(site.active_rate) * 100).toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Site vs Site Matrisi</CardTitle>
                <CardDescription>Türlerdeki site performansları</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background">Tür</TableHead>
                        {siteCodes.slice(0, 8).map(code => (
                          <TableHead key={code} className="text-center">{code}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.categories.slice(0, 12).map(cat => (
                        <TableRow key={cat}>
                          <TableCell className="font-medium sticky left-0 bg-background">{cat}</TableCell>
                          {siteCodes.slice(0, 8).map(code => {
                            const cell = data?.siteMatrix[cat]?.[code]
                            return (
                              <TableCell key={code} className="text-center">
                                {cell ? (
                                  <div className={cn('inline-flex flex-col items-center', cell.is_winner && 'bg-yellow-100 rounded px-2 py-1')}>
                                    <span className={cn('text-lg font-bold', cell.campaign_count === 0 && 'text-muted-foreground')}>
                                      {cell.campaign_count}
                                    </span>
                                    {cell.is_winner && <Crown className="h-3 w-3 text-yellow-600" />}
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
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>En İyi Bonus / Fırsatlar</CardTitle>
                <CardDescription>En yüksek bonus sunan kampanyalar</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kampanya</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Tür</TableHead>
                      <TableHead className="text-right">Bonus Miktar</TableHead>
                      <TableHead className="text-right">Bonus %</TableHead>
                      <TableHead>Durum</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.bestDeals.map(deal => (
                      <TableRow key={deal.campaign_id}>
                        <TableCell className="font-medium max-w-xs truncate">{deal.campaign_title}</TableCell>
                        <TableCell>{deal.site_name}</TableCell>
                        <TableCell><Badge variant="outline">{deal.category}</Badge></TableCell>
                        <TableCell className="text-right font-mono">
                          {deal.bonus_amount ? `₺${deal.bonus_amount.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {deal.bonus_percentage ? `%${deal.bonus_percentage}` : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(
                            deal.status === 'active' && 'bg-green-100 text-green-800',
                            deal.status === 'ended' && 'bg-gray-100 text-gray-800',
                          )}>
                            {deal.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>En Çok Kampanya Sunan Siteler</CardTitle>
                  <CardDescription>Tür bazlı kampanya sayıları</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site</TableHead>
                        <TableHead className="text-right">Kampanya</TableHead>
                        <TableHead className="text-right">Ort. Bonus</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteRankingsByCampaigns.slice(0, 8).map(site => (
                        <TableRow key={site.site_id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {site.site_name}
                              {site.total_campaigns === topCampaignSite?.total_campaigns && <WinnerBadge />}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{site.total_campaigns}</TableCell>
                          <TableCell className="text-right font-mono">₺{Number(site.avg_bonus).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ortalama Bonus Miktarı by Site</CardTitle>
                  <CardDescription>Sitelerin ortalama bonus değerleri</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site</TableHead>
                        <TableHead className="text-right">Toplam Bonus</TableHead>
                        <TableHead className="text-right">Ort. Bonus</TableHead>
                        <TableHead className="text-right">Tür</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteRankingsByBonus
                        .slice(0, 8)
                        .map(site => (
                          <TableRow key={site.site_id}>
                            <TableCell className="font-medium">{site.site_name}</TableCell>
                            <TableCell className="text-right font-mono">
                              ₺{Number(site.total_bonus).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </TableCell>
                            <TableCell className="text-right font-mono">₺{Number(site.avg_bonus).toFixed(2)}</TableCell>
                            <TableCell className="text-right">{site.categories_count}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
