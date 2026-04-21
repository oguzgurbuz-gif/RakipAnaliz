'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { AlertTriangle, Info, CheckCircle, XCircle, X } from 'lucide-react'

export type AlertBannerVariant = 'info' | 'warning' | 'success' | 'error'

export interface AlertBannerProps {
  id: string
  variant?: AlertBannerVariant
  title: string
  message?: string
  dismissable?: boolean
  className?: string
}

const variantConfig = {
  info: {
    icon: Info,
    containerClass: 'bg-blue-50 border-blue-200 text-blue-800',
    iconClass: 'text-blue-500',
  },
  warning: {
    icon: AlertTriangle,
    containerClass: 'bg-amber-50 border-amber-200 text-amber-800',
    iconClass: 'text-amber-500',
  },
  success: {
    icon: CheckCircle,
    containerClass: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    iconClass: 'text-emerald-500',
  },
  error: {
    icon: XCircle,
    containerClass: 'bg-red-50 border-red-200 text-red-800',
    iconClass: 'text-red-500',
  },
}

export function AlertBanner({
  id,
  variant = 'info',
  title,
  message,
  dismissable = true,
  className,
}: AlertBannerProps) {
  const [isVisible, setIsVisible] = useState(true)
  const storageKey = `alert-banner-${id}`

  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored === 'dismissed') {
      setIsVisible(false)
    }
  }, [storageKey])

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'dismissed')
    setIsVisible(false)
  }

  if (!isVisible) return null

  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg border shadow-sm',
        config.containerClass,
        className
      )}
      role="alert"
    >
      <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', config.iconClass)} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        {message && (
          <p className="text-sm opacity-80 mt-0.5">{message}</p>
        )}
      </div>
      {dismissable && (
        <button
          onClick={handleDismiss}
          className={cn(
            'shrink-0 p-1 rounded-md transition-colors hover:opacity-80',
            config.containerClass
          )}
          aria-label="Bildirimi kapat"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
