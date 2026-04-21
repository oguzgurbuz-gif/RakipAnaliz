import { ScrapeRun, Campaign, JobRecord } from '../types';
import { logger } from '../utils/logger';

type SSEClientInfo = {
  id: string;
  send: (data: string) => void;
};

class SSEServer {
  private clients: Map<string, SSEClientInfo> = new Map();
  private static instance: SSEServer;

  private constructor() {}

  static getInstance(): SSEServer {
    if (!SSEServer.instance) {
      SSEServer.instance = new SSEServer();
    }
    return SSEServer.instance;
  }

  addClient(client: SSEClientInfo): void {
    this.clients.set(client.id, client);
    logger.debug(`SSE client connected: ${client.id}`);
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
    logger.debug(`SSE client disconnected: ${clientId}`);
  }

  broadcast(event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const client of this.clients.values()) {
      try {
        client.send(message);
      } catch (error) {
        logger.warn(`Failed to send SSE message to client ${client.id}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.clients.delete(client.id);
      }
    }
  }

  sendToClient(clientId: string, event: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      client.send(message);
      return true;
    } catch (error) {
      logger.warn(`Failed to send SSE message to client ${clientId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.clients.delete(clientId);
      return false;
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const sseServer = SSEServer.getInstance();

export interface ScrapeEvent {
  type: 'scrape:start' | 'scrape:complete' | 'scrape:error' | 'scrape:progress';
  siteCode: string;
  data: ScrapeRun | { message: string } | null;
  timestamp: string;
}

export interface CampaignEvent {
  type: 'campaign:created' | 'campaign:updated' | 'campaign:expired' | 'campaign:hidden' | 'campaign:ai-analyzed';
  campaignId: string;
  fingerprint: string;
  data: Campaign | null;
  timestamp: string;
}

export interface JobEvent {
  type: 'job:queued' | 'job:started' | 'job:completed' | 'job:failed';
  jobId: number;
  jobType: string;
  data: JobRecord | null;
  timestamp: string;
}

export function publishScrapeEvent(siteCode: string, run: ScrapeRun): void {
  const event: ScrapeEvent = {
    type: run.status === 'running' ? 'scrape:start' : 'scrape:complete',
    siteCode,
    data: run,
    timestamp: new Date().toISOString(),
  };

  sseServer.broadcast('scrape', event);

  logger.debug(`Published scrape event for ${siteCode}`, { status: run.status });
}

export function publishScrapeProgress(
  siteCode: string,
  message: string,
  progress?: { cardsFound: number; processed: number }
): void {
  const event: ScrapeEvent = {
    type: 'scrape:progress',
    siteCode,
    data: { message, ...progress } as unknown as ScrapeRun,
    timestamp: new Date().toISOString(),
  };

  sseServer.broadcast('scrape', event);
}

export function publishScrapeError(siteCode: string, error: string): void {
  const event: ScrapeEvent = {
    type: 'scrape:error',
    siteCode,
    data: { message: error } as unknown as ScrapeRun,
    timestamp: new Date().toISOString(),
  };

  sseServer.broadcast('scrape', event);
}

export function publishCampaignEvent(
  type: CampaignEvent['type'],
  campaign: Campaign
): void {
  const event: CampaignEvent = {
    type,
    campaignId: campaign.id,
    fingerprint: campaign.fingerprint,
    data: campaign,
    timestamp: new Date().toISOString(),
  };

  sseServer.broadcast('campaign', event);

  logger.debug(`Published campaign event: ${type}`, {
    campaignId: campaign.id,
    fingerprint: campaign.fingerprint,
  });
}

export function publishJobEvent(
  type: JobEvent['type'],
  job: JobRecord
): void {
  const event: JobEvent = {
    type,
    jobId: job.id,
    jobType: job.type,
    data: job,
    timestamp: new Date().toISOString(),
  };

  sseServer.broadcast('job', event);

  logger.debug(`Published job event: ${type}`, {
    jobId: job.id,
    jobType: job.type,
  });
}

export function publishHealthCheck(data: {
  status: 'healthy' | 'degraded' | 'unhealthy';
  activeScrapes: number;
  queuedJobs: number;
  uptime: number;
}): void {
  sseServer.broadcast('health', data);
}

export class SSEClient {
  public readonly id: string;
  private response: import('http').ServerResponse;

  constructor(id: string, response: import('http').ServerResponse) {
    this.id = id;
    this.response = response;
  }

  send(data: string): void {
    if (this.response.writable) {
      this.response.write(data);
    }
  }

  close(): void {
    sseServer.removeClient(this.id);
  }
}

export function createSSEClient(
  response: import('http').ServerResponse,
  headers?: Record<string, string>
): SSEClient {
  const id = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...headers,
  });

  response.write('\n');

  const client = new SSEClient(id, response);
  sseServer.addClient(client);

  return client;
}
