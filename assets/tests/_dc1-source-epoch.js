// Kitchen Mama Operation System — DC1-R1 shared test helper (not a suite; the sweep runs *.test.js only).
//
// DC1-R1 made three shipped functions ask the source-write epoch before they reuse anything:
// _irRunVerifiedSearch_ (the read model and the held exposure), _irEnsureExposureLoaded_ (stamps what it reads)
// and the recommendation loader. Suites that LIFT those functions by name into a sandbox therefore need the
// helpers they now call. They are lifted from the SHIPPED page here, in one place, rather than restated in
// every harness - a restated copy could drift from the real rule, which is exactly what a lift exists to stop.
//
//   helperSrc(pageSrc)  -> the source of the five helpers + the two module variables they read/write.
//   epochStub(state)    -> a KM.DB.sourceWriteEpoch a harness can mount; `state` is { planning, exposure }.
//
// A harness that mounts NO epoch stub gets the production answer for a page without the signal: UNKNOWN, so
// every held answer is read again. That is the honest default, and why a warm-path suite mounts the stub.
var F1A = require('./_f1a-scope-guard.js');

var HELPERS = ['_irTaipeiDay_', '_irSourceStamp_', '_irSourceVerdict_', '_irLocalPlanPending_',
  '_irExposureRetireIfSourceMoved_'];

function helperSrc(pageSrc, opts) {
  opts = opts || {};
  var parts = [];
  if (opts.vars !== false) {
    parts.push('var _irReadModelSource = (typeof _irReadModelSource === "undefined") ? null : _irReadModelSource;');
    parts.push('var _irExposureSourceCheck = null;');
  }
  HELPERS.forEach(function (n) {
    if (opts.skip && opts.skip.indexOf(n) !== -1) return;
    parts.push(F1A.sliceFn(pageSrc, n));
  });
  return parts.join('\n');
}

function epochStub(state) {
  state = state || { planning: 0, exposure: 0 };
  return function () { return { planning: state.planning, exposure: state.exposure, last: null }; };
}

module.exports = { HELPERS: HELPERS, helperSrc: helperSrc, epochStub: epochStub };
