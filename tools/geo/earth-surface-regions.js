/**
 * tools/geo/earth-surface-regions.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §A / §J18 — the Canada seasonal-surface classifier, extracted so it can be
 * applied to EVERY tier instead of only the one the R2 gate measured.
 *
 * WHY THIS EXISTS AND WHAT IT IS NOT ALLOWED TO BE. R2's accepted gate lives in
 * assets/tests/globe-canada-seasonal-surface-texture-3-r2.test.js and measures exactly one file,
 * earth-albedo-5400.jpg. §A freezes that gate, so this file does NOT replace it and that test is not touched.
 * What R3 needs in addition is the SAME classification applied to the three new tiers, and it needs it in a
 * place both the verifier tool and the new test suite can call.
 *
 * That creates an obvious hazard: two copies of the thresholds, drifting apart, with the frozen one no longer
 * describing what is actually enforced. So the duplication is CHECKED rather than trusted -
 * assets/tests/globe-earth-tier-ladder-texture-3-r3.test.js parses the frozen R2 suite and asserts that every
 * threshold and every region box in this file is byte-identical to the one there. If someone loosens a bound in
 * either place, that test fails and names it.
 *
 * The classifier itself is deliberately crude, and that is the point: snow/ice is BRIGHT AND NEARLY COLOURLESS,
 * full stop. A finely tuned classifier could be made to pass on almost anything.
 *
 * This is a verification module. It is never loaded by the page and is not part of any runtime path.
 */
'use strict';

// ---- thresholds — identical to the frozen R2 gate ---------------------------------------------------------
var SNOW_L = 150;             // luminance at or above which a region may be called snow
var SNOW_SAT = 0.12;          // ...and only if it is this close to colourless
var SEPARATION_MIN = 40;      // the Arctic must sit this far above the southern prairie
var BAND_SPAN_MIN = 80;       // the four Canadian bands must span this much luminance
var BORDER_STEP_MAX = 25;     // no brightness step this large across the 49th parallel

// ---- regions — identical to the frozen R2 gate. [latN, latS, lngW, lngE] ----------------------------------
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

var ICE = [
  ['Greenland interior', [75.0, 70.0, -45.0, -35.0], 200],
  ['N Ellesmere', [82.0, 81.0, -78.0, -72.0], 200],
  ['St Elias / Mt Logan', [61.0, 60.2, -140.8, -139.4], 140]
];

var BANDS = {
  arctic:    [80.0, 76.0, -100.0, -80.0],
  southBelt: [51.0, 49.2, -113.0, -97.0],
  boreal:    [58.0, 55.0, -110.0, -95.0],
  tundra:    [67.0, 64.0, -110.0, -95.0]
};

var BORDER_LONS = [[-120, -117], [-110, -107], [-100, -97]];

// ---- classification ---------------------------------------------------------------------------------------
function box(b) { return { latN: b[0], latS: b[1], lngW: b[2], lngE: b[3] }; }

function statOf(sample, b) {
  var m = sample(box(b));
  if (!m) return null;
  var L = 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
  var mx = Math.max(m.r, m.g, m.b), mn = Math.min(m.r, m.g, m.b);
  return { r: m.r, g: m.g, b: m.b, L: L, sat: mx <= 0 ? 0 : (mx - mn) / mx, n: m.n };
}

function isSnow(s) { return !!s && s.L >= SNOW_L && s.sat <= SNOW_SAT; }

/**
 * classifyAll(sample) — `sample({latN,latS,lngW,lngE})` must return {r,g,b,n} means over that box.
 *
 * Returns every measurement plus a pass/fail, and it is TWO-SIDED on purpose: a gate that only checked
 * "southern Canada is green" would happily pass a country-shaped green overlay, which §L3 forbids. So the same
 * run also requires real ice to survive, the bands to stay ordered and separated, and no step to appear along
 * the 49th parallel.
 */
function classifyAll(sample) {
  var problems = [];
  var south = SOUTH.map(function (r) {
    var s = statOf(sample, r[1]);
    var snow = isSnow(s);
    if (snow) problems.push(r[0] + ' snow-classified (L' + Math.round(s.L) + ' sat' + s.sat.toFixed(2) + ')');
    return { name: r[0], L: s ? +s.L.toFixed(1) : null, sat: s ? +s.sat.toFixed(3) : null, snow: snow };
  });
  var ice = ICE.map(function (r) {
    var s = statOf(sample, r[1]);
    var ok = !!s && s.L >= r[2];
    if (!ok) problems.push(r[0] + ' lost its ice (L' + (s ? Math.round(s.L) : '?') + ' < ' + r[2] + ')');
    return { name: r[0], L: s ? +s.L.toFixed(1) : null, min: r[2], bright: ok };
  });
  var b = {};
  Object.keys(BANDS).forEach(function (k) { var s = statOf(sample, BANDS[k]); b[k] = s ? +s.L.toFixed(1) : null; });
  var separation = (b.arctic != null && b.southBelt != null) ? b.arctic - b.southBelt : null;
  if (!(separation >= SEPARATION_MIN)) problems.push('Arctic/prairie separation ' + Math.round(separation) + ' < ' + SEPARATION_MIN);
  if (!(b.boreal < b.tundra)) problems.push('boreal not darker than tundra');
  if (!(b.tundra < b.arctic)) problems.push('tundra not darker than Arctic');
  var span = Math.max(b.southBelt, b.boreal, b.tundra, b.arctic) - Math.min(b.southBelt, b.boreal, b.tundra, b.arctic);
  if (!(span >= BAND_SPAN_MIN)) problems.push('band span ' + Math.round(span) + ' < ' + BAND_SPAN_MIN);

  var steps = BORDER_LONS.map(function (lon) {
    var us = statOf(sample, [48.5, 47.5, lon[0], lon[1]]);
    var ca = statOf(sample, [50.5, 49.5, lon[0], lon[1]]);
    var step = Math.abs(ca.L - us.L);
    if (step > BORDER_STEP_MAX) problems.push('49th-parallel step ' + Math.round(step) + ' at ' + lon.join('..'));
    return { lon: lon.join('..'), us: +us.L.toFixed(1), ca: +ca.L.toFixed(1), step: +step.toFixed(1) };
  });

  return {
    pass: problems.length === 0,
    problems: problems,
    summary: 'prairie L' + Math.round(b.southBelt) + ' boreal L' + Math.round(b.boreal) +
             ' tundra L' + Math.round(b.tundra) + ' arctic L' + Math.round(b.arctic) +
             ' separation ' + Math.round(separation) + ' maxStep ' +
             Math.round(Math.max.apply(null, steps.map(function (s) { return s.step; }))),
    south: south, ice: ice, bands: b, separation: separation, band_span: +span.toFixed(1), border_steps: steps,
    thresholds: { SNOW_L: SNOW_L, SNOW_SAT: SNOW_SAT, SEPARATION_MIN: SEPARATION_MIN,
                  BAND_SPAN_MIN: BAND_SPAN_MIN, BORDER_STEP_MAX: BORDER_STEP_MAX }
  };
}

module.exports = {
  SNOW_L: SNOW_L, SNOW_SAT: SNOW_SAT, SEPARATION_MIN: SEPARATION_MIN,
  BAND_SPAN_MIN: BAND_SPAN_MIN, BORDER_STEP_MAX: BORDER_STEP_MAX,
  SOUTH: SOUTH, ICE: ICE, BANDS: BANDS, BORDER_LONS: BORDER_LONS,
  statOf: statOf, isSnow: isSnow, classifyAll: classifyAll
};
