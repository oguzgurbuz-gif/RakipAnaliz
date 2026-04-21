'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { getCategoryLabel } from '@/lib/category-labels'
import { AlertCircle, TrendingDown, Crown } from 'lucide-react'

interface GapItem {
  site_id: string
  site_name: string
  site_code: string
  category: string
  site_campaign_count: number
  leader_site_name: string
  leader_site_code: string
  leader_campaign_count: number
  site_avg_bonus: number
  leader_avg_bonus: number
  campaign_delta: number
  bonus_delta: number
  priority: 'high' | 'medium' | 'low'
  score: number
  reason: 'missing' | 'underbonus' | 'both'
}

interface SiteOption {
  site_id: string
  site_name: string
  site_code: string
}

interface GapAnalysisProps {
  gaps: GapItem[]
  sites: SiteOption[]
  isLoading?: boolean
}

const PRIORITY_VARIANT: Record<GapItem['priority'], 'destructive' | 'warning' | 'secondary'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
}

const PRIORITY_LABEL: Record<GapItem['priority'], string> = {
  high: 'Yüksek',
  medium: 'Orta',
  low: 'Düşük',
}

const REASON_LABEL: Record<GapItem['reason'], string> = {
  missing: 'kategoride hiç kampanya yok',
  underbonus: 'liderin yarısından az bonus veriyor',
  both: 'hem kampanya yok hem bonus düşük',
}

export function GapAnalysis({ gaps, sites, isLoading }: GapAnalysisProps) {
  const [selectedSite, setSelectedSite] = useState<string>('')

  const filteredGaps = useMemo(() => {
    if (!selectedSite) return gaps
    return gaps.filter((g) => g.site_id === selectedSite)
  }, [gaps, selectedSite])

  const visibleGaps = filteredGaps.slice(0, 20)

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eksik Kategoriler / Bonus Açıkları</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Eksik Kategoriler / Bonus Açıkları</CardTitle>
            <Badge variant="outline" className="text-xs">
              {filteredGaps.length} fırsat
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="gap-site-filter" className="text-xs text-muted-foreground">
              Site:
            </label>
            <Select
              id="gap-site-filter"
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="w-44 h-8 text-xs"
            >
              <option value="">Tüm Siteler</option>
              {sites.map((s) => (
                <option key={s.site_id} value={s.site_id}>
                  {s.site_name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visibleGaps.length > 0 ? (
          <div className="space-y-3">
            {visibleGaps.map((gap, idx) => {
              const Icon = gap.reason === 'missing' ? AlertCircle : TrendingDown
              const iconColor =
                gap.priority === 'high'
                  ? 'text-red-500'
                  : gap.priority === 'medium'
                    ? 'text-amber-500'
                    : 'text-muted-foreground'
              return (
                <div
                  key={`${gap.site_id}-${gap.category}`}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{gap.site_name}</span>
                      <span className="text-xs text-muted-foreground">→</span>
                      <Badge variant="outline" className="text-xs">
                        {getCategoryLabel(gap.category)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {REASON_LABEL[gap.reason]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>
                        Kampanya:{' '}
                        <span className="font-mono font-medium text-foreground">
                          {gap.site_campaign_count}
                        </span>{' '}
                        vs lider{' '}
                        <span className="font-mono font-medium text-foreground">
                          {gap.leader_campaign_count}
                        </span>
                        {gap.campaign_delta > 0 && (
                          <span className="text-red-500"> (-{gap.campaign_delta})</span>
                        )}
                      </span>
                      <span className="text-muted-foreground/40">|</span>
                      <span>
                        Ort. bonus:{' '}
                        <span className="font-mono font-medium text-foreground">
                          ₺{Math.round(gap.site_avg_bonus).toLocaleString()}
                        </span>{' '}
                        vs{' '}
                        <span className="font-mono font-medium text-foreground">
                          ₺{Math.round(gap.leader_avg_bonus).toLocaleString()}
                        </span>
                        {gap.bonus_delta > 0 && (
                          <span className="text-red-500">
                            {' '}
                            (-₺{Math.round(gap.bonus_delta).toLocaleString()})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Crown className="h-3 w-3 text-yellow-500" />
                      <span>Lider: {gap.leader_site_name}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant={PRIORITY_VARIANT[gap.priority]} className="text-xs">
                      {PRIORITY_LABEL[gap.priority]}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      #{idx + 1}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            {selectedSite
              ? 'Seçili site için belirgin bir gap bulunamadı.'
              : 'Tüm siteler tüm önemli kategorilerde rekabetçi.'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default GapAnalysis
