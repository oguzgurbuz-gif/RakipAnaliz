import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { LiveEventsBridge } from './live-events-bridge'
import DashboardLayout from '@/components/layout/dashboard-layout'

const inter = Inter({ subsets: ['latin'] })

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bitalih - Rakip Analiz Platformu',
  description: 'Kampanya takip ve rakip analiz sistemi',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="tr">
      <body className={inter.className}>
        <Providers>
          <DashboardLayout>
            {children}
          </DashboardLayout>
          <LiveEventsBridge />
        </Providers>
      </body>
    </html>
  )
}
