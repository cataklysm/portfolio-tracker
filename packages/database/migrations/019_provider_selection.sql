-- =============================================================================
-- Instruments service — per-(instrument × capability) provider selection
-- =============================================================================
-- Which provider serves each data-retrieval capability for a given instrument.
-- This is instrument-coupled (it references an instrument), so it lives in the
-- instruments service; it references a provider only by name (the provider's
-- intrinsic settings live in providers.provider_settings — no cross-schema FK).
--
-- Selectable capabilities are the per-instrument data-retrieval ones. `fx` is
-- global (ECB, not instrument-scoped) and `symbol_search` is a discovery
-- operation used before an instrument exists — both are excluded here.
--
-- The `quotes` = `chart` "same provider" rule (they are one price series) is
-- enforced in the application layer (the selection service writes both rows
-- together), not by a cross-row DB constraint.
-- =============================================================================

CREATE TABLE instruments.provider_selection (
    instrument_id uuid NOT NULL REFERENCES instruments.instruments(id) ON DELETE CASCADE,
    capability    text NOT NULL CHECK (capability IN (
                      'quotes', 'chart', 'analyst', 'fundamentals',
                      'earnings', 'corporate_actions', 'news')),
    provider      text NOT NULL,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (instrument_id, capability)
);

CREATE INDEX instruments_provider_selection_capability_idx
    ON instruments.provider_selection (capability, provider);

-- Backfill: preserve today's behavior — every existing instrument is served by
-- Yahoo for all selectable capabilities (Yahoo was the only symbol provider).
INSERT INTO instruments.provider_selection (instrument_id, capability, provider)
SELECT i.id, c.capability, 'yahoo'
FROM instruments.instruments i
CROSS JOIN (VALUES
    ('quotes'), ('chart'), ('analyst'), ('fundamentals'),
    ('earnings'), ('corporate_actions'), ('news')
) AS c(capability)
ON CONFLICT (instrument_id, capability) DO NOTHING;
