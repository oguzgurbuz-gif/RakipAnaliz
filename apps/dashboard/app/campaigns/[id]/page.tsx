'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorDisplay } from '@/components/ui/error'
import { CampaignTable } from '@/components/campaign/campaign-table'
import { StatusBadge } from '@/components/campaign/status-badge'
import {
  fetchCampaign,
  addCampaignNote,
  updateCampaign,
} from '@/lib/api'
import { extractBodyDateRange, getDateSourceLabel } from '@/lib/campaign-dates'
import type { Campaign } from '@/types'
import { formatDate, formatDateTime, formatDateRange, getSentimentColor } from '@/lib/utils'
import { ArrowLeft, Calendar, AlertTriangle, CheckCircle, MessageSquare, Plus, Pencil, X, Save } from 'lucide-react'
import { useState, useEffect } from 'react'

const extractedTagLabels: Record<string, string> = {
  min_deposit: 'Min Yatirim',
  min_bet: 'Min Kupon',
  max_bet: 'Max Kupon',
  max_bonus: 'Max Bonus',
  bonus_amount: 'Bonus Miktari',
  bonus_percentage: 'Bonus Yuzdesi',
  turnover: 'Cevrim Sarti',
  free_bet_amount: 'Freebet',
  freebet_amount: 'Freebet',
  cashback_percent: 'Cashback',
  promo_code: 'Promosyon Kodu',
  max_uses_per_user: 'Kullanici Limiti',
}

const arrayFieldLabels: Record<string, string> = {
  eligible_products: 'Gecerli Urunler',
  deposit_methods: 'Yatirim Yontemleri',
  target_segment: 'Hedef Kitle',
  required_actions: 'Yapilacaklar',
  excluded_games: 'Haric Olanlar',
  membership_requirements: 'Uyelik Kosullari',
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean)
      }
    } catch {
      return [trimmed]
    }

    return [trimmed]
  }

  return []
}

function formatDetailValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) {
    const normalized = value.map((item) => String(item).trim()).filter(Boolean)
    return normalized.length > 0 ? normalized.join(', ') : null
  }
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value.trim() || null
  return null
}

const DESCRIPTION_NOISE_LINES = new Set([
  'giriş yap',
  'üye ol',
  'anasayfa',
  'kuponlarım',
  'iddaa',
  'sosyoley',
  'kampanya detayları',
  'tüm kampanyaları göster',
  'toplam kazanan kupon bedeli üzerinden',
  'alt barem',
  'üst barem',
  'bonus',
])

function normalizeDescriptionLine(line: string): string {
  return line
    .replace(/[\u00A0\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getOrganizedDescriptionLines(body: string | null, title: string): string[] {
  if (!body) return []

  return body
    .split(/\r?\n+/)
    .map(normalizeDescriptionLine)
    .filter((line) => {
      if (!line) return false
      if (line.toLowerCase() === title.trim().toLowerCase()) return false
      if (DESCRIPTION_NOISE_LINES.has(line.toLowerCase())) return false
      if (/^[0-9]+(?:[.,][0-9]+)?$/.test(line)) return false
      if (/^[₺+\d.,\s]+$/.test(line)) return false
      return true
    })
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient()
  const [noteContent, setNoteContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editedValidFrom, setEditedValidFrom] = useState('')
  const [editedValidTo, setEditedValidTo] = useState('')
  const [editedBody, setEditedBody] = useState('')

  const campaignId = params.id

  const { data: campaign, isLoading: campaignLoading, error: campaignError } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => fetchCampaign(campaignId),
  })

  const addNoteMutation = useMutation({
    mutationFn: (content: string) => addCampaignNote(campaignId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      setNoteContent('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { validFrom?: string | null; validTo?: string | null; body?: string }) =>
      updateCampaign(campaignId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      setIsEditing(false)
    },
  })

  useEffect(() => {
    if (campaign) {
      setEditedValidFrom(campaign.validFrom ? campaign.validFrom.split('T')[0] : '')
      setEditedValidTo(campaign.validTo ? campaign.validTo.split('T')[0] : '')
      setEditedBody(campaign.body || '')
    }
  }, [campaign])

  const aiAnalysis = asRecord((campaign?.metadata as any)?.ai_analysis)
  const extractedTags = asRecord(aiAnalysis.extractedTags)
  const conditionFields = asRecord(aiAnalysis.conditions)
  const aiSummary = formatDetailValue(aiAnalysis.summary) ?? campaign?.latestAI?.summary ?? null
  const aiKeyPoints = normalizeStringArray(
    aiAnalysis.keyPoints ?? aiAnalysis.key_points ?? aiAnalysis.tags ?? campaign?.latestAI?.keyPoints
  )
  const aiRiskFlags = normalizeStringArray(
    aiAnalysis.riskFlags ?? aiAnalysis.risk_flags ?? campaign?.latestAI?.riskFlags
  )
  const aiSentiment = formatDetailValue(aiAnalysis.sentiment) ?? campaign?.latestAI?.sentiment ?? null
  const aiCampaignType = formatDetailValue(aiAnalysis.campaign_type ?? aiAnalysis.campaignType)
  const aiTypeReasoning = formatDetailValue(aiAnalysis.type_reasoning ?? aiAnalysis.typeReasoning)
  const requiredActions = normalizeStringArray(conditionFields.required_actions)
  const membershipRequirements = normalizeStringArray(conditionFields.membership_requirements)
  const eligibleProducts = normalizeStringArray(conditionFields.eligible_products)
  const depositMethods = normalizeStringArray(conditionFields.deposit_methods)
  const targetSegment = normalizeStringArray(conditionFields.target_segment)
  const excludedGames = normalizeStringArray(conditionFields.excluded_games)
  const promoCode = formatDetailValue(conditionFields.promo_code)
  const maxUsesPerUser = formatDetailValue(conditionFields.max_uses_per_user)
  const timeRestrictions = formatDetailValue(conditionFields.time_restrictions)
  const aiTypeConfidence = typeof aiAnalysis.type_confidence === 'number'
    ? aiAnalysis.type_confidence
    : typeof aiAnalysis.typeConfidence === 'number'
      ? aiAnalysis.typeConfidence
      : null
  const hasExtractedDetails =
    Object.keys(extractedTagLabels).some((key) => formatDetailValue(extractedTags[key])) ||
    Object.keys(arrayFieldLabels).some((key) => formatDetailValue(extractedTags[key]))
  const hasConditionDetails = [
    'required_actions',
    'membership_requirements',
    'eligible_products',
    'deposit_methods',
    'target_segment',
    'excluded_games',
    'promo_code',
    'max_uses_per_user',
    'time_restrictions',
  ].some((key) => formatDetailValue(conditionFields[key]))
  const organizedDescriptionLines = getOrganizedDescriptionLines(campaign?.body ?? null, campaign?.title ?? '')
  const extractedBodyDateRange = extractBodyDateRange(campaign?.body ?? null)
  const startDateDisplay = campaign?.validFrom
    ? formatDate(campaign.validFrom)
    : extractedBodyDateRange.start
  const endDateDisplay = campaign?.validTo
    ? formatDate(campaign.validTo)
    : extractedBodyDateRange.end
  const startDateSource = getDateSourceLabel(
    campaign?.validFromSource,
    campaign?.validFrom ? 'stored' : extractedBodyDateRange.start ? 'body' : 'missing'
  )
  const endDateSource = getDateSourceLabel(
    campaign?.validToSource,
    campaign?.validTo ? 'stored' : extractedBodyDateRange.end ? 'body' : 'missing'
  )
  const organizedDescriptionSummary = organizedDescriptionLines.slice(0, 3)
  const organizedDescriptionRest = organizedDescriptionLines.slice(3)

  if (campaignError) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
          <Link href="/campaigns" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            <span>Geri</span>
          </Link>
        </header>
        <main className="p-6">
          <ErrorDisplay error={campaignError} onRetry={() => window.location.reload()} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <Link href="/campaigns" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          <span>Geri</span>
        </Link>
        <h1 className="text-lg font-semibold">Kampanya Detay</h1>
      </header>

      <main className="p-6 space-y-6">
        {campaignLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : campaign ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{campaign.title}</h2>
                <div className="flex items-center gap-2 mt-2">
                  {campaign.site && (
                    <span className="text-muted-foreground">{campaign.site.name}</span>
                  )}
                  <StatusBadge status={campaign.status} />
                  {aiSentiment && (
                    <Badge className={getSentimentColor(aiSentiment || 'neutral')}>
                      {aiSentiment}
                    </Badge>
                  )}
                </div>
              </div>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  Düzenle
                </Button>
              )}
            </div>

            {(aiSummary || aiKeyPoints.length > 0 || aiRiskFlags.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Analizi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {aiSummary && (
                    <div>
                      <h4 className="font-medium mb-2">Özet</h4>
                      <p className="text-sm text-muted-foreground">{aiSummary}</p>
                    </div>
                  )}

                  {aiKeyPoints.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Ana Noktalar</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {aiKeyPoints.map((point: string, index: number) => (
                          <li key={index} className="text-sm">{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiRiskFlags.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Risk Bayrakları
                      </h4>
                      <ul className="list-disc list-inside space-y-1">
                        {aiRiskFlags.map((flag: string, index: number) => (
                          <li key={index} className="text-sm text-destructive">{flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {hasExtractedDetails && (
              <Card>
                <CardHeader>
                  <CardTitle>Kampanya Detayları</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(extractedTagLabels).map(([key, label]) => {
                      const formatted = formatDetailValue(extractedTags[key])
                      if (!formatted) return null

                      const suffix = ['min_deposit', 'min_bet', 'max_bet', 'max_bonus', 'bonus_amount', 'free_bet_amount', 'freebet_amount'].includes(key) ? ' TL' : ''
                      const prefix = ['bonus_percentage', 'cashback_percent'].includes(key) ? '%' : ''

                      return (
                        <div key={key}>
                          <label className="text-sm font-medium text-muted-foreground">{label}</label>
                          <p className="mt-1">{prefix}{formatted}{suffix}</p>
                        </div>
                      )
                    })}
                    {Object.entries(arrayFieldLabels).map(([key, label]) => {
                      const formatted = formatDetailValue(extractedTags[key])
                      if (!formatted) return null

                      return (
                        <div key={key} className="col-span-2">
                          <label className="text-sm font-medium text-muted-foreground">{label}</label>
                          <p className="mt-1">{formatted}</p>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {aiCampaignType && (
              <Card>
                <CardHeader>
                  <CardTitle>Kampanya Türü</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge className="text-sm">
                      {aiCampaignType}
                    </Badge>
                    {aiTypeConfidence !== null && (
                      <span className="text-xs text-muted-foreground">
                        Güven: {(aiTypeConfidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {aiTypeReasoning && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {aiTypeReasoning}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {hasConditionDetails && (
              <Card>
                <CardHeader>
                  <CardTitle>Katılım Koşulları</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {requiredActions.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Yapılması gereken:</span>
                        <span>{requiredActions.join(', ')}</span>
                      </li>
                    )}
                    {membershipRequirements.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Üyelik:</span>
                        <span>{membershipRequirements.join(', ')}</span>
                      </li>
                    )}
                    {eligibleProducts.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Geçerli ürünler:</span>
                        <span>{eligibleProducts.join(', ')}</span>
                      </li>
                    )}
                    {depositMethods.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Yatırım yöntemi:</span>
                        <span>{depositMethods.join(', ')}</span>
                      </li>
                    )}
                    {targetSegment.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Hedef kitle:</span>
                        <span>{targetSegment.join(', ')}</span>
                      </li>
                    )}
                    {excludedGames.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Hariç olanlar:</span>
                        <span>{excludedGames.join(', ')}</span>
                      </li>
                    )}
                    {promoCode && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Kod:</span>
                        <span>{promoCode}</span>
                      </li>
                    )}
                    {maxUsesPerUser && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Kullanım limiti:</span>
                        <span>{maxUsesPerUser}</span>
                      </li>
                    )}
                    {timeRestrictions && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Zaman:</span>
                        <span>{timeRestrictions}</span>
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Temel Bilgiler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Başlangıç Tarihi</label>
                    {isEditing ? (
                      <Input
                        type="date"
                        value={editedValidFrom}
                        onChange={(e) => setEditedValidFrom(e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <>
                        <p className="mt-1 font-medium">{startDateDisplay || 'Belirlenemedi'}</p>
                        <p className="text-xs text-muted-foreground mt-1">Kaynak: {startDateSource}</p>
                        {campaign.validFromConfidence !== null && campaign.validFromConfidence !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            Güven: {(campaign.validFromConfidence * 100).toFixed(0)}%
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Bitiş Tarihi</label>
                    {isEditing ? (
                      <Input
                        type="date"
                        value={editedValidTo}
                        onChange={(e) => setEditedValidTo(e.target.value)}
                        className="mt-1"
                      />
                    ) : (
                      <>
                        <p className="mt-1 font-medium">{endDateDisplay || 'Belirlenemedi'}</p>
                        <p className="text-xs text-muted-foreground mt-1">Kaynak: {endDateSource}</p>
                        {campaign.validToConfidence !== null && campaign.validToConfidence !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            Güven: {(campaign.validToConfidence * 100).toFixed(0)}%
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">İlk Görülme</label>
                    <p className="mt-1">{formatDateTime(campaign.firstSeen)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Son Görülme</label>
                    <p className="mt-1">{formatDateTime(campaign.lastSeen)}</p>
                  </div>
                </div>
                {!isEditing && (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    <Calendar className="inline h-4 w-4 mr-1" />
                    Geçerlilik Aralığı: {startDateDisplay || 'Belirsiz'} - {endDateDisplay || 'Belirsiz'}
                  </div>
                )}
              </CardContent>
            </Card>

            {campaign.primaryImage && (
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  <img
                    src={campaign.primaryImage}
                    alt={campaign.title}
                    className="w-full h-64 md:h-80 lg:h-96 object-cover"
                  />
                </CardContent>
              </Card>
            )}

            {campaign.body && (
              <Card>
                <CardHeader>
                  <CardTitle>Açıklama</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isEditing ? (
                    <Textarea
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      className="min-h-[220px]"
                    />
                  ) : (
                    <>
                      {organizedDescriptionSummary.length > 0 && (
                        <div className="grid gap-3">
                          {organizedDescriptionSummary.map((line, index) => (
                            <div key={`${index}-${line}`} className="rounded-lg border bg-muted/20 px-4 py-3">
                              <p className="text-sm leading-relaxed">{line}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {organizedDescriptionRest.length > 0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-medium text-muted-foreground">Diğer Detaylar</h4>
                          <ul className="space-y-2">
                            {organizedDescriptionRest.map((line, index) => (
                              <li key={`${index}-${line}`} className="rounded-md border px-3 py-2 text-sm leading-relaxed">
                                {line}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {isEditing && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(false)
                    if (campaign) {
                      setEditedValidFrom(campaign.validFrom ? campaign.validFrom.split('T')[0] : '')
                      setEditedValidTo(campaign.validTo ? campaign.validTo.split('T')[0] : '')
                      setEditedBody(campaign.body || '')
                    }
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  İptal
                </Button>
                <Button
                  onClick={() => {
                    updateMutation.mutate({
                      validFrom: editedValidFrom || null,
                      validTo: editedValidTo || null,
                      body: editedBody,
                    })
                  }}
                  disabled={updateMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {updateMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                {campaign.statusHistory && campaign.statusHistory.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Durum Geçmişi</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {campaign.statusHistory.map((item) => (
                          <div key={item.id} className="flex items-start gap-3">
                            <div className="mt-1">
                              <CheckCircle className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <StatusBadge status={item.newStatus} />
                                <span className="text-sm text-muted-foreground">
                                  {formatDateTime(item.changedAt)}
                                </span>
                              </div>
                              {item.reason && (
                                <p className="text-sm text-muted-foreground mt-1">{item.reason}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {campaign.notes && campaign.notes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Notlar
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {campaign.notes.map((note) => (
                          <div key={note.id} className="border-b pb-4 last:border-0 last:pb-0">
                            <p className="text-sm">{note.noteText}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDateTime(note.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>Not Ekle</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (noteContent.trim()) {
                          addNoteMutation.mutate(noteContent)
                        }
                      }}
                      className="flex gap-2"
                    >
                      <Input
                        value={noteContent}
                        onChange={(e) => setNoteContent(e.target.value)}
                        placeholder="Not ekle..."
                        className="flex-1"
                      />
                      <Button type="submit" disabled={!noteContent.trim() || addNoteMutation.isPending}>
                        <Plus className="h-4 w-4 mr-1" />
                        Ekle
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                {campaign.similarCampaigns && campaign.similarCampaigns.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Benzer Kampanyalar</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CampaignTable campaigns={(campaign.similarCampaigns ?? []).slice(0, 5).map(s => ({
                        ...s,
                        siteId: s.site.code,
                        site: { id: s.site.code, name: s.site.name, code: s.site.code },
                        body: null,
                        firstSeen: '',
                        lastSeen: '',
                        fingerprint: '',
                        metadata: {},
                        createdAt: '',
                        updatedAt: '',
                        primaryImage: s.primaryImage,
                        sentiment: null,
                        aiSentiment: null,
                        category: null,
                        aiKeyPoints: null,
                        aiRiskFlags: null,
                      })) as Campaign[]} />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}
