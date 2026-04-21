'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Mail,
  Clock,
  Save,
  CheckCircle,
  AlertCircle,
  Trash2,
  Power,
} from 'lucide-react'
import {
  createReportSchedule,
  deleteReportSchedule,
  fetchReportSchedules,
  updateReportSchedule,
  type ReportSchedule,
  type ReportScheduleFrequency,
} from '@/lib/api'

const HOUR_DEFAULT = 9
const DAY_OF_WEEK_DEFAULT = 1 // Monday

function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

export function ScheduleForm() {
  const [scheduleType, setScheduleType] = useState<ReportScheduleFrequency>('weekly')
  const [emails, setEmails] = useState('')
  const [hour, setHour] = useState<number>(HOUR_DEFAULT)
  const [dayOfWeek, setDayOfWeek] = useState<number>(DAY_OF_WEEK_DEFAULT)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)
  const [schedules, setSchedules] = useState<ReportSchedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)

  const loadSchedules = async () => {
    setIsLoading(true)
    try {
      const data = await fetchReportSchedules()
      setSchedules(data)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadSchedules()
  }, [])

  const resetForm = () => {
    setEditingId(null)
    setScheduleType('weekly')
    setEmails('')
    setHour(HOUR_DEFAULT)
    setDayOfWeek(DAY_OF_WEEK_DEFAULT)
  }

  const handleSubmit = async () => {
    const recipients = parseRecipients(emails)
    if (recipients.length === 0) {
      setStatusMessage({ kind: 'error', message: 'En az bir email adresi gerekli.' })
      return
    }
    const invalid = recipients.find((entry) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry))
    if (invalid) {
      setStatusMessage({ kind: 'error', message: `Geçersiz email: ${invalid}` })
      return
    }

    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      if (editingId) {
        await updateReportSchedule(editingId, {
          frequency: scheduleType,
          recipients,
          hour,
          dayOfWeek: scheduleType === 'weekly' ? dayOfWeek : null,
        })
        setStatusMessage({ kind: 'success', message: 'Zamanlama güncellendi.' })
      } else {
        await createReportSchedule({
          frequency: scheduleType,
          recipients,
          hour,
          dayOfWeek: scheduleType === 'weekly' ? dayOfWeek : null,
        })
        setStatusMessage({ kind: 'success', message: 'Zamanlama kaydedildi.' })
      }
      resetForm()
      await loadSchedules()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
      setStatusMessage({ kind: 'error', message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (schedule: ReportSchedule) => {
    setEditingId(schedule.id)
    setScheduleType(schedule.frequency)
    setEmails(schedule.recipients.join(', '))
    setHour(schedule.hour)
    setDayOfWeek(schedule.dayOfWeek ?? DAY_OF_WEEK_DEFAULT)
    setStatusMessage(null)
  }

  const handleToggle = async (schedule: ReportSchedule) => {
    try {
      await updateReportSchedule(schedule.id, { enabled: !schedule.enabled })
      await loadSchedules()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
      setStatusMessage({ kind: 'error', message })
    }
  }

  const handleDelete = async (schedule: ReportSchedule) => {
    if (!confirm(`Bu zamanlama silinsin mi? (${schedule.recipients.length} alıcı)`)) return
    try {
      await deleteReportSchedule(schedule.id)
      if (editingId === schedule.id) resetForm()
      await loadSchedules()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
      setStatusMessage({ kind: 'error', message })
    }
  }

  return (
    <Card className="border-primary/15 bg-gradient-to-br from-card to-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-primary" />
          Email Rapor Zamanlaması
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Frequency */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Frekans</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="schedule-type"
                value="weekly"
                checked={scheduleType === 'weekly'}
                onChange={() => setScheduleType('weekly')}
                className="accent-primary"
              />
              <span className="text-sm">Haftalık</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="schedule-type"
                value="monthly"
                checked={scheduleType === 'monthly'}
                onChange={() => setScheduleType('monthly')}
                className="accent-primary"
              />
              <span className="text-sm">Aylık</span>
            </label>
          </div>
        </div>

        {/* Day of week (only when weekly) */}
        {scheduleType === 'weekly' && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Gün</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="w-full bg-background border rounded px-2 py-1.5 text-sm"
            >
              <option value={0}>Pazar</option>
              <option value={1}>Pazartesi</option>
              <option value={2}>Salı</option>
              <option value={3}>Çarşamba</option>
              <option value={4}>Perşembe</option>
              <option value={5}>Cuma</option>
              <option value={6}>Cumartesi</option>
            </select>
          </div>
        )}

        {/* Hour */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Saat (UTC)</label>
          <Input
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (Number.isFinite(next)) setHour(Math.min(23, Math.max(0, Math.floor(next))))
            }}
            className="bg-background w-24"
          />
        </div>

        {/* Recipients */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Alıcılar</label>
          <Input
            type="text"
            placeholder="ornek@email.com, ikinci@email.com"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            className="bg-background"
          />
          <p className="text-xs text-muted-foreground">
            Birden fazla alıcı için virgül ile ayırın.
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-2">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1"
          >
            {isSubmitting ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Kaydediliyor...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {editingId ? 'Güncelle' : 'Kaydet'}
              </>
            )}
          </Button>
          {editingId && (
            <Button variant="outline" onClick={resetForm} disabled={isSubmitting}>
              İptal
            </Button>
          )}
        </div>

        {/* Status */}
        {statusMessage && (
          <div
            className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
              statusMessage.kind === 'success'
                ? 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-300'
                : 'border-destructive/30 bg-destructive/5 text-destructive'
            }`}
          >
            {statusMessage.kind === 'success' ? (
              <CheckCircle className="h-3.5 w-3.5 mt-0.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
            )}
            <span>{statusMessage.message}</span>
          </div>
        )}

        {/* Existing schedules */}
        <div className="pt-2 border-t space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Mevcut Zamanlamalar
          </div>
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Yükleniyor...</div>
          ) : schedules.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Henüz zamanlama yok. Yukarıdaki form ile ekleyin.
            </div>
          ) : (
            <ul className="space-y-2">
              {schedules.map((schedule) => (
                <li
                  key={schedule.id}
                  className="rounded-md border bg-background/50 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        {schedule.frequency === 'weekly' ? 'Haftalık' : 'Aylık'} ·{' '}
                        {String(schedule.hour).padStart(2, '0')}:00 UTC
                        {!schedule.enabled && ' · (devre dışı)'}
                      </div>
                      <div className="text-muted-foreground truncate" title={schedule.recipients.join(', ')}>
                        {schedule.recipients.join(', ') || '—'}
                      </div>
                      <div className="text-muted-foreground">
                        Son gönderim: {formatTimestamp(schedule.lastSentAt)}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(schedule)}
                        className="text-primary hover:underline text-xs"
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggle(schedule)}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs"
                        title={schedule.enabled ? 'Devre dışı bırak' : 'Etkinleştir'}
                      >
                        <Power className="h-3 w-3" />
                        {schedule.enabled ? 'Durdur' : 'Aç'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(schedule)}
                        className="inline-flex items-center gap-1 text-destructive hover:underline text-xs"
                      >
                        <Trash2 className="h-3 w-3" />
                        Sil
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
