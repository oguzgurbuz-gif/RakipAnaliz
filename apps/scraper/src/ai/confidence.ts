export function clamp01(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
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
  if (typeof value !== 'number' || !Number.isFinite(value)) return null

  // Already normalized
  if (value >= 0 && value <= 1) {
    return clamp01(value)
  }

  // Percent form
  if (value > 1 && value <= 100) {
    return clamp01(value / 100)
  }

  // Out of range (negative or > 100)
  if (value < 0) return 0
  return 1
}

export function toDecimal4(value01: number): number {
  // MySQL columns are DECIMAL(5,4), so keep 4 decimals.
  return Number(value01.toFixed(4))
}

