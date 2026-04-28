# RakipAnaliz — Entegrasyon Roadmap'i & Batch Plan

**Tarih:** 2026-04-27
**Karar:** TASKS.md'de pending duran FE-1..17 + BE-10, BE-11 önce bitirilecek; sonrasında 6 ad/SEO entegrasyonu sıralı bağlanacak.

---

## Faz 1 — TASKS.md Tamamlama

Frontend görevleri tek tek değil, ilgili gruplar halinde batch'lenir. Her batch tek branch + tek PR.

### Batch A — Türkçeleştirme & Etiketleme (`feat/fe-batch-a-i18n-labels`)
**Kapsam:** FE-1, FE-2, FE-3, FE-4

- **FE-1** Status badge'leri Türkçeleştir
  - `active → Aktif`
  - `ended → Sona Ermiş`
  - `passive → Pasif`
- **FE-2** Site kodları → kullanıcı dostu isimler
  - `bitalih → Bitalih`
  - `nesine → Nesine`
  - `sonduzluk → Sondüzlük`
  - (Yeni site eklenirse `sites.display_name` alanı veya merkezi map kullan, hardcoded olmasın — `batch-6c` ile zaten kaldırıldı)
- **FE-3** Filtre dropdown label'larını Türkçeleştir
  - `last_seen_at → Son Görülme`
  - `first_seen_at → İlk Görülme`
  - `created_at → Oluşturulma`
  - vb. (filtre dropdown'larda görülen tüm teknik field isimleri)
- **FE-4** URL'deki teknik query param'ları kısalt (kaldırma — state shareability bozulur)
  - `dateMode → dm`
  - `campaignType → ct`
  - `category → cat`
  - URL helper'larda map katmanı; eski long form geriye dönük çalışsın (alias).

### Batch B — Filtre UX (`feat/fe-batch-b-filter-ux`)
**Kapsam:** FE-5, FE-6, FE-7

- **FE-5** Filtre uygulanmadan önce sonuç sayısı önizlemesi (`/api/campaigns/count` veya mevcut endpoint'e `count_only=true` flag)
- **FE-6** Kayıtlı filtre preset'leri (önce localStorage, sonra `/api/filter-presets` ile sync)
- **FE-7** Hızlı tarih chip'leri: Bu Hafta, Bu Ay, Son 7 Gün, Son 30 Gün

### Batch C — Comparison & Metrik Kopya (`feat/fe-batch-c-comparison-copy`)
**Kapsam:** FE-8, FE-9, FE-10, FE-11

- **FE-8** ComparisonBar — para birimi tutarlı `₺`, rakip site isimleri görünür
- **FE-9** Yüzde metriklerine context tooltip'i (% neyin yüzdesi)
- **FE-10** "Şüpheli kayıt" badge'inde tooltip ile neden açıklaması
- **FE-11** Dashboard hero stats'a benchmark notu (94% → "Pazar ortalaması %X")

### Batch D — Layout & Empty State (`feat/fe-batch-d-layout-empty`)
**Kapsam:** FE-12, FE-13, FE-14, FE-15

- **FE-12** Tablo genişliği + horizontal scroll
- **FE-13** Kampanya kartı bilgi sıralaması
- **FE-14** Empty state aksiyonları
- **FE-15** Tıklanabilir comparison bar → o rakibe filtre

### Tek Tek Görevler
- **FE-16** Rekabet takvimi Gantt chart (büyük iş, ayrı PR)
- **FE-17** Sondüzlük adapter — BE-14'te selector fix yapıldı, sadece "rakip listesinde aktif" olduğunu doğrula
- **BE-10** AI analysis batch processing
- **BE-11** Weekly report AI çıktısı schema validation + diff check

---

## Faz 2 — Entegrasyonlar (Bağlanma Sırası)

Her entegrasyon kendi PR'ı, kendi `apps/scraper/src/integrations/<name>/` klasöründe. Tek connector pattern: auth → fetch → normalize → upsert → schedule.

| # | Entegrasyon | Amaç | Auth | Maliyet |
|---|-------------|------|------|---------|
| 1 | **Supermetrics** | Kendi reklam harcaması (Google/Meta/TikTok/X/Taboola) tek normalize şemada | API key (`smetric_token`) | ~$200/ay (7-8 kanal için connector başına ücret yerine tek abonelik mantıklı) |
| 2 | **DataForSEO** | Rakip SEO ham veri: SERP, keyword, domain analytics | HTTP Basic | Pay-per-request |
| 3 | **SEMrush** | Rakip strateji: backlink, content gap, advertising research | API key | Aylık plan, request limitli |
| 4 | **SimilarWeb** | Rakip trafik kaynak dağılımı (paid/organic/direct/social/referral) | API key | Enterprise plan |
| 5 | **Google Search Console** | Kendi domain organik performans | OAuth2 / Service Account | Ücretsiz |
| 6 | **Meta Ad Library** | Rakip canlı reklam yaratıcıları | App access token | Ücretsiz |

**Neden bu sıra:**
1. Supermetrics önce — kendi spend baseline'ı olmadan rakip analizinin ROI bağlamı eksik.
2. DataForSEO sonra — RakipAnaliz'in DNA'sına en yakın (rakip görünürlüğü).
3. SEMrush DataForSEO ile çakışan kısım var ama backlink/content gap ekstra.
4. SimilarWeb resmi kaynaklı "büyük resim".
5. GSC kendi tarafı, eksik kalmasın.
6. Meta Ad Library ücretsiz, sıkışınca paralel çalışılabilir.

API doc'ları:
- `docs/01_API_SUPERMETRICS.md`
- `docs/05_API_SEARCH_CONSOLE.md`
- `docs/06_API_DATAFORSEO.md`
- (SEMrush, SimilarWeb, Meta Ad Library doc'ları faz başında yazılacak)
