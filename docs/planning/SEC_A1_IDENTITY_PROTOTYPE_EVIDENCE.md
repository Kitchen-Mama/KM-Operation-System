# SEC-A1 — identity prototype evidence, official limits, and two blocking findings

**Status: BOTH PURE OPTIONS FAIL. A third is proposed. NO RUNTIME CHANGE.**
**Date: 2026-09-12 · Companion to `IDENTITY_AND_ACCESS_ARCHITECTURE_SEC_A0.md`**

SEC-A0 recommended Option B and gave Option A a second hearing once the Workspace domain was
confirmed. SEC-A1 tested both. **Neither survives in its pure form, and both failed for a reason that is
documented rather than incidental** — which is better than failing later, on a deployment, in front of
users.

No credential, endpoint, Script ID, deployment ID, token or personal address appears in this document
or anywhere in the repository. Domains appear only as `@shopkitchenmama.com` or a placeholder.

---

## 1. Official limits (§4) — classified by how strong the evidence is

Every line below is marked **[OFFICIAL]** (Google's own documentation), **[MEASURED]** (an experiment
run in this round), **[INFERRED]** (a conclusion drawn from the two), or **[GAP]** (not established).

### 1.1 Web app access and execution

| # | finding | class |
|---|---|---|
| 1 | The `access` field takes exactly `MYSELF` ("Only the deploying user can run the app"), `DOMAIN` ("Only users in the same domain as the deployer can run it"), `ANYONE` ("Any logged-in user"), `ANYONE_ANONYMOUS` ("Any user, even if not logged in") | **[OFFICIAL]** |
| 2 | `executeAs` takes `USER_ACCESSING` or `USER_DEPLOYING` | **[OFFICIAL]** |
| 3 | The manifest reference does **not** state that `DOMAIN` requires Google Workspace. It is described only as "the same domain as the deployer" | **[OFFICIAL, and narrower than SEC-A0 assumed]** |
| 4 | The deploying account is a `@shopkitchenmama.com` Workspace account | **[USER-CONFIRMED]** |

**SEC-A0 recorded EG-1 as "DOMAIN is not offered to consumer accounts". That is not something Google's
manifest reference actually says.** The user's confirmation makes the question moot for this system, but
the earlier document overstated the source, and the correction belongs here rather than quietly.

### 1.2 `Session.getActiveUser()` — the sentence the whole of Option A rests on

> "If security policies do not allow access to the user's identity, `User.getEmail()` returns a blank
> string." Unavailable in "a web app deployed to 'execute as me' (that is, authorized by the developer
> instead of the user)." **"However, these restrictions generally do not apply if the developer runs the
> script themselves or belongs to the same Google Workspace domain as the user."**

**[OFFICIAL]** — and note the word **"generally"**. Google hedges it. So: under `DOMAIN` +
`USER_DEPLOYING`, a same-domain caller's email is *documented as generally available*. That is strong
evidence and it is **not a guarantee**, which is why EG-4 remains a **[GAP]** until measured. It is also
why nothing was built on it this round.

`getEffectiveUser()` returns the developer under "execute as me" **[OFFICIAL]** — so it can never
identify a caller and must not be used for authentication.

### 1.3 The event object has no headers — and this eliminates a whole design

The documented fields of `e` in `doGet(e)` / `doPost(e)` are `queryString`, `parameter`, `parameters`,
`pathInfo`, `contextPath`, `contentLength`, and `postData` (`type`, `length`, `contents`, `name`).
**There is no field carrying HTTP request headers.** **[OFFICIAL]**

**Therefore an `Authorization: Bearer` header is unreadable by Apps Script** — not difficult, not
discouraged: unavailable. §6.2's first-choice transport is eliminated on documentation, before any
experiment. **[INFERRED, from an exhaustive documented field list]**

There is a second, independent reason: an `Authorization` header makes a cross-origin request
non-simple, so the browser sends a CORS **preflight** — and an Apps Script web app has only `doGet` and
`doPost`, so it cannot answer an `OPTIONS` request at all. The existing transport already sends
`Content-Type: text/plain` on its POSTs, which is precisely the trick that keeps a request preflight-free.
**The repository has been avoiding this constraint for years without naming it.**

### 1.4 Apps Script cannot set a response header

`TextOutput` has exactly: `append`, `clear`, `downloadAsFile`, `getContent`, `getFileName`,
`getMimeType`, `setContent`, `setMimeType`. **No method sets an arbitrary response header.**
**[OFFICIAL]**

So an Apps Script web app can never emit `Access-Control-Allow-Credentials: true`, nor an
`Access-Control-Allow-Origin` naming a specific origin. **[INFERRED]**

### 1.5 Apps Script cannot verify an RSA signature

`Utilities` provides `computeRsaSha1Signature`, `computeRsaSha256Signature`, `computeRsaSignature`,
`computeHmacSha256Signature`, `computeHmacSignature`, `computeDigest`, and the base64 helpers.
**Every RSA method signs with a private key. There is no method that verifies a signature with a public
key.** **[OFFICIAL]**

Note what *is* there: **HMAC is computable**, and HMAC verification is "compute it again and compare".
That asymmetry is the hinge of the recommendation in §4.

### 1.6 ID token verification, per Google

- JWKS: `https://www.googleapis.com/oauth2/v3/certs`; discovery:
  `https://accounts.google.com/.well-known/openid-configuration` **[OFFICIAL]**
- Must verify: signature; `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}; `aud` = your
  client ID; `exp` not passed; `sub` as the unique user id (**not** email); `email` + `email_verified`;
  `hd` when restricting to a domain **[OFFICIAL]**
- `iat` and `nbf` are **not** named as required steps by Google **[OFFICIAL]** — the prototype checks
  them anyway, as defence in depth, and says so
- *"The `tokeninfo` endpoint is useful for debugging but for production purposes, retrieve Google's
  public keys from the keys endpoint and perform the validation locally."* **[OFFICIAL]**
- *"Requests to the debugging endpoint may be throttled or otherwise subject to intermittent errors."*
  **[OFFICIAL]**
- *"Rather than writing your own code to perform these verification steps, we strongly recommend using
  a Google API client library for your platform, or a general-purpose JWT library."* **[OFFICIAL]**

### 1.7 Sign In With Google, in the browser

- OAuth client **type: Web application**; "Authorized JavaScript origins" take "the scheme and fully
  qualified hostname only", no path **[OFFICIAL]**
- **No client secret is involved** — `google.accounts.id.initialize` takes `client_id` and `callback`
  **[OFFICIAL]**
- The callback receives `credential`: "the ID token as a base64-encoded JSON Web Token (JWT) string",
  and its `exp` is **"one hour for the ID token obtained from Sign In With Google"** **[OFFICIAL]**
- `nonce` is supported and is "a random string used by the ID token to prevent replay attacks"
  **[OFFICIAL]**
- *"Don't use `exp` for session management. An expired ID token does not mean the user is signed out."*
  **[OFFICIAL]** — so re-authentication is a silent re-request, not a logout

### 1.8 Budgets

URL Fetch 100,000/day on Workspace; response 50 MB; script runtime 6 min/execution **[OFFICIAL]**.
`CacheService`: key ≤ 250 chars, value ≤ 100 KB, expiration 1–**21600** seconds (6 h), default 600
**[OFFICIAL]**. A Sign In With Google token lives one hour, so a verification result can be cached for
the token's whole life inside the cache's own ceiling. **[INFERRED]**

---

## 2. The measured experiment (§5) — Option A's blocker is in the browser, not in Google

The question Option A turns on is not an Apps Script question. It is: *can a page on one origin send a
cross-origin request carrying cookies to a server that answers the way Apps Script answers?*

Two local servers were stood up — one reproducing the Apps Script answer shape (`Access-Control-Allow-Origin: *`,
no `Access-Control-Allow-Credentials`, no `OPTIONS` handler), one reproducing a backend that *can* set
headers — and a real headless Chrome made six requests. **Nothing Google-owned was contacted.**

| case | outcome |
|---|---|
| A1 Apps Script shape, credentials omitted — *what the shipped transport does today* | **RESPONSE READABLE**, and it carries no session |
| A2 Apps Script shape, `credentials: 'include'` — *what Option A needs* | **BLOCKED BY THE BROWSER** |
| A3 Apps Script shape, POST + `credentials: 'include'` — *the 76 mutations* | **BLOCKED BY THE BROWSER** |
| A4 Apps Script shape, POST + `Authorization` header | **BLOCKED BY THE BROWSER** (preflight) |
| B1 correct backend, `credentials: 'include'` — *the control* | **RESPONSE READABLE** |
| B2 correct backend, POST + `Authorization` header — *the control* | **RESPONSE READABLE** |

**[MEASURED]** The controls are the point: identical requests, different response headers, opposite
outcomes. What blocks Option A is exactly the header Apps Script has no method to set.

### 2.1 Verdict: `OPTION_A_NOT_COMPATIBLE_WITH_CURRENT_HOSTING`

A `DOMAIN`-restricted `/exec` cannot be reached by the current frontend. Signed-in or not, same domain
or not, the browser will not let the response be read. This needed no disposable deployment because
**the failure is not on Google's side of the wire.**

Routes that would make it work, all rejected for this round:

- **move the frontend into Apps Script `HtmlService`** — same origin, session flows, `google.script.run`
  works. It is a rewrite of the entire shell, and P1-B7 spent a round proving the board belongs in the
  *existing* shell;
- **a hidden iframe on the Apps Script origin, bridged with `postMessage`** — the only cookie-carrying
  route that keeps GitHub Pages hosting. Considered and named rather than ignored: it makes every API
  call depend on a hidden frame's session and is a large change to the one transport the whole system
  shares;
- **JSONP via `ContentService.MimeType.JAVASCRIPT`** — a `<script>` tag does send cookies. It is GET-only,
  so it cannot serve the 76 mutations, and it means executing whatever comes back. Named for
  completeness; not proposed.

**Option A is not dead as an identity *source*.** It is dead as a *transport* for this hosting. And it
has a second, permanent problem: **future factory, overseas-warehouse and 3PL users will not be in the
`@shopkitchenmama.com` domain**, so a domain-restricted deployment could never serve them.

---

## 3. Option B in Apps Script (§6.3) — `STOP_OPTION_B_SERVER_VERIFICATION_NOT_PROVEN`

Option B needs the server to verify a Google-signed JWT. Inside Apps Script there are exactly two ways,
and both are compromised:

**B1 — verify locally against the JWKS.** Apps Script has no RSA verification primitive (§1.5). This
means hand-writing PKCS#1 v1.5 verification with big-integer modular exponentiation in Apps Script
JavaScript — exactly what Google says not to do, in a language runtime with no library ecosystem to do
it instead. Writing the cryptography is not a cost to be scheduled; it is a defect to be avoided.

**B2 — call `tokeninfo`.** Google documents this endpoint as **for debugging**, says production should
validate locally, and warns it **"may be throttled or otherwise subject to intermittent errors"**.
Putting a documented-as-debug endpoint in front of an authentication gate is not a production design.

**Neither is proven, so the verdict is the stop code, and §6.3's rule holds: the requirement is not
lowered to a domain-or-email check to make something pass.**

Two honest mitigations that do *not* rescue it as a general answer, but do change the calculus **for one
small tenant**: a throttle would fail **closed** (`IDENTITY_PROVIDER_UNAVAILABLE`, which is a refusal,
never an allow), and the result can be cached for the token's entire one-hour life within the 6-hour
cache ceiling — so a session costs one outbound call per user per hour. For two read-only actions and a
handful of named operators, that is an availability risk, not a security one. **For 76 mutation actions
it is neither acceptable nor necessary.** Whether even the small case holds is **[GAP]** — it needs the
disposable project (SEC-A1b).

---

## 4. The proposal §11 requires: **Option D — a minimal verification gateway**

Both pure options fail on the same shape of problem: Apps Script cannot set a response header, and
cannot verify an RSA signature. It *can* compute an HMAC. That asymmetry is the whole design.

```
browser ──(1) Google ID token, POST body──▶  GATEWAY  ──(3) request + HMAC-signed principal──▶  /exec
   ▲                                            │                                                │
   └────────────(4) response, proper CORS ───────┘◀───────────────(4) response ───────────────────┘
                                            (2) verifies the ID token with a real JWT library
```

1. The browser signs in with Google Identity Services and sends the ID token in the **POST body** —
   never a query string, never a header Apps Script cannot read anyway.
2. A **small external service** verifies it properly: signature against the JWKS, `iss`, `aud`, `exp`,
   `email_verified`, `hd` — using a maintained library, which is Google's own recommendation.
3. It forwards the request to `/exec` with a compact **principal assertion**, signed with
   **HMAC-SHA256** and a secret shared only between the gateway and the script. **Apps Script can verify
   that**, with a built-in primitive, in-process, with no outbound call and no hand-written crypto.
4. The gateway sets real CORS headers, so the browser side is correct rather than worked around.

**What it costs, stated plainly:** a component that does not exist today, which must be deployed,
monitored and kept alive, and **a shared secret to own and rotate** — the very thing SEC-A0's Option B
advertised not having. That is a real operational change and it is the user's to accept.

**What it buys:**

- the only design where Apps Script verifies with a primitive it actually has;
- **it serves external factory / overseas-warehouse / 3PL identities**, which a domain-restricted
  deployment can never do — and the user has already said those are coming;
- correct CORS, so the transport stops depending on a `text/plain` trick to dodge preflight;
- the existing 138 actions keep working untouched until each is opted in;
- the gateway is a natural place for rate limiting and request logging, neither of which exists now.

---

## 5. §10 decision — phase 1 and long term, and the reversible path between them

**The two are different because the constraints are different, and the seam between them is one
function.**

### Phase 1 (unblocks P1-B8): Google ID token, verified via `tokeninfo`, **for `productPricing.*` only**

Two read-only actions, a named handful of operators, flag-disabled today, zero current users. A throttle
refuses rather than admits. One verification per token per hour. No new infrastructure, so nothing new
can go down. **Conditional on SEC-A1b measuring `tokeninfo` from the disposable project** — today it is
`STOP_OPTION_B_SERVER_VERIFICATION_NOT_PROVEN`, and if the measurement disappoints, phase 1 simply
becomes the gateway and P1-B8 waits for it.

### Long term: **Option D, the gateway**, for everything that matters

The 76 mutations require verification that is not documented as a debugging aid, and the external roles
require an identity source that is not tied to one Workspace domain. Both point at the same component.

### A-only, B-only, Hybrid — the §10 comparison, decided

- **A-only** is rejected permanently: it cannot serve non-domain users, and it cannot reach this
  frontend at all (§2).
- **B-only, inside Apps Script** is rejected as a destination: it rests on an endpoint Google labels for
  debugging.
- **Hybrid is chosen**, in the precise sense §10 asks for: **employees and external partners both sign
  in with Google and both arrive at the same server principal, the same operator registry, the same
  action permission table and the same scope check.** What differs is only *who verifies the signature* —
  and that is one function behind one seam.

### The reversible path

The prototype takes an **attestation source**. Moving from phase 1 to the gateway swaps
`tokeninfo` for `gateway` and changes **nothing else**: not the principal contract, not the registry,
not the permission table, not the scope check, not the refusal codes, not the ordering, not a single
call site. Reversal is the same swap in the other direction. *That is why the signature step was built
as a seam on the first day rather than discovered as one on a later one.*

---

## 6. What was built and proved this round

`assets/prototypes/sec-a1/sec-a1-auth-contract.js` — **not runtime, loaded by no page, on no route.**
The complete contract: refusal vocabulary, principal builder, verifier, fail-closed operator registry,
action permission, data scope, the frozen gate, and the audit-identity adapter.

`assets/tests/identity-verifier-prototype-sec-a1.test.js` — **105 assertions, 14 mutants, 0 survived.**
It generates a real RSA key pair, mints genuinely signed JWTs, and attacks the contract: unsigned
tokens, `alg: none`, wrong key, a payload swapped under a valid signature, wrong issuer, another site's
audience, expired, future-dated, implausible lifetime, `nbf`, missing subject, missing email,
`email_verified` false / absent / the **string** `"true"`, a consumer account where a domain is required,
an empty registry, an unknown operator, an unlisted action, an out-of-scope site, `ALL_SITES`, an
incomplete scope, a downed verifier, a verifier that throws, and a body asserting
`created_by`/`actor`/`email`/`role`.

Three findings worth keeping, each of which came from the tests rather than the design:

- **A verifier that is DOWN needs its own code.** Folding it into `INVALID_TOKEN` would report an outage
  as a rejected caller and send an operator to ask why they were locked out.
- **The feature flag must be checked LAST.** Checked first, a stranger is told the feature is off — and
  `FEATURE_DISABLED` becomes a polite way of never exercising authentication at all. There is a mutant
  for exactly that reordering.
- **"Known but not permitted" and "unknown account" must be byte-identical to the caller.** The
  difference is a list of who works here. The distinguishing fact goes to the server log under a
  correlation id, and the responses are compared field by field and required to match.

Two of this round's own mutants initially survived, and both were the *probe* rather than the contract.
The more useful one: dropping the signature gate could not admit anyone while the test's attestation
source returned no claims on failure — a shape nobody would actually write. The realistic hazard is a
source that **decodes before it verifies** and hands the claims back anyway, which is exactly what a
`tokeninfo` response looks like. Rewritten that way, the mutant bites. *A mutant that catches nothing is
more misleading than no mutant at all.*

---

## 7. Evidence gaps still open

| # | gap | settled by |
|---|---|---|
| EG-4 | Does `Session.getActiveUser().getEmail()` return the **accessing** user under `DOMAIN` + `USER_DEPLOYING` for a real project? Google says "generally" | disposable project |
| EG-5 | What a restricted `/exec` actually returns to an unauthenticated cross-origin request (status, content type, redirect chain) | disposable project |
| EG-6 | Does editing an existing deployment's access preserve its `/exec` URL? (A **new** deployment mints a new URL, and the frontend constant is hard-coded, so that would also be a frontend release) | disposable project |
| EG-8 | Is `tokeninfo` fast and reliable enough from Apps Script, and what does it do under load? | disposable project |
| EG-9 | Are all phase-1 employees on `@shopkitchenmama.com` accounts? | **USER** |
| EG-7 | Is anyone using the system signed out of Google today? | **USER** |
| EG-10 | Which external parties (factory / overseas warehouse / 3PL) will need access, and with what identity? | **USER** |

EG-4, EG-5 and EG-6 no longer block the decision — §2 settled the compatibility question without them —
but they belong in the record before any deployment setting is ever touched.
