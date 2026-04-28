/**
 * Marketing pipeline — FX conversion helper.
 *
 * Centralizes the lookup against `fx_rates` rows so every caller (Supermetrics
 * normalize step, snapshot aggregator, dashboard hover tooltip) interprets
 * "currently effective rate" identically.
 *
 * The DB unique key is (from_currency, to_currency, effective_from) and the
 * tail of the chain has effective_to=NULL. We pick the row whose
 * effective_from <= asOf <= COALESCE(effective_to, asOf). When several rows
 * qualify (shouldn't happen, defensive) we prefer the most recent
 * effective_from.
 */

import type { FxRate } from './types';

/** Default reference date is "today" in ISO. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Find the FxRate row that is effective for the given asOf date (default
 * today). Returns null when no matching pair / window exists.
 */
export function getCurrentFxRate(
  from: string,
  to: string,
  fxRates: readonly FxRate[],
  asOf?: string
): FxRate | null {
  const reference = (asOf ?? todayIso()).slice(0, 10);
  const fromU = from.toUpperCase();
  const toU = to.toUpperCase();

  const candidates = fxRates.filter((rate) => {
    if (rate.from_currency.toUpperCase() !== fromU) return false;
    if (rate.to_currency.toUpperCase() !== toU) return false;
    if (rate.effective_from > reference) return false;
    if (rate.effective_to !== null && rate.effective_to < reference) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  // Defensive: most recent effective_from wins (newest config takes priority
  // if multiple rows accidentally overlap).
  candidates.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  return candidates[0]!;
}

/**
 * Convert an amount from `from` to `to` using the given fxRates table.
 *
 * Special cases:
 *   - from === to: returned unchanged (no rate lookup needed).
 *   - amount === 0: returns 0 even if no matching rate (so spend-free rows
 *     don't trip the missing-rate guard).
 *   - no matching rate: throws — callers must surface the gap to the audit
 *     log instead of silently zeroing or passing through wrong-currency
 *     numbers into the snapshot.
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  fxRates: readonly FxRate[],
  asOf?: string
): number {
  if (!Number.isFinite(amount)) {
    throw new Error(`convertCurrency: non-finite amount (${amount})`);
  }
  const fromU = from.toUpperCase();
  const toU = to.toUpperCase();
  if (fromU === toU) return amount;
  if (amount === 0) return 0;

  const rate = getCurrentFxRate(fromU, toU, fxRates, asOf);
  if (rate === null) {
    throw new Error(
      `convertCurrency: no FX rate configured for ${fromU} -> ${toU}` +
        (asOf ? ` (asOf=${asOf})` : '')
    );
  }
  return amount * Number(rate.rate);
}
