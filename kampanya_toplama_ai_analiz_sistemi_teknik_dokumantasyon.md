# Türkiye Bahis ve Oyun Kampanya Toplama, Zaman Bazlı Analiz ve AI Destekli Yönetim Platformu
## Detaylı Teknik Dokümantasyon

**Doküman Sürümü:** 2.0.0  
**Dil:** Türkçe  
**Durum:** Uygulanabilir Teknik Tasarım  
**Hedef Kitle:** Backend, frontend, scraper, data, AI, DevOps ve ürün ekipleri  

---

# İçindekiler

1. Giriş ve Genel Bakış  
2. Sistem Mimarisi  
3. Veritabanı Tasarımı  
4. Scraper Modülü  
5. AI Entegrasyonu  
6. Backend API  
7. Frontend Dashboard  
8. İş Akışları  
9. Kurulum ve Deployment  
10. API Referansı  
11. Ekler  
12. Tasarım Kararları ve Varsayımlar  
13. Fazlama ve Yol Haritası  

---

# 1. Giriş ve Genel Bakış

## 1.1 Proje Amacı

Bu projenin amacı, Türkiye’de faaliyet gösteren 12 bahis ve oyun sitesindeki kampanya içeriklerini düzenli olarak toplamak, normalize etmek, kampanya görsellerini URL olarak almak, kampanyanın gerçek başlangıç ve bitiş tarihlerini çıkarmak, yapay zeka ile anlamlandırmak ve zaman eksenli bir yönetim panelinde sunmaktır.

Bu sistem yalnızca bugün hangi kampanya var sorusunu cevaplamak için değil, aynı zamanda aşağıdaki soruları yanıtlamak için tasarlanır:

- Belirli bir hafta veya tarih aralığında hangi kampanyalar başladı?
- Hangi kampanyalar sona erdi?
- Hangi kampanyalar seçilen aralıkta aktifti?
- Hangi kampanyaların metni, süresi, görseli veya şartları değişti?
- Hangi kampanyalar pasife düştü?
- Hangi kategoriler belirli dönemlerde arttı veya azaldı?
- Hangi siteler aynı dönemde benzer kampanya stratejileri kullandı?

Bu dokümandaki en kritik ilke şudur:

**Raporlar scrape edildiği güne göre değil, kampanyanın gerçek geçerlilik zaman aralığına göre üretilecektir.**

Çünkü scraper aynı gün birçok kampanyayı sisteme alabilir. Fakat iş değeri scrape zamanında değil, kampanyanın hangi tarihler arasında geçerli olduğunda oluşur.

## 1.2 Sistem Özeti

Sistem üç temel eksende çalışır:

1. **Toplama:** 12 siteden kampanya verisi, metni, görsel URL’si ve geçerlilik tarihleri toplanır.
2. **Anlamlandırma:** DeepSeek ile kategori, duyarlılık, özet, risk işaretleri ve benzer kampanya analizi yapılır.
3. **Zaman Bazlı Yönetim:** Kampanyalar aktif ve pasif durumları, başlangıç ve bitiş tarihleri ve dönemsel değişimleri ile dashboard’da yönetilir.

## 1.3 Hedef Kitle

Bu sistemin hedef kullanıcıları:

- Operasyon ekipleri
- Rakip analiz ekipleri
- Yönetim ve strateji ekipleri
- İçerik ve kampanya izleme ekipleri
- Veri analisti ve karar destek ekipleri

## 1.4 Temel Başarı Kriterleri

- 12 site düzenli taranmalıdır.
- Kampanya başlığı, açıklaması, kaynak URL’si, görsel URL’si çekilmelidir.
- Kampanya başlangıç ve bitiş tarihleri mümkün olduğunca doğru çıkarılmalıdır.
- Kampanya aktif ve pasif durumu doğru hesaplanmalıdır.
- Aynı kampanya tekrar kaydedilmemelidir.
- Kampanya değişimleri versiyonlu biçimde izlenmelidir.
- Haftalık ve tarih aralıklı raporlar scrape tarihi yerine kampanyanın gerçek tarihleriyle çalışmalıdır.
- Dashboard 30 saniyelik aralıklarla canlı güncellenmelidir.

## 1.5 Kritik Ürün İlkesi

Bu ürün için en önemli tarih alanları şunlardır:

- `valid_from`: kampanyanın gerçek başlangıç tarihi
- `valid_to`: kampanyanın gerçek bitiş tarihi
- `status`: aktif veya pasif
- `first_seen_at`: sistemin kampanyayı ilk gördüğü zaman
- `last_seen_at`: sistemin kampanyayı en son gördüğü zaman

Örnek:

- Scraper 26 Mart 2026 tarihinde çalıştı.
- Sitede 20 Mart 2026 tarihinde başlayan ve 31 Mart 2026 tarihinde bitecek bir kampanya bulundu.

Bu durumda:

- `first_seen_at = 2026-03-26`
- `valid_from = 2026-03-20`
- `valid_to = 2026-03-31`

Raporlarda bu kampanya 26 Mart tarihinde sisteme düşmüş içerik olarak değil, **20 Mart ile 31 Mart arasında aktif bir kampanya** olarak değerlendirilmelidir.

## 1.6 Kapsam

Bu doküman şunları kapsar:

- Playwright tabanlı scraper
- SPA destekli veri toplama
- Otomatik Daha Fazla tıklama
- Kampanya görsel URL’lerinin toplanması
- Metinden AI ile tarih çıkarımı
- Kampanya aktif ve pasif durum hesaplama
- Hash tabanlı deduplication
- Kampanya versiyonlama
- DeepSeek AI analizi
- Zaman bazlı rapor üretimi
- Next.js dashboard
- SSE ile canlı güncelleme
- Docker deployment

## 1.7 Kapsam Dışı Konular

- Görsellerin indirilip storage içine alınması
- Ayrıntılı kullanıcı kimlik doğrulama tasarımı
- Çok kiracılı mimari
- Sadece görselden kampanya okuyan OCR sistemi
- Özel makine öğrenmesi modelleri ile performans tahmini

## 1.8 Terimler Sözlüğü

| Terim | Açıklama |
|---|---|
| Kampanya | Bonus, freebet, çevrim, promosyon, hoş geldin teklifi, depozit bonusu ve benzeri içerik |
| Raw Snapshot | Scraper’ın ham olarak çektiği tekil görünüm |
| Canonical Campaign | Normalize edilip ana kayıt olarak tutulan kampanya |
| Campaign Version | Kampanya metni, tarihleri veya görselleri değiştikçe oluşan versiyon kaydı |
| valid_from | Kampanyanın gerçek başlangıç tarihi |
| valid_to | Kampanyanın gerçek bitiş tarihi |
| first_seen_at | Sistemin kampanyayı ilk gördüğü zaman |
| last_seen_at | Sistemin kampanyayı en son gördüğü zaman |
| Status | Kampanyanın aktif veya pasif durumu |
| Passive | Bitiş tarihi geçmiş veya site üzerinde artık görünmeyen kampanya |
| Active | Bugün itibarıyla başlangıç ve bitiş tarih aralığında olan kampanya |
| AI Date Extraction | Kampanya metninden AI ile tarih çıkarımı |
| SSE | Server-Sent Events ile sunucudan istemciye gerçek zamanlı veri akışı |
| Deduplication | Aynı kampanyanın tekrar kaydedilmesinin engellenmesi |
| Similar Campaign | Metin ve AI yorumuna göre benzer kampanya |
| Weekly Report | Belirli hafta aralığında aktif olan, başlayan, biten veya değişen kampanyaların raporu |

## 1.9 Fonksiyonel Gereksinimler

### 1.9.1 Veri Toplama

- 12 farklı site taranmalıdır.
- Liste ve detay sayfaları desteklenmelidir.
- SPA yapılarına uyumlu olmalıdır.
- Daha Fazla butonuna tıklayarak ek kayıtlar alınabilmelidir.
- Kampanya görsel URL’si çekilmelidir.
- Başlık, açıklama, tarih, görsel ve link çıkarılmalıdır.

### 1.9.2 Tarih Yönetimi

- Açıkça görülen başlangıç ve bitiş tarihleri parse edilmelidir.
- Tarihler açık değilse DeepSeek ile metinden çıkarım yapılmalıdır.
- Çıkarılan tarihler güven skoru ile saklanmalıdır.
- Raporlar scrape tarihine göre değil, kampanya tarihine göre çalışmalıdır.

### 1.9.3 Durum Yönetimi

- `active`: bugün başlangıç ve bitiş aralığındaysa
- `passive`: bitiş tarihi geçmişse veya kampanya sitede artık görünmüyorsa

### 1.9.4 Raporlama

Belirli zaman aralıkları için aşağıdakiler görülebilmelidir:

- O aralıkta başlayan kampanyalar
- O aralıkta biten kampanyalar
- O aralıkta aktif olan kampanyalar
- O aralıkta güncellenen kampanyalar
- O aralıkta pasife düşen kampanyalar

### 1.9.5 Dashboard

- Canlı listeleme olmalı
- Filtreleme olmalı
- Kampanya detayında görsel gösterilmeli
- AI analizleri görünmeli
- Notlar eklenebilmeli
- Haftalık raporlar zaman bazlı olmalı

## 1.10 Fonksiyonel Olmayan Gereksinimler

- Modüler scraper mimarisi
- Güçlü gözlemlenebilirlik
- Tarih çıkarımında audit edilebilir yapı
- Üretim ortamına uygun hata yönetimi
- Geliştirilebilir prompt ve kategori sistemi
- Tek worker’dan çok worker’a geçmeye uygun tasarım

---

# 2. Sistem Mimarisi

## 2.1 Mimari Özeti

Mimari akış:

- Scraper siteleri tarar
- Ham veriyi alır
- Tarih ve görsel alanlarını normalize eder
- Gerekirse AI ile tarih çıkarımı yapar
- Fingerprint ile dedup kontrol eder
- Kampanyayı veritabanına yazar
- AI analiz kuyruğu oluşturur
- DeepSeek duyarlılık, kategori, özet ve benzerlik analizi yapar
- Status hesaplanır veya güncellenir
- Dashboard API veriyi sunar
- SSE ile canlı güncelleme yapılır

## 2.2 Yüksek Seviye ASCII Diyagram

```text
+-----------------------+
| 12 Bahis ve Oyun Sitesi |
| SPA / Liste / Detay     |
+-----------+-------------+
            |
            v
+-------------------------------+
| Scraper Workers               |
| Playwright + Site Adapters    |
| Expand More + Parse + Extract |
+---------------+---------------+
                |
                v
+-------------------------------+
| Normalize + Date Extraction   |
| Parser + AI Date Fallback     |
| Image URL + Fingerprint       |
+---------------+---------------+
                |
                v
+----------------------------------------------+
| PostgreSQL                                   |
| Sites / Campaigns / Versions / AI / Reports  |
+-------------------+--------------------------+
                    |
                    v
+----------------------------------------------+
| AI Worker / DeepSeek                         |
| Sentiment / Category / Summary / Similarity  |
+-------------------+--------------------------+
                    |
                    v
+----------------------------------------------+
| Backend API / BFF                            |
| REST + SSE + Filters + Time Range Analytics  |
+-------------------+--------------------------+
                    |
                    v
+----------------------------------------------+
| Next.js Dashboard                            |
| Liste / Detay / Status / Reports / Notes     |
+----------------------------------------------+
```

## 2.3 Mantıksal Bileşenler

### 2.3.1 Scheduler

- Zamanlanmış scraping tetikler
- Haftalık rapor job’larını üretir
- Status recalculation çalıştırabilir

### 2.3.2 Scraper Core

- Site listesini alır
- Browser ve context oluşturur
- Adapter seçer
- Ortak retry ve timeout mantığını uygular

### 2.3.3 Site Adapter Katmanı

- Siteye özel selector ve davranışları içerir
- Liste ve detay sayfalarını parse eder
- Görsel URL çıkarır
- Raw tarih metinlerini alır

### 2.3.4 Normalization Katmanı

- Metinleri temizler
- URL’leri normalize eder
- Raw tarih alanlarını tek formata dönüştürür
- Fingerprint üretir
- AI tarih çıkarımı gerekip gerekmediğine karar verir

### 2.3.5 AI Worker

- Duyarlılık analizi
- Kategori atama
- Özet üretimi
- Risk işaretleri
- Benzer kampanya önerisi
- Tarih çıkarımı fallback
- Haftalık rapor üretimi

### 2.3.6 Status Engine

- Kampanyanın aktif ve pasif durumunu hesaplar
- Tarihe göre pasife düşürür
- Siteden kaldırılan kampanyaları pasif yapar

### 2.3.7 API ve BFF Katmanı

- Dashboard endpointleri
- Filtreleme
- Zaman aralığı analizi
- SSE kanalı
- Not yönetimi

### 2.3.8 Dashboard

- Kampanya listesi
- Kampanya detayı
- Zaman bazlı rapor görünümü
- Canlı veri akışı

## 2.4 Detaylı Veri Akışı

```text
Scheduler
   -> Create scrape_run
   -> Fetch active sites
   -> Resolve adapter
   -> Page load
   -> Expand more
   -> Extract cards
   -> Optional detail visit
   -> Extract title, body, image, date text, url
   -> Raw snapshot save
   -> Normalize text
   -> Parse dates
   -> If date parse insufficient then enqueue AI date extraction
   -> Compute fingerprint
   -> Dedup check
      -> insert
      -> update version
      -> skip
   -> Compute current status
   -> enqueue AI analysis
   -> publish event
   -> weekly and report pipelines consume
```

## 2.5 Status Hesaplama İlkesi

### Temel Kural

```text
active  = today is between valid_from and valid_to
passive = today is after valid_to or campaign no longer visible on source site
```

### Operasyonel Yorum

- Tarihler varsa önce tarihe göre karar verilir.
- Tarihler yoksa ve kampanya scraper’da artık görünmüyorsa `passive` yapılır.
- Tarihler AI ile çıkarılmışsa `date_source = ai_inferred` olarak işaretlenir.
- Status geçmişi ayrıca tutulur.

## 2.6 Neden Zaman Bazlı Raporlama?

Aynı gün scrape edilen tüm kampanyalar `created_at` üzerinden raporlanırsa, aslında hangi kampanyanın ne zaman başladığı ve bittiği bilgisi kaybolur.

Bu nedenle rapor motoru aşağıdaki eksenleri ayrı değerlendirir:

1. Started in range: seçilen aralıkta başlayanlar
2. Ended in range: seçilen aralıkta bitenler
3. Active during range: seçilen aralıkla çakışan aktiflik dönemi olanlar
4. Changed in range: seçilen aralıkta versiyon değişikliği yaşayanlar
5. Passive in range: seçilen aralıkta pasife düşenler

## 2.7 Neden SSE?

Bu projede istemci daha çok sunucudan veri almak ister. Gerçek zamanlı ihtiyaçlar çoğunlukla tek yönlüdür:

- Yeni kampanya eklendi
- Kampanya pasife düştü
- AI analizi tamamlandı
- Haftalık rapor üretildi

Bu nedenle SSE yeterlidir ve WebSocket’e göre daha basit bir çözümdür.

---

# 3. Veritabanı Tasarımı

## 3.1 Tasarım İlkeleri

Veri modeli aşağıdaki sorunları çözmelidir:

- Raw veri saklama
- Kampanyanın canonical versiyonunu tutma
- Görsel URL’lerini saklama
- Başlangıç ve bitiş tarihlerini kaynak ve güven seviyesiyle tutma
- Status geçmişini izleme
- Zaman bazlı rapor üretme
- Değişiklikleri versiyonlu saklama

## 3.2 Şema Stratejisi

Önerilen şemalar:

- `public`: iş verisi
- `audit`: log ve denetim verisi
- `internal`: queue ve teknik metadata

İlk fazda tek şema ile başlanabilir.

## 3.3 Ana Tablolar

- sites
- scrape_runs
- scrape_run_sites
- raw_campaign_snapshots
- campaigns
- campaign_images
- campaign_versions
- campaign_status_history
- campaign_ai_analyses
- campaign_similarities
- campaign_notes
- weekly_reports
- weekly_report_items
- job_queue
- sse_events
- error_logs

## 3.4 İlişki Diyagramı ASCII

```text
sites
  |
  | 1:N
  v
campaigns ---- 1:N ---- campaign_versions
  |  
  |---- 1:N ---- campaign_images
  |
  |---- 1:N ---- campaign_status_history
  |
  |---- 1:N ---- campaign_ai_analyses
  |
  |---- 1:N ---- campaign_notes
  |
  |---- 1:N ---- campaign_similarities

scrape_runs ---- 1:N ---- scrape_run_sites ---- 1:N ---- raw_campaign_snapshots

weekly_reports ---- 1:N ---- weekly_report_items
```

## 3.5 `sites`

```sql
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  code varchar(64) not null unique,
  name varchar(255) not null,
  base_url text not null,
  campaigns_url text,
  adapter_key varchar(128) not null,
  is_active boolean not null default true,
  priority smallint not null default 100,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 3.6 `scrape_runs`

```sql
create table public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  run_type varchar(32) not null default 'scheduled',
  trigger_source varchar(32) not null default 'scheduler',
  status varchar(32) not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_sites integer not null default 0,
  completed_sites integer not null default 0,
  failed_sites integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);
```

## 3.7 `scrape_run_sites`

```sql
create table public.scrape_run_sites (
  id uuid primary key default gen_random_uuid(),
  scrape_run_id uuid not null references public.scrape_runs(id) on delete cascade,
  site_id uuid not null references public.sites(id),
  status varchar(32) not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  raw_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  retry_count integer not null default 0,
  error_code varchar(64),
  error_message text,
  metrics jsonb not null default '{}'::jsonb
);
```

## 3.8 `raw_campaign_snapshots`

Ham verinin debug ve izleme amaçlı saklandığı tablo.

```sql
create table public.raw_campaign_snapshots (
  id uuid primary key default gen_random_uuid(),
  scrape_run_id uuid references public.scrape_runs(id) on delete set null,
  scrape_run_site_id uuid references public.scrape_run_sites(id) on delete set null,
  site_id uuid not null references public.sites(id),
  source_url text,
  page_url text,
  external_id varchar(255),
  raw_title text,
  raw_body text,
  raw_image_urls jsonb not null default '[]'::jsonb,
  raw_date_text text,
  raw_html text,
  raw_payload jsonb not null default '{}'::jsonb,
  raw_hash char(64) not null,
  extracted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
```

## 3.9 `campaigns`

Bu tablonun önceki sürüme göre en kritik farkı tarih ve status alanlarının merkeze alınmasıdır.

```sql
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id),
  external_id varchar(255),
  source_url text not null,
  canonical_url text,
  title text not null,
  body text,
  normalized_text text not null,
  fingerprint char(64) not null,
  content_version integer not null default 1,
  primary_image_url text,
  valid_from timestamptz,
  valid_to timestamptz,
  valid_from_source varchar(32),
  valid_to_source varchar(32),
  valid_from_confidence numeric(5,4),
  valid_to_confidence numeric(5,4),
  raw_date_text text,
  status varchar(16) not null default 'passive',
  status_reason varchar(64),
  status_calculated_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_visible_at timestamptz,
  removed_from_source_at timestamptz,
  is_visible_on_last_scrape boolean not null default true,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(site_id, fingerprint)
);
```

### Alan Açıklamaları

- `primary_image_url`: detay ekranında gösterilecek ana görsel URL’si
- `valid_from_source`: `raw_parser`, `ai_inferred`, `manual`, `unknown`
- `valid_to_source`: `raw_parser`, `ai_inferred`, `manual`, `unknown`
- `status`: `active` veya `passive`
- `status_reason`: `date_in_range`, `expired`, `removed_from_source`, `manual_override` gibi nedenler
- `removed_from_source_at`: scraper artık kampanyayı göremediğinde işaretlenir

## 3.10 `campaign_images`

Detay ekranında birden fazla görsel göstermek zorunlu değildir. Ancak veri modelinde genişlemeye uygun şekilde ayrı tablo önerilir.

```sql
create table public.campaign_images (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  image_url text not null,
  image_type varchar(32) not null default 'primary',
  display_order integer not null default 0,
  source varchar(32) not null default 'scraper',
  created_at timestamptz not null default now()
);
```

İlk faz kullanıcı arayüzünde sadece `primary_image_url` gösterilir. Fakat veri modeli çoklu görsele açıktır.

## 3.11 `campaign_versions`

Kampanya içeriği, tarihleri, görseli veya status hesaplama girdileri değiştiğinde versiyon oluşur.

```sql
create table public.campaign_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version_no integer not null,
  title text not null,
  body text,
  normalized_text text not null,
  fingerprint char(64) not null,
  primary_image_url text,
  valid_from timestamptz,
  valid_to timestamptz,
  valid_from_source varchar(32),
  valid_to_source varchar(32),
  raw_date_text text,
  diff_summary jsonb not null default '{}'::jsonb,
  snapshot_id uuid references public.raw_campaign_snapshots(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(campaign_id, version_no)
);
```

Örnek `diff_summary`:

```json
{
  "changedFields": ["valid_to", "primary_image_url", "body"],
  "before": {
    "valid_to": "2026-03-25T23:59:59Z"
  },
  "after": {
    "valid_to": "2026-03-31T23:59:59Z"
  }
}
```

## 3.12 `campaign_status_history`

Status değişimlerinin izlenmesi raporlama için kritiktir.

```sql
create table public.campaign_status_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  previous_status varchar(16),
  new_status varchar(16) not null,
  reason varchar(64) not null,
  changed_at timestamptz not null default now(),
  context jsonb not null default '{}'::jsonb
);
```

Örnek nedenler:

- `date_in_range`
- `expired`
- `removed_from_source`
- `manual_override`
- `validity_updated`

## 3.13 `campaign_ai_analyses`

Bu tablo hem genel AI analizini hem de tarih çıkarımına ilişkin izleri tutabilir.

```sql
create table public.campaign_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  campaign_version_id uuid references public.campaign_versions(id) on delete set null,
  analysis_type varchar(32) not null default 'content_analysis',
  model_provider varchar(64) not null,
  model_name varchar(128) not null,
  prompt_version varchar(64) not null,
  status varchar(32) not null default 'completed',
  sentiment_label varchar(32),
  sentiment_score numeric(5,4),
  category_code varchar(64),
  category_confidence numeric(5,4),
  summary_text text,
  key_points jsonb not null default '[]'::jsonb,
  risk_flags jsonb not null default '[]'::jsonb,
  recommendation_text text,
  extracted_valid_from timestamptz,
  extracted_valid_to timestamptz,
  extracted_date_confidence numeric(5,4),
  tokens_input integer,
  tokens_output integer,
  duration_ms integer,
  raw_request jsonb,
  raw_response jsonb,
  created_at timestamptz not null default now()
);
```

## 3.14 `campaign_similarities`

```sql
create table public.campaign_similarities (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  similar_campaign_id uuid not null references public.campaigns(id) on delete cascade,
  similarity_score numeric(5,4) not null,
  similarity_reason text,
  method varchar(32) not null default 'ai+text',
  created_at timestamptz not null default now(),
  unique(campaign_id, similar_campaign_id)
);
```

## 3.15 `campaign_notes`

```sql
create table public.campaign_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  author_name varchar(255) not null,
  note_text text not null,
  note_type varchar(32) not null default 'general',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 3.16 `weekly_reports`

```sql
create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  report_week_start date not null,
  report_week_end date not null,
  title text not null,
  executive_summary text,
  status varchar(32) not null default 'completed',
  site_coverage_count integer not null default 0,
  campaign_count integer not null default 0,
  started_count integer not null default 0,
  ended_count integer not null default 0,
  active_overlap_count integer not null default 0,
  changed_count integer not null default 0,
  passive_count integer not null default 0,
  report_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(report_week_start, report_week_end)
);
```

## 3.17 `weekly_report_items`

```sql
create table public.weekly_report_items (
  id uuid primary key default gen_random_uuid(),
  weekly_report_id uuid not null references public.weekly_reports(id) on delete cascade,
  item_type varchar(64) not null,
  item_order integer not null default 0,
  title text,
  body text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

## 3.18 `job_queue`

```sql
create table public.job_queue (
  id uuid primary key default gen_random_uuid(),
  job_type varchar(64) not null,
  job_key varchar(255),
  payload jsonb not null default '{}'::jsonb,
  status varchar(32) not null default 'pending',
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by varchar(255),
  last_error_code varchar(64),
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Önerilen job türleri:

- `campaign_ai_analysis`
- `campaign_ai_date_extraction`
- `campaign_similarity_refresh`
- `weekly_report_generation`
- `status_recalculation`

## 3.19 `sse_events`

```sql
create table public.sse_events (
  id bigserial primary key,
  event_type varchar(64) not null,
  event_channel varchar(64) not null default 'global',
  payload jsonb not null,
  created_at timestamptz not null default now()
);
```

## 3.20 İndeksleme Stratejisi

```sql
create index idx_campaigns_site_status on public.campaigns(site_id, status);
create index idx_campaigns_valid_from on public.campaigns(valid_from);
create index idx_campaigns_valid_to on public.campaigns(valid_to);
create index idx_campaigns_first_seen on public.campaigns(first_seen_at desc);
create index idx_campaigns_last_seen on public.campaigns(last_seen_at desc);
create index idx_campaigns_removed_from_source on public.campaigns(removed_from_source_at);
create index idx_campaigns_visible_last_scrape on public.campaigns(is_visible_on_last_scrape);
create index idx_campaign_versions_campaign_created on public.campaign_versions(campaign_id, created_at desc);
create index idx_campaign_status_history_campaign_changed on public.campaign_status_history(campaign_id, changed_at desc);
create index idx_campaign_ai_analyses_campaign_created on public.campaign_ai_analyses(campaign_id, created_at desc);
create index idx_job_queue_pick on public.job_queue(status, available_at, priority);
create index idx_raw_campaign_snapshots_site_extracted on public.raw_campaign_snapshots(site_id, extracted_at desc);
```

## 3.21 Fingerprint Stratejisi

Fingerprint yalnızca scrape tarihine bağlı olmamalıdır. Kampanyayı temsil eden anlamlı içerik kullanılmalıdır.

Önerilen formül:

```text
sha256(site_code + title + body + valid_from + valid_to)
```

Notlar:

- Tarihler değişirse kampanya güncelleme senaryosu olabilir.
- Bu nedenle fingerprint tek başına karar verici olmamalıdır.
- Önce external_id ve canonical_url ile eşleşme kontrolü yapılmalıdır.

Önerilen eşleşme sırası:

1. external_id varsa önce ona bak
2. canonical_url varsa ona bak
3. yoksa fingerprint ile exact eşleşme ara
4. benzerlik ile near match opsiyonel değerlendir

## 3.22 Status Hesaplama Mantığı

```text
Eğer valid_from ve valid_to varsa ve bugün aralıktaysa status = active
Eğer valid_to geçmişte kaldıysa status = passive
Eğer removed_from_source_at doluysa status = passive
Aksi halde son geçerli duruma bakılır, başlangıçta güvenli varsayılan passive olabilir
```

## 3.23 Raporlama Query Mantıkları

### 3.23.1 Seçilen Aralıkta Başlayan Kampanyalar

```sql
select *
from public.campaigns
where valid_from::date between $1::date and $2::date;
```

### 3.23.2 Seçilen Aralıkta Biten Kampanyalar

```sql
select *
from public.campaigns
where valid_to::date between $1::date and $2::date;
```

### 3.23.3 Seçilen Aralıkta Aktif Olan Kampanyalar

```sql
select *
from public.campaigns
where valid_from is not null
  and valid_to is not null
  and tstzrange(valid_from, valid_to, '[]') && tstzrange($1::timestamptz, $2::timestamptz, '[]');
```

### 3.23.4 Seçilen Aralıkta Güncellenen Kampanyalar

```sql
select distinct c.*
from public.campaigns c
join public.campaign_versions v on v.campaign_id = c.id
where v.created_at between $1 and $2;
```

### 3.23.5 Seçilen Aralıkta Pasife Düşen Kampanyalar

```sql
select c.*, h.changed_at, h.reason
from public.campaigns c
join public.campaign_status_history h on h.campaign_id = c.id
where h.new_status = 'passive'
  and h.changed_at between $1 and $2;
```

---

# 4. Scraper Modülü

## 4.1 Genel Yaklaşım

Scraper mimarisi iki parçalıdır:

1. Ortak scraper çekirdeği
2. Siteye özel adaptörler

Bu tasarımın amacı:

- Ortak browser ve retry mantığını merkezileştirmek
- Selector değişikliklerini adapter seviyesinde izole etmek
- Yeni site eklemeyi kolaylaştırmak

## 4.2 Klasör Yapısı

```text
/apps
  /dashboard
    /app
    /components
    /lib
    /server
  /scraper
    /src
      /bootstrap
      /config
      /core
      /adapters
        /site01
        /site02
        /site03
        /site04
        /site05
        /site06
        /site07
        /site08
        /site09
        /site10
        /site11
        /site12
      /db
      /jobs
      /normalizers
      /date-extraction
      /fingerprint
      /status
      /publishers
      /types
      /utils
      /tests
/packages
  /shared
    /src
      /constants
      /dto
      /schemas
      /logger
      /errors
      /validation
```

## 4.3 Site Adapter Interface

```ts
export interface SiteAdapter {
  key: string;
  canHandle(siteCode: string): boolean;
  loadListing(page: Page, siteConfig: SiteConfig): Promise<void>;
  expandAll(page: Page, siteConfig: SiteConfig): Promise<void>;
  extractCards(page: Page, siteConfig: SiteConfig): Promise<RawCampaignCard[]>;
  enrichDetail(page: Page, card: RawCampaignCard, siteConfig: SiteConfig): Promise<RawCampaignCard>;
  normalize(card: RawCampaignCard, siteConfig: SiteConfig): Promise<NormalizedCampaignInput>;
}
```

## 4.4 Raw Campaign Model

```ts
export type RawCampaignCard = {
  externalId?: string | null;
  title?: string | null;
  body?: string | null;
  href?: string | null;
  imageUrls?: string[];
  rawDateText?: string | null;
  validFromText?: string | null;
  validToText?: string | null;
  html?: string | null;
  payload?: Record<string, unknown>;
};
```

## 4.5 Normalize Sonucu

```ts
export type NormalizedCampaignInput = {
  externalId?: string | null;
  sourceUrl: string;
  canonicalUrl?: string | null;
  title: string;
  body?: string | null;
  primaryImageUrl?: string | null;
  imageUrls?: string[];
  rawDateText?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  validFromSource?: 'raw_parser' | 'ai_inferred' | 'manual' | 'unknown';
  validToSource?: 'raw_parser' | 'ai_inferred' | 'manual' | 'unknown';
  validFromConfidence?: number | null;
  validToConfidence?: number | null;
  metadata?: Record<string, unknown>;
};
```

## 4.6 Base Adapter

```ts
export abstract class BaseAdapter implements SiteAdapter {
  abstract key: string;
  abstract canHandle(siteCode: string): boolean;
  abstract extractCards(page: Page, siteConfig: SiteConfig): Promise<RawCampaignCard[]>;
  abstract normalize(card: RawCampaignCard, siteConfig: SiteConfig): Promise<NormalizedCampaignInput>;

  async loadListing(page: Page, siteConfig: SiteConfig): Promise<void> {
    await page.goto(siteConfig.campaignsUrl, {
      waitUntil: 'domcontentloaded',
      timeout: siteConfig.pageTimeoutMs ?? 45000
    });
  }

  async expandAll(page: Page, siteConfig: SiteConfig): Promise<void> {
    if (!siteConfig.moreButtonSelector) return;

    for (let i = 0; i < (siteConfig.maxExpandClicks ?? 20); i++) {
      const button = page.locator(siteConfig.moreButtonSelector).first();
      const visible = await button.isVisible().catch(() => false);
      if (!visible) break;
      await button.click({ timeout: 3000 }).catch(() => null);
      await page.waitForTimeout(siteConfig.expandWaitMs ?? 1200);
    }
  }

  async enrichDetail(page: Page, card: RawCampaignCard): Promise<RawCampaignCard> {
    return card;
  }
}
```

## 4.7 Görsel URL Toplama

Bu projede görseller indirilmeyecek, yalnızca URL olarak alınacaktır.

Toplama kuralları:

- Kart seviyesinde kampanya görseli varsa al
- Detay sayfasında daha yüksek kaliteli görsel varsa onu önceliklendir
- Relative URL ise absolute URL’ye çevir
- İlk uygun görsel `primary_image_url` olur

Örnek yardımcı fonksiyon:

```ts
export function toAbsoluteUrl(baseUrl: string, value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}
```

## 4.8 Tarih Çıkarma Stratejisi

Tarih çıkarımı iki aşamalıdır.

### Aşama 1: Rule Based Parse

Önce scraper veya normalizer, açık tarih metinlerini parse etmeyi dener.

Örnek metinler:

- 20 Mart 2026 - 31 Mart 2026
- Kampanya 01.03.2026 tarihinde başlar, 31.03.2026 tarihinde biter
- Geçerlilik: 15.03.2026 - 22.03.2026

### Aşama 2: AI Date Extraction Fallback

Tarih açık parse edilemiyorsa DeepSeek’e verilir.

Örnek durumlar:

- Ay sonuna kadar geçerli
- Yeni üyelere özel, bayram sonuna kadar devam eder
- Bu hafta sonuna özel teklif

Bu durumda AI aşağıdaki formatta tarih çıkarımı döndürür:

```json
{
  "valid_from": "2026-03-20T00:00:00+03:00",
  "valid_to": "2026-03-31T23:59:59+03:00",
  "confidence": 0.74,
  "reasoning_short": "Metindeki ay sonuna kadar ifadesi referans tarihe göre ay sonu olarak yorumlandı."
}
```

## 4.9 Metin Normalizasyonu

```ts
export function normalizeCampaignText(input: { title?: string; body?: string; validFrom?: string | null; validTo?: string | null }) {
  const parts = [input.title ?? '', input.body ?? '', input.validFrom ?? '', input.validTo ?? ''];
  return parts.join(' ').toLowerCase().split(' ').filter(Boolean).join(' ');
}
```

## 4.10 Fingerprint Üretimi

```ts
import crypto from 'node:crypto';

export function buildFingerprint(parts: {
  siteCode: string;
  normalizedText: string;
  validFrom?: string | null;
  validTo?: string | null;
}) {
  return crypto.createHash('sha256')
    .update([
      parts.siteCode,
      parts.normalizedText,
      parts.validFrom ?? '',
      parts.validTo ?? ''
    ].join('|'))
    .digest('hex');
}
```

## 4.11 Dedup Karar Ağacı

```text
1. external_id eşleşiyor mu?
   evet -> aynı kampanya olabilir, değişiklik kontrolü yap
2. canonical_url eşleşiyor mu?
   evet -> aynı kampanya olabilir, değişiklik kontrolü yap
3. fingerprint eşleşiyor mu?
   evet -> aynı kampanya kabul et
4. hiçbiri eşleşmiyorsa yeni kampanya oluştur
```

## 4.12 Değişiklik Tespiti

Aşağıdaki alanlar değişiklik olarak izlenmelidir:

- title
- body
- primary_image_url
- valid_from
- valid_to
- raw_date_text
- is_visible_on_last_scrape

Değişim olduğunda:

- `campaign_versions` tablosuna yeni satır açılır
- `content_version` artırılır
- gerekiyorsa AI yeniden çalıştırılır
- status yeniden hesaplanır

## 4.13 Kampanya Kaybolduğunda Davranış

Kullanıcı kararı gereği kampanya siteden kaldırıldıysa `passive` olmalıdır.

Önerilen iş akışı:

- Her site run başında ilgili sitenin mevcut kampanyalarını `is_visible_on_last_scrape = false` olarak sıfırlama
- O run içinde görülen kampanyaları tekrar `true` yapma
- Run sonunda hala `false` kalanları `removed_from_source_at = now()` ve `status = passive` ile güncelleme

Örnek SQL:

```sql
update public.campaigns
set
  removed_from_source_at = now(),
  status = 'passive',
  status_reason = 'removed_from_source',
  status_calculated_at = now()
where site_id = $1
  and is_visible_on_last_scrape = false
  and removed_from_source_at is null;
```

## 4.14 Retry Politikası

- Navigation: 3 deneme
- Extraction: 2 deneme
- Detail enrich: 2 deneme
- AI date extraction: 3 deneme
- AI content analysis: 3 deneme

Backoff sırası:

- 2 saniye
- 5 saniye
- 15 saniye

## 4.15 Örnek Worker Akışı

```ts
export async function processNormalizedCampaign(site: SiteRecord, normalized: NormalizedCampaignInput, raw: RawCampaignCard) {
  const normalizedText = normalizeCampaignText({
    title: normalized.title,
    body: normalized.body,
    validFrom: normalized.validFrom,
    validTo: normalized.validTo
  });

  const fingerprint = buildFingerprint({
    siteCode: site.code,
    normalizedText,
    validFrom: normalized.validFrom,
    validTo: normalized.validTo
  });

  const existing = await db.findExistingCampaign({
    siteId: site.id,
    externalId: normalized.externalId,
    canonicalUrl: normalized.canonicalUrl,
    fingerprint
  });

  if (!existing) {
    const inserted = await db.insertCampaign({
      ...normalized,
      siteId: site.id,
      normalizedText,
      fingerprint,
      status: 'passive'
    });

    await enqueueAiJobsForCampaign(inserted.id, {
      needDateExtraction: !normalized.validFrom || !normalized.validTo,
      needContentAnalysis: true
    });

    return inserted;
  }

  const diff = buildCampaignDiff(existing, normalized);
  if (!diff.hasChanges) {
    await db.markCampaignSeen(existing.id);
    return existing;
  }

  const updated = await db.updateCampaignWithVersion(existing.id, normalized, diff);
  await enqueueAiJobsForCampaign(updated.id, {
    needDateExtraction: diff.changedFields.includes('valid_from') || diff.changedFields.includes('valid_to'),
    needContentAnalysis: true
  });

  return updated;
}
```

## 4.16 Test Stratejisi

Test katmanları:

- Unit: normalizer, fingerprint, diff, status engine
- Adapter: HTML fixture üzerinden parse
- Integration: Playwright ile local mock page
- DB: insert, update ve status transition testleri
- AI: schema validation ve fallback testleri

---

# 5. AI Entegrasyonu

## 5.1 AI Görevleri

Bu projede AI iki farklı amaçla kullanılır.

### 5.1.1 İçerik Analizi

- Duyarlılık analizi
- Kategorizasyon
- Özetleme
- Risk işaretleri
- Benzer kampanya önerisi
- Haftalık rapor

### 5.1.2 Tarih Çıkarımı

- Metinde açıkça parse edilemeyen başlangıç tarihini çıkarmak
- Metinde açıkça parse edilemeyen bitiş tarihini çıkarmak
- Güven skoru üretmek

## 5.2 AI Mimari Prensibi

Tarih çıkarımı ile içerik analizi ayrı işler olmalıdır.

Job tipleri:

- `campaign_ai_date_extraction`
- `campaign_ai_analysis`
- `weekly_report_generation`

## 5.3 Tarih Çıkarma Şeması

```json
{
  "valid_from": "2026-03-20T00:00:00+03:00",
  "valid_to": "2026-03-31T23:59:59+03:00",
  "confidence": 0.81,
  "reasoning_short": "Metindeki geçerlilik cümlesi doğrudan başlangıç ve bitiş tarihi içeriyor."
}
```

## 5.4 Tarih Çıkarma Promptu

```text
SYSTEM:
Sen Türkçe kampanya metinlerinden tarih aralığı çıkaran bir bilgi çıkarım motorusun.
Sadece geçerli JSON üret.
Yorum yazma. Markdown kullanma.
Belirsizsen confidence değerini düşür.
Uydurma tarih üretme.

USER:
Aşağıdaki kampanya metninden başlangıç ve bitiş tarihini çıkar.

Kurallar:
1. Çıktı yalnızca JSON olsun.
2. Şema tam olarak şu yapıda olsun:
{
  "valid_from": string or null,
  "valid_to": string or null,
  "confidence": number,
  "reasoning_short": string
}
3. Tarihler ISO-8601 formatında olsun.
4. Türkiye saat dilimi esas alınsın.
5. Tarih açık değilse null döndür.
6. Tahmin yapman gerekiyorsa confidence düşür.
7. Referans tarih: {{reference_date}}

Kampanya başlığı:
{{title}}

Kampanya metni:
{{body}}

Ham tarih metni:
{{raw_date_text}}
```

## 5.5 İçerik Analizi Şeması

```json
{
  "sentiment": {
    "label": "aggressive",
    "score": 0.83
  },
  "category": {
    "code": "welcome_bonus",
    "confidence": 0.91
  },
  "summary": "Yeni kullanıcılar için üst limitli hoş geldin bonusu sunuluyor.",
  "key_points": [
    "Yeni üyelik odaklı teklif",
    "Bonus limiti belirtilmiş",
    "Şartlar detay metninde saklı olabilir"
  ],
  "risk_flags": [
    "terms_required",
    "limited_time"
  ],
  "recommendation": "Giriş dönüşümünü hızlandırmayı hedefleyen agresif bir kullanıcı kazanım kampanyası."
}
```

## 5.6 İçerik Analizi Promptu

```text
SYSTEM:
Sen Türkçe kampanya içeriklerini sınıflandıran ve özetleyen bir analiz motorusun.
Sadece geçerli JSON üret.
Yorum yapma. Markdown kullanma.

USER:
Aşağıdaki kampanya kaydını analiz et.

Kurallar:
1. Çıktı yalnızca JSON olmalı.
2. Şema:
{
  "sentiment": {"label": string, "score": number},
  "category": {"code": string, "confidence": number},
  "summary": string,
  "key_points": string[],
  "risk_flags": string[],
  "recommendation": string
}
3. summary kısa olmalı.
4. category.code şu değerlerden biri olmalı:
welcome_bonus, freebet, cashback, deposit_bonus, casino_bonus, slot_bonus, sport_bonus, reload_bonus, vip_offer, refer_friend, tournament, risk_free_bet, odds_boost, combo_bonus, loyalty_reward, other
5. sentiment.label şu değerlerden biri olmalı:
positive, neutral, mixed, aggressive, cautious

Kampanya başlığı:
{{title}}

Kampanya metni:
{{body}}

Başlangıç tarihi:
{{valid_from}}

Bitiş tarihi:
{{valid_to}}

Site:
{{site_name}}
```

## 5.7 Haftalık Rapor Promptu

Bu prompt zaman bazlı veri mantığına göre güncellenmiştir.

```text
SYSTEM:
Sen haftalık kampanya değişimini analiz eden bir yönetim raporu motorusun.
Sadece verilen veriye dayan ve sadece geçerli JSON döndür.

USER:
Aşağıdaki haftalık veri setine göre rapor oluştur.

Kurallar:
1. Çıktı sadece JSON olsun.
2. Uydurma bilgi üretme.
3. Aşağıdaki bölümleri oluştur:
- executive_summary
- started_campaigns_summary
- ended_campaigns_summary
- active_during_range_summary
- changed_campaigns_summary
- passive_transitions_summary
- top_categories
- top_sites
- risks
- recommendations

JSON şeması:
{
  "title": string,
  "executive_summary": string,
  "started_campaigns_summary": string,
  "ended_campaigns_summary": string,
  "active_during_range_summary": string,
  "changed_campaigns_summary": string,
  "passive_transitions_summary": string,
  "top_categories": [{"code": string, "count": number}],
  "top_sites": [{"site": string, "count": number}],
  "risks": string[],
  "recommendations": string[]
}

Haftalık veri seti:
{{weekly_dataset_json}}
```

## 5.8 DeepSeek İstemcisi

```ts
export async function callDeepSeek(messages: Array<{ role: 'system' | 'user'; content: string }>) {
  const response = await fetch(process.env.DEEPSEEK_API_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek request failed with status ${response.status}`);
  }

  return response.json();
}
```

## 5.9 AI Date Extraction Worker

```ts
export async function processDateExtractionJob(job: JobRecord) {
  const campaign = await db.getCampaignById(job.payload.campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const prompt = buildDateExtractionPrompt(campaign);
  const startedAt = Date.now();

  const response = await callDeepSeek(prompt.messages);
  const content = response.choices?.[0]?.message?.content;
  const parsed = safeJsonParse(content);
  validateDateExtractionSchema(parsed);

  await db.applyAiExtractedDates(campaign.id, {
    validFrom: parsed.valid_from,
    validTo: parsed.valid_to,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning_short,
    durationMs: Date.now() - startedAt,
    rawResponse: response
  });

  await db.recalculateCampaignStatus(campaign.id);
  await publishSseEvent('campaign.date.extracted', { campaignId: campaign.id });
}
```

## 5.10 AI Content Analysis Worker

```ts
export async function processCampaignAnalysisJob(job: JobRecord) {
  const campaign = await db.getCampaignById(job.payload.campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const prompt = buildCampaignAnalysisPrompt(campaign);
  const response = await callDeepSeek(prompt.messages);
  const content = response.choices?.[0]?.message?.content;
  const parsed = safeJsonParse(content);
  validateCampaignAnalysisSchema(parsed);

  await db.insertCampaignAnalysis({
    campaignId: campaign.id,
    analysisType: 'content_analysis',
    modelProvider: 'deepseek',
    modelName: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    promptVersion: 'campaign-analysis-v2',
    sentimentLabel: parsed.sentiment.label,
    sentimentScore: parsed.sentiment.score,
    categoryCode: parsed.category.code,
    categoryConfidence: parsed.category.confidence,
    summaryText: parsed.summary,
    keyPoints: parsed.key_points,
    riskFlags: parsed.risk_flags,
    recommendationText: parsed.recommendation,
    rawResponse: response
  });

  await publishSseEvent('campaign.ai.completed', { campaignId: campaign.id });
}
```

## 5.11 Benzer Kampanya Önerisi

Benzerlik üretimi hibrit çalışır:

1. Aynı kategori adaylarını al
2. Zaman aralığı yakın olanları önceliklendir
3. Text similarity uygula
4. AI ile son açıklamayı üret

Örnek ön eleme query’si:

```sql
select
  c.id,
  c.title,
  similarity(c.normalized_text, $1) as score
from public.campaigns c
where c.id <> $2
  and c.valid_to > now() - interval '120 days'
order by score desc
limit 20;
```

## 5.12 Haftalık Dataset Yapısı

```json
{
  "range": {
    "start": "2026-03-16",
    "end": "2026-03-22"
  },
  "counts": {
    "started": 18,
    "ended": 11,
    "active_overlap": 46,
    "changed": 9,
    "passive_transitions": 13
  },
  "top_categories": [
    { "code": "welcome_bonus", "count": 14 },
    { "code": "freebet", "count": 9 }
  ],
  "top_sites": [
    { "site": "Site A", "count": 8 },
    { "site": "Site B", "count": 6 }
  ],
  "samples": {
    "started": [],
    "ended": [],
    "changed": []
  }
}
```

## 5.13 AI Hata Politikası

- JSON geçersizse retry
- Tarih çıkarımı null ise ve confidence düşükse veri boş bırakılır, uydurma tarih yazılmaz
- Şema dışı sonuç `failed` olur
- Tüm AI sonuçları raw response ile saklanır

---

# 6. Backend API

## 6.1 Genel Yaklaşım

API, dashboard için BFF gibi çalışır. Next.js route handlers ile uygulanabilir veya ayrı Node servis olarak ayrılabilir. Bu dokümanda Next.js temelli yapı esas alınmıştır.

## 6.2 Endpoint Grupları

- Health
- Campaigns
- Notes
- Reports
- Runs
- Events ve SSE
- Admin

## 6.3 Yol Yapısı

```text
/api/health
/api/campaigns
/api/campaigns/:id
/api/campaigns/:id/notes
/api/campaigns/:id/similar
/api/reports/weekly
/api/reports/weekly/:id
/api/reports/summary
/api/runs
/api/runs/:id
/api/events/stream
/api/admin/scrape/trigger
/api/admin/reindex-ai
/api/admin/recalculate-status
```

## 6.4 Response Standardı

Başarılı response:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Hata response:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date range"
  }
}
```

## 6.5 `GET /api/campaigns`

### Amaç

Liste ekranı için kampanya verisini döndürmek.

### Query Parametreleri

- `page`
- `pageSize`
- `siteId`
- `status`
- `category`
- `sentiment`
- `dateMode`
- `from`
- `to`
- `search`
- `sort`

### `dateMode` Değerleri

- `started_in_range`
- `ended_in_range`
- `active_during_range`
- `changed_in_range`
- `passive_in_range`
- `seen_in_range`

Bu alan çok önemlidir. Çünkü aynı tarih filtresi farklı iş sorularını cevaplamak için farklı mantıkla uygulanmalıdır.

### Örnek istek

```http
GET /api/campaigns?page=1&pageSize=20&dateMode=active_during_range&from=2026-03-16&to=2026-03-22&status=active
```

### Örnek response

```json
{
  "success": true,
  "data": [
    {
      "id": "b8d3d9ab-4a25-40a6-8ca1-7b8646b8b5f1",
      "site": {
        "id": "3b9df8b3-ec68-43c4-8c99-2851147d2d06",
        "name": "Site A"
      },
      "title": "%100 Hoş Geldin Bonusu",
      "summary": "Yeni kullanıcılar için üst limitli hoş geldin bonusu sunuluyor.",
      "category": "welcome_bonus",
      "sentiment": "aggressive",
      "status": "active",
      "validFrom": "2026-03-20T00:00:00+03:00",
      "validTo": "2026-03-31T23:59:59+03:00",
      "lastSeenAt": "2026-03-26T12:00:00Z",
      "sourceUrl": "https://example.com/promo/1"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 142,
    "dateMode": "active_during_range"
  }
}
```

## 6.6 `GET /api/campaigns/:id`

Detay endpoint’i aşağıdaki alanları döndürmelidir:

- title
- body
- source_url
- primary_image_url
- valid_from
- valid_to
- status
- status_reason
- latest ai analysis
- similar campaigns
- notes
- version history
- status history

### Örnek response

```json
{
  "success": true,
  "data": {
    "id": "b8d3d9ab-4a25-40a6-8ca1-7b8646b8b5f1",
    "title": "%100 Hoş Geldin Bonusu",
    "body": "Yeni üyelere 500 TL'ye kadar bonus fırsatı. Çevrim şartları geçerlidir.",
    "sourceUrl": "https://example.com/promo/1",
    "primaryImageUrl": "https://example.com/images/promo.jpg",
    "site": {
      "id": "3b9df8b3-ec68-43c4-8c99-2851147d2d06",
      "name": "Site A"
    },
    "validFrom": "2026-03-20T00:00:00+03:00",
    "validTo": "2026-03-31T23:59:59+03:00",
    "validFromSource": "ai_inferred",
    "validToSource": "ai_inferred",
    "status": "active",
    "statusReason": "date_in_range",
    "latestAnalysis": {
      "sentiment": { "label": "aggressive", "score": 0.81 },
      "category": { "code": "welcome_bonus", "confidence": 0.93 },
      "summary": "Yeni kullanıcıları hızlıca çekmeye çalışan limitli süreli bir giriş kampanyası.",
      "keyPoints": ["Yeni üyelik odaklı", "Süre baskısı var"],
      "riskFlags": ["terms_required", "limited_time"],
      "recommendation": "Bu kampanya, kullanıcı kazanımı hedefli agresif başlangıç stratejisi olarak izlenmeli."
    },
    "statusHistory": [],
    "versionHistory": [],
    "notes": [],
    "similarCampaigns": []
  }
}
```

## 6.7 `POST /api/campaigns/:id/notes`

```json
{
  "authorName": "Oğuz",
  "noteText": "Bu kampanyanın süresi uzatılmış görünüyor.",
  "noteType": "analysis"
}
```

## 6.8 `GET /api/reports/weekly`

Liste endpoint’i.

## 6.9 `GET /api/reports/weekly/:id`

Detay endpoint’i.

## 6.10 `GET /api/reports/summary`

Tarih aralığına göre toplu özet döndürür.

### Query Parametreleri

- `from`
- `to`

### Response

```json
{
  "success": true,
  "data": {
    "range": {
      "from": "2026-03-16",
      "to": "2026-03-22"
    },
    "counts": {
      "started": 18,
      "ended": 11,
      "activeDuringRange": 46,
      "changed": 9,
      "passiveTransitions": 13
    },
    "topCategories": [
      { "code": "welcome_bonus", "count": 14 },
      { "code": "freebet", "count": 9 }
    ],
    "topSites": [
      { "site": "Site A", "count": 8 }
    ]
  }
}
```

## 6.11 `GET /api/runs`

Son scraping run’larını getirir.

## 6.12 `GET /api/events/stream`

Event tipleri:

- `campaign.created`
- `campaign.updated`
- `campaign.date.extracted`
- `campaign.ai.completed`
- `campaign.status.changed`
- `weekly.report.created`
- `scrape.run.completed`
- `heartbeat`

## 6.13 SSE Örnek Akışı

```text
event: campaign.status.changed
id: 110
retry: 5000
data: {"campaignId":"abc","status":"passive","reason":"removed_from_source"}

event: campaign.ai.completed
id: 111
retry: 5000
data: {"campaignId":"abc"}
```

## 6.14 SSE Implementasyonu

```ts
import { NextRequest } from 'next/server';
import { subscribeToSseChannel } from '@/server/sse';

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: { id: number; type: string; payload: unknown }) => {
        controller.enqueue(encoder.encode(`id: ${event.id}` + String.fromCharCode(10)));
        controller.enqueue(encoder.encode(`event: ${event.type}` + String.fromCharCode(10)));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event.payload)}` + String.fromCharCode(10) + String.fromCharCode(10)));
      };

      const unsubscribe = subscribeToSseChannel('global', send);

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`event: heartbeat` + String.fromCharCode(10)));
        controller.enqueue(encoder.encode(`data: {"ok":true}` + String.fromCharCode(10) + String.fromCharCode(10)));
      }, 15000);

      controller.enqueue(encoder.encode(`retry: 5000` + String.fromCharCode(10) + String.fromCharCode(10)));

      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
```

## 6.15 Admin Endpointler

### `POST /api/admin/scrape/trigger`

```json
{
  "siteCodes": ["site_01", "site_02"],
  "runType": "manual"
}
```

### `POST /api/admin/reindex-ai`

```json
{
  "campaignIds": ["b8d3d9ab-4a25-40a6-8ca1-7b8646b8b5f1"]
}
```

### `POST /api/admin/recalculate-status`

Belirli kampanyaların status’unu tekrar hesaplar.

```json
{
  "campaignIds": ["b8d3d9ab-4a25-40a6-8ca1-7b8646b8b5f1"]
}
```

---

# 7. Frontend Dashboard

## 7.1 Teknoloji

- Next.js App Router
- TypeScript
- Tailwind CSS
- TanStack Query veya SWR
- Native EventSource

## 7.2 Sayfa Haritası

```text
/
  -> dashboard home
/campaigns
  -> kampanya listesi
/campaigns/[id]
  -> kampanya detayı
/reports/weekly
  -> haftalık rapor listesi
/reports/weekly/[id]
  -> haftalık rapor detayı
/runs
  -> scrape run listesi
```

## 7.3 Ana Ekranlar

### 7.3.1 Dashboard Home

Özet kartları:

- Bu hafta başlayan kampanyalar
- Bu hafta biten kampanyalar
- Bu hafta aktif olan kampanyalar
- Bu hafta pasife düşen kampanyalar
- Bu hafta güncellenen kampanyalar

### 7.3.2 Kampanya Liste Ekranı

Kolonlar:

- Site
- Başlık
- Kategori
- Duyarlılık
- Status
- Başlangıç tarihi
- Bitiş tarihi
- İlk görülme
- Son görülme
- Detay

### 7.3.3 Kampanya Detay Ekranı

Detay ekranında mutlaka gösterilecek alanlar:

- Başlık
- Kaynak site
- Kaynak link
- Kampanya görseli
- Başlangıç tarihi
- Bitiş tarihi
- Tarih kaynağı
- Aktif ve pasif etiketi
- AI analizi
- Notlar
- Benzer kampanyalar
- Durum geçmişi
- Versiyon geçmişi

## 7.4 Detay Sayfası Wireframe

```text
+-------------------------------------------------------------------+
| Kampanya Başlığı                                                   |
| Site | Status | valid_from | valid_to | status_reason             |
+-------------------------------+-----------------------------------+
| Kampanya Görseli              | AI Analizi                        |
|                               | summary                           |
|                               | category                          |
|                               | sentiment                         |
|                               | key points                        |
|                               | risk flags                        |
+-------------------------------+-----------------------------------+
| Kaynak Link / Tarih Kaynağı / Görülme Bilgileri                   |
+-------------------------------------------------------------------+
| Benzer Kampanyalar                                                 |
+-------------------------------------------------------------------+
| Notlar                                                             |
+-------------------------------------------------------------------+
| Status History                                                     |
+-------------------------------------------------------------------+
| Version History                                                    |
+-------------------------------------------------------------------+
```

## 7.5 Filtre Yapısı

Filtreler:

- Site
- Status
- Kategori
- Duyarlılık
- Tarih aralığı
- Tarih modu
- Arama

Tarih modu seçenekleri:

- Started in range
- Ended in range
- Active during range
- Changed in range
- Passive in range

Bu tasarım kullanıcıya şunu sağlar:

Aynı tarih aralığı için farklı soruları yanıtlayabilir.

Örnek:

- 20 ile 31 Mart arasında başlayan kampanyalar
- 20 ile 31 Mart arasında aktif olan kampanyalar
- 20 ile 31 Mart arasında pasife düşen kampanyalar

## 7.6 Status Badge Tasarımı

Örnek veri modeli:

```ts
export type CampaignStatus = 'active' | 'passive';
```

UI etiketi:

- `active` -> Aktif
- `passive` -> Pasif

## 7.7 Detail Data Model

```ts
export type CampaignDetail = {
  id: string;
  title: string;
  body: string | null;
  sourceUrl: string;
  primaryImageUrl: string | null;
  validFrom: string | null;
  validTo: string | null;
  validFromSource: string | null;
  validToSource: string | null;
  status: 'active' | 'passive';
  statusReason: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  removedFromSourceAt: string | null;
  latestAnalysis: {
    sentiment: { label: string; score: number } | null;
    category: { code: string; confidence: number } | null;
    summary: string | null;
    keyPoints: string[];
    riskFlags: string[];
    recommendation: string | null;
  } | null;
  notes: Array<{
    id: string;
    authorName: string;
    noteText: string;
    createdAt: string;
  }>;
};
```

## 7.8 SSE Client

```ts
'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function LiveEventsBridge() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource('/api/events/stream');

    source.addEventListener('campaign.created', () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['reports-summary'] });
    });

    source.addEventListener('campaign.updated', () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    });

    source.addEventListener('campaign.status.changed', (event) => {
      const data = JSON.parse((event as MessageEvent).data);
      queryClient.invalidateQueries({ queryKey: ['campaign', data.campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['reports-summary'] });
    });

    source.addEventListener('campaign.ai.completed', (event) => {
      const data = JSON.parse((event as MessageEvent).data);
      queryClient.invalidateQueries({ queryKey: ['campaign', data.campaignId] });
    });

    source.addEventListener('weekly.report.created', () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-reports'] });
      queryClient.invalidateQueries({ queryKey: ['reports-summary'] });
    });

    return () => source.close();
  }, [queryClient]);

  return null;
}
```

## 7.9 UX Prensipleri

- Zaman bazlı filtre açık ve anlaşılır olmalı
- Status etiketi her listede görünmeli
- Görsel sadece detay ekranında gösterilmeli
- Tarih kaynağı kullanıcıya görünmeli
- AI ile çıkarıldı gibi etiket desteklenmeli

## 7.10 Boş Durumlar

- Seçilen zaman aralığında başlayan kampanya bulunamadı
- Bu kampanya için görsel bulunamadı
- Bu kampanya için AI tarih çıkarımı yapılamadı

---

# 8. İş Akışları

## 8.1 Scraper İş Akışı

```text
Scheduler
  -> Create scrape_run
  -> Load active sites
  -> For each site
      -> Open page
      -> Expand more
      -> Extract raw cards
      -> Visit detail if needed
      -> Extract title, body, image, date, url
      -> Write raw snapshot
      -> Normalize
      -> Rule based date parse
      -> If needed enqueue AI date extraction
      -> Dedup check
          -> Insert new
          -> Update existing
          -> Skip
      -> Set visibility seen
      -> Recalculate status
      -> Enqueue AI content analysis
  -> Mark unseen as removed_from_source
  -> Publish scrape.run.completed
```

## 8.2 Status Güncelleme İş Akışı

```text
Campaign saved or updated
  -> Has valid_from and valid_to?
      -> yes
         -> today in range?
            -> yes => active
            -> no  => passive if expired
      -> no
         -> removed_from_source?
            -> yes => passive
            -> no  => keep last state or passive default
  -> If changed insert status_history
  -> Publish campaign.status.changed
```

## 8.3 AI Tarih Çıkarım İş Akışı

```text
Campaign missing dates
  -> Create campaign_ai_date_extraction job
  -> AI worker picks job
  -> Prompt build
  -> DeepSeek call
  -> Validate JSON
  -> Apply valid_from, valid_to, confidence
  -> Recalculate status
  -> Publish campaign.date.extracted
```

## 8.4 AI İçerik Analizi İş Akışı

```text
Campaign inserted or updated
  -> Create campaign_ai_analysis job
  -> AI worker picks job
  -> Analyze sentiment, category, summary
  -> Store analysis
  -> Refresh similarity
  -> Publish campaign.ai.completed
```

## 8.5 Haftalık Rapor İş Akışı

```text
Weekly scheduler
  -> Select time range
  -> Count started in range
  -> Count ended in range
  -> Count active during range
  -> Count changed in range
  -> Count passive transitions in range
  -> Aggregate categories and sites
  -> Build report prompt
  -> DeepSeek summary
  -> Insert report
  -> Publish weekly.report.created
```

## 8.6 Dashboard Akışı

```text
User opens campaigns page
  -> SSR fetch
  -> Client hydrate
  -> EventSource connect
  -> User changes date mode
  -> Filtered fetch
  -> SSE update arrives
  -> Invalidate relevant queries
  -> UI refresh
```

---

# 9. Kurulum ve Deployment

## 9.1 Gereksinimler

- Node.js 20+
- PostgreSQL 15+
- Docker ve Docker Compose
- Playwright browser binaries

## 9.2 Ortam Değişkenleri

```env
NODE_ENV=production
PORT=3000
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@db:5432/campaigns
DEEPSEEK_API_URL=https://api.deepseek.com/chat/completions
DEEPSEEK_API_KEY=your_key_here
DEEPSEEK_MODEL=deepseek-chat
SSE_HEARTBEAT_MS=15000
AI_JOB_POLL_MS=5000
LOG_LEVEL=info
SCRAPER_CONCURRENCY=2
SCRAPER_HEADLESS=true
SCRAPER_TIMEOUT_MS=45000
SCRAPER_EXPAND_MAX_CLICKS=20
SCRAPER_EXPAND_WAIT_MS=1200
```

## 9.3 Docker Compose

```yaml
version: '3.9'
services:
  db:
    image: postgres:15
    container_name: campaign-db
    environment:
      POSTGRES_DB: campaigns
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

  dashboard:
    build:
      context: .
      dockerfile: apps/dashboard/Dockerfile
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://postgres:postgres@db:5432/campaigns
      DEEPSEEK_API_URL: https://api.deepseek.com/chat/completions
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      DEEPSEEK_MODEL: deepseek-chat
    depends_on:
      - db
    ports:
      - '3000:3000'

  scraper:
    build:
      context: .
      dockerfile: apps/scraper/Dockerfile
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/campaigns
      DEEPSEEK_API_URL: https://api.deepseek.com/chat/completions
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      DEEPSEEK_MODEL: deepseek-chat
      SCRAPER_HEADLESS: 'true'
    depends_on:
      - db

volumes:
  postgres_data:
```

## 9.4 Lokal Kurulum Adımları

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev:dashboard
pnpm dev:scraper
```

## 9.5 Scheduler Frekansları

| Görev | Sıklık | Açıklama |
|---|---|---|
| Active site scrape | 15 dk | Aktif siteleri tarar |
| AI job poll | 5 sn | Bekleyen AI işlerini alır |
| Status recalc | Saatlik | Tarihe göre status yeniden hesaplar |
| Weekly report | Haftalık | Haftalık rapor üretir |
| Cleanup | Günlük | Retention temizliği |

## 9.6 Sunucu Gereksinimi

İlk faz önerisi:

- 4 vCPU
- 8 ile 16 GB RAM
- 100 GB SSD
- Tek PostgreSQL instance
- Tek dashboard container
- Tek scraper worker container

---

# 10. API Referansı

## 10.1 `GET /api/health`

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "ok",
    "timestamp": "2026-03-26T13:00:00Z"
  }
}
```

## 10.2 `GET /api/campaigns`

### Parametreler

| Parametre | Tip | Açıklama |
|---|---|---|
| page | number | Sayfa numarası |
| pageSize | number | Sayfa boyutu |
| siteId | string | Site filtresi |
| status | string | active veya passive |
| category | string | AI kategori filtresi |
| sentiment | string | AI duyarlılık filtresi |
| dateMode | string | started, ended, active, changed, passive veya seen |
| from | date | Başlangıç |
| to | date | Bitiş |
| search | string | Arama |
| sort | string | Sıralama |

## 10.3 `GET /api/campaigns/:id`

Detay response alanları:

- title
- body
- primaryImageUrl
- validFrom
- validTo
- validFromSource
- validToSource
- status
- statusReason
- firstSeenAt
- lastSeenAt
- removedFromSourceAt
- latestAnalysis
- notes
- statusHistory
- versionHistory
- similarCampaigns

## 10.4 `POST /api/campaigns/:id/notes`

```json
{
  "authorName": "Oğuz",
  "noteText": "Kampanya bu hafta sonu uzatılmış olabilir.",
  "noteType": "analysis"
}
```

## 10.5 `GET /api/campaigns/:id/similar`

```json
{
  "success": true,
  "data": [
    {
      "campaignId": "...",
      "title": "Benzer kampanya",
      "siteName": "Site B",
      "similarityScore": 0.86,
      "reason": "Benzer bonus yapısı ve hedef kitle"
    }
  ]
}
```

## 10.6 `GET /api/reports/weekly`

Haftalık rapor listesini döndürür.

## 10.7 `GET /api/reports/weekly/:id`

Haftalık rapor detayını döndürür.

## 10.8 `GET /api/reports/summary`

Belirli aralık için toplu sayımları döndürür.

## 10.9 `GET /api/runs`

Scrape run listesi.

## 10.10 `GET /api/runs/:id`

Run detay görünümü.

## 10.11 `GET /api/events/stream`

SSE akışı.

## 10.12 `POST /api/admin/scrape/trigger`

Manuel scrape başlatır.

## 10.13 `POST /api/admin/reindex-ai`

AI işlerini yeniden kuyruğa alır.

## 10.14 `POST /api/admin/recalculate-status`

Status hesaplamasını yeniden çalıştırır.

---

# 11. Ekler

## 11.1 Hata Kodları

| Kod | Açıklama |
|---|---|
| VALIDATION_ERROR | İstek doğrulama hatası |
| NOT_FOUND | Kayıt bulunamadı |
| INTERNAL_ERROR | Beklenmeyen hata |
| SCRAPER_TIMEOUT | Scraper zaman aşımı |
| SCRAPER_NAVIGATION_FAILED | Sayfa açılamadı |
| SCRAPER_SELECTOR_NOT_FOUND | Selector bulunamadı |
| SCRAPER_PARSING_FAILED | Veri parse edilemedi |
| AI_REQUEST_FAILED | DeepSeek çağrısı başarısız |
| AI_INVALID_JSON | AI geçersiz JSON döndürdü |
| AI_SCHEMA_VALIDATION_FAILED | AI JSON şemaya uymadı |
| AI_DATE_EXTRACTION_FAILED | Tarih çıkarımı başarısız |
| DB_WRITE_FAILED | Veritabanı yazma hatası |
| SSE_STREAM_FAILED | SSE akış hatası |

## 11.2 Loglama

Örnek scraper log’u:

```json
{
  "level": "info",
  "module": "scraper",
  "message": "campaign processed",
  "siteCode": "site_01",
  "campaignTitle": "%100 Hoş Geldin Bonusu",
  "status": "inserted",
  "validFrom": "2026-03-20T00:00:00+03:00",
  "validTo": "2026-03-31T23:59:59+03:00",
  "timestamp": "2026-03-26T12:04:11.000Z"
}
```

Örnek AI date extraction log’u:

```json
{
  "level": "info",
  "module": "ai-date-extraction",
  "message": "date extraction completed",
  "campaignId": "abc",
  "confidence": 0.78,
  "validFrom": "2026-03-20T00:00:00+03:00",
  "validTo": "2026-03-31T23:59:59+03:00",
  "timestamp": "2026-03-26T12:06:00.000Z"
}
```

## 11.3 Güvenlik

- Scraper sadece whitelist’li 12 siteye gider
- Dinamik user URL kabul edilmez
- Secret’lar environment variable ile yönetilir
- Not alanları sanitize edilir
- Dashboard render katmanı XSS korumalı olmalıdır
- Admin endpointleri auth korumalı olmalıdır

## 11.4 Veri Saklama Politikası

- raw_campaign_snapshots: 180 gün
- scrape_runs: 180 gün
- sse_events: 14 gün
- error_logs: 90 gün
- campaigns, versions, analyses ve reports: uzun süreli saklama

## 11.5 Temizlik İşleri

```sql
delete from public.sse_events where created_at < now() - interval '14 days';
delete from public.error_logs where created_at < now() - interval '90 days';
delete from public.raw_campaign_snapshots where created_at < now() - interval '180 days';
```

## 11.6 İzlenmesi Gereken Metrikler

- site bazlı scrape başarı oranı
- kampanya insert, update ve skip sayıları
- AI date extraction başarı oranı
- AI content analysis başarı oranı
- status transition sayıları
- started, ended, active ve passive rapor sayıları
- API latency
- SSE açık bağlantı sayısı

## 11.7 Riskler

- Tarih metinleri belirsiz olabilir
- Görsel URL’leri geçici olabilir
- Site HTML yapıları değişebilir
- Kampanya siteden geçici kaybolabilir
- AI bazen düşük güvenle tarih çıkarabilir

## 11.8 Risk Azaltma Stratejileri

- Rule based parser ve AI fallback hibriti
- Confidence alanı saklama
- Date source alanı saklama
- Status history saklama
- Adapter snapshot testleri
- Site config externalization

---

# 12. Tasarım Kararları ve Varsayımlar

## 12.1 Görseller Neden URL Olarak Saklanıyor?

Kullanıcı tercihi gereği sistem yalnızca kampanya görsel URL’sini alır ve gösterir. Bu, storage maliyetini düşürür ve ilk fazı hızlandırır.

## 12.2 Tarihler Neden AI ile de Çıkarılıyor?

Bazı kampanya sayfalarında tarih açık ve standart formatta olmayabilir. Bu yüzden önce parser, sonra AI fallback yaklaşımı tercih edilmiştir.

## 12.3 Neden Sadece Active ve Passive?

İş gereksinimine göre status modeli sade tutulmuştur:

- active
- passive

Ancak `status_reason` alanı ile daha detaylı açıklama korunur.

## 12.4 Neden Raporlama Kampanya Tarihine Göre Çalışıyor?

Çünkü scrape tarihi operasyon tarihidir, kampanya tarihi ise iş anlamıdır. Yönetim raporlarında esas alınması gereken kampanyanın gerçek geçerlilik aralığıdır.

## 12.5 Neden Status History Gerekli?

Pasife düşme, süresi uzama, tarih değişimi ve görünürlük kaybı gibi olayların dönemsel raporlanabilmesi için status history şarttır.

---

# 13. Fazlama ve Yol Haritası

## 13.1 Faz 1

- 12 site scraper
- Görsel URL toplama
- Tarih parse ve AI fallback
- Active ve passive status
- Kampanya versiyonlama
- AI içerik analizi
- Zaman bazlı filtreleme
- Haftalık rapor
- Dashboard detay ekranı

## 13.2 Faz 2

- Daha gelişmiş similarity engine
- Redis queue
- Redis pub sub ile çok instance SSE
- Manuel tarih düzeltme ekranı
- Site health monitoring

## 13.3 Faz 3

- Çok kiracılı yapı
- Alarm sistemi
- Slack ve e-posta entegrasyonu
- Gelişmiş trend raporları

---

# Örnek Kodlar ve Yardımcı Bölümler

## A. Status Engine

```ts
export function computeStatus(
  validFrom?: string | null,
  validTo?: string | null,
  removedFromSourceAt?: string | null,
  now = new Date()
): { status: 'active' | 'passive'; reason: string } {
  if (removedFromSourceAt) {
    return { status: 'passive', reason: 'removed_from_source' };
  }

  const start = validFrom ? new Date(validFrom) : null;
  const end = validTo ? new Date(validTo) : null;

  if (start && end && now >= start && now <= end) {
    return { status: 'active', reason: 'date_in_range' };
  }

  if (end && now > end) {
    return { status: 'passive', reason: 'expired' };
  }

  return { status: 'passive', reason: 'insufficient_validity' };
}
```

## B. Date Mode Query Builder

```ts
export function buildDateModeClause(dateMode: string) {
  switch (dateMode) {
    case 'started_in_range':
      return 'valid_from between from and to';
    case 'ended_in_range':
      return 'valid_to between from and to';
    case 'active_during_range':
      return 'range overlap valid_from and valid_to';
    case 'changed_in_range':
      return 'exists version inside range';
    case 'passive_in_range':
      return 'exists passive status transition inside range';
    case 'seen_in_range':
    default:
      return 'first_seen_at between from and to';
  }
}
```

## C. Weekly Report Aggregation Örneği

```ts
export async function buildWeeklyDataset(from: string, to: string) {
  const [started, ended, activeOverlap, changed, passiveTransitions] = await Promise.all([
    db.countStartedInRange(from, to),
    db.countEndedInRange(from, to),
    db.countActiveOverlap(from, to),
    db.countChangedInRange(from, to),
    db.countPassiveTransitions(from, to)
  ]);

  return {
    range: { start: from, end: to },
    counts: { started, ended, activeOverlap, changed, passiveTransitions },
    topCategories: await db.getTopCategoriesForRange(from, to),
    topSites: await db.getTopSitesForRange(from, to)
  };
}
```

## D. Önerilen Geliştirme Sırası

1. Veritabanı şema revizyonu
2. Status engine
3. Date parse ve AI fallback
4. Site adaptörlerinde görsel URL desteği
5. Campaign detail API
6. Dashboard detail sayfasında görsel, tarih ve status
7. Zaman bazlı report summary endpoint
8. Haftalık rapor AI üretimi
9. SSE ile status ve analysis event’leri

## E. Minimum Kabul Kriterleri

- 12 site sistemde tanımlı olmalı
- Kampanya görsel URL’si çekilebilmeli
- Tarihler scraper veya AI ile çıkarılabilmeli
- Kampanya `active` ve `passive` etiketi doğru hesaplanmalı
- Siteden kaldırılan kampanya `passive` olmalı
- Liste ekranında tarih ve status filtreleri çalışmalı
- Detay ekranında görsel görünmeli
- Haftalık rapor started, ended, active, changed ve passive sayılarını üretmeli

---

# Sonuç

Bu sürümde doküman, kampanyaları sadece toplama ve listeleme mantığından çıkarıp, **zaman bazlı iş değeri üreten bir kampanya izleme ve analiz sistemine** dönüştürecek şekilde yeniden tasarlanmıştır.

Özellikle şu dört konu merkeze alınmıştır:

1. Kampanya görsellerinin URL bazlı toplanması
2. Başlangıç ve bitiş tarihlerinin doğrudan parse edilmesi, gerekirse AI ile çıkarılması
3. Active ve passive status modelinin iş kurallarıyla işletilmesi
4. Raporların scrape tarihine göre değil, kampanyanın gerçek tarih aralığına göre üretilmesi

Bu yapı, yalnızca hangi kampanya var sorusunu değil, hangi dönemde ne oldu sorusunu yanıtlamak için tasarlanmıştır. Teknik olarak da scraper, AI, status engine, database ve dashboard katmanları buna uygun şekilde yeniden kurgulanmıştır.

