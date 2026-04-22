/**
 * Wave 1 #1.3 — Örneklem büyüklüğü güven seviyesi.
 *
 * UI'da n=1, n=2 gibi düşük örneklemli istatistiklere "düşük güven" rozeti
 * eklemek için kullanılır. Eşikler PM auditine göre:
 *   - n < 5  → 'low'    (turuncu)
 *   - n 5-15 → 'medium' (sarı)
 *   - n > 15 → 'high'   (rozet gizlenir, normal güven)
 */
export type SampleConfidence = 'low' | 'medium' | 'high'

export function getSampleConfidence(n: number): SampleConfidence {
  if (!Number.isFinite(n) || n < 5) return 'low'
  if (n <= 15) return 'medium'
  return 'high'
}

/**
 * Düşük örneklem (medium veya low) için kısa Türkçe açıklama. Tooltip'lerde
 * kullanmak için.
 */
export function getSampleConfidenceLabel(level: SampleConfidence): string {
  switch (level) {
    case 'low':
      return 'düşük örneklem'
    case 'medium':
      return 'orta örneklem'
    case 'high':
      return 'yeterli örneklem'
  }
}
