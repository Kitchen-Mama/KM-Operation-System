# S8-R4C-P1 — FINAL CACHE TOKEN ROTATION + R42 CONTROLLED PUBLICATION FREEZE

**Status: FROZEN · NOT SYNCED · NOT DEPLOYED · NOT PUBLISHED · R4C NOT EXECUTED.**

This round mints no behaviour. It spends two cache tokens and freezes the SHA that Production acceptance
is allowed to measure.

---

## 1. Why the rotation is not cosmetic

`p1-cumulative-20261002` is on `origin/main` (`8856aeb` was pushed), so by the rule `_release-order.js` has
now stated five rounds running, **those bytes have reached a browser and the token cannot be reused**.

Publishing without rotating is the silent failure mode: the deployment reports success, and the change
reaches nobody who already uses the application, while every measurement taken afterwards says it shipped.

Two families move, and they are not interchangeable.

| family | spent | minted | why it had to move |
|---|---|---|---|
| application | `p1-cumulative-20261002` | `s8r4c-lazyexposure-20261004` | three JS files changed |
| Site Inventory CSS | `ircompactrecon-20260905` | `irlazyexposure-20261004` | six new rules the page now emits |

**The application half.** A browser holding the OLD `inventory-replenishment.js` against the new index keeps
the nineteen-sheet read: the entire two-layer architecture ships to nobody who already uses the app. Worse
and specific to R4B-2D — holding the old `km-api-foundation.js` against the new page means the page sends a
`siteScope` the DTO whitelist **silently discards**, so the request becomes the all-site read it was before
and nothing on screen says so.

**The CSS half.** R4B-2B emits six classes that did not exist before. Against the cached stylesheet every one
of them has **zero rules**: the pending ellipsis renders as unstyled body text beside real quantities, the
failure row loses its alert framing, and Retry/Refresh render as default browser buttons inside a data card.
The states would still be *correct* and would look like a bug — which is the `.replen-ai-plan-result` defect
this repository has already shipped once, and the reason the IR CSS family exists at all.

```
NEW_LAZY_EXPOSURE_CLASS_SET = replen-card__value--pending · replen-card__note · replen-card__row--error
                              replen-card__row--meta · ir-exposure-retry · ir-exposure-refresh
NEW_CLASSES_PRESENT_IN_NEW_CSS = YES (6/6)      OLD_CACHED_CSS_MISSING_CLASS_COUNT = 6 (read from 8856aeb)
```

All six are also **emitted by the page** — a rule for nothing would be the mirror defect, and is asserted
separately.

---

## 2. What rotated, and what deliberately did not

```
TOKEN_ROTATION_FILE_SET  (4 TRACKED files — the preflight predicted 7, and the difference is stated below)
  index.html                                    55 application refs + 1 IR CSS ref
  assets/js/app.js                               8 application refs (the route-loaded page module)
  assets/tests/_release-order.js                 both series APPENDED (never rewritten)
  assets/tests/production-ui-copy-…-r6.test.js   one literal pin re-aimed (§4)

  assets/tests/_p1b8c-acceptance.html            9 + 1 refs — ROTATED LOCALLY, NOT COMMITTED
```

**`_p1b8c-acceptance.html` is `.gitignore`d** (`.gitignore:5`). The R4B-2B rotation plan listed it as a
rotation target on the strength of a `grep`, which finds it; `git` does not track it. It was rotated anyway so
the local harness exercises the bytes that will actually ship rather than stale ones — but it is **not in the
commit, not in the publication set, and not a file the operator syncs**. Counting it as a rotated repository
file would have overstated the set by one.

**Not rotated, on purpose:** the method-registry family (`fc1be3r4a2r1r6r4-method-registry-20260905`) and the
map family. Neither file changed. Rotating an unchanged family spends a token for nothing and breaks its
served reference — the mirror image of the fault above, and mutant **M6** catches it.

`NO_FOURTH_TOKEN_FAMILY_INTRODUCED = YES`. An invented token is checkable by *no* helper, and a rotation
nobody can verify is indistinguishable from no rotation at all (mutant **M4**).

---

## 3. Verified against the governance helpers, not by eye

```
currentAppToken()          = s8r4c-lazyexposure-20261004
currentIrCssToken()        = irlazyexposure-20261004
appTokenRefCount(index)    = 55        (reported, never pinned — adding an asset moves it)
staleAppTokenRefs()        = []        STALE_APPLICATION_TOKEN_REFERENCE_COUNT = 0
staleRouteAssetTokenRefs() = []        STALE_IR_CSS_TOKEN_REFERENCE_COUNT     = 0
misplacedIndexTokens()     = []        checked in BOTH directions
```

Both tokens are **appended**, never spliced: `stampAtOrAfter` and `tokenAtOrAfter` compare **indexes**, so a
splice would invert every floor written against either token. Mutant **M7** catches it.

---

## 4. The one assertion that needed re-aiming

The task anticipated three. **One** was real:

`production-ui-copy-…-r6` **C8** pinned `currentIrCssToken()` to the literal `ircompactrecon-20260905`. That
says *"R6-R6 rotated the stylesheet"*, but what it **enforces** is *"no later round may rotate it"* — and the
IR CSS family exists precisely so later rounds can. It is the equality-with-now defect `_release-order.js`
documents at length for the application and map series, surviving in the third family.

It is re-aimed to the durable claim, **not weakened**: the stylesheet's token is a member of the **IR CSS
family** (C8), at or after the token R6-R6 itself minted (C8a), and `index.html` serves the stylesheet on
exactly that token (C8b) — which is the served fact the literal never actually checked.

The other two the task expected were already written against the series helpers (`co1100r` A2–A4 derive from
`currentAppToken()`), which is why they passed. **Nothing was loosened to make a test green.**

---

## 5. Still open

- **Write-driven invalidation remains debt.** A write made on another page does not invalidate this page's
  exposure cache; explicit Refresh is the operator path.
- **Hard-reload persistence and a server cache remain out of scope**, by instruction.
- **`PHASE1_RELEASE_EXECUTION_RUNBOOK_R1.md` and `PHASE1_CUMULATIVE_RELEASE_RECONCILIATION_R1.md`** still name
  `p1-cumulative-20261002` (8 and 2 references). They are **historical artifacts pinned at their own SHAs**
  and are left as written, exactly as the R41 ledger entry left the R40 reconciliation. Anyone executing
  either runbook after this round must re-derive the token from `_release-order.js`.

---

## 6. The frozen order

**Backend first, and it is load-bearing in one direction only.** A published frontend against a pre-R42
backend sends `siteScope` to a handler that ignores it and returns every site — which is exactly today's
behaviour, and the retained client-side scope filter keeps the screen correct. The backend goes first anyway,
because "correct but silently unscoped" is the state this release exists to end, and nothing should be able to
report it as finished while it persists.

```
1  operator pushes feature                       7  ONLY IF health PASS: fast-forward main
2  Apps Script OVERWRITE 60_                     8  wait for Pages propagation
3  Apps Script OVERWRITE 63_                     9  prove served application token is new
4  ONE new version on the existing Web App      10  prove served IR CSS token is new
5  R42 system.health gate                       11  execute Production R4C acceptance
6  (gate detail in §7 below)

FINAL_R42_APPS_SCRIPT_SYNC_SET = 60_api_v1_inventory_replenishment_workspace.gs
                                 63_api_v1_system_health.gs      OVERWRITE only · CREATE 0 · DELETE 0
                                 no router · no generated bundle · no TEMP
```

---

## 7. The R42 health gate

```
LIVE_BUILD_ID = R42            LIVE_RELEASE_ID = R42          mixed_deployment = false
missing_required_modules = []  stale_required_modules = []    missing_actions = []
action contract = 18           workspace_module_build (60_) = R42
63_ owner stamp = R42          01_router owner stamp = R41    unexpected R42 owner count = 0
KM_BUNDLE_CONTENT_HASH_ = unchanged (no core module moved)
```

`01_` at R41 is a **gate condition, not an oversight**: R42 adds no action and moves no route, and a router
marched to R42 to make the release look complete is the one thing these stamps exist to prevent.
