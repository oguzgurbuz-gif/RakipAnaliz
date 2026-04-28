# Google Ads API Dokümantasyonu

**Versiyon:** Google Ads API v21 (en güncel stable)
**Son Güncelleme:** Nisan 2026
**API Ortamı:** Google Ads API v21, Google Ads UI, Google Ads Editor

---

## 1. Genel Bakış

Google Ads API, Google Ads hesaplarını programatik olarak yönetmek için kullanılan REST tabanlı bir API'dir. kampanya oluşturma/düzenleme/silme, performans verisi çekme, Auction Insights analizi ve reklam stratejisi optimizasyonu yapılabilir.

**Base URL:**
```
https://googleads.googleapis.com/v21
```

**Versiyon Geçmişi:**
- v21 (güncel): 2024 sonu çıktı, Gemini entegrasyonu, improved audience signals
- v17-v19: Legacy, hala çalışıyor ama deprecated sürecinde
- v15 ve altı: EOL (end of life)

---

## 2. Authentication

Google Ads API authentication üç bileşen gerektirir:

### 2.1 Gerekli Kimlik Bilgileri

```
1. Developer Token          → https://developers.google.com/google-ads/api/docs/get-token
2. OAuth2 Client ID/Secret  → Google Cloud Console'dan
3. Refresh Token            → OAuth2 flow ile üretilen
4. Customer ID               → Google Ads hesap numarası (xxx-xxx-xxxx formatı)
```

### 2.2 OAuth2 Refresh Token Flow

Google Ads API, **OAuth2 Authorization Code flow** kullanır. Refresh token ile uzun ömürlü erişim sağlanır.

```python
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
import google.auth

# OAuth2 parametreleri
OAUTH_CLIENT_ID = "your-client-id.apps.googleusercontent.com"
OAUTH_CLIENT_SECRET = "your-client-secret"
REFRESH_TOKEN = "1//0xxxxxxxxxxxxxxxxxxxxx"

credentials = Credentials(
    token=None,
    refresh_token=REFRESH_TOKEN,
    client_id=OAUTH_CLIENT_ID,
    client_secret=OAUTH_CLIENT_SECRET,
    scopes=["https://www.googleapis.com/auth/adwords"]
)

# Token yenile
credentials.refresh(Request())

print(f"Access Token: {credentials.token}")
```

### 2.3 Google Ads API Client Kurulumu

```python
# pip install google-ads

from google.ads.google_ads.client import GoogleAdsClient
from google.ads.google_ads import Version

# Config dictionary ile
config = {
    "developer_token": "xxxxxxxxxxxxxxxxxxxxxx",
    "refresh_token": REFRESH_TOKEN,
    "client_id": OAUTH_CLIENT_ID,
    "client_secret": OAUTH_CLIENT_SECRET,
    "use_proto_plus": True,
}

client = GoogleAdsClient.load_from_dict(config)

# Versiyon seçimi
ga_service = client.get_service("GoogleAdsService", version=Version.V21)
```

### 2.4 Config File Yöntemi

```python
# ~/google-ads.yaml dosyası olarak kaydet

developer_token: "xxxxxxxxxxxxxxxxxxxxxx"
refresh_token: "1//0xxxxxxxxxxxxxxxxxxxxx"
client_id: "xxx.apps.googleusercontent.com"
client_secret: "xxx"
login_customer_id: "xxx-xxx-xxxx"  # MCC ID veya direkt hesap ID
use_proto_plus: true
```

```python
from google.ads.google_ads.client import GoogleAdsClient

client = GoogleAdsClient.load_from_storage(path="~/google-ads.yaml")
ga_service = client.get_service("GoogleAdsService")
```

---

## 3. Developer Token ve Erişim Seviyeleri

### 3.1 Token Tipleri

| Token Tipi | Erişim | Açıklama |
|---|---|---|
| **Basic** | Sınırlı | Yeni başvuranlar için, 90 gün test süresi, rate limit düşük |
| **Standard** | Tam | Test süresi sonrası onaylanan, full API access |
| **Premium** | Full + Advanced | Büyük ajanslar/MCC sahipleri, elevated limits |

**Basic Token Başvurusu:** https://ads.google.com/home/tools/manage/  
**Onay Süresi:** 24-48 saat (basic), 1-2 hafta (standard)

### 3.2 Token Kısıtlamaları

- **Basic:** Sadece test hesapları (maks 5 hesap), 10.000 request/24h
- **Standard:** Production hesapları, 125.000 request/24h (v21)
- Rate limit aşımında 403 QuotaExceeded hatası döner

---

## 4. MCC vs Individual Account Yapısı

### 4.1 MCC (My Client Center)

```
MCC (xxx-xxx-xxxx)
├── Client Account 1 (yyy-yyy-yyyy)
│   ├── Campaign A
│   └── Campaign B
├── Client Account 2 (zzz-zzz-zzzz)
│   └── Campaign C
└── Client Account 3 (www-www-wwww)
```

**MCC Avantajları:**
- Tek bir API erişimi ile tüm alt hesapları yönetme
- Cross-account raporlama
- Aggregated spend ve performance görünümü
- Birden fazla hesap için tek token

### 4.2 MCC Oladan API Erişimi

**MCC olmadan (Direct Access):**
- Sadece tek bir hesaba erişim
- Auction Insights sadece kendi kampanyaların için
- Competitor verisi sınırlı

**MCC ile:**
- Tüm client hesaplara listeleme erişimi
- Alt hesapların Auction Insights verilerine erişim
- Bulk operasyonlar (batch kampanya oluşturma)

### 4.3 Login Customer ID

```python
# Alt hesaba erişirken
config["login_customer_id"] = "mcc-xxx-xxx-xxxx"  # MCC ID
config["linked_customer_id"] = "yyy-yyy-yyyy"     # Hedef hesap ID

# Sadece MCC altındaysanız erişebilirsiniz
```

---

## 5. Temel Endpoint'ler ve API Yapısı

### 5.1 Google Ads API v21 Servisleri

```python
# Ana servisler
GoogleAdsService         → Ana sorgulama servisi (GAQL query)
CampaignService         → Kampanya CRUD
AdGroupService          → Ad Group CRUD  
KeywordViewService      → Keyword seviyesinde veri
AuctionInsightService   → Auction Insights competitor verileri
AudienceInsightsService → Audience analizi
```

### 5.2 Base Request Pattern

```python
from google.ads.google_ads.client import GoogleAdsClient
from google.protobuf import field_mask_pb2

client = GoogleAdsClient.load_from_storage()
ga_service = client.get_service("GoogleAdsService")

# GAQL (Google Ads Query Language) ile sorgu
query = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        segments.device
    FROM campaign
    WHERE campaign.status IN ('ENABLED', 'PAUSED')
        AND segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
"""

# SearchStream ile paginated sonuç
response = ga_service.search_stream(
    customer_id="xxx-xxx-xxxx",
    query=query
)

for batch in response:
    for row in batch.results:
        campaign = row.campaign
        metrics = row.metrics
        print(f"{campaign.name}: {metrics.impressions} impressions")
```

### 5.3 Temel Sorgu Örnekleri

**Kampanya Listesi:**
```python
query = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign bidding_strategy.type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.search_impression_share
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
"""
```

**Ad Group Seviyesi:**
```python
query = """
    SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status,
        campaign.id,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr
    FROM ad_group
    WHERE campaign.status = 'ENABLED'
    ORDER BY metrics.impressions DESC
"""
```

**Keyword Performance:**
```python
query = """
    SELECT
        keyword_view.resource_name,
        keyword_ad_group_probe.status,
        keyword_ad_group_probe.keyword.text,
        keyword_ad_group_probe.keyword.match_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.search_impression_share,
        metrics.search_top_impression_share
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
"""
```

---

## 6. Auction Insights API

Auction Insights, bir kampanyanın **subdomains (rakipler)** ile olan rekabet durumunu gösteren benzersiz bir veri setidir.

### 6.1 Auction Insights Nedir?

Google Auction Insight, reklamverenlerin search auctions'ta kimlerle rekabet ettiğini gösterir. Bu veriler **sadece search channel** için mevcuttur ve kampanya seviyesinde raporlanır.

**Önemli Not:** Auction Insights, her zaman **kendi kampanyanın** perspektifinden raporlanır. Rakip verileri, sizin kampanyanızın hangi auction'larda yer aldığını ve o auction'larda kimin kazandığını gösterir.

### 6.2 Auction Insights Metrics

| Metric | Açıklama |
|---|---|
| `auction_insight_entries.keyword` | Rakip anahtar kelime |
| `auction_insight_entries.impression_share` | Toplam impression'da rakiptin payı |
| `auction_insight_entries.position` | Ortalama reklam pozisyonu |
| `auction_insight_entries.overlap_rate` | Rakip ile aynı auction'da bulunma yüzdesi |
| `auction_insight_entries.position_above_rate` | Rakibin sizden üstte olduğu oran |
| `auction_insight_entries.top_of_page_rate` | Tüm rakipler içinde top of page oranı |
| `auction_insight_entries.avg_cpc` | Rakip ortalama CPC |

### 6.3 Auction Insights Sorgusu

```python
query = """
    SELECT
        campaign.id,
        campaign.name,
        auction_insight_resource.keyword,
        metrics.auction_insight_entries.impression_share,
        metrics.auction_insight_entries.overlap_rate,
        metrics.auction_insight_entries.position_above_rate,
        metrics.auction_insight_entries.top_of_page_rate,
        metrics.auction_insight_entries.avg_cpc
    FROM auction_insight
    WHERE segments.device = 'UNKNOWN'
    ORDER BY metrics.auction_insight_entries.impression_share DESC
"""

# Alternative: campaign-level direct query
query_v2 = """
    SELECT
        campaign.id,
        campaign.name,
        metrics.auction_insight_top_cpm_bid_auction_insight_entries,
        metrics.auction_insight_top_impression_share_auction_insight_entries,
        metrics.auction_insight_lowest_cost_auction_insight_entries
    FROM auction_insight
    WHERE campaign.id = {campaign_id}
"""
```

### 6.4 Auction Insights Verilerinin Analizi

```python
# Auction Insights verisini çekme
response = ga_service.search(
    customer_id="xxx-xxx-xxxx",
    query=query,
    page_size=1000
)

auction_data = []
for row in response.results:
    campaign = row.campaign
    # Auction insight metrics
    ai_metrics = row.auction_insight
    for entry in ai_metrics:
        auction_data.append({
            "campaign_id": campaign.id,
            "campaign_name": campaign.name,
            "competitor_domain": entry.domain,
            "impression_share": entry.impression_share,
            "overlap_rate": entry.overlap_rate,
            "position_above_rate": entry.position_above_rate,
            "top_of_page_rate": entry.top_of_page_rate,
            "avg_cpc": entry.avg_cpc,
        })

# DataFrame'e çevir
import pandas as pd
df = pd.DataFrame(auction_data)
print(df.head(20))
```

### 6.5 Auction Insight Sınırları

- **Sadece Search** kampanyalarında mevcut (Display, Performance Max hariç)
- **Minimum traffic** eşiği yoksa veri raporlanmaz (genelde 100+ impressions/gün)
- **Geçmiş veri:** Sadece son 90 gün
- **Granularity:** Kampanya seviyesinde, keyword seviyesinde değil (v21'de keyword-level yok)
- **Data delay:** Yaklaşık 3-5 gün gecikme olabilir

---

## 7. Spend, Impressions, Clicks, CPC, CTR Verileri

### 7.1 Metrics API'si

Google Ads API'de metrics, **metrics.* resource field** ile çekilir ve raporlamada kritik öneme sahiptir.

**Temel Metrics Listesi:**

| Metric | GAQL Field | Açıklama |
|---|---|---|
| Spend | `metrics.cost_micros` | Toplam maliyet (micros = 1e-6) |
| Impressions | `metrics.impressions` | Gösterim sayısı |
| Clicks | `metrics.clicks` | Tıklama sayısı |
| CPC | `metrics.average_cpc` | Ortalama tıklama başına maliyet |
| CTR | `metrics.ctr` | Tıklama oranı |
| CPM | `metrics.average_cpm` | 1000 gösterim başına maliyet |
| Conversions | `metrics.conversions` | Dönüşüm sayısı |
| Conv. Value | `metrics.conversions_value` | Dönüşüm değeri |
| ROAS | `metrics.adjusted_roas` | Düzeltilmiş ROAS |
| Search IS | `metrics.search_impression_share` | Arama gösterim payı |
| Display IS | `metrics.display_impression_share` | Görüntüleme gösterim payı |
| Avg. Position | `metrics.avg_position` | Ortalama pozisyon |

### 7.2 Spend Verisi Çekme

```python
# Spend raporu - kampanya bazlı
query_spend = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions,
        metrics.conversions_value,
        segments.date,
        segments.device,
        segments.network
    FROM campaign
    WHERE segments.date BETWEEN '2026-03-01' AND '2026-03-31'
    ORDER BY metrics.cost_micros DESC
"""

# Micros to currency (Python)
def micros_to_currency(micros):
    return micros / 1_000_000 if micros else 0

response = ga_service.search(customer_id="xxx-xxx-xxxx", query=query_spend)

for row in response.results:
    spend = micros_to_currency(row.metrics.cost_micros)
    print(f"{row.campaign.name}: ${spend:.2f}")
```

### 7.3 Impressions ve Click Verileri

```python
# impressions, clicks, CTR detaylı rapor
query_performance = """
    SELECT
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name,
        segments.date,
        segments.device,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros,
        metrics.conversions
    FROM ad_group
    WHERE segments.date DURING LAST_30_DAYS
        AND campaign.status = 'ENABLED'
    ORDER BY metrics.impressions DESC
"""
```

### 7.4 CPC ve Impression Share

```python
# CPC + IS raporu
query_cpc = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.target_cpa,
        metrics.impressions,
        metrics.clicks,
        metrics.average_cpc,
        metrics.search_impression_share,
        metrics.search_top_impression_share,
        metrics.search_absolute_top_impression_share,
        metrics.search_budget_lost_impression_share,
        metrics.search_rank_lost_impression_share
    FROM campaign
    WHERE segments.date DURING LAST_7_DAYS
    ORDER BY metrics.search_impression_share ASC
"""
```

---

## 8. Campaign, Ad Group, Keyword Seviyesi Veriler

### 8.1 Campaign Seviyesi

```python
# Tüm kampanya metrikleri
query_campaign = """
    SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign.bidding_strategy_type,
        campaign.target_cpc,
        campaign.target_roas,
        campaign.budget.amount_micros,
        campaign.campaign_budget,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cpm,
        metrics.conversions,
        metrics.conversions_value,
        metrics.search_impression_share,
        metrics.view_through_conversions
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC
    LIMIT 100
"""
```

### 8.2 Ad Group Seviyesi

```python
# Ad Group metrikleri
query_adgroup = """
    SELECT
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group.cpc_bid_micros,
        ad_group.cpm_bid_micros,
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.conversions
    FROM ad_group
    WHERE campaign.status = 'ENABLED'
    ORDER BY metrics.cost_micros DESC
"""
```

### 8.3 Keyword Seviyesi

```python
# Keyword performance
query_keyword = """
    SELECT
        keyword_view.resource_name,
        keyword_ad_group_probe.keyword.text,
        keyword_ad_group_probe.keyword.match_type,
        keyword_ad_group_probe.status,
        ad_group.id,
        ad_group.name,
        campaign.id,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.ctr,
        metrics.average_cpc,
        metrics.search_impression_share,
        metrics.search_top_impression_share,
        metrics.search_absolute_top_impression_share
    FROM keyword_view
    WHERE segments.date DURING LAST_30_DAYS
        AND keyword_ad_group_probe.status IN ('ENABLED', 'PAUSED')
    ORDER BY metrics.impressions DESC
    LIMIT 1000
"""
```

### 8.4 Search Terms Report

Search terms report, arama terimlerinin hangi anahtar kelimeler üzerinden tetiklendiğini gösterir.

```python
# Search Terms Report
query_search_terms = """
    SELECT
        search_term_view.search_term,
        search_term_view.keyword.text,
        search_term_view.keyword.match_type,
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros,
        metrics.conversions
    FROM search_term_view
    WHERE segments.date DURING LAST_30_DAYS
    ORDER BY metrics.impressions DESC
    LIMIT 10000
"""

response = ga_service.search(
    customer_id="xxx-xxx-xxxx",
    query=query_search_terms,
    page_size=10000
)

for row in response.results:
    st = row.search_term_view
    m = row.metrics
    print(f"Term: {st.search_term} | Keyword: {st.keyword.text} | Impr: {m.impressions}")
```

### 8.5 Network ve Device Segmentation

```python
# Device breakdown
query_device = """
    SELECT
        campaign.id,
        campaign.name,
        segments.device,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
"""

# Network breakdown
query_network = """
    SELECT
        campaign.id,
        campaign.name,
        segments.network,
        metrics.impressions,
        metrics.impression_share,
        metrics.avg_cpc,
        metrics.cost_micros
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
"""
```

---

## 9. Örnek API Call'ları (Python)

### 9.1 Tam Kampanya Raporlama Sınıfı

```python
from google.ads.google_ads.client import GoogleAdsClient
from google.ads.google_ads import Version
from google.oauth2.credentials import Credentials
import pandas as pd
from datetime import datetime, timedelta


class GoogleAdsReporter:
    """Google Ads API v21 ile raporlama sınıfı"""
    
    def __init__(self, config_dict):
        self.client = GoogleAdsClient.load_from_dict(config_dict)
        self.ga_service = self.client.get_service("GoogleAdsService")
        self.customer_id = config_dict.get("login_customer_id")
    
    def _micros_to_currency(self, micros):
        """Micros'u USD'ye çevir"""
        return micros / 1_000_000 if micros else 0
    
    def get_campaigns(self, date_range="LAST_30_DAYS"):
        """Kampanya listesi ve metrikler"""
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                campaign.status,
                campaign.advertising_channel_type,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.ctr,
                metrics.average_cpc,
                metrics.conversions,
                metrics.conversions_value
            FROM campaign
            WHERE campaign.status != 'REMOVED'
                AND segments.date DURING {date_range}
            ORDER BY metrics.cost_micros DESC
        """
        
        response = self.ga_service.search(
            customer_id=self.customer_id,
            query=query,
            page_size=1000
        )
        
        data = []
        for row in response.results:
            data.append({
                "campaign_id": row.campaign.id,
                "campaign_name": row.campaign.name,
                "status": row.campaign.status.name,
                "channel": row.campaign.advertising_channel_type.name,
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "spend_usd": self._micros_to_currency(row.metrics.cost_micros),
                "ctr": row.metrics.ctr,
                "avg_cpc": self._micros_to_currency(row.metrics.average_cpc),
                "conversions": row.metrics.conversions,
                "conversion_value": row.metrics.conversions_value,
            })
        
        return pd.DataFrame(data)
    
    def get_auction_insights(self, campaign_id=None):
        """Auction Insights competitor verileri"""
        where_clause = ""
        if campaign_id:
            where_clause = f"WHERE campaign.id = {campaign_id}"
        
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                metrics.auction_insight_entries
            FROM auction_insight
            {where_clause}
        """
        
        response = self.ga_service.search(
            customer_id=self.customer_id,
            query=query,
            page_size=1000
        )
        
        data = []
        for row in response.results:
            ai_entries = row.metrics.auction_insight_entries
            for entry in ai_entries:
                data.append({
                    "campaign_id": row.campaign.id,
                    "campaign_name": row.campaign.name,
                    "competitor": entry.domain,
                    "impression_share": entry.impression_share,
                    "overlap_rate": entry.overlap_rate,
                    "position_above_rate": entry.position_above_rate,
                    "top_of_page_rate": entry.top_of_page_rate,
                    "avg_cpc": entry.avg_cpc,
                })
        
        return pd.DataFrame(data)
    
    def get_adgroup_performance(self, campaign_id=None):
        """Ad Group seviyesinde performans"""
        where_clause = "WHERE campaign.status = 'ENABLED'"
        if campaign_id:
            where_clause += f" AND campaign.id = {campaign_id}"
        
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.ctr,
                metrics.average_cpc
            FROM ad_group
            {where_clause}
            AND segments.date DURING LAST_30_DAYS
            ORDER BY metrics.impressions DESC
        """
        
        response = self.ga_service.search(
            customer_id=self.customer_id,
            query=query,
            page_size=5000
        )
        
        data = []
        for row in response.results:
            data.append({
                "campaign_id": row.campaign.id,
                "campaign_name": row.campaign.name,
                "adgroup_id": row.ad_group.id,
                "adgroup_name": row.ad_group.name,
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "spend_usd": self._micros_to_currency(row.metrics.cost_micros),
                "ctr": row.metrics.ctr,
                "avg_cpc": self._micros_to_currency(row.metrics.average_cpc),
            })
        
        return pd.DataFrame(data)
    
    def get_search_terms(self, limit=10000):
        """Search Terms Report"""
        query = f"""
            SELECT
                search_term_view.search_term,
                search_term_view.keyword.text,
                search_term_view.keyword.match_type,
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.ctr,
                metrics.average_cpc
            FROM search_term_view
            WHERE segments.date DURING LAST_30_DAYS
            ORDER BY metrics.impressions DESC
            LIMIT {limit}
        """
        
        response = self.ga_service.search(
            customer_id=self.customer_id,
            query=query,
            page_size=int(limit)
        )
        
        data = []
        for row in response.results:
            data.append({
                "search_term": row.search_term_view.search_term,
                "keyword_text": row.search_term_view.keyword.text,
                "match_type": row.search_term_view.keyword.match_type.name,
                "campaign_id": row.campaign.id,
                "campaign_name": row.campaign.name,
                "adgroup_id": row.ad_group.id,
                "adgroup_name": row.ad_group.name,
                "impressions": row.metrics.impressions,
                "clicks": row.metrics.clicks,
                "spend_usd": self._micros_to_currency(row.metrics.cost_micros),
                "ctr": row.metrics.ctr,
                "avg_cpc": self._micros_to_currency(row.metrics.average_cpc),
            })
        
        return pd.DataFrame(data)


# Kullanım örneği
config = {
    "developer_token": "DEVELOPER_TOKEN",
    "refresh_token": "REFRESH_TOKEN",
    "client_id": "CLIENT_ID.apps.googleusercontent.com",
    "client_secret": "CLIENT_SECRET",
    "login_customer_id": "XXX-XXX-XXXX",
    "use_proto_plus": True,
}

# reporter = GoogleAdsReporter(config)
# campaigns = reporter.get_campaigns()
# auction = reporter.get_auction_insights()
# search_terms = reporter.get_search_terms()
```

### 9.2 Batch Sorgu (SearchStream)

```python
# Büyük veri setleri için SearchStream
query = """
    SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks
    FROM campaign
    WHERE segments.date DURING LAST_90_DAYS
    ORDER BY metrics.impressions DESC
"""

stream_response = ga_service.search_stream(
    customer_id="xxx-xxx-xxxx",
    query=query
)

total_impressions = 0
for batch in stream_response:
    for row in batch.results:
        total_impressions += row.metrics.impressions
        print(f"{row.campaign.name}: {row.metrics.impressions}")

print(f"Total: {total_impressions}")
```

### 9.3 Kampanya Oluşturma (Mutations)

```python
campaign_service = client.get_service("CampaignService")

# Yeni kampanya oluşturma
campaign_operation = campaign_service.create_campaign_operation(
    customer_id="xxx-xxx-xxxx",
    campaign={
        "name": f"API Test Campaign {datetime.now().strftime('%Y%m%d_%H%M%S')}",
        "advertising_channel_type": 2,  # SEARCH
        "status": 1,  # PAUSED (başlangıçta paused)
        "campaign_budget": f"customers/{customer_id}/campaignBudgets/{budget_id}",
        "network_settings": {
            "target_google_search": True,
            "target_search_network": True,
            "target_partner_search_network": False,
        },
        "geo_target_type": "DONT_CARE",
    }
)

response = campaign_service.mutate_campaigns(
    customer_id="xxx-xxx-xxxx",
    operations=[campaign_operation]
)

print(f"Created campaign: {response.results[0].resource_name}")
```

---

## 10. Rate Limits ve Quota

### 10.1 API Quota Yapısı

| Hesap Tipi | Günlük Limit | Rate Limit |
|---|---|---|
| Basic Token | 10.000 req/24h | 10 req/second |
| Standard Token | 125.000 req/24h | 50 req/second |
| Premium Token | 250.000+ req/24h | 100+ req/second |

### 10.2 Quota Aşımı Hatası

```python
# 403 QuotaExceeded örneği
try:
    response = ga_service.search(customer_id=customer_id, query=query)
except google.api_core.exceptions.ResourceExhausted as e:
    print(f"QuotaExceeded: {e}")
    print("Sleep 60 seconds and retry...")
    time.sleep(60)
    response = ga_service.search(customer_id=customer_id, query=query)
```

### 10.3 Backoff Strategy

```python
import time
from google.api_core.exceptions import ResourceExhausted

def api_call_with_retry(func, max_retries=5):
    for attempt in range(max_retries):
        try:
            return func()
        except ResourceExhausted as e:
            wait_time = min(2 ** attempt * 60, 600)
            print(f"Quota exceeded, waiting {wait_time}s...")
            time.sleep(wait_time)
    raise Exception("Max retries exceeded")
```

### 10.4 Request Size Limitleri

- **Query string:** 10.000 karakter
- **Page size:** 10.000 satır (search), 10.000 (search_stream)
- **Date range:** 16 aydan eski veri raporlanmaz (rolling window)

---

## 11. Önemli Sınırlar ve Dikkat Edilecekler

### 11.1 Genel Sınırlar

- **16 aydan eski veri** raporlanmaz (date range sınırı)
- **Budget:** Negatif budget desteklenmez
- **Campaign:** Bir kampanya minimum 1 ad group içermelidir
- **Keyword:** Bir keyword silinemez, sadece durdurulabilir (status = REMOVED)

### 11.2 Auction Insights Sınırları

- Sadece **Search** channel, Display/YouTube yok
- Minimum veri eşiği: ~100 impressions/gün
- **Overlap rate** sadece aynı dönemde karşılaştırma için anlamlı
- **3-5 gün gecikme** ile raporlanır

### 11.3 MCC Erişim Sınırları

- Alt hesabın **mhk erişim** yetkisi gerekir
- Alt hesabın **API erişimi** açık olmalı
- Alt hesabın ** MCC altında** bağlı olması gerekir

### 11.4 Common Errors

| Error Code | Açıklama |
|---|---|
| 403 AuthenticationError | Token geçersiz veya süresi dolmuş |
| 403 QuotaExceeded | Rate limit aşıldı |
| 404 NotFoundError | Customer ID bulunamadı |
| 400 RequestError | GAQL syntax hatası |
| 400 FieldMaskError | Mutation'da field mask uyumsuzluğu |

---

## 12. Alternatif: Google Ads UI + Sheets Export

API erişimi olmayan durumlarda:

1. **Google Ads UI:** Reports > Pre-defined reports > Auction Insights
2. **Google Sheets Add-on:** Google Analytics + Google Ads integration
3. **Google Ads Editor:** Desktop app, export CSV/TSV
4. **Supermetrics:** Third-party tool (diğer dokümanda detaylı)

---

## 13. Hızlı Referans: GAQL Syntax

```
SELECT {fields}
FROM {resource}
WHERE {conditions}
ORDER BY {field} [DESC|ASC]
LIMIT {n}
PARAMETERS include Diagnostic Info=false
```

**Date Ranges:**
- `LAST_7_DAYS`
- `LAST_30_DAYS`
- `LAST_90_DAYS`
- `LAST_365_DAYS`
- `THIS_YEAR`
- `2026-01-01` to `2026-03-31`

**Kaynaklar (FROM):**
- `campaign`
- `ad_group`
- `keyword_view`
- `search_term_view`
- `auction_insight`
- `ad_group_ad`
- `landing_page_view`
- `geo_target_constant`

---

**Referans:** https://developers.google.com/google-ads/api/docs/query/overview
**API Explorer:** https://developers.google.com/google-ads/api/docs/query/playground
**Changelog:** https://developers.google.com/google-ads/api/changelog
