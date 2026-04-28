# DataForSEO API Dokumantasyonu

## Icindekiler
1. Genel Bilgiler ve API Yapisi
2. Kimlik Dogrulama (Authentication)
3. Keywords Data API
4. Google Ads API
5. SERP API
6. Data Points ve Metricler
7. Bulk Istekler ve Pagination
8. Fiyatlandirma
9. Python Ornekleri

---

## 1. Genel Bilgiler ve API Yapisi

### Base URL
```
https://api.dataforseo.com/v3/
```

### Dokumantasyon
- API Docs: https://docs.dataforseo.com/v3/
- Ana Site: https://dataforseo.com/

### Desteklenen Arama Motorlari
- Google (organic, ads, maps, news, events)
- Bing
- YouTube
- Amazon
- Baidu, Yahoo, Naver, Seznam

### API Kategorileri
- **SERP API** - Organik arama sonuclari
- **Keywords Data API** - Keyword metrikleri
- **Google Ads API** - Paid keyword data
- **Domain Analytics API** - Rakip analizi
- **Backlinks API** - Backlink analizi
- **On-Page API** - Sayfa ici analiz

---

## 2. Kimlik Dogrulama (Authentication)

### Yontem: HTTP Basic Authentication

API key'inizi Base64 ile encode edip header'a ekleyin:

```
Authorization: Basic Base64(api_key:)
```

### Ornek Header
```
Authorization: Basic ZGVtb19hcGlfa2V5OjEyMzQ1Njc4OTA=
```

### Not
- API key, DataForSEO panelinden (app.dataforseo.com) alinir
- Register sayfasi: https://app.dataforseo.com/register/

---

## 3. Keywords Data API

### 3.1 Search Volume Endpoint

**Endpoint:** `POST https://api.dataforseo.com/v3/keywords_data/google/search_volume/live`

Bu endpoint, son ayin arama hacmini, son bir yillik trend'i, CPC ve paid search rakip metriklerini verir.

#### Request Body
```json
{
  "keywords": [" SEO tutorial", "how to learn SEO", "SEO tools 2024"],
  "location_code": 2840,
  "language_code": "en",
  "search_partner": false
}
```

#### Response Fields (Google)
| Field | Aciklama |
|-------|----------|
| search_volume | Aylik ortalama arama hacmi |
| competition | Rakip gorunurluk (0-1 arasinda) |
| competition_index | Rakip indeksi |
| cpc | Tiklama basina maliyet (USD) |
| low_top_of_page_bid | Sayfanin üst kismi icin minimum teklif |
| high_top_of_page_bid | Sayfanin üst kismi icin maksimum teklif |
| monthly_searches | Son 12 ayin aylik arama verileri |
| search_intent | Arama amaci |

#### Limitler
- **Max keywords per request:** 700
- **Request ucretlendirmesi:** Her request tek bir birim olarak ucretlendirilir (1 veya 700 keyword fark etmez)

### 3.2 Keyword Difficulty

**Endpoint:** `POST https://api.dataforseo.com/v3/dataforseo_labs/google/bulk_keyword_difficulty/live`

```json
{
  "keywords": [" SEO", "digital marketing", "content marketing"]
}
```

#### Response
```json
{
  "tasks": [{
    "result": [{
      "keyword": "SEO",
      "difficulty": 65.4,
      "difficulty_level": "hard"
    }]
  }]
}
```

### 3.3 Keyword Suggestions

**Endpoint:** `POST https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live`

Belirli bir keyword icin ilgili anahtar kelime önerileri verir.

#### Request
```json
{
  "keywords": ["marketing software"],
  "location_code": 2840,
  "language_code": "en"
}
```

### 3.4 Related Keywords

**Endpoint:** `POST https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live`

Bir domain veya keyword icin ilgili anahtar kelimeler verir.

---

## 4. Google Ads API

### 4.1 Search Volume (Recommended)

**Endpoint:** `POST https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live`

Keyword bazinda Google Ads arama hacmi, CPC, competition verilerini verir.

#### Request
```json
{
  "keywords": ["buy laptop", "best laptop 2024", "laptop prices"],
  "location_code": 2840,
  "language_code": "en",
  "include_adult_keywords": false,
  "sort_by": "search_volume",
  "limit": 100
}
```

#### Response Fields (Google Ads)
| Field | Aciklama |
|-------|----------|
| search_volume | Aylik ortalama arama hacmi |
| monthly_searches | Son 12 ayin aylik veriler |
| competition | Rakip gorunurluk |
| competition_index | 0-100 arasinda rakip indeksi |
| low_top_of_page_bid | Minimum teklif |
| high_top_of_page_bid | Maksimum teklif |
| cpc | Tiklama basina maliyet |

#### Limitler
- **Max keywords per request:** 1000
- **Rate limit:** 12 request/dakika
- Her request tek bir birim olarak ucretlendirilir

### 4.2 Keywords For Site

Bir domain icin anahtar kelime önerileri verir.

**Endpoint:** `POST https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_site/task_post/`

### 4.3 Search Volume History

Gecmis arama hacmi verileri.

**Endpoint:** `POST https://api.dataforseo.com/v3/keywords_data/google/search_volume_history/task_post/`

---

## 5. SERP API

### 5.1 Organic Results

**Endpoint:** `POST https://api.dataforseo.com/v3/serp/google/organic/task_post/`

Google organik arama sonuclarini verir (rank tracking icin).

#### Request
```json
{
  "keywords": [" SEO software", "best SEO tools"],
  "location_code": 2840,
  "language_code": "en",
  "device": "desktop",
  "depth": 10
}
```

#### Response Fields
| Field | Aciklama |
|-------|----------|
| results_count | Toplam sonuc sayisi |
| items | Organik sonuclar dizisi |
| domain | Sitenin domain'i |
| title | Baslik |
| url | URL |
| description | Snippet |
| rank_absolute | Mutlak sira |
| rank_group | Grup ici sira |

### 5.2 Live Endpoints

Anlik sonuc almak icin live endpoint'ler kullanilir:

- `POST https://api.dataforseo.com/v3/serp/google/organic/live/regular/`
- `POST https://api.dataforseo.com/v3/serp/google/organic/live/advanced/`
- `POST https://api.dataforseo.com/v3/serp/google/organic/live/html/`

### 5.3 SERP Features

Google SERP ozellikleri (featured snippets, people also ask, vb.):

**Endpoint:** `POST https://api.dataforseo.com/v3/serp/google/overview/`

---

## 6. Data Points ve Metricler

### Search Volume
- Son aya ait ortalama aylik arama sayisi
- Gecmis trend (12 ay)
- Aylik gecerlilik

### CPC (Cost Per Click)
- USD cinsinden tiklama basina maliyet
- Dusuk ve yuksek sayfa teklifleri

### Competition
- 0-1 arasinda normalize deger
- 0-100 arasinda index degeri (competition_index)
- Yalnizca paid SERP icin

### Keyword Difficulty
- 0-100 arasinda skor
- Zorluk seviyeleri: easy, medium, hard

### Monthly Searches
```json
{
  "2024-01": 12400,
  "2024-02": 11800,
  ...
}
```

### Search Intent
- informational
- navigational
- commercial
- transactional

---

## 7. Bulk Istekler ve Pagination

### Bulk Keyword Requests
- Keywords Data API: maximum 700-1000 keywords/request
- Google Ads API: maximum 1000 keywords/request
- Her request tek bir birim olarak ucretlendirilir

### Data Retrieval Metodlari

#### 1. Live Method
Aninda sonuc verir (POST -> Response).

```
POST /keywords_data/google/search_volume/live
-> Instant response
```

#### 2. Standard Method (Async)
Iki adimli islem:
1. POST ile task olustur
2. GET ile sonucu cek

```
POST /keywords_data/google/search_volume/task_post
-> Task ID al

GET /keywords_data/google/search_volume/tasks_ready
-> Sonuclari kontrol et

GET /keywords_data/google/search_volume/task_get
-> Sonuclari al
```

### Pagination
Bulk sonuclar icin offset/limit parametreleri kullanilir.

---

## 8. Fiyatlandirma

### Model: Pay-As-You-Go
- Kullanim basa ucretlendirme
- Her API call ayri ucretlendirilir
- Keyword sayisi fark etmez (1 veya 1000 ayni ucret)

###cret Ketleri
- **Minimum odeme:** $50
- **Ucretsiz deneme:** Yeni kayitlar icin sinirsiz kullanim
- **Credit system:** Her request "credit" carpir

### Ornek Fiyatlar (Nis 2026)
- Search Volume API: ~$0.001-0.01 per request
- SERP API: ~$0.01-0.05 per request
- Detayli fiyatlar icin: https://dataforseo.com/pricing

### Ucretsiz Tools
- Top 1000 Keywords
- Top 1000 Websites by Ranking
- SERP Volatility Index

---

## 9. Python Ornekleri

### 9.1 Search Volume Sorgula

```python
import requests
import base64
import json

# Auth setup
api_key = "your_api_key_here"
credentials = f"{api_key}:".encode()
encoded_credentials = base64.b64encode(credentials).decode()

headers = {
    "Authorization": f"Basic {encoded_credentials}",
    "Content-Type": "application/json"
}

# Search Volume API
url = "https://api.dataforseo.com/v3/keywords_data/google/search_volume/live"

payload = {
    "keywords": ["SEO tools", "best CRM software", "marketing automation"],
    "location_code": 2840,  # USA
    "language_code": "en"
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()

# Sonuclari isle
for result in data.get("tasks", []):
    for item in result.get("result", []):
        print(f"Keyword: {item['keyword']}")
        print(f"Search Volume: {item.get('search_volume', 'N/A')}")
        print(f"CPC: ${item.get('cpc', 'N/A')}")
        print(f"Competition: {item.get('competition', 'N/A')}")
        print("---")
```

### 9.2 Google Ads Search Volume

```python
import requests
import base64

api_key = "your_api_key_here"
encoded = base64.b64encode(f"{api_key}:".encode()).decode()

headers = {
    "Authorization": f"Basic {encoded}",
    "Content-Type": "application/json"
}

url = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live"

payload = {
    "keywords": ["buy laptop", "laptop deals", "discount laptops"],
    "location_code": 2840,
    "language_code": "en",
    "sort_by": "search_volume",
    "limit": 50
}

response = requests.post(url, json=payload, headers=headers)
results = response.json()

# Parse response
for task in results.get("tasks", []):
    for keyword_data in task.get("result", []):
        print(f"Keyword: {keyword_data['keyword']}")
        print(f"Monthly Searches: {keyword_data.get('search_volume', 0)}")
        print(f"CPC: ${keyword_data.get('cpc', {}).get('value', 0)}")
        print(f"Competition Index: {keyword_data.get('competition_index', 'N/A')}")
```

### 9.3 SERP Organic Results

```python
import requests
import base64

api_key = "your_api_key_here"
encoded = base64.b64encode(f"{api_key}:".encode()).decode()

headers = {
    "Authorization": f"Basic {encoded}",
    "Content-Type": "application/json"
}

# Task POST - Start scraping
url = "https://api.dataforseo.com/v3/serp/google/organic/task_post"

payload = {
    "keywords": ["content marketing strategy"],
    "location_code": 2840,
    "language_code": "en",
    "device": "desktop",
    "depth": 10
}

post_response = requests.post(url, json=payload, headers=headers)
task_id = post_response.json()["tasks"][0]["id"]

# Check if ready
check_url = f"https://api.dataforseo.com/v3/serp/google/organic/tasks_ready"
ready_response = requests.post(check_url, json={"id": task_id}, headers=headers)

# Get results
if ready_response.json().get("results"):
    get_url = f"https://api.dataforseo.com/v3/serp/google/organic/task_get/regular"
    results = requests.post(get_url, json={"id": task_id}, headers=headers)
    
    for item in results.json()["results"]:
        print(f"Rank {item['rank_absolute']}: {item['title']}")
        print(f"URL: {item['url']}")
```

### 9.4 Bulk Keyword Difficulty

```python
import requests
import base64

api_key = "your_api_key_here"
encoded = base64.b64encode(f"{api_key}:".encode()).decode()

headers = {
    "Authorization": f"Basic {encoded}",
    "Content-Type": "application/json"
}

url = "https://api.dataforseo.com/v3/dataforseo_labs/google/bulk_keyword_difficulty/live"

payload = {
    "keywords": [
        "SEO", "digital marketing", "content strategy",
        "social media marketing", "email marketing",
        " PPC advertising", "influencer marketing"
    ],
    "location_code": 2840,
    "language_code": "en"
}

response = requests.post(url, json=payload, headers=headers)
data = response.json()

for task in data.get("tasks", []):
    for item in task.get("result", []):
        difficulty = item.get("difficulty", 0)
        level = "Easy" if difficulty < 33 else "Medium" if difficulty < 66 else "Hard"
        print(f"{item['keyword']}: {difficulty:.1f} ({level})")
```

### 9.5 Location ve Language Kodlari

```python
import requests
import base64

api_key = "your_api_key_here"
encoded = base64.b64encode(f"{api_key}:".encode()).decode()

headers = {
    "Authorization": f"Basic {encoded}"
}

# Get available locations
locations_url = "https://api.dataforseo.com/v3/keywords_data/google/locations"
locations_response = requests.get(locations_url, headers=headers)
print("Available Locations:")
print(locations_response.json())

# Get available languages
languages_url = "https://api.dataforseo.com/v3/keywords_data/google/languages"
languages_response = requests.get(languages_url, headers=headers)
print("Available Languages:")
print(languages_response.json())
```

---

## Hata Kodlari

| Kod | Aciklama |
|-----|----------|
| 20000 | Genel hata |
| 40001 | Gecersiz keyword |
| 40002 | Gecersiz location |
| 40003 | Gecersiz language |
| 40100 | Yetkilendirme basarisiz |
| 40200 | Yetersiz kredi |
| 40300 | Istek siniri askildi |
| 50000 | Sunucu hatasi |

Tam liste: https://docs.dataforseo.com/v3/appendix/errors/

---

## En Iyi Uygulamalar

1. **Bulk istemek:** Her requestte mumkun oldugunca fazla keyword gonderin (700-1000'e kadar)
2. **Rate limiting:** Google Ads Live endpointleri icin dakikada 12 istek siniri var
3. **Async tercih:** Gercek zamanli sonuc gerekmiyorsa Standard (async) metodu daha ucuz
4. **Ortalama maliyet:** Tek keyword veya 1000 keyword ayni ucret, bu yüzden bulk gonderin
5. **Caching:** API sonuclarini cacheleyin, ayni keywordlar icin tekrar cagirmayin

---

## Faydali Linkler

- API Dokumantasyon: https://docs.dataforseo.com/v3/
- Fiyatlandirma: https://dataforseo.com/pricing
- Help Center: https://dataforseo.com/help-center/
- Free Tools: https://dataforseo.com/free-seo-stats/
