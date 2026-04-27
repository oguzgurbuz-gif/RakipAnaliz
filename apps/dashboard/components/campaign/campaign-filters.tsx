'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import { COMPETITIVE_INTENT_OPTIONS } from '@/components/ui/intent-badge'
import { CANONICAL_STATUS_OPTIONS } from '@/lib/i18n/status'
import type { CampaignFilters } from '@/types'

interface CampaignFiltersProps {
  filters: CampaignFilters
  onFiltersChange: (filters: CampaignFilters) => void
  sites?: { id: string; name: string }[]
}

const DATE_MODE_OPTIONS = [
  { value: 'started_in_range', label: 'Başlangıç tarihi aralığında' },
  { value: 'ended_in_range', label: 'Bitiş tarihi aralığında' },
  { value: 'active_during_range', label: 'Aktif dönemde' },
  { value: 'changed_in_range', label: 'Değişiklik tarihi' },
  { value: 'passive_in_range', label: 'Pasif dönemde' },
  { value: 'seen_in_range', label: 'Görülme tarihi' },
]

// Wave 1 #1.4 — Kanonik 4 state. Backend yalnız active/expired/hidden/pending
// yazıyor; legacy 'passive' / 'ended' opsiyonları kaldırıldı.
// FE-1 — etiketler `lib/i18n/status.ts` üzerinden tek noktadan besleniyor.
const STATUS_OPTIONS = CANONICAL_STATUS_OPTIONS

// Migration 018 — `intent` filter (Amaç) replaces sentiment in the UI.
// `COMPETITIVE_INTENT_OPTIONS` is the single source of truth for label/value.
const INTENT_OPTIONS = COMPETITIVE_INTENT_OPTIONS

const DATE_COMPLETENESS_OPTIONS = [
  { value: 'complete', label: 'Başlangıç + Bitiş Var' },
  { value: 'missing_start', label: 'Başlangıç Eksik' },
  { value: 'missing_end', label: 'Bitiş Eksik' },
  { value: 'missing_any', label: 'Herhangi Biri Eksik' },
]

const CAMPAIGN_TYPE_OPTIONS = [
  { value: 'hoş-geldin-bonusu', label: 'Hoş Geldin Bonusu' },
  { value: 'depozit-bonusu', label: 'Depozit Bonusu' },
  { value: 'freebet', label: 'Freebet' },
  { value: 'cashback', label: 'Cashback' },
  { value: 'oran-artışı', label: 'Oran Artışı' },
  { value: 'çekiliş-lottery', label: 'Çekiliş / Lottery' },
  { value: 'spending-reward', label: 'Harcama Ödülü' },
  { value: 'ek-kazanç', label: 'Ek Kazanç' },
  { value: 'sadakat-vip', label: 'Sadakat / VIP' },
  { value: 'turnuva-yarışma', label: 'Turnuva / Yarışma' },
  { value: 'spesifik-oyun', label: 'Spesifik Oyun' },
  { value: 'genel-promosyon', label: 'Genel Promosyon' },
  { value: 'diğer', label: 'Diğer' },
]

const SORT_OPTIONS = [
  { value: 'last_seen_at', label: 'Son görülme' },
  { value: 'valid_from', label: 'Başlangıç tarihi' },
  { value: 'valid_to', label: 'Bitiş tarihi' },
  { value: 'created_at', label: 'Oluşturulma' },
  { value: 'updated_at', label: 'Güncellenme' },
  { value: 'title', label: 'Başlık (A-Z)' },
  { value: '-title', label: 'Başlık (Z-A)' },
  { value: 'status', label: 'Durum' },
  { value: 'bonus_amount', label: 'Bonus miktarı' },
  { value: '-bonus_amount', label: 'Bonus miktarı (azalan)' },
  { value: 'duration', label: 'Kampanya süresi' },
  { value: '-duration', label: 'Kampanya süresi (azalan)' },
]

export function CampaignFilters({ filters, onFiltersChange, sites }: CampaignFiltersProps) {
  const handleChange = (key: keyof CampaignFilters, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    })
  }

  const handleClear = () => {
    onFiltersChange({})
  }

  const hasFilters = Object.values(filters).some((v) => v && v !== '')

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Kampanya ara..."
            value={filters.search || ''}
            onChange={(e) => handleChange('search', e.target.value)}
            className="pl-9"
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <X className="h-4 w-4 mr-1" />
            Temizle
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        <div>
          <label className="text-sm font-medium text-muted-foreground">Tarih Modu</label>
          <Select
            value={filters.dateMode || ''}
            onChange={(e) => handleChange('dateMode', e.target.value)}
            className="mt-1"
          >
            <option value="">Tümü</option>
            {DATE_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Tarih Durumu</label>
          <Select
            value={filters.dateCompleteness || ''}
            onChange={(e) => handleChange('dateCompleteness', e.target.value)}
            className="mt-1"
          >
            <option value="">Tümü</option>
            {DATE_COMPLETENESS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Site</label>
          <Select
            value={filters.site || ''}
            onChange={(e) => handleChange('site', e.target.value)}
            className="mt-1"
          >
            <option value="">Tümü</option>
            {sites?.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Durum</label>
          <Select
            value={filters.status || ''}
            onChange={(e) => handleChange('status', e.target.value)}
            className="mt-1"
          >
            <option value="">Tümü</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Kampanya Tipi</label>
          <Select
            value={filters.campaign_type || ''}
            onChange={(e) => handleChange('campaign_type', e.target.value)}
            className="mt-1"
          >
            <option value="">Tümü</option>
            {CAMPAIGN_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Kategori</label>
          <Select
            value={filters.category || ''}
            onChange={(e) => handleChange('category', e.target.value)}
            className="mt-1"
          >
            <option value="">Tümü</option>
            {CAMPAIGN_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Amaç</label>
          <Select
            value={filters.intent || ''}
            onChange={(e) => handleChange('intent', e.target.value)}
            className="mt-1"
          >
            <option value="">Tümü</option>
            {INTENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Sıralama</label>
          <Select
            value={filters.sort || ''}
            onChange={(e) => handleChange('sort', e.target.value)}
            className="mt-1"
          >
            <option value="">Varsayılan</option>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  )
}
