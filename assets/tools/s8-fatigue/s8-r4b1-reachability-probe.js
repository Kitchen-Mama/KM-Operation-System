// S8-R4B-1 §2 — transitive zero-write proof for handleFactoryStockGuardGet_.
// Walks the whole reachable call graph across every .gs file, comments and string literals stripped,
// and reports every write primitive it can reach. Reachability, not file-level mentions.
'use strict';
var fs = require('fs'), path = require('path');
var GS = path.join(process.argv[2], 'assets/specs/active/apps-script');

var WRITE = {
  spreadsheet: ['setValue(', 'setValues(', 'appendRow(', 'insertRowAfter(', 'insertRowBefore(', 'insertRows(',
    'insertSheet(', 'deleteRow(', 'deleteRows(', 'deleteSheet(', 'clearContent', 'clearContents',
    'setFormula', 'setBackground', 'copyTo(', 'getRange().setValue'],
  properties: ['setProperty(', 'deleteProperty(', 'setProperties(', 'deleteAllProperties('],
  drive: ['DriveApp', 'MailApp', 'GmailApp', 'UrlFetchApp'],
  trigger: ['newTrigger(', 'deleteTrigger(', 'ScriptApp.newTrigger'],
  lock: ['LockService'],
  cache: ['CacheService']
};

function bare(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
          .replace(/'(?:\\.|[^'\\])*'/g, "''")
          .replace(/"(?:\\.|[^"\\])*"/g, '""');
}
var files = fs.readdirSync(GS).filter(function (f) { return /\.gs$/.test(f); });
var src = {};
files.forEach(function (f) { src[f] = bare(fs.readFileSync(path.join(GS, f), 'utf8')); });

function bodyOf(fn) {
  for (var i = 0; i < files.length; i++) {
    var s = src[files[i]];
    var m = new RegExp('function\\s+' + fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\(').exec(s);
    if (!m) continue;
    var open = s.indexOf('{', m.index), d = 0, j = open;
    for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) break; } }
    return { file: files[i], body: s.slice(open, j + 1) };
  }
  return null;
}

var seen = {}, missing = [], hits = [], order = [];
function walk(fn, depth, viaPath) {
  if (seen[fn] || depth > 12) return;
  seen[fn] = true;
  var b = bodyOf(fn);
  if (!b) { missing.push(fn); return; }
  order.push({ fn: fn, file: b.file, depth: depth });
  Object.keys(WRITE).forEach(function (cat) {
    WRITE[cat].forEach(function (w) {
      if (b.body.indexOf(w) !== -1) hits.push({ fn: fn, file: b.file, cat: cat, prim: w, via: viaPath + ' -> ' + fn });
    });
  });
  var called = (b.body.match(/\b([A-Za-z_][A-Za-z0-9_]*_)\s*\(/g) || [])
    .map(function (x) { return x.replace(/\s*\($/, ''); });
  var kmfsg = (b.body.match(/KMFSG\.([A-Za-z0-9_]+)\s*\(/g) || [])
    .map(function (x) { return x.replace(/^KMFSG\./, '').replace(/\s*\($/, ''); });
  called.concat(kmfsg).filter(function (c, i, z) { return z.indexOf(c) === i; })
    .forEach(function (c) { walk(c, depth + 1, viaPath + ' -> ' + fn); });
}

walk('handleFactoryStockGuardGet_', 0, '(entry)');

console.log('REACHABLE FUNCTIONS RESOLVED: ' + order.length);
order.slice(0, 40).forEach(function (o) { console.log('   ' + '  '.repeat(o.depth) + o.fn + '   [' + o.file + ']'); });
console.log('\nUNRESOLVED (not a .gs function — library/global/builtin): ' + missing.length);
console.log('   ' + missing.join(' '));
console.log('\nWRITE PRIMITIVES REACHABLE: ' + hits.length);
hits.forEach(function (h) { console.log('   !! ' + h.cat + '  ' + h.prim + '  in ' + h.fn + ' [' + h.file + ']\n      via ' + h.via); });

var counts = { spreadsheet: 0, properties: 0, drive: 0, trigger: 0, lock: 0, cache: 0 };
hits.forEach(function (h) { counts[h.cat]++; });
console.log('\nWRITE_PRIMITIVE_COUNT  = ' + counts.spreadsheet);
console.log('PROPERTY_WRITE_COUNT   = ' + counts.properties);
console.log('DRIVE_WRITE_COUNT      = ' + counts.drive);
console.log('TRIGGER_WRITE_COUNT    = ' + counts.trigger);
console.log('LOCK_USE_COUNT         = ' + counts.lock);
console.log('CACHE_USE_COUNT        = ' + counts.cache);

// Is the override audit table reachable from the GET entry?
var auditFns = [];
files.forEach(function (f) {
  if (src[f].indexOf('FSG_OVERRIDE_AUDIT_TABLE_') !== -1) {
    var re = /function\s+([A-Za-z0-9_]+)\s*\(/g, m;
    while ((m = re.exec(src[f]))) {
      var b = bodyOf(m[1]);
      if (b && b.body.indexOf('FSG_OVERRIDE_AUDIT_TABLE_') !== -1) auditFns.push(m[1]);
    }
  }
});
auditFns = auditFns.filter(function (c, i, z) { return z.indexOf(c) === i; });
console.log('\nfunctions touching factory_stock_override_audit: ' + auditFns.join(' '));
console.log('any of them reachable from the GET entry? ' +
  (auditFns.some(function (f) { return seen[f]; }) ? 'YES — STOP' : 'NO'));
