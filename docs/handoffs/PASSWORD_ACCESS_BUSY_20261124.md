# Production Login: AUTH_BUSY Recovery

Baseline: `da6dfea0888c45c2f163906e45d9c0ff6a6de54d`.

## Evidence

- Production `auth.config` returned valid public PBKDF2 parameters during read-only diagnosis.
- The user supplied the failing login response: `success=false`, `code=AUTH_BUSY`, `business_writes=0`.
- This is an explicit backend busy refusal, not an invalid-password response. The original frontend displayed the same password-related message for virtually every login refusal.
- The response alone does not identify which backend execution is busy or holding a lock. No claim is made that a specific import or scheduled job was identified or stopped.

## Change

- Retry **only** `auth.login` after an explicit `success=false`, `AUTH_BUSY`, numeric `business_writes=0` response. Three attempts total; delays of 1 and 2 seconds. Each request retains its existing timeout.
- Show busy/retry status, then a specific final code if still refused. Rate limiting, wrong password, missing configuration and invalid login responses no longer masquerade as the same password failure.
- No automatic retry for wrong passwords, rate limits, network ambiguity or busy replies without zero-write proof.
- Keep the login gate closed and submit disabled until a valid server session is received. Discard the derived credential after completion/error; do not put credentials into URLs or diagnostics.
- Expose only `code`, `phase` and timestamp through `KM.passwordAccess.lastFailure()`; clear login failure on success.
- Preserve same-tab session restore. The business-request fetch wrapper and its no-replay policy are unchanged: an import, receipt, dispatch or other business request is never resent by this change.

## Verification and Deployment

`node assets/tests/password-access-busy-browser.cjs`

37 browser checks using intercepted network, a synthetic password and real WebCrypto PBKDF2. Covers desktop/mobile busy recovery, the attempt cap, double-submit, wrong password, rate limiting, no-proof busy refusals, network failure, invalid server session, config failure, same-tab restore and zero business-request replay. No real password or authenticated Production request was used.

Frontend only: publish `assets/js/core/password-access.js` and its cache-busted reference in `index.html` through GitHub Pages. No Apps Script, password, Properties, configuration, OAuth, Sandbox, database or lock changes are required.

After publication, refresh Production and try signing in. If all three attempts still return `AUTH_BUSY`, the backend is still unavailable: inspect active Apps Script executions before starting another heavy job. This patch does not force-unlock an execution or bypass authentication. Successful login with the user's actual password must be confirmed by the user.
