import { AppError } from '@portfolio/platform';
import {
  SELECTABLE_CAPABILITIES,
  type ActiveListing,
  type ProviderSelectionView,
  type ProviderUsageView,
  type RefreshPlanEntry,
  type SelectableCapability,
  type SelectionRepository,
} from './ports.js';

/**
 * Use cases for per-(instrument × capability) provider selection. Enforces the
 * `quotes` = `chart` pairing (one price series → one provider) and that only
 * selectable capabilities are assigned. Providers are referenced by name; their
 * existence/enablement is owned by the providers service.
 */
export class SelectionService {
  constructor(private readonly repo: SelectionRepository) {}

  async getInstrumentSelections(instrumentId: string): Promise<ProviderSelectionView[]> {
    if (!(await this.repo.instrumentExists(instrumentId))) {
      throw AppError.notFound('instrument_not_found', 'Instrument not found');
    }
    return this.repo.listForInstrument(instrumentId);
  }

  async setInstrumentSelection(
    instrumentId: string,
    capability: string,
    provider: string,
  ): Promise<ProviderSelectionView[]> {
    if (!(await this.repo.instrumentExists(instrumentId))) {
      throw AppError.notFound('instrument_not_found', 'Instrument not found');
    }
    const cap = assertSelectable(capability);
    const prov = provider.trim();
    if (prov.length === 0) throw AppError.badRequest('invalid_provider', 'A provider is required');

    // Some capabilities move together (one upstream feed → one provider):
    //  - quotes + chart are one price series;
    //  - earnings + corporate_actions + news are one bundled events feed.
    const capabilities = SELECTION_GROUPS[cap] ?? [cap];
    await this.repo.upsert(
      instrumentId,
      capabilities.map((c) => ({ capability: c, provider: prov })),
    );
    return this.repo.listForInstrument(instrumentId);
  }

  getRefreshPlan(capability: string, listingIds?: string[]): Promise<RefreshPlanEntry[]> {
    return this.repo.refreshPlan(assertSelectable(capability), listingIds);
  }

  listActiveListings(): Promise<ActiveListing[]> {
    return this.repo.listActiveListings();
  }

  getProviderUsage(provider: string): Promise<ProviderUsageView[]> {
    const p = provider.trim();
    if (p.length === 0) throw AppError.badRequest('invalid_provider', 'A provider is required');
    return this.repo.usageForProvider(p);
  }
}

/**
 * Capabilities that must share one provider (one upstream feed). Setting any
 * member assigns the whole group. Capabilities not listed are standalone.
 */
const EVENTS_GROUP: SelectableCapability[] = ['earnings', 'corporate_actions', 'news'];
const PRICE_GROUP: SelectableCapability[] = ['quotes', 'chart'];
const SELECTION_GROUPS: Partial<Record<SelectableCapability, SelectableCapability[]>> = {
  quotes: PRICE_GROUP,
  chart: PRICE_GROUP,
  earnings: EVENTS_GROUP,
  corporate_actions: EVENTS_GROUP,
  news: EVENTS_GROUP,
};

function assertSelectable(value: string): SelectableCapability {
  if ((SELECTABLE_CAPABILITIES as readonly string[]).includes(value)) {
    return value as SelectableCapability;
  }
  throw AppError.badRequest(
    'invalid_capability',
    `capability must be one of: ${SELECTABLE_CAPABILITIES.join(', ')}`,
  );
}
