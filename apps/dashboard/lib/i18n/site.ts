/**
 * FE-2 — Site kodu → kullanıcı dostu görünen ad.
 *
 * Önemli: `batch-6c` ile hardcoded `SITE_FRIENDLY_NAMES` zaten kaldırılmıştı;
 * canonical kaynak `/api/sites` ve dolayısıyla DB'deki `sites.name` alanı.
 *
 * Bu dosya **fallback** sağlar — payload'da `name` gelmezse veya yalnız `code`
 * elimizde varsa Türkçe görünüm üretmek için minimal merkezi map. Yeni site
 * eklenirse önce DB tarafında `name` doğru girilmeli; map'e ekleme yapmak zorunda
 * değiliz, fakat hızlı UI okunaklığı için ilk üç site burada tutuluyor.
 */
export const SITE_DISPLAY_NAMES: Record<string, string> = {
  bitalih: 'Bitalih',
  nesine: 'Nesine',
  sonduzluk: 'Sondüzlük',
}

/**
 * Site görünen adını döndür. Önce API/DB'den gelen `name` tercih edilir;
 * verilmezse merkezi map; o da yoksa kodu Title Case'e çevirip göster.
 */
export function getSiteDisplayName(
  code: string | null | undefined,
  name?: string | null
): string {
  if (name && name.trim().length > 0) return name
  if (!code) return ''
  if (SITE_DISPLAY_NAMES[code]) return SITE_DISPLAY_NAMES[code]
  // Bilinmeyen kod — kullanıcıya en azından okunabilir bir hâl ver.
  return code.charAt(0).toUpperCase() + code.slice(1)
}
