import { z } from 'zod';
import { SiteId } from '../constants';
import { CampaignStatus, CampaignType } from './campaign';

export const WeeklyReportDTO = z.object({
  id: z.string(),
  weekStart: z.date(),
  weekEnd: z.date(),
  totalCampaigns: z.number(),
  newCampaigns: z.number(),
  expiredCampaigns: z.number(),
  sitesCovered: z.number(),
  topCategories: z.array(z.object({
    category: z.string(),
    count: z.number(),
  })),
  avgDuration: z.number().nullable(),
  coverage: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WeeklyReportDTO = z.infer<typeof WeeklyReportDTO>;

export const WeeklyReportSummaryDTO = z.object({
  weekStart: z.date(),
  weekEnd: z.date(),
  totalCampaigns: z.number(),
  newCampaigns: z.number(),
  expiredCampaigns: z.number(),
  activeCampaigns: z.number(),
  sitesCovered: z.number(),
  topCategories: z.array(z.object({
    category: z.string(),
    count: z.number(),
  })),
});

export type WeeklyReportSummaryDTO = z.infer<typeof WeeklyReportSummaryDTO>;

export const WeeklyReportListResponseDTO = z.object({
  reports: z.array(WeeklyReportDTO),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
