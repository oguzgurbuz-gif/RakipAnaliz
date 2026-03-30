export const SITES = {
  FOURNALA: '4nala',
  ALTILIGANYAN: 'altiliganyan',
  ATYARISI: 'atyarisi',
  BILYONER: 'bilyoner',
  BIREBIN: 'birebin',
  EKURI: 'ekuri',
  HIPODROM: 'hipodrom',
  MISLI: 'misli',
  NESINE: 'nesine',
  OLEY: 'oley',
  SONDZULYUK: 'sondzulyuk',
} as const;

export type SiteId = typeof SITES[keyof typeof SITES];

export interface SiteInfo {
  id: SiteId;
  name: string;
  baseUrl: string;
  enabled: boolean;
  category: string;
}

export const SITE_CONFIG: Record<SiteId, SiteInfo> = {
  [SITES.FOURNALA]: {
    id: SITES.FOURNALA,
    name: '4nala',
    baseUrl: process.env.FOURNALA_BASE_URL || 'https://www.4nala.com',
    enabled: true,
    category: 'sports',
  },
  [SITES.ALTILIGANYAN]: {
    id: SITES.ALTILIGANYAN,
    name: 'Altiliganyan',
    baseUrl: process.env.ALTILIGANYAN_BASE_URL || 'https://www.altiliganyan.com',
    enabled: true,
    category: 'sports',
  },
  [SITES.ATYARISI]: {
    id: SITES.ATYARISI,
    name: 'Atyarisi',
    baseUrl: process.env.ATYARISI_BASE_URL || 'https://www.atyarisi.com',
    enabled: true,
    category: 'horse_racing',
  },
  [SITES.BILYONER]: {
    id: SITES.BILYONER,
    name: 'Bilyoner',
    baseUrl: process.env.BILYONER_BASE_URL || 'https://www.bilyoner.com',
    enabled: true,
    category: 'sports',
  },
  [SITES.BIREBIN]: {
    id: SITES.BIREBIN,
    name: 'Birebin',
    baseUrl: process.env.BIREBIN_BASE_URL || 'https://www.birebin.com',
    enabled: true,
    category: 'sports',
  },
  [SITES.EKURI]: {
    id: SITES.EKURI,
    name: 'Ekuri',
    baseUrl: process.env.EKURI_BASE_URL || 'https://www.ekuri.com',
    enabled: true,
    category: 'sports',
  },
  [SITES.HIPODROM]: {
    id: SITES.HIPODROM,
    name: 'Hipodrom',
    baseUrl: process.env.HIPODROM_BASE_URL || 'https://www.hipodrom.com',
    enabled: true,
    category: 'horse_racing',
  },
  [SITES.MISLI]: {
    id: SITES.MISLI,
    name: 'Misli',
    baseUrl: process.env.MISLI_BASE_URL || 'https://www.misli.com',
    enabled: true,
    category: 'sports',
  },
  [SITES.NESINE]: {
    id: SITES.NESINE,
    name: 'Nesine',
    baseUrl: process.env.NESINE_BASE_URL || 'https://www.nesine.com',
    enabled: true,
    category: 'sports',
  },
  [SITES.OLEY]: {
    id: SITES.OLEY,
    name: 'Oley',
    baseUrl: process.env.OLEY_BASE_URL || 'https://www.oley.com',
    enabled: true,
    category: 'sports',
  },
  [SITES.SONDZULYUK]: {
    id: SITES.SONDZULYUK,
    name: 'Sondzulyuk',
    baseUrl: process.env.SONDZULYUK_BASE_URL || 'https://www.sondzulyuk.com',
    enabled: true,
    category: 'sports',
  },
};

export const SCRAPER_USER_AGENT = process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (compatible; BitalihBot/1.0)';
export const SCRAPER_TIMEOUT_MS = parseInt(process.env.SCRAPER_TIMEOUT_MS || '30000', 10);
export const SCRAPER_RETRY_ATTEMPTS = parseInt(process.env.SCRAPER_RETRY_ATTEMPTS || '3', 10);
export const SCRAPER_CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY || '3', 10);
