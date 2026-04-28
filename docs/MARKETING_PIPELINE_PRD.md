# Marketing Pipeline PRD — Bi'Talih Otomatik Haftalık Raporlama

**Tarih:** 2026-04-28
**Sahibi:** Oğuz
**Referans dokümanlar:** `docs/MARKETING_DASHBOARD_DEEP_DIVE.md` (Excel analizi + özellik kataloğu), `docs/01_API_SUPERMETRICS.md`, `docs/03_API_GA4.md`, `docs/GA4_METRICS_AND_DIMENSIONS.md`

---

## 1. Vizyon

Bi'Talih ekibinin manuel Excel raporundan kurtulup uçtan uca otomatik haftalık marketing intelligence dashboard'u. Pzt 06:00'da geçen haftanın raporu Supermetrics'ten çekilir → DB'de normalize edilir → snapshot'lanır → AI tarafından yorumlanır → dashboard güncellenir → kullanıcı email/in-app bildirim alır. Hiçbir manuel adım yok (manuel entry sadece düzeltme/fallback için).

---

## 2. Locked Decisions (Bi'Talih ekibiyle 2026-04-28'de kesinleşti)

| # | Karar | Detay |
|---|-------|-------|
| 1 | **Spend FX** | USD → TRY × **45 (sabit)**, config'lenebilir tablo |
| 2 | **Mobile-web overlap** | GA4 (web) ve Adjust (mobile) **yan yana ayrı görünüm**. Cross-block sum yok. |
| 3 | **CRM (Weekly Growth)** | MVP **dışı** (PUSH/SMS/POPUP/STORYLY) |
| 4 | **Multi-property** | `property_id` baştan tasarımda. MVP'de tek property (Bi'Talih), default = 1 |
| 5 | **Mapping** | GA4 `source/medium` + Adjust `network` bazlı. Excel'den 529 (GA4) + 107 (Adjust) satır seed. |
| 6 | **Cron** | Pzt 06:00 → geçen haftanın (Pzt-Paz) ilk cut. Sal 06:00 + Çar 06:00 re-run. |
| 7 | **Snapshot stratejisi** | Pzt cut = `preliminary`, Çar 06:00 sonrası = `final` (immutable freeze). |
| 8 | **End-to-end pipeline** | Pull → Map → Snapshot → AI yorumla → Dashboard güncelle → Bildirim (email + in-app). |
| 9 | **CR formülü** | `Purchase / Sessions` (NOT Sign-Up/Sessions). Excel ile uyumlu. |
| 10 | **Display Ads** | Bilinmeyen display source'lar için fallback bucket. Auto-classify kuralı (medium=cpm, kategori bilinmiyor → Display Ads). |
| 11 | **Ratio metric storage** | CR/CPC/CPM/ROAS/CPS/CPP **stored OLMAYACAK**, view-time/query-time hesaplanacak. |
| 12 | **USER metric** | GA4 USER aditif değil — `SM_GA4_Weekly_Users` muadili ayrı tablo (`weekly_unique_users`) tutulacak. |

---

## 3. Mimari (uçtan uca)

```
                        ┌─────────────────────┐
                        │  Supermetrics API   │
                        │  (5 ds_id):         │
                        │  - Multi-ads agg    │
                        │  - GA4              │
                        │  - GA4 weekly users │
                        │  - Adjust           │
                        │  - Adjust events    │
                        └──────────┬──────────┘
                                   │ HTTPS
                  ┌────────────────▼────────────────┐
                  │  apps/scraper/src/integrations/  │
                  │  supermetrics/                   │
                  │  - client (auth + retry)         │
                  │  - fetch (per ds_id)             │
                  │  - normalize (per source)        │
                  │  - persist (long-format)         │
                  └────────────────┬────────────────┘
                                   │
                       ┌───────────▼────────────┐
                       │ marketing_metrics_     │
                       │ daily (raw long)       │
                       └───────────┬────────────┘
                                   │
                  ┌────────────────▼────────────────┐
                  │ Mapping engine                   │
                  │ - channel_mappings table         │
                  │ - unmapped_sources flag          │
                  │ - FX conversion (USD×45)         │
                  └────────────────┬────────────────┘
                                   │
                       ┌───────────▼────────────┐
                       │ marketing_metrics_     │
                       │ normalized             │
                       └───────────┬────────────┘
                                   │
                  ┌────────────────▼────────────────┐
                  │ Period aggregator (TW/LW/4WA)    │
                  │ + week_close → freeze snapshot   │
                  └────────────────┬────────────────┘
                                   │
                       ┌───────────▼────────────┐
                       │ weekly_snapshots       │
                       │ (immutable JSON)       │
                       └───────────┬────────────┘
                                   │
                  ┌────────────────▼────────────────┐
                  │ DeepSeek AI (BE-11 üzerine)     │
                  │ - matrix snapshot → yorum       │
                  │ - delta + anomali detection     │
                  │ - tavsiye                       │
                  └────────────────┬────────────────┘
                                   │
                  ┌────────────────▼────────────────┐
                  │ /api/marketing/matrix           │
                  │ /api/marketing/commentary       │
                  └────────────────┬────────────────┘
                                   │
              ┌────────────────────┴─────────────┐
              │                                  │
       ┌──────▼──────┐                  ┌────────▼────────┐
       │ Dashboard   │                  │ Notification    │
       │ /marketing/ │                  │ - email (Resend)│
       │ weekly      │                  │ - in-app banner │
       └─────────────┘                  └─────────────────┘
```

**Cron tetikleyici:** Pzt 06:00 (TZ: Europe/Istanbul). Trigger flow → tüm pipeline → kullanıcılara bildirim.

---

## 4. Data Model (final, MySQL)

```sql
-- 1. Properties (multi-tenant baştan)
CREATE TABLE properties (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) DEFAULT 'Europe/Istanbul',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Seed: id=1 Bi'Talih

-- 2. FX rates (config'lenebilir conversion)
CREATE TABLE fx_rates (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  from_currency CHAR(3) NOT NULL,
  to_currency CHAR(3) NOT NULL,
  rate DECIMAL(12,4) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,         -- NULL = open-ended (current)
  source VARCHAR(50) DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (from_currency, to_currency, effective_from)
);
-- Seed: USD→TRY 45, effective 2026-04-28 onwards

-- 3. Channel mappings (Excel GA4 + Adjust mapping seed)
CREATE TABLE channel_mappings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  source_system ENUM('ga4','adjust') NOT NULL,
  source_key VARCHAR(255) NOT NULL,        -- e.g. "google / cpc" or "App Samurai"
  segment ENUM('Paid','Unpaid','Other') NOT NULL,
  category VARCHAR(100) NOT NULL,           -- canonical channel: "Google Ads"
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (property_id, source_system, source_key),
  INDEX (property_id, source_system, category)
);

-- 4. Unmapped sources (admin queue)
CREATE TABLE unmapped_sources (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  source_system ENUM('ga4','adjust','ads') NOT NULL,
  source_key VARCHAR(255) NOT NULL,
  first_seen DATE NOT NULL,
  last_seen DATE NOT NULL,
  occurrence_count BIGINT DEFAULT 1,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP NULL,
  resolved_to_mapping_id BIGINT NULL,
  UNIQUE KEY (property_id, source_system, source_key)
);

-- 5. Daily long-format raw metrics (post-normalization, pre-aggregation)
CREATE TABLE marketing_metrics_daily (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  date DATE NOT NULL,
  source_system ENUM('ga4','adjust','ads','adjust_events') NOT NULL,
  raw_source_key VARCHAR(255) NOT NULL,    -- "google / cpc" / "App Samurai" / "Google Ads"
  category VARCHAR(100) NOT NULL,           -- mapped canonical: "Google Ads"
  segment ENUM('Paid','Unpaid','Other') NOT NULL,
  os ENUM('android','ios','web','android-tv','other') NULL,  -- Adjust için
  metric VARCHAR(50) NOT NULL,              -- 'sessions','users','impressions','clicks','spend','signups','purchases','revenue','installs'
  value DECIMAL(18,4) DEFAULT 0,
  currency CHAR(3) NULL,                    -- spend için 'USD' veya 'TRY'
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  source_dsid VARCHAR(50),                  -- supermetrics ds_id, debug için
  raw_payload JSON,                         -- ham yanıt (debug)
  UNIQUE KEY (property_id, date, source_system, raw_source_key, metric, os),
  INDEX (property_id, date, source_system),
  INDEX (property_id, category, date)
);

-- 6. GA4 weekly unique users (özel — günlük toplanamaz)
CREATE TABLE weekly_unique_users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  week_start DATE NOT NULL,                 -- Pazartesi
  raw_source_key VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  total_users BIGINT DEFAULT 0,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY (property_id, week_start, raw_source_key)
);

-- 7. Weekly snapshots (frozen — immutable)
CREATE TABLE weekly_snapshots (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  week_start DATE NOT NULL,                 -- Pazartesi
  status ENUM('preliminary','final') NOT NULL,
  matrix_payload JSON NOT NULL,             -- full Master_Metric_Table eşleniği
  ai_commentary JSON NULL,                  -- DeepSeek yorumu
  ai_commentary_generated_at TIMESTAMP NULL,
  notification_sent_at TIMESTAMP NULL,
  frozen_at TIMESTAMP NULL,                  -- final'a geçince doldurulur
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY (property_id, week_start, status),
  INDEX (property_id, week_start)
);

-- 8. Audit log
CREATE TABLE marketing_audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  property_id BIGINT NOT NULL,
  actor VARCHAR(100),                       -- 'cron' / user email
  action VARCHAR(50) NOT NULL,              -- 'fetch','map','snapshot','freeze','manual_edit','ai_generate'
  target_table VARCHAR(50),
  target_id BIGINT,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (property_id, created_at),
  INDEX (action, created_at)
);
```

---

## 5. Implementation Phases (3 dalga)

### Dalga 1 — Backend Foundation (Supermetrics-bağımsız)

**Çıktılar:**
- 8 yeni MySQL migration (tablolar yukarıdaki şemada)
- Channel mapping seed: Excel'den 529 GA4 + 107 Adjust satırı CSV/SQL'e dönüştürüp DB'ye import
- FX rate seed (USD→TRY 45)
- Properties seed (id=1 Bi'Talih)
- Type tanımları: `packages/shared/src/marketing/types.ts` (AdMetric, ChannelMapping, WeeklySnapshot)
- Helper'lar: `packages/shared/src/marketing/fx.ts` (FX conversion lookup)

**Çıkmaz adam test:** Migration'lar çalışıyor mu, seed verisi doğru mu, mapping CRUD operasyonları typescript-safe mi.

**Tahmin:** 15-25 dk.

### Dalga 2 — Supermetrics Pipeline (key gerekli)

**Önkoşul:** Supermetrics API key + 5 ds_id

**Çıktılar:**
- `apps/scraper/src/integrations/supermetrics/` modülü:
  - `client.ts` — API key auth, retry (BE-12 pattern), 4xx no-retry / 5xx retry
  - `fetch.ts` — 5 source için per-ds_id query (Date range parametrik)
  - `normalize.ts` — her source için `marketing_metrics_daily` rekor üret (long format)
  - `mapper.ts` — channel_mappings ile category/segment ata, eşleşmeyenleri unmapped_sources'a flag
  - `fx.ts` — spend için USD detect → TRY × 45 dönüşüm, currency kolonunu doğru set
  - `weekly_users.ts` — GA4 weekly users özel pull
  - `persist.ts` — upsert (`ON DUPLICATE KEY UPDATE`)
  - `index.ts` — `runSupermetricsSync(property_id, week_start)` orchestration
- Period aggregator: `aggregator.ts` — günlük → haftalık matrix payload
- Snapshot: `snapshot.ts` — `runWeeklySnapshot(property_id, week_start, status)` preliminary/final
- `.env.example` — API key + 5 ds_id placeholder
- **Cron registration** — Pzt 06:00, Sal 06:00, Çar 06:00 (Çar = final freeze)
- DLQ entegrasyonu (BE-9 pattern)

**Çıkmaz adam test:** Cron'u manuel tetikle, snapshot oluşuyor mu, mapping çalışıyor mu, FX uygulanıyor mu, unmapped'lere düşen var mı.

**Tahmin:** 30-45 dk.

### Dalga 3 — AI + Dashboard + Bildirim

**Çıktılar:**
- AI commentary: `apps/scraper/src/jobs/marketing-ai-commentary.ts`
  - DeepSeek prompt: matrix snapshot + delta'lar + threshold-based anomali listesi → yorum
  - Zod schema (BE-11 pattern), validation + fail-safe
  - `weekly_snapshots.ai_commentary` JSON kolonuna yaz
- API endpoint'leri:
  - `GET /api/marketing/matrix?week=2026-W17&status=final` → matrix payload
  - `GET /api/marketing/commentary?week=...` → AI yorumu
  - `GET /api/marketing/unmapped-sources?resolved=false` → admin queue
  - `POST /api/marketing/mappings` → mapping CRUD
  - `POST /api/marketing/snapshots/:id/freeze` → manuel freeze
- Dashboard sayfaları:
  - `/marketing/weekly` — Master_Metric_Table replika matrix (GA4 + Adjust blokları), TW/LW idx/4WA idx kolonları
  - `/marketing/weekly` üstünde AI commentary kartı
  - `/admin/mapping` — channel_mappings CRUD, unmapped queue review
- Bildirim:
  - Email (Resend ile, Bi'Talih ekibi listesi `MARKETING_REPORT_RECIPIENTS` env)
  - In-app banner (mevcut notification sistemi varsa onun üstüne)
- Trigger: snapshot finalize sonrası → AI yorum → bildirim

**Çıkmaz adam test:** Dashboard sayfasında matrix renderlenebiliyor mu, AI yorumu okunabilir mi, email gerçekten gidiyor mu (test recipient'a).

**Tahmin:** 45-60 dk.

---

## 6. Out of Scope (P1 / sonraki sprint'ler)

- Aylık + yıllık view (haftalık MVP yeterli)
- Forecasting / trend extrapolation
- Channel deep-dive sayfaları (`/channels/:channel`)
- AI chat (interactive — bu MVP sadece asenkron commentary)
- Slack digest (sadece email + in-app)
- PDF export
- Multi-property UI (DB hazır ama tek property)
- Goal tracking
- Direct GA4 / Adjust / ad platform API'leri (Supermetrics yeterli, fallback değil)
- Weekly Growth (CRM channels)
- Database_W (vertical/pazar payı tracking)

---

## 7. Açık Sorular (Dalga 2 öncesi cevaplanacak)

1. Supermetrics 5 `ds_id`: API key alındıktan sonra hangi ID'lerin hangi source'a karşılık geldiğini config'le.
2. Email notification recipient listesi: kimler alacak (env var olarak)?
3. AI commentary dili: sadece TR mi, TR+EN mi?

## 8. Risk & Bilinen Çakışmalar

- **Cron yarış durumu:** Pzt 06:00 + Sal 06:00 + Çar 06:00 üst üste binmesin → job lock (BE-9 DLQ ile zaten var, kullan).
- **Supermetrics rate limit:** 5 source × 4 hafta backfill ilk run'da quota dolarabilir → exponential backoff + sequential per-source.
- **Yeni source görününce:** unmapped queue dolar, admin görmezse mapping eksik kalır → in-app banner ile alert.
- **AI yorum boş gelirse:** snapshot yine kaydedilir, commentary `null` olur, dashboard boşluk gösterir (fail-safe).

---

## 9. Success Criteria (MVP demo)

- [ ] Pzt 06:00'da cron çalıştı, geçen haftanın `preliminary` snapshot'ı oluştu
- [ ] Çar 06:00'da `final` snapshot dondu
- [ ] Dashboard'da `/marketing/weekly` matrix Master_Metric_Table eşleniği render
- [ ] AI commentary kartı görünür (kullanıcı için anlamlı)
- [ ] Bi'Talih ekibine email düştü
- [ ] Yeni unknown source görününce admin queue'da listelendi
- [ ] Manuel "Excel'i bırakmak yeter mi" testi: ekip 1 hafta dashboard kullansın, Excel'e ihtiyaç duymasın.
