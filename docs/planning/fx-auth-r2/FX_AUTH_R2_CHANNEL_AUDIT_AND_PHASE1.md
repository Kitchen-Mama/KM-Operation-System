# FX-AUTH-R2 — the identity channel, and a phase-1 Owner path that uses 75_'s own save

**Round status:** a plan with offline verification. No runtime file changed, no save was called, no rate
was initialised, nothing was repriced, and nothing was pushed or deployed.

## 0. The evidence, and what is still missing

| item | status |
|---|---|
| Phase 1 outcome (FX-INIT-R1) | **saved and read back (Owner, 2026-10-22):** one commit through `handleFxRateBookSave_`, `doc_version 0 -> 1`, the five approved rates; Web readback `doc_version 1`, `may_edit: false`. Evidence `docs/evidence/fx-init-r1/`. Both temporary files deleted (Owner-confirmed, 2026-10-22); no redeploy; not to be re-initialised |
| Production `fxRateBook.get` | **received (Owner):** answered by the R55 handler; `may_edit: false`, `authority_reason: FX_AUTHORITY_UNVERIFIABLE`; `doc_version 0`, 0 rates |
| Owner's Editor diagnostic (`TEMP_CheckFxIdentity` log line) | **received (Owner, FX-INIT-R1):** `active_email=vic.zhou@shopkitchenmama.com`, `active_error=null`, `editors_property_present=true`, `caller_on_editor_list=true`. That is §3 row 1: phase 1 is viable. The tool is frozen at `b6ef4008`; the draft payload is in `docs/planning/fx-init-r1/` |
| The deployment version now serving `/exec`, and whether it was created after the four-scope manifest was saved | **not received** |

The Owner's own note stands: the `get` above **does not show** that the email scope is deployed or
authorised. It shows that the R55 handler answered and refused.

## 1. Two different questions

1. **Can the EDITOR identify the person running it?** That is what `TEMP_CheckFxIdentity` answers.
   In the editor, `Session.getActiveUser()` is the person at the keyboard, once the project holds the
   `userinfo.email` scope and that person has authorised it.
2. **Can a WEB request from the GitHub Pages site identify its caller?** That is what `fxRateBook.get` /
   `save` see. A successful answer to question 1 says nothing about question 2.

## 2. The Web channel, from the shipped source

Facts read from the source and pinned by `assets/tests/fx-auth-r2-editor-save-path.test.js` §A:
- Both FX calls go through `_kmGapRead_` (`window.KM.DB.getFxRateBook` / `saveFxRateBook`).
- `_kmGapRead_` sends `{ method: 'GET', cache: 'no-store' }` for reads and a `text/plain` POST for
  writes, with **no `credentials` option**. No fetch in the transport sets one.
- The manifest deploys the Web App as `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`.

**Inference (documented platform behaviour, NOT measured against Production here):**
- With no `credentials`, a fetch from `*.github.io` to `script.google.com` uses the default
  `same-origin`, so **no Google cookie is sent**.
- With `ANYONE_ANONYMOUS`, Apps Script does not require or perform a sign-in for the request.
- So the request reaches `75_` as an anonymous caller. `Session.getActiveUser().getEmail()` has nobody
  to return, whatever scopes the project holds.
- So a Web `FX_AUTHORITY_UNVERIFIABLE` is **expected even after a fully successful Editor diagnostic.**
  This is the leading explanation the code supports, not a measured cause. Runbook §5A keeps it recorded
  as undetermined.

**Why the obvious fixes were not taken (as instructed):**
- **`credentials: 'include'`.**
  - Every `/exec` answer arrives through a 302 to `script.googleusercontent.com`. A credentialed
    cross-origin response is readable only if the server names the exact origin and allows
    credentials. The page reads these answers today without credentials, which suggests they are served
    for any origin. The live response headers were not checked in this round. The expected result is
    that the browser refuses to hand over **every** read. That is not measured, and it was not tried.
  - Even if it worked, `ANYONE_ANONYMOUS` does not ask Google who the caller is.
- **Changing `access` or `executeAs`** would change who can reach every action of the public API.
- **`*`**, **an email sent by the page**, **`getEffectiveUser`** (the deployer, not the caller) and **a
  key embedded in the browser** each replace an identity with a claim. All remain refused.

## 3. Reading the Editor diagnostic when it arrives

| `TEMP_CheckFxIdentity` says | what it means | next |
|---|---|---|
| no `active_error`, `active_email` = the Owner, `caller_on_editor_list: true` | the Editor can identify the Owner, and 75_ would authorise the Owner | phase 1 (§4) is viable |
| `active_error` (any text) | the Editor cannot read the caller. Record it verbatim; the cause is not confirmed | stop; nothing in §4 |
| `active_email` = the Owner, `caller_on_editor_list: false` | the list does not match that address | report. **The allowlist is not re-set by this round** |
| `editors_property_present: false` | the property is absent | report (same) |

Also record: the active deployment version number and its creation time, and compare the `handler` in
`fxRateBook.get` (`F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55`) with the `handler` the §4 dry run prints. The
editor runs the project's saved files, not the deployed version, so the two must name the same 75_
build. If they do not, stop.

## 4. Phase 1 — Owner-only, from the Editor, through 75_'s own save

**File:** `docs/planning/fx-auth-r2/TEMP_FxRateBookEditorSave.gs.txt`. It is temporary and lives
outside the Apps Script folder, like the diagnostic.

**What it is.** One editor function, plus three private helpers (entry view, change listing, SHA-256). It:
1. asks `fxBookAuthority_` who is running it, which is the same allowlist and `getActiveUser` check the
   Web uses;
2. reads the stored book;
3. validates the payload with `fxBookValidate_`;
4. lists **every entry of the payload** — pair, rate, source, `as_of`, `effective_from`/`effective_to`,
   status, version — and every change `fxBookChangeRecords_` would log (ADDED / EDITED / REMOVED), each
   with its **full old and new entry**;
5. prints a confirm string: `SAVE doc_version N -> N+1 sha256 <64 hex>`. That is
   `Utilities.computeDigest(SHA_256, UTF-8)` over the JSON of the payload object `{ doc_version, rates }`.
   The object is frozen once and is **the same object** handed to `handleFxRateBookSave_`, so what is
   approved is byte-for-byte what is sent.

**FX-AUTH-R2-R1 — why SHA-256.** The first version used a hand-written 32-bit hash, and it collided.
USD>CAD `1.37` / `manual-d1xinu-1vbz5wk` and `1.38` / `manual-n3giwf-54gd4r` (both 2026-10-22, open-ended,
active, version 1) both gave `411273e5`, so one payload could have been approved and the other
committed. Those two are kept as an offline counter-example only. **They are not proposed rates.**

With the confirm string empty, which is how it ships, that is all it does: a **dry run, zero writes**.
Only when the confirm string matches THIS payload at THIS version does it make its one call,
`handleFxRateBookSave_`. That call gives the full 75_ path: authority again, script lock, numeric CAS
inside the lock, validation, a change log written from the server's identity and clock, one atomic
commit, and readback. **It never calls `setProperty`, never builds the book by hand**, never reads
`getEffectiveUser`, never touches `pricing_list` or a spreadsheet, and never calls `pricing.fxReconcile`.

**Offline verification** (`fx-auth-r2-editor-save-path.test.js`). The real 73_ helpers and the real 75_
run in a sandbox over an in-memory Script Properties store, with the editor's `Session` stubbed:
- a dry run makes 0 writes and takes no lock, lists the payload in full, and lists an edit and a removal
  with their full old (and new) entries;
- the confirm string equals SHA-256 of `{doc_version, rates}`. For the counter-example, A and B now differ,
  A's confirm is refused for B, and the version is part of what is bound;
- a confirmed run makes exactly 1 write (`KM_FX_RATE_BOOK`), takes the lock once and releases it, moves
  doc_version 0 → 1, and every log entry has `by` = the Owner and a server ISO time;
- a payload changed after its dry run is refused (the confirm does not match), with 0 writes;
- a stale version is refused by the wrapper, with 0 writes;
- another writer landing between the wrapper's read and 75_'s re-read is refused by 75_'s
  **FX_VERSION_CONFLICT**, with 0 writes;
- invalid rates, an address not on the list, an unreadable caller (throw or empty), `*`, and an unset
  list are each refused, with 0 writes and no lock;
- `getEffectiveUser`, spreadsheet, trigger, request and pricing services are trapped and never touched.

Totals: 16 assertions and 16 wrapper mutants, all caught. The mutants cover: always commit, a digest
without the version, no version stop, writing the book directly, falling back to the deployer,
committing without the lock, no authority stop, no validation stop, a commit-ready default, calling the
pricing reconcile, the 32-bit hash coming back, SHA-1, a broken signed-byte hex, the listing losing
`version`, the change listing losing the old entry, and saving the live constant instead of the digested
payload. No runtime file changed since `8da211de` (§A5).

## 5. Limits

- **The boundary is the Apps Script project's edit permission.** Anyone who can edit the project can run
  the wrapper, but they could also edit 75_ itself. The allowlist is still enforced against the identity
  running it, and the audit log records that identity.
- **The Web page stays read-only.** The Administration page will show the saved book, but cannot save.
  That is phase 1's intent, not a defect.
- **The editor runs the project's saved files, not the deployment.** The build check in §3 is therefore
  required before any commit.
- **A save is a production data write.** It changes what the *next* SKU creation or import reads. Each
  import takes one FX snapshot. It reprices **no** existing `pricing_list` row, and no reconcile is run.
  That effect is why each commit needs its own approval.
- **A save does not need a deployment version** and must not create one. While the wrapper file is in
  the project, no version may be created: it would be captured in that version.
- The book is one Script Property: 8 KB cap, 50 log entries. That is unchanged.
- **This does not make the Web identify anyone.** That needs an Owner decision on an identity mechanism.
  One route is a verified Google ID token (the SEC-A2 direction), which needs a token-verification path
  and its own scope. Another is a separate admin-only deployment. Both are deployment and security
  changes outside this round.

## 6. What the Owner approves, in order (nothing here is done by the agent)

0. **No approval needed, read-only:**
   - send the `TEMP_CheckFxIdentity` log line, the active deployment version and its time, and the
     `handler` from `fxRateBook.get`.
   - If §3 says phase 1 is not viable, stop here.
1. **Approval A** — add `TEMP_FxRateBookEditorSave` to the project as a NEW temporary file, pasted from
   Git with nothing else. This is a code change to the production project, not a deployment.
2. **Run the dry run** (confirm empty, the rates as intended). Send its log line:
   - the authority,
   - the stored version,
   - any validation errors,
   - `payload_entries`: every pair, rate, source, `as_of`, `effective_from`/`effective_to`, status and
     version, exactly as they will be sent,
   - `changes`: every ADDED / EDITED / REMOVED, each with its full old and new entry,
   - the `handler`,
   - the confirm string (`… sha256 <64 hex>`).
3. **Approval B** — the exact payload in `payload_entries` and the `changes` it produces, as that dry run
   printed them. The confirm string is the SHA-256 of exactly that payload at that version.
4. **Approval C** — ONE commit: paste that confirm string, run once, and send the log line. Any edit to
   the payload needs a new dry run and a new approval.
5. **Delete the wrapper file.** Then one read-only `fxRateBook.get`: expect `doc_version 1` and the
   approved rates, with `may_edit` still `false` on the Web.
6. **Separately, and not part of this plan:** any reconcile or repricing of existing prices.
