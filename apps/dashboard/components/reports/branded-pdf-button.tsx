'use client'

import { Button } from '@/components/ui/button'
import { Download, FileText } from 'lucide-react'
import { jsPDF } from 'jspdf'
import type { ReportSummary } from '@/types'
import { getCategoryLabel } from '@/lib/category-labels'

interface BrandedPdfButtonProps {
  data: ReportSummary | null
  dateFrom?: string
  dateTo?: string
}

export function BrandedPdfButton({ data, dateFrom, dateTo }: BrandedPdfButtonProps) {
  const handleDownload = () => {
    if (!data) return

    const doc = new jsPDF()
    const primaryColor: [number, number, number] = [59, 130, 246] // blue-500

    // Header bar
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.rect(0, 0, 210, 40, 'F')

    // Logo placeholder (📊 icon as text)
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(28)
    doc.text('📊', 15, 26)

    // Title
    doc.setFontSize(20)
    doc.setTextColor(255, 255, 255)
    doc.text('RakipAnaliz Raporu', 40, 20)

    // Date range
    doc.setFontSize(10)
    const dateRange = dateFrom && dateTo
      ? `${dateFrom} - ${dateTo}`
      : new Date().toLocaleDateString('tr-TR')
    doc.text(dateRange, 40, 30)

    // Report date
    doc.setTextColor(100, 100, 100)
    doc.setFontSize(8)
    doc.text(`Oluşturulma: ${new Date().toLocaleString('tr-TR')}`, 150, 35)

    // Summary stats
    let yPos = 55
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(14)
    doc.text('Özet İstatistikler', 15, yPos)

    yPos += 10
    doc.setFontSize(11)
    const stats = [
      { label: 'Başlayan', value: data.startedCount },
      { label: 'Aktif', value: data.activeCount },
      { label: 'Biten', value: data.endedCount },
      { label: 'Değişen', value: data.changedCount },
      { label: 'Pasif', value: data.passiveCount },
    ]

    stats.forEach((stat, i) => {
      const x = 15 + (i % 3) * 60
      const y = yPos + Math.floor(i / 3) * 12
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(stat.label + ':', x, y)
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(12)
      doc.text(String(stat.value), x + 35, y)
    })

    // Top categories
    yPos = 95
    doc.setFontSize(14)
    doc.setTextColor(0, 0, 0)
    doc.text('En Çok Görülen Kategoriler', 15, yPos)

    yPos += 8
    doc.setFontSize(10)
    if (data.topCategories && data.topCategories.length > 0) {
      data.topCategories.slice(0, 5).forEach((cat, i) => {
        const label = cat.label || getCategoryLabel(cat.category)
        const share = cat.share ?? 0
        doc.setTextColor(0, 0, 0)
        doc.text(`${i + 1}. ${label}`, 15, yPos + i * 7)
        doc.setTextColor(100, 100, 100)
        doc.text(`${cat.count} kampanya (%${Math.round(share * 100)})`, 80, yPos + i * 7)
      })
    } else {
      doc.setTextColor(100, 100, 100)
      doc.text('Veri bulunamadı.', 15, yPos)
    }

    // Top sites
    yPos += 50
    doc.setFontSize(14)
    doc.setTextColor(0, 0, 0)
    doc.text('En Çok Kampanya Olan Siteler', 15, yPos)

    yPos += 8
    doc.setFontSize(10)
    if (data.topSites && data.topSites.length > 0) {
      data.topSites.slice(0, 5).forEach((site, i) => {
        doc.setTextColor(0, 0, 0)
        doc.text(`${i + 1}. ${site.siteName}`, 15, yPos + i * 7)
        doc.setTextColor(100, 100, 100)
        doc.text(`${site.count} kampanya`, 80, yPos + i * 7)
      })
    } else {
      doc.setTextColor(100, 100, 100)
      doc.text('Veri bulunamadı.', 15, yPos)
    }

    // Footer
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.rect(0, 280, 210, 17, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8)
    doc.text('RakipAnaliz - Rakip Kampanya Takip Sistemi', 15, 290)

    // Download
    doc.save(`rapor-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={!data}
      className="gap-2"
    >
      <FileText className="h-4 w-4" />
      PDF İndir
    </Button>
  )
}
