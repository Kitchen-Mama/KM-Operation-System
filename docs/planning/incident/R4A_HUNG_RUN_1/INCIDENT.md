# R4A_HUNG_RUN_1 — hung browser fatigue matrix

Diagnostic evidence only. **Rejected as acceptance evidence for S8-R4A.**

## Identity

| | |
|---|---|
| PID | 52352 (node), parent bash 48304 |
| Command | `s8-r4a-browser-fatigue.js --cycles 8 --warm 3 --scenarios ABCDEF --idle 300000 --maxwait 180000` |
| Harness commit | `e65ad50` |
| Browser tree | chrome PID 48224, profile `s8r4a-profile-DyXtrT`, port 9444 |
| Started | 2026-10-03 17:21:47 |
| Last progress | 2026-10-03 17:51:48 |
| Terminated | 2026-10-03 ~21:06 (operator-authorized, S8-R4A1 §1) |
| Stall before termination | 194 min |

## Hang stage

Scenario F (read-only UI), surface 12 of 12.

- Last successful surface: **Carrier Rate Card** — `5 read-only clicks, 1 requests`
- Next expected surface: **Site Inventory** (`ops-section`)
- The log's final line is the Carrier Rate Card result; no Site Inventory line was ever written.

Scenarios A–E completed. 182 log lines, 0 output files — the runner wrote samples only at the end.

## Root cause — harness, not Product

Three defects, all in the measurement harness:

1. **UNBOUNDED_CDP_SEND** — `cdp().send()` resolved only on a matching reply id, with no timeout.
   `openSurface`'s bounded `while (Date.now() - t0 < MAX_WAIT_MS)` loop is parked inside that `await`,
   so `maxwait` never bounded a step whose reply never arrived.
2. **UNHANDLED_JS_DIALOG** — no `Page.javascriptDialogOpening` handler. An open native dialog blocks the
   renderer, so every subsequent `Runtime.evaluate` hangs. Site Inventory is a surface whose read-only
   clicks can raise one. This is the most plausible trigger at this exact stage; it is a mechanism
   consistent with the evidence, not a proven cause.
3. **END_OF_RUN_ONLY_PERSISTENCE** — samples were written once, at completion. Three hours of completed
   measurement windows were unrecoverable because one promise never settled.

No Product defect is inferred from this run.

## Safety evidence observed

Every one of the 182 logged windows reported `abort=0`, and no window recorded a forbidden or unknown
request. Final counters were never written (defect 3), so these are per-window observations, not final
tallies — which is itself why defect 3 mattered.

## Why rejected as acceptance evidence

Scenario F is incomplete (11 of 12 surfaces), the per-request sample set was never persisted, and the
harness that produced it is the harness being repaired. `HUNG_RUN_USED_FOR_ACCEPTANCE = NO`.
