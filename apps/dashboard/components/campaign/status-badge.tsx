import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn, getStatusColor } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusClass = getStatusColor(status)

  // Scraper schema produces `expired` / `hidden`; legacy UI used `ended` /
  // `passive`. Accept both so badges render Turkish labels regardless of
  // which writer set the campaign's status.
  const labels: Record<string, string> = {
    active: 'Aktif',
    ended: 'Bitmiş',
    expired: 'Bitmiş',
    passive: 'Pasif',
    hidden: 'Pasif',
    changed: 'Değişmiş',
    pending: 'Beklemede',
    running: 'Çalışıyor',
    completed: 'Tamamlandı',
    failed: 'Başarısız',
  }

  return (
    <Badge className={cn('capitalize', statusClass)}>
      {labels[status] || status}
    </Badge>
  )
}
