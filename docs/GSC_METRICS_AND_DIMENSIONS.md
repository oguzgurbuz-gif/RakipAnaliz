# Google Search Console (GSC) — Metrikler & Boyutlar Referans Dokümanı

> **Amaç:** Bi'Talih projesi için GSC API'den çekilebilecek **tüm veri tipini, boyutu, metriği, filtresini ve kısıtı** tek bir referansta toplamak. Bu doküman entegrasyon kararları için tek doğruluk kaynağıdır.
>
> **Tarih:** 2026-04-27 · **Hedef API:** Search Console API v1 (mevcut) + Webmasters v3 (legacy alias)
>
> **Önemli not:** GSC sadece **kendi doğrulanmış mülkleriniz** için çalışır. Rakipler için ayrı kaynaklar (DataForSEO/SEMrush/SimilarWeb) gerekir — bkz. §12.

---

## İçindekiler

1. [Genel Bakış](#1-genel-bakış)
2. [Search Analytics — Boyutlar (Dimensions)](#2-search-analytics--boyutlar-dimensions)
3. [Search Analytics — Metrikler (Metrics)](#3-search-analytics--metrikler-metrics)
4. [Search Type (filter, dimension değil)](#4-search-type-filter-dimension-değil)
5. [Aggregation Type](#5-aggregation-type)
6. [Filtreler (dimensionFilterGroups)](#6-filtreler-dimensionfiltergroups)
7. [Sitemaps API](#7-sitemaps-api)
8. [URL Inspection API](#8-url-inspection-api)
9. [Quotas & Limitler](#9-quotas--limitler)
10. [Sampling / Suppression / Anonymized Queries](#10-sampling--suppression--anonymized-queries)
11. [Bi'Talih için Önerilen Sorgu Kalıpları](#11-bitalih-için-önerilen-sorgu-kalıpları)
12. [Rakip Tarafı Sınırlılığı](#12-rakip-tarafı-sınırlılığı)
13. [Bilinen Sorunlar / Kısıtlar](#13-bilinen-sorunlar--kısıtlar)
14. [Referanslar](#14-referanslar)

---

## 1. Genel Bakış

### 1.1 API Sürümleri

| Sürüm | Durum | Base URL |
|-------|-------|----------|
| **Search Console API v1** (current) | Aktif, önerilen | `https://searchconsole.googleapis.com/v1` |
| **Webmasters API v3** (legacy alias) | Aktif fakat eski isim | `https://www.googleapis.com/webmasters/v3` |

**Pratik durum:** Çoğu Sites/Sitemaps/SearchAnalytics endpoint'i hâlâ `webmasters/v3` path'inde dönüyor (Google bunu legacy uyumluluk için koruyor). URL Inspection ise yalnızca yeni `searchconsole/v1` üzerinden çağrılır. Discovery dokümanı hangi base URL'i kullandığını netleştirir.

### 1.2 Üç Ana Endpoint Ailesi

| Aile | Endpoint | Kullanım |
|------|----------|----------|
| **Search Analytics** | `POST /sites/{siteUrl}/searchAnalytics/query` | Performans verisi (clicks/impressions/CTR/position) |
| **Sitemaps** | `GET/PUT/DELETE /sites/{siteUrl}/sitemaps[/{feedpath}]` | Sitemap submit/list/delete |
| **URL Inspection** | `POST /urlInspection/index:inspect` | Tek URL indexleme/canonical/AMP/rich result durumu |

Buna ek olarak **Sites** ailesi (`GET/PUT/DELETE /sites[/{siteUrl}]`) doğrulanmış mülkleri yönetir.

### 1.3 Authentication

| Yöntem | Senaryo | Notlar |
|--------|---------|--------|
| **OAuth 2.0** | Kullanıcı adına erişim (en yaygın) | Scope: `https://www.googleapis.com/auth/webmasters.readonly` (read) veya `webmasters` (write). Refresh token uzun ömürlü. |
| **Service Account** | Sunucu-sunucu otomasyon | Service account email'inin GSC mülkünde **kullanıcı olarak eklenmiş** olması gerekir (sadece IAM rolü yetmez). |
| **API Key** | Çalışmaz | GSC tüm endpoint'lerde OAuth/SA gerektirir. |

**OAuth Scopes:**
- `https://www.googleapis.com/auth/webmasters.readonly` — sadece okuma
- `https://www.googleapis.com/auth/webmasters` — okuma + sitemap submit/site add/delete

### 1.4 Property (Mülk) Tipleri

| Tip | siteUrl Formatı | API Etkisi |
|-----|----------------|------------|
| **URL-prefix property** | `https://www.bitalih.com/` (sondaki slash zorunlu) | Sadece tam protokol+host eşleşmesi |
| **Domain property** | `sc-domain:bitalih.com` | Tüm protokol+subdomain (http/https/www/m.) tek property altında birleşir |

**Pratik tavsiye:** Domain property kullanın — Bi'Talih'in `www`/`m`/varyantları aynı veri setinde toplanır, ayrı property bakım maliyeti olmaz. URL-prefix gerekiyorsa (örn. `/blog/` ayrı raporlama) ek property eklenir.

---

## 2. Search Analytics — Boyutlar (Dimensions)

### 2.1 Tüm Boyutlar

| API Name | UI Adı (Türkçe) | Açıklama | Örnek Değer | Kısıt |
|----------|-----------------|----------|-------------|-------|
| `query` | Sorgu | Kullanıcının Google'a yazdığı arama metni | `bitalih şans oyunları` | Anonymized query'ler tabloda gözükmez (bkz. §10) |
| `page` | Sayfa | Kullanıcının landing yaptığı tam URL (canonical) | `https://www.bitalih.com/sayisal-loto` | URL-prefix property'de tam URL, domain property'de tüm varyantlar |
| `country` | Ülke | ISO 3166-1 alpha-3 ülke kodu | `tur`, `usa`, `deu` | 3 harfli kod (UI'daki gibi 2 harfli **değil**) |
| `device` | Cihaz | Cihaz tipi | `DESKTOP`, `MOBILE`, `TABLET` | UPPERCASE, sadece bu 3 değer |
| `searchAppearance` | Arama Görünümü | Rich result tipi | `AMP_BLUE_LINK`, `INSTANT_APP`, `RICHCARD`, `WEBLITE` | Filter & dimension olarak tek başına kullanılırsa tüm değerler keşfedilir; başka dimension ile birleşince filter olarak çalışır |
| `date` | Tarih | Günlük gruplama (PT timezone) | `2026-04-25` | YYYY-MM-DD; date varsa sıralama eski→yeni (diğerlerinde clicks DESC) |
| `hour` | Saat | Saatlik gruplama | ISO-8601 | Yalnızca `dataState=hourly_all` ile son ~24-48h verisi için anlamlı |

### 2.2 Boyut Kombinasyonu Kuralları

- **Maksimum boyut sayısı**: Resmi limit yok ama her ek boyut hem kota hem cardinality maliyeti getirir.
- **Aynı dimension iki kez** kullanılamaz.
- `query + page` kombinasyonu **en pahalı** sorgu — Google bunu özellikle vurguluyor; bu kombinasyon kullanıldığında "load limit" daha hızlı dolar (bkz. §9).
- `aggregationType=byProperty` ile `page` filter veya dimension **birleştirilemez** (çelişki). API otomatik olarak `byPage`'e düşürür.
- `searchAppearance` dimension olarak kullanıldığında **diğer hiçbir dimension ile birleştirilemez** — sadece tek başına `["searchAppearance"]` veya filter olarak başkalarıyla.

### 2.3 Cardinality (Kardinalite) Maliyeti

| Boyut | Tipik Cardinality | Pahalı mı? |
|-------|-------------------|------------|
| `device` | 3 | Düşük |
| `country` | ~250 | Orta |
| `searchAppearance` | ~10-20 | Düşük |
| `date` | Date range gün sayısı | Doğrusal |
| `page` | Site büyüklüğüne göre 10K-1M+ | Yüksek |
| `query` | 100K-10M+ | Çok yüksek |

---

## 3. Search Analytics — Metrikler (Metrics)

### 3.1 Tüm Metrikler

| API Name | UI Adı (Türkçe) | Veri Tipi | Açıklama | Hesaplama |
|----------|-----------------|-----------|----------|-----------|
| `clicks` | Tıklama | `double` (tam sayı değer) | Kullanıcının arama sonucundan siteye yaptığı tıklama sayısı | Ham sayım |
| `impressions` | Gösterim | `double` (tam sayı değer) | Site URL'sinin kullanıcıya gösterildiği sayı | Sayfa scroll'unda görünmesi yeterli (Discover'da görünür hale gelmesi gerekli) |
| `ctr` | Tıklama Oranı | `double` (0.0 – 1.0) | Click-through rate | `clicks / impressions` (API tarafından hesaplanır) |
| `position` | Ortalama Pozisyon | `double` | Sıralama ortalaması | Her impression için en iyi sıradaki pozisyon alınır, ardından **impressions ile ağırlıklı ortalama**. Düşük = iyi (1 = en üst). |

### 3.2 Önemli Sınırlılık

> **GSC sadece bu 4 metriği sunar.** GA4'teki gibi onlarca metric (sessions, conversions, revenue, scroll_depth, vb.) **YOKTUR**. CTR ve position türetilmiş; gerçek ham metrik sadece `clicks` ve `impressions`.

### 3.3 Position Metric Methodology Notu

`position` her zaman **gösterimle ağırlıklı ortalamadır**:
- Bir query 1000 impression aldı, ortalama pozisyon 8.5 → query gerçekten 4. sırada da 12. sırada da çıkmış olabilir; sadece impression-weighted ortalama döner.
- **`aggregationType=byPage` kullanıldığında position daha "gerçekçi"dir** çünkü page-level canonical aggregation ile dedupe edilir; `byProperty` (default) tüm property için karışık ortalama verir.
- Position için **medyan veya p95 yoktur** — sadece weighted mean.

### 3.4 Metric'lerin Beraber Kullanım Notları

- `ctr` ve `position` döndürülen ham veriden hesaplandığı için **filtre uyguladığınızda bunlar yeniden hesaplanır** — chart total ile satır toplamı çelişebilir (bkz. §10).
- `(other)` bucket'a düşen anonymized query'ler **chart total'ında impression/click sayısına dahil EDİLİR** ama tablo satırlarında görünmez → grafik toplamı = satır toplamı + anonymized.

---

## 4. Search Type (filter, dimension değil)

`type` parametresi **dimension değil filter**dır — request body'sinin top-level alanı.

| Değer | UI Adı | Veri Seti |
|-------|--------|-----------|
| `web` (default) | Web | Standart Google arama (mavi link sonuçları) |
| `image` | Görsel | Google Görseller sekmesi |
| `video` | Video | Google Video sekmesi (Search içinde) |
| `news` | Haberler | Google Search'in "Haberler" sekmesi |
| `discover` | Discover | Google app feed (mobile only) |
| `googleNews` | Google News | news.google.com + Google News app (Discover'dan AYRI) |

### 4.1 Önemli Uyarılar

- **Her search type ayrı veri setidir** — `web` ile `discover` toplamı ≠ "tüm trafik". GSC'de "All" sekmesi sadece Web'i gösterir, Discover'ı değil.
- `discover` ve `googleNews` için bazı dimension'lar **desteklenmez** (örn. `aggregationType=byProperty` çalışmaz).
- `discover` için `query` dimension yoktur (Discover'da kullanıcı arama yapmaz, içerik feed'de gösterilir).
- **Daily limit:** Search type başına günde **50.000 satır** indirilebilir veri (ham GSC limit, API üzerinden de geçerli).

---

## 5. Aggregation Type

`aggregationType` parametresi sonuçların nasıl toplandığını belirler.

| Değer | Açıklama | Ne Zaman Kullanılır |
|-------|----------|---------------------|
| `auto` (default) | Sorguya göre Google karar verir; genellikle `byPage` (page veya query dimension varsa) | Çoğu durumda yeterli |
| `byPage` | Canonical URL bazında dedupe; aynı URL farklı protokol/varyant tek satır | Sayfa-bazlı analiz, doğru pozisyon hesabı |
| `byProperty` | Property/site bazında tek satır (her impression bir kez sayılır) | Toplam site performansı; **page filter/dimension ile birleşmez** |
| `byNewsShowcasePanel` | News Showcase panel agregasyonu | Sadece `googleNews` type için |

**Pratik tavsiye:** Bi'Talih için query-level analiz → `auto` (default), site-toplam KPI dashboard → `byProperty`, sayfa raporu → `byPage`.

---

## 6. Filtreler (dimensionFilterGroups)

### 6.1 Yapı

```json
{
  "dimensionFilterGroups": [
    {
      "groupType": "and",
      "filters": [
        { "dimension": "country", "operator": "equals", "expression": "tur" },
        { "dimension": "device", "operator": "equals", "expression": "MOBILE" }
      ]
    }
  ]
}
```

- **Aynı grup içindeki filter'lar:** AND mantığı (`groupType: "and"` — şu an tek desteklenen değer).
- **Farklı gruplar arası:** OR mantığı (birden fazla `dimensionFilterGroup` öğesi → OR ile birleşir).

### 6.2 Operatörler

| Operator | Açıklama | Örnek |
|----------|----------|-------|
| `equals` (default) | Tam eşleşme (case-sensitive değer için dimension'a göre değişir) | `query equals "bitalih"` |
| `notEquals` | Tam eşleşmeme | `country notEquals "tur"` |
| `contains` | Substring (case-insensitive) | `page contains "/blog/"` |
| `notContains` | Substring içermeme | `query notContains "marka"` |
| `includingRegex` | RE2 syntax regex eşleşmesi | `query includingRegex "^(loto\|şans).*"` |
| `excludingRegex` | RE2 regex eşleşmemesi | `page excludingRegex ".*\\?utm.*"` |

### 6.3 Filtrelenebilir Dimension'lar

| Dimension | Filter Format |
|-----------|---------------|
| `country` | ISO alpha-3 lowercase (`tur`, `usa`) |
| `device` | UPPERCASE (`DESKTOP`, `MOBILE`, `TABLET`) |
| `page` | Tam URL veya substring/regex |
| `query` | Sorgu metni veya substring/regex |
| `searchAppearance` | Enum string (`AMP_BLUE_LINK`, vb.) |

> **Bilinen issue:** `searchAppearance` dimension'ında `notEquals`/`notContains` filtreleri ters mantıkla çalışıyor (community-confirmed bug). Production'da regex kullanın.

### 6.4 OR Örneği (Birden Fazla Grup)

```json
{
  "dimensionFilterGroups": [
    { "filters": [{"dimension": "country", "operator": "equals", "expression": "tur"}] },
    { "filters": [{"dimension": "country", "operator": "equals", "expression": "deu"}] }
  ]
}
```
→ Türkiye **VEYA** Almanya trafiği.

---

## 7. Sitemap API

### 7.1 Endpoint'ler

| Method | URL | Açıklama |
|--------|-----|----------|
| `GET` | `/sites/{siteUrl}/sitemaps` | Submit edilmiş tüm sitemap'leri listele |
| `GET` | `/sites/{siteUrl}/sitemaps/{feedpath}` | Tek sitemap detayı |
| `PUT` | `/sites/{siteUrl}/sitemaps/{feedpath}` | Sitemap submit (body yok, URL path'i sitemap URL'i) |
| `DELETE` | `/sites/{siteUrl}/sitemaps/{feedpath}` | Sitemap kaldır |

### 7.2 Sitemap Resource Field'ları

| Field | Tip | Açıklama |
|-------|-----|----------|
| `path` | string | Sitemap URL'i |
| `lastSubmitted` | datetime (RFC 3339) | En son submit zamanı |
| `lastDownloaded` | datetime (RFC 3339) | Google'ın en son crawl zamanı |
| `isPending` | boolean | Henüz işlenmemiş mi |
| `isSitemapsIndex` | boolean | Sitemap index mi (içinde başka sitemap'ler) |
| `type` | string | `sitemap`, `rssFeed`, `atomFeed`, vb. |
| `errors` | long | Düzeltilmesi gereken hata sayısı |
| `warnings` | long | Kritik olmayan uyarı sayısı |
| `contents[]` | array | Type-by-type breakdown |
| `contents[].type` | string | `web`, `image`, `video`, `news`, `mobile`, `androidApp`, `iosApp`, `pattern` |
| `contents[].submitted` | long | Submit edilen URL sayısı |
| `contents[].indexed` | long | **Deprecated** — artık her zaman 0 döner |

### 7.3 Bi'Talih İçin

- **Sadece kendi sitemiz için submit yetkisi var** — rakip sitemap'i submit edemeyiz.
- Yeni içerik (kampanya/landing) deploy ettikten sonra sitemap re-submit ile crawl hızlandırılabilir.
- `errors` alanı 0 olmadıkça yeni eklenen URL'ler index'e girmez — alarm noktası.

### 7.4 Permission Gereksinimi

Resmi doküman permission seviyesini netleştirmiyor; pratikte `siteOwner` veya `siteFullUser` gerekli. **Doğrulama gerekli** (test edilmeli).

---

## 8. URL Inspection API

### 8.1 Endpoint

```
POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
```

### 8.2 Request Body

| Field | Tip | Zorunlu | Açıklama |
|-------|-----|---------|----------|
| `inspectionUrl` | string | Evet | İncelenecek tam URL — `siteUrl` property'si altında olmalı |
| `siteUrl` | string | Evet | URL-prefix (`https://bitalih.com/`) veya domain (`sc-domain:bitalih.com`) |
| `languageCode` | string | Hayır | BCP-47 (default `en-US`) — sadece UI mesajlarını etkiler, veri etkilemez |

### 8.3 Response: UrlInspectionResult Schema

```
UrlInspectionResult {
  inspectionResultLink         string       // GSC UI'da bu URL için derin link
  indexStatusResult            object
  ampResult                    object
  mobileUsabilityResult        object       // DEPRECATED (Mobile Usability raporu kapatıldı)
  richResultsResult            object
}
```

#### 8.3.1 IndexStatusInspectionResult

| Field | Tip / Enum |
|-------|------------|
| `verdict` | `VERDICT_UNSPECIFIED`, `PASS`, `PARTIAL`, `FAIL`, `NEUTRAL` |
| `coverageState` | string (örn. `"Submitted and indexed"`, `"Indexed, not submitted in sitemap"`, `"Excluded by 'noindex' tag"`) — düz metin, enum değil |
| `robotsTxtState` | `ROBOTS_TXT_STATE_UNSPECIFIED`, `ALLOWED`, `DISALLOWED` |
| `indexingState` | `INDEXING_STATE_UNSPECIFIED`, `INDEXING_ALLOWED`, `BLOCKED_BY_META_TAG`, `BLOCKED_BY_HTTP_HEADER`, `BLOCKED_BY_ROBOTS_TXT` |
| `lastCrawlTime` | timestamp |
| `pageFetchState` | `PAGE_FETCH_STATE_UNSPECIFIED`, `SUCCESSFUL`, `SOFT_404`, `BLOCKED_ROBOTS_TXT`, `NOT_FOUND`, `ACCESS_DENIED`, `SERVER_ERROR`, `REDIRECT_ERROR`, `ACCESS_FORBIDDEN`, `BLOCKED_4XX`, `INTERNAL_CRAWL_ERROR`, `INVALID_URL` |
| `googleCanonical` | string — Google'ın seçtiği canonical |
| `userCanonical` | string — site'in declare ettiği canonical |
| `crawledAs` | `CRAWLING_USER_AGENT_UNSPECIFIED`, `DESKTOP`, `MOBILE` |
| `sitemap[]` | string array — bu URL'i içeren sitemap'ler |
| `referringUrls[]` | string array — bilinen internal/external linkler |

#### 8.3.2 AmpInspectionResult

| Field | Enum |
|-------|------|
| `verdict` | (Verdict enum yukarı) |
| `ampUrl` | string |
| `robotsTxtState` | (RobotsTxt enum) |
| `indexingState` | `AMP_INDEXING_STATE_UNSPECIFIED`, `AMP_INDEXING_ALLOWED`, `BLOCKED_DUE_TO_NOINDEX`, `BLOCKED_DUE_TO_EXPIRED_UNAVAILABLE_AFTER` |
| `ampIndexStatusVerdict` | (Verdict enum) |
| `lastCrawlTime` | timestamp |
| `pageFetchState` | (PageFetchState enum) |
| `issues[]` | AmpIssue object array |

#### 8.3.3 MobileUsabilityInspectionResult — **DEPRECATED**

Google Aralık 2023'te Mobile Usability raporunu kapattı. Field hâlâ schema'da fakat **boş döner**. Yerine PageSpeed Insights / Lighthouse kullanın.

| Field | Enum |
|-------|------|
| `verdict` | (Verdict enum) |
| `issues[].issueType` | `MOBILE_USABILITY_ISSUE_TYPE_UNSPECIFIED`, `USES_INCOMPATIBLE_PLUGINS`, `CONFIGURE_VIEWPORT`, `FIXED_WIDTH_VIEWPORT`, `SIZE_CONTENT_TO_VIEWPORT`, `USE_LEGIBLE_FONT_SIZES`, `TAP_TARGETS_TOO_CLOSE` |
| `issues[].severity` | `SEVERITY_UNSPECIFIED`, `WARNING`, `ERROR` |

#### 8.3.4 RichResultsInspectionResult

| Field | Açıklama |
|-------|----------|
| `verdict` | (Verdict enum) |
| `detectedItems[].richResultType` | string — `"FAQ"`, `"HowTo"`, `"Product"`, `"Recipe"`, `"Article"`, `"BreadcrumbList"`, `"VideoObject"`, vb. |
| `detectedItems[].items[].name` | string — schema item adı |
| `detectedItems[].items[].issues[].issueMessage` | string |
| `detectedItems[].items[].issues[].severity` | `WARNING`, `ERROR` |

### 8.4 Bi'Talih İçin Kullanım

- **Yeni içerik deploy sonrası**: yeni URL inspect → `verdict=PASS` ve `coverageState="Submitted and indexed"` olana kadar takip.
- **Kampanya sayfası debug**: noindex var mı, canonical doğru mu, structured data hata mı?
- **Indexing pipeline alarm**: `coverageState` "Crawled - currently not indexed" döndüğünde içerik kalitesi review.

---

## 9. Quotas & Limitler

### 9.1 Search Analytics Quotas

| Scope | Limit |
|-------|-------|
| **Per-site** | **1.200 QPM** (queries per minute) |
| **Per-user** | **1.200 QPM** |
| **Per-project** | **40.000 QPM**, **30.000.000 QPD** (queries per day) |

**Load limits (ayrı sistem):** Google ek olarak "load-based" throttle uygular:
- Kısa-vadeli: 10-dakikalık pencerede aşılırsa 15 dakika bekle.
- Uzun-vadeli: 1-günlük pencerede aşılırsa.
- **`query + page` birlikte gruplama/filtreleme en pahalı** — bu kombinasyonda load limit hızla dolar.

### 9.2 URL Inspection API Quotas

| Scope | Limit |
|-------|-------|
| **Per-site** | **2.000 QPD**, **600 QPM** |
| **Per-project** | **10.000.000 QPD**, **15.000 QPM** |

> Bi'Talih için site başı **2K/gün** sınırı entegrasyonda kritik — toplu inspect yerine "değişen URL'leri" inspect eden delta job tasarlayın.

### 9.3 Diğer Endpoint'ler (Sites, Sitemaps)

| Scope | Limit |
|-------|-------|
| **Per-user** | **20 QPS**, **200 QPM** |
| **Per-project** | **100.000.000 QPD** |

### 9.4 Search Analytics Sorgu-Bazlı Limitler

| Limit | Değer |
|-------|-------|
| `rowLimit` max | **25.000** (default 1.000) |
| `startRow` | 0-tabanlı pagination offset |
| Date range max | **16 ay** (geriye dönük) |
| Search type başına günlük indirilebilir satır | **50.000 satır/gün/search type** |

### 9.5 Veri Gecikmesi (Freshness)

- **Standart veri:** 2-3 gün gecikmeli (`dataState=final`).
- **Fresh data:** `dataState=all` — son 1-2 günün incomplete verisi de döner; response'a `first_incomplete_date` eklenir.
- **Hourly data:** `dataState=hourly_all` ile saatlik gruplama; `first_incomplete_hour` döner. Sadece son ~24-48h.
- **REAL-TIME DEĞİL** — GA4'teki gibi anlık raporlama yoktur.

### 9.6 Veri Tutma (Retention)

- **16 ay rolling window** — bugünden 16 ay öncesine kadar gidebilir, daha eski veri **kalıcı olarak silinir**, hiçbir şekilde geri gelmez.
- Uzun vadeli arşivleme için: GSC → BigQuery export (Looker Studio/manual) veya günlük CSV/DB job ile çekip kendi DWH'ınıza yazın.

---

## 10. Sampling / Suppression / Anonymized Queries

### 10.1 Anonymized Queries (Gizli Sorgular)

GSC privacy gereği **az sayıda kullanıcının yaptığı sorguları gizler**. Bu query'ler API response'unda **hiç dönmez** (tablo satırı olarak bile yok).

#### Threshold (Eşik)

- Google **resmi sayı paylaşmıyor** ama dokümantasyonda: "*queries that aren't issued by more than a few dozen users over a two-to-three month period*" → tahminen ≥30-50 unique kullanıcı / 60-90 gün eşiği.
- Avrupa Birliği DMA kapsamındaki paylaşımda kullanılan k-anonymity eşiği: **30 ayrı oturumlu kullanıcıdan 30 arama / 13 ay** (referans olarak; ana GSC için kesin sayı public değil).
- Topluluk verilerine göre **birçok sitenin query trafiğinin %30-50'si** anonymized — küçük niche sitelerde %90'a çıkabiliyor.

#### `(other)` Bucket Davranışı

| Yer | Anonymized Veri Dahil mi? |
|-----|---------------------------|
| Chart total (clicks/impressions agregasyonu) | **Evet** |
| Tablo satırları (query bazlı) | **Hayır** — hiç görünmez |
| Sonuç: chart_total - sum(table_rows) = anonymized hacmi |

> **Pratik etki:** API'den `dimensions=["query"]` ile gelen toplam clicks, `dimensions=[]` ile gelen toplam clicks'ten **küçüktür** (fark = anonymized). Dashboard'da bu farkı `(other)` olarak gösterin.

### 10.2 "Top Rows Only" Sınırlılığı

Resmi doküman: *"The API is bounded by internal limitations of Search Console and does not guarantee to return all data rows but rather top ones."*

→ Anonymized olmasa bile API tüm satırları garanti etmez; **en yüksek tıklama alan satırlar** öncelikli döner. Long-tail için BigQuery export tek güvenilir yol.

### 10.3 Privacy Threshold Kontrol Listesi

- Tek-kullanıcı query'ler **hiçbir zaman** dönmez.
- Düşük hacimli (5-10 click) niche brand query'ler genellikle gizlenir.
- Filter uygulamak (örn. `country=tur`) **hacmi düşürdüğü için** daha çok query gizlenmesine yol açabilir.

---

## 11. Bi'Talih için Önerilen Sorgu Kalıpları

### 11.1 "En çok tıklanma getiren brand query'ler"

```json
{
  "startDate": "2026-04-01", "endDate": "2026-04-27",
  "dimensions": ["query"],
  "dimensionFilterGroups": [{
    "filters": [{"dimension": "query", "operator": "includingRegex", "expression": "(?i)bi.?talih|bitalih"}]
  }],
  "rowLimit": 1000
}
```

### 11.2 "CTR optimizasyonu fırsatı — pozisyon 4-10 arası"

GSC API doğrudan numerik filter desteklemiyor. Çözüm: tüm query'leri çek, client-side filtrele.

```json
{
  "startDate": "2026-01-27", "endDate": "2026-04-27",
  "dimensions": ["query", "page"],
  "rowLimit": 25000
}
```
→ Response'da `position >= 4 && position <= 10 && impressions > 100` filter et.

### 11.3 "Yeni içerik (page) için clicks zaman serisi"

```json
{
  "startDate": "2026-04-01", "endDate": "2026-04-27",
  "dimensions": ["date"],
  "dimensionFilterGroups": [{
    "filters": [{"dimension": "page", "operator": "equals", "expression": "https://www.bitalih.com/yeni-kampanya"}]
  }],
  "aggregationType": "byPage"
}
```

### 11.4 "Mobile vs Desktop CTR farkı"

```json
{
  "startDate": "2026-04-01", "endDate": "2026-04-27",
  "dimensions": ["device", "query"],
  "rowLimit": 25000
}
```
→ Pivot: `query` × `device` matrix, CTR delta hesapla.

### 11.5 "Ülke bazında trafik dağılımı"

```json
{
  "startDate": "2026-04-01", "endDate": "2026-04-27",
  "dimensions": ["country"],
  "rowLimit": 250
}
```

### 11.6 "Discover trafiği" (mobile feed)

```json
{
  "startDate": "2026-04-01", "endDate": "2026-04-27",
  "dimensions": ["page", "date"],
  "type": "discover",
  "rowLimit": 5000
}
```
→ `query` dimension Discover'da yok. Discover'da hangi içerik viral oldu görünür.

### 11.7 "Rich result fırsatı — searchAppearance breakdown"

```json
{
  "startDate": "2026-04-01", "endDate": "2026-04-27",
  "dimensions": ["searchAppearance"]
}
```
→ Sadece tek başına dimension. Sonra her appearance type için filter ile detay sorgusu.

---

## 12. Rakip Tarafı Sınırlılığı

> **GSC SADECE kendi doğrulanmış mülkleriniz için çalışır.** Bi'Talih property'sine erişim → sadece Bi'Talih verisi.

### Rakip SEO için ne lazım?

| İhtiyaç | Çözüm |
|---------|-------|
| Rakip query/keyword listesi | DataForSEO / SEMrush / Ahrefs |
| Rakip sayfa pozisyonu (SERP scraping) | DataForSEO SERP API |
| Rakip trafiik tahmini | SimilarWeb / SEMrush |
| Rakip backlink profili | Ahrefs / Majestic |

**Sıradaki entegrasyon adımı:** GSC ile kendi verimizi çekip, DataForSEO ile rakip verisini paralel çekip karşılaştıran rapor (bkz. mevcut `06_API_DATAFORSEO.md`).

**Beklenti yönetimi:** GSC entegrasyonu tek başına **rakip analizi sağlamaz** — sadece "biz ne durumdayız" sorusuna cevap verir.

---

## 13. Bilinen Sorunlar / Kısıtlar

1. **Discover/News farklı veri seti** — `web` ile aynı toplam değil; ayrı çekilmeli.
2. **Anonymized query oranı yüksek** (%30-50) — niche query analizi GSC ile imkansız; arama hacmi DataForSEO'dan alınmalı.
3. **Position averaging** — sadece impression-weighted mean; medyan/p95 yok, query'nin "en iyi günü" çıkartılamıyor (BigQuery export'ta saatlik veri ile mümkün).
4. **Top rows only** — long-tail query'ler dönmez (sadece top 25K/sorgu ve toplam 50K/gün/search type).
5. **Position metric `byProperty` ile yanıltıcı** — `byPage` daha doğru.
6. **`searchAppearance` notEquals/notContains bug'lı** — regex ile workaround.
7. **Mobile Usability deprecated** — URL Inspection bu alanı dolduruyor ama Google rapor olarak kapattı (Aralık 2023).
8. **16 ay sonrası veri silinir** — kendi DB'mize archive job şart.
9. **Real-time yok** — 2-3 gün gecikme; intraday alerting için GSC uygun değil (alternatif: GA4 real-time).
10. **Service account permission** — IAM rolü değil, GSC UI'dan kullanıcı olarak eklenmeli.
11. **`query + page` birlikte → load limit** — gruplamayı ayır, iki ayrı query çek.
12. **`hour` dimension henüz beta** — sadece son 24-48h veri için anlamlı, production raporlara koymayın.

---

## 14. Referanslar

### Resmi Google Dokümantasyonu

- [Search Console API v1 Reference Index](https://developers.google.com/webmaster-tools/v1/api_reference_index)
- [Search Analytics — query method](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Sitemaps API](https://developers.google.com/webmaster-tools/v1/sitemaps)
- [URL Inspection — index.inspect method](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)
- [UrlInspectionResult schema](https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult)
- [Usage Limits / Quotas](https://developers.google.com/webmaster-tools/limits)
- [Getting all your data (pagination, freshness)](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data)

### Help / Background

- [Performance Report (UI Reference)](https://support.google.com/webmasters/answer/7576553)
- [URL Inspection Tool](https://support.google.com/webmasters/answer/9012289)
- [Performance data filtering deep dive (Search Central Blog 2022-10)](https://developers.google.com/search/blog/2022/10/performance-data-deep-dive)
- [URL Inspection API launch announcement (Search Central Blog 2022-01)](https://developers.google.com/search/blog/2022/01/url-inspection-api)

### Topluluk / Üçüncü Taraf (anonymized query yorumları için)

- [Ahrefs: Anonymized queries make up nearly half of GSC traffic](https://ahrefs.com/blog/gsc-anonymized-queries/)
- [Search Engine Land: GSC excludes anonymous query data from chart totals](https://searchengineland.com/google-search-console-query-reports-now-removes-anonymous-query-data-for-privacy-reasons-304437)
- [Google Search Central Community thread — 90% queries anonymized](https://support.google.com/webmasters/thread/153711895/)

---

**Doküman versiyonu:** 1.0 · **Son güncelleme:** 2026-04-27 · **Sahip:** RakipAnaliz / Bi'Talih SEO entegrasyonu

**Doğrulama gereken alanlar:**
- Sitemap permission seviyesi (siteOwner mı siteFullUser mı yetiyor) — production test ile.
- Anonymized query exact threshold sayısı — Google public yapmıyor, sadece davranıştan çıkarım.
- `hour` dimension'ın production stability'si — beta sayılır.
