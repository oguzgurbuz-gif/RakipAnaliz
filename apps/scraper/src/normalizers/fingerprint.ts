import { createHash } from 'crypto';
import { logger } from '../utils/logger';

export interface FingerprintComponents {
  siteCode: string;
  title: string;
  bonusType: string | null;
  bonusAmount: number | null;
  bonusPercentage: number | null;
  minDeposit: number | null;
  code: string | null;
  category: string | null;
}

export function buildFingerprint(components: FingerprintComponents): string {
  const normalized = {
    siteCode: components.siteCode.toLowerCase().trim(),
    title: components.title.toLowerCase().trim().replace(/\s+/g, ' '),
    bonusType: components.bonusType?.toLowerCase().trim() ?? '',
    bonusAmount: components.bonusAmount ?? 0,
    bonusPercentage: components.bonusPercentage ?? 0,
    minDeposit: components.minDeposit ?? 0,
    code: components.code?.toLowerCase().trim() ?? '',
    category: components.category?.toLowerCase().trim() ?? '',
  };

  const fingerprintString = [
    normalized.siteCode,
    normalized.title,
    normalized.bonusType,
    normalized.bonusAmount.toString(),
    normalized.bonusPercentage.toString(),
    normalized.minDeposit.toString(),
    normalized.code,
    normalized.category,
  ].join('|');

  try {
    return createHash('sha256').update(fingerprintString, 'utf8').digest('hex');
  } catch (error) {
    logger.error('Failed to generate fingerprint', { error, components });
    const fallback = createHash('md5').update(fingerprintString, 'utf8').digest('hex');
    return fallback;
  }
}

export function buildRawFingerprint(campaign: {
  siteCode: string;
  rawId: string;
  title: string;
  url: string;
}): string {
  const input = [
    campaign.siteCode,
    campaign.rawId,
    campaign.title,
    campaign.url,
  ].join('|');

  try {
    return createHash('sha256').update(input, 'utf8').digest('hex');
  } catch {
    return createHash('md5').update(input, 'utf8').digest('hex');
  }
}

export function extractFingerprintComponents(campaign: {
  siteCode: string;
  title: string;
  bonusType?: string | null;
  bonusAmount?: string | number | null;
  bonusPercentage?: string | number | null;
  minDeposit?: string | number | null;
  code?: string | null;
  category?: string | null;
}): FingerprintComponents {
  let parsedBonusAmount: number | null = null;
  if (campaign.bonusAmount !== undefined && campaign.bonusAmount !== null) {
    if (typeof campaign.bonusAmount === 'number') {
      parsedBonusAmount = campaign.bonusAmount;
    } else {
      const cleaned = String(campaign.bonusAmount).replace(/[^\d.]/g, '');
      parsedBonusAmount = parseFloat(cleaned) || null;
    }
  }

  let parsedBonusPercentage: number | null = null;
  if (campaign.bonusPercentage !== undefined && campaign.bonusPercentage !== null) {
    if (typeof campaign.bonusPercentage === 'number') {
      parsedBonusPercentage = campaign.bonusPercentage;
    } else {
      const cleaned = String(campaign.bonusPercentage).replace(/[^\d.]/g, '');
      parsedBonusPercentage = parseFloat(cleaned) || null;
    }
  }

  let parsedMinDeposit: number | null = null;
  if (campaign.minDeposit !== undefined && campaign.minDeposit !== null) {
    if (typeof campaign.minDeposit === 'number') {
      parsedMinDeposit = campaign.minDeposit;
    } else {
      const cleaned = String(campaign.minDeposit).replace(/[^\d.]/g, '');
      parsedMinDeposit = parseFloat(cleaned) || null;
    }
  }

  return {
    siteCode: campaign.siteCode,
    title: campaign.title,
    bonusType: campaign.bonusType ?? null,
    bonusAmount: parsedBonusAmount,
    bonusPercentage: parsedBonusPercentage,
    minDeposit: parsedMinDeposit,
    code: campaign.code ?? null,
    category: campaign.category ?? null,
  };
}

export function areFingerprintsEqual(fp1: string, fp2: string): boolean {
  if (fp1.length !== fp2.length) {
    return false;
  }
  return fp1.localeCompare(fp2, undefined, { sensitivity: 'base' }) === 0;
}
