import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const SSE_CHANNEL = process.env.SSE_CHANNEL || 'bitalih:events';
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.SSE_HEARTBEAT_MS || '15000', 10);

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let intervalId: NodeJS.Timeout | null = null;
  let pollIntervalId: NodeJS.Timeout | null = null;
  let isConnected = true;

  const cleanup = () => {
    isConnected = false;
    if (intervalId) clearInterval(intervalId);
    if (pollIntervalId) clearInterval(pollIntervalId);
    intervalId = null;
    pollIntervalId = null;
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const sendEvent = (eventType: string, data: unknown) => {
          if (!isConnected) return;
          const event = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(event));
        };

        const sendHeartbeat = () => {
          if (!isConnected) return;
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        };

        intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

        sendEvent('connected', { timestamp: new Date().toISOString() });

        const pollEvents = async () => {
          if (!isConnected) return;

          try {
            const lastEventId = request.nextUrl.searchParams.get('lastEventId');
            let lastId = 0;
            if (lastEventId) {
              const parsed = parseInt(lastEventId, 10);
              if (!isNaN(parsed)) lastId = parsed;
            }

            const events = await query<{
              id: string;
              event_type: string;
              event_channel: string;
              payload: unknown;
              created_at: Date;
            }>(`
              SELECT id, event_type, event_channel, payload, created_at
              FROM sse_events
              WHERE event_channel = $1 AND id > $2
              ORDER BY id ASC
              LIMIT 100
            `, [SSE_CHANNEL, lastId]);

            for (const event of events) {
              sendEvent(event.event_type, {
                id: event.id,
                type: event.event_type,
                channel: event.event_channel,
                data: event.payload,
                timestamp: event.created_at,
              });
            }
          } catch (error) {
            console.error('Error polling SSE events:', error);
          }
        };

        await pollEvents();
        pollIntervalId = setInterval(pollEvents, 2000);

        request.signal.addEventListener('abort', () => {
          cleanup();
          controller.close();
        });
      } catch (error) {
        cleanup();
        controller.close();
        console.error('SSE stream error:', error);
      }
    },
    cancel() {
      cleanup();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Last-Event-Id',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Last-Event-Id',
    },
  });
}
