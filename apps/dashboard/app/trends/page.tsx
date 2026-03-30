'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { fetchTrends } from '@/lib/api'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TrendingUp, Calendar, BarChart3, PieChart } from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', '#FFBB28', '#FF8042', '#888888']

interface TrendData {
  campaignsOverTime: { date: string; count: number }[]
  categoryByDate: Record<string, Record<string, number>>
  categoryDistribution: { category: string; count: number }[]
  sentimentDistribution: { sentiment: string; count: number }[]
  topSites: { siteName: string; campaignCount: number }[]
  valueScoresBySite: { siteName: string; avgValueScore: number }[]
  topCategoriesThisWeek: { category: string; count: number }[]
}

export default function TrendsPage() {
  const [days, setDays] = useState('30')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['trends', days],
    queryFn: () => fetchTrends(parseInt(days, 10)),
  })

  const handleRefresh = () => {
    refetch()
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={handleRefresh} />
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Trend Analizi</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Son (gün):</label>
            <Input
              type="number"
              min="7"
              max="90"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-20"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Yenile
          </Button>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Toplam Kampanya
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.campaignsOverTime?.reduce((acc, curr) => acc + curr.count, 0) ?? 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Günlük Ortalama
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.campaignsOverTime?.length
                  ? Math.round(
                      data.campaignsOverTime.reduce((acc, curr) => acc + curr.count, 0) /
                        data.campaignsOverTime.length
                    )
                  : 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Toplam Tür
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {data?.categoryDistribution?.length ?? 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Kampanya Trendi (Zaman İçinde)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data?.campaignsOverTime || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        const date = new Date(value)
                        return `${date.getMonth() + 1}/${date.getDate()}`
                      }}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Kampanya"
                      stroke="#8884d8"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="h-5 w-5" />
                Duygu Dağılımı
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPie>
                    <Pie
                      data={data?.sentimentDistribution || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name ?? ''}: ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {(data?.sentimentDistribution || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPie>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Tür Dağılımı
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data?.categoryDistribution?.slice(0, 10) || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    dataKey="category"
                    type="category"
                    width={150}
                    tickFormatter={(value) =>
                      value.length > 20 ? `${value.substring(0, 20)}...` : value
                    }
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" name="Kampanya Sayısı" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Bu Haftanın En İyi Türleri</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.topCategoriesThisWeek?.slice(0, 10).map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span>{item.category}</span>
                      <span className="text-muted-foreground">{item.count}</span>
                    </div>
                  ))}
                  {(!data?.topCategoriesThisWeek ||
                    data.topCategoriesThisWeek.length === 0) && (
                    <p className="text-sm text-muted-foreground">Veri yok</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>En Aktif Siteler</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.topSites?.slice(0, 10).map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span>{item.siteName}</span>
                      <span className="text-muted-foreground">{item.campaignCount}</span>
                    </div>
                  ))}
                  {(!data?.topSites || data.topSites.length === 0) && (
                    <p className="text-sm text-muted-foreground">Veri yok</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ortalama Değer Skoru (Site)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-6 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {data?.valueScoresBySite?.slice(0, 10).map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span>{item.siteName}</span>
                      <span className="text-muted-foreground">
                        {item.avgValueScore?.toFixed(1) ?? 'N/A'}
                      </span>
                    </div>
                  ))}
                  {(!data?.valueScoresBySite || data.valueScoresBySite.length === 0) && (
                    <p className="text-sm text-muted-foreground">Veri yok</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
