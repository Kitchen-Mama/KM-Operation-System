/**
 * THE DECLARED STATE OF THE APPS SCRIPT ADVANCED SERVICES — S8-R4D-D1 §3/§4/§22.
 *
 * WHY THIS FILE EXISTS. `appsscript.json` is in no RELEASE_OWNERS set, no suite asserted its contents, and
 * `system.health` cannot report it. The manifest is the one artefact that can silently un-deploy a feature
 * built on an advanced service, and it was the one artefact nothing watched. The gap was found by the R4D-D
 * preflight BEFORE the manifest moved, which is the only time it is cheap to close.
 *
 * WHAT IT IS. The INTENT, declared in the repository, against which the manifest BYTES are checked. The two
 * are independent on purpose: a guard that read its expectation out of the file it is guarding would pass for
 * any contents at all.
 *
 * THE TRANSITION IS EXPLICIT, AND THAT IS THE POINT. Flipping `SHEETS_ENABLED` is a deliberate, reviewable,
 * one-line commit that a human has to write. Before the flip the manifest MUST NOT declare Sheets; after it,
 * it MUST declare it exactly once at v4. There is no state in which "the service appeared and nobody decided
 * it should" passes — which is the whole failure this guards against.
 *
 * SCOPE. Enabling the service authorises the READ-ONLY BENCHMARK ONLY (S8-R4D-D1 §0). It does NOT authorise
 * the B1 product reader; `batchGet` must not appear in any Product runtime file while this is the state.
 */

module.exports = {
  // ---------------------------------------------------------------------------------------------------
  // PRE_ENABLE. The Sheets advanced service is NOT declared, and that is the expected, asserted state.
  // Flip to true ONLY in the commit that adds the service to appsscript.json for the benchmark, and say
  // why in `reason`.
  // ---------------------------------------------------------------------------------------------------
  SHEETS_ENABLED: false,
  reason: 'S8-R4D-D1 built the benchmark harness and the manifest guard; the service itself is NOT enabled. '
    + 'Enabling it is S8-R4D-D2, and it is an OPERATOR action in both the Apps Script project and the '
    + 'attached Cloud project, not an edit this repository can make on its own.',

  // The service as it must appear when it IS enabled. Re-derived from the shipped BigQuery entry's shape
  // rather than written from memory, so the syntax matches what this project already deploys.
  SHEETS_SERVICE: { userSymbol: 'Sheets', version: 'v4', serviceId: 'sheets' },

  // Services that are already enabled and must SURVIVE any manifest edit. A round that adds Sheets and
  // drops BigQuery would break the Amazon import, and the diff would look like one line.
  REQUIRED_EXISTING_SERVICES: [
    { userSymbol: 'BigQuery', version: 'v2', serviceId: 'bigquery' }
  ],

  // The OAuth scopes the manifest must carry, unchanged. B1 needs NO new scope — .../auth/spreadsheets is
  // already granted — so a scope appearing alongside a service addition is a fault, not a side effect.
  REQUIRED_OAUTH_SCOPES: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/bigquery'
  ],

  // The Web App deployment settings an advanced-service change must not disturb.
  REQUIRED_WEBAPP: { executeAs: 'USER_DEPLOYING', access: 'ANYONE_ANONYMOUS' }
};
