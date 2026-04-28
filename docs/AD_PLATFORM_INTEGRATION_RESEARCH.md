# Reklam Platformları ve Attribution API Entegrasyon Araştırması
## RakipAnaliz Projesi - GA4 / Adjust / AppsFlyer / Reklam Platformları

**Tarih:** 22 Nisan 2026  
**Proje:** RakipAnaliz (Bi'Talih)  
**Amaç:** Reklam harcamaları, kampanya performansı ve attribution verilerinin 
tek panoda toplanması için platform ve servis karşılaştırması

---

## 1. REKLAM PLATFORM LARI API'LERI

### 1.1 Google Ads API

**Spend (Harcama):** Evet - `Campaign.budget.amount_micros`, `CampaignSpendingIndicator`  
**Install:** Hayır - direkt install verisi yok, ` clicks`, ` impressions`, ` cost_micros` mevcut  
**Register/Purchase:** Evet - `ConversionAction` ile tüm event'ler çekilebilir  
**API Status:** Tam fonksiyonel

```
API Versiyon: v21
Ana Endpoint: https://googleads.googleapis.com/v21
Gerekli izinler: Google Ads API > Google Ads account > MCC ya da individual account
Yetkilendirme: OAuth2
```

**Auction Insights / Impression Share:** Evet
- `ad_group.impression_share` 
- `campaign.search_impression_share`  
- `campaign.absolute_top_impression_percentage`
- `campaign.top_impression_percentage`
- `metrics.search_absolute_top_impression_share`
- `metrics.search_top_impression_share`

**Search Volume:** Keyword Planner API ile ayrı, `search_volume` field'ı mevcut
- `keyword_view.search_volume`

**Maliyet:** Ücretsiz API (quota limitleri var, 10.000 request/gün standart)
**Kısıtlar:** MCC hesabı gerekli, onay süreci 5-10 iş günü

**Veri Cekebilecek Alanlar:**
- Spend, Impressions, Clicks, CTR, CPC, Conversions
- Auction insights (rakiplerin payı)
- Search terms raporları
- Geolocation performans
- Device breakdown

---

### 1.2 TikTok Ads API

**Spend:** Evet - `campaign/daily_stats`, `advertiser/info`
**Install:** Evet - `app_download` conversion tracking mevcut
**Register/Purchase:** Evet - `payment` event'leri, `complete_order` event'leri
**API Status:** Tam fonksiyonel

```
API Versiyon: v1.3 / v2.0
Ana Endpoint: https://business-api.tiktok.com/portal/api
Gerekli izinler: TikTok for Business hesabı > Business Center > App token
Yetkilendirme: OAuth2 / Access Token
```

**Maliyet:** Ücretsiz (rate limit: 1000 req/s standart)
**Kısıtlar:** Onaylı TikTok Business hesabı gerekli, S2S (server-to-server) 
event tracking için extra kurulum

**Veri Cekebilecek Alanlar:**
- Spend, Impressions, Clicks, CTR, CPC, Video views
- App install, Register, Purchase events
- Audience demographics
- Placement breakdown (Feed, Story, vs.)

---

### 1.3 X Ads API (Twitter/X)

**Spend:** Evet - `stats/jobs/create` ile async raporlar
**Install:** Kısıtlı - mobile app promotion mevcut ama limited
**Register/Purchase:** Evet - `conversion` events, `purchase` event tracking
**API Status:** Fonksiyonel ama dökümantasyon yetersiz

```
API Versiyon: v12
Ana Endpoint: https://api.twitter.com/2
Gerekli izinler: X Ads account > Dev portal > Elevated / Basic access
Yetkilendirme: OAuth 2.0
```

**Maliyet:** Ücretsiz (quota: 500.000 tweets/month, 10.000 ADS API req/24h)
**Kısıtlar:** Karmaşık OAuth kurulumu, async raporlamada gecikme (15-60 dk)

---

### 1.4 Taboola API

**Spend:** Evet - `campaigns/get`, `campaign analytics`
**Install:** Evet - `conversion` events
**Register/Purchase:** Evet - `post-click conversions` raporları
**API Status:** Tam fonksiyonel

```
API: Backstage API
Versiyon: v1.0
Endpoint: https://backstage.taboola.com/{account_name}/api/1.0/
Yetkilendirme: Basic Auth / Token
```

**Maliyet:** Taboola hesabı gerekli (genellikle reklam bütçesi olanlara açık)
**Veri Cekebilecek Alanlar:**
- Spend, Impressions, Clicks, CTR, CPC
- Conversion events (install, register, purchase)
- Placement, Widget, Publisher breakdown

---

### 1.5 iOS App Store Connect (Apple Search Ads)

**Spend:** Evet - `Search Ads Campaign Reporting API`
**Install:** Evet - `installs` metrics
**Register/Purchase:** Kısıtlı - App Store Connect Analytics API ile view-through
**API Status:** Apple Business Seller hesabı gerektirir

```
API: Apple Business Essentials / App Store Connect API
Endpoint: https://api.appstoreconnect.apple.com/v1/
Yetkilendirme: App Store Connect API Key (JWT)
```

**Maliyet:** Ücretsiz API erişimi (belli quota limitleri)
**Kısıtlar:** Sadece kendi uygulamaların için veri, IDFA/ATT karmaşası

**Veri Cekebilecek Alanlar:**
- Spend, Impressions, TTR, Clicks
- Install, Redownload, Reinstall
- Conversion events (in-app events)
- Audience: Age, Gender, Country

---

## 2. ATTRIBUTION PLATFORMLARI

### 2.1 Adjust

**Ne sunuyor:**
- Mobile attribution (SDK-based)
- Event tracking (install, session, in-app event)
- Cohort analizi
- Ad spend import (Google, FB, TikTok, etc.)
- Fraud detection

**API Durumu:** Evet - Adjust API (kullanıma açık)

```
Endpoints:
- https://api.adjust.com/dashboard/v1/... (legacy)
- https://events.adjust.com/... (event ingestion)
```

**Spend Import:** Evet
- Google Ads, Meta, TikTok, Apple Search Ads, Unity Ads, ironSource, Vungle, AppLovin
- `https://api.adjust.com/dashboard/v1/cost_objects` ile cost import

**Event Verileri:**
- `session_count`, `event_count`, `revenue`
- Custom in-app events
- Install, reattribution, reinstall

**Maliyet:** Ücretli (Volume-based pricing, ücretsiz deneme yok)
**Kısıt:** SDK kurulumu gerektirir (mevcut RakipAnaliz projesinde yok)

---

### 2.2 AppsFlyer

**Ne sunuyor:**
- Mobile & Web attribution
- OneLink (deep linking)
- Event tracking
- Audience management
- Ad revenue analytics
- Retargeting

**API Durumu:** Evet - AppsFlyer API

```
API: https://hq1.appsflyer.com/api/
Endpoints:
- /v1/agg/{app_id}/bydate - daily aggregates
- /v1/events/{app_id} - raw events
- /v1/organizations - org data
- /pull_api/v1/cost_export - cost import
```

**Spend Import:** Evet - `pull_api/v1/cost_export`
- Google, Meta, TikTok, Apple Search Ads, Snapchat, Twitter, ve daha fazlası

**Event Verileri:**
- `installs`, `sessions`, `in_app_events`
- `purchase`, `register`, `custom_events`
- Revenue, LTV, ARPU

**Maliyet:** Ücretli (freemium yok, enterprise pricing)
**Kısıt:** SDK kurulumu gerektirir

---

### 2.3 Branch.io

**Ne sunuyor:**
- Cross-platform attribution
- Deep linking
- Universal links
- QR code analytics
- Web-to-app bridging

**API Durumu:** Evet - Branch API

```
API: https://api2.branch.io/v2/
Endpoints:
- /v1/event - custom events
- /v1/export/{app_id}/csv/{type} - data export
- /v1/credit_balance - points/credits
```

**Spend Import:** Kısıtlı - dış reklam platformları ile native entegrasyon yok
**Maliyet:** Ücretli (free tier: 10K monthly active users)

---

### 2.4 Singular

**Ne sunuyor:**
- Attribution
- Marketing analytics
- Ad spend aggregation
- ROI measurement
- Fraud prevention

**API Durumu:** Evet - Singular API

```
API: https://api.singular.io/v1/
Endpoints:
- /campaigns - campaign list
- /aggregate - aggregate data
- /events - raw events
```

**Spend Import:** Evet - otomatik (Google, Meta, TikTok, Apple, vs.)
**Maliyet:** Ücretli (enterprise level)

---

## 3. GA4 (Google Analytics 4) ENTEGRASYONU

### 3.1 GA4 Measurement Protocol

Server-side event gönderimi için:

```
POST https://www.google-analytics.com/mp/collect?measurement_id={GA4_MEASUREMENT_ID}&api_secret={API_SECRET}
```

**Payload:**
```json
{
  "client_id": "CLIENT_ID",
  "events": [{
    "name": "purchase",
    "params": {
      "currency": "USD",
      "value": 1.0,
      "transaction_id": "T_12345"
    }
  }]
}
```

**Kullanım Alanları:**
- Server-side event tracking (web veya mobile SDK olmadan)
- Offline conversions import
- CRM data integration
- Backend purchase event'leri

### 3.2 GA4 Data API

```
Endpoint: https://analyticsdata.googleapis.com/v1beta/
Reports: /properties/{property_id}:runReport
```

**RunReport ile cekilebilecek veriler:**
- Sessions, Users, New users
- Conversions, Revenue
- Events, Event counts
- Demographics, Device, Geography
- Traffic sources

**Gereksinimler:**
- Google Cloud Project
- GA4 property
- OAuth2 / Service Account
- Data API enabled

### 3.3 GA4 + BigQuery Entegrasyonu

GA4 > BigQuery export ile:
- Raw event stream (tüm event verileri)
- Daily (veya streaming) export
- Sorgulanabilir veri
- Daha detaylı funnel analizi

**Kurulum:** GA4 Admin > Product links > BigQuery links

### 3.4 GA4 + Google Ads Entegrasyonu

- GA4 conversions > Google Ads import
- Google Ads > GA4 data (linked accounts)
- Click ID (gclid) matching

---

## 4. TEK PANO (UNIFIED DASHBOARD) SECENEKLERI

### 4.1 Looker (Google Cloud)

**Artıları:**
- Google Ads, GA4, YouTube verileri native
- BigQuery entegrasyonu
- Esnek dashboard design
- Embeddable

**Eksileri:**
- Pahalı (enterprise)
- Karmaşık kurulum

### 4.2 Supermetrics

**Artıları:**
- 100+ data source (Google Ads, Meta, TikTok, Twitter, Taboola, Adjust, AppsFlyer)
- Google Sheets, Looker Studio, BigQuery export
- Scheduled raporlar

**Eksileri:**
- Abonelik tabanlı
- Sadece export, raw API değil

### 4.3 Rakam (Türkish)

**Artıları:**
- Türkçe destek
- Google Ads, Meta, TikTok, GA4

**Eksileri:**
- Sınırlı data sources
- Attribution platform entegrasyonu yok

### 4.4 Sistemin Alan (Custom In-House)

**Entegrasyon mimarisi:**

```
Data Sources          Data Layer            Dashboard
─────────────────────────────────────────────────────
Google Ads API    ──>  PostgreSQL     ──>  Next.js
TikTok Ads API    ──>  ETL Pipeline   ──>  Dashboard
X Ads API         ──>  (mevcut scraper ──>  RakipAnaliz)
Taboola API       ──>  ile entegre)   ──>
Adjust API        ──>
AppsFlyer API     ──>
GA4 Data API      ──>
```

**Artıları:**
- Tam kontrol
- Mevcut PostgreSQL + Next.js altyapısına entegre
- RakipAnaliz scraper mantığı ile uyumlu

**Eksileri:**
- Geliştirme süresi
- Her API için ayrı connector gerekli

---

## 5. ACIK KAYNAK ALTERNATIVELER

### 5.1 Airbyte

**Artıları:**
- 300+ connector
- Cloud ve self-hosted
- CDC (Change Data Capture)
- Open-source

**Destekledikleri:**
- Google Ads, Google Analytics
- Facebook/TikTok/Twitter (marketing APIs)
- AppsFlyer, Adjust (raw data export)
- PostgreSQL, BigQuery

**Kurulum:** Docker-compose ile local, veya cloud

### 5.2 Metabase

**Artıları:**
- Open-source BI tool
- PostgreSQL, BigQuery, MySQL baglantıları
- Embeddable dashboard
- Türkçe arayüz desteği

**Kullanim:** RakipAnaliz PostgreSQL DB'sine direkt baglanabilir

### 5.3 Grafana

**Artıları:**
- Open-source
- PostgreSQL, InfluxDB, Prometheus baglantıları
- Real-time dashboard
- Alerting

**Kullanim:** Backend metrics + campaign data visualization

### 5.4 Supabase (Holsitics Analytics)

- RakipAnaliz zaten Supabase kullaniyor
- Dashboard database olarak kullanilabilir
- Row Level Security ile veri guvenligi
- Realtime subs for live updates

---

## 6. MEVCUT RAKIPANALIZ PROJESINE ENTEGRE

### 6.1 Mevcut Durum

RakipAnaliz su an:
- Web scraping ile reklam kampanyalarını topluyor (11 Türk bahis sitesi)
- PostgreSQL (Supabase) ile veritabanı
- Next.js dashboard + API
- Scraper servisi (Node.js)

### 6.2 Önerilen Entegrasyon Yolu

**Phase 1: API Konnector Servisi**

```
apps/
  ├── dashboard/        (mevcut)
  ├── scraper/         (mevcut)
  └── connectors/      (YENI - API adapter service)
```

Yeni servis: `apps/connectors/`
- Her reklam platformu için adapter
- Scheduled job ile veri cekimi
- PostgreSQL'e veri yazimi

**Phase 2: Veritabani Tablolari**

```sql
-- Reklam platformu verileri
CREATE TABLE ad_spend (
  id UUID PRIMARY KEY,
  platform VARCHAR(50), -- 'google_ads', 'tiktok', 'taboola'
  campaign_id VARCHAR(255),
  campaign_name VARCHAR(255),
  date DATE,
  spend DECIMAL(12,2),
  impressions BIGINT,
  clicks BIGINT,
  installs BIGINT,
  registrations BIGINT,
  purchases BIGINT,
  revenue DECIMAL(12,2),
  currency VARCHAR(3),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE attribution_data (
  id UUID PRIMARY KEY,
  platform VARCHAR(50), -- 'adjust', 'appsflyer'
  event_date DATE,
  event_type VARCHAR(50), -- 'install', 'register', 'purchase'
  event_count BIGINT,
  revenue DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ga4_data (
  id UUID PRIMARY KEY,
  property_id VARCHAR(50),
  date DATE,
  sessions BIGINT,
  users BIGINT,
  new_users BIGINT,
  conversions BIGINT,
  revenue DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Phase 3: API Endpoints**

```
GET /api/ad-spend              - Reklam harcamaları listesi
GET /api/ad-spend/summary      - Özet raporlar
GET /api/attribution           - Attribution verileri
GET /api/ga4                   - GA4 metrikleri
POST /api/admin/sync/ads       - Manuel sync trigger
```

### 6.3 Ornek Implementasyon: Google Ads Connector

```typescript
// apps/connectors/src/platforms/google-ads.ts
import { GoogleAdsApi } from 'google-ads-api';

export class GoogleAdsConnector {
  private client: GoogleAdsApi;
  private customerId: string;

  constructor(config: { developerToken: string; clientId: string; clientSecret: string; refreshToken: string; }) {
    this.client = new GoogleAdsApi({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      developer_token: config.developerToken,
    });
    this.customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!;
  }

  async fetchCampaignStats(startDate: string, endDate: string) {
    const response = await this.client.report({
      customer_id: this.customerId,
      query: `
        SELECT 
          campaign.id,
          campaign.name,
          campaign.budget.amount_micros,
          metrics.cost_micros,
          metrics.impressions,
          metrics.clicks,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions,
          metrics.conversions_value,
          metrics.search_impression_share
        FROM campaign
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      `,
      date_range: { start_date: startDate, end_date: endDate },
    });

    return response;
  }

  async fetchAuctionInsights(startDate: string, endDate: string) {
    const response = await this.client.report({
      customer_id: this.customerId,
      query: `
        SELECT 
          campaign.name,
          metrics.search_impression_share,
          metrics.search_absolute_top_impression_share,
          metrics.search_top_impression_share,
          campaign_search_term_insight.search_term
        FROM campaign_search_term_insight
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      `,
    });

    return response;
  }
}
```

### 6.4 Ornek Implementasyon: AppsFlyer Connector

```typescript
// apps/connectors/src/platforms/appsflyer.ts
export class AppsFlyerConnector {
  private apiKey: string;
  private appId: string;

  constructor(config: { apiKey: string; appId: string; }) {
    this.apiKey = config.apiKey;
    this.appId = config.appId;
  }

  async fetchInstalls(startDate: string, endDate: string) {
    const url = `https://hq1.appsflyer.com/v1/agg/${this.appId}/bydate`;
    const params = new URLSearchParams({
      'api_key': this.apiKey,
      'from': startDate,
      'to': endDate,
      'groupings': 'date,agency,campaign_id,campaign_name,platform,os_version',
      'metrics': 'installs,sessions,loyal_sessions,installs_sessions,crash',
    });

    const response = await fetch(`${url}?${params}`);
    return response.json();
  }

  async fetchInAppEvents(startDate: string, endDate: string) {
    const url = `https://hq1.appsflyer.com/v1/events/${this.appId}`;
    const params = new URLSearchParams({
      'api_key': this.apiKey,
      'from': startDate,
      'to': endDate,
      'metrics': 'event_count,unique_users,revenue',
    });

    const response = await fetch(`${url}?${params}`);
    return response.json();
  }

  async fetchCostData(startDate: string, endDate: string) {
    const url = `https://pull_api.appsflyer.com/pull_api/v1/cost_export`;
    const params = new URLSearchParams({
      'api_key': this.apiKey,
      'app_id': this.appId,
      'from': startDate,
      'to': endDate,
    });

    const response = await fetch(`${url}?${params}`);
    return response.json();
  }
}
```

### 6.5 Ortam Degiskenleri

```env
# .env.example'a eklenecek

# Google Ads
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=

# TikTok Ads
TIKTOK_ACCESS_TOKEN=
TIKTOK_ADVERTISER_ID=

# X Ads
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_TOKEN_SECRET=

# Taboola
TABOOLA_ACCOUNT_NAME=
TABOOLA_API_KEY=

# Apple Search Ads
APPLE_SEARCH_ADS_API_KEY=
APPLE_SEARCH_ADS_CERT_PATH=

# Adjust
ADJUST_API_TOKEN=
ADJUST_APP_TOKEN=

# AppsFlyer
APPSFLYER_API_KEY=
APPSFLYER_APP_ID=

# GA4
GA4_PROPERTY_ID=
GA4_MEASUREMENT_ID=
GA4_API_SECRET=

# Connector Settings
CONNECTOR_SYNC_INTERVAL=86400  # 24 saat
CONNECTOR_RETRY_ATTEMPTS=3
```

---

## 7. MALIYET VE IZIN GEREKSINIMLERI

### 7.1 Platform Bazli Ozet

| Platform | API Ucreti | Onay Süreci | Zaman |
|----------|-----------|-------------|-------|
| Google Ads | Ücretsiz | MCC onayı | 5-10 iş günü |
| TikTok Ads | Ücretsiz | Business onayı | 3-5 iş günü |
| X Ads | Ücretsiz | Dev portal | 1-3 iş günü |
| Taboola | Ücretsiz | Account manager | 1-2 iş günü |
| Apple Search Ads | Ücretsiz | App Store Connect | 1 iş günü |
| Adjust | Ücretli | Sales ile görüş | Enterprise |
| AppsFlyer | Ücretli | Sales ile görüş | Enterprise |
| GA4 | Ücretsiz | Cloud project | 1 iş günü |

### 7.2 Zorunlu Izinler

**Google Ads:**
- MCC (My Client Center) hesabı veya direct access
- OAuth 2.0 consent screen
- Google Ads API quota request

**TikTok Ads:**
- TikTok for Business hesabı
- Business Center membership
- App token (OAuth 2.0)

**Adjust/AppsFlyer:**
- SDK entegrasyonu (mevcut proje için ek SDK gerekmez - sadece pull API)
- Admin panel erişimi
- Raporlama API erişim token

---

## 8. SONUC VE TAVSIYELER

### 8.1 Hemen Baslanabilecek (Düsük Efor)

1. **GA4 Data API** - En kolay entegrasyon, ücretsiz, mevcut web/mobil verisi ile
2. **Google Ads API** - En yüksek ROI, detaylı kampanya ve spend verisi
3. **TikTok Ads API** - Artan önem, iyi dokumentasyon

### 8.2 Orta Vadeli

4. **AppsFlyer / Adjust** - Sadece attribution verileri icin
5. **Taboola** - Taboola kullaniyorsaniz
6. **X Ads** - Dusuk öncelikli, API karmasik

### 8.3 Tek Pano Yaklasimi

**Onerilen:** Hybrid yaklasim
- Supermetrics veya Airbyte ile data collection (hizli baslangic)
- Mevcut RakipAnaliz Next.js dashboard'una embedded raporlar
- PostgreSQL + Metabase/Grafana ile ileri analitik

### 8.4 Entegrasyon Sirası

```
1. GA4 Data API       (1 hafta)  - Web analytics
2. Google Ads API     (2 hafta) - PPC spend & performance  
3. TikTok Ads API     (2 hafta) - TikTok campaigns
4. AppsFlyer/Adjust   (2 hafta) - Attribution
5. Taboola API        (1 hafta) - Native advertising
6. Dashboard Updates  (2 hafta) - Yeni raporlar
```

---

## KAYNAKLAR

- Google Ads API: https://developers.google.com/google-ads/api
- TikTok Ads API: https://business-api.tiktok.com/portal/docs
- X Ads API: https://developer.twitter.com/en/docs/twitter-ads-api
- Taboola API: https://backstage.taboola.com/docs/
- AppsFlyer API: https://support.appsflyer.com/hc/en-us/articles/209674488-Pull-API
- Adjust API: https://help.adjust.com/en/article/adjust-api
- GA4 Data API: https://developers.google.com/analytics/devguides/reporting/data/v1
- GA4 Measurement Protocol: https://developers.google.com/analytics/devguides/collection/protocol/ga4
