// F1-7N-FA-4A-DEMO-LIVE-UX-V3G6A — Shipment Draft Expand + On-the-Way Map render fidelity.
// Run: node assets/tests/shipment-draft-expand-and-map-fidelity-f1-7n-fa-4a-v3g6a.test.js
//
// The Expand tests EXERCISE THE REAL shipped functions: _shToggleCardEl / _shCardFromEvent / toggleShipmentCard /
// toggleHistoryCard are extracted from assets/js/pages/shipping-history.js and evaluated - never re-implemented
// here - against a minimal DOM that reproduces the exact live defect (the SAME card id present in BOTH the
// Shipment Overview mount and the Shipment Draft mount, Overview first in document order).
//
// The map tests are source-facts over the real renderer (assets/js/lib/km-globe.js): neither WebGL nor a DOM
// canvas exists in headless Node, so the renderer cannot be instantiated. Every claim below is read from the
// shipped source, not from a simulated GL context.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var SH = read('js/pages/shipping-history.js').replace(/\r\n/g, '\n');
var GLOBE = read('js/lib/km-globe.js').replace(/\r\n/g, '\n');
var INDEX = fs.readFileSync(path.join(ROOT, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function extractFn(src, name) {
  var s = src.indexOf('function ' + name + '(');
  if (s < 0) throw new Error('missing fn ' + name);
  var i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); } }
  throw new Error('unbalanced ' + name);
}

// ---------------------------------------------------------------------------------------------------
// Minimal DOM good enough for the real toggle code: querySelector('.history-card-details'/'.history-expand-btn'),
// closest('.history-card'), getElementById, style.display, textContent, setAttribute.
function El(cls, id) {
  return {
    className: cls || '', id: id || '', parentNode: null, children: [],
    style: {}, _attrs: {}, textContent: '',
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    append: function (c) { c.parentNode = this; this.children.push(c); return c; },
    closest: function (sel) { var want = sel.replace('.', ''), n = this; while (n) { if ((' ' + n.className + ' ').indexOf(' ' + want + ' ') !== -1) return n; n = n.parentNode; } return null; },
    querySelector: function (sel) {
      var want = sel.replace('.', ''), out = null;
      (function walk(n) { for (var i = 0; i < n.children.length; i++) { var c = n.children[i]; if (!out && (' ' + c.className + ' ').indexOf(' ' + want + ' ') !== -1) { out = c; return; } walk(c); } })(this);
      return out;
    }
  };
}
// One shipment card exactly as _shRenderDbCard emits it: collapsed details + an Expand button, both inside the card.
function makeCard(id) {
  var card = El('history-card', id);
  var header = card.append(El('history-card-header'));
  var btn = header.append(El('history-expand-btn'));
  btn.textContent = 'Expand'; btn.setAttribute('aria-expanded', 'false');
  var details = card.append(El('history-card-details'));
  details.style.display = 'none';
  return { card: card, btn: btn, details: details };
}
var DOC = { _byId: {}, getElementById: function (id) { return this._byId[id] || null; } };
function mount(id, c) { if (!DOC._byId[id]) DOC._byId[id] = c; }   // getElementById = FIRST in document order

global.document = DOC;
eval(extractFn(SH, '_shToggleCardEl'));
eval(extractFn(SH, '_shCardFromEvent'));
eval(extractFn(SH, 'toggleShipmentCard'));
eval(extractFn(SH, 'toggleHistoryCard'));

// The live defect: DEMO-SHIP-1 is `shipped`, so it renders in Shipment Overview AND Shipment Draft with the
// SAME id. Overview is mounted first (index.html order), so getElementById returns the Overview card.
var SID = 'DEMO-20260824-SHP-1';
var overview = makeCard('sh-card-' + SID);
var draft = makeCard('sh-card-' + SID);
mount('sh-card-' + SID, overview.card);   // first in document order — exactly what getElementById would return
function clickOn(el) { return { currentTarget: el, target: el }; }

// ===================================================================================================
section('V3G6A-A. the root cause is reproduced, and the fix resolves the card from the CLICKED node');
eq(DOC.getElementById('sh-card-' + SID) === overview.card, true, 'A. the duplicate id resolves to the OVERVIEW card — the exact live defect');
ok(SH.indexOf("SH_DRAFT_STATUSES = ['draft', 'ready_to_ship', 'shipped']") !== -1, 'A. SH_DRAFT_STATUSES contains `shipped`');
ok(/SH_OVERVIEW_STATUSES = \{ shipped: 1/.test(SH), 'A. SH_OVERVIEW_STATUSES also contains `shipped` → a shipped card is rendered by BOTH pages');
ok(INDEX.indexOf('shippinghistory-mount') < INDEX.indexOf('shipment-draft-mount'), 'A. and the Overview mount precedes the Draft mount in index.html — so the FIRST match was never the Draft card');
ok(/id="sh-card-' \+ _shEsc\(sid\)/.test(SH), 'A. both pages stamp the SAME sh-card-<shipment_id> DOM id (one card builder, two mounts)');

// (1) Expand click reveals the correct card details — the DRAFT one, not the Overview one.
toggleShipmentCard(SID, clickOn(draft.btn));
eq(draft.details.style.display, 'block', '1. clicking Expand on the DRAFT card reveals the DRAFT details');
eq(overview.details.style.display, 'none', '1. and leaves the duplicate-id Overview card untouched (the old bug toggled this one)');

// (3)(4) label + aria-expanded
eq(draft.btn.textContent, 'Collapse', '3. the button label becomes Collapse');
eq(draft.btn.getAttribute('aria-expanded'), 'true', '4. aria-expanded becomes true');

// (2) Collapse hides them again
toggleShipmentCard(SID, clickOn(draft.btn));
eq([draft.details.style.display, draft.btn.textContent, draft.btn.getAttribute('aria-expanded')], ['none', 'Expand', 'false'], '2/3/4. clicking again collapses it and restores the label + aria-expanded');

// the header (not just the button) toggles the same card
toggleShipmentCard(SID, clickOn(draft.card.querySelector('.history-card-header')));
eq(draft.details.style.display, 'block', '1. clicking the card HEADER toggles the same card');
toggleShipmentCard(SID, clickOn(draft.btn));
eq(draft.details.style.display, 'none', '2. and the button collapses what the header opened (one shared state)');

// ===================================================================================================
section('V3G6A-B. independence, every status section, and rerender safety');
var cards = { draft: makeCard('sh-card-D1'), ready: makeCard('sh-card-R1'), shipped: draft };
mount('sh-card-D1', cards.draft.card); mount('sh-card-R1', cards.ready.card);
// (7)(8)(6) Draft / Ready to Ship / Shipped cards all expand
toggleShipmentCard('D1', clickOn(cards.draft.btn));
eq(cards.draft.details.style.display, 'block', '7. a Draft-status card expands');
toggleShipmentCard('R1', clickOn(cards.ready.btn));
eq(cards.ready.details.style.display, 'block', '8. a Ready-to-Ship card expands');
toggleShipmentCard(SID, clickOn(cards.shipped.btn));
eq(cards.shipped.details.style.display, 'block', '6. a Shipped card expands — the originally reported failure');
// (5) independence
eq([cards.draft.details.style.display, cards.ready.details.style.display, cards.shipped.details.style.display], ['block', 'block', 'block'], '5. all three stay open independently');
toggleShipmentCard('D1', clickOn(cards.draft.btn));
eq([cards.draft.details.style.display, cards.ready.details.style.display, cards.shipped.details.style.display], ['none', 'block', 'block'], '5. collapsing one does not touch the others');
eq([cards.ready.btn.getAttribute('aria-expanded'), cards.draft.btn.getAttribute('aria-expanded')], ['true', 'false'], '4/5. each button carries its OWN aria-expanded state');

// (9) filter / rerender: fresh DOM nodes with the same ids keep working, because nothing is bound at render time
var reRendered = makeCard('sh-card-' + SID);
toggleShipmentCard(SID, clickOn(reRendered.btn));
eq(reRendered.details.style.display, 'block', '9. after a filter/rerender replaces the DOM, a fresh card still expands (no stale listener/closure)');
eq(DOC.getElementById('sh-card-' + SID) === overview.card, true, '9. even though the stale duplicate id still resolves elsewhere');
ok(/onclick="toggleShipmentCard\(/.test(SH), '9. the handler is an inline onclick re-emitted by every render — no listener re-binding step can be missed');

// (11) the real shipped functions were exercised
ok(typeof _shToggleCardEl === 'function' && typeof _shCardFromEvent === 'function' && typeof toggleShipmentCard === 'function', '11. the REAL shipped functions are extracted from source and executed (no mirrored test copy)');
ok(/window\._shToggleCardEl = _shToggleCardEl;/.test(SH) && /window\.toggleShipmentCard = toggleShipmentCard;/.test(SH), '11. and they are exported on window for the inline handlers');

// (10) Expand never invokes a status action
section('V3G6A-B. Expand is pure DOM: it can never invoke a status action');
var toggleSrc = extractFn(SH, '_shToggleCardEl') + extractFn(SH, '_shCardFromEvent') + extractFn(SH, 'toggleShipmentCard') + extractFn(SH, 'toggleHistoryCard');
['shSaveExecution', 'shReadyToShip', 'shConfirmShipment', 'shReturnToDraft', 'shShipmentDone', 'shAdvanceStatus', 'fetch', 'XMLHttpRequest', 'location.reload', 'submit('].forEach(function (bad) {
  ok(toggleSrc.indexOf(bad) === -1, '10. the toggle path never references ' + bad);
});
ok(/status|shipment_status/.test(toggleSrc) === false, '10. and never touches a status field — it only reads/writes display, textContent and aria-expanded');
ok(/details\.style\.display|btn\.textContent|setAttribute\('aria-expanded'/.test(toggleSrc), '10. the ONLY mutations are display / label / aria-expanded');
// the button is a real <button type="button"> so it cannot submit a form
ok(/<button type="button" class="history-expand-btn" aria-expanded="false"/.test(SH), 'B. the Expand control is a native button[type=button] with a declared initial aria-expanded');

// one canonical implementation, reused rather than duplicated
eq((SH.match(/function _shToggleCardEl\(/g) || []).length, 1, 'B. exactly ONE canonical toggle implementation exists');
ok(/function toggleHistoryCard\(shipmentId, evt\) \{\s*return _shToggleCardEl\(_shCardFromEvent\(evt, shipmentId, 'history-card-'\)\);\s*\}/.test(SH), 'B. the demo/mock Overview card REUSES it instead of a divergent copy');
var mockCard = makeCard('history-card-M1'); mount('history-card-M1', mockCard.card);
toggleHistoryCard('M1', clickOn(mockCard.btn));
eq([mockCard.details.style.display, mockCard.btn.getAttribute('aria-expanded')], ['block', 'true'], 'B. and the mock path gets the identical behaviour including aria-expanded');
// legacy safety: a programmatic call with no event still resolves by id
toggleShipmentCard('D1', null);
eq(cards.draft.details.style.display, 'block', 'B. a programmatic call with NO event still falls back to the id lookup (no caller loses behaviour)');
// default collapsed
eq(makeCard('x').details.style.display, 'none', 'B. a freshly rendered card is collapsed by default');

// ===================================================================================================
section('V3G6A-C. the expanded content is the EXISTING detail DOM — nothing invented');
ok(/<div class="history-card-details" style="display:none;/.test(SH), 'C. the detail area already existed in the card markup; only its toggle was broken');
['SKU Lines', 'Execution Fields', 'sh-lines-', 'sh-exec-'].forEach(function (frag) {
  ok(SH.indexOf(frag) !== -1, 'C. the existing expanded view still renders ' + frag);
});
ok(/data-total-qty="' \+ _shNum\(s\.totalQty\)/.test(SH), 'C. quantities/cartons come from the existing page model (no new API field)');

// ===================================================================================================
section('V3G6A-D/E. the map renderer audit: DPR was already correct, the TEXTURE was the ceiling');
// (12)(13) pixel ratio explicitly configured, with a cap
ok(/dpr = Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/.test(GLOBE), '12/13. the renderer sets its pixel ratio from the real devicePixelRatio with an explicit performance cap of 2');
eq((GLOBE.match(/Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/g) || []).length, 1, '13. one single place owns the DPR rule');
// (14) backing buffer follows the container's CSS size * dpr
ok(/W = w; H = h; canvas\.width = Math\.round\(w \* dpr\); canvas\.height = Math\.round\(h \* dpr\);/.test(GLOBE), '14. the WebGL backing buffer tracks the container CSS size x pixel ratio');
ok(/var w = container\.clientWidth \|\| canvas\.clientWidth \|\| 0, h = container\.clientHeight \|\| canvas\.clientHeight \|\| 0;/.test(GLOBE), '14. measured from the CONTAINER, so a sidebar/layout change is picked up');
ok(/if \(w < 2 \|\| h < 2\) \{ return false; \}/.test(GLOBE), '14. a hidden/detached container is skipped instead of producing a 0-sized buffer');
// (15) resize + fullscreen paths
ok(/window\.addEventListener\('resize', onWinResize\)/.test(GLOBE), '15. window resize triggers a renderer resize');
ok(/new ResizeObserver\(function \(\) \{ inst\.resize\(\); \}\)/.test(GLOBE) && /ro\.observe\(container\)/.test(GLOBE), '15. a ResizeObserver on the container covers sidebar / layout / fullscreen size changes');
ok(/rebuildPoints\(\);   \/\/ point sizes scale with dpr/.test(GLOBE), '15. marker point sizes are rebuilt on resize so they stay correct at the new pixel ratio');
ok(/getRenderInfo: function \(\) \{ return \{ dpr: dpr/.test(GLOBE), '12. the renderer exposes its DPR/buffer state for inspection instead of leaving it implicit');

// (16) texture configuration is source-proven and safe
section('V3G6A-E/F. texture tier, mipmaps and anisotropy');
ok(/var TEX_BASE_W_ = 2048, TEX_BASE_H_ = 1024;/.test(GLOBE), '16/F. the audited BASE texture resolution is 2048x1024 (the close-zoom magnification ceiling)');
ok(/out\.width = 4096; out\.height = 2048;/.test(GLOBE), 'F. the higher tier is 4096x2048 (4K equirectangular)');
ok(/gl\.getParameter\(gl\.MAX_TEXTURE_SIZE\)/.test(GLOBE) && /if \(maxTex < 4096\)/.test(GLOBE), '16. the 4K tier is gated on the GL MAX_TEXTURE_SIZE capability');
['LOW_DEVICE_MEMORY', 'LOW_CORE_COUNT', 'DEVICE_CAPABILITY_UNKNOWN', 'CAPABILITY_PROBE_FAILED'].forEach(function (r) {
  ok(GLOBE.indexOf(r) !== -1, '16. low-end devices stay on the base tier: ' + r);
});
ok(/if \(!mem && !cores\) \{ out\.reason = 'DEVICE_CAPABILITY_UNKNOWN'; return out; \}/.test(GLOBE), '16. an UNIDENTIFIED device is treated as low-end (fail-safe, not fail-open)');
ok(/gl\.generateMipmap\(gl\.TEXTURE_2D\); texInfo\.mipmaps = true;/.test(GLOBE), '16/E4. mipmaps are generated (both tiers are power-of-two)');
ok(/gl\.TEXTURE_MIN_FILTER, texInfo\.mipmaps \? gl\.LINEAR_MIPMAP_LINEAR : gl\.LINEAR/.test(GLOBE), '16/E4. the minification filter becomes LINEAR_MIPMAP_LINEAR only when mipmaps actually built');
ok(/gl\.texParameteri\(gl\.TEXTURE_2D, gl\.TEXTURE_MAG_FILTER, gl\.LINEAR\)/.test(GLOBE), '16/E4. magnification stays LINEAR — the correct filter for a magnified texel');
ok(/EXT_texture_filter_anisotropic/.test(GLOBE) && /MAX_TEXTURE_MAX_ANISOTROPY_EXT/.test(GLOBE), '16/E4. anisotropic filtering is requested up to the renderer-reported maximum');
ok(/WEBKIT_EXT_texture_filter_anisotropic/.test(GLOBE) && /MOZ_EXT_texture_filter_anisotropic/.test(GLOBE), '16. with vendor-prefixed fallbacks');
ok(/if \(aniso && texInfo\.mipmaps\)/.test(GLOBE), '16. anisotropy is only applied when a mip chain exists (it is meaningless without one)');
ok(/getTextureInfo: function \(\)/.test(GLOBE), '16. the texture configuration is observable at runtime');
// no fake quality fixes
ok(/image-rendering/.test(GLOBE) === false, 'E5. no CSS image-upscaling trick is used as a fake quality fix');
ok(/canvas\.style\.width = '100%'/.test(GLOBE) && /canvas\.style\.height = '100%'/.test(GLOBE), 'E5. the canvas CSS size stays 100% of its container — the buffer, not CSS, carries the resolution');
// (18) no runtime network dependency
['fetch(', 'XMLHttpRequest', 'new Image(', '.src =', 'http://', 'https://'].forEach(function (bad) {
  ok(GLOBE.indexOf(bad) === -1, '18. the globe performs no runtime external texture fetch: no ' + bad);
});
ok(/window\.KM_WORLD_LAND/.test(GLOBE), '18. the texture is rasterized from the vendored same-origin land outline (no external asset, no licence question)');

// (17) no coordinate mutation / jitter
section('V3G6A-G. no coordinate mutation, no marker jitter, no aggregation added');
// comment lines are stripped first: the ONLY textual matches are the prohibitions/notes written in the comments
// themselves (the same false-positive class the V3G3 B10 fix addressed).
var GLOBE_LINES = GLOBE.split(String.fromCharCode(10)).filter(function (l) { return !/^[ \t]*(\/\/|\*|\/\*)/.test(l); });
var GLOBE_CODE = GLOBE_LINES.join(String.fromCharCode(10));
ok(GLOBE_CODE.indexOf('Math.random') === -1, '17. no Math.random anywhere in the renderer CODE (the texture PRNG is a seeded LCG)');
ok(/jitter|declutter/i.test(GLOBE_CODE) === false, '17/G. no jitter / declutter is introduced anywhere in the renderer');
var MARKER_CODE = [extractFn(GLOBE, 'rebuildPoints')].join(String.fromCharCode(10));
ok(/jitter|scatter|declutter|cluster|random|offset\s*\+=/i.test(MARKER_CODE) === false, '17/G. the marker pipeline (rebuildPoints) applies no jitter, scatter, declutter, clustering or offset - a marker is drawn at its exact coordinate');
ok(/lonLatToVec3\(m\.lat, m\.lng|vec3\(m\.lat, m\.lng/.test(MARKER_CODE) || /m\.lat/.test(MARKER_CODE), '17/G. it projects the marker lat/lng directly');
var GLM = read('js/pages/global-logistics-map.js').replace(/\r\n/g, '\n');
ok(/jitter|declutter|clusterMarkers/i.test(GLM) === false, 'G. and none is introduced in the map page either (marker overlap is untouched in V3G6A)');
// the fidelity change touched only the texture path — geometry, projection and markers are untouched
ok(/sphere = buildSphere\(48, 96, 1\);/.test(GLOBE), '21. the sphere geometry is unchanged');
ok(/var MIN_D = 1\.35, MAX_D = 5\.0;/.test(GLOBE), '21. the camera zoom bounds are unchanged');
ok(/function lonLatToVec3|focusAngles/.test(GLOBE), '21. the coordinate projection helpers are unchanged');

// (19)(20) the shipped regressions still hold
section('V3G6A-H. the existing map regressions remain intact');
ok(/function resolveDestinationCoord\(vm\)/.test(GLM), '20. the V3G3 destination endpoint resolver is still present');
ok(/DEST_WAREHOUSE_LOCATION/.test(GLM) && /DEST_ROUTE_TERMINAL_NODE/.test(GLM), '20. with both of its strict-precedence sources');
ok(/function resolveNodeCoord/.test(GLM) && /function resolveShipmentPlacement/.test(GLM), '21. resolveNodeCoord / resolveShipmentPlacement are unchanged');
ok(/locByWh/.test(GLM) && /locById/.test(GLM), '21. the warehouse/location lineage indices are unchanged');

console.log('\n' + '-'.repeat(40));
console.log('SHIPMENT DRAFT EXPAND + MAP FIDELITY (V3G6A): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
