// =============================================================================================================
// S8-B3-R3-CP2M-R2 — THE MAP CANVAS, VERIFIED IN PIXELS
// -------------------------------------------------------------------------------------------------------------
// CP2M-R1 reported that WebGL is available in this headless Chrome (maxTex 16384) and concluded the check was
// "feasible rather than blocked". That is a fact about the BROWSER. It says nothing about whether this
// application's globe draws anything, and a context that can be created is not a scene that was rendered.
//
// AND THE PAGE CANNOT BE ASKED. km-globe.js creates its context with { antialias:true, alpha:false } and NO
// preserveDrawingBuffer, so the drawing buffer is discarded after compositing: toDataURL and drawImage both
// return a blank image. Chrome's screenshot is the only place those pixels survive, so this asserts on a
// DECODED PNG (assets/tests/_cp2m-r2-png.js — a zlib-based reader, no dependency added).
//
// THREE RUNS, NOT TWO, AND THAT IS THE WHOLE DESIGN. Comparing a dragged screenshot with an undragged one
// proves nothing on its own: if the scene were animated or clock-seeded, two identical runs would differ too
// and the drag would get the credit. km-globe.js states it consults neither a clock nor a PRNG, so:
//     A  render, no interaction
//     B  render, no interaction      -> A vs B is the NOISE FLOOR
//     C  render, then a real pointer drag  -> A vs C is the EFFECT
// The finding only means something if the effect is far above the floor, and BOTH are asserted here.
//
// Re-capture with:  node assets/tests/_cp2m-r2-map-runner.js <shotsDir>
//                   (then copy map.json into docs/evidence/cp2m-r2-map/)
// =============================================================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

const EV = JSON.parse(read('docs/evidence/cp2m-r2-map/map.json'));
const scene = (id) => (EV.scenes || []).filter(s => s.scene === id)[0] || {};

// -------------------------------------------------------------------------------------------------------------
section('A. the evidence is current, or it is not evidence');

ok(EV.ok === true, 'A1 the capture succeeded');
ok(!!EV.browser, 'A1a and names the browser', EV.browser);
ok(/^\d{4}-\d{2}-\d{2}$/.test(String(EV.capturedAt)), 'A1b and when');

const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A2 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
['assets/js/lib/km-globe.js', 'assets/js/pages/global-logistics-map.js', 'index.html',
 'assets/tests/_cp2m-r2-png.js'].forEach(function (rel) {
  ok(Object.prototype.hasOwnProperty.call(EV.sources || {}, rel), 'A3 the hash covers ' + rel);
});

// -------------------------------------------------------------------------------------------------------------
section('B. both scenes were captured, desktop AND mobile');

eq((EV.scenes || []).length, 2, 'B1 two scenes');
['desktop', 'mobile'].forEach(function (id) {
  const s = scene(id);
  ok(!!s.scene, 'B2 ' + id + ' was captured');
  ok(!s.error, 'B2a ' + id + ' captured without error', s.error);
  ok(!s.decodeError, 'B2b ' + id + ' decoded without error', s.decodeError);
  ok(s.pngBytes && s.pngBytes.a > 50000, 'B2c ' + id + ' produced a real screenshot', s.pngBytes && s.pngBytes.a);
});

// -------------------------------------------------------------------------------------------------------------
section('C. the canvas exists, is laid out, and is the globe');

['desktop', 'mobile'].forEach(function (id) {
  const c = scene(id).canvas || {};
  eq(c.canvasPresent, true, 'C1 ' + id + ' a canvas is present');
  eq(c.sectionActive, true, 'C1a ' + id + ' reached by clicking the real menu item');
  ok(c.canvasCssBox && c.canvasCssBox.w > 40 && c.canvasCssBox.h > 40,
    'C2 ' + id + ' it has a non-trivial layout box', c.canvasCssBox);
  ok(c.canvasBackingSize && c.canvasBackingSize.w > 0 && c.canvasBackingSize.h > 0,
    'C3 ' + id + ' and a real backing store', c.canvasBackingSize);
  ok(/globe/i.test(String(c.canvasAriaLabel || '')),
    'C4 ' + id + ' and it is the globe, by its own accessible name', c.canvasAriaLabel);
  eq(c.webglSupported, true, 'C5 ' + id + ' WebGL is available');
  // The condition-based wait is what makes a null result mean "did not render" rather than "was not waited for".
  ok(typeof c.canvasWaitMs === 'number' && c.canvasWaitMs < 22000,
    'C6 ' + id + ' the canvas appeared within the polling window', c.canvasWaitMs);
});

// -------------------------------------------------------------------------------------------------------------
section('D. THE PIXELS ARE NOT BLANK');

['desktop', 'mobile'].forEach(function (id) {
  const ct = scene(id).content || {};
  ok(ct.nonBackgroundFraction >= 0.4,
    'D1 ' + id + ' most of the canvas is drawn content, not background', ct.nonBackgroundFraction);
  // A flat fill would also score high on D1. Colour variety is what separates a rendered sphere from a
  // rectangle of one colour, and a lit textured globe produces hundreds of shades.
  ok(ct.distinctColours >= 100,
    'D2 ' + id + ' and it is a shaded scene, not a single flat colour', ct.distinctColours);
  ok(ct.sampled > 1000, 'D3 ' + id + ' the sample is large enough to mean something', ct.sampled);
});

// -------------------------------------------------------------------------------------------------------------
section('E. THE FRAMING IS RIGHT — the globe fills its canvas and is centred');

['desktop', 'mobile'].forEach(function (id) {
  const f = scene(id).framing || {};
  ok(f.fillWidthRatio >= 0.8, 'E1 ' + id + ' the drawn content fills the canvas width', f.fillWidthRatio);
  ok(f.fillHeightRatio >= 0.8, 'E1a ' + id + ' and its height', f.fillHeightRatio);
  // 0 would be dead centre; this allows a generous offset while still catching a scene shoved into a corner.
  ok(f.centroidOffset <= 0.35, 'E2 ' + id + ' and its mass sits near the centre', f.centroidOffset);
});

// -------------------------------------------------------------------------------------------------------------
section('F. THE SCENE IS DETERMINISTIC — which is what makes the drag test valid');

['desktop', 'mobile'].forEach(function (id) {
  const n = scene(id).noiseFloor || {};
  ok(n.sampled > 1000, 'F1 ' + id + ' the two identical runs were really compared', n.sampled);
  // km-globe.js says it consults neither a clock nor a PRNG. This TESTS that rather than quoting it.
  ok(n.changedFraction <= 0.01,
    'F2 ' + id + ' two independent runs are pixel-identical — no clock, no PRNG', n.changedFraction);
});

// -------------------------------------------------------------------------------------------------------------
section('G. IT MOVES, AND A REAL POINTER DRAG IS WHAT MOVED IT');

['desktop', 'mobile'].forEach(function (id) {
  const s = scene(id);
  const d = s.dragEffect || {}, n = s.noiseFloor || {};
  eq((s.dragReport || {}).dragged, true, 'G1 ' + id + ' the drag was actually dispatched');
  ok((s.dragReport || {}).dragPath, 'G1a ' + id + ' over a real path', (s.dragReport || {}).dragPath);
  ok(!(s.dragReport || {}).dragError, 'G1b ' + id + ' without error', (s.dragReport || {}).dragError);
  ok(d.changedFraction >= 0.05,
    'G2 ' + id + ' a substantial share of the canvas changed', d.changedFraction);
  ok(d.maxChannelDelta >= 40, 'G2a ' + id + ' and the change is large, not a rounding wobble', d.maxChannelDelta);
  // THE COMPARISON THAT MATTERS. An effect is only an effect relative to the floor.
  ok(d.changedFraction > (n.changedFraction || 0) + 0.04,
    'G3 ' + id + ' the drag effect is far above the noise floor',
    { effect: d.changedFraction, floor: n.changedFraction });
});

// -------------------------------------------------------------------------------------------------------------
section('H. what this does NOT claim');

// The globe, its geometry, its texture and its zh-Hant labels are the shipped ones and really render.
// The SHIPMENT OVERLAY is not exercised: the harness answers the scoped workspace read with a generic
// empty envelope rather than inventing a shape, so the page draws its formal empty state. Recording that
// here keeps a future reader from reading these numbers as proof that route drawing works.
ok(EV.design && /noise floor/i.test(EV.design), 'H1 the evidence states its own experimental design');
const mob = scene('mobile').canvas || {};
// A finding, not a failure: the fixed 240px sidebar leaves a 390px phone ~150px, so the globe gets ~73px.
ok(mob.canvasCssBox && mob.canvasCssBox.w < 200,
  'H2 on a 390px phone the globe is squeezed into a narrow column — recorded as a shell finding',
  mob.canvasCssBox && mob.canvasCssBox.w);
const desk = scene('desktop').canvas || {};
ok(desk.canvasCssBox && desk.canvasCssBox.w > 400,
  'H2a while the desktop canvas is full size', desk.canvasCssBox && desk.canvasCssBox.w);

// -------------------------------------------------------------------------------------------------------------
section('I. (non-vacuity) the decoder really decoded something');

const PNG = require('./_cp2m-r2-png.js');
ok(typeof PNG.decodePng === 'function' && typeof PNG.diffRegion === 'function', 'I1 the reader is loadable');
['desktop', 'mobile'].forEach(function (id) {
  const s = scene(id);
  ok(s.image && s.image.w > 0 && s.image.h > 0, 'I2 ' + id + ' an image was decoded with real dimensions', s.image);
  ok((s.content || {}).backgroundColour, 'I3 ' + id + ' a background colour was identified', (s.content || {}).backgroundColour);
});
// A decoder that returned zeros would pass D1 by accident if the thresholds were inverted; this pins the
// direction: the background must NOT be the whole canvas.
['desktop', 'mobile'].forEach(function (id) {
  ok((scene(id).content || {}).nonBackgroundFraction < 1.0,
    'I4 ' + id + ' the background was found and is not the entire canvas');
});

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('MAP CANVAS ACCEPTANCE (S8-B3-R3-CP2M-R2): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
