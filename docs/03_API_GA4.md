# GA4 Google Analytics Data API Dokümantasyonu

## 1. Genel Bakis

Google Analytics Data API (v1beta), GA4 mulklerinden programatik olarak rapor verisi cekmek icin kullanilan REST API'dir. Bu API, Universal Analytics (UA) degil, yalnızca GA4 mulkleri icin calisir.

**Temel endpoint:** `https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport`

**Desteklenen yontemler:**
- `runReport` - Temel raporlar
- `batchRunReports` - Birden fazla raporu toplu olarak calistirma
- `runPivotReport` - Pivot (kilit derece) raporlari
- `runRealtimeReport` - Gercek zamanli (real-time) veri
- `runFunnelReport` - Huni raporlari (v1alpha)
- `getMetadata` - Mevcut boyut ve metriklerin listesi
- `checkCompatibility` - Boyut/metrik uyumluluk kontrolu

---

## 2. Authentication (Kimlik Dogrulama)

### 2.1 Service Account (Tavsiye Edilen)

Service Account JSON key ile kimlik dogrulama, sunucu-tarafli uygulamalar icin en uygun yontemdir.

**Adimlar:**
1. Google Cloud Console'da yeni bir proje olusturun veya mevcut bir projeyi secin.
2. "APIs & Services" > "Library" bolumune gidin ve "Google Analytics Data API" yi etkinlestirin.
3. "APIs & Services" > "Credentials" bolumune gidin, "Create Credentials" > "Service Account" secin.
4. Olusturulan service account'a Analytics Data API Reader rolunu atayin:
   - `roles/analytics.dataViewer`
5. "Keys" bolumunden yeni bir JSON key olusturun ve indirin.
6. Python'da environment variable ile kullanin:

```python
import os
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/path/to/service-account.json"

from google.analytics.data_v1beta import BetaAnalyticsDataClient

client = BetaAnalyticsDataClient()
```

### 2.2 API Key (Diger Alternatif)

Basit public veri okuma islemleri icin API Key de kullanilabilir. Ancak service account kadar guvenli degildir.

```
GET https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport?key=YOUR_API_KEY
```

**Not:** API Key ile kullanilabilen yontemler sinirlidir. Raporlama islemleri icin Service Account daha uygundur.

---

## 3. Property ID

Property ID, API cagrilarinda hedeflenen GA4 mulkini tanimlayan benzersiz sayisal degerdir.

### 3.1 Property ID Nerde Bulunur?

1. **Google Analytics Dashboard:** Admin > Property Settings sayfasinda "Property ID" olarak gosterilir.
2. **Format:** Genellikle `123456789` seklinde rakamsal bir deger.
3. **API yolunda kullanilan bicim:** `properties/{propertyId}` 
   - Ornegin: `properties/123456789`

### 3.2 Birden Fazla Property ID Alma

Birden fazla mulk ID'sini yonetmek icin Google Analytics Admin API'sinin `properties.list` yontemi kullanilabilir.

---

## 4. runReport Endpoint

Bu endpoint, bir rapor olusturmak ve sonuclarini donmek icin kullanilan ana yontemdir.

### 4.1 Endpoint ve HTTP Method

```
POST https://analyticsdata.googleapis.com/v1beta/properties/{propertyId}:runReport
```

### 4.2 Request Body Bilesenleri

```json
{
  "dateRanges": [
    {
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    }
  ],
  "dimensions": [
    {
      "name": "city"
    }
  ],
  "metrics": [
    {
      "name": "activeUsers"
    }
  ],
  "dimensionFilter": { ... },
  "metricFilter": { ... },
  "orderBys": [ ... ],
  "limit": 10000,
  "offset": 0,
  "keepEmptyRows": false,
  "returnPropertyQuota": true
}
```

#### 4.2.1 dateRanges
Raporun kapsadigi tarih araligi. Birden fazla aralik belirtilebilir (ornegin, donem karsilastirmasi icin). Tarih formati: `YYYY-MM-DD`

#### 4.2.2 dimensions
Raporlamada gruplama icin kullanilan boyutlar. Ornegin: sehir, ulke, cihaz turu, kaynak/ortam.

#### 4.2.3 metrics
Hesaplanan degerler. Ornegin: aktif kullanici sayisi, oturum sayisi, sayfa gofterimi sayisi.

#### 4.2.4 dimensionFilter / metricFilter
Belirli boyut veya metrik degerlerine gore filtreleme yapmak icin kullanilir.

#### 4.2.5 orderBys
Sonuclari siralama. Artan (`asc`) veya azalan (`desc`) siralama desteklenir.

#### 4.2.6 limit
Donen satir sayisi siniri. Varsayilan: 10.000

#### 4.2.7 offset
Atlanacak satir sayisi (sayfalamada kullanilir).

#### 4.2.8 returnPropertyQuota
Yanitta mevcut kota bilgisini dahil etmek icin `true` olarak ayarlanir.

---

## 5. Cekilebilecek Veriler

### 5.1 Kullanici Metrikleri
- `activeUsers` - Aktif kullanicilar (son 1-28 gunde uygulamayi kullanan benzersiz kullanici sayisi)
- `newUsers` - Yeni kullanicilar
- `totalUsers` - Toplam kullanici sayisi
- `userCountByDay` - Gunes basina kullanici sayisi

### 5.2 Oturum (Session) Metrikleri
- `sessions` - Toplam oturum sayisi
- `sessionsPerUser` - Kullanici basina oturum sayisi
- `sessionStartMode` - Oturumun ne zaman ve nasil basladi
- `sessionDuration` - Oturum suresi (saniye)

### 5.3 Donusum (Conversion) Metrikleri
- `conversions` - Hedeflenen kullanici etkinligi sayisi (e-ticaret, hedef tamamlama vb.)

### 5.4 Sayfa Goruntuleme (Pageview) Metrikleri
- `screenPageViews` - Sayfa goruntuleme sayisi
- `viewsPerSession` - Oturum basina goruntuleme sayisi

### 5.5 Etkinlik (Event) Metrikleri
- `eventCount` - Toplam etkinlik sayisi
- `eventCountPerUser` - Kullanici basina etkinlik sayisi
- `sessionsWithEvent` - Etkinlik iceren oturum sayisi

### 5.6 Iyilestirme (Engagement) Metrikleri
- `engagedSessions` - Katilimli oturumlar (etkin oturumlar)
- `engagementRate` - Katilim orani (katilimli oturum / toplam oturum)
- `bounceRate` - Hemen cikma orani
- `averageSessionDuration` - Ortalama oturum suresi (saniye)
- `sessionConversionHeatmap` - Isi haritasi icin oturum donusumleri

### 5.7 Trafik Kaynagi (Traffic Source) Boyutlari
- `sessionSource` - Oturum kaynagi (ornegin: google, direct)
- `sessionMedium` - Oturum ortami (ornegin: organic, cpc, referral)
- `sessionCampaignName` - Kampanya adi
- `sessionKeyword` - Arama terimi (keyword)
- `sessionDefaultChannelGroup` - Varsayilan canal grubu (Organic, Paid, Direct, Referral, Social, Email, Display vb.)

### 5.8 Cografya (Geography) Boyutlari
- `country` - Ulke
- `region` - Bolge/eyalet
- `city` - Sehir
- `geoKey` - Coğrafi anahtar

### 5.9 Cihaz (Device) Boyutlari
- `deviceCategory` - Cihaz kategorisi (mobile, desktop, tablet)
- `deviceModel` - Cihaz modeli
- `platform` - Platform (iOS, Android, Web)
- `operatingSystem` - Isletim sistemi
- `browser` - Tarayici

### 5.10 Kampanya Attribution Boyutlari
- `campaignName` - Kampanya adi
- `campaignId` - Kampanya ID'si
- `campaignSource` - Kampanya kaynagi
- `campaignMedium` - Kampanya ortami
- `campaignContent` - Kampanya icerigi
- `campaignKeyword` - Kampanya anahtar kelimesi
- `campaignCreativeId` - Kampanya creative ID'si

### 5.11 E-Ticaret Boyutlari
- `itemName` - Urun adi
- `itemCategory` - Urun kategorisi
- `itemQuantity` - Urun adedi
- `itemRevenue` - Urun geliri
- `transactionId` - Islem ID'si
- `transactionRevenue` - Islem geliri

---

## 6. Boyut (Dimension) ve Metrik (Metric) Listesi

### 6.1 Tam Dimension Listesi (Secimler)

| Boyut | Aciklama |
|-------|----------|
| `date` | Gun (YYYY-MM-DD formatinda) |
| `hour` | Saat (0-23) |
| `week` | Hafta numarasi |
| `month` | Ay |
| `year` | Yil |
| `country` | Ulke |
| `region` | Bolge/eyalet |
| `city` | Sehir |
| `deviceCategory` | Mobil, masaustu, tablet |
| `platform` | iOS, Android, Web |
| `operatingSystem` | Isletim sistemi |
| `browser` | Tarayici |
| `sessionSource` | Trafik kaynagi |
| `sessionMedium` | Trafik ortami |
| `sessionCampaignName` | Kampanya adi |
| `sessionDefaultChannelGroup` | Varsayilan canal grubu |
| `pagePath` | Sayfa yolu |
| `pageTitle` | Sayfa basligi |
| `eventName` | Etkinlik adi |
| `campaignName` | Kampanya adi |
| `campaignSource` | Kampanya kaynagi |
| `campaignMedium` | Kampanya ortami |
| `itemName` | Urun adi |
| `itemCategory` | Urun kategorisi |
| `currencyCode` | Para birimi kodu |
| `sessionId` | Oturum ID'si |
| `userId` | Kullanici ID'si |
| `sessionUserAgent` | Oturum kullanici ajani |
| `customUserId` | Ozel kullanici ID'si |

### 6.2 Tam Metric Listesi (Secimler)

| Metrik | Aciklama |
|--------|----------|
| `activeUsers` | Aktif kullanicilar |
| `newUsers` | Yeni kullanicilar |
| `totalUsers` | Toplam kullanici sayisi |
| `sessions` | Toplam oturum sayisi |
| `sessionsPerUser` | Kullanici basina oturum |
| `conversions` | Donusum sayisi |
| `screenPageViews` | Sayfa goruntuleme |
| `viewsPerSession` | Oturum basina goruntuleme |
| `averageSessionDuration` | Ortalama oturum suresi (saniye) |
| `bounceRate` | Hemen cikma orani |
| `engagementRate` | Katilim orani |
| `eventCount` | Toplam etkinlik sayisi |
| `eventCountPerUser` | Kullanici basina etkinlik |
| `engagedSessions` | Katilimli oturumlar |
| `engagedSessionsPerUser` | Kullanici basina katilimli oturum |
| `averageEngagementTimePerMinute` | Ortalama katilim suresi (dakika) |
| `itemRevenue` | Toplam urun geliri |
| `itemQuantity` | Satilan urun adedi |
| `transactionRevenue` | Islem geliri |
| `transactions` | Islem sayisi |
| `userAgeBracket` | Yas grubu |
| `userGender` | Cinsiyet |
| `1dayUsers` | 1 gun once aktif kullanici |
| `7dayUsers` | 7 gun once aktif kullanici |
| `14dayUsers` | 14 gun once aktif kullanici |
| `28dayUsers` | 28 gun once aktif kullanici |

---

## 7. Ornek API Cagrilari

### 7.1 Python ile Temel Rapor

```python
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange, Dimension, Metric, RunReportRequest
)

# Servis hesabi kimlik dogrulamasi ile istemci olustur
client = BetaAnalyticsDataClient()

# Request olustur
request = RunReportRequest(
    property=f"properties/123456789",
    date_ranges=[
        DateRange(start_date="2024-01-01", end_date="2024-01-31")
    ],
    dimensions=[
        Dimension(name="country"),
        Dimension(name="city")
    ],
    metrics=[
        Metric(name="activeUsers"),
        Metric(name="sessions"),
        Metric(name="conversions"),
        Metric(name="averageSessionDuration"),
        Metric(name="bounceRate")
    ],
    limit=10000
)

# Raporu calistir
response = client.run_report(request=request)

# Sonuclari yazdir
for row in response.rows:
    print(f"Ulke: {row.dimension_values[0].value}, "
          f"Sehir: {row.dimension_values[1].value}, "
          f"Aktif Kullanicilar: {row.metric_values[0].value}, "
          f"Oturumlar: {row.metric_values[1].value}, "
          f"Donusumler: {row.metric_values[2].value}")
```

### 7.2 cURL ile Rapor Cagrisi

Servis hesabi JSON key dosyasi ve `oauth2l` araci ile:

```bash
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [
      {
        "startDate": "2024-01-01",
        "endDate": "2024-01-31"
      }
    ],
    "dimensions": [
      {
        "name": "sessionDefaultChannelGroup"
      },
      {
        "name": "country"
      }
    ],
    "metrics": [
      {
        "name": "sessions"
      },
      {
        "name": "activeUsers"
      },
      {
        "name": "conversions"
      },
      {
        "name": "averageSessionDuration"
      }
    ],
    "limit": 10000
  }' \
  "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport"
```

API Key ile:

```bash
curl -X POST \
  -H "x-goog-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "dateRanges": [{"startDate": "2024-01-01", "endDate": "2024-01-31"}],
    "dimensions": [{"name": "city"}],
    "metrics": [{"name": "activeUsers"}]
  }' \
  "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport"
```

### 7.3 Donem Karsilastirmali Rapor (Iki Tarih Araligi)

```python
from google.analytics.data_v1beta.types import DateRange

request = RunReportRequest(
    property=f"properties/123456789",
    date_ranges=[
        DateRange(start_date="2024-01-01", end_date="2024-01-31"),
        DateRange(start_date="2023-01-01", end_date="2023-01-31")
    ],
    dimensions=[Dimension(name="country")],
    metrics=[
        Metric(name="activeUsers"),
        Metric(name="sessions")
    ]
)

response = client.run_report(request=request)
```

### 7.4 Filtreli Rapor (Sadece Organic Trafik)

```python
from google.analytics.data_v1beta.types import FilterExpression, Filter

request = RunReportRequest(
    property=f"properties/123456789",
    date_ranges=[
        DateRange(start_date="2024-01-01", end_date="2024-01-31")
    ],
    dimensions=[Dimension(name="sessionDefaultChannelGroup")],
    metrics=[Metric(name="sessions"), Metric(name="activeUsers")],
    dimension_filter=FilterExpression(
        filter=Filter(
            field_name="sessionDefaultChannelGroup",
            string_filter=Filter.StringFilter(
                value="Organic"
            )
        )
    )
)

response = client.run_report(request=request)
```

### 7.5 Siralamali ve Sinirli Rapor

```python
from google.analytics.data_v1beta.types import OrderBy, OrderByMetric, OrderByDimension

request = RunReportRequest(
    property=f"properties/123456789",
    date_ranges=[
        DateRange(start_date="2024-01-01", end_date="2024-01-31")
    ],
    dimensions=[Dimension(name="pagePath")],
    metrics=[
        Metric(name="screenPageViews"),
        Metric(name="averageSessionDuration")
    ],
    order_bys=[
        OrderBy(
            metric=OrderByMetric(metric_name="screenPageViews"),
            desc=True
        )
    ],
    limit=10  # En iyi 10 sayfa
)

response = client.run_report(request=request)
```

### 7.6 Gercek Zamanli (Realtime) Rapor

```python
from google.analytics.data_v1beta.types import RunRealtimeReportRequest

request = RunRealtimeReportRequest(
    property=f"properties/123456789",
    dimensions=[Dimension(name="deviceCategory")],
    metrics=[Metric(name="activeUsers")]
)

response = client.run_realtime_report(request=request)
```

---

## 8. Quota ve Limitler

### 8.1 Genel API Limitleri

| Limit Turu | Deger |
|------------|-------|
| Gunluk istek limiti | 50.000 istek/proje/gun |
| Anlik istek limiti | 10 sorgu/saniye/IP adresi |
| Kullanici basina limit | 100 istek/100 saniye (ayarlanabilir, max: 1.000) |

### 8.2 Asma Durumu

Kota asildiginda API su hatalari dondurur:
- **403 Forbidden** - Kota asildiginda
- **429 Too Many Requests** - Fazla istek gonderildiginde

Yanitta `error.status` alani "QUOTA_EXCEEDED" veya "RATE_LIMIT_EXCEEDED" degerini icerir.

### 8.3 Kota Yonetimi

1. Google Cloud Console > "APIs & Services" > "Quotas" bolumunden mevcut kota kullanimini goruntuleyebilirsiniz.
2. Kota asildiginde bekleme suresi ayarlayarak (retry) yeniden deneme yapilabilir.
3. `returnPropertyQuota: true` ile her rapor yanitinda mevcut kota durumu bilgisi alinabilir.

### 8.4 Per-User Limit Asma Stratejisi

Uygulamaniz tek bir IP adresinden (ornegin: sunucu) cok sayida istek yapiyorsa, her istekle birlikte `userIP` veya `quotaUser` parametresi gondererek kullanicilara gore kota paylastirma yapilabilir.

```bash
curl -X POST \
  "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport?quotaUser=user123"
```

---

## 9. Onemli Notlar ve Best Practices

1. **Tarih formati:** `YYYY-MM-DD` seklinde olmalidir.
2. **Buyuk veri setleri:** 10.000 satir limiti asildiginde `offset` ve `limit` ile sayfalama yapin.
3. **Oturum suresi:** `averageSessionDuration` saniye cinsinden doner.
4. **Hemen cikma (bounce):** Bounce rate = Tek etkinlikli oturumlar / Toplam oturumlar.
5. **Kanal gruplari (Channel Groups):** Organic Search, Paid Search, Direct, Referral, Social, Email, Display gibi on tanimli kanallar.
6. **Metrik uyumlulugu:** Her boyut, yalnizca uyumlu metriklerle birlikte kullanilabilir. `checkCompatibility` endpoint ile kontrol edilebilir.
7. **Gercek zamanli veri:** Raporlanan veriler, islemden sonra 24-48 saat ice analizde kullanilabilir. Gercek zamanli raporlar (realtime) son 30 dakika icin anlik veri saglar.
8. **Veri gecmisi:** GA4 verileri genellikle 14 aya kadar tutulur (mulk ayarlarina bagli).

---

## 10. Yonelttirimler (Quick Links)

- Ana döküman: https://developers.google.com/analytics/devguides/reporting/data/v1
- runReport API dokümantasyonu: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport
- Boyut ve Metrik referansi: https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- Kota yonetimi: https://developers.google.com/analytics/devguides/limits-and-quotas
- Property ID: https://developers.google.com/analytics/devguides/reporting/data/v1/property-id
- Client kütüphaneleri: https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries
- Python örnek kodlari: https://github.com/googleanalytics/python-docs-samples
