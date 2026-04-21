'use client'

import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { SectionHeader } from '@/components/ui/section-header'

type QualityTrendData = {
  date: string
  qualityScore: number
}

type QualityTrendChartProps = {
  data: QualityTrendData[]
  isLoading?: boolean
  threshold?: number
}

const QUALITY_THRESHOLD = 80

export function QualityTrendChart({ data, isLoading, threshold = QUALITY_THRESHOLD }: QualityTrendChartProps) {
  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return { avg: 0, min: 0, max: 0 }
    }
    const scores = data.map(d => d.qualityScore)
    const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length
    const min = Math.min(...scores)
    const max = Math.max(...scores)
    return {
      avg: Math.round(avg * 10) / 10,
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
    }
  }, [data])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader
            title="Kalite Skoru Trendi"
            description="Son 30 günün quality score grafiği"
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
            title="Kalite Skoru Trendi"
            description="Son 30 günün quality score grafiği"
          />
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-muted-foreground">Ortalama: <span className="font-semibold">{stats.avg}%</span></span>
            </div>
            <div className="text-muted-foreground">
              Min: <span className="font-semibold">{stats.min}%</span>
            </div>
            <div className="text-muted-foreground">
              Max: <span className="font-semibold">{stats.max}%</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data && data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="qualityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
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
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Kalite Skoru']}
              />
              <ReferenceLine
                y={threshold}
                stroke="#dc2626"
                strokeDasharray="5 5"
                label={{
                  value: `Eşik ${threshold}%`,
                  position: 'right',
                  fill: '#dc2626',
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="qualityScore"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#qualityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Veri bulunamadı
          </div>
        )}
      </CardContent>
    </Card>
  )
}
