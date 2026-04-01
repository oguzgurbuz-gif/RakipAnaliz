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
import type { Campaign } from '@/types'
import { formatDate, formatDateTime, formatDateRange, getSentimentColor } from '@/lib/utils'
import { ArrowLeft, Calendar, AlertTriangle, CheckCircle, MessageSquare, Plus, Pencil, X, Save } from 'lucide-react'
import { useState, useEffect } from 'react'

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
                  {(campaign.metadata as any)?.ai_analysis?.sentiment && (
                    <Badge className={getSentimentColor((campaign.metadata as any)?.ai_analysis?.sentiment || 'neutral')}>
                      {(campaign.metadata as any)?.ai_analysis?.sentiment}
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

            {((campaign.metadata as any)?.ai_analysis?.summary || (campaign.metadata as any)?.ai_analysis?.keyPoints) && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Analizi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(campaign.metadata as any)?.ai_analysis?.summary && (
                    <div>
                      <h4 className="font-medium mb-2">Özet</h4>
                      <p className="text-sm text-muted-foreground">{(campaign.metadata as any)?.ai_analysis?.summary}</p>
                    </div>
                  )}

                  {(campaign.metadata as any)?.ai_analysis?.keyPoints && (campaign.metadata as any)?.ai_analysis?.keyPoints.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Ana Noktalar</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {(campaign.metadata as any)?.ai_analysis?.keyPoints.map((point: string, index: number) => (
                          <li key={index} className="text-sm">{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(campaign.metadata as any)?.ai_analysis?.riskFlags && (campaign.metadata as any)?.ai_analysis?.riskFlags.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Risk Bayrakları
                      </h4>
                      <ul className="list-disc list-inside space-y-1">
                        {(campaign.metadata as any)?.ai_analysis?.riskFlags.map((flag: string, index: number) => (
                          <li key={index} className="text-sm text-destructive">{flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {(campaign.metadata as any)?.ai_analysis?.extractedTags && (
              <Card>
                <CardHeader>
                  <CardTitle>Kampanya Detayları</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    {(campaign.metadata as any)?.ai_analysis?.extractedTags?.min_deposit && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Min Yatırım</label>
                        <p className="mt-1">{(campaign.metadata as any)?.ai_analysis?.extractedTags?.min_deposit} TL</p>
                      </div>
                    )}
                    {(campaign.metadata as any)?.ai_analysis?.extractedTags?.max_bonus && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Max Bonus</label>
                        <p className="mt-1">{(campaign.metadata as any)?.ai_analysis?.extractedTags?.max_bonus} TL</p>
                      </div>
                    )}
                    {(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_amount && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Bonus Miktarı</label>
                        <p className="mt-1">{(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_amount} TL</p>
                      </div>
                    )}
                    {(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_percentage && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Bonus Yüzdesi</label>
                        <p className="mt-1">%{(campaign.metadata as any)?.ai_analysis?.extractedTags?.bonus_percentage}</p>
                      </div>
                    )}
                    {(campaign.metadata as any)?.ai_analysis?.extractedTags?.turnover && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Çevrim Şartı</label>
                        <p className="mt-1">{(campaign.metadata as any)?.ai_analysis?.extractedTags?.turnover}</p>
                      </div>
                    )}
                    {(campaign.metadata as any)?.ai_analysis?.extractedTags?.free_bet_amount && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Freebet</label>
                        <p className="mt-1">{(campaign.metadata as any)?.ai_analysis?.extractedTags?.free_bet_amount} TL</p>
                      </div>
                    )}
                    {(campaign.metadata as any)?.ai_analysis?.extractedTags?.cashback_percent && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Cashback</label>
                        <p className="mt-1">%{(campaign.metadata as any)?.ai_analysis?.extractedTags?.cashback_percent}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {(campaign.metadata as any)?.ai_analysis?.campaign_type && (
              <Card>
                <CardHeader>
                  <CardTitle>Kampanya Türü</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge className="text-sm">
                      {(campaign.metadata as any)?.ai_analysis?.campaign_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Güven: {((campaign.metadata as any)?.ai_analysis?.type_confidence * 100)?.toFixed(0)}%
                    </span>
                  </div>
                  {(campaign.metadata as any)?.ai_analysis?.type_reasoning && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {(campaign.metadata as any)?.ai_analysis?.type_reasoning}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {(campaign.metadata as any)?.ai_analysis?.conditions && (
              <Card>
                <CardHeader>
                  <CardTitle>Katılım Koşulları</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {(campaign.metadata as any)?.ai_analysis?.conditions?.required_actions?.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Yapılması gereken:</span>
                        <span>{(campaign.metadata as any)?.ai_analysis?.conditions?.required_actions?.join(', ')}</span>
                      </li>
                    )}
                    {(campaign.metadata as any)?.ai_analysis?.conditions?.membership_requirements?.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Üyelik:</span>
                        <span>{(campaign.metadata as any)?.ai_analysis?.conditions?.membership_requirements?.join(', ')}</span>
                      </li>
                    )}
                    {(campaign.metadata as any)?.ai_analysis?.conditions?.excluded_games?.length > 0 && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Hariç olanlar:</span>
                        <span>{(campaign.metadata as any)?.ai_analysis?.conditions?.excluded_games?.join(', ')}</span>
                      </li>
                    )}
                    {(campaign.metadata as any)?.ai_analysis?.conditions?.time_restrictions && (
                      <li className="flex items-start gap-2">
                        <span className="font-medium shrink-0">Zaman:</span>
                        <span>{(campaign.metadata as any)?.ai_analysis?.conditions?.time_restrictions}</span>
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}

            {(campaign.metadata as any)?.ai_analysis?.key_points?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Önemli Noktalar</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {(campaign.metadata as any)?.ai_analysis?.key_points?.map((point: string, idx: number) => (
                      <li key={idx}>{point}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {(campaign.metadata as any)?.ai_analysis?.risk_flags?.length > 0 && (
              <Card className="border-yellow-500">
                <CardHeader>
                  <CardTitle className="text-yellow-600">⚠️ Risk Uyarıları</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700">
                    {(campaign.metadata as any)?.ai_analysis?.risk_flags?.map((flag: string, idx: number) => (
                      <li key={idx}>{flag}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Temel Bilgiler</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Geçerlilik</label>
                    {isEditing ? (
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="date"
                          value={editedValidFrom}
                          onChange={(e) => setEditedValidFrom(e.target.value)}
                          className="flex-1"
                        />
                        <span className="self-center">-</span>
                        <Input
                          type="date"
                          value={editedValidTo}
                          onChange={(e) => setEditedValidTo(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                    ) : (
                      <p className="mt-1">
                        <Calendar className="inline h-4 w-4 mr-1" />
                        {formatDateRange(campaign.validFrom, campaign.validTo)}
                      </p>
                    )}
                    {campaign.source && (
                      <p className="text-xs text-muted-foreground mt-1">Kaynak: {campaign.source}</p>
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
                <CardContent>
                  {isEditing ? (
                    <Textarea
                      value={editedBody}
                      onChange={(e) => setEditedBody(e.target.value)}
                      className="min-h-[100px]"
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{campaign.body}</p>
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
