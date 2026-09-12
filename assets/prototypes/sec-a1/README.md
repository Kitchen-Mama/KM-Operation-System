# SEC-A1 prototype — NOT RUNTIME, NOT SYNCED, NOT REACHABLE

Everything in this directory is a **prototype**. It is not loaded by any page, not referenced by
`index.html`, not part of the Apps Script sync package, and not reachable by any route. It exists so
that the authentication contract can be **executed and attacked** before it is written into a file that
serves real requests.

`assets/tests/identity-verifier-prototype-sec-a1.test.js` is the only thing that loads it.

## Why a prototype and not the real module

SEC-A1 found that **Apps Script cannot verify an RSA signature**. `Utilities` offers
`computeRsaSha256Signature` (signing, with a private key) and no counterpart that verifies one with a
public key. Google's own OpenID Connect guidance is to fetch the JWKS and *"perform the validation
locally"*, and separately warns against writing the verification by hand.

So the one step that makes a Google ID token trustworthy is the step Apps Script has no primitive for.
Everything else — issuer, audience, expiry, not-before, subject, verified email, hosted domain,
operator lookup, permission, scope, ordering, redaction — is ordinary code and is what this prototype
contains, complete and tested.

**The signature step is therefore a seam, not an omission.** `verifyIdToken` takes an *attestation
source*: something that can state, on authority, that this exact token string was signed by Google.
Two implementations are anticipated and the contract is identical for both:

| source | who does the RSA | Apps Script primitive needed | status |
|---|---|---|---|
| `tokeninfo` | Google, on request | `UrlFetchApp` (needs `script.external_request`) | Google documents this endpoint as **for debugging**, and says it may be throttled. Unmeasured — SEC-A1b |
| `gateway` | a small external service, with a real JWT library | `Utilities.computeHmacSha256Signature` — **which exists** | the long-term answer; needs a component that does not exist yet |

**A missing attestation source is never a pass.** `IDENTITY_PROVIDER_UNAVAILABLE` is a refusal, and the
suite has a mutant for turning it into an allow.

## What the tests do about the missing primitive

The suite generates a real RSA key pair locally, mints real signed JWTs, and gives the prototype an
attestation source that really verifies them. That proves the *contract* — including that a tampered
signature is refused — without pretending Apps Script can do the arithmetic. Where Apps Script's
limitation actually bites is recorded as a named evidence gap, not papered over.

## What is deliberately absent

No client id, no client secret, no token, no endpoint, no email address, no domain other than the
placeholder. Nothing here is a credential and nothing here becomes one.
