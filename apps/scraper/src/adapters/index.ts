import { SiteAdapter } from './types';
import { ForNalaAdapter } from './4nala';
import { AltiliGanyanAdapter } from './altiliganyan';
import { AtYarisiAdapter } from './atyarisi';
import { BilyonerAdapter } from './bilyoner';
import { BirebinAdapter } from './birebin';
import { EkuriAdapter } from './ekuri';
import { HipodromAdapter } from './hipodrom';
import { MisliAdapter } from './misli';
import { NesineAdapter } from './nesine';
import { OleyAdapter } from './oley';
import { SonDuzlukAdapter } from './sonduzluk';
import { BitalihAdapter } from './bitalih';
import { logger } from '../utils/logger';

export class AdapterRegistry {
  private adapters: Map<string, SiteAdapter> = new Map();

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters(): void {
    const defaultAdapters: SiteAdapter[] = [
      new ForNalaAdapter(),
      new AltiliGanyanAdapter(),
      new AtYarisiAdapter(),
      new BilyonerAdapter(),
      new BirebinAdapter(),
      new EkuriAdapter(),
      new HipodromAdapter(),
      new MisliAdapter(),
      new NesineAdapter(),
      new OleyAdapter(),
      new SonDuzlukAdapter(),
      new BitalihAdapter(),
    ];

    for (const adapter of defaultAdapters) {
      this.register(adapter);
    }

    logger.info(`Registered ${this.adapters.size} site adapters`);
  }

  register(adapter: SiteAdapter): void {
    if (this.adapters.has(adapter.siteCode)) {
      logger.warn(`Overwriting existing adapter for site: ${adapter.siteCode}`);
    }
    this.adapters.set(adapter.siteCode, adapter);
    logger.debug(`Registered adapter for site: ${adapter.siteCode}`);
  }

  unregister(siteCode: string): boolean {
    const result = this.adapters.delete(siteCode);
    if (result) {
      logger.debug(`Unregistered adapter for site: ${siteCode}`);
    }
    return result;
  }

  get(siteCode: string): SiteAdapter | undefined {
    return this.adapters.get(siteCode);
  }

  getAll(): SiteAdapter[] {
    return Array.from(this.adapters.values());
  }

  getSiteCodes(): string[] {
    return Array.from(this.adapters.keys());
  }

  canHandle(url: string): SiteAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(url)) {
        return adapter;
      }
    }
    return undefined;
  }

  hasAdapter(siteCode: string): boolean {
    return this.adapters.has(siteCode);
  }

  getAdapterCount(): number {
    return this.adapters.size;
  }
}

export const adapterRegistry = new AdapterRegistry();

export {
  ForNalaAdapter,
  AltiliGanyanAdapter,
  AtYarisiAdapter,
  BilyonerAdapter,
  BirebinAdapter,
  EkuriAdapter,
  HipodromAdapter,
  MisliAdapter,
  NesineAdapter,
  OleyAdapter,
  SonDuzlukAdapter,
  BitalihAdapter,
  SiteAdapter,
};
