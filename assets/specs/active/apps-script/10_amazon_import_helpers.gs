// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 10_amazon_import_helpers.gs — pure helpers
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================


function amazonKeyOf_(config, dest) {
  var parts = [];
  for (var i = 0; i < config.naturalKey.length; i++) {
    var v = dest[config.naturalKey[i]];
    parts.push((v === undefined || v === null) ? '' : String(v));
  }
  return parts.join('|');
}

function amazonRowHash_(hashFields, dest) {
  var parts = [];
  for (var i = 0; i < hashFields.length; i++) {
    var v = dest[hashFields[i]];
    parts.push((v === undefined || v === null) ? '' : String(v));
  }
  var raw = parts.join('␟');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw, Utilities.Charset.UTF_8);
  var hex = '';
  for (var d = 0; d < digest.length; d++) { hex += ('0' + (digest[d] & 0xFF).toString(16)).slice(-2); }
  return hex;
}

function amazonNormalizeDate_(v) {
  if (v === null || v === undefined) return { ok: false, empty: true, value: '' };
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return { ok: false, empty: false, value: '' };
    return { ok: true, empty: false, value: Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd') };
  }
  var s = String(v).trim();
  if (s === '') return { ok: false, empty: true, value: '' };
  var m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) {
    var mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return { ok: true, empty: false, value: m[1] + '-' + amazonPad2_(mo) + '-' + amazonPad2_(d) };
    return { ok: false, empty: false, value: '' };
  }
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) return { ok: true, empty: false, value: Utilities.formatDate(dt, 'Asia/Taipei', 'yyyy-MM-dd') };
  return { ok: false, empty: false, value: '' };
}

function amazonDeriveWeekParts_(weekStr) {
  var s = String(weekStr == null ? '' : weekStr).trim();
  var parts = s.split('~');
  if (parts.length !== 2) return { ok: false, month: '', start: '', end: '' };
  var a = amazonNormalizeDate_(parts[0]);
  var b = amazonNormalizeDate_(parts[1]);
  if (!a.ok || !b.ok) return { ok: false, month: '', start: '', end: '' };
  return { ok: true, month: a.value.substring(0, 7), start: a.value, end: b.value };
}

function amazonQualityScore_(rowsRead, rowsWritten, rowsError, rowsDuplicate) {
  if (!rowsRead) return 0;
  var score = ((rowsWritten - rowsError - rowsDuplicate) / rowsRead) * 100;
  return Math.round(score * 100) / 100;
}

function amazonIsBlank_(v) { return v === null || v === undefined || String(v).trim() === ''; }
function amazonPad2_(n) { return (n < 10 ? '0' : '') + n; }
function amazonTimestamp_() { return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss'); }

// Amazon numeric placeholder normalization. Returns one of:
//   { kind: 'blank' }                       — empty (leave blank, not counted)
//   { kind: 'null', counted:true }          — "/" placeholder → blank/null
//   { kind: 'number', value, counted }      — numeric (counted only when formatting was stripped)
//   { kind: 'capped', value }               — "N+" open bound → N (companion *_is_capped = TRUE)
//   { kind: 'unexpected' }                  — genuinely non-numeric → caller logs invalid_number
function amazonNormalizeNumeric_(v) {
  if (v === null || v === undefined) return { kind: 'blank' };
  var s = String(v).trim();
  if (s === '') return { kind: 'blank' };
  if (s === '/') return { kind: 'null', counted: true };
  var cap = s.match(/^(\d+(?:\.\d+)?)\s*\+$/);          // e.g. 365+  (and 12.5+)
  if (cap) return { kind: 'capped', value: Number(cap[1]) };
  var hadFmt = /[,%]/.test(s);                           // thousands separators or trailing %
  var cleaned = s.replace(/,/g, '').replace(/%\s*$/, '');
  if (cleaned !== '' && !isNaN(Number(cleaned))) return { kind: 'number', value: Number(cleaned), counted: hadFmt };
  return { kind: 'unexpected' };
}

// Natural-key group fields = naturalKey minus the fixed-value fields and date/week fields.
// For daily sales: [country, channel, sku] (marketplace is fixed; snapshot_date is the date field).
function amazonGroupFields_(config) {
  var fixed = config.fixedValues || {};
  var dateF = {};
  (config.dateFields || []).forEach(function (d) { dateF[d] = 1; });
  if (config.weekField) dateF[config.weekField] = 1;
  return config.naturalKey.filter(function (k) { return !fixed.hasOwnProperty(k) && !dateF[k]; });
}

// Compute per-row data-window / fallback fields + run-level rollup (daily sales).
function amazonApplyDailyWindow_(ctx, config, destObjs, isFallback) {
  var syncDate = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  ctx.isFallback = isFallback;
  if (!destObjs.length) { ctx.fallbackGroupCount = 0; return; }

  if (!isFallback) {
    // Rolling success: global min/max across returned rows.
    var gmin = null, gmax = null;
    for (var i = 0; i < destObjs.length; i++) {
      var d = destObjs[i].snapshot_date; if (!d) continue;
      if (gmin === null || d < gmin) gmin = d;
      if (gmax === null || d > gmax) gmax = d;
    }
    var age = (gmax ? amazonDateAgeDays_(gmax, syncDate) : '');
    for (var j = 0; j < destObjs.length; j++) {
      destObjs[j].data_window_start_date = gmin || '';
      destObjs[j].data_window_end_date = gmax || '';
      destObjs[j].latest_source_date = gmax || '';
      destObjs[j].is_fallback_used = false;
      destObjs[j].fallback_reason = '';
      destObjs[j].data_age_days = age;
    }
    ctx.fallbackGroupCount = 0;
    ctx.runLatestDate = gmax || ''; ctx.runWindowStart = gmin || ''; ctx.runWindowEnd = gmax || ''; ctx.dataAgeDays = age;
    return;
  }

  // Fallback: per-group windows (each group's own latest date).
  var groupFields = amazonGroupFields_(config);
  function keyOf(o) { return groupFields.map(function (f) { return String(o[f] == null ? '' : o[f]); }).join('|'); }
  var groups = {};
  for (var g = 0; g < destObjs.length; g++) {
    var key = keyOf(destObjs[g]); var dd = destObjs[g].snapshot_date;
    if (!groups[key]) groups[key] = { min: null, max: null };
    if (dd) {
      if (groups[key].min === null || dd < groups[key].min) groups[key].min = dd;
      if (groups[key].max === null || dd > groups[key].max) groups[key].max = dd;
    }
  }
  var runMin = null, runMax = null;
  for (var r = 0; r < destObjs.length; r++) {
    var gg = groups[keyOf(destObjs[r])];
    destObjs[r].data_window_start_date = gg.min || '';
    destObjs[r].data_window_end_date = gg.max || '';
    destObjs[r].latest_source_date = gg.max || '';
    destObjs[r].is_fallback_used = true;
    destObjs[r].fallback_reason = 'rolling_window_empty';
    destObjs[r].data_age_days = gg.max ? amazonDateAgeDays_(gg.max, syncDate) : '';
    if (gg.min && (runMin === null || gg.min < runMin)) runMin = gg.min;
    if (gg.max && (runMax === null || gg.max > runMax)) runMax = gg.max;
  }
  ctx.fallbackGroupCount = 0;
  for (var gk in groups) { if (groups.hasOwnProperty(gk)) ctx.fallbackGroupCount++; }
  ctx.runLatestDate = runMax || ''; ctx.runWindowStart = runMin || ''; ctx.runWindowEnd = runMax || '';
  ctx.dataAgeDays = (runMax ? amazonDateAgeDays_(runMax, syncDate) : '');
}

function amazonParseYmd_(s) { var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
function amazonDateAgeDays_(ymdLatest, ymdSync) {
  var a = amazonParseYmd_(ymdLatest), b = amazonParseYmd_(ymdSync);
  if (a === null || b === null) return '';
  return Math.round((b - a) / 86400000);
}
