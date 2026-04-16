export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
  };
}

async function writeErrorToDb(entry: LogEntry): Promise<void> {
  try {
    const { insertErrorLog } = await import('../db');
    await insertErrorLog(
      entry.context?.errorCode as string || 'SCRAPER_ERROR',
      entry.message,
      entry.context,
      entry.error?.stack,
      entry.level
    );
  } catch {
    // Ignore DB write failures - don't cause log loops
  }
}

class Logger {
  private static instance: Logger;
  private minLevel: LogLevel = 'info';
  private levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private constructor() {
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'info';
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };
  }

  private output(entry: LogEntry): void {
    const formatted = JSON.stringify({
      ...entry,
      timestamp: undefined,
      time: entry.timestamp,
    });

    switch (entry.level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      this.output(this.formatEntry('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      this.output(this.formatEntry('info', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      const entry = this.formatEntry('warn', message, context);
      this.output(entry);
      writeErrorToDb(entry);
    }
  }

  error(message: string, contextOrError?: LogContext | Error): void {
    if (this.shouldLog('error')) {
      const entry = this.formatEntry('error', message);

      if (contextOrError instanceof Error) {
        entry.error = {
          message: contextOrError.message,
          stack: contextOrError.stack,
        };
      } else if (contextOrError) {
        entry.context = contextOrError;
      }

      this.output(entry);
      writeErrorToDb(entry);
    }
  }

  child(bindings: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this, bindings);
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }
}

export class ChildLogger {
  constructor(
    private parent: Logger,
    private bindings: Record<string, unknown>
  ) {}

  private mergeContext(context?: LogContext): LogContext {
    return context ? { ...this.bindings, ...context } : this.bindings;
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.parent.warn(message, this.mergeContext(context));
  }

  error(message: string, contextOrError?: LogContext | Error): void {
    const merged = contextOrError instanceof Error ? undefined : this.mergeContext(contextOrError);
    const error = contextOrError instanceof Error ? contextOrError : undefined;
    this.parent.error(message, error ?? merged);
  }

  child(additionalBindings: Record<string, unknown>): ChildLogger {
    return new ChildLogger(this.parent, { ...this.bindings, ...additionalBindings });
  }
}

export const logger = Logger.getInstance();
