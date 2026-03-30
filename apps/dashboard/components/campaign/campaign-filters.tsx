'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
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

const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktif' },
  { value: 'ended', label: 'Bitmiş' },
  { value: 'passive', label: 'Pasif' },
  { value: 'changed', label: 'Değişmiş' },
]

const SENTIMENT_OPTIONS = [
  { value: 'positive', label: 'Pozitif' },
  { value: 'negative', label: 'Negatif' },
  { value: 'neutral', label: 'Nötr' },
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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
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
          <label className="text-sm font-medium text-muted-foreground">Başlangıç</label>
          <Input
            type="date"
            value={filters.dateFrom || ''}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Bitiş</label>
          <Input
            type="date"
            value={filters.dateTo || ''}
            onChange={(e) => handleChange('dateTo', e.target.value)}
            className="mt-1"
          />
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
          <label className="text-sm font-medium text-muted-foreground">Duygu</label>
          <Select
            value={filters.sentiment || ''}
            onChange={(e) => handleChange('sentiment', e.target.value)}
            className="mt-1"
          >
            <option value="">Tümü</option>
            {SENTIMENT_OPTIONS.map((opt) => (
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
