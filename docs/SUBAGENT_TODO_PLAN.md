# Rakip Analiz - Subagent-Driven Todo Planı
**Tarih:** 22 Nisan 2026
**Proje:** ~/Desktop/projects/RakipAnaliz
**Toplam:** 16 todo, 6 batch (paralel), bazıları sequential

---

## STRATEJİ

### Batch Grupları (Paralel Çalışabilir)

| Batch | İçerik | Bağımlılık |
|-------|--------|------------|
| **Batch A** | AI Panel + CategoryWinnerWidget (Critical) | 2 adım paralel |
| **Batch B** | Site names + colors (High - refactor) | 3 adım paralel |
| **Batch C** | i18n + taxonomy (Medium - quick wins) | 3 adım paralel |
| **Batch D** | Dashboard UX (Medium - alert + sample) | 2 adım paralel |
| **Batch E** | Yeni özellikler (compare + calendar overlay) | 2 adım paralel |
| **Batch F** | İleri görüş (ROI + YoY + PDF) | 3 adım paralel |

### Sıralı Kısıtlar
- **Batch A** ve **Batch B** birbirinden bağımsız — paralel başlayabilirler
- **Batch F** içindeki PDF otomasyonu (Slack webhook) diğerlerinden bağımsız
- Priority sites backend'den gelirse site-colors refactor daha anlamlı olur (ama zorunlu değil)

---

## BATCH A: AI Panel + CategoryWinnerWidget (Critical)

**Öncelik:** KRITIK — bu sprint bitmeli
**Tahmini süre:** 2-3 saat toplam (paralel gidebilir)

### Batch A-1: CategoryWinnerWidget'ı API'ye Bağla

**Dosyalar:**
- `apps/dashboard/components/ui/category-winner.tsx`
- `apps/dashboard/lib/api.ts`
- `apps/dashboard/app/page.tsx`

**Adımlar:**

```
1. MOCK_CATEGORY_WINNERS array'ini bul ve kaldır
2. useQuery import et (react-query)
3. useQuery ekle:
   queryKey: ['competition', from, to]
   queryFn: () => fetchCompetition(undefined, { from, to })
4. competitionData.comparisonTable'i map et:
   comparisonTable.map(cat => ({
     category: cat.category,
     winner: { site_name: cat.best_site, campaign_count: cat.best_site_campaigns },
     runner_up: cat.runner_up_site,
     total_campaigns: cat.total_campaigns,
   }))
5. Loading state: Skeleton kartlar göster
6. Error/null state: "Bu kategoride veri yok" — kesinlikle MOCK yok
7. Widget'a from/to prop'ları ekle (parent'tan dateRange alacak)
```

**Kod örneği:**
```typescript
// category-winner.tsx güncelleme
interface CategoryWinnerWidgetProps {
  from?: string
  to?: string
}

export function CategoryWinnerWidget({ from, to }: CategoryWinnerWidgetProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['competition', from, to],
    queryFn: () => fetchCompetition(undefined, { from, from }),
    enabled: Boolean(from && to),
  })

  // comparisonTable'den parse et
  const winners = data?.comparisonTable?.map(cat => ({
    category: cat.category,
    winner: { site_name: cat.best_site, count: cat.best_site_campaigns },
    runnerUp: cat.runner_up_site,
  })) || []

  if (isLoading) return <CategoryWinnerSkeleton />
  if (error || !winners.length) return <EmptyState />
  return winners.map(/* ... */)
}
```

**Verification:**
- Dashboard'da CategoryWinnerWidget'ın gerçek API verisi gösterdiğini doğrula
- Tarih aralığı değişince widget'ın güncellendiğini doğrula

---

### Batch A-2: AI Karşılaştırma Paneli - Tarih UX İyileştirmesi

**Dosyalar:**
- `apps/dashboard/app/page.tsx` (AI Karşılaştırma Paneli section)
- `apps/dashboard/components/ui/intent-badge.tsx` (InsightCard varsa)

**Adımlar:**

```
1. AI Karşılaştırma Paneli CardHeader'ına tarih badge'i ekle:
   <Badge variant="outline" className="text-xs">
     📅 {formatDate(dateFrom)} - {formatDate(dateTo)}
   </Badge>

2. Kart başlıklarını netleştir:
   "Bitalih Pozisyonu: Üst Sırada"
   → "Bitalih: En Çok Kampanya" (veya açıklama ekle)

3. Kart açıklamalarına "(bu ay)" / "(bu hafta)" ekle:
   "Rakip ort: 47 kampanya"
   → "Rakip ort: 47 (bu ay)"

4. Delta gösterimi: Önceki dönemle karşılaştır
   - Backend'den "previous_period_count" gerekiyor
   - Ya 2 API çağrısı yap (bugün + geçen ay) ve frontend'de hesapla
   - Veya backend'e sor (yeni endpoint mi gerekli?)

5. Kartlardaki "Üst Sırada", "Ortalama" gibi belirsiz etiketleri kaldır
   → Somut metrik göster: "47 kampanya (en yakın rakip: 38)"
```

**Backend'e Sorulacak:**
```
/api/competition zaten from/to ile tarih filtreli veri dönüyor.
Tarih bazlı karşılaştırma (bu ay vs geçen ay delta) için:
  (a) Mevcut endpoint yeterli mi? (frontend 2 calls yapar)
  (b) Ayı bir /api/competition/compare endpoint mi gerekli?
Karar: Backend ekibine danış.
```

**Verification:**
- "Bu Hafta" seçildiğinde panelde tarih badge'inin "8 - 22 Nis" gösterdiğini doğrula
- "Bu Ay" seçildiğinde "Nis 2026" gösterdiğini doğrula
- Kart metriklerinin somutlaştığını doğrula (belirsiz etiket yok)

---

## BATCH B: Site Names + Colors (High - Refactor)

**Öncelik:** HIGH — 1-2 sprint içinde
**Tahmini süre:** 1-2 saat toplam

### Batch B-1: SITE_FRIENDLY_NAMES Temizliği

**Dosyalar:**
- `apps/dashboard/app/page.tsx`
- `apps/dashboard/app/compare/CompareClient.tsx`
- `apps/dashboard/lib/site-colors.ts`

**Adımlar:**

```
1. grep ile tüm kullanımları bul:
   grep -rn "SITE_FRIENDLY_NAMES" apps/dashboard --include="*.ts" --include="*.tsx"

2. Her kullanım noktasında analiz et:
   - Backend zaten site_name dönüyor mu?
   - site_name kullanılabiliyorsa hardcoded mapping'e gerek yok

3. Karşılaştır sayfasındaki mantığı düzelt:
   Önce: SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase()]
   Sorun: site.name zaten "Bitalih" geliyor, toLowerCase yapınca "bitalih"
          sonra mapping'e bakıyor — gereksiz döngü
   Sonra: c.site?.name  (direkt backend verisi)

4. site-colors.ts'deki yazım hatasını düzelt:
   sonduzluk → sondzulyuk

5. Kullanılmayan SITE_FRIENDLY_NAMES'i kaldır (artık gerekmiyor)
```

**Yazım Hatası Düzeltmesi:**
```typescript
// site-colors.ts — FALLBACK_COLORS veya COLOR_MAP içinde
// Önce:
sonduzluk: '#8b5cf6'
// Sonra:
sondzulyuk: '#8b5cf6'
```

---

### Batch B-2: Priority Sites'i Backend'e Taşı

**Dosyalar:**
- `apps/dashboard/lib/site-colors.ts`
- `apps/dashboard/app/api/competition/route.ts` (varsa backend)
- `apps/dashboard/types/index.ts`

**Adımlar:**

```
1. sites tablosuna is_priority kolonu var mı? (yoksa ekle)
2. /api/sites veya /api/competition response'una is_priority ekle
3. Frontend'de PRIORITY_SITES = ['bitalih', ...] kaldır
4. Backend'den gelen siteleri filter et:
   const prioritySites = sites.filter(s => s.is_priority).map(s => s.code)
```

**Verification:**
- Dashboard'da sadece priority sitelerin (bitalih, hipodrom, atyarisi) vurgulandığını doğrula
- Yeni site priority yapılınca anında yansıması gerektiğini doğrula

---

## BATCH C: i18n + Taxonomy (Medium - Quick Wins)

**Öncelik:** ORTA — hızlı bitirilebilir
**Tahmini süre:** 1 saat toplam

### Batch C-1: Türkçe Ay İsimleri — Intl API

**Dosyalar:**
- `apps/dashboard/components/calendar/gantt-strip.tsx`

**Adımlar:**

```
1. MONTHS_TR hardcoded array'ini bul
2. Intl.DateTimeFormat ile değiştir:
   const MONTHS_TR = Array.from({ length: 12 }, (_, i) => {
     return new Intl.DateTimeFormat('tr-TR', { month: 'short' })
       .format(new Date(2000, i, 1))
   })
   // Sonuç: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

3. AY_ADLARI (tam ay isimleri) için de aynısını yap
4. i18n hazırlığı: lib/i18n.ts oluştur, şimdilik sadece Türkçe
```

**Kod:**
```typescript
// lib/i18n.ts — oluştur
export const i18n = {
  months: {
    short: Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat('tr-TR', { month: 'short' }).format(new Date(2000, i, 1))
    ),
    long: Array.from({ length: 12 }, (_, i) =>
      new Intl.DateTimeFormat('tr-TR', { month: 'long' }).format(new Date(2000, i, 1))
    ),
  },
  days: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
}
```

---

### Batch C-2: Intent/Stance Taxonomy Tek Dosyada

**Dosyalar:**
- `apps/dashboard/components/ui/intent-badge.tsx`
- `apps/dashboard/components/ui/stance-badge.tsx`
- `apps/dashboard/lib/category-labels.ts`

**Adımlar:**

```
1. lib/taxonomy.ts oluştur:
   export const INTENT_LABELS = {
     acquisition: 'Yeni Müşteri',
     retention: 'Mevcut Müşteri',
     brand: 'Marka',
     clearance: 'Sezon Sonu',
     // ...
   }
   
   export const STANCE_THRESHOLDS = {
     aggressive: { min: 5 },    // velocity_delta > +5
     neutral: { min: -5, max: 5 },
     defensive: { max: -5 },
   }
   
   export const STANCE_LABELS = {
     aggressive: 'Atak',
     neutral: 'Nötr',
     defensive: 'Defans',
   }

2. intent-badge.tsx ve stance-badge.tsx bu dosyayı import etsin
3. Backend'den gelen intent/stance kodları için fallback ekle:
   Bilinmeyen kod → title-case'e çevir ("unknown_intent" → "Unknown Intent")
```

---

### Batch C-3: Kategori Label Fallback İyileştirmesi

**Dosyalar:**
- `apps/dashboard/lib/category-labels.ts`

**Adımlar:**

```
1. getCategoryLabel fonksiyonunu güncelle:
   - Mevcut dictionary'deki değeri döndür
   - Yoksa: bilinmeyen kategoriyi title-case'e çevir
   - "free_spins" → "Free Spins"
   - "live_casino" → "Live Casino"

2. Backend'e öner: Kategori label'ları API'den gelsin
   - /api/categories endpoint'i veya
   - Her kampanya response'unda label field'ı
```

**Kod:**
```typescript
// lib/category-labels.ts
export function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'Bilinmiyor'
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category]
  // Fallback: "free_spins" → "Free Spins"
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
```

---

## BATCH D: Dashboard UX İyileştirmeleri (Medium)

**Öncelik:** ORTA
**Tahmini süre:** 1-2 saat toplam

### Batch D-1: Sample Size Uyarısı

**Dosyalar:**
- `apps/dashboard/app/page.tsx` (Dashboard)

**Adımlar:**

```
1. competitionData.siteRankings gelince toplam kampanya sayısını hesapla
2. < 10 ise sarı Alert göster:
   ⚠️ Bu dönemde sadece 7 kampanya tespit edildi. Veri yetersiz — yorum dikkatli yapılmalı.
3. 10-50 arası turuncu: "Veri az sayıda — trendler dikkatlı yorumlanmalı"
4. > 50 yeşil: "Güvenilir veri" (opsiyonel, gösterme bile)

5. Alert'i Card içinde değil, Card'ın üstünde göster
   (Dashboard'ın üst tarafında, AI Panel'in hemen üstünde)
```

**Kod:**
```typescript
const totalCampaigns = competitionData?.siteRankings
  ?.reduce((sum, s) => sum + Number(s.total_campaigns), 0) || 0

{totalCampaigns > 0 && totalCampaigns < 10 && (
  <Alert variant="warning" className="mb-4">
    ⚠️ Bu dönemde sadece {totalCampaigns} kampanya tespit edildi.
    Veri yetersiz — yorum dikkatli yapılmalı.
  </Alert>
)}
```

---

### Batch D-2: Alert Webhook Endpoint + Slack Entegrasyonu

**Dosyalar:**
- `apps/dashboard/app/api/admin/alerts/route.ts` (veya yeni)
- `apps/dashboard/app/api/admin/alerts/webhook/route.ts`

**Adımlar:**

```
1. Yeni endpoint oluştur: /api/admin/alerts/webhook
   POST body: { alert_type, site, campaign_count, threshold, channel }
   
2. Slack entegrasyonu:
   - Ortam değişkeninden SLACK_WEBHOOK_URL al
   - Slack webhook URL'ine POST at
   - Mesaj formatı:
     {
       "text": "🚨 Yeni Kampanya Alert",
       "blocks": [
         { "type": "section", "text": { "type": "mrkdwn", "text": "*Bitalih* yeni *5* kampanya başlattı" } },
         { "type": "context", "text": { "type": "mrkdwn", "text": "22 Nis 2026 • Rakip Analiz" } }
       ]
     }

3. Alert trigger: Scraping'de yeni kampanya görülünce tetiklenir
   - apps/scraper/ içinde ilgili mantık
   - Veya backend'de /api/alerts/check gibi bir endpoint

4. Test: Manuel olarak alert tetikle ve Slack'e geldiğini doğrula
```

**Kod:**
```typescript
// app/api/admin/alerts/webhook/route.ts
export async function POST(req: Request) {
  const { alert_type, site, campaign_count, channel } = await req.json()

  if (channel === 'slack') {
    const slackUrl = process.env.SLACK_WEBHOOK_URL
    await fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 Yeni Kampanya Alert: *${site}* ${campaign_count} yeni kampanya başlattı`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${site}* yeni *${campaign_count}* kampanya başlattı`
            }
          }
        ]
      })
    })
  }

  return Response.json({ ok: true })
}
```

---

## BATCH E: Yeni Özellikler (High)

**Öncelik:** HIGH
**Tahmini süre:** 3-4 saat toplam

### Batch E-1: Rakip Seçimli Karşılaştırma (/compare)

**Dosyalar:**
- `apps/dashboard/app/compare/page.tsx`
- `apps/dashboard/app/compare/CompareClient.tsx`

**Adımlar:**

```
1. Mevcut sayfada kampanya ID input'u var
2. Bunun yanına (veya üstüne) "Rakip Seç" dropdown'ları ekle:
   Sol rakip: [Bitalih ▼]
   Sağ rakip: [Nesine ▼]
   [Karşılaştır] butonu

3. Seçilen 2 sitenin kampanyalarını çek:
   GET /api/campaigns?site=bitalih&from=X&to=Y
   GET /api/campaigns?site=nesine&from=X&to=Y

4. Yan yana grid gösterimi:
   | Bitalih (47 kampanya) | Nesine (38 kampanya) |
   |-----------------------|----------------------|
   | [kampanya kartı]      | [kampanya kartı]     |
   | [kampanya kartı]      | [kampanya kartı]     |

5. Boş state: Henüz seçim yapılmadıysa "2 rakip seçin" göster
6. Error state: API hatalarını göster, mock DEĞİL
```

**UI Örneği:**
```
┌─────────────────────────────────────────────────────────┐
│  Rakip Karşılaştırma                                      │
│  ┌──────────────┐   ┌──────────────┐   ┌───────────┐   │
│  │ Bitalih    ▼ │ vs│ Nesine     ▼ │   │ Karşılaştır│   │
│  └──────────────┘   └──────────────┘   └───────────┘   │
├─────────────────────────────────────────────────────────┤
│  Bitalih (47)        │  Nesine (38)        │            │
│  ────────────────────│─────────────────────│            │
│  🎁 %200 Hoş Geldin  │  🎁 %150 Hoş Geldin │            │
│  ₺2,000 + 200 FS     │  ₺1,500 + 100 FS    │            │
│                      │                     │            │
│  ⚡ Hız bonusu       │  ⚡ Casino bonusu    │            │
│  %50 -> ₺500         │  %100 -> ₺1,000     │            │
└─────────────────────────────────────────────────────────┘
```

---

### Batch E-2: Calendar Rakip Overlay

**Dosyalar:**
- `apps/dashboard/app/calendar/page.tsx`
- `apps/dashboard/components/calendar/gantt-strip.tsx`
- `apps/dashboard/components/calendar/gantt-chart.tsx`

**Adımlar:**

```
1. Calendar sayfasına site filter dropdown'ı ekle:
   [Tüm Siteler ▼] — veya [Bitalih ▼], [Nesine ▼]...

2. Seçilen site dışındakilerin opacity'sini düşür:
   - Seçili site: opacity-100 (parlak)
   - Diğer siteler: opacity-30 (soluk)
   - legend'da seçili olan vurgulu

3. GanttStrip ve GanttChart component'lerine prop ekle:
   <GanttStrip 
     data={campaigns} 
     highlightSite="bitalih"  // ← YENİ
   />

4. highlightSite verildiğinde:
   - Sadece o sitenin kampanyaları full color
   - Diğerleri %30 opacity
   - Hiçbiri seçili değilse hepsi full color
```

**Kod:**
```typescript
// gantt-strip.tsx güncelleme
interface GanttStripProps {
  campaigns: Campaign[]
  highlightSite?: string  // ← YENİ
}

function GanttStrip({ campaigns, highlightSite }: GanttStripProps) {
  return campaigns.map(c => {
    const isHighlighted = !highlightSite || c.site.code === highlightSite
    return (
      <GanttBar
        campaign={c}
        opacity={isHighlighted ? 1 : 0.3}  // ← Koşullu opacity
        style={isHighlighted ? 'full' : 'muted'}
      />
    )
  })
}
```

---

## BATCH F: İleri Görüş (Low Priority)

**Öncelik:** DÜŞÜK — gelecek plan
**Tahmini süre:** 4-6 saat toplam

### Batch F-1: Campaign ROI Score

**Dosyalar:**
- `apps/dashboard/components/ui/campaign-card.tsx` (varsa)
- `apps/dashboard/app/api/campaigns/[id]/route.ts`

**Adımlar:**

```
1. Backend'de ROI hesaplama:
   effective_bonus = bonus_amount / turnover_multiplier
   
   Örnek:
   - Bonus: ₺2,000, Çevrim: 10x → ROI Score = 200
   - Bonus: ₺500, Çevrim: 5x → ROI Score = 100
   → ₺2,000 bonus daha iyi görünür ama ROI'si düşük

2. Backend: /api/campaigns/[id] response'una roi_score ekle

3. Frontend: Kampanya kartında göster:
   "Gerçek Değer: ₺200" veya "ROI: 100"

4. Karşılaştır sayfasında ROI'ye göre sırala
```

---

### Batch F-2: Bonus Index YoY + Category Breakdown

**Dosyalar:**
- `apps/dashboard/app/insights/bonus-index/page.tsx`
- `apps/dashboard/app/api/competition/route.ts`

**Adımlar:**

```
1. Backend'e "geçen yıl aynı dönem" parametresi ekle:
   GET /api/competition?from=2025-04-15&to=2025-04-22&category=X
   
2. Frontend'de "Geçen Yıl" toggle'ı ekle:
   [Bu Hafta] [Geçen Hafta] [Bu Ay] [Geçen Yıl] ← YENİ

3. YoY karşılaştırması göster:
   "Bu ay: ₺45,200 | Geçen yıl: ₺38,100 | ↑ %18"

4. Kategori breakdown ekle:
   Haftalık trend grafiğinin altında kategori bazlı detay
   - Casino: ₺15,200
   - Sports: ₺12,800
   - Poker: ₺8,400
```

---

### Batch F-3: Haftalık PDF Rapor Otomasyonu (Slack)

**Dosyalar:**
- `apps/dashboard/lib/pdf/weekly-report-pdf.ts` (varsa)
- Cron job olarak çalışacak

**Adımlar:**

```
1. lib/pdf/weekly-report-pdf.ts hazır mı kontrol et
   - Yoksa oluştur (html2canvas + jspdf veya puppeteer)

2. Slack webhook URL'i ortam değişkenine ekle:
   SLACK_WEBHOOK_URL=https://hooks.slack.com/...

3. Cron job oluştur (her Pazartesi 09:00):
   cronjob(action='create', 
     name='Haftalık Rakip Raporu', 
     prompt='lib/pdf/weekly-report-pdf.ts çalıştır, PDF çıktısını Slack webhook URL\'ine POST et', 
     schedule='0 9 * * 1')

4. Slack'e gönderilecek mesaj formatı:
   {
     "text": "📊 Haftalık Rakip Analiz Raporu",
     "blocks": [
       { "type": "section", "text": { "type": "mrkdwn", "text": "*Bu Hafta Özet*\n• Toplam 47 yeni kampanya\n• En aktif: Bitalih (12)\n• En yüksek bonus: ₺5,000" }},
       { "type": "section", "text": { "type": "mrkdwn", "text": "*Rapor:* <https://rakipanaliz.com/reports/weekly|PDF'i görüntüle>" }}
     ]
   }

5. Test: Manuel olarak PDF oluştur ve Slack'e gönder
```

---

## ÖZET: Subagent Atamaları

| Batch | İçerik | Tahmini Süre | Öncelik |
|-------|--------|-------------|---------|
| **A** | AI Panel + CategoryWinnerWidget | 2-3 saat | KRITIK |
| **B** | Site names + colors refactor | 1-2 saat | HIGH |
| **C** | i18n + taxonomy quick wins | 1 saat | ORTA |
| **D** | Dashboard UX (sample + alert) | 1-2 saat | ORTA |
| **E** | Yeni özellikler (compare + calendar) | 3-4 saat | HIGH |
| **F** | İleri görüş (ROI + YoY + PDF) | 4-6 saat | DÜŞÜK |

**Paralel çalıştırma:**
- Batch A ve Batch B paralel başlayabilir
- Batch C, D, E sırayla veya paralel (kaynak varsa)
- Batch F en sona bırakılabilir

**Başlama sırası önerisi:**
1. Batch A (Critical — hemen başla)
2. Batch B (High — A ile paralel)
3. Batch C (Medium — quick win, motivasyon için erken bitir)
4. Batch D (Medium)
5. Batch E (High — yeni özellik, büyük etki)
6. Batch F (Low — gelecek plan)
