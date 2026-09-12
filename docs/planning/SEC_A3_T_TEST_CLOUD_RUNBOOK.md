# SEC-A3-T — Isolated test cloud runbook

**FOR THE USER. NOT EXECUTED BY ANY AGENT. Nothing below has been performed.**

Every step is manual. No agent may create a Google Cloud project, an OAuth client, a Secret Manager
secret, a Cloud Run service, or an Artifact Registry repository, and no agent may run `gcloud`,
`clasp`, `git push` or any deployment command.

**This runbook builds a TEST environment and nothing else.** Production is not touched at any step. The
production Apps Script deployment, the production frontend, the production database and
`PRODUCT_STRATEGY_ENABLED_` are all out of scope until SEC-A3-T has completed and been reviewed.

> **Why a disposable test project rather than "the real one, carefully".** Every step here creates
> something that can be wrong: a client id, an origin, a secret, a service account binding, a traffic
> split. Getting one wrong in a project that also holds the company's data means the mistake and the
> data share a blast radius. A project that can be **deleted entirely** when this is over is the only
> version of this exercise where a mistake costs nothing — and the last step is deleting it.

### Reading the tables

Each step says who does it, what Claude can verify afterwards, **what must never be pasted back into a
chat**, and how to undo it.

**Never paste back, at any step:** the OAuth client id or secret · the Secret Manager secret value ·
the Cloud Run service URL · the Apps Script `/exec` URL, Script ID or deployment id · any ID token,
access token or `km_assertion` · any real employee email address · any project number or billing
account id. Use `@shopkitchenmama.com` domain-only, de-identified fake accounts, or placeholders.
`google:1122…` style truncated subjects are fine.

---

## Phase 0 — before anything is created

| | |
|---|---|
| **USER does** | Confirm this is a **new, empty, disposable** Google Cloud project, not the one holding any production resource. Confirm you are willing to delete it at the end. |
| **Claude verifies** | Nothing — there is nothing to verify yet. |
| **Never paste** | The project id or number. Say "created" and nothing else. |
| **Done when** | You can state the project is empty and disposable. |
| **Rollback** | Do not create it. |

---

## Phase 1 — billing, budget, and the bound on spend

**1.1 Attach billing.**
**1.2 Create a budget with alert thresholds at 50% / 90% / 100% of a small monthly figure you choose.**

> **A budget alert is not a limit. It tells you afterwards.** The thing that actually stops a bill is
> `--max-instances`, set in Phase 5. Create both, and do not mistake one for the other.

**1.3 Enable ONLY:** Cloud Run, Artifact Registry, Secret Manager, Cloud Build.

| | |
|---|---|
| **Claude verifies** | That the enabled list matches exactly these four, from a screenshot or a typed list of API names. |
| **Never paste** | The billing account id, the budget amount if you would rather not, the project number. |
| **Done when** | Budget alerts exist and exactly four APIs are enabled. |
| **Rollback** | Disable the APIs; delete the budget. |

---

## Phase 2 — the OAuth client

**2.1** APIs & Services → Credentials → Create credentials → **OAuth client ID** → application type
**Web application**.

**2.2 Authorized JavaScript origins — the exact test origin only.** Scheme and host, **no path and no
trailing slash**. Add `http://localhost:8801` only while testing locally, and **remove it in Phase 9**.

**2.3 No client secret is used.** Sign In With Google in a browser needs only the client id. If the
console shows you a secret, you do not need it and must not store it anywhere.

> **The client id is public by design** — it ships in the page. That is *not* a reason to paste it into
> a chat transcript: it identifies the project, and a transcript is not a place that gets rotated.

| | |
|---|---|
| **Claude verifies** | That the origin list has no path, no trailing slash, no wildcard, and no production origin — described in words, or with the host redacted. |
| **Never paste** | The client id, the client secret, the real production origin. |
| **Done when** | One Web application client exists with exactly the test origins. |
| **Rollback** | Delete the client. Nobody can obtain a token for it afterwards; existing tokens die at `exp`, within the hour. |

---

## Phase 3 — the HMAC secret

**3.1 Generate it OFF-MACHINE and never through an agent:**

```
openssl rand -base64 48
```

**3.2** Create a Secret Manager secret (e.g. `kmga-test-active`) with that value.

**3.3** Grant the Cloud Run service account `roles/secretmanager.secretAccessor` **on that secret
only** — not at project level.

> **The gateway refuses a secret that is not random.** Forty-eight characters of one repeated character
> passes a length check and is one guess; so is anything pasted out of this runbook. The entropy floor
> and the placeholder check will reject both at startup, with a printed reason. That is a safety net,
> not a substitute for generating it properly.

| | |
|---|---|
| **Claude verifies** | That the service starts (which proves the secret passed the entropy and placeholder checks), and that the IAM binding is on the secret rather than the project. |
| **Never paste** | The secret value. Not once, not truncated, not "just the first few characters". |
| **Done when** | The secret exists with one version and exactly one accessor. |
| **Rollback** | Destroy the secret version; delete the secret. |

---

## Phase 4 — the service account

**4.1** Create a dedicated service account for the gateway. Do **not** use the Compute Engine default.

**4.2** Grant it **only** `roles/secretmanager.secretAccessor` on the one secret. Nothing else. It needs
no Sheets access, no Drive access, no Apps Script access and no project-level role — the gateway reaches
the upstream over plain HTTPS as an anonymous caller, carrying its own signed assertion.

| | |
|---|---|
| **Claude verifies** | The role list, which must have exactly one entry. |
| **Never paste** | The service account email (it contains the project id). |
| **Done when** | One service account, one binding. |
| **Rollback** | Remove the binding; delete the account. |

---

## Phase 5 — deploy the gateway

**5.1** Pin the base image digest first. The Dockerfile pins `node:24.14.0-bookworm-slim`; a tag is a
mutable pointer, `@sha256:…` is the image:

```
docker pull node:24.14.0-bookworm-slim
docker inspect --format='{{index .RepoDigests 0}}' node:24.14.0-bookworm-slim
```

Replace both `FROM` lines with the digest form and commit that change.

**5.2** Deploy from `services/auth-gateway/`. The secret is mounted **as a volume, not an environment
variable**:

```
gcloud run deploy km-auth-gateway-test \
  --source . --region <REGION> \
  --service-account <GATEWAY_SA> \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,AUTH_VERIFIER=google,TRUST_PROXY=true \
  --set-env-vars GOOGLE_OAUTH_CLIENT_ID=<TEST_CLIENT_ID> \
  --set-env-vars ALLOWED_ORIGINS=<EXACT_TEST_ORIGIN> \
  --set-env-vars APPS_SCRIPT_EXEC_URL=<TEST_EXEC_URL> \
  --set-env-vars 'ALLOWED_ACTIONS=productPricing.workspace.get,productPricing.siteUniverse.get' \
  --set-env-vars HMAC_ACTIVE_KEY_ID=k1,HMAC_ACTIVE_KEY_FILE=/var/secrets/kmga/active \
  --set-env-vars OPERATOR_REGISTRY_FILE=/var/run/operators.json \
  --set-secrets /var/secrets/kmga/active=kmga-test-active:latest \
  --min-instances 0 --max-instances 2 --concurrency 40 \
  --timeout 30s --memory 256Mi --cpu 1
```

> **`--allow-unauthenticated` is correct here and is not a mistake.** It refers to *Google IAM*
> authentication. The caller is a browser holding a Google ID token, not an IAM principal, and the
> gateway's entire job is to authenticate that token in the request body. Requiring IAM as well would
> mean no browser could ever reach it.

> **The secret is a volume because Cloud Run resolves a secret environment variable once, at instance
> start, and re-reads a mounted volume on every read.** Only the file form can be rotated without a
> redeploy — the difference between rotation being a procedure and rotation being an outage. This is
> why `config.readKeyring()` reads at call time and caches nothing.

> **`--max-instances 2` is the hard bound on the bill.** Everything in `guard.js` is instance-local and
> best-effort; this flag is the control.

| | |
|---|---|
| **Claude verifies** | That the deploy command used the digest form, `--max-instances`, the volume mount and not an env-var secret — from the command text with values redacted. |
| **Never paste** | The service URL, the client id, the exec URL, the service account email. |
| **Done when** | One revision exists and is serving. |
| **Rollback** | `gcloud run services delete km-auth-gateway-test`. |

---

## Phase 6 — prove the service is healthy before anyone signs in

**6.1** `GET /healthz` → 200, body exactly `{"ok":true,"service":"km-auth-gateway"}`.
**6.2** `GET /readyz` → 200, `signing_key: "present"`, `operators: {operators: 0, …}`.

> **If `/readyz` returns 503 the revision is broken and must not receive traffic.** That is what the
> probe is for. A gateway that is running but cannot sign would otherwise take traffic and refuse all of
> it with a configuration error.

**6.3** Confirm neither endpoint returns a path, an id, an endpoint, a key or a name.

**6.4** Start with **an empty operator registry** — `[]`. Nobody is authorized yet, and that is the
correct starting state.

| | |
|---|---|
| **Claude verifies** | The exact JSON bodies — they contain only counts and flags, so they are safe to paste in full. |
| **Never paste** | The URL you fetched them from. |
| **Done when** | Both endpoints answer and leak nothing. |
| **Rollback** | Delete the revision. |

---

## Phase 7 — a disposable Apps Script upstream

**7.1** Create a **separate, disposable** Apps Script project. **Not the production one.**

**7.2** Paste `services/auth-gateway/apps-script-verifier/SEC_A2_GATEWAY_ASSERTION_VERIFIER.gs` and a
minimal `doPost` that verifies the assertion and echoes the principal back. Nothing that touches a
spreadsheet, a database, or any production data.

**7.3** Set Script Properties `KMGA_ACTIVE_KEY_ID = k1` and `KMGA_ACTIVE_KEY_SECRET` = the same value
as the Secret Manager secret.

> **Never put this in `00_config.gs`.** A secret in a source file is a secret in every clone of the
> repository and every paste into the editor — and in every screenshot of the editor.

**7.4** Deploy as a Web App and point `APPS_SCRIPT_EXEC_URL` at it (redeploy the gateway revision).

| | |
|---|---|
| **Claude verifies** | That the `.gs` pasted matches the repository file byte for byte (compare a hash you compute locally). |
| **Never paste** | The Script ID, the deployment id, the `/exec` URL, the secret. |
| **Done when** | The gateway can reach the test upstream. |
| **Rollback** | Delete the Apps Script project entirely. |

---

## Phase 8 — the real sign-in, and the refusals

**This is the first time a real Google ID token has ever existed in this work.** It is what
`REAL_GOOGLE_TOKEN_ACCEPTANCE = NOT_YET_PROVEN` has been waiting for.

Run these **in this order**, because the order is the thing being tested.

| # | Do this | Must produce |
|---|---|---|
| 8.1 | Call with no credential | `NOT_AUTHENTICATED` 401 |
| 8.2 | Call with a garbage token | `INVALID_TOKEN` 401 |
| 8.3 | **Sign in for real**, registry still empty | `NOT_AUTHORIZED` 403 |
| 8.4 | Add **one** operator (your own subject, discovered from the gateway log in 8.3 — *not* from a token you paste anywhere), with **one** action | that action succeeds |
| 8.5 | Call the *other* allowed action as that operator | `NOT_AUTHORIZED` 403, **byte-identical to 8.3** |
| 8.6 | Call with a site outside their scope | `OUT_OF_SCOPE` 403 |
| 8.7 | Sign in as a **second, different** account | `NOT_AUTHORIZED` 403 |
| 8.8 | Disable the operator, retry 8.4 | `NOT_AUTHORIZED` 403 |
| 8.9 | Replay a captured request verbatim | `REPLAY_DETECTED` |
| 8.10 | Alter one byte of the body after signing | `BODY_DIGEST_MISMATCH` |
| 8.11 | Wait past the TTL and replay | `ASSERTION_EXPIRED` |
| 8.12 | Call from an origin not on the allowlist | refused, **no CORS headers** |
| 8.13 | Check the browser afterwards | no token in the URL, `localStorage`, `sessionStorage` or cookies |

> **8.3 before 8.4 is the whole point.** A signed-in stranger must be refused *as a stranger*. If a
> stranger ever sees `FEATURE_DISABLED`, the order is wrong and the round stops — that would mean the
> feature flag is being consulted before identity, which makes `FEATURE_DISABLED` a polite way of never
> exercising authentication.

> **8.5 must be byte-identical to 8.3.** The difference between "this account exists but may not do
> this" and "we have never heard of this account" is a list of who works here, and a caller may not
> enumerate it. The distinguishing fact belongs in the log, under a correlation id, and nowhere else.

| | |
|---|---|
| **Claude verifies** | The refusal codes, HTTP statuses, `kind`, `retryable`, and that 8.3 and 8.5 are identical strings. All of these are safe to paste — they contain no identity. |
| **Never paste** | The ID token. The `km_assertion`. The real email addresses. The correlation ids if you would rather not. Report the subject as `google:1122…` truncated. |
| **Done when** | All thirteen rows produce exactly the stated result. |
| **Rollback** | Empty the operator registry — effective on the next request, no key change, nobody else affected. |

---

## Phase 9 — rotation, then cost, then deletion

**9.1 Rehearse a key rotation before you ever need one.** Add a second secret version, set
`HMAC_PREVIOUS_KEY_ID=k1` / `HMAC_ACTIVE_KEY_ID=k2`, confirm in-flight assertions still verify during
the overlap, then drop `k1` and confirm they stop.

**9.2 Rehearse a revision rollback.** Deploy a deliberately broken revision, confirm `/readyz` reports
503, then:

```
gcloud run services update-traffic km-auth-gateway-test --to-revisions <PREVIOUS>=100
```

Revisions are immutable, so the previous one is exactly what it was.

**9.3 Remove `http://localhost:8801`** from the OAuth client's authorized origins.

**9.4 Read the bill.** Record the actual cost of the exercise. If it is not near zero, something is
scaling that should not be.

**9.5 Delete everything**, in this order: Cloud Run service → Artifact Registry images → Apps Script
project → Secret Manager secret → service account → OAuth client → **the project**.

> **Deleting the project is a step, not an afterthought.** A disposable test environment that is never
> disposed of is just a second production environment that nobody monitors, holding a live OAuth client
> and a live HMAC secret.

**9.6 De-identify the evidence** before any of it is written into the repository: no URLs, no ids, no
real addresses, no tokens. Codes, statuses, counts and timings only.

---

## What must NOT happen in SEC-A3-T

- No change to the production Apps Script project, its deployment, or its Script Properties.
- No change to the production frontend or any feature flag.
- `PRODUCT_STRATEGY_ENABLED_` stays `false`.
- No production database, Sheets or Drive read or write.
- No gate added to any of the 138 production actions.
- No `git push` and no deployment performed by an agent.

**Rollback never means "turn authentication off and let everyone through."** Removing enforcement
returns the system to what it is today; it does not open anything that is not already open. Reverting to
anonymous *as a response to an incident* would be handing out the keys because the lock was stiff.

**Keep the correlation ids and the structured logs.** They are the only record of who did what during an
incident, and they are the first thing lost when a service is deleted and recreated.

---

## Entering SEC-A3-T requires

SEC-A2R complete and reviewed · the USER's explicit decision to create cloud resources · acceptance that
this is a disposable project that will be deleted · acceptance of the Cloud Armor deferral recorded in
`SEC_A2R_PRODUCTION_READINESS_AND_COST_MODEL.md` §6.5.

**P1-B8 remains blocked** until SEC-A3 enforcement, unauthorized-access testing and a rehearsed rollback
are all complete. Finishing SEC-A3-T does not unblock it.
