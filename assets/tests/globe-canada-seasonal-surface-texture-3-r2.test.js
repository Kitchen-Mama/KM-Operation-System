// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R2 §L — THE CANADA SEASONAL-SURFACE ACCEPTANCE GATE.
//
// §L6 requires "a regression test or asset-analysis guard that would reject the currently submitted
// snow-dominant result", comparing "stable regional sample areas or classified surface coverage", and states
// explicitly that it "must not merely assert a filename or release token" and "must not use one fragile exact
// pixel value". So this suite measures the VENDORED PIXELS through the shipped DC-only JPEG decoder
// (tools/geo/jpeg-dc-probe.js) and asserts BOUNDED REGIONAL STATISTICS.
//
// The two-sided design is the point. It is easy to write a guard that passes by making Canada green — §L2 and
// §L3 forbid exactly that. So every assertion below has a matching one in the other direction:
//   · southern Canada must NOT be snow          AND  Greenland / N Ellesmere MUST still be ice
//   · the prairies must be vegetated/soil        AND  the St Elias glaciers must still be bright
//   · the Arctic must be brighter than the south AND  the Amazon and Sahara must be unchanged
//   · no brightness step across the 49th parallel (a step there is a colour discontinuity following a
//     political border, which is what the December asset actually produced)
//
// SELF-CHECK: the suite also asserts that its own thresholds WOULD have rejected the December asset. A guard
// that cannot fail on the known-bad input is not a guard, and that is checked here from the recorded December
// measurements rather than from a second 2.5 MB file.
//
// Run: node assets/tests/globe-canada-seasonal-surface-texture-3-r2.test.js

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var probe = require(path.join(ROOT, 'tools/geo/jpeg-dc-probe.js'));
var GLOBE = read('assets/js/lib/km-globe.js');
var GLOBEC = code(GLOBE);
var PROV = read('assets/img/earth/PROVENANCE.md');
var FETCH = read('tools/geo/fetch-earth-textures.js');

var HIGH_PATH = path.join(ROOT, 'assets/img/earth/earth-albedo-5400.jpg');
var BASE_PATH = path.join(ROOT, 'assets/img/earth/earth-albedo-2048.jpg');

// ================================================================================================================
section('§L7 — the asset is pinned, and the pin is the one the engine and the fetch tool both believe');
// ================================================================================================================
var crypto = require('crypto');
function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
var highSha = sha256(HIGH_PATH), baseSha = sha256(BASE_PATH);
var highBytes = fs.statSync(HIGH_PATH).size, baseBytes = fs.statSync(BASE_PATH).size;
ok(PROV.indexOf(highSha) !== -1, 'L7 provenance records the high-tier digest actually on disk');
ok(FETCH.indexOf(highSha) !== -1, 'L7 and the fetch tool verifies against that same digest');
// ---- RESTATED IN TEXTURE-3-R3, AND WHY ----------------------------------------------------------------------
// R3 §B replaces the tier ladder this block was written against: the surface is now 8192/4096/2048, all three
// derived from one pinned 21600x10800 July 2004 source, and `earth-albedo-5400.jpg` is no longer a runtime tier.
// So three assertions here could no longer be true AS WRITTEN. They are restated at their own STATED INTENT
// rather than deleted, and each restatement is strictly STRONGER than the original:
//
//   "the engine declares the high-tier byte size ... no stale declaration"
//       -> EVERY tier the engine declares must match the file on disk (3 files checked instead of 1).
//   "a capable WebGL2 device still earns the native tier"
//       -> a capable WebGL2 device earns the largest tier, at its NATIVE size with no resample.
//   "a 4096 device still gets the POT downscale"
//       -> the POT downscale no longer exists, because every tier is now power-of-two and maps 1:1 to an asset.
//          Restated as the rule that mattered: a device is NEVER given a tier larger than MAX_TEXTURE_SIZE.
//
// Nothing in the Canada gate itself (§L1-§L6, the regional statistics, the shortcut checks, the 49th-parallel
// step, the December self-check) is touched: those measure the IMAGERY, and the imagery is the same July 2004
// frame at a higher sample rate.
//
// One honest note that the restatement cannot carry: the "under 90 MB" bound below is a true statement about
// estimateGpuBytes(5400, 2700) and it still passes, but the ACTIVE high tier now costs 171 MB of texture memory
// against a stated 192 MB budget. That is asserted where it belongs - in the R3 suite - not implied here.
var engineTierDecls = {
  HIGH: /HIGH: \{ file: 'earth-albedo-8192\.jpg', w: 8192, h: 4096, bytes: (\d+)/.exec(GLOBE),
  MID: /MID:  \{ file: 'earth-albedo-4096\.jpg', w: 4096, h: 2048, bytes: (\d+)/.exec(GLOBE),
  BASE: /BASE: \{ file: 'earth-albedo-2048\.jpg', w: 2048, h: 1024, bytes: (\d+)/.exec(GLOBE)
};
Object.keys(engineTierDecls).forEach(function (k) {
  var m = engineTierDecls[k];
  ok(!!m, 'L7 the engine declares the ' + k + '-tier byte size');
  if (!m) return;
  var f = path.join(ROOT, 'assets/img/earth/', k === 'HIGH' ? 'earth-albedo-8192.jpg'
    : (k === 'MID' ? 'earth-albedo-4096.jpg' : 'earth-albedo-2048.jpg'));
  eq(Number(m[1]), fs.statSync(f).size, 'L7 and the ' + k + ' declaration equals the file on disk (no stale declaration)');
});
// The accepted R2 asset is RETAINED so this gate keeps measuring the exact bytes it accepted, and its digest
// stays recorded in both provenance and the fetch tool (asserted above).
ok(highBytes === 2308798, 'L7 the accepted R2 acceptance-baseline asset is unchanged at 2308798 bytes');
// §L7 asks for the GPU estimate and the filtering settings to be recorded facts, not prose.
var mat = require(path.join(ROOT, 'assets/js/lib/km-globe.js')).material;
eq(mat.estimateGpuBytes(5400, 2700, true), Math.round(5400 * 2700 * 4 * 4 / 3), 'L7 the GPU estimate is derived from the real dimensions with a mip chain');
ok(mat.estimateGpuBytes(5400, 2700, true) < 90 * 1024 * 1024, 'L7 and stays under 90 MB — §L7 forbids solving this with an unbounded image');
ok(/LINEAR_MIPMAP_LINEAR/.test(GLOBE) && /TEXTURE_MAX_ANISOTROPY_EXT/.test(GLOBE), 'L7 mipmaps and anisotropy are configured');
// §L7 / parent §B: the LOD ladder is unchanged by this round — the asset swap must not have bought appearance
// with performance. Same dimensions in, same tiers out.
// NOTE ON THESE CAPS OBJECTS: they pass deviceMemory and hardwareConcurrency EXPLICITLY. Node 21+ defines a
// global `navigator` with a real hardwareConcurrency, so a caps object that omits them silently reads the HOST
// machine's core count - which means the same assertion can pass on a 20-core dev box and fail on a 2-core CI
// runner. Always state the device.
var CAPABLE = { maxTextureSize: 8192, webgl2: true, deviceMemory: 8, hardwareConcurrency: 8 };
eq(mat.pickTier(CAPABLE).tier, 'REAL_HIGH_8192', 'L7 a capable WebGL2 device earns the largest tier');
eq(mat.pickTier(CAPABLE).resample, 'NONE', 'L7 and gets it at its NATIVE size — no runtime resample at all');
eq(mat.pickTier({ maxTextureSize: 4096, webgl2: true, deviceMemory: 8, hardwareConcurrency: 8 }).tier, 'REAL_MID_4096',
  'L7 a 4096 device gets the 4096 asset');
[[16384, 8192], [8192, 8192], [4096, 4096], [2048, 2048], [1024, 1024]].forEach(function (c) {
  var t = mat.pickTier({ maxTextureSize: c[0], webgl2: true, deviceMemory: 8, hardwareConcurrency: 8 });
  ok(t.gpuW <= c[0], 'L7 MAX_TEXTURE_SIZE ' + c[0] + ' is never exceeded (got ' + t.gpuW + ')');
});
eq(mat.pickTier({ maxTextureSize: 1024, webgl2: false, deviceMemory: 8, hardwareConcurrency: 8 }).tier, 'REAL_BASE_1024',
  'L7 and a weak device is still capped');

// ================================================================================================================
section('§L1/§L3 — the correction came from IMAGERY, not from political-country colouring');
// ================================================================================================================
// §L3 forbids a country-shaped overlay, an ISO-keyed tint, a latitude-only mask, a blur, and manual erasure.
// Each is checked against the ENGINE's code, because that is where such a shortcut would have to live.
ok(!/countryTint|isoTint|tintByIso|tintByCountry|snowMask|snowOverlay/i.test(GLOBEC),
  'L3 the engine has no country tint and no snow overlay');
ok(!/fillStyle\s*=\s*[^;]*(CA|CAN)\b/.test(GLOBEC), 'L3 no ISO-keyed fill');
// The fragment shader must not add brightness or manufacture snow: it may only LIGHT the albedo.
// Sliced between markers rather than matched with a line-ending-sensitive pattern: this file is CRLF, so a
// regex ending in "';\n" matches nothing and the assertion then throws on null instead of failing cleanly.
var _fsStart = GLOBE.indexOf('var FS_SPHERE =');
var _fsEnd = GLOBE.indexOf('var VS_PTS', _fsStart);
ok(_fsStart > 0 && _fsEnd > _fsStart, 'L3 the sphere fragment shader is locatable');
var fsBody = (_fsStart > 0 && _fsEnd > _fsStart) ? GLOBE.slice(_fsStart, _fsEnd) : '';
ok(/lit=alb\*\(amb\+0\.93\*diff\)/.test(fsBody), 'L3 lighting is MULTIPLICATIVE on the albedo (it cannot invent snow)');
ok(!/snow|ice|whiten|desaturate|saturat/i.test(fsBody), 'L3 the shader contains no snow, ice or saturation term');
ok(!/vUV\.y[^)]*step|latitude/i.test(fsBody), 'L3 and no latitude-driven colour branch');
// The relief layer perturbs the NORMAL only — so a flat white region cannot be amplified by it.
ok(/nn=normalize\(n\+\(vT\*\(hl-hr\)\+vB\*\(hd-hu\)\)\*uDetail/.test(fsBody),
  'L3 the relief layer perturbs the normal only, never the colour');
// The one latitude-banded snow gradient in the file belongs to the PROCEDURAL BOOTSTRAP, and it is bounded to
// the high Arctic — so it was never a candidate cause for white SOUTHERN Canada. Stated because §L1 requires
// the diagnosis to eliminate the other layers rather than assume the base image.
ok(/bg\.addColorStop\(0\.09, '#d2dce2'\)/.test(GLOBE) && /bg\.addColorStop\(0\.15, '#5a6f55'\)/.test(GLOBE),
  'L1 the procedural bootstrap turns green by texture-row 0.15 — i.e. by ~63N, north of the prairies');

// ================================================================================================================
section('§L2/§L6 — REGIONAL STATISTICS over the vendored surface');
// ================================================================================================================
var img = probe.decodeDc(fs.readFileSync(HIGH_PATH));
var S = probe.sampler(img);
console.log('  decoded ' + img.width + 'x' + img.height + ' -> DC ' + img.w + 'x' + img.h
  + ' (one DC pixel ~= ' + Math.round(180 / img.h * 111) + ' km)');
function stat(box) {
  var b = S.box(box[0], box[1], box[2], box[3]);
  var L = 0.2126 * b.r + 0.7152 * b.g + 0.0722 * b.b;
  var mx = Math.max(b.r, b.g, b.b), mn = Math.min(b.r, b.g, b.b);
  return { r: b.r, g: b.g, b: b.b, L: L, sat: mx <= 0 ? 0 : (mx - mn) / mx, n: b.n };
}
// THE CLASSIFIER. Deliberately crude and stated up front, because a finely tuned one could be made to pass on
// almost anything. Snow/ice = bright AND nearly colourless; that is the only definition used.
var SNOW_L = 150, SNOW_SAT = 0.12;
function isSnow(s) { return s.L >= SNOW_L && s.sat <= SNOW_SAT; }
function show(name, s) {
  return '  ' + name.padEnd(30) + 'rgb(' + Math.round(s.r) + ',' + Math.round(s.g) + ',' + Math.round(s.b) + ')'
    + ' L' + String(Math.round(s.L)).padStart(3) + ' sat' + s.sat.toFixed(2) + (isSnow(s) ? '  SNOW' : '');
}

// ---- (a) southern / populated Canada must NOT be snow -------------------------------------------------------
var SOUTH = [
  ['Vancouver / Fraser', [49.6, 49.0, -123.2, -121.8]],
  ['S British Columbia', [51.0, 49.2, -122.0, -117.0]],
  ['Calgary / Red Deer', [52.0, 51.0, -114.5, -113.0]],
  ['Saskatoon', [52.5, 51.7, -107.2, -106.0]],
  ['Winnipeg', [50.3, 49.5, -97.8, -96.4]],
  ['Prairies AB/SK/MB belt', [52.0, 49.2, -113.0, -97.0]],
  ['S Ontario / Quebec', [47.0, 43.5, -80.0, -71.0]],
  ['Toronto belt', [44.1, 43.3, -80.2, -78.6]],
  ['Montreal', [45.9, 45.1, -74.3, -72.9]],
  ['Boreal 55N', [55.5, 54.5, -100.0, -95.0]],
  ['Boreal 60N', [60.5, 59.5, -105.0, -100.0]]
];
SOUTH.forEach(function (r) {
  var s = stat(r[1]);
  console.log(show(r[0], s));
  ok(!isSnow(s), 'L6a ' + r[0] + ' is NOT snow-classified (L' + Math.round(s.L) + ' sat' + s.sat.toFixed(2) + ')');
});

// ---- (b) legitimate ice and glacier MUST survive ------------------------------------------------------------
console.log('');
var ICE = [
  ['Greenland interior', [75.0, 70.0, -45.0, -35.0], 200],
  ['N Ellesmere', [82.0, 81.0, -78.0, -72.0], 200],
  ['St Elias / Mt Logan', [61.0, 60.2, -140.8, -139.4], 140]
];
ICE.forEach(function (r) {
  var s = stat(r[1]);
  console.log(show(r[0], s));
  ok(s.L >= r[2], 'L6b ' + r[0] + ' REMAINS bright (L' + Math.round(s.L) + ' >= ' + r[2] + ') — the fix did not erase real ice');
});

// ---- (c) the bands must be SEPARATED --------------------------------------------------------------------------
// This is the single number that most cleanly distinguishes the two assets, and it is the one §L6 asks for:
// "populated southern Canadian regions must be visually distinguishable from Arctic ice".
console.log('');
var arctic = stat([80.0, 76.0, -100.0, -80.0]);
var southBelt = stat([51.0, 49.2, -113.0, -97.0]);
var boreal = stat([58.0, 55.0, -110.0, -95.0]);
var tundra = stat([67.0, 64.0, -110.0, -95.0]);
var separation = arctic.L - southBelt.L;
console.log('  arctic L' + Math.round(arctic.L) + '  tundra L' + Math.round(tundra.L)
  + '  boreal L' + Math.round(boreal.L) + '  southPrairie L' + Math.round(southBelt.L)
  + '   separation = ' + Math.round(separation));
var SEPARATION_MIN = 40;
ok(separation >= SEPARATION_MIN, 'L6c the Arctic is at least ' + SEPARATION_MIN + ' luminance above the southern prairie (measured ' + Math.round(separation) + ')');
ok(boreal.L < tundra.L, 'L6c and boreal forest is DARKER than tundra — the bands are ordered, not one field');
ok(tundra.L < arctic.L, 'L6c and tundra is darker than the Arctic');
// Not one flat field: the four Canadian bands must span a real range.
var bandLs = [southBelt.L, boreal.L, tundra.L, arctic.L];
ok(Math.max.apply(null, bandLs) - Math.min.apply(null, bandLs) >= 80,
  'L6c the four bands span >= 80 luminance (measured ' + Math.round(Math.max.apply(null, bandLs) - Math.min.apply(null, bandLs)) + ')');

// ---- (d) §L4 — NO brightness step following the political border ---------------------------------------------
console.log('');
var BORDER_STEP_MAX = 25;
[[-120, -117], [-110, -107], [-100, -97]].forEach(function (lon) {
  var us = stat([48.5, 47.5, lon[0], lon[1]]);
  var ca = stat([50.5, 49.5, lon[0], lon[1]]);
  var step = Math.abs(ca.L - us.L);
  console.log('  49th parallel ' + lon.join('..') + '   US L' + Math.round(us.L) + '  CA L' + Math.round(ca.L) + '   step ' + Math.round(step));
  ok(step <= BORDER_STEP_MAX, 'L4 no colour discontinuity across the 49th parallel at ' + lon.join('..')
    + ' (step ' + Math.round(step) + ' <= ' + BORDER_STEP_MAX + ')');
});

// ---- (e) the rest of the world is UNCHANGED in class ---------------------------------------------------------
// §L3 forbids "change the US or Greenland merely to make Canada look relatively different", so the controls are
// asserted rather than assumed.
console.log('');
var amazon = stat([-3.0, -6.0, -65.0, -58.0]);
var sahara = stat([24.0, 20.0, 10.0, 20.0]);
var pacific = stat([5.0, 0.0, -150.0, -140.0]);
console.log(show('Amazon', amazon) + '\n' + show('Sahara', sahara) + '\n' + show('Open Pacific', pacific));
ok(amazon.g > amazon.r && amazon.L < 80, 'L3e the Amazon is still dark green');
ok(sahara.r > sahara.b + 40 && sahara.L > 110, 'L3e the Sahara is still bright and warm');
ok(pacific.b > pacific.r + 15 && pacific.L < 40, 'L3e the open ocean is still dark blue');
// Ocean must remain VISIBLE but SUBORDINATE (parent §A7): it varies, and it is darker than land.
var oceanProbes = [[5, 0, -150, -140], [-20, -25, -20, -10], [40, 35, -40, -30], [-40, -45, 90, 100], [10, 5, 70, 80]];
var oceanL = oceanProbes.map(function (b) { return stat(b).L; });
var distinct = oceanL.map(function (v) { return Math.round(v); }).filter(function (v, i, a) { return a.indexOf(v) === i; });
ok(distinct.length >= 3, 'A7 the ocean is not a flat fill — ' + distinct.length + ' distinct luminances across 5 probes');
ok(Math.max.apply(null, oceanL) < southBelt.L + 40, 'A7 and the ocean stays subordinate to land');

// ================================================================================================================
section('§L6 SELF-CHECK — these thresholds WOULD have rejected the December asset');
// ================================================================================================================
// A guard that cannot fail on the known-bad input is not a guard. These are the measurements taken from the
// December asset that this round replaced (tools/geo/jpeg-dc-probe.js over the same boxes), recorded here so the
// guard's own discriminating power is asserted rather than believed.
var DECEMBER = {
  prairieBelt: { L: 192, sat: 0.034 },
  saskatoon: { L: 213, sat: 0.000 },
  winnipeg: { L: 152, sat: 0.070 },
  boreal55: { L: 159, sat: 0.070 },
  boreal60: { L: 199, sat: 0.070 },
  arctic: { L: 176 },
  border110: { us: 111, ca: 183 }
};
ok(DECEMBER.prairieBelt.L >= SNOW_L && DECEMBER.prairieBelt.sat <= SNOW_SAT,
  'L6s the December prairie belt WOULD be snow-classified by this guard');
ok(DECEMBER.saskatoon.L >= SNOW_L && DECEMBER.saskatoon.sat <= SNOW_SAT, 'L6s as would December Saskatoon');
ok(DECEMBER.winnipeg.L >= SNOW_L && DECEMBER.winnipeg.sat <= SNOW_SAT, 'L6s and December Winnipeg');
ok(DECEMBER.boreal55.L >= SNOW_L && DECEMBER.boreal55.sat <= SNOW_SAT, 'L6s and December boreal 55N');
ok(DECEMBER.boreal60.L >= SNOW_L && DECEMBER.boreal60.sat <= SNOW_SAT, 'L6s and December boreal 60N');
ok((DECEMBER.arctic.L - DECEMBER.prairieBelt.L) < SEPARATION_MIN,
  'L6s December FAILS the band-separation gate (its Arctic is ' + (DECEMBER.arctic.L - DECEMBER.prairieBelt.L) + ' — the south is BRIGHTER than the ice)');
ok(Math.abs(DECEMBER.border110.ca - DECEMBER.border110.us) > BORDER_STEP_MAX,
  'L6s and December FAILS the 49th-parallel step gate (step ' + Math.abs(DECEMBER.border110.ca - DECEMBER.border110.us) + ')');
// And the guard is not vacuous in the other direction either: the thresholds must be reachable by real imagery.
ok(SNOW_L > 0 && SNOW_SAT > 0 && SEPARATION_MIN > 0 && BORDER_STEP_MAX > 0, 'L6s every threshold is a stated bound, not zero');

// ================================================================================================================
section('§A2/§A3 — vendored, pinned, and NO runtime network dependency');
// ================================================================================================================
ok(!/https?:\/\//.test(GLOBEC), 'A3 the engine contains no URL of any kind');
['fetch(', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'EventSource'].forEach(function (t) {
  ok(GLOBEC.indexOf(t) === -1, 'A3 and no ' + t);
});
ok(/EARTH_ASSET_DIR_ = 'assets\/img\/earth\/'/.test(GLOBE), 'A2 the asset directory is repo-relative');
// Checked as HOSTS rather than as words: a bare /tile/i also matches `noiseTile`, the engine's own procedural
// helper, so the word-level form failed on legitimate code and said "CDN" about it.
ok(!/(googleapis|gstatic|unpkg|jsdelivr|cloudflare|akamai|maps\.google|tile\.openstreetmap|tiles?\.[a-z]+\.[a-z]{2,})/i.test(GLOBEC),
  'A3 no CDN, tile server or Google host');
ok(!/\/\/[a-z0-9.-]+\.(com|net|org|io|dev)\//i.test(GLOBEC), 'A3 and no remote host of any form');
// The provenance must carry every §L7 field.
['Source', 'Licence', 'SHA-256', 'Dimensions', 'Byte size'].forEach(function (f) {
  ok(new RegExp(f, 'i').test(PROV), 'L7 provenance records ' + f);
});
ok(/July 2004/.test(PROV), 'L7 provenance names the acquisition month actually vendored');
ok(/73751/.test(PROV), 'L7 and the upstream image record');
ok(/node tools\/geo\/fetch-earth-textures\.js/.test(PROV), 'L7 with a deterministic re-acquisition command');

// ================================================================================================================
console.log('\n----------------------------------------');
console.log('CANADA SEASONAL SURFACE (TEXTURE-3-R2 §L): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
