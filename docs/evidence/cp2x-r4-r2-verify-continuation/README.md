# CP2X-R4-R2 — what happens after the UNVERIFIED wait

**What is here.** One file: `counter-example-before.json`. The *current* capture lives at
`docs/evidence/cp2x-r4-revisit/revisit.json` — the R2 scenarios are appended phases of that same
`--revisit` run, and keeping a second copy here would mean two files that must be re-taken together
and eventually will not be.

**What `counter-example-before.json` is.** The same harness, at the same SHA, run against the
**CP2X-R4-R1 candidate** — `assets/js/pages/inventory-replenishment.js` as it stood at `a918fef1`.
`assets/tests/ir-verify-continuation-browser-s8-b3-r3-cp2x-r4-r2.test.js` asserts against **both**
files: what the page does now, and what it did then, with the number it actually showed. `A4` and `A5`
check that the two pin a **different** page source and the **same** runner; if someone re-takes the
before-capture against the fixed page it stops being a counter-example, and those are what say so.

**The runner is now pinned too.** It was never in the capture’s `sources` list, so the
"same harness" assertion in this suite and in the R1 one was comparing `undefined` with `undefined`
and could not fail. Both before-captures in this round were re-taken with the runner pinned.

## Why the wait had to be staged the way it is

`KM.scopeRegistry` answers a non-forced `ensureLoaded` **out of memory** once it is READY — it issues
no request at all. A server-side delay would therefore hold a request that is never made, and the
verification callback would land in the same microtask as the click. That is exactly why `R1A4` could
not observe any of this and reported the same applied scope before and after the R1 fix. The harness
holds the registry where the delay actually is: between the page asking and the registry answering.

**Every pair stays inside one country.** A `<select>` cannot hold a value it was never offered, so
assigning a pair across a country boundary leaves the marketplace at `''` and the click is stopped by
the PRESENCE guard — a staging failure that looks exactly like a refusal. The first draft of these
three phases did precisely that and reported `verifying: false` throughout, proving nothing. JP has
three sites: Amazon `23.0`, Rakuten `29.0`, Yahoo `37.0`.

## The three scenarios, with the numbers both captures show

| | clicked | R1 candidate | now |
|---|---|---|---|
| **R2A1** nothing changes during the wait | JP/Rakuten | applied `jp\|…JP-RAK`, **29.0** | **unchanged**, `verify_outcome: CONTINUED` |
| **R2A2** marketplace moved to Yahoo, no second Search | JP/Rakuten | applied `jp\|…JP-YAH`, **37.0**, 1 repaint | applied stays `jp\|…JP-AMZ` **23.0**, `SELECTION_CHANGED`, **0** repaints |
| **R2A3** page left during the wait | JP/Yahoo | applied `jp\|…JP-YAH` **while `ops-section` was not mounted**, 1 repaint | applied unmoved, **0** repaints, `CANCELLED_UNMOUNTED`, `verify_stray` +1 |

`R2A1` is the **control**, and it is the half that stops the fix becoming "refuse after every wait":
the R1 candidate completed it correctly and so does this one, with the same number. A fix that
cancelled whenever it had waited would pass the other two and fail here.

`verify_stray` matters in `R2A3` because a discard that **happened** and one that never did look
identical on screen. The count says the late callback came back, found its round was over, and
returned before it could apply, repaint or read.

## The one case that is NOT an operator change

Loading the registry repopulates the selects, and that legitimately **drops** a marketplace id which
does not belong to the country on screen. Reading a bare inequality at settle time turned the R1
counter-example `R1A3` (US plus a Japanese id) into `SCOPE_SELECTION_CHANGED` and hid the real verdict,
`MARKETPLACE_COUNTRY_MISMATCH`, behind a cancellation — a refusal replaced by a shrug. A cancellation
now needs **positive evidence of a different choice**: another country, or another marketplace that is
actually selected. An emptied marketplace falls through to the authority, which refuses the clicked
pair by name. `F13` asserts the rule and `G6`/`G7` assert the behaviour it protects.

## What this evidence does not claim

- The fixture is a local stub. These are **request counts, repaint counts and cell values**, not
  production timings.
- The registry hold is a harness wrapper around `KM.scopeRegistry.ensureLoaded`. It changes **when**
  the authority answers, never **what** it answers.
- "The inputs changed" is decided by comparing the selectors at settle time with the pair that was
  clicked. It does not depend on a change EVENT — which is why the harness can stage it by assignment,
  and why a programmatic restore cannot slip past it either.
- No production recalculation job was started and nothing was written, in any phase.