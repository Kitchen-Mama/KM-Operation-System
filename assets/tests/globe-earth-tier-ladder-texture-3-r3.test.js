// MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §B / §J1-§J3, §J16-§J18 — THE REAL-RESOLUTION SURFACE TIER LADDER.
//
// WHAT THIS SUITE IS FOR. R2 corrected which month the Earth surface shows and reported §A4 sharpness as NOT
// DONE, because the asset was 5400x2700 before and after. R3 replaces it with three power-of-two tiers -
// 8192/4096/2048 - all derived from ONE pinned 21600x10800 July 2004 source. The claims that needs proving are:
//
//   J1  the accepted July texture is still what is active (§A is a freeze, not a suggestion)
//   J2  the source resolution per tier is REAL, not an upscale of a smaller file
//   J3  an unsupported high tier falls back safely, and a supported one can still be refused on budget
//   J16 no runtime geographic network dependency
//   J17 cache-bust tokens cover every changed asset
//   J18 all accepted Canada regression gates remain green — on EVERY tier, not just the one R2 measured
//
// IT MEASURES PIXELS, NOT PROSE. The tiers are decoded with this repository's own JPEG decoder and classified
// with the SAME regions and thresholds the frozen R2 gate uses, on the SAME 676x338 grid those thresholds were
// calibrated for. Where a claim is about sharpness it is measured against the forbidden shortcut - the R2 asset
// upscaled to 8192 - because a metric that cannot reject the shortcut is not evidence.
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var fail = 0, pass = 0;

function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + msg); } }
function eq(a, b, msg) { if (a === b) { pass++; } else { fail++; console.log('FAIL ' + msg + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); } }
function section(t) { console.log('\n== ' + t); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }

var GLOBE = read('assets/js/lib/km-globe.js');
var GLOBEC = code(GLOBE);
var INDEX = read('index.html');
var PROV = read('assets/img/earth/PROVENANCE.md');
var MAT = require(path.join(ROOT, 'assets/js/lib/km-globe.js')).material;
var builder = require(path.join(ROOT, 'tools/geo/build-earth-tiers.js'));
var verifier = require(path.join(ROOT, 'tools/geo/verify-earth-tiers.js'));
var regions = require(path.join(ROOT, 'tools/geo/earth-surface-regions.js'));

var IMG = path.join(ROOT, 'assets', 'img', 'earth');
function sha256File(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// ================================================================================================================
section('§J1 — the accepted July 2004 imagery is what is active, at a higher sample rate');
// ================================================================================================================
eq(builder.SOURCE.image_record, 73751, 'J1 the pinned source is NASA image record 73751');
ok(/200407/.test(builder.SOURCE.file), 'J1 and it is the JULY 2004 frame (' + builder.SOURCE.file + ')');
ok(!/2004(01|02|03|04|05|06|08|09|10|11|12)\./.test(builder.SOURCE.file),
  'J1 not some other month sneaking in under the same record');
eq(builder.SOURCE.width + 'x' + builder.SOURCE.height, '21600x10800', 'J1 at the published full resolution');
ok(builder.SOURCE.width === builder.SOURCE.height * 2, 'J1 which is 2:1 equirectangular (§B2)');
// The R2 acceptance baseline is RETAINED so the frozen gate keeps measuring the exact bytes it accepted.
var R2_ASSET = path.join(IMG, 'earth-albedo-5400.jpg');
ok(fs.existsSync(R2_ASSET), 'J1 the R2 acceptance-baseline asset is retained');
eq(sha256File(R2_ASSET), '4f4240673a3a1b173d61b92ca4b07bac5fd17059ea5f725ba6da5a9c5386b7ba',
  'J1 unchanged, byte for byte');
// ...and it is NOT a runtime tier any more, which must be true in the engine rather than merely intended.
ok(GLOBEC.indexOf('earth-albedo-5400.jpg') === -1,
  'J1 and the engine no longer references it — a retained baseline must not also be a live asset path');

// ================================================================================================================
section('§J2 — true source resolution per tier, and the forbidden upscale is REJECTED');
// ================================================================================================================
eq(builder.TIERS.length, 3, 'J2 three tiers');
var decoded = {};
builder.TIERS.forEach(function (t) {
  var p = path.join(IMG, t.out);
  ok(fs.existsSync(p), 'J2 ' + t.out + ' exists');
  var buf = fs.readFileSync(p);
  var pin = builder.OUTPUT_PINS[t.out];
  eq(buf.length, pin.bytes, 'J2 ' + t.out + ' byte size matches its pin');
  eq(sha256File(p), pin.sha256, 'J2 ' + t.out + ' SHA-256 matches its pin — the derivation is reproducible');
  // The SOF marker is the only place the TRUE pixel dimensions live; a pin cannot check them for you.
  var sof = verifier.jpegSof(buf);
  ok(!!sof, 'J2 ' + t.out + ' has a readable SOF marker');
  eq(sof.width + 'x' + sof.height, t.w + 'x' + t.h, 'J2 ' + t.out + ' true dimensions per its SOF marker');
  eq(sof.components, 3, 'J2 ' + t.out + ' is 3-component');
  ok(!sof.progressive, 'J2 ' + t.out + ' is baseline, not progressive');
  eq(sof.width, sof.height * 2, 'J2 ' + t.out + ' preserves the 2:1 equirectangular projection (§B2)');
  // engine declaration must agree with the file
  var decl = MAT.ASSETS[t.key];
  ok(!!decl, 'J2 the engine declares a ' + t.key + ' tier');
  eq(decl.file, t.out, 'J2 pointing at ' + t.out);
  eq(decl.w + 'x' + decl.h, t.w + 'x' + t.h, 'J2 with the same dimensions');
  eq(decl.bytes, buf.length, 'J2 and the same byte size as the file on disk');
  decoded[t.key] = verifier.decodeWhole(buf);
});

// §B1/§A4 — GENUINELY higher spatial detail. Measured at a FIXED ANGULAR STEP on a COMMON grid, because a
// per-pixel measurement of differently sized images answers the opposite question: shrinking an image packs the
// same geography into fewer texels, so coarse tiers score HIGHER. The control is the exact shortcut §B forbids.
var GW = 8192, GH = 4096;
var r2raw = verifier.decodeWhole(fs.readFileSync(R2_ASSET));
(function () {
  // Build the forbidden shortcut with the verifier's own bilinear path so there is no second implementation.
  var mod = fs.readFileSync(path.join(ROOT, 'tools/geo/verify-earth-tiers.js'), 'utf8');
  ok(/function bilinearResample\(/.test(mod), 'J2 the verifier owns the upscale used as the control');
})();
var upscaled = (function () {
  // inline bilinear, matching the verifier — kept local so this suite has no writable dependency on it
  var src = r2raw.rgb, sw = r2raw.width, sh = r2raw.height, out = new Uint8Array(GW * GH * 3);
  for (var y = 0; y < GH; y++) {
    var fy = (y + 0.5) * sh / GH - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    var ya = Math.max(0, Math.min(sh - 1, y0)), yb = Math.max(0, Math.min(sh - 1, y0 + 1));
    for (var x = 0; x < GW; x++) {
      var fx = (x + 0.5) * sw / GW - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      var xa = Math.max(0, Math.min(sw - 1, x0)), xb = Math.max(0, Math.min(sw - 1, x0 + 1));
      var o = (y * GW + x) * 3;
      for (var c = 0; c < 3; c++) {
        var v = src[(ya * sw + xa) * 3 + c] * (1 - tx) * (1 - ty) + src[(ya * sw + xb) * 3 + c] * tx * (1 - ty)
              + src[(yb * sw + xa) * 3 + c] * (1 - tx) * ty + src[(yb * sw + xb) * 3 + c] * tx * ty;
        out[o + c] = v < 0 ? 0 : (v > 255 ? 255 : Math.round(v));
      }
    }
  }
  return out;
})();
console.log('  fine-scale detail at one 8192-texel (' + (360 / GW).toFixed(4) + ' deg), on the common 8192 grid:');
console.log('    ' + 'box'.padEnd(14) + 'REAL_8192'.padStart(11) + 'UPSCALED_5400'.padStart(15) + '   ratio');
verifier.DETAIL_BOXES.forEach(function (bx) {
  var real = verifier.detailMetric(decoded.HIGH.rgb, GW, GH, bx);
  var faked = verifier.detailMetric(upscaled, GW, GH, bx);
  console.log('    ' + bx.id.padEnd(14) + real.toFixed(3).padStart(11) + faked.toFixed(3).padStart(15)
    + '   ' + (real / faked).toFixed(2) + 'x');
  ok(real > faked * 1.5, 'J2 ' + bx.id + ': the real 8192 tier carries >1.5x the fine-scale detail of an upscaled '
    + '5400 (' + (real / faked).toFixed(2) + 'x) — this is what an upscale cannot fake');
});
// And the ladder itself must be ordered at that same fixed step.
(function () {
  function onGrid(d) {
    if (d.width === GW) return d.rgb;
    var src = d.rgb, sw = d.width, sh = d.height, out = new Uint8Array(GW * GH * 3);
    for (var y = 0; y < GH; y++) {
      var sy = Math.min(sh - 1, Math.floor(y * sh / GH));
      for (var x = 0; x < GW; x++) {
        var sx = Math.min(sw - 1, Math.floor(x * sw / GW));
        var o = (y * GW + x) * 3, so = (sy * sw + sx) * 3;
        out[o] = src[so]; out[o + 1] = src[so + 1]; out[o + 2] = src[so + 2];
      }
    }
    return out;
  }
  var hi = decoded.HIGH.rgb, mid = onGrid(decoded.MID), base = onGrid(decoded.BASE);
  verifier.DETAIL_BOXES.forEach(function (bx) {
    var a = verifier.detailMetric(hi, GW, GH, bx);
    var b = verifier.detailMetric(mid, GW, GH, bx);
    var c = verifier.detailMetric(base, GW, GH, bx);
    ok(a > b && b > c, 'J2 ' + bx.id + ': detail is ordered HIGH > MID > BASE at a common angular step');
  });
})();

// ================================================================================================================
section('§J3 — an unsupported high tier falls back safely, and capability alone is not enough');
// ================================================================================================================
function caps(maxTex, extra) {
  var o = { maxTextureSize: maxTex, webgl2: true, deviceMemory: 8, hardwareConcurrency: 8 };
  for (var k in (extra || {})) o[k] = extra[k];
  return o;
}
// §B8 — never request a tier the device cannot hold. Swept, not spot-checked.
[[65536, 8192], [16384, 8192], [8192, 8192], [8191, 4096], [5400, 4096], [4096, 4096],
 [4095, 2048], [2048, 2048], [2047, 1024], [1024, 1024]].forEach(function (c) {
  var t = MAT.pickTier(caps(c[0]));
  ok(t.gpuW <= c[0], 'J3 MAX_TEXTURE_SIZE ' + c[0] + ' is never exceeded (tier width ' + t.gpuW + ')');
  eq(t.gpuW, c[1], 'J3 and ' + c[0] + ' selects the ' + c[1] + ' tier');
  ok(t.gpuW === t.gpuH * 2, 'J3 every selected tier stays 2:1');
});
// §B11 — a supported 8192 is REFUSED without a real memory or parallelism signal. This is a separate rule from
// §B8 and it must be separately true, or "do not ship an excessive file merely because 8192 is supported" is
// unenforced prose.
eq(MAT.pickTier(caps(16384, { deviceMemory: 4, hardwareConcurrency: 32 })).tier, 'REAL_MID_4096',
  'J3 4 GB of RAM does not earn the 8192 tier however many cores it has');
eq(MAT.pickTier(caps(16384, { deviceMemory: 0, hardwareConcurrency: 4 })).tier, 'REAL_MID_4096',
  'J3 nor do 4 cores with no reported memory');
eq(MAT.pickTier(caps(16384, { deviceMemory: 0, hardwareConcurrency: 0 })).reason, 'DEVICE_CAPABILITY_UNKNOWN',
  'J3 and an UNIDENTIFIED device is refused by name, not by accident');
// §B6 — the budget is a real bound.
var budgetSteps = [[192, 'REAL_HIGH_8192'], [171, 'REAL_HIGH_8192'], [170, 'REAL_MID_4096'],
                   [43, 'REAL_MID_4096'], [42, 'REAL_BASE_2048'], [11, 'REAL_BASE_2048']];
budgetSteps.forEach(function (s) {
  eq(MAT.pickTier(caps(16384, { deviceMemory: 32, hardwareConcurrency: 32, budgetBytes: s[0] * 1024 * 1024 })).tier,
    s[1], 'J3 a ' + s[0] + ' MB budget selects ' + s[1]);
});
ok(MAT.GPU_TEXTURE_BUDGET_BYTES === 192 * 1024 * 1024, 'J3 the stated budget is 192 MB');
// The top tier must FIT the stated budget — otherwise the budget is decoration.
var top = MAT.pickTier(caps(16384, { deviceMemory: 32, hardwareConcurrency: 32 }));
ok(top.estimated_gpu_bytes <= MAT.GPU_TEXTURE_BUDGET_BYTES,
  'J3 and the top tier fits inside it (' + Math.round(top.estimated_gpu_bytes / 1048576) + ' MB <= 192 MB)');
console.log('  texture memory by tier: ' + builder.TIERS.map(function (t) {
  return t.key + ' ' + Math.round(MAT.estimateGpuBytes(t.w, t.h, true) / 1048576) + ' MB';
}).join(' · '));
// The fallback chain can only go DOWN, and the rasterizer is its last rung, not a peer.
ok(/EARTH_TIER_ORDER_ = \['HIGH', 'MID', 'BASE'\]/.test(GLOBE), 'J3 the ladder is declared largest-first');
ok(/var next = EARTH_TIER_ORDER_\[order \+ 1\] \|\| null;/.test(GLOBE), 'J3 and stepping is strictly downward');
ok(/else \{ applyProceduralFallback\(reason\); \}/.test(GLOBE), 'J3 with the rasterizer as the final rung');
ok(/function beginMaterialUpgrade\(\) \{ applyTier\(matTier\.asset, ''\); \}/.test(GLOBE),
  'J3 and the upgrade requests exactly the earned tier (§B9)');
// §B — no tier upscales. The resampler is executed, not grepped.
eq(MAT.resample({ naturalWidth: 2048, naturalHeight: 1024 }, 4096, 2048), null,
  'J3 the resampler REFUSES to enlarge, so a missing asset cannot be silently magnified');
builder.TIERS.forEach(function (t) {
  eq(MAT.pickTier(caps(t.w, { deviceMemory: 32, hardwareConcurrency: 32 })).resample, 'NONE',
    'J3 the ' + t.key + ' tier needs no runtime resample at all');
});

// ================================================================================================================
section('§J16 — no runtime geographic network dependency');
// ================================================================================================================
['fetch(', 'XMLHttpRequest', 'http://', 'https://', 'new URL(', 'crossOrigin', 'importScripts',
 'WebSocket', 'EventSource', 'navigator.sendBeacon'].forEach(function (bad) {
  ok(GLOBE.indexOf(bad) === -1, 'J16 the engine contains no ' + bad);
});
ok(GLOBE.indexOf('assets/img/earth/') !== -1, 'J16 the asset root is repo-relative');
// These are checked as HOSTS AND URL SHAPES, not as words. A bare-token check for "XYZ" (the tile-scheme name)
// matched the base64url alphabet in the ADM1 ring decoder — a confident false positive of exactly the kind that
// makes a guard worse than none. So the list contains only things that cannot appear except in a tile URL.
['tile.openstreetmap', 'tiles.mapbox.com', 'api.mapbox.com', 'googleapis.com/maps', 'server.arcgisonline',
 'cartocdn.com', '{z}/{x}/{y}', '/{x}/{y}.png', 'service=WMTS'].forEach(function (bad) {
  ok(GLOBE.indexOf(bad) === -1, 'J16 and no tile service: ' + bad);
});
// The BUILD tools do use the network — that is legitimate and must stay OUT of the runtime bundle.
ok(read('tools/geo/build-earth-tiers.js').indexOf('https://') !== -1,
  'J16 the BUILD tool does reach the network (by design — it is never loaded by the page)');
ok(INDEX.indexOf('tools/geo/') === -1, 'J16 and no build tool is referenced from index.html');

// ================================================================================================================
section('§J17 — cache-bust tokens cover every changed asset');
// ================================================================================================================
// THE DEFECT THIS EXISTS TO CATCH IS A REAL ONE FROM R2: the image filename did not change when its bytes did,
// and the engine requested it with no version query, so a browser holding the old JPEG would have kept serving
// it and the corrected surface would never have arrived. index.html's tokens cover SCRIPTS; they do nothing for
// an image the engine fetches itself.
var imgTok = /var EARTH_ASSET_VERSION_ = '([^']+)'/.exec(GLOBE);
ok(!!imgTok, 'J17 the engine declares an image cache-bust token');
ok(/return a \? \(earthAssetDir\(\) \+ a\.file \+ '\?v=' \+ EARTH_ASSET_VERSION_\) : '';/.test(GLOBE),
  'J17 and every earth asset path carries it');
// The token must be pinned to CONTENT. All three tiers changed this round and BASE kept its filename, which is
// exactly the case a filename-only cache would serve stale forever.
var highSha = sha256File(path.join(IMG, 'earth-albedo-8192.jpg'));
ok(imgTok && imgTok[1].indexOf(highSha.slice(0, 8)) !== -1,
  'J17 pinned to the HIGH tier content digest (' + (imgTok ? imgTok[1] : '?') + ' contains ' + highSha.slice(0, 8) + ')');
ok(imgTok && imgTok[1] !== 'jul2004-4f424067', 'J17 and it MOVED — the R2 token would have served the old bytes');
// The co-deployed script set. R3 required these to share ONE token, because R2 had given km-globe.js a token
// of its own and left the name asset behind, which broke a sibling suite from a086104 onward.
//
// TEXTURE-3-R5 §D REPLACES THAT RULE, and the replacement is narrower rather than looser. §D asks for "one new
// map-specific token for only the CHANGED map files", because rotating a file whose bytes did not move
// re-downloads it for every user and tells the next round nothing about what actually changed. String equality
// cannot express that — it is equally satisfied by rotating everything. What R3 was really protecting against
// was a STALE PAIRING: an old consumer served against a new asset. That is what is asserted now, over an
// append-only ordered series.
// TEXTURE-3-R6 — series and current round from the shared release order, not a fourth private copy.
var RO_ = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var MAP_TOKEN_SERIES = RO_.MAP_TOKEN_SERIES;
// Ordered by DEPENDENCY: the name asset, then the resolver that reads it, then the engine that reads the
// resolver. The order is the assertion, so writing it wrongly would be visible rather than silent.
var coDeployed = ['geo-names-zh-hant.js', 'geo-name-resolver.js', 'km-globe.js'];
var toks = coDeployed.map(function (f) {
  var m = new RegExp(f.replace('.', '[.]') + '[?]v=([^"\']+)').exec(INDEX);
  ok(!!m, 'J17 index.html cache-busts ' + f);
  return m ? m[1] : null;
});
toks.forEach(function (t, i) {
  ok(MAP_TOKEN_SERIES.indexOf(t) !== -1,
    'J17 ' + coDeployed[i] + ' carries a token from the map series (' + t + ')');
});
// AND THE RULE IS: A FILE'S TOKEN MOVES WHEN THAT FILE MOVES. Derived from the sources rather than pinned to
// a list of filenames, so next round maintains itself.
//
// The first attempt at this replacement asserted the tokens were NON-DECREASING along the dependency chain,
// on the reasoning that an old consumer against a new provider is the pairing that breaks. That was wrong, and
// wrong in an instructive direction: under §D a provider moving while its consumer stays put is the NORMAL
// case, so the assertion forbade precisely what §D mandates. It failed on the very state it was written to
// describe — km-globe.js at R4 reading a resolver at R5 — which is a rule contradicting its own round.
//
// A cache token is not a compatibility number. It answers one question: will the browser re-fetch this file.
// So that is what is asserted, and the interface question is left to the suites that actually exercise the
// interface.
var CURRENT_TOKEN = RO_.currentMapToken();
var CURRENT_MARKER = new RegExp(RO_.currentMapRoundMarker());
var SRC_OF = {
  'geo-names-zh-hant.js': 'assets/js/data/geo-names-zh-hant.js',
  'geo-name-resolver.js': 'assets/js/core/geo-name-resolver.js',
  'km-globe.js': 'assets/js/lib/km-globe.js'
};
coDeployed.forEach(function (f, i) {
  var changedThisRound = CURRENT_MARKER.test(read(SRC_OF[f]));
  if (changedThisRound) {
    eq(toks[i], CURRENT_TOKEN, 'J17 ' + f + ' changed this round, so it carries this round\'s token');
  } else {
    ok(toks[i] !== CURRENT_TOKEN,
      'J17 ' + f + ' did NOT change this round, so it was not needlessly rotated (' + toks[i] + ')');
  }
});
// R2's tokens are retired everywhere, so R3's tier change really does re-fetch.
toks.forEach(function (t, i) {
  ok(t !== 'map-texture3-r2-20260826' && t !== 'map-zh-hant-20260826',
    'J17 ' + coDeployed[i] + ' carries a post-R2 token, so the changed files really re-fetch');
});

// ================================================================================================================
section('§J18 — the accepted Canada gate holds on EVERY tier, on the grid it was calibrated for');
// ================================================================================================================
// THE THRESHOLDS ARE NOT DUPLICATED SILENTLY. tools/geo/earth-surface-regions.js exists so the SAME
// classification can run on all three tiers, but the authority is the frozen R2 suite. Two copies of a bound
// that drift apart would leave the frozen one describing something that is no longer enforced — so the frozen
// file is PARSED and the numbers compared.
var R2SUITE = read('assets/tests/globe-canada-seasonal-surface-texture-3-r2.test.js');
[['SNOW_L', regions.SNOW_L], ['SNOW_SAT', regions.SNOW_SAT],
 ['SEPARATION_MIN', regions.SEPARATION_MIN], ['BORDER_STEP_MAX', regions.BORDER_STEP_MAX]].forEach(function (p) {
  var m = new RegExp('var ' + p[0] + ' = ([0-9.]+)').exec(R2SUITE)
       || new RegExp(p[0] + ' = ([0-9.]+)').exec(R2SUITE);
  ok(!!m, 'J18 the frozen R2 suite states ' + p[0]);
  if (m) eq(Number(m[1]), p[1], 'J18 and the shared module uses the IDENTICAL value for ' + p[0]);
});
// The eleven southern regions and three ice regions must be the same BOXES, not merely a similar list.
// Compared NUMERICALLY rather than as source text: "49.0" in the frozen file and 49 in the module are the same
// latitude, and a string comparison would have failed on formatting while saying "the regions differ" — which
// would be a false alarm dressed as a finding.
function frozenRegions(marker, arity) {
  var start = R2SUITE.indexOf('var ' + marker + ' = [');
  if (start < 0) return null;
  var end = R2SUITE.indexOf('\n];', start);
  var body = R2SUITE.slice(start, end < 0 ? undefined : end);
  var out = {};
  var re = /\['([^']+)',\s*\[([^\]]+)\](?:,\s*([0-9.]+))?\]/g, m;
  while ((m = re.exec(body))) {
    var nums = m[2].split(',').map(function (s) { return Number(s.trim()); });
    out[m[1]] = arity === 3 ? { box: nums, min: Number(m[3]) } : { box: nums };
  }
  return out;
}
var frozenSouth = frozenRegions('SOUTH', 2);
var frozenIce = frozenRegions('ICE', 3);
ok(!!frozenSouth && Object.keys(frozenSouth).length === 11, 'J18 the frozen suite\'s eleven southern regions are parseable');
ok(!!frozenIce && Object.keys(frozenIce).length === 3, 'J18 and its three ice regions');
regions.SOUTH.forEach(function (r) {
  var f = frozenSouth && frozenSouth[r[0]];
  ok(!!f, 'J18 southern region "' + r[0] + '" exists in the frozen suite');
  if (f) eq(f.box.join(','), r[1].join(','), 'J18 and "' + r[0] + '" has the identical box');
});
regions.ICE.forEach(function (r) {
  var f = frozenIce && frozenIce[r[0]];
  ok(!!f, 'J18 ice region "' + r[0] + '" exists in the frozen suite');
  if (f) {
    eq(f.box.join(','), r[1].join(','), 'J18 and "' + r[0] + '" has the identical box');
    eq(f.min, r[2], 'J18 and the identical brightness floor');
  }
});
eq(regions.SOUTH.length, 11, 'J18 all eleven southern/boreal regions are carried over');
eq(regions.ICE.length, 3, 'J18 and all three ice regions');

// THE GATE GRID. R2's thresholds are bounds on a measurement taken through the DC probe at 1/8 of 5400x2700 —
// 676x338, one sample about 59 km. Running them at full tier resolution is a DIFFERENT test, not a stricter one:
// measured at 5400x2700 the ACCEPTED R2 ASSET ITSELF reads a 49th-parallel step of 28 and fails its own bound,
// because forested interior British Columbia meets the drier US Columbia Plateau at -120..-117 — real land cover
// that crosses the border rather than following it. So every tier is classified on the 676x338 grid, and the
// accepted asset is measured alongside as the reference row.
var GATE_W = 676, GATE_H = 338;
function toGate(d) {
  var ow = GATE_W, oh = GATE_H, rgb = d.rgb, w = d.width, h = d.height;
  var sum = new Float64Array(ow * oh * 3), cnt = new Float64Array(ow * oh);
  var sx = w / ow, sy = h / oh;
  for (var y = 0; y < h; y++) {
    var oy = Math.min(oh - 1, Math.floor(y / sy)), ro = y * w * 3;
    for (var x = 0; x < w; x++) {
      var ox = Math.min(ow - 1, Math.floor(x / sx)), o = (oy * ow + ox) * 3;
      sum[o] += rgb[ro + x * 3]; sum[o + 1] += rgb[ro + x * 3 + 1]; sum[o + 2] += rgb[ro + x * 3 + 2];
      cnt[oy * ow + ox]++;
    }
  }
  for (var i = 0; i < ow * oh; i++) { var c = cnt[i] || 1; sum[i * 3] /= c; sum[i * 3 + 1] /= c; sum[i * 3 + 2] /= c; }
  return sum;
}
function sampler(grid) {
  return function (box) { return verifier.boxMean(grid, GATE_W, GATE_H, box); };
}
var gate = {};
[['R2_5400_accepted', r2raw], ['HIGH', decoded.HIGH], ['MID', decoded.MID], ['BASE', decoded.BASE]].forEach(function (p) {
  var res = regions.classifyAll(sampler(toGate(p[1])));
  gate[p[0]] = res;
  console.log('  ' + p[0].padEnd(18) + (res.pass ? 'PASS  ' : 'FAIL  ') + res.summary);
  ok(res.pass, 'J18 the accepted Canada gate passes on ' + p[0]
    + (res.problems.length ? ' — ' + res.problems.join('; ') : ''));
});
// §B10 restated as a measurement: the new tiers must not merely pass, they must READ THE SAME as the accepted
// asset. A tier that had drifted to different imagery could pass the gate on its own while disagreeing here.
['HIGH', 'MID', 'BASE'].forEach(function (k) {
  var worst = 0, which = '';
  Object.keys(gate.R2_5400_accepted.bands).forEach(function (b) {
    var d = Math.abs(gate[k].bands[b] - gate.R2_5400_accepted.bands[b]);
    if (d > worst) { worst = d; which = b; }
  });
  ok(worst <= 3.0, 'J18/§B10 ' + k + ' reads the same as the accepted asset (max band difference '
    + worst.toFixed(1) + ' at ' + which + ')');
});
// Two-sided, exactly as the frozen gate is: real ice must SURVIVE on every tier, or a "greener Canada" could
// have been bought by flattening the Arctic.
['HIGH', 'MID', 'BASE'].forEach(function (k) {
  gate[k].ice.forEach(function (i) {
    ok(i.bright, 'J18 ' + k + ' keeps ' + i.name + ' bright (L' + i.L + ' >= ' + i.min + ')');
  });
});

// ================================================================================================================
section('§B provenance and licence — recorded for the source AND every derived tier');
// ================================================================================================================
// Byte sizes are written with thousands separators in the markdown, so both spellings are accepted — the claim
// is "the number is recorded", not "the number is recorded without commas".
function provHasNumber(n) {
  return PROV.indexOf(String(n)) !== -1 || PROV.indexOf(Number(n).toLocaleString('en-US')) !== -1;
}
ok(PROV.indexOf(builder.SOURCE.sha256) !== -1, 'B4 provenance records the SOURCE digest');
ok(provHasNumber(builder.SOURCE.bytes), 'B4 and its byte size (' + builder.SOURCE.bytes + ')');
builder.TIERS.forEach(function (t) {
  ok(provHasNumber(builder.OUTPUT_PINS[t.out].bytes), 'B4 and the byte size of ' + t.out);
});
builder.TIERS.forEach(function (t) {
  var pin = builder.OUTPUT_PINS[t.out];
  ok(PROV.indexOf(pin.sha256) !== -1, 'B4 provenance records the OUTPUT digest for ' + t.out);
  ok(PROV.indexOf('q' + t.quality) !== -1, 'B5 and the encoder quality for ' + t.out + ' (q' + t.quality + ')');
});
ok(/4:2:0/.test(PROV), 'B5 the chroma subsampling is recorded');
ok(/Annex K/.test(PROV), 'B5 as are the quantisation tables');
ok(/NASA/.test(PROV) && /image-use-policy|not subject to copyright|not copyrighted/.test(PROV),
  'B5 the licence is recorded');
ok(/Earth imagery courtesy NASA Earth Observatory/.test(PROV) || /credit/i.test(PROV),
  'B5 with the attribution obligation stated');
ok(/area-average/i.test(PROV) && /2. box/i.test(PROV.replace(/×/g, 'x')),
  'B3 the derivation method is recorded, not just the result');
// The source must NOT be vendored: it is a build input, like the Natural Earth GeoJSON inputs.
ok(!fs.existsSync(path.join(IMG, builder.SOURCE.file)), 'B the 27 MB source is not vendored into the repository');
ok(/not vendored|build input/i.test(PROV), 'B and provenance says so');
// §B11 — the shipped weight is stated, so "responsibly sized" is a number rather than an opinion.
var totalRuntime = builder.TIERS.reduce(function (a, t) { return a + builder.OUTPUT_PINS[t.out].bytes; }, 0);
console.log('  runtime tier weight: ' + (totalRuntime / 1048576).toFixed(2) + ' MB across '
  + builder.TIERS.length + ' tiers; largest single download '
  + (builder.OUTPUT_PINS['earth-albedo-8192.jpg'].bytes / 1048576).toFixed(2) + ' MB');
ok(builder.OUTPUT_PINS['earth-albedo-8192.jpg'].bytes < 8 * 1024 * 1024,
  'B11 the largest tier stays under 8 MB (it is ' + (builder.OUTPUT_PINS['earth-albedo-8192.jpg'].bytes / 1048576).toFixed(2) + ' MB)');
ok(builder.OUTPUT_PINS['earth-albedo-2048.jpg'].bytes < 1024 * 1024,
  'B11 and the floor every device downloads stays under 1 MB');

// ================================================================================================================
section('the codec itself — deterministic, and checked against a decoder we did not write');
// ================================================================================================================
var codec = require(path.join(ROOT, 'tools/geo/jpeg-image.js'));
(function () {
  // Determinism (§B3): the same pixels must encode to the same bytes, or the pinned digests above are luck.
  var W = 96, H = 64, rgb = new Uint8Array(W * H * 3);
  for (var i = 0; i < rgb.length; i++) rgb[i] = (i * 31 + (i >> 5)) & 255;
  var a = codec.encodeJpeg({ width: W, height: H, rgb: rgb, quality: 88 });
  var b = codec.encodeJpeg({ width: W, height: H, rgb: rgb, quality: 88 });
  eq(crypto.createHash('sha256').update(a).digest('hex'), crypto.createHash('sha256').update(b).digest('hex'),
    'the encoder is deterministic — identical input gives identical bytes');
  // Partial MCUs are where a hand-written encoder usually breaks, so odd sizes are round-tripped explicitly.
  [[13, 7], [17, 33], [1, 1], [255, 3]].forEach(function (d) {
    var w = d[0], h = d[1], r = new Uint8Array(w * h * 3);
    for (var k = 0; k < r.length; k++) r[k] = (k * 37) & 255;
    var j = codec.encodeJpeg({ width: w, height: h, rgb: r, quality: 92 });
    var info = codec.decodeJpegStreaming(j, function () {});
    eq(info.width + 'x' + info.height, w + 'x' + h, 'partial-MCU round trip survives ' + w + 'x' + h);
  });
  // The decoder must REFUSE what it does not support rather than guess. A silently wrong decode would have
  // produced plausible colour everywhere and pinned it.
  var thrown = '';
  try { codec.decodeJpegStreaming(Buffer.from([0x00, 0x01, 0x02, 0x03]), function () {}); }
  catch (e) { thrown = e.message; }
  eq(thrown, 'NOT_A_JPEG', 'the decoder refuses a non-JPEG by name');
  ok(/UNSUPPORTED_JPEG_SOF/.test(read('tools/geo/jpeg-image.js')), 'and names progressive JPEG as unsupported rather than guessing');
})();
// An independent decoder agrees with ours. This is the check that a self-round-trip cannot make: the browser
// comparison is in tools/geo/verify-earth-tiers.js --browser (recorded in PROVENANCE §2b); here we use the
// pre-existing, independently written DC-only decoder, which needs no browser.
(function () {
  var dcp = require(path.join(ROOT, 'tools/geo/jpeg-dc-probe.js'));
  var img = dcp.decodeDc(fs.readFileSync(path.join(IMG, 'earth-albedo-2048.jpg')));
  ok(!img.error, 'the independent DC-only decoder reads our generated BASE tier (' + (img.error || 'ok') + ')');
  var bw = Math.ceil(2048 / 8);
  var d = decoded.BASE, sum = new Float64Array(bw * Math.ceil(1024 / 8) * 3), cnt = new Float64Array(bw * Math.ceil(1024 / 8));
  for (var y = 0; y < 1024; y++) {
    var by = (y >> 3) * bw, ro = y * 2048 * 3;
    for (var x = 0; x < 2048; x++) {
      var bi = by + (x >> 3), o = bi * 3;
      sum[o] += d.rgb[ro + x * 3]; sum[o + 1] += d.rgb[ro + x * 3 + 1]; sum[o + 2] += d.rgb[ro + x * 3 + 2]; cnt[bi]++;
    }
  }
  var tot = 0, n = 0;
  for (var yy = 0; yy < Math.min(img.h, 128); yy++) {
    for (var xx = 0; xx < Math.min(img.w, bw); xx++) {
      var a = yy * bw + xx, b2 = (yy * img.w + xx) * 3, c = cnt[a] || 1;
      for (var k2 = 0; k2 < 3; k2++) { tot += Math.abs(sum[a * 3 + k2] / c - img.rgb[b2 + k2]); n++; }
    }
  }
  var mean = tot / n;
  console.log('  our full decoder vs the independent DC-only decoder: mean |diff| = ' + mean.toFixed(3) + '/255');
  ok(mean < 4.0, 'two independently written decoders agree on our generated tier (mean ' + mean.toFixed(3) + '/255)');
})();

console.log('\n----------------------------------------');
console.log('EARTH TIER LADDER (TEXTURE-3-R3 §B): ' + pass + ' passed, ' + fail + (fail ? ' FAILED' : ' failed'));
console.log('----------------------------------------');
process.exit(fail === 0 ? 0 : 1);
