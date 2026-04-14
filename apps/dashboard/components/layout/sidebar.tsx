'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Megaphone,
  BarChart3,
  FileText,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ListChecks,
  AlertTriangle,
  Settings,
} from 'lucide-react'

type NavItem = {
  href: string
  label: string
  icon: React.ElementType
  isAdmin?: boolean
}

const primaryNavItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/campaigns', label: 'Kampanyalar', icon: Megaphone },
  { href: '/competition', label: 'Rekabet', icon: BarChart3 },
  { href: '/reports', label: 'Raporlar', icon: FileText },
  { href: '/calendar', label: 'Takvim', icon: CalendarRange },
]

const adminNavItems: NavItem[] = [
  { href: '/admin/runs', label: 'Scrape İşlemleri', icon: ListChecks, isAdmin: true },
  { href: '/admin/quality', label: 'Veri Kalitesi', icon: AlertTriangle, isAdmin: true },
  { href: '/admin/jobs', label: 'İş Yönetimi', icon: Settings, isAdmin: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = React.useState(false)
  const [isAdminOpen, setIsAdminOpen] = React.useState(false)

  const isInAdminSection = pathname?.startsWith('/admin')

  React.useEffect(() => {
    if (isInAdminSection) {
      setIsAdminOpen(true)
    }
  }, [isInAdminSection])

  return (
    <>
      <button
        className="fixed left-4 top-4 z-50 rounded-xl border border-border/70 bg-background/90 p-2 shadow-lg backdrop-blur md:hidden"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
      >
        {isMobileOpen ? (
          <ChevronRight className="h-5 w-5" />
        ) : (
          <LayoutDashboard className="h-5 w-5" />
        )}
      </button>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 border-r border-border/70 bg-card/95 shadow-xl backdrop-blur transform transition-transform duration-200 ease-in-out md:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-20 items-center border-b border-border/70 px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <span className="text-sm font-bold">B</span>
            </div>
            <div>
              <span className="block text-lg font-bold tracking-tight">Bitalih</span>
              <span className="block text-xs text-muted-foreground">Rakip Analiz Platformu</span>
            </div>
          </Link>
        </div>

        <nav className="space-y-1 p-4">
          {primaryNavItems.map((item) => {
            const Icon = item.icon
            const isActive =
              pathname === null || pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}

          <div className="my-4 border-t border-border/70" />

          <button
            onClick={() => setIsAdminOpen(!isAdminOpen)}
            className={cn(
              'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isInAdminSection
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <div className="flex items-center gap-3">
              <Settings className="h-4 w-4" />
              Admin
            </div>
            {isAdminOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>

          {isAdminOpen &&
            adminNavItems.map((item) => {
              const Icon = item.icon
              const isActive =
                pathname === null || pathname === item.href || pathname.startsWith(item.href + '/')

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ml-2',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
        </nav>
      </aside>
    </>
  )
}
