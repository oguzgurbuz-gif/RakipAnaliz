'use client'

/**
 * DateRangePickerHeader — sayfaların üstüne yerleştirilen küçük bar.
 *
 * - 4 hızlı tarih chip'i: Bu Hafta / Bu Ay / Son 7 Gün / Son 30 Gün
 *   (FE-7 — `lib/date/quick-ranges.ts` üzerinden besleniyor)
 * - Sağda mevcut DateRangePicker (custom from/to seçimi)
 * - "Sıfırla" butonu (scope default'una döner)
 *
 * Kullanım:
 *   <DateRangePickerHeader scope="calendar" />
 *
 * Aktif chip highlight'ı `useDateRange().preset` ile karşılaştırma
 * üzerinden yapılır; URL'deki ?preset= değeri DateRangeProvider tarafından
 * okunur (Batch A'nın `lib/url/params.ts` short-form sözleşmesiyle uyumlu).
 */

import { useCallback } from 'react'
import { CalendarRange, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { useDateRange } from '@/lib/date-range/context'
import { QUICK_RANGE_CHIPS, type DateRangePresetKey } from '@/lib/date/quick-ranges'
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
        {QUICK_RANGE_CHIPS.map(({ key, label }) => {
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
              {label}
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
