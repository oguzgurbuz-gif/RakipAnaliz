'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { useSSE } from '@/hooks/useSSE'
import { BarChart3, Target, Activity } from 'lucide-react'
import Link from 'next/link'
import { WeeklyBriefCard } from '@/components/dashboard/weekly-brief-card'
import { WinLossTracker } from '@/components/insights/win-loss-tracker'

/**
 * Dashboard — "quick look" sayfası.
 *
 * Üç blok:
 *   1. Hafta Özeti (WeeklyBriefCard)  — DeepSeek ile haftalık prescriptive özet.
 *   2. Win/Loss Tracker               — Bitalih'in sıralama pozisyonu (ranking_snapshots / migration 021).
 *   3. Quick Links                    — ana alt sayfalara yönlendirme.
 *
 * Hero stats / AI Karşılaştırma Paneli / ComparisonBar'lar bu sayfadan kaldırıldı;
 * detay ve karşılaştırma için /competition ve /compare alt sayfalarına yönlendiriyoruz.
 */
export default function DashboardPage() {
  const queryClient = useQueryClient()

  useSSE(useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['weekly-brief'] })
    queryClient.invalidateQueries({ queryKey: ['win-loss'] })
  }, [queryClient]))

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['weekly-brief'] })
    queryClient.invalidateQueries({ queryKey: ['win-loss'] })
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Dashboard"
        description="Bu haftanın özet görünümü — detaylı analizler için alt sayfalara git."
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Yenile
          </Button>
        }
      />

      <main className="p-6 space-y-6">
        <WeeklyBriefCard />

        <WinLossTracker />

        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/competition" className="text-primary hover:underline flex items-center gap-1">
            <BarChart3 className="w-4 h-4" />
            Detaylı Rekabet Analizi →
          </Link>
          <Link href="/compare" className="text-primary hover:underline flex items-center gap-1">
            <Target className="w-4 h-4" />
            Kampanya Karşılaştır →
          </Link>
          <Link href="/campaigns" className="text-primary hover:underline flex items-center gap-1">
            <Activity className="w-4 h-4" />
            Tüm Kampanyalar →
          </Link>
          <Link href="/reports" className="text-primary hover:underline flex items-center gap-1">
            <BarChart3 className="w-4 h-4" />
            Haftalık Raporlar →
          </Link>
        </div>
      </main>
    </div>
  )
}
