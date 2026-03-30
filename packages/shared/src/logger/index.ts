export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: Date;
  service?: string;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function createLogger(service: string): Logger {
  const format = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date(),
      service,
    };
    return JSON.stringify(entry);
  };

  return {
    debug: (message: string, context?: Record<string, unknown>) => {
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug(format('debug', message, context));
      }
    },
    info: (message: string, context?: Record<string, unknown>) => {
      console.info(format('info', message, context));
    },
    warn: (message: string, context?: Record<string, unknown>) => {
      console.warn(format('warn', message, context));
    },
    error: (message: string, context?: Record<string, unknown>) => {
      console.error(format('error', message, context));
    },
  };
}
