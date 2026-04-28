# GA4 Data API v1 — Metrikler & Boyutlar Kapsamlı Referansı

> **Amaç:** Bi'Talih (online şans oyunu / bahis pazarı) için GA4 Data API v1 üzerinden çekilebilecek **tüm metrik ve boyutların** referans dokümanı. Entegrasyon planlaması ve sorgu tasarımı için kullanılacak.
>
> **Hedef API:** `Google Analytics Data API v1beta` — `https://analyticsdata.googleapis.com/v1beta/`
> **Doküman tarihi:** 2026-04-27
> **Kaynak:** Google resmi dokümantasyonu (bkz. §12 Referanslar)

---

## 1. Genel Bakış

### 1.1 GA4 Data API v1 Nedir?

Google Analytics Data API v1, **Google Analytics 4 (GA4)** mülklerinden programatik rapor verisi çekmek için tasarlanmış REST tabanlı bir API'dir. Universal Analytics (UA) Reporting API v3/v4 ile **uyumlu değildir** — UA, 1 Temmuz 2024 itibarıyla tamamen kapatılmış, sadece GA4 kalmıştır.

**UA → GA4 temel farkları (API perspektifi):**

| Konu | Universal Analytics | GA4 |
|------|---------------------|-----|
| Veri modeli | Session-tabanlı (hit: pageview, event, transaction) | Event-tabanlı (her şey event) |
| Sayfa metriği | `ga:pageviews` | `screenPageViews` (web + app birleşik) |
| Bounce mantığı | Tek-hit oturum | `engagementRate` ters çevirisi (10 sn altı + tek pageview + dönüşüm yok) |
| Goal kavramı | Goal ID (1-20) | "Key event" (event'i key olarak işaretle) |
| Custom dimension | Index slot (1-200) | İsim bazlı (`customEvent:promo_code`) |
| Cross-platform | Ayrı property | Tek property (web + iOS + Android stream) |
| Endpoint | `analyticsreporting.googleapis.com/v4` | `analyticsdata.googleapis.com/v1beta` |

### 1.2 API Çeşitleri

GA4 ekosisteminde üç ayrı API ailesi vardır. Bizim odağımız **Data API**, ama farkı bilmek lazım:

| API | Endpoint | Kullanım |
|-----|----------|----------|
| **Data API** (Reporting) | `analyticsdata.googleapis.com/v1beta` | Tarihsel rapor, trend analizi, dashboard. Bizim ana API'miz. |
| **Data API — Realtime** | Aynı host, `:runRealtimeReport` metodu | Son 30 dakika canlı veri (anlık kampanya takibi) |
| **Admin API** | `analyticsadmin.googleapis.com/v1beta` | Property/stream/custom dimension yönetimi (CRUD) — veri çekmez |

### 1.3 Endpoint Metotları (Data API)

| Metot | Amaç |
|-------|------|
| `properties.runReport` | Standart rapor (tek dimension+metric matrisi) |
| `properties.batchRunReports` | Tek istekte 5'e kadar rapor |
| `properties.runPivotReport` | Pivot tablo (ör. ülke × cihaz çapraz) |
| `properties.batchRunPivotReports` | Toplu pivot |
| `properties.runRealtimeReport` | Son 30 dk canlı veri |
| `properties.runFunnelReport` (alpha) | Huni raporu — alpha, breaking change riski yüksek |
| `properties.getMetadata` | Mülke özel custom dim/metric dahil tüm şema |
| `properties.checkCompatibility` | Dim+metric kombinasyonu uyumlu mu testi |

### 1.4 Authentication

**Tavsiye edilen: Service Account.** OAuth2 son kullanıcı kimliği gerektirdiği için server-side raporlamada uygun değildir.

| Yöntem | Kullanım | Notlar |
|--------|----------|--------|
| **Service Account JSON key** | Server-to-server, cron, ETL | GA4 mülküne service account email'i `Viewer` rolüyle eklenir |
| **OAuth2 (user)** | Kullanıcının kendi GA4'üne erişen multi-tenant SaaS | Refresh token saklanmalı |
| **API Key** | Sadece public veriye erişim | Data API'de pratikte kullanılmaz, çünkü her mülk auth ister |
| **Application Default Credentials (ADC)** | Lokal dev / GCP içinden | `gcloud auth application-default login` |

**Scope:** `https://www.googleapis.com/auth/analytics.readonly`

### 1.5 Quota — Kısa Özet

(Detay için §7)

| | Standard property | Analytics 360 |
|--|------------------|---------------|
| Core tokens / gün | 200.000 | 2.000.000 |
| Core tokens / saat | 40.000 | 400.000 |
| Core eşzamanlı istek | 10 | 50 |
| Realtime tokens / gün | 200.000 | 2.000.000 |
| Funnel tokens / gün | 200.000 | 2.000.000 |
| Thresholded request / saat | 120 | (doğrulama gerekli) |

---

## 2. Boyutlar (Dimensions)

> **Not:** Tüm `apiName` değerleri camelCase. UI Name çoğu yerde Türkçe GA4 arayüz çevirisidir; resmi İngilizce adı `(EN: ...)` olarak verilmiştir.

### 2.1 Zaman (Time)

| API Name | UI Name (TR) | Açıklama | Örnek Değer | Kullanım Notu |
|----------|--------------|----------|-------------|---------------|
| `date` | Tarih | Olay tarihi | `20260427` | YYYYMMDD format — string olarak döner |
| `dateHour` | Tarih + Saat | Tarih ve saat | `2026042714` | Saatlik granülerlik |
| `dateHourMinute` | Tarih saat dakika | Tarih + saat + dakika | `202604271430` | Anlık değil — yine de gecikmeli |
| `day` | Gün | Ayın günü | `27` | 01-31 |
| `dayOfWeek` | Haftanın günü (sayı) | Haftanın günü | `1` | 0=Pazar, 6=Cumartesi |
| `dayOfWeekName` | Haftanın günü (ad) | İngilizce isim | `Monday` | İngilizce sabit |
| `hour` | Saat | Olayın saati | `14` | 00-23 |
| `minute` | Dakika | Saatin dakikası | `30` | 00-59 |
| `month` | Ay | Olay ayı | `04` | 01-12 |
| `week` | Hafta | Yılın haftası | `17` | Pazar başlangıçlı |
| `year` | Yıl | Olay yılı | `2026` | YYYY |
| `yearMonth` | Yıl-Ay | YYYYMM | `202604` | Aylık raporlar için |
| `yearWeek` | Yıl-Hafta | YYYYWW | `202617` | Haftalık trend |
| `isoWeek` | ISO hafta | ISO 8601 hafta | `17` | Pazartesi başlangıçlı |
| `isoYear` | ISO yıl | ISO yıl | `2026` | |
| `isoYearIsoWeek` | ISO yıl-hafta | Birleşik | `202617` | |
| `nthDay` | Aralıktan N. gün | Tarih aralığının başından kaç gün | `5` | Donem karşılaştırma için altın |
| `nthHour` | N. saat | Aralık başından saat ofseti | `120` | |
| `nthMinute` | N. dakika | Aralık başından dakika ofseti | `7200` | |
| `nthMonth` | N. ay | Aralık başından ay ofseti | `2` | |
| `nthWeek` | N. hafta | Aralık başından hafta ofseti | `4` | |
| `nthYear` | N. yıl | Aralık başından yıl ofseti | `0` | |

**Bi'Talih notu:** Şans oyunlarında **saatlik trafik dalgalanması** (akşam pikleri, hafta sonu yoğunluğu) çok önemli. `dateHour` + `dayOfWeekName` kombinasyonu pik saat tespitinde kritik.

### 2.2 Kullanıcı (User)

| API Name | UI Name (TR) | Açıklama | Örnek Değer | Kullanım Notu |
|----------|--------------|----------|-------------|---------------|
| `newVsReturning` | Yeni / Dönen | İlk veya tekrar gelen | `new` / `returning` | Sade segmentasyon |
| `firstSessionDate` | İlk oturum tarihi | Kullanıcının ilk session günü | `20260315` | Cohort analizi |
| `userAgeBracket` | Yaş aralığı | Demografik | `25-34` | Threshold'a tabi (low data gizlenir) |
| `userGender` | Cinsiyet | Demografik | `female` | Threshold'a tabi |
| `signedInWithUserId` | Giriş yapıldı mı | User-ID set edildi mi | `yes` / `no` | Auth sonrası takip |
| `brandingInterest` | İlgi alanları | Affinity kategoriler | `Beauty Mavens` | Threshold'a tabi |

### 2.3 Coğrafya (Geography)

| API Name | UI Name (TR) | Açıklama | Örnek | Not |
|----------|--------------|----------|-------|-----|
| `continent` | Kıta | | `Europe` | |
| `continentId` | Kıta ID | | `150` | UN M.49 |
| `subContinent` | Alt-kıta | | `Western Europe` | |
| `country` | Ülke | IP'den türetilir | `Turkey` | |
| `countryId` | Ülke ID | ISO 3166-1 alpha-2 | `TR` | |
| `region` | Bölge / Eyalet | | `Istanbul Province` | |
| `city` | Şehir | | `Istanbul` | Yüksek kardinalite |
| `cityId` | Şehir ID | Google internal | `1063226` | |

**Bi'Talih notu:** Türkiye odaklı pazar — `country = Turkey` filtresi ana baz; il bazında trafik (`region`) bayilik/şube planlama için kullanılabilir.

### 2.4 Cihaz & Platform (Device)

| API Name | UI Name (TR) | Açıklama | Örnek | Not |
|----------|--------------|----------|-------|-----|
| `deviceCategory` | Cihaz kategorisi | mobile / desktop / tablet / smart tv | `mobile` | |
| `deviceModel` | Cihaz modeli | | `iPhone 14 Pro` | |
| `mobileDeviceBranding` | Cihaz markası | | `Apple` | |
| `mobileDeviceMarketingName` | Cihaz pazarlama adı | | `iPhone 14 Pro` | |
| `mobileDeviceModel` | Mobil model | | `iPhone15,2` | |
| `operatingSystem` | İşletim sistemi | | `iOS` | |
| `operatingSystemVersion` | OS sürümü | | `17.4.1` | |
| `operatingSystemWithVersion` | OS + sürüm | | `iOS 17.4.1` | |
| `browser` | Tarayıcı | | `Chrome` | |
| `screenResolution` | Ekran çözünürlüğü | | `1920x1080` | |
| `language` | Dil | Uzun ad | `Turkish` | |
| `languageCode` | Dil kodu | ISO 639 | `tr-tr` | |
| `platform` | Platform | web / iOS / Android | `web` | |
| `platformDeviceCategory` | Platform / kategori | Birleşik | `web / mobile` | |
| `appVersion` | Uygulama sürümü | App stream'lerde | `2.4.1` | |
| `streamId` | Stream ID | Numerik | `1234567890` | |
| `streamName` | Stream adı | | `Bi'Talih Web Production` | |

### 2.5 Sayfa (Page) ve İçerik

| API Name | UI Name (TR) | Açıklama | Örnek | Not |
|----------|--------------|----------|-------|-----|
| `pagePath` | Sayfa yolu | URL path (host hariç, query hariç) | `/sans-oyunlari/sayisal-loto` | En çok kullanılan sayfa boyutu |
| `pagePathPlusQueryString` | Sayfa yolu + query | | `/loto?ref=push` | UTM koruyucu |
| `pageLocation` | Tam URL | Protokol+host+path+query | `https://bitalih.com/sayisal-loto?ref=push` | |
| `pageTitle` | Sayfa başlığı | `<title>` tag | `Sayısal Loto Oyna - Bi'Talih` | |
| `pageReferrer` | Sayfa referrer | Önceki tam URL | `https://google.com/` | |
| `hostName` | Host adı | Subdomain + domain | `www.bitalih.com` | Multi-domain için ayırıcı |
| `fullPageUrl` | Tam sayfa URL | Host + path + query | `bitalih.com/loto?promo=A` | |
| `landingPage` | Açılış sayfası | Session'ın ilk sayfası | `/kampanya/yilbasi` | Kampanya analizi için kritik |
| `landingPagePlusQueryString` | Açılış + query | | `/kampanya/yilbasi?utm_source=fb` | UTM ile birleşik landing |
| `unifiedScreenName` | Birleşik ekran adı | Web `pageTitle` + App `screenName` | `Loto Çekiliş` | App+Web combined raporlar |
| `unifiedScreenClass` | Birleşik ekran sınıfı | App screen class | `LotoActivity` | |
| `unifiedPagePathScreen` | Birleşik path/screen | | `/loto` veya `LotoActivity` | |
| `screenName` | Ekran adı | Sadece app | `Game Detail` | |
| `screenClass` | Ekran sınıfı | App ekran sınıfı | `GameDetailController` | |
| `contentGroup` | İçerik grubu | Manuel set edilen grup | `Şans Oyunları` | Gerçek değer için tag set lazım |
| `contentId` | İçerik ID | | `game_42` | |
| `contentType` | İçerik tipi | | `game` | |

### 2.6 Olay (Event)

| API Name | UI Name (TR) | Açıklama | Örnek | Not |
|----------|--------------|----------|-------|-----|
| `eventName` | Olay adı | | `purchase`, `add_to_cart`, `bet_placed` | Custom event'ler de buradan döner |
| `isKeyEvent` | Key event mi? | string `true` / `false` | `true` | GA4'ün eski "conversion" yerine geçti |
| `searchTerm` | Arama terimi | Site search | `şans topu` | `view_search_results` event'i lazım |
| `method` | Yöntem | `login` / `share` event'leri için | `Google` | |
| `linkUrl` | Link URL | Outbound click | `https://example.com` | `click` event içinde |
| `linkDomain` | Link domain | | `example.com` | |
| `linkText` | Link metni | | `Şimdi Oyna` | |
| `linkId` | Link ID (HTML) | | `cta-play` | |
| `linkClasses` | Link CSS class | | `btn btn-primary` | |
| `outbound` | Dış bağlantı mı? | `true` / `false` | `true` | |
| `fileName` | Dosya adı | Download event | `kullanim-kosullari.pdf` | |
| `fileExtension` | Dosya uzantısı | | `pdf` | |
| `percentScrolled` | Yüzde kaydırıldı | Scroll event | `90` | |
| `videoTitle` | Video başlığı | YouTube + custom | `Promo 2026` | |
| `videoUrl` | Video URL | | | |
| `videoProvider` | Video sağlayıcı | | `youtube` | |
| `visible` | Görünür mü? | Video % izlendi event | `true` | |

### 2.7 Trafik Kaynağı — Genel (Source/Medium)

GA4'te trafik kaynağı **üç scope**'ta tutulur: `(prefix yok)` = event scope, `session*` = session scope, `firstUser*` = user-level (ilk dokunuş).

| API Name | UI Name (TR) | Açıklama | Örnek | Not |
|----------|--------------|----------|-------|-----|
| `source` | Kaynak | Event-scoped | `google` | |
| `medium` | Ortam | Event-scoped | `cpc` | |
| `campaignId` | Kampanya ID | Event-scoped | `123456789` | |
| `campaignName` | Kampanya | Event-scoped | `yilbasi_2026` | |
| `defaultChannelGroup` | Varsayılan kanal grubu | Event-scoped | `Paid Search` | |
| `primaryChannelGroup` | Birincil kanal grubu | Event-scoped | `Paid Search` | Custom channel group destekler |
| `sourcePlatform` | Kaynak platformu | | `Google Ads` | |

### 2.8 Trafik Kaynağı — Session Scope

| API Name | UI Name (TR) | Açıklama | Örnek |
|----------|--------------|----------|-------|
| `sessionSource` | Oturum kaynağı | Oturum başlangıcındaki kaynak | `facebook` |
| `sessionMedium` | Oturum ortamı | | `social` |
| `sessionCampaignId` | Oturum kampanya ID | | `987654321` |
| `sessionCampaignName` | Oturum kampanyası | | `kupa_finali` |
| `sessionDefaultChannelGroup` | Oturum kanal grubu | | `Paid Social` |
| `sessionPrimaryChannelGroup` | Oturum birincil kanal | | `Paid Social` |
| `sessionSourceMedium` | Oturum kaynak/ortam | Birleşik | `facebook / cpc` |
| `sessionSourcePlatform` | Oturum kaynak platformu | | `Manual` |

### 2.9 Trafik Kaynağı — First User (Acquisition)

İlk-dokunuş atribusyonu için. Kullanıcı GA4 mülküne hangi kanaldan ilk geldi.

| API Name | UI Name (TR) | Örnek |
|----------|--------------|-------|
| `firstUserSource` | İlk kaynak | `google` |
| `firstUserMedium` | İlk ortam | `organic` |
| `firstUserCampaignId` | İlk kampanya ID | |
| `firstUserCampaignName` | İlk kampanya | `acquisition_q4` |
| `firstUserDefaultChannelGroup` | İlk kanal grubu | `Organic Search` |
| `firstUserPrimaryChannelGroup` | İlk birincil kanal | |
| `firstUserSourceMedium` | İlk kaynak/ortam | `google / organic` |
| `firstUserSourcePlatform` | İlk kaynak platformu | |

### 2.10 Manuel UTM Boyutları

`utm_*` parametrelerinin ham değerleri. (GA4 attribution model'i bunları işleyip `source/medium`'a çevirir; ham değer için bunları kullan.)

| API Name | UTM Karşılığı |
|----------|---------------|
| `manualSource` | `utm_source` |
| `manualMedium` | `utm_medium` |
| `manualCampaignId` | `utm_id` |
| `manualCampaignName` | `utm_campaign` |
| `manualAdContent` | `utm_content` |
| `manualTerm` | `utm_term` |
| `manualSourceMedium` | birleşik |
| `manualCreativeFormat` | `utm_creative_format` |
| `manualMarketingTactic` | `utm_marketing_tactic` |
| `manualSourcePlatform` | `utm_source_platform` |

> Aynı seti `firstUserManual*` (ilk dokunuş) ve `sessionManual*` (oturum) prefix'leriyle de kullanabilirsiniz.

### 2.11 Google Ads Boyutları

GA4 ↔ Google Ads link aktif olduğunda dolar.

| API Name | Açıklama |
|----------|----------|
| `googleAdsCampaignName` | Google Ads kampanyası |
| `googleAdsCampaignId` | Kampanya ID |
| `googleAdsAdGroupName` | Reklam grubu |
| `googleAdsAdGroupId` | Reklam grubu ID |
| `googleAdsKeyword` | Anahtar kelime metni |
| `googleAdsQuery` | Arama sorgusu (search term) |
| `googleAdsCreativeId` | Creative ID |
| `googleAdsCustomerId` | Google Ads hesap ID (CID) |
| `googleAdsAccountName` | Google Ads hesap adı |
| `googleAdsCampaignType` | Search / Display / Shopping / Video / Performance Max |
| `googleAdsAdNetworkType` | Google search / Search partners / Display / YouTube |

> Aynı set `firstUserGoogleAds*` ve `sessionGoogleAds*` olarak da var.

### 2.12 Diğer Reklam Platformları (CM360, DV360, SA360)

Sadece bu Google Marketing Platform ürünleri linklenmişse anlamlı.

- **CM360 (Campaign Manager 360):** `cm360AccountName`, `cm360AdvertiserName`, `cm360CampaignName`, `cm360PlacementName`, `cm360CreativeName`, `cm360CreativeFormat`, `cm360Source`, `cm360Medium`, `cm360RenderingId` (ve `firstUser*`/`session*` varyantları)
- **DV360 (Display & Video 360):** `dv360AdvertiserName`, `dv360CampaignName`, `dv360LineItemName`, `dv360InsertionOrderName`, `dv360CreativeName`, `dv360ExchangeName`, `dv360PartnerName`
- **SA360 (Search Ads 360):** `sa360CampaignName`, `sa360AdGroupName`, `sa360KeywordText`, `sa360Query`, `sa360EngineAccountName`, `sa360ManagerAccountName`

**Bi'Talih notu:** Bu üç ürün enterprise düzeyde Google ürünleri. Kullanmıyorsanız bu boyutlar boş döner — sorgu kalabalığı yapmaya değmez.

### 2.13 E-Ticaret (Item-scoped)

> **Önemli:** `item*` boyutları **item-scoped**'dur. Sadece `view_item`, `add_to_cart`, `purchase` vb. e-ticaret event'lerinin `items[]` array'inden veri okur. Session/User scope metriklerle birleşince INCOMPATIBLE olabilir (bkz. §4).

| API Name | UI Name (TR) | Açıklama | Örnek |
|----------|--------------|----------|-------|
| `itemId` | Ürün ID | `item_id` parametresi | `ticket_loto_2026w17` |
| `itemName` | Ürün adı | | `Sayısal Loto - 17. Hafta` |
| `itemBrand` | Ürün markası | | `Bi'Talih` |
| `itemCategory` | Kategori (1) | Üst seviye | `Şans Oyunları` |
| `itemCategory2` | Kategori (2) | | `Loto` |
| `itemCategory3` | Kategori (3) | | `Sayısal` |
| `itemCategory4` | Kategori (4) | | |
| `itemCategory5` | Kategori (5) | | |
| `itemVariant` | Varyant | | `5 satır` |
| `itemAffiliation` | Bağlı ortak | | `Bayi-A` |
| `itemListName` | Liste adı | "Popüler oyunlar" | `Bu Hafta Yüksek İkramiye` |
| `itemListId` | Liste ID | | `popular_games` |
| `itemListPosition` | Liste pozisyonu | Sıralama | `3` |
| `itemLocationID` | Lokasyon ID | Place ID veya custom | `loc_001` |
| `itemPromotionId` | Promosyon ID | | `promo_yilbasi` |
| `itemPromotionName` | Promosyon adı | | `Yılbaşı 2X İkramiye` |
| `itemPromotionCreativeName` | Promosyon creative | | `banner_v2` |
| `itemPromotionCreativeSlot` | Promosyon slot | | `homepage_top` |
| `currencyCode` | Para birimi | ISO 4217 | `TRY` |
| `orderCoupon` | Sipariş kuponu | Order-level | `WELCOME20` |
| `transactionId` | İşlem ID | Eşsiz | `txn_2026_17_8842` |
| `shippingTier` | Kargo seviyesi | | `Express` |
| `paymentType` | Ödeme tipi | | `Credit Card` |

### 2.14 Audience (Kitle)

| API Name | UI Name (TR) | Açıklama |
|----------|--------------|----------|
| `audienceId` | Kitle ID | Numerik |
| `audienceName` | Kitle adı | "High-value players" |
| `audienceResourceName` | Kitle resource | `properties/X/audiences/Y` |

> Audience boyutları **threshold**'a tabidir — küçük kitle = `(other)` veya gizleme.

### 2.15 Cohort

`cohortSpec` ile birlikte kullanılır.

| API Name | Açıklama |
|----------|----------|
| `cohort` | Cohort'un adı |
| `cohortNthDay` | İlk session gününden N. gün |
| `cohortNthWeek` | N. hafta |
| `cohortNthMonth` | N. ay |

### 2.16 Reklam Yayını (Publisher Ads — AdSense/AdMob)

GA4 mülkü AdSense veya AdMob'la entegreyse — yayın gelir analizi.

| API Name | Açıklama |
|----------|----------|
| `adFormat` | Reklam formatı (Interstitial, Banner, vs.) |
| `adSourceName` | Reklamı sunan ağ (AdMob Network, Facebook Audience Network) |
| `adUnitName` | Reklam birimi adı |

### 2.17 Game (Mobil oyun)

Firebase ile gelir, gaming SDK için.

| API Name | Açıklama |
|----------|----------|
| `character` | Oyuncu karakteri |
| `level` | Oyuncu seviyesi |
| `groupId` | Oyuncu grubu |
| `achievementId` | Başarım ID |
| `virtualCurrencyName` | Sanal para adı |

### 2.18 Custom Dimensions (Özel Boyutlar)

Custom dimension'lar **kayıtlı parametre** üzerinden çekilir. Sözdizimi (prefix önemli):

| Format | Scope | Örnek |
|--------|-------|-------|
| `customEvent:<parameter_name>` | Event-scoped | `customEvent:promo_code` |
| `customUser:<user_property_name>` | User-scoped | `customUser:player_tier` |
| `customItem:<parameter_name>` | Item-scoped (e-ticaret) | `customItem:game_type` |

**Kayıtlı limitler (per property):**

| Tip | Standard | Analytics 360 |
|-----|----------|---------------|
| Event-scoped custom dimension | 50 | 125 |
| User-scoped custom dimension | 25 | 100 |
| Item-scoped custom dimension | 10 | 25 |
| Custom metric | 50 | 125 |

> **Önemli:** Kaydetmeden önceki olaylar için **backfill yoktur**. Kayıt edildikten sonraki event'ler için doldurulur. Item-scoped dimension'lar **standart raporlarda görünmez**, sadece Explorations ve Data API'de.

**Bi'Talih için tipik custom dim'ler (öneri):**
- `customEvent:bet_amount_band` — bahis bandı (`<10TL`, `10-50TL`, `>50TL`)
- `customEvent:game_type` — `loto / kazikazan / ikr`
- `customUser:loyalty_tier` — `bronze / silver / gold / vip`
- `customUser:registration_source` — `web / app / referral`
- `customEvent:campaign_segment` — A/B test segmenti

---

## 3. Metrikler (Metrics)

### 3.1 Kullanıcı (User) Metrikleri

| API Name | UI Name (TR) | Veri Tipi | Açıklama | Hesaplama | Bi'Talih için Notu |
|----------|--------------|-----------|----------|-----------|---------------------|
| `activeUsers` | Aktif kullanıcı | INTEGER | Engaged session yapan distinct user | Session bazında engaged kriteri | Ana KPI — günlük aktif oyuncu |
| `totalUsers` | Toplam kullanıcı | INTEGER | Hiç event tetikleyen tüm distinct user | | Reach metriği |
| `newUsers` | Yeni kullanıcı | INTEGER | İlk kez `first_visit` / `first_open` tetikleyen | | Acquisition |
| `returningUsers` | Dönen kullanıcı | INTEGER | 1+ önceki session'ı olan | `totalUsers - newUsers` | Retention |
| `1dayActiveUsers` | 1g aktif | INTEGER | Son 1 günde aktif | Rolling | DAU |
| `7dayActiveUsers` | 7g aktif | INTEGER | Son 7 günde aktif | Rolling | WAU |
| `28dayActiveUsers` | 28g aktif | INTEGER | Son 28 günde aktif | Rolling | MAU (28-day) |
| `30dayActiveUsers` | 30g aktif | INTEGER | Son 30 günde aktif | Rolling | Calendar MAU |
| `dauPerMau` | DAU/MAU | PERCENT | Stickiness oranı | 1day / 28day | Bağımlılık göstergesi — şans oyunlarında ÖNEMLİ |
| `dauPerWau` | DAU/WAU | PERCENT | | 1day / 7day | |
| `wauPerMau` | WAU/MAU | PERCENT | | 7day / 28day | |
| `userEngagementDuration` | Kullanıcı etkileşim süresi (top.) | SECONDS | Toplam ön plan süresi (saniye) | Sum across users | |

### 3.2 Oturum (Session) Metrikleri

| API Name | UI Name (TR) | Veri Tipi | Açıklama | Hesaplama | Notu |
|----------|--------------|-----------|----------|-----------|------|
| `sessions` | Oturumlar | INTEGER | Toplam oturum sayısı | | |
| `engagedSessions` | Etkileşimli oturum | INTEGER | 10sn+ veya 2+ pageview veya conversion'lı | | |
| `sessionsPerUser` | Kullanıcı başına oturum | FLOAT | | `sessions / totalUsers` | Tekrar gelme sıklığı |
| `averageSessionDuration` | Ort. oturum süresi | SECONDS | | `userEngagementDuration / sessions` | |
| `bounceRate` | Çıkma oranı | PERCENT | | `1 - engagementRate` | UA'dan farklı tanım |
| `engagementRate` | Etkileşim oranı | PERCENT | | `engagedSessions / sessions` | GA4'te ana kalite metriği |

### 3.3 Olay (Event) Metrikleri

| API Name | UI Name (TR) | Veri Tipi | Açıklama | Hesaplama | Notu |
|----------|--------------|-----------|----------|-----------|------|
| `eventCount` | Olay sayısı | INTEGER | Tüm event toplamı | | |
| `eventCountPerUser` | Kullanıcı başına olay | FLOAT | | `eventCount / totalUsers` | |
| `eventValue` | Olay değeri | CURRENCY | `value` parametre toplamı | | |
| `eventsPerSession` | Oturum başına olay | FLOAT | | `eventCount / sessions` | |
| `keyEvents` | Key event sayısı | INTEGER | "Conversion" işaretli event'ler | | GA4'ün yeni "conversion" ismi |
| `conversions` | Dönüşümler | INTEGER | Geriye uyum için tutuldu | `keyEvents` ile aynı | Yeni kodlarda `keyEvents` tercih |
| `sessionKeyEventRate` | Oturum key event oranı | PERCENT | | `sessionsWithKeyEvent / sessions` | |
| `userKeyEventRate` | Kullanıcı key event oranı | PERCENT | | | |
| `firstTimePurchasers` | İlk kez satın alanlar | INTEGER | İlk purchase'ı yapan user sayısı | | New customer KPI |
| `firstTimePurchaserConversionRate` | İlk satın alma oranı | PERCENT | | `firstTimePurchasers / activeUsers` | |
| `firstTimePurchasersPerNewUser` | Yeni başına ilk satın alma | FLOAT | | `firstTimePurchasers / newUsers` | Acquisition kalitesi |

### 3.4 Sayfa / Ekran Metrikleri

| API Name | UI Name (TR) | Veri Tipi | Açıklama | Hesaplama |
|----------|--------------|-----------|----------|-----------|
| `screenPageViews` | Sayfa/Ekran görüntülemesi | INTEGER | `page_view` + `screen_view` toplamı | |
| `screenPageViewsPerSession` | Oturum başına | FLOAT | | `screenPageViews / sessions` |
| `screenPageViewsPerUser` | Kullanıcı başına | FLOAT | | `screenPageViews / activeUsers` |
| `scrolledUsers` | Scroll yapan kullanıcı | INTEGER | %90 scroll yapanlar | |

### 3.5 E-Ticaret Metrikleri

| API Name | UI Name (TR) | Veri Tipi | Açıklama | Bi'Talih için |
|----------|--------------|-----------|----------|---------------|
| `totalRevenue` | Toplam gelir | CURRENCY | Purchase + ad + subscription geliri | Tüm gelir |
| `purchaseRevenue` | Satın alma geliri | CURRENCY | Sadece `purchase` event'i | Bilet/oyun satış geliri |
| `refundAmount` | İade tutarı | CURRENCY | `refund` event'i | İptal/iade |
| `transactions` | İşlem sayısı | INTEGER | Eşsiz `transaction_id` | İşlem hacmi |
| `ecommercePurchases` | E-ticaret satın alma | INTEGER | `purchase` event sayısı | Satış event'i |
| `addToCarts` | Sepete ekleme | INTEGER | `add_to_cart` | Bilet seçim adımı |
| `checkouts` | Ödeme başlama | INTEGER | `begin_checkout` | Funnel ara adım |
| `itemsViewed` | Görüntülenen ürün | INTEGER | `view_item` (item-scoped) | Oyun karta bakma |
| `itemsAddedToCart` | Sepete eklenen ürün | INTEGER | (item) | |
| `itemsCheckedOut` | Ödemeye giden ürün | INTEGER | (item) | |
| `itemsPurchased` | Satılan ürün | INTEGER | (item) | Satılan bilet/oyun |
| `itemRevenue` | Ürün geliri | CURRENCY | Item-level revenue | Oyun bazında gelir |
| `itemDiscountAmount` | İndirim tutarı | CURRENCY | (item) | |
| `itemRefundAmount` | İade tutarı (item) | CURRENCY | | |
| `cartToViewRate` | Sepet/görüntüleme | PERCENT | `addToCarts / itemsViewed` | |
| `purchaseToViewRate` | Satın alma/görüntüleme | PERCENT | `purchasers / itemsViewed` | Conversion kalitesi |
| `purchaserConversionRate` | Satın alıcı dönüşüm oranı | PERCENT | `totalPurchasers / activeUsers` | |
| `averagePurchaseRevenue` | Ortalama satın alma | CURRENCY | `purchaseRevenue / transactions` | AOV |
| `averagePurchaseRevenuePerUser` | Kullanıcı başına ort. satın alma | CURRENCY | `purchaseRevenue / activeUsers` | |
| `averagePurchaseRevenuePerPayingUser` | Ödeyen başına ort. | CURRENCY | `purchaseRevenue / activePurchasers` | |
| `ARPU` | Kullanıcı başına gelir | CURRENCY | `totalRevenue / activeUsers` | Ana monetizasyon KPI |
| `ARPPU` | Ödeyen başına gelir | CURRENCY | `totalRevenue / activePurchasers` | Premium oyuncu değeri |
| `totalPurchasers` | Toplam satın alıcı | INTEGER | Distinct purchaser | |
| `activePurchasers` | Aktif satın alıcı | INTEGER | Aralıkta purchase yapan | |
| `transactionsPerPurchaser` | Alıcı başına işlem | FLOAT | `transactions / activePurchasers` | Tekrarlama sıklığı |

### 3.6 Reklam Maliyeti / ROI (Google Ads link gerektirir)

| API Name | Veri Tipi | Açıklama |
|----------|-----------|----------|
| `advertiserAdClicks` | INTEGER | Reklam tıklamaları |
| `advertiserAdCost` | CURRENCY | Toplam reklam harcaması |
| `advertiserAdImpressions` | INTEGER | Reklam gösterimleri |
| `advertiserAdCostPerClick` | CURRENCY | CPC = `cost / clicks` |
| `advertiserAdCostPerKeyEvent` | CURRENCY | CPA (key event başına) |
| `advertiserAdCostPerConversion` | CURRENCY | CPA (legacy) |
| `returnOnAdSpend` | FLOAT | ROAS = `totalRevenue / advertiserAdCost` |
| `crossDeviceConversions` | INTEGER | Cross-device dönüşüm |

### 3.7 Yayın Geliri (AdMob/AdSense)

| API Name | Veri Tipi | Açıklama |
|----------|-----------|----------|
| `publisherAdClicks` | INTEGER | Yayın reklam tıklamaları |
| `publisherAdImpressions` | INTEGER | Yayın gösterim |
| `totalAdRevenue` | CURRENCY | Tüm reklam geliri |

### 3.8 Cohort Metrikleri

`cohortSpec` ile birlikte:

| API Name | Açıklama |
|----------|----------|
| `cohortActiveUsers` | Cohort'taki aktif kullanıcı |
| `cohortTotalUsers` | Cohort'taki toplam kullanıcı |

### 3.9 Predictive Metrics (Tahmin Metrikleri)

> **Önemli:** Bunlar Data API üzerinden **doğrudan metric olarak çekilemez**. Yalnızca **Audience Builder** ve **Explorations** içinde kullanılabilir. API tarafından erişim için audience oluşturup `audienceName` boyutuyla raporlamak gerekir.

| Metrik | Tanım | Eşik (eligibility) |
|--------|-------|--------------------|
| **Purchase Probability** | Aktif kullanıcının önümüzdeki 7 gün içinde satın alma olasılığı | 7 günde 1.000+ pozitif + 1.000+ negatif örnek |
| **Churn Probability** | Son 7 günde aktif kullanıcının önümüzdeki 7 günde geri gelmeme olasılığı | Aynı eşik |
| **Predicted Revenue** | Aktif kullanıcının önümüzdeki 28 günde getireceği tahmini gelir | Sadece `purchase` / `in_app_purchase` event'leri destekler |

> **Bi'Talih notu:** Şans oyunu pazarında tekrar satın alma çok kritik. Predictive audience oluşturup Google Ads'e otomatik aktarım, retention kampanyalarında değerli.

### 3.10 Custom Metrics (Özel Metrikler)

| Format | Örnek |
|--------|-------|
| `customEvent:<param_name>` | `customEvent:bet_amount` |

Numeric event parametresini Admin UI'da custom metric olarak kaydedip API'de bu prefix ile çağırırsın. Limit: Standard 50, GA360 125 (per property).

---

## 4. Compatibility (Birlikte Sorgulanabilirlik)

### 4.1 Temel Kural

> *"Fields in the same FilterExpression need to be either all dimensions or all metrics."*

GA4 her dimension/metric için bir **scope** tutar: **event**, **session**, **user**, **item**. Her sorgu, dahili olarak en kısıtlayıcı scope'a düşer. Eğer scope'lar uzlaşamazsa API `INVALID_ARGUMENT` döner ve sonuç boş gelir.

### 4.2 INCOMPATIBLE Tipik Örnekleri

| Kombinasyon | Sonuç | Sebep |
|-------------|-------|-------|
| `itemName` + `eventCount` | INCOMPATIBLE | Item-scope dim, event-scope metric |
| `itemName` + `sessions` | COMPATIBLE | Item dim → session metric (item event'i bir session'a aittir) |
| `itemName` + `itemRevenue` | COMPATIBLE | İkisi de item-scope |
| `sessionSource` + `eventCount` | INCOMPATIBLE (artık) | Bazı attribution dim'leri event-scope metric'le çakışır — `keyEvents` tercih |
| `sessionSource` + `keyEvents` | COMPATIBLE | Attribution dim → attribution-friendly metric |
| `firstUserSource` + `activeUsers` | COMPATIBLE | User-scope dim + user metric |
| `audienceName` + `purchaseRevenue` | COMPATIBLE | Audience genelde tüm metric'lerle uyumlu |
| `cohort*` + `nonCohort*` | INCOMPATIBLE | Cohort exploration ayrı request tipi |
| `customEvent:X` + `customUser:Y` aynı sorguda | Genelde INCOMPATIBLE | Scope farkı |

> **Genel pratik kural:**
> - **Item dim** + **item/user/session metric** → uyumlu
> - **Item dim** + **event metric** → INCOMPATIBLE
> - **Attribution dim** (`source`, `medium`, `campaign`) + **event metric** (`eventCount`) → INCOMPATIBLE; bunun yerine `sessions`, `keyEvents`, `activeUsers` kullan

### 4.3 checkCompatibility Endpoint

Sorguyu çalıştırmadan önce uyumluluğu test etmek için.

**HTTP:** `POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:checkCompatibility`

**Request body:**

```json
{
  "dimensions": [
    {"name": "sessionSource"},
    {"name": "itemName"}
  ],
  "metrics": [
    {"name": "eventCount"},
    {"name": "purchaseRevenue"}
  ],
  "compatibilityFilter": "INCOMPATIBLE"
}
```

**`compatibilityFilter` değerleri:**
- `COMPATIBLE` — sadece uyumluları döner
- `INCOMPATIBLE` — sadece uyumsuzları döner (debug için altın)
- `COMPATIBILITY_UNSPECIFIED` — hepsi (default)

**Response:**

```json
{
  "dimensionCompatibilities": [
    {
      "dimensionMetadata": { "apiName": "itemName", "uiName": "Item name" },
      "compatibility": "INCOMPATIBLE"
    }
  ],
  "metricCompatibilities": [
    {
      "metricMetadata": { "apiName": "eventCount", "uiName": "Event count" },
      "compatibility": "INCOMPATIBLE"
    }
  ]
}
```

### 4.4 Custom Dim Compatibility

Custom dimension'lar **kayıtlı oldukları scope**'la sınırlıdır:
- `customEvent:*` → sadece event-scope metric'lerle (eventCount, eventValue, vb.) güvenle birleşir
- `customUser:*` → user-scope metric'lerle
- `customItem:*` → item-scope metric'lerle (itemRevenue, itemsPurchased)

---

## 5. Filtreler (FilterExpression)

### 5.1 Sözdizimi

```
FilterExpression = oneof {
  andGroup: FilterExpressionList
  orGroup:  FilterExpressionList
  notExpression: FilterExpression
  filter: Filter
}

Filter = {
  fieldName: string  // dim veya metric API name
  oneof {
    stringFilter, inListFilter, numericFilter, betweenFilter, emptyFilter
  }
}
```

### 5.2 String Filter

| Alan | Değerler |
|------|----------|
| `matchType` | `EXACT`, `BEGINS_WITH`, `ENDS_WITH`, `CONTAINS`, `FULL_REGEXP`, `PARTIAL_REGEXP` |
| `value` | Eşleşme değeri |
| `caseSensitive` | `true` / `false` |

```json
{
  "filter": {
    "fieldName": "pagePath",
    "stringFilter": {
      "matchType": "BEGINS_WITH",
      "value": "/sans-oyunlari/",
      "caseSensitive": false
    }
  }
}
```

### 5.3 Numeric Filter

| Alan | Değerler |
|------|----------|
| `operation` | `EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL` |
| `value` | `{ "int64Value": "100" }` veya `{ "doubleValue": 99.5 }` |

```json
{
  "filter": {
    "fieldName": "sessions",
    "numericFilter": {
      "operation": "GREATER_THAN_OR_EQUAL",
      "value": { "int64Value": "100" }
    }
  }
}
```

### 5.4 Between Filter

```json
{
  "filter": {
    "fieldName": "purchaseRevenue",
    "betweenFilter": {
      "fromValue": { "doubleValue": 100.0 },
      "toValue":   { "doubleValue": 500.0 }
    }
  }
}
```

### 5.5 InList Filter

```json
{
  "filter": {
    "fieldName": "country",
    "inListFilter": {
      "values": ["Turkey", "Germany", "Netherlands"],
      "caseSensitive": false
    }
  }
}
```

### 5.6 Empty Filter

`(not set)` veya boş string yakalamak için.

```json
{
  "filter": {
    "fieldName": "sessionCampaignName",
    "emptyFilter": {}
  }
}
```

### 5.7 And / Or / Not Gruplama

```json
{
  "andGroup": {
    "expressions": [
      { "filter": { "fieldName": "country", "stringFilter": { "value": "Turkey" } } },
      { "orGroup": {
          "expressions": [
            { "filter": { "fieldName": "deviceCategory", "stringFilter": { "value": "mobile" } } },
            { "filter": { "fieldName": "deviceCategory", "stringFilter": { "value": "tablet" } } }
          ]
      }},
      { "notExpression": {
          "filter": { "fieldName": "sessionMedium", "stringFilter": { "value": "(none)" } }
      }}
    ]
  }
}
```

> **Not:** `dimensionFilter` ve `metricFilter` ayrıdır. Aynı `FilterExpression` içinde dim ve metric karıştırılamaz. `metricFilter`, SQL'in `HAVING` clause'una karşılık gelir (aggregation sonrası).

---

## 6. Sıralama (orderBys)

```json
{
  "orderBys": [
    {
      "metric": { "metricName": "purchaseRevenue" },
      "desc": true
    },
    {
      "dimension": {
        "dimensionName": "date",
        "orderType": "ALPHANUMERIC"
      },
      "desc": false
    }
  ]
}
```

**OrderBy tipleri:**

| Tip | Açıklama |
|-----|----------|
| `metric` | Metrik değerine göre |
| `dimension` | Dimension değerine göre |
| `pivot` | runPivotReport içinde, belirli pivot'a göre |

**Dimension `orderType`:**
- `ALPHANUMERIC` — alfabetik
- `CASE_INSENSITIVE_ALPHANUMERIC`
- `NUMERIC` — sayısal yorum (ör. `hour`)

---

## 7. Quotas & Limitler (Detay)

### 7.1 Token-Tabanlı Sistem

GA4 Data API **request başına token** harcar. Tüketim:
- Genelde tek istek **10 token veya altı**
- Karmaşık istek (uzun tarih aralığı, yüksek kardinalite, çok dim) **daha fazla token**
- Tüketimi izlemek için her request'e `"returnPropertyQuota": true` ekle → response'ta `propertyQuota` objesi gelir

### 7.2 Standard Property Limitleri

| Quota | Limit |
|-------|-------|
| Core tokens / gün | **200.000** |
| Core tokens / saat | **40.000** |
| Core tokens / proje / property / saat | **14.000** |
| Core eşzamanlı istek | **10** |
| Core server error / proje / property / saat | **10** |
| Realtime tokens / gün | 200.000 |
| Realtime tokens / saat | 40.000 |
| Realtime tokens / proje / property / saat | 14.000 |
| Realtime eşzamanlı istek | 10 |
| Funnel tokens / gün | 200.000 |
| Funnel tokens / saat | 40.000 |
| Funnel tokens / proje / property / saat | 14.000 |
| Funnel eşzamanlı istek | 10 |
| **Potentially Thresholded Requests / saat** | **120** |

### 7.3 Analytics 360 (GA360) Property Limitleri

Tüm limitler **10×** daha yüksek:

| Quota | Limit |
|-------|-------|
| Core tokens / gün | **2.000.000** |
| Core tokens / saat | 400.000 |
| Core tokens / proje / property / saat | 140.000 |
| Core eşzamanlı istek | 50 |
| (Realtime/Funnel için aynı oranlar) | |

> **Doğrulama gerekli:** GA360 için Thresholded request/saat değeri Google quota sayfasında ayrı belirtilmemiş — pratikte 1200/saat olduğu varsayılır.

### 7.4 Hard Limits (Request Şeması)

| Limit | Değer |
|-------|-------|
| `limit` (max satır / istek) | **250.000** |
| `limit` default | 10.000 |
| `batchRunReports` içindeki rapor sayısı | **5** |
| `dimensions` array max | **(doğrulama gerekli)** — pratikte 9 dim, eskiden UA'da 9'du. Resmi schema "no cap" diyor ama compatibility önce patlar |
| `metrics` array max | **(doğrulama gerekli)** — pratikte 10 metric civarı |
| `dateRanges` array max | **4** (UA'dan miras; v1beta için resmi cap doğrulanmadı) |
| `orderBys` array max | **(doğrulama gerekli)** |

> **Önemli:** Resmi `runReport` REST referansında bu alanlar için açık `maxItems` cap'i belirtilmiyor. Pratik test gerekli; istek fazla şişerse `INVALID_ARGUMENT` veya yüksek token tüketimi alırsın.

### 7.5 Sampling

GA4 Data API **Standard property'de sampling YAPMAZ** (Looker Studio gibi UI tool'lar bazen yapar). 250.000 satır cap'inde tüm satırlar real, ama cap aşılınca alt satırlar `(other)` bucket'ına atılır.

GA360'da explorations sampling yapabilir ama Data API çoğu durumda unsampled.

### 7.6 Cardinality & `(other)` Row

- GA4'te kardinalite eşiği günlük **50.000 unique value** civarında
- Yüksek kardinaliteli dimension'lar (`pagePath`, `clientId`, `userId`, eventName ile kombinasyonlar) bu cap'i aşarsa alt satırlar **`(other)`** olarak gruplanır
- Çözüm: Filter ile pre-aggregation, veya BigQuery export

### 7.7 Threshold (Low Data) Suppression

Aşağıdaki dimension'lar küçük örneklemde **gizlenir** (kullanıcı kimliği koruma):
- `userAgeBracket`, `userGender`, `brandingInterest`
- `audienceId`, `audienceName`

Eşiği aşmayan veri `(other)` veya tamamen kaldırılır.

### 7.8 Tarih Aralığı Limiti

| Property tipi | Veri tutma süresi (default) | Max query window |
|---------------|------------------------------|------------------|
| Standard | **14 ay** (Property Settings'ten 2 ay'a düşürülebilir) | 14 ay (data retention'a bağlı) |
| GA360 | **50 ay**'a kadar konfigüre edilebilir | Config'e bağlı |

> **Not:** Hesabınız ayda 25 milyar event'i aşarsa Google retention'ı **2 ay**'a otomatik düşürür.

### 7.9 Data Freshness (Veri Tazeliği)

- **Realtime API:** Son 30 dakika, neredeyse anlık
- **Intraday data (Standard):** Önceki güne ait kısmi data, gün içinde birkaç kez güncellenir
- **Daily data (final):** Standard property'de **24-48 saat** içinde kesinleşir
- **GA360 Intraday SLA:** Daha sık (saatlik) güncellenir

### 7.10 Hata Kodları

| HTTP / Status | Anlam |
|---------------|-------|
| `400 INVALID_ARGUMENT` | Dimension/metric tipo, INCOMPATIBLE kombinasyon, geçersiz filter |
| `403 PERMISSION_DENIED` | Service account property'ye eklenmemiş |
| `429 RESOURCE_EXHAUSTED` | Token / concurrency / rate aşımı |
| `500 / 503` | Google tarafı; exponential backoff ile retry |

---

## 8. Realtime API

### 8.1 Endpoint

```
POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runRealtimeReport
```

### 8.2 Farkları

- **dateRanges YOK** — pencere sabit: **son 30 dakika**
- Çok daha **kısıtlı** dimension/metric subset
- **Custom event-scoped dim/metric desteklenmez**, sadece `customUser:*` çalışır
- Quota ayrıdır (200K token/gün — Standard)

### 8.3 Desteklenen Dimensions (Realtime)

| API Name | Açıklama |
|----------|----------|
| `appVersion` | Uygulama sürümü |
| `audienceId` / `audienceName` / `audienceResourceName` | Kitle |
| `city`, `cityId`, `country`, `countryId` | Coğrafya |
| `deviceCategory` | Cihaz |
| `eventName` | Olay adı |
| `minutesAgo` | **Realtime'a özel** — kaç dakika önce (00 = şu an, 29 = 30dk önce) |
| `platform` | web/iOS/Android |
| `streamId`, `streamName` | Stream |
| `unifiedScreenName` | Web title / App screen |
| `customUser:<name>` | User-scoped custom dim |

### 8.4 Desteklenen Metrics (Realtime)

| API Name | Açıklama |
|----------|----------|
| `activeUsers` | Anlık aktif kullanıcı |
| `eventCount` | Olay sayısı |
| `keyEvents` | Key event sayısı |
| `screenPageViews` | Sayfa/ekran görüntüleme |

### 8.5 Use-Case (Bi'Talih)

- **Canlı kampanya monitoring:** Yeni reklam yayınlandı, son 30dk'da kaç oyuncu landing page'e geldi
- **Çekiliş anı:** Çekiliş öncesi/sonrası 30dk trafik patlaması
- **Push bildirimi:** Bildirim atıldı, anlık `activeUsers` artışı
- **Sistem outage tespiti:** `eventCount` aniden düştü mü

---

## 9. Custom Dimensions / Metrics — Detay

### 9.1 Scope Karşılaştırması

| Scope | Kullanım | Örnek (Bi'Talih) | Standard limit | GA360 limit |
|-------|----------|------------------|----------------|-------------|
| **Event** | Belirli event'e bağlı parametre | `bet_amount_band`, `game_type`, `promo_code` | 50 | 125 |
| **User** | Kullanıcının kalıcı özelliği | `loyalty_tier`, `kyc_status`, `lifetime_value_band` | 25 | 100 |
| **Item** | E-ticaret items[] içindeki parametre | `bilet_serisi`, `oyun_kategorisi` | 10 | 25 |

### 9.2 Kayıt Süreci

1. Tag/SDK'da event veya user property tetiklenir (`gtag('event', 'bet_placed', { bet_amount_band: '10-50' })`)
2. Admin → **Custom Definitions** → **Create custom dimension**
3. Event Parameter / User Property scope seç, `parameter_name` ile bağla
4. Kayıttan sonraki event'ler için raporda görünür (**backfill yok**)

### 9.3 API'de Referans

```json
{
  "dimensions": [
    { "name": "customEvent:bet_amount_band" },
    { "name": "customUser:loyalty_tier" },
    { "name": "customItem:game_subtype" }
  ],
  "metrics": [
    { "name": "customEvent:total_stake" }
  ]
}
```

### 9.4 Sınırlamalar

- Item-scoped custom dim **standart raporlarda görünmez**, sadece Explorations + Data API
- Custom metric mutlaka **numeric** parametreden gelmeli
- Custom dim/metric isimleri **case-sensitive**
- Silindiğinde slot serbest kalır ama **historical değerler kaybolmaz** (event'ler hala parametreyi taşır, sadece raporlanamaz)

---

## 10. Bi'Talih için Önerilen Sorgu Kalıpları

### 10.1 Kanal Bazında Günlük Kullanıcı + Dönüşüm + Gelir

```json
{
  "dateRanges": [{ "startDate": "30daysAgo", "endDate": "yesterday" }],
  "dimensions": [
    { "name": "date" },
    { "name": "sessionDefaultChannelGroup" }
  ],
  "metrics": [
    { "name": "activeUsers" },
    { "name": "newUsers" },
    { "name": "sessions" },
    { "name": "engagementRate" },
    { "name": "keyEvents" },
    { "name": "purchaseRevenue" }
  ],
  "orderBys": [
    { "dimension": { "dimensionName": "date" }, "desc": false },
    { "metric": { "metricName": "purchaseRevenue" }, "desc": true }
  ]
}
```

### 10.2 Landing Page Bazında Engagement + Çıkma

```json
{
  "dateRanges": [{ "startDate": "7daysAgo", "endDate": "yesterday" }],
  "dimensions": [
    { "name": "landingPagePlusQueryString" },
    { "name": "deviceCategory" }
  ],
  "metrics": [
    { "name": "sessions" },
    { "name": "engagedSessions" },
    { "name": "engagementRate" },
    { "name": "bounceRate" },
    { "name": "averageSessionDuration" },
    { "name": "screenPageViewsPerSession" },
    { "name": "keyEvents" }
  ],
  "metricFilter": {
    "filter": {
      "fieldName": "sessions",
      "numericFilter": {
        "operation": "GREATER_THAN_OR_EQUAL",
        "value": { "int64Value": "50" }
      }
    }
  },
  "orderBys": [
    { "metric": { "metricName": "sessions" }, "desc": true }
  ],
  "limit": 100
}
```

### 10.3 Cihaz × Trafik Kaynağı Bazında Purchase Funnel

```json
{
  "dateRanges": [{ "startDate": "30daysAgo", "endDate": "yesterday" }],
  "dimensions": [
    { "name": "deviceCategory" },
    { "name": "sessionSource" },
    { "name": "sessionMedium" }
  ],
  "metrics": [
    { "name": "sessions" },
    { "name": "addToCarts" },
    { "name": "checkouts" },
    { "name": "transactions" },
    { "name": "purchaseRevenue" },
    { "name": "ARPU" }
  ],
  "dimensionFilter": {
    "filter": {
      "fieldName": "country",
      "stringFilter": { "value": "Turkey" }
    }
  }
}
```

### 10.4 Yeni vs Dönen Kullanıcı LTV Karşılaştırma

```json
{
  "dateRanges": [{ "startDate": "90daysAgo", "endDate": "yesterday" }],
  "dimensions": [
    { "name": "newVsReturning" },
    { "name": "sessionDefaultChannelGroup" }
  ],
  "metrics": [
    { "name": "activeUsers" },
    { "name": "sessions" },
    { "name": "sessionsPerUser" },
    { "name": "purchaseRevenue" },
    { "name": "ARPU" },
    { "name": "averagePurchaseRevenuePerUser" },
    { "name": "transactionsPerPurchaser" }
  ]
}
```

### 10.5 Saatlik Trafik & Conversion Pattern (Pik saat tespiti)

```json
{
  "dateRanges": [{ "startDate": "14daysAgo", "endDate": "yesterday" }],
  "dimensions": [
    { "name": "dayOfWeekName" },
    { "name": "hour" }
  ],
  "metrics": [
    { "name": "activeUsers" },
    { "name": "sessions" },
    { "name": "keyEvents" },
    { "name": "purchaseRevenue" }
  ],
  "orderBys": [
    { "dimension": { "dimensionName": "dayOfWeekName" }, "desc": false },
    {
      "dimension": { "dimensionName": "hour", "orderType": "NUMERIC" },
      "desc": false
    }
  ]
}
```

### 10.6 Oyun (Item) Bazında Performans

```json
{
  "dateRanges": [{ "startDate": "30daysAgo", "endDate": "yesterday" }],
  "dimensions": [
    { "name": "itemCategory" },
    { "name": "itemName" }
  ],
  "metrics": [
    { "name": "itemsViewed" },
    { "name": "itemsAddedToCart" },
    { "name": "itemsPurchased" },
    { "name": "itemRevenue" },
    { "name": "cartToViewRate" },
    { "name": "purchaseToViewRate" }
  ],
  "orderBys": [
    { "metric": { "metricName": "itemRevenue" }, "desc": true }
  ],
  "limit": 50
}
```

### 10.7 Kampanya UTM × Loyalty Tier (Custom dim) Cross-Tab

```json
{
  "dateRanges": [{ "startDate": "30daysAgo", "endDate": "yesterday" }],
  "dimensions": [
    { "name": "sessionCampaignName" },
    { "name": "customUser:loyalty_tier" }
  ],
  "metrics": [
    { "name": "activeUsers" },
    { "name": "purchaseRevenue" },
    { "name": "ARPPU" },
    { "name": "transactionsPerPurchaser" }
  ],
  "dimensionFilter": {
    "andGroup": {
      "expressions": [
        {
          "filter": {
            "fieldName": "sessionCampaignName",
            "stringFilter": { "matchType": "BEGINS_WITH", "value": "yilbasi_" }
          }
        },
        {
          "notExpression": {
            "filter": {
              "fieldName": "customUser:loyalty_tier",
              "emptyFilter": {}
            }
          }
        }
      ]
    }
  }
}
```

---

## 11. Kısıtlar / Bilinen Sorunlar

### 11.1 Cardinality `(other)`

- Pattern: Yüksek kardinaliteli dim'i (`pagePath`, `pageTitle`, `eventName + parametre`) tarih aralığı geniş tutarsan ilk N satır gerçek, geri kalan `(other)` bucket'ına düşer
- **Çözüm:** Tarihi günlük parçala, filter ile pre-aggregate, BigQuery export

### 11.2 Threshold Suppression

- `userAgeBracket`, `userGender`, `audienceId`, `audienceName`, `brandingInterest` dim'leri küçük örneklemde **gizlenir**
- Cevapta `metadata.dataLossFromOtherRow: true` gelirse veri kayıbı uyarısı

### 11.3 Atribusyon Modeli Değişikliği (2023+)

- **Last-click → Data-driven attribution (DDA)** geçişi tüm yeni mülklerde varsayılan
- Geçmişteki UA verisiyle birebir karşılaştırılamaz
- API tarafından attribution model **seçilemez**, mülk ayarındaki kullanılır

### 11.4 Predictive Metric API'de Yok

- Purchase/Churn probability + Predicted revenue **doğrudan metric değildir**
- Audience oluşturup `audienceName` ile dolaylı çekilir

### 11.5 BigQuery Export Alternatifi

- Free GA4 mülklerinde **BigQuery Export ücretsiz** (sınırlı günlük 1M event)
- Cardinality, sampling, threshold sorunlarını **çözer** — ham event tablosu
- Bi'Talih ölçeğinde **kesinlikle önerilir** — sadece API'ye bağımlı kalmayın

### 11.6 v1beta vs Stabil v1

- Şu an stabil sürüm `v1beta` (Google "stable beta" kabul ediyor)
- `runFunnelReport` **v1alpha**'da, breaking change riski yüksek

### 11.7 Cross-Domain & Subdomain

- `hostName` farklı subdomain'leri ayırır
- Cross-domain tracking için `gtag` config'inde `linker` ayarı gerekir, API tarafında ek konfig yok

---

## 12. Referanslar

- **API Schema (Dimensions & Metrics):** https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- **runReport metodu:** https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- **checkCompatibility metodu:** https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/checkCompatibility
- **runRealtimeReport:** https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runRealtimeReport
- **Realtime API Schema:** https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema
- **Exploration / Funnel Schema:** https://developers.google.com/analytics/devguides/reporting/data/v1/exploration-api-schema
- **Quotas & Limits:** https://developers.google.com/analytics/devguides/reporting/data/v1/quotas
- **FilterExpression schema:** https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/FilterExpression
- **Create a report (Basics):** https://developers.google.com/analytics/devguides/reporting/data/v1/basics
- **Custom dimensions & metrics:** https://support.google.com/analytics/answer/14240153
- **Predictive metrics:** https://support.google.com/analytics/answer/9846734
- **Predictive audiences:** https://support.google.com/analytics/answer/9805833
- **Cardinality:** https://support.google.com/analytics/answer/12226705
- **(other) row:** https://support.google.com/analytics/answer/13331684
- **Data freshness SLA:** https://support.google.com/analytics/answer/12233314
- **Data compatibility (UI helper):** https://support.google.com/analytics/answer/11608978
- **Quota management blog:** https://developers.google.com/analytics/blog/2023/data-api-quota-management
- **Changelog:** https://developers.google.com/analytics/devguides/reporting/data/v1/changelog
