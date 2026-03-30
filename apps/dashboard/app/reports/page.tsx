'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BarChart3, Calendar, Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchCampaigns } from '@/lib/api'

export default function ReportsPage() {
  const { data } = useQuery({
    queryKey: ['campaigns', { limit: 1000 }],
    queryFn: () => fetchCampaigns({ limit: 1000 }),
  })

  const exportReportCSV = () => {
    if (!data?.data) return
    const headers = ['title', 'site', 'category', 'sentiment', 'valid_from', 'valid_to']
    const csvRows = [
      headers.join(','),
      ...data.data.map(c => [
        `"${(c.title || '').replace(/"/g, '""')}"`,
        `"${(c.site?.name || '').replace(/"/g, '""')}"`,
        `"${(c.category || '').replace(/"/g, '""')}"`,
        `"${(c.sentiment || c.aiSentiment || '').replace(/"/g, '""')}"`,
        `"${(c.validFrom || '').replace(/"/g, '""')}"`,
        `"${(c.validTo || '').replace(/"/g, '""')}"`,
      ].join(','))
    ]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rapor-kampanyalar-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
        <h1 className="text-lg font-semibold">Raporlar</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportReportCSV}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        </div>
      </header>

      <main className="p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/reports/weekly">
            <Card className="h-full transition-colors hover:bg-muted/50 cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Calendar className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Haftalık Raporlar</CardTitle>
                </div>
                <CardDescription>
                  Haftalık dönemlere göre oluşturulan raporları görüntüleyin
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Detaylı analizler, trendler ve performans metrikleri içeren haftalık raporlara erişin.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/reports/summary">
            <Card className="h-full transition-colors hover:bg-muted/50 cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle>Rapor Özeti</CardTitle>
                </div>
                <CardDescription>
                  Tarih aralığına göre özet raporlar oluşturun
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Belirli bir tarih aralığı için toplam satış, sipariş ve kar metriklerini görüntüleyin.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  )
}
