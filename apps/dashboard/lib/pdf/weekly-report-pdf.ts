import jsPDF from 'jspdf'

interface ReportItem {
  id: string
  type: string
  order: number
  title: string
  body: string
  payload: Record<string, unknown>
  createdAt: string
}

interface WeeklyReportPDFData {
  id: string
  weekStart: string
  weekEnd: string
  weekNumber: number
  year: number
  title: string
  executiveSummary: string | null
  status: string
  siteCoverageCount: number
  campaignCount: number
  startedCount: number
  endedCount: number
  activeOverlapCount: number
  changedCount: number
  passiveCount: number
  topCategories: { category: string; count: number }[]
  topSites: { siteName: string; count: number }[]
  risks: string[]
  recommendations: string[]
  createdAt: string
  updatedAt: string
  items?: ReportItem[]
}

export function generateWeeklyReportPdf(report: WeeklyReportPDFData): Buffer {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  let yPos = margin

  const formatDate = (date: string | Date) => {
    const d = new Date(date)
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
  }

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Bitalih', margin, yPos)
  yPos += 8

  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text('Haftalık Rapor', margin, yPos)
  yPos += 6

  doc.setFontSize(11)
  doc.setTextColor(100)
  doc.text(`Hafta ${report.weekNumber}, ${report.year}`, margin, yPos)
  yPos += 5
  doc.text(`${formatDate(report.weekStart)} - ${formatDate(report.weekEnd)}`, margin, yPos)
  yPos += 10

  doc.setDrawColor(200)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 10

  if (report.executiveSummary) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0)
    doc.text('Yönetici Özeti', margin, yPos)
    yPos += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const summaryLines = doc.splitTextToSize(report.executiveSummary, pageWidth - 2 * margin)
    doc.text(summaryLines, margin, yPos)
    yPos += summaryLines.length * 5 + 10
  }

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0)
  doc.text('Özet İstatistikler', margin, yPos)
  yPos += 8

  const stats = [
    { label: 'Siteler', value: report.siteCoverageCount },
    { label: 'Toplam Kampanya', value: report.campaignCount },
    { label: 'Başlayan', value: report.startedCount },
    { label: 'Biten', value: report.endedCount },
    { label: 'Değişen', value: report.changedCount },
  ]

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  const colWidth = (pageWidth - 2 * margin) / 3
  stats.forEach((stat, index) => {
    const col = index % 3
    const row = Math.floor(index / 3)
    const xPos = margin + col * colWidth
    const yOffset = yPos + row * 8

    doc.setFont('helvetica', 'bold')
    doc.text(`${stat.label}:`, xPos, yOffset)
    doc.setFont('helvetica', 'normal')
    doc.text(String(stat.value), xPos + 40, yOffset)
  })

  yPos += Math.ceil(stats.length / 3) * 8 + 10

  if (report.topCategories && report.topCategories.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Kategori Dağılımı', margin, yPos)
    yPos += 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    report.topCategories.slice(0, 10).forEach((cat) => {
      doc.text(cat.category, margin, yPos)
      doc.text(String(cat.count), pageWidth - margin - 10, yPos)
      yPos += 6
    })
    yPos += 10
  }

  if (report.items && report.items.length > 0) {
    if (yPos > 250) {
      doc.addPage()
      yPos = margin
    }

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('En İyi 10 Kampanya', margin, yPos)
    yPos += 8

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('#', margin, yPos)
    doc.text('Başlık', margin + 10, yPos)
    doc.text('Site', margin + 90, yPos)
    doc.text('Bonus', pageWidth - margin - 20, yPos)
    yPos += 4

    doc.setDrawColor(200)
    doc.line(margin, yPos, pageWidth - margin, yPos)
    yPos += 4

    doc.setFont('helvetica', 'normal')

    report.items.slice(0, 10).forEach((item, idx) => {
      if (yPos > 280) {
        doc.addPage()
        yPos = margin
      }

      const bonus = item.payload?.bonusAmount
        ? `${item.payload.bonusAmount} TL`
        : item.payload?.bonusPercentage
          ? `${item.payload.bonusPercentage}%`
          : '-'

      doc.text(String(idx + 1), margin, yPos)
      doc.text((item.title || '-').substring(0, 40), margin + 10, yPos)
      doc.text((item.payload?.siteCode as string) || '-', margin + 90, yPos)
      doc.text(bonus, pageWidth - margin - 20, yPos)
      yPos += 5
    })
  }

  yPos = 280
  doc.setDrawColor(200)
  doc.line(margin, yPos, pageWidth - margin, yPos)
  yPos += 5

  doc.setFontSize(8)
  doc.setTextColor(150)
  doc.text(`Rapor tarihi: ${formatDate(new Date())}`, margin, yPos)
  doc.text('Bitalih - Rakip Analiz Platformu', pageWidth - margin - 60, yPos)

  const pdfOutput = doc.output('arraybuffer')
  return Buffer.from(pdfOutput)
}
