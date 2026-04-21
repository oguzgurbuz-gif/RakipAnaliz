'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Lock, Loader2 } from 'lucide-react'

export default function AdminLoginPage() {
  return (
    <React.Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </React.Suspense>
  )
}

function LoginFallback() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center p-6">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromParam = searchParams?.get('from')
  const errorParam = searchParams?.get('error')

  const [key, setKey] = React.useState('')
  const [error, setError] = React.useState<string | null>(
    errorParam === 'not_configured' ? 'ADMIN_API_KEY sunucuda tanımlı değil.' : null
  )
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!key) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (res.status === 401) {
          setError('Geçersiz admin anahtarı.')
        } else {
          setError(body?.error || 'Giriş başarısız.')
        }
        return
      }
      const dest =
        fromParam && fromParam.startsWith('/') && !fromParam.startsWith('//')
          ? fromParam
          : '/admin/jobs'
      router.replace(dest)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bilinmeyen hata')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Admin Girişi</h1>
              <p className="text-xs text-muted-foreground">
                Yönetici alanına erişim için anahtarı girin.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="admin-key" className="text-sm font-medium">
                Admin Anahtarı
              </label>
              <Input
                id="admin-key"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="ADMIN_API_KEY"
                disabled={isSubmitting}
              />
            </div>
            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !key}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Giriş yapılıyor...
                </>
              ) : (
                'Giriş Yap'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
