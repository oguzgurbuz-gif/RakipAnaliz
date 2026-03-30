import { z } from 'zod';

export const campaignCreateSchema = z.object({
  siteId: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  type: z.string(),
  url: z.string().url(),
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

export const campaignUpdateSchema = z.object({
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

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const campaignQuerySchema = paginationSchema.extend({
  siteId: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type CampaignQueryInput = z.infer<typeof campaignQuerySchema>;
