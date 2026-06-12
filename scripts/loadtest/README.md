# Load / concurrency test harness

Safe, offline-ish load test for the order pipeline. It exercises the **real**
`lib/sheets.ts` functions against a **separate TEST Google Sheet** — never
production, never Shopify / LINE / SlipOK (those channels are hard-disabled in
`_env.ts`).

## One-time setup (needs YOU)

1. Create a **fresh, blank Google Sheet** (e.g. "UNIT-01 LOADTEST").
2. Share it as **Editor** with the service account:
   `unit01-sheets@unit-01-491006.iam.gserviceaccount.com`
3. Copy its ID from the URL
   (`https://docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit`).
4. Create `scripts/loadtest/.env.test.local` with:
   ```
   TEST_SHEET_ID=<the id from step 3>
   ```
5. Build the tab structure (Orders / Stock / Stock Log):
   ```
   npm run loadtest:clone
   ```

The harness **refuses to run** if `TEST_SHEET_ID` is missing or equals the
production `GOOGLE_SHEETS_ID` (guard in `_env.ts`).

## Run

```
npm run loadtest:a        # A: 50 concurrent writes — integrity + throughput
npm run loadtest:b        # B: oversell at stock=1 — baseline vs fixed
npm run loadtest:c        # C: identical-amount slip matching + double-claim
npm run loadtest:d        # D: reserved / available accounting integrity
npm run loadtest:all      # A→D in sequence
npm run loadtest:clean    # wipe test data (keeps headers)
```

Args: `npx tsx scripts/loadtest/B-oversell.ts 50 1` → 50 buyers, stock 1.

## What each test proves

| Test | Race condition | Baseline | Fixed |
|------|----------------|----------|-------|
| A | Sheets concurrent writes | row integrity + 429 rate | — |
| B | Oversell (no stock check) | N orders for stock 1 | `createOrderGuarded()` caps at stock |
| C1 | Slip match (same amount) | must match own order | — |
| C2 | Double slip claim (same ref) | both can win | `claimAndMarkPaid()` → one wins |
| D | Reserved/Available math | exact counts | — |

## The fixes (in `lib/sheets.ts`)

- `withLock()` — in-process async mutex serialising check-then-write sections.
- `createOrderGuarded()` — stock check + append inside one locked section.
- `claimAndMarkPaid()` — duplicate-ref check + PAID write inside one locked section.

**Scope:** the mutex removes both races within a single Node/Vercel instance.
Vercel can run multiple instances under extreme bursts, so this is not a
distributed lock — but with the daily reconcile watchdog any residual
cross-instance race is rare **and** detectable, not silent. A hard guarantee
needs an authoritative transactional store (DB or Shopify inventory hold).
