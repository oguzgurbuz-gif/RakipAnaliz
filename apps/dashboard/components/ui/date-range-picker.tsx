'use client'

import { useState, useCallback } from 'react'
import { DATE_RANGE_PRESETS, useDateRange, DateRangePreset } from '@/lib/hooks/use-date-range'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar, ChevronDown } from 'lucide-react'

type DateRangePickerProps = {
  dateFrom: string
  dateTo: string
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
  onPresetChange?: (preset: DateRangePreset) => void
  showPresets?: boolean
  className?: string
}

export function DateRangePicker({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onPresetChange,
  showPresets = true,
  className = '',
}: DateRangePickerProps) {
  const [showDropdown, setShowDropdown] = useState(false)

  const handlePresetClick = useCallback((preset: DateRangePreset) => {
    const { from, to } = preset.getDates()
    onDateFromChange(from)
    onDateToChange(to)
    onPresetChange?.(preset)
    setShowDropdown(false)
  }, [onDateFromChange, onDateToChange, onPresetChange])

  const handleCustomDateChange = useCallback((type: 'from' | 'to', value: string) => {
    if (type === 'from') {
      onDateFromChange(value)
    } else {
      onDateToChange(value)
    }
  }, [onDateFromChange, onDateToChange])

  const activePresetLabel = DATE_RANGE_PRESETS.find(p => {
    const dates = p.getDates()
    return dates.from === dateFrom && dates.to === dateTo
  })?.label

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showPresets && (
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDropdown(!showDropdown)}
            className="gap-2 min-w-[140px] justify-start"
          >
            <Calendar className="h-4 w-4" />
            <span className="truncate">{activePresetLabel || 'Özel Tarih'}</span>
            <ChevronDown className="h-4 w-4 ml-auto" />
          </Button>
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
              <div className="absolute top-full left-0 mt-1 z-20 bg-background border rounded-lg shadow-lg py-1 min-w-[160px]">
                {DATE_RANGE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePresetClick(preset)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${
                      activePresetLabel === preset.label ? 'bg-primary/10 text-primary' : ''
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => handleCustomDateChange('from', e.target.value)}
          className="w-36 bg-background"
        />
        <span className="text-muted-foreground">-</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => handleCustomDateChange('to', e.target.value)}
          className="w-36 bg-background"
        />
      </div>
    </div>
  )
}
