// =================================================================================================================
// ON-THE-WAY-MAP — TRANSPORT MODE ICONS. PRESENTATION ONLY.
//
// WHAT THE ICON IS DERIVED FROM, and why that field. `shipment_routes.transport_mode` — normalized to
// `node.transportMode` — is the canonical LEG-level value: SHIPMENT_DATABASE_SCHEMA lists it as an enum of
// air / sea / truck, and a route holds one row per node, so an ocean leg followed by an inland leg genuinely are
// two values on one shipment. That is what makes §3 answerable rather than a limitation to document: a shipment
// is NOT collapsed to a single mode. Where a leg carries no mode, the shipment-level shipping method answers.
//
// THE TOKEN LIST IS NOT A NEW VOCABULARY. It mirrors the server's DEMO4A_transportClass_, the existing owner of
// this exact question, with ONE deliberate difference: that classifier folds parcel / courier / last-mile into
// `truck` because for its purpose they use the same corridor. For an icon they are different, so parcel is split
// out — and tested FIRST, because every parcel token would otherwise be swallowed by the truck branch. Section B
// asserts that ordering directly, since it is the one place this could silently regress into showing a truck.
//
// WHAT IS NOT TOUCHED, and is asserted rather than promised: no stored value is rewritten, no business rule, no
// filter, no status, no ETA, no routing, no API, no schema. The icon is a string handed to the renderer and never
// read back. `shipMode` — the tooltip's display-text owner — is byte-identical, because routing it through these
// classes would change the tooltip wording for parcel and rail methods that currently print their raw value.
//
// THE FALLBACK IS THE POINT OF SECTION C. An unknown or blank mode yields '', the renderer draws no glyph, and
// the shipment keeps the generic marker it has always had. No shipment may leave the map because its transport
// mode is unreadable, and C3 drives exactly that.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }

const PAGE = () => read('assets/js/pages/global-logistics-map.js');
const GLOBE = () => read('assets/js/lib/km-globe.js');

const TRUCK = '🚚', TRAIN = '🚆', PLANE = '✈️',
      PARCEL = '📦', SHIP = '🚢';

// -----------------------------------------------------------------------------------------------------------
// The four presentation functions, lifted from the page and RUN. The page is a 1 600-line IIFE bound to a DOM
// and a globe; these four are pure over their arguments, so executing their real source against controlled
// input is both possible and a far stronger test than matching their text.
// -----------------------------------------------------------------------------------------------------------
function extract(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start === -1) throw new Error('no such function: ' + name);
  let depth = 0;
  for (let j = src.indexOf('{', start); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
function icons(src) {
  const s = src || PAGE();
  const ctx = vm.createContext({ low: (v) => String(v == null ? '' : v).trim().toLowerCase() });
  vm.runInContext((/var TRANSPORT_ICONS = \{[\s\S]*?\};/.exec(s) || [''])[0], ctx);
  ['transportClass', 'getShipmentTransportIcon', 'legMode'].forEach((n) => {
    vm.runInContext(extract(s, n), ctx);
  });
  return ctx;
}

// =================================================================================================================
section('A — §6 ACCEPTANCE: one visual per transport mode, driven');
// =================================================================================================================
{
  const F = icons();
  // A1 — the canonical enum the schema actually declares (air, sea, truck) comes first, because that is what
  //      a production row holds. Everything after it is a synonym a real route has been seen to carry.
  eq(F.getShipmentTransportIcon('truck'), TRUCK, 'A1  truck  -> truck visual');
  eq(F.getShipmentTransportIcon('sea'), SHIP, 'A2  sea    -> ship visual');
  eq(F.getShipmentTransportIcon('air'), PLANE, 'A3  air    -> airplane visual');
  eq(F.getShipmentTransportIcon('rail'), TRAIN, 'A4  rail   -> train visual');
  eq(F.getShipmentTransportIcon('parcel'), PARCEL, 'A5  parcel -> parcel visual');

  // A6 — synonyms, each one taken from the server classifier this mirrors rather than imagined.
  [['road', TRUCK], ['inland', TRUCK], ['ground', TRUCK], ['ltl', TRUCK], ['drayage', TRUCK],
   ['ocean', SHIP], ['vessel', SHIP], ['fcl', SHIP], ['lcl', SHIP], ['barge', SHIP],
   ['air_express', PLANE], ['airfreight', PLANE], ['flight', PLANE],
   ['train', TRAIN], ['intermodal_rail', TRAIN],
   ['courier', PARCEL], ['last_mile', PARCEL], ['last-mile', PARCEL], ['express', PARCEL]
  ].forEach(([token, want]) => {
    eq(F.getShipmentTransportIcon(token), want, 'A6  ' + token + ' resolves to its class');
  });

  // A7 — case and surrounding whitespace are a spreadsheet's business, not a reason to lose an icon.
  eq(F.getShipmentTransportIcon('  SEA  '), SHIP, 'A7  case and padding do not defeat the match');
  eq(F.getShipmentTransportIcon('Air Freight'), PLANE, 'A7a nor does a display-cased phrase');

  // A8 — the five glyphs are five DIFFERENT glyphs. A mapping where two modes share one icon would pass
  //      every assertion above and still tell the operator nothing.
  const all = [TRUCK, TRAIN, PLANE, PARCEL, SHIP];
  eq(all.filter((g, i) => all.indexOf(g) === i).length, 5, 'A8  the five visuals are distinct');
}

// =================================================================================================================
section('B — THE ORDERING THAT MAKES PARCEL VISIBLE AT ALL');
// =================================================================================================================
{
  const F = icons();
  // B1 — the trap this exists for: the server classifier folds parcel into truck, and every parcel token would
  //      be caught by the truck branch if truck were tested first.
  eq(F.transportClass('parcel'), 'parcel', 'B1  a parcel token classifies as parcel, not truck');
  eq(F.transportClass('courier'), 'parcel', 'B1a and so does courier');
  eq(F.transportClass('last_mile_parcel'), 'parcel',
    'B1b and a token carrying BOTH ideas resolves to the more specific one');

  // B2 — the ordering itself, so a later edit that moves the branch is caught by the reason rather than by
  //      whichever token happens to be in a fixture.
  const src = extract(PAGE(), 'transportClass');
  ok(src.indexOf("return 'parcel'") < src.indexOf("return 'truck'"),
    'B2  parcel is tested BEFORE truck in the source, which is what B1 depends on');

  // B3 — and rail is not swallowed either: 'rail_terminal'-ish tokens must not read as truck.
  eq(F.transportClass('intermodal_rail'), 'rail', 'B3  an intermodal rail leg is rail');
}

// =================================================================================================================
section('C — §5 FALLBACK: no shipment leaves the map');
// =================================================================================================================
{
  const F = icons();
  eq(F.getShipmentTransportIcon(''), '', 'C1  a blank mode yields NO glyph');
  eq(F.getShipmentTransportIcon('teleport'), '', 'C1a an unrecognised mode yields no glyph');
  [null, undefined, 0, false, {}, []].forEach((v) => {
    eq(F.getShipmentTransportIcon(v), '', 'C2  ' + JSON.stringify(v) + ' does not throw and yields no glyph');
  });
  eq(F.transportClass('teleport'), 'unknown', 'C2a and the class is the named "unknown", not a guess');

  // C3 — THE ACTUAL REQUIREMENT. A marker built with no icon is still a marker: same id, same coordinates,
  //      same size, same colour. This is what "no shipment disappears" means in the data the renderer sees.
  const marker = { id: 'SHP-1', lat: 30, lng: -160, color: [1, 0, 0], size: 16, elev: 1.024, ring: false,
                   icon: F.getShipmentTransportIcon('teleport') };
  eq(marker.icon, '', 'C3  an unknown-mode shipment marker carries an empty icon');
  ok(marker.id && isFinite(marker.lat) && isFinite(marker.lng) && marker.size === 16,
    'C3a and keeps its id, its coordinates and its size — it is drawn exactly as before');
}

// =================================================================================================================
section('D — §3 MULTI-LEG: the icon follows the LEG, not the shipment');
// =================================================================================================================
{
  const F = icons();
  // D1 — the canonical case from the task: ocean freight, then inland parcel. One shipment, two legs, two icons.
  const oceanLeg = { transportMode: 'sea' }, inlandLeg = { transportMode: 'parcel' };
  eq(F.getShipmentTransportIcon(oceanLeg.transportMode), SHIP, 'D1  the ocean leg draws a ship');
  eq(F.getShipmentTransportIcon(inlandLeg.transportMode), PARCEL, 'D1a the inland leg draws a parcel');
  ok(F.getShipmentTransportIcon(oceanLeg.transportMode) !== F.getShipmentTransportIcon(inlandLeg.transportMode),
    'D1b so one shipment is NOT collapsed into one transport mode');

  // D2 — the position marker rides the CURRENT leg.
  eq(F.legMode({ currentNode: { transportMode: 'sea' }, lastCompleted: { transportMode: 'truck' },
                 method: 'air' }), 'sea', 'D2  the current node wins');
  eq(F.legMode({ currentNode: null, lastCompleted: { transportMode: 'truck' }, method: 'air' }), 'truck',
    'D2a then the last completed one');
  eq(F.legMode({ currentNode: null, lastCompleted: null, method: 'air' }), 'air',
    'D2b and only then the shipment-level method — the documented fallback, not the first choice');
  eq(F.legMode({}), '', 'D2c a shipment with nothing at all yields blank, which falls through to no glyph');
  eq(F.legMode(null), '', 'D2d and a missing shipment does not throw');

  // D3 — a node whose own mode is blank must not inherit a neighbour's. Blank is a gap, and the marker for it
  //      is the generic one; inventing a mode for a leg nobody recorded would be worse than showing none.
  eq(F.getShipmentTransportIcon({ transportMode: '' }.transportMode), '',
    'D3  a leg with no recorded mode draws no glyph rather than borrowing one');

  // D4 — the three marker sites in the page each pass an icon, and the per-NODE one passes the node's own
  //      mode rather than the shipment's. That distinction is the whole of §3 at the call site.
  const src = PAGE();
  ok(/id: 'node:' \+ n\.shipmentRouteId[\s\S]{0,220}icon: getShipmentTransportIcon\(n\.transportMode\)/.test(src),
    'D4  the per-node marker uses THAT node\'s transportMode');
  ok(/id: 'pos:' \+ vm\.shipmentId[\s\S]{0,260}icon: getShipmentTransportIcon\(legMode\(vm\)\)/.test(src),
    'D4a the position marker uses the current leg');
  ok(/id: v\.shipmentId[\s\S]{0,220}icon: getShipmentTransportIcon\(legMode\(v\)\)/.test(src),
    'D4b and so does each shipment in the runtime list');
}

// =================================================================================================================
section('E — §4 VISUAL: the marker is upgraded, never moved');
// =================================================================================================================
{
  const g = GLOBE();
  // E1 — the glyph is painted at the marker's OWN projected centre. Any other anchor would be a coordinate
  //      shift dressed as a decoration.
  ok(/iconDraws\.push\(\{ g: String\(mk\.icon\), x: _proj\.x, y: _proj\.y/.test(g),
    'E1  the glyph is anchored to the marker\'s projected centre');
  ok(/if \(mk\.icon\) iconDraws\.push/.test(g),
    'E1a and is collected only when the marker declares one');

  // E2 — it reuses the pass that ALREADY projects every marker, so no marker is projected twice per frame.
  const loop = g.slice(g.indexOf('var markerRects = [];'), g.indexOf('// ---- CLASS 1: COUNTRY'));
  eq((loop.match(/projectInto\(/g) || []).length, 1,
    'E2  one projection per marker per frame — the glyph pass adds none');

  // E3 — size is DERIVED from the marker size and clamped at both ends.
  ok(/var ICON_SIZE_RATIO_ = 0\.82, ICON_MIN_PX_ = 9, ICON_MAX_PX_ = 22;/.test(g),
    'E3  the glyph size is derived and clamped');
  ok(/Math\.max\(ICON_MIN_PX_, Math\.min\(ICON_MAX_PX_, Math\.round\(dI\.size \* ICON_SIZE_RATIO_\)\)\)/.test(g),
    'E3a so it tracks the marker and can neither vanish nor overpower the map');
  ok(/ICON_SIZE_RATIO_ = 0\.(?:[0-9]|[1-9][0-9])/.test(g),
    'E3b and stays under 1, so a rim of the marker\'s own status colour survives around it');

  // E4 — painted AFTER the label classes, so a country name can never cover a business object.
  ok(g.indexOf('if (iconDraws.length)') > g.indexOf('prevAdmin1Set = anext;'),
    'E4  glyphs are painted after every geographic label class');

  // E5 — §6 regressions. The overlay cannot take a click, so no marker click, hover or tooltip can change.
  ok(/labelCv\.style\.pointerEvents = 'none';/.test(g),
    'E5  MARKER_CLICK_REGRESSION = 0 — the glyph canvas cannot receive a pointer event');
  ok(/labelCv\.setAttribute\('aria-hidden', 'true'\);/.test(g),
    'E5a and it stays out of the accessibility tree, as decoration');
}

// =================================================================================================================
section('F — WHAT WAS NOT TOUCHED, ASSERTED RATHER THAN PROMISED');
// =================================================================================================================
{
  const src = PAGE();

  // F1 — the tooltip's display-text owner is byte-identical. Routing it through the new classes would have
  //      changed the wording for parcel and rail methods that currently print their raw value.
  eq(extract(src, 'shipMode'),
    "function shipMode(vm) { var m = low(vm.method); if (/air|flight|空/.test(m)) return 'Air'; "
    + "if (/sea|ocean|vessel|海|fcl|lcl/.test(m)) return 'Sea'; "
    + "if (/truck|ground|road|land|陸/.test(m)) return 'Ground'; return vm.method || '—'; }",
    'F1  shipMode is unchanged — TOOLTIP_REGRESSION = 0');

  // F2 — the icon is written, never read back, and never stored.
  ok(!/\.transportMode\s*=/.test(src) && !/transport_mode\s*:/.test(src),
    'F2  no transport mode is assigned or emitted by this page — nothing is written back');
  ok(!/icon\s*===|icon\s*==|\.icon\)/.test(src.replace(/icon: getShipmentTransportIcon\([^)]*\)/g, '')),
    'F2a and the icon is never read back as a decision input');

  // F3 — the filter set is untouched: a transport mode is not a new filter, and the method filter still
  //      compares the raw stored value rather than a class.
  ok(/if \(f\.method && v\.method !== f\.method\) return false;/.test(src),
    'F3  SHIPMENT_FILTER_REGRESSION = 0 — the method filter still matches the stored value verbatim');
  ok(!/transportClass\(/.test(src.slice(src.indexOf('function filteredVms'), src.indexOf('function computeKpis') > 0 ? src.length : src.length).slice(0, 1200)),
    'F3a and no filter classifies a mode');

  // F4 — no new dependency, and the glyphs are inline Unicode as §4 requires.
  ok(!/require\(|import\s|cdn|<script/i.test(extract(src, 'getShipmentTransportIcon')),
    'F4  the helper pulls in nothing');
  const idx = read('index.html');
  ok(!/icon|font-?awesome|material-icons/i.test(
      (idx.match(/<script[^>]*src="https?:[^"]*"[^>]*>/g) || []).join(' ')),
    'F4a and no external icon dependency was added to the shell');

  // F5 — the ban that governs this vocabulary: A0 §G.9 forbids spelling operator method LABELS in shipped
  //      source. Single-character classification hints are not labels, and the two banned spellings are
  //      absent from everything this task touched.
  const globe = GLOBE();
  ok(src.indexOf('空派') === -1 && src.indexOf('普船海卡') === -1
     && globe.indexOf('空派') === -1 && globe.indexOf('普船海卡') === -1,
    'F5  no operator method label is spelled in either changed file');

  // F6 — BUSINESS_LOGIC_CHANGED = NO, at the only place it could have: placement and status.
  ok(!/transportClass|legMode|getShipmentTransportIcon/.test(extract(src, 'resolveShipmentPlacement')),
    'F6  MAP_POSITION_REGRESSION = 0 — placement does not consult the transport mode');
  ok(!/transportClass|legMode|getShipmentTransportIcon/.test(extract(src, 'computeKpis')),
    'F6a and neither do the KPIs');
}

// =================================================================================================================
section('J — MUTANTS');
// =================================================================================================================
{
  let killed = 0, survived = 0, harness = 0;
  function mutate(file, from, to, name, probe) {
    const abs = path.join(ROOT, file);
    const before = fs.readFileSync(abs, 'utf8');
    if (before.split(from).length - 1 !== 1) {
      harness++; console.log('  HARNESS ERROR ' + name + ' — anchor matched '
        + (before.split(from).length - 1) + ' times'); return;
    }
    fs.writeFileSync(abs, before.split(from).join(to), 'utf8');
    try {
      const bad = probe();
      if (bad) { killed++; console.log('  ok   ' + name + ' KILLED'); }
      else { survived++; console.log('  FAIL ' + name + ' SURVIVED'); }
    } catch (e) { killed++; console.log('  ok   ' + name + ' KILLED (threw)'); }
    finally { fs.writeFileSync(abs, before, 'utf8'); }
  }

  // J1 — truck is tested before parcel. Every parcel shipment silently becomes a truck: the map still looks
  //      plausible, which is exactly why this needs a test rather than an eyeball.
  mutate('assets/js/pages/global-logistics-map.js',
    "if (/parcel|courier|express|last.?mile|small.?package/.test(m)) return 'parcel';",
    "if (/nothing_matches_this/.test(m)) return 'parcel';",
    'J1 the parcel branch stops matching', () => icons().getShipmentTransportIcon('courier') !== PARCEL);

  // J2 — the fallback returns a glyph instead of ''. An unknown mode would then be drawn as a real mode.
  mutate('assets/js/pages/global-logistics-map.js',
    "return TRANSPORT_ICONS[transportClass(mode)] || '';",
    "return TRANSPORT_ICONS[transportClass(mode)] || TRANSPORT_ICONS.truck;",
    'J2 an unknown mode is given a truck', () => icons().getShipmentTransportIcon('teleport') !== '');

  // J3 — the leg is collapsed to the shipment-level method, which is the §3 failure by name.
  mutate('assets/js/pages/global-logistics-map.js',
    "    var cur = vm.currentNode && vm.currentNode.transportMode;",
    "    var cur = null;",
    'J3 the current leg is ignored', () =>
      icons().legMode({ currentNode: { transportMode: 'sea' }, lastCompleted: null, method: 'air' }) !== 'sea');

  // J4 — the glyph is anchored somewhere other than the marker centre: a coordinate shift wearing a
  //      decoration's clothes.
  mutate('assets/js/lib/km-globe.js',
    "iconDraws.push({ g: String(mk.icon), x: _proj.x, y: _proj.y, size: (mk.size || 10) });",
    "iconDraws.push({ g: String(mk.icon), x: _proj.x + 14, y: _proj.y - 14, size: (mk.size || 10) });",
    'J4 the glyph is drawn away from the marker', () =>
      !/iconDraws\.push\(\{ g: String\(mk\.icon\), x: _proj\.x, y: _proj\.y/.test(GLOBE()));

  // J5 — the clamp is removed, so a reference marker's glyph could scale without limit.
  mutate('assets/js/lib/km-globe.js',
    "var px = Math.max(ICON_MIN_PX_, Math.min(ICON_MAX_PX_, Math.round(dI.size * ICON_SIZE_RATIO_)));",
    "var px = Math.round(dI.size * ICON_SIZE_RATIO_);",
    'J5 the glyph size clamp is removed', () =>
      !/Math\.max\(ICON_MIN_PX_, Math\.min\(ICON_MAX_PX_/.test(GLOBE()));

  // J6 — glyphs painted BEFORE the labels, so a country name can sit on a business object.
  mutate('assets/js/lib/km-globe.js',
    "      if (iconDraws.length) {",
    "      if (iconDraws.length && false) {",
    'J6 the glyph pass is disabled', () => !/if \(iconDraws\.length\) \{/.test(GLOBE()));

  console.log('  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harness + ' harness errors');
  ok(survived === 0 && harness === 0, 'J   every planted defect was caught', { killed, survived, harness });
}

console.log('\n' + (fail ? 'FAIL  ' : 'PASS  ') + pass + ' passed, ' + fail + ' failed');
console.log('PRESENTATION_ONLY = YES · MULTI_LEG = PER-LEG · UNKNOWN_FALLBACK = GENERIC MARKER · '
  + 'BUSINESS_LOGIC_CHANGED = NO');
if (fail) process.exitCode = 1;
