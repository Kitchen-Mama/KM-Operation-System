// Kitchen Mama Operation System — contended-Factory partition multi-property storage — F1-7N-FA-3C-PRE1.
// Run: node assets/tests/contended-factory-partition-storage-f1-7n-fa-3c-pre1.test.js
// Proves the STORAGE-ONLY fix: the ONE canonical R2G-B contended-Factory partition is chunked across multiple Script
// Properties (each chunk <= the existing safe budget), reconstructed exactly, fails closed on missing/corrupt chunk,
// reads independent of key order, supports v1 inline backward-compat, swaps generations atomically, and cleans up
// only its own prefix. No allocation/conservation/§41 logic is touched (partition object is transported verbatim).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var F46 = read('specs/active/apps-script/46_api_v1_gap_materialization_job.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(F46 + '\n return {' +
  ' write: gapJobPartitionWrite_, readP: gapJobPartitionRead_, cleanup: gapJobPartitionCleanup_, purge: gapJobPartitionPurge_,' +
  ' chunk: gapJobChunkString_, utf8: gapJobUtf8Len_, fnv: gapJobFnv1a_, prefix: gapJobPartitionPrefix_,' +
  ' SAFE: GAP_JOB_PARTITION_SAFE_BYTES_, KEYS: GAP_JOB_PROP_KEYS_ };'))();

var PRODUCT = 'ORDER_PLANNING';
function fakeProps() {
  var m = {};
  return { store: m,
    get: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    set: function (k, v) { m[k] = String(v); }, del: function (k) { delete m[k]; },
    keys: function () { return Object.keys(m); } };
}
function env() { return { props: fakeProps() }; }
function chunkKeys(e, gen) { var p = H.prefix(PRODUCT) + ':' + gen + ':'; return e.props.keys().filter(function (k) { return k.indexOf(p) === 0; }).sort(); }

function partition(n) {
  var c = { contendedSkus: {}, partition: {}, partitionBySource: {} };
  for (var i = 0; i < n; i++) {
    var sku = 'SKU' + i; c.contendedSkus[sku] = 1;
    var rk = 'KM||US||AMAZON_US||GA-' + i + '-' + sku;
    c.partition[rk] = (i % 97); c.partitionBySource[rk] = { CN: (i % 97) };
  }
  return c;
}

// ==========================================================================
section('CASE A / I / L — small partition write → read exact round-trip; deterministic');
(function () {
  var e = env(), c = partition(3);
  var meta = H.write(e, PRODUCT, c, 'run1-1');
  var state = { factoryContentionMeta: meta, factoryContention: null };
  eq(H.readP(e, PRODUCT, state), c, 'A round-trip exact equality');
  var e2 = env(), meta2 = H.write(e2, PRODUCT, c, 'run1-1');
  eq(meta2.checksum, meta.checksum, 'L same input → same checksum (deterministic)');
  eq(chunkKeys(e2, 'run1-1').map(function (k) { return e2.props.get(k); }), chunkKeys(e, 'run1-1').map(function (k) { return e.props.get(k); }), 'L same input → identical chunk values');
})();

section('CASE B / C / D — 228-receiver (>safe) partition: multi-chunk, each <= safe, exact round-trip');
(function () {
  var e = env(), c = partition(228);
  var bytes = H.utf8(JSON.stringify(c));
  ok(bytes > H.SAFE, 'B payload exceeds single-property safe budget (' + bytes + ' > ' + H.SAFE + ')');
  var meta = H.write(e, PRODUCT, c, 'run1-1');
  ok(meta.chunkCount > 1, 'C stored as multiple chunks (' + meta.chunkCount + ')');
  eq(meta.byteLength, bytes, 'B meta.byteLength == actual UTF-8 bytes');
  chunkKeys(e, 'run1-1').forEach(function (k) { ok(H.utf8(e.props.get(k)) <= H.SAFE, 'D chunk ' + k + ' <= safe budget'); });
  eq(H.readP(e, PRODUCT, { factoryContentionMeta: meta, factoryContention: null }), c, 'B 228-receiver round-trip exact equality');
})();

section('CASE E — read is independent of stored key order');
(function () {
  var e = env(), c = partition(228), meta = H.write(e, PRODUCT, c, 'run1-1');
  // rebuild the store with reversed key insertion order
  var rev = env(); e.props.keys().reverse().forEach(function (k) { rev.props.set(k, e.props.get(k)); });
  eq(H.readP(rev, PRODUCT, { factoryContentionMeta: meta, factoryContention: null }), c, 'E reversed key order → identical reconstruction');
})();

section('CASE F — missing chunk → FAIL CLOSED (never partial)');
(function () {
  var e = env(), c = partition(228), meta = H.write(e, PRODUCT, c, 'run1-1');
  e.props.del(chunkKeys(e, 'run1-1')[1]);   // drop one chunk
  var threw = false; try { H.readP(e, PRODUCT, { factoryContentionMeta: meta, factoryContention: null }); } catch (x) { threw = /CHUNK_MISSING/.test(x.message); }
  ok(threw, 'F missing chunk throws CONTENDED_FACTORY_PARTITION_CHUNK_MISSING');
})();

section('CASE G — corrupt chunk (checksum/byte mismatch) → FAIL CLOSED');
(function () {
  var e = env(), c = partition(228), meta = H.write(e, PRODUCT, c, 'run1-1');
  var k0 = chunkKeys(e, 'run1-1')[0]; e.props.set(k0, e.props.get(k0) + 'X');   // corrupt
  var threw = false; try { H.readP(e, PRODUCT, { factoryContentionMeta: meta, factoryContention: null }); } catch (x) { threw = /CHECKSUM_MISMATCH/.test(x.message); }
  ok(threw, 'G corrupt chunk throws CONTENDED_FACTORY_PARTITION_CHECKSUM_MISMATCH');
})();

section('CASE H — v1 inline state.factoryContention still reads (backward compatible)');
(function () {
  var e = env(), c = partition(5);
  eq(H.readP(e, PRODUCT, { factoryContention: c }), c, 'H legacy inline partition returned verbatim (no chunks)');
  eq(H.readP(e, PRODUCT, { factoryContention: null }), null, 'H no inline + no meta → null (empty pre-pass)');
})();

section('CASE J / K — new generation replaces old atomically; cleanup bounded to prefix');
(function () {
  var e = env();
  e.props.set('UNRELATED_KEY', 'keepme'); e.props.set('GAP_JOB_INVENTORY', 'other-state');
  var c1 = partition(228), c2 = partition(10);
  H.write(e, PRODUCT, c1, 'run1-1');
  var meta2 = H.write(e, PRODUCT, c2, 'run1-2');           // new generation
  var removed = H.cleanup(e, PRODUCT, 'run1-2');           // prune the old generation
  ok(removed >= 1, 'J stale generation chunks pruned (' + removed + ')');
  eq(chunkKeys(e, 'run1-1').length, 0, 'J no run1-1 chunks remain (no mixed-generation read possible)');
  eq(H.readP(e, PRODUCT, { factoryContentionMeta: meta2, factoryContention: null }), c2, 'J reader returns ONLY the active generation');
  ok(e.props.get('UNRELATED_KEY') === 'keepme' && e.props.get('GAP_JOB_INVENTORY') === 'other-state', 'K cleanup bounded to partition prefix (unrelated keys untouched)');
  var purged = H.purge(e, PRODUCT);
  eq(chunkKeys(e, 'run1-2').length, 0, 'K purge removes all partition chunks');
  ok(e.props.get('UNRELATED_KEY') === 'keepme', 'K purge still bounded to prefix');
})();

// ==========================================================================
console.log('\n' + (fail ? ('FAILED ' + fail + ' / ' + (pass + fail)) : ('OK — all ' + pass + ' assertions passed')));
if (fail) process.exit(1);
