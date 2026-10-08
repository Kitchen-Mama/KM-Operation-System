/**
 * S8-ALLOC-R3 — Shared 3PL allocation policy comparison harness (READ-ONLY).
 *
 * Runs the SHIPPED allocator and the PROPOSED R3 policy allocator over the same inputs and prints both.
 * The shipped side is not re-implemented here: `_allocateShared` is extracted VERBATIM from
 * assets/js/pages/inventory-replenishment.js at run time, so this tool cannot drift from the runtime.
 *
 * Writes nothing. Reads one source file. No DB, no network, no clock dependence.
 *
 *   node assets/tools/s8-alloc-r3-policy-comparison.js
 *   node assets/tools/s8-alloc-r3-policy-comparison.js --pool 400 --sites "Amazon:1:20,Shopify:10:10,Target:100:5"
 *
 * Site syntax: name:allocation_priority:dailyDemand
 *
 * NOTE: the proposed side implements rounding option R-b (carry the exact fraction, integerize once at
 * the end). R-a (integerize per day) is a live decision — D-6 in the R3 preflight — and would give
 * different per-site totals on fractional demand.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var RUNTIME = path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js');

// ---- extract the shipped allocator verbatim (brace-matched, no regex guessing) --------------------
function loadShippedAllocator() {
    var src = fs.readFileSync(RUNTIME, 'utf8');
    var start = src.indexOf('function _allocateShared(');
    if (start < 0) throw new Error('_allocateShared not found in ' + RUNTIME + ' — the runtime moved; fix this tool, do not guess.');
    var open = src.indexOf('{', start), depth = 0, end = -1;
    for (var j = open; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
    }
    if (end < 0) throw new Error('_allocateShared braces did not close — refusing to run on a partial extraction.');
    /* eslint-disable no-eval */
    return { fn: eval('(' + src.slice(start, end) + ')'), bytes: end - start };
}

// ---- proposed R3 policy allocator (chronological, smaller priority first, R-b rounding) ----------
function policyAllocate(pool, sites, horizonDays) {
    var exact = {}; sites.forEach(function (s) { exact[s.key] = 0; });
    var remaining = pool;
    for (var d = 1; d <= horizonDays && remaining > 1e-9; d++) {
        var want = sites.filter(function (s) { return s.daily > 0; });
        var prios = want.map(function (x) { return x.priority; })
            .filter(function (v, i, a) { return a.indexOf(v) === i; })
            .sort(function (a, b) { return a - b; });            // ASCENDING — policy item 6
        for (var p = 0; p < prios.length && remaining > 1e-9; p++) {
            var g = want.filter(function (x) { return x.priority === prios[p]; });
            var sum = g.reduce(function (a, x) { return a + x.daily; }, 0);
            if (sum <= remaining) {                               // whole rank served
                g.forEach(function (x) { exact[x.key] += x.daily; });
                remaining -= sum;
            } else {                                              // item 7 — proportional within the rank
                var share = remaining;
                g.forEach(function (x) { exact[x.key] += share * x.daily / sum; });
                remaining = 0;
            }
        }
    }
    // item 10 — deterministic largest remainder, applied once (R-b)
    var keys = sites.map(function (s) { return s.key; });
    var out = {}, assigned = 0, fracs = [];
    keys.forEach(function (k) { var f = Math.floor(exact[k] + 1e-9); out[k] = f; assigned += f; fracs.push({ k: k, f: exact[k] - f }); });
    var rem = Math.round(keys.reduce(function (a, k) { return a + exact[k]; }, 0)) - assigned;
    fracs.sort(function (a, b) { return (b.f - a.f) || (a.k < b.k ? -1 : (a.k > b.k ? 1 : 0)); });
    for (var i = 0; rem > 0 && fracs.length; i = (i + 1) % fracs.length) { out[fracs[i].k] += 1; rem--; }
    return out;
}

// ---- cli -----------------------------------------------------------------------------------------
function arg(name, dflt) {
    var i = process.argv.indexOf('--' + name);
    return (i !== -1 && process.argv[i + 1]) ? process.argv[i + 1] : dflt;
}
function parseSites(spec) {
    return spec.split(',').map(function (t) {
        var p = t.split(':');
        if (p.length !== 3) throw new Error('bad site "' + t + '" — expected name:priority:dailyDemand');
        return { key: p[0].trim(), priority: Number(p[1]), daily: Number(p[2]) };
    });
}

function compare(shipped, pool, sites) {
    var cur = shipped(pool, sites.map(function (s) {
        return { key: s.key, allocationPriority: s.priority, minNeed: Math.ceil(s.daily * 18) };
    }));
    var pol = policyAllocate(pool, sites, 400);
    var curTot = sites.reduce(function (a, s) { return a + (cur.byKey[s.key] || 0); }, 0);
    var polTot = sites.reduce(function (a, s) { return a + pol[s.key]; }, 0);
    var sumNeed = sites.reduce(function (a, s) { return a + Math.ceil(s.daily * 18); }, 0);
    return {
        pool: pool, sumNeed: sumNeed, coverage: sumNeed ? (pool / sumNeed) : null,
        mode: cur.mode,
        current: sites.map(function (s) { return s.key + ' ' + (cur.byKey[s.key] || 0); }).join(' | '),
        policy: sites.map(function (s) { return s.key + ' ' + pol[s.key]; }).join(' | '),
        currentUnallocated: pool - curTot, policyUnallocated: pool - polTot
    };
}

function main() {
    var loaded = loadShippedAllocator();
    var sitesSpec = arg('sites', 'Amazon:1:20,Shopify:10:10,Target:100:5');
    var sites = parseSites(sitesSpec);
    var poolArg = arg('pool', null);
    var sumNeed = sites.reduce(function (a, s) { return a + Math.ceil(s.daily * 18); }, 0);
    var pools = poolArg ? [Number(poolArg)]
        : [Math.round(sumNeed * 1.6), sumNeed, Math.round(sumNeed * 0.8), Math.round(sumNeed * 0.63),
           Math.round(sumNeed * 0.48), Math.round(sumNeed * 0.32), Math.round(sumNeed * 0.16)];

    console.log('S8-ALLOC-R3 allocation policy comparison  (read-only)');
    console.log('runtime   : ' + path.relative(process.cwd(), RUNTIME) + '  (_allocateShared, ' + loaded.bytes + ' bytes, extracted verbatim)');
    console.log('sites     : ' + sites.map(function (s) { return s.key + ' p=' + s.priority + ' ' + s.daily + '/day need=' + Math.ceil(s.daily * 18); }).join('   '));
    console.log('sum 18-day need: ' + sumNeed);
    console.log('');
    console.log('  pool   cov   mode                   CURRENT (shipped)                    POLICY R3 (proposed)');
    console.log('  ' + new Array(110).join('-'));
    pools.forEach(function (pool) {
        var r = compare(loaded.fn, pool, sites);
        console.log('  ' + String(pool).padStart(5) + '  ' + String(Math.round(r.coverage * 100) + '%').padStart(5) + '   ' +
            r.mode.padEnd(21) + '  ' + r.current.padEnd(36) + ' ' + r.policy);
    });
    console.log('');
    console.log('Reminder: the shipped side caps each site at its own 18-day need and round-robins the leftover.');
    console.log('That cap — not allocation_priority — is what limits the distortion at comfortable pool levels.');
}

if (require.main === module) {
    try { main(); } catch (e) { console.error('REFUSED: ' + e.message); process.exitCode = 1; }
}

module.exports = { loadShippedAllocator: loadShippedAllocator, policyAllocate: policyAllocate, compare: compare };
