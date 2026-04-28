# RakipAnaliz — Kapsamlı Bug Raporu & Geliştirme Planı

**Tarih:** 2026-04-24
**Kapsam:** (1) Kod taramasından tespit edilen gerçek bug'lar, (2) `docs/` altında dokümante edilmiş bulgular ve geliştirme planları.

---

## 📊 Yönetici Özeti

| Kaynak | Kritik | Yüksek | Orta | Düşük | Toplam |
|---|---|---|---|---|---|
| **Kod taraması (yeni tespit)** | 3 | 2 | 6 | 0 | **11** |
| **Docs'ta dokümante edilmiş açık bug'lar** | 2 | 2 | 4 | 1 | **9** |
| **GENEL TOPLAM** | **5** | **4** | **10** | **1** | **20** |

Ek olarak:
- 7 teknik borç maddesi
- 6 batch halinde geliştirme planı
- 4 onay bekleyen mimari karar

---

# BÖLÜM 1 — KOD TARAMASINDAN TESPİT EDİLEN BUG'LAR

## 🔴 Kritik

### K-1. Hardcoded DeepSeek API Anahtarı .env Dosyalarında
- **Kategori:** Güvenlik
- **Dosya:** `.env:7`, `apps/scraper/.env:7`
- **Açıklama:** DeepSeek API anahtarı açık metin olarak .env dosyalarında duruyor. `.gitignore`'da .env var olsa da, dosya git history'de iz bırakmış olabilir. Üçüncü taraflar anahtarı kötüye kullanıp maliyet çıkarabilir.
- **Öneri:** (1) Anahtarı HEMEN iptal et/döndür. (2) Coolify secrets / vault kullan. (3) Git history'yi temizle: `git log --all --full-history -- .env | grep -i "sk-"`.

### K-2. CORS `Access-Control-Allow-Origin: *` Tüm API'lerde
- **Kategori:** Güvenlik
- **Dosya:** `apps/dashboard/lib/response.ts:94`
- **Açıklama:** `getCorsHeaders()` her endpoint'te `*` dönüyor. CSRF saldırılarına açık; admin POST/DELETE endpoint'lerinde özellikle tehlikeli.
- **Öneri:** `process.env.ALLOWED_ORIGINS?.split(',')` ile whitelist uygula; admin endpoint'lerinde daha sıkı; `SameSite=Strict` ekle.

### K-3. Scraper Container'ı Root Kullanıcı ile Çalışıyor
- **Kategori:** Güvenlik / Config
- **Dosya:** `apps/scraper/Dockerfile:26` (USER direktifi yok)
- **Açıklama:** Dashboard Dockerfile'ında non-root user var ama scraper'da yok. Puppeteer/Chromium içerdiği için container escape senaryosunda full host erişimi riski yüksek.
- **Öneri:** Dashboard'daki gibi `RUN adduser --system --uid 1001 scraper` + `USER scraper` ekle.

## 🟠 Yüksek

### Y-1. `getTransaction()` Error Path'inde Connection Leak
- **Kategori:** Runtime
- **Dosya:** `apps/scraper/src/db/index.ts:51-68`
- **Açıklama:** `getMysqlPool().getConnection()` aldıktan sonra `conn.beginTransaction()` fail ederse connection release edilmiyor. Pool exhaustion'a yol açar.
- **Öneri:**
  ```ts
  const conn = await getMysqlPool().getConnection();
  try {
    await conn.beginTransaction();
    // ...
  } catch (err) {
    conn.release();
    throw err;
  }
  ```

### Y-2. Boş Migration Dosyaları (003-007)
- **Kategori:** Veri / Config
- **Dosya:** `db/migrations/003_fix_schema.sql` … `007_legacy_schema_compat.sql` (hepsi sadece `SELECT 1;`)
- **Açıklama:** İsimleri "fix_schema", "fix_bitalih_schema", "add_performance_indexes" diyor ama gerçekte hiçbir şey yapmıyorlar. Deploy'larda schema tutarsızlığı riski.
- **Öneri:** Ya 001'e merge et ve bunları sil, ya da gerçek migration içeriğini yaz.

## 🟡 Orta

### O-1. Boş `rakip_analiz.db` Dosyası (0 byte)
- **Kategori:** Veri / Cleanup
- **Dosya:** `rakip_analiz.db`
- **Açıklama:** Proje MySQL kullanıyor ama root'ta 0 byte SQLite dosyası duruyor — legacy artifact, confusion sebebi.
- **Öneri:** `git rm --cached rakip_analiz.db`, .gitignore'a ekle.

### O-2. `campaign_alerts` Email Dispatch'i Hiç Çalışmıyor
- **Kategori:** Runtime / Logic
- **Dosya:** `apps/scraper/src/jobs/campaign-alerts.ts:23, 88`, `apps/scraper/src/index.ts:70`
- **Açıklama:** Alert'ler DB'ye yazılıyor, ama email worker yok. `sent_at` tracking da yok → stale rows birikiyor.
- **Öneri:** Email worker ekle; `sent_at TIMESTAMP NULL`, `attempt_count INT DEFAULT 0` kolonları ekle; retry + DLQ.

### O-3. `recipient_emails` Kullanılmıyor
- **Kategori:** Logic
- **Dosya:** `apps/scraper/src/jobs/campaign-alerts.ts:53`
- **Açıklama:** INSERT'te `JSON_ARRAY()` (boş array) yazılıyor; recipient seçim UI'ı yok; alan ölü.
- **Öneri:** Admin UI'da recipient seçimi + email worker'da validation.

### O-4. Env Var Tutarsızlığı: `.env.coolify.example` vs `docker-compose.coolify.yml`
- **Kategori:** Config
- **Dosya:** `.env.coolify.example`, `docker-compose.coolify.yml`
- **Açıklama:** Compose'da `DEEPSEEK_API_KEY`, `ADMIN_API_KEY` için default yok → boş gelirse production'da sessiz fail.
- **Öneri:** Compose'a explicit kontrol / healthcheck ekle; .example ile tam senkron tut.

### O-5. TypeScript Strict Mode Kısmen Etkin
- **Kategori:** Config
- **Dosya:** `tsconfig.base.json:8`, `apps/dashboard/tsconfig.json:34`
- **Açıklama:** Base'de `"strict": true` ama dashboard override ediyor ve sadece `strictNullChecks` açıyor. Partial type-safety.
- **Öneri:** Tüm workspace'lerde consistent olacak şekilde full strict ya da explicit override listesi.

### O-6. TODO: Email Delivery Worker (Tekrar)
- **Kategori:** TODO
- **Dosya:** `apps/scraper/src/jobs/campaign-alerts.ts:88`
- **Açıklama:** `// TODO: dispatch email to recipient_emails when delivery worker lands.` — TASKS.md'de de bağlantılı, blocking.
- **Öneri:** Sprint'e al; O-2 ve O-3 ile birlikte çözülmeli.

---

# BÖLÜM 2 — DOCS'TA DOKÜMANTE EDİLMİŞ AÇIK BUG'LAR

> Kaynak: `FRONTEND_ANALIZ_2026-04-22.md`, `RISK_ANALYSIS.md`, `SUBAGENT_TODO_PLAN.md`, `superpowers/specs/2026-04-16-confidence-and-best-effort-comprehensive-extraction-design.md`

## 🔴 Kritik

### D-K1. `CategoryWinnerWidget` Tamamen Mock Data
- **Durum:** Açık
- **Referans:** `FRONTEND_ANALIZ_2026-04-22.md:20-49`
- **Açıklama:** Widget `MOCK_CATEGORY_WINNERS` kullanıyor, `useQuery` yok, API'ye bağlı değil. Marketing/Growth ekibi yanlış verilere göre karar alıyor olabilir.
- **Çözüm:** Widget'ı `useQuery` + `/api/competition` ile bağla, mock data sil.

### D-K2. AI Karşılaştırma Paneli Tarih Filtrelerini Göz Ardı Ediyor
- **Durum:** Açık (kısmi)
- **Referans:** `FRONTEND_ANALIZ_2026-04-22.md:53-108`
- **Açıklama:** "Bu Hafta / Bu Ay" seçimi UI'da görünmüyor; panelde tarih badge'i yok; metrik açıklamaları belirsiz ("Rakip ort: 47" → neye göre?); delta gösterimi yok. Backend filtre doğru yapıyor, UI netliği eksik.
- **Çözüm:** Tarih badge ekle; metrikleri netleştir; önceki dönem delta göster.

## 🟠 Yüksek

### D-Y1. `SITE_FRIENDLY_NAMES` Yazım Hatası + Tutarsızlık
- **Durum:** Açık
- **Referans:** `FRONTEND_ANALIZ_2026-04-22.md:111-146`, `RISK_ANALYSIS.md:185-249`
- **Açıklama:** `site-colors.ts:13` → `sonduzluk` (yanlış); `SITE_FRIENDLY_NAMES` → `sondzulyuk` (doğru). Sondüzlük kampanyaları calendar'da fallback gri renkle gösteriliyor.
- **Çözüm:** Typo fix + hardcoded mapping'leri kaldır, backend'den çek.

### D-Y2. `PRIORITY_SITES` Hardcoded
- **Durum:** Açık
- **Referans:** `FRONTEND_ANALIZ_2026-04-22.md:149-162`, `RISK_ANALYSIS.md:249-296`
- **Açıklama:** `PRIORITY_SITES = ['bitalih', 'hipodrom', 'atyarisi']` frontend'de sabit. Yeni site ekleyince hash-based renk fallback'i devreye giriyor.
- **Çözüm:** `sites` tablosuna `is_priority` kolonu, `/api/sites` endpoint güncellemesi.

## 🟡 Orta

### D-O1. Scraper Confidence Normalization Hataları
- **Durum:** Açık
- **Referans:** `superpowers/specs/2026-04-16-confidence-and-best-effort-comprehensive-extraction-design.md:1-49`
- **Açıklama:** Coolify log: `Out of range value for column 'valid_from_confidence'`. Model 0-100 döndürüyor, DB 0-1 bekliyor. Ayrıca schema mismatch'te tüm extraction drop oluyor.
- **Çözüm:** `normalizeConfidence01()` helper; schema fail'de partial salvage (best-effort coercion).

### D-O2. Kategori Label'ları Backend ile Uyumsuz
- **Durum:** Açık
- **Referans:** `FRONTEND_ANALIZ_2026-04-22.md:167-179`
- **Açıklama:** `lib/category-labels.ts` static dictionary. Yeni kategori ("free_spins" vb.) "Bilinmiyor" veya raw kod gösterilir.
- **Çözüm:** Backend'den çek veya fallback'i `code → Title Case`'e çevir.

### D-O3. Türkçe Ay İsimleri Hardcoded
- **Durum:** Açık
- **Referans:** `FRONTEND_ANALIZ_2026-04-22.md:182-194`
- **Açıklama:** `gantt-strip.tsx`'te `MONTHS_TR` array. i18n genişletmesini bloke ediyor.
- **Çözüm:** `Intl.DateTimeFormat('tr-TR')` + `lib/i18n.ts`.

### D-O4. Intent/Stance Threshold'ları Frontend'de
- **Durum:** Açık
- **Referans:** `FRONTEND_ANALIZ_2026-04-22.md:197-211`
- **Açıklama:** `-2` ve `+2` threshold'ları frontend'de sabit. Backend değişirse senkron kalmaz.
- **Çözüm:** `lib/taxonomy.ts`'e taşı veya backend'den çek.

## 🟢 Düşük

### D-D1. `CompareClient` Yanlış Site Name Lookup
- **Durum:** Açık
- **Referans:** `RISK_ANALYSIS.md:491-495`
- **Açıklama:** `CompareClient:79` → `SITE_FRIENDLY_NAMES[c.site?.name?.toLowerCase()]`. Backend zaten proper case dönüyor, gereksiz lookup.
- **Çözüm:** `c.site?.name` direkt kullan.

---

# BÖLÜM 3 — GELİŞTİRME PLANI

> Kaynak: `SUBAGENT_TODO_PLAN.md`

## Kısa Vade (Bu Sprint)

### Batch A — AI Panel + CategoryWinnerWidget (Kritik) — 2-3 saat
- **A-1:** `CategoryWinnerWidget` → API'ye bağla (mock kaldır, loading/error state) — `SUBAGENT_TODO_PLAN.md:33-91`
- **A-2:** AI Panel → tarih badge, metrik netleştirme, delta gösterimi — `SUBAGENT_TODO_PLAN.md:94-138`

### Batch B — Site Names + Colors Refactor (Yüksek) — 1-2 saat
- **B-1:** `SITE_FRIENDLY_NAMES` temizliği + typo fix — `SUBAGENT_TODO_PLAN.md:146-183`
- **B-2:** Priority sites'i backend'e taşı (`is_priority` kolonu) — `SUBAGENT_TODO_PLAN.md:186-206`

## Orta Vade (1-2 ay)

### Batch C — i18n + Taxonomy (Orta) — 1 saat
- **C-1:** Türkçe ay isimleri → `Intl.DateTimeFormat`
- **C-2:** Intent/Stance taxonomy tek dosyada
- **C-3:** Kategori label fallback iyileştirme

### Batch D — Dashboard UX (Orta) — 1-2 saat
- **D-1:** Sample size < 10 için sarı uyarı
- **D-2:** Alert webhook + Slack entegrasyonu

### Batch E — Yeni Özellikler (Yüksek) — 3-4 saat
- **E-1:** `/compare` sayfasında rakip seçimi dropdown'ı
- **E-2:** Calendar rakip overlay (site filter + highlight)

## Uzun Vade (3+ ay)

### Batch F — İleri Özellikler (Düşük) — 4-6 saat
- **F-1:** Campaign ROI Score (bonus / turnover çarpanı)
- **F-2:** Bonus Index YoY + kategori breakdown
- **F-3:** Haftalık PDF rapor otomasyonu (Pazartesi 09:00)

---

# BÖLÜM 4 — TEKNİK BORÇ

1. **Test coverage = 0** — Dashboard'da vitest/jest yok, tüm değişiklikler manuel test. (🔴 Kritik borç)
2. **Hardcoded constants dağınık** — Site adları, renkler, aylar, kategori etiketleri 5+ dosyada. (Orta)
3. **API response shape belirsiz** — `/api/competition` çok büyük, hangi field hangi component'te kullanılıyor net değil. (Orta)
4. **`runner_up` alanı backend response'unda yok** — Widget `siteMatrix`'ten fragile reconstruction yapıyor. (Orta)
5. **Confidence normalization helper eksik** — 0-100 vs 0-1 dönüşümü scraper genelinde yok. (Orta)
6. **Error boundary / UX** — Mock fallback var ama gerçek API hatasında UX belirsiz. (Orta)
7. **Pagination / büyük dataset handling yok** — Site sayısı arttığında response şişecek. (Düşük)

---

# BÖLÜM 5 — MİMARİ KARARLAR

| # | Karar | Durum | Notu |
|---|---|---|---|
| 1 | TanStack Query ile caching | ✅ Uygulandı | Query key naming tutarsız olabilir |
| 2 | `/api/competition` tek endpoint'te tüm veri | ⚠️ Uygulandı, tartışmalı | Split düşünülmeli |
| 3 | `PRIORITY_SITES` frontend hardcode | ❌ Kötü | Batch B-2 ile backend'e taşınacak |
| 4 | `SITE_FRIENDLY_NAMES` frontend hardcode | ❌ Kötü | Batch B-1 ile kaldırılacak |
| 5 | i18n strategy | ⏳ Planlandı | Batch C-1 |
| 6 | AI extraction: strict vs best-effort | ⏳ Spec hazır, impl bekliyor | `superpowers/specs/2026-04-16-...` |
| 7 | Category labels: hardcode vs backend | ⏳ Beklemede | Batch C-3 |

---

# BÖLÜM 6 — DOCS KALİTESİ GÖZLEMLERİ

## Tutarsızlıklar
- `SITE_FRIENDLY_NAMES` → `SUBAGENT_TODO_PLAN.md:141` "3 yerde tekrar" der, `RISK_ANALYSIS.md:185` "2 yerde" der. (Doğrusu 2.)
- `CategoryWinnerWidget` import durumu iki doc'ta farklı anlatılmış.
- `site-colors.ts` typo (`sonduzluk` vs `sondzulyuk`) tutarsızlığı.

## Eksik Dokümantasyon
- **Auth/security:** `AUTHENTICATION.md` yok; `FRONTEND_ANALIZ_2026-04-22.md:368` "Auth yok gibi görünüyor" diyor.
- **Database schema:** `docs/DATABASE.md` yok.
- **Scraper architecture:** Scheduling, platform listesi, flow yok.
- **API contracts:** OpenAPI/Swagger yok.
- **Error handling strategy:** `docs/ERROR_HANDLING.md` yok.
- **Deployment docs:** Rollout planı, monitoring, DR prosedürleri yok.

## İyi Yapılan
- Frontend analizi (FRONTEND_ANALIZ_2026-04-22.md) çok kapsamlı ve pratik.
- Risk analizi (RISK_ANALYSIS.md) detaylı ve açık.
- Batch-based TODO yapısı (SUBAGENT_TODO_PLAN.md) koordinasyon için iyi.
- Supermetrics/GA4/Google Ads/Search Console entegrasyon docs'ları detaylı.

---

# 🎯 SONRAKİ 1 HAFTA — ÖNCELİKLİ EYLEM LİSTESİ

| Sıra | İş | Kaynak | Etki | Süre | Risk |
|---|---|---|---|---|---|
| 1 | **DeepSeek API anahtarını döndür** | K-1 | 🔴 Kritik (maliyet) | 30dk | None |
| 2 | **CORS whitelist yap** | K-2 | 🔴 Kritik (CSRF) | 1sa | Düşük |
| 3 | **Scraper non-root user** | K-3 | 🔴 Kritik (container escape) | 30dk | Düşük |
| 4 | **`getTransaction()` connection leak fix** | Y-1 | 🟠 Pool exhaustion | 30dk | Düşük |
| 5 | **CategoryWinnerWidget API bind** | D-K1 / Batch A-1 | 🔴 Yanlış karar riski | 2-3sa | Orta |
| 6 | **AI Panel tarih badge + delta** | D-K2 / Batch A-2 | 🔴 UX belirsizliği | 1-2sa | Düşük |
| 7 | **Confidence normalization fix** | D-O1 | 🟠 DB hatası | 2-3sa | Düşük |
| 8 | **`site-colors.ts` typo fix** | D-Y1 / Batch B-1 | 🟠 Renk yanlışı | 15dk | Yok |
| 9 | **`rakip_analiz.db` temizle** | O-1 | 🟡 Confusion | 5dk | Yok |
| 10 | **Boş migration'ları birleştir/sil** | Y-2 | 🟠 Schema drift | 1sa | Orta |

---

## Notlar
- **Raporun yaşı:** Docs'taki analizler 22 Nisan 2026 tarihli (2 gün önce) — veri taze.
- **Takım:** Subagent-based batch planning ile iyi koordine, ama test coverage'ın yokluğu her değişikliği manuel test'e bağımlı kılıyor.
- **En büyük mimari risk:** Frontend'de hardcoded veri (site listesi, kategoriler, priority flag, renkler) — backend değiştiğinde senkron kalmayacak.
