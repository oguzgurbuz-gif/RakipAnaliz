'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import type { LiveEvent } from '@/types'

interface UseSSEOptions {
  onEvent?: (event: LiveEvent) => void
  onError?: (error: Error) => void
  reconnectInterval?: number
}

interface SSEContextValue {
  isConnected: boolean
  lastEvent: LiveEvent | null
  subscribe: (handler: (event: LiveEvent) => void) => () => void
}

const SSEContext = createContext<SSEContextValue | null>(null)

let globalEventSource: EventSource | null = null
const globalHandlers = new Set<(event: LiveEvent) => void>()
let globalReconnectTimeout: NodeJS.Timeout | null = null

function getGlobalEventSource(): EventSource | null {
  return globalEventSource
}

function closeGlobalEventSource(): void {
  if (globalEventSource) {
    globalEventSource.close()
    globalEventSource = null
  }
  if (globalReconnectTimeout) {
    clearTimeout(globalReconnectTimeout)
    globalReconnectTimeout = null
  }
  globalHandlers.clear()
}

function connectGlobal(): void {
  closeGlobalEventSource()

  const es = new EventSource('/api/events/stream')
  globalEventSource = es

  es.onopen = () => {
    // Notify all subscribers
    globalHandlers.forEach(handler => {
      // connection state is delivered via individual subscriptions
    })
  }

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as LiveEvent
      globalHandlers.forEach(handler => {
        try {
          handler(data)
        } catch {}
      })
    } catch (error) {
      console.error('Failed to parse SSE event:', error)
    }
  }

  es.onerror = () => {
    closeGlobalEventSource()
    globalReconnectTimeout = setTimeout(() => {
      connectGlobal()
    }, 5000)
  }
}

function useGlobalSSE(): { isConnected: boolean; lastEvent: LiveEvent | null } {
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<LiveEvent | null>(null)

  useEffect(() => {
    connectGlobal()

    const handler = (event: LiveEvent) => {
      setLastEvent(event)
      setIsConnected(true)
    }
    globalHandlers.add(handler)

    return () => {
      globalHandlers.delete(handler)
    }
  }, [])

  return { isConnected, lastEvent }
}

// Context provider — place in DashboardLayout
export function SSEProvider({ children }: { children: ReactNode }) {
  const state = useGlobalSSE()

  return (
    <SSEContext.Provider value={{
      isConnected: state.isConnected,
      lastEvent: state.lastEvent,
      subscribe: (handler) => {
        globalHandlers.add(handler)
        return () => globalHandlers.delete(handler)
      },
    }}>
      {children}
    </SSEContext.Provider>
  )
}

// Hook for components to subscribe to SSE events
export function useSSE(options: UseSSEOptions = {}): { isConnected: boolean; lastEvent: LiveEvent | null } {
  const { onEvent } = options
  const context = useContext(SSEContext)

  // If we have a context provider (DashboardLayout has it), use it
  if (context) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (!onEvent) return
      const unsub = context.subscribe(onEvent)
      return unsub
    }, [onEvent, context.subscribe])

    return { isConnected: context.isConnected, lastEvent: context.lastEvent }
  }

  // Fallback: standalone connection (for pages outside DashboardLayout)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useFallbackSSE(options)
}

// Fallback hook for standalone use (outside provider)
function useFallbackSSE(options: UseSSEOptions = {}): { isConnected: boolean; lastEvent: LiveEvent | null } {
  const { onEvent } = options
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
      }, 5000)

      onEvent && onEvent({ id: '', type: 'connected', data: {}, timestamp: new Date().toISOString() } as unknown as LiveEvent)
    }
  }, [onEvent])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      eventSourceRef.current?.close()
    }
  }, [connect])

  return { isConnected, lastEvent }
}
