'use client'

import { useState, useCallback, useMemo } from 'react'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays, subMonths, format } from 'date-fns'
import { tr } from 'date-fns/locale'

export type DateRangePreset = {
  label: string
  getDates: () => { from: string; to: string }
}

export const DATE_RANGE_PRESETS: DateRangePreset[] = [
  {
    label: 'Bugün',
    getDates: () => {
      const today = new Date()
      return { from: format(startOfDay(today), 'yyyy-MM-dd'), to: format(endOfDay(today), 'yyyy-MM-dd') }
    },
  },
  {
    label: 'Son 7 gün',
    getDates: () => {
      const today = new Date()
      const from = subDays(today, 7)
      return { from: format(startOfDay(from), 'yyyy-MM-dd'), to: format(endOfDay(today), 'yyyy-MM-dd') }
    },
  },
  {
    label: 'Son 30 gün',
    getDates: () => {
      const today = new Date()
      const from = subDays(today, 30)
      return { from: format(startOfDay(from), 'yyyy-MM-dd'), to: format(endOfDay(today), 'yyyy-MM-dd') }
    },
  },
  {
    label: 'Bu ay',
    getDates: () => {
      const today = new Date()
      return { from: format(startOfMonth(today), 'yyyy-MM-dd'), to: format(endOfMonth(today), 'yyyy-MM-dd') }
    },
  },
  {
    label: 'Geçen ay',
    getDates: () => {
      const today = new Date()
      const lastMonth = subMonths(today, 1)
      return { from: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), to: format(endOfMonth(lastMonth), 'yyyy-MM-dd') }
    },
  },
  {
    label: 'Bu yıl',
    getDates: () => {
      const today = new Date()
      return { from: format(startOfYear(today), 'yyyy-MM-dd'), to: format(endOfDay(today), 'yyyy-MM-dd') }
    },
  },
]

export function useDateRange(initialFrom?: string, initialTo?: string) {
  const [dateFrom, setDateFrom] = useState(initialFrom || '')
  const [dateTo, setDateTo] = useState(initialTo || '')

  const setRange = useCallback((from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
  }, [])

  const applyPreset = useCallback((preset: DateRangePreset) => {
    const { from, to } = preset.getDates()
    setDateFrom(from)
    setDateTo(to)
  }, [])

  const clearRange = useCallback(() => {
    setDateFrom('')
    setDateTo('')
  }, [])

  const dateRange = useMemo(() => ({
    from: dateFrom,
    to: dateTo,
  }), [dateFrom, dateTo])

  return {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    setRange,
    applyPreset,
    clearRange,
    dateRange,
    presets: DATE_RANGE_PRESETS,
  }
}
