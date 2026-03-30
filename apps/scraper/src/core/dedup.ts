import { NormalizedCampaignInput, Campaign, CampaignDiff, CampaignVersion } from '../types';
import { buildFingerprint, FingerprintComponents, extractFingerprintComponents } from '../normalizers/fingerprint';
import { logger } from '../utils/logger';

export function findExistingCampaign(
  fingerprint: string,
  existingCampaigns: Map<string, Campaign>
): Campaign | undefined {
  return existingCampaigns.get(fingerprint);
}

export function computeCampaignDiff(
  current: NormalizedCampaignInput,
  previous: CampaignVersion
): CampaignDiff | null {
  const changedFields: string[] = [];
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  const fieldsToCompare: Array<keyof NormalizedCampaignInput> = [
    'title',
    'description',
    'bonusType',
    'bonusAmount',
    'bonusPercentage',
    'minDeposit',
    'maxBonus',
    'code',
    'url',
    'imageUrl',
    'startDate',
    'endDate',
    'termsUrl',
    'category',
    'isFeatured',
    'isExclusive',
  ];

  for (const field of fieldsToCompare) {
    const currentValue = current[field];
    const previousValue = previous[field as keyof CampaignVersion];

    const currentSerialized = serializeValue(currentValue);
    const previousSerialized = serializeValue(previousValue);

    if (currentSerialized !== previousSerialized) {
      changedFields.push(field);
      previousValues[field] = previousValue;
      newValues[field] = currentValue;
    }
  }

  if (changedFields.length === 0) {
    return null;
  }

  return {
    changedFields,
    previousValues,
    newValues,
  };
}

export function determineChangeType(
  campaign: Campaign | null,
  diff: CampaignDiff | null
): 'created' | 'updated' | 'reactivated' | 'expired' | 'removed' {
  if (!campaign) {
    return 'created';
  }

  if (!diff) {
    return 'updated';
  }

  if (campaign.status === 'expired' && !diff.newValues['endDate']) {
    return 'reactivated';
  }

  if (diff.changedFields.includes('endDate')) {
    const newEndDate = diff.newValues['endDate'] as Date | null;
    if (newEndDate && newEndDate < new Date()) {
      return 'expired';
    }
  }

  return 'updated';
}

export function shouldCreateNewVersion(
  diff: CampaignDiff | null,
  versionCount: number,
  maxVersionsPerCampaign: number = 100
): boolean {
  if (!diff) {
    return false;
  }

  if (diff.changedFields.length === 0) {
    return false;
  }

  if (versionCount >= maxVersionsPerCampaign) {
    logger.warn('Max versions reached for campaign, skipping new version', {
      versionCount,
      maxVersions: maxVersionsPerCampaign,
    });
    return false;
  }

  return true;
}

export function generateFingerprint(
  siteCode: string,
  campaign: NormalizedCampaignInput
): string {
  const components: FingerprintComponents = extractFingerprintComponents({
    siteCode,
    title: campaign.title,
    bonusType: campaign.bonusType,
    bonusAmount: campaign.bonusAmount,
    bonusPercentage: campaign.bonusPercentage,
    minDeposit: campaign.minDeposit,
    code: campaign.code,
    category: campaign.category,
  });

  return buildFingerprint(components);
}

export interface DedupResult {
  action: 'create' | 'update' | 'skip' | 'ignore';
  campaign: Campaign | null;
  version: CampaignVersion | null;
  diff: CampaignDiff | null;
  changeType: 'created' | 'updated' | 'reactivated' | 'expired' | 'removed';
  reason: string;
}

export function processDedupLogic(
  normalized: NormalizedCampaignInput,
  existingCampaign: Campaign | null,
  existingVersion: CampaignVersion | null
): DedupResult {
  if (!existingCampaign) {
    return {
      action: 'create',
      campaign: null,
      version: null,
      diff: null,
      changeType: 'created',
      reason: 'New campaign not found in existing records',
    };
  }

  if (existingVersion) {
    const diff = computeCampaignDiff(normalized, existingVersion);

    if (!diff) {
      return {
        action: 'skip',
        campaign: existingCampaign,
        version: existingVersion,
        diff: null,
        changeType: 'updated',
        reason: 'No changes detected from previous version',
      };
    }

    const changeType = determineChangeType(existingCampaign, diff);
    const shouldUpdate = shouldCreateNewVersion(diff, existingCampaign.versionCount);

    if (!shouldUpdate) {
      return {
        action: 'ignore',
        campaign: existingCampaign,
        version: existingVersion,
        diff,
        changeType,
        reason: 'Update threshold not met or max versions reached',
      };
    }

    return {
      action: 'update',
      campaign: existingCampaign,
      version: existingVersion,
      diff,
      changeType,
      reason: 'Changes detected, creating new version',
    };
  }

  return {
    action: 'update',
    campaign: existingCampaign,
    version: null,
    diff: null,
    changeType: 'updated',
    reason: 'No existing version to compare, will create initial version',
  };
}

function serializeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

export function mergeVisibilityChanges(
  currentVisibility: 'visible' | 'hidden' | 'expired' | 'pending',
  previousVisibility: 'visible' | 'hidden' | 'expired' | 'pending'
): 'visible' | 'hidden' | 'expired' | 'pending' {
  if (currentVisibility === 'hidden' || previousVisibility === 'hidden') {
    return 'hidden';
  }

  if (currentVisibility === 'expired' || previousVisibility === 'expired') {
    return 'expired';
  }

  if (currentVisibility === 'pending' || previousVisibility === 'pending') {
    return 'pending';
  }

  return 'visible';
}

export function isSignificantChange(diff: CampaignDiff): boolean {
  const significantFields = [
    'title',
    'bonusAmount',
    'bonusPercentage',
    'minDeposit',
    'maxBonus',
    'code',
    'endDate',
    'startDate',
  ];

  return diff.changedFields.some((field) => significantFields.includes(field));
}
