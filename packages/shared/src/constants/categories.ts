export const CATEGORIES = {
  SPORTS: 'sports',
  HORSE_RACING: 'horse_racing',
  CASINO: 'casino',
  POKER: 'poker',
  LOTTERY: 'lottery',
  OTHER: 'other',
} as const;

export type Category = typeof CATEGORIES[keyof typeof CATEGORIES];

export const CATEGORY_LABELS: Record<Category, string> = {
  [CATEGORIES.SPORTS]: 'Sports Betting',
  [CATEGORIES.HORSE_RACING]: 'Horse Racing',
  [CATEGORIES.CASINO]: 'Casino',
  [CATEGORIES.POKER]: 'Poker',
  [CATEGORIES.LOTTERY]: 'Lottery',
  [CATEGORIES.OTHER]: 'Other',
};

export const CATEGORY_ICONS: Record<Category, string> = {
  [CATEGORIES.SPORTS]: '🏆',
  [CATEGORIES.HORSE_RACING]: '🏇',
  [CATEGORIES.CASINO]: '🎰',
  [CATEGORIES.POKER]: '🃏',
  [CATEGORIES.LOTTERY]: '🎱',
  [CATEGORIES.OTHER]: '📋',
};
