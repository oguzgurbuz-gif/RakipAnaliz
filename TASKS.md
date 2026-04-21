# RakipAnaliz Geliştirme Görevleri

## Frontend Görevleri (FE-1 ... FE-17)

| ID | Başlık | Durum | Öncelik |
|----|--------|-------|---------|
| FE-1 | Status badge'leri Türkçeleştir (active→Aktif, ended→Sona Ermiş, passive→Pasif) | pending | high |
| FE-2 | Site kodlarını kullanıcı dostu isimlerle değiştir (bitalih→Bitalih, nesine→Nesine, sonduzluk→Sondüzlük) | pending | high |
| FE-3 | Filtre dropdown'ları - Teknik field isimlerini Türkçe label'larla değiştir (last_seen_at→Son Görülme) | pending | high |
| FE-4 | URL'deki teknik parametreleri gizle veya temizle (dateMode, campaignType) | pending | medium |
| FE-5 | Filtre uygulanınca sonuç sayısı önceden göster (örn: '37 kampanya bulundu') | pending | medium |
| FE-6 | Kayıtlı filtre preset'leri ekle (localStorage + API sync) | pending | medium |
| FE-7 | Hızlı tarih filtreleri ekle (Bu Hafta, Bu Ay, Son 7 Gün, Son 30 Gün) | pending | medium |
| FE-8 | ComparisonBar'ları düzelt - tüm para birimlerini tutarlı formatla (₺), rakip site isimlerini göster | pending | high |
| FE-9 | Yüzde metriklerine açıklama ekle (%45 neyin yüzdesi?) | pending | low |
| FE-10 | 'Şüpheli kayıt' badge'ine tooltip ile neden açıklaması ekle | pending | medium |
| FE-11 | Dashboard hero stats'a benchmark/karşılaştırma notu ekle (94% iyi mi?) | pending | medium |
| FE-12 | Tablo genişliğini düzelt ve horizontal scroll optimize et | pending | low |
| FE-13 | Kampanya kartlarında bilgi öncelik sıralaması yap - en önemli en üstte | pending | medium |
| FE-14 | Empty state'lere somut aksiyon önerileri ekle | pending | low |
| FE-15 | Karşılaştırma bar'larını tıklanabilir yap - tıklayınca o rakibe filtrelesin | pending | medium |
| FE-16 | Rekabet takvimi için Gantt Chart ekle - kampanyaların zaman dilimlerini görselleştir | pending | low |
| FE-17 | Sondüzluk (sonduzluk) sitesini rakip olarak ekle - yeni adapter entegrasyonu | pending | high |

## Backend Görevleri (BE-1 ... BE-14)

| ID | Başlık | Durum | Öncelik |
|----|--------|-------|---------|
| BE-1 | Selector-based scraping'i daha dayanıklı hale getir - CSS yerine semantic selectors veya AI-based extraction | done | high |
| BE-2 | Detay sayfası ziyaretlerini paralel yap (Promise.all yerine controlled concurrency) | done | medium |
| BE-3 | Lazy loading scroll trigger'ı geliştir - Intersection Observer kullan | done | medium |
| BE-4 | AI extraction confidence düşükse coerced data yerine kesinlikle reddet ve tekrar dene | done | high |
| BE-5 | AI response JSON parse başarısız olursa prompt'u küçültüp tekrar dene mechanism'ı ekle | done | medium |
| BE-6 | Turkish month kısaltmalarını date parser'a ekle (Oca, Şub, Mar vs) | done | medium |
| BE-7 | '20 Mart - 31 Mart 2026' gibi yıl tekrarı olan date range'leri düzgün parse et | done | medium |
| BE-8 | Job scheduler maxConcurrentJobs'ı configüre edilebilir yap (env var) | done | low |
| BE-9 | Kalıcı hata sonrası dead letter queue ekle - 3 deneme sonrası failed tablosuna at | done | high |
| BE-10 | AI analysis job'larını batch processing'e geçir (tek tek yerine gruplama) | pending | low |
| BE-11 | Weekly report AI çıktısını doğrulama adımı ekle - schema validation + diff check | pending | medium |
| BE-12 | Exponential backoff max delay'i artır (15sn→60sn) ve rate limit detection ekle | done | medium |
| BE-13 | Adapter başarısızlıklarını daha detaylı logla - hangi selector, hangi alan eksik | done | medium |
| BE-14 | Sondüzluk adapter'ı düzelt - extractCards() selector'leri gerçek site yapısına uygunlaştırıldı | done | high |

## Tamamlanan Görevler

| ID | Başlık | Tamamlanma Tarihi |
|----|--------|-------------------|
| - | Sondüzluk adapter selector'leri düzeltildi | 2026-04-17 |
| BE-1 to BE-9, BE-12, BE-13 | Backend improvements implemented | 2026-04-17 |

---

## Geliştirme Kuralları

1. Her görev tamamlandığında bu dosyada durumu `pending` → `done` olarak güncellenir
2. Bloke olan görevler `blocked` olarak işaretlenir ve açıklama eklenir
3. Yeni görevlerbu dosyaya eklenir, eski görevler aşağıya taşınır
