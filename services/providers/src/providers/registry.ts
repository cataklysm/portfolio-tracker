import { AppError, type Logger } from '@portfolio/platform';
import type { ProvidersConfig } from '../config/config.js';
import type { Capability, MarketDataProvider } from './types.js';
import { EcbClient } from './clients/ecb-client.js';
import { YahooClient } from './clients/yahoo-client.js';
import { LstcClient } from './clients/lstc-client.js';
import { YahooProvider } from './yahoo-provider.js';
import { EcbProvider } from './ecb-provider.js';
import { LstcProvider } from './lstc-provider.js';
import type { ProviderSettingsRepository } from './settings-repository.js';

/**
 * Holds the enabled providers and routes a capability to the first provider, in
 * registration/priority order, that supports it. "Feature not supported" is
 * expressed here, not by the providers: if no enabled provider offers a
 * capability, `require` raises a 501.
 *
 * The enabled set is resolved once at startup from `provider_settings`. Live
 * settings (pacing, quality, runtime enable/disable for the admin UI and the
 * market scheduler) are read straight from the repository, not from here — so a
 * routing-level enable/disable change takes effect on restart, while pacing and
 * quality edits are reflected immediately via `/internal/providers`.
 *
 * Routing is first-match per capability; per-(instrument × capability) selection
 * is owned by the instruments service and passed in explicitly.
 */
export class ProviderRegistry {
  private readonly providers: MarketDataProvider[];

  constructor(providers: MarketDataProvider[]) {
    this.providers = providers;
  }

  /** All enabled providers, in priority order. */
  all(): readonly MarketDataProvider[] {
    return this.providers;
  }

  byName(name: string): MarketDataProvider | undefined {
    return this.providers.find((p) => p.name === name);
  }

  /** Enabled providers that support a capability, in priority order. */
  forCapability(capability: Capability): MarketDataProvider[] {
    return this.providers.filter((p) => p.capabilities.has(capability));
  }

  /** First enabled provider supporting a capability, or a 501 if none does. */
  require(capability: Capability): MarketDataProvider {
    const provider = this.providers.find((p) => p.capabilities.has(capability));
    if (!provider) {
      throw new AppError({
        status: 501,
        code: 'capability_not_supported',
        title: 'Not Implemented',
        detail: `No enabled provider supports the "${capability}" capability`,
      });
    }
    return provider;
  }

  /** Capability -> the names of enabled providers offering it (for diagnostics). */
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
 * Factory: instantiates the vendor clients, wraps them in providers, loads their
 * admin-editable settings from the DB, and registers only the *enabled* ones in
 * priority order (Yahoo first for broad coverage, ECB for FX). Adding a provider
 * is one adapter here plus a seeded `providers.provider_settings` row.
 *
 * Enforces the class contract: a `symbol`-class provider must implement
 * `symbol_search`, otherwise startup fails fast (a misconfiguration).
 */
export async function buildRegistry(
  config: ProvidersConfig,
  settingsRepo: ProviderSettingsRepository,
  logger: Logger,
): Promise<ProviderRegistry> {
  const yahoo = new YahooProvider(new YahooClient(logger));
  const ecb = new EcbProvider(new EcbClient(config.ecb.dailyUrl, config.ecb.histUrl, logger));
  const lstc = new LstcProvider(new LstcClient(config.lstc, logger));
  // Yahoo first so it stays the default for shared capabilities; lstc is opt-in
  // via its provider_settings row and selected per-instrument where wanted.
  const adapters: MarketDataProvider[] = [yahoo, ecb, lstc];

  // Spec-only build (OpenAPI dump): skip the boot-time settings read so the app
  // can be constructed without a database. The HTTP routes only need the
  // registry object to exist, not any enabled providers.
  const settings = process.env['OPENAPI_DUMP'] === '1' ? [] : await settingsRepo.listAll();
  const settingsByName = new Map(settings.map((s) => [s.provider, s]));

  const enabled: MarketDataProvider[] = [];
  for (const provider of adapters) {
    const settings = settingsByName.get(provider.name);
    if (!settings) {
      logger.warn(
        { provider: provider.name, error_code: 'provider_no_settings' },
        'No settings row for provider; not registering',
      );
      continue;
    }
    if (!settings.enabled) {
      logger.info({ provider: provider.name }, 'Provider disabled by settings; not registering');
      continue;
    }
    if (settings.providerClass === 'symbol' && typeof provider.searchSymbols !== 'function') {
      throw new AppError({
        status: 500,
        code: 'provider_missing_symbol_search',
        title: 'Provider misconfigured',
        detail: `Symbol-class provider "${provider.name}" must implement symbol_search`,
      });
    }
    enabled.push(provider);
  }

  return new ProviderRegistry(enabled);
}
