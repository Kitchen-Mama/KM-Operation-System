// Real-Earth globe material — MAP-VISUAL-REAL-EARTH-TEXTURE-2 (§A-§L).
//
// The globe is raw WebGL plus runtime-decoded image assets, and neither WebGL nor a DOM canvas exists in headless
// Node, so this suite does NOT render. It does three things instead, in descending order of strength:
//
//   1. EXECUTES the shipped material logic. The tier ladder, the resampler, the zoom/texel-density maths and the
//      relief ramp are REAL exported functions called with real inputs — not regexes over their source.
//   2. MEASURES the vendored assets. tools/geo/jpeg-dc-probe.js decodes their DC coefficients, so every claim
//      about land, ocean, geography and the dateline seam is checked against actual pixels.
//   3. Falls back to source-level assertions ONLY for things that cannot be executed without a GL context —
//      shader text, upload ordering, uniform binding — and pins the exact strings in those cases.
//
// Run: node assets/tests/globe-real-earth-material-map-visual-real-earth-texture-2.test.js
'use strict';

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var GLOBE = read('js/lib/km-globe.js');
var MAPJS = read('js/pages/global-logistics-map.js');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
var PROV = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'geo', 'PROVENANCE.md'), 'utf8');
var EARTH_PROV = fs.readFileSync(path.join(__dirname, '..', 'img', 'earth', 'PROVENANCE.md'), 'utf8');
var FETCH = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'geo', 'fetch-earth-textures.js'), 'utf8');

var ROOT = path.join(__dirname, '..', '..');
global.window = global.window || {};
require(path.join(ROOT, 'assets', 'js', 'data', 'world-land-110m.js'));
var KMG = require(path.join(ROOT, 'assets', 'js', 'lib', 'km-globe.js'));
var MAT = KMG.material;
var VERIFY = require(path.join(ROOT, 'tools', 'geo', 'verify-earth-material.js'));

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function near(a, b, tol, l) { ok(Math.abs(a - b) <= tol, l + '  (got ' + a + ', want ' + b + ' +/-' + tol + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }
// strip string and comment content, for "this token appears in CODE" assertions
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
            .replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
}
var GC = code(GLOBE);

// ================================================================================================================
section('A. the audit is recorded, and the pre-existing capabilities are not re-claimed as new');
// ================================================================================================================
['SOURCE_TEXTURE_DETAIL_LIMIT', 'PROCEDURAL_NOISE_SMEARING', 'TEXTURE_MAGNIFICATION', 'SHADER_LIGHTING_LIMIT',
 'OCEAN_MATERIAL_LIMIT', 'INTERMEDIATE_CANVAS_LIMIT', 'CAPABILITY_FALLBACK', 'COLOR_SPACE_OR_GAMMA'
].forEach(function (c) {
  ok(GLOBE.indexOf(c) !== -1, 'A1 the audit classifies ' + c + ' separately');
});
// §A.3/§A.4 — the country, ADM1, LOD and label systems predate this task and must still be present and untouched.
['buildAdmin1Segments', 'lodForDistance', 'ADMIN1_BORDER_MIN_LOD', 'admin1LabelBudget', 'countryLabelTier',
 'rebuildCountryBuffer', 'rebuildAdmin1Buffer'].forEach(function (f) {
  ok(GLOBE.indexOf(f) !== -1, 'A3 pre-existing capability still present (not re-claimed): ' + f);
});
ok(/V3G6A/.test(GLOBE) && /MAP-VISUAL-REAL-EARTH-LOD-1/.test(GLOBE),
  'A4 the earlier texture-tier and LOD work is still attributed to the tasks that did it');
// buildEarthCanvas is KEPT — this task replaces the primary surface, it does not delete the fallback
ok(/function buildEarthCanvas\(tw, th\)/.test(GLOBE), 'A2 the procedural rasterizer is retained as bootstrap + fallback');
ok(GLOBE.indexOf('buildEarthCanvas(TEX_BASE_W_, TEX_BASE_H_)') !== -1, 'A2 and is still called at the base size');

// ================================================================================================================
section('D. a genuinely higher-information source, and no upscaling anywhere');
// ================================================================================================================
// RESTATED IN R3: the ladder is now three tiers, so the two-tier shape is swept instead of spelled out. The
// section heading — "a genuinely higher-information source, and no upscaling anywhere" — is exactly what R3 §B
// is about, and the source is now 21600x10800 rather than 5400x2700.
eq(MAT.ASSETS.BASE.file, 'earth-albedo-2048.jpg', 'D1 the base asset is vendored under a role-named file');
eq(MAT.ASSETS.MID.file, 'earth-albedo-4096.jpg', 'D1 the mid asset likewise');
eq(MAT.ASSETS.HIGH.file, 'earth-albedo-8192.jpg', 'D1 the high asset likewise');
eq(MAT.ASSETS.BASE.w + 'x' + MAT.ASSETS.BASE.h, '2048x1024', 'D1 base dimensions');
eq(MAT.ASSETS.MID.w + 'x' + MAT.ASSETS.MID.h, '4096x2048', 'D1 mid dimensions');
eq(MAT.ASSETS.HIGH.w + 'x' + MAT.ASSETS.HIGH.h, '8192x4096', 'D1 high dimensions');
// the files must actually exist at the declared size — a metadata-only claim would be worthless
[['BASE', MAT.ASSETS.BASE], ['MID', MAT.ASSETS.MID], ['HIGH', MAT.ASSETS.HIGH]].forEach(function (p) {
  var f = path.join(ROOT, 'assets', 'img', 'earth', p[1].file);
  ok(fs.existsSync(f), 'D1 ' + p[0] + ' asset file exists on disk');
  eq(fs.statSync(f).size, p[1].bytes, 'D1 ' + p[0] + ' asset byte size matches the declared value');
  eq(p[1].w, p[1].h * 2, 'D1 ' + p[0] + ' is 2:1 equirectangular');
});
// §D — the resampler must DOWNSCALE ONLY. This is executed, not grepped.
ok(MAT.resample({ naturalWidth: 2048, naturalHeight: 1024 }, 4096, 2048) === null,
  'D2 resample REFUSES to enlarge a 2048x1024 source to 4096x2048');
ok(MAT.resample({ naturalWidth: 5400, naturalHeight: 2700 }, 5400, 2701) === null,
  'D2 resample refuses even a one-pixel enlargement on either axis');
var nativeImg = { naturalWidth: 5400, naturalHeight: 2700 };
ok(MAT.resample(nativeImg, 5400, 2700) === nativeImg,
  'D2 a native-size request short-circuits to the image itself — no intermediate canvas at all (§I.2)');
ok(MAT.resample({ naturalWidth: 0, naturalHeight: 0 }, 512, 256) === null, 'D2 an undecoded image resamples to nothing');
// §D — forbidden fake fixes must be absent from the engine
['image-rendering', 'sharpen', 'contrast(', 'saturate(', 'unsharp'].forEach(function (bad) {
  ok(code(GLOBE).indexOf(bad) === -1, 'D3 no fake quality fix in the engine: ' + bad);
});
ok(GLOBE.indexOf('assets/img/earth/') !== -1 && !/https?:\/\//.test(GLOBE),
  'D4 the asset root is repo-relative and the engine contains no absolute URL');

// ================================================================================================================
section('E. capability-gated tiers — executed against real capability sets');
// ================================================================================================================
// ---- RESTATED IN TEXTURE-3-R3 --------------------------------------------------------------------------------
// R3 §B replaces the two-asset ladder (2048 + NPOT 5400) with three power-of-two tiers (2048/4096/8192) derived
// from one pinned 21600x10800 July 2004 source. Four assertions in this section described the OLD ladder's shape
// and are restated at their stated intent:
//
//   E1 "WebGL2 + 16384 earns the native 5400 tier"     -> earns the LARGEST tier, at native size, no resample.
//   E2 "WebGL1 + 8192 earns a POWER-OF-TWO 4096 tier"  -> the constraint that assertion protected against is
//        GONE. It existed because 5400x2700 is NPOT and WebGL1 cannot give an NPOT texture mipmaps or REPEAT.
//        Every tier is now power-of-two, so WebGL1 is no longer a reason to downgrade, and the restatement is
//        the rule that actually mattered: no tier is EVER larger than MAX_TEXTURE_SIZE, and no tier resamples.
//   E3 "WebGL2 below 5400 lands on the POT tier"       -> a 4096-max device gets the 4096 asset, natively.
//   E7 "a capable device DOES earn the top tier"       -> unchanged in intent, new tier name.
//
// CAPS OBJECTS NOW STATE THE DEVICE EXPLICITLY. Node 21+ defines a global `navigator` carrying a real
// hardwareConcurrency, so `pickTier({maxTextureSize, webgl2})` silently reads the HOST's core count - these
// assertions were passing partly because the dev machine has 20 cores. Same assertion, 2-core CI runner,
// different answer. Every caps object below names deviceMemory and hardwareConcurrency.
var CAPS8 = { deviceMemory: 8, hardwareConcurrency: 8 };
function caps(maxTex, gl2, extra) {
  var o = { maxTextureSize: maxTex, webgl2: !!gl2, deviceMemory: CAPS8.deviceMemory, hardwareConcurrency: CAPS8.hardwareConcurrency };
  for (var k in (extra || {})) o[k] = extra[k];
  return o;
}
var tHigh = MAT.pickTier(caps(16384, true));
eq(tHigh.tier, 'REAL_HIGH_8192', 'E1 a capable device with 16384 earns the largest tier');
eq(tHigh.resample, 'NONE', 'E1 and uses the asset at native size — no resample, so no information is discarded');
eq(tHigh.asset, 'HIGH', 'E1 from the HIGH asset');
var tPot = MAT.pickTier(caps(8192, false));
eq(tPot.tier, 'REAL_HIGH_8192', 'E2 WebGL1 + 8192 now earns the SAME tier — every tier is power-of-two, so NPOT is no longer a constraint');
eq(tPot.resample, 'NONE', 'E2 with no resample: the tier maps 1:1 onto a vendored asset');
// The rule the old POT assertion existed to protect, stated directly and swept across the ladder.
[[16384, 8192], [8192, 8192], [5400, 4096], [4096, 4096], [3000, 2048], [2048, 2048], [1024, 1024]].forEach(function (c) {
  var t = MAT.pickTier(caps(c[0], true));
  ok(t.gpuW <= c[0], 'E2 MAX_TEXTURE_SIZE ' + c[0] + ' is never exceeded (tier is ' + t.gpuW + ')');
  eq(t.gpuW, c[1], 'E2 and ' + c[0] + ' lands on the ' + c[1] + ' tier');
});
eq(MAT.pickTier(caps(4096, true)).tier, 'REAL_MID_4096',
  'E3 a device whose MAX_TEXTURE_SIZE is below 8192 lands on the 4096 tier');
eq(MAT.pickTier(caps(4096, true)).resample, 'NONE', 'E3 natively, not by downscaling a larger asset at runtime');
eq(MAT.pickTier(caps(2048, false)).tier, 'REAL_BASE_2048',
  'E4 a 2048-limited device gets the base tier');
eq(MAT.pickTier({ maxTextureSize: 2048, webgl2: false }).reason, 'MAX_TEXTURE_SIZE_BELOW_4096', 'E4 with the reason stated');
var tTiny = MAT.pickTier({ maxTextureSize: 1024, webgl2: false });
eq(tTiny.tier, 'REAL_BASE_1024', 'E5 a 1024-limited device still gets a REAL albedo, downscaled to fit');
eq(tTiny.resample, 'DOWNSCALE_2048_TO_1024', 'E5 by downscaling the base asset');
// §E — "Unknown device capability must not automatically select the highest tier." Node exposes a real,
// read-only navigator, so the capability probe is exercised by substituting one via defineProperty.
var navDesc = Object.getOwnPropertyDescriptor(global, 'navigator');
function withNav(n, fn) {
  Object.defineProperty(global, 'navigator', { value: n, configurable: true, writable: true });
  try { return fn(); } finally { if (navDesc) Object.defineProperty(global, 'navigator', navDesc); }
}
withNav({}, function () {                               // no deviceMemory, no hardwareConcurrency
  var t = MAT.pickTier({ maxTextureSize: 16384, webgl2: true });
  eq(t.tier, 'REAL_BASE_2048', 'E6 an UNIDENTIFIED device does NOT get the highest tier');
  eq(t.reason, 'DEVICE_CAPABILITY_UNKNOWN', 'E6 and says why (fail-safe, not fail-open)');
});
withNav({ deviceMemory: 2, hardwareConcurrency: 8 }, function () {
  eq(MAT.pickTier({ maxTextureSize: 16384, webgl2: true }).reason, 'LOW_DEVICE_MEMORY', 'E7 low RAM stays on the base tier');
});
withNav({ deviceMemory: 8, hardwareConcurrency: 2 }, function () {
  eq(MAT.pickTier({ maxTextureSize: 16384, webgl2: true }).reason, 'LOW_CORE_COUNT', 'E7 low core count stays on the base tier');
});
withNav({ deviceMemory: 8, hardwareConcurrency: 8 }, function () {
  eq(MAT.pickTier({ maxTextureSize: 16384, webgl2: true }).tier, 'REAL_HIGH_8192', 'E7 a fully identified capable device DOES earn the top tier');
});
// R3 §B11 — "do not ship an excessive file merely because 8192 is supported" is a rule DISTINCT from §B8, so it
// gets its own check: a device that can hold the texture but reports only 4 GB of RAM is refused the top tier.
withNav({ deviceMemory: 4, hardwareConcurrency: 16 }, function () {
  var t = MAT.pickTier({ maxTextureSize: 16384, webgl2: true });
  eq(t.tier, 'REAL_MID_4096', 'E7 capability alone does NOT earn the top tier (§B11)');
  eq(t.reason, 'DEVICE_NOT_STRONG_ENOUGH_FOR_8192', 'E7 and the refusal names §B11 rather than a size limit');
});
// R3 §B6 — the budget is a real bound, not decoration: shrink it and the ladder actually descends.
withNav({ deviceMemory: 32, hardwareConcurrency: 32 }, function () {
  eq(MAT.pickTier({ maxTextureSize: 16384, webgl2: true, budgetBytes: 60 * 1024 * 1024 }).tier, 'REAL_MID_4096',
    'E7 a 60 MB budget forces the mid tier');
  eq(MAT.pickTier({ maxTextureSize: 16384, webgl2: true, budgetBytes: 20 * 1024 * 1024 }).tier, 'REAL_BASE_2048',
    'E7 a 20 MB budget forces the base tier');
  var top = MAT.pickTier({ maxTextureSize: 16384, webgl2: true });
  ok(top.estimated_gpu_bytes <= MAT.GPU_TEXTURE_BUDGET_BYTES,
    'E7 and the selected tier always fits the stated budget (' + Math.round(top.estimated_gpu_bytes / 1048576)
    + ' MB <= ' + Math.round(MAT.GPU_TEXTURE_BUDGET_BYTES / 1048576) + ' MB)');
});
// §E — GPU memory is estimated, not guessed at
eq(MAT.estimateGpuBytes(2048, 1024, false), 2048 * 1024 * 4, 'E8 GPU cost is 4 bytes/texel without mipmaps');
eq(MAT.estimateGpuBytes(2048, 1024, true), Math.round(2048 * 1024 * 4 * 4 / 3), 'E8 a full mip chain adds one third');
ok(MAT.estimateGpuBytes(5400, 2700, true) / 1048576 > 70 && MAT.estimateGpuBytes(5400, 2700, true) / 1048576 < 80,
  'E8 the native high tier is ~74 MB, which is why it is capability-gated rather than default');
// §E/§I.5 — the low path must not even REQUEST the large asset.
// RESTATED IN R3: the old ladder expressed this as a source-level special case (`if asset !== HIGH`). R3 replaced
// the two bespoke paths with one ladder walk, so the guarantee is now STRUCTURAL and is asserted as behaviour:
// the entry point requests exactly the tier that was selected, and the walk only ever steps DOWNWARD.
ok(/function beginMaterialUpgrade\(\) \{ applyTier\(matTier\.asset, ''\); \}/.test(GLOBE),
  'E9 the upgrade requests exactly the tier the device earned — never a larger one (§I.5/§B9)');
ok(/var next = EARTH_TIER_ORDER_\[order \+ 1\] \|\| null;/.test(GLOBE),
  'E9 and the fallback chain can only move DOWN the ladder');
ok(/EARTH_TIER_ORDER_ = \['HIGH', 'MID', 'BASE'\]/.test(GLOBE), 'E9 which is ordered largest-first');
// §E — allocation failure releases and falls back rather than leaving an incomplete texture
ok(/matInfo\.fallback_reason = 'ALLOCATION_FAILED_0x' \+ texErr\.toString\(16\);/.test(GLOBE),
  'E10 a refused allocation is detected and NAMED with the GL error code');
// RESTATED IN R3: same intent, now expressed through the single ladder walk instead of a HIGH-specific call.
ok(/stepDown\(\(why \? why \+ '_THEN_' : ''\) \+ assetKey \+ '_UPLOAD_' \+ \(matInfo\.fallback_reason \|\| 'FAILED'\)\);/.test(GLOBE),
  'E10 and falls back to a tier known to fit, carrying the reason');
ok(/if \(next\) \{ applyTier\(next, reason\); \}\r?\n\s*else \{ applyProceduralFallback\(reason\); \}/.test(GLOBE),
  'E10 with the procedural rasterizer as the LAST rung, not as a peer of the real tiers');
ok(/texInfo\.allocation_verified = false;\r?\n\s*return false;/.test(GLOBE),
  'E10 the upload reports failure instead of pretending the texture is complete');

// ================================================================================================================
section('F. zoom versus texel density — the guard is measured and BOUNDED');
// ================================================================================================================
near(MAT.arcDegAtDist(1.35), 16.61, 0.05, 'F1 at MIN_D the viewport spans ~16.6 deg of arc (fov 45, unit sphere)');
near(MAT.arcDegAtDist(3.0), 94.93, 0.05, 'F1 and ~94.9 deg at the default overview distance');
eq(MAT.arcDegAtDist(1.0), 0, 'F1 the arc collapses at the surface');
// the old configuration: 1024 texels tall, magnified ~15x at MIN_D on a 1400px viewport
near(MAT.magnificationAt(1024, 1.35, 1400), 14.8, 0.2, 'F2 a 1024-tall texture was ~15 device px per texel at MIN_D');
near(MAT.magnificationAt(2700, 1.35, 1400), 5.6, 0.2, 'F2 the native high tier is ~5.6 — a 2.6x information gain');
eq(MAT.MAG_BUDGET, 6.0, 'F3 the budget is an explicit constant, not a feeling');
eq(MAT.MIN_D_FLOOR, 1.35, 'F3 the guard can never open the zoom past the historical MIN_D');
eq(MAT.MIN_D_CEIL, 1.85, 'F3 and can never close it past a bounded ceiling');
// the tier a capable desktop actually gets keeps the FULL historical zoom range
eq(MAT.minDistForTier(2700, 1400), MAT.MIN_D_FLOOR, 'F4 on the native high tier the zoom range is UNCHANGED (no regression)');
ok(MAT.minDistForTier(2048, 1400) > MAT.MIN_D_FLOOR && MAT.minDistForTier(2048, 1400) < 1.5,
  'F4 the POT tier tightens only slightly (' + MAT.minDistForTier(2048, 1400).toFixed(3) + ')');
eq(MAT.minDistForTier(1024, 1400), MAT.MIN_D_CEIL, 'F4 the lowest tier tightens to the ceiling and no further');
eq(MAT.minDistForTier(64, 4000), MAT.MIN_D_CEIL, 'F4 an absurdly weak tier still cannot close the zoom past the ceiling');
eq(MAT.minDistForTier(0, 1400), MAT.MIN_D_FLOOR, 'F4 an unknown texture height falls back to the floor, never to a guess');
eq(MAT.minDistForTier(2700, 0), MAT.MIN_D_FLOOR, 'F4 an unmeasured viewport likewise');
// a larger viewport legitimately demands more texels, so the limit follows it
ok(MAT.minDistForTier(2700, 2400) > MAT.minDistForTier(2700, 1400),
  'F5 a bigger backing buffer tightens the limit — texel density depends on the viewport, not the tier alone');
ok(/recomputeZoomLimit\(\);\r?\n\s*schedule\(\); return true;/.test(GLOBE),
  'F5 and resize() re-derives it, so fullscreen / DPR / sidebar changes are covered');
// §F option B — relief ramps in with zoom and is absent at overview distance
eq(MAT.detailForDistance(3.0), 0, 'F6 relief is OFF at the overview distance (so no pattern can read as noise)');
eq(MAT.detailForDistance(MAT.DETAIL_FAR), 0, 'F6 exactly zero at the ramp start');
eq(MAT.detailForDistance(1.35), MAT.DETAIL_MAX, 'F6 and saturates at maximum zoom');
ok(MAT.detailForDistance(2.0) > 0 && MAT.detailForDistance(2.0) < MAT.DETAIL_MAX, 'F6 with a continuous ramp between');
ok(MAT.detailForDistance(2.2) < MAT.detailForDistance(1.8), 'F6 monotonically increasing as the camera approaches');
ok(MAT.DETAIL_MAX <= 0.35, 'F6 and the peak strength stays restrained (' + MAT.DETAIL_MAX + ')');

// ================================================================================================================
section('G. sampling and colour space — the actual decision, stated');
// ================================================================================================================
ok(/canvas\.getContext\('webgl2', glAttrs\)/.test(GLOBE), 'G1 WebGL2 is requested first');
ok(/getContext\('webgl', glAttrs\) \|\| canvas\.getContext\('experimental-webgl', glAttrs\)/.test(GLOBE),
  'G1 with the WebGL1 path preserved behind it');
ok(/if \(gl\) glVersion = 2;/.test(GLOBE) && /if \(gl\) glVersion = 1;/.test(GLOBE),
  'G1 and the version is RECORDED, not inferred later');
ok(/webgl_version: glVersion/.test(GLOBE), 'G1 and reported in diagnostics');
// the two sRGB paths, and the uniform that makes double gamma impossible
ok(/gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.SRGB8_ALPHA8, gl\.RGBA, gl\.UNSIGNED_BYTE, source\);/.test(GLOBE),
  'G2 WebGL2 uploads as SRGB8_ALPHA8 so the SAMPLER decodes (and mips filter in linear space)');
ok(/gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RGB, gl\.RGB, gl\.UNSIGNED_BYTE, source\);/.test(GLOBE),
  'G2 WebGL1 uploads as RGB and the shader decodes instead');
ok(/decode = 0; ifmt = 'SRGB8_ALPHA8';/.test(GLOBE) && /decode = 1; ifmt = 'RGB8';/.test(GLOBE),
  'G3 each path sets uDecode to match — the one thing that prevents DOUBLE GAMMA');
ok(/vec3 dec\(vec3 c\)\{return uDecode>0\.5\?pow\(c,vec3\(2\.2\)\):c;\}/.test(GLOBE), 'G3 the shader decode is uDecode-gated');
ok((GLOBE.match(/pow\(max\(lit,0\.0\),vec3\(1\.0\/2\.2\)\)/g) || []).length === 1,
  'G3 and the encode happens EXACTLY ONCE');
ok(/matInfo\.gamma_decode = decode \? 'SHADER_POW_2_2' : 'SAMPLER_SRGB8_ALPHA8';/.test(GLOBE),
  'G3 which of the two ran is observable at runtime — never "not applicable"');
// seam handling
ok(/var canRepeat = \(glVersion === 2\) \|\| \(isPot_\(gpuW\) && isPot_\(gpuH\)\);/.test(GLOBE),
  'G4 REPEAT wrapping is gated on what is legal (POT in WebGL1, anything in WebGL2)');
ok(/gl\.TEXTURE_WRAP_S, canRepeat \? gl\.REPEAT : gl\.CLAMP_TO_EDGE/.test(GLOBE),
  'G4 longitude wraps at the dateline where it legally can');
ok(/gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_WRAP_T, gl\.CLAMP_TO_EDGE\);/.test(GLOBE),
  'G4 latitude never wraps — T stays clamped');
eq(MAT.isPot(2048), true, 'G4 the POT test is real: 2048');
eq(MAT.isPot(4096), true, 'G4 4096');
eq(MAT.isPot(5400), false, 'G4 5400 is NOT power-of-two — which is exactly why it needs WebGL2');
eq(MAT.isPot(2700), false, 'G4 nor is 2700');
eq(MAT.isPot(0), false, 'G4 and zero is not POT');
// mipmaps / filters / anisotropy survive on the new path
ok(/gl\.generateMipmap\(gl\.TEXTURE_2D\); texInfo\.mipmaps = true;/.test(GLOBE), 'G5 mipmaps are still generated');
ok(/if \(texInfo\.mipmaps && gl\.getError\(\) !== gl\.NO_ERROR\) \{ texInfo\.mipmaps = false; \}/.test(GLOBE),
  'G5 and the result is CHECKED — a driver may refuse the chain for an NPOT/sRGB target');
ok(/TEXTURE_MIN_FILTER, texInfo\.mipmaps \? gl\.LINEAR_MIPMAP_LINEAR : gl\.LINEAR/.test(GLOBE),
  'G5 trilinear only when a chain actually exists');
ok(/EXT_texture_filter_anisotropic/.test(GLOBE) && /if \(aniso && texInfo\.mipmaps\)/.test(GLOBE),
  'G5 anisotropy is requested, and only when meaningful');
ok(/gl\.pixelStorei\(gl\.UNPACK_FLIP_Y_WEBGL, false\);/.test(GLOBE),
  'G6 UV orientation: no flip, matching buildSphere v=0 at north');
ok(/uv\.push\(\(lng \+ 180\) \/ 360, \(90 - lat\) \/ 180\)/.test(GLOBE), 'G6 and the sphere UVs are unchanged');
// G7 — THE RELIEF TANGENT FRAME'S HANDEDNESS. This is pinned because getting it wrong is invisible in review and
// obvious on screen: latLngToVec3 puts +y at the north pole, so cross((0,1,0), n) is EAST (= +u) and
// cross(n, east) is NORTH — but buildSphere's v = (90-lat)/180 means +v points SOUTH. The perturbation is
// N - (dh/du)T - (dh/dv)Bv, so the u term is (hl - hr) and the v term must be (hd - hu). Writing (hu - hd)
// instead lights north-south slopes backwards while east-west slopes stay correct, which reads as inconsistent
// embossing rather than terrain. (That inversion was present in this task's first draft and was corrected.)
ok(/vec3 ref=abs\(aNormal\.y\)>0\.999\?vec3\(1\.0,0\.0,0\.0\):vec3\(0\.0,1\.0,0\.0\);/.test(GLOBE),
  'G7 the tangent reference axis is the POLAR axis, with a different axis at the degenerate poles');
ok(/vec3 ea=normalize\(cross\(ref,aNormal\)\);vT=nm\*ea;vB=nm\*cross\(aNormal,ea\);/.test(GLOBE),
  'G7 vT is east and vB is north, both transformed by the same matrix as the normal');
ok(/nn=normalize\(n\+\(vT\*\(hl-hr\)\+vB\*\(hd-hu\)\)\*uDetail\*\(1\.0-water\)\);/.test(GLOBE),
  'G7 and the v term is (hd - hu) — matching v-increases-southward, NOT the inverted (hu - hd)');
ok(/float hu=lum\(dec\(texture2D\(uTex,vec2\(vUV\.x,vUV\.y-uTexel\.y\)\)\.rgb\)\);/.test(GLOBE),
  'G7 hu really is the NORTHERN neighbour (v - texel), so the sign above means what it says');
ok(/float hd=lum\(dec\(texture2D\(uTex,vec2\(vUV\.x,vUV\.y\+uTexel\.y\)\)\.rgb\)\);/.test(GLOBE),
  'G7 and hd the southern one (v + texel)');
ok(/\*\(1\.0-water\)/.test(GLOBE), 'G8 relief is applied to LAND ONLY — water is never embossed');
ok(/if\(uDetail>0\.0005\)\{/.test(GLOBE), 'G8 and the four extra texture taps are skipped entirely when relief is off');

// ================================================================================================================
section('H. borders, labels and markers keep priority over the surface');
// ================================================================================================================
ok(/col\+=vec3\(0\.10,0\.20,0\.38\)\*rim;/.test(GLOBE), 'H1 the atmosphere rim is byte-identical to the signed-off value');
// RESTATED IN TEXTURE-3-R3 §C. This asserted the border radii were UNCHANGED by the texture work, and its
// intent - 'borders neither sink into nor float above the surface' - is exactly what §C then found to be
// FALSE of those radii: 1.0035 and 1.0030 are two shells ABOVE the surface, 22 km up at Earth scale, whose
// parallax against the ground diverges towards the limb. The intent is now met properly: the borders are ON
// the surface and separated in depth.
eq(KMG.math.BORDER_R, 1, 'H2 borders sit ON the surface - they neither sink into nor float above it');
ok(KMG.math.BORDER_DEPTH_BIAS > 0 && KMG.math.BORDER_DEPTH_BIAS < 0.001,
  'H2 with a small depth bias, not altitude, keeping them off the sphere (' + KMG.math.BORDER_DEPTH_BIAS + ')');
ok(GC.indexOf('uploadAlbedo') !== -1 && code(GLOBE).indexOf('bakeBorders') === -1,
  'H3 borders are never baked into the albedo — they stay an independent vector layer');
// RESTATED IN TEXTURE-3-R3 §C/§E. The line shader IS changed - it gained a depth bias (§C) and an alpha
// multiplier for the ADM1 fade (§E). The intent was that borders are not gamma-processed with the surface,
// and that is asserted directly instead of by requiring the shader to be byte-identical.
ok(/uniform float uAlphaMul;varying vec4 vColor;void main\(\)\{gl_FragColor=vec4\(vColor\.rgb,vColor\.a\*uAlphaMul\)/.test(GLOBE),
  'H4 the line shader passes colour through unchanged apart from alpha');
ok(!/pow\(/.test(GLOBE.slice(GLOBE.indexOf('var FS_LINE'), GLOBE.indexOf('var VS_RIBBON'))),
  'H4 so borders are NOT gamma-processed with the surface - no pow() anywhere in the line shader');
ok(!/uDecode/.test(GLOBE.slice(GLOBE.indexOf('var FS_LINE'), GLOBE.indexOf('var VS_RIBBON'))),
  'H4 and the sRGB decode uniform never reaches it');
ok(/var c = m\.color \|\| \[0, 0\.5, 0\.73\]/.test(GLOBE) && /var c = a\.color \|\| \[0, 0\.5, 0\.73\]/.test(GLOBE),
  'H5 marker and arc colours still come from the data — the new material changed no business colour');
ok(MAT.OCEAN_SPEC <= 0.35, 'H6 ocean specular is restrained (' + MAT.OCEAN_SPEC + '), so water stays quieter than routes');
ok(code(GLOBE).indexOf('cloud') === -1 || /baked cloud layer/.test(GLOBE),
  'H7 no new cloud layer was added over the real surface (the only "cloud" text is the fallback rasterizer)');

// ================================================================================================================
section('I. performance, caching, failure and diagnostics');
// ================================================================================================================
ok((GLOBE.match(/requestAnimationFrame\(/g) || []).length === 3,
  'I1 no new render loop: the requestAnimationFrame call-site count is unchanged (3)');
ok(GLOBE.indexOf('setInterval(') === -1, 'I1 and no polling timer was introduced');
ok(/var earthImgCache_ = \{\};/.test(GLOBE) && /if \(rec && \(rec\.status === 'READY' \|\| rec\.status === 'ERROR'\)\) return Promise\.resolve\(rec\);/.test(GLOBE),
  'I2 a decoded asset is cached per session — a remount does not decode a 14.6 MP JPEG again');
ok(/if \(rec && rec\.promise\) return rec\.promise;/.test(GLOBE),
  'I2 and two concurrent consumers share ONE decode (single-flight)');
ok(/var earthResampleCache_ = \{\};/.test(GLOBE) && /earthResampleCache_\[key\] = cv;/.test(GLOBE),
  'I3 the downscale is cached too, so a tier switch and back costs nothing');
ok(/beginMaterialUpgrade\(\);\r?\n\s*return inst;/.test(GLOBE),
  'I4 the upgrade starts LAST and is not awaited — it cannot delay the first paint (§I.6/§I.8)');
ok(/if \(destroyed\) return;/.test(GLOBE), 'I5 a destroyed instance never uploads into a dead context');
// §I.7 — a failed layer must never blank the map
ok(/function applyProceduralFallback\(reason\)/.test(GLOBE), 'I6 an asset that cannot load falls back to the rasterizer');
ok(/matDetailOn = false; matInfo\.detail_enabled = false;/.test(GLOBE),
  'I6 and the relief layer is DISABLED there — invented noise must not be embossed as terrain');
ok(/matInfo\.fallback_reason = reason;/.test(GLOBE), 'I6 with the reason recorded, so a silent fallback is impossible');
ok(/rec\.status = 'ERROR'; rec\.error = 'EARTH_ASSET_DECODED_EMPTY';/.test(GLOBE),
  'I6 a decode that yields no pixels is a FAILURE, not a success with an empty image');
// §I.8/§I.9 — the material touches no data layer
var matRegion = GLOBE.slice(GLOBE.indexOf('real-Earth material'), GLOBE.indexOf('---------------- geometry'));
['KM.api', 'getWorkspace', 'SpreadsheetApp', 'google.script', '_opDbCache', 'apps-script'].forEach(function (bad) {
  ok(matRegion.indexOf(bad) === -1, 'I7 the material layer never touches the data layer: no ' + bad);
});
['fetch(', 'XMLHttpRequest', 'http://', 'https://', 'crossOrigin', 'new URL('].forEach(function (bad) {
  ok(GLOBE.indexOf(bad) === -1, 'I8 no runtime third-party network: no ' + bad);
});
// §I diagnostics — every required field
ok(/getMaterialInfo: function \(\)/.test(GLOBE), 'I9 the material exposes a diagnostics accessor');
['active_tier|tier', 'source_asset', 'source_dimensions', 'decoded_dimensions', 'gpu_dimensions',
 'estimated_gpu_bytes', 'max_texture_size', 'filter', 'mipmaps', 'anisotropy', 'layers',
 'high_detail_load_ms', 'fallback_reason', 'webgl_version', 'context_restored', 'gamma_decode',
 'resample', 'min_distance', 'effective_magnification', 'detail_strength'].forEach(function (k) {
  ok(new RegExp('(' + k + '):').test(GLOBE), 'I9 diagnostics report: ' + k.split('|')[0]);
});
ok(/material: safe\(function \(\) \{ return g\.getMaterialInfo\(\); \}\)/.test(MAPJS),
  'I10 and the page surfaces it through the one consolidated accessor');
ok(/window\.KM_MAP_GLOBE_DIAGNOSTICS = mapGlobeDiagnostics/.test(MAPJS), 'I10 which is still the single entry point');
ok(/getTextureInfo: function \(\)/.test(GLOBE), 'I11 the pre-existing getTextureInfo shape is preserved for its callers');
// I12 — source / decoded / GPU dimensions must be three DIFFERENT facts. They diverge exactly when a resample
// happened, which is the case a single conflated field would hide.
ok(/matInfo\.decoded_dimensions = decodedDims \|\| sourceDims;/.test(GLOBE),
  'I12 the decoded dimensions are recorded per upload, not left at the bootstrap value');
// RESTATED IN R3: the two bespoke upload calls became one, so the same guarantee is asserted once — the upload
// receives the ASSET dimensions as the source and the BROWSER-decoded dimensions as the decoded value, and they
// remain two separate arguments rather than one conflated field.
ok(GLOBE.indexOf("asset.product + ' [' + asset.file + ']', asset.w + 'x' + asset.h, resample, img.w + 'x' + img.h)") !== -1,
  'I12 the tier upload passes the ASSET dimensions as the source and the BROWSER-decoded dimensions as the decoded value');
ok(/var resample = \(gpuW === img\.w && gpuH === img\.h\) \? 'NONE' : \('DOWNSCALE_' \+ img\.w \+ '_TO_' \+ gpuW\);/.test(GLOBE),
  'I12 and the resample field is DERIVED from the two, so it cannot claim a resample that did not happen');
// I13 — the reported layer list must be derived from live state. A hardcoded list would keep claiming a relief
// layer on a procedural fallback or on hardware without fragment highp, where there genuinely is none.
ok(/function materialLayers\(\)/.test(GLOBE), 'I13 the layer list is computed, not a fixed string');
ok(/if \(matInfo\.detail_enabled\) l\.splice\(2, 0, 'relief:albedo-luminance'\);/.test(GLOBE),
  'I13 and the relief layer is listed only when it is actually enabled');
ok(/o\.layers = materialLayers\(\);/.test(GLOBE), 'I13 with diagnostics reading the computed value');

// ================================================================================================================
section('J. visual acceptance — measured against the real asset pixels');
// ================================================================================================================
var V = VERIFY.run();
eq(V.fail, 0, 'J1 every deterministic acceptance check passes (' + (V.checks.length - V.fail) + '/' + V.checks.length + ')');
eq(V.views.length, 10, 'J2 all ten fixed views are evaluated');
eq(V.assets.length, 3, 'J3 all three runtime tiers decode and are measured');
V.assets.forEach(function (a) {
  var landCls = {};
  a.land.forEach(function (l) { landCls[l.cls] = 1; });
  ok(Object.keys(landCls).length >= 3, 'J4 [' + a.file + '] land is not one uniform surface: ' + Object.keys(landCls).join('/'));
  var oceanHex = {};
  a.ocean.forEach(function (o) { oceanHex[o.hex] = 1; });
  ok(Object.keys(oceanHex).length >= 4, 'J5 [' + a.file + '] the ocean is not one flat colour: ' + Object.keys(oceanHex).length + ' distinct probe colours');
  ok(a.seam_mean_abs_delta < 12, 'J6 [' + a.file + '] no dateline seam (mean |delta| ' + a.seam_mean_abs_delta + ')');
  a.land.forEach(function (l) { ok(l.water < 0.5, 'J7 [' + a.file + '] the shipped water mask keeps ' + l.name + ' as land'); });
  a.ocean.forEach(function (o) { ok(o.water > 0.5, 'J7 [' + a.file + '] and classifies ' + o.name + ' as water'); });
  ok(a.longitudinal.length >= 2, 'J8 [' + a.file + '] longitudinal variation is measured in several latitude bands');
  a.longitudinal.forEach(function (b) {
    ok(b.sd > 12, 'J8 [' + a.file + '] band ' + b.band + ' varies along longitude (sd ' + b.sd + ') — not a latitude ramp');
  });
});
// the specific geography claims §C names for North America
// RESTATED IN R3: the high tier is 8192, not 5400. Same claim, current filename.
var hi = V.assets.filter(function (a) { return a.file.indexOf('8192') !== -1; })[0];
function probe(a, n) { return a.land.filter(function (l) { return l.name === n; })[0]; }
ok(hi, 'J9 the high asset was measured');
if (hi) {
  var sw = probe(hi, 'US southwest'), pl = probe(hi, 'Central US plains'), rk = probe(hi, 'Rocky Mountains');
  ok(sw && pl && rk, 'J9 the North America regions §C names are all probed');
  if (sw && pl && rk) {
    var lum = function (p) { return 0.299 * p.r + 0.587 * p.g + 0.114 * p.b; };
    ok(Math.abs(lum(rk) - lum(pl)) > 8 || Math.abs(lum(sw) - lum(pl)) > 8,
      'J9 North America is internally differentiated (southwest / plains / Rockies are not one tone)');
  }
}
// view 1 must be clean (no relief) and view 9 must be the tightest allowed
eq(V.views[0].relief, 0, 'J10 view 1 (global) renders with the relief layer off');
ok(V.views[8].dist <= V.views[2].dist, 'J10 view 9 (maximum meaningful zoom) is at or inside the close views');
ok(V.views[9].tier.indexOf('BASE') !== -1, 'J10 view 10 exercises the low-capability fallback tier');

// ================================================================================================================
section('K. regression protection — nothing about shipments, geometry or interaction moved');
// ================================================================================================================
ok(/function latLngToVec3\(lat, lng, r\)/.test(GLOBE), 'K1 the coordinate transform is unchanged');
ok(/latLngToVec3\(m\.lat, m\.lng/.test(GLOBE) && /latLngToVec3\(p\[0\], p\[1\]/.test(GLOBE),
  'K1 markers and arcs still take their coordinates from the data');
ok(matRegion.indexOf('lat') === -1 || matRegion.indexOf('latLngToVec3') === -1,
  'K1 and the material layer never converts a coordinate');
['setMarkers', 'setArcs', 'focus', 'overview', 'resize', 'zoomIn', 'zoomOut', 'reset', 'getStatus', 'destroy',
 'setAdmin1Data', 'setAdmin1Layers', 'getLodInfo'].forEach(function (m) {
  ok(new RegExp(m + ':').test(GLOBE), 'K2 public API preserved: ' + m);
});
['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown'].forEach(function (ev) {
  ok(GLOBE.indexOf("addEventListener('" + ev + "'") >= 0, 'K3 interaction preserved: ' + ev);
});
ok(/cam\.yaw \+= dx \* 0\.006; cam\.pitch = clampPitch\(cam\.pitch \+ dy \* 0\.006\)/.test(GLOBE),
  'K3 drag sensitivity unchanged');
ok(/var MIN_D = 1\.35, MAX_D = 5\.0;/.test(GLOBE), 'K4 the declared camera bounds are unchanged');
ok(/new ResizeObserver\(function \(\) \{ inst\.resize\(\); \}\)/.test(GLOBE), 'K5 the ResizeObserver is intact');
ok(/dpr = Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/.test(GLOBE), 'K5 and the DPR backing-buffer rule is unchanged');
// context loss / restore
ok(/matInfo\.context_lost\+\+/.test(GLOBE), 'K6 context loss is counted');
ok(/function restoreMaterial\(\)/.test(GLOBE), 'K6 and restore RE-CREATES the texture (every GL object dies with the context)');
ok(/tex = gl\.createTexture\(\); \} catch \(e\) \{ return false; \}/.test(GLOBE), 'K6 with a new texture object, not a re-bind');
ok(/rebuildAdmin1Buffer\(\); schedule\(\);/.test(GLOBE), 'K6 the pre-existing buffer rebuild on restore is untouched');
ok(/var rec = earthImgCache_\[earthAssetPath\(want\)\];/.test(GLOBE),
  'K6 restore re-uploads from the CACHED decode — no second request, no second decode');
ok(/gl\.deleteTexture\(tex\)/.test(GLOBE), 'K7 destroy still frees the texture');
// the shipment page's business logic is untouched by this task
['advanceShipmentRoutePoint', 'resolveCurrentPosition'].forEach(function (f) {
  ok(MAPJS.indexOf(f) !== -1, 'K8 shipment position logic still present: ' + f);
});
var diagFn = MAPJS.slice(MAPJS.indexOf('function mapGlobeDiagnostics'), MAPJS.indexOf('window.KM_MAP_GLOBE_DIAGNOSTICS'));
['setMarkers', 'setArcs', 'advanceShipmentRoutePoint', 'updateEta'].forEach(function (w) {
  ok(diagFn.indexOf(w) === -1, 'K9 the diagnostics accessor is read-only: it never calls ' + w);
});

// ================================================================================================================
section('L. provenance, licence and deployment wiring');
// ================================================================================================================
ok(/NASA/.test(EARTH_PROV) && /not subject to copyright/.test(EARTH_PROV),
  'L1 the licence is recorded verbatim from NASA policy, not paraphrased');
ok(/texture maps/.test(EARTH_PROV), 'L1 including the clause that names texture maps specifically');
ok(/NASA should be acknowledged[\s>]+as the source of the material/.test(EARTH_PROV), 'L1 and the attribution obligation is stated (quoted across the markdown line wrap)');
ok(/copyright protected with the name of the copyright holder/.test(EARTH_PROV),
  'L1 with the third-party-content caveat checked rather than presumed');
// L2 — RESTATED IN R3, AND THE OLD SHAPE IS WHY.
//
// This used to be a FROZEN LITERAL LIST of two digests. That list went stale the moment R3 regenerated the 2048
// tier: the assertion kept passing because the retired 2002 digest was still SITTING IN the fetch script, while
// the file on disk had different bytes entirely. A pin that checks a string against another string in the same
// repository does not verify anything about the asset.
//
// So it is computed from the FILES. For every earth image actually on disk, its real digest must appear in
// PROVENANCE.md and in whichever tool OWNS it - build-earth-tiers.js for the three generated runtime tiers,
// fetch-earth-textures.js for the retained R2 acceptance baseline. A retired digest cannot satisfy this, and a
// silently re-encoded file cannot either.
var BUILD_TIERS = fs.readFileSync(path.join(__dirname, '..', '..', 'tools', 'geo', 'build-earth-tiers.js'), 'utf8');
var EARTH_IMG_DIR = path.join(__dirname, '..', 'img', 'earth');
var earthFiles = fs.readdirSync(EARTH_IMG_DIR).filter(function (f) { return /\.jpg$/.test(f); }).sort();
eq(earthFiles.length, 4, 'L2 four earth images are vendored: three runtime tiers plus the retained R2 baseline');
earthFiles.forEach(function (f) {
  var h = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(EARTH_IMG_DIR, f))).digest('hex');
  ok(EARTH_PROV.indexOf(h) !== -1, 'L2 provenance records the ACTUAL digest of ' + f + ' (' + h.slice(0, 12) + ')');
  var owner = (f === 'earth-albedo-5400.jpg') ? FETCH : BUILD_TIERS;
  var ownerName = (f === 'earth-albedo-5400.jpg') ? 'fetch-earth-textures.js' : 'build-earth-tiers.js';
  ok(owner.indexOf(h) !== -1, 'L2 and ' + ownerName + ' pins that same digest for ' + f);
});
// No tool may still pin a digest for a file that is gone — that is exactly how the stale list above survived.
ok(FETCH.indexOf('d4dc80a6ef571939d0abe04a9bed3d3d1e6cd63e59514be1c5e43a6b069e6f1e') === -1,
  'L2 and the RETIRED 2002 Blue Marble digest is no longer pinned anywhere that could re-download it');
// L3 — the gap markers. R3 CLOSES the 8K one, so the assertion now requires it to be recorded as closed rather
// than merely present: a resolved gap that still reads as outstanding is its own kind of stale claim.
ok(/REAL_EARTH_8K_SOURCE_ASSET_REQUIRED/.test(EARTH_PROV), 'L3 the 8K asset gap is named, not hidden');
ok(/REAL_EARTH_8K_SOURCE_ASSET_REQUIRED[^\n]*(CLOSED|RESOLVED)/.test(EARTH_PROV),
  'L3 and is recorded as CLOSED by TEXTURE-3-R3, not left reading as outstanding');
ok(/REAL_EARTH_DEM_ASSET_REQUIRED/.test(EARTH_PROV), 'L3 as is the elevation-model gap');
ok(/NASA/.test(GLOBE), 'L4 the engine itself carries the NASA attribution in the asset table');
ok(/failures\+\+;\r?\n\s*console\.error\('REFUSED  '/.test(FETCH), 'L5 the fetch script is fail-closed on a digest mismatch');
var __globeTok = /km-globe\.js\?v=([^"']+)/.exec(INDEX);
ok(!!__globeTok, 'L6 index.html cache-busts the engine');
ok(!!__globeTok && __globeTok[1] !== 'map-lod-20260826',
  'L6 and it is off the pre-TEXTURE-2 map-lod token, so the changed engine really re-fetches');
// TEXTURE-3-R8 — THE SIXTH PRIVATE COPY OF "WHICH TOKEN IS CURRENT", and the only one whose corrected form was
// already sitting two lines above it. The engine assertion at L6 says "it is OFF the retired token", which stays
// true forever; this line said "it IS map-earth-texture-20260826", which stopped being true the moment a later
// round changed the page again — R8 did, to carry the ADM1 content-pinned loader. Same intent, stated the way its
// sibling states it, with the series coming from the shared release order.
var __pageTok = /global-logistics-map\.js\?v=([^"']+)/.exec(INDEX);
ok(!!__pageTok, 'L6 index.html cache-busts the map page');
ok(!!__pageTok && __pageTok[1] !== 'map-lod-20260826' && __pageTok[1] !== 'map-earth-texture-20260826',
  'L6 and the changed page is off every retired token, so it really re-fetches (' + (__pageTok ? __pageTok[1] : '') + ')');
ok(!!__pageTok && require(path.join(ROOT, 'assets/tests/_release-order.js')).isMapToken(__pageTok[1]),
  'L6 and its token belongs to the current map series');
ok(INDEX.indexOf('earth-albedo') === -1,
  'L7 the assets are NOT preloaded in index.html — they are fetched by the globe only when the map is opened');
ok(PROV.indexOf('Natural Earth') !== -1, 'L8 the pre-existing vector provenance file is untouched by this task');

// ================================================================================================================
console.log('\n' + '-'.repeat(40));
console.log('REAL-EARTH MATERIAL (MAP-VISUAL-REAL-EARTH-TEXTURE-2): ' + pass + ' passed, ' + fail + ' failed');
console.log('-'.repeat(40));
if (fail) process.exit(1);
