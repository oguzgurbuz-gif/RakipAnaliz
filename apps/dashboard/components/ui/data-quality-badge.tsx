import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { QualitySignal } from '@/lib/campaign-presentation'

interface DataQualityBadgeProps {
  signal: QualitySignal
  compact?: boolean
  className?: string
}

export function DataQualityBadge({ signal, compact = false, className }: DataQualityBadgeProps) {
  const Icon = signal.icon
  return (
    <Badge
      variant={signal.variant === 'warning' ? 'warning' : 'info'}
      className={cn('gap-1 border-transparent', compact && 'px-2 py-0 text-[11px]', className)}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {signal.label}
    </Badge>
  )
}
