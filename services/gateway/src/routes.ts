import type { UpstreamName } from './config/config.js';

export interface GatewayRoute {
  /** Public path prefix matched at the edge and preserved when forwarded. */
  prefix: string;
  upstream: UpstreamName;
  /** Whether a valid access token is required before forwarding. */
  protected: boolean;
}

/**
 * The public routing table. Only these prefixes are exposed; anything else
 * (including every upstream `/internal/*`, `/health/*`, and `/metrics`) is not
 * routed and returns 404 at the gateway.
 *
 * Auth endpoints that establish a session are public; everything else requires
 * a verified bearer token at the edge (downstream services validate again).
 */
export const GATEWAY_ROUTES: GatewayRoute[] = [
  { prefix: '/auth', upstream: 'authentication', protected: false },
  { prefix: '/.well-known', upstream: 'authentication', protected: false },
  { prefix: '/me', upstream: 'authentication', protected: true },
  { prefix: '/tax-residency', upstream: 'authentication', protected: true },
  { prefix: '/portfolios', upstream: 'portfolio', protected: true },
  { prefix: '/positions', upstream: 'portfolio', protected: true },
  { prefix: '/reporting', upstream: 'portfolio', protected: true },
  { prefix: '/tax-events', upstream: 'portfolio', protected: true },
  { prefix: '/tax-rules', upstream: 'portfolio', protected: true },
  { prefix: '/tax-settings', upstream: 'portfolio', protected: true },
  { prefix: '/changes', upstream: 'portfolio', protected: true },
  { prefix: '/activity', upstream: 'portfolio', protected: true },
  { prefix: '/watchlist', upstream: 'portfolio', protected: true },
  { prefix: '/instruments', upstream: 'instruments', protected: true },
  { prefix: '/exchanges', upstream: 'instruments', protected: true },
  { prefix: '/listings', upstream: 'instruments', protected: true },
  { prefix: '/quotes', upstream: 'market', protected: true },
  { prefix: '/fx', upstream: 'market', protected: true },
  { prefix: '/fair-values', upstream: 'insights', protected: true },
  { prefix: '/price-targets', upstream: 'insights', protected: true },
  { prefix: '/fundamentals', upstream: 'fundamentals', protected: true },
  { prefix: '/events', upstream: 'events', protected: true },
  { prefix: '/notifications', upstream: 'notifications', protected: true },
];
