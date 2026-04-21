'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SectionHeader } from '@/components/ui/section-header'
import { formatDateTime } from '@/lib/utils'
import { Clock, ArrowRight, Plus, Minus, Edit3 } from 'lucide-react'

interface VersionDiffProps {
  versions: CampaignVersion[]
  currentData: Record<string, unknown>
}

interface CampaignVersion {
  id: string
  campaignId: string
  version: number
  data: Record<string, unknown>
  createdAt: string
}

interface DiffItem {
  field: string
  before: unknown
  after: unknown
  type: 'added' | 'removed' | 'changed'
}

function getFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    title: 'Baslik',
    body: 'Aciklama',
    status: 'Durum',
    validFrom: 'Baslangic Tarihi',
    validTo: 'Bitis Tarihi',
    category: 'Kategori',
    sentiment: 'Duygu',
    primaryImage: 'Gorsel',
    bonus_amount: 'Bonus Miktari',
    min_deposit: 'Min Yatirim',
    turnover: 'Cevrim Sarti',
  }
  return labels[field] || field
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function computeDiff(versions: CampaignVersion[], currentData: Record<string, unknown>): DiffItem[] {
  if (!versions || versions.length === 0) return []

  const sorted = [...versions].sort((a, b) => b.version - a.version)
  const latest = sorted[0]
  const latestData = latest.data || {}

  const diffs: DiffItem[] = []
  const allKeys = new Set([...Object.keys(latestData), ...Object.keys(currentData)])

  for (const key of allKeys) {
    const before = latestData[key]
    const after = currentData[key]

    if (before === undefined && after !== undefined) {
      diffs.push({ field: key, before, after, type: 'added' })
    } else if (before !== undefined && after === undefined) {
      diffs.push({ field: key, before, after, type: 'removed' })
    } else if (JSON.stringify(before) !== JSON.stringify(after)) {
      diffs.push({ field: key, before, after, type: 'changed' })
    }
  }

  return diffs.sort((a, b) => {
    const order = { changed: 0, added: 1, removed: 2 }
    return order[a.type] - order[b.type]
  })
}

export function VersionDiff({ versions, currentData }: VersionDiffProps) {
  const diffs = computeDiff(versions, currentData)

  const getDiffIcon = (type: DiffItem['type']) => {
    switch (type) {
      case 'added':
        return <Plus className="h-4 w-4 text-green-500" />
      case 'removed':
        return <Minus className="h-4 w-4 text-red-500" />
      case 'changed':
        return <Edit3 className="h-4 w-4 text-yellow-500" />
    }
  }

  const getDiffStyles = (type: DiffItem['type']) => {
    switch (type) {
      case 'added':
        return 'border-l-4 border-l-green-500 bg-green-50/50'
      case 'removed':
        return 'border-l-4 border-l-red-500 bg-red-50/50'
      case 'changed':
        return 'border-l-4 border-l-yellow-500 bg-yellow-50/50'
    }
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Versiyon Degisiklikleri"
          description="Son versiyondan bu yana yapilan degisiklikler"
        />
      </CardHeader>
      <CardContent>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Versiyon gecmisi bulunamadi.</p>
        ) : diffs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Son versiyondan bu yana degisiklik yok.</p>
        ) : (
          <div className="space-y-3">
            {diffs.map((diff, index) => (
              <div
                key={`${diff.field}-${index}`}
                className={`rounded-lg p-4 ${getDiffStyles(diff.type)}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{getDiffIcon(diff.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={
                          diff.type === 'added'
                            ? 'default'
                            : diff.type === 'removed'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className={
                          diff.type === 'added'
                            ? 'bg-green-500'
                            : diff.type === 'removed'
                            ? 'bg-red-500'
                            : 'bg-yellow-500'
                        }
                      >
                        {diff.type === 'added'
                          ? 'Eklendi'
                          : diff.type === 'removed'
                          ? 'Silindi'
                          : 'Degisti'}
                      </Badge>
                      <span className="font-medium text-sm">
                        {getFieldLabel(diff.field)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      {diff.type === 'removed' ? (
                        <span className="text-red-600 line-through">
                          {formatValue(diff.before)}
                        </span>
                      ) : diff.type === 'added' ? (
                        <span className="text-green-600 font-medium">
                          {formatValue(diff.after)}
                        </span>
                      ) : (
                        <>
                          <span className="text-red-500 line-through">
                            {formatValue(diff.before)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-green-600 font-bold">
                            {formatValue(diff.after)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {versions.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>
                Son guncelleme: {formatDateTime(versions[0]?.createdAt)}
              </span>
              <span className="mx-1">|</span>
              <span>Toplam {versions.length} versiyon</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function VersionHistory({ versions }: { versions: CampaignVersion[] }) {
  if (!versions || versions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Versiyon Gecmisi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Versiyon gecmisi bulunamadi.</p>
        </CardContent>
      </Card>
    )
  }

  const sorted = [...versions].sort((a, b) => b.version - a.version)

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Versiyon Gecmisi"
          description="Kampanyanin tum versiyonlari"
        />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sorted.map((version, index) => (
            <div
              key={version.id}
              className={`flex items-start gap-4 pb-4 ${
                index !== sorted.length - 1 ? 'border-b' : ''
              }`}
            >
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">
                    v{version.version}
                  </span>
                </div>
                {index !== sorted.length - 1 && (
                  <div className="w-px h-full min-h-[2rem] bg-border mt-2" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline">Versiyon {version.version}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(version.createdAt)}
                  </span>
                </div>
                {version.data && Object.keys(version.data).length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {Object.keys(version.data).length} alan degistirildi
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
