'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Migration 018 — `competitive_intent` taxonomy badge.
 *
 * Replaces the legacy sentiment badge across the campaign UI. The five
 * codes mirror the ENUM in `campaign_ai_analyses.competitive_intent`:
 *   - acquisition: yeni müşteri çekme  (mavi)
 *   - retention:   mevcut müşteri      (yeşil)
 *   - brand:       marka inşası        (mor)
 *   - clearance:   sezon sonu / özel   (turuncu)
 *   - unknown:     net sınıflanamayan  (gri)
 *
 * `value` is intentionally `string | null | undefined` so the badge can be
 * dropped into existing templates that pass raw API fields without extra
 * narrowing.
 */

export type CompetitiveIntent =
  | 'acquisition'
  | 'retention'
  | 'brand'
  | 'clearance'
  | 'unknown'

interface IntentBadgeProps {
  value: string | null | undefined
  className?: string
  /** Render compact (no label, just dot) — useful for dense tables. */
  compact?: boolean
}

const INTENT_LABELS: Record<CompetitiveIntent, string> = {
  acquisition: 'Yeni Müşteri',
  retention: 'Mevcut Müşteri',
  brand: 'Marka',
  clearance: 'Sezon Sonu',
  unknown: 'Belirsiz',
}

const INTENT_COLORS: Record<CompetitiveIntent, string> = {
  acquisition: 'bg-blue-100 text-blue-800 border border-blue-200',
  retention: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  brand: 'bg-purple-100 text-purple-800 border border-purple-200',
  clearance: 'bg-orange-100 text-orange-800 border border-orange-200',
  unknown: 'bg-slate-100 text-slate-700 border border-slate-200',
}

export function getIntentLabel(value: string | null | undefined): string {
  if (value && value in INTENT_LABELS) {
    return INTENT_LABELS[value as CompetitiveIntent]
  }
  return INTENT_LABELS.unknown
}

export function getIntentColorClass(value: string | null | undefined): string {
  if (value && value in INTENT_COLORS) {
    return INTENT_COLORS[value as CompetitiveIntent]
  }
  return INTENT_COLORS.unknown
}

export function IntentBadge({ value, className, compact = false }: IntentBadgeProps) {
  const normalized: CompetitiveIntent =
    value && value in INTENT_LABELS ? (value as CompetitiveIntent) : 'unknown'
  const colorClass = INTENT_COLORS[normalized]
  const label = INTENT_LABELS[normalized]

  if (compact) {
    return (
      <span
        title={label}
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          colorClass.replace(/text-\S+/, '').replace(/border\S*/, '').trim(),
          className
        )}
      />
    )
  }

  return (
    <Badge className={cn(colorClass, 'whitespace-nowrap', className)}>
      {label}
    </Badge>
  )
}

export const COMPETITIVE_INTENT_OPTIONS: Array<{ value: CompetitiveIntent; label: string }> = [
  { value: 'acquisition', label: INTENT_LABELS.acquisition },
  { value: 'retention', label: INTENT_LABELS.retention },
  { value: 'brand', label: INTENT_LABELS.brand },
  { value: 'clearance', label: INTENT_LABELS.clearance },
  { value: 'unknown', label: INTENT_LABELS.unknown },
]
