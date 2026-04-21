/**
 * Confidence value utilities.
 * All confidence values stored in DB as DECIMAL(5,4) — range 0.0000 to 0.9999
 */

export function clamp01(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Clamp a value to DECIMAL(5,4) range: 0.0000 to 0.9999
 * This prevents MySQL "Out of range" errors.
 */
export function clampDecimal4(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (value > 0.9999) return 0.9999;
  if (value < 0) return 0;
  return value;
}

/**
 * Normalizes a confidence value to `0..1`.
 *
 * Supports inputs:
 * - `0..1` (already normalized)
 * - `1..100` (percent form) -> divides by 100
 * - out-of-range values -> clamped to `0..1`
 */
export function normalizeConfidence01(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  // Already normalized
  if (value >= 0 && value <= 1) {
    return clamp01(value);
  }

  // Percent form
  if (value > 1 && value <= 100) {
    return clamp01(value / 100);
  }

  // Out of range (negative or > 100)
  if (value < 0) return 0;
  return 1;
}

/**
 * Converts a 0..1 confidence to DECIMAL(5,4) format.
 * Uses rounding to 4 decimal places.
 */
export function toDecimal4(value01: number): number {
  // MySQL columns are DECIMAL(5,4), so keep 4 decimals max (0.0000 to 0.9999).
  // Apply clamp to prevent overflow even for edge cases like 1.0.
  return Number(clampDecimal4(value01).toFixed(4));
}
