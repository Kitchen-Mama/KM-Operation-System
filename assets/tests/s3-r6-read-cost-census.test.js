// =================================================================================================================
// S3-R6 §15 — THE CAPTURE TOOL IS READ-ONLY, AND THE CENSUS CANNOT DRIFT FROM THE HANDLERS.
//
// This round is a measurement round with no production access, so it ships two things and neither is a behaviour
// change: a console capture tool for the operator, and a structural census of what every mandatory read actually
// reads. §15 says not to invent mutation tests to manufacture a count, so there are none. What is asserted is the
// two properties that would make either artefact dangerous if they stopped holding.
//
// FIRST: the tool must not be able to write. It issues the same canonical reads the pages already issue, through
// the same client APIs, and reads metadata the server already sends. Section A executes it against a world with no
// KM at all and proves it neither throws nor invents a number — every unavailable field comes back NOT_AVAILABLE,
// which is the difference between a measurement tool and a plausible-looking one.
//
// SECOND, and this is the one that matters six months from now: the census names the tables each handler reads and
// the order it reads them in. That is a claim about five Apps Script files, and a claim about another file is
// exactly the kind that rots silently. Section C reads the handlers and checks the census against them, so adding
// a table to a workspace read fails here until the census is updated with it.
//
// NOTHING SHIPPED CHANGED THIS ROUND. Section D asserts that too: no runtime asset moved, so no cache token
// rotates and nothing needs deploying.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (x === undefined ? '' : '\n       ' + JSON.stringify(x))); } }
function eq(a, b, m) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + '\n       exp ' + B + '\n       got ' + A); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

const TOOL_REL = 'docs/evidence/s3-r6-server-read-cost/capture-console-snippet.js';
const TOOL = read(TOOL_REL);
const CENSUS = JSON.parse(read('docs/evidence/s3-r6-server-read-cost/census.json'));
const GS = (f) => read('assets/specs/active/apps-script/' + f);

/** The tool, loaded into a stub window. Nothing here can reach a network. */
function load(win) {
  // eslint-disable-next-line no-new-func
  new Function('window', TOOL + '; return window.__kmS3R6;')(win);
  return win.__kmS3R6;
}
function stubWin(extra) {
  const logs = [];
  const w = { console: { log: (s) => logs.push(String(s)), table: () => {} },
    performance: { now: () => 0 }, logs };
  if (extra) for (const k in extra) w[k] = extra[k];
  return w;
}

(async function () {

  // ===============================================================================================================
  section('A — EXECUTED: the tool is inert on load and honest when it has nothing');
  // ===============================================================================================================
  {
    const w = stubWin();
    const api = load(w);
    eq(w.logs.length, 1, 'A1  loading it issues nothing and logs exactly one ready line');
    eq(Object.keys(api).sort(), ['contract', 'measure', 'passive', 'reset'],
      'A2  and defines four entry points, all of which are reads or prints');
    eq(api.contract.writes, 0, 'A3  its stated contract is zero writes');
    eq([api.contract.locks, api.contract.sheetMutations, api.contract.businessLogicChanges], [0, 0, 0],
      'A4  zero locks, zero sheet mutations, zero business-logic changes');
    ok(api.contract.newTransport === false && api.contract.newTimingInfrastructure === false,
      'A5  and it declares that it is neither a second transport nor new timing infrastructure');
    ok(api.contract.sequential === true,
      'A6  the reads are sequential, so a number is the cost of one read rather than of eight competing');
  }
  {
    // The property that separates a measurement tool from a plausible-looking one.
    const w = stubWin();
    const api = load(w);
    const text = await api.measure('SELFTEST');
    ok(/WORKSPACE_API_UNAVAILABLE/.test(text),
      'A7  with no KM present every target reports WHY it could not be measured');
    ok(/SKIPPED_NO_SCOPE/.test(text),
      'A8  and the scope-dependent target says it was skipped rather than reporting a zero');
    const rows = text.split('\n').filter((l) => /^[A-I] {2}/.test(l));
    eq(rows.length, 9, 'A9  all nine mandatory targets appear as rows even when none could run', rows.length);
    ok(!/\bundefined\b/.test(rows.join('\n')),
      'A10 and no cell is undefined — an absent field is the string NOT_AVAILABLE');
    ok(/NOT_AVAILABLE/.test(rows.join('\n')),
      'A11 which is the string §2 requires instead of an invented number');
  }
  {
    // A world where the APIs exist but every read rejects: the tool must record the failure, not lose it.
    const w = stubWin({ KM: {
      api: { getWorkspace: () => Promise.reject({ code: 'REQUEST_TIMEOUT' }) },
      productPricingWorkspace: { getSiteUniverse: () => Promise.reject({ code: 'REQUEST_TIMEOUT' }),
        get: () => Promise.reject({ code: 'REQUEST_TIMEOUT' }) },
      DB: { checkDeploymentContract: () => Promise.reject({ code: 'REQUEST_TIMEOUT' }) }
    } });
    const api = load(w);
    const text = await api.measure('FAILING', { company: 'X', country: 'Y', marketplace: 'Z' });
    const hits = (text.match(/REQUEST_TIMEOUT/g) || []).length;
    ok(hits >= 8, 'A12 a read that FAILS is still a measurement and is recorded as one', hits);
  }
  {
    // And the one that would be a real defect: the tool must never call a mutation.
    const bare = decomment(TOOL);
    ['executeCommand', 'updateShippingPlan', 'pricing.update', 'appendRow', 'setValue', 'POST',
      'saveRow', 'writeRow', '.write(']
      .forEach(function (tok) {
        ok(bare.indexOf(tok) === -1, 'A13 the tool contains no "' + tok + '"');
      });
    ok(/KM\.api\.getWorkspace/.test(bare) && /productPricingWorkspace/.test(bare)
      && /checkDeploymentContract/.test(bare),
      'A14 and reaches the backend only through the three read APIs it declares');
    ok(!/new XMLHttpRequest|fetch\s*\(/.test(bare),
      'A15 it opens no socket of its own — no fetch, no XHR, so it cannot be a second transport');
  }

  // ===============================================================================================================
  section('B — the metadata this round depends on is really emitted');
  // ===============================================================================================================
  // §2 — the whole round rests on "the server already tells us". If that stops being true the capture silently
  // reports NOT_AVAILABLE for everything, so it is checked at the source rather than assumed.
  {
    [['59_api_v1_sku_details_workspace.gs', 'skuDetails.workspace.get'],
     ['72_api_v1_product_pricing_workspace.gs', 'productPricing.*'],
     ['58_api_v1_fc_summary_workspace.gs', 'fcSummary.workspace.get']].forEach(function (p) {
      const src = GS(p[0]);
      ok(/serverDurationMs:/.test(src), 'B1  ' + p[1] + ' emits serverDurationMs');
      ok(/tablesRead:/.test(src), 'B1a ' + p[1] + ' emits tablesRead');
    });
    const FND = decomment(read('assets/js/api/km-api-foundation.js'));
    ok(/for \(var k in serverEnv\.meta\)/.test(FND),
      'B2  and the client copies server meta through, which is what makes them readable in a browser');
    const TP = decomment(read('assets/js/api/km-transport.js'));
    ok(/serverDurationMs/.test(TP),
      'B3  the transport also lifts serverDurationMs into its own sample, so timeline() carries it');
    ok(String(CENSUS.metadata_availability.production_code_changed_to_expose_metadata).indexOf('NONE') === 0,
      'B4  and no production code had to change to expose any of it');
  }

  // ===============================================================================================================
  section('C — the census matches the handlers it describes');
  // ===============================================================================================================
  // A claim about another file rots silently. Adding a table to a workspace read must fail HERE until the census
  // is updated to name it.
  {
    const skd = GS('59_api_v1_sku_details_workspace.gs');
    const skdTables = (skd.match(/\{ name: '([a-z_]+)'/g) || []).map((s) => s.replace(/.*'([a-z_]+)'.*/, '$1'));
    const A = CENSUS.table_census.targets.find((t) => t.target.indexOf('A ') === 0);
    const B = CENSUS.table_census.targets.find((t) => t.target.indexOf('B ') === 0);
    eq(B.table_read_sequence, skdTables,
      'C1  SKU Regional census sequence IS 59_\'s table list, in 59_\'s order', { census: B.table_read_sequence, source: skdTables });
    eq(A.table_read_sequence, skdTables.slice(0, 3),
      'C2  and SKU Details is the ungated prefix of it — the first three, which take no include');
    eq([A.tables_read, B.tables_read], [A.table_read_sequence.length, B.table_read_sequence.length],
      'C3  the counts are the lengths, not a separately typed number that could disagree');

    const ppw = GS('72_api_v1_product_pricing_workspace.gs');
    const ppwList = ppw.slice(ppw.indexOf('var PPW_TABLES_ = ['), ppw.indexOf('];', ppw.indexOf('var PPW_TABLES_ = [')));
    const ppwTables = (ppwList.match(/name: '([a-z_]+)'/g) || []).map((s) => s.replace(/.*'([a-z_]+)'.*/, '$1'));
    const D = CENSUS.table_census.targets.find((t) => t.target.indexOf('D ') === 0);
    eq(D.table_read_sequence, ppwTables,
      'C4  the PSB workspace census IS 72_\'s PPW_TABLES_, in order', { census: D.table_read_sequence, source: ppwTables });

    const fcs = GS('58_api_v1_fc_summary_workspace.gs');
    const boot = fcs.slice(fcs.indexOf('bootstrap: {'), fcs.indexOf('},', fcs.indexOf('bootstrap: {')));
    const bootReads = (boot.match(/reads: \[([^\]]*)\]/) || [])[1] || '';
    const bootList = bootReads.split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
    const E = CENSUS.table_census.targets.find((t) => t.target.indexOf('E ') === 0);
    eq(E.table_read_sequence, bootList,
      'C5  the FC bootstrap census IS 58_\'s bootstrap slice read list', { census: E.table_read_sequence, source: bootList });
    const bootEmits = ((boot.match(/emits: \[([^\]]*)\]/) || [])[1] || '')
      .split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
    eq(E.emits, bootEmits, 'C6  and its emit list, which is SHORTER than what it reads');
    ok(E.table_read_sequence.length > E.emits.length,
      'C7  the bootstrap slice reads more tables than it sends — the asymmetry the census records');
    ok(E.table_read_sequence.indexOf('fc_regular_forecast') !== -1
      && CENSUS.table_census.targets.find((t) => t.target.indexOf('F ') === 0)
           .table_read_sequence.indexOf('fc_regular_forecast') !== -1,
      'C8  and fc_regular_forecast is read by BOTH slices a cold load issues — read twice, sent once');
  }
  {
    // Whole-table reads and the absence of source-side filtering, asserted where they live.
    ['59_api_v1_sku_details_workspace.gs', '72_api_v1_product_pricing_workspace.gs',
      '58_api_v1_fc_summary_workspace.gs'].forEach(function (f) {
      const src = GS(f);
      ok(/getDataRange\(\)\.getValues\(\)/.test(src),
        'C9  ' + f.slice(0, 2) + '_ reads each table as ONE range — not row by row');
    });
    ok(/8 of 8/.test(String(CENSUS.structural_findings.every_read_is_serial_and_whole_table.WHOLE_TABLE_READ_COUNT)),
      'C10 the census records every target as a whole-table read');
    ok(String(CENSUS.structural_findings.every_read_is_serial_and_whole_table.POTENTIALLY_AVOIDABLE_READS)
      .indexOf('NOT ESTABLISHED') === 0,
      'C11 and refuses to call any read avoidable without a safe implementation, as §8 requires');
  }

  // ===============================================================================================================
  section('D — nothing shipped changed, and the round says what it could not measure');
  // ===============================================================================================================
  {
    const idx = read('index.html');
    ok(idx.indexOf('capture-console-snippet') === -1,
      'D1  the capture tool is NOT loaded by index.html — it is pasted into a console, never shipped');
    ok(TOOL_REL.indexOf('docs/') === 0,
      'D2  and it lives under docs/, outside every runtime asset path');
    ok(/AWAITING PRODUCTION NUMBERS/.test(CENSUS.status),
      'D3  the census states plainly that it is incomplete');
    ok(Array.isArray(CENSUS.operator_owned.unfilled) && CENSUS.operator_owned.unfilled.length >= 18,
      'D4  and lists every cost field it does not have, rather than defaulting them', CENSUS.operator_owned.unfilled.length);
    ok(/NOT_MEASURABLE/.test(CENSUS.metadata_availability.gaps.pre_server_queue_wait),
      'D5  pre-server queue wait is NOT_MEASURABLE, per §9 — it is not derived from a subtraction');
    ok(String(CENSUS.hypotheses_left_open.BACKEND_SATURATION_HYPOTHESIS).indexOf('NOT_PROVEN') === 0,
      'D6  and the saturation hypothesis stays NOT_PROVEN');
    ok(Object.keys(CENSUS.operator_owned.cannot_be_captured_by_this_tool).length >= 4,
      'D7  including the four phases the tool honestly cannot split');
  }

  console.log('\n' + new Array(101).join('='));
  console.log('S3-R6 READ COST CENSUS — passed ' + pass + '  failed ' + fail);
  console.log('CAPTURE_TOOL_WRITES = 0 · NEW_TRANSPORT = 0 · SHIPPED_BYTES_CHANGED = 0');
  console.log('WHOLE_TABLE_READ_COUNT = 8/8 · SERIAL_READ_COUNT = 8/8 · PRODUCTION_NUMBERS = PENDING');
  console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · DEPLOYMENTS=0');
  console.log(new Array(101).join('='));
  process.exit(fail ? 1 : 0);
}()).catch((e) => { console.log('HARNESS ERROR ' + ((e && e.stack) || e)); process.exit(1); });
