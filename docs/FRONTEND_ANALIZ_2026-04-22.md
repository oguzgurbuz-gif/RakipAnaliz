# Rakip Analiz Toolu - Frontend Analiz Raporu

**Tarih:** 22 Nisan 2026
**Analiz Eden:** Hermes Agent
**Proje:** ~/Desktop/projects/RakipAnaliz
**Son Güncelleme:** 22 Nisan 2026 - AI Karşılaştırma Paneli analizi eklendi

---

## Özet

Growth/marketing ekibine içgörü ve hız sağlamak için build edilmiş bu tool'da **4 kritik sorun**, birkaç orta seviye eksiklik ve orta vadede büyük etki yaratacak geliştirme alanları tespit edildi.

Toplam: **24 action item** (4 Kritik, 4 Yüksek, 5 Orta, 5 Düşük, 6 Bilgi)

---

## KRITIK SORUNLAR

### 1. [CRITICAL] `CategoryWinnerWidget` - Tamamen Sahte Veri

**Dosya:** `apps/dashboard/components/ui/category-winner.tsx`

**Sorun:** `MOCK_CATEGORY_WINNERS` array'i gerçek API'ye bağlı değil. Bitalih, Nesine, Bilyoner, Misli için uydurma kampanya sayıları veriliyor. Widget'ın kendisi `useQuery` kullanmıyor, direkt hardcoded array render ediyor.

**Etki:** Marketing/Growth ekibi "kim kazanıyor" sorusuna bu widget'ı referans alarak karar veriyor olabilir. Veri %100 güvenilir değil.

**Mevcut Durum (hardcoded):**
```
casino  → Bitalih: 847 cmp, Nesine: 723 cmp
sports  → Bilyoner: 612 cmp, Bitalih: 598 cmp
poker   → Misli: 234 cmp, Oley: 198 cmp
bingo   → Sondüzlük: 156 cmp, Hipodrom: 134 cmp
```

**Kök Neden:** Widget geliştirilirken geçici olarak mock data ile yazılmış, sonra API'ye bağlanmamış.

**Nasıl Düzeltilir:**
1. Backend'de `/api/competition` endpoint'i zaten date range + category destekli veri dönüyor (`siteRankings`, `comparisonTable`)
2. `comparisonTable` her kategori için `best_site`, `best_site_campaigns`, `total_campaigns` dönüyor — tam ihtiyaca uygun
3. Widget'ı `useQuery` ile `/api/competition?from=X&to=Y` çağıracak şekilde güncelle
4. Gelen veriden her kategori için en yüksek kampanyalı 2 siteyi al, Winner/RunnerUp göster
5. API down olursa "Veri yükleniyor..." skeleton göster, kesinlikle mock data gösterme

**TODO (4 adım):**
- [ ] **1. Backend'i incele:** `/api/competition` zaten `comparisonTable` dönüyor — her kategoride en iyi site `best_site`, `best_site_campaigns` olarak geliyor. Yeterli mi yoksa yeni endpoint gerekir? → Backend ekibine sor
- [ ] **2. Widget güncelle:** `useQuery` ekle, `/api/competition` çağır, gelen veriyi parse et
- [ ] **3. Date range bağla:** Widget'ın `useDateRange('home')` hook'unu kullanması gerekiyor
- [ ] **4. Fallback:** Loading state = skeleton, error/null = "Bu kategoride veri yok" göster, mock yasak

---

### 2. [CRITICAL] AI Karşılaştırma Paneli - Tarih Filtresini Göz Ardı Ediyor

**Dosya:** `apps/dashboard/app/page.tsx` — AI Karşılaştırma Paneli section

**Sorun:** Kullanıcı dashboard'da "Bu Hafta", "Geçen Hafta", "Bu Ay" gibi date range seçtiğinde AI Karşılaştırma Paneli bu tarihleri tam olarak kullanmıyor. Panel "Toplam" (tüm tarihlerin toplamı) gösteriyor gibi davranıyor.

**Örnek:** "Bu Ay" seçildiğinde → 15 Nisan - 22 Nisan arası kampanya sayısı gösterilmeli, ama panel toplam kampanya sayısını gösteriyor.

**Tespit Edilen Durum:**

Frontend'den API'ye tarihler gönderiliyor:
```typescript
// page.tsx
const { data: competitionData } = useQuery({
  queryKey: ['competition', selectedCategory, dateFrom, dateTo],
  queryFn: () => fetchCompetition(selectedCategory || undefined, { from: dateFrom, to: dateTo }),
  enabled: Boolean(dateFrom && dateTo),
})
```

API backend'de `bonusMetricsCte` doğru filtre uyguluyor:
```sql
-- API backend (competition/route.ts)
bonusMetricsCte: c.first_seen_at >= from AND c.first_seen_at < to + 1 day
```

**Ancak Sorun Şu:** Panel'de gösterilen `total_campaigns` = o tarih aralığında **oluşturulan** kampanyalar değil, `campaign_bonus_values` tablosundaki tüm kayıtların SAYISI. Burada karıştırılan iki metrik var:

1. **`total_campaigns`**: O tarih aralığında **first_seen_at** bazlı sayım — bu doğru
2. **`bestDeals`**: En yüksek bonuslu kampanyalar — bu da first_seen_at bazlı

**ASIL SORUN:** Panel'in "Bitalih Pozisyonu: Üst Sırada" kartı `bitalihData.total_campaigns` gösteriyor. Bu sayı doğru olsa bile, kartın altındaki açıklama "Rakip ort: 47" gibi rakamlar veriyor ama bu rakamlar anlamsız çünkü rakamlarla neyin karşılaştırıldığı net değil.

**İkinci Sorun:** `avgCompetitorCampaigns` hesaplaması:
```typescript
const otherSites = competitionData?.siteRankings?.filter(s => s.site_code !== 'bitalih') || []
const avgCompetitorCampaigns = otherSites.length > 0
  ? otherSites.reduce((sum, s) => sum + Number(s.total_campaigns), 0) / otherSites.length
  : 0
```
Bu, Bitalih hariç tüm sitelerin ortalamasını alıyor. Ancak tarih aralığı değişince bu sayılar da değişiyor — bu kısım doğru. Sorun şu ki, panel başlığı/açıklaması "Bu Ay" vs "Bu Hafta" bilgisini vermiyor. Kullanıcı hangi dönemde olduğunu panele bakarak anlayamıyor.

**Nasıl Düzeltilir:**
1. Panel'in üstüne tarih aralığı badge'i ekle: "📅 15 - 22 Nisan 2026"
2. Kart açıklamalarını daha spesifik yap: "Bu ay 47 kampanya (önceki ay: 38)" gibi delta gösterimi
3. `Bitalih Pozisyonu` kartındaki metrik açıklaması netleştirilmeli — "Üst Sırada" neye göre üst sırada?
4. Belki de panel 2'ye bölünmeli: "Kampanya Sayısı Karşılaştırması" (bu ay) vs "En İyi Bonus Teklifleri" (tüm zamanlar / seçili kategoride en iyi)

**TODO (6 adım):**
- [ ] **1. Tarih badge'i ekle:** AI Karşılaştırma Paneli'nin sağ üstüne seçili tarih aralığını gösteren bir badge: `{from} - {to}`
- [ ] **2. Kart metriklerini netleştir:** "Üst Sırada" yerine "En Yüksek Hacim" veya "En Çok Kampanya" yaz — neye göre üst sırada olduğu belli olsun
- [ ] **3. Rakip ortalamasını tarih aralığıyla ilişkilendir:** "Rakip ort: 47" açıklamasına "(bu ay)" ekle
- [ ] **4. Delta gösterimi ekle:** `bitalihData.total_campaigns` önceki dönemle karşılaştırılmalı — "↑ +5 yeni kampanya" gibi
- [ ] **5. Backend'e sor:** `/api/competition` dışında tarih bazlı karşılaştırma için ayrı bir metrik endpoint'i gerekli mi?
- [ ] **6. UX test et:** Gerçek bir kullanıcı (marketing/growth ekibi) bu paneli kullandığında tarih aralığı değişince verinin de değiştiğini anlıyor mu?

---

### 3. [HIGH] `SITE_FRIENDLY_NAMES` 3 Yerde Tekrar Ediyor

**Dosyalar:**
- `apps/dashboard/app/page.tsx` (Dashboard)
- `apps/dashboard/app/compare/CompareClient.tsx` (Karşılaştır)
- `apps/dashboard/lib/site-colors.ts` (Renkler + İsimler)

**Sorun:** Site kodları (bitalih, nesine...) → Türkçe isimler (Bitalih, Nesine...) mapping'i 3 ayrı yerde hardcoded. Yeni site eklenince 3 yeri güncellemek gerekiyor, unutulursa "undefined" görünür.

**Mevcut Mapping (page.tsx'de):**
```typescript
bitalih: 'Bitalih',
nesine: 'Nesine',
sondzulyuk: 'Sondüzlük',
bilyoner: 'Bilyoner',
misli: 'Misli',
oley: 'Oley',
hipodrom: 'Hipodrom',
atyarisi: 'Atyarisi',
birebin: 'Birebin',
altiliganyan: 'Altiliganyan',
ekuri: 'Ekuri',
'4nala': '4nala',
```

**Yazım Uyuşmazlığı:** `site-colors.ts`'de `sonduzluk` ama `SITE_FRIENDLY_NAMES`'de `sondzulyuk` — bu tutarsızlık bug'a yol açabilir. Bir yerde yazım hatası varsa renk/isme ulaşılamaz.

**Gerçek Çözüm:** Backend zaten her şeyi döndürüyor — `campaign.site.name` diye site ismi geliyor. Frontend'de tekrar mapping'e gerek yok. Tek yapılması gereken: Backend'den gelen `site_name` kullan, frontend'de mapping yapma.

**TODO (5 adım):**
- [ ] **1. Analiz et:** Tüm frontend kodlarında `SITE_FRIENDLY_NAMES` kullanımını bul (`grep -r "SITE_FRIENDLY_NAMES"`)
- [ ] **2. Backend'e bak:** `/api/competition` response'unda `site_name` zaten geliyor. Kullanılıyor mu? (`site.site_name` vs `SITE_FRIENDLY_NAMES[site.site_code]`)
- [ ] **3. Karşılaştır sayfasında:** `SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase()]` yapıyor — bu yanlış. `site.name` zaten düzgün geliyor, neden `toLowerCase()` + hardcoded map'e ihtiyaç var?
- [ ] **4.site-colors.ts yazım hatası:** `sonduzluk` → `sondzulyuk` düzelt
- [ ] **5. Temizle:** Hardcoded mapping'leri kaldır, backend verisi kullan

---

### 4. [HIGH] `lib/site-colors.ts` - Yeni Site Eklenince Kırılır

**Dosya:** `apps/dashboard/lib/site-colors.ts`

**Sorun:**
- `PRIORITY_SITES = ['bitalih', 'hipodrom', 'atyarisi']` hardcoded
- Renk paleti 11 site için sabit
- Yeni site eklenince renk atanamaz, `FALLBACK_COLORS` ile hash-based atanır (tutarsız görünüm, her sayfa yenilemesinde sıra değişebilir)

**TODO (3 adım):**
- [ ] **1. Admin panelde yönetilebilir yap:** Sites tablosuna `is_priority` boolean ve `display_color` string ekle
- [ ] **2. Backend endpoint:** `/api/sites` response'una `is_priority` ve `color` alanları ekle
- [ ] **3. Frontend güncelle:** `PRIORITY_SITES` frontend'de değil backend'den gelsin

---

## ORTA SEVIYE SORUNLAR

### 5. [MEDIUM] `lib/category-labels.ts` - Statik Kategori Etiketleri

**Dosya:** `apps/dashboard/lib/category-labels.ts`

**Sorun:** Kategori kodları → Türkçe etiketler statik dictionary'de. Backend yeni kategori eklerse ("yeni_bonus_turu" gibi) UI'da "Bilinmiyor" yerine raw kod görünür.

**Örnek:** Backend'e "free_spins" diye yeni kategori eklendi — frontend "Bilinmiyor" gösterir, kullanıcı ne olduğunu anlamaz.

**TODO (3 adım):**
- [ ] **1. Backend'e sor:** Kategori label'ları API'den gelebilir mi? `/api/categories` endpoint'i olabilir
- [ ] **2. Geçici çözüm:** `getCategoryLabel` fonksiyonuna fallback: bilinmeyen kategori kodunu title-case'e çevir ("free_spins" → "Free Spins")
- [ ] **3. Kalıcı çözüm:** Backend'e `label` field'ı ekle veya enum kullan

---

### 6. [MEDIUM] Türkçe Ay/Gün İsimleri Hardcoded

**Dosya:** `apps/dashboard/components/calendar/gantt-strip.tsx`

**Sorun:**
```typescript
const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
```

**TODO (2 adım):**
- [ ] **1. Hızlı düzeltme:** `Intl.DateTimeFormat` veya `toLocaleDateString('tr-TR', { month: 'short' })` kullan
- [ ] **2. i18n hazırlığı:** İngilizce desteği gerekirse diye `lib/i18n.ts` dosyası oluştur, şimdilik sadece Türkçe

---

### 7. [MEDIUM] Intent/Stance Badge'leri Statik Threshold

**Dosyalar:**
- `apps/dashboard/components/ui/intent-badge.tsx`
- `apps/dashboard/components/ui/stance-badge.tsx`

**Sorun:** Velocity delta threshold'ları (-2, +2) ve intent etiketleri frontend'de tanımlı. Backend değişse frontend uyumaz.

**Örnek:** Backend "aggressive" threshold'unu >+5 olarak güncelledi ama frontend hâlâ >+2 kullanıyorsa, badge'ler yanlış renk gösterir.

**TODO (2 adım):**
- [ ] **1. Backend'den çek:** Intent/Stance etiketlerini backend'den çek (enum veya endpoint)
- [ ] **2. Geçici:** Constant'ları tek dosyaya topla — `lib/taxonomy.ts` (intent labels, stance thresholds)

---

## SAYFA BAZINDA DURUM

| Sayfa | API Bağlantısı | Hardcoded | Not |
|-------|---------------|-----------|-----|
| `/` Dashboard | ✅ | ⚠️ 3 sorun | CategoryWinnerWidget mock, SITE_FRIENDLY_NAMES, AI Panel date issue |
| `/campaigns` | ✅ | ✅ | İyi durumda |
| `/campaigns/[id]` | ✅ | ✅ | İyi durumda |
| `/competition` | ✅ | ✅ | İyi durumda |
| `/compare` | ✅ | ⚠️ | API'den çekiyor ama site isimleri hardcoded |
| `/calendar` | ✅ | ⚠️ | AY_ADLARI hardcoded |
| `/trends` | ✅ | ✅ | İyi durumda |
| `/reports` | ✅ | ✅ | İyi durumda |
| `/reports/summary` | ✅ | ✅ | İyi durumda |
| `/reports/weekly` | ✅ | ✅ | İyi durumda |
| `/insights/bonus-index` | ✅ | ✅ | İyi durumda |
| `/gallery` | ✅ | ✅ | İyi durumda |
| `/notifications` | ✅ | ✅ | İyi durumda |
| `/admin/*` | ✅ | ✅ | İyi durumda |

---

## GELİŞTİRME ÖNERİLERİ

### Hemen Yapılacaklar (1-2 hafta)

| # | Öneri | Impact | Effort |
|---|-------|--------|--------|
| 1 | AI Karşılaştırma Paneli - Tarih badge + delta gösterimi | HIGH | Düşük |
| 2 | CategoryWinnerWidget'ı API'ye bağla | HIGH | Orta |
| 3 | SITE_FRIENDLY_NAMES kaldır, backend verisi kullan | MEDIUM | Orta |
| 4 | site-colors.ts yazım hatası düzelt (sonduzluk→sondzulyuk) | LOW | Çok düşük |

### Orta Vadeli (1-2 ay)

| # | Öneri | Impact | Açıklama |
|---|-------|--------|-----------|
| 5 | **Rakip Seçimli Karşılaştırma** | HIGH | Şu an sadece campaign ID seçtiriyor. "Bitalih vs Nesine" seçimi yapılabilmeli. Rakip marka bazlı kampanya karşılaştırması growth ekibinin en çok istediği şey. Kullanıcı 2 rakip seçer, tüm kampanyalarını yan yana görür. |
| 6 | **Trend Alert Bildirimleri** | HIGH | "Rakip X son 3 günde 5 yeni kampanya başlattı" → Slack/Email bildirimi. Rekabet avantajı için erken uyarı kritik. Scraping her X dakikada bir çalışıyor, yeni kampanya görülünce alert tetiklenir. |
| 7 | **Sample Size Uyarısı** | MEDIUM | "Bu hafta sadece 3 kampanya — veri yeterli mi?" gibi istatistiksel uyarı. Karar almadan önce güven aralığı göstersin. Örneğin: <10 kampanya = " düşük örneklem, yorum dikkatli yapılmalı", >50 = "güvenilir veri" gibi. |
| 8 | **Calendar'da Rakip Overlay** | MEDIUM | Belirli bir rakibin kampanyalarını timeline'da highlight et. Rakip launches'u görsel olarak tespit etmek için. Kullanıcı "Bitalih" seçer, sadece onun kampanya barları parlak olur, diğerleri soluk. |

### İleri Görüş (3+ ay)

| # | Öneri | Impact | Açıklama |
|---|-------|--------|-----------|
| 9 | **Campaign ROI Score** | HIGH | Çevrim şartı + min yatırım + bonus miktarından "gerçek değer" hesaplama. Hangi kampanya daha değerli? Formül: `effective_bonus = bonus_amount / turnover_multiplier`. Sadece amount değil, "sömürmek gerçekten ne kadar zor" hesaba katılmalı. |
| 10 | **Temporal Impact Analysis** | HIGH | "Rakip X kampanya başlattıktan 2 gün sonra bizim kampanya görüntülenmemiz düştü" gibi causal/temporal analiz. Çok iddialı ve muhtemelen veri gerekirse başarılır. |
| 11 | **Bonus Index YoY + Category Breakdown** | MEDIUM | Şu an sadece haftalık trend var. Geçen yılın aynı dönemiyle karşılaştırma ve kategori bazlı detay çok daha değerli. "Geçen yıl bu ay sektörde %30 daha fazla bonus dağıtıldı" gibi. |
| 12 | **PDF Rapor Otomasyonu** | MEDIUM | Haftalık raporu otomatik olarak email ile gönderme. Haftalık rapor hazır, sadece scheduling + email SMTP eksik. |

---

## DETAYLI BACKLOG TODOS

### Kritik (Bu Sprint) - Toplam 9 adım

**AI Karşılaştırma Paneli:**
- [ ] **1a.** Panel'in sağ üstüne tarih aralığı badge'i ekle (`{from} - {to}`)
- [ ] **1b.** Kart metriklerini netleştir: "Üst Sırada" → "En Yüksek Hacim" veya "En Çok Kampanya"
- [ ] **1c.** Rakip ortalaması açıklamasına "(bu ay)" ekle
- [ ] **1d.** `bitalihData.total_campaigns` için önceki dönem delta göster: "↑ +5 yeni kampanya"
- [ ] **1e.** Backend ekibine danış: tarih bazlı karşılaştırma için ayrı endpoint gerekli mi?

**CategoryWinnerWidget:**
- [ ] **2a.** Widget'ı `useQuery` + `/api/competition` çağıracak şekilde güncelle
- [ ] **2b.** Date range bağla: `useDateRange('home')` kullan
- [ ] **2c.** API response parse et: `comparisonTable` üzerinden winner/runner-up al
- [ ] **2d.** Loading = skeleton, error/null = "Bu kategoride veri yok", mock KESİNLİKLE yasak

### Yüksek (2 Sprint) - Toplam 6 adım

**Site Names & Colors:**
- [ ] **3a.** `SITE_FRIENDLY_NAMES` kullanımını analiz et (`grep -r`)
- [ ] **3b.** Backend `/api/competition` response'unda `site_name` kullan, hardcoded map kaldır
- [ ] **3c.** `site-colors.ts` yazım hatası: `sonduzluk` → `sondzulyuk` düzelt
- [ ] **3d.** Karşılaştır sayfasındaki `SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase()]` mantığını düzelt

**Yeni Özellikler:**
- [ ] **4.** `/compare` sayfasında rakip site seçimi ekle (dropdown'dan site seç, kampanyalarını listele)
- [ ] **5.** Calendar'da rakip bazlı filter/overlay ekle

### Orta (Next Milestone) - Toplam 6 adım

- [ ] **6.** Kategori label'larını backend'den çek veya `getCategoryLabel` fallback'ini iyileştir
- [ ] **7.** Türkçe ay isimlerini `Intl.DateTimeFormat`'a taşı
- [ ] **8.** Intent/Stance constant'larını `lib/taxonomy.ts`'e topla
- [ ] **9.** Sample size uyarısı ekle (campaign sayısı < 10 ise "düşük örneklem" göster)
- [ ] **10.** Alert sistemi için `/api/alerts/webhook` endpoint'i (Slack/Email notification)
- [ ] **11.** Priority sites'leri backend'den yönet (admin panelde config)

### Düşük (Gelecek Plan) - Toplam 5 adım

- [ ] **12.** Bonus Index'e YoY comparison ekle
- [ ] **13.** Bonus Index'e category breakdown ekle
- [ ] **14.** Campaign ROI score hesaplama endpoint'i + UI'da gösterim
- [ ] **15.** Temporal impact analysis endpoint'i (rakip launch → bizim metrikler)
- [ ] **16.** Haftalık PDF raporu email otomasyonu

---

## TEKNİK DETAYLAR

### AI Karşılaştırma Paneli Veri Akışı

```
Kullanıcı tarih seçer (DateRangePicker)
    ↓
useDateRange('home') → { from: "2026-04-15", to: "2026-04-22" }
    ↓
useQuery(['competition', category, dateFrom, dateTo], fetchCompetition(...))
    ↓
GET /api/competition?from=2026-04-15&to=2026-04-22&category=
    ↓
Backend: bonusMetricsCte() → c.first_seen_at >= from AND < to+1day
    ↓
competitionData.siteRankings[] → her site için total_campaigns, avg_bonus
    ↓
Frontend:
  - bitalihData = siteRankings.find(s => s.site_code === 'bitalih')
  - otherSites = siteRankings.filter(s => s.site_code !== 'bitalih')
  - avgCompetitorCampaigns = otherSites.reduce(...) / otherSites.length
  - bestCompetitor = otherSites.sort(by avg_bonus desc)[0]
```

**Sorun:** `avgCompetitorCampaigns` hesabı "diğer rakiplerin ortalaması" — bu her tarih aralığı için doğru hesaplanıyor. Ancak kullanıcıya net gösterilmiyor. Panelin header'ında tarih aralığı belirtilmeli.

### Kategori Kazananları Widget Veri Akışı (Şu an / Olması Gereken)

```
Şu an (MOCK):
  CategoryWinnerWidget
    ↓
  MOCK_CATEGORY_WINNERS = [...] ← HARDKODED

Olması gereken:
  CategoryWinnerWidget
    ↓
  useQuery(['competition', from, to], fetchCompetition(...))
    ↓
  competitionData.comparisonTable[] → her kategoride en iyi site
    ↓
  best_site = comparisonTable.find(c => c.category === 'casino')?.best_site
    ↓
  Kazanan: Bitalih, runner-up: Nesine
```

---

## BILINMESI GEREKENLER

- **Stack:** Next.js (App Router) + TanStack Query + Radix UI + Tailwind CSS
- **Database:** MySQL — `campaigns`, `sites`, `campaign_bonus_values` tabloları
- **Backend:** `/api/competition` endpoint'i tarih filtreli veri dönüyor (doğru çalışıyor)
- **Frontend state:** TanStack Query (React Query) — tüm API verisi buradan
- **Date range:** Global `useDateRange('home')` hook'u — tüm sayfalarda kullanılabilir
- **Auth:** Admin sayfalarında auth yok gibi görünüyor (güvenlik riski)
- **Scraping:** Python scraper (`apps/scraper`) — `apps/scraper/` dizininde
- **Alert sistemi:** `/api/admin/alerts` — mevcut ama Slack/Email entegrasyonu eksik

---

## TERMINOLOJI

| Terim | Açıklama |
|-------|----------|
| Stance | Rakibin kampanya aktivitesi: Atak (hızlı artış), Defans (yavaşlama), Nötr. Hesaplama: `velocity_delta = last_7d_count - last_4w_avg` |
| Intent | Kampanya amacı: Yeni müşteri (acquisition), Mevcut müşteri (retention), Marka (brand), Sezon sonu (clearance) |
| Competitive Intent | Migration 018 ile gelen yeni taxonomy, sentiment yerine kullanılıyor |
| SOV | Share of Voice - pazarda kim ne kadar kampanya yapıyor |
| YoY | Year over Year - geçen yılın aynı dönemiyle karşılaştırma |
| ROI Score | Bonus miktarı / çevrim çarpanı = "net bonus" — kampanyanın gerçek değeri |
| first_seen_at | Kampanyanın scraper tarafından ilk görülme tarihi |
| valid_from / valid_to | Kampanyanın geçerlilik başlangıç/bitiş tarihi |
| momentum_score | Son 7 gün vs önceki 7 gün kampanya sayısı değişimi yüzdesi |
