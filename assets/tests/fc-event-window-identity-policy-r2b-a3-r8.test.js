// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R8
// THE EVENT WINDOW IS AN IDENTITY, AND CHANGING IT CREATES — IT DOES NOT MOVE
//
// A3-R7 shipped the guard: the first Save after the dates change on a LOADED event writes nothing
// and states both windows. It left the question the guard exists to ask unanswered, because no
// canonical spec defined what the two offered actions mean. This round freezes that policy and then
// holds the runtime to it.
//
//   WINDOW_CHANGE_SEMANTICS        = CREATE_NEW_IDENTITY_NOT_MOVE
//   EVENT_FC_ID_POLICY             = NEW_WINDOW_GETS_ITS_OWN_EVENT_IDENTITY
//   OLD_EVENT_POLICY               = PRESERVE
//   OLD_CAMPAIGN_POLICY            = PRESERVE
//   EMPTY_CAMPAIGN_AUTO_DELETE     = NO
//   PER_SKU_SHARED_HEADER_MUTATION = FORBIDDEN
//
// The one place A3-R7 did NOT conform: _evtHydrateExisting_ forces single-SKU mode, so the single
// path IS the path a loaded event takes — and _evtDetachAsNewEvent_ blanked the row's ids. Detaching
// onto a window that already held an event for that SKU therefore sent a versionless payload the
// server could still resolve, and 14_ refused it STALE_SPECIAL_EVENT_VERSION rather than updating
// it. Keeping the ids would have been worse: they would have repointed the OTHER window's event.
// _evtSingleRowIdentity_ re-resolves them against the window the form states, which is the only
// thing that can settle the question.
//
// Run: node assets/tests/fc-event-window-identity-policy-r2b-a3-r8.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutants = [], survived = [];
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mutant(l, caught) {
  mutants.push(l);
  if (caught === true) { pass++; console.log('ok   ' + l + ' (caught)'); }
  else { survived.push(l); fail++; console.error('FAIL ' + l + ' — MUTANT SURVIVED'); }
}

var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read('assets/js/pages/fc-summary.js');
var GS14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
var GS20 = read('assets/specs/active/apps-script/20_campaign_write_handlers.gs');
var SPEC = read('docs/planning/FC_SUMMARY_SPEC.md');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = (src.slice(Math.max(0, i - 6), i) === 'async ') ? i - 6 : i;
  var d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
function varSrc(src, name) {
  var m = new RegExp('var ' + name + ' = [\\s\\S]*?;\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
// A mutant whose anchor has drifted injects no fault, and a build with no fault cannot fail.
function faulted(src, from, to, label) {
  var out = src.split(from).join(to);
  if (out === src) throw new Error(label + ' anchor drifted — the mutant would inject nothing');
  return out;
}

// =========================================================================================================
// THE PERSISTED WORLD
// =========================================================================================================
// One SKU on TWO windows, which is the whole point: BFCM is the loaded event, and Prime Day is a
// window that already exists for the same SKU — the case where detaching must UPDATE rather than
// duplicate or be refused. CO1150-B is a sibling on the BFCM campaign, so "unaffected" is checkable.
var EV_BFCM_1100 = { event_fc_id: 'EFC-1100', campaign_id: 'CMP-BFCM26', campaign_sku_line_id: 'CSL-1100',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MKT-1', scope_type: 'sku',
  scope_id: 'CO1100-R', sku: 'CO1100-R', series: 'CO1100', category: 'Cookware', event_name: 'BFCM',
  event_period: '2026-11-19~2026-11-30', event_start_date: '2026-11-19', event_end_date: '2026-11-30',
  event_month: '11', year: '2026', fc_qty: 4200, note: '' };
var EV_BFCM_1150 = { event_fc_id: 'EFC-1150', campaign_id: 'CMP-BFCM26', campaign_sku_line_id: 'CSL-1150',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MKT-1', scope_type: 'sku',
  scope_id: 'CO1150-B', sku: 'CO1150-B', series: 'CO1150', category: 'Cookware', event_name: 'BFCM',
  event_period: '2026-11-19~2026-11-30', event_start_date: '2026-11-19', event_end_date: '2026-11-30',
  event_month: '11', year: '2026', fc_qty: 800, note: '' };
var EV_PRIME_1100 = { event_fc_id: 'EFC-1100P', campaign_id: 'CMP-PRIME26', campaign_sku_line_id: 'CSL-1100P',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MKT-1', scope_type: 'sku',
  scope_id: 'CO1100-R', sku: 'CO1100-R', series: 'CO1100', category: 'Cookware', event_name: 'BFCM',
  event_period: '2026-07-15~2026-07-16', event_start_date: '2026-07-15', event_end_date: '2026-07-16',
  event_month: '7', year: '2026', fc_qty: 999, note: '' };
var ALL_EVENTS = [EV_BFCM_1100, EV_BFCM_1150, EV_PRIME_1100];
var LOADED = { campaignId: 'CMP-BFCM26', campaignVersion: 'CV-BFCM', campaignKnown: true,
  eventName: 'BFCM', startDate: '2026-11-19', endDate: '2026-11-30', year: '2026', lines: {} };

function clone(v) { return JSON.parse(JSON.stringify(v)); }

// =========================================================================================================
// A · THE POLICY IS FROZEN, IN ONE PLACE
// =========================================================================================================
section('A. THE POLICY IS FROZEN, IN ONE PLACE');
ok(/### 10\.1 Event window change — FROZEN \(FC-SUMMARY-R2B-A3-R8/.test(SPEC),
  'A1  FC_SUMMARY_SPEC.md §10.1 owns the window-change contract');
[['WINDOW_CHANGE_SEMANTICS', 'CREATE_NEW_IDENTITY_NOT_MOVE'],
 ['EVENT_FC_ID_POLICY', 'NEW_WINDOW_GETS_ITS_OWN_EVENT_IDENTITY'],
 ['OLD_EVENT_POLICY', 'PRESERVE'],
 ['OLD_CAMPAIGN_POLICY', 'PRESERVE'],
 ['EMPTY_CAMPAIGN_AUTO_DELETE', 'NO'],
 ['PER_SKU_SHARED_HEADER_MUTATION', 'FORBIDDEN']].forEach(function (kv) {
  ok(new RegExp('^' + kv[0] + ' *= *' + kv[1] + '$', 'm').test(SPEC),
    'A2  ' + kv[0] + ' = ' + kv[1] + ' is frozen');
});
ok(/MOVE_EXISTING_EVENT_WINDOW_PRESERVE_LINEAGE/.test(SPEC),
  'A3  and the operation that does NOT exist is named, so its absence is deliberate');
function citesRatherThanCopies(doc) {
  return /CAMPAIGN_PROMOTION_RECORD_CONTRACT\.md` §1\.2/.test(doc)
    && !/^HEADER_IDENTITY_KEY *=/m.test(doc);
}
ok(citesRatherThanCopies(SPEC),
  'A4  Campaign header identity is CITED, not copied — one authority, no second copy to drift');
// The rule lives in exactly one spec. A grep that finds it twice is a duplication, which §6 forbids.
(function () {
  var dir = path.join(REPO, 'docs', 'planning');
  var hits = fs.readdirSync(dir).filter(function (n) {
    return /\.md$/.test(n) && /WINDOW_CHANGE_SEMANTICS/.test(fs.readFileSync(path.join(dir, n), 'utf8'));
  });
  eq(hits, ['FC_SUMMARY_SPEC.md'], 'A5  and it is frozen in exactly ONE planning document');
})();

// =========================================================================================================
// B · THE RESOLVER — which persisted event does a single row address?
// =========================================================================================================
section('B. WHICH PERSISTED EVENT DOES A SINGLE ROW ADDRESS?');
function resolverWorld(opts) {
  opts = opts || {};
  var events = (opts.events === undefined) ? ALL_EVENTS : opts.events;
  var dom = {
    'event-start-date': { value: opts.start === undefined ? '2026-11-19' : opts.start },
    'event-end-date': { value: opts.end === undefined ? '2026-11-30' : opts.end },
    'event-name-input': { value: opts.eventName === undefined ? 'BFCM' : opts.eventName },
    'event-target-year': { value: '2026' }
  };
  var sb = {
    console: console, String: String, Number: Number, Object: Object, Array: Array, JSON: JSON,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, Math: Math,
    document: { getElementById: function (id) { return dom[id] || null; } },
    __dom: dom
  };
  vm.createContext(sb);
  vm.runInContext([
    varSrc(FCS, '_SE_FP_FIELDS_'), varSrc(FCS, '_SE_FP_NUMERIC_'),
    fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'), fnSrc(FCS, '_seFingerprint_'),
    'function _fcResolveMarketplaceKey(v) { return String(v == null ? "" : v).trim(); }',
    'function _evtSelectedSite() { return { company: "ResUS", country: "US", marketplace: "Amazon" }; }',
    'var __events = ' + JSON.stringify((events || []).map(function (r) {
      return { raw: r, campaignId: r.campaign_id, sku: r.sku, company: r.company, country: r.country,
        marketplace: r.marketplace, eventStartDate: r.event_start_date, eventEndDate: r.event_end_date,
        event: r.event_name, year: r.year, eventFcId: r.event_fc_id,
        campaignSkuLineId: r.campaign_sku_line_id, fcQty: parseFloat(r.fc_qty) || 0 };
    })) + ';',
    'function _evtBuilderEventRows_() { return ' + (events === null ? 'null' : '__events') + '; }',
    'var _evtEditing_ = ' + JSON.stringify(opts.editing || null) + ';',
    fnSrc(FCS, '_evtEditingActive_'),
    fnSrc(FCS, '_evtExistingEvents_'),
    fnSrc(FCS, '_evtBaseEventGroup_'),
    fnSrc(FCS, '_evtBaseEventForSku'),
    opts.identitySrc || fnSrc(FCS, '_evtSingleRowIdentity_')
  ].join('\n'), sb);
  return sb;
}
var LOADED_ROW = { sku: 'CO1100-R', eventFcId: 'EFC-1100', campaignSkuLineId: 'CSL-1100', rowVersion: 'V-BFCM' };

(function () {
  // Test 1 / 2 — the window is unchanged and the event is loaded: the hydrated ids stand, untouched.
  var W = resolverWorld({ editing: LOADED });
  var id = W._evtSingleRowIdentity_(LOADED_ROW);
  eq([id.eventFcId, id.campaignSkuLineId, id.rowVersion], ['EFC-1100', 'CSL-1100', 'V-BFCM'],
    'B1  a LOADED row keeps the identity it was hydrated with — event_fc_id preserved');
})();

(function () {
  // Detached onto a window that ALREADY holds this SKU's event: resolve it, so the save updates.
  var W = resolverWorld({ editing: null, start: '2026-07-15', end: '2026-07-16' });
  var id = W._evtSingleRowIdentity_(LOADED_ROW);
  eq(id.eventFcId, 'EFC-1100P', 'B2  detached onto an OCCUPIED window, the row resolves THAT event');
  eq(id.campaignSkuLineId, 'CSL-1100P', 'B2a with that window\'s line');
  eq(id.rowVersion, W._seFingerprint_(EV_PRIME_1100),
    'B2b and that row\'s current version — so the save is an update, not a refusal');
  ok(id.eventFcId !== 'EFC-1100',
    'B2c the ids the row was LOADED with are gone — they would have repointed the BFCM event');
})();

(function () {
  // Detached onto an EMPTY window: nothing to resolve, so the save is a create.
  var W = resolverWorld({ editing: null, start: '2027-01-05', end: '2027-01-09' });
  eq(W._evtSingleRowIdentity_(LOADED_ROW), { eventFcId: '', campaignSkuLineId: '', rowVersion: '' },
    'B3  detached onto an EMPTY window, the row carries nothing — a create, and no stale id');
})();

(function () {
  // An unread model is not an empty one, and must not be read as "no event exists".
  var W = resolverWorld({ editing: null, events: null });
  eq(W._evtSingleRowIdentity_(LOADED_ROW), { eventFcId: '', campaignSkuLineId: '', rowVersion: '' },
    'B4  an UNREAD read model resolves nothing — the server\'s own gate is the backstop, not a guess');
})();

var SAVE = fnSrc(FCS, 'saveEventUpdate');
ok(/var rid = _evtSingleRowIdentity_\(r\);/.test(SAVE)
  && /eventFcId: rid\.eventFcId, campaignSkuLineId: rid\.campaignSkuLineId, rowVersion: rid\.rowVersion/.test(SAVE),
  'B5  and the single-row save composes its line from the RESOLVER, not from the dataset');
var DETACH = fnSrc(FCS, '_evtDetachAsNewEvent_');
ok(!/dataset\.eventFcId = ''/.test(DETACH),
  'B6  Detach no longer blanks the dataset — a constant cannot answer a question only the window can');

// =========================================================================================================
// C · THE FIRST SAVE AFTER A WINDOW CHANGE WRITES NOTHING
// =========================================================================================================
function gateWorld(opts) {
  opts = opts || {};
  var dom = {
    'event-start-date': { value: opts.start || '' },
    'event-end-date': { value: opts.end || '' }
  };
  var sb = {
    console: console, String: String, Object: Object, Array: Array,
    document: { getElementById: function (id) { return dom[id] || null; } },
    alert: function () {}
  };
  vm.createContext(sb);
  vm.runInContext([
    fnSrc(FCS, '_trStrTok_'),
    'var _evtEditing_ = ' + JSON.stringify(opts.editing || null) + ';',
    'var _evtGroups = [];',
    'function _evtSetEditingChrome_() {}',
    'function _evtBuildGroups() {}',
    fnSrc(FCS, '_evtEditingActive_'),
    varSrc(FCS, '_evtWindowChangeAck_'),
    fnSrc(FCS, '_evtWindowKey_'),
    opts.gateSrc || fnSrc(FCS, '_evtWindowChangeGate_'),
    fnSrc(FCS, '_evtClearWindowChangeNotice_'),
    fnSrc(FCS, '_evtRestoreLoadedWindow_'),
    fnSrc(FCS, '_evtDetachAsNewEvent_')
  ].join('\n'), sb);
  return sb;
}

// =========================================================================================================
// THE SERVER MODEL — a MODEL, and every rule it implements is asserted against the real handler
// =========================================================================================================
// It is not the server. It is the smallest thing that can answer "was the old row written to?", and
// each of its four rules is bound below to the source line in 20_ / 14_ that states it. When the
// handler changes and this model does not, the binding assertions fail before the behaviour ones do.
var CAMPAIGN_KEY = ['company', 'country', 'marketplace', 'promotion_type', 'event_flag',
  'start_date', 'end_date'];
var CAMPAIGN_FP = ['campaign_name', 'marketplace_id', 'major_event_flag', 'year', 'duration', 'status'];
function up(v) { return String(v == null ? '' : v).trim().toUpperCase(); }

function serverModel(seed) {
  var db = { campaigns: clone(seed.campaigns), lines: clone(seed.lines), events: clone(seed.events) };
  var writes = [];                       // every mutation, so "unchanged" is observed, not inferred
  var minted = 0;
  function ckey(o) { return CAMPAIGN_KEY.map(function (f) { return up(o[f]); }).join('|'); }
  function cfp(o) { return CAMPAIGN_FP.map(function (f) { return up(o[f]); }).join('|'); }
  function efp(o) { return [up(o.fc_qty), up(o.event_name), up(o.event_month), up(o.year),
    up(o.sku), up(o.note)].join('|'); }
  return {
    db: db, writes: writes,
    upsertCampaign: function (body) {
      var match = null;
      if (body.campaign_id) {
        match = db.campaigns.filter(function (c) { return c.campaign_id === body.campaign_id; })[0] || null;
        if (match) {
          var conflict = CAMPAIGN_KEY.filter(function (f) {
            return Object.prototype.hasOwnProperty.call(body, f) && up(body[f]) && up(body[f]) !== up(match[f]);
          })[0];
          // A campaign's site, type or event window is never silently repointed.
          if (conflict) throw new Error('CAMPAIGN_IDENTITY_MISMATCH: ' + conflict);
        }
      } else {
        match = db.campaigns.filter(function (c) { return ckey(c) === ckey(body); })[0] || null;
      }
      if (match) {
        var incoming = {};
        CAMPAIGN_FP.forEach(function (f) {
          incoming[f] = Object.prototype.hasOwnProperty.call(body, f) ? body[f] : match[f];
        });
        if (cfp(incoming) === cfp(match)) return { campaign_id: match.campaign_id, reused: true, unchanged: true };
        if (!body.expected_row_version) throw new Error('STALE_CAMPAIGN_VERSION');
        CAMPAIGN_FP.forEach(function (f) { if (body.hasOwnProperty(f)) match[f] = body[f]; });
        writes.push({ table: 'campaigns', id: match.campaign_id });
        return { campaign_id: match.campaign_id, updated: true };
      }
      var id = 'CMP-NEW' + (++minted);
      var row = { campaign_id: id };
      CAMPAIGN_KEY.concat(CAMPAIGN_FP).forEach(function (f) { row[f] = body[f]; });
      db.campaigns.push(row); writes.push({ table: 'campaigns', id: id, created: true });
      return { campaign_id: id, created: true };
    },
    upsertCampaignSkuLines: function (body) {
      var out = (body.lines || []).map(function (l) {
        var m = l.campaign_sku_line_id
          ? db.lines.filter(function (x) { return x.campaign_sku_line_id === l.campaign_sku_line_id; })[0]
          : db.lines.filter(function (x) {
              return x.campaign_id === body.campaign_id && up(x.marketplace_sku_id) === up(l.marketplace_sku_id);
            })[0];
        if (m) return { sku: l.sku, campaign_sku_line_id: m.campaign_sku_line_id };
        var id = 'CSL-NEW' + (++minted);
        db.lines.push({ campaign_sku_line_id: id, campaign_id: body.campaign_id,
          marketplace_sku_id: l.marketplace_sku_id, sku: l.sku });
        writes.push({ table: 'campaign_sku_lines', id: id, created: true });
        return { sku: l.sku, campaign_sku_line_id: id };
      });
      return { lines: out };
    },
    upsertFcSpecialEvent: function (body) {
      var target = null;
      if (body.event_fc_id) {
        target = db.events.filter(function (e) { return e.event_fc_id === body.event_fc_id; })[0] || null;
        if (!target) throw new Error('SPECIAL_EVENT_NOT_FOUND');
      }
      if (!target) {
        target = db.events.filter(function (e) {
          if (e.campaign_id !== body.campaign_id) return false;
          if (body.campaign_sku_line_id) return e.campaign_sku_line_id === body.campaign_sku_line_id;
          return up(e.sku) === up(body.sku) && up(e.event_month) === up(body.event_month)
            && up(e.year) === up(body.year);
        })[0] || null;
      }
      if (!target) {
        var id = 'EFC-NEW' + (++minted);
        var row = { event_fc_id: id };
        Object.keys(body).forEach(function (k) { if (k !== 'event_fc_id') row[k] = body[k]; });
        db.events.push(row); writes.push({ table: 'fc_special_events', id: id, created: true });
        return { data: { event_fc_id: id, created: true } };
      }
      if (!body.expected_row_version) throw new Error('STALE_SPECIAL_EVENT_VERSION');
      if (body.expected_row_version !== efp(target)) throw new Error('STALE_SPECIAL_EVENT_VERSION');
      var inc = {};
      ['fc_qty', 'event_name', 'event_month', 'year', 'sku', 'note'].forEach(function (f) {
        inc[f] = Object.prototype.hasOwnProperty.call(body, f) ? body[f] : target[f];
      });
      if (efp(inc) === efp(target)) return { data: { event_fc_id: target.event_fc_id, unchanged: true } };
      Object.keys(body).forEach(function (k) { if (k !== 'event_fc_id') target[k] = body[k]; });
      writes.push({ table: 'fc_special_events', id: target.event_fc_id });
      return { data: { event_fc_id: target.event_fc_id, updated: true } };
    },
    eventVersion: efp
  };
}

// --- the model is bound to the handlers it models ---------------------------------------------------
function keyBindingHolds(key) {
  var real = varSrc(GS20, 'CAMPAIGN_KEY_FIELDS_').match(/'[a-z_]+'/g)
    .map(function (s) { return s.slice(1, -1); });
  return JSON.stringify(key) === JSON.stringify(real);
}
ok(keyBindingHolds(CAMPAIGN_KEY),
  'C0  the model\'s campaign key IS 20_\'s CAMPAIGN_KEY_FIELDS_, field for field');
eq(varSrc(GS20, 'CAMPAIGN_FINGERPRINT_FIELDS_').match(/'[a-z_]+'/g).map(function (s) { return s.slice(1, -1); }),
  CAMPAIGN_FP, 'C0a and its header fingerprint IS CAMPAIGN_FINGERPRINT_FIELDS_');
ok(/never silently repointed/.test(GS20),
  'C0b 20_ really does refuse to repoint a campaign\'s window — CAMPAIGN_IDENTITY_MISMATCH');
ok(/reused: true[\s\S]{0,400}nothing was written/.test(GS20),
  'C0c and really does REUSE an identical header with zero writes');
ok(/STALE_SPECIAL_EVENT_VERSION[\s\S]{0,600}carries no expected version and cannot be applied over one/.test(GS14),
  'C0d 14_ really does refuse a versionless save over an existing event');
ok(/fcSpecialEventFindRowByKey_/.test(GS14) && /primary key: campaign_id \+ campaign_sku_line_id/.test(GS14),
  'C0e and really does resolve by campaign_id + campaign_sku_line_id');

// =========================================================================================================
// THE SAVE WORLD — the real saveEventUpdate over the model
// =========================================================================================================
function saveWorld(opts) {
  opts = opts || {};
  var events = (opts.events === undefined) ? ALL_EVENTS : opts.events;
  var srv = serverModel({
    campaigns: [
      { campaign_id: 'CMP-BFCM26', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        promotion_type: 'BFCM', event_flag: 'BFCM', start_date: '2026-11-19', end_date: '2026-11-30',
        campaign_name: 'BFCM 2026', marketplace_id: 'MKT-1', major_event_flag: 'BFCM', year: 2026,
        duration: '', status: 'active' },
      { campaign_id: 'CMP-PRIME26', company: 'ResUS', country: 'US', marketplace: 'Amazon',
        promotion_type: 'BFCM', event_flag: 'BFCM', start_date: '2026-07-15', end_date: '2026-07-16',
        campaign_name: 'BFCM 2026', marketplace_id: 'MKT-1', major_event_flag: 'BFCM', year: 2026,
        duration: '', status: 'active' }
    ],
    lines: [
      { campaign_sku_line_id: 'CSL-1100', campaign_id: 'CMP-BFCM26', marketplace_sku_id: 'MS-1100', sku: 'CO1100-R' },
      { campaign_sku_line_id: 'CSL-1150', campaign_id: 'CMP-BFCM26', marketplace_sku_id: 'MS-1150', sku: 'CO1150-B' },
      { campaign_sku_line_id: 'CSL-1100P', campaign_id: 'CMP-PRIME26', marketplace_sku_id: 'MS-1100', sku: 'CO1100-R' }
    ],
    events: clone(events || [])
  });
  var alerts = [], notices = [];
  var dom = {
    'event-start-date': { value: opts.start === undefined ? '2026-11-19' : opts.start },
    'event-end-date': { value: opts.end === undefined ? '2026-11-30' : opts.end },
    'event-name-input': { value: 'BFCM' },
    'event-target-year': { value: '2026' },
    'event-country': { value: 'US' },
    'fc-event-builder-save-btn': { disabled: false, textContent: 'Save' }
  };
  var sb = {
    console: console, String: String, Number: Number, Object: Object, Array: Array, JSON: JSON,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat, Math: Math, Error: Error,
    Promise: Promise, setTimeout: setTimeout,
    alert: function (t) { alerts.push(String(t)); },
    confirm: function () { return true; },
    document: { getElementById: function (id) { return dom[id] || null; },
      querySelector: function () { return null; } },
    window: { KM: { DB: {
      upsertCampaign: function (b) { return Promise.resolve(srv.upsertCampaign(b)); },
      upsertCampaignSkuLines: function (b) { return Promise.resolve(srv.upsertCampaignSkuLines(b)); },
      upsertFcSpecialEvent: function (b) { return Promise.resolve(srv.upsertFcSpecialEvent(b)); }
    } } },
    __srv: srv, __alerts: alerts, __notices: notices
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  var rows = (opts.rows || [{ sku: 'CO1100-R', marketplaceSkuId: 'MS-1100', priceState: '', currency: 'USD',
    regularPrice: 100, discountPercent: 20, dealPrice: 80, fcQty: 5000,
    eventFcId: 'EFC-1100', campaignSkuLineId: 'CSL-1100', rowVersion: '' }]);
  // The version a LOADED row carries is the one the model computes for the row it was loaded from,
  // exactly as _seFingerprint_ would over the persisted cells.
  rows.forEach(function (r) {
    if (r.eventFcId && !r.rowVersion) {
      var src = (events || []).filter(function (e) { return e.event_fc_id === r.eventFcId; })[0];
      if (src) r.rowVersion = srv.eventVersion(src);
    }
  });
  vm.runInContext([
    varSrc(FCS, '_SE_FP_FIELDS_'), varSrc(FCS, '_SE_FP_NUMERIC_'),
    fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'),
    // The persisted version token is the MODEL's, so the whole chain speaks one dialect.
    'function _seFingerprint_(row) { return __srv.eventVersion(row); }',
    'var EVT_MAX_ROWS = 8;',
    'function _fcResolveMarketplaceKey(v) { return String(v == null ? "" : v).trim(); }',
    'function _evtSelectedSite() { return { company: "ResUS", country: "US", marketplace: "Amazon" }; }',
    'function _evtResolveMarketplaceId() { return "MKT-1"; }',
    'function _evtComposePeriod(a, b) { return a + "~" + b; }',
    'function _evtEventMonthIdx() { return parseInt(String(__dom_start()).slice(5, 7), 10) - 1; }',
    'function __dom_start() { return document.getElementById("event-start-date").value; }',
    'function _evtMode() { return "single"; }',
    'function _evtValidatePeriod() { return true; }',
    'function _evtShowPeriodError() {}',
    'function _evtClearPeriodError() {}',
    'function _fcDeriveSkuMeta(s) { return { category: "Cookware", series: String(s).slice(0, 6) }; }',
    'var __rows = ' + JSON.stringify(rows) + ';',
    'function _evtReadSingleRows() { return __rows; }',
    'var _evtGroups = [];',
    'var _fcEbStage_ = "", _fcEbCommitted_ = [];',
    'var _fcWriteState_ = {};',
    'var FC_WRITE_ = { SUCCESS: "SUCCESS", UNMOUNTED: "UNMOUNTED" };',
    'var FC_SLICE_ = { EVENTS: "EVENTS" };',
    'var FC_MSG_ = { SAVED: "Saved." };',
    'function _fcWriteBegin_() { return true; }',
    'function _fcWriteEnd_() {}',
    'function _fcEpoch_() { return 1; }',
    'function _fcOwns_() { return true; }',
    'function _fcReceipt_() {}',
    'function _fcAfterWriteScoped_(slice, fn) { fn(); }',
    'function _fcBuilderFailure_(e) { __failure = String(e && e.message || e); }',
    'var __failure = "";',
    'function renderFcEventTable() {}',
    'function closeFcModal() {}',
    'function _evtShowWindowChangeNotice_(g) { __notices.push(g); }',
    'function _evtClearWindowChangeNotice_() {}',
    'var _evtWindowChangeAck_ = ' + JSON.stringify(opts.ack || null) + ';',
    'var _evtEditing_ = ' + JSON.stringify(opts.editing || null) + ';',
    'var __events = ' + JSON.stringify((events || []).map(function (r) {
      return { raw: r, campaignId: r.campaign_id, sku: r.sku, company: r.company, country: r.country,
        marketplace: r.marketplace, eventStartDate: r.event_start_date, eventEndDate: r.event_end_date,
        event: r.event_name, year: r.year, eventFcId: r.event_fc_id,
        campaignSkuLineId: r.campaign_sku_line_id, fcQty: parseFloat(r.fc_qty) || 0 };
    })) + ';',
    'function _evtBuilderEventRows_() { return ' + (events === null ? 'null' : '__events') + '; }',
    fnSrc(FCS, '_evtEditingActive_'),
    fnSrc(FCS, '_evtExistingEvents_'),
    fnSrc(FCS, '_evtBaseEventGroup_'),
    fnSrc(FCS, '_evtBaseEventForSku'),
    fnSrc(FCS, '_evtWindowKey_'),
    fnSrc(FCS, '_evtWindowChangeGate_'),
    opts.identitySrc || fnSrc(FCS, '_evtSingleRowIdentity_'),
    opts.saveSrc || fnSrc(FCS, 'saveEventUpdate')
  ].join('\n'), sb);
  return sb;
}
function failureOf(W) { return vm.runInContext('__failure', W); }

async function main() {
  // -------------------------------------------------------------------------------------------------
  section('C. THE FIRST SAVE AFTER A WINDOW CHANGE WRITES NOTHING');
  // -------------------------------------------------------------------------------------------------
  async function zeroWriteCase(start, end, label, id) {
    var W = saveWorld({ editing: LOADED, start: start, end: end });
    await W.saveEventUpdate();
    eq(W.__srv.writes, [], id + '  ' + label + ' → the first Save writes NOTHING, at any table');
    eq(W.__notices.length, 1, id + 'a and the operator is told, once');
    eq(W.__notices[0].code, 'EVENT_WINDOW_CHANGE_REQUIRES_CONFIRMATION', id + 'b with the typed code');
    eq([W.__notices[0].oldStart, W.__notices[0].oldEnd, W.__notices[0].newStart, W.__notices[0].newEnd],
      ['2026-11-19', '2026-11-30', start, end], id + 'c stating the OLD window and the NEW one');
  }
  await zeroWriteCase('2026-11-20', '2026-11-30', 'a changed START', 'C1');   // test 3
  await zeroWriteCase('2026-11-19', '2026-12-02', 'a changed END', 'C2');     // test 4
  await zeroWriteCase('2026-12-01', '2026-12-05', 'BOTH dates changed', 'C3');// test 5

  // -------------------------------------------------------------------------------------------------
  section('D. THE SAME WINDOW IS AN ORDINARY UPDATE');
  // -------------------------------------------------------------------------------------------------
  await (async function () {
    // tests 1, 2, 18 — the loaded event updates itself, keeps its id, and stays version-protected.
    var W = saveWorld({ editing: LOADED });
    await W.saveEventUpdate();
    eq(failureOf(W), '', 'D1  an unchanged window saves without refusal');
    var ev = W.__srv.db.events.filter(function (e) { return e.event_fc_id === 'EFC-1100'; })[0];
    eq(ev.fc_qty, 5000, 'D1a the loaded event is UPDATED in place');
    eq(W.__srv.db.events.length, 3, 'D1b no fourth event row — the update is not a create');
    eq(ev.event_fc_id, 'EFC-1100', 'D2  and event_fc_id is preserved');
    eq(W.__srv.writes.filter(function (w) { return w.table === 'campaigns'; }), [],
      'D2a the shared campaign header is not written — adding a forecast is not editing the header');
  })();

  await (async function () {
    // test 18 — stale-version protection is untouched by any of this.
    var W = saveWorld({ editing: LOADED,
      rows: [{ sku: 'CO1100-R', marketplaceSkuId: 'MS-1100', priceState: '', currency: 'USD',
        regularPrice: 100, discountPercent: 20, dealPrice: 80, fcQty: 5000,
        eventFcId: 'EFC-1100', campaignSkuLineId: 'CSL-1100', rowVersion: 'STALE-TOKEN' }] });
    await W.saveEventUpdate();
    eq(failureOf(W), 'STALE_SPECIAL_EVENT_VERSION',
      'D3  a stale version is still refused — the round weakened nothing');
    eq(W.__srv.writes.filter(function (w) { return w.table === 'fc_special_events'; }), [],
      'D3a and nothing was written');
  })();

  // -------------------------------------------------------------------------------------------------
  section('E. RESTORE — option 1');
  // -------------------------------------------------------------------------------------------------
  (function () {
    // test 6
    var W = gateWorld({ editing: LOADED, start: '2026-12-01', end: '2026-12-05' });
    W._evtRestoreLoadedWindow_();
    eq([W.document.getElementById('event-start-date').value,
        W.document.getElementById('event-end-date').value], ['2026-11-19', '2026-11-30'],
      'E1  Restore puts the SAVED window back');
    eq(vm.runInContext('_evtEditing_ && _evtEditing_.campaignId', W), 'CMP-BFCM26',
      'E1a and the form stays attached to the loaded event — campaign_id retained');
    eq(W._evtWindowChangeGate_('2026-11-19', '2026-11-30').blocked, false,
      'E1b so the next Save is an ordinary edit');
    eq(vm.runInContext('_evtWindowChangeAck_', W), null,
      'E1c with no acknowledgement left standing');
  })();

  // -------------------------------------------------------------------------------------------------
  section('F. SAVE AS NEW EVENT WINDOW — option 2, a detach and not a migration');
  // -------------------------------------------------------------------------------------------------
  (function () {
    var W = gateWorld({ editing: LOADED, start: '2027-01-05', end: '2027-01-09' });
    W._evtDetachAsNewEvent_();
    eq(vm.runInContext('_evtEditing_', W), null,
      'F1  Detach stops addressing the loaded event — no campaign_id, no header version');
    eq([W.document.getElementById('event-start-date').value,
        W.document.getElementById('event-end-date').value], ['2027-01-05', '2027-01-09'],
      'F1a keeping the window the operator typed');
    eq(W._evtWindowChangeGate_('2027-01-05', '2027-01-09').blocked, false,
      'F1b so the confirmed save proceeds');
  })();

  await (async function () {
    // tests 7, 8, 9, 10, 11, 14, 15, 16, 17 — a NEW window nothing else occupies.
    var W = saveWorld({ editing: null, start: '2027-01-05', end: '2027-01-09',
      ack: { from: '2026-11-19 → 2026-11-30', to: '2027-01-05 → 2027-01-09' } });
    var before = clone(W.__srv.db);
    await W.saveEventUpdate();
    eq(failureOf(W), '', 'F2  the detached save succeeds');
    var oldC = W.__srv.db.campaigns.filter(function (c) { return c.campaign_id === 'CMP-BFCM26'; })[0];
    eq(oldC, before.campaigns.filter(function (c) { return c.campaign_id === 'CMP-BFCM26'; })[0],
      'F3  the OLD campaign header is byte-for-byte unchanged');
    eq(W.__srv.db.lines.filter(function (l) { return l.campaign_sku_line_id === 'CSL-1100'; })[0],
      before.lines.filter(function (l) { return l.campaign_sku_line_id === 'CSL-1100'; })[0],
      'F4  the OLD campaign_sku_line is unchanged');
    eq(W.__srv.db.events.filter(function (e) { return e.event_fc_id === 'EFC-1100'; })[0],
      before.events.filter(function (e) { return e.event_fc_id === 'EFC-1100'; })[0],
      'F5  the OLD fc_special_event is unchanged — its window, its fc_qty, everything');
    ok(W.__srv.db.events.some(function (e) { return e.event_fc_id === 'EFC-1100'; }),
      'F6  and its event_fc_id still names it — nothing was repurposed');
    var created = W.__srv.writes.filter(function (w) { return w.created; });
    eq(created.map(function (w) { return w.table; }),
      ['campaigns', 'campaign_sku_lines', 'fc_special_events'],
      'F7  the new window resolves canonically: campaign, then line, then event');
    var newEv = W.__srv.db.events.filter(function (e) { return e.event_start_date === '2027-01-05'; })[0];
    ok(!!newEv && newEv.event_fc_id !== 'EFC-1100',
      'F8  the new window gets its OWN event identity');
    eq(W.__srv.db.events.filter(function (e) { return e.sku === 'CO1150-B'; })[0].fc_qty, 800,
      'F9  the sibling SKU on the old campaign is untouched');
    eq(W.__srv.db.campaigns.filter(function (c) { return c.campaign_id === 'CMP-BFCM26'; }).length, 1,
      'F10 and no campaign was deleted — an emptied header is never swept');
    eq(W.__srv.writes.filter(function (w) { return w.table === 'campaigns' && !w.created; }), [],
      'F11 no shared campaign header was MUTATED anywhere in the flow');
  })();

  await (async function () {
    // tests 12, 13 — the new window ALREADY exists: reuse the header, update the event, no twin.
    var W = saveWorld({ editing: null, start: '2026-07-15', end: '2026-07-16',
      ack: { from: '2026-11-19 → 2026-11-30', to: '2026-07-15 → 2026-07-16' } });
    var nEvents = W.__srv.db.events.length, nCampaigns = W.__srv.db.campaigns.length;
    await W.saveEventUpdate();
    eq(failureOf(W), '', 'F12 detaching onto an OCCUPIED window is not refused as stale');
    eq(W.__srv.db.campaigns.length, nCampaigns, 'F13 the existing target campaign is REUSED, not twinned');
    eq(W.__srv.writes.filter(function (w) { return w.table === 'campaigns'; }), [],
      'F13a and reusing it writes nothing at all');
    eq(W.__srv.db.events.length, nEvents, 'F14 and no duplicate event is created');
    eq(W.__srv.db.events.filter(function (e) { return e.event_fc_id === 'EFC-1100P'; })[0].fc_qty, 5000,
      'F15 the event that already existed there is UPDATED — resolved, not overwritten blindly');
    eq(W.__srv.db.events.filter(function (e) { return e.event_fc_id === 'EFC-1100'; })[0].fc_qty, 4200,
      'F16 while the event the operator left keeps its own forecast');
  })();

  // -------------------------------------------------------------------------------------------------
  section('G. A3-R7 IS PRESERVED');
  // -------------------------------------------------------------------------------------------------
  (function () {
    // test 19 — Base Event FC still reads the persisted value, and a stored 0 is still a value.
    var W = resolverWorld({ editing: LOADED });
    eq(W._evtBaseEventForSku('CO1100-R').baseEventFc, 4200, 'G1  Base Event FC is unaffected');
    var Z = resolverWorld({ editing: LOADED, events: [
      JSON.parse(JSON.stringify(EV_BFCM_1100)), (function () {
        var z = JSON.parse(JSON.stringify(EV_BFCM_1150)); z.fc_qty = 0; return z; })()] });
    eq(Z._evtBaseEventForSku('CO1150-B').baseEventFc, 0, 'G1a and a stored zero is still a value');
    eq(Z._evtBaseEventForSku('CO9999-X'), null, 'G1b while no persisted event is still null');
  })();
  // test 20 — the expired-delivery-hop recovery is untouched.
  var API = read('assets/js/api/operation-system-db-api.js');
  ok(/REPLAY_SAFE_ON_LOST_DELIVERY_/.test(API) && /REDIRECT_TARGET_NOT_FOUND/.test(API),
    'G2  the A3-R7 redirect recovery is still in the write dispatcher');
  ok(/lostDelivery = !!res && res\.code === 'REDIRECT_TARGET_NOT_FOUND'/.test(API),
    'G2a still gated on the typed code alone');
  ok(/attempt >= 2/.test(API), 'G2b and still capped at ONE extra attempt');
  ok(/var _winGate = _evtWindowChangeGate_\(eventStartDate, eventEndDate\);/.test(SAVE)
    && SAVE.indexOf('_evtWindowChangeGate_') < SAVE.indexOf('DB.upsertCampaign'),
    'G3  the A3-R7 guard still runs BEFORE stage 1');

  // -------------------------------------------------------------------------------------------------
  section('M. MUTANTS');
  // -------------------------------------------------------------------------------------------------
  var IDSRC = fnSrc(FCS, '_evtSingleRowIdentity_');

  mutant('M1  a detached row keeping the ids it was loaded with', await (async function () {
    var f = faulted(IDSRC, '  if (_evtEditingActive_()) {', '  if (true) {', 'M1');
    var W = saveWorld({ editing: null, start: '2026-07-15', end: '2026-07-16', identitySrc: f,
      ack: { from: 'x', to: 'y' } });
    await W.saveEventUpdate();
    // EFC-1100 is the BFCM event; addressed from a July form it would rewrite that event's window.
    var bfcm = W.__srv.db.events.filter(function (e) { return e.event_fc_id === 'EFC-1100'; })[0];
    return failureOf(W) !== '' || bfcm.event_start_date !== '2026-11-19';
  })() === true);

  mutant('M2  a detached row resolving nothing, so an occupied window is refused as stale',
    await (async function () {
      var f = faulted(IDSRC, '  var be = (typeof _evtBaseEventForSku === \'function\') ? _evtBaseEventForSku(r.sku) : null;',
        '  var be = null;', 'M2');
      var W = saveWorld({ editing: null, start: '2026-07-15', end: '2026-07-16', identitySrc: f,
        ack: { from: 'x', to: 'y' } });
      await W.saveEventUpdate();
      return failureOf(W) === 'STALE_SPECIAL_EVENT_VERSION' || W.__srv.db.events.length !== 3;
    })() === true);

  mutant('M3  the resolver dropping the version while keeping the ids', (function () {
    var f = faulted(IDSRC, 'rowVersion: be.rowVersion || \'\'', 'rowVersion: \'\'', 'M3');
    var W = resolverWorld({ editing: null, start: '2026-07-15', end: '2026-07-16', identitySrc: f });
    return W._evtSingleRowIdentity_(LOADED_ROW).rowVersion === '';
  })() === true);

  mutant('M4  the window guard letting the first save through', await (async function () {
    var g = faulted(fnSrc(FCS, '_evtWindowChangeGate_'),
      "  return { blocked: true, code: 'EVENT_WINDOW_CHANGE_REQUIRES_CONFIRMATION',",
      "  return { blocked: false, code: 'EVENT_WINDOW_CHANGE_REQUIRES_CONFIRMATION',", 'M4');
    var W = saveWorld({ editing: LOADED, start: '2026-12-01', end: '2026-12-05' });
    vm.runInContext('_evtWindowChangeGate_ = '
      + g.replace('function _evtWindowChangeGate_', 'function') + ';', W);
    await W.saveEventUpdate();
    return W.__srv.writes.length > 0 || failureOf(W) !== '';
  })() === true);

  mutant('M5  Detach going back to blanking the dataset ids', (function () {
    // The runtime proof is B6; this is its behavioural twin — a blanked row cannot resolve, so the
    // occupied-window save reverts to the refusal A3-R8 exists to remove.
    var f = faulted(IDSRC, '  var be = (typeof _evtBaseEventForSku === \'function\') ? _evtBaseEventForSku(r.sku) : null;\n  if (!be) return { eventFcId: \'\', campaignSkuLineId: \'\', rowVersion: \'\' };',
      '  return { eventFcId: \'\', campaignSkuLineId: \'\', rowVersion: \'\' };\n  var be = null;', 'M5');
    var W = resolverWorld({ editing: null, start: '2026-07-15', end: '2026-07-16', identitySrc: f });
    return W._evtSingleRowIdentity_(LOADED_ROW).eventFcId === '';
  })() === true);

  mutant('M6  the resolver matching on SKU alone, ignoring the window', (function () {
    var g = faulted(fnSrc(FCS, '_evtBaseEventGroup_'),
      "    if (_trStrTok_(g.startDate) !== sd || _trStrTok_(g.endDate) !== ed) return false;", '', 'M6');
    var sb = resolverWorld({ editing: null, start: '2027-01-05', end: '2027-01-09' });
    // Rebuild with the faulted group resolver: an empty 2027 window must stay empty.
    vm.runInContext(g.replace('function _evtBaseEventGroup_', 'function __mutGroup') + ';', sb);
    vm.runInContext('_evtBaseEventGroup_ = __mutGroup;', sb);
    return sb._evtSingleRowIdentity_(LOADED_ROW).eventFcId !== '';
  })() === true);

  mutant('M7  the model\'s campaign key losing the window, so two windows merge', (function () {
    // A model that stopped keying on the window would merge BFCM with Prime Day, and every "old
    // campaign unchanged" assertion in F would then pass for the wrong reason. C0 is what stops
    // that, so the fault goes into the MODEL and C0's own predicate has to reject it.
    return keyBindingHolds(CAMPAIGN_KEY.filter(function (x) {
      return x !== 'start_date' && x !== 'end_date';
    })) === false;
  })() === true);

  mutant('M8  the spec freezing a MOVE instead of a CREATE', (function () {
    var f = faulted(SPEC, 'WINDOW_CHANGE_SEMANTICS         = CREATE_NEW_IDENTITY_NOT_MOVE',
      'WINDOW_CHANGE_SEMANTICS         = MOVE_PRESERVE_LINEAGE', 'M8');
    return !/^WINDOW_CHANGE_SEMANTICS *= *CREATE_NEW_IDENTITY_NOT_MOVE$/m.test(f);
  })() === true);

  mutant('M9  the spec permitting an emptied campaign to be swept', (function () {
    var f = faulted(SPEC, 'EMPTY_CAMPAIGN_AUTO_DELETE      = NO',
      'EMPTY_CAMPAIGN_AUTO_DELETE      = YES', 'M9');
    return !/^EMPTY_CAMPAIGN_AUTO_DELETE *= *NO$/m.test(f);
  })() === true);

  mutant('M10 the spec copying HEADER_IDENTITY_KEY instead of citing it', (function () {
    // A second copy of a key is a second authority, and two authorities drift. A4 is the assertion
    // that forbids the copy, so A4's own predicate has to reject it.
    return citesRatherThanCopies(SPEC + '\n```grouping\nHEADER_IDENTITY_KEY = company | country'
      + ' | marketplace | promotion_type | event_flag | start_date | end_date\n```\n') === false;
  })() === true);

  mutant('M11 the stale-version gate being relaxed for a detached save', await (async function () {
    var W = saveWorld({ editing: null, start: '2026-07-15', end: '2026-07-16',
      ack: { from: 'x', to: 'y' },
      rows: [{ sku: 'CO1100-R', marketplaceSkuId: 'MS-1100', priceState: '', currency: 'USD',
        regularPrice: 100, discountPercent: 20, dealPrice: 80, fcQty: 5000,
        eventFcId: '', campaignSkuLineId: '', rowVersion: '' }],
      identitySrc: faulted(IDSRC, 'rowVersion: be.rowVersion || \'\'', 'rowVersion: \'\'', 'M11') });
    await W.saveEventUpdate();
    return failureOf(W) === 'STALE_SPECIAL_EVENT_VERSION';
  })() === true);

  mutant('M12 the guard moving to AFTER stage 1', (function () {
    var f = faulted(SAVE, '  var _winGate = _evtWindowChangeGate_(eventStartDate, eventEndDate);', '', 'M12');
    return !/var _winGate = _evtWindowChangeGate_/.test(f)
      || f.indexOf('_evtWindowChangeGate_') > f.indexOf('DB.upsertCampaign');
  })() === true);

  // -------------------------------------------------------------------------------------------------
  section('H. VACUITY — the unfaulted tree behaves as the mutants assume');
  // -------------------------------------------------------------------------------------------------
  await (async function () {
    var W = saveWorld({ editing: null, start: '2026-07-15', end: '2026-07-16', ack: { from: 'x', to: 'y' } });
    await W.saveEventUpdate();
    ok(failureOf(W) === '' && W.__srv.db.events.length === 3,
      'H1  the real detached save onto an occupied window really does succeed without duplicating, so M1/M2 can fail');
  })();
  (function () {
    var W = resolverWorld({ editing: null, start: '2027-01-05', end: '2027-01-09' });
    ok(W._evtSingleRowIdentity_(LOADED_ROW).eventFcId === '',
      'H2  and an empty window really does resolve nothing, so M6 can fail');
    var O = resolverWorld({ editing: null, start: '2026-07-15', end: '2026-07-16' });
    ok(O._evtSingleRowIdentity_(LOADED_ROW).rowVersion !== '',
      'H3  while an occupied one really does carry a version, so M3/M11 can fail');
  })();
}

main().then(function () {
  console.log('\n' + new Array(101).join('='));
  console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail
    + ' failed, ' + mutants.length + ' mutants, ' + survived.length + ' survived');
  console.log(new Array(101).join('='));
  process.exit((fail === 0 && survived.length === 0) ? 0 : 1);
}, function (e) { console.error(e && e.stack || e); process.exit(1); });
