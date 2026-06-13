import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type { AnalystAssessment, AnalystProvider } from '../application/ports.js';

/** Analyst-consensus provider backed by the providers service. */
export class ProvidersAnalystProvider implements AnalystProvider {
  // `name` is the upstream symbol namespace used by the instruments resolver, so
  // it stays 'yahoo' even though the transport is the providers service.
  readonly name = 'yahoo';

  constructor(private readonly client: ProvidersClient) {}

  fetchAssessment(providerSymbol: string): Promise<AnalystAssessment | null> {
    return this.client.fetchAnalyst(providerSymbol);
  }
}
