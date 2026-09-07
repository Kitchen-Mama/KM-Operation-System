# Minimal paste — R6-R7-R3-P2 preflight flag phase, without losing the frozen baseline

## Why this document exists

Your Apps Script copy of `TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs` holds a **frozen**
`R6R7_NO_ACTION_BEFORE_`. You pasted it there from the manifest's `freeze_paste_block`, and the readback
answers `AWAITING_ACTIVATION` because of it.

The repository copy of that constant is **null on every live field**, and it has to be: a repository cannot
hold one activation's captured baseline, and shipping somebody's live snapshot as source would be worse than
shipping none. So **do NOT re-paste the whole file.** A whole-file paste would reset your freeze to null, the
readback would go back to `BASELINE_NOT_FROZEN`, and you would be rebuilding the baseline from log output
again.

Two ways to apply this round. Either one is a single, checkable edit. Pick one.

---

## Option 1 — surgical, recommended

Three replacements in your existing editor copy. Your `R6R7_NO_ACTION_BEFORE_` is never touched.

Every FIND string below is verified against the repository census by
`assets/tests/controlled-preflight-flag-phase-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r3-p2.test.js` §H4, so if one of
them ever drifts the test suite fails rather than this document quietly becoming wrong.

### 1.1 — delete the contradictory predicate

**FIND** (one line, inside `RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT`):

```
  P('flag_is_still_false_this_round', false, flagVal, flagVal === false);
```

This is the whole defect. It is the only line that has to go.

**REPLACE WITH** the block from `§3 THE GATES BLOCK` of the repository file — from the comment line
`  // R6-R7-R3-P2 — the flag is OBSERVED into a phase` down to the closing brace of the
`if (fp.phase === 'PRE_ACTIVATION') { … } else if (fp.phase === 'POST_ACTIVATION') { … }` branch. Copy it
from the repo copy of the census; it also replaces the four lines above it that read the flag and build
`out.flag` / `out.allowlist`.

<!-- ANCHOR: P('flag_effective_is_an_observable_boolean', -->
<!-- ANCHOR: P('flag_phase_is_one_of_the_two_declared_phases', R6R7_FLAG_PHASES_, fp.phase, -->
<!-- ANCHOR: P('this_preflight_is_not_an_authorization_source', true, fp.authorization_is_external, -->

### 1.2 — add the phase reader

**FIND** (the section header immediately above the preflight):

<!-- ANCHOR: // §4 — THE CONTROLLED AI PLAN PREFLIGHT. Read-only, no arguments, hard-coded scope. -->

```
// §4 — THE CONTROLLED AI PLAN PREFLIGHT. Read-only, no arguments, hard-coded scope.
```

**INSERT ABOVE IT** the whole `R6R7_FLAG_PHASES_` / `R6R7_FLAG_NAME_` / `CENSUS_r6r7FlagPhase_` block from the
repo copy.

<!-- ANCHOR: function CENSUS_r6r7FlagPhase_() { -->
<!-- ANCHOR: var R6R7_FLAG_PHASES_ = ['PRE_ACTIVATION', 'POST_ACTIVATION']; -->

### 1.3 — the phase reaches the declared evidence, the POST block, and the proof

Four smaller edits, all copied verbatim from the repo copy:

| what | find |
|---|---|
| declared evidence | `RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT: ['production_path', 'parity'],` → the three-item version |
| the preflight's declared shape | `flag: null, allowlist: null,` → add `flag_phase: null,` above it |
| the POST_ACTIVATION production block | insert after `P('production_path_would_not_refuse', …)` |
| the bounded proof + its guard | add the five `flag_*` keys, and the two `missing.push` lines |

<!-- ANCHOR: RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT: ['production_path', 'parity', 'flag_phase'], -->
<!-- ANCHOR: P('post_activation_production_would_not_write', false, pp.would_write, pp.would_write === false); -->
<!-- ANCHOR: flag_phase: (out.flag_phase || {}).phase || null, -->

---

## Option 2 — whole file, then put your freeze back

If the surgical edit is fiddly, do it the other way round. **One** block to carry across, not three logs.

1. In your **current** editor copy, find `var R6R7_NO_ACTION_BEFORE_ = {` and select down to the matching
   `};`. Copy that whole object — it is your frozen baseline — into a scratch note.
2. Paste the **new** repository census over the whole file.
3. Find `var R6R7_NO_ACTION_BEFORE_ = {` in the new file and replace that object with the one from step 1.
4. Save.

<!-- ANCHOR: var R6R7_NO_ACTION_BEFORE_ = { -->

Do not skip step 1. The new file's copy is null on every live field.

---

## Verify — the same two calls either way

```
1. RUN_R6R7_CONTROLLED_NO_ACTION_READBACK()
   MUST answer AWAITING_ACTIVATION with baseline_frozen true.
   If it answers BASELINE_NOT_FROZEN, the freeze did not survive — go back to Option 2 step 3.

2. RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT()
   MUST answer READY_NO_ACTION, and r6r7_proof must carry
     flag_phase          PRE_ACTIVATION   (while the flag is still false)
     flag_effective      false
     flag_observable     true
     authorization_is_external  true
   predicates_passed 34, predicates_failed 0.
```

Both calls are read-only and touch zero cells. Neither flips a flag, and neither is an authorization.

---

## What changed, in one paragraph

The preflight used to require the flag to be **off**. That made it contradict step 8 of its own runbook, which
requires running it again **after** the flag goes on — the last read before Generate is pressed. Worse, it
made a read-only diagnostic into an implicit authorization gate, which it is not: whether the flag *may* be
flipped is `RUN_R6R7_CONTROLLED_NO_ACTION_ACTIVATION_MANIFEST`'s question, and that census keeps its own
`flag_is_still_false` predicate, untouched.

The flag is now a **phase** the preflight observes: `PRE_ACTIVATION` (strictly false), `POST_ACTIVATION`
(strictly true), or `UNOBSERVABLE` — an absent reader, a throw, a null, or a truthy **non-boolean**, which
STOPs, because the string `'false'` is truthy and a lenient read would have called it `POST_ACTIVATION`.

`POST_ACTIVATION` carries **more** requirements than `PRE_ACTIVATION`, not fewer: the allowlist must be
exactly the one frozen scope, and production must still answer `AI_PLAN_NO_ACTION` /
`NO_REPLENISHMENT_REQUIRED` with `would_write false`, `writer_reached false`, `recommended_qty 0`,
`qualifying_active_planned_qty 520` and `residual_qty 0`. A residual appearing after the flip is the state
changing underneath the authorization, and the answer to that is STOP while a STOP still costs nothing.
