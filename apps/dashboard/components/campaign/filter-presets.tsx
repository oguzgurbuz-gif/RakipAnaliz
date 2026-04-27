'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Save, Bookmark, ChevronDown, Trash2, RotateCcw, Pencil } from 'lucide-react'
import type { CampaignFilters } from '@/types'

interface FilterPreset {
  id: string
  name: string
  filters: CampaignFilters
  /** FE-6 — eklenme zamanı, sıralama / debug için. */
  createdAt: string
}

interface FilterPresetsProps {
  filters: CampaignFilters
  onApplyPreset: (filters: CampaignFilters) => void
  onClearFilters: () => void
}

/**
 * FE-6 — localStorage anahtarı. Eski sürümde `campaign-filter-presets`
 * kullanılıyordu; tek sefer migrate ediyoruz (alt taraftaki
 * `loadPresets`).
 */
const STORAGE_KEY = 'rakip-analiz:filter-presets'
const LEGACY_STORAGE_KEY = 'campaign-filter-presets'

/**
 * Preset listesini localStorage'dan oku. Eski key altında veri varsa
 * yeni key'e taşı (createdAt'ı yoksa now() ile doldur). Bozuk JSON
 * sessizce boş array'e düşer.
 */
export function loadPresets(): FilterPreset[] {
  if (typeof window === 'undefined') return []
  try {
    const newRaw = localStorage.getItem(STORAGE_KEY)
    if (newRaw) {
      const parsed = JSON.parse(newRaw)
      if (Array.isArray(parsed)) {
        return parsed.map((p) => ({
          id: String(p.id),
          name: String(p.name ?? ''),
          filters: (p.filters ?? {}) as CampaignFilters,
          createdAt:
            typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
        }))
      }
    }
    // Migration — eski anahtar.
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw)
      if (Array.isArray(parsed)) {
        const migrated = parsed.map((p) => ({
          id: String(p.id ?? Date.now()),
          name: String(p.name ?? ''),
          filters: (p.filters ?? {}) as CampaignFilters,
          createdAt: new Date().toISOString(),
        }))
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
        localStorage.removeItem(LEGACY_STORAGE_KEY)
        return migrated
      }
    }
  } catch {
    // ignore
  }
  return []
}

function persistPresets(presets: FilterPreset[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // ignore quota errors
  }
}

export function FilterPresets({ filters, onApplyPreset, onClearFilters }: FilterPresetsProps) {
  void onClearFilters
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    setPresets(loadPresets())
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
      createdAt: new Date().toISOString(),
    }

    const updated = [...presets, newPreset]
    setPresets(updated)
    persistPresets(updated)
    setPresetName('')
    setShowSaveModal(false)
  }

  const deletePreset = (id: string) => {
    const updated = presets.filter((p) => p.id !== id)
    setPresets(updated)
    persistPresets(updated)
  }

  const renamePreset = (id: string, nextName: string) => {
    const trimmed = nextName.trim()
    if (!trimmed) return
    const updated = presets.map((p) => (p.id === id ? { ...p, name: trimmed } : p))
    setPresets(updated)
    persistPresets(updated)
    setRenamingId(null)
    setRenameValue('')
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
                    const isRenaming = renamingId === preset.id
                    return (
                      <div
                        key={preset.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex-1 min-w-0">
                          {isRenaming ? (
                            <Input
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') renamePreset(preset.id, renameValue)
                                if (e.key === 'Escape') {
                                  setRenamingId(null)
                                  setRenameValue('')
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <>
                              <p className="font-medium truncate">{preset.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {filterCount} filtre
                              </p>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          {isRenaming ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => renamePreset(preset.id, renameValue)}
                              >
                                Kaydet
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setRenamingId(null)
                                  setRenameValue('')
                                }}
                              >
                                İptal
                              </Button>
                            </>
                          ) : (
                            <>
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
                                onClick={() => {
                                  setRenamingId(preset.id)
                                  setRenameValue(preset.name)
                                }}
                                title="Yeniden adlandır"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deletePreset(preset.id)}
                                className="text-red-500 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
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
  void onClearFilters
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    setPresets(loadPresets())
  }, [])

  const savePreset = () => {
    if (!presetName.trim()) return
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName.trim(),
      filters: { ...filters },
      createdAt: new Date().toISOString(),
    }
    const updated = [...presets, newPreset]
    setPresets(updated)
    persistPresets(updated)
    setPresetName('')
    setShowSaveModal(false)
  }

  const deletePreset = (id: string) => {
    const updated = presets.filter((p) => p.id !== id)
    setPresets(updated)
    persistPresets(updated)
  }

  const renamePreset = (id: string, nextName: string) => {
    const trimmed = nextName.trim()
    if (!trimmed) return
    const updated = presets.map((p) => (p.id === id ? { ...p, name: trimmed } : p))
    setPresets(updated)
    persistPresets(updated)
    setRenamingId(null)
    setRenameValue('')
  }

  const applyPreset = (preset: FilterPreset) => {
    onApplyPreset(preset.filters)
  }

  return (
    <>
      {/* Saved presets display */}
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground py-1">Kayıtlı Filtreler:</span>
          {presets.map((preset) => {
            const isRenaming = renamingId === preset.id
            if (isRenaming) {
              return (
                <div key={preset.id} className="flex items-center gap-1">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renamePreset(preset.id, renameValue)
                      if (e.key === 'Escape') {
                        setRenamingId(null)
                        setRenameValue('')
                      }
                    }}
                    autoFocus
                    className="h-7 w-32 text-xs"
                  />
                  <button
                    onClick={() => renamePreset(preset.id, renameValue)}
                    className="text-xs text-primary hover:underline"
                    title="Kaydet"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => {
                      setRenamingId(null)
                      setRenameValue('')
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    title="İptal"
                  >
                    ×
                  </button>
                </div>
              )
            }
            return (
              <div
                key={preset.id}
                className="group flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10"
              >
                <button
                  onClick={() => applyPreset(preset)}
                  className="text-xs pl-3 py-1 hover:bg-primary/20 rounded-l-full transition-colors"
                  title={`${preset.name} — ${new Date(preset.createdAt).toLocaleDateString('tr-TR')}`}
                >
                  {preset.name}
                </button>
                <button
                  onClick={() => {
                    setRenamingId(preset.id)
                    setRenameValue(preset.name)
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity px-1"
                  title="Yeniden adlandır"
                  aria-label="Yeniden adlandır"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => deletePreset(preset.id)}
                  className="text-xs text-muted-foreground hover:text-red-500 px-2 py-1 rounded-r-full"
                  title="Sil"
                  aria-label="Sil"
                >
                  ×
                </button>
              </div>
            )
          })}
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && presetName.trim()) savePreset()
              }}
              className="mb-4"
              autoFocus
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
