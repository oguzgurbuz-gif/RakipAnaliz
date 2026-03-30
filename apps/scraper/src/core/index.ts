export { ScrapeManager, scrapeManager } from './scraper';
export { 
  findExistingCampaign, 
  computeCampaignDiff, 
  determineChangeType,
  shouldCreateNewVersion,
  generateFingerprint,
  processDedupLogic,
  mergeVisibilityChanges,
  isSignificantChange,
  DedupResult,
} from './dedup';
