import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import { Providers } from '@/components/providers'
import DashboardLayout from '@/components/layout/dashboard-layout'
import { DateRangeProvider } from '@/lib/date-range/context'
import {
  COOKIE_PREFIX,
  decodeCookieValue,
  type StoredRange,
} from '@/lib/date-range/persistence'

const inter = Inter({ subsets: ['latin'] })

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bitalih - Rakip Analiz Platformu',
  description: 'Kampanya takip ve rakip analiz sistemi',
}

/**
 * SSR sırasında `daterange_<scope>` cookie'lerini okuyup DateRangeProvider'a
 * initial state olarak geçirir. Böylece ilk paint'te doğru aralık görünür.
 */
function readInitialDateRangeScopes(): Record<string, StoredRange> {
  const store = cookies()
  const result: Record<string, StoredRange> = {}
  for (const c of store.getAll()) {
    if (!c.name.startsWith(COOKIE_PREFIX)) continue
    const scope = c.name.slice(COOKIE_PREFIX.length)
    const parsed = decodeCookieValue(c.value)
    if (parsed) result[scope] = parsed
  }
  return result
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const initialScopes = readInitialDateRangeScopes()

  return (
    <html lang="tr">
      <body className={inter.className}>
        <Providers>
          <DateRangeProvider initialScopes={initialScopes}>
            <DashboardLayout>
              {children}
            </DashboardLayout>
          </DateRangeProvider>
        </Providers>
      </body>
    </html>
  )
}
