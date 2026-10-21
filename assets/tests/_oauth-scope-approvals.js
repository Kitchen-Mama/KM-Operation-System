/**
 * FX-AUTH-R1 — THE ONE PLACE A SCOPE ADDITION IS RECORDED AS APPROVED.
 *
 * NOT A TEST. Every manifest guard in this repository used to pin "exactly three scopes" or "the scope set
 * at <old commit>". Those guards were right, and they stay: a scope arriving without a decision is still a
 * failure in every one of them. What changes is that an addition the Owner HAS approved is named here,
 * once, with the round and the reason, and the guards compare against
 *
 *     the historical set  +  exactly the approved additions, in order
 *
 * rather than against "anything that contains the three". So:
 *   - removing a required scope fails (the set is shorter than EXPECTED);
 *   - adding any scope not listed here fails (the set is longer, or differs);
 *   - adding the approved scope twice fails (the set is longer);
 *   - the approval cannot silently grow: a second addition needs a second, named entry in this file.
 *
 * WHY THE ADDITION. Owner measurement, 2026-10-21, one read-only fxRateBook.get after setting
 * KM_FX_RATE_BOOK_EDITORS by hand: allowlist_present = true, and Session.getActiveUser() threw because the
 * manifest's explicit oauthScopes did not include userinfo.email. 75_ catches that throw and answers '',
 * so the page showed FX_AUTHORITY_UNVERIFIABLE — the same code as "the deployment cannot see the caller",
 * but for a different reason. Evidence: docs/evidence/fx-auth-r1/owner-measurement.json.
 *
 * WHAT IS NOT APPROVED, and is still caught by every guard: executeAs, access, any other scope, any OAuth
 * client setting, a '*' editor, a browser-sent email, and Session.getEffectiveUser in place of the caller.
 */
'use strict';

// The set the manifest carried from F1-4B-FM5-R4J-AUTH2 through 7376bee8, unchanged.
var BASELINE = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/bigquery'
];

var APPROVED_ADDITIONS = [
  { scope: 'https://www.googleapis.com/auth/userinfo.email',
    round: 'FX-AUTH-R1',
    approved: 'Owner, 2026-10-21 (local change only; Production not changed in this round)',
    why: 'Session.getActiveUser().getEmail() in 75_ needs it; without it the call throws and the FX '
      + 'allowlist can never match the caller, so fxRateBook.save is refused for everyone.' }
];

var ADDED = APPROVED_ADDITIONS.map(function (a) { return a.scope; });
var EXPECTED = BASELINE.concat(ADDED);

/** A historical commit's scope list, plus exactly the approved additions it did not already carry. */
function withApproved(historic) {
  var h = (historic || []).slice();
  ADDED.forEach(function (s) { if (h.indexOf(s) === -1) h.push(s); });
  return h;
}

/** A deep copy of a parsed manifest with ONLY the approved additions taken back out — for the rollback and
 *  "byte-identical to <old commit>" guards, which must still find every other key exactly as it was. */
function stripApproved(manifest) {
  var c = JSON.parse(JSON.stringify(manifest));
  if (Array.isArray(c.oauthScopes)) c.oauthScopes = c.oauthScopes.filter(function (s) { return ADDED.indexOf(s) === -1; });
  return c;
}

module.exports = {
  BASELINE: BASELINE.slice(),
  APPROVED_ADDITIONS: JSON.parse(JSON.stringify(APPROVED_ADDITIONS)),
  ADDED: ADDED.slice(),
  EXPECTED: EXPECTED.slice(),
  withApproved: withApproved,
  stripApproved: stripApproved
};
