'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard global error boundary:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-background p-6 flex items-center justify-center">
      <div className="max-w-xl w-full rounded-xl border border-destructive/20 bg-destructive/5 p-6 space-y-3">
        <h2 className="text-lg font-semibold">Bir sorun oluştu</h2>
        <p className="text-sm text-muted-foreground">
          Sayfa beklenmeyen bir hataya girdi. Veriler geçici olarak erişilemiyor olabilir.
        </p>
        <div className="flex gap-2">
          <Button onClick={reset}>Tekrar Dene</Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            Ana Sayfaya Dön
          </Button>
        </div>
      </div>
    </div>
  )
}
