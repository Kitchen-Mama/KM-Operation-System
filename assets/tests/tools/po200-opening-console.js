// PO200 - console helper for the native 200-row test in the ISOLATED SANDBOX page. Paste the whole file into the browser console.
//
// WHY: the internal mode OPENING_PO_FOR_EXISTING_STOCK is deliberately not offered by the page, and the page has no control that
// exports existing PO lines for a New receipt. This helper reaches both through what the page already exposes
// (KM.DB.importTemplateGet / importValidate / importCommit, KM.importBatch, KM.templateExport) and through nothing else.
//
// RULES IT KEEPS
//   - nothing is written unless the operator calls commitStock() or commitOpening() by hand; the plan functions only validate
//   - the plan functions refuse without { iUnderstandThisIsTheIsolatedSandbox: true } and before check() has shown the four installed values
//   - a batch id is FIXED by the run tag: a repeat is a replay answered from the receipt, never a second write, never a new id
//   - any answer that is not a plain success is printed in full and the helper HALTS: no commit, no plan, no resend until the page is reloaded
//   - it prints facts (limits, counts, metrics, whether KM.DB.envId exists and its value); it never prints an address and never decides
//     that an environment is the Sandbox - the operator does
//
//   po200Opening.check()                                              read-only: the installed limits and builds
//   po200Opening.watch() / .unwatch() / .log()                        read-only tap: prints seconds and metrics of every Validate / Commit the page sends
//   po200Opening.exportExisting({ factory, mode })                    read-only: downloads the existing PO lines for 'NEW_RECEIPT' (case 07)
//   po200Opening.planStock({ factory, skus, qty, tag, iUnderstandThisIsTheIsolatedSandbox: true })   then   po200Opening.commitStock()
//   po200Opening.planOpening({ factory, company, tag, orderDate, iUnderstandThisIsTheIsolatedSandbox: true })   then   po200Opening.commitOpening()
//   po200Opening.status()
(function () {
  'use strict';
  var VERSION = 'po200-opening-console/1', MAX_ROWS = 200, FLAG = 'iUnderstandThisIsTheIsolatedSandbox', OPENING = 'OPENING_PO_FOR_EXISTING_STOCK', OPENING_POS = 8;
  var EXPECTED = { max_rows: 200, pfi_build: 'PFI1-R2-SBX-20261111-AF1-IU1-IU2-IU4-PG12R3-JR4-PO200', pfa_build: 'FACTORY-ATOMIC-2-20261127-PO200', pfa_max_bytes: 8000000 };
  var STOP = 'STOP. Do not resend. Do not change the batch id or the tag. Record what is printed above, read the receipt of this batch (History tab of the import dialog) and hand it to the reviewer. ' +
    'This helper will not plan or commit anything else until the page is reloaded.';
  if (window.po200Opening && window.po200Opening.version) { console.log('[po200] already loaded (' + window.po200Opening.version + '): the state of this session is kept, nothing was replaced.'); return; }

  var S = { halted: '', checked: false, limits: null, stock: null, opening: null, skus: null, factory: '', log: [], taps: null };
  function say() { console.log.apply(console, ['[po200]'].concat(Array.prototype.slice.call(arguments))); }
  function full(label, answer) { var t; try { t = JSON.stringify(answer, null, 1); } catch (e) { t = String(answer); } console.log('[po200] ' + label + ' - FULL ANSWER:\n' + t); }
  function refuse(message) { say('REFUSED: ' + message); var e = new Error('PO200 REFUSED: ' + message); e.po200Refusal = true; throw e; }
  function halt(why, answer) { S.halted = why; full(why, answer); say(STOP); return { ok: false, halted: true, reason: why, answer: answer }; }
  function db() {
    var d = window.KM && window.KM.DB;
    if (!d || ['importTemplateGet', 'importValidate', 'importCommit'].some(function (k) { return typeof d[k] !== 'function'; })) refuse('this page does not expose KM.DB.importTemplateGet / importValidate / importCommit. Open the Purchase Order page of the isolated Sandbox first.');
    return d;
  }
  function envFacts() {
    var d = window.KM && window.KM.DB, has = !!(d && typeof d.envId === 'function'), value = '';
    if (has) { try { value = String(d.envId() || ''); } catch (e) { value = '(envId() threw)'; } }
    return { envId_present: has, envId_value: value };
  }
  function printEnv() { var e = envFacts(); say('ENVIRONMENT (printed, not judged): KM.DB.envId present = ' + e.envId_present + (e.envId_present ? ', value = "' + e.envId_value + '"' : '') + '. Compare it yourself with your Sandbox value.'); return e; }
  function actor() { return (window.KM && window.KM.currentUser && window.KM.currentUser.email) || ''; }
  function tagOf(o) { var t = o && o.tag; if (typeof t !== 'string' || !/^[A-Z0-9]{4,12}$/.test(t)) refuse('tag must be 4-12 characters of A-Z and 0-9 (the RUNTAG of this run).'); return t; }
  function gate(o) {
    if (S.halted) refuse('this session is halted (' + S.halted + '). ' + STOP);
    if (!o || o[FLAG] !== true) refuse('pass { ' + FLAG + ': true } - only after you have checked yourself that this page, its Web App and its spreadsheet are the isolated Sandbox.');
    if (!S.checked) refuse('run po200Opening.check() first: the four installed values must match before anything is planned.');
  }
  function plainSuccess(r) { return !!r && r.success === true && r.status === 'COMMITTED' && r.replayed !== true && r.recovered_response !== true; }
  function metricsLine(r) {
    var m = r && r.metrics;
    if (!m) return 'METRICS none on this answer (a replay or a refusal carries none)';
    return 'METRICS requests=' + m.requests + ' bytes=' + m.bytes + ' max_bytes=' + m.max_bytes + ' cells=' + m.cells + ' ms_stage=' + m.ms_stage + ' ms_request=' + m.ms_request + ' ms_readback=' + m.ms_readback + ' ms_total=' + m.ms_total;
  }
  function resultLine(r) {
    var x = (r && r.result) || {};
    return 'status=' + (r && r.status) + ' replayed=' + !!(r && r.replayed) + ' audit_rows=' + x.audit_rows + ' atomic_commit=' + x.atomic_commit + ' readback_verified=' + x.readback_verified +
      ' documents=' + x.documents + ' emails=' + x.emails + ' counts=' + JSON.stringify(x.counts || {});
  }

  // ---- read-only: what is installed ----
  function check() {
    var d = db();
    return Promise.resolve(d.importTemplateGet({ domain: 'po_factory_stock', mode: 'NEW_RECEIPT', scope: {} })).then(function (t) {
      var env = printEnv();
      if (!t || t.success !== true) return halt('check(): the template read did not succeed', t);
      var l = t.limits || null, rows = [], all = !!l;
      Object.keys(EXPECTED).forEach(function (k) {
        var got = l ? l[k] : undefined, ok = got === EXPECTED[k]; if (!ok) all = false;
        rows.push({ value: k, installed: got === undefined ? 'NOT REPORTED' : got, expected: EXPECTED[k], match: ok });
        say((ok ? 'MATCH     ' : 'DIFFERENT ') + k + ' = ' + (got === undefined ? 'NOT REPORTED' : JSON.stringify(got)) + ' (expected ' + JSON.stringify(EXPECTED[k]) + ')');
      });
      S.limits = l; S.checked = all;
      say(all ? 'CHECK: all four installed values match the candidate. Nothing was written.' : 'CHECK: NOT the candidate (see DIFFERENT above). Do not test. Nothing was written; the plan functions stay refused.');
      return { ok: all, limits: l, rows: rows, environment: env, schema_version: t.schema_version };
    });
  }

  // ---- read-only tap on the page's own Validate / Commit: seconds, sizes and metrics for the record table ----
  function watch() {
    var d = db();
    if (S.taps) { say('watch() is already on.'); return true; }
    var taps = {};
    ['importValidate', 'importCommit'].forEach(function (name) {
      var original = d[name];
      var tap = function (body) {
        var t0 = Date.now(), self = this, args = arguments, chars = 0, rows = 0;
        try { chars = JSON.stringify(body).length; Object.keys((body && body.sheets) || {}).forEach(function (k) { rows += (body.sheets[k] || []).length; }); } catch (e) { /* the tap never changes a call */ }
        return Promise.resolve(original.apply(self, args)).then(function (r) {
          var seconds = Math.round((Date.now() - t0) / 100) / 10;
          var entry = { call: name, batch: body && body.import_batch_id, mode: body && body.mode, rows: rows, request_chars: chars, seconds: seconds, success: !!(r && r.success), code: (r && r.code) || '' };
          if (name === 'importValidate') { entry.valid = !!(r && r.valid); entry.counts = (r && r.preview && r.preview.counts) || {}; entry.receipt = (r && r.receipt) || null;
            say('VALIDATE batch=' + entry.batch + ' mode=' + entry.mode + ' rows=' + rows + ' valid=' + entry.valid + ' seconds=' + seconds + ' request_chars=' + chars + ' counts=' + JSON.stringify(entry.counts) + (entry.code ? ' code=' + entry.code : '') + (entry.receipt ? ' receipt=' + JSON.stringify(entry.receipt) : ''));
          } else { entry.status = r && r.status; entry.replayed = !!(r && r.replayed); entry.metrics = (r && r.metrics) || null; entry.audit_rows = r && r.result && r.result.audit_rows; entry.readback_verified = r && r.result && r.result.readback_verified;
            say('COMMIT batch=' + entry.batch + ' mode=' + entry.mode + ' rows=' + rows + ' success=' + entry.success + ' seconds=' + seconds + ' request_chars=' + chars + (entry.code ? ' code=' + entry.code : '') + ' ' + resultLine(r));
            say(metricsLine(r));
          }
          S.log.push(entry);
          return r;
        }, function (error) {
          S.log.push({ call: name, batch: body && body.import_batch_id, rows: rows, request_chars: chars, seconds: Math.round((Date.now() - t0) / 100) / 10, lost: true, error: String(error && error.message || error) });
          say(name + ' batch=' + (body && body.import_batch_id) + ' NO ANSWER after ' + Math.round((Date.now() - t0) / 1000) + ' s (' + String(error && error.message || error) + '). ' + STOP);
          throw error;
        });
      };
      taps[name] = { original: original, tap: tap };
      d[name] = tap;
    });
    if (d.importValidate !== taps.importValidate.tap || d.importCommit !== taps.importCommit.tap) { say('watch() could not be installed on this page (KM.DB cannot be changed). Use the Apps Script execution log (PFA_METRICS) instead.'); return false; }
    S.taps = taps;
    say('watch() is on: every Validate / Commit this page sends is passed through unchanged and its seconds, size and metrics are printed. po200Opening.log() returns them; unwatch() removes the tap.');
    return true;
  }
  function unwatch() {
    var d = db(); if (!S.taps) return false;
    Object.keys(S.taps).forEach(function (name) { if (d[name] === S.taps[name].tap) d[name] = S.taps[name].original; });
    S.taps = null; say('watch() is off.'); return true;
  }

  // ---- read-only: the existing PO lines of a factory as the file the page would export (the page has no button for NEW_RECEIPT) ----
  function exportExisting(o) {
    var d = db(), mode = (o && o.mode) || 'NEW_RECEIPT', factory = o && o.factory, KM = window.KM;
    if (S.halted) refuse('this session is halted (' + S.halted + '). ' + STOP);
    if (typeof factory !== 'string' || !factory) refuse('exportExisting({ factory: "<factory ID>", mode: "NEW_RECEIPT" })');
    if (['NEW_RECEIPT', 'UPDATE_REMAINING'].indexOf(mode) < 0) refuse('mode must be NEW_RECEIPT or UPDATE_REMAINING.');
    if (!KM.importBatch || typeof KM.importBatch._exportSpec !== 'function' || !KM.poFactoryImport || typeof KM.poFactoryImport._adapter !== 'function' || !KM.templateExport || typeof KM.templateExport.buildAndDownload !== 'function')
      refuse('the import dialog has not been opened on this page yet. Open "Import Purchase Order" once, close it, and call exportExisting again.');
    return Promise.resolve(d.importTemplateGet({ domain: 'po_factory_stock', mode: mode, scope: { warehouse_id: factory }, include_data: true })).then(function (t) {
      if (!t || t.success !== true) return halt('exportExisting(): the export read did not succeed', t);
      var rows = ((t.sheets && t.sheets[0] && t.sheets[0].rows) || []).length, blocked = (t.export_warnings || []).length;
      return KM.templateExport.buildAndDownload(KM.importBatch._exportSpec(t, KM.poFactoryImport._adapter(), mode, true)).then(function (res) {
        say('EXPORTED ' + rows + ' existing PO line(s) of this factory for ' + mode + ' as ' + res.filename + (blocked ? ' (' + blocked + ' row(s) have no company and are marked blocked)' : '') + '. Read-only: nothing was written.');
        return { ok: true, rows: rows, filename: res.filename, mode: mode };
      });
    });
  }

  // ---- stock-only ADD: physical stock with no PO behind it, so that the opening has something to cover ----
  function planStock(o) {
    gate(o);
    var d = db(), tag = tagOf(o), factory = o.factory, skus = o.skus, qty = o.qty;
    if (typeof factory !== 'string' || !factory) refuse('factory must be the factory ID of the Sandbox.');
    if (!Array.isArray(skus) || !skus.length || skus.length > MAX_ROWS || skus.some(function (s) { return typeof s !== 'string' || !s.trim(); })) refuse('skus must be an array of 1-' + MAX_ROWS + ' SKU IDs (text).');
    skus = skus.map(function (s) { return s.trim(); });
    if (skus.filter(function (s, i) { return skus.indexOf(s) !== i; }).length) refuse('skus names the same SKU more than once.');
    if (typeof qty !== 'number' || qty < 1 || Math.floor(qty) !== qty) refuse('qty must be a whole number of at least 1.');
    if (S.stock && S.stock.sent) refuse('the stock batch of this session was already sent. Reload the page and use a NEW tag for another run.');
    var id = 'PO200-' + tag + '-STOCK';
    return Promise.resolve(d.importTemplateGet({ domain: 'factory_inventory', mode: 'ADD', scope: { warehouse_id: factory } })).then(function (t) {
      if (!t || t.success !== true) return halt('planStock(): the stock template read did not succeed', t);
      var body = { domain: 'factory_inventory', mode: 'ADD', schema_version: t.schema_version, import_batch_id: id, scope: { warehouse_id: factory },
        sheets: { Stock: skus.map(function (sku, i) { return { __row: i + 2, warehouse_id: factory, sku: sku, add_qty: qty }; }) }, file: { name: 'po200-console-stock-' + tag }, actor: actor() };
      return Promise.resolve(d.importValidate(body)).then(function (v) {
        if (!v || v.success !== true || v.valid !== true) return halt('planStock(): validation did not succeed', v);
        var c = (v.preview && v.preview.counts) || {}, im = (v.preview && v.preview.impacts) || {}, writes = (c.create || 0) + (c.update || 0);
        if (v.receipt) return halt('planStock(): batch ' + id + ' already has a receipt (' + v.receipt.status + ', same content ' + v.receipt.same_content + '). This tag was used before - use a NEW tag for a new run', v);
        if (writes !== skus.length || (c.reject || 0) || (c.skipped || 0) || im.total_delta !== skus.length * qty) return halt('planStock(): the server would not add exactly ' + skus.length + ' rows of ' + qty, v);
        S.stock = { id: id, tag: tag, body: Object.assign({}, body, { preview_digest: v.preview_digest }), sent: false, committed: false, replays: 0 };
        S.skus = skus.slice(); S.factory = factory;
        say('STOCK PLAN batch=' + id + ' rows=' + skus.length + ' add_qty=' + qty + ' counts=' + JSON.stringify(c) + ' total_delta=' + im.total_delta + '. Validated only - NOTHING WAS WRITTEN. Call po200Opening.commitStock() to add this stock.');
        return { ok: true, batch_id: id, rows: skus.length, counts: c, total_delta: im.total_delta };
      });
    });
  }
  function planOpening(o) {
    gate(o);
    var d = db(), tag = tagOf(o), factory = o.factory, company = o.company, day = o.orderDate, skus = o.skus || S.skus;
    if (typeof factory !== 'string' || !factory) refuse('factory must be the factory ID of the Sandbox.');
    if (typeof company !== 'string' || !company) refuse('company must be the company ID exactly as the Sandbox lists it.');
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) refuse('orderDate must be written YYYY-MM-DD and must not be after the posting date.');
    if (o.asOfDate != null && (typeof o.asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.asOfDate))) refuse('asOfDate must be written YYYY-MM-DD.');
    if (!Array.isArray(skus) || !skus.length) refuse('no SKU list: run planStock / commitStock in this session first, or pass skus: [...].');
    if (skus.length > MAX_ROWS) refuse('more than ' + MAX_ROWS + ' SKUs.');
    if (S.factory && S.factory !== factory) refuse('this factory is not the one planStock used in this session.');
    if (S.stock && !S.stock.committed) refuse('the stock batch of this session is not committed yet: there is nothing for the opening to cover.');
    if (S.opening && S.opening.sent) refuse('the opening batch of this session was already sent. Reload the page and use a NEW tag for another run.');
    var id = 'PO200-' + tag + '-OPENING', scope = { warehouse_id: factory };
    return Promise.resolve(d.importTemplateGet({ domain: 'po_factory_stock', mode: OPENING, scope: scope, include_data: true })).then(function (t) {
      if (!t || t.success !== true) return halt('planOpening(): the opening export did not succeed', t);
      var all = (t.sheets && t.sheets[0] && t.sheets[0].rows) || [], by = {};
      all.forEach(function (r) { by[String(r.sku)] = r; });
      var missing = skus.filter(function (s) { return !by[s]; });
      if (missing.length) refuse(missing.length + ' of the ' + skus.length + ' SKUs have no unassigned stock in the server\'s opening export (first: ' + missing.slice(0, 5).join(', ') + '). Nothing was planned.');
      var rows = skus.map(function (s) { return by[s]; });
      if (rows.length > MAX_ROWS) refuse('more than ' + MAX_ROWS + ' rows result.');
      if (rows.some(function (r) { return typeof r.quantity !== 'number' || r.quantity < 1 || Math.floor(r.quantity) !== r.quantity; })) refuse('the server reported an unassigned quantity that is not a positive whole number. Nothing was planned.');
      var total = rows.reduce(function (a, r) { return a + r.quantity; }, 0);
      var body = { domain: 'po_factory_stock', mode: OPENING, schema_version: t.schema_version, import_batch_id: id, scope: o.asOfDate ? { warehouse_id: factory, as_of_date: o.asOfDate } : scope,
        sheets: { StockPO: rows.map(function (r, i) { return { __row: i + 2, transaction_id: id, company: company, po_no: 'ZZTEST-' + tag + '-OPEN-' + ((i % OPENING_POS) + 1), sku: r.sku, warehouse_id: factory,
          quantity: r.quantity, ordered_qty: r.quantity, currency: '', order_date: day }; }) }, file: { name: 'po200-console-opening-' + tag }, actor: actor() };
      return Promise.resolve(d.importValidate(body)).then(function (v) {
        if (!v || v.success !== true || v.valid !== true) return halt('planOpening(): validation did not succeed', v);
        var c = (v.preview && v.preview.counts) || {}, im = (v.preview && v.preview.impacts) || {};
        if (v.receipt) return halt('planOpening(): batch ' + id + ' already has a receipt (' + v.receipt.status + ', same content ' + v.receipt.same_content + '). This tag was used before - use a NEW tag for a new run', v);
        if (im.stock_delta !== 0) return halt('planOpening(): the server reports a stock change of ' + im.stock_delta + ' - an opening must not move stock', v);
        var pos = Math.min(OPENING_POS, rows.length);
        if ((c.reject || 0) || (c.skipped || 0) || c.create !== rows.length + pos) return halt('planOpening(): the server would not create exactly ' + pos + ' POs and ' + rows.length + ' lines', v);
        S.opening = { id: id, tag: tag, body: Object.assign({}, body, { preview_digest: v.preview_digest }), sent: false, committed: false, replays: 0 };
        say('OPENING PLAN batch=' + id + ' rows=' + rows.length + ' POs=' + pos + ' coverage_units=' + total + ' counts=' + JSON.stringify(c) + ' stock_delta=' + im.stock_delta + ' (must be 0). Other unassigned rows of this factory left out: ' + (all.length - rows.length) +
          '. Validated only - NOTHING WAS WRITTEN. Call po200Opening.commitOpening() to create the coverage.');
        return { ok: true, batch_id: id, rows: rows.length, pos: pos, coverage_units: total, counts: c, stock_delta: im.stock_delta, left_out: all.length - rows.length };
      });
    });
  }
  // one stored request, sent as it was validated. The first call is the commit; a call after a plain success sends the SAME request again and
  // must be answered as a replay. A request that got no plain answer is never sent again.
  function commit(slot, label) {
    var d = db(), p = S[slot];
    if (S.halted) refuse('this session is halted (' + S.halted + '). ' + STOP);
    if (!p) refuse('nothing is planned: call ' + (slot === 'stock' ? 'planStock' : 'planOpening') + ' first.');
    if (p.sent && !p.committed) refuse('batch ' + p.id + ' was sent and has no plain answer. ' + STOP);
    var replay = p.committed === true, t0 = Date.now();
    p.sent = true;
    return Promise.resolve().then(function () { return d.importCommit(p.body); }).then(function (r) {
      var seconds = Math.round((Date.now() - t0) / 100) / 10;
      if (replay) {
        if (r && r.success === true && r.replayed === true && r.writes_performed === 0) { p.replays++; say(label + ' REPLAY batch=' + p.id + ' seconds=' + seconds + ': answered from the receipt, NOTHING was applied again. ' + resultLine(r)); return { ok: true, replayed: true, batch_id: p.id, answer: r }; }
        return halt(label + ': the repeat of batch ' + p.id + ' was NOT answered as a replay', r);
      }
      if (plainSuccess(r)) {
        p.committed = true;
        say(label + ' COMMITTED batch=' + p.id + ' seconds=' + seconds + ' ' + resultLine(r));
        say(metricsLine(r));
        say('RESULT ' + JSON.stringify(r.result));
        return { ok: true, replayed: false, batch_id: p.id, seconds: seconds, metrics: r.metrics || null, result: r.result, answer: r };
      }
      return halt(label + ': batch ' + p.id + ' was not answered with a plain success', r);
    }, function (error) { return halt(label + ': batch ' + p.id + ' got NO ANSWER - the result is unknown', { error: String(error && error.message || error) }); });
  }
  function status() {
    var view = { version: VERSION, halted: S.halted || false, checked: S.checked, limits: S.limits, environment: envFacts(), watching: !!S.taps,
      stock: S.stock ? { batch_id: S.stock.id, sent: S.stock.sent, committed: S.stock.committed, replays: S.stock.replays } : null,
      opening: S.opening ? { batch_id: S.opening.id, sent: S.opening.sent, committed: S.opening.committed, replays: S.opening.replays } : null, skus: S.skus ? S.skus.length : 0 };
    say('STATUS ' + JSON.stringify(view)); return view;
  }
  function guarded(fn) { return function () { var args = arguments; try { return Promise.resolve(fn.apply(null, args)); } catch (e) { return Promise.reject(e); } }; }

  window.po200Opening = { version: VERSION, expected: JSON.parse(JSON.stringify(EXPECTED)),
    check: guarded(check), watch: watch, unwatch: unwatch, log: function () { return JSON.parse(JSON.stringify(S.log)); }, exportExisting: guarded(exportExisting),
    planStock: guarded(planStock), commitStock: guarded(function () { return commit('stock', 'STOCK'); }),
    planOpening: guarded(planOpening), commitOpening: guarded(function () { return commit('opening', 'OPENING'); }), status: status };
  say(VERSION + ' loaded. Nothing was read or written. Start with po200Opening.check().');
})();
