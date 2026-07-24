// Pure-math verification for km-globe.js (the parts that DON'T need a browser/WebGL). Verifies the
// matrix pipeline, lat/lng→xyz convention, focus-to-coordinate, great-circle slerp, and screen
// projection + back-hemisphere occlusion flag. Run: node assets/tests/globe-math.test.js
//
// This is the deterministic guarantee that the geometry is correct even though the WebGL render itself
// can only be verified in a browser (see Completion Report / Known Limitations).

var path = require('path');
var M = require(path.join(__dirname, '..', 'js', 'lib', 'km-globe.js')).math;

var fail = 0;
function approx(a, e, tol, label) { var ok = Math.abs(a - e) <= (tol == null ? 1e-6 : tol); if (!ok) { fail++; console.error('FAIL ' + label + '\n  exp ' + e + ' got ' + a); } else console.log('ok   ' + label); }
function truthy(v, label) { if (!v) { fail++; console.error('FAIL ' + label); } else console.log('ok   ' + label); }

// --- lat/lng convention: (0,0) faces +Z toward the camera ---
var o = M.latLngToVec3(0, 0, 1);
approx(o[0], 0, 1e-9, 'latLng(0,0).x = 0'); approx(o[1], 0, 1e-9, 'latLng(0,0).y = 0'); approx(o[2], 1, 1e-9, 'latLng(0,0).z = +1 (faces camera)');
var np = M.latLngToVec3(90, 0, 1); approx(np[1], 1, 1e-9, 'north pole → +Y');
var e90 = M.latLngToVec3(0, 90, 1); approx(e90[0], 1, 1e-9, 'lng +90 → +X'); approx(e90[2], 0, 1e-9, 'lng +90 → z 0');
// unit length preserved
var q = M.latLngToVec3(37.5, -122.3, 1); approx(Math.hypot(q[0], q[1], q[2]), 1, 1e-9, 'latLng vector is unit length');

// --- focus brings an arbitrary coordinate to face the camera (0,0,+r) ---
[[0, 0], [37.77, -122.42], [25.03, 121.56], [-33.9, 151.2], [51.5, -0.12], [-23.5, -46.6]].forEach(function (p) {
  var fa = M.focusAngles(p[0], p[1]);
  var model = M.modelMatrix(fa.yaw, fa.pitch);
  var v = M.latLngToVec3(p[0], p[1], 1);
  var r = M.mat4Apply(model, v);
  approx(r.x, 0, 1e-6, 'focus(' + p + ') → x≈0');
  approx(r.y, 0, 1e-6, 'focus(' + p + ') → y≈0');
  approx(r.z, 1, 1e-6, 'focus(' + p + ') → z≈+1 (front & center)');
});

// --- matrix identities ---
var I = M.mat4Identity(), T = M.mat4Translate(1, 2, 3);
var IT = M.mat4Mul(I, T);
approx(IT[12], 1, 1e-9, 'I*T keeps tx'); approx(IT[13], 2, 1e-9, 'I*T keeps ty'); approx(IT[14], 3, 1e-9, 'I*T keeps tz');
// translate applies: point (0,0,0) → (1,2,3)
var tp = M.mat4Apply(T, [0, 0, 0]); approx(tp.x, 1, 1e-9, 'translate maps origin.x'); approx(tp.z, 3, 1e-9, 'translate maps origin.z');

// --- perspective: front point maps inside clip, w>0 ---
var proj = M.mat4Perspective(45 * Math.PI / 180, 1.5, 0.01, 100);
var view = M.mat4Translate(0, 0, -3);
var mvp = M.mat4Mul(proj, view);
var front = M.projectToScreen(mvp, M.mat4Identity(), M.latLngToVec3(0, 0, 1), 800, 600);
truthy(front && front.front, 'front point flagged front-facing');
truthy(front && front.x > 300 && front.x < 500, 'front point projects near horizontal center');
var back = M.projectToScreen(mvp, M.mat4Identity(), M.latLngToVec3(0, 180, 1), 800, 600);
truthy(back && back.front === false, 'far-side point flagged occluded (not front)');

// --- slerp stays on the unit sphere and hits both endpoints ---
var A = M.latLngToVec3(0, 0, 1), B = M.latLngToVec3(0, 90, 1);
var mid = M.slerp(A, B, 0.5); approx(Math.hypot(mid[0], mid[1], mid[2]), 1, 1e-9, 'slerp midpoint on unit sphere');
approx(mid[0], Math.sin(45 * Math.PI / 180), 1e-9, 'slerp midpoint lng≈45 (x)');
var s0 = M.slerp(A, B, 0), s1 = M.slerp(A, B, 1);
approx(s0[2], 1, 1e-9, 'slerp t=0 = A'); approx(s1[0], 1, 1e-9, 'slerp t=1 = B');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
