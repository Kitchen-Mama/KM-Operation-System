#!/usr/bin/env node
/**
 * tools/geo/measure-perf.js
 * MAP-VISUAL-REAL-EARTH-TEXTURE-3-R3 §I — the performance phases, measured separately, in REAL time.
 *
 * WHY THIS IS A SEPARATE TOOL FROM tools/geo/capture-views.js, AND IT IS NOT A STYLE CHOICE.
 *
 * The capture harness is DETERMINISTIC by construction: it runs Chrome with `--virtual-time-budget`, which makes
 * the browser advance a VIRTUAL clock in discrete steps rather than following wall time. That is exactly what a
 * pixel gate needs - two runs produce the same pixels - and it makes wall-clock timing impossible: inside a
 * synchronous measurement loop virtual time does not advance at all, so `performance.now()` returns the same
 * value every iteration.
 *
 * That is not a hypothesis. The first attempt at §I measured frame time inside the capture harness and reported
 * 0.00 ms for the 141,608-vertex LOD-3 globe against 0.18 ms for the 22,452-vertex LOD-0 globe - the heavier
 * scene apparently faster, and most views exactly zero. Two separate faults produced that: virtual time, and
 * measuring GL SUBMISSION rather than GL COMPLETION (WebGL calls only enqueue; the driver finishes later).
 *
 * So performance is measured HERE, with real time and a drained pipeline, and it is a different kind of artefact
 * from a capture: it is not deterministic and it is not a gate. The two must not be conflated.
 *
 * WHAT §I ASKS TO BE MEASURED SEPARATELY, AND WHERE EACH NUMBER COMES FROM:
 *   texture download/read   Resource Timing (`transferSize`, `responseEnd - startTime`) for the asset URL
 *   image decode            the engine's own asset-load time minus the Resource Timing transfer window
 *   GPU upload              the engine's `gpu_upload_ms` - texImage2D + generateMipmap only
 *   topology preparation    the engine's `topology_prepare_coarse` / `_fine`
 *   label placement         the engine's `label_placement_last_frame`
 *   first render            the engine's `first_render`, from create() to the end of the first complete frame
 *   steady rotate/zoom      `measureFrames()`, which drives real frames and calls gl.finish() per sample
 *
 * SOFTWARE RENDERER. Unless a real GPU is available to Chrome, this runs on SwiftShader and every frame number
 * is a SOFTWARE-RASTERISER number. The unmasked renderer string is captured and printed with the results so the
 * distinction is in the output rather than in a caveat someone has to remember. Pass --gpu to try the real GPU.
 *
 *   node tools/geo/measure-perf.js                 # software rasteriser (default, comparable across machines)
 *   node tools/geo/measure-perf.js --gpu           # let Chrome choose the real GPU, if it has one
 *   node tools/geo/measure-perf.js --json
 *
 * This is a verification tool. It is never loaded by the page.
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');

var CHROME_CANDIDATES = [
  process.env.KM_CHROME || '',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
function findChrome() {
  for (var i = 0; i < CHROME_CANDIDATES.length; i++) if (CHROME_CANDIDATES[i] && fs.existsSync(CHROME_CANDIDATES[i])) return CHROME_CANDIDATES[i];
  return '';
}

// The scenes to measure. Chosen so the two canonical topologies and both label regimes are each represented,
// and so the heaviest realistic case (dense ADM1 at full strength) is included rather than averaged away.
var SCENES = [
  { id: 'globe-lod0', focus: [48, -100], dist: 2.9, admin1: false },
  { id: 'regional-lod1', focus: [58, -100], dist: 1.95, admin1: true },
  { id: 'europe-lod2', focus: [49, 12], dist: 1.75, admin1: true },
  { id: 'us-adm1-lod3', focus: [39, -96], dist: 1.5, admin1: true },
  { id: 'limb-lod3', focus: [20, -40], dist: 1.45, admin1: true }
];

function page(scenes, samples) {
  return [
    '<!doctype html><meta charset="utf-8"><title>km perf</title>',
    '<style>html,body{margin:0;background:#070b13}#host{position:absolute;left:0;top:0;width:1280px;height:900px}</style>',
    '<body><div id="host"></div>',
    '<script src="assets/js/data/world-land-110m.js"></script>',
    '<script src="assets/js/data/world-countries-110m.js"></script>',
    '<script src="assets/js/data/geo-names-zh-hant.js"></script>',
    '<script src="assets/js/data/geo-display-aliases-zh-tw.js"></script>',
    '<script src="assets/js/core/geo-name-resolver.js"></script>',
    '<script src="assets/js/lib/km-geo-topology.js"></script>',
    '<script src="assets/js/lib/km-globe.js"></script>',
    '<script src="assets/js/data/world-admin1-10m.js"></script>',
    '<script>',
    'var SCENES = ' + JSON.stringify(scenes) + ';',
    'var SAMPLES = ' + samples + ';',
    'window.KM_GLOBE_EARTH_ASSET_DIR = "assets/img/earth/";',
    'var out = { scenes: [], ok: false };',
    'function fin(extra) {',
    '  for (var k in (extra||{})) out[k] = extra[k];',
    '  console.log("KMPERF " + JSON.stringify(out));',
    '  document.title = "done";',
    '}',
    // Resource Timing gives the TRANSFER window for the image; the engine gives fetch+decode together. The
    // difference is decode. Both are reported, so the subtraction is visible rather than presented as a
    // primary measurement.
    'function resourceTiming(substr) {',
    '  try {',
    '    var e = performance.getEntriesByType("resource").filter(function (r) { return r.name.indexOf(substr) !== -1; });',
    '    if (!e.length) return null;',
    '    var r = e[e.length - 1];',
    '    return { name: r.name.split("/").pop(), transfer_bytes: r.transferSize || 0,',
    '             encoded_bytes: r.encodedBodySize || 0,',
    '             fetch_ms: Math.round((r.responseEnd - r.startTime) * 10) / 10,',
    '             ttfb_ms: Math.round((r.responseStart - r.startTime) * 10) / 10 };',
    '  } catch (e) { return null; }',
    '}',
    'try {',
    '  if (!window.KMGlobe) { fin({ error: "GLOBE_SCRIPT_NOT_LOADED" }); }',
    '  else {',
    '    var g = window.KMGlobe.create(document.getElementById("host"), { reducedMotion: true,',
    '      admin1Borders: "auto", admin1Labels: "auto",',
    '      onError: function (k, m) { fin({ error: "GLOBE_" + k, message: String(m || "") }); } });',
    '    if (!g) { fin({ error: "GLOBE_CREATE_NULL" }); }',
    '    else {',
    '      g.resize();',
    '      if (g.setAdmin1Data && window.KM_WORLD_ADMIN1) { try { g.setAdmin1Data(window.KM_WORLD_ADMIN1); } catch (e) {} }',
    // Real time, so the asset load has to be WAITED for rather than assumed drained by a virtual-time budget.
    '      var waited = 0;',
    '      (function waitForAsset() {',
    '        var mi = {};',
    '        try { mi = g.getMaterialInfo(); } catch (e) {}',
    '        var ready = mi && String(mi.stage || "").indexOf("REAL") === 0;',
    '        if (!ready && waited < 60000) { waited += 100; return setTimeout(waitForAsset, 100); }',
    '        run(ready, waited);',
    '      })();',
    '      function run(assetReady, waitedMs) {',
    '        var i = 0;',
    '        (function next() {',
    '          if (i >= SCENES.length) {',
    '            out.ok = true;',
    '            return fin({ asset_ready: assetReady, asset_wait_ms: waitedMs,',
    '                         resource_timing: [resourceTiming("earth-albedo-8192"), resourceTiming("earth-albedo-4096"),',
    '                                           resourceTiming("earth-albedo-2048"), resourceTiming("world-admin1-10m")]',
    '                                          .filter(function (x) { return !!x; }) });',
    '          }',
    '          var s = SCENES[i++];',
    '          g.setAdmin1Layers({ borders: s.admin1 ? "auto" : "off", labels: s.admin1 ? "auto" : "off" });',
    '          g.focus(s.focus[0], s.focus[1], { dist: s.dist });',
    // A settle delay in REAL time, then measure. Without it the first sample carries the tier switch.
    '          setTimeout(function () {',
    '            var perf = {}, topo = {}, mat = {};',
    '            try { perf = g.measureFrames({ samples: SAMPLES }); } catch (e) { perf = { error: String(e && e.message || e) }; }',
    '            try { topo = g.getTopologyInfo(); } catch (e) {}',
    '            try { mat = g.getMaterialInfo(); } catch (e) {}',
    '            out.scenes.push({ id: s.id, requested_dist: s.dist, perf: perf,',
    '              lod: topo && topo.coarse ? undefined : undefined,',
    '              active_set: topo.active_set, phases_ms: topo.phases_ms, frames_drawn: topo.frames_drawn,',
    '              label_counts: topo.label_counts, adm1_strength: topo.adm1_border_strength,',
    '              continent_strength: topo.continent_label_strength,',
    '              classes: topo.active_set === "FINE" ? (topo.fine && topo.fine.classes) : (topo.coarse && topo.coarse.classes),',
    '              tier: mat.tier, gpu_mb: mat.estimated_gpu_mb, renderer: mat.renderer });',
    '            next();',
    '          }, 400);',
    '        })();',
    '      }',
    '    }',
    '  }',
    '} catch (e) { fin({ error: "HARNESS_THROW", message: String(e && e.message || e) }); }',
    '</script></body>'
  ].join('\n');
}

function main() {
  var argv = process.argv.slice(2);
  var asJson = argv.indexOf('--json') !== -1;
  var useGpu = argv.indexOf('--gpu') !== -1;
  var si = argv.indexOf('--samples');
  var samples = si >= 0 && argv[si + 1] ? Math.max(4, Math.min(240, parseInt(argv[si + 1], 10) || 40)) : 40;

  var chrome = findChrome();
  if (!chrome) {
    console.error('NO_BROWSER: set KM_CHROME=<path>. No measurement was taken — do not report one.');
    process.exit(2);
  }
  // Written at the repository ROOT: over file:// from a non-ASCII directory a `../` traversal loads the document
  // but silently fails every relative <script> in it.
  var htmlPath = path.join(ROOT, '.km-perf.html');
  fs.writeFileSync(htmlPath, page(SCENES, samples), 'utf8');
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kmperf-'));

  var args = [
    '--headless=new', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--disable-lcd-text',
    '--allow-file-access-from-files',
    '--enable-logging=stderr', '--v=0', '--log-level=0',
    '--window-size=1280,900'
  ];
  if (useGpu) {
    args.push('--enable-gpu-rasterization');
  } else {
    // The SAME software rasteriser on every machine. NOTE: no --virtual-time-budget anywhere here; that is the
    // whole point of this tool existing separately from the capture harness.
    args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }
  args.push('file:///' + encodeURI(htmlPath.replace(/\\/g, '/')));

  var r = cp.spawnSync(chrome, args, { encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
  try { fs.unlinkSync(htmlPath); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  var blob = String(r.stdout || '') + '\n' + String(r.stderr || '');
  var m = /KMPERF (\{[\s\S]*?\})\s*$/m.exec(blob) || /KMPERF (\{.*\})/.exec(blob);
  if (!m) {
    console.error('NO_MEASUREMENT: the page produced no result. Tail:\n' + blob.slice(-1200));
    process.exit(1);
  }
  var d;
  try { d = JSON.parse(m[1]); } catch (e) { console.error('PARSE_FAILED: ' + m[1].slice(0, 400)); process.exit(1); }
  if (d.error) { console.error('MEASUREMENT FAILED: ' + d.error + ' ' + (d.message || '')); process.exit(1); }

  if (asJson) { console.log(JSON.stringify(d, null, 2)); return 0; }

  var s0 = d.scenes[0] || {};
  console.log('\n§I PERFORMANCE — MEASURED PHASES');
  console.log('renderer : ' + (s0.renderer || 'UNKNOWN'));
  console.log('mode     : ' + (useGpu ? 'Chrome default GPU path' : 'SwiftShader SOFTWARE rasteriser') +
              '  ·  real time (NO virtual-time budget)');
  console.log('samples  : ' + samples + ' frames per scene, pipeline drained with gl.finish() per sample');
  console.log('asset    : ' + (d.asset_ready ? 'real tier active' : 'NOT READY — numbers below are the bootstrap surface') +
              ' after ' + (d.asset_wait_ms || 0) + ' ms');

  if (d.resource_timing && d.resource_timing.length) {
    console.log('\nTEXTURE / ASSET DOWNLOAD (Resource Timing, file:// so transfer is a local read):');
    d.resource_timing.forEach(function (rt) {
      console.log('  ' + rt.name.padEnd(28) + String(rt.encoded_bytes).padStart(9) + ' B   fetch ' +
        String(rt.fetch_ms).padStart(7) + ' ms   ttfb ' + String(rt.ttfb_ms).padStart(6) + ' ms');
    });
  }

  var ph = s0.phases_ms || {};
  console.log('\nONE-OFF PHASES (per globe instance):');
  console.log('  asset fetch+decode (engine)  : ' + JSON.stringify(ph.asset_load_fetch_plus_decode || {}));
  console.log('  GPU upload (texImage2D+mips) : ' + ph.gpu_upload + ' ms');
  console.log('  topology prepare COARSE      : ' + ph.topology_prepare_coarse + ' ms');
  console.log('  topology prepare FINE        : ' + ph.topology_prepare_fine + ' ms');
  console.log('  border buffer upload COARSE  : ' + ph.border_buffer_upload_coarse + ' ms');
  console.log('  border buffer upload FINE    : ' + ph.border_buffer_upload_fine + ' ms');
  console.log('  first render                 : ' + ph.first_render + ' ms');

  console.log('\nSTEADY ROTATE/ZOOM, PER SCENE:');
  console.log('  ' + 'scene'.padEnd(16) + 'set'.padEnd(8) + 'mean'.padStart(8) + 'p50'.padStart(8) +
              'p95'.padStart(8) + 'max'.padStart(8) + '   borderVerts   label ms   labels C/Cont/A');
  d.scenes.forEach(function (s) {
    var p = s.perf || {}, lc = s.label_counts || {};
    console.log('  ' + s.id.padEnd(16) + String(s.active_set || '?').padEnd(8) +
      String(p.mean_ms).padStart(8) + String(p.p50_ms).padStart(8) +
      String(p.p95_ms).padStart(8) + String(p.max_ms).padStart(8) +
      String(p.border_vertices || 0).padStart(14) +
      String((s.phases_ms || {}).label_placement_last_frame).padStart(11) + '   ' +
      (lc.country ? lc.country.drawn + '/' + lc.continent.drawn + '/' + lc.adm1.drawn : '?'));
  });

  console.log('\nGEOMETRY BY CLASS (the active set of the last scene):');
  var last = d.scenes[d.scenes.length - 1] || {};
  Object.keys(last.classes || {}).forEach(function (k) {
    var c = last.classes[k];
    console.log('  ' + k.padEnd(14) + 'edges ' + String(c.edges).padStart(6) + '   segments ' +
      String(c.segments_after_subdivision).padStart(6) + '   vertices ' + String(c.vertices).padStart(7) +
      '   ' + String(Math.round(c.buffer_bytes / 1024)).padStart(5) + ' KB   ' + c.mode +
      (c.width_px ? ' ' + c.width_px + 'px' : ''));
  });
  console.log('\ntier ' + (last.tier || '?') + '   texture memory ' + (last.gpu_mb || '?') + ' MB');
  console.log('\nThese are SOFTWARE-RASTERISER numbers unless the renderer string above names real hardware.');
  return 0;
}

module.exports = { SCENES: SCENES, findChrome: findChrome };

if (require.main === module) process.exit(main());
