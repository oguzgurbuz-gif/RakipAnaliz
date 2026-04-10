import { useEffect, useRef, useCallback } from 'react'

export type LiveEventType =
  | 'new_campaign'
  | 'campaign_updated'
  | 'status_changed'
  | 'scrape_started'
  | 'scrape_completed'
  | 'scrape_failed'
  | 'connected'

export interface LiveEvent {
  id: string
  type: LiveEventType
  data: Record<string, unknown>
  timestamp: string
}

export function useSSE(onEvent?: (event: LiveEvent) => void) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const lastEventIdRef = useRef<string>('')

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const url = `/api/events/stream?lastEventId=${lastEventIdRef.current}`
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEventIdRef.current = data.id || ''
        onEvent?.({
          id: data.id || '',
          type: 'connected',
          data,
          timestamp: data.timestamp || new Date().toISOString(),
        })
      } catch {}
    })

    eventSource.addEventListener('new_campaign', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEventIdRef.current = data.id || ''
        onEvent?.({ id: data.id || '', type: 'new_campaign', data: data.data || data, timestamp: data.timestamp || new Date().toISOString() })
      } catch {}
    })

    eventSource.addEventListener('campaign_updated', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEventIdRef.current = data.id || ''
        onEvent?.({ id: data.id || '', type: 'campaign_updated', data: data.data || data, timestamp: data.timestamp || new Date().toISOString() })
      } catch {}
    })

    eventSource.addEventListener('status_changed', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEventIdRef.current = data.id || ''
        onEvent?.({ id: data.id || '', type: 'status_changed', data: data.data || data, timestamp: data.timestamp || new Date().toISOString() })
      } catch {}
    })

    eventSource.addEventListener('scrape_started', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEventIdRef.current = data.id || ''
        onEvent?.({ id: data.id || '', type: 'scrape_started', data: data.data || data, timestamp: data.timestamp || new Date().toISOString() })
      } catch {}
    })

    eventSource.addEventListener('scrape_completed', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEventIdRef.current = data.id || ''
        onEvent?.({ id: data.id || '', type: 'scrape_completed', data: data.data || data, timestamp: data.timestamp || new Date().toISOString() })
      } catch {}
    })

    eventSource.addEventListener('scrape_failed', (e) => {
      try {
        const data = JSON.parse(e.data)
        lastEventIdRef.current = data.id || ''
        onEvent?.({ id: data.id || '', type: 'scrape_failed', data: data.data || data, timestamp: data.timestamp || new Date().toISOString() })
      } catch {}
    })

    eventSource.onerror = () => {
      eventSource.close()
      setTimeout(connect, 5000)
    }
  }, [onEvent])

  useEffect(() => {
    connect()
    return () => {
      eventSourceRef.current?.close()
    }
  }, [connect])

  return { reconnect: connect }
}