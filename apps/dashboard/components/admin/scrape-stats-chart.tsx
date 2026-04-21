'use client'

import { useMemo } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { SectionHeader } from '@/components/ui/section-header'

type ScrapeStatsData = {
  date: string
  successRate: number
  successCount: number
  failureCount: number
  avgDuration?: number
}

type ScrapeStatsChartProps = {
  data: ScrapeStatsData[]
  isLoading?: boolean
}

export function ScrapeStatsChart({ data, isLoading }: ScrapeStatsChartProps) {
  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return { avgSuccessRate: 0, avgDuration: 0 }
    }
    const totalSuccessRate = data.reduce((sum, d) => sum + d.successRate, 0) / data.length
    const totalDuration = data.reduce((sum, d) => sum + (d.avgDuration || 0), 0) / data.length
    return {
      avgSuccessRate: Math.round(totalSuccessRate * 10) / 10,
      avgDuration: Math.round(totalDuration),
    }
  }, [data])

  const formatDuration = (minutes?: number) => {
    if (!minutes) return '-'
    const mins = Math.floor(minutes)
    const secs = Math.round((minutes - mins) * 60)
    return `${mins}d ${secs}s`
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader
            title="Scrape Başarı Oranı"
            description="Son 30 günün scrape success rate (%) grafiği"
          />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] bg-muted/50 rounded-xl animate-pulse" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <SectionHeader
            title="Scrape İstatistikleri"
            description="Son 30 günün scrape başarı oranı ve sonuçları"
          />
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Ort. Başarı: <span className="font-semibold">{stats.avgSuccessRate}%</span></span>
            </div>
            <div className="text-muted-foreground">
              Ort. Süre: <span className="font-semibold">{formatDuration(stats.avgDuration)}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data && data.length > 0 ? (
          <div className="space-y-6">
            {/* Success Rate Line Chart */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Başarı Oranı (%)</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => {
                      const date = new Date(value)
                      return `${date.getMonth() + 1}/${date.getDate()}`
                    }}
                  />
                  <YAxis domain={[0, 100]} />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString('tr-TR')}
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Başarı Oranı']}
                  />
                  <Line
                    type="monotone"
                    dataKey="successRate"
                    stroke="#059669"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Success vs Failure Bar Chart */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Başarılı / Başarısız Sayısı</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => {
                      const date = new Date(value)
                      return `${date.getMonth() + 1}/${date.getDate()}`
                    }}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(value) => new Date(value).toLocaleDateString('tr-TR')}
                  />
                  <Legend />
                  <Bar dataKey="successCount" name="Başarılı" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="failureCount" name="Başarısız" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Veri bulunamadı
          </div>
        )}
      </CardContent>
    </Card>
  )
}
