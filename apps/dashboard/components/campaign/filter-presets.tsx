'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Save, Bookmark, ChevronDown, Trash2, RotateCcw } from 'lucide-react'
import type { CampaignFilters } from '@/types'

interface FilterPreset {
  id: string
  name: string
  filters: CampaignFilters
}

interface FilterPresetsProps {
  filters: CampaignFilters
  onApplyPreset: (filters: CampaignFilters) => void
  onClearFilters: () => void
}

const STORAGE_KEY = 'campaign-filter-presets'

export function FilterPresets({ filters, onApplyPreset, onClearFilters }: FilterPresetsProps) {
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setPresets(JSON.parse(saved))
      } catch {
        setPresets([])
      }
    }
  }, [])

  const savePreset = () => {
    if (!presetName.trim()) return

    const hasActiveFilters = Object.values(filters).some(
      (v) => v !== undefined && v !== ''
    )
    if (!hasActiveFilters) return

    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: { ...filters },
    }

    const updated = [...presets, newPreset]
    setPresets(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setPresetName('')
    setShowSaveModal(false)
  }

  const deletePreset = (id: string) => {
    const updated = presets.filter((p) => p.id !== id)
    setPresets(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  const applyPreset = (preset: FilterPreset) => {
    onApplyPreset(preset.filters)
    setIsOpen(false)
  }

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== ''
  ).length

  return (
    <div className="relative">
      {/* Main dropdown trigger */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2"
          >
            <Bookmark className="h-4 w-4" />
            Kayıtlı Filtreler
            {presets.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 justify-center">
                {presets.length}
              </Badge>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>

          {isOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsOpen(false)}
              />
              <div className="absolute top-full left-0 mt-2 w-64 rounded-lg border bg-background shadow-lg z-20">
                <div className="p-2 border-b">
                  <p className="text-xs font-medium text-muted-foreground">
                    Kayıtlı Filtreler ({presets.length})
                  </p>
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {presets.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">
                      Kayıtlı filtre yok
                    </p>
                  ) : (
                    presets.map((preset) => {
                      const filterCount = Object.values(preset.filters).filter(
                        (v) => v !== undefined && v !== ''
                      ).length
                      return (
                        <div
                          key={preset.id}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group"
                        >
                          <button
                            onClick={() => applyPreset(preset)}
                            className="flex-1 text-left"
                          >
                            <span className="font-medium text-sm">{preset.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({filterCount} filtre)
                            </span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deletePreset(preset.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
                            title="Sil"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
                {presets.length > 0 && (
                  <div className="p-2 border-t">
                    <button
                      onClick={() => {
                        setShowManageModal(true)
                        setIsOpen(false)
                      }}
                      className="w-full text-xs text-muted-foreground hover:text-foreground p-1"
                    >
                      Presetleri Yönet
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Save button */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSaveModal(true)}
            className="text-muted-foreground"
          >
            <Save className="h-4 w-4 mr-1" />
            Kaydet
          </Button>
        )}
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <Card className="max-w-sm w-full mx-4">
            <CardHeader>
              <CardTitle className="text-lg">Filtre Kaydet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Filtre adı..."
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                autoFocus
              />
              <div className="flex flex-wrap gap-1">
                {Object.entries(filters)
                  .filter(([, v]) => v !== undefined && v !== '')
                  .map(([key, value]) => (
                    <Badge key={key} variant="outline" className="text-xs">
                      {key}: {String(value)}
                    </Badge>
                  ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowSaveModal(false)
                    setPresetName('')
                  }}
                >
                  İptal
                </Button>
                <Button size="sm" onClick={savePreset} disabled={!presetName.trim()}>
                  Kaydet
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manage Modal */}
      {showManageModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <Card className="max-w-md w-full mx-4">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                Presetleri Yönet
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowManageModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {presets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Kayıtlı preset yok
                </p>
              ) : (
                <div className="space-y-2">
                  {presets.map((preset) => {
                    const filterCount = Object.values(preset.filters).filter(
                      (v) => v !== undefined && v !== ''
                    ).length
                    return (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div>
                          <p className="font-medium">{preset.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {filterCount} filtre
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              applyPreset(preset)
                              setShowManageModal(false)
                            }}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Uygula
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deletePreset(preset.id)}
                            className="text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

export function FilterPresetsInline({
  filters,
  onApplyPreset,
  onClearFilters,
  activeFilterEntries,
}: {
  filters: CampaignFilters
  onApplyPreset: (filters: CampaignFilters) => void
  onClearFilters: () => void
  activeFilterEntries: [string, unknown][]
}) {
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        setPresets(JSON.parse(saved))
      } catch {
        setPresets([])
      }
    }
  }, [])

  const savePreset = () => {
    if (!presetName.trim()) return
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: { ...filters },
    }
    const updated = [...presets, newPreset]
    setPresets(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    setPresetName('')
    setShowSaveModal(false)
  }

  const deletePreset = (id: string) => {
    const updated = presets.filter((p) => p.id !== id)
    setPresets(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  const applyPreset = (preset: FilterPreset) => {
    onApplyPreset(preset.filters)
    setIsOpen(false)
  }

  return (
    <>
      {/* Saved presets display */}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground py-1">Kayıtlı Filtreler:</span>
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-1">
              <button
                onClick={() => applyPreset(preset)}
                className="text-xs px-3 py-1 rounded-full border border-primary/30 bg-primary/10 hover:bg-primary/20 transition-colors"
              >
                {preset.name}
              </button>
              <button
                onClick={() => deletePreset(preset.id)}
                className="text-xs text-muted-foreground hover:text-red-500"
                title="Sil"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Save button */}
      {activeFilterEntries.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => setShowSaveModal(true)} className="text-xs h-7">
          <Save className="h-3 w-3 mr-1" />
          Filtre Kaydet
        </Button>
      )}

      {/* Save modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-background rounded-lg p-6 shadow-lg max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-4">Filtre Kaydet</h3>
            <Input
              placeholder="Filtre adı..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="mb-4"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowSaveModal(false)}>
                İptal
              </Button>
              <Button size="sm" onClick={savePreset} disabled={!presetName.trim()}>
                Kaydet
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
