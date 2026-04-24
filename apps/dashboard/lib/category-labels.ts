const CATEGORY_LABELS: Record<string, string> = {
  'hoş-geldin-bonusu': 'Hoş Geldin Bonusu',
  'depozit-bonusu': 'Depozit Bonusu',
  'freebet': 'Freebet',
  'cashback': 'Cashback',
  'oran-artışı': 'Oran Artışı',
  'yüksek-oran': 'Yüksek Oran',
  'çekiliş-lottery': 'Çekiliş / Lottery',
  'spending-reward': 'Harcama Ödülü',
  'ek-kazanç': 'Ek Kazanç',
  'sadakat-vip': 'Sadakat / VIP',
  'turnuva-yarışma': 'Turnuva / Yarışma',
  'spesifik-oyun': 'Spesifik Oyun',
  'spesifik-bahis': 'Spesifik Bahis',
  'genel-promosyon': 'Genel Promosyon',
  'spor-bonus': 'Spor Bonusu',
  'casino-bonus': 'Casino Bonusu',
  'slot-bonus': 'Slot Bonusu',
  'diğer': 'Diğer',
  'unknown': 'Bilinmiyor',
}

const GENERIC_CATEGORY_CODES = new Set([
  'unknown',
  'diğer',
  'genel-promosyon',
])

/**
 * Bilinmeyen bir kategori kodunu insan-okur bir başlığa çevirir
 * (`free_spins` → `Free Spins`, `slot-bonus` → `Slot Bonus`). Backend
 * yeni bir kategori eklediğinde mapping güncellenmeden önce bile UI
 * boş "Bilinmiyor" yerine anlamlı bir şey gösterir.
 */
function humanizeCategoryCode(code: string): string {
  return code
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('tr') + word.slice(1).toLocaleLowerCase('tr'))
    .join(' ')
}

export function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'Bilinmiyor'
  return CATEGORY_LABELS[category] ?? humanizeCategoryCode(category)
}

export function isGenericCategory(category: string | null | undefined): boolean {
  if (!category) return true
  return GENERIC_CATEGORY_CODES.has(category)
}
