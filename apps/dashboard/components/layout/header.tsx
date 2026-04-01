'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Sidebar } from './sidebar'
import { useSSE } from '@/lib/sse'

interface HeaderProps {
  children?: React.ReactNode
}

export function Header({ children }: HeaderProps) {
  const pathname = usePathname()
  
  const getPageTitle = () => {
    const path = pathname ?? ''
    if (path === '/') return 'Dashboard'
    if (path.startsWith('/campaigns')) return 'Kampanyalar'
    if (path.startsWith('/reports')) return 'Raporlar'
    if (path.startsWith('/runs')) return 'Scrape İşlemleri'
    return 'Bitalih'
  }

  const { isConnected, lastEvent } = useSSE()

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
