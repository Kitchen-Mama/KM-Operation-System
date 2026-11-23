# Production Shipment Document Retry DR4

## Incident And Correction

Owner reported JP shipment SH-D4DA9454-E still showing Retry failed after R3.
The hover message was Production action not enabled. Read-only registry inspection
found no new JP attempt: existing detail/PL and the old failed CI record were unchanged.
The saved shipment remains shipped and its snapshot remains final.

Root cause: R3 repaired the handler and Retry UI but failed to move document.retry
from the Production profile's blocked actions into allowed actions. R3 unit tests
called the handler directly and did not exercise the real Production POST gate.
This was an omitted release dependency, not evidence that the shipment must be rerun.

DR4 permits only document.retry with canonical related_entity_type=shipment and a
nonblank string related_entity_id. Alias/PO targets remain refused. Existing R3
handler requires dispatched status and an existing final snapshot; the generator
reuses successful documents and only fills missing/failed classes. No dispatch,
stock, snapshot revision, master mapping, schema or credential changes were made.
Authentication, exact DB target, module stamps and other Production restrictions
remain enforced. Retry is still a write action, never added to read lists.

## Owner Install: Production Only

Prerequisite: the five R3 GS files already installed. Frozen two-file add-on:
`output/document-retry-dr4-20261123/release-1/candidate/Production/apps-script/`.

Copy the COMPLETE contents of ONLY:

1. 01_router.gs - APPS_SCRIPT_SYNC_REQUIRED
2. 63_api_v1_system_health.gs - APPS_SCRIPT_SYNC_REQUIRED

Save and update the SAME Web App deployment to a NEW version. Keep its endpoint,
execution identity and manifest. Do not deploy to Sandbox, copy the whole directory,
or change 00_config/84_/90_ files. The five R3 files do not need another copy if
they are already correctly installed.

Both router and system-health stamps now end in -DR4. Canonical policy SHA-256:
27eedfe4914bcebb1431b7680f5720046e937f49e3f35a7f205212f4c949add8.
The matching Production frontend policy and index cache token must be published
together: production-config.js and index.html are FRONTEND_GITHUB_PAGES_REQUIRED.
GitHub push authorization was explicitly granted for this fix. Apps Script remains
manual and Owner-operated. BUNDLE_REBUILD_REQUIRED=NO; no manifest/schema migration.

## JP Acceptance

1. Finish the two-file backend deployment, then refresh the published website.
2. Open the EXISTING JP shipment in Shipped / On the Way. Do NOT create a new
   shipment, return it to draft or press Confirm & Dispatch again.
3. Click Retry on the failed Commercial Invoice once.
4. Expect the existing detail and PL to be reused, CI to become Ready and offer
   Open/Download. Retry does not rewrite already-issued documents.
5. Verify no shipment-status/stock/reservation changes, no duplicate dispatch,
   and correct invoice SKU, quantity, declared value, regular price and carton totals.
6. If another refusal occurs, capture the new button hover reason. Do not replay
   an unknown-outcome request. Production action not enabled would indicate the
   old router/deployment is still serving, not a need to rerun shipment execution.

## Verification

The pre-fix ebb80643 Production gate reproducibly returns
PRODUCTION_ACTION_NOT_ENABLED for the exact canonical Shipment Retry payload.
Nine new tests exercise real Production doPost -> policy gate -> R3 retry handler,
using synthetic auth/Sheets/generation boundaries. They prove successful delegation,
reuse counts, PO/malformed/alias refusals, unauthenticated refusal, stale-health /
wrong-DB refusal, unshipped refusal, missing-snapshot refusal, public-client hash
equality and unchanged unrelated administration/read lists.

R3 17, R2 27, R1 24 and existing workflow regressions are rerun separately. The
generated bundle stays unchanged. Tests/tools are GIT_ONLY; this report and the
ledger are DOCUMENTATION_ONLY. Package hashes/syntax are verified before commit.

No live Retry, Drive creation, dispatch, inventory movement, import or deployment
was executed. Anonymous live diagnostic requests returned AUTH_REQUIRED; no login
credential was accessed. No whole-repository or live generation acceptance claim.
