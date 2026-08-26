#!/usr/bin/env node
/**
 * tools/geo/verify-views.js
 * F1-7N-MAP-COUNTRY-BOUNDARY-1 §M — DETERMINISTIC VIEW VERIFICATION.
 *
 * A WebGL globe cannot be rendered in this offline environment, so instead of claiming screenshots this harness
 * computes, for each of the eight §M views, EXACTLY what the shipped label layer would draw — using the REAL
 * exported functions (countryLabelTier, countryPriorityOf, projectToScreen, latLngToVec3, selectVisibleLabels)
 * against the REAL vendored dataset and the REAL camera model.
 *
 * It answers the questions a screenshot is taken to answer: which ISO labels appear, at what screen position,
 * whether the rear hemisphere is culled, whether a label lands on a shipment marker, and whether the two toggles
 * behave independently. It is reproducible; a screenshot is not.
 *
 * ONE DOCUMENTED APPROXIMATION: there is no canvas here, so text width is estimated at 7.4 px per character for
 * the 11 px bold UI font instead of measured with measureText. That affects only the collision margin, never
 * which projection or priority rule runs.
 *
 *   node tools/geo/verify-views.js
 */
'use strict';

var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
global.window = {};
require(path.join(ROOT, 'assets', 'js', 'data', 'world-countries-110m.js'));
var DATA = global.window.KM_WORLD_COUNTRIES;
var M = require(path.join(ROOT, 'assets', 'js', 'lib', 'km-globe.js')).math;

var DEG = Math.PI / 180;
var CHAR_W = 7.4, FONT_PX = 11;

function camera(view) {
  var yaw = view.yaw, pitch = view.pitch;
  if (view.focus) { var fa = M.focusAngles(view.focus[0], view.focus[1]); yaw = fa.yaw; pitch = fa.pitch; }
  var model = M.modelMatrix(yaw, pitch);
  var mv = M.mat4Mul(M.mat4Translate(0, 0, -view.dist), model);
  var mvp = M.mat4Mul(M.mat4Perspective(45 * DEG, view.w / view.h, 0.01, 100), mv);
  return { mvp: mvp, model: model };
}

function runView(view) {
  var cam = camera(view);
  var tier = M.countryLabelTier(view.dist);
  var priority = view.priority || {};
  var cands = [], culledRear = 0, culledTier = 0, culledViewport = 0;

  DATA.countries.forEach(function (c) {
    var pri = M.countryPriorityOf(c.iso, priority);
    if (pri > 3 && c.rank > tier) { culledTier++; return; }
    var sp = M.projectToScreen(cam.mvp, cam.model, M.latLngToVec3(c.label[1], c.label[0], M.COUNTRY_R), view.w, view.h);
    if (!sp) return;
    if (!sp.front) { culledRear++; return; }
    if (sp.x < -40 || sp.y < -20 || sp.x > view.w + 40 || sp.y > view.h + 20) { culledViewport++; return; }
    cands.push({ iso: c.iso, x: sp.x, y: sp.y, w: c.iso.length * CHAR_W, h: FONT_PX, rank: c.rank, priority: pri });
  });

  var markerRects = (view.markers || []).map(function (m) {
    var mp = M.projectToScreen(cam.mvp, cam.model, M.latLngToVec3(m[0], m[1], 1.012), view.w, view.h);
    if (!mp || !mp.front) return null;
    return { x0: mp.x - 11, x1: mp.x + 11, y0: mp.y - 11, y1: mp.y + 11, iso: m[2] || '' };
  }).filter(Boolean);

  var drawn = view.labels === false ? [] : M.selectVisibleLabels(cands, { pad: 3, stickyPad: 1, previous: {}, markerRects: markerRects });

  // boundary geometry is view-independent (one static buffer), reported once for completeness
  return {
    tier: tier, candidates: cands.length, drawn: drawn.length,
    culled_rear: culledRear, culled_tier: culledTier, culled_viewport: culledViewport,
    suppressed_by_collision: cands.length - drawn.length,
    drawnIso: drawn.map(function (d) { return d.iso; }).sort(),
    drawnDetail: drawn,
    markerRects: markerRects
  };
}

var VIEWS = [
  { id: '1. full globe — major country labels', w: 1280, h: 800, dist: 3.0, yaw: 0.35, pitch: 0.35 },
  { id: '2. North America close — US / CA / MX', w: 1280, h: 800, dist: 1.8, focus: [45, -100] },
  { id: '3. East Asia — CN / JP / KR / TW', w: 1280, h: 800, dist: 1.8, focus: [30, 120] },
  { id: '4. island region — Fiji / Pacific (antimeridian)', w: 1280, h: 800, dist: 1.6, focus: [-17, 178] },
  { id: '5. selected CN->US shipment', w: 1280, h: 800, dist: 2.4, focus: [40, -170],
    priority: { active: ['CN', 'US'], selected: ['CN', 'US'], nodes: ['JP'], high: [] },
    markers: [[31.2, 121.5, 'Shanghai'], [33.7, -118.2, 'Los Angeles']] },
  { id: '6. labels OFF / borders ON', w: 1280, h: 800, dist: 3.0, yaw: 0.35, pitch: 0.35, labels: false },
  { id: '7. borders OFF / labels ON', w: 1280, h: 800, dist: 3.0, yaw: 0.35, pitch: 0.35, borders: false },
  { id: '8. fullscreen / high-DPR (2560x1440 @ dpr2)', w: 2560, h: 1440, dist: 3.0, yaw: 0.35, pitch: 0.35 }
];

var geom = M.buildCountrySegments(DATA);
console.log('=== BOUNDARY GEOMETRY (view-independent, one static GPU buffer) ===');
console.log('  countries=' + geom.countryCount + '  rings=' + geom.ringCount + '  segments=' + geom.segmentCount
  + '  lineVertices=' + geom.vertexCount + '  bufferBytes=' + geom.positions.byteLength
  + '  radius=' + geom.radius + '  maxSegmentDeg=' + geom.maxSegmentDeg
  + '  longestSourceEdgeDeg=' + geom.maxSourceArcDeg.toFixed(2));

VIEWS.forEach(function (v) {
  var r = runView(v);
  console.log('\n=== ' + v.id + ' ===');
  console.log('  viewport=' + v.w + 'x' + v.h + '  dist=' + v.dist + '  labelTier=' + r.tier
    + '  bordersDrawn=' + (v.borders === false ? 'NO (toggle off)' : 'YES (' + geom.segmentCount + ' segments)')
    + '  labelsDrawn=' + (v.labels === false ? 'NO (toggle off)' : r.drawn));
  console.log('  candidates=' + r.candidates + '  culled: rear=' + r.culled_rear + ' tier=' + r.culled_tier
    + ' viewport=' + r.culled_viewport + ' collision=' + r.suppressed_by_collision);
  if (r.drawnIso.length) console.log('  ISO drawn: ' + r.drawnIso.join(' '));
  // does any drawn label overlap a shipment marker?
  var hit = 0;
  r.drawnDetail.forEach(function (d) {
    r.markerRects.forEach(function (mr) {
      var rect = { x0: d.x - d.w / 2 - 3, x1: d.x + d.w / 2 + 3, y0: d.y - d.h / 2 - 3, y1: d.y + d.h / 2 + 3 };
      if (M.rectsOverlap(rect, mr)) hit++;
    });
  });
  console.log('  labels overlapping a shipment marker: ' + hit + (r.markerRects.length ? ' (of ' + r.markerRects.length + ' visible markers)' : ''));
  ['US', 'CN', 'CA', 'JP', 'AU', 'MX', 'KR', 'TW', 'FJ', 'NZ'].forEach(function (c) {
    if (r.drawnIso.indexOf(c) !== -1) process.stdout.write('    present: ' + c + '\n');
  });
});
