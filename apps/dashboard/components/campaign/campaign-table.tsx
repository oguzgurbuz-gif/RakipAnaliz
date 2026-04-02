'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { resolveCampaignDateDisplay } from '@/lib/campaign-dates'
import { getSentimentColor, getStatusColor, cn } from '@/lib/utils'
import { Star } from 'lucide-react'
import type { Campaign } from '@/types'

interface CampaignTableProps {
  campaigns: Campaign[]
  isLoading?: boolean
  favorites?: string[]
  onToggleFavorite?: (id: string, e: React.MouseEvent) => void
}

export function CampaignTable({ campaigns, isLoading, favorites = [], onToggleFavorite }: CampaignTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead className="whitespace-nowrap">Başlık</TableHead>
              <TableHead className="whitespace-nowrap">Site</TableHead>
              <TableHead className="whitespace-nowrap">Tür</TableHead>
              <TableHead className="whitespace-nowrap">Duygu</TableHead>
              <TableHead className="whitespace-nowrap">Durum</TableHead>
              <TableHead className="whitespace-nowrap">Başlangıç</TableHead>
              <TableHead className="whitespace-nowrap">Bitiş</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-muted-foreground">
        Kampanya bulunamadı
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table className="min-w-[1080px]">
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead className="whitespace-nowrap">Başlık</TableHead>
              <TableHead className="whitespace-nowrap">Site</TableHead>
              <TableHead className="whitespace-nowrap">Tür</TableHead>
              <TableHead className="whitespace-nowrap">Duygu</TableHead>
              <TableHead className="whitespace-nowrap">Durum</TableHead>
              <TableHead className="whitespace-nowrap">Başlangıç</TableHead>
              <TableHead className="whitespace-nowrap">Bitiş</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {campaigns.map((campaign) => {
            const sentimentClass = getSentimentColor(campaign.sentiment || campaign.aiSentiment || 'neutral')
            const statusClass = getStatusColor(campaign.status)
            const startDate = resolveCampaignDateDisplay(
              campaign.validFrom,
              campaign.validFromSource,
              campaign.body,
              'start'
            )
            const endDate = resolveCampaignDateDisplay(
              campaign.validTo,
              campaign.validToSource,
              campaign.body,
              'end'
            )

            return (
              <TableRow key={campaign.id}>
                <TableCell className="w-10">
                  <button
                    onClick={(e) => onToggleFavorite?.(campaign.id, e)}
                    className="p-1 hover:bg-accent rounded"
                  >
                    <Star
                      className={cn(
                        'h-4 w-4',
                        favorites.includes(campaign.id)
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground'
                      )}
                    />
                  </button>
                </TableCell>
                <TableCell className="min-w-[280px] max-w-[380px]">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="block truncate hover:underline text-primary"
                    title={campaign.title}
                  >
                    {campaign.title}
                  </Link>
                </TableCell>
                <TableCell className="font-medium whitespace-nowrap">
                  {campaign.site?.name || '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {(campaign.metadata as any)?.ai_analysis?.campaign_type || campaign.category || '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge className={sentimentClass}>
                    {campaign.sentiment || campaign.aiSentiment || '-'}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge className={cn('capitalize', statusClass)}>
                    {campaign.status}
                  </Badge>
                </TableCell>
                <TableCell className="min-w-[160px] align-top">
                  <div className="leading-tight">
                    <div>{startDate.value || '-'}</div>
                    {startDate.value && (
                      <div className="mt-1 text-xs text-muted-foreground">{startDate.source}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="min-w-[160px] align-top">
                  <div className="leading-tight">
                    <div>{endDate.value || '-'}</div>
                    {endDate.value && (
                      <div className="mt-1 text-xs text-muted-foreground">{endDate.source}</div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
