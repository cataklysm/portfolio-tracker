import { AppError, type Logger } from '@portfolio/platform';
import type { ProvidersConfig } from '../config/config.js';
import type { Capability, MarketDataProvider } from './types.js';
import { EcbClient } from './clients/ecb-client.js';
import { YahooClient } from './clients/yahoo-client.js';
import { YahooProvider } from './yahoo-provider.js';
import { EcbProvider } from './ecb-provider.js';

/**
 * Holds the configured providers and routes a capability to the first provider
 * (in registration/priority order) that supports it. "Feature not supported" is
 * expressed here, not by the providers: if no registered provider offers a
 * capability, `require` raises a 501 so callers get a clean problem response.
 */
export class ProviderRegistry {
  private readonly providers: MarketDataProvider[];

  constructor(providers: MarketDataProvider[]) {
    this.providers = providers;
  }

  /** All registered providers, in priority order. */
  all(): readonly MarketDataProvider[] {
    return this.providers;
  }

  byName(name: string): MarketDataProvider | undefined {
    return this.providers.find((p) => p.name === name);
  }

  /** Providers that support a capability, in priority order. */
  forCapability(capability: Capability): MarketDataProvider[] {
    return this.providers.filter((p) => p.capabilities.has(capability));
  }

  /** First provider supporting a capability, or a 501 if none does. */
  require(capability: Capability): MarketDataProvider {
    const provider = this.providers.find((p) => p.capabilities.has(capability));
    if (!provider) {
      throw new AppError({
        status: 501,
        code: 'capability_not_supported',
        title: 'Not Implemented',
        detail: `No configured provider supports the "${capability}" capability`,
      });
    }
    return provider;
  }

  /** Capability -> the names of providers offering it (for diagnostics). */
  capabilityMap(): Record<Capability, string[]> {
    const map = {} as Record<Capability, string[]>;
    for (const provider of this.providers) {
      for (const capability of provider.capabilities) {
        (map[capability] ??= []).push(provider.name);
      }
    }
    return map;
  }
}

/**
 * Factory: instantiates the low-level vendor clients, wraps them in providers,
 * and registers them in priority order. Yahoo first (broad coverage), ECB for
 * FX. Adding a provider is one line here plus its adapter.
 */
export function buildRegistry(config: ProvidersConfig, logger: Logger): ProviderRegistry {
  const yahoo = new YahooProvider(new YahooClient(logger));
  const ecb = new EcbProvider(new EcbClient(config.ecb.dailyUrl, config.ecb.histUrl, logger));
  return new ProviderRegistry([yahoo, ecb]);
}
