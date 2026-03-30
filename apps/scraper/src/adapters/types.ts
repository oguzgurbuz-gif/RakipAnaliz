import { Page } from 'puppeteer';
import { RawCampaignCard, NormalizedCampaignInput, PaginationConfig } from '../types';

export interface SiteAdapter {
  readonly siteCode: string;
  readonly campaignsUrl: string;

  canHandle(url: string): boolean;

  extractCards(page: Page): Promise<RawCampaignCard[]>;

  normalize(card: RawCampaignCard): NormalizedCampaignInput;

  expandAll?(page: Page, expandButtonSelector: string, options?: {
    maxExpands?: number;
    delayMs?: number;
    retries?: number;
  }): Promise<number>;

  getPaginationConfig?(): PaginationConfig;

  getCampaignListingUrl?(): string;

  getCampaignSelectors?(): Record<string, string>;
}

export interface AdapterConstructor {
  new (...args: unknown[]): SiteAdapter;
}

export interface AdapterRegistry {
  register(adapter: SiteAdapter): void;
  unregister(siteCode: string): boolean;
  get(siteCode: string): SiteAdapter | undefined;
  getAll(): SiteAdapter[];
  canHandle(url: string): SiteAdapter | undefined;
}

export interface AdapterModule {
  siteCode: string;
  adapter: AdapterConstructor;
}

export type ExtractCardsFn = (page: Page) => Promise<RawCampaignCard[]>;
export type NormalizeFn = (card: RawCampaignCard) => NormalizedCampaignInput;
export type CanHandleFn = (url: string) => boolean;
