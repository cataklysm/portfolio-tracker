# Portfolio Intelligence Platform

A self-hosted, multi-user portfolio intelligence platform combining portfolio
accounting, market data, fundamentals, valuation, insights, and market events.

The authoritative product and architecture specification is
[`documentation/prompt.md`](documentation/prompt.md).

## Current State

The consolidated database baseline and transformed development dataset implement
the current design from the specification. The existing authentication,
portfolio, and web prototypes still target the superseded prototype schema and
must be rebuilt against the new service contracts before they can run with this
database.

## Prerequisites

- Current Node.js LTS; `.nvmrc` pins the repository's selected major version
- pnpm through Corepack
- PostgreSQL 13 or newer
- Redis for services that use caching or Redis Streams

## Project Structure

```text
.
├── documentation/
│   ├── prompt.md
│   └── open-decisions.md
├── packages/
│   └── database/
│       ├── migrations/
│       │   └── 001_schema.sql
│       └── seeds/development/
│           ├── 001_identity_instruments.sql
│           ├── 002_portfolio.sql
│           └── 003_market_research.sql
├── scripts/
│   ├── migrate.ts
│   └── seed-development.ts
├── services/
└── web/
```

## Database Setup

The default personal/development deployment uses one PostgreSQL database named
`tracker` with a login role named `portfolio`.

Connect as a PostgreSQL administrator and run:

```sql
CREATE USER portfolio WITH PASSWORD 'replace-with-a-strong-password';

CREATE DATABASE tracker
    OWNER portfolio
    ENCODING 'UTF8'
    TEMPLATE template0;

GRANT ALL PRIVILEGES ON DATABASE tracker TO portfolio;
```

The consolidated migration creates seven service-owned schemas inside this one
database:

```text
tracker
├── authentication
├── instruments
├── portfolio
├── market
├── fundamentals
├── events
└── insights
```

These schemas are logical ownership boundaries, not separate databases. A
scaled deployment may later move them into separate databases or PostgreSQL
instances.

## Environment

Copy `.env.example` to `.env` and configure at least:

```env
DATABASE_URL=postgresql://portfolio:replace-with-a-strong-password@localhost:5432/tracker
VALKEY_URL=redis://:replace-with-a-strong-password@localhost:6379
```

`VALKEY_URL` is retained temporarily for compatibility with the existing
prototype services. New service implementations should use the Redis
configuration naming established when those services are rebuilt.

## Install And Initialize

```bash
nvm use
corepack enable
pnpm install

# pnpm may require explicit approval for the native Argon2 build.
pnpm approve-builds

# Apply the single consolidated fresh-install baseline.
pnpm db:migrate

# Optional: load the rich development dataset.
pnpm db:seed:development
```

The development seed is repeatable and contains:

- One development administrator and portfolio
- 27 instruments, listings, positions, and their authoritative transactions
- Historical price quotes and FX rates
- Sample fundamentals, earnings, fair-value estimates, and price targets

Development login:

```text
Email:    dev@example.com
Password: qwerty
```

Never load the development seed in production.

## Fresh Database Reset

The baseline migration is intended for a newly created database. During the
current design phase, reset by dropping and recreating the database:

```sql
DROP DATABASE tracker WITH (FORCE);

CREATE DATABASE tracker
    OWNER portfolio
    ENCODING 'UTF8'
    TEMPLATE template0;
```

Then rerun:

```bash
pnpm db:migrate
pnpm db:seed:development
```

## Verification

```bash
pnpm typecheck
```

To verify PostgreSQL connectivity before running migrations:

```bash
psql "$DATABASE_URL" -c "SELECT 1;"
```

When PostgreSQL runs on another host, configure `listen_addresses`,
`pg_hba.conf`, firewall rules, and TLS appropriately. Do not broadly expose
PostgreSQL to untrusted networks.
