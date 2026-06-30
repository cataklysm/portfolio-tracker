/** A quote-update push delivered to one connected client. */
export interface QuoteUpdate {
  /** The user's held listings whose quotes just changed (the event's subset). */
  listingIds: string[];
  /** Provider-supplied "as of" instant for the batch (ISO), when present. */
  asOf: string | null;
}

/** A push sink for one connected SSE client (one browser tab). */
export type QuoteUpdateSink = (update: QuoteUpdate) => void;

/**
 * In-memory registry of connected SSE clients, keyed by user; each open tab is
 * one sink. State is per process: with multiple replicas every replica tails the
 * market stream (see MarketQuoteStream) and serves only its own connections, so a
 * user on replica A is still reached when replica B also observes the event.
 */
export class LiveQuoteHub {
  private readonly clients = new Map<string, Set<QuoteUpdateSink>>();

  /** Registers a sink for the user; returns an idempotent unsubscribe. */
  subscribe(userId: string, sink: QuoteUpdateSink): () => void {
    const set = this.clients.get(userId) ?? new Set<QuoteUpdateSink>();
    set.add(sink);
    this.clients.set(userId, set);
    return () => {
      const current = this.clients.get(userId);
      if (!current) return;
      current.delete(sink);
      if (current.size === 0) this.clients.delete(userId);
    };
  }

  hasSubscribers(userId: string): boolean {
    return (this.clients.get(userId)?.size ?? 0) > 0;
  }

  /** The users with at least one open connection — the only ones worth resolving. */
  connectedUserIds(): string[] {
    return [...this.clients.keys()];
  }

  publish(userId: string, update: QuoteUpdate): void {
    const set = this.clients.get(userId);
    if (!set) return;
    for (const sink of set) sink(update);
  }
}
