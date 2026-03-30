import { z } from 'zod';
import { campaignCreateSchema, campaignUpdateSchema, paginationSchema, campaignQuerySchema, idParamSchema } from '../schemas';

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Validation failed: ${errors}`);
  }
  return result.data;
}

export { campaignCreateSchema, campaignUpdateSchema, paginationSchema, campaignQuerySchema, idParamSchema };
export type { PaginationInput, CampaignQueryInput } from '../schemas';
