# Adjust API Dokümantasyonu

## Genel Bakış

Adjust, mobil uygulama attributon ve analytics platformudur. API'si üzerinden kampanya istatistikleri, install verileri, event verileri ve daha fazlasına programatik olarak erişilebilir.

**Base URL:** `https://api.adjust.com`

**API Versiyon:** v1

---

## Kimlik Doğrulama (Authentication)

### API Token Alma
1. Adjust Dashboard'da (https://suite.adjust.com) giriş yapın
2. **Settings > API Credentials** bölümüne gidin
3. Yeni API Token oluşturun veya mevcut token'ı kopyalayın

### Authentication Yöntemi
API token, HTTP Authorization header'ında Bearer token olarak gönderilir:

```
Authorization: Bearer {API_TOKEN}
```

---

## Ana Endpoints

### 1. Kampanya Listesi
**Endpoint:** `GET https://api.adjust.com/v1/campaigns`

Kampanya bilgilerini listeler.

**Query Parametreleri:**
- `app_token` (zorunlu): Uygulama token'ı
- `token` (zorunlu): API token
- `date_range`: `today`, `yesterday`, `last_7_days`, `last_30_days`, `this_month`, `last_month`
- `fields`: Döndürülecek alanlar (virgülle ayrılmış)

**Örnek:**
```bash
curl -H "Authorization: Bearer {API_TOKEN}" \
  "https://api.adjust.com/v1/campaigns?app_token={APP_TOKEN}&date_range=last_7_days"
```

---

### 2. İstatistikler (Statistics)
**Endpoint:** `GET https://api.adjust.com/v1/statistics`

Kampanya istatistiklerini getirir.

**Query Parametreleri:**
- `app_token` (zorunlu): Uygulama token'ı
- `token` (zorunlu): API token
- `start_date` (zorunlu): Başlangıç tarihi (YYYY-MM-DD)
- `end_date` (zorunlu): Bitiş tarihi (YYYY-MM-DD)
- `campaigns`: Kampanya ID'leri (virgülle ayrılmış)
- `adgroups`: Adgroup ID'leri
- `countries`: Ülke kodları
- `grouping`: Gruplama parametresi (`campaign`, `adgroup`, `country`, `os`, `device`, `network`)
- `kpis`: KPI metricleri

**Örnek:**
```bash
curl -H "Authorization: Bearer {API_TOKEN}" \
  "https://api.adjust.com/v1/statistics?app_token={APP_TOKEN}&start_date=2024-01-01&end_date=2024-01-07&grouping=campaign,country"
```

---

### 3. Event Verileri
**Endpoint:** `GET https://api.adjust.com/v1/events`

Event (satın alma, kayıt vb.) verilerini getirir.

**Query Parametreleri:**
- `app_token` (zorunlu)
- `token` (zorunlu)
- `start_date` (zorunlu)
- `end_date` (zorunlu)
- `event_names`: Event isimleri
- `campaigns`: Kampanya filtreleri

---

### 4. Uygulama Bilgileri
**Endpoint:** `GET https://api.adjust.com/v1/apps`

Hesabınızdaki uygulamaları listeler.

**Örnek:**
```bash
curl -H "Authorization: Bearer {API_TOKEN}" \
  "https://api.adjust.com/v1/apps?token={API_TOKEN}"
```

---

## Çekilebilecek Veriler

### Installs (Kurulumlar)
- Toplam install sayısı
- Organik vs non-organik installlar
- Install tarihleri
- Cihaz dağılımı

### Sessions (Oturumlar)
- Session sayısı
- Session süresi
- Kullanıcı retension rate

### Events (Olaylar)
- **Registration**: Kayıt eventi
- **Purchase**: Satın alma eventi
- Revenue verileri
- Event attribution

### Spend (Harcama)
- Kampanya harcamaları
- CPI (Cost Per Install) verileri
- Spend by network

### Breakdown Metrikleri
- **Country Breakdown**: Ülke bazlı dağılım
- **Device Breakdown**: Cihaz bazlı dağılım
- **OS Breakdown**: İşletim sistemi dağılımı
- **Network Breakdown**: Network bazlı dağılım
- **Campaign Breakdown**: Kampanya bazlı dağılım
- **Adgroup Breakdown**: Adgroup bazlı dağılım

---

## Parametreler Detayı

### Tarih Parametreleri
| Parametre | Açıklama | Format |
|-----------|----------|--------|
| `start_date` | Başlangıç tarihi | YYYY-MM-DD |
| `end_date` | Bitiş tarihi | YYYY-MM-DD |
| `date_range` | Hazır tarih aralıkları | today, yesterday, last_7_days, last_30_days, this_month, last_month |

### Gruplama (Grouping) Parametreleri
- `campaign` - Kampanya bazlı
- `adgroup` - Adgroup bazlı
- `country` - Ülke bazlı
- `os` - İşletim sistemi bazlı
- `device` - Cihaz bazlı
- `network` - Network bazlı

### KPI Metricleri
- `installs` - Kurulum sayısı
- `sessions` - Oturum sayısı
- `events` - Event sayısı
- `revenue` - Gelir
- `deals` - Anlaşma verileri
- `cohort` - Kohort analizi

---

## Response Formatı

Tüm API yanıtları JSON formatındadır.

**Başarılı Yanıt:**
```json
{
  "status": "success",
  "data": {
    "campaigns": [
      {
        "campaign_id": "abc123",
        "name": "Summer Campaign",
        "installs": 15000,
        "sessions": 45000,
        "revenue": 12500.00
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 100
    }
  }
}
```

---

## Rate Limits

- **Standard Rate Limit**: Saatlik 10,000 istek
- **Burst Limit**: Saniyede 100 istek
- Aşımlarda `429 Too Many Requests` hatası döner

---

## Örnek API Call'ları

### 1. Son 7 Günün Kampanya İstatistikleri
```bash
curl -X GET \
  -H "Authorization: Bearer {API_TOKEN}" \
  "https://api.adjust.com/v1/statistics?app_token={APP_TOKEN}&start_date=2024-01-01&end_date=2024-01-07&grouping=campaign,network&kpis=installs,revenue"
```

### 2. Ülke Bazlı Dağılım
```bash
curl -X GET \
  -H "Authorization: Bearer {API_TOKEN}" \
  "https://api.adjust.com/v1/statistics?app_token={APP_TOKEN}&start_date=2024-01-01&end_date=2024-01-07&grouping=country"
```

### 3. Event Verileri (Satın Almalar)
```bash
curl -X GET \
  -H "Authorization: Bearer {API_TOKEN}" \
  "https://api.adjust.com/v1/events?app_token={APP_TOKEN}&start_date=2024-01-01&end_date=2024-01-07&event_names=purchase"
```

### 4. Cihaz Bazlı Breakdown
```bash
curl -X GET \
  -H "Authorization: Bearer {API_TOKEN}" \
  "https://api.adjust.com/v1/statistics?app_token={APP_TOKEN}&start_date=2024-01-01&end_date=2024-01-07&grouping=device"
```

---

## Yaygın Hatalar

| HTTP Kodu | Açıklama |
|-----------|----------|
| 400 | Geçersiz istek parametreleri |
| 401 | Geçersiz veya eksik API token |
| 403 | Yetersiz izinler |
| 404 | Kaynak bulunamadı |
| 429 | Rate limit aşıldı |
| 500 | Sunucu hatası |

---

## Faydalı Kaynaklar

- Adjust Dashboard: https://suite.adjust.com
- Adjust Help Center: https://help.adjust.com
- Adjust API Documentation: https://docs.adjust.com

---

## Notlar

1. Tüm tarih parametreleri `YYYY-MM-DD` formatındadır
2. `app_token` Adjust dashboard'da uygulama detaylarından bulunabilir
3. Bazı endpointler enterprise plan gerektirebilir
4. Rate limit aşımında `Retry-After` header'ı döner

