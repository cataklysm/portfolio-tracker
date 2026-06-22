/**
 * Portfolio Tracker MCP Server
 *
 * Exposes instruments (asset catalog) and market data (quotes, price history,
 * FX rates) as MCP tools for use with the Claude desktop app.
 *
 * Required env vars:
 *   PORTFOLIO_PAT            Personal access token from the Settings → API Tokens page
 *
 * Optional env vars (defaults to local dev):
 *   PORTFOLIO_GATEWAY_URL    Base URL of the gateway (default: http://localhost:3001)
 *   PORTFOLIO_AUTH_URL       Base URL of the auth service (default: http://localhost:3002)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const GATEWAY_URL = process.env.PORTFOLIO_GATEWAY_URL ?? 'http://localhost:3001';
const AUTH_URL = process.env.PORTFOLIO_AUTH_URL ?? 'http://localhost:3002';
const PAT = process.env.PORTFOLIO_PAT ?? '';

// ── JWT token cache ──────────────────────────────────────────────────────────

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (!PAT) {
    throw new Error(
      'PORTFOLIO_PAT environment variable is not set. Create a token in the app under Settings → API Tokens.',
    );
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.token;

  const res = await fetch(`${AUTH_URL}/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PAT exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

async function apiGet(path: string): Promise<unknown> {
  const token = await getToken();
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${res.statusText}: ${body}`);
  }

  return res.json();
}

// ── MCP server ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'portfolio-tracker', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_assets',
      description:
        'Search for financial instruments (stocks, ETFs, crypto, funds, indices) by name or ticker symbol. ' +
        'Returns instruments with listing IDs — the listing ID is needed to fetch quotes or price history.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Name or symbol to search for, e.g. "Apple", "AAPL", "Bitcoin"' },
          limit: { type: 'number', description: 'Maximum results to return (1–50, default 10)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_quotes',
      description:
        'Get current prices for one or more listings. ' +
        'Returns the latest price, previous close, currency, timestamp, and freshness status (fresh / stale / unavailable). ' +
        'Use listing IDs from search_assets.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          listing_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Listing UUIDs to fetch quotes for (from search_assets)',
          },
        },
        required: ['listing_ids'],
      },
    },
    {
      name: 'get_price_series',
      description:
        'Get a recent price time series for a listing — up to 365 data points ordered oldest-first. ' +
        'Useful for trend analysis, charting, or computing returns over recent periods.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          listing_id: { type: 'string', description: 'Listing UUID (from search_assets)' },
          limit: { type: 'number', description: 'Number of data points to return (1–365, default 90)' },
        },
        required: ['listing_id'],
      },
    },
    {
      name: 'get_price_history',
      description:
        'Get daily closing prices for a listing over a specific date range. ' +
        'Useful for historical backtesting, volatility analysis, or computing returns over custom windows.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          listing_id: { type: 'string', description: 'Listing UUID (from search_assets)' },
          from: { type: 'string', description: 'Start date in YYYY-MM-DD format (inclusive)' },
          to: { type: 'string', description: 'End date in YYYY-MM-DD format (inclusive)' },
        },
        required: ['listing_id', 'from', 'to'],
      },
    },
    {
      name: 'get_fx_rates',
      description:
        'Get current EUR-based foreign exchange rates for one or more currencies. ' +
        'Rates are sourced from the ECB. Useful when comparing prices across different currency listings.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          currencies: {
            type: 'array',
            items: { type: 'string' },
            description: 'ISO 4217 currency codes, e.g. ["USD", "GBP", "CHF", "JPY"]',
          },
        },
        required: ['currencies'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      case 'search_assets': {
        const query = args?.['query'] as string;
        const limit = args?.['limit'] as number | undefined;
        const qs = new URLSearchParams({ q: query });
        if (limit != null) qs.set('limit', String(Math.min(50, Math.max(1, limit))));
        result = await apiGet(`/instruments/search?${qs.toString()}`);
        break;
      }

      case 'get_quotes': {
        const ids = args?.['listing_ids'] as string[];
        if (!ids?.length) throw new Error('listing_ids must be a non-empty array');
        result = await apiGet(`/quotes?listing_ids=${ids.join(',')}`);
        break;
      }

      case 'get_price_series': {
        const listingId = args?.['listing_id'] as string;
        const limit = args?.['limit'] as number | undefined;
        const qs = limit != null ? `?limit=${Math.min(365, Math.max(1, limit))}` : '';
        result = await apiGet(`/quotes/${encodeURIComponent(listingId)}/series${qs}`);
        break;
      }

      case 'get_price_history': {
        const listingId = args?.['listing_id'] as string;
        const from = args?.['from'] as string;
        const to = args?.['to'] as string;
        result = await apiGet(
          `/quotes/${encodeURIComponent(listingId)}/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        break;
      }

      case 'get_fx_rates': {
        const currencies = args?.['currencies'] as string[];
        if (!currencies?.length) throw new Error('currencies must be a non-empty array');
        result = await apiGet(`/fx/rates?quote_currencies=${currencies.map((c) => c.toUpperCase()).join(',')}`);
        break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
