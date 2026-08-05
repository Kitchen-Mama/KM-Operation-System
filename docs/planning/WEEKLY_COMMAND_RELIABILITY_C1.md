# Weekly Command Reliability Hotfix — Round C1 (2026-08-05)

> **Status: SOURCE-PRESENT / TEST-VERIFIED. NOT DEPLOYED. FRONTEND-ONLY.** Fixes the "write-succeeded / acknowledgement-failed" defects on the Weekly Shipping Plan commands (Submit / Approve / Reject / Cancel / Complete / Save qty / Add Note). **No new business logic, no status-lifecycle change, no `.gs` change, no allocation-draft bridge, no live write, no deploy.**

---

## 1. Root cause (per command, one shared defect + sequencing)

The Weekly writes went `UI → KM.DB adapter → fetch POST → doPost → handler → mutation → response → **`await loadOperationDb({force:true})`** → return`. The defects:

- **WRITE_SUCCEEDED_BUT_ACK_FAILED / POST_WRITE_READBACK_RACE (Submit / Reject / Approve / Save / Note):** the adapter awaited a **whole-DB readback** *after* the handler already committed. If that reload hiccuped (slow, redirect, transient non-JSON/404), the adapter **rejected** — so the UI showed an error although the transition had committed. Second click then hit "already in that state" → the *second* attempt's message finally appeared. This is the unifying cause of symptoms 1–6.
- **FALSE_NEGATIVE_COMMAND_RESULT / envelope-mismatch:** `if (!resp.ok) throw 'API returned ' + status` and `resp.json()` on an HTML/redirect page surfaced a **transport/readback** problem as the **business** command result ("API returned 404", "Unexpected token <").
- **Submit sequencing:** the page saved qty then submitted with `.then(doSubmit).catch(doSubmit)` — a qty-save error was shown *while the submit still ran and committed* (symptom 1), and two full DB reloads made it slow (symptom 6).
- **No idempotency handling:** a retry after a committed transition returned a generic scary failure (symptoms 2, 4).
- **No double-click guard:** retries could fire duplicate calls / conflicts (symptom 7).

## 2. Canonical command result

Every Weekly mutation now returns (adapter `_kmWeeklyCommand_`, **never throws**):

```
success: { success:true,  data:{ command, committed:true, …handler data (currentStatus/updatedAt/shipment…) }, error:null }
failure: { success:false, data:null, error:{ code, message, details:{ command, … } } }
```

**The result is derived ONLY from the handler response** — the readback can no longer flip it. Error `code` ∈ `HTTP_TRANSPORT_ERROR` · `NON_JSON_RESPONSE` · `BUSINESS_COMMAND_ERROR` · `ALREADY_IN_TARGET_STATE` · `TRANSPORT_NOT_CONFIGURED`.

## 3. Fetch / redirect / JSON handling

The runner reads the response **TEXT-FIRST** and classifies: network throw → `HTTP_TRANSPORT_ERROR`; `!resp.ok` → `HTTP_TRANSPORT_ERROR` (with `httpStatus`); body not starting with `{` (HTML/redirect) or unparseable → `NON_JSON_RESPONSE` (with a short snippet); `json.success===false` → business error. An HTML/404/redirect is **never** parsed as the command result.

## 4. Parameter / mutation order (unchanged server contract)

The `.gs` handlers are **unchanged** (their existing validate-before-mutate + LockService contract is preserved; no lifecycle/status-rule change). C1 is purely the **frontend transport/ack + sequencing** repair. The Submit page flow now validates/saves qty first and **stops on a genuine qty-save failure** (does not proceed to submit), removing the "qty error shown after the plan already became Pending" artifact.

## 5. Idempotency

A repeated Submit/Reject/Approve/Cancel/Complete after the first committed transition returns a handler business error that the runner maps to **`ALREADY_IN_TARGET_STATE`**; the page treats it as **benign** — it refreshes to the current truth and shows "狀態已是最新（先前的操作可能已成功）。" instead of a scary failure. No duplicate side effect, no new lifecycle, no duplicate Shipment/stock effect (the server remains the authority for the transition).

## 6. Single readback (active path)

The adapter no longer reloads. After a successful command the page does **exactly one** readback via `_spReadbackAfterWrite_()` on the **active read path** — Workspace `renderShippingPlan()` when the flag is effective, else Legacy `loadOperationDb({force:true})` — never both. A stale/older read cannot overwrite the new state (the API-3A `_spReadSeq` guard remains).

## 7. Committed-write / readback-failed

If the command committed but the **readback** then fails, the page shows **"已提交，正在重新確認狀態…"**, performs a reconciliation render, and does **not** tell the user to blindly retry (`WRITE_COMMITTED_READBACK_FAILED` semantics). The command is still reported as success.

## 8. UI state rules

`_spRunCommand_(key, invokeFn, opts)` guards each command with a per-`planId:command` in-flight flag (double-click → second call returns `IN_FLIGHT`, no dual write), runs the command, then applies §6/§7. Genuine failure **before** commit retains the current cards + shows a structured `message [code]` and allows retry. Success is never shown optimistically before the server confirms.

## 9. Safety preserved

No change to: exact Spreadsheet-ID guard, Header immutability, validate-only schema checks, LockService, no Sheet creation / Header repair, no negative inventory, no Submit reservation, no lifecycle change, no allocation-draft schema. Production-safety suite 85/85; Golden 39/1/0; Scenario #34 Pending; pre-existing `replen-draft-completeness` P29–P31 still failing (unrelated).

## 10. Tests

`assets/tests/km-weekly-command-reliability.test.js` (**28 assertions, 0 failed**) — adapter classification (committed/HTTP-404/HTML/idempotent/business/network/not-configured), and the page layer (single readback, committed-readback-failed message, idempotent-benign, retain-on-failure, Workspace vs Legacy readback, double-click guard, key release). Existing suites green: page cutover 27/0, transport 30/0, foundation 57/0, compat 43/0, weekly workspace 66/0.

## 11. Live retest checklist (READ-first; primary DB is in use — see the write caveat)

> The primary DB is the actively bound target; the copy is emergency-rollback only → **prefer the Verification Copy for write retests.** If a controlled write retest is authorized on the primary DB, do ONE at a time and record before/after row counts + Header integrity; otherwise mark `LIVE_WRITE_READBACK_NOT_VERIFIED`.

1. Deploy frontend (`operation-system-db-api.js` + `shipping-plan.js`); no `.gs` sync needed.
2. Submit a Draft once → expect a single "Submitted for approval." + one refresh, **no** "missing or invalid parameter", card moves to Pending.
3. Immediately click Submit again → expect the benign "狀態已是最新…" (idempotent), not a scary error.
4. Reject once → single confirmation, card returns to Draft, **no** "API returned 404".
5. Approve once → single message (incl. Shipment Draft note), no temporary red-then-green flip.
6. Save qty / Add Note → prompt success without waiting on a whole-DB reload to confirm.
7. Double-click any action → only one command fires.
8. Simulate a slow/failed reload → expect "已提交，正在重新確認狀態…", not a failure.
9. Confirm no duplicate Shipment/stock effect from retries.

## 12. Deferred to Round C2

The `shipping_allocation_drafts` bridge (recommendation-seeded Weekly drafts) is **explicitly deferred to Round C2** — not started here. No other page migrated; no Weekly command moved to the Workspace API (the fix stays on the existing Legacy transport contract).

---

## Release classification

`operation-system-db-api.js` + `shipping-plan.js` = `FRONTEND_GITHUB_PAGES_REQUIRED`; test = `GIT_ONLY`; docs = `DOCUMENTATION_ONLY`. **No `APPS_SCRIPT_SYNC_REQUIRED`; `BUNDLE_REBUILD_REQUIRED=false`.** Manual, user-controlled release (`DEPLOYMENT_RELEASE_GOVERNANCE.md`). Not pushed, not deployed.
