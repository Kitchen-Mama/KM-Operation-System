# Backend portability boundary and the future migration sequence

**Task:** F1-7N-FB-4E §G · **Recorded:** 2026-08-26
**Boundary:** `assets/js/api/km-data-access.js` (`KM.dataAccess`) over `assets/js/api/km-transport.js` (`KM.transport`)
**Contract test:** `assets/tests/shared-api-transport-reliability-f1-7n-fb-4e.test.js` §G

## 0. What this document is not

**No database was migrated in this round.** No Supabase project, no BigQuery dataset, no dual write, no live
connection, and no credential anywhere in the frontend. This records the boundary that now exists and the order
in which a future migration would have to happen. The transport incident FB-4E fixed is repaired independently
of any of it — nothing below is a prerequisite for that fix, and the fix is not a step toward it.

## 1. The layering

```
UI / page
   │   names a RESOURCE and a SCOPE. Never a URL, a sheet, a tab, a row index or a column letter.
   ▼
domain query | command            QuerySpec  { resource, scope, filters, projection, page, include }
   │                             CommandSpec { resource, operation, payload, idempotencyKey, verify }
   ▼
KM.dataAccess (repository)        the ONE place a resource meets a backend action name
   │
   ├── appsScriptAdapter  ──►  KM.transport  ──►  Apps Script Web App /exec     ← the only adapter wired today
   ├── inMemoryAdapter                                                          ← real, used by the contract test
   ├── (future) supabasePostgresAdapter                                          ← transactional
   └── (future) bigQueryAdapter                                                  ← read / reporting ONLY
```

Every adapter answers with the same envelope:

```js
{ ok, state, data: { rows, rowCount, page }, error: { kind, code, message, details, retryable }, meta }
```

`state` is one of the seven §F UI states, so a page renders from the envelope alone and never has to infer
whether "no rows" meant a failure.

## 2. Why the boundary is a boundary and not a rename

§G6 rules out "fake abstractions with only renamed current functions". Three properties make this one real, and
each is asserted by the contract test rather than described here:

1. **Two adapters, one contract.** The same five `QuerySpec` objects — including a projection, a second page and
   a scope that matches nothing — go to the Apps Script adapter (over an injected transport) and to a genuinely
   working in-memory adapter, and the envelopes must be **identical**, field for field. If only one
   implementation could produce the envelope there would be nothing to keep.
2. **Errors are split by KIND, not by severity.** `TRANSPORT` / `BUSINESS` / `CONFIGURATION` are separate, so
   "the API is unreachable" and "the backend said no, here is why" can never collapse into one "read error" —
   which is precisely what the six failing pages were doing.
3. **Capabilities are machine facts.** `CAPABILITIES.BIGQUERY.transactionalWrite === false`, and
   `createRepository` **refuses** a command against a read-only adapter with `ADAPTER_IS_READ_ONLY` rather than
   attempting it. §G7 is enforced by the code path, not by a warning in a document.

## 3. Rules that hold now and must keep holding

| # | Rule | How it is held |
| --- | --- | --- |
| 1 | Pages never see Apps Script URLs, sheet names or row indexes | the boundary contains no URL, no `getRange`/`getSheetByName`, no row index — asserted |
| 2 | Domain DTOs and envelopes are stable across adapters | one contract test, two adapters, identical envelopes |
| 3 | Transport errors are separate from business errors | `error.kind` — `TRANSPORT` vs `BUSINESS` vs `CONFIGURATION` |
| 4 | Scope, filters, pagination and projection are explicit request DTOs | `querySpec()` normalizes and sorts them; no implicit backend default |
| 5 | Writes use explicit commands, idempotency keys and verification envelopes | `commandSpec()`; a keyless command is refused **before** any request |
| 6 | No fake abstraction | see §2 |
| 7 | BigQuery is never a transactional-write replacement | `CAPABILITIES` + `ADAPTER_IS_READ_ONLY` |
| 8 | No Supabase/BigQuery credential in frontend code | asserted: no `SUPABASE_*`, no `service_role`, no `apikey`, no `Bearer ` |
| 9 | No dual write, no live Supabase/BQ connection in this task | only `appsScriptAdapter` is constructed anywhere in production code |
| 10 | A documented migration sequence | §4 below |
| 11 | Exact quantity, identity, status and read-after-write contracts preserved | the idempotency-key replay semantics are exercised on both adapters; the K2 group contract and the write barriers are untouched by this round |

## 4. The migration sequence, if and when it happens

Each phase is reversible on its own and none of them starts before the previous one has a **written parity
result**. The order matters: reads before writes, and reporting before either.

### Phase 0 — prerequisites (not started)
A Supabase/Postgres schema that mirrors the canonical tables' **identity** columns exactly — the K2 shipment
group's ten route dimensions, the line natural key `sku|site_sku|window_code`, and the lifecycle status
vocabulary. A schema that cannot express the current identity cannot be shadow-read against, let alone cut over.
Credentials live server-side only; the frontend never holds one, in this phase or any later one.

### Phase 1 — shadow reads
Both adapters answer the same `QuerySpec`; the Apps Script answer is the one rendered. The second answer is
never shown and never written back. Its only job is to be compared.

### Phase 2 — parity reports
A read-only report per resource: row counts, per-row identity match, quantity totals, and a list of divergences
with their identity keys. **A resource does not proceed while it has an unexplained divergence.** "Explained"
means a named, recorded reason — not a tolerance.

### Phase 3 — scoped read cutover
One resource at a time, and only where Phase 2 was clean across a full cycle. The scope stays explicit in the
`QuerySpec`, so the cutover is a per-resource adapter swap and the rollback is the same swap back. Reporting
reads (FC summary aggregates, historical projections) may cut over to BigQuery here; transactional reads may
not.

### Phase 4 — transactional write cutover, where appropriate
**Only** for resources whose writes are already idempotency-keyed and verification-enveloped, and **only** to a
transactional adapter. BigQuery is excluded by capability, not by discipline. Each write cutover keeps the
existing pre-write gates — the duplicate-primary-key scan, the schema validate-only gate, the route-group-key
binding — because those are business barriers, not transport details.

### Phase 5 — reconciliation
A standing read-only reconciliation per migrated resource: identity, quantity and status, against the retained
source. It runs after the cutover, not instead of it. A reconciliation failure is a rollback trigger, and the
rollback is the Phase-3 adapter swap in reverse.

## 5. Boundaries this round deliberately did not cross

- The resource map covers the surfaces the incident touched. Extending it is a per-resource decision and needs
  its own review; guessing a mapping is worse than not having one, because a wrong action name fails as a
  business error and reads like a data problem.
- No page was rewritten onto the boundary. Doing that is a migration in itself, and doing it in the same round
  as a transport repair would make the repair unverifiable. The boundary exists, is tested, and is available.
- BigQuery has no adapter implementation, only a declared capability set. Writing one before there is a dataset
  to read would be inventing a contract with nothing on the other side of it.
