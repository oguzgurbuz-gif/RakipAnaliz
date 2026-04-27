/**
 * FE-4 — URL query paramı kısaltma katmanı.
 *
 * Sebep: shareable URL'lerin kısa kalması (linkler kısa, panoya kopya rahat).
 * Sözleşme:
 *  - Yeni URL'ler kısa form ile yazılır (`dm`, `ct`, `cat`).
 *  - Eski uzun form (`dateMode`, `campaignType`, `category`) okuma tarafında
 *    alias olarak kabul edilir → mevcut bookmark / paylaşılmış link kırılmaz.
 *  - Uygulama içi state ve API çağrıları hâlâ uzun form (canonical) kullanır;
 *    sadece tarayıcı URL'i kısaltılır.
 */

/** canonical (uzun) → URL'de yazılan kısa form. */
export const LONG_TO_SHORT: Record<string, string> = {
  dateMode: 'dm',
  campaignType: 'ct',
  // Filter state hem `campaignType` hem `campaign_type` (snake) kullanıyor;
  // ikisi de aynı kısa forma yazılır.
  campaign_type: 'ct',
  category: 'cat',
}

/**
 * Tersine arama: kısa → ilk gelen canonical. campaignType / campaign_type
 * aynı `ct` short'una düştüğü için Object.fromEntries son entry'yi yazar;
 * elle deterministik tablo veriyoruz.
 */
export const SHORT_TO_LONG: Record<string, string> = {
  dm: 'dateMode',
  // canonical olarak camelCase tercih ediyoruz; eski state'i okurken
  // her iki form için ayrı readParam çağrısı zaten alias kontrolü yapıyor.
  ct: 'campaignType',
  cat: 'category',
}

/** Verilen canonical key için URL'de kullanılacak param adını döner. */
export function toUrlKey(canonical: string): string {
  return LONG_TO_SHORT[canonical] ?? canonical
}

/** Verilen URL key'ini canonical key'e çevirir (kısa veya uzun fark etmez). */
export function fromUrlKey(urlKey: string): string {
  return SHORT_TO_LONG[urlKey] ?? urlKey
}

/**
 * Aynı kısa forma map'lenen tüm uzun adları döner — örn. `ct` için hem
 * `campaignType` hem `campaign_type` alias kabul edilir.
 */
function aliasesFor(canonical: string): string[] {
  const short = LONG_TO_SHORT[canonical]
  if (!short) return [canonical]
  const longs = Object.entries(LONG_TO_SHORT)
    .filter(([, s]) => s === short)
    .map(([l]) => l)
  return Array.from(new Set([canonical, ...longs]))
}

/**
 * Bir param'ı URLSearchParams'den oku — önce kısa formu, yoksa tüm uzun
 * alias'ları dener. Geriye dönük uyumluluk için kullanılır.
 */
export function readParam(
  params: URLSearchParams | null | undefined,
  canonical: string
): string {
  if (!params) return ''
  const short = LONG_TO_SHORT[canonical]
  if (short) {
    const v = params.get(short)
    if (v !== null && v !== '') return v
  }
  for (const alias of aliasesFor(canonical)) {
    const v = params.get(alias)
    if (v !== null && v !== '') return v
  }
  return ''
}

/**
 * Updates objesini URLSearchParams üzerine yazar — değerler boş/undefined
 * ise hem kısa hem uzun form temizlenir (eski param URL'de takılı kalmasın).
 */
export function writeParams(
  params: URLSearchParams,
  updates: Record<string, string | number | boolean | undefined | null>
): URLSearchParams {
  for (const [canonical, raw] of Object.entries(updates)) {
    const short = LONG_TO_SHORT[canonical]
    const writeKey = short ?? canonical
    const isEmpty = raw === undefined || raw === null || raw === '' || raw === 1
    if (isEmpty) {
      params.delete(writeKey)
      // Tüm eski uzun-form alias'larını da temizle.
      for (const alias of aliasesFor(canonical)) params.delete(alias)
    } else {
      params.set(writeKey, String(raw))
      // Kısa form yazıldıysa tüm uzun alias'ları temizle (tek kaynak).
      if (short) {
        for (const alias of aliasesFor(canonical)) {
          if (alias !== writeKey) params.delete(alias)
        }
      }
    }
  }
  return params
}
