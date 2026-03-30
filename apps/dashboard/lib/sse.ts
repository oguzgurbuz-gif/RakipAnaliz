'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { LiveEvent } from '@/types'

interface UseSSEOptions {
  onEvent?: (event: LiveEvent) => void
  onError?: (error: Error) => void
  reconnectInterval?: number
}

export function useSSE(options: UseSSEOptions = {}) {
  const { onEvent, onError, reconnectInterval = 5000 } = options
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const eventSource = new EventSource('/api/events/stream')
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setIsConnected(true)
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LiveEvent
        setLastEvent(data)
        onEvent?.(data)
      } catch (error) {
        console.error('Failed to parse SSE event:', error)
      }
    }

    eventSource.onerror = () => {
      setIsConnected(false)
      eventSource.close()
      
      reconnectTimeoutRef.current = setTimeout(() => {
        connect()
      }, reconnectInterval)
      
      onError?.(new Error('SSE connection lost'))
    }
  }, [onEvent, onError, reconnectInterval])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
  }, [])

  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    isConnected,
    lastEvent,
    reconnect: connect,
    disconnect,
  }
}
