import { pino, type Logger } from 'pino';

export type { Logger };

export interface LoggerOptions {
  service: string;
  serviceVersion: string;
  environment: string;
  level?: string;
  /** Pretty-print to a TTY in development; JSON to stdout otherwise. */
  pretty?: boolean;
}

/**
 * Builds a structured JSON logger with the base fields every log entry in the
 * platform must carry (service, service_version, environment). Sensitive
 * fields are redacted so tokens, passwords, and authorization headers never
 * reach the log stream.
 */
export function createLogger(options: LoggerOptions): Logger {
  return pino({
    level: options.level ?? 'info',
    base: {
      service: options.service,
      service_version: options.serviceVersion,
      environment: options.environment,
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'password_hash',
        'refresh_token',
        'access_token',
        'token',
        '*.password',
        '*.refresh_token',
      ],
      censor: '[redacted]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: options.pretty
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
  });
}
