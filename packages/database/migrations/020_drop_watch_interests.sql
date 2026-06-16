-- =============================================================================
-- Instruments service — drop the watch-interest projection
-- =============================================================================
-- The refresh model moved from a held/watched subset to the whole active catalog
-- (provider-todo.md P3 + follow-up): market, fundamentals, and events now sweep
-- every active listing via the instruments `/internal/listings/all` +
-- `/internal/refresh-plan` endpoints. The watch-set projection and its
-- event-driven machinery are no longer consumed by any service, so the table is
-- dropped. (The portfolio service still emits position/watchlist events; they are
-- simply no longer projected here.)
-- =============================================================================

DROP TABLE IF EXISTS instruments.watch_interests;
