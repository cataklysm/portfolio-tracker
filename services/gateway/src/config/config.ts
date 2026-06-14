import { intEnv, optionalEnv } from '@portfolio/platform';

export type UpstreamName =
  | 'authentication'
  | 'portfolio'
  | 'instruments'
  | 'market'
  | 'insights'
  | 'fundamentals'
  | 'events'
  | 'notifications';

/** Gateway configuration: the public edge, upstream targets, and edge limits. */
export interface GatewayConfig {
  port: number;
  environment: string;
  serviceVersion: string;
  upstreams: Record<UpstreamName, string>;
  auth: { jwksUri: string; issuer: string; audience: string };
  cors: { origins: string[] | true };
  rateLimit: { max: number; timeWindowMs: number };
}

function parseOrigins(value: string | undefined): string[] | true {
  if (!value || value === '*') return true;
  return value.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0);
}

export function loadConfig(): GatewayConfig {
  const authUpstream = optionalEnv('AUTH_BASE_URL') ?? 'http://localhost:3002';
  return {
    port: intEnv('GATEWAY_PORT', 3001),
    environment: optionalEnv('NODE_ENV') ?? 'development',
    serviceVersion: optionalEnv('SERVICE_VERSION') ?? '0.1.0',
    upstreams: {
      authentication: authUpstream,
      portfolio: optionalEnv('PORTFOLIO_BASE_URL') ?? 'http://localhost:3003',
      instruments: optionalEnv('INSTRUMENTS_BASE_URL') ?? 'http://localhost:3004',
      market: optionalEnv('MARKET_BASE_URL') ?? 'http://localhost:3005',
      insights: optionalEnv('INSIGHTS_BASE_URL') ?? 'http://localhost:3006',
      fundamentals: optionalEnv('FUNDAMENTALS_BASE_URL') ?? 'http://localhost:3007',
      events: optionalEnv('EVENTS_BASE_URL') ?? 'http://localhost:3008',
      notifications: optionalEnv('NOTIFICATIONS_BASE_URL') ?? 'http://localhost:3009',
    },
    auth: {
      jwksUri: optionalEnv('AUTH_JWKS_URI') ?? `${authUpstream}/.well-known/jwks.json`,
      issuer: optionalEnv('AUTH_JWT_ISSUER') ?? 'http://localhost:3002',
      audience: optionalEnv('AUTH_JWT_AUDIENCE') ?? 'portfolio-platform',
    },
    cors: { origins: parseOrigins(optionalEnv('GATEWAY_CORS_ORIGINS')) },
    rateLimit: {
      max: intEnv('GATEWAY_RATE_LIMIT_MAX', 300),
      timeWindowMs: intEnv('GATEWAY_RATE_LIMIT_WINDOW_MS', 60_000),
    },
  };
}
