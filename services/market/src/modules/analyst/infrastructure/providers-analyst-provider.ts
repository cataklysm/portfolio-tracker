import type { ProvidersClient } from '../../../platform/providers/providers-client.js';
import type { AnalystAssessment, AnalystProvider } from '../application/ports.js';

/** Analyst-consensus provider backed by the providers service. */
export class ProvidersAnalystProvider implements AnalystProvider {
  constructor(private readonly client: ProvidersClient) {}

  fetchAssessment(provider: string, providerSymbol: string): Promise<AnalystAssessment | null> {
    return this.client.fetchAnalyst(providerSymbol, provider);
  }
}
