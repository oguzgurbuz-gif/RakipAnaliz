'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Sidebar } from './sidebar'
import { useSSE } from '@/lib/sse'
import { Bell, ChevronDown } from 'lucide-react'

interface HeaderProps {
  children?: React.ReactNode
}

type Notification = {
  id: string
  title: string
  message: string
  time: string
  read: boolean
}

export function Header({ children }: HeaderProps) {
  const pathname = usePathname()
  const [isNotifOpen, setIsNotifOpen] = React.useState(false)

  const getPageTitle = () => {
    const path = pathname ?? ''
    if (path === '/') return 'Dashboard'
    if (path.startsWith('/campaigns')) return 'Kampanyalar'
    if (path.startsWith('/reports')) return 'Raporlar'
    if (path.startsWith('/admin/runs')) return 'Scrape İşlemleri'
    if (path.startsWith('/admin/quality')) return 'Veri Kalitesi'
    if (path.startsWith('/admin/jobs')) return 'İş Yönetimi'
    return 'Bitalih'
  }

  const { isConnected, lastEvent } = useSSE()

  const mockNotifications: Notification[] = [
    { id: '1', title: 'Yeni kampanya algılandı', message: 'Betboo\'dan 3 yeni kampanya eklendi', time: '5 dk önce', read: false },
    { id: '2', title: 'Scrape tamamlandı', message: 'Merit Royal\'den veri çekme işlemi başarıyla tamamlandı', time: '15 dk önce', read: false },
    { id: '3', title: 'Veri kalitesi uyarısı', message: '10 kampanya eksik tarih bilgisi içeriyor', time: '1 saat önce', read: true },
  ]

  const unreadCount = mockNotifications.filter(n => !n.read).length

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
          <h1 className="text-lg font-semibold">{getPageTitle()}</h1>

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
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsNotifOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border/70 bg-card shadow-xl z-50">
                    <div className="flex items-center justify-between border-b border-border/70 p-4">
                      <h3 className="font-semibold">Bildirimler</h3>
                      <button
                        onClick={() => setIsNotifOpen(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Tümünü okundu işaretle
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {mockNotifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={cn(
                            'border-b border-border/50 p-4 hover:bg-accent/50 transition-colors cursor-pointer',
                            !notif.read && 'bg-blue-50/30'
                          )}
                          onClick={() => setIsNotifOpen(false)}
                        >
                          <div className="flex items-start gap-3">
                            {!notif.read && (
                              <div className="mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{notif.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                              <p className="text-xs text-muted-foreground mt-1">{notif.time}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 text-center border-t border-border/70">
                      <Link
                        href="/admin/jobs"
                        onClick={() => setIsNotifOpen(false)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Tüm bildirimleri gör
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>

            {children}
          </div>
        </header>

        <main className="p-6">
          {lastEvent && (
            <div className="mb-4 rounded-md bg-accent/50 p-3 text-sm">
              <span className="font-medium">Son olay:</span> {lastEvent.type}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
