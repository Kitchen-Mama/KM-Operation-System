# SEC-A2R — Auth gateway production readiness, cost and abuse model

**Status:** local only. No Google Cloud project, no Cloud Run service, no Artifact Registry image, no
OAuth client, no Secret Manager secret, no HMAC key, no Apps Script change, no deployment, no frontend
release, no flag change. `PRODUCT_STRATEGY_ENABLED_` is still `false`. Nothing in this document has
been performed.

SEC-A2 built the gateway and attacked its logic against a tree with **nothing installed**. This round
closes that: the dependency is really installed, really locked, and really executed — and what the real
library does turned out not to be what the design assumed.

---

## 1. Dependency and supply chain

| | |
|---|---|
| Package | `google-auth-library` **11.0.2**, pinned **exactly** (no caret, no tilde) |
| Lockfile | `package-lock.json`, `lockfileVersion 3`, committed; 23 transitive packages, **every one** carrying `integrity` and `resolved` |
| Tree | `node_modules` is **not committed** (`services/auth-gateway/.gitignore`) |
| Reproducibility | two independent `npm ci --omit=dev --ignore-scripts` runs from the lockfile alone produced a **byte-identical 426-file tree**, sha256 `3d9b1b1c0f4870fb225ac4da9f6287b9ef39a9a34219dea0f21ca101aac315f1`; `npm ci` did not rewrite the lockfile |
| Audit | `npm audit` **0 vulnerabilities**; `npm audit --omit=dev` **0 vulnerabilities** |
| Outdated | `npm outdated` reports nothing |
| Licences | Apache-2.0 ×5, MIT ×17, BSD-3-Clause ×1 — **all permissive, no copyleft** |
| Install scripts | **zero** `preinstall` / `install` / `postinstall` hooks anywhere in the tree |
| Node | `engines: >=22`; tested on **24.14.0**; image pinned to `node:24.14.0-bookworm-slim` |

### The caret was pointing at a maintenance branch

SEC-A2 declared `^9.15.0`. Installing it resolved to **9.15.1**, which npm's dist-tags identify as
**`legacy-14`** — the support line for Node 14 — and it carried `gaxios 6.x` → a vulnerable `uuid`, for
two moderate advisories. `latest` was **11.0.2**.

> **A caret does not mean "current".** It means "compatible with a number somebody wrote down once",
> and the number written down was on a branch that had stopped moving forward. Two moderate advisories
> were the visible symptom; the real finding is that the dependency had been silently parked on an
> old line, and nothing in the repository would ever have said so.

Moving to 11.0.2 cleared both advisories. It also raises the floor to Node 22, which is why
`engines.node` and the base image moved together — a container built on an older base would have failed
at `require()` time rather than at build time.

### Why exact, not a range

`npm ci` is reproducible with a caret **and** a lockfile. A fresh `npm install` is not — and a Cloud Run
source build runs in an environment we do not control. An exact pin makes the two agree, and makes an
upgrade a commit somebody reviewed rather than a side effect of building on a different day.

### The five `prepare` hooks, and why `--ignore-scripts` is still used

`gaxios`, `gcp-metadata`, `google-auth-library`, `google-logging-utils` and `web-streams-polyfill`
declare `prepare`. **npm does not run `prepare` for a registry tarball** — only when installing from a
git URL or in the package's own root — so none of them executes during our install. The Dockerfile
passes `--ignore-scripts` anyway: it removes a capability nothing is using, which is the only kind of
hardening that costs nothing. Verified by installing with the flag and getting the identical tree.

---

## 2. What the real library actually does — measured

Three behaviours appeared only once the library was executed. All three shape the design, and two of
them contradict an assumption that would have been reasonable to make.

### 2.1 It fetches the certificates *before* it parses the token

Every failure of that fetch — DNS failure, refused connection, timeout, a 500 from Google, an
unparseable document — is wrapped in one message: `Failed to retrieve verification certificates:
<cause>`. Only *some* causes contain a transport-looking word.

The SEC-A2 adapter classified by inspecting the cause. So a cause **without** such a word was filed as
`rejected` → `INVALID_TOKEN`.

> **That reports Google being down as a forged sign-in.** It tells a real operator their credential is
> bad and to sign in again — which will not work, because the problem was never theirs, and the token
> was never even looked at. This is the exact misclassification `codes.js` was written to prevent,
> living inside the component that classifies.

**Fixed:** the wrapper text is matched **first and unconditionally**. A failure to obtain the
certificates is never a statement about the caller's token. Regression-tested twice — once in-process
with a non-transport cause (§B13), and once through a real production process whose egress was routed
to a socket on this machine (§I11).

### 2.2 It accepts a token up to **300 seconds past `exp`**

Its own clock-skew allowance. Measured: 10s, 120s and 299s past expiry are **accepted**; 301s is
refused.

### 2.3 It never looks at `email_verified`

Not its job. But it is somebody's.

> **2.2 and 2.3 are why `checkClaims` is not redundant.** Deleting the gateway's own expiry and
> `email_verified` checks as "already done by Google's library" is an attractive simplification that
> would have bought a five-minute replay window and an unverified-email hole — and nothing anywhere
> would have revealed either. In SEC-A2 that was an argument. Here it is a measurement.

### 2.4 Its error messages are credentials

`Invalid token signature: <the entire JWT>`. `Token used too late, …: {the entire payload}`. The adapter
reads `err.message`, classifies it, and drops it; only the classification escapes. The redacting logger
catches it as well, so both layers would have to fail.

---

## 3. Production configuration — what now refuses to start

Every one of these exits **78 (EX_CONFIG)** with a printed reason, proved against a real child process:

no origins · a wildcard origin · a wildcard inside an origin · a loopback origin in production · a
plaintext origin in production · a plaintext upstream · an upstream host that merely *contains*
`script.google.com` · one that merely *ends* with it · an upstream that is not an `/exec` path · no
client id · no action allowlist · no operator registry source · the test verifier selected · `NODE_ENV`
misspelled · an assertion TTL above 300s · a clock skew outside 0–300s · an upstream timeout that
outlives the inbound request · a secret that is empty, short, **long but non-random**, or still the
runbook placeholder.

Three of those deserve a sentence each.

**`NODE_ENV` is itself a setting that can be wrong.** `NODE_ENV=prod` is not `production`, and every
production-only check above would silently not run. The deployment would look configured and be
unguarded — the most dangerous possible outcome, so an unrecognised mode is refused rather than treated
as development.

**The upstream host is checked for equality, never containment.** Getting it wrong does not fail
closed: it *succeeds*, at the wrong address, handing a valid signed statement of a verified person's
identity to whoever owns that name.

**Length is not entropy.** Forty-eight characters of `a` passes a length check and is one guess. The
floor counts distinct characters — which does not measure randomness, but catches every shape a *human*
produces by hand, and a human is the only way a weak key gets into that file. `openssl rand -base64 48`
cannot produce one.

**An empty operator registry fails closed but the process still starts**, so `/healthz` can say so. In
production the *source* must at least be named: an unset path is indistinguishable from a mounted empty
file until somebody is wrongly refused.

---

## 4. The container — specified, not built

**`STOP_LOCAL_CONTAINER_RUNTIME_UNAVAILABLE`.** This machine has no Docker, Podman, nerdctl, Docker
Desktop or WSL distribution. **No image was built and none exists.** The Dockerfile has been checked by
reading; the runtime behaviour was proved instead against the real entry point as a real process.

Specified and statically verified: two stages · pinned `node:24.14.0-bookworm-slim` (never `latest`) ·
`npm ci --omit=dev --ignore-scripts` · `USER node` before anything runs · exec-form `CMD` ·
`STOPSIGNAL SIGTERM` · explicit `PORT`/`EXPOSE` · a `HEALTHCHECK` that asks `/readyz`, not `/healthz` ·
**only** the manifest, `node_modules` and `src/` are copied.

> **Two stages because an image layer is forever.** `rm` in a later layer does not remove a file from an
> earlier one — it is still in the image, still in the registry, still pullable by anyone who can pull
> the tag. So the runtime stage does not *delete* the build tooling; it never receives it. The same
> reasoning is the whole of `.dockerignore`: test keys and minted JWTs must not be *reachable*, because
> a test private key inside a production container has exactly one possible use.

**Exec-form `CMD` is not a style preference.** Shell form puts `/bin/sh` at PID 1, and `sh` does not
forward signals — the drain would never run and every deploy would cut its in-flight requests.

**Unproved without a runtime:** that the image builds, its layer contents and size, and that the pinned
base tag resolves. Carried as an evidence gap into SEC-A3-T, where the first build happens.

---

## 5. Starting and stopping

`/readyz` fails while draining **and** when the signing key is unreadable, so a broken revision stays
out of the load balancer instead of taking traffic and refusing all of it.

The drain flips readiness, waits, **then** closes the socket.

> That pause was added because the measurement said so. Without it, a readiness probe sent during the
> drain got **no answer at all** rather than a 503: the socket closed in the same tick, so nothing could
> ever observe the flag. A flag no probe can see is a comment. A quarter of a second is invisible on a
> deploy and is the difference.

Also set: `requestTimeout`, `headersTimeout`, `keepAliveTimeout`. Without them a caller sending one
header byte per minute holds a socket indefinitely — slowloris, which costs the attacker nothing and
needs no valid token.

**Platform note.** Windows has no SIGTERM, so on this machine *delivery* is unproven; the handler was
invoked directly in a real process running the unmodified entry point, and it drained, closed cleanly
and exited 0. Linux — what the container runs, and what Cloud Run sends — delivers it. The division is
recorded rather than glossed.

---

## 6. Cost and abuse — the decisions, classified

§8 required a decision rather than a gap. Here it is, with each control filed under what it actually
controls.

### 6.1 Frozen test-environment settings

| Setting | Value | Why |
|---|---|---|
| `--min-instances` | **0** | scales to zero; an idle gateway costs nothing |
| `--max-instances` | **2** | **the hard bound on spend.** A test service that can scale to 100 is a test service that can produce a bill |
| `--concurrency` | **40** | the work is one HTTPS call out and some crypto; high concurrency per instance is cheap and reduces cold starts |
| `--timeout` | **30s** | the gateway's own request timeout; the upstream call gives up at 25s, inside it |
| `--memory` / `--cpu` | **256 MiB / 1** | measured need is far below this; smaller is cheaper and a tighter blast radius |
| `--no-allow-unauthenticated` | **off** (public) | the caller is a browser holding a Google ID token, not an IAM principal. **Authentication is the gateway's job, in the request body** |
| ingress | **all** | it must be reachable from a browser |
| egress | default | one destination: `script.google.com` |
| log retention | **30 days** | long enough for an incident, short enough to bound storage |
| budget alert | **required before the first deploy** | see 6.4 |

### 6.2 What each control actually is

| Control | Security | Cost | Availability |
|---|---|---|---|
| Operator registry + action allowlist + site scope | **yes — this is the boundary** | – | – |
| HMAC assertion, nonce, TTL | **yes** | – | – |
| Exact-origin CORS | **yes** | – | – |
| `--max-instances` | no | **yes — the hard bound** | bounded degradation |
| Instance-local rate guard | **best-effort only** | yes | yes |
| Upstream circuit breaker | no | yes | **yes — and for a system we do not own** |
| Request / response size ceilings | marginal | yes | yes |
| Cloud Armor | would be **yes** | yes | yes | *(not in phase one — see 6.5)* |

### 6.3 The rate guard is instance-local and is not a global rate limit

Cloud Run runs N instances; the counter lives in the memory of one. A caller refused by one is balanced
onto another with a fresh bucket, so the real ceiling is `limit × instances`, and it resets whenever an
instance is replaced or scaled to zero.

> **The failure mode is not the limiter. It is writing "rate limiting: yes" on a threat model and
> believing a determined caller is bounded.** The exported identifier is
> `bestEffortInstanceLocalRateGuard`, the object reports `isGlobal: false`, and its `scope` string says
> so — deliberately, so that nothing quoting this system can name the control and sound reassuring.

Three buckets: per-IP (burst 60, 2/s), per-principal (burst 120, 4/s, keyed on the **verified** subject
and therefore only after authentication), and failed-authentication attempts per IP (burst 10, 0.2/s).
The key table is capped; an unbounded map keyed by remote address **is** the denial-of-service. Worst
case, honestly stated: **it degrades to no limiter**, never "it fails closed".

**The failed-authentication limiter is invisible.** When it trips, the caller receives the same
`INVALID_TOKEN` they were already getting, byte for byte, and merely stops costing a signature
verification. A limiter that announces itself on the authentication path is a progress bar for whoever
is guessing. It is **consulted** without spending and **charged** only when a verification actually
fails — otherwise every successful sign-in would pay into the flooder's budget, and a busy legitimate
operator would eventually lock themselves out of a limiter meant to be invisible to them.

*Accepted residual risk:* callers sharing a source address share that budget. Bounded by charging only
failures, and by the burst allowance.

### 6.4 Budget alerts are not a control

A budget alert **tells you afterwards**. `--max-instances` is what actually stops the bill. Both are
required; only one of them is a limit.

### 6.5 Cloud Armor — the decision

Per-user rate limiting at the edge needs Cloud Armor in front of an external load balancer: more
infrastructure, more cost, a second place for configuration to be wrong.

**Decision: not in phase one.** Accepted on these terms:

- `--max-instances 2` bounds the worst-case spend regardless of where traffic comes from.
- The upstream is protected by a hard concurrency limit, a 25s timeout and a circuit breaker.
- Invalid tokens are bounded per address, strictly and without leaking.
- Phase one serves **two read-only actions** behind a flag that is **off**, to **one** operator.

**Escalate to Cloud Armor (or equivalent edge protection) when any of these becomes true:**
1. a write action is served through the gateway;
2. more than ~10 operators, or any operator outside the company (factory, overseas warehouse, 3PL);
3. an observed distributed flood, or the max-instances ceiling being reached by traffic rather than by
   load;
4. the budget alert fires from gateway traffic;
5. Apps Script quota exhaustion traceable to gateway calls.

### 6.6 Token verification cache

Google's certificates are cached by the library per its own `cache-control`. **Verification results are
not cached and verified identities are not cached**: a revoked or expired token must stop working when
it stops being valid, and a cache of "this token was fine a minute ago" is a session store nobody
designed, with no way to invalidate it.

---

## 7. What is still not proved

| | |
|---|---|
| `REAL_GOOGLE_TOKEN_ACCEPTANCE` | **NOT_YET_PROVEN.** No real OAuth client and no real sign-in exist. Every token in every test was signed by a key the test process created |
| `REAL_LIBRARY_LOADED_AND_FAIL_CLOSED` | **PROVEN.** Loaded, executed, and refuses malformed tokens, `alg:none`, unknown key ids, wrong signatures, wrong audience, wrong issuer and tampered payloads — and classifies an unreachable certificate source as an outage |
| Container image | never built; layers, size and base-tag resolution unverified |
| SIGTERM **delivery** | unproven on Windows; the handler itself is proved |
| Cold start, p99, real Cloud Run behaviour | unmeasurable without a service |
| Secret-volume rotation without redeploy | documented from Google's own material; not exercised |
| Per-user edge rate limiting | deliberately out of scope — 6.5 |

---

## 8. Refusal contract — declared extension, 18 → 20

SEC-A2 froze eighteen codes. Two were added, and are named here rather than smuggled in by overloading
an existing one.

- **`TOO_MANY_REQUESTS`** (429, `kind: 'throttle'`, retryable). A guard needs a way to say "not you, not
  now", and every one of the eighteen would have been a lie: `NOT_AUTHORIZED` says a permission is
  missing and sends a real operator to ask for access they already have; `UPSTREAM_UNAVAILABLE` blames a
  machine that is fine. Its message quotes **no number** — a message carrying "try again in 37 seconds"
  hands a flooder a progress bar, and `Retry-After` is a header, where HTTP already put it.
- **`PAYLOAD_TOO_LARGE`** (413). The body limit previously answered `ACTION_MISMATCH`, whose public text
  is *"The request was altered in transit."* That sends somebody to hunt a network fault when the truth
  is that they sent too much. Found by running the production process and reading what it said.

> The same run showed the 413 **never reached the caller at all**: the socket was destroyed in the same
> tick as the response was written, so the client got a connection reset. The limit was enforced
> correctly and the explanation was thrown away with the socket. Now: stop reading, answer, and hang up
> only once the answer is on the wire.

---

## 9. Evidence

| Suite | Result |
|---|---|
| `auth-gateway-production-readiness-sec-a2r.test.js` | **194 passed · 0 failed · 33 mutants · 0 survived** |
| `auth-gateway-contract-sec-a2.test.js` | **200 passed · 0 failed · 20 mutants · 0 survived** |
| `_sec-a2r-prod-mode-proof.js` | 15 startup refusals, 11 live cases, leakage checks, drain |

Two tests in the SEC-A2 suite changed, both because this round changed the fact they pinned:

- **H1** — a "complete production configuration" now requires a named operator registry.
- **K2** — pinned that `node_modules` did not exist, which was a fair proxy for "nothing was vendored"
  while the dependency was deliberately uninstalled. This round installs it. Rather than deleting the
  test — which would have removed the only guard against the tree being **committed** — the question
  moved to the authority that can still answer it: `git ls-files`. A tracked file under `node_modules`
  is the failure; an untracked one on disk is the point.

---

## 10. Still true

No cloud resource. No OAuth client. No secret. No image. No deployment. No Apps Script change. No
frontend release. No database, Sheets or Drive write. **No request to any Google service** — the real
library's certificate fetch was routed to a socket on this machine, and the recorded
`CONNECT www.googleapis.com:443` line is the proof that it landed there.

`PRODUCT_STRATEGY_ENABLED_` is `false`. P1-B8 has not begun and may not begin.
