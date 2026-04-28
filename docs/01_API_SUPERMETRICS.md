# Supermetrics API Dokumentasyonu

Bu dokümantasyon, Supermetrics platformunun API'lerini detaylı olarak açıklamaktadır. Supermetrics, pazarlama verilerini farklı kaynaklardan (Google Ads, Facebook Ads, TikTok Ads, vb.) çeken ve çeşitli hedef sistemlere (Google Sheets, Looker Studio, BigQuery, Snowflake, vb.) aktaran bir data pipeline platformudur.

---

## Icindekiler

1. [API'ye Genel Bakis](#1-apie-genel-bakis)
2. [Authentication](#2-authentication)
3. [Query API (Data API)](#3-query-api-data-api)
4. [Management API](#4-management-api)
5. [Desteklenen Veri Kaynaklari](#5-desteklenen-veri-kaynaklari)
6. [Metrics ve Dimensions](#6-metrics-ve-dimensions)
7. [Ornek API Cagrilari](#7-ornek-api-cagrilari)
8. [Rate Limits ve Limitasyonlar](#8-rate-limits-ve-limitasyonlar)
9. [Fiyatlandirma](#9-fiyatlandirma)

---

## 1. API'ye Genel Bakis

Supermetrics'de iki ana API vardir:

### 1.1 Query API (Data API)
Veri kaynaklarından sorgu yaparak veri cekmek icin kullanilir. Bu API, pazarlama performans verilerini (spend, impressions, clicks, conversions) almanizi saglar.

### 1.2 Management API
Takim yonetimi, data source baglantilari, API anahtarlari ve backfill islemleri icin kullanilir.

### Base URL
```
https://api.supermetrics.com
```

---

## 2. Authentication

### API Key ile Kimlik Dogrulama

Supermetrics API'leri `smetric_token` header parametresi ile kullanilir.

```
Header: sMetric_token: <API_KEY>
```

### API Key Olusturma

1. Supermetrics Hub'da (hub.supermetrics.com) giris yapin
2. Team Settings > API Keys bolumune gidin
3. Yeni API key olusturun

**Onemli:** API key'ler yalnizca bir kez olusturuldugunda gosterilir. Guvenli bir yerde saklayin.

---

## 3. Query API (Data API)

### 3.1 Endpoint'ler

#### Query Data (GET)
```
GET https://api.supermetrics.com/query/data
```

#### Query Data (POST)
```
POST https://api.supermetrics.com/query/data
```

#### Get Query Status
```
GET https://api.supermetrics.com/query/<query_id>/status
```

#### Get Query History
```
GET https://api.supermetrics.com/query/history
```

#### Get Query Results
```
GET https://api.supermetrics.com/query/<query_id>/results
```

#### Batch Operations
```
POST https://api.supermetrics.com/query/batch
GET  https://api.supermetrics.com/query/batch/<batch_id>
DELETE https://api.supermetrics.com/query/batch/<batch_id>
GET  https://api.supermetrics.com/query/batch/<batch_id>/status
```

### 3.2 Sorgu Parametreleri

| Parametre | Aciklama | Ornek Deger |
|-----------|----------|-------------|
| data_source | Veri kaynagi turu | google-ads |
| account_id | Hesap ID | act_123456789 |
| metrics | Alinacak metrikler | campaignsetspend,campaign_setimpressions |
| dimensions | Gruplama boyutlari | date,dこ场地 |
| start_date | Baslangic tarihi | 2026-01-01 |
| end_date | Bitis tarihi | 2026-03-31 |
| filters | Filtreleme kosullari | campaign_namecontains:Brand |

### 3.3 Data Source Search

```
GET https://api.supermetrics.com/data-source/search
GET https://api.supermetrics.com/data-source/search?category=paid-advertising
```

### 3.4 Get Fields (Metrics/Dimensions Listesi)

```
GET https://api.supermetrics.com/data-source/<data_source_id>/fields
```

Bu endpoint, belirli bir veri kaynagi icin desteklenen tum metrics ve dimensions'lari dondurur.

### 3.5 Get Segments

```
GET https://api.supermetrics.com/data-source/<data_source_id>/segments
```

### 3.6 Get Accounts

```
GET https://api.supermetrics.com/data-source/<data_source_id>/accounts
```

Baglanan hesaplarin listesini dondurur.

---

## 4. Management API

### 4.1 API Keys

| Endpoint | Method | Aciklama |
|----------|--------|----------|
| /api-keys | GET | API anahtarlarini listele |
| /api-keys | POST | Yeni API anahtari olustur |
| /api-keys/:id | GET | Belirli bir API anahtarini getir |
| /api-keys/:id | PATCH | API anahtarini guncelle |

### 4.2 Backfill Islemleri

```
POST /backfill                    - Backfill olustur
GET  /backfill/:id                - Backfill durumunu getir
GET  /backfill/latest/:transfer_id - Son backfill'i getir
GET  /backfill/incomplete         - Tamamlanmamis backfill'leri listele
PATCH /backfill/:id               - Backfill durumunu guncelle
```

### 4.3 Data Source Connections

```
POST /data-source-connections    - Yeni baglanti olustur
GET  /data-source-connections    - Baglantilari listele
```

### 4.4 Team Settings

```
GET  /team/settings               - Takim ayarlarini getir
PATCH /team/settings              - Takim ayarlarini guncelle
```

### 4.5 Destinations

```
GET /destinations                - Hedef sistemleri listele
GET /destinations/usage          - Kullanim bilgisi
```

---

## 5. Desteklenen Veri Kaynaklari

### 5.1 Reklam Platformlari

| Platform | Veri Kayedi ID | Veriler |
|----------|---------------|---------|
| Google Ads | google-ads | Spend, impressions, clicks, conversions, keyword-level data |
| Facebook Ads | facebook-ads | Spend, impressions, clicks, conversions, ad level data |
| TikTok Ads | tiktok-ads | Spend, impressions, clicks, video views (387 metrics, 153 dimensions) |
| Microsoft Ads | microsoft-ads | Spend, impressions, clicks, conversions |
| Apple Search Ads | apple-search-ads | Spend, impressions, clicks, conversions |
| Taboola | taboola | Spend, impressions, clicks, conversions |

### 5.2 E-Ticaret Platformlari

| Platform |
|----------|
| Shopify |
| WooCommerce |
| BigCommerce |

### 5.3 Analitik Platformlari

| Platform |
|----------|
| Google Analytics |
| Google Search Console |
| Microsoft Clarity |

### 5.4 Sosyal Medya

| Platform |
|----------|
| LinkedIn Ads |
| Twitter Ads |
| Pinterest Ads |
| Snapchat Ads |

### 5.5 Dig'er

| Platform |
|----------|
| HubSpot |
| Salesforce |
| Semrush |
| Screaming Frog |

---

## 6. Metrics ve Dimensions

Her veri kaynagi icin desteklenen metrics ve dimensions farklidir. Supermetrics, her kaynak icin ayri bir field listesi saglar.

### 6.1 Google Ads Ornegi

**Onemli Metrics:**
- `campaign_set_spend` - Kampanya harcaması
- `campaign_set_impressions` - Gösterim sayısı
- `campaign_set_clicks` - Tiklama sayısı
- `campaign_set_search_exact_match_impressions` - Arama tam eslesme gosterimleri
- `campaign_setConversions` - Dönüsüm sayısı

**Onemli Dimensions:**
- `date` - Tarih
- `campaign_name` - Kampanya adi
- `campaign_type` - Kampanya turu
- `ad_network_type` - Ag turu
- `device` - Cihaz

### 6.2 Facebook Ads Ornegi

**Onemli Metrics:**
- `spend` - Harcama
- `impressions` - Gosterim
- `clicks` - Tiklama
- `reach` - Erisim
- `video_views` - Video izlenme

### 6.3 TikTok Ads Ornegi

TikTok Ads, 387 metrics ve 153 dimensions destekler:

**Ornek Fields:**
- `advertiser_name` - Reklamveren adi
- `campaign_name` - Kampanya adi
- `ad_group_name` - Ad group adi
- `spend` - Harcama
- `impressions` - Gosterim
- `clicks` - Tiklama
- `video_views` - Video izlenme

---

## 7. Ornek API Cagrilari

### 7.1 Python ile Query API Cagrisi

```python
import requests

url = "https://api.supermetrics.com/query/data"
headers = {
    "sMetric_token": "YOUR_API_KEY",
    "Content-Type": "application/json"
}
params = {
    "data_source": "google-ads",
    "account_id": "act_123456789",
    "metrics": "campaign_set_spend,campaign_set_impressions,campaign_set_clicks",
    "dimensions": "date,campaign_name",
    "start_date": "2026-01-01",
    "end_date": "2026-03-31"
}

response = requests.get(url, headers=headers, params=params)
print(response.json())
```

### 7.2 cURL ile Query API Cagrisi

```bash
curl -X GET "https://api.supermetrics.com/query/data" \
  -H "sMetric_token: YOUR_API_KEY" \
  -d "data_source=google-ads" \
  -d "account_id=act_123456789" \
  -d "metrics=campaign_set_spend,campaign_set_impressions" \
  -d "dimensions=date,campaign_name" \
  -d "start_date=2026-01-01" \
  -d "end_date=2026-03-31"
```

### 7.3 Fields Listesini Alma

```bash
curl -X GET "https://api.supermetrics.com/data-source/google-ads/fields" \
  -H "sMetric_token: YOUR_API_KEY"
```

### 7.4 Batch Query Olusturma

```bash
curl -X POST "https://api.supermetrics.com/query/batch" \
  -H "sMetric_token: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {
        "data_source": "google-ads",
        "account_id": "act_123456789",
        "metrics": "campaign_set_spend",
        "dimensions": "date",
        "start_date": "2026-01-01",
        "end_date": "2026-01-31"
      },
      {
        "data_source": "facebook-ads",
        "account_id": "act_987654321",
        "metrics": "spend",
        "dimensions": "date",
        "start_date": "2026-01-01",
        "end_date": "2026-01-31"
      }
    ]
  }'
```

### 7.5 Response Format

Basarili bir query response ornagi:

```json
{
  "data": {
    "query_id": "q_abc123",
    "status": "completed",
    "rows": [
      {
        "date": "2026-01-01",
        "campaign_name": "Brand Campaign",
        "campaign_set_spend": "150.50",
        "campaign_set_impressions": "15000",
        "campaign_set_clicks": "300"
      }
    ],
    "metadata": {
      "columns": ["date", "campaign_name", "campaign_set_spend", "campaign_set_impressions", "campaign_set_clicks"],
      "row_count": 1
    }
  }
}
```

---

## 8. Rate Limits ve Limitasyonlar

### 8.1 Rate Limits

Supermetrics, API cagri sayisi veya istek hacmi icin belirli limitler uygular:

- **API Rate Limit:** Belirli bir zaman diliminde izin verilen maksimum istek sayisi
- **Data Volume Limit:** Aktarilabilecek veri miktari (plan bazli)

Limitler asilmaya calisildiginda `429 Too Many Requests` hatasi doner.

### 8.2 Account Limitasyonlari

Her plan, izin verilen maksimum hesap (data source account) sayisini sinirlar:
- Ucretsiz plan: 100 hesap
- Pro plan: 1,000+ hesap
- Enterprise: Sonsuz

### 8.3 Backfill Limitleri

- Backfill islemleri uzun suren isler icindir
- Bir transfer icin ayni anda sadece bir backfill calisabilir
- Tamamlanmamis backfill'ler listelenebilir ve durumlari izlenebilir

### 8.4 Best Practices

1. **Batch islemler kullanin:** coklu sorgulari tek bir batch cagrisinde birlesiltirin
2. **Cache mekanizmasi kullanin:** Ayni verileri surekli cekmeyin
3. **Rate limit tolerant kod yazin:** 429 hatasi geldignde üssel geri cekilme (exponential backoff) uygulayin
4. **Filtreler kullanin:** Sadece ihtiyac duyulan verileri cekmek icin filters parametresini kullanin

---

## 9. Fiyatlandirma

Supermetrics, farklı ihtiyaclar icin cesitli planlar sunar:

### 9.1 Plan Cesitleri

| Plan | Fiyat | Hesap Limiti | Onemli Ozellikler |
|------|-------|--------------|-------------------|
| **Free Trial** | Ucretsiz | 100 hesap | 14 gun ucretsiz deneme |
| **Starter** | ~$49/ay | 100 hesap | Temel connectors, Google Sheets destegi |
| **Pro** | ~$99/ay | 1,000 hesap | Tum connectors, Data warehouse destegi |
| **Business** | ~$299/ay | 5,000 hesap | Batch queries, Oncelikli destek |
| **Enterprise** | Ozel fiyat | Sonsuz | Custom connectors, Dedicated support |

### 9.2 Ucretsiz ve Ucretli Plan Farki

| Ozellik | Ucretsiz Plan | Ucretli Planlar |
|---------|-------------|-----------------|
| Veri kaynaklari | 40+ connector | Tum connectorler |
| Veri hedefleri | Google Sheets, Looker Studio | BigQuery, Snowflake, Redshift, Azure |
| Hesap sayisi | 100 | Plan bazli |
| Batch islemler | Hayir | Evet |
| Backfill | Sinirli | Tam |
| Destek | Email | Oncelikli destek |
| API erisimi | Hayir | Evet (Pro+) |

### 9.3 Fiyatlandirma Notlari

- Fiyatlar yillik faturalandirma ile daha düsük olabilir
- Kurumsal musteriler icin ozel fiyatlandirma mevcuttur
- Ucretsiz deneme suresi sonunda otomatik ucretlendirme baslamaz

### 9.4 Guncel Bilgi

Guncel fiyatlandirma bilgileri icin: https://supermetrics.com/pricing

---

## 10. Yararli Linkler

- **Dokumantasyon Ana Sayfa:** https://docs.supermetrics.com/
- **API Docs:** https://docs.supermetrics.com/apidocs
- **Getting Started:** https://docs.supermetrics.com/docs/getting-started
- **Google Ads Fields:** https://docs.supermetrics.com/docs/google-ads-fields
- **Facebook Ads Fields:** https://docs.supermetrics.com/docs/facebook-ads-fields
- **TikTok Ads Fields:** https://docs.supermetrics.com/docs/tiktok-ads-fields
- **Fiyatlandirma:** https://supermetrics.com/pricing
- **Hub (Yonetim Paneli):** https://hub.supermetrics.com/

---

## 11. Sonuclar ve Oneriler

### Rakip Analizi Icin Supermetrics Kullanimi

Supermetrics, rakip analizi icin ideal bir secenektir cunku:

1. **Coklu Platform Desteği:** Birden fazla reklam platformundan ayni anda veri cekebilirsiniz
2. **Standardize Edilmis Veri Yapisi:** Farklı platformlardaki verileri ortak bir formatta alabilirsiniz
3. **Data Warehouse Entegrasyonu:** Verileri BigQuery/Snowflake gibi sistemlere aktararak karsilastirmali analiz yapabilirsiniz

### Dikkat Edilmesi Gerekenler

- API access icin **Pro plan veya ustü** gereklidir
- Her platform icin ayri metrics/dimensions listesi mevcuttur
- Keyword-level veri icin Google Ads ve Microsoft Ads en iyi destegi saglar
- Rate limit asildiginda 429 hatasi alinir, retry mekanizmasi implement edin

---

*Bu dokümantasyon Supermetrics'in publicly available bilgelerine dayanarak olusturulmustur. Guncel bilgiler icin resmi dokumantasyonu kontrol ediniz.*

*Son guncellenme: Nisan 2026*
