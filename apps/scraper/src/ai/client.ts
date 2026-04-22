export interface ShdecnMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ShdecnChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string;
}

export interface ShdecnResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ShdecnChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ShdecnChatOptions {
  temperature?: number;
  response_format?: { type: 'json_object' | 'text' };
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
}

export interface ShdecnClient {
  chat(
    messages: ShdecnMessage[],
    options?: ShdecnChatOptions
  ): Promise<ShdecnResponse>;
}

export interface DeepSeekConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
}

const DEFAULT_CONFIG: DeepSeekConfig = {
  apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  timeoutMs: 60000,
  maxRetries: 3,
};

function createShdecnClient(config: DeepSeekConfig = DEFAULT_CONFIG): ShdecnClient {
  const { apiUrl, apiKey, model, timeoutMs, maxRetries } = config;

  async function fetchWithRetry<T>(
    fn: () => Promise<T>,
    retries: number = maxRetries ?? 3
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < retries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 15000);
          await sleep(delayMs);
        }
      }
    }
    
    throw lastError;
  }

  async function chat(
    messages: ShdecnMessage[],
    options?: ShdecnChatOptions
  ): Promise<ShdecnResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options?.temperature ?? 0.1,
      response_format: options?.response_format ?? { type: 'json_object' },
    };

    if (options?.max_tokens) body.max_tokens = options.max_tokens;
    if (options?.top_p) body.top_p = options.top_p;
    if (options?.frequency_penalty) body.frequency_penalty = options.frequency_penalty;
    if (options?.presence_penalty) body.presence_penalty = options.presence_penalty;
    if (options?.stop) body.stop = options.stop;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs ?? 60000);

    try {
      const response = await fetchWithRetry(async () => {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => 'Unknown error');
          throw new DeepSeekError(
            `DeepSeek API request failed with status ${res.status}`,
            res.status,
            errorText
          );
        }

        return res.json() as Promise<ShdecnResponse>;
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return { chat };
}

export class DeepSeekError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: string
  ) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let globalClient: ShdecnClient | null = null;

export function getShdecnClient(config?: Partial<DeepSeekConfig>): ShdecnClient {
  if (!globalClient || config) {
    globalClient = createShdecnClient({ ...DEFAULT_CONFIG, ...config });
  }
  return globalClient;
}

export async function callDeepSeek(
  messages: ShdecnMessage[],
  options?: ShdecnChatOptions
): Promise<ShdecnResponse> {
  // Wave 1 #1.6 — Cost circuit breaker. Limit aşıldıysa CostLimitExceededError
  // fırlatılır; çağıran (ai-analysis-batch, content-analysis vb.) bunu yakalayıp
  // skip etmeli ki Promise.all batch'i çökmesin.
  const { ensureCostBudget } = await import('./cost-guard');
  try {
    await ensureCostBudget();
  } catch (err) {
    // Re-throw — çağıran mesaja göre log + skip yapacak.
    throw err;
  }
  const client = getShdecnClient();
  return client.chat(messages, options);
}

export function createDeepSeekClient(config: DeepSeekConfig): ShdecnClient {
  return createShdecnClient(config);
}

export { DEFAULT_CONFIG };
export default getShdecnClient;
