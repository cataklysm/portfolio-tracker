import { CURRENT_API_VERSION } from '@portfolio/platform';
import type { AccountingMethod } from '../../domain/realization.js';
import type { SettingsReader, UserSettings } from '../../application/ports.js';

interface MeResponse {
  preferences?: {
    reporting_currency?: string;
    realization_accounting_method?: AccountingMethod;
  };
}

const DEFAULTS: UserSettings = { reportingCurrency: 'EUR', accountingMethod: 'fifo' };

/**
 * Reads the user's reporting currency and realization accounting method from
 * the authentication service's `GET /me`. The user is derived from the token,
 * not from the request body. On an outage it falls back to sensible defaults so
 * position reads still render.
 */
export class AuthSettingsClient implements SettingsReader {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 3000,
  ) {}

  async getUserSettings(bearerToken: string): Promise<UserSettings> {
    const url = new URL('/me', this.baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${bearerToken}`,
          'x-api-version': String(CURRENT_API_VERSION),
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!response.ok) return DEFAULTS;
      const body = (await response.json()) as MeResponse;
      return {
        reportingCurrency: body.preferences?.reporting_currency ?? DEFAULTS.reportingCurrency,
        accountingMethod: body.preferences?.realization_accounting_method ?? DEFAULTS.accountingMethod,
      };
    } catch {
      return DEFAULTS;
    } finally {
      clearTimeout(timer);
    }
  }
}
