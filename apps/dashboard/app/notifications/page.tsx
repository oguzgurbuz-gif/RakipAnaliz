'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSSE, LiveEvent } from '@/hooks/useSSE'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Bell, BellOff, Check, X, AlertTriangle, CheckCircle, Info } from 'lucide-react'

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Array<LiveEvent & { read: boolean }>>([])
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [showBrowserNotifications, setShowBrowserNotifications] = useState(true)

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission)
    }
  }, [])

  const handleNewEvent = useCallback((event: LiveEvent) => {
    setNotifications(prev => {
      const newNotif = { ...event, read: false }
      const updated = [newNotif, ...prev].slice(0, 50) // Keep last 50

      // Show browser notification if permitted
      if (showBrowserNotifications && permission === 'granted') {
        const title = getNotificationTitle(event.type)
        const body = getNotificationBody(event)
        new Notification(title, { body, icon: '/favicon.ico' })
      }

      return updated
    })
  }, [permission, showBrowserNotifications])

  useSSE(handleNewEvent)

  const requestPermission = async () => {
    if (typeof Notification !== 'undefined') {
      const result = await Notification.requestPermission()
      setPermission(result)
    }
  }

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const dismissNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  const unreadCount = notifications.filter(n => !n.read).length

  const getNotificationTitle = (type: string) => {
    switch (type) {
      case 'new_campaign': return 'Yeni Kampanya'
      case 'campaign_updated': return 'Kampanya Güncellendi'
      case 'status_changed': return 'Durum Değişikliği'
      case 'scrape_started': return 'Scrape Başladı'
      case 'scrape_completed': return 'Scrape Tamamlandı'
      case 'scrape_failed': return 'Scrape Hatası'
      default: return 'Bildirim'
    }
  }

  const getNotificationBody = (event: LiveEvent) => {
    const data = event.data as Record<string, unknown>
    switch (event.type) {
      case 'new_campaign':
        return `Yeni kampanya: ${data.title || 'Başlık yok'}`
      case 'campaign_updated':
        return `Güncellenen kampanya: ${data.title || 'Başlık yok'}`
      case 'status_changed':
        return `${data.title || 'Kampanya'} durumu ${data.newStatus || 'değişti'}`
      case 'scrape_started':
        return `${data.siteCode || 'Site'} için scrape başladı`
      case 'scrape_completed':
        return `${data.siteCode || 'Site'} scrape tamamlandı: ${data.cardsFound || 0} kart`
      case 'scrape_failed':
        return `${data.siteCode || 'Site'} scrape hatası: ${data.error || 'Bilinmeyen'}`
      default:
        return JSON.stringify(data).slice(0, 100)
    }
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'new_campaign': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'scrape_failed': return <AlertTriangle className="h-4 w-4 text-red-600" />
      case 'scrape_completed': return <CheckCircle className="h-4 w-4 text-blue-600" />
      default: return <Info className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getEventColor = (type: string) => {
    switch (type) {
      case 'new_campaign': return 'border-green-200 bg-green-50/50'
      case 'scrape_failed': return 'border-red-200 bg-red-50/50'
      case 'scrape_completed': return 'border-blue-200 bg-blue-50/50'
      default: return ''
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Bildirimler"
        description="Gerçek zamanlı sistem bildirimlerini ve uyarılarını görüntüleyin."
        actions={
          <div className="flex items-center gap-2">
            {permission === 'default' && (
              <Button variant="outline" size="sm" onClick={requestPermission}>
                <Bell className="h-4 w-4 mr-2" />
                Tarayıcı İzin Ver
              </Button>
            )}
            {permission === 'granted' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBrowserNotifications(!showBrowserNotifications)}
              >
                {showBrowserNotifications ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </Button>
            )}
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead}>
                <Check className="h-4 w-4 mr-2" />
                Tümünü Okundu
              </Button>
            )}
          </div>
        }
      />

      <main className="p-6 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Okunmamış</div>
              <div className="text-2xl font-bold">{unreadCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Toplam</div>
              <div className="text-2xl font-bold">{notifications.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Tarayıcı İzni</div>
              <div className="flex items-center gap-2">
                <Badge variant={permission === 'granted' ? 'default' : 'secondary'}>
                  {permission === 'granted' ? 'Açık' : permission === 'denied' ? 'Engelli' : 'İstek Gerekli'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {notifications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-3 opacity-50" />
              <p>Henüz bildirim yok</p>
              <p className="text-sm">Yeni kampanya veya scrape olayları burada görünecek</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => (
              <Card
                key={notif.id}
                className={`${getEventColor(notif.type)} ${!notif.read ? 'border-l-4 border-l-primary' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getEventIcon(notif.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {notif.type.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(notif.timestamp).toLocaleString('tr-TR')}
                        </span>
                        {!notif.read && (
                          <span className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="font-medium text-sm truncate">
                        {getNotificationTitle(notif.type)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {getNotificationBody(notif)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!notif.read && (
                        <button
                          onClick={() => markRead(notif.id)}
                          className="p-1 hover:bg-muted rounded"
                          title="Okundu işaretle"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => dismissNotification(notif.id)}
                        className="p-1 hover:bg-muted rounded"
                        title="Kapat"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}