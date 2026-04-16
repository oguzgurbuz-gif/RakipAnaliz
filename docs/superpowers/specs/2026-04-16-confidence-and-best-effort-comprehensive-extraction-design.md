# Confidence Normalization & Best-Effort Extraction

## Context
Coolify logs show two recurring issues during the scraper bootstrap and AI jobs:
1. `Out of range value for column 'valid_from_confidence'` in MySQL.
2. `Comprehensive extraction failed ... AI response schema mismatch` which causes the comprehensive extraction step to be dropped.

## Goals
1. Store confidence values as `0..1` (as requested) in all DB columns with `DECIMAL(5,4)`-like confidence types.
2. Keep “best effort” behavior: if JSON is parsable but the shape is slightly off, coerce and persist partial data instead of dropping the whole extraction.

## Non-Goals
1. We do not change the DB schema.
2. We do not change the overall scraping/AI job scheduling flow.

## Design
### 1) Confidence normalization to `0..1`
Add a shared helper `normalizeConfidence01(value)`:
- If `value` is `null/undefined` or not a finite number -> return `null` (or a safe default in callers).
- If `value` is in `0..1` -> keep it.
- If `value` is in `1..100` -> treat as percent and convert via `value / 100`.
- Clamp final result to `[0, 1]`.
- Round to 4 decimals to match `DECIMAL(5,4)` expectations.

Apply the helper in:
- `applyAiExtractedDates()` before writing `valid_from_confidence` / `valid_to_confidence`.
- Comprehensive extraction date-confidence paths when forwarding into DB writes (extra safety).

### 2) Best-effort salvage for comprehensive extraction
In `apps/scraper/src/ai/comprehensive-extraction.ts`:
- Keep strict failure when JSON parsing fails entirely.
- If JSON parse succeeds but schema validation fails:
  - Coerce fields into the expected structure (strings -> safe defaults, arrays -> `[]`, numbers -> `null` if missing).
  - Normalize + clamp confidence fields using `normalizeConfidence01`.
  - Populate required fields with safe defaults.
  - Return `success: true` with the coerced data so the pipeline can persist partial results.

## Error Handling
- If coercion cannot produce any usable critical fields, return `success: false` (and keep existing logging).
- Never throw on coercion; best-effort should be resilient.

## Testing Plan
1. `pnpm -r typecheck`.
2. Run scraper smoke tests against a running MySQL container (or ensure `DATABASE_URL` is set).
3. Re-check Coolify-like logs for:
   - absence of `valid_from_confidence out of range`.
   - reduction in `schema mismatch` drops (fewer comprehensive extraction failures).

