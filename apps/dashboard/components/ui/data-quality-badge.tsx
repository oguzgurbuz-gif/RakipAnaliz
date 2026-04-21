import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { QualitySignal } from '@/lib/campaign-presentation'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// FE-10: Tooltip content for suspicious badge
const SUSPICIOUS_TOOLTIP = 'Junk veya düşük güvenilir scrape sonucu. Kampanya başlığı veya içeriği standart dışı olduğundan şüphelenilmektedir.'

interface DataQualityBadgeProps {
  signal: QualitySignal
  compact?: boolean
  className?: string
}

export function DataQualityBadge({ signal, compact = false, className }: DataQualityBadgeProps) {
  const Icon = signal.icon
  
  // FE-10: Add tooltip explanation for suspicious badge
  const getTooltipContent = (code: string): string => {
    switch (code) {
      case 'suspicious':
        return SUSPICIOUS_TOOLTIP
      case 'missing_dates':
        return 'Bu kampanyanın başlangıç veya bitiş tarihi eksik. Tarih bilgisi kampanya kartından veya AI analizinden çıkarılamadı.'
      case 'ai_missing':
        return 'Bu kampanya henüz AI ile analiz edilmedi. AI analizi kampanya türü, duygu ve özet bilgilerini çıkarır.'
      case 'missing_extracted_tags':
        return 'AI analizi yapıldı ancak bonus tutarı veya yüzdesi metinden çıkarılamadı. Kampanya kartını veya orijinal sayfayı kontrol edin.'
      case 'low_confidence':
        return 'AI tarafından çıkarılan tarihlerin güven skoru %50 altında. Tarihleri orijinal kaynaktan doğrulamanız önerilir.'
      default:
        return signal.label
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={signal.variant === 'warning' ? 'warning' : 'info'}
            className={cn('gap-1 border-transparent cursor-help', compact && 'px-2 py-0 text-[11px]', className)}
          >
            <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            {signal.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{getTooltipContent(signal.code)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
