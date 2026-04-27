/**
 * BE-11 — Weekly report AI output schemas.
 *
 * Two distinct AI outputs feed weekly_reports:
 *   1. Job-based (`apps/scraper/src/jobs/weekly-report.ts`): short
 *      executive summary + risks[] + recommendations[].
 *   2. Interactive (`apps/dashboard/app/api/reports/auto-analysis`):
 *      6-section Turkish prose used by the dashboard's weekly tab.
 *
 * Both are validated through the schemas below. Validation failure must
 * NOT corrupt the stored row — callers fall back to leaving AI fields
 * untouched and push the original payload to the BE-9 dead letter queue
 * (`failed_jobs`) for retry.
 *
 * Lives in `@bitalih/shared` so both the scraper job and the Next.js
 * route can import the same Zod shape without cross-app relative imports.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1) Executive summary (job-based weekly report)
// ---------------------------------------------------------------------------

const trimmedString = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, 'must not be empty'));

const trimmedStringArray = z
  .array(z.string())
  .transform((arr) => arr.map((s) => s.trim()).filter((s) => s.length > 0));

const optionalConfidence = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const n = typeof v === 'number' ? v : Number.parseFloat(v);
    if (!Number.isFinite(n)) return undefined;
    // Accept 0..1 or 0..100 input scales and clamp to [0, 1].
    const scaled = n > 1 ? n / 100 : n;
    return Math.max(0, Math.min(1, scaled));
  });

export const executiveSummarySchema = z.object({
  executive_summary: trimmedString,
  risks: trimmedStringArray.refine((arr) => arr.length > 0, {
    message: 'risks must contain at least one item',
  }),
  recommendations: trimmedStringArray.refine((arr) => arr.length > 0, {
    message: 'recommendations must contain at least one item',
  }),
  // Optional 0..1 self-reported confidence used by diff-check to detect
  // sudden regressions in AI quality. Many providers omit it, so it's
  // optional and defaults to undefined when absent (no penalty for legacy
  // outputs).
  confidence: optionalConfidence,
});

export type ExecutiveSummary = z.infer<typeof executiveSummarySchema>;

// ---------------------------------------------------------------------------
// 2) Auto-analysis (interactive weekly tab)
// ---------------------------------------------------------------------------

export const autoAnalysisSectionsSchema = z.object({
  summary: trimmedString,
  topMovers: trimmedString,
  bonusInsights: trimmedString,
  categoryInsights: trimmedString,
  riskFlags: trimmedString,
  recommendations: trimmedString,
  confidence: optionalConfidence,
});

export type AutoAnalysisSections = z.infer<typeof autoAnalysisSectionsSchema>;

// ---------------------------------------------------------------------------
// Robust parsing helpers
// ---------------------------------------------------------------------------

/**
 * Strip code-block fences ("```json ... ```") that some providers prepend
 * even in JSON mode, then `JSON.parse` defensively.
 */
export function safeJsonParse(raw: string | null | undefined): unknown {
  if (!raw) return null;
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface ValidationOk<T> {
  ok: true;
  data: T;
}

export interface ValidationErr {
  ok: false;
  reason: string;
  issues: Array<{ path: string; message: string }>;
  raw: string | null;
}

export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

function summarizeZodError(error: z.ZodError): {
  reason: string;
  issues: Array<{ path: string; message: string }>;
} {
  const issues = error.errors.map((e) => ({
    path: e.path.join('.') || '(root)',
    message: e.message,
  }));
  const reason = issues
    .slice(0, 3)
    .map((i) => `${i.path}: ${i.message}`)
    .join('; ');
  return { reason, issues };
}

export function validateExecutiveSummary(
  raw: string | null | undefined
): ValidationResult<ExecutiveSummary> {
  const parsed = safeJsonParse(raw);
  if (parsed === null) {
    return {
      ok: false,
      reason: 'AI yanıtı geçerli JSON değil.',
      issues: [{ path: '(root)', message: 'invalid json' }],
      raw: typeof raw === 'string' ? raw.substring(0, 500) : null,
    };
  }
  const result = executiveSummarySchema.safeParse(parsed);
  if (!result.success) {
    const summarized = summarizeZodError(result.error);
    return {
      ok: false,
      reason: summarized.reason || 'schema validation failed',
      issues: summarized.issues,
      raw: typeof raw === 'string' ? raw.substring(0, 500) : null,
    };
  }
  return { ok: true, data: result.data };
}

export function validateAutoAnalysis(
  raw: string | null | undefined
): ValidationResult<AutoAnalysisSections> {
  const parsed = safeJsonParse(raw);
  if (parsed === null) {
    return {
      ok: false,
      reason: 'AI yanıtı geçerli JSON değil.',
      issues: [{ path: '(root)', message: 'invalid json' }],
      raw: typeof raw === 'string' ? raw.substring(0, 500) : null,
    };
  }
  const result = autoAnalysisSectionsSchema.safeParse(parsed);
  if (!result.success) {
    const summarized = summarizeZodError(result.error);
    return {
      ok: false,
      reason: summarized.reason || 'schema validation failed',
      issues: summarized.issues,
      raw: typeof raw === 'string' ? raw.substring(0, 500) : null,
    };
  }
  return { ok: true, data: result.data };
}
