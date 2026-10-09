// S8-R47-A — THE F1A SCOPE-GUARD PREAMBLE, SHARED BY THE SUITES THAT eval() THE IR REGIONS.
//
// WHAT BROKE. Ten harnesses extract a marker-delimited region of inventory-replenishment.js and
// eval() it:
//     __IRCTX__  13192..13379      __IRRECO__ 13488..14255
// S8-R4D-F1A then added a stale-scope guard whose two functions live at :9941 and :9949 — far
// outside both regions. The eval'd region CALLS them, nothing defines them, and the suite dies with
// a ReferenceError before a single assertion runs. No FAIL line is ever printed, which is why a
// `^FAIL`-based sweep counted ten dead suites as neither passing nor failing for several rounds.
//
// Four suites reference `_irResultMatchesAppliedScope_`; six reference `_irAppliedScopeKey_`. Both
// are provided together because the first calls the second, so the split does not reduce the work.
//
// WHY THIS IS NOT A STUB. The guards are extracted from the shipped source verbatim, by name — the
// same approach site-switch-stale-scope-guard-s8-r4d-f1a.test.js has used since F1A landed. A stub
// returning `true` would make every one of these suites pass by disabling the very guard the page
// depends on, which is the opposite of a repair.
//
// WHY `_irSearch` IS SEEDED. `_irAppliedScopeKey_` reads `_irSearch.applied`, declared at :9893,
// outside both regions. With `applied: null` the key is '' — and the IRRECO region STAMPS
// `_irRecoState.appliedScopeKey = _irAppliedScopeKey_()` at three points inside itself, so the
// stamp and the comparison are computed from the same source and agree. The guard is live and
// exercised; it simply resolves to the one scope these fixtures describe. A suite that wants to
// prove cross-scope refusal sets `_irSearch.applied` itself and re-stamps, exactly as the F1A
// suite does.

var fs = require('fs');
var path = require('path');

var IR_PATH = path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js');

/** Extract a top-level named function verbatim, by name. Lifted from the F1A suite. */
function sliceFn(src, name, indent) {
    indent = indent || '';
    var NL = src.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
    var start = src.indexOf(indent + 'function ' + name + '(');
    if (start < 0) throw new Error('_f1a-scope-guard: could not locate ' + name);
    var endMarker = NL + indent + '}' + NL;
    var end = src.indexOf(endMarker, start);
    if (end < 0) throw new Error('_f1a-scope-guard: could not close ' + name);
    return src.slice(start, end + endMarker.length);
}

function readIr() { return fs.readFileSync(IR_PATH, 'utf8'); }

/**
 * Source to eval() in the SAME scope as the IRRECO eval, before it.
 * Pass the already-read source if the suite has it; otherwise it is read here.
 */
function guardPreamble(src) {
    src = src || readIr();
    return [
        'if (typeof _irSearch === "undefined" || !_irSearch) { global._irSearch = { applied: null }; }',
        sliceFn(src, '_irAppliedScopeKey_', ''),
        sliceFn(src, '_irResultMatchesAppliedScope_', '')
    ].join('\n');
}

/**
 * Install the guards as GLOBALS, for suites that build their harness with `new Function`.
 *
 * A `new Function` body resolves free identifiers against the global scope and its own parameter
 * list — never against the module scope of the file that constructed it. So `eval(guardPreamble())`
 * at module top level, which is enough for the eval()-based suites, is invisible to them. These
 * two functions are the ones the shipped page exports to `window` anyway (:9954-9955), so making
 * them global here mirrors what the browser already does rather than inventing a new arrangement.
 *
 * Idempotent, and it never clobbers an `_irSearch` a suite has already set up for itself.
 */
function installGlobals(src) {
    src = src || readIr();
    if (!global._irSearch) global._irSearch = { applied: null };
    new Function('g',
        sliceFn(src, '_irAppliedScopeKey_', '') +
        sliceFn(src, '_irResultMatchesAppliedScope_', '') +
        '\ng._irAppliedScopeKey_ = _irAppliedScopeKey_;' +
        '\ng._irResultMatchesAppliedScope_ = _irResultMatchesAppliedScope_;'
    )(global);
    return global;
}

/**
 * Seed the APPLIED scope and return the key a result produced for it must carry.
 *
 * Stamping fixtures with '' would satisfy the guard while proving nothing: '' is also what an
 * unconfigured page returns, so a passing assertion could not tell a correct stamp from an absent
 * one. Seeding a real country/marketplace gives the guard a non-trivial key to compare, keeps the
 * suite's own scope identity visible in the fixture, and makes MISMATCHED_SCOPE_KEY below a
 * genuinely different value rather than a cosmetic one.
 *
 * The key is computed by the SHIPPED `_irAppliedScopeKey_`, never reimplemented here — if the page
 * changes how a scope is keyed, these fixtures move with it instead of silently disagreeing.
 */
function applyScope(country, marketplaceId, src) {
    installGlobals(src);
    global._irSearch.applied = { country: country, marketplaceId: marketplaceId };
    return global._irAppliedScopeKey_();
}

/** A key no applied scope can produce. A result carrying it MUST be refused. */
var MISMATCHED_SCOPE_KEY = 'zz|NOT-THE-APPLIED-MARKETPLACE';

module.exports = {
    sliceFn: sliceFn, guardPreamble: guardPreamble, installGlobals: installGlobals,
    applyScope: applyScope, MISMATCHED_SCOPE_KEY: MISMATCHED_SCOPE_KEY,
    readIr: readIr, IR_PATH: IR_PATH
};
