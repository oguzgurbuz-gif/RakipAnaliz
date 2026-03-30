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
import { formatDate, getSentimentColor, getStatusColor, cn } from '@/lib/utils'
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Başlık</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Tür</TableHead>
              <TableHead>Duygu</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Valid From</TableHead>
              <TableHead>Valid To</TableHead>
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
      <Table>
          <TableHeader>
            <TableRow>
              <TableHead></TableHead>
              <TableHead>Başlık</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Tür</TableHead>
              <TableHead>Duygu</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>Valid From</TableHead>
              <TableHead>Valid To</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {campaigns.map((campaign) => {
            const sentimentClass = getSentimentColor(campaign.sentiment || campaign.aiSentiment || 'neutral')
            const statusClass = getStatusColor(campaign.status)

            return (
              <TableRow key={campaign.id}>
                <TableCell>
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
                <TableCell>
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="hover:underline text-primary"
                  >
                    {campaign.title}
                  </Link>
                </TableCell>
                <TableCell className="font-medium">
                  {campaign.site?.name || '-'}
                </TableCell>
                <TableCell>
                  {(campaign.metadata as any)?.ai_analysis?.campaign_type || campaign.category || '-'}
                </TableCell>
                <TableCell>
                  <Badge className={sentimentClass}>
                    {campaign.sentiment || campaign.aiSentiment || '-'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={cn('capitalize', statusClass)}>
                    {campaign.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {campaign.validFrom ? formatDate(campaign.validFrom) : '-'}
                </TableCell>
                <TableCell>
                  {campaign.validTo ? formatDate(campaign.validTo) : '-'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
