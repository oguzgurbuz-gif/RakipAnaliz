'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingSpinner({ className, size = 'md', ...props }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  return (
    <div
      className={cn('animate-spin rounded-full border-2 border-muted border-t-foreground', sizeClasses[size], className)}
      {...props}
    />
  )
}

export function LoadingOverlay({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <LoadingSpinner size="lg" />
    </div>
  )
}

export function LoadingPage({ className }: { className?: string }) {
  return (
    <div className={cn('flex min-h-screen items-center justify-center', className)}>
      <LoadingSpinner size="lg" />
    </div>
  )
}
