'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ErrorDisplayProps {
  error: Error | string
  className?: string
  onRetry?: () => void
}

export function ErrorDisplay({ error, className, onRetry }: ErrorDisplayProps) {
  const message = typeof error === 'string' ? error : error.message

  return (
    <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
      <div className="rounded-lg bg-destructive/10 p-4 text-destructive">
        <p className="font-medium">Bir hata oluştu</p>
        <p className="text-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Tekrar Dene
        </button>
      )}
    </div>
  )
}
