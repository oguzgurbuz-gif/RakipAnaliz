'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { fetchAutoAnalysis, type AutoAnalysisResponse } from '@/lib/api'
import { Sparkles, RefreshCw, Clock, AlertCircle } from 'lucide-react'

/**
 * D6 — Reports sayfası için otomatik AI rapor kartı.
 *
 * Akış:
 *   - Seçili aralıkta weekly_report yoksa + veri hazırsa: 6 başlık render et.
 *   - Veri çekimi devam ediyorsa: uyarı mesajı (son scrape tarihi ile).
 *   - Veri hazır ama AI başarısız: hata mesajı + "Tekrar dene" butonu.
 *
 * Kart içeriği prose olarak gelir (madde işareti yok) — tek Card içinde
 * 6 ayrı section (h3 + p).
 */

interface Props {
  from: string
  to: string
  /** Parent zaten weekly_reports'u çekiyor; orada varsa kart gizlensin. */
  hideIfExistingReport?: boolean
}

function formatRelativeSince(iso: string | null): string {
  if (!iso) return 'bilinmiyor'
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return 'bilinmiyor'
  const diffMin = Math.round((Date.now() - ts) / 60_000)
  if (diffMin < 1) return 'az önce'
  if (diffMin < 60) return `${diffMin} dk önce`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 48) return `${diffH} saat önce`
  const diffD = Math.round(diffH / 24)
  return `${diffD} gün önce`
}

const SECTION_META: Array<{
  key: keyof NonNullable<AutoAnalysisResponse['analysis']>
  title: string
}> = [
  { key: 'summary', title: 'Özet' },
  { key: 'topMovers', title: 'Öne Çıkanlar' },
  { key: 'bonusInsights', title: 'Bonus Dinamikleri' },
  { key: 'categoryInsights', title: 'Kategori Gözlemleri' },
  { key: 'riskFlags', title: 'Risk Sinyalleri' },
  { key: 'recommendations', title: 'Aksiyon Önerileri' },
]

export function AutoAnalysisCard({ from, to, hideIfExistingReport = true }: Props) {
  const enabled = Boolean(from && to)
  const { data, isLoading, refetch, isFetching, error } = useQuery<AutoAnalysisResponse>({
    queryKey: ['auto-analysis', from, to],
    queryFn: () => fetchAutoAnalysis(from, to),
    enabled,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  if (!enabled) return null
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Dönem Analizi Hazırlanıyor
          </CardTitle>
          <CardDescription>
            {from} — {to} aralığı için otomatik rapor üretiliyor...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
            <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
            <div className="h-4 w-2/3 bg-muted animate-pulse rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {error instanceof Error
            ? `Otomatik analiz yüklenemedi: ${error.message}`
            : 'Otomatik analiz yüklenemedi.'}
          <div className="mt-4">
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Tekrar dene
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (hideIfExistingReport && data.hasExistingReport) {
    return null
  }

  // Veri hazır değil — scrape devam ediyor / son scrape başarısız.
  if (!data.dataReady) {
    const since = formatRelativeSince(data.lastScrapeAt)
    return (
      <Card className="border-yellow-500/40 bg-yellow-500/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-600" />
            Veri Çekimi Devam Ediyor
          </CardTitle>
          <CardDescription>
            Otomatik analiz şu an yapılamıyor — son çekim {since}. Scrape tamamlandığında bu alan
            otomatik AI raporuna dönüşecek.
          </CardDescription>
        </CardHeader>
        {data.notes.length > 0 && (
          <CardContent>
            <ul className="text-xs text-muted-foreground space-y-1">
              {data.notes.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    )
  }

  // Veri hazır ama AI başarısız.
  if (!data.analysis) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            AI Analizi Üretilemedi
          </CardTitle>
          <CardDescription>
            Veri hazır ama otomatik analiz şu an yapılamadı. Tekrar denemek ister misin?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.notes.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1">
              {data.notes.map((n, i) => (
                <li key={i}>• {n}</li>
              ))}
            </ul>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Tekrar dene
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Başarılı — 6 başlık.
  const generatedAt = data.generatedAt
    ? new Date(data.generatedAt).toLocaleString('tr-TR')
    : ''

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Otomatik AI Rapor
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-2">
          <span>
            {data.period.from} — {data.period.to}
          </span>
          {generatedAt && (
            <span className="text-xs text-muted-foreground">· {generatedAt}</span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Yeniden oluştur"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {SECTION_META.map(({ key, title }) => {
          const text = data.analysis![key]
          if (!text) return null
          return (
            <section key={key}>
              <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                {text}
              </p>
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}
