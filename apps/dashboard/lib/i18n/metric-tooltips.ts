/**
 * FE-9 — Yüzde / oran metrikleri için "neyin yüzdesi" açıklama tooltip'leri.
 *
 * Dashboard'daki her % değerinin yanında bir context tooltip beklenir
 * (kullanıcı ham %23'e bakıp "neye göre" diye sormamalı). Anahtar isimleri
 * widget tarafından kararlaştırılır; eksik anahtar fallback olarak ham label
 * döner.
 *
 * Tooltip'i render eden taraflar `metricTooltip(key)` ile string al; Radix
 * Tooltip varsa onu, yoksa native `title` attribute fallback'ini kullan.
 */
export const METRIC_TOOLTIPS: Record<string, string> = {
  // ShareOfVoice / Pazar Hakimiyeti
  'leader_share.campaigns':
    'Toplam aktif kampanyaların ne kadarı pazar liderine ait (en yüksek hacimli site).',
  'leader_share.bonus':
    'Toplam bonus tutarının ne kadarı pazar liderine ait (en yüksek toplam bonus tutarına sahip site).',

  // Site kartı / tablosu — site bazlı oranlar
  'site.active_rate':
    'Sitenin tüm kampanyalarına oranla şu an aktif olanların payı. Eski/sona ermiş kampanyalar paydaya dahildir.',

  // CompetitionGrid -> momentum_score
  'site.momentum_score':
    'Bu hafta ile geçen hafta arasındaki kampanya hacim değişimi (yüzde). Pozitif = artış, negatif = düşüş.',

  // CompetitionGrid -> stance_velocity_delta
  'site.stance_velocity_delta':
    'Atak/defans skorunun son periyottaki yön değişimi. Pozitif değer agresifleşmeyi, negatif defansa geçmeyi işaret eder.',

  // Bonus oranları — kampanya kartı
  'campaign.bonus_percentage':
    'Yatırım tutarına bonus oranı. Örn. %50 → 100 TL yatıran 50 TL bonus alır (üst limit varsa kart üstünde belirtilir).',

  // Insights bonus index
  'bonus_index.yoy_delta':
    'Geçen yılın aynı haftasına göre median bonus tutarındaki yüzde değişim. Sezonsallık etkisini düzeltmek için kullan.',

  // Win/Loss tracker
  'winloss.bitalih_rank_change':
    'Bitalih\'in bu metrikte geçen haftaya göre sıralama değişimi. Düşük sayı daha iyidir.',

  // Hero stats
  'hero.weekly_diff_campaigns':
    'Bu haftaki aktif kampanya hacminin geçen haftaya göre yüzde değişimi. Negatif değer sektör çapında daralma anlamına gelebilir.',
}

/**
 * `key` map'te yoksa fallback olarak label'ı kendi açıklaması yap (kullanıcıya
 * tooltip yine gözükür ama yalnız label tekrarı). Üretim'de tüm anahtarlar
 * map'te olmalı; bu fallback dev-time'a karşı koruma.
 */
export function metricTooltip(key: string, fallback?: string): string {
  return METRIC_TOOLTIPS[key] ?? fallback ?? key
}
