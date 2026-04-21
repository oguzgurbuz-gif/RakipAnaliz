'use client'

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, CheckSquare, Square, X } from 'lucide-react'
import JSZip from 'jszip'

type GalleryItem = {
  id: string
  title: string
  primaryImage?: string | null
  site?: { name: string } | null
}

type GalleryActionsProps = {
  items: GalleryItem[]
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  isLoading?: boolean
}

export function GalleryActions({ items, selectedIds, onSelectionChange, isLoading }: GalleryActionsProps) {
  const allSelected = items.length > 0 && selectedIds.size === items.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length

  const toggleAll = useCallback(() => {
    if (allSelected || someSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(items.map((item) => item.id)))
    }
  }, [allSelected, someSelected, items, onSelectionChange])

  const clearSelection = useCallback(() => {
    onSelectionChange(new Set())
  }, [onSelectionChange])

  const downloadSelected = useCallback(async () => {
    if (selectedIds.size === 0) return

    const selectedItems = items.filter((item) => selectedIds.has(item.id))
    const zip = new JSZip()

    for (const item of selectedItems) {
      if (item.primaryImage) {
        try {
          const response = await fetch(item.primaryImage)
          const blob = await response.blob()
          const extension = item.primaryImage.split('.').pop()?.split('?')[0] || 'jpg'
          const filename = `${item.title.replace(/[^a-zA-Z0-9]/g, '_')}_${item.id}.${extension}`
          zip.file(filename, blob)
        } catch (error) {
          console.error(`Failed to fetch image for ${item.title}:`, error)
        }
      }
    }

    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = `gallery-${selectedIds.size}-items-${new Date().toISOString().split('T')[0]}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }, [selectedIds, items])

  if (items.length === 0) return null

  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-card">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleAll}
          disabled={isLoading}
          className="gap-2"
        >
          {allSelected || someSelected ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {allSelected ? 'Tümünü Seç' : someSelected ? 'Tümünü Seç' : 'Tümünü Seç'}
        </Button>

        {selectedIds.size > 0 && (
          <Button variant="ghost" size="sm" onClick={clearSelection} className="gap-1 text-muted-foreground">
            <X className="h-4 w-4" />
            Seçimi Temizle
          </Button>
        )}

        <Badge variant="secondary" className="font-normal">
          {selectedIds.size > 0 ? (
            <span>{selectedIds.size} / {items.length} seçili</span>
          ) : (
            <span>{items.length} görsel</span>
          )}
        </Badge>
      </div>

      {selectedIds.size > 0 && (
        <Button size="sm" onClick={downloadSelected} className="gap-2">
          <Download className="h-4 w-4" />
          Seçilenleri İndir (ZIP)
        </Button>
      )}
    </div>
  )
}
