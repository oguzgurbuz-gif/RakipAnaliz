'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Sidebar } from './sidebar'
import { useSSE } from '@/lib/sse'
import {
  Bell,
  ChevronRight,
  AlertTriangle,
  Activity,
  Megaphone,
  CalendarClock,
  FileText,
  Sparkles,
} from 'lucide-react'
import {
  fetchNotifications,
  fetchNotificationsUnreadCount,
  markNotificationsRead,
  type NotificationItem,
} from '@/lib/api'

interface HeaderProps {
  children?: React.ReactNode
}

// Wave 1 #1.5 — Page title fallback map. Path prefix → human readable title.
// Path eşlemesi spesifikten genele doğru sıralı: en uzun match önce.
const PAGE_TITLE_MAP: { prefix: string; title: string }[] = [
  { prefix: '/admin/audit', title: 'Audit Log' },
  { prefix: '/admin/cost', title: 'AI Maliyeti' },
  { prefix: '/admin/sites', title: 'Site Yönetimi' },
  { prefix: '/admin/jobs', title: 'İş Yönetimi' },
  { prefix: '/admin/quality', title: 'Veri Kalitesi' },
  { prefix: '/admin/runs', title: 'Scrape İşlemleri' },
  { prefix: '/admin/login', title: 'Admin Girişi' },
  { prefix: '/admin', title: 'Admin' },
  { prefix: '/reports/weekly', title: 'Haftalık Raporlar' },
  { prefix: '/reports/summary', title: 'Rapor Özeti' },
  { prefix: '/reports', title: 'Raporlar' },
  { prefix: '/campaigns', title: 'Kampanyalar' },
  { prefix: '/competition/sites', title: 'Site Profili' },
  { prefix: '/competition', title: 'Rekabet' },
  { prefix: '/calendar', title: 'Takvim' },
  { prefix: '/compare', title: 'Karşılaştır' },
  { prefix: '/trends', title: 'Trendler' },
  { prefix: '/gallery', title: 'Galeri' },
  { prefix: '/notifications', title: 'Bildirimler' },
]

const PARENT_LABELS: Record<string, string> = {
  admin: 'Admin',
  reports: 'Raporlar',
  campaigns: 'Kampanyalar',
  competition: 'Rekabet',
  calendar: 'Takvim',
  compare: 'Karşılaştır',
  trends: 'Trendler',
  gallery: 'Galeri',
  audit: 'Audit Log',
  cost: 'AI Maliyeti',
  sites: 'Site Yönetimi',
  jobs: 'İş Yönetimi',
  quality: 'Veri Kalitesi',
  runs: 'Scrape İşlemleri',
  weekly: 'Haftalık',
  summary: 'Özet',
  notifications: 'Bildirimler',
}

function lookupTitle(path: string): string {
  if (path === '/' || path === '') return 'Dashboard'
  for (const entry of PAGE_TITLE_MAP) {
    if (path === entry.prefix || path.startsWith(entry.prefix + '/')) {
      return entry.title
    }
  }
  return 'Bitalih'
}

/**
 * 2 seviyeli basit breadcrumb. /admin/audit → ["Admin", "Audit Log"].
 * Tek seviyeli path için array boş döner (header zaten title gösterir).
 */
function buildBreadcrumb(path: string): { label: string; href: string }[] {
  const segments = path.split('/').filter(Boolean)
  if (segments.length < 2) return []
  const parts: { label: string; href: string }[] = []
  // İlk seviye = parent
  const first = segments[0]
  parts.push({
    label: PARENT_LABELS[first] ?? first,
    href: `/${first}`,
  })
  // İkinci seviye = current page
  const second = segments[1]
  // [id], [code] gibi dynamic segment'ler için label fallback
  const isDynamic = second.startsWith('[') || /^[0-9a-f-]{16,}$/.test(second)
  parts.push({
    label: isDynamic ? 'Detay' : (PARENT_LABELS[second] ?? second),
    href: `/${first}/${second}`,
  })
  return parts
}

const SEVERITY_DOT_CLASS: Record<string, string> = {
  critical: 'bg-red-600',
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
}

const NOTIF_ICON: Record<string, React.ElementType> = {
  smart_alert: AlertTriangle,
  momentum_shift: Activity,
  new_competitor: Sparkles,
  campaign_end: CalendarClock,
  weekly_report_ready: FileText,
  system: Bell,
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000)
  if (diffSec < 60) return 'az önce'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} dk önce`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour} sa önce`
  const diffDay = Math.round(diffHour / 24)
  if (diffDay < 7) return `${diffDay} gün önce`
  return date.toLocaleDateString('tr-TR')
}

export function Header({ children }: HeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isNotifOpen, setIsNotifOpen] = React.useState(false)

  const path = pathname ?? ''
  const pageTitle = lookupTitle(path)
  const breadcrumb = buildBreadcrumb(path)

  // Wave 4 — gerçek API'ye bağlandı. SSE 'notification_created' event'i header
  // bell'i invalide eder; ek olarak 60sn fallback polling tutarız.
  const { isConnected } = useSSE({
    onEvent: (event) => {
      if (event.type === 'notification_created') {
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
        queryClient.invalidateQueries({ queryKey: ['notifications-recent'] })
      }
    },
  })

  const unreadCountQuery = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: fetchNotificationsUnreadCount,
    refetchInterval: 60_000,
  })

  const recentQuery = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: () => fetchNotifications({ unread: true, pageSize: 5 }),
    enabled: isNotifOpen,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationsRead({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-recent'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
    },
  })

  const unreadCount = unreadCountQuery.data?.count ?? 0
  const items: NotificationItem[] = recentQuery.data?.items ?? []

  const handleNotifClick = (notif: NotificationItem) => {
    setIsNotifOpen(false)
    if (!notif.readAt) {
      markReadMutation.mutate(notif.id)
    }
    if (notif.linkUrl) {
      router.push(notif.linkUrl)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
          {/* Wave 1 #1.5 — title + breadcrumb */}
          <div className="flex flex-col leading-tight">
            <h1 className="text-lg font-semibold">{pageTitle}</h1>
            {breadcrumb.length > 0 && (
              <nav aria-label="breadcrumb" className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                {breadcrumb.map((crumb, idx) => (
                  <React.Fragment key={crumb.href}>
                    {idx > 0 && <ChevronRight className="h-3 w-3" />}
                    {idx === breadcrumb.length - 1 ? (
                      <span className="font-medium text-foreground/80">{crumb.label}</span>
                    ) : (
                      <Link href={crumb.href} className="hover:text-foreground transition-colors">
                        {crumb.label}
                      </Link>
                    )}
                  </React.Fragment>
                ))}
              </nav>
            )}
          </div>

          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                )}
              />
              <span className="text-xs text-muted-foreground">
                {isConnected ? 'Bağlı' : 'Bağlantı yok'}
              </span>
            </div>

            <div className="relative">
              <button
                onClick={() => setIsNotifOpen(!isNotifOpen)}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent transition-colors"
                aria-label="Bildirimler"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsNotifOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-border/70 bg-card shadow-xl z-50">
                    <div className="flex items-center justify-between border-b border-border/70 p-4">
                      <h3 className="font-semibold">Bildirimler</h3>
                      {unreadCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {unreadCount} okunmamış
                        </span>
                      )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {recentQuery.isLoading ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                          Yükleniyor…
                        </div>
                      ) : items.length === 0 ? (
                        <div className="p-6 text-center">
                          <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">
                            Okunmamış bildirim yok
                          </p>
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Yeni olaylar burada görünecek.
                          </p>
                        </div>
                      ) : (
                        items.map((notif) => {
                          const Icon = NOTIF_ICON[notif.notificationType] ?? Bell
                          const dotClass =
                            SEVERITY_DOT_CLASS[notif.severity] ?? 'bg-slate-400'
                          return (
                            <button
                              key={notif.id}
                              type="button"
                              className={cn(
                                'w-full text-left border-b border-border/50 p-4 hover:bg-accent/50 transition-colors',
                                !notif.readAt && 'bg-blue-50/30 dark:bg-blue-950/20'
                              )}
                              onClick={() => handleNotifClick(notif)}
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex flex-col items-center gap-1">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                  <span
                                    className={cn(
                                      'h-1.5 w-1.5 rounded-full',
                                      dotClass
                                    )}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium line-clamp-1">
                                    {notif.title}
                                  </p>
                                  {notif.message && (
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                      {notif.message}
                                    </p>
                                  )}
                                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                                    {relativeTime(notif.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                    <div className="border-t border-border/70 p-3 text-center">
                      <Link
                        href="/notifications"
                        onClick={() => setIsNotifOpen(false)}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Tümünü Gör →
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>

            {children}
          </div>
        </header>
      </div>
    </div>
  )
}
