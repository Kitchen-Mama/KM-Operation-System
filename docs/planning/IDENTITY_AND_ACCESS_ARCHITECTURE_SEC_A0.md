# Identity & Access Architecture — SEC-A0 discovery and design freeze

**Status: FROZEN DESIGN · NO RUNTIME CHANGE · BLOCKED ON TWO USER DECISIONS**
**Date: 2026-09-12 · Owner of this document: the AuthN/AuthZ SSOT for the Operation System**

P1-B7F found that Product Strategy could not be activated because production cannot tell who is
calling. SEC-A0 asked how far that reaches. **It reaches everything**, and that changes what should be
built: the boundary is not a Product Strategy prerequisite, it is a system-wide one that Product
Strategy happened to walk into first.

This round writes no runtime code. It inventories the surface, tests whether the obvious answer works,
compares three architectures, freezes the layering, and pins the current posture in a suite so the
description cannot rot. **Two of the required decisions are the user's and are not an agent's to make.**

---

## 1. What is actually exposed

One Web App URL. One deployment. No second backend, no HtmlService page, no `google.script.run`, no
inbound webhook, and no outbound `UrlFetchApp` anywhere in the project.

```
webapp.access      ANYONE_ANONYMOUS      — any person on the internet with the URL
webapp.executeAs   USER_DEPLOYING        — running with the deploying owner's authority
oauthScopes        spreadsheets · script.scriptapp · bigquery
```

Behind that one URL:

| | count | |
|---|---:|---|
| actions routed by `01_router.gs` | **138** | the whole anonymous surface |
| on the `doGet` read table | 23 | reads, survive the 302 as a GET |
| dispatched by `doPost` | 136 | |
| **unambiguous mutations** | **76** | every one reachable without identity |

The mutation set is not marginal. It includes `createPurchaseOrderFromRequest`,
`confirmShipmentAndDispatch`, `submitAllocationDraftsToShippingPlans`, `receivePurchaseOrderLines`,
`importMarketplaceSkusBatch`, `adjustFactoryInventory`, `updateSkuLifecycle`, `upsertTaxRateComponent`
and `automationSchedule.update` — which creates and deletes the project's own time-driven triggers.

**Nothing stands above the dispatch.** There is no gate between `doPost` entry and the first
`action === '…'` branch, which is why SEC-A2 is an insertion and not a repair.

**THE 44-ACTION REQUIRED REGISTRY IS NOT AN AUTHORIZATION SURFACE and must not be mistaken for one.**
`SYS_REQUIRED_ACTIONS_` exists to detect a partial Apps Script sync. It lists 44 of the 138 because
those are the ones a page breaks without — not because the other 94 are protected.

### 1.1 Consumer inventory

| consumer class | how it calls | identity available today | affected by restricting `/exec`? |
|---|---|---|---|
| 24 frontend pages (GitHub Pages) | browser `fetch` → `/exec`, cross-origin | **none** | **YES — all of them** |
| shared transport `km-transport.js` | the single dispatcher for every page | none | yes |
| `operation-system-db-api.js` | the legacy call-site layer | none | yes |
| boot capability read `getClientCapabilities` | fetch at page load | none | yes — the shell would not boot |
| `system.health` probe | fetch, both verbs | none | yes |
| **time-driven triggers** (gap materialization, weekly recommendation, automation schedule, job continuations) | **in-project, never through `/exec`** | runs as the trigger's creator | **NO** |
| Apps Script editor / manual runs (readbacks, diagnostics, census) | editor, never through `/exec` | editor owner | **NO** |
| diagnostics reachable as actions (`system.*Diagnostic`) | `/exec` like any other | none | yes |
| external integrations / webhooks | **none exist** | — | — |
| HTML Service pages | **none exist** | — | — |

**The trigger row is the one people get wrong.** Triggers are not `/exec` callers, so a deployment
access change does not touch them — and equally, an identity boundary on `/exec` will never cover them.
They are a separate authority with a separate answer (they already run as a named Google account).

### 1.2 The audit identity is a second, independent hole

Twenty runtime files derive the actor like this:

```js
var actor = String((body && (body.created_by || body.actor)) || 'system_user').trim();
```

`created_by`, `updated_by`, `submitted_by` and `cancelled_by` therefore record **what the payload
said**, or a hard-coded placeholder. They are the provenance of a claim, never of a person. This is
recorded in `00_config.gs` and has been since P0 §13.1.

**No handler currently makes a permission decision from a body-derived actor, and none ever may.**
Authorization that reads its subject from the request body is a login form with no password. The
SEC-A0 suite asserts the count is zero so the day one appears is the day it goes red.

---

## 2. Does the obvious answer work? — `access: DOMAIN`

**Not as a drop-in, and the reason was already in the codebase.**

The frontend is served from GitHub Pages and calls `script.google.com` — a **different origin**. The
shared transport builds its request as:

```js
var init = isRead ? { method: 'GET', cache: 'no-store' }
                  : { method: 'POST', cache: 'no-store', headers: {...}, body: body };
```

There is **no `credentials` option**, so the Fetch default `same-origin` applies and **no Google cookie
is attached**. That works today only because the deployment demands none. Restrict the audience and the
identical request becomes unauthenticated: Google answers with a sign-in / no-access HTML page.

The transport already has a name for exactly that:

```js
GOOGLE_AUTH_OR_ACCESS → CODES.AUTH_OR_ACCESS_HTML
// "AUTH is its own code because the fix is 'sign in / change the deployment's access policy',
//  which no retry can perform."
```

and it is in `NEVER_AUTO_RETRY_CODES`. **So flipping `access` alone would turn all 138 actions into one
non-retryable hard error, on every page, at once.** The system predicted this failure and named it
before anyone proposed the change.

Setting `credentials: 'include'` does not rescue it: Apps Script `/exec` answers cross-origin requests
with a wildcard `Access-Control-Allow-Origin`, which the Fetch specification forbids combining with
credentials, and a restricted deployment answers an unauthenticated caller with a redirect toward
`accounts.google.com` that a cross-origin `fetch` cannot usefully complete.

### 2.1 `executeAs` must NOT move, and this is separable from `access`

The two are independent knobs. `access` decides whether Google authenticates the caller; `executeAs`
decides whose authority the code runs with. Only the first may move:

- the script is **container-bound** — handlers open the DB with `SpreadsheetApp.getActiveSpreadsheet()`,
  so under `USER_ACCESSING` every user would need edit rights on the container spreadsheet itself;
- five files write Drive documents, which would then be written as, and owned by, each user;
- the project holds a **BigQuery** scope for the Amazon import, which every user would then need.

`executeAs: USER_DEPLOYING` therefore stays. The useful property is that it can stay **while `access`
changes**: in a same-domain Workspace, a web app running as the deployer still reports the accessing
user from `Session.getActiveUser().getEmail()`. That is identity without touching data authority —
and it is listed below as an evidence gap, because it must be measured on a throwaway deployment
rather than assumed.

### 2.2 Evidence gaps — none of these may be guessed

| # | unknown | who can answer | how |
|---|---|---|---|
| EG-1 | Is the deploying account a Google **Workspace** account? `DOMAIN` is not offered to consumer accounts | **USER** | account type |
| EG-2 | Are **all** Operation System users in that one domain? | **USER** | the operator roster |
| EG-3 | Do external Gmail users, suppliers, factories or 3PLs use the pages? | **USER** | |
| EG-4 | Does `Session.getActiveUser().getEmail()` return the ACCESSING user under `DOMAIN` + `USER_DEPLOYING` **for this project**? | SEC-A1 | a separate throwaway deployment |
| EG-5 | Exact CORS/redirect behaviour of a restricted `/exec` for a cross-origin `fetch` | SEC-A1 | same throwaway deployment |
| EG-6 | Does editing an existing deployment's access preserve its `/exec` URL? (A *new* deployment mints a new URL, and `OP_DB_API_BASE_URL` is a hard-coded constant — so a URL change is also a frontend release) | SEC-A1 | same throwaway deployment |
| EG-7 | Is anyone today relying on signed-out access? | **USER** | |

**EG-1, EG-2, EG-3 and EG-7 block the choice itself. EG-4 through EG-6 block the first build step.**

---

## 3. Three architectures

### Option A — Google Workspace DOMAIN identity

Republish with `access: DOMAIN`, keep `executeAs: USER_DEPLOYING`, read
`Session.getActiveUser().getEmail()`, check it against a server-owned operator allowlist.

**For:** no new secret, no new dependency, no token lifecycle — Google is the identity provider and the
verification is a single built-in call. Cheapest possible server code.

**Against, and it is decisive as a drop-in:** §2 — every existing page breaks the moment access is
restricted, because a cross-origin credential-less `fetch` cannot carry a Google session. Making it
work means the frontend stops being a separate-origin static site: either it moves into Apps Script
`HtmlService` (a rewrite of the whole shell, and the repository has deliberately never used
`google.script.run`), or every call becomes a top-level navigation, which is not an API.

**Requires:** EG-1/2/3 all favourable, and a frontend hosting migration. **Not viable as a first step.**

### Option B — keep the deployment open; add a verified Google ID token

The browser signs in with Google Identity Services and obtains an **ID token (a JWT signed by Google)**.
The transport sends it with the request. The server **verifies it** — audience, issuer, expiry,
signature — and only then resolves an operator record.

This is explicitly **not** a query-string secret, not `localStorage` as a source of trust, not a
client-asserted email, not a shared password and not a TEMP bypass. The browser holds a token it cannot
forge, and the server trusts Google's signature rather than the caller's word.

| concern | answer |
|---|---|
| issuance | Google, after a real user sign-in. The app never mints credentials |
| verification | server-side, against Google's published keys / tokeninfo. The email used is the **verified claim**, never a field from the body |
| audience | the token must name this application's OAuth client id — a token minted for another site is refused |
| expiry | ~1 hour, Google's own `exp`. The server re-checks it every request |
| revocation | remove the operator from the server-owned allowlist. Effective at the next request, no token recall needed |
| replay | bounded by `exp` + `aud`; a nonce may be added for write actions if a tighter bound is wanted |
| secret ownership | **there is no shared secret to own.** Nothing to rotate, leak or paste into a config file |

**For:** it does not touch the deployment's access setting, so **nothing breaks** — the 138 actions and
every page keep working exactly as they do today while the boundary is built beside them. It works
cross-origin, because a token in a request body has no cookie semantics. It produces a real audit
identity to replace the client-asserted `created_by`. And it can be enforced **one action at a time**.

**Against:** the server needs an outbound request to verify, which means adding the
`script.external_request` scope — an `appsscript.json` change and **re-authorisation by the deployer**.
Verification costs one cached round trip. It is more code than Option A, and the code is security code.

**Requires:** EG-1 only in the weak sense (any Google account can sign in); the operator roster (EG-2).

### Option C — a separate, restricted deployment for Product Strategy

Leave the Operation System deployment untouched; publish a second Web App restricted to the domain,
serving only the Product Strategy actions, with its own `/exec` URL.

**For:** perfect blast-radius isolation — the existing system is provably unaffected, because it is not
edited at all. Rollback is deleting a deployment.

**Against:** it does not solve the actual problem. **The 76 anonymous mutations stay anonymous**, and
the one feature that has never been used gets a lock while purchase orders and shipments do not. It
also inherits Option A's cookie problem for its own page unless that page is served by HtmlService,
which means a second UI shell — and P1-B7 spent a round proving the board belongs inside the one shell.
Two deployments also means two release identities, two manifests and two sync procedures, in a project
whose release governance is built around there being exactly one.

**Requires:** the same EG-4/5, plus permanent duplication.

---

## 4. Recommendation — **Option B**, with Product Strategy as its first tenant

**Option B, staged, and Product Strategy is the right first tenant precisely because nobody uses it.**

The recommendation follows from one asymmetry. Options A and C both begin by changing something
138 working actions depend on. Option B begins by adding something nothing depends on yet, and the new
boundary can be switched on for a single action whose current user count is zero. **A new door with
nobody behind it is the only place a lock can be fitted without locking anyone out.**

The order is then forced, and each step is independently reversible:

1. add the verifier — present, dormant, enforced nowhere;
2. enforce it on `productPricing.*` only — a feature that is still flag-disabled, so a mistake reaches
   nobody;
3. sign in on the frontend and prove a real operator gets through and a stranger does not;
4. move the audit identity to the verified claim, action family by action family;
5. extend enforcement to the mutation set, in order of blast radius, with the flag pattern per family.

Option A is not discarded. **If EG-1/2/3 all come back favourable, Option A becomes the better long-term
answer** — fewer moving parts, no token lifecycle — and Option B's operator registry, action permission
table and scope check are all reusable under it unchanged. What Option B buys is the ability to build
those three things now, against a live system, without a flag day. The identity *source* is the only
part that would be swapped.

Option C is rejected for this purpose. It is worth keeping in mind only if the business later needs a
genuinely separate audience, such as an external supplier portal.

---

## 5. FROZEN — the five layers, and the order they run in

These are five different questions. Most access-control accidents come from one of them answering
another's.

| layer | the question | today |
|---|---|---|
| **Authentication** | who is this caller? | **nothing** |
| **Authorization** | may this person run this action? | **nothing** |
| **Data scope** | which company / country / marketplace may they touch? | partial — the AI Plan scope allowlist, for one feature |
| **Feature lifecycle** | is this feature on at all? | the global flags |
| **Audit identity** | who did what, when? | **client-asserted** |

**NONE OF THESE IS AUTHENTICATION**, and each has been mistaken for it at least once:

- a feature flag — it answers *is this on*, never *may this caller*;
- navigation visibility — a UI decision no HTTP caller passes through;
- `created_by` / `actor` / a role in the payload — the caller's own word;
- a company or site allowlist — a *data scope*, and a real one, but it constrains a caller it cannot
  identify;
- knowing the `/exec` URL — the URL is the access grant today, which is the finding, not the control.

### FROZEN EXECUTION ORDER

```
1. authenticate the caller            -> unauthenticated: refuse
2. authorize the action               -> not permitted:   refuse
3. check the company/site data scope  -> out of scope:    refuse
4. check the feature lifecycle flag   -> disabled:        refuse
5. ONLY NOW open the database
6. perform the read or write
7. stamp the audit row from the SERVER-DERIVED identity, never from the body
```

**Steps 1–4 all happen before step 5, and that is the load-bearing part.** A refusal measured after the
spreadsheet is open has already spent the thing it was protecting, and the existing Product Strategy
gate is the pattern to copy: it refuses with `dbOpened false` and `tablesRead 0`, measured on the
deployed project rather than argued from source.

**Each refusal keeps its own name.** `NOT_AUTHENTICATED`, `NOT_AUTHORIZED`, `OUT_OF_SCOPE` and
`FEATURE_DISABLED` must never collapse into one code: a refused person and a disabled feature are
different facts, and an operator who cannot tell them apart cannot act on either.

### The shape the operator registry must inherit

`INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_` is the only fail-closed, server-owned, wildcard-free gate this
codebase already has, and its behaviour is pinned by execution in the SEC-A0 suite **before** it is
copied: exact match, case-sensitive, **an empty list enables nothing**, no `ALL`/`ALL_SITES` can ever
match, an incomplete key is never a match, and the list is reportable for diagnostics carrying business
identifiers only — no id, url or key. A browser cannot widen it; widening it is a deployment with a
diff.

---

## 6. Migration roadmap

Every step lists what it needs, what it touches and how to undo it. **A step whose prerequisites are
not met does not start.**

### SEC-A0 — inventory and design freeze · **THIS ROUND, DONE**
- **Prereq:** P1-B7F. **Touches:** documentation and one new test suite. **Runtime: nothing.**
- **Tests:** `identity-boundary-baseline-sec-a0.test.js` — 53 assertions, 11 mutants.
- **Deployment:** none. **Rollback:** revert the commit.
- **USER:** answer EG-1, EG-2, EG-3, EG-7 and choose the option.

### SEC-A1 — identity provider / deployment prototype
- **Prereq:** EG-1/2/3/7 answered; the option chosen.
- **Touches:** a **throwaway** Apps Script project and its own deployment. **The production project and
  deployment are not edited.**
- **Proves:** EG-4 (does `Session.getActiveUser()` name the accessing user under `DOMAIN` +
  `USER_DEPLOYING`), EG-5 (what a cross-origin `fetch` really receives from a restricted `/exec`),
  EG-6 (whether editing access preserves the URL), and — for Option B — that a Google ID token can be
  verified server-side within the Apps Script execution budget.
- **Deployment:** throwaway only. **Rollback:** delete the throwaway.
- **USER:** creates the throwaway project and its deployment.

### SEC-A2 — server authorization and the operator registry
- **Prereq:** SEC-A1 green.
- **Touches:** `00_config.gs` (operator registry, fail-closed, empty), a new verifier module,
  `appsscript.json` (the `script.external_request` scope, Option B only). **Enforced on nothing yet.**
- **Tests:** empty registry refuses everyone; no wildcard; an expired token is refused; a token minted
  for another audience is refused; a forged token is refused; a body-asserted email is never consulted.
  Mutants for each.
- **Deployment:** a normal release **plus re-authorisation by the deployer** for the new scope.
- **Rollback:** re-publish the previous version. Nothing enforces yet, so there is nothing to break.
- **USER:** supplies the operator email list; re-authorises; deploys.

### SEC-A3 — action permission and site scope
- **Prereq:** SEC-A2 deployed and dormant.
- **Touches:** the permission table (action → role) and the scope check, wired into the frozen order at
  steps 2 and 3 — **enforced for `productPricing.*` only.**
- **Tests:** an unauthorised caller is refused **before `dbOpened`**; `NOT_AUTHORIZED` and
  `FEATURE_DISABLED` stay distinct; an out-of-scope company is refused with its own code.
- **Rollback:** remove the two actions from the enforced list; everything else never changed.

### SEC-A4 — compatibility migration for the existing pages
- **Prereq:** SEC-A3 proven on the one feature nobody uses.
- **Touches:** the frontend sign-in, the transport attaching the token, and enforcement extended
  **family by family, widest blast radius last**. The audit identity moves to the verified claim in the
  same pass, per family.
- **This is the long step and the only one that can affect a working page.** Each family ships
  separately, with its own rollback, and a family is never enforced before its pages send a token.
- **Rollback:** per family — remove it from the enforced list.
- **USER:** decides the family order and accepts each cutover.

### SEC-A5 — controlled rollout and rollback drill
- **Prereq:** SEC-A4 complete for every mutation family.
- **Touches:** turning the registry from advisory to mandatory; a rehearsed revocation.
- **Proves:** removing an operator takes effect at the next request; an anonymous caller can no longer
  reach a single mutation.
- **Rollback:** documented and **rehearsed before it is needed**, not designed during an incident.

### P1-B8 — Product Strategy's first live read-only render
- **Prereq:** SEC-A3. Not SEC-A4 and not SEC-A5 — the feature only needs its own two actions protected.
- **Touches:** `PRODUCT_STRATEGY_ENABLED_` → true for named operators, navigation enabled, frontend
  deployed.
- **Rollback:** flag to false plus a new version; the feature has never written anything.
- **USER:** authorises activation.

### P2-A — full Login / RBAC UI and administration
- **Prereq:** SEC-A5. Roles and operators become data with an admin surface instead of a config array.

---

## 7. What this round did NOT do

No flag changed. No navigation enabled. No deployment access or `executeAs` changed. No deployment
created or updated. No frontend deployed. No token, secret or bypass added. No DB, Sheet or Drive
write. No other page touched. **No runtime file of any kind was modified.**


---

# SEC-A1 ADDENDUM — BOTH OPTIONS FAILED TESTING; THE RECOMMENDATION HAS CHANGED  (2026-09-12)

**Evidence: `docs/planning/SEC_A1_IDENTITY_PROTOTYPE_EVIDENCE.md`. Read that before acting on anything
below in the original SEC-A0 text.**

SEC-A0 recommended Option B and set Option A aside on the strength of a domain assumption. SEC-A1 tested
both. **Neither survives in its pure form.** The sections above are left unedited as the record of what
was believed on 2026-09-12; the corrections are here.

## What SEC-A0 got wrong, stated plainly

**EG-1 was overstated.** SEC-A0 recorded that `DOMAIN` "is not offered to consumer accounts". Google's
manifest reference does not say that - it says only "Only users in the same domain as the deployer can
run it". The user has since confirmed the deploying account IS a `@shopkitchenmama.com` Workspace
account, so the question is moot for this system, but the source was misquoted and that is worth
correcting rather than quietly dropping.

**Option A's blocker is bigger than SEC-A0 described, and it was measured.** SEC-A0 inferred that a
cross-origin credentialed fetch would fail. SEC-A1 ran it in a real headless browser against a server
reproducing the Apps Script answer shape: `credentials: 'include'` is **BLOCKED**, POST with credentials
is **BLOCKED**, an `Authorization` header is **BLOCKED** at the preflight - while a control backend that
can set its own headers answers all three. The cause is `TextOutput` having no method that sets a
response header **[OFFICIAL]**, so `Access-Control-Allow-Credentials` can never be emitted.
Verdict: **`OPTION_A_NOT_COMPATIBLE_WITH_CURRENT_HOSTING`**.

**Option B cannot be completed inside Apps Script.** `Utilities` signs with RSA and has **no method that
verifies an RSA signature** **[OFFICIAL]**. That leaves hand-written crypto (which Google's own guidance
warns against) or the `tokeninfo` endpoint, which Google documents as **"useful for debugging"**,
recommends against for production, and says **"may be throttled or otherwise subject to intermittent
errors"**. Verdict: **`STOP_OPTION_B_SERVER_VERIFICATION_NOT_PROVEN`**.

**And Option A could never have been the long-term answer anyway**, for a reason that has nothing to do
with CORS: the user has confirmed that factories, overseas warehouses and other external roles are
coming, and they will not hold `@shopkitchenmama.com` accounts.

## The revised recommendation

**Long term: Option D - a minimal verification gateway.** A small external service verifies the Google
ID token with a real library and forwards the request to `/exec` with an **HMAC-signed principal
assertion**. Apps Script cannot verify RSA but it **can** compute HMAC, so this is the only design where
the script verifies with a primitive it actually has. It also serves non-domain external identities and
gives the browser correct CORS. Its cost is honest and the user's to accept: a component that must be
deployed and kept alive, and a shared secret to own and rotate.

**Phase 1: the same Google ID token, verified via `tokeninfo`, for `productPricing.*` only** - two
read-only actions, named operators, zero current users, and a throttle that fails **closed**. Still
conditional on SEC-A1b measuring `tokeninfo` from the disposable project.

**The path between them is one function.** The prototype takes an *attestation source*; moving from
phase 1 to the gateway swaps `tokeninfo` for `gateway` and changes nothing else - not the principal, the
registry, the permission table, the scope check, the refusal codes or the ordering.


---

# SEC-A2 ADDENDUM — THE GATEWAY EXISTS, LOCALLY  (2026-09-12)

**Implementation: `services/auth-gateway/` (not deployed). Runbook: its README. Tests:
`assets/tests/auth-gateway-contract-sec-a2.test.js`.**

Option D is built and attacked. Cloud Run is confirmed as the platform against Google's own
documentation: 32 MiB request ceiling, up to 1000 concurrent per instance, 60-minute timeout ceiling,
**minimum instances default 0 so it scales to zero**, Secret Manager mountable **as a volume that is
re-read on every read** (which is what makes key rotation possible without a redeploy), and immutable
revisions rolled back with one `update-traffic` command.

**The HMAC assertion contract is frozen** at `KMGA1`: thirteen fields in a fixed order,
**length-prefixed** (`<utf8ByteLength>:<value>\n`) so no value can contain a separator that changes the
parse, a lowercase-hex body digest that is **checked rather than normalised**, a short TTL, a nonce, and
the action bound inside the signature so an assertion cannot be lifted onto another call.

**The one thing two implementations had to agree on is tested by making them agree.** The gateway signs
in Node; the Apps Script verifier checks under a platform shim; the canonical strings are required to be
identical character for character, including for an email with accents - where UTF-16 length and UTF-8
length differ and a careless implementation passes every ASCII test ever written.

**Still true, and still the boundary:** no cloud resource, no OAuth client, no secret, no deployment,
and the Product Strategy flag is false.

---

## SEC-A2R — the gateway's dependency is installed, and the real library moved two decisions

SEC-A2 proved the gateway against a tree with **nothing installed**: `google-auth-library` was declared
and absent, so the production verifier was the one component that could not be executed. SEC-A2R
installs it, runs it, and records what it actually does.

**Three measurements, two of which changed the architecture's reasoning:**

1. **It fetches Google's signing certificates BEFORE it parses the token**, and wraps every failure of
   that fetch — DNS, refused connection, a 500 from Google — in one message. The SEC-A2 adapter
   classified by inspecting the cause, so a cause without a transport-looking word was filed as a
   **rejected token**. That reports Google being down as a forged sign-in, and tells a real operator to
   sign in again, forever. Now the wrapper is matched first and unconditionally.
2. **It accepts a token up to 300 seconds past `exp`** — its own clock-skew allowance.
3. **It never checks `email_verified`.**

Points 2 and 3 settle a question SEC-A0 left open in the five-layer freeze: whether the gateway's own
claim checks are redundant once a real library is doing the verification. **They are not**, and deleting
them as duplication would have bought a five-minute replay window and an unverified-email hole with
nothing anywhere to reveal either. In SEC-A0 that layering was an argument. It is now a measurement.

**The refusal contract is extended from eighteen codes to twenty**, declared rather than overloaded:
`TOO_MANY_REQUESTS` (429, its own `throttle` kind) and `PAYLOAD_TOO_LARGE` (413). The second exists
because the body limit had been answering `ACTION_MISMATCH` — *"The request was altered in transit"* —
which sends somebody to hunt a network fault when the truth is that they sent too much.

**Still true:** no cloud resource, no OAuth client, no secret, no image, no deployment, and
`PRODUCT_STRATEGY_ENABLED_` is false. Full evidence:
`docs/planning/SEC_A2R_PRODUCTION_READINESS_AND_COST_MODEL.md`.