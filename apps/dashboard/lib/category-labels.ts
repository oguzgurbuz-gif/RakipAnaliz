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

export function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'Bilinmiyor'
  return CATEGORY_LABELS[category] ?? category
}

export function isGenericCategory(category: string | null | undefined): boolean {
  if (!category) return true
  return GENERIC_CATEGORY_CODES.has(category)
}
