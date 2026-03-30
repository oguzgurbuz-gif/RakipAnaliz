'use client'

import { useEffect } from 'react'
import { useSSE } from '@/lib/sse'
import { useQueryClient } from '@tanstack/react-query'
import type { LiveEvent } from '@/types'

export function LiveEventsBridge() {
  const queryClient = useQueryClient()
  const { isConnected } = useSSE({
    onEvent: (event: LiveEvent) => {
      switch (event.type) {
        case 'campaign_created':
        case 'campaign_updated':
          queryClient.invalidateQueries({ queryKey: ['campaigns'] })
          queryClient.invalidateQueries({ queryKey: ['report-summary'] })
          break
        case 'scrape_started':
        case 'scrape_completed':
        case 'scrape_failed':
          queryClient.invalidateQueries({ queryKey: ['runs'] })
          queryClient.invalidateQueries({ queryKey: ['report-summary'] })
          break
      }
    },
  })

  useEffect(() => {
    console.log('Live events bridge mounted, connected:', isConnected)
  }, [isConnected])

  return null
}