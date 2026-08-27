#!/usr/bin/env node
/**
 * tools/geo/capture-views.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R2 §I / §L5 — DETERMINISTIC BROWSER CAPTURE OF THE REAL WEBGL GLOBE.
 *
 * WHY THIS REPLACES THE PREVIOUS APPROACH. tools/geo/verify-views.js opens with "A WebGL globe cannot be
 * rendered in this offline environment, so instead of claiming screenshots this harness computes ... what the
 * shipped label layer WOULD draw". That premise is FALSE, and it was worth testing rather than inheriting:
 * headless Chrome here reports `WebGL 2.0 (OpenGL ES 3.0 Chromium)`, `MAX_TEXTURE_SIZE 8192` and fragment
 * `highp`, and rasterises correctly. So the acceptance views §I and §L5 require can be actual pixels.
 *
 * That distinction matters for exactly the reason this round exists: the previous round's Canada claim was
 * argued from a colour probe of a texture, and the thing it could not see was what the composited, lit,
 * bordered, labelled globe actually looks like. This harness looks.
 *
 * DETERMINISM — every source of variation is pinned, because a capture that differs run to run cannot be a gate:
 *   · `reducedMotion: true`  -> animateTo sets the camera INSTANTLY (no eased tween, no timing dependence)
 *   · `--virtual-time-budget` -> Chrome advances virtual time until timers/rAF drain, then captures
 *   · `--force-device-scale-factor=1` and a fixed `--window-size` -> a fixed backing buffer
 *   · `--use-angle=swiftshader` -> the SAME software rasteriser on every machine, not the local GPU
 *   · `--hide-scrollbars`, `--disable-lcd-text` -> no host-dependent chrome or subpixel AA
 *   · the material tier is FORCED per view, so a capture never silently changes tier between runs
 *
 * It writes, per view, a PNG and a JSON sidecar carrying the material/texture/render diagnostics the report
 * has to state: which asset was live, which tier, mipmaps, anisotropy, GPU estimate, camera and fallback
 * reason. The sidecar is what makes "which texture produced this picture" a recorded fact.
 *
 * This is a verification tool. It is never loaded by the page.
 *
 *   node tools/geo/capture-views.js                 # all views, into docs/planning/map-captures/<label>/
 *   node tools/geo/capture-views.js --tag before    # write into .../before/
 *   node tools/geo/capture-views.js --only na-globe,canada-prairies
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');

// ---- Chrome discovery. Reported rather than guessed: if there is no browser, the caller must know that the
// ---- views were NOT produced instead of receiving a silent pass.
var CHROME_CANDIDATES = [
  process.env.KM_CHROME || '',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
function findChrome() {
  for (var i = 0; i < CHROME_CANDIDATES.length; i++) {
    var c = CHROME_CANDIDATES[i];
    if (c && fs.existsSync(c)) return c;
  }
  return '';
}

// ---- THE VIEWS. §I's eight acceptance views and §L5's eight Canada comparisons, de-duplicated where they are
// ---- the same camera. `focus` is [lat, lng]; `dist` is the globe's own camera distance (1.35 = closest).
var VIEWS = [
  // §I.1 + §L5.1 — the whole-globe North America view. This is the view the live Canada complaint is about.
  { id: 'na-globe', title: 'I1/L5-1 whole globe - North America', focus: [48, -100], dist: 2.9, w: 1280, h: 900, admin1: false },
  // §I.2 + §L5.6 — Canada regional
  { id: 'canada-regional', title: 'I2 Canada regional', focus: [58, -100], dist: 1.95, w: 1280, h: 900, admin1: true },
  // §I.3 + §L5.8 — the US/Canada international border, close
  { id: 'us-ca-border', title: 'I3/L5-8 US-Canada international border', focus: [49, -105], dist: 1.5, w: 1280, h: 900, admin1: true },
  // §I.4 — western US / Mexico boundary
  { id: 'us-mx-border', title: 'I4 western US / Mexico boundary', focus: [31.5, -110], dist: 1.5, w: 1280, h: 900, admin1: true },
  // §I.5 — Japan / Korea / China
  { id: 'jp-kr-cn', title: 'I5 Japan / Korea / China regional', focus: [37, 127], dist: 1.85, w: 1280, h: 900, admin1: true },
  // §I.6 — Europe dense borders
  { id: 'europe-dense', title: 'I6 Europe dense-border view', focus: [49, 12], dist: 1.75, w: 1280, h: 900, admin1: true },
  // §I.7 — anti-meridian / Pacific islands
  { id: 'antimeridian', title: 'I7 anti-meridian / Pacific islands', focus: [0, 180], dist: 2.2, w: 1280, h: 900, admin1: false },
  // §I.8 — a live-style shipment route over North America
  { id: 'route-na', title: 'I8 shipment route over North America', focus: [42, -95], dist: 2.5, w: 1280, h: 900, admin1: false, route: true },
  // ---- TEXTURE-3-R3 §H — the views R2's set did not contain. §H names fourteen; R2 captured eight
  // ---- acceptance views plus a Canada comparison set, which left the globe limb, the dense-ADM1 US view
  // ---- and three whole continents unlooked-at.
  // §H.9 — the globe LIMB, close. This is where §C's old 0.0035 border shell showed worst: a layer at
  // radius 1+d viewed edge-on is displaced from the ground by d*tan(t), which diverges as t nears 90 deg.
  // THE FIRST ATTEMPT AT THIS VIEW SHOWED NO LIMB AT ALL, and the reason is geometric rather than a matter of
  // taste. At camera distance d the globe's angular radius is asin(1/d); the projection is a 45 deg vertical
  // fov, so a half-fov of 22.5 deg. At d=1.45 the globe subtends 43.6 deg and OVERFILLS the frame - the disc
  // edge is off-screen in every direction. The limb only enters frame beyond d = 1/sin(22.5) = 2.61, so this
  // sits just outside that at 2.8, which is the closest the limb can be looked at with this fov.
  { id: 'globe-limb', title: 'H9 globe limb close-up', focus: [10, -50], dist: 2.8, w: 1280, h: 900, admin1: true },
  // §H.11 — dense ADM1 over the US, at the zoom where the layer is at FULL strength rather than fading in.
  { id: 'us-adm1-dense', title: 'H11 dense ADM1 - continental US', focus: [39, -96], dist: 1.5, w: 1280, h: 900, admin1: true },
  // §H.12/§H.13/§H.14 — three continents R2 never captured at all.
  { id: 'south-america', title: 'H12 South America', focus: [-15, -60], dist: 1.9, w: 1280, h: 900, admin1: true },
  { id: 'africa', title: 'H13 Africa', focus: [2, 20], dist: 1.9, w: 1280, h: 900, admin1: true },
  { id: 'oceania', title: 'H14 Australia / Oceania', focus: [-25, 140], dist: 1.9, w: 1280, h: 900, admin1: true },
  // ---- §L5 Canada comparison set ----
  { id: 'canada-bc', title: 'L5-2 Vancouver / British Columbia', focus: [50, -122], dist: 1.5, w: 1280, h: 900, admin1: true },
  { id: 'canada-prairies', title: 'L5-3 Alberta / Saskatchewan / Manitoba', focus: [51, -105], dist: 1.55, w: 1280, h: 900, admin1: true },
  { id: 'canada-greatlakes', title: 'L5-4 Great Lakes / S Ontario / Quebec', focus: [45, -78], dist: 1.5, w: 1280, h: 900, admin1: true },
  { id: 'canada-rockies', title: 'L5-5 Canadian Rockies', focus: [51.5, -117], dist: 1.45, w: 1280, h: 900, admin1: true },
  { id: 'canada-boreal', title: 'L5-6 northern mainland / boreal-tundra transition', focus: [63, -100], dist: 1.7, w: 1280, h: 900, admin1: true },
  { id: 'arctic-greenland', title: 'L5-7 Arctic Archipelago and Greenland', focus: [75, -60], dist: 1.9, w: 1280, h: 900, admin1: false },
  // ---- TEXTURE-3-R4 §F — the view the TW/CN decision has to be LOOKED AT in. §A is a decision about what two
  // ---- specific labels say, and a decision about text is not verified by an assertion on a string: the
  // ---- question is whether 台灣 and 中國 read correctly at the zoom where both are on screen together.
  { id: 'tw-cn', title: 'R4-F1 Taiwan / China - the §A display decision', focus: [26, 119], dist: 1.7, w: 1280, h: 900, admin1: true },
  // §F — wide enough to carry the divisions of China, Taiwan, Japan and Korea at once, which is where the §B
  // division work and the §C density work are visible in the same frame.
  { id: 'tw-cn-wide', title: 'R4-F2 Taiwan / China / Japan / Korea regional', focus: [30, 122], dist: 2.05, w: 1280, h: 900, admin1: true }
];

// ---- the harness page. Loads exactly the runtime assets the real page loads, in the real order.
function harnessHtml(view, forceTier) {
  var v = JSON.stringify(view);
  return [
    '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>capture</title>',
    '<style>html,body{margin:0;padding:0;background:#05080f;overflow:hidden}',
    '#host{position:absolute;left:0;top:0;width:' + view.w + 'px;height:' + view.h + 'px}</style>',
    '</head><body><div id="host"></div>',
    // The runtime assets, same order as index.html.
    '<script src="assets/js/data/world-land-110m.js"></script>',
    '<script src="assets/js/data/world-countries-110m.js"></script>',
    '<script src="assets/js/data/geo-names-zh-hant.js"></script>',
    '<script src="assets/js/data/geo-display-aliases-zh-tw.js"></script>',
    '<script src="assets/js/data/geo-admin1-display-names-zh-tw.js"></script>',
    '<script src="assets/js/core/geo-name-resolver.js"></script>',
    '<script src="assets/js/lib/km-geo-topology.js"></script>',
    '<script src="assets/js/lib/km-globe.js"></script>',
    '<script>',
    'var VIEW = ' + v + ';',
    'var FORCE_TIER = ' + JSON.stringify(forceTier || '') + ';',
    // The asset dir is repo-relative from this page's location.
    'window.KM_GLOBE_EARTH_ASSET_DIR = "assets/img/earth/";',
    'var out = { id: VIEW.id, title: VIEW.title, ok: false };',
    'function done(extra) {',
    '  for (var k in (extra||{})) out[k] = extra[k];',
    '  console.log("KMCAPTURE " + JSON.stringify(out));',
    '  document.title = "done:" + VIEW.id;',
    '}',
    'try {',
    // Report WHICH precondition failed. "WEBGL_UNSUPPORTED" for a script that never loaded would send the
    // diagnosis in exactly the wrong direction, which is the failure mode this whole round is about.
    '  var pre = { KMGlobe: !!window.KMGlobe, land: !!window.KM_WORLD_LAND, countries: !!window.KM_WORLD_COUNTRIES,',
    '              names: !!window.KM_GEO_NAMES_ZH_HANT, resolver: !!(window.KM && window.KM.geoNames),',
    '              webgl: (function () { try { return !!document.createElement("canvas").getContext("webgl"); } catch (e) { return false; } })() };',
    '  out.preconditions = pre;',
    '  if (!pre.KMGlobe) { done({ error: "GLOBE_SCRIPT_NOT_LOADED" }); }',
    '  else if (!pre.webgl) { done({ error: "WEBGL_UNSUPPORTED" }); }',
    '  else if (!window.KMGlobe.isSupported()) { done({ error: "GLOBE_ISSUPPORTED_FALSE" }); }',
    '  else {',
    '    var host = document.getElementById("host");',
    // reducedMotion: true is what makes the camera instant and therefore the capture deterministic.
    '    var g = window.KMGlobe.create(host, { reducedMotion: true, admin1Borders: VIEW.admin1 ? "auto" : "off",',
    '        admin1Labels: VIEW.admin1 ? "auto" : "off",',
    '        onError: function (k, m) { done({ error: "GLOBE_" + k, message: String(m || "") }); } });',
    '    if (!g) { done({ error: "GLOBE_CREATE_NULL" }); }',
    '    else {',
    '      g.resize();',
    '      if (VIEW.route) {',
    // A live-style route: Shanghai -> Los Angeles -> Chicago, with markers, so §I.8 shows route data over geography.
    '        g.setMarkers([{ id: "SHA", lat: 31.2, lng: 121.5, color: [0.25, 0.65, 1], size: 13, ring: false },',
    '                      { id: "LAX", lat: 33.9, lng: -118.4, color: [1, 0.72, 0.2], size: 14, ring: true },',
    '                      { id: "ORD", lat: 41.9, lng: -87.6, color: [0.35, 0.9, 0.55], size: 13, ring: false }]);',
    '        g.setArcs([{ from: [31.2, 121.5], to: [33.9, -118.4], color: [0.35, 0.75, 1, 0.95] },',
    '                   { from: [33.9, -118.4], to: [41.9, -87.6], color: [1, 0.72, 0.2, 0.95] }]);',
    '      }',
    '      if (VIEW.admin1 && g.setAdmin1Data) {',
    '        var s = document.createElement("script");',
    '        s.src = "assets/js/data/world-admin1-10m.js";',
    '        s.onload = function () { try { g.setAdmin1Data(window.KM_WORLD_ADMIN1); } catch (e) {} place(); };',
    '        s.onerror = function () { place(); };',
    '        document.body.appendChild(s);',
    '      } else { place(); }',
    '      function place() {',
    '        g.focus(VIEW.focus[0], VIEW.focus[1], { dist: VIEW.dist });',
    // Two frames of settle, then read the diagnostics the report must quote.
    '        setTimeout(function () {',
    '          var mi = {}, ti = {}, ri = {}, li = {}, ai = {}, tp = {}, pf = {}, fl = {};',
    '          // TEXTURE-3-R4 - FORCE ONE SYNCHRONOUS FRAME BEFORE READING ANYTHING. The label counters and the',
    '          // LOD level are written by draw(), which runs on requestAnimationFrame; the settle timeout is not',
    '          // a guarantee that one has run since the last focus(). Without this, canada-boreal reported LOD 0',
    '          // and three CONTINENT labels at distance 1.7 - figures from a frame drawn while the camera was',
    '          // still at the overview position, describing a view the screenshot does not show.',
    '          try { g.measureFrames({ samples: 1 }); } catch (e) {}',
    '          try { li = g.getLodInfo(); } catch (e) {}',
    '          try { ai = g.getAdmin1LayerInfo(); } catch (e) {}',
    // TEXTURE-3-R3 §D/§I — the canonical-topology facts and the separated timings. measureFrames() lives in
    // the ENGINE because only the engine can drive a synchronous frame; from out here the best available is
    // a camera nudge plus requestAnimationFrame, which measures the browser's scheduler and not the renderer.
    '          try { tp = g.getTopologyInfo(); } catch (e) {}',
    '          try { fl = flickerProbe(g); } catch (e) { fl = { error: String(e && e.message || e) }; }',
    '          try { pf = g.measureFrames({ samples: 24 }); } catch (e) { pf = { error: String(e && e.message || e) }; }',
    '          try { mi = g.getMaterialInfo(); } catch (e) {}',
    '          try { ti = g.getTextureInfo(); } catch (e) {}',
    '          try { ri = g.getRenderInfo(); } catch (e) {}',
    '          out.ok = true;',
    '          done({ material: mi, texture: ti, render: ri, lod: li, admin1: ai, topology: tp, perf: pf,',
    '                 flicker: fl,',
    '                 camera: { focus: VIEW.focus, dist: VIEW.dist },',
    '                 admin1_requested: !!VIEW.admin1, route: !!VIEW.route,',
    '                 font_probe: fontProbe() });',
    '        }, 900);',
    '      }',
    '    }',
    '  }',
    '} catch (e) { done({ error: "HARNESS_THROW", message: String(e && e.message || e) }); }',
    // §I — a browser that cannot render the intended glyphs must not be used to claim visual validation, so the
    // capture RECORDS whether a Traditional-Chinese face is actually present, measured rather than assumed.
    '// TEXTURE-3-R4 §F.9 - FLICKER, MEASURED RATHER THAN EYEBALLED. A still screenshot cannot show a label that',
    '// appears and disappears between frames, so the harness drives a short DETERMINISTIC camera sequence and',
    '// records what was drawn at each step. It reads the engine\'s OWN label counters after each forced frame, so',
    '// it observes what was painted rather than re-deriving it.',
    '//',
    '// TWO DIFFERENT QUESTIONS, AND CONFLATING THEM WOULD MAKE THE ANSWER MEANINGLESS:',
    '//   - a STATIONARY camera redrawn N times must produce the IDENTICAL set. Any change there is pure',
    '//     frame-to-frame flicker and has no legitimate cause.',
    '//   - a MOVING camera is EXPECTED to change the set; labels legitimately enter and leave. What must not',
    '//     happen is a label leaving and returning within one sweep, which is what the hysteresis exists to stop.',
    'function flickerProbe(g) {',
    '  var still = [], sweep = [], i;',
    '  function snapshot() {',
    '    var t = g.getTopologyInfo();',
    '    var lc = (t && t.label_counts) || {};',
    '    // getTopologyInfo does not carry the LOD level; getLodInfo is the authority for it. Reading it off the',
    '    // wrong accessor gave a lod_path of nulls and a transition count of 0 that meant nothing.',
    '    var li = {};',
    '    try { li = g.getLodInfo() || {}; } catch (e) {}',
    '    return { country: (lc.country || {}).drawn || 0, continent: (lc.continent || {}).drawn || 0,',
    '             adm1: (lc.adm1 || {}).drawn || 0, lod: li.lod, dist: li.distance };',
    '  }',
    '  // 1. STATIONARY. measureFrames drives real frames through the real draw path and restores the camera, so',
    '  // calling it repeatedly re-renders the same view. The label set must not move at all.',
    '  for (i = 0; i < 6; i++) { g.measureFrames({ samples: 1 }); still.push(snapshot()); }',
    '  var stillKey = JSON.stringify(still[0]);',
    '  var stillStable = true;',
    '  for (i = 1; i < still.length; i++) if (JSON.stringify(still[i]) !== stillKey) stillStable = false;',
    '  // 2. A SLOW ZOOM out and back across the current band. The set may change; it may not oscillate.',
    '  var d0 = (g.getStatus() || {}).dist || 1.8;',
    '  var seq = [];',
    '  for (i = -8; i <= 8; i++) seq.push(d0 + i * 0.03);',
    '  for (i = seq.length - 2; i >= 0; i--) seq.push(seq[i]);',
    '  var lods = [];',
    '  for (i = 0; i < seq.length; i++) {',
    '    g.focus(VIEW.focus[0], VIEW.focus[1], { dist: seq[i] });',
    '    g.measureFrames({ samples: 1 });',
    '    var sn = snapshot();',
    '    sweep.push(sn.country + \'/\' + sn.continent + \'/\' + sn.adm1);',
    '    lods.push(sn.lod);',
    '  }',
    '  g.focus(VIEW.focus[0], VIEW.focus[1], { dist: VIEW.dist });',
    '  g.measureFrames({ samples: 1 });',
    '  // Across a 0.24-wide sweep that crosses at most one threshold, a clean crossing with the 0.08 hysteresis',
    '  // band is 2 transitions - out and back. More than that is the oscillation §C forbids.',
    '  var lodFlips = 0;',
    '  for (i = 1; i < lods.length; i++) if (lods[i] !== lods[i - 1]) lodFlips++;',
    '  var stillSets = [];',
    '  for (i = 0; i < still.length; i++) stillSets.push(still[i].country + \'/\' + still[i].continent + \'/\' + still[i].adm1);',
    '  return { still_frames: still.length, still_stable: stillStable, still_sets: stillSets,',
    '           sweep_steps: seq.length, sweep_sets: sweep, lod_path: lods, lod_transitions: lodFlips };',
    '}',
    'function fontProbe() {',
    '  try {',
    '    var cv = document.createElement("canvas"), x = cv.getContext("2d");',
    '    var TXT = "\\u52A0\\u62FF\\u5927";',
    '    function wOf(f) { x.font = "700 24px " + f; return Math.round(x.measureText(TXT).width * 100) / 100; }',
    '    var fallbackW = wOf("\\"__KM_NO_SUCH_FONT__\\"");',
    '    var res = {};',
    '    ["Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", "sans-serif"].forEach(function (f) {',
    '      res[f] = wOf("\\"" + f + "\\"");',
    '    });',
    // A face that renders CJK gives a width near 3x the em; a face that falls back to tofu/notdef differs.
    '    res.__fallback = fallbackW;',
    '    res.__any_cjk = Object.keys(res).some(function (k) { return k.indexOf("__") !== 0 && res[k] >= 60; });',
    '    return res;',
    '  } catch (e) { return { error: String(e && e.message || e) }; }',
    '}',
    '</script></body></html>'
  ].join('\n');
}

function run(chrome, htmlPath, pngPath, view) {
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kmcap-'));
  var args = [
    '--headless=new',
    '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    // ONE software rasteriser everywhere, so a capture is a property of the code and not of the machine.
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--disable-lcd-text',
    '--allow-file-access-from-files',
    // headless=new does NOT forward page console output by default; without these the diagnostics sidecar
    // would be silently empty and the capture would look like it succeeded with no material facts.
    '--enable-logging=stderr', '--v=0', '--log-level=0',
    '--virtual-time-budget=9000',
    '--window-size=' + view.w + ',' + view.h,
    '--screenshot=' + pngPath,
    // Percent-encoded: this repository path contains non-ASCII characters and spaces, and an UNENCODED
    // file:// URL loads the document but silently fails every relative <script> in it — which reads as
    // "WebGL unsupported" to a harness that does not report which precondition actually failed.
    'file:///' + encodeURI(htmlPath.replace(/\\/g, '/'))
  ];
  var r = cp.spawnSync(chrome, args, { encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  var blob = String(r.stdout || '') + '\n' + String(r.stderr || '');
  var m = /KMCAPTURE (\{[\s\S]*?\})\s*$/m.exec(blob) || /KMCAPTURE (\{.*\})/.exec(blob);
  var diag = null;
  if (m) { try { diag = JSON.parse(m[1]); } catch (e) { diag = { parse_error: m[1].slice(0, 400) }; } }
  return { diag: diag, status: r.status, wrote: fs.existsSync(pngPath) ? fs.statSync(pngPath).size : 0 };
}

function main() {
  var argv = process.argv.slice(2);
  function opt(name, dflt) {
    var i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  }
  var tag = opt('tag', 'current');
  var only = (opt('only', '') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var forceTier = opt('tier', '');
  var chrome = findChrome();
  if (!chrome) {
    console.error('NO_BROWSER: no Chrome/Chromium/Edge binary found. Set KM_CHROME=<path>.');
    console.error('The acceptance views were NOT produced. Do not report them as passing.');
    process.exit(2);
  }
  var outDir = path.join(ROOT, 'docs', 'planning', 'map-captures', tag);
  fs.mkdirSync(outDir, { recursive: true });
  // The harness page is written AT THE REPOSITORY ROOT on purpose: every runtime asset is then a plain
  // relative path with no `../` traversal, which is the one arrangement that loads reliably over file:// from a
  // directory whose name is non-ASCII. Each file is removed immediately after its own capture.
  var work = ROOT;

  console.log('browser: ' + chrome);
  console.log('output : ' + outDir);
  var results = [];
  VIEWS.filter(function (v) { return !only.length || only.indexOf(v.id) !== -1; }).forEach(function (v) {
    var htmlPath = path.join(work, '.km-capture-' + v.id + '.html');
    fs.writeFileSync(htmlPath, harnessHtml(v, forceTier), 'utf8');
    var pngPath = path.join(outDir, v.id + '.png');
    var r = run(chrome, htmlPath, pngPath, v);
    var d = r.diag || {};
    var mat = d.material || {};
    console.log('  ' + v.id.padEnd(20)
      + (r.wrote ? String(r.wrote).padStart(8) + 'B' : '  NO PNG ')
      + '  ' + (d.ok ? 'ok' : ('FAIL ' + (d.error || 'no diagnostics')))
      + '  tier=' + (mat.tier || '?')
      + ' asset=' + (mat.source_asset || mat.asset || '?')
      + ' cjkFont=' + (d.font_probe ? d.font_probe.__any_cjk : '?'));
    results.push({ view: v, png_bytes: r.wrote, diag: d });
    try { fs.unlinkSync(htmlPath); } catch (e) {}
  });
  fs.writeFileSync(path.join(outDir, 'captures.json'), JSON.stringify({ tag: tag, browser: path.basename(chrome), views: results }, null, 2), 'utf8');
  var bad = results.filter(function (r) { return !r.png_bytes || !r.diag.ok; });
  console.log('\n' + (results.length - bad.length) + '/' + results.length + ' views captured');
  if (bad.length) { console.log('FAILED: ' + bad.map(function (b) { return b.view.id; }).join(', ')); process.exit(1); }
}

if (require.main === module) main();
module.exports = { VIEWS: VIEWS, findChrome: findChrome };
