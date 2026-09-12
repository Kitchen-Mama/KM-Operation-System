# KM auth gateway — SEC-A2 · SEC-A2R

**NOT DEPLOYED. NO IMAGE WAS BUILT. NO CLOUD RESOURCE EXISTS. NO SECRET EXISTS.**
Nothing in this directory is loaded by a page, routed by the Apps Script router, or included in any
sync package. It is a complete local implementation with a deployment runbook, and that is all.

**`STOP_LOCAL_CONTAINER_RUNTIME_UNAVAILABLE`** — the machine this was written on has no container
runtime (no Docker, no Podman, no nerdctl, no WSL distribution), so the `Dockerfile` in this directory
has **never been built or run**. It is a specification that has been checked by reading, not by
executing. Everything the container would do that does NOT depend on being a container — refusing to
start, answering, refusing, draining on a termination signal — was proved instead against the real
entry point running as a real operating-system process in production mode; see
`assets/tests/_sec-a2r-prod-mode-proof.js`. What remains unproved is the image itself: its layers, its
size, and that the pinned base tag resolves.

```
browser ──(1) Google ID token in the POST body──▶ GATEWAY ──(3) request + HMAC assertion──▶ /exec
   ▲                                                │                                        │
   └────────(4) response, real CORS ────────────────┘◀──────────(4) response ─────────────────┘
                                       (2) verifies the ID token with google-auth-library
```

## Why this component exists at all

SEC-A1 found two facts in Google's own documentation that between them eliminate every simpler design:

- **`TextOutput` has no method that sets a response header**, so an Apps Script web app can never emit
  `Access-Control-Allow-Credentials` — measured in a real browser: a cross-origin credentialed `fetch`
  is blocked. `access: DOMAIN` therefore cannot serve this frontend at all.
- **`Utilities` signs with RSA and has no method that VERIFIES one.** A Google ID token cannot be
  checked inside Apps Script without hand-writing cryptography, which Google explicitly advises against.

But `Utilities.computeHmacSha256Signature` **does** exist, and verifying an HMAC is computing it again
and comparing. **That asymmetry is the entire architecture**: the gateway does the part Apps Script
cannot, and hands across a statement Apps Script can check in-process with a primitive it has.

## Layout

| file | what it owns |
|---|---|
| `src/codes.js` | the eighteen refusal codes, and the split between *answers*, *outages* and what is retryable |
| `src/verifier.js` | three implementations of one interface — Google's library, a local-JWKS one for tests, a static one |
| `src/pipeline.js` | the frozen order: authenticate → authorize action → data scope → sign → forward |
| `src/registry.js` | the operator registry, fail-closed, no wildcards, `provider+subject` as the key |
| `src/assertion.js` | the HMAC contract: canonical serialization, signing, verification, key rotation |
| `src/http.js` | exact-origin CORS, correlation ids, the redacting logger, the upstream client |
| `src/config.js` | configuration, and the refusal to start without it |
| `src/guard.js` | the instance-local rate guard and the upstream circuit breaker — and, at length, what they may not be called |
| `src/server.js` | four routes: `POST /v1/call`, its preflight, `/healthz`, `/readyz` |
| `apps-script-verifier/*.gs` | the other half of the seam, in Apps Script primitives only |

## Run it locally

```
npm ci --omit=dev --ignore-scripts      # restores the exact tree recorded in package-lock.json

node assets/tests/auth-gateway-contract-sec-a2.test.js                     # the contract and its attacks
node assets/tests/auth-gateway-production-readiness-sec-a2r.test.js        # the real library, config, container spec
node assets/tests/_sec-a2-local-e2e.js                                     # real Chrome -> gateway -> mock Apps Script
node assets/tests/_sec-a2r-prod-mode-proof.js                              # production-mode PROCESS, started and killed
```

The end-to-end runs the **actual `.gs` file** under an Apps Script platform shim rather than a
simplified stand-in. A mock that checked signatures its own way would only prove the gateway agrees
with the mock, which is not a fact anyone needs.

### The dependency

`google-auth-library` is pinned **exactly** — no caret, no tilde — and `package-lock.json` is
committed while `node_modules` is not. A caret plus a lockfile is reproducible for `npm ci` and **not**
for a fresh `npm install`, and a Cloud Run source build runs in an environment we do not control; an
exact pin makes the two agree and makes an upgrade a commit somebody reviewed rather than a side
effect of building on a different day. Two independent clean installs from the lockfile alone produce
a byte-identical 426-file tree. `npm audit` reports **0 vulnerabilities**, production-only included,
and every licence in the tree is permissive.

> The first install resolved `^9.15.0` to **9.15.1 — the `legacy-14` branch**, a maintenance line for
> Node 14 that still carries a vulnerable `gaxios`→`uuid`. The caret looked current and was pointing at
> an old support line. Moving to the current major cleared both advisories.

### What the installed library actually does — measured, not assumed

Three behaviours that only appeared once it was really executed, and all three shape the design:

- **It fetches Google's certificates before it parses the token**, and wraps every failure of that
  fetch — DNS, refused connection, a 500 from Google — in one message. Classifying that by inspecting
  the cause reports **Google being down as a forged token**, which tells a real operator to sign in
  again, forever. The wrapper is now matched first and unconditionally.
- **It accepts a token up to 300 seconds past `exp`** — its own clock-skew allowance.
- **It never looks at `email_verified`.**

The last two are why the gateway keeps its own `checkClaims` instead of trusting the library to be
complete. Deleting those checks as "already done upstream" would have bought a five-minute replay
window and an unverified-email hole, with nothing to reveal either.

The end-to-end runs the **actual `.gs` file** under an Apps Script platform shim rather than a
simplified stand-in. A mock that checked signatures its own way would only prove the gateway agrees
with the mock, which is not a fact anyone needs.

## Decisions that are easy to reverse by accident

**Secrets are mounted as FILES, never environment variables.** Cloud Run resolves a secret env var once
at instance start but re-reads a mounted volume on every read — so only the file form can be rotated
without a redeploy. `config.readKeyring()` therefore reads at call time and caches nothing.

**The nonce store failing closed is a decision, not a default.** When `CacheService` is unavailable the
Apps Script verifier refuses — for reads as well as writes. Phase one serves two read-only actions
behind a flag that is off, so strictness costs nothing today, and a rule adopted while it is free is
one nobody has to argue for later.

**CORS is an exact-string allowlist.** Not `startsWith`, not `endsWith`, not a regular expression, and
`null` is refused. Every CORS bypass in the wild is a comparison that was almost right.

**No `Access-Control-Allow-Credentials`.** The credential is a token in the body, so cookies are not
wanted — and not asking for them removes a whole class of cross-site request forgery.

**The Google ID token is never forwarded upstream.** The upstream has no use for it, and every copy of
a credential is a place it can leak from.

**The rate guard is instance-local and must never be described as a global rate limit.** Cloud Run
runs N instances; the counter lives in the memory of one of them. A caller refused by one is balanced
onto another with a fresh bucket, so the real ceiling is `limit × instances` and it resets whenever an
instance is replaced. That makes it a genuinely useful **cost and availability** control and a
genuinely weak **security** control. **The hard bound on spend is `--max-instances`**, which is a
deployment flag, not code.

**The limiter on failed authentication attempts is deliberately invisible.** When it trips the caller
receives the same `INVALID_TOKEN` they were already getting, byte for byte, and merely stops costing a
signature verification. A limiter that announces itself on the authentication path is a progress bar
for whoever is guessing.

**Secrets are never environment variables and never `00_config.gs`.** A secret in a source file is a
secret in every clone of the repository and every paste into the editor.

---

# Deployment runbook — FOR THE USER, NOT EXECUTED BY ANY AGENT

Every step is manual. Nothing below has been performed. Steps marked **DECISION** change who can reach
something and are not an implementation detail.

### Phase 1 — the Google side

1. **DECISION.** Create (or choose) a Google Cloud project for this gateway. A separate project from
   anything else keeps its IAM blast radius small.
2. Enable: Cloud Run, Artifact Registry, Secret Manager, Cloud Build.
3. **Create an OAuth client**: APIs & Services → Credentials → Create → **OAuth client ID** →
   application type **Web application**.
   - Authorized JavaScript origins: the **exact** frontend origin, scheme + host only, **no path and no
     trailing slash**. Add `http://localhost:8801` only while testing, and remove it afterwards.
   - **No client secret is used.** Sign In With Google in the browser needs only the client ID.
   - The client ID is public by design — it ships in the page.
4. **Generate the HMAC key OFF-MACHINE and never through an agent**:
   `openssl rand -base64 48`. Create a Secret Manager secret (e.g. `kmga-active`) with that value.
   Grant the Cloud Run service account `roles/secretmanager.secretAccessor` **on that secret only**.

### Phase 2 — deploy the gateway

5. Build and deploy from `services/auth-gateway/`. Mount the secret **as a volume**, not an env var:

   ```
   gcloud run deploy km-auth-gateway \
     --source . --region <REGION> --no-allow-unauthenticated=false \
     --set-env-vars NODE_ENV=production,AUTH_VERIFIER=google \
     --set-env-vars GOOGLE_OAUTH_CLIENT_ID=<CLIENT_ID> \
     --set-env-vars ALLOWED_ORIGINS=<EXACT_FRONTEND_ORIGIN> \
     --set-env-vars APPS_SCRIPT_EXEC_URL=<EXEC_URL> \
     --set-env-vars 'ALLOWED_ACTIONS=productPricing.workspace.get,productPricing.siteUniverse.get' \
     --set-env-vars HMAC_ACTIVE_KEY_ID=k1,HMAC_ACTIVE_KEY_FILE=/var/secrets/kmga/active \
     --set-secrets /var/secrets/kmga/active=kmga-active:latest \
     --min-instances 0 --timeout 60s --concurrency 40
   ```

6. Confirm `GET /readyz` returns 200 with `signing_key: "present"`. **If it returns 503 the revision is
   broken and must not receive traffic** — that is what the probe is for.

### Phase 3 — the Apps Script side, enforcing nothing

7. Set Script Properties in the Apps Script project: `KMGA_ACTIVE_KEY_ID` = `k1`,
   `KMGA_ACTIVE_KEY_SECRET` = the same value as the Secret Manager secret.
   **Never put this in `00_config.gs`** — a secret in a source file is a secret in every clone of the
   repository and every paste into the editor.
8. Paste the verifier. **It enforces nothing yet**: no router branch calls it, so the 138 existing
   actions are untouched. This step is reversible by deleting the file.

### Phase 4 — SEC-A3, enforcement, two actions only

9. Add the gate to `productPricing.*` **and nothing else**. Deploy a new Apps Script version.
10. **With the flag still false**, verify the refusal ORDER from a browser: an unauthenticated call is
    `NOT_AUTHENTICATED`; a signed-in stranger is `NOT_AUTHORIZED`; an operator with the wrong site is
    `OUT_OF_SCOPE`; only a fully permitted operator reaches `FEATURE_DISABLED`. **If a stranger sees
    `FEATURE_DISABLED`, the order is wrong and the round stops.**
11. Add **one** operator to the registry. Sign in as them, confirm they pass. Sign in as somebody else,
    confirm they do not.
12. **DECISION.** Only now set `PRODUCT_STRATEGY_ENABLED_` to true and deploy a new version.
13. First live read-only render. Watch the correlation ids.
14. **Rehearse the rollback before you need it** — step 15 — and only then treat this as done.

### Rollback, in increasing order of severity

| # | undo | how | effect |
|---|---|---|---|
| 1 | the feature | `PRODUCT_STRATEGY_ENABLED_ = false`, new Apps Script version | the board goes dark; it has never written anything |
| 2 | one person | remove them from the operator registry | effective on their next request; no key change, nobody else affected |
| 3 | the navigation | staged registry `enabled: false`, frontend release | the entry disappears |
| 4 | a bad gateway revision | `gcloud run services update-traffic km-auth-gateway --to-revisions <PREVIOUS>=100` | revisions are immutable, so the previous one is exactly what it was |
| 5 | the frontend | point it back at the pre-gateway build | the pages call `/exec` directly again, as they do today |
| 6 | enforcement | remove the gate from `productPricing.*`, new Apps Script version | back to phase 3: the verifier exists and enforces nothing |
| 7 | the key | write a new secret version, set it as `k2`, move the old id to `HMAC_PREVIOUS_KEY_ID` for one overlap window, then drop it | in-flight assertions keep working during the overlap and stop afterwards |
| 8 | sign-in itself | disable the OAuth client | nobody can obtain a new token; existing ones die at `exp`, within the hour |

**ROLLBACK NEVER MEANS "TURN AUTHENTICATION OFF AND LET EVERYONE THROUGH".** Removing enforcement (#6)
returns the system to what it is today; it does not open anything that is not already open. Reverting
to anonymous *as a response to an incident* would be handing out the keys because the lock was stiff.

**Keep the correlation ids and the structured logs.** They are the only record of who did what during
the incident, and they are the first thing lost when a service is deleted and recreated.

## What this round did not do

No Google Cloud project, no Cloud Run service, no Artifact Registry image, no OAuth client, no Secret
Manager secret, no HMAC key, no Apps Script change, no deployment, no frontend release, no flag change,
and no request to any Google service. The `google-auth-library` dependency is declared and **not
installed** — the tests run against a local-JWKS verifier that needs nothing.
