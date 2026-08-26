#!/usr/bin/env node
/**
 * tools/geo/verify-earth-material.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-2 §J — DETERMINISTIC VISUAL ACCEPTANCE.
 *
 * §J asks for the ten fixed views to be inspected rather than asserted, and forbids claiming visual success
 * without looking. There is no WebGL, no browser and no GPU in this environment, so a rendered screenshot is
 * impossible here — saying otherwise would be the exact dishonesty §J is guarding against. What IS possible is to
 * check the two things a screenshot would be taken to check, and to be explicit about the one it cannot:
 *
 *   1. THE PIXELS. tools/geo/jpeg-dc-probe.js decodes the vendored albedo's DC coefficients, giving an exact
 *      1/8-scale image. Every §J content claim - land is not a uniform blurred green, real macro geography sits in
 *      the correct broad regions, the ocean is not a flat single colour, there is no dateline seam - is a
 *      measurement on those pixels, using the SAME water-mask formula the shipped shader uses.
 *
 *   2. THE RENDER DECISIONS. The real exported material functions (pickTier, minDistForTier, magnificationAt,
 *      detailForDistance, resample) are run for each of the ten views, so the active tier, the texel density, the
 *      zoom limit and the relief strength at each view are computed by the shipped code, not restated.
 *
 *   NOT COVERED, and left as a manual checkpoint: the assembled GPU frame - lighting balance, specular taste,
 *   border/label legibility over the new surface. That needs eyes on a real render.
 *
 *   node tools/geo/verify-earth-material.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var PROBE = require(path.join(__dirname, 'jpeg-dc-probe.js'));

global.window = global.window || {};
require(path.join(ROOT, 'assets', 'js', 'data', 'world-land-110m.js'));
var GLOBE = require(path.join(ROOT, 'assets', 'js', 'lib', 'km-globe.js'));
var MAT = (global.window.KMGlobe && global.window.KMGlobe.material) || (GLOBE && GLOBE.material);

var ASSET_DIR = path.join(ROOT, 'assets', 'img', 'earth');

// ---------------------------------------------------------------- regions, chosen for what they PROVE
// Each is a broad box (continental scale), because the claim being tested is about macro geography. `expect` is
// the qualitative class the region must fall into; the classifier is below and is deliberately crude, because a
// finely tuned one could be made to pass on almost anything.
// A NOTE ON SEASON, because it changes what may honestly be asserted. The two vendored assets are different
// Blue Marble products: the 2048 base is a growing-season composite, while the only 5400x2700 topography+
// bathymetry image NASA publishes is DECEMBER 2004. In December the eastern US reads bare brown and boreal Canada
// reads snow-white - correct imagery, and a probe expecting 'vegetated' there would be asserting the wrong thing.
// So the STRICT class expectations are applied only to regions whose appearance is season-stable (equatorial
// rainforest, the great deserts, the permanent ice sheets). Northern mid-latitude probes are still measured and
// printed - they contribute to the spread and no-repeated-noise checks - but their class is 'any-land'.
var LAND_PROBES = [
  { name: 'Amazon basin',        box: [ -2,  -8,  -68, -58], expect: 'vegetated' },
  { name: 'Congo basin',         box: [  3,  -3,   17,  27], expect: 'vegetated' },
  { name: 'Sahara',              box: [ 24,  18,    5,  25], expect: 'arid' },
  { name: 'Arabian desert',      box: [ 24,  19,   45,  53], expect: 'arid' },
  { name: 'Australian interior', box: [-22, -28,  125, 135], expect: 'arid' },
  { name: 'Greenland interior',  box: [ 76,  70,  -45, -30], expect: 'ice' },
  { name: 'Antarctica (E)',      box: [-75, -82,    0,  30], expect: 'ice' },
  { name: 'Eastern US forest',   box: [ 40,  33,  -88, -78], expect: 'any-land' },
  { name: 'US southwest',        box: [ 37,  33, -114,-107], expect: 'any-land' },
  { name: 'Central US plains',   box: [ 43,  38, -101, -96], expect: 'any-land' },
  { name: 'Rocky Mountains',     box: [ 45,  40, -113,-106], expect: 'any-land' },
  { name: 'Tibetan plateau',     box: [ 34,  30,   85,  95], expect: 'any-land' }
];
var OCEAN_PROBES = [
  { name: 'Pacific abyssal',     box: [  5,  -5, -150,-140] },
  { name: 'Atlantic abyssal',    box: [  5,  -5,  -30, -20] },
  { name: 'Indian Ocean',        box: [-10, -20,   70,  85] },
  { name: 'Southern Ocean',      box: [-50, -60,    0,  20] },
  { name: 'North Pacific',       box: [ 40,  30, -170,-160] }
];

// The SHIPPED water mask, transcribed from FS_SPHERE: smoothstep(0.012, 0.085, b - max(r,g)) on the ENCODED
// values. Running the real formula is the point - a different threshold here would prove nothing about the globe.
function waterMask(r, g, b) {
  var x = (b - Math.max(r, g)) / 255;
  var t = (x - 0.012) / (0.085 - 0.012);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}
function classify(c) {
  var mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b);
  if (waterMask(c.r, c.g, c.b) > 0.5) return 'water';
  if (mn > 150 && (mx - mn) < 45) return 'ice';
  if (c.g > c.r && c.g > c.b) return 'vegetated';
  if (c.r > c.b + 18 && mx > 90) return 'arid';
  return 'other-land';
}
function hex(c) {
  function h(v) { var s = Math.round(v).toString(16); return s.length < 2 ? '0' + s : s; }
  return '#' + h(c.r) + h(c.g) + h(c.b);
}
function stdev(a) {
  if (a.length < 2) return 0;
  var m = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
  return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / a.length);
}

// ---------------------------------------------------------------- the ten §J views
var VIEWS = [
  { n: 1,  name: 'Global Earth',              lat:   0, lng:    0, dist: 3.00 },
  { n: 2,  name: 'North America medium',      lat:  45, lng: -100, dist: 2.20 },
  { n: 3,  name: 'North America close',       lat:  40, lng:  -95, dist: 1.50 },
  { n: 4,  name: 'Europe close',              lat:  50, lng:   10, dist: 1.50 },
  { n: 5,  name: 'East Asia / Japan',         lat:  36, lng:  138, dist: 1.60 },
  { n: 6,  name: 'Australia',                 lat: -25, lng:  133, dist: 1.80 },
  { n: 7,  name: 'Pacific / dateline seam',   lat:   0, lng:  180, dist: 1.80 },
  { n: 8,  name: 'Polar region',              lat:  80, lng:    0, dist: 2.00 },
  { n: 9,  name: 'Maximum meaningful zoom',   lat:  35, lng:  -90, dist: null },
  { n: 10, name: 'Base-tier fallback',        lat:  35, lng:  -90, dist: 1.50, forceTier: 'BASE' }
];

var CAPS_HIGH = { maxTextureSize: 16384, webgl2: true };
var CAPS_POT  = { maxTextureSize: 8192,  webgl2: false };
var CAPS_BASE = { maxTextureSize: 2048,  webgl2: false };
var VIEWPORT_H = 1400;   // a typical 700 CSS px globe at dpr 2

function run() {
  var out = { assets: [], views: [], checks: [], fail: 0 };
  function chk(cond, label, detail) {
    out.checks.push({ ok: !!cond, label: label, detail: detail || '' });
    if (!cond) out.fail++;
    return !!cond;
  }

  // ---------------- pixels ----------------
  ['earth-albedo-2048.jpg', 'earth-albedo-4096.jpg', 'earth-albedo-8192.jpg'].forEach(function (file) {
    var full = path.join(ASSET_DIR, file);
    if (!fs.existsSync(full)) { chk(false, 'asset present: ' + file, 'MISSING'); return; }
    var img = PROBE.decodeDc(fs.readFileSync(full));
    if (img.error) { chk(false, 'asset decodes: ' + file, img.error); return; }
    var S = PROBE.sampler(img);
    var rec = { file: file, source: img.width + 'x' + img.height, dc: img.w + 'x' + img.h, land: [], ocean: [] };

    LAND_PROBES.forEach(function (pr) {
      var c = S.box.apply(null, pr.box);
      if (!c) return;
      rec.land.push({ name: pr.name, hex: hex(c), cls: classify(c), water: +waterMask(c.r, c.g, c.b).toFixed(3), expect: pr.expect, r: c.r, g: c.g, b: c.b });
    });
    OCEAN_PROBES.forEach(function (pr) {
      var c = S.box.apply(null, pr.box);
      if (!c) return;
      rec.ocean.push({ name: pr.name, hex: hex(c), water: +waterMask(c.r, c.g, c.b).toFixed(3), lum: +(0.299 * c.r + 0.587 * c.g + 0.114 * c.b).toFixed(1), r: c.r, g: c.g, b: c.b });
    });

    var tag = ' [' + file + ']';

    // §J - "land is not a uniform blurred green surface". A single spread number would be too easy to satisfy,
    // so this checks the SPREAD and the CLASSES: several distinct land classes must actually be present.
    var landLum = rec.land.map(function (l) { return 0.299 * l.r + 0.587 * l.g + 0.114 * l.b; });
    var sd = stdev(landLum);
    chk(sd > 30, 'J-land: land brightness varies across continents' + tag, 'stdev=' + sd.toFixed(1) + ' (>30)');
    var classes = {};
    rec.land.forEach(function (l) { classes[l.cls] = (classes[l.cls] || 0) + 1; });
    chk(Object.keys(classes).length >= 3, 'J-land: at least three distinct land classes present' + tag, JSON.stringify(classes));

    // §J - "mountains/deserts/forests appear in correct broad regions". Every probe must land in its expected
    // class - i.e. the desert boxes must actually read arid and the rainforest boxes vegetated.
    rec.land.filter(function (l) { return l.expect !== 'any-land'; }).forEach(function (l) {
      chk(l.cls === l.expect, 'J-geo: ' + l.name + ' reads as ' + l.expect + tag, l.hex + ' -> ' + l.cls);
    });
    // and no land probe may be misread as water by the shipped mask
    rec.land.forEach(function (l) {
      chk(l.water < 0.5, 'J-mask: ' + l.name + ' is not classified as water' + tag, 'mask=' + l.water + ' ' + l.hex);
    });

    // §J - "ocean is not a flat single-color sphere" + the mask must find water where water is.
    rec.ocean.forEach(function (o) {
      chk(o.water > 0.5, 'J-mask: ' + o.name + ' is classified as water' + tag, 'mask=' + o.water + ' ' + o.hex);
    });
    var oceanLum = rec.ocean.map(function (o) { return o.lum; });
    var distinctOcean = {};
    rec.ocean.forEach(function (o) { distinctOcean[o.hex] = 1; });
    // This check has teeth because it already caught something: the first base asset considered
    // (land_shallow_topo_2048) returned the IDENTICAL colour #0b0932 for all five open-ocean probes - a single
    // flat fill, failing §C outright - which is why the base asset was changed to an ocean-colour product.
    chk(Object.keys(distinctOcean).length >= 4, 'J-ocean: open-ocean probes are not all the same colour' + tag,
      Object.keys(distinctOcean).join(' '));
    chk(stdev(oceanLum) > 3, 'J-ocean: ocean brightness varies (depth/latitude, not one flat colour)' + tag,
      'stdev=' + stdev(oceanLum).toFixed(1) + ' (>3)');

    // §J - "no obvious repeated noise". The failed predecessor was a LATITUDE RAMP plus a few patches, so land at
    // one latitude barely varied with longitude. Real geography does. This measures exactly that difference.
    var bands = [[30, 20], [-15, -25], [50, 40]];
    var lonSpread = [];
    bands.forEach(function (b) {
      var vals = [];
      for (var lng = -170; lng < 180; lng += 20) {
        var c = S.box(b[0], b[1], lng, lng + 15);
        if (!c) continue;
        if (waterMask(c.r, c.g, c.b) > 0.5) continue;             // land only
        vals.push(0.299 * c.r + 0.587 * c.g + 0.114 * c.b);
      }
      if (vals.length >= 4) lonSpread.push({ band: b[0] + '..' + b[1], n: vals.length, sd: +stdev(vals).toFixed(1) });
    });
    rec.longitudinal = lonSpread;
    var weakest = lonSpread.reduce(function (m, x) { return Math.min(m, x.sd); }, 1e9);
    chk(lonSpread.length >= 2 && weakest > 12,
      'J-noise: land varies ALONG each latitude band, so it is not a latitude ramp' + tag,
      JSON.stringify(lonSpread) + ' weakest=' + (weakest === 1e9 ? 'n/a' : weakest.toFixed(1)) + ' (>12)');

    // §J.7 - "no texture seam at the dateline". The +/-180 columns are neighbours on the sphere, so they must
    // agree; the shipped texture also wraps S with REPEAT, which interpolates across exactly this boundary.
    var d = 0, n = 0;
    for (var y = 0; y < img.h; y++) {
      var L = S.px(0, y), R = S.px(img.w - 1, y);
      d += Math.abs(L.r - R.r) + Math.abs(L.g - R.g) + Math.abs(L.b - R.b); n++;
    }
    var seam = d / (n * 3);
    rec.seam_mean_abs_delta = +seam.toFixed(2);
    chk(seam < 12, 'J-seam: the +/-180 columns match (mean |delta| per channel)' + tag, seam.toFixed(2) + ' (<12)');

    out.assets.push(rec);
  });

  // ---------------- render decisions, from the shipped functions ----------------
  var tierHigh = MAT.pickTier(CAPS_HIGH), tierPot = MAT.pickTier(CAPS_POT), tierBase = MAT.pickTier(CAPS_BASE);
  out.tiers = { webgl2_capable: tierHigh, webgl1_capable: tierPot, low_capability: tierBase };

  VIEWS.forEach(function (v) {
    var tier = v.forceTier === 'BASE' ? tierBase : tierHigh;
    var minD = MAT.minDistForTier(tier.gpuH, VIEWPORT_H);
    var dist = v.dist === null ? minD : Math.max(v.dist, minD);
    out.views.push({
      n: v.n, name: v.name, lat: v.lat, lng: v.lng,
      tier: tier.tier, gpu: tier.gpuW + 'x' + tier.gpuH, resample: tier.resample,
      dist: +dist.toFixed(3), min_dist: +minD.toFixed(3),
      arc_deg: +MAT.arcDegAtDist(dist).toFixed(2),
      magnification: +MAT.magnificationAt(tier.gpuH, dist, VIEWPORT_H).toFixed(2),
      relief: +MAT.detailForDistance(dist).toFixed(3),
      gpu_mb: +(MAT.estimateGpuBytes(tier.gpuW, tier.gpuH, true) / 1048576).toFixed(1)
    });
  });

  // §J - "maximum zoom does not become a soft pixel field". Every view must sit inside the magnification budget,
  // with ONE bounded exception that is a deliberate design choice rather than an oversight: the zoom guard is
  // clamped at MIN_D_CEIL, so on the very lowest tier (1024 texels tall) the budget cannot be fully honoured
  // without closing the close view further than §F allows. Where the clamp binds, the OVERSHOOT is what matters,
  // and it must stay small - so that is what is asserted, rather than quietly widening the budget for everyone.
  out.views.forEach(function (v) {
    var within = v.magnification <= MAT.MAG_BUDGET + 0.01;
    var clamped = Math.abs(v.min_dist - MAT.MIN_D_CEIL) < 1e-6;
    var overshoot = v.magnification / MAT.MAG_BUDGET - 1;
    chk(within || (clamped && overshoot < 0.10),
      'J-zoom: view ' + v.n + ' (' + v.name + ') stays inside the magnification budget'
        + (within ? '' : ' (guard clamped at MIN_D_CEIL; overshoot ' + (overshoot * 100).toFixed(1) + '%)'),
      v.magnification + ' vs budget ' + MAT.MAG_BUDGET + (clamped ? '  [minD clamped at ceiling ' + MAT.MIN_D_CEIL + ']' : ''));
  });
  // §J.10 - the low-capability fallback must still be a real, functional tier, not a degenerate one.
  chk(tierBase.gpuW >= 1024 && tierBase.asset === 'BASE', 'J-fallback: low-capability devices get a real albedo tier',
    tierBase.tier + ' ' + tierBase.gpuW + 'x' + tierBase.gpuH);
  chk(tierBase.resample === 'NONE', 'J-fallback: and it is the native asset size, with no resample cost', tierBase.resample);
  // §D - the resampler must refuse to upscale, which is what keeps "bigger texture" from masquerading as detail.
  chk(MAT.resample({ naturalWidth: 2048, naturalHeight: 1024 }, 4096, 2048) === null,
    'D-noupscale: the resampler REFUSES to produce a bitmap larger than its source');
  return out;
}

function report() {
  var r = run();
  console.log('MAP-VISUAL-REAL-EARTH-TEXTURE-2 §J — deterministic visual acceptance');
  console.log('='.repeat(112));
  r.assets.forEach(function (a) {
    console.log('\nASSET ' + a.file + '   source ' + a.source + '   DC-decoded ' + a.dc + '   dateline |delta| ' + a.seam_mean_abs_delta);
    console.log('  land probes');
    a.land.forEach(function (l) {
      console.log('    ' + l.name.padEnd(22) + l.hex + '  ' + String(l.cls).padEnd(11) + 'expect ' + String(l.expect).padEnd(10) + 'watermask ' + l.water);
    });
    console.log('  ocean probes');
    a.ocean.forEach(function (o) {
      console.log('    ' + o.name.padEnd(22) + o.hex + '  lum ' + String(o.lum).padStart(6) + '   watermask ' + o.water);
    });
    console.log('  longitudinal spread of land within latitude bands: ' + JSON.stringify(a.longitudinal));
  });

  console.log('\nTIER LADDER');
  Object.keys(r.tiers).forEach(function (k) {
    var t = r.tiers[k];
    console.log('  ' + k.padEnd(16) + t.tier.padEnd(24) + t.gpuW + 'x' + t.gpuH + '  ' + t.resample.padEnd(24) + t.reason);
  });

  console.log('\nTEN FIXED VIEWS (viewport ' + VIEWPORT_H + ' device px)');
  console.log('  #  view                       tier                     gpu         dist   minD   arc°    mag   relief  gpuMB');
  r.views.forEach(function (v) {
    console.log('  ' + String(v.n).padStart(2) + '  ' + v.name.padEnd(26) + v.tier.padEnd(24) + v.gpu.padEnd(12) +
      String(v.dist).padStart(5) + '  ' + String(v.min_dist).padStart(5) + '  ' + String(v.arc_deg).padStart(6) + '  ' +
      String(v.magnification).padStart(5) + '  ' + String(v.relief).padStart(6) + '  ' + String(v.gpu_mb).padStart(5));
  });

  console.log('\nACCEPTANCE CHECKS');
  r.checks.forEach(function (c) { console.log('  ' + (c.ok ? 'ok  ' : 'FAIL') + '  ' + c.label + (c.detail ? '   [' + c.detail + ']' : '')); });
  console.log('\n' + '='.repeat(112));
  console.log((r.checks.length - r.fail) + ' passed, ' + r.fail + ' failed');
  console.log('NOT COVERED HERE: the assembled GPU frame (lighting balance, specular taste, border/label legibility');
  console.log('over the new surface). No render was produced in this environment, and none is claimed.');
  if (r.fail) process.exit(1);
}

module.exports = { run: run, waterMask: waterMask, classify: classify, VIEWS: VIEWS, LAND_PROBES: LAND_PROBES, OCEAN_PROBES: OCEAN_PROBES };
if (require.main === module) report();
