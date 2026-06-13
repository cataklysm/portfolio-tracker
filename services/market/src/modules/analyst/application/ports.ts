/** Analyst consensus for a symbol, normalized away from provider specifics. */
export interface AnalystAssessment {
  targetLow: number | null;
  targetHigh: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  recommendationKey: string | null;
  recommendationMean: number | null;
  numberOfAnalysts: number | null;
}

export interface AnalystProvider {
  readonly name: string;
  fetchAssessment(providerSymbol: string): Promise<AnalystAssessment | null>;
}

/** An assessment ready to publish, attributed to its instrument + quote currency. */
export interface AnalystAssessmentEvent extends AnalystAssessment {
  instrumentId: string;
  currency: string;
}

/** Writes an analyst-assessment event to the transactional outbox. */
export interface AnalystEventStore {
  enqueueAnalystAssessment(input: AnalystAssessmentEvent): Promise<void>;
}
