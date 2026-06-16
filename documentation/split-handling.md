# Split & corporate-action handling for stored price series

Design note — 2026-06-16. Status: **agreed design, not yet implemented.**

## Problem

Once we persist a historical price series, every instrument is one corporate
action away from a discontinuity. A stock split rebases the price on its ex-date,
so a stored series that spans a split shows a vertical **cliff** — which looks
like a huge one-day move and corrupts any chart or return/performance/risk
calculation that crosses it.

Whether this is *our* problem depends on the data source:

- **Adjusted sources (e.g. Yahoo)** back-adjust history themselves; their series
  self-heal on the next full re-pull. We must **not** re-adjust them (double
  adjustment corrupts the data).
- **Unadjusted/raw sources (e.g. Lang & Schwarz / `lstc`)** never adjust. The
  cliff is permanent in their feed; we have to handle it.

Confirmed example: the L&S Netflix series (`instrumentId 41939`) drops
`957 → 95.135` on 2025-11-17 (×0.099 ≈ a 10:1 split), and has earlier cliffs in
2004 (≈1/2) and 2005 (≈1/7). It is fully unadjusted.

## Decision summary

> **adjust-on-read · non-destructive · split set detected from the raw series
> OR entered manually by an admin · admin-confirmed (insolvency-safe) ·
> corporate actions as corroboration · applied per-listing to raw-provider series
> only · both split directions.**

The confirmed split set has **two entry paths that converge**: (1) detector
proposes a candidate → admin confirms; (2) admin **enters a split manually**.
Both end up as the same kind of confirmed record consumed by adjust-on-read; the
admin is always the authority.

## Why adjust-on-read (not in-place mutation)

Keep stored quotes exactly **as reported**; apply split factors when *serving* a
series/chart. Rationale:

- **Non-destructive / auditable** — a wrong or later-withdrawn split never
  corrupts stored data; un-confirming a split simply un-adjusts the next render.
- **Reversible** — no migration of rows, no risk of double-adjustment.
- Cost is a little read-time math; splits are rare and the factor set is tiny, so
  this is cheap. (In-place mutation was considered and rejected as destructive.)

## Why detect from the raw series

For an **unadjusted** feed a split is *self-evident*: a single-day move that is a
clean simple-ratio step. So the raw feed is its own authoritative, complete-back-
to-series-start split source — no dependency on an external calendar that may not
match this venue's data (Yahoo's real-world split dates do **not** necessarily
line up with the L&S series, e.g. the 2005 ≈1/7 cliff above).

The events service's `events.corporate_actions` (from Yahoo) is used only as a
**corroboration hint**, not the authority — and note our Yahoo corporate-actions
lookback is currently ~10y, so it is not even a complete split list on its own.

## Why admin confirmation — the insolvency & small-ratio problem

Pure ratio detection cannot, in principle, distinguish:

- a **10:1 split** from a company **cratering ~90% on insolvency** with **no split
  announced** — same ×0.1 step; only context/news tells them apart;
- a **2:1 split** (×0.5) or **3:2** (×0.667) from an ordinary bad day — small-ratio
  splits sit **inside normal volatility**. Detection confidence is high for large
  ratios (1/7, 1/10) and **low for small ones** (1/2, 1/3, reverse 1:2).

Therefore detection only ever **proposes**; a human **confirms**. The safe default
is: a ratio-clean move with **no corroborating corporate action** is treated as a
**real price move** (crash/insolvency) and left unadjusted unless an admin
explicitly confirms a split happened. "No announcement → don't adjust."

## Detection

Run on history ingest/refresh for raw-provider listings. Scan adjacent closes for
candidate splits, **in both directions**:

- **Forward split** — clean downward ratio (2:1 → ×0.5, 7:1 → ×0.143, 10:1 → ×0.1).
- **Reverse split** — clean upward ratio (1:2 → ×2, 1:10 → ×10).

Candidate criteria:

1. Day-over-day ratio within a tight tolerance (~0.5%) of a small fraction
   `p/q` (small `p,q` ∈ {2,3,4,5,6,7,8,10,…}, either orientation).
2. The new level **persists** (next sessions don't revert) — distinguishes a split
   from a transient bad print/flash. (Note: persistence does *not* distinguish a
   split from an insolvency crash — both persist; only the announcement/admin
   does.)
3. Attach a **confidence** hint from ratio magnitude (large = high, small = low)
   and whether a corroborating corporate action exists within ±a few days.

Detection is an **assist**, never an auto-apply.

## Confirmation workflow & states

Each record is keyed by `(listing_id, ex_date)` (so a given cliff is proposed once
and never re-proposed after a decision) and carries its `origin`
(`detected` | `manual`). Three states:

- `pending` — detected, awaiting review.
- `confirmed` — an admin verified a split occurred (with the ratio; admin may
  **edit** the ratio, e.g. detector guessed 1/7, admin sets exact 1:7).
- `rejected` — not a split (the insolvency/crash case); remembered, never
  re-flagged, series stays raw.

The admin review surface (alongside the existing Providers/Exchanges/Symbols
admin views) shows: instrument, ex-date, detected ratio, the before/after prices,
and **corroborating corporate action: found / none**. Actions: confirm / reject /
edit-ratio.

### Manual split entry (first-class)

An admin can **record a split directly**, independent of the detector, for the
occasions detection can't cover:

- the detector **missed it** — no clean cliff (gradual rebase, illiquid venue,
  partial-day data);
- the split is **announced but not yet ex** — enter it ahead of time (future
  ex-date), so the series stays continuous the moment the rebased prices arrive;
- a **correction** — fix or remove a previously recorded split.

A manually entered split is created **directly in `confirmed`** (the admin is the
authority — no separate confirmation step) with: instrument/listing, ex-date,
ratio + direction (forward or reverse), and an optional note. It must be
**editable and removable** afterwards, and — being adjust-on-read — every change
takes effect on the next render with no data migration. Manual and detected
splits live in the **same store** and are treated identically by adjust-on-read,
so the effective corporate-action set is ultimately **admin-curated**, with
detection as the assist.

## Applying adjustments (adjust-on-read)

When serving a series/chart for a listing whose quotes come from a **raw
provider**: multiply each stored close at date `d` by the cumulative factor of all
**confirmed** splits with ex-date `> d`. Yahoo (adjusted) series are served
untouched. Confirmed reverse splits divide instead of multiply (handled by using
the signed ratio).

## Provider-awareness

A provider needs a `servesAdjustedHistory` flag (Yahoo = true, lstc = false).
Only raw-provider series are eligible for detection and read-time adjustment.
Stored quotes are already tagged with their provider, and a series is single-
provider per the existing rebuild rule, so this is a per-listing property.

## Cross-service wiring

- **market service** — detector over stored raw-provider series; the read path
  (series/chart/daily-history) applies confirmed factors; owns the
  candidate/confirmation store (it has the price data).
- **admin endpoint + UI** — list pending candidates; confirm/reject/edit/add.
- **events service** — `events.corporate_actions` consulted as the corroboration
  hint (widen the Yahoo split lookback so it's a useful corroborator).

## Idempotency & edge cases

- Candidates keyed by `(listing_id, ex_date)`; decisions are sticky.
- Confirm/un-confirm is non-destructive and takes effect on next read.
- Reverse splits supported (upward clean-ratio jump).
- Small-ratio candidates carry low confidence → lean on corroboration + admin.
- A buyout/squeeze (+100% in a day, no split) is the reverse-direction analogue of
  the insolvency case and is handled the same way: no announcement → reject.

## Non-goals (for now)

- In-place mutation of stored quotes (rejected: destructive).
- Trusting an external split calendar as the sole authority.
- Auto-confirming corroborated candidates (kept manual by decision — the human
  gate is the point).
