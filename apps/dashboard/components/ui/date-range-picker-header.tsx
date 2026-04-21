'use client'

/**
 * DateRangePickerHeader — sayfaların üstüne yerleştirilen küçük bar.
 *
 * - 5 preset chip: Bugün / Bu Hafta / Bu Ay / Son 7 Gün / Son 30 Gün
 * - Sağda mevcut DateRangePicker (custom from/to seçimi)
 * - "Sıfırla" butonu (scope default'una döner)
 *
 * Kullanım:
 *   <DateRangePickerHeader scope="calendar" />
 */

import { useCallback } from 'react'
import { CalendarRange, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { useDateRange } from '@/lib/date-range/context'
import {
  PRESET_LABELS,
  PRESET_ORDER,
  type DateRangePresetKey,
} from '@/lib/date-range/presets'
import { cn } from '@/lib/utils'

export type DateRangePickerHeaderProps = {
  scope: string
  className?: string
  /** Header sol tarafa konacak opsiyonel etiket. */
  label?: string
}

export function DateRangePickerHeader({
  scope,
  className,
  label = 'Tarih Aralığı',
}: DateRangePickerHeaderProps) {
  const { from, to, preset, setRange, applyPreset, reset } = useDateRange(scope)

  const handlePresetClick = useCallback(
    (key: DateRangePresetKey) => {
      applyPreset(key)
    },
    [applyPreset]
  )

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-md border bg-card/60 px-3 py-2',
        'text-sm',
        className
      )}
      role="group"
      aria-label={label}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <CalendarRange className="h-4 w-4" />
        <span className="font-medium">{label}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {PRESET_ORDER.map((key) => {
          const isActive = preset === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => handlePresetClick(key)}
              aria-pressed={isActive}
              className={cn(
                'inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium transition-colors',
                'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                isActive &&
                  'border-primary/60 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
              )}
            >
              {PRESET_LABELS[key]}
            </button>
          )
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <DateRangePicker
          dateFrom={from}
          dateTo={to}
          onDateFromChange={(value) => setRange(value, to)}
          onDateToChange={(value) => setRange(from, value)}
          showPresets={false}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="gap-1 text-xs text-muted-foreground"
          title="Varsayılana dön"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Sıfırla
        </Button>
      </div>
    </div>
  )
}
