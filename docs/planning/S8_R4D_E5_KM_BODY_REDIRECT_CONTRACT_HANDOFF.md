# S8-R4D-E5 — KM_BODY REDIRECT CONTRACT ROOT-CAUSE + REPAIR PREFLIGHT
## HANDOFF. Not investigated yet, not repaired, not assumed. Audit before implementation.

```
STATUS      CLOSED — DIAGNOSTIC INSTRUMENT FAULT. Superseded by S8_R4D_E5_KM_BODY_REDIRECT_CONTRACT_PREFLIGHT.md
LIVE RESULT tablesRead 13 · recentWindowApplied true · onlyRequested_count 13 · 0 exposure tables
KM_BODY_RUNTIME_DEFECT = NO · REDIRECT_CONTRACT_DEFECT = NO · ROUTER_PARSE_DEFECT = NO
RAISED BY   S8-R4D-E3A (first sighting) · S8-R4D-E3D (one-shot) · S8-R4D-E4-C (one-shot) — all three
            INVALID_FOR_CANONICAL_FIRST_LAYER_MEASUREMENT
```

> **This brief's premise did not survive its own audit, and the text below is kept unedited as the record of
> what was believed.** All three sightings were probes built to the WRONG BODY SHAPE: the shipped body is the
> workspace DTO envelope and `60_` reads `body.payload`, while every probe sent a flat `{ recentWindow, only }`
> through `KM.transport.readUrl` — which serialises the body it is handed and builds no envelope. The server
> answered that request correctly, and nineteen tables is the correct answer to it. §3 below says the URL
> builder is shared and therefore not a candidate; that is true and it is also not enough, because the builder
> is shared and **the body is not**. Nothing is proven lost at any hop. One read-only Production call through
> `window.KM.api.getWorkspace` settles what remains — PREFLIGHT §8.

---

## 1. The proven failure signature

Taken from the **successful** R45 acceptance one-shot, on a sealed, uniform R45 deployment:

```
recentWindowRequested = false       recentWindowApplied = false
onlyRequested         = null        requestEcho.only_count = null
tablesRead            = 19          bytes = 12,770,434  (12.18 MB)
redirected            = true        final_host = script.googleusercontent.com
```

```
19 = 13 first-layer tables + 6 lazy exposure tables
```

That identity is **closed** and it is the one thing E5 inherits as settled. An earlier round held that a
theory which cannot account for 19 is not the theory; 19 is now exactly what the handler reads when no
`only` survives. The observation is fully consistent with body loss. **Where** it is lost is the question.

## 2. E5 is a performance round as well as a correctness round

After R45 closed the normalization bottleneck, the remaining cost is this defect:

```
wall_ms 19,111
  serverDurationMs 10,296
    openMs 296 + batchMetadata 333 + batchValues 2,049 + normalization 433 = 3,111 ms measured
    RESIDUAL 7,185 ms (69.8% of server time) — view-model build + serializing 12.18 MB, unmeasured by any counter
  WALL_MINUS_SERVER 8,815 ms (46.1% of wall) — redirect + transfer + browser parse, combined, not isolated
```

One causal chain, not three candidates:

```
km_body lost -> `only` never applies -> 19 tables instead of 13 -> 12.18 MB -> 7,185 ms build/serialize
                                                                            -> 8,815 ms transport
```

## 3. What is established, and what is NOT

**Established.** The URL builder is shared and is therefore no longer a candidate explanation. The
acceptance one-shot built its URL with `KM.transport.readUrl`
([km-transport.js:707](../../assets/js/api/km-transport.js#L707)) and the shipped page read builds from the
**same** `readQuery` ([:827](../../assets/js/api/km-transport.js#L827), via `urlFor`). The command also
refused to dispatch unless `km_body=` was present in the URL — so the parameter **left the browser**.

**Not established, and must not be written down as though it were:**

- **The dispatch differed.** The one-shot issued a raw `fetch`; the page issues through `_fetch` inside
  `KM.transport.request()`. Whether the two handle the `/exec -> googleusercontent` redirect identically is
  **unknown**. The page's own reads are *suspected*, not convicted.
- **Which hop drops it.** Browser → `/exec` → 302 → `script.googleusercontent.com` → `doGet` →
  `rtrParseGetBody_` → handler is six boundaries and no evidence names one.
- **Whether it is loss or non-application.** The parameter could arrive and be ignored. `recentWindow` and
  `only` are *both* absent, which is the "km_body absent" signature — but absent-at-the-parser and
  absent-at-the-handler are different defects with different repairs.

## 4. The two questions E5 owns

```
Q1  WHERE is km_body lost or ignored, proven at a named hop?
Q2  Has the R42/R43 `only` + `recentWindow` optimization EVER been effective in Production?
```

**Q2 is the one with consequences.** If the body has never arrived, every first-layer read has been reading
the full workspace rather than thirteen tables, and three rounds of measured improvement were measured
against a request nobody was sending. That would not make R43, R44 or R45 wrong — each made the read it
actually performed faster, and R45's 99.4% is real either way — but the *scope* of that read was never what
the contract says.

## 5. Audit order, before any implementation

```
1  shipped frontend request construction      inventory-replenishment.js:10356 -> KM.api.getWorkspace
2  km_body encoding                           readQuery: encodeURIComponent(JSON.stringify(body)), ONE encode
3  GET /exec request                          _fetch vs the raw fetch used by the one-shot
4  Apps Script redirect behaviour             302 to script.googleusercontent.com, query survival
5  echo / final-host handling                 what the client does with res.url and res.redirected
6  router parameter parsing                   rtrParseGetBody_, 01_router.gs:170 · RTR_GET_BODY_MAX_ 4000
7  body reconstruction                        the read table forwards _rtrGet.body, NOT the query merge (:319-324)
8  workspace handler input                    60_ reads payload.recentWindow / payload.only
9  fallback / compatibility paths             any path that silently substitutes an empty body
```

```
CLASSIFY AS EXACTLY ONE:
  ENCODING · REDIRECT · ROUTER_PARSE · BODY_RECONSTRUCTION · CLIENT_RECOVERY · COMPATIBILITY_FALLBACK · OTHER
```

Evidence already in hand, so E5 does not re-derive it:

```
GET READ CONTRACT  action=<a>&km_via=get&km_tc=<ver>&km_rid=<id>&km_body=<encodeURIComponent(JSON)>
PARSER PROVEN by execution against five candidate shapes (S8-R4D-E3A):
  decoded km_body     -> ok, 13 tables          still percent-encoded -> READ_BODY_MALFORMED
  km_body ABSENT      -> ok, recentWindow undefined, only null   <- the observed signature
  action mismatch     -> READ_BODY_ACTION_MISMATCH
SERVER SIDE        60_ has ZERO Logger.log calls — no server-side correlation exists for a given km_rid
```

A read is a GET **on purpose**: a POST crossing the Apps Script 302 loses its body by specification. The
finding is that the parameter may be being lost anyway, through the route chosen to avoid exactly that.

## 6. Enterprise scalability requirement — frozen

```
THE REPAIRED CONTRACT MUST GUARANTEE:
  growth of unrelated lazy / detail tables does NOT increase Site Inventory first-layer payload
  or first-load server work.
FIRST-LAYER BOUNDARY = exactly the frozen 13-table set, unless a SEPARATE architecture decision changes it.
Full Shipment / Shipment Line / Shipping Plan / Allocation detail REMAINS LAZY.
```

**Making the current request faster is not the objective.** A repair that leaves the first layer coupled to
tables it does not render fails this requirement even if it is quicker today.

## 7. Forbidden solutions

```
NO  raising the client timeout — that hides the symptom and keeps the coupling
NO  accepting the 19-table over-read
NO  removing request scoping
NO  moving lazy exposure tables back into the first layer
NO  assuming the page read behaves like the one-shot because the URL builder is shared
NO  assuming the loss is in the redirect because the redirect is the most interesting hop
NO  repairing anything before the hop is named
NO  blind retries — the browser cannot see hop boundaries inside a fetch, which is why S8-R4D-E3B refused
    to ask for five more samples and why this needs server-side evidence instead
```

Server-side instrumentation is the obvious instrument — a bounded log of `e.parameter` **key names**
(never values) at router entry, correlated by `km_rid`. That is a runtime change and needs its own
authorization.

```
STOP AT THE IMPLEMENTATION PREFLIGHT if the repair requires a transport or API architecture decision.
Prove the root cause first; present the decision rather than taking it.
```

## 8. Queued elsewhere — do not mix in

```
A  AUTO_LOAD_PRODUCT_DECISION   deferred until E5's real first-layer latency/payload is measured.
                                See S8_R4D_E4_C_R45_PRODUCTION_ACCEPTANCE.md §8 for the full trace.
B  R4D-F ON-THE-WAY             first-layer aggregate ONLY: company + marketplace/site + sku +
                                on_the_way_qty. Full shipment detail stays lazy. Contract frozen in
                                S8_R4D_E1A_ON_THE_WAY_CONTRACT_FREEZE.md.
C  G1 AMAZON INVENTORY BLANK-DATE   separate data-correctness architecture decision. NO Amazon importer
                                change belongs in E5.
D  showSection is not defined   separate UI debt, unless evidence proves it interferes with the Site
                                Inventory lifecycle.
```
