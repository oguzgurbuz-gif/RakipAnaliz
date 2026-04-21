'use client'

import * as React from 'react'
import { Sidebar } from './sidebar'
import { SSEProvider } from '@/lib/sse'
import { LiveEventsBridge } from '../../app/live-events-bridge'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SSEProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <div className="md:pl-64">
          {children}
        </div>
        <LiveEventsBridge />
      </div>
    </SSEProvider>
  )
}
