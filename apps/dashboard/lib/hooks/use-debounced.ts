'use client'

import { useEffect, useState } from 'react'

/**
 * Verilen değeri `delayMs` boyunca settle olana kadar geciktirir.
 *
 * FE-5 — Filtre değişince /api/campaigns'a "count_only" çağrısı yapmadan
 * önce debounce için kullanılır; her keystroke'ta backend'e gitmemek için.
 *
 * Calendar sayfasındaki yerel `useDebounced` ile aynı semantik; tek noktada
 * tutmak için buraya çıkarıldı (henüz yerel kopya kaldırılmadı, ileride
 * lint pass'inde sadeleştirilebilir).
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
