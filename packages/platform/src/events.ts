/**
 * Shared Redis Streams event-envelope contract. Producing services write an
 * outbox row whose payload matches this envelope in the same transaction as
 * the business-state change; a publisher worker forwards it to Redis Streams.
 * Delivery is at least once, so consumers deduplicate on `event_id` and reject
 * stale updates using the aggregate version.
 */

export interface EventActor {
  type: string;
  id: string;
}

export interface EventAggregate {
  type: string;
  id: string;
  version: number;
}

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  event_id: string;
  event_type: string;
  event_version: number;
  occurred_at: string;
  producer: string;
  aggregate: EventAggregate;
  correlation_id?: string;
  causation_id?: string;
  user_id?: string;
  actor?: EventActor;
  payload: TPayload;
}
