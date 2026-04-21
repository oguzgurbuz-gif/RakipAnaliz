'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = React.useState(false)

  const isLoginPage = pathname === '/admin/login'

  const onLogout = async () => {
    setIsLoggingOut(true)
    try {
      await fetch('/api/admin/logout', { method: 'POST' })
    } catch {
      // ignore - we still want to redirect
    } finally {
      router.replace('/admin/login')
      router.refresh()
    }
  }

  if (isLoginPage) {
    return <>{children}</>
  }

  return (
    <div className="relative">
      <div className="sticky top-0 z-30 flex justify-end gap-2 border-b border-border/70 bg-background/80 px-6 py-2 backdrop-blur">
        <button
          onClick={onLogout}
          disabled={isLoggingOut}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          {isLoggingOut ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <LogOut className="h-3.5 w-3.5" />
          )}
          Çıkış Yap
        </button>
      </div>
      {children}
    </div>
  )
}
