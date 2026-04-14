import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface InsightCardProps {
  icon?: React.ElementType
  title: string
  value?: string | number
  description?: string
  tone?: 'default' | 'positive' | 'warning' | 'info'
  highlight?: boolean
  className?: string
}

const toneClasses: Record<NonNullable<InsightCardProps['tone']>, string> = {
  default: 'border-border/70 bg-card/95',
  positive: 'border-emerald-200 bg-emerald-50/80',
  warning: 'border-amber-200 bg-amber-50/80',
  info: 'border-blue-200 bg-blue-50/80',
}

export function InsightCard({
  icon: Icon,
  title,
  value,
  description,
  tone = 'default',
  highlight = false,
  className,
}: InsightCardProps) {
  return (
    <Card className={cn(toneClasses[tone], highlight && 'border-yellow-400 bg-yellow-50/50', className)}>
      <CardContent className="flex items-start gap-3 p-5">
        {Icon && (
          <div className="rounded-xl bg-background/80 p-2.5 shadow-sm">
            <Icon className="h-5 w-5 text-foreground" />
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {value !== undefined && <p className="text-2xl font-semibold tracking-tight">{value}</p>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
