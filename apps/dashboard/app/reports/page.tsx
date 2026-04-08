'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { BarChart3, Calendar, Download, Sparkles } from 'lucide-react'
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
      <PageHeader
        title="Raporlar"
        description="Özet, haftalık ve dışa aktarılabilir rapor yüzeylerinden kampanya performansını takip edin."
        actions={
          <Button variant="outline" size="sm" onClick={exportReportCSV}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
        }
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Rapor yüzeyleri karar desteği için yeniden düzenlendi.
        </div>
      </PageHeader>

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
                  Hangi haftada ne değiştiğini, riskleri ve önerileri tek raporda görün.
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
                  Seçtiğiniz aralık için kategori, site ve kampanya yoğunluğu özetini alın.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </main>
    </div>
  )
}
