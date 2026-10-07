# S8-R4D-E5 — KM_BODY REDIRECT CONTRACT ROOT-CAUSE AUDIT
## HANDOFF ONLY. Not investigated in R45, not repaired in R45, not assumed in R45.

```
STATUS      OPEN · HIGH PRIORITY · NO CAUSE ASSIGNED
RAISED BY   S8-R4D-E3A (first sighting) · S8-R4D-E3D (reproduced through shipped code)
CARRIED BY  S8-R4D-E4-B — recorded without investigation, because R45 owns the normalization cost
            and nothing else. If this finding were folded in, a PASS on normalizationMs and a FAIL on
            the request contract would arrive under one verdict.
```

---

## 1. The observation, twice

```
E3A  hand-built GET URL      requestEcho.recentWindow = false · only = null · all tables returned
E3D  KM.transport.readUrl    requestEcho.recentWindow = false · only = null · tablesRead = 19
                             redirected = true · final_host = script.googleusercontent.com
```

The first was dismissed as mine, and that dismissal was correct: executing the shipped parser
`rtrParseGetBody_` against five candidate shapes showed only **"km_body absent"** produces all four
observed facts at once, and a hand-built transport is not the shipped transport.

**The second sighting is not dismissible the same way.** The URL came from
`KM.transport.readUrl` — [km-transport.js:707](../../assets/js/api/km-transport.js#L707) — and the
shipped read path builds its URL from the **same** `readQuery` function
([:827](../../assets/js/api/km-transport.js#L827), via `urlFor`). The builder is shared and is therefore
no longer a candidate explanation.

## 2. What is NOT yet established, and must not be written down as though it were

- **The dispatch differed.** The E3D one-shot built the URL with the shipped builder and then issued a
  **raw `fetch`**; the page issues it through `_fetch` inside `KM.transport.request()`. Whether the two
  handle the `/exec → googleusercontent` redirect identically is **unknown**. Until it is measured, the
  page's own reads are *suspected*, not convicted.
- **`tablesRead = 19` is a discriminator nobody has explained.** `SIR_WORKSPACE_TABLES_` declares 21 and
  `only` would give 13. Nineteen is neither. A theory that cannot account for 19 is not the theory.
- **Which hop drops the parameter.** Browser → `/exec` → 302 → `script.googleusercontent.com` → `doGet`
  → `rtrParseGetBody_` is five boundaries and no evidence yet names one.

## 3. The two questions E5 owns

```
Q1  Does km_body survive the full chain, for the SHIPPED page read specifically?
Q2  Has the R42/R43 `only` + `recentWindow` optimization ever been effective in Production?
```

**Q2 is the one with consequences.** If the body has never arrived, then every first-layer read has been
reading the full workspace rather than thirteen tables, and three rounds of measured improvement were
measured against a request that was not the request anybody thought was being sent. That would not make
R43 or R44 wrong — both made the read they actually performed faster — but it would mean the *scope* of
that read was never what the contract says.

## 4. Evidence already in hand, so E5 does not re-derive it

```
GET READ CONTRACT  action=<a>&km_via=get&km_tc=<ver>&km_rid=<id>&km_body=<encodeURIComponent(JSON)>
PARSER             rtrParseGetBody_  01_router.gs:170   RTR_GET_BODY_MAX_ = 4000
READ TABLE         forwards _rtrGet.body, NOT the query merge   01_router.gs:319-324
PARSER BEHAVIOUR   decoded body -> ok, 13 tables      still-encoded -> READ_BODY_MALFORMED
                   km_body absent -> ok, recentWindow=undefined, only=null   <- the observed signature
                   action mismatch -> READ_BODY_ACTION_MISMATCH
SERVER SIDE        60_ has ZERO Logger.log calls, so no server-side correlation exists for a given rid
```

A read is a GET **on purpose**: a POST crossing the Apps Script 302 loses its body by specification. The
finding is that the parameter may be being lost anyway, through the route chosen to avoid exactly that.

## 5. What E5 must not do

```
NO  assuming the page read behaves like the one-shot because the URL builder is shared
NO  assuming the loss is in the redirect because the redirect is the most interesting hop
NO  repairing anything before the hop is named
NO  blind retries — the browser cannot see hop boundaries inside a fetch, which is why E3B refused
    to ask for five more samples and why this needs server-side evidence instead
```

Server-side instrumentation is the obvious instrument — a bounded `Logger.log` of
`e.parameter` key names (never values) at router entry, correlated by `km_rid` — and it is a runtime
change, so it needs its own authorization.
