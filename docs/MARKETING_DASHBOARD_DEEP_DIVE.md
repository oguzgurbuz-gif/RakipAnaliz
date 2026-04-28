# Marketing Dashboard Deep Dive — Bi'Talih Weekly Report

> Bu doküman `BiTalih - Weekly Dashboard.xlsx` (16 sheet, ~7400 satır içerik) üzerinde yapılan derin analizin sonucudur. Excel **birebir kopyalanmayacak** — RakipAnaliz dashboard'una **manuel entry + AI consumption** odaklı bir özellik kataloğu, formül referansı ve MySQL data-model taslağı türetildi.

> **Hedef kullanıcı:** Bi'Talih marketing/growth ekibi.
> **Veri akışı:** Manuel haftalık entry → MySQL → dashboard kartları + DeepSeek AI chat.
> **Zaman skalaları:** Haftalık (MVP), aylık, yıllık (P1).

---

## 0. Yönetici Özeti (TL;DR)

- Excel iki ana attribution kaynağını tek matrise bağlar: **GA4** (web/genel) ve **Adjust Mobile** (iOS/Android). Çakışma yok — GA4 web trafiğini, Adjust mobile'ı kapsar; "Total picture" iki blok yan yana okunarak elde edilir.
- 12 metric × 3 zaman boyutu (TW / LW idx / 4WA idx) × 2 attribution bloğu × ~17-25 channel satırı → **toplam ~3.000 hücre** her hafta üretiliyor. Bunların **çoğu hesaplanmış**; gerçek "girilmesi gereken" raw veri sadece 5 raw sheet'in ham satırlarıdır.
- Channel mapping iki adet sözlük tablosu ile yapılıyor: `GA4_Medium_Grouping` (529 satır) ve `Adjust_Medium_Grouping` (107 satır). Bilinmeyen kaynak için iki "queue" sheet'i (`_Unknown_*`) var.
- Periyot kontrolü tek bir 4 satırlık `_Config` sheet'inden yönetiliyor (TW/LW/4WA tarih aralıkları). Tüm formüller bu hücreleri referans alıyor → **periyot değişimini tek noktadan yapabilirsin** (RakipAnaliz'de aynı pattern uygulanmalı).
- Indeks (LW idx, 4WA idx) hesaplaması tutarlı bir şekilde **`(TW / Karşılaştırma) × 100`** olarak tanımlanmış (yani 100 = sabit, 110 = +%10 büyüme, 90 = -%10).
- W16/W17 sheet'leri **donmuş weekly snapshot**'lardır. W17 row 6'da hiç formula yok (52 statik hücre); W16'da hâlâ formula var (30 formül, 1 sabit) → demek ki W17 "kapatılmış" hafta, W16 hâlâ revize ediliyor. Bu **frozen-snapshot pattern** RakipAnaliz'in week-close mantığı için temel olabilir.

---

## 1. Sheet Envanteri

| # | Sheet | Boyut (rows×cols) | Amaç (1 cümle) | Kategori |
|---|-------|-------------------|----------------|----------|
| 1 | `Database_W` | 33×39 | Pazar payı + sektör vertical karşılaştırması (TJK, M, F, Kazı Kazan, Sanal Bahis, Milli Piyango, Sanal At Yarışı). | Bi'Talih-spesifik domain veri |
| 2 | `GA4_Medium_Grouping` | 529×4 | GA4 `source/medium` → `Segment` (Paid/Unpaid/Other) + `Category` (channel) eşleme sözlüğü. | Mapping |
| 3 | `Adjust_Medium_Grouping` | 107×3 | Adjust network → Segment + Category eşleme sözlüğü. | Mapping |
| 4 | `Master_Metric_Table` | 1001×53 | **Asıl dashboard.** GA4 + Adjust iki bloğunda 12 metric × TW/LW/4WA, channel başına satır. | Dashboard view |
| 5 | `Weekly Growth` | 1100×86 | WoW total ciro + CRM channel breakdown (PUSH/SMS/POPUP/STORYLY/BANNER) + HK kampanya verileri + çark/promo. | Stand-alone CRM tracker |
| 6 | `_Config` | 4×4 | TW/LW/4WA periyot başlangıç-bitiş tarihleri (tek truth source). | Config |
| 7 | `SM_Ads_Raw` | 1109×5 | Supermetrics: günlük ad spend + impression + click, platform bazında. | Raw |
| 8 | `SM_Adjust_Raw` | 2053×10 | Supermetrics: Adjust günlük installs / sessions / impressions / sign-ups / purchases / revenue, channel × OS. | Raw |
| 9 | `SM_GA4_Raw` | 2260×8 | Supermetrics: GA4 günlük sessions / users / sign-ups / purchases / revenue, source/medium bazında. | Raw |
| 10 | `SM_GA4_Weekly_Users` | 1000×4 | GA4 haftalık unique user count (günlük sum'lanamaz, ayrı pull). | Raw (özel) |
| 11 | `ADJ_Events_Raw` | 1707×6 | Adjust events: günlük signup + purchase, network × OS × category. | Raw |
| 12 | `W16_2026-04-13` | 1002×40 | 16. hafta snapshot (hâlâ formula içeriyor — yarı-canlı). | Archive (live) |
| 13 | `_Unknown_Adjust_Networks` | 2×1 | Mapping'de bulunmayan Adjust network'lerinin auto-flag listesi. | Quality control |
| 14 | `_Unknown_GA4_Sources` | 6×1 | Mapping'de bulunmayan GA4 source/medium'larının auto-flag listesi. | Quality control |
| 15 | `_Reconciliation` | 2×9 | GA4↔Adjust + mapping consistency tek-satırlık özet. | QC |
| 16 | `W17_2026-04-20` | 1001×53 | 17. hafta donmuş snapshot (tüm hücreler statik değer). | Archive (frozen) |

**Tarih kapsamı (raw sheet'ler):** 2026-03-30 → 2026-04-26 = 4 tam hafta + tek tek günler (28 gün).
`SM_GA4_Weekly_Users` özeldir: 4 hafta = 4 satır (haftalık aggregate, çünkü GA4 user count günlük toplanamaz).

---

## 2. Master_Metric_Table — Anatomi

### 2.1 Yapı

İki ana blok, dikey olarak ayrı:

**Blok 1 — GA4 (rows 3-27)**
```
A3   = "GA4"
A4   = Channel (sütun başlıkları satırı)
A5   = (boş — TW/LW idx/4WA idx alt-başlıkları satırı)
A6   = TOTAL
A7   = "── PAID ──" (separator)
A8-14= 7 paid channel: Google Ads, Meta Ads, ASA, Native Content Ads, X Ads, Display Ads, TikTok Ads
A15  = PAID TOTAL
A16  = "── UNPAID ──"
A17-26 = 10 unpaid: Direct, App Store (Android), Organic Search, Organic Social, In-App, Referral, SMS, Internal Campaign, Direct/Other, Other
A27  = UNPAID TOTAL
```

**Blok 2 — ADJUST MOBILE (rows 30-54)**
```
A30  = "ADJUST MOBILE"
A31  = Channel header
A32  = (alt-başlıklar)
A33  = TOTAL
A34  = Android
A35  = iOS
A37  = "── PAID ──"
A38-46= 9 paid: Google Ads, Meta Ads, X Ads, TikTok Ads, ASA, Native Content Ads, App Samurai, Avow, Affiliate
A47  = PAID TOTAL
A48  = "── UNPAID ──"
A49-53= 5 unpaid: Organic Search, SMS, Push, In-App, Other
A54  = UNPAID TOTAL
```

### 2.2 Metric x Sütun Layout (her bir blok aynı düzen)

Her metric **3 sütun** kaplar (TW / LW idx / 4WA idx), aralarda 1 boş sütun:

| Metric | TW | LW idx | 4WA idx |
|--------|----|----|----|
| USER (GA4) / Installs (Adjust) | B | C | D |
| SESSION (GA4) / Sessions (Adjust) | F | G | H |
| IMPRESSION | J | K | L |
| SIGN UP | N | O | P |
| PURCHASE | R | S | T |
| REVENUE | V | W | X |
| SPEND | Z | AA | AB |
| CR | AD | AE | AF |
| CPC | AH | AI | AJ |
| CPM | AL | AM | AN |
| ROAS | AP | AQ | AR |
| CPS | AT | AU | AV |
| CPP | AX | AY | AZ |

> **Not:** GA4 bloğunda B = USER (kişi), F = SESSION. Adjust bloğunda B = "-" (kullanılmıyor — kişi unique sayma yok), F = Installs/Sessions. ADJUST bloğunda CPM hesaplanmaz (Adjust impression Adjust'tan, spend SM_Ads_Raw'dan, eşleştirme tutarsız → AL/AM/AN sütunları "-").

### 2.3 Tüm Formüller (Channel = "Google Ads", row 8 örneğinden çıkarılmış jenerik formüller)

> Formüllerde `_Config!B2` = TW start, `C2` = TW end. `B3/C3` = LW start/end. `B4/C4` = 4WA start/end (4 tam hafta).

| Metric | TW Formülü | LW idx Formülü | 4WA idx Formülü | Source Sheet | Source Cols | Notlar |
|--------|-----------|----------------|------------------|--------------|-------------|--------|
| **USER (GA4)** | `=IFERROR(SUMIFS(SM_GA4_Weekly_Users!D:D, SM_GA4_Weekly_Users!A:A, _Config!B2, SM_GA4_Weekly_Users!C:C, "Google Ads"), 0)` | `=B/IFERROR(SUMIFS(... LW ...),1) * 100` | `=B/(IFERROR(SUMIFS(... 4WA range ...),0)/4) * 100` | `SM_GA4_Weekly_Users` | A=Date, C=Category, D=Total Users | Filter `Week_Start = TW_start` (eq), kategori bazlı sum. **Haftalık unique user özel sheet'ten çekiliyor** (günlük toplanamaz!) |
| **SESSION (GA4)** | `=IFERROR(SUMIFS(SM_GA4_Raw!D:D, A:A,">="&_Config!B2, A:A,"<="&_Config!C2, C:C,"Google Ads"), 0)` | TW/LW × 100 | TW / (4WA_sum/4) × 100 | `SM_GA4_Raw` | A=Date range, C=Category, D=Sessions | Date range (≥ start, ≤ end) — günlük toplanabilir |
| **IMPRESSION** | `=IFERROR(SUMIFS(SM_Ads_Raw!C:C, A:A range, B:B,"Google Ads"), 0)` | aynı pattern | aynı pattern | `SM_Ads_Raw` | A=Date, B=Platform, C=Impressions | Ad platform raw'dan, kategori değil platform adıyla filter |
| **SIGN UP (GA4)** | `=SUMIFS(SM_GA4_Raw!F:F, A:A range, C:C,"Google Ads")` | aynı | aynı | `SM_GA4_Raw` | F = Sign Ups | GA4 conversion event |
| **SIGN UP (Adjust)** | `=SUMIFS(ADJ_Events_Raw!F:F, A:A range, D:D,"Google Ads")` | aynı | aynı | `ADJ_Events_Raw` | F = Signup | Adjust event raw |
| **PURCHASE (GA4)** | `=SUMIFS(SM_GA4_Raw!G:G, ...)` | aynı | aynı | `SM_GA4_Raw` | G = Purchases | GA4 transactions count |
| **PURCHASE (Adjust)** | `=SUMIFS(ADJ_Events_Raw!E:E, A:A range, D:D,"Google Ads")` | aynı | aynı | `ADJ_Events_Raw` | E = Purchase | Adjust events purchase count |
| **REVENUE (GA4)** | `=SUMIFS(SM_GA4_Raw!H:H, ...)` | aynı | aynı | `SM_GA4_Raw` | H = Revenue | TRY |
| **REVENUE (Adjust)** | `=SUMIFS(SM_Adjust_Raw!J:J, A:A range, C:C,"Google Ads")` | aynı | aynı | `SM_Adjust_Raw` | J = Revenue | TRY |
| **SPEND** | `=SUMIFS(SM_Ads_Raw!E:E, A:A range, B:B,"Google Ads")` | aynı | aynı | `SM_Ads_Raw` | E = Spend | **Genelde USD** (SM_Ads_Raw birim spec edilmemiş) |
| **CR** | `=IFERROR((SUMIFS(SM_GA4_Raw!G:G,...)) / (SUMIFS(SM_GA4_Raw!D:D,...)), 0)` | TW_CR / LW_CR × 100 | TW_CR / 4WA_CR × 100 | `SM_GA4_Raw` (GA4) / `ADJ_Events_Raw + SM_Adjust_Raw` (Adjust) | — | **CR = Purchase / Sessions** (NOT Sign-Up/Session!). GA4 bloğunda G/D, Adjust bloğunda E_purchase / E_installs. |
| **CPC** | `=IFERROR((SUMIFS(SM_Ads_Raw!E:E,...)) / (SUMIFS(SM_Ads_Raw!D:D,...)), 0)` | DIVIDE(...) × 100 | DIVIDE(...) × 100 | `SM_Ads_Raw` | E=Spend, D=Clicks | Spend / Clicks |
| **CPM** | `=IFERROR((SUMIFS(SM_Ads_Raw!E:E,...)) / (SUMIFS(SM_Ads_Raw!C:C,...)) * 1000, 0)` | aynı pattern × 100 | aynı | `SM_Ads_Raw` | E=Spend, C=Impressions | Spend / Impressions × 1000 |
| **ROAS** | `=IFERROR(V/Z, "-")` (REVENUE / SPEND) | `=ROUND(100*W/AA, 0)` | `=ROUND(100*X/AB, 0)` | hücre referansı | — | Revenue (TW) / Spend (TW). LW idx = LW_revenue_ratio / LW_spend_ratio × 100 |
| **CPS** | `=IFERROR(Z/N, "-")` (SPEND / SIGN UP) | `=ROUND(100*AA/O, 0)` | `=ROUND(100*AB/P, 0)` | hücre referansı | — | Cost per Sign-up |
| **CPP** | `=IFERROR(Z/R, "-")` (SPEND / PURCHASE) | `=ROUND(100*AA/S, 0)` | `=ROUND(100*AB/T, 0)` | hücre referansı | — | Cost per Purchase |

#### Indeks formülünün anatomisi (önemli)

`LW idx` = `TW_değer / LW_değer × 100`
- `100` ⇒ değişim yok
- `120` ⇒ TW, LW'ye göre %20 büyük
- `80` ⇒ TW, LW'ye göre %20 küçük

`4WA idx` = `TW_değer / (Son 4 haftanın toplamı / 4) × 100`
= `TW / ortalama_haftalık_4WA × 100`

> **RakipAnaliz için kural:** Bu indeks formatı kullanıcı için "delta %" olarak da gösterilebilir (`idx - 100`). Default = idx (Excel uyumlu); toggle ile delta% gösterimi.

#### Özel durum: TOTAL row (row 6 GA4) USER hesabı

GA4 USER kategori-filter olmadan **özel sheet'ten** çekiliyor:
```
B6 = SUMIFS(SM_GA4_Weekly_Users!D:D, A:A, _Config!B2, B:B, "TOTAL")
```
Yani `SM_GA4_Weekly_Users` içinde her hafta için bir "TOTAL" satırı (Source/Medium = "TOTAL") manuel olarak yer alıyor — çünkü unique user'ı channel sum etseniz overcount olur. **MySQL'de bu kuralı modellemek lazım** (haftalık total user ayrı kaynak alanı).

### 2.4 Channel Sum Kural Özeti

| Sayı tipi | Sum davranışı | Sheet'te nasıl |
|-----------|---------------|----------------|
| Sessions, Impressions, Sign-ups, Purchases, Revenue, Spend, Installs | Aditif — günlük + channel toplanabilir | `SUMIFS` direkt |
| Users (unique) | Aditif değil — overcount riski | `SM_GA4_Weekly_Users` özel haftalık snapshot |
| CR, CPC, CPM, ROAS, CPS, CPP | Ratio — sum yerine **yeniden hesap** | Numerator ve denominator ayrı `SUMIFS`, sonra divide |

> **MVP not:** Ratio metric'leri **stored hesaplama yapmayın**, view-time / query-time türetin. Aksi halde channel-level sum'larda yanlış sonuç çıkar.

---

## 3. Channel Mapping Derinleme

### 3.1 GA4_Medium_Grouping (529 satır)

**Yapı:** A=Source/Medium (örn. `google / cpc`), B=Segment (`Paid`/`Unpaid`/`Other`/boş), C=Category (Master_Metric_Table'daki channel adı).

**Segment dağılımı:**
| Segment | Satır |
|---------|-------|
| Paid | 358 |
| Unpaid | 127 |
| Other | 15 |
| (boş string) | 27 |
| (None) | 1 |

**Category dağılımı (en kalabalık 15):**
| Category | Satır |
|----------|-------|
| Display Ads | 332 |
| Referral | 87 |
| Organic Social | 29 |
| Other | 21 |
| In-App | 13 |
| Organic Search | 6 |
| Meta Ads | 6 |
| X Ads | 5 |
| Native Content Ads | 4 |
| SMS | 3 |
| Google Ads | 2 |
| TikTok Ads | 2 |
| Internal Campaign | 2 |
| Direct/Other | 2 |
| App Samurai | 2 |

**Edge case'ler:**
- 28 satır boş veya null `Segment` → fiili olarak "kategorisiz" — RakipAnaliz'de **import sırasında bunlar warning** olarak listelenmeli.
- "Other" segmenti 15 satır var ama Category'leri çeşitli (`google / pmax`, `google / video`, `(other)/(other)`, `dv360 / (not set)` vs) → Bunlar muhtemelen **henüz mapping yapılmamış** veya "doesn't fit" durumda.
- `Display Ads` 332 satırla baskın — yani Display Ads bir tek channel değil, çok sayıda farklı placement aggregate edilmiş.

### 3.2 Adjust_Medium_Grouping (107 satır)

**Yapı:** A=Channel (Adjust raw network adı), B=Segment, C=Category.

**Segment dağılımı:**
| Segment | Satır |
|---------|-------|
| Unpaid | 50 |
| Other | 24 |
| (boş) | 19 |
| Paid | 13 |

> Adjust mapping'de Paid kategorisi sadece 13 — çünkü Adjust'ta gerçek paid channel sayısı sınırlı (Google, Meta, TikTok, X, ASA, App Samurai, Avow, Affiliate, Native).

**Category dağılımı:**
| Category | Satır |
|----------|-------|
| In-App | 31 |
| Other | 25 |
| SMS | 17 |
| Google Ads | 7 |
| Meta Ads | 5 |
| X Ads | 5 |
| Affiliate | 3 |
| App Samurai | 2 |
| Organic Search | 2 |
| ASA | 2 |
| Avow | 2 |
| TikTok Ads | 2 |
| Native Content Ads | 2 |
| Push | 1 |

### 3.3 Bilinmeyen kaynak akışı

`_Unknown_GA4_Sources` ve `_Unknown_Adjust_Networks` sheet'leri Google Sheets `FILTER` + `VLOOKUP` ile **mapping'te eşleşmeyen kaynakları otomatik listeleyen** kuyruktur. Excel `__xludf.DUMMYFUNCTION` placeholder ile son hesaplanan değeri saklamış (Google Sheets-only fonksiyon). Şu anda 5 unmapped GA4 source mevcut:

```
docs.google.com / referral
google / video
29forum-bahis.com / referral
DonanimHaber / referral
(other)
```

`_Reconciliation` sheet'i bunu tek satır özet olarak gösteriyor: **section / channel / metric / timeframe / expected / actual / diff / severity / note**. Severity = `warning`. Henüz daha fazla satır yok ama yapı multi-row için tasarlanmış.

> **MVP'de RakipAnaliz'de aynı pattern olmalı:** "Unmapped sources" review queue + admin UI'da bulk-assign.

---

## 4. Periyot Mantığı (`_Config`)

```
A1: Parameter | B1: Start                | C1: End                  | D1: Note
A2: TW       | B2: 2026-04-20            | C2: 2026-04-26           | D2: This Week
A3: LW       | B3: 2026-04-13            | C3: 2026-04-19           | D3: Last Week
A4: 4WA      | B4: 2026-03-30            | C4: 2026-04-26           | D4: 4 Week Average
```

- Hafta = **Pazartesi → Pazar** (7 gün, Türkiye standardı, ama emin olmak için kontrol gerekebilir).
- 4WA = Son 4 hafta dahil bugün (TW dahil) = 28 gün toplam, sonra `/4` ile haftalık ortalama.
- Tek truth source — yapısı sayesinde RakipAnaliz'de **`reporting_periods` table** olarak modellenmeli (period_type, start_date, end_date, label).

### Doğal genişleme (RakipAnaliz için)

| Code | Anlam | Hesaplama |
|------|-------|-----------|
| TW | This Week | Pazartesi - Pazar (current) |
| LW | Last Week | TW - 7 gün |
| L4W | Last 4 Weeks | TW dahil son 4 hafta toplam |
| 4WA | 4 Week Avg | L4W / 4 |
| L13W | Last 13 Weeks | TW dahil son 13 hafta (çeyrek) |
| L52W | Last 52 Weeks | TW dahil son 52 hafta (yıl) |
| MTD | Month-to-Date | Ayın 1'i → bugün |
| QTD | Quarter-to-Date | Çeyrek başı → bugün |
| YTD | Year-to-Date | Yıl başı → bugün |
| LM | Last Month | Önceki ayın 1'i → son günü |
| LY | Last Year | Geçen yılın aynı periyodu |
| YoY | Year-over-Year | TW / Aynı hafta geçen yıl × 100 |
| MoM | Month-over-Month | Bu ay / Önceki ay × 100 |
| Custom | Custom range | Kullanıcı tarih seçimi |

> RakipAnaliz `reporting_periods` tablosu enum yerine **derived view** ile çalışmalı — manuel entry her zaman tek hafta scope'unda yapılır, periyot view-layer'da type'a göre aggregate eder.

---

## 5. Reconciliation Sheet

`_Reconciliation` sheet'i 9 kolonlu generic bir audit log:
| section | channel | metric | timeframe | expected | actual | diff | severity | note |

Şu anda tek satır mevcut: `_Unknown_GA4_Sources` mapping uyarısı. Tasarımı multi-row için yapılmış ama henüz **GA4 vs Adjust cross-check satırları yok**. Yani Bi'Talih şu an bunları sistematik çapraz-doğrulamıyor — **RakipAnaliz'de bunu büyük bir özellik haline getirmek mantıklı.**

### Bi'Talih'in attribution philosophy'si (Excel'den çıkarsanan)

- **GA4 bloğu** = web trafik + web kaynaklı conversions (sign-up, purchase, revenue).
- **Adjust bloğu** = mobile app trafik + app conversions.
- **Çakışma yok** — GA4 web'i, Adjust mobile'ı kapsar; aynı user her iki blokta da görünebilir ama "double count" değildir, çünkü farklı device/touchpoint'lerden ölçülür.
- Tek paylaşılan veri: **SPEND** — `SM_Ads_Raw` her iki blokta aynı kaynaktan (genelde Supermetrics ad-platform connector'larından) çekiliyor. Yani ROAS/CPP/CPS ad spend açısından double-counted **değil** ama revenue iki ayrı channel grubundan toplanıyor.

> **Açık soru (Bi'Talih ekibine):** Mobile web trafiği (kullanıcı telefon Safari/Chrome ile siteye gelmiş) hangi blokta? GA4 mobile-web sayar mı, sayar (cihaz tipi = mobile, ama medium = web). Adjust **app installs**'a odaklı — overlap yok. Doğrulanmalı.

---

## 6. W16 / W17 Snapshot Mantığı

| Sheet | Row 6 formula sayısı | Row 6 statik sayısı | Yorum |
|-------|----------------------|----------------------|-------|
| Master_Metric_Table | 52 | 0 | Tamamen canlı (değişken `_Config` referansları) |
| W16_2026-04-13 | 30 | 1 | Yarı-canlı — bazı yerler düzeltilmiş, çoğu hâlâ formula |
| W17_2026-04-20 | 0 | 52 | **Tamamen donmuş** — değer olarak yapıştırılmış |

**Pattern:**
- Hafta başında `Master_Metric_Table` o haftayı yansıtır.
- Hafta kapanırken (TW → LW geçişi öncesi) **Master tablo "Save As Values" yapılarak `W{N}_{date}` arşiv sheet'ine donmuş kopya olarak alınır.**
- Sonraki haftaya geçildiğinde `_Config` güncellenir, Master canlı olarak yeni hafta için yeniden hesaplar.
- W16 yarı-canlı → muhtemelen "snapshot alındı ama bazı hücreler manuel revize edildi" durumu.

> **RakipAnaliz çevirisi:** "Week Close" eylemi → tüm hesaplanmış değerleri `weekly_snapshots` table'ında **immutable** olarak persist et. Sonradan raw veri değişse bile snapshot değişmez (audit + AI conversation tutarlılığı için kritik).

---

## 7. Raw Sheet Şemaları (özet)

| Sheet | Date | Boyut | Granular | Kolonlar |
|-------|------|-------|----------|----------|
| `SM_Ads_Raw` | günlük | 1109×5 | Date × Platform | `Date, Platform, Impressions, Clicks, Spend` |
| `SM_Adjust_Raw` | günlük | 2053×10 | Date × Channel × Category × OS | `Date, Channel, Category, OS, Installs, Sessions, Impressions, Sign Ups, Purchases, Revenue` |
| `SM_GA4_Raw` | günlük | 2260×8 | Date × Source/Medium × Category | `Date, Source/Medium, Category, Sessions, Total Users, Sign Ups, Purchases, Revenue` |
| `SM_GA4_Weekly_Users` | **haftalık** | 1000×4 | Week_Start × Source/Medium × Category | `Week_Start, Source/Medium, Category, Total Users` |
| `ADJ_Events_Raw` | günlük | 1707×6 | Date × Network × OS × Category | `Date, Network, OS, Category, Purchase, Signup` |

**Önemli notlar:**
- `Category` sütunları çoğu raw sheet'te `VLOOKUP` formula ile mapping sheet'ten doldurulmuş (`__xludf.DUMMYFUNCTION` placeholder + statik fallback).
- `SM_GA4_Weekly_Users` özel — günlük unique user toplanamaz (cookie-based). Bu yüzden **haftalık ayrı pull** yapılıyor ve "TOTAL" satırı manuel olarak ekleniyor.
- `Currency`: Excel'de **explicit currency converter yok**. Spend muhtemelen USD (Supermetrics default), Revenue TRY. RakipAnaliz'de mutlaka snapshot kuru saklanmalı.
- **Eksik tarihler:** `SM_Ads_Raw` 28 gün (3/30 - 4/26) — eksik gün yok.
- `OS` sütunu Adjust'ta `android`, `ios`, `android-tv`, `windows` gibi değerler içerir — `android-tv` gibi edge case'ler mevcut.

---

## 8. Bi'Talih Domain İlginç Bulgular

### Database_W (Pazar Payı)
- Bi'Talih dış pazarda **5 vertical** ile rekabet ediyor:
  1. **TJK At Yarışı** (M = Müşterek bahis, F = Fixed-odds, ayrıca Saha/% ekstra metric)
  2. **Kazı Kazan**
  3. **Sanal Bahis**
  4. **Milli Piyango**
  5. **Sanal At Yarışı**
- Her vertical için 4 metric setı: USER, OYNANAN (volume), KAZANAN (winner amount), RTP (return-to-player), Ort. Oyuncu Başına Bahis.
- Bu sheet **pazar payı / sektör benchmark** verisi — muhtemelen MPİ veya başka regülatörden alınan dış veri. RakipAnaliz'de **ayrı bir "Sektör Benchmark" sayfası** olabilir.

### Weekly Growth (CRM Channels)
Bu sheet **ad attribution değil, CRM communication tracking**'tir:
- Çoklu sub-tables: PUSH, SMS, POPUP, STORYLY, BANNER (her biri 5-7 kolon: gönderim, açılma %, tetikleme % vs.)
- Hazır Kuponlar (HK), HOHK kampanya bazında
- Çark/Promo aktivitesi (Tarih, İletişim Adedi, Çark Tetikleme, Kupon Kodu Kullanım, Promo Kod Tutarı)

> **Karar noktası:** RakipAnaliz MVP'de bu CRM tracking ayrı bir sayfa (`/crm-channels`) olarak ele alınmalı mı, yoksa scope dışı mı? Öneri: **MVP'de scope dışı, P1'de modüler ekle.**

---

## 9. Özellik Kataloğu (40+ Fikir)

> Her özellik: gerekçe (data ile mümkün mü?) + Bi'Talih'e değeri + MVP karmaşıklığı (S=küçük, M=orta, L=büyük) + teknik not.

### A. Data Entry & Yönetim

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| A1 | **Structured weekly entry form** (channel × metric matrix) | Manuel | Excel manuel doldurmaktan kurtulma | M | React Hook Form + zod validation; channel listesi master mapping'ten dinamik |
| A2 | **Excel paste import** (clipboard'dan tablo yapıştır) | Manuel | Excel'den geçişi cellulerden okuma + parse | M | Tab-separated paste, kolonları otomatik mapla |
| A3 | **CSV/XLSX file upload** (raw sheet upload + auto-aggregate) | `SM_*_Raw` benzeri | Supermetrics CSV export'unu tek dosya ile import | L | Per-sheet schema validator, dry-run preview |
| A4 | **Inline cell edit** (dashboard'da hücreye tıklayıp güncelle) | Manuel | Hızlı düzeltme | M | Optimistic update + audit log |
| A5 | **Validation: zorunlu alanlar + outlier uyarısı** | Schema | "CR > %50 — emin misiniz?" | S | Zod + threshold check |
| A6 | **Eksik veri uyarısı** (channel × metric matrisinde boş hücre listesi) | Schema diff | Bir channel'i unutma riskini sıfırlar | S | View-time check + dashboard banner |
| A7 | **Bulk edit / geçmiş hafta düzeltme** (W14 retroaktif düzeltme) | DB | Excel'in kaybedilen audit'ini geri kazandırır | M | Soft-versioning, snapshot lock + override flow |
| A8 | **Audit log** (kim, ne zaman, hangi hücre, eski/yeni değer) | DB events | Compliance + forensics | S | Generic event_log table |
| A9 | **Auto-save / draft mode** (girerken kaydetme + commit) | DB | "Yanlış kaydettim" stresini kaldırır | S | Local draft + explicit commit |
| A10 | **Week close / freeze action** | DB snapshot | W17 pattern'i — snapshot immutable | M | `weekly_snapshots` table copy-on-close |

### B. Period Views

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| B1 | **Haftalık view** (Excel Master_Metric_Table replikası) | Weekly entries | MVP — Excel'in birebir replikası | M | `useState` ile period selector |
| B2 | **Aylık aggregation** (4-5 hafta sum/avg) | Weekly entries → SQL aggregate | MTD takibi | M | Materialized view (`monthly_metrics`) |
| B3 | **Yıllık view** (52 hafta) | Weekly entries → SQL | Stratejik karar | M | `yearly_metrics` materialized view |
| B4 | **TW vs LW vs 4WA matrix** (Excel default) | Calculated | Mevcut workflow | S | View-layer transform |
| B5 | **TW vs LY (Year-over-Year)** | Geçen yıl haftası | "Bu yıl daha mı iyi?" | M | Date arithmetic + comparison view |
| B6 | **MTD / QTD / YTD karşılaştırma** | Aggregate | Stratejik raporlar | M | Period-aware aggregator |
| B7 | **Custom date range** (kullanıcı serbest seçim) | Aggregate | Ad-hoc analiz | M | Date picker + dynamic SUMIFS |
| B8 | **Period comparison preset'leri** ("Bu ay vs Geçen ay", "Q1 vs Q4") | Aggregate | Hızlı tıklama | S | Preset config |
| B9 | **L52W trend** (rolling year — önemli görsel) | Weekly entries | Seasonality yakalar | M | 52-row chart |

### C. Karşılaştırmalı Analizler

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| C1 | **TW vs LW vs 4WA vs LY 4'lü matris** | Calculated | Excel'i aşan zenginlik | M | View-layer table |
| C2 | **Channel A vs Channel B head-to-head** (radar chart) | Per-channel metrics | "Google vs Meta — hangi daha iyi?" | M | Radar component (Recharts) |
| C3 | **Paid vs Unpaid mix** (donut + trend) | Segment-level aggregate | Paid bağımlılık ölçümü | S | Donut chart |
| C4 | **GA4 vs Adjust reconciliation matrisi** | Two-source compare | Excel'de henüz yok — büyük değer | M | Diff table + tolerance config |
| C5 | **Cohort progression** (Hafta N cohort'unun sonraki 4 haftası) | Time-shifted aggregate | Retention / LTV yaklaşımı | L | Cohort matrix view (cumulative) |
| C6 | **Channel mix değişim haritası** (last 4 weeks share değişimi) | Calculated | Trend dedektörü | M | Stacked area chart |
| C7 | **Vertical karşılaştırma** (TJK vs Kazı Kazan vs Sanal Bahis) | `Database_W` benzeri | Bi'Talih'in mevcut Database_W mantığı | M | Ayrı sayfa |
| C8 | **Best/worst week tablosu** (her metric için top-3) | Aggregate + rank | Anomali içgörüsü | S | ORDER BY query |

### D. Drill-down & Dimension

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| D1 | **Channel → Source/Medium decomposition** | Mapping table | "Google Ads içinde hangi campaign?" | M | Mapping editor + drill-down panel |
| D2 | **Funnel: USER → SESSION → SIGN UP → PURCHASE → REVENUE** | All metrics | Her channel için conversion görsel | M | Funnel chart per channel |
| D3 | **Funnel drop-off pinpointing** | Calculated | "Sign-up'dan purchase'a en çok kaybeden channel" | M | Step-by-step % delta highlight |
| D4 | **Geo breakdown** | Şu an raw'da yok — ek field gerekir | Bölgesel marketing | L | Schema extension; entry'de geo kolonu |
| D5 | **Device breakdown** (mobile/desktop/tablet) | GA4 dimension | Mobile-first karar | L | GA4 raw'da yok şu an, eklenebilir |
| D6 | **Campaign-level breakdown** | Şu an yok | Campaign A/B karşılaştırması | L | Schema extension |
| D7 | **OS breakdown** (Adjust'ta var) | `SM_Adjust_Raw.OS` | iOS vs Android performans | S | Filter chip |

### E. Anomali & Alert

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| E1 | **Threshold-based alert** (`delta > %15` ⇒ flag) | Per-cell delta | Hızlı dikkat çekme | S | Per-metric threshold config |
| E2 | **Statistical alert** (z-score over rolling 4 weeks) | Per-channel time-series | "Normal varyans aşıldı" | M | rolling stddev hesaplama |
| E3 | **Multi-metric correlation** ("CR ↓ AND CPC ↑ = sorun") | 2+ metric AND | Hesap sorunu yakalar | M | Rule engine (DSL) |
| E4 | **AI anomali nedeni hipotezi** | DeepSeek + context | "Neden Meta CR düştü?" hipotez | M | AI prompt template + structured input |
| E5 | **Trend reversal detection** (4 hafta düşüşten sonra ilk artış) | Time-series analysis | Kampanya etki ölçümü | M | Pattern detection |
| E6 | **Anomaly heatmap** (channel × metric × week, sapma renk) | Cross-tabulation | Hızlı görsel tarama | M | Heatmap chart |

### F. Forecasting

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| F1 | **Linear trend extrapolation** (next 4 weeks) | Last 12 weeks | Naive forecast | S | Linear regression in JS |
| F2 | **EMA / weighted MA** | Last N weeks | Daha hassas | S | EMA hesaplama |
| F3 | **Seasonality detection** (DoW, ay-içi pattern) | 1+ yıl data | Ramazan/yılbaşı gibi etki | L | STL decomposition (Python helper) |
| F4 | **Goal tracking** (haftalık SIGN_UP hedefi vs gerçekleşen) | DB goals + actual | "Hedefte miyiz?" panel | M | Goals table + progress bar |
| F5 | **Channel saturation detection** (spend ↑ ama CR ↓) | Spend × CR scatter | Marginal CAC sinyali | M | Scatter + correlation |

### G. Attribution & Channel Mix

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| G1 | **ROI ranking** (ROAS bazlı channel sıralama) | Calculated | Spend optimization karar | S | ORDER BY ROAS DESC |
| G2 | **Marginal CAC analysis** (incremental spend → incremental signup) | Time-series regression | Hangi channel'a daha çok harcanmalı | L | Regression model |
| G3 | **Channel attribution diff (GA4 vs Adjust)** | Cross-source | Web vs mobile last-click farkı | M | Side-by-side compare |
| G4 | **Channel cannibalisation detection** (TikTok ↑, X ↓ aynı dönem) | Time-series correlation | Aynı audience over-targeting | L | Pearson correlation + AI |

### H. AI Use Cases (DeepSeek mevcut)

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| H1 | **Haftalık özet yorumu** | All weekly metrics | Otomatik raporlama | S | Prompt template + structured input |
| H2 | **"Bu hafta neden Meta CR düştü?" doğal dil sorgusu** | Specific cell context | Self-service analytics | M | Context-aware AI agent + tool calls |
| H3 | **Tavsiye üretimi** ("Google Ads spend +%20") | All metrics + benchmarks | Action-oriented insight | M | Recommendation prompt + guard rails |
| H4 | **Multi-week trend yorumu** | Time-series | Stratejik narrative | S | Sliding window prompt |
| H5 | **Channel cannibalisation yorum** | Correlation + AI | Hipotez üretimi | M | Pattern + AI explanation |
| H6 | **Slack/email digest** (haftalık AI özet otomatik gönderim) | AI output + cron | Pasif consumption | M | Webhook + scheduler |
| H7 | **AI-driven goal suggestion** ("Geçen yıl bu haftada X yaptık, hedef Y olsun") | LY data + AI | Hedef kalibrasyonu | M | Forecast + prompt |
| H8 | **Custom alert mesajları** (AI-yazılmış neden + öneri) | Anomaly + AI | Sıkıcı threshold mesajından kurtulma | S | Alert pipeline'a AI ekle |

### I. Visualization & UX

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| I1 | **Excel-style matrix view** (Master_Metric_Table replika) | Calculated | Mevcut zihinsel modele uyum | M | Virtualized table (TanStack Table) |
| I2 | **Card-based dashboard** (Pixel design) | Per-metric kart | Yöneticiye glance view | M | Card grid + sparkline |
| I3 | **Heatmap** (channel × metric, renk kodu) | Calculated | Anomali görsel tarama | M | D3 / Recharts heatmap |
| I4 | **Time-series chart** (her metric için) | Weekly entries | Trend görsel | S | Recharts LineChart |
| I5 | **Sankey** (channel → conversion flow) | Funnel data | Attribution görsel | L | D3 Sankey |
| I6 | **Treemap** (channel revenue share) | Aggregate | Pareto görsel | M | Recharts Treemap |
| I7 | **Drill-down panels** (hücreye tıklayınca raw veri) | Raw data join | Excel'i aşan derinlik | M | Modal/side-panel |
| I8 | **Theme: Pixel / dark / JetBrains Mono** | UI | Kullanıcı kimliği | S | Tailwind config + global theme |

### J. Integration İleri Adımlar

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| J1 | **Supermetrics API auto-sync** | Supermetrics REST | Manuel entry'yi azalt | L | Scheduled job + dedup |
| J2 | **Direkt GA4 Data API** | GA4 API | Supermetrics atlanır | L | Service account + property ID |
| J3 | **Direkt Adjust API** | Adjust KPI Service | Aynı | L | API token + reports |
| J4 | **Google Ads API** | GAQL | Spend/click/impression direct | L | OAuth + customer ID |
| J5 | **Meta Ads / TikTok / X / Taboola APIs** | Per-platform | Tek-tek entegrasyon | L | Provider abstraction |
| J6 | **Sync conflict resolution** (manuel vs API) | Versioning | Kim source-of-truth? | M | Per-row source flag |
| J7 | **Hybrid mode** (API var → otomatik, yok → manuel) | Per-channel config | Kademeli geçiş | M | Channel config table |

### K. Mapping Yönetimi

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| K1 | **Channel mapping admin UI** (529 + 107 satır editable) | `mapping` table | Excel mapping'i UI'ye taşı | M | CRUD + import/export |
| K2 | **"Unknown source" review queue** | Diff vs raw | _Unknown_*'in UI versiyonu | S | Filter + bulk-assign |
| K3 | **Bulk reclassification** ("Display Ads içindeki 332 satırı 5 alt-segmente böl") | Mapping ops | Mevcut Excel'in zayıf yanı | M | Multi-select + assign |
| K4 | **Mapping version history** (mapping değişti, eski rapor nasıl etkilendi?) | Versioned mapping | Audit + replay | L | Mapping history table |
| K5 | **Mapping suggestion AI** (yeni `(other) / (other)` görünce öneri) | AI + mapping rules | Manuel yükü azaltır | M | Pattern matcher + AI |

### L. Export & Sharing

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| L1 | **PDF rapor** (haftalık özet) | Calculated | E-posta/yönetim sunumu | M | Puppeteer PDF render |
| L2 | **Excel export** (Master_Metric_Table birebir kopya) | Calculated | Excel-uyumlu çıktı | M | ExcelJS / xlsx |
| L3 | **Slack haftalık digest** | Calculated + AI | Pasif consumption | M | Slack webhook |
| L4 | **Public/internal link sharing** | DB share token | Hızlı kollaboration | M | Share token table + access control |
| L5 | **Embed in Notion/Confluence** | Iframe-friendly view | Doc workflow | S | URL parametre + read-only mode |

### M. Multi-Property / Multi-Brand

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| M1 | **Multi-brand support** (Bi'Talih + Sondüzlük + diğer) | DB property scope | Şirket genişlerse kritik | L | `properties` table + tenant isolation |
| M2 | **Cross-property comparison** | Aggregate across properties | Stratejik karar | M | Multi-tenant aware view |
| M3 | **Per-property mapping** (her brand'in kendi channel mapping'i) | Property-scoped mapping | Esneklik | M | Mapping FK to property |

### N. Quality / Compliance

| # | Özellik | Data Source | Bi'Talih Değer | Karmaşıklık | Teknik Not |
|---|---------|-------------|-----------------|-------------|-----------|
| N1 | **Veri gecikme uyarısı** ("GA4 24-48h, son veri 2 gün önce") | Per-source timestamp | "Bu rapor güncel mi?" şüphesini kaldırır | S | Source last-update timestamp |
| N2 | **Currency conversion snapshot** (USD→TRY haftalık kur) | TCMB API + DB | Spend USD, revenue TRY → tek para birimi | M | Daily FX cache |
| N3 | **Data lineage** ("Bu ROAS hangi raw'dan?") | Schema metadata | Debugging + AI explainability | M | Cell → source mapping |
| N4 | **GDPR / data retention** (X gün sonra raw silme) | Cron + policy | Compliance | S | Retention config + scheduled job |
| N5 | **Per-user permissions** (sadece-okunur, sadece kendi channel'ı vs) | DB ACL | Yönetim hiyerarşisi | M | Role-based access |
| N6 | **Hesaplama formülü görüntüleme** ("Bu hücre nasıl hesaplandı?") | Schema metadata | Trust + onboarding | S | Tooltip with formula |

---

## 10. Önerilen MVP Scope (8-12 özellik)

> **Hedef:** İlk 4-6 hafta. Bi'Talih ekibinin Excel'den geçişini sağlayacak minimum.

| # | Özellik | Neden MVP? |
|---|---------|------------|
| 1 | **A1: Structured weekly entry form** | Olmazsa olmaz — veri girişi |
| 2 | **A2: Excel paste import** | Geçiş dönemi — Excel'den copy-paste önemli |
| 3 | **A8: Audit log** | Manuel entry'de kim ne yaptı kritik |
| 4 | **A10: Week close / freeze** | W17 pattern'i — snapshot immutability |
| 5 | **B1: Haftalık view (Master_Metric_Table replika)** | Mevcut workflow uyumu |
| 6 | **B4: TW vs LW vs 4WA matrix** | Excel default davranışı |
| 7 | **C3: Paid vs Unpaid mix** | Yöneticinin ilk baktığı şey |
| 8 | **C4: GA4 vs Adjust reconciliation** | Excel'de yok — değer katar |
| 9 | **E1: Threshold-based alert** | Hızlı kazanç, basit kural |
| 10 | **H1: AI haftalık özet** | DeepSeek mevcut → düşük marjinal maliyet |
| 11 | **K1+K2: Mapping admin UI + Unknown queue** | Excel'in en zayıf yanı |
| 12 | **L2: Excel export** | Geçiş dönemi güvencesi (eski sunum formatı) |

**Kapsam dışı (MVP'de yapılmayacak ama P1'de):** Aylık/yıllık view (B2, B3 — MVP haftalık yeterli), forecasting (F*), API integrations (J*), AI cross-cannibal (G4), multi-property (M*).

---

## 11. Önerilen MySQL Data Model (Taslak)

> 5 ana tablo + 3 yardımcı. **Manuel entry + AI consumption** odaklı.

```sql
-- 1. Periyot konfigürasyonu (Excel _Config karşılığı)
CREATE TABLE reporting_periods (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT NOT NULL,            -- multi-tenant hazır
  period_type     ENUM('TW','LW','4WA','MTD','QTD','YTD','LY','LM','L52W','CUSTOM') NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  label           VARCHAR(255),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (property_id, period_type, start_date)
);

-- 2. Channel mapping (Excel GA4_Medium_Grouping + Adjust_Medium_Grouping birleşik)
CREATE TABLE channel_mappings (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT NOT NULL,
  source_system   ENUM('GA4','ADJUST') NOT NULL,
  source_key      VARCHAR(255) NOT NULL,       -- e.g. "google / cpc" veya "App Samurai"
  segment         ENUM('Paid','Unpaid','Other') NOT NULL,
  category        VARCHAR(100) NOT NULL,        -- e.g. "Google Ads"
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (property_id, source_system, source_key)
);

-- 3. Haftalık channel-level metrics (ana entry tablosu — manuel veya API)
-- Her satır: 1 hafta × 1 attribution kaynağı × 1 channel
CREATE TABLE weekly_channel_metrics (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT NOT NULL,
  week_start      DATE NOT NULL,                -- Pazartesi
  source_system   ENUM('GA4','ADJUST') NOT NULL,
  segment         ENUM('Paid','Unpaid','Other','TOTAL') NOT NULL,
  category        VARCHAR(100) NOT NULL,         -- e.g. "Google Ads", "Meta Ads", "TOTAL"
  os              ENUM('android','ios','web','total') DEFAULT 'total',  -- Adjust için

  -- Raw aditif metric'ler (NULL = girilmemiş, 0 = sıfır gerçek değer)
  users           BIGINT,           -- GA4 unique user (haftalık, sum'lanamaz)
  installs        BIGINT,           -- Adjust installs
  sessions        BIGINT,
  impressions     BIGINT,
  clicks          BIGINT,
  signups         BIGINT,
  purchases       BIGINT,
  revenue_try     DECIMAL(18,2),     -- TRY
  spend_usd       DECIMAL(18,4),     -- USD (orijinal)
  spend_try       DECIMAL(18,2),     -- USD * snapshot kuru

  -- Kur snapshot
  fx_usd_try      DECIMAL(10,4),

  -- Veri kaynağı
  data_source     ENUM('manual','csv_import','api') DEFAULT 'manual',
  source_ref      VARCHAR(255),       -- API run_id veya CSV file_id
  entered_by      BIGINT,             -- user_id
  entered_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_metric (property_id, week_start, source_system, category, os),
  INDEX idx_lookup (property_id, week_start, category)
);

-- Ratio metric'ler (CR, CPC, CPM, ROAS, CPS, CPP) STORE EDİLMEZ — view-time hesaplanır.
-- Çünkü channel-level sum'larda ratio yanlış sonuç verir.

-- 4. Haftalık snapshot (week-close ile dondurulan immutable kopya)
CREATE TABLE weekly_snapshots (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT NOT NULL,
  week_start      DATE NOT NULL,
  snapshot_data   JSON NOT NULL,        -- Tüm hesaplanmış matrisin donmuş hali
  closed_by       BIGINT,
  closed_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reopened_at     TIMESTAMP NULL,       -- soft-undo için
  UNIQUE KEY (property_id, week_start)
);

-- 5. Audit log (her değişiklik)
CREATE TABLE metric_audit_log (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT NOT NULL,
  user_id         BIGINT,
  action          ENUM('insert','update','delete','close','reopen'),
  table_name      VARCHAR(100),
  record_id       BIGINT,
  field_name      VARCHAR(100),
  old_value       TEXT,
  new_value       TEXT,
  reason          TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_record (table_name, record_id),
  INDEX idx_time (created_at)
);

-- Yardımcı tablolar:

-- 6. Bilinmeyen kaynak queue (_Unknown_GA4_Sources / _Unknown_Adjust_Networks)
CREATE TABLE unmapped_sources (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT NOT NULL,
  source_system   ENUM('GA4','ADJUST') NOT NULL,
  source_key      VARCHAR(255) NOT NULL,
  first_seen      DATE NOT NULL,
  last_seen       DATE NOT NULL,
  occurrence_count BIGINT DEFAULT 1,
  status          ENUM('pending','mapped','ignored') DEFAULT 'pending',
  resolved_to_mapping_id BIGINT,
  UNIQUE KEY (property_id, source_system, source_key)
);

-- 7. Hedefler (goal tracking)
CREATE TABLE channel_goals (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT NOT NULL,
  channel         VARCHAR(100),         -- NULL = TOTAL
  metric          VARCHAR(50) NOT NULL, -- "signups", "revenue_try" vs
  period_type     ENUM('weekly','monthly','quarterly','yearly'),
  start_date      DATE NOT NULL,
  target_value    DECIMAL(18,2) NOT NULL,
  notes           TEXT
);

-- 8. AI conversation context
CREATE TABLE ai_conversations (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT,
  user_id         BIGINT,
  question        TEXT,
  context_json    JSON,                 -- Hangi metric'ler context'e gönderildi
  response        TEXT,
  model           VARCHAR(50),          -- 'deepseek-v3' vs
  tokens_in       INT,
  tokens_out      INT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Hesaplama view örneği (CR — view-time, NOT stored)

```sql
-- Channel-level CR (PURCHASE / SESSIONS) — GA4 bloğu için
SELECT
  category,
  SUM(purchases) AS purchases,
  SUM(sessions)  AS sessions,
  CASE WHEN SUM(sessions) > 0 THEN SUM(purchases) / SUM(sessions) ELSE NULL END AS cr
FROM weekly_channel_metrics
WHERE property_id = ?
  AND source_system = 'GA4'
  AND week_start = ?
GROUP BY category;
```

### Indeks hesaplama (LW idx)

```sql
-- TW / LW × 100
WITH tw AS (SELECT category, SUM(purchases) p, SUM(sessions) s FROM weekly_channel_metrics WHERE week_start = '2026-04-20' GROUP BY category),
     lw AS (SELECT category, SUM(purchases) p, SUM(sessions) s FROM weekly_channel_metrics WHERE week_start = '2026-04-13' GROUP BY category)
SELECT
  tw.category,
  (tw.p / NULLIF(tw.s,0))                                      AS tw_cr,
  (lw.p / NULLIF(lw.s,0))                                      AS lw_cr,
  ((tw.p / NULLIF(tw.s,0)) / NULLIF(lw.p / NULLIF(lw.s,0),0)) * 100 AS lw_idx
FROM tw LEFT JOIN lw USING (category);
```

---

## 12. Açık Sorular (Bi'Talih Ekibine Yöneltilecek)

| # | Soru | Neden önemli? |
|---|------|----------------|
| Q1 | **CR formülü = `Purchase / Sessions` mi yoksa `Purchase / Users` mi?** Excel formülü `Purchase/Sessions` gösteriyor (G/D `SM_GA4_Raw`'da) ama "Conversion Rate" geleneksel olarak `signups/users` da olabilir. Doğrulanmalı. | Bu metric'in tanımı tüm dashboard'da temel. |
| Q2 | **Spend birimi USD mi TRY mi?** `SM_Ads_Raw.E (Spend)` Excel'de explicit currency yok. Supermetrics defaultu USD. Revenue TRY olduğuna göre **ROAS = TRY revenue / USD spend** = anlamsız çıkar. Ya spend de TRY (Supermetrics'te dönüştürülmüş), ya rapor ROAS yanlış. | ROAS güvenilirliği. |
| Q3 | **Hafta tanımı: Pazartesi-Pazar mı?** `_Config!B2 = 2026-04-20 (Mon)` → `C2 = 2026-04-26 (Sun)` ⇒ Pzt-Paz görünüyor. Doğrulansın. | Period boundaries. |
| Q4 | **Mobile-web hangi blokta?** Telefon Safari'den siteye giren kullanıcı GA4 mobile-web olarak sayılıyor mu, Adjust install yoksa Adjust'ta hiç yok mu? | Çakışma kontrolü. |
| Q5 | **`Display Ads` 332 satır mapping'te neden bu kadar büyük?** Bunlar gerçekten Display Ads mı yoksa "fallback bucket" mı? | Mapping kalitesi. |
| Q6 | **`SM_GA4_Weekly_Users.TOTAL` satırı manuel mi auto mu?** Eğer manuel ise RakipAnaliz'de form'da ayrı alan; auto ise GA4 API'den ayrı pull. | Schema design. |
| Q7 | **W16 yarı-canlı, W17 donmuş — fark nereden?** Manuel "Save As Values" mı yapılıyor, yoksa periyot geçince Master otomatik mi snapshot alıyor? | Week-close UX. |
| Q8 | **Adjust bloğunda CPM neden boş?** Adjust impression × ad spend birleşmiyor (cross-source hatası mı, kasıtlı mı?). | Hesaplama tutarlılığı. |
| Q9 | **`Weekly Growth` sheet'i (CRM channels — PUSH/SMS/POPUP/STORYLY/BANNER) MVP scope'da mı?** Ad attribution değil, CRM communication tracking. | Scope karar. |
| Q10 | **`Database_W` (Pazar Payı) verisi nereden geliyor?** İçeride hesaplanmıyor — dış kaynak (regulator? rakip izleme?). RakipAnaliz'de saklanacak mı? | Vertical benchmark scope. |
| Q11 | **GA4 SIGN_UP eventi `sign_up` mı, custom event mi?** `SM_GA4_Raw.F` adı `Sign Ups (sign_up)` — GA4 standard event'inden çekiliyor görünüyor. | Event taxonomy. |
| Q12 | **PURCHASE = unique transaction count mı, kupon adedi mi?** GA4 raw'da row 3'te 18770 purchase + 10M revenue var. 18770 ortalama 535 TRY/satım = mantıklı (kupon başı). Ama kullanıcı ≠ purchase. | Funnel doğruluğu. |
| Q13 | **Multi-property planı var mı?** Bi'Talih + Sondüzlük + ileride başka brand? Schema'yı `property_id` ile tasarlamak şimdiden işe yarar. | Schema future-proofing. |
| Q14 | **Audit log retention süresi?** Ne kadar geçmiş tutulmalı (1 yıl, sonsuz)? | Compliance + DB boyutu. |
| Q15 | **AI chat'in context window bütçesi?** DeepSeek prompt'a ne kadar metric data sığabilir — full year vs son 4 hafta? | AI prompt design. |

---

## Ekler

### Ek A — Channel listesi (Master_Metric_Table'dan literal)

**GA4 bloğu:**
- Paid: Google Ads, Meta Ads, ASA, Native Content Ads, X Ads, Display Ads, TikTok Ads
- Unpaid: Direct, App Store (Android), Organic Search, Organic Social, In-App, Referral, SMS, Internal Campaign, Direct/Other, Other

**Adjust bloğu:**
- Paid: Google Ads, Meta Ads, X Ads, TikTok Ads, ASA, Native Content Ads, App Samurai, Avow, Affiliate
- Unpaid: Organic Search, SMS, Push, In-App, Other

> Toplam unique channel: 22 (bazıları her iki blokta var).

### Ek B — Vertical listesi (Database_W)

- TJK At Yarışı (M = Müşterek, F = Fixed-odds, ayrıca Saha/% sub-metric)
- Kazı Kazan
- Sanal Bahis
- Milli Piyango
- Sanal At Yarışı

### Ek C — Bi'Talih için RakipAnaliz dashboard sayfa hiyerarşisi (öneri)

```
/dashboard
  ├── /weekly                  ← MVP haftalık view (Master_Metric_Table replika)
  ├── /entry                   ← Manuel haftalık entry formu
  ├── /channels
  │   ├── /:channel            ← Channel deep-dive (drill-down + funnel)
  │   └── /compare             ← Channel vs Channel
  ├── /attribution             ← GA4 vs Adjust reconciliation
  ├── /alerts                  ← Anomali listesi + threshold config
  ├── /forecasts               ← (P1) trend + goal tracking
  ├── /ai-chat                 ← DeepSeek chat (context-aware)
  ├── /admin
  │   ├── /mapping             ← Channel mapping CRUD + unknown queue
  │   ├── /goals               ← Goal targets
  │   ├── /audit               ← Audit log viewer
  │   └── /sources             ← (P1) API connectors
  └── /reports
      ├── /weekly-pdf
      ├── /excel-export
      └── /slack-digest
```
