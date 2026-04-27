import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn, getStatusColor } from '@/lib/utils'
import { getStatusLabel } from '@/lib/i18n/status'

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusClass = getStatusColor(status)

  // FE-1 — Türkçe etiketler `lib/i18n/status.ts` tek noktasından besleniyor.
  // `ended → Sona Ermiş` mapping'i artık merkezi (önceden "Bitmiş" idi).
  return (
    <Badge className={cn('capitalize', statusClass, className)}>
      {getStatusLabel(status) || status}
    </Badge>
  )
}
