# Google Search Console API Dokümantasyonu

## 1. Genel Bakış

Google Search Console API (v3), Search Console'daki verileri programatik olarak okumak için kullanılan REST API'dir. Site performansı, arama trafiği ve index durumunu izlemek için kullanılır.

**Temel endpoint:** `https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`

**API Sürümü:** v3 (GSC Legacy API / eski API)
**Yeni API (2024):** Search Console API v1 - ancak daha az özellik içerir, v3 hâlâ yaygın kullanımda

---

## 2. Authentication (Kimlik Doğrulama)

### 2.1 Service Account (Tavsiye Edilen)

Sunucu tarafı uygulamalar için en uygun yöntem.

```python
import os
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "/path/to/service-account.json"

from googleapiclient.discovery import build
service = build('webmasters', 'v3', credentials=creds)
```

### 2.2 OAuth 2.0

Kullanıcı adına veri erişimi gerektiren uygulamalar için.

```python
from google_auth_oauthlib.flow import InstalledAppFlow
SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly']
flow = InstalledAppFlow.from_client_secrets_file('client_secrets.json', SCOPES)
creds = flow.run_local_server(port=0)
```

### 2.3 API Key

Basit okuma işlemleri için alternatif. Ancak çoğu GSC endpoint'i OAuth gerektirir.

---

## 3. Site Ekleme ve Doğrulama Süreci

### 3.1 Site Kaydetme

```http
POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}
Authorization: Bearer {token}
```

### 3.2 Doğrulama Yöntemleri

1. **HTML File Upload** - Belirli bir HTML dosyasını site kök dizinine yükleme
2. **HTML Meta Tag** - <meta> tag'ini ana sayfaya ekleme
3. **DNS Record** - Domain'de TXT kaydı oluşturma
4. **Google Analytics** - GA4 ile doğrulama
5. **Google Tag Manager** - GTM container ile doğrulama

### 3.3 Site Listesini Alma

```http
GET https://www.googleapis.com/webmasters/v3/sites
Authorization: Bearer {token}
```

```python
service.sites().list().execute()
```

Dönen örnek:
```json
{
  "siteEntry": [
    {
      "siteUrl": "https://www.example.com/",
      "permissionLevel": "siteOwner"
    }
  ]
}
```

---

## 4. Search Analytics API - Temel Endpoint

### 4.1 Endpoint ve Method

```http
POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
Authorization: Bearer {token}
Content-Type: application/json
```

### 4.2 İstek Gövdesi (Request Body)

```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "dimensions": ["query"],
  "rowLimit": 1000,
  "startRow": 0,
  "dimensionFilterGroups": [
    {
      "filters": [
        {
          "dimension": "query",
          "operator": "contains",
          "expression": "kritik kelime"
        }
      ]
    }
  ],
  "aggregationType": "byProperty"
}
```

### 4.3 Zorunlu Parametreler

| Parametre | Açıklama | Format |
|-----------|----------|--------|
| startDate | Başlangıç tarihi | YYYY-MM-DD |
| endDate | Bitiş tarihi | YYYY-MM-DD |

### 4.4 Opsiyonel Parametreler

| Parametre | Açıklama | Varsayılan |
|-----------|----------|------------|
| dimensions | Gruplama boyutları | yok |
| rowLimit | Maksimum satır sayısı | 1000 (max 10000) |
| startRow | Offset başlangıcı | 0 |
| startDateOffset | Veri kaydırma (gün) | yok |
| endDateOffset | Veri kaydırma (gün) | yok |
| aggregationType | byPage, byProperty, byDate | byProperty |
| dimensionFilterGroups | Filtreler | yok |
| dataState | all, finalized | all |

---

## 5. Dimensions (Boyutlar)

### 5.1 Desteklenen Boyutlar

| Boyut | Açıklama | Örnek Kullanım |
|-------|----------|----------------|
| query | Arama sorguları | Hangi kelimelerde sıralama |
| page | URL'ler | Hangi sayfalar trafiik alıyor |
| country | Ülke kodları | Trafiik hangi ülkelerden |
| device | cHlttr, mobile, desktop | Cihaz bazlı performans |
| date | Tarih (YYYY-MM-DD) | Günlük trendler |
| searchAppearance | WEB, IMAGE, VIDEO, NEWS | Arama sonucu tipi |

### 5.2 Çoklu Boyut Kullanımı

```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "dimensions": ["query", "page", "country", "device", "date"]
}
```

**Dikkat:** Boyut sayısı arttıkça dönen satır sayısı artar ve kota kullanımı hızlanır.

### 5.3 Boyut Kombinasyonu Sınırları

- Maksimum 4 boyut aynı anda kullanılabilir
- query + page + country + device yaygın kullanım
- date tek başına kullanılabilir

---

## 6. Filtre Kullanımı

### 6.1 Filtre Operatörleri

| Operatör | Açıklama | Örnek |
|----------|----------|-------|
| equals | Tam eşleşme | query equals "kredi" |
| contains | İçerir | page contains "/blog/" |
| notContains | İçermez | device notContains "mobile" |
| startsWith | İle başlar | page startsWith "https://example.com/tr" |
| equals | Tam eşleşme | country equals "TUR" |

### 6.2 Filtre Grubu Mantığı

```json
{
  "dimensionFilterGroups": [
    {
      "filters": [
        {"dimension": "country", "operator": "equals", "expression": "TUR"},
        {"dimension": "device", "operator": "equals", "expression": "MOBILE"}
      ]
    }
  ]
}
```

**NOT:** Aynı group içindeki filtreler AND ile çalışır. Farklı gruplar OR ile çalışır.

### 6.3 Filtre Örnekleri

```python
# Sadece mobil trafiik
filters = [
    {"dimension": "device", "operator": "equals", "expression": "MOBILE"}
]

# Türkiye'den gelen mobil trafiik
filters = [
    {"dimension": "country", "operator": "equals", "expression": "TUR"},
    {"dimension": "device", "operator": "equals", "expression": "MOBILE"}
]

# Belirli sayfayı filtrele
filters = [
    {"dimension": "page", "operator": "contains", "expression": "/ürün/"}
]
```

---

## 7. Çekilebilecek Veriler (Metrikler)

### 7.1 Temel Metrikler

| Metrik | Açıklama | Birim |
|--------|----------|-------|
| clicks | Tıklama sayısı | integer |
| impressions | Gösterim sayısı | integer |
| ctr | Tıklama oranı | double (0.0 - 1.0) |
| position | Ortalama sıralama pozisyonu | double |

**Dikkat:** CTR ve position değerleri approximation'a dayalıdır. Kesin değerler için byPage aggregation kullanın.

### 7.2 Aggregation Türleri

| Tür | Açıklama | Kullanım Senaryosu |
|-----|----------|-------------------|
| byProperty | Site düzeyinde (varsayılan) | Genel performans |
| byPage | Sayfa düzeyinde | Hangi sayfalar daha iyi |
| byDate | Günlük | Trend analizi |

**NOT:** byPage kullanımında position ve CTR daha doğru hesaplanır.

---

## 8. Örnek API Call'ları

### 8.1 Python ile Temel Sorgu

```python
from googleapiclient.discovery import build
from google.oauth2 import service_account

# Kimlik doğrulama
SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly']
creds = service_account.Credentials.from_service_account_file(
    'service-account.json', scopes=SCOPES)

service = build('webmasters', 'v3', credentials=creds)

# Temel sorgu - query bazlı
response = service.searchanalytics().query(
    siteUrl='https://www.example.com/',
    body={
        'startDate': '2024-01-01',
        'endDate': '2024-01-31',
        'dimensions': ['query'],
        'rowLimit': 1000
    }
).execute()

for row in response['rows']:
    print(f"Query: {row['keys'][0]}, Clicks: {row['clicks']}, Impressions: {row['impressions']}, CTR: {row['ctr']:.4f}, Position: {row['position']:.1f}")
```

### 8.2 Python ile Çoklu Boyut

```python
# Page + Query + Country + Device kombinasyonu
response = service.searchanalytics().query(
    siteUrl='https://www.example.com/',
    body={
        'startDate': '2024-01-01',
        'endDate': '2024-01-31',
        'dimensions': ['query', 'page', 'country', 'device'],
        'rowLimit': 5000,
        'aggregationType': 'byPage'
    }
).execute()

for row in response['rows']:
    keys = row['keys']
    print(f"Query: {keys[0]}, Page: {keys[1]}, Country: {keys[2]}, Device: {keys[3]}")
    print(f"  Clicks: {row['clicks']}, Impressions: {row['impressions']}, CTR: {row['ctr']:.4f}, Position: {row['position']:.1f}")
```

### 8.3 Python ile Filtreleme

```python
# Türkiye trafiği, mobil, belirli kelimeler
response = service.searchanalytics().query(
    siteUrl='https://www.example.com/',
    body={
        'startDate': '2024-01-01',
        'endDate': '2024-01-31',
        'dimensions': ['query', 'page'],
        'rowLimit': 1000,
        'dimensionFilterGroups': [
            {
                'filters': [
                    {'dimension': 'country', 'operator': 'equals', 'expression': 'TUR'},
                    {'dimension': 'device', 'operator': 'equals', 'expression': 'MOBILE'}
                ]
            }
        ]
    }
).execute()
```

### 8.4 cURL ile Sorgu

```bash
# OAuth token alındıktan sonra
curl -X POST \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "dimensions": ["query", "page"],
    "rowLimit": 1000
  }' \
  "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.example.com/searchAnalytics/query"
```

### 8.5 Pagination (Sayfalama)

```python
# Tüm verileri çekmek için
all_rows = []
row_limit = 5000
start_row = 0

while True:
    response = service.searchanalytics().query(
        siteUrl='https://www.example.com/',
        body={
            'startDate': '2024-01-01',
            'endDate': '2024-01-31',
            'dimensions': ['query'],
            'rowLimit': row_limit,
            'startRow': start_row
        }
    ).execute()
    
    if 'rows' in response:
        all_rows.extend(response['rows'])
        start_row += row_limit
    else:
        break

print(f"Toplam {len(all_rows)} satır veri çekildi")
```

---

## 9. Quota ve Limitler

### 9.1 Kota Sınırları

| Limit Türü | Değer | Açıklama |
|------------|-------|----------|
| Günlük Kota | 2000 query/dakika | Projeye göre değişir |
| Saniye Başı | ~10-20 istek | Rate limiting uygulanır |
| rowLimit max | 10000 | Tek seferde max satır |
| Boyut kombinasyonu | max 4 | Aynı anda en fazla 4 boyut |

### 9.2 Kota Aşımı Durumu

```json
{
  "error": {
    "code": 429,
    "message": "Quota Exceeded"
  }
}
```

### 9.3 Kota Yönetimi

- Batch istekler kullanın
- Gereksiz boyut eklemekten kaçının
- Cache stratejisi uygulayın
- Maksimum rowLimit (10000) kullanın

---

## 10. Yaygın Kullanım Senaryoları

### 10.1 Rakip Analizi İçin

```python
# 1) Belirli bir dönemde en çok tıklama alan sorguları bul
response = service.searchanalytics().query(
    siteUrl='https://www.rakip.com/',
    body={
        'startDate': '2024-01-01',
        'endDate': '2024-03-31',
        'dimensions': ['query'],
        'rowLimit': 100,
        'aggregationType': 'byProperty'
    }
).execute()

# 2) Her kelime için pozisyon ve CTR kontrol et
# 3) Kendi sitenizle karşılaştır
```

### 10.2 Performans Takibi

```python
# Aylık trend analizi
response = service.searchanalytics().query(
    siteUrl='https://www.example.com/',
    body={
        'startDate': '2024-01-01',
        'endDate': '2024-03-31',
        'dimensions': ['date'],
        'rowLimit': 1000,
        'dimensionFilterGroups': [
            {
                'filters': [
                    {'dimension': 'country', 'operator': 'equals', 'expression': 'TUR'}
                ]
            }
        ]
    }
).execute()
```

### 10.3 Teknik SEO İzleme

```python
# Index sorunları için (dataState)
response = service.searchanalytics().query(
    siteUrl='https://www.example.com/',
    body={
        'startDate': '2024-01-01',
        'endDate': '2024-01-31',
        'dimensions': ['page'],
        'rowLimit': 1000,
        'dataState': 'finalized'
    }
).execute()
```

---

## 11. Hata Kodları

| HTTP Kodu | Hata | Çözüm |
|-----------|------|-------|
| 400 | Bad Request | Parametreleri kontrol et |
| 401 | Unauthorized | OAuth/Token kontrol et |
| 403 | Forbidden | GSC'de site erişimi kontrol et |
| 404 | Not Found | Site URL'si doğru değil |
| 429 | Quota Exceeded | Rate limiting, bekleyin |

---

## 12. Faydalı Kaynaklar

- **Dokümantasyon:** https://developers.google.com/webmaster-tools/search-console/api-original
- **API Reference:** https://developers.google.com/webmaster-tools/search-console/api-original/v1/reference
- **Python Client Library:** https://github.com/googleapis/google-api-python-client
- **OAuth2 Setup:** https://developers.google.com/identity/protocols/oauth2

---

## 13. Önemli Notlar

1. **Veri Gecikmesi:** Search Console verileri genellikle 1-2 gün gecikmeli gelir.
2. **Sampled Data:** Büyük sitelerde veriler örneklenmiş olabilir (sampling rate ~10%).
3. **Posizyon Approximation:** "position" değeri kesin sıralama değildir, yaklaşıktır.
4. **CTR Hesaplama:** CTR = clicks / impressions (API tarafından hesaplanır).
5. **Yeni API (v1):** Google 2024'te yeni bir Search Console API duyurdu ancak eski v3 hâlâ yaygın kullanımda ve daha fazla özellik içeriyor.
