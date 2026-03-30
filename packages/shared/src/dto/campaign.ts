import { z } from 'zod';
import { SiteId } from '../constants';

export const CampaignStatus = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  PENDING: 'pending',
  INVALID: 'invalid',
} as const;

export type CampaignStatus = typeof CampaignStatus[keyof typeof CampaignStatus];

export const CampaignType = {
  FREE: 'free',
  DEPOSIT: 'deposit',
  FIRST_DEPOSIT: 'first_deposit',
  RELOAD: 'reload',
  CASHBACK: 'cashback',
  FREEBET: 'freebet',
  OTHER: 'other',
} as const;

export type CampaignType = typeof CampaignType[keyof typeof CampaignType];

export const CampaignDTO = z.object({
  id: z.string(),
  siteId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  status: z.string(),
  url: z.string().url(),
  bonusAmount: z.number().nullable(),
  bonusPercentage: z.number().nullable(),
  minDeposit: z.number().nullable(),
  maxBonus: z.number().nullable(),
  turnoverRequirement: z.number().nullable(),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
  extractedDate: z.date().nullable(),
  dateConfidence: z.number().nullable(),
  imageUrl: z.string().url().nullable(),
  fingerprint: z.string(),
  metadata: z.record(z.any()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CampaignDTO = z.infer<typeof CampaignDTO>;

export const CampaignCreateDTO = z.object({
  siteId: z.string(),
  title: z.string().min(1).max(500),
  description: z.string().nullable(),
  type: z.string(),
  url: z.string().url(),
  bonusAmount: z.number().nullable(),
  bonusPercentage: z.number().nullable(),
  minDeposit: z.number().nullable(),
  maxBonus: z.number().nullable(),
  turnoverRequirement: z.number().nullable(),
  startDate: z.date().nullable(),
  endDate: z.date().nullable(),
  imageUrl: z.string().url().nullable(),
  metadata: z.record(z.any()).nullable(),
});

export type CampaignCreateDTO = z.infer<typeof CampaignCreateDTO>;

export const CampaignUpdateDTO = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  url: z.string().url().optional(),
  bonusAmount: z.number().nullable().optional(),
  bonusPercentage: z.number().nullable().optional(),
  minDeposit: z.number().nullable().optional(),
  maxBonus: z.number().nullable().optional(),
  turnoverRequirement: z.number().nullable().optional(),
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  metadata: z.record(z.any()).nullable().optional(),
});

export type CampaignUpdateDTO = z.infer<typeof CampaignUpdateDTO>;

export const CampaignNoteDTO = z.object({
  id: z.string(),
  campaignId: z.string(),
  content: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CampaignNoteDTO = z.infer<typeof CampaignNoteDTO>;

export const CampaignListResponseDTO = z.object({
  campaigns: z.array(CampaignDTO),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export type CampaignListResponseDTO = z.infer<typeof CampaignListResponseDTO>;

export const SimilarCampaignDTO = z.object({
  campaignId: z.string(),
  siteId: z.string(),
  siteName: z.string(),
  title: z.string(),
  similarity: z.number(),
  url: z.string().url(),
});

export type SimilarCampaignDTO = z.infer<typeof SimilarCampaignDTO>;
