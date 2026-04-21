'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface SiteData {
  site_id: string
  site_name: string
  site_code: string
  total_campaigns: number
  active_campaigns: number
  avg_bonus: number
  total_bonus: number
  categories_count: number
  active_rate: number
  momentum_score: number
  momentum_direction: 'up' | 'down' | 'stable'
}

interface PositioningMapProps {
  sites: SiteData[]
  isLoading?: boolean
}

const DIRECTION_COLOR: Record<SiteData['momentum_direction'], string> = {
  up: '#22c55e',
  down: '#ef4444',
  stable: '#94a3b8',
}

const DIRECTION_LABEL: Record<SiteData['momentum_direction'], string> = {
  up: 'Yükseliş',
  down: 'Düşüş',
  stable: 'Stabil',
}

interface ScatterPoint {
  site_id: string
  site_code: string
  site_name: string
  x: number
  y: number
  z: number
  fill: string
  momentum_direction: SiteData['momentum_direction']
  momentum_score: number
  total_campaigns: number
  active_campaigns: number
  avg_bonus: number
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div className="rounded-md border bg-background/95 p-3 text-xs shadow-md backdrop-blur space-y-1">
      <div className="font-semibold text-sm">{p.site_name}</div>
      <div className="text-muted-foreground font-mono">{p.site_code}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1">
        <span className="text-muted-foreground">Çeşitlilik:</span>
        <span className="text-right tabular-nums">{p.x} kategori</span>
        <span className="text-muted-foreground">Ort. Bonus:</span>
        <span className="text-right tabular-nums">₺{Math.round(p.y).toLocaleString('tr-TR')}</span>
        <span className="text-muted-foreground">Toplam:</span>
        <span className="text-right tabular-nums">{p.total_campaigns} kampanya</span>
        <span className="text-muted-foreground">Aktif:</span>
        <span className="text-right tabular-nums">{p.active_campaigns}</span>
        <span className="text-muted-foreground">Momentum:</span>
        <span className="text-right tabular-nums">
          {DIRECTION_LABEL[p.momentum_direction]} ({p.momentum_score > 0 ? '+' : ''}
          {p.momentum_score}%)
        </span>
      </div>
      <div className="pt-1 text-[10px] text-muted-foreground italic">
        Detay için tıklayın
      </div>
    </div>
  )
}

export function PositioningMap({ sites, isLoading }: PositioningMapProps) {
  const router = useRouter()

  const { points, avgX, avgY } = useMemo(() => {
    const points: ScatterPoint[] = sites.map((s) => ({
      site_id: s.site_id,
      site_code: s.site_code,
      site_name: s.site_name,
      x: Number(s.categories_count) || 0,
      y: Number(s.avg_bonus) || 0,
      z: Math.max(20, Number(s.total_campaigns) || 0),
      fill: DIRECTION_COLOR[s.momentum_direction] ?? DIRECTION_COLOR.stable,
      momentum_direction: s.momentum_direction,
      momentum_score: Number(s.momentum_score) || 0,
      total_campaigns: Number(s.total_campaigns) || 0,
      active_campaigns: Number(s.active_campaigns) || 0,
      avg_bonus: Number(s.avg_bonus) || 0,
    }))

    const sumX = points.reduce((sum, p) => sum + p.x, 0)
    const sumY = points.reduce((sum, p) => sum + p.y, 0)
    return {
      points,
      avgX: points.length > 0 ? sumX / points.length : 0,
      avgY: points.length > 0 ? sumY / points.length : 0,
    }
  }, [sites])

  const maxZ = useMemo(
    () => Math.max(20, ...points.map((p) => p.z)),
    [points]
  )

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2D Konumlama Haritası</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    )
  }

  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2D Konumlama Haritası</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            Site verisi bulunamadı.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">2D Konumlama Haritası</CardTitle>
            <Badge variant="outline" className="text-xs">
              X: çeşitlilik · Y: ortalama bonus · büyüklük: kampanya · renk: momentum
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: DIRECTION_COLOR.up }} />
              <TrendingUp className="h-3 w-3 text-green-600" />
              Yükseliş
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: DIRECTION_COLOR.down }} />
              <TrendingDown className="h-3 w-3 text-red-600" />
              Düşüş
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: DIRECTION_COLOR.stable }}
              />
              <Minus className="h-3 w-3 text-gray-600" />
              Stabil
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 16, right: 32, bottom: 36, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                type="number"
                dataKey="x"
                name="Kategori Sayısı"
                tick={{ fontSize: 11 }}
                label={{
                  value: 'Kategori Çeşitliliği',
                  position: 'insideBottom',
                  offset: -16,
                  style: { fontSize: 11, fill: '#64748b' },
                }}
                allowDecimals={false}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Ortalama Bonus"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `₺${Math.round(Number(v))}`}
                label={{
                  value: 'Ortalama Bonus (TL)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 11, fill: '#64748b' },
                }}
              />
              <ZAxis type="number" dataKey="z" range={[60, Math.max(400, maxZ * 8)]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
              {avgX > 0 && (
                <ReferenceLine
                  x={avgX}
                  stroke="#cbd5e1"
                  strokeDasharray="4 4"
                  label={{ value: 'Ort. çeşitlilik', position: 'top', style: { fontSize: 10, fill: '#94a3b8' } }}
                />
              )}
              {avgY > 0 && (
                <ReferenceLine
                  y={avgY}
                  stroke="#cbd5e1"
                  strokeDasharray="4 4"
                  label={{ value: 'Ort. bonus', position: 'right', style: { fontSize: 10, fill: '#94a3b8' } }}
                />
              )}
              <Scatter
                name="Siteler"
                data={points}
                onClick={(item: unknown) => {
                  // Recharts wraps each scatter datum so the original row sits
                  // either on `payload` or directly on the item depending on
                  // chart version. Probe both.
                  const candidate = (item && typeof item === 'object'
                    ? ((item as { payload?: unknown }).payload ?? item)
                    : item) as Partial<ScatterPoint> | undefined
                  const code = candidate?.site_code
                  if (typeof code === 'string' && code) {
                    router.push(`/competition/sites/${code}`)
                  }
                }}
                cursor="pointer"
              >
                {points.map((p) => (
                  <Cell key={p.site_id} fill={p.fill} fillOpacity={0.65} stroke={p.fill} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Click-targets fallback list — ensures every site is reachable
            even when scatter dots overlap heavily. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {points
            .slice()
            .sort((a, b) => b.total_campaigns - a.total_campaigns)
            .map((p) => (
              <button
                key={p.site_id}
                onClick={() => router.push(`/competition/sites/${p.site_code}`)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted transition-colors"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: p.fill }}
                />
                {p.site_name}
                <span className="text-muted-foreground">({p.total_campaigns})</span>
              </button>
            ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default PositioningMap
