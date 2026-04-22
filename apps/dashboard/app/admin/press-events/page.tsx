'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Modal } from '@/components/ui/modal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/ui/page-header'
import { SectionHeader } from '@/components/ui/section-header'
import { Loader2, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
import {
  fetchAdminPressEvents,
  createPressEvent,
  updatePressEvent,
  deletePressEvent,
  type PressEvent,
  type PressEventInput,
  type PressEventType,
} from '@/lib/api'
import {
  PRESS_EVENT_COLORS,
  PRESS_EVENT_ICONS,
  PRESS_EVENT_LABELS,
} from '@/components/calendar/press-events-overlay'

/**
 * Admin Press Events — list / create / edit / delete UI.
 *
 * Uses the same auth flow as other admin pages (middleware → admin_session).
 * Mutations call the additive `lib/api` helpers, which hit
 * /api/admin/press-events[/:id].
 */

const TYPE_FILTER_OPTIONS: Array<{ value: '' | PressEventType; label: string }> = [
  { value: '', label: 'Tüm tipler' },
  { value: 'religious', label: 'Dini' },
  { value: 'sports', label: 'Spor' },
  { value: 'national', label: 'Ulusal' },
  { value: 'commercial', label: 'Ticari' },
  { value: 'other', label: 'Diğer' },
]

const TYPE_OPTIONS: Array<{ value: PressEventType; label: string }> = [
  { value: 'religious', label: 'Dini' },
  { value: 'sports', label: 'Spor' },
  { value: 'national', label: 'Ulusal' },
  { value: 'commercial', label: 'Ticari' },
  { value: 'other', label: 'Diğer' },
]

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = ['', String(CURRENT_YEAR - 1), String(CURRENT_YEAR), String(CURRENT_YEAR + 1), String(CURRENT_YEAR + 2)]

type FormState = {
  name: string
  event_type: PressEventType
  start_date: string
  end_date: string
  description: string
  impact_score: number
}

const EMPTY_FORM: FormState = {
  name: '',
  event_type: 'religious',
  start_date: '',
  end_date: '',
  description: '',
  impact_score: 5,
}

function formatDate(value: string): string {
  if (!value) return '-'
  return value
}

export default function AdminPressEventsPage() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = React.useState<'' | PressEventType>('')
  const [yearFilter, setYearFilter] = React.useState<string>('')
  const [editing, setEditing] = React.useState<PressEvent | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [pending, setPending] = React.useState(false)
  const [actionMessage, setActionMessage] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)

  const { data, isLoading, refetch, isFetching } = useQuery<PressEvent[]>({
    queryKey: ['admin-press-events', typeFilter, yearFilter],
    queryFn: () =>
      fetchAdminPressEvents({
        type: typeFilter || undefined,
        year: yearFilter || undefined,
      }),
    refetchInterval: 60_000,
  })

  const events = data ?? []

  const totals = React.useMemo(() => {
    const counts: Record<PressEventType, number> = {
      religious: 0,
      sports: 0,
      national: 0,
      commercial: 0,
      other: 0,
    }
    for (const e of events) counts[e.event_type] = (counts[e.event_type] ?? 0) + 1
    return counts
  }, [events])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing(null)
    setCreating(true)
    setActionError(null)
    setActionMessage(null)
  }

  const openEdit = (e: PressEvent) => {
    setEditing(e)
    setCreating(false)
    setForm({
      name: e.name,
      event_type: e.event_type,
      start_date: e.start_date,
      end_date: e.end_date,
      description: e.description ?? '',
      impact_score: e.impact_score,
    })
    setActionError(null)
    setActionMessage(null)
  }

  const closeModal = () => {
    setCreating(false)
    setEditing(null)
  }

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setPending(true)
    setActionError(null)
    setActionMessage(null)
    try {
      const input: PressEventInput = {
        name: form.name.trim(),
        event_type: form.event_type,
        start_date: form.start_date,
        end_date: form.end_date,
        description: form.description.trim() || null,
        impact_score: Number(form.impact_score) || 5,
      }
      if (creating) {
        await createPressEvent(input)
        setActionMessage(`Event eklendi: ${input.name}`)
      } else if (editing) {
        await updatePressEvent(editing.id, input)
        setActionMessage(`Event güncellendi: ${input.name}`)
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-press-events'] })
      // Public overlay cache'ini de tazele.
      await queryClient.invalidateQueries({ queryKey: ['press-events-overlay'] })
      closeModal()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kayıt başarısız')
    } finally {
      setPending(false)
    }
  }

  const handleDelete = async (e: PressEvent) => {
    if (!confirm(`"${e.name}" silinsin mi?`)) return
    setPending(true)
    setActionError(null)
    setActionMessage(null)
    try {
      await deletePressEvent(e.id)
      setActionMessage(`Silindi: ${e.name}`)
      await queryClient.invalidateQueries({ queryKey: ['admin-press-events'] })
      await queryClient.invalidateQueries({ queryKey: ['press-events-overlay'] })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Silme başarısız')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Press Calendar"
        description="Türkiye event seed'leri (dini, spor, ulusal, ticari). Kampanya takvimine overlay olarak çıkar; YoY karşılaştırma için kullanılır."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Yeni Event
            </Button>
          </div>
        }
      />

      <main className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-5">
          {(Object.keys(totals) as PressEventType[]).map((t) => (
            <Card key={t}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <span style={{ color: PRESS_EVENT_COLORS[t] }}>
                    {PRESS_EVENT_ICONS[t]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {PRESS_EVENT_LABELS[t]}
                  </span>
                </div>
                <div className="text-2xl font-bold mt-1">{totals[t]}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {(actionMessage || actionError) && (
          <Card>
            <CardContent className="p-4 space-y-1">
              {actionMessage && <p className="text-sm text-green-600">{actionMessage}</p>}
              {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <SectionHeader
              title="Filtreler"
              description="Tip + yıl. Yıl filtresi event'in o yılın içinden geçmesi yeterli sayar."
            />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs text-muted-foreground">Tip</label>
                <Select
                  value={typeFilter}
                  onChange={(e) =>
                    setTypeFilter(e.target.value as '' | PressEventType)
                  }
                  className="mt-1"
                >
                  {TYPE_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Yıl</label>
                <Select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="mt-1"
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y || 'Tüm yıllar'}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionHeader
              title={`Event'ler (${events.length})`}
              description="Tablo. Düzenleme veya silme için sağdaki butonları kullan."
            />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tip</TableHead>
                      <TableHead>Ad</TableHead>
                      <TableHead>Başlangıç</TableHead>
                      <TableHead>Bitiş</TableHead>
                      <TableHead className="text-right">Etki</TableHead>
                      <TableHead>Açıklama</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <Badge
                            style={{
                              backgroundColor: `${PRESS_EVENT_COLORS[e.event_type]}22`,
                              color: PRESS_EVENT_COLORS[e.event_type],
                            }}
                          >
                            {PRESS_EVENT_ICONS[e.event_type]}{' '}
                            {PRESS_EVENT_LABELS[e.event_type]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatDate(e.start_date)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatDate(e.end_date)}
                        </TableCell>
                        <TableCell className="text-right">
                          {e.impact_score}/10
                        </TableCell>
                        <TableCell className="max-w-[320px] truncate text-xs text-muted-foreground">
                          {e.description ?? '-'}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            disabled={pending}
                            aria-label="Düzenle"
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                          >
                            <Pencil className="h-3 w-3" />
                            Düzenle
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(e)}
                            disabled={pending}
                            aria-label="Sil"
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {events.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Event bulunamadı
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Modal
        isOpen={creating || editing !== null}
        onClose={closeModal}
        className="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-lg font-semibold">
            {creating ? 'Yeni Event' : `Düzenle: ${editing?.name ?? ''}`}
          </h2>

          <div>
            <label className="text-xs text-muted-foreground">Ad</label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ramazan 2027"
              className="mt-1"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Tip</label>
              <Select
                value={form.event_type}
                onChange={(e) =>
                  setForm({ ...form, event_type: e.target.value as PressEventType })
                }
                className="mt-1"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Etki (1-10)</label>
              <Input
                required
                type="number"
                min={1}
                max={10}
                value={form.impact_score}
                onChange={(e) =>
                  setForm({ ...form, impact_score: parseInt(e.target.value, 10) || 5 })
                }
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Başlangıç</label>
              <Input
                required
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Bitiş</label>
              <Input
                required
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Açıklama</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Türkçe açıklama (opsiyonel)"
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeModal} disabled={pending}>
              İptal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {creating ? 'Oluştur' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
