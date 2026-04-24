# Dashboard Sayfa Kompleksite & UX Analizi

**Tarih:** 2026-04-24
**Kapsam:** `apps/dashboard/app/**/page.tsx` (24 sayfa)
**Tetikleyici:** Kullanıcıdan gelen "sayfalar karmaşık ve anlaşılamaz" feedback'i.

---

## Yönetici Özeti

24 sayfa tarandı. Üç sistemik problem:

1. **Aşırı yüklü hero section'lar** — Ana sayfa, kampanya detay ve takvim tek ekranda 5+ farklı iş akışı sunuyor; göz nereye gideceğini bilmiyor.
2. **Gizli özellikler** — Tab'lar ve collapsible panel'ler default kapalı; kullanıcı feature'ı keşfedemiyor.
3. **Mock/simüle veri uyarısız sunulmuş** — Trends ve Quality sayfalarında "Geçen Ay/Geçen Yıl karşılaştırması" sahte veriyle çalışıyor; UI'da uyarı yok, kullanıcı gerçek sanıyor.

**5 sayfa "ağır karmaşık" (600+ LOC)** — bunlar acil önceliğe sahip:
- `calendar/page.tsx` (964 LOC)
- `campaigns/[id]/page.tsx` (871 LOC)
- `page.tsx` (Dashboard ana, 701 LOC)
- `admin/jobs/page.tsx` (674 LOC)
- `trends/page.tsx` (650 LOC)

---

## Kantitatif Tablo — Tüm 24 Sayfa

| # | Sayfa | LOC | useState | useQuery | useMutation | Inline cmp | UX Smells |
|---|---|---|---|---|---|---|---|
| 1 | `page.tsx` (Dashboard) | **701** | 2 | 2 | 0 | 3 | 🔴 Aşırı dolu |
| 2 | `compare/page.tsx` | 7 | 0 | 0 | 0 | 0 | ✓ Minimal |
| 3 | `admin/audit/page.tsx` | 300 | 1 | 1 | 0 | 0 | 🟡 Filter UI senkronu |
| 4 | `admin/login/page.tsx` | 129 | 2 | 0 | 0 | 2 | ✓ Basit |
| 5 | `admin/quality/page.tsx` | 347 | 0 | 2 | 0 | 1 | 🟡 Simüle veri |
| 6 | `admin/runs/page.tsx` | 202 | 0 | 1 | 0 | 1 | ✓ Temiz |
| 7 | `admin/sites/page.tsx` | 223 | 3 | 1 | 1 | 0 | ✓ Temiz |
| 8 | `gallery/page.tsx` | 214 | 4 | 1 | 0 | 0 | 🟡 Resim modal |
| 9 | `reports/page.tsx` | 305 | 2 | 2 | 0 | 0 | 🟡 Tab UI kafa karıştırıcı |
| 10 | `reports/summary/page.tsx` | 121 | 2 | 2 | 0 | 0 | ✓ Basit |
| 11 | `reports/weekly/[id]/page.tsx` | 297 | 1 | 1 | 0 | 1 | 🟡 Risk/Recommend panel uzun |
| 12 | `reports/weekly/page.tsx` | 218 | 0 | 1 | 0 | 1 | ✓ Temiz |
| 13 | `trends/page.tsx` | **650** | 6 | 1 | 0 | 3 | 🔴 Çok kontrol, simüle veri |
| 14 | `admin/cost/page.tsx` | **523** | 5 | 2 | 1 | 0 | 🔴 USD limitleri form + 2 tablo |
| 15 | `campaigns/page.tsx` | **637** | 7 | 2 | 0 | 0 | 🔴 Filter madness, preset modal |
| 16 | `insights/bonus-index/page.tsx` | 342 | 1 | 1 | 0 | 1 | 🟡 Simüle trend, boş state |
| 17 | `admin/alerts/page.tsx` | **543** | 3 | 3 | 2 | 0 | 🔴 Modal form + 2 tablo + slider |
| 18 | `campaigns/[id]/page.tsx` | **871** | 3 | 2 | 2 | 0 | 🔴 Gizli tab'lar, ikili tarih |
| 19 | `competition/page.tsx` | **440** | 3 | 1 | 0 | 0 | 🔴 7+ panel aynı sayfada |
| 20 | `competition/sites/[code]/page.tsx` | **556** | 0 | 1 | 0 | 0 | 🔴 4 tablo + chart + heatmap |
| 21 | `admin/press-events/page.tsx` | 480 | 5 | 1 | 3 | 0 | 🟡 Modal form + tablo |
| 22 | `admin/jobs/page.tsx` | **674** | 2 | 3 | 0 | 0 | 🔴 4 bağımsız iş yönetimi |
| 23 | `notifications/page.tsx` | **462** | 3 | 2 | 2 | 0 | 🔴 Filter + tablo + pagination |
| 24 | `calendar/page.tsx` | **964** | 8 | 2 | 0 | 2 | 🔴 Aylık + Gantt + heatmap, çok işlem |

---

## En Karmaşık 5 Sayfa — Detaylı Sorunlar

### 1. `campaigns/[id]/page.tsx` — Kampanya Detay (871 LOC)

**Smell'ler:**
- **Gizli tab'lar**: Rakipler + Değişiklikler tab'ları default inactive; kullanıcı "feature var mı?" bilmiyor. (`campaigns/[id]/page.tsx:329-345`)
- **Conditional render karmaşası**: Değişiklikler tab'ı `campaign.versions?.length > 0` ise görünür, yoksa fallback mesaj — yarım deneyim.
- **İkili tarih sistemi**: `validFrom`/`validTo` (landing) + `effective_start`/`effective_end` (scrape türev) — ikisinin farkı 1 satır yorumda. (`:233-246`)
- **AI metadata çökertme**: `metadata.ai_analysis.extractedTags` + `metadata.ai_analysis.conditions` + `latestAI.*` — 3 farklı kaynaktan fallback. (`:183-209`)

**Önerilen tek iyileştirme:** Tab list'inde count badge ekle (`Rakipler (2)`, `Değişiklikler (5)`) — 10 satır.

---

### 2. `page.tsx` (Dashboard, 701 LOC)

**Smell'ler:**
- **Açıklamasız metrikler**: "Aktiflik Oranı %94" — ne demek? Açıklama 3 satırda banner olarak (`:467-469`), ama metrik kartında tooltip yok. (`:314-319`)
- **5+ metrik gösteriminin çakışması**: Kampanya Sayısı Karşılaştırması + Ortalama Bonus Karşılaştırması + Performans ProgressBar'ları + Özet Banner — hangisi kaynak hangisi türev?
- **Hero'da 8+ farklı iş akışı**: Ana sayfaya ilk gelen kullanıcı için "ne yapmalıyım?" cevabı yok.

**Önerilen tek iyileştirme:** HeroStatCard component'ine `tooltip` prop ekle, benchmark'ı tooltip'e taşı — 5 satır.

---

### 3. `calendar/page.tsx` (964 LOC)

**Smell'ler:**
- **8 useState** (view, site, category, status, search, selectedIds, viewType, selectedDay, activePressEvent) — hangi kontrol hangi panel'i etkiliyor net değil
- **2 farklı modal**: DayCampaignsModal + PressEventDetailModal — state'leri ayrı, kullanıcı "neden iki tane?" sorar
- **Gantt strip ile Gantt chart parametreleri ayrı** ama veri aynı (`:125` vs `:771`)
- **Press events overlay her hücre render'ında hesaplanıyor** — perf riski (`:563-565`)

**Önerilen tek iyileştirme:** Sayfayı `/calendar` (aylık görünüm) + `/calendar/timeline` (Gantt) olarak iki route'a böl — büyük iş ama mantıksal sınır net.

---

### 4. `trends/page.tsx` (650 LOC)

**Smell'ler:**
- **Tek bölümde 6+ kontrol**: Moving Average (MA7/MA30), Karşılaştırma (Geçen Ay/Geçen Yıl), Anomali eşik slider — hepsi aynı chart'ı etkiliyor ama "Kampanya Trendi" başlığı altında karışık (`:328-508`)
- **Simüle veri**: `comparisonData` (`:76-83`) gerçek veri yok; yorumda "replace with real API" (`:172`). UI'da uyarı yok.
- **Anomaly alert düşük örneklem güvenilirliği belirsiz** (`:260-289`)

**Önerilen tek iyileştirme:** Simüle veri için chart üstüne "⚠️ Tahmini veri" AlertBanner ekle — 6 satır.

---

### 5. `competition/page.tsx` + `sites/[code]/page.tsx` (440 + 556 LOC)

**Smell'ler:**
- **Collapsible panel'ler default kapalı**: "Tür Bazlı Karşılaştırma", "Site vs Site Matrisi" scroll edilmezse görünmüyor (`:235-328`)
- **Momentum vs Stance** — iki farklı signal, ikisi de gösterilir, ama tanımları PageHeader'da yok (`:209-225`)
- **Tarih range label tutarsızlığı**: `preset !== 'custom'` ise `PRESET_LABELS[preset]`, custom ise tarih aralığı; hangisi canonical?

**Önerilen tek iyileştirme:** `showBonusTable` / `showMatrix` default true yap — 2 satır.

---

## Kategori Bazlı UX Smells Özeti

| Sorun | Sayfaların %X'i | Ciddiyet | Kullanıcı Hissi |
|---|---|---|---|
| Gizli özellikler (Tab/collapsible) | 25% (6) | 🔴 Yüksek | "Feature var mı bilmiyorum" |
| Açıklamasız metrikler | 30% (7) | 🔴 Yüksek | "Bu sayı ne demek?" |
| Aşırı dolu hero | 35% (8) | 🟡 Orta | "Nereden başlasam?" |
| Tutarsız CTA | 20% (5) | 🟡 Orta | "Hangi buton tıklanacak?" |
| Filter karmaşıklığı | 40% (10) | 🟡 Orta | "Kaç filter var?" |
| Mock/simüle uyarısız | 15% (4) | 🟡 Orta | "Bu gerçek veri mi?" |
| Boş state uyarısız | 20% (5) | 🟡 Orta | "Neden boş?" |

---

## Eksik / Yarım Kalmış Özellikler

| Sayfa | TODO/FIXME/Yorum | Etki | Referans |
|---|---|---|---|
| Trends | `// In production, this would be a dedicated trend endpoint` — simüle veri | 🔴 Kullanıcı simüle veri bilmiyor | `trends/page.tsx:172` |
| Quality | `// This simulates historical data - replace with real API` | 🔴 Trend chart simüle | `admin/quality/page.tsx:77, 83` |
| Bonus Index | "Bu aralıkta yeterli bonus verisi yok" — empty state çalışmıyor | 🟡 Veri varsa görünecek | `insights/bonus-index/page.tsx:151-154` |
| Reports | `ScheduleForm` import edilmiş, açıklaması yok | 🟡 Sayfaya ne yapıyor? | `reports/page.tsx:12, 184` |
| Notifications | Migration 023 pending kontrolü, fallback uyarı | ✓ Kontrol var | `notifications/page.tsx:190-203` |

---

## Quick Win Önerileri (Toplam ~30 dk)

1. **Trends + Quality için simüle veri uyarısı** — chart üstüne AlertBanner. (~10 dk)
2. **`campaigns/[id]` tab'larına count badge** — Rakipler (N), Değişiklikler (N). (~10 dk)
3. **HeroStatCard'a `tooltip` prop** — Aktiflik Oranı vb. metriklere tooltip. (~5 dk)
4. **Competition collapsible'ları default açık** — `showBonusTable` / `showMatrix` true. (~5 dk)

## Daha Büyük Refactor'lar (Tasarım Kararı Gerekiyor)

| Sayfa | Önerilen | Tahmini Süre | Karar Noktası |
|---|---|---|---|
| Dashboard ana | Hero'yu 3-4 metriğe indir, "tek görev" odaklı | 3-4 saat | Hangi 3 metrik kalsın? |
| `campaigns/[id]` | Tab yapısını accordion'a çevir veya tek scroll yap | 2-3 saat | Tab vs accordion vs scroll? |
| `calendar` | `/calendar` (aylık) + `/calendar/timeline` (Gantt) ayır | 3-4 saat | Default landing hangi? |
| `admin/jobs` | 4 bağımsız bölümü 4 sub-page'e böl | 2-3 saat | Tab vs ayrı route? |
