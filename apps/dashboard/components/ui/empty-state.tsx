import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface EmptyStateProps {
  icon?: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card className="border-dashed border-border/80 bg-card/80">
      <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        {Icon && (
          <div className="rounded-full bg-muted p-3">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{title}</h3>
          {description && <p className="max-w-lg text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </CardContent>
    </Card>
  )
}
