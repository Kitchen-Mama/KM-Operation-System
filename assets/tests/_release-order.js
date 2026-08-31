// SHARED RELEASE ORDER — F1-7N-FB-4E-R4B-R3.
//
// NOT a test. Four suites each kept their own hand-copied list of release tokens and their own regex for a
// build stamp, and every round had to append the same line to all of them — which is why four suites failed
// R4B-R3 for a reason that had nothing to do with what they test. A list maintained in four places is not a
// contract; it is four chances to disagree. The order lives here once.
//
// APPEND-ONLY. A round adds its token at the END. Nothing is ever removed or reordered: the whole point of the
// list is that "at or after round X" is answerable, and rewriting history would make an older suite's floor
// mean something different than it did when it was written.
'use strict';

var ROUND_TOKENS = [
  'donenotice-20260811',
  'fb4e-transport-20260826',
  'fb4c-scope-registry-20260826',
  'fb4er1-contract-probe-20260827',
  'fb4er2-action-registry-20260827',
  'fb4er3-lifecycle-20260827',
  'fb4er4a-correlation-20260827',
  'fb4er4a1-readtransport-20260827',
  'fb4er4b-readback-20260831',
  'fb4er4br1-authority-20260831',
  'fb4er4br2-hydrationjoin-20260831',
  'fb4er4br3-liveclosure-20260831'
];

// The CANONICAL SHAPE of an Apps Script owner build stamp. The project stamps revisions of revisions
// (F1-7N-FB-4E-R4B-R3 is the third revision of the second revision of round 4E), so the revision segment
// repeats. A pattern that admitted only ONE revision segment rejected a legitimate stamp the moment a round
// needed a second one — which is exactly what happened in R4B-R3.
var BUILD_STAMP_RE = /^F1-7N-[A-Z]+-\d+[A-Z](?:-R\d+[A-Z]?\d*)*$/;

// Index of a token in the release order; -1 when unknown (a typo, or a token that was never released).
function tokenIndex(t) { return ROUND_TOKENS.indexOf(String(t)); }
// True when `t` is a known token at or after `floorToken` in the release order.
function tokenAtOrAfter(t, floorToken) {
  var i = tokenIndex(t), f = tokenIndex(floorToken);
  return i !== -1 && f !== -1 && i >= f;
}

module.exports = {
  ROUND_TOKENS: ROUND_TOKENS,
  BUILD_STAMP_RE: BUILD_STAMP_RE,
  tokenIndex: tokenIndex,
  tokenAtOrAfter: tokenAtOrAfter
};
