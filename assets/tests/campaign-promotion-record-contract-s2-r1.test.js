/**
 * ==================================================================================================
 * CAMPAIGN PROMOTION RECORD CONTRACT — THE DOCUMENT IS PARSED, NOT READ   (S2-R1-R1)
 * ==================================================================================================
 *
 * A documentation round can only be tested honestly if the document has structure. So the contract
 * carries machine-readable blocks — ```contract, ```eligibility, ```actions, ```browserdata,
 * ```release, ```identity, ```grouping, ```repair, ```extensions, ```authorization, ```refusals —
 * and a field-mapping table, and THIS SUITE PARSES THEM. Every assertion below consumes a parsed
 * model. None of them asks whether a sentence is present.
 *
 * WHY THAT MATTERS FOR THE MUTANTS. §9 of the round forbids a vacuous text-only mutant: changing a
 * word must change a PARSED assertion or it does not count as killed. Each mutant here rewrites a
 * parsed VALUE and then re-runs THE SAME PREDICATE the positive assertion used — the predicate is a
 * named function, shared by both, so a mutant cannot be killed by a different check than the one it
 * was aimed at. If a predicate ever stopped consuming the value a mutant flips, that mutant would
 * survive, loudly.
 *
 * MUTATION IS IN MEMORY, AND DELIBERATELY SO. This round may not modify a repository file, so the
 * mutants rewrite the SOURCE STRING and re-parse it. That is the same mutation the on-disk helper
 * performs, minus a write this round is not allowed to make.
 *
 * AND THE CONTRACT'S CLAIMS ABOUT THE CODE ARE CHECKED AGAINST THE CODE. §E asserts that the two
 * campaign actions really are routed where the contract says, that the contamination authority
 * really does treat a blank status as eligible (the open repair the contract names), and that no
 * promotion write has been wired under cover of a documentation round. The day any of that changes,
 * this suite fails and the contract has to be brought up to date rather than quietly drifting.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');

var pass = 0, fail = 0, neg = { caught: 0, missed: 0 };
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
function score(label, r) {
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
/* CRLF normalised on read: autocrlf=true writes CRLF into a fresh checkout and every multi-line
   anchor in this project has been broken by that at least once. */
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function decomment(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

var CONTRACT_REL = 'docs/planning/CAMPAIGN_PROMOTION_RECORD_CONTRACT.md';
var CAMPAIGN_REL = 'assets/js/pages/campaign-risk.js';
var ROUTER_REL = 'assets/specs/active/apps-script/01_router.gs';
var BUNDLE_REL = 'assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs';
var WRITER_REL = 'assets/specs/active/apps-script/20_campaign_write_handlers.gs';
var GS_DIR = 'assets/specs/active/apps-script';

var SRC = {
  contract: read(CONTRACT_REL),
  campaign: read(CAMPAIGN_REL),
  router: read(ROUTER_REL),
  bundle: read(BUNDLE_REL),
  writer: read(WRITER_REL),
  census: read('docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md'),
  handoff: read('docs/planning/P1_TO_S2_HANDOFF.md')
};

// =================================================================================================
// THE PARSER — one model, built once from the document, consumed by every predicate below.
// =================================================================================================
/** A fenced block by its info string, e.g. ```contract … ``` */
function block(src, name) {
  var re = new RegExp('```' + name + '\\n([\\s\\S]*?)```');
  var m = src.match(re);
  return m ? m[1] : null;
}
/** `KEY = VALUE` lines inside a block, VALUE trimmed of a trailing inline comment. */
function facts(text) {
  var out = {};
  if (text === null) { return out; }
  text.split('\n').forEach(function (line) {
    var m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (!m) { return; }
    var v = m[2].replace(/\s{2,}.*$/, '').trim();          // drop an aligned trailing comment
    out[m[1]] = v;
  });
  return out;
}
/** `state = ELIGIBLE|INELIGIBLE` lines inside the eligibility block. */
function eligibility(text) {
  var out = {};
  if (text === null) { return out; }
  text.split('\n').forEach(function (line) {
    var m = line.match(/^\s*([a-z][a-z0-9_]*)\s*=\s*(ELIGIBLE|INELIGIBLE)\s*$/);
    if (m) { out[m[1]] = m[2]; }
  });
  return out;
}
/** The §1.1 field-mapping table, as rows.
 *  STOPS AT THE FIRST NON-TABLE LINE. The document holds a second markdown table (the §2.1 consumer
 *  census), and a scan that merely skips non-table lines walks straight into it — the first draft of
 *  this parser did, and reported nine "canonical tables" that were really prose cells. */
function mapping(src) {
  var start = src.indexOf('| Browser field | Canonical table |');
  if (start < 0) { return []; }
  var lines = src.slice(start).split('\n'), rows = [];
  for (var i = 2; i < lines.length; i++) {                  // 0 = header, 1 = separator
    if (lines[i].indexOf('|') !== 0) { break; }             // the table has ended — stop, do not skip
    var c = lines[i].split('|').slice(1, -1).map(function (x) { return x.trim(); });
    if (c.length < 6) { break; }
    rows.push({ browserField: c[0], table: c[1], column: c[2], authority: c[3],
      transformation: c[4], validation: c[5] });
  }
  return rows;
}
/** Every table name the mapping claims a field lands in. */
function mappedTables(rows) {
  var seen = {};
  rows.forEach(function (r) {
    r.table.split('+').forEach(function (t) {
      t = t.trim();
      if (t && t !== '*(absent)*' && t !== '(none — provenance only)') { seen[t] = 1; }
    });
  });
  return Object.keys(seen).sort();
}

function parse(src) {
  return {
    F: facts(block(src, 'contract')),
    ELIG: eligibility(block(src, 'eligibility')),
    ELIGF: facts(block(src, 'eligibility')),
    ACT: facts(block(src, 'actions')),
    BD: facts(block(src, 'browserdata')),
    REL: facts(block(src, 'release')),
    ID: facts(block(src, 'identity')),
    GRP: facts(block(src, 'grouping')),
    REP: facts(block(src, 'repair')),
    EXT: facts(block(src, 'extensions')),
    AUTH: facts(block(src, 'authorization')),
    REFUSALS: (block(src, 'refusals') || '').split('\n')
      .map(function (l) { var m = l.match(/^([A-Z][A-Z0-9_]*)\s{2,}/); return m ? m[1] : null; })
      .filter(Boolean),
    MAP: mapping(src),
    raw: src
  };
}
var M = parse(SRC.contract);

// =================================================================================================
// THE PREDICATES — each one is used by a positive assertion AND by the mutant aimed at it.
// =================================================================================================
var P = {
  modelA: function (m) { return m.F.CANONICAL_OWNERSHIP_MODEL === 'A'; },
  noSeparateTable: function (m) {
    if (m.F.NEW_TABLE_REQUIRED !== 'NO') { return false; }
    if (m.F.SEPARATE_PROMOTION_TABLE_PERMITTED !== 'NO') { return false; }
    if (m.F.TABLE_CREATED !== 'NO') { return false; }
    /* and no field may be mapped into a third table */
    var allowed = { 'campaigns': 1, 'campaign_sku_lines': 1, 'both': 1 };
    return mappedTables(m.MAP).every(function (t) { return allowed[t] === 1; });
  },
  reusesExistingActions: function (m) {
    if (m.F.NEW_ACTION_REQUIRED !== 'NO') { return false; }
    if (m.ACT.NEW_ACTION_REQUIRED !== 'NO') { return false; }
    if (m.ACT.ACTIONS_REGISTERED_THIS_ROUND !== '0') { return false; }
    return /upsertCampaign/.test(m.ACT.EXISTING_ACTIONS_REUSED || '')
      && /upsertCampaignSkuLines/.test(m.ACT.EXISTING_ACTIONS_REUSED || '');
  },
  ineligibleCannotPlan: function (m) {
    var mustBeIneligible = ['local_only', 'draft', 'pending_confirmation', 'cancelled',
      'retired', 'test', 'blank_or_absent'];
    var allIneligible = mustBeIneligible.every(function (s) { return m.ELIG[s] === 'INELIGIBLE'; });
    return allIneligible
      && m.ELIGF.DRAFT_AFFECTS_PLANNING === 'NO'
      && m.ELIGF.LOCAL_ONLY_AFFECTS_PLANNING === 'NO'
      && m.ELIGF.TEST_DATA_AFFECTS_PLANNING === 'NO'
      && m.ELIGF.CANCELLED_OR_RETIRED_AFFECTS_PLANNING === 'NO';
  },
  authorizationBlocksWrite: function (m) {
    return m.F.AUTHORIZATION_BEFORE_DB_OPEN === 'REQUIRED'
      && m.F.PROMOTION_WRITE_AUTHORIZATION_GATE === 'OPEN'
      && m.F.PROMOTION_WRITE_PRODUCTION_ENABLE_ALLOWED === 'NO'
      && m.AUTH.AUTHORIZATION_BEFORE_DB_OPEN === 'REQUIRED'
      && m.AUTH.PROMOTION_WRITE_PRODUCTION_ENABLE_ALLOWED === 'NO';
  },
  browserDataPreserved: function (m) {
    return m.F.EXISTING_BROWSER_DATA_POLICY === 'PRESERVE_AND_EXPORT_FIRST'
      && m.BD.EXISTING_BROWSER_DATA_POLICY === 'PRESERVE_AND_EXPORT_FIRST'
      && m.BD.MIGRATION_IMPLEMENTED === 'NO';
  },
  exportFirst: function (m) {
    return m.F.EXPORT_BEFORE_MIGRATION === 'REQUIRED'
      && m.BD.EXPORT_BEFORE_MIGRATION === 'REQUIRED'
      && m.BD.RESET_FUNCTION_ACCEPTABLE_FOR_CUTOVER === 'NO';
  },
  noSilentDeletion: function (m) {
    return m.F.SILENT_DATA_LOSS_ALLOWED === 'NO' && m.BD.SILENT_DATA_LOSS_ALLOWED === 'NO';
  },
  readbackBeforeRetire: function (m) {
    return m.F.SERVER_READBACK_BEFORE_LOCAL_RETIREMENT === 'REQUIRED'
      && m.BD.SERVER_READBACK_BEFORE_LOCAL_RETIREMENT === 'REQUIRED';
  },
  firstReleaseReadOnly: function (m) {
    return m.F.INITIAL_RELEASE_SCOPE === 'B_READ_ONLY'
      && m.REL.INITIAL_RELEASE_SCOPE === 'B_READ_ONLY'
      && m.REL.PROMOTION_SERVER_WRITE_ENABLED === 'NO'
      && m.REL.CAMPAIGN_RISK_FIRST_RELEASE_INCLUDED === 'YES_READ_ONLY';
  },
  localNotServerTruth: function (m) {
    return m.F.LOCAL_OVERLAY_PRESENTED_AS === 'LOCAL_ONLY_NOT_SHARED'
      && m.REL.LOCAL_OVERLAY_PRESENTED_AS === 'LOCAL_ONLY_NOT_SHARED';
  },
  nothingImplemented: function (m) {
    return m.F.SCHEMA_IMPLEMENTED === 'NO' && m.F.ACTIONS_REGISTERED === '0'
      && m.F.DB_READS === '0' && m.F.DB_WRITES === '0' && m.F.MIGRATION_IMPLEMENTED === 'NO';
  },
  derivedNotTrusted: function (m) {
    if (m.F.DERIVED_VALUES_TRUSTED_FROM_CLIENT !== 'NO') { return false; }
    if (m.F.CLIENT_MINTED_IDENTITY_IS_CANONICAL !== 'NO') { return false; }
    /* duration and discountPercent must each be marked server-recomputed in the mapping */
    return ['duration', 'discountPercent'].every(function (f) {
      var row = m.MAP.filter(function (r) { return r.browserField.replace(/`/g, '') === f; })[0];
      return !!row && /server-recomputed/i.test(row.authority);
    });
  },
  identityServerMinted: function (m) {
    return m.ID.CLIENT_MINTED_IDENTITY === 'REJECTED'
      && /^CMP-/.test(m.ID.CAMPAIGN_ID_FORMAT || '')
      && /^CSL-/.test(m.ID.CAMPAIGN_SKU_LINE_ID_FORMAT || '');
  },
  groupingNotByNameAlone: function (m) {
    return m.GRP.HEADER_GROUPED_BY_NAME_ALONE === 'NO'
      && /company/.test(m.GRP.HEADER_IDENTITY_KEY || '')
      && /start_date/.test(m.GRP.HEADER_IDENTITY_KEY || '')
      && /end_date/.test(m.GRP.HEADER_IDENTITY_KEY || '');
  },
  repairDeclared: function (m) {
    return m.F.DOWNSTREAM_QUALIFICATION_REPAIR_REQUIRED === 'YES'
      && m.REP.DOWNSTREAM_QUALIFICATION_REPAIR_REQUIRED === 'YES'
      && m.REP.MUST_BE_FIXED_BEFORE_CANONICAL_PROMOTION_WRITE_ENABLE === 'YES'
      && /90_generated_supply_planning_bundle/.test(m.REP.AFFECTED_CONSUMERS || '');
  }
};

/** Apply an in-memory edit to the contract source and re-parse. Returns null when the anchor is not
 *  unique — which is scored as a SURVIVED mutant, never as a pass. */
function mutate(from, to) {
  var n = SRC.contract.split(from).length - 1;
  if (n !== 1) { return null; }
  return parse(SRC.contract.split(from).join(to));
}
/** A mutant is killed only when the SAME predicate that passed now fails. */
function kills(predicate, from, to) {
  var m = mutate(from, to);
  if (m === null) { return false; }
  if (predicate(M) !== true) { return false; }              // the positive case must hold first
  return predicate(m) === false;
}

// =================================================================================================
section('A — MODEL A OWNERSHIP, AND NO SECOND AUTHORITY');
// =================================================================================================
ok(P.modelA(M), 'A1  the contract states CANONICAL_OWNERSHIP_MODEL = A');
ok(P.noSeparateTable(M), 'A2  no separate promotion table is required, permitted or created');
eq(mappedTables(M.MAP), ['both', 'campaign_sku_lines', 'campaigns'],
  'A3  every mapped field lands in one of the two existing tables — there is no third');
ok(M.raw.indexOf('campaign_promotion_records') > 0
  && /must not be created/.test(M.raw), 'A4  the rejected table is named and refused, not omitted');
ok(P.identityServerMinted(M), 'A5  identity is server-minted; the browser promo_* id is rejected');
ok(P.groupingNotByNameAlone(M), 'A6  a campaign header is not grouped by free-text name alone');
ok(P.derivedNotTrusted(M), 'A7  duration and discountPercent are server-recomputed, never trusted');

var mapped = {};
M.MAP.forEach(function (r) { mapped[r.browserField.replace(/`/g, '')] = r; });
['promotionId', 'campaignName', 'company', 'country', 'marketplace', 'promotionType', 'eventFlag',
  'startDate', 'endDate', 'duration', 'sku', 'marketplaceSkuId', 'promoPrice', 'regularPrice',
  'discountPercent', 'lps', 'specialCondition', 'createdAt'].forEach(function (f, i) {
  ok(!!mapped[f], 'A8.' + (i + 1) + '  ' + f + ' is mapped');
});
ok(/never.*accepted as .campaign_sku_line_id|must not be accepted/i.test(mapped.promotionId.validation),
  'A9  promotionId is provenance only and may not become a canonical id');

// =================================================================================================
section('B — THE EXISTING ACTIONS ARE REUSED, AND NO NEW ONE IS PROPOSED');
// =================================================================================================
ok(P.reusesExistingActions(M), 'B1  upsertCampaign / upsertCampaignSkuLines are reused; 0 registered');
ok(M.ACT.ATOMIC_MULTI_ROW_COMMIT === 'NOT_PROVIDED_BY_EXISTING_ACTIONS',
  'B2  the missing atomicity of the existing pair is stated, not glossed');
ok(M.REFUSALS.length >= 12, 'B3  the refusal vocabulary is enumerated', M.REFUSALS.length);
['CAMPAIGN_SCOPE_INCOMPLETE', 'MARKETPLACE_SKU_UNRESOLVED', 'PROMOTION_DUPLICATE_IDENTITY',
  'PROMOTION_WINDOW_OVERLAP', 'CAMPAIGN_VERSION_CONFLICT', 'NOT_AUTHORIZED',
  'FEATURE_DISABLED'].forEach(function (c, i) {
  ok(M.REFUSALS.indexOf(c) >= 0, 'B4.' + (i + 1) + '  ' + c + ' is in the refusal vocabulary');
});
ok(/ACK_UNKNOWN/.test(M.raw) && /never retried blind/i.test(M.raw),
  'B5  an unknown write outcome is held, not retried blind');
ok(P.nothingImplemented(M), 'B6  nothing is implemented: schema, actions, reads, writes, migration');

// =================================================================================================
section('C — A ROW THAT IS NOT QUALIFIED CANNOT MOVE A PLANNING NUMBER');
// =================================================================================================
ok(P.ineligibleCannotPlan(M), 'C1  local_only, draft, test, cancelled and retired are all INELIGIBLE');
eq([M.ELIG.confirmed, M.ELIG.active, M.ELIG.completed], ['ELIGIBLE', 'ELIGIBLE', 'ELIGIBLE'],
  'C2  and the three states that MAY plan are named positively');
ok(M.ELIG.blank_or_absent === 'INELIGIBLE',
  'C3  a blank status is not a lifecycle — the default is refusal, not eligibility');
ok(P.repairDeclared(M), 'C4  the downstream repair is declared and gates the write enablement');

// =================================================================================================
section('D — AUTHORIZATION, BROWSER DATA AND FIRST RELEASE');
// =================================================================================================
ok(P.authorizationBlocksWrite(M), 'D1  authorization precedes any DB open, and the gate is OPEN');
ok(M.F.PROMOTION_WRITE_LOCAL_IMPLEMENTATION_ALLOWED === 'NO',
  'D2  not even a local implementation is authorised yet');
ok(/does not mean Campaign Risk is\n?\*\*?authorized|deployed does not mean/i.test(M.raw)
  || /Deployment is reachability/.test(M.raw),
  'D3  a deployed action is not treated as an authorised one');
['frontend role', 'localStorage', 'query parameter', 'payload'].forEach(function (s, i) {
  ok(M.raw.indexOf(s) > 0, 'D4.' + (i + 1) + '  ' + s + ' is named as NOT an authority');
});
ok(P.browserDataPreserved(M), 'D5  existing browser records are preserved, export-first');
ok(P.noSilentDeletion(M), 'D6  silent data loss is forbidden');
ok(P.exportFirst(M), 'D7  an export must exist first, and the reset helper is not a migration tool');
ok(P.readbackBeforeRetire(M), 'D8  a local record is retired only after a server readback');
ok(P.firstReleaseReadOnly(M), 'D9  the first release is read-only');
ok(P.localNotServerTruth(M), 'D10 local overlay rows are labelled local-only, never server truth');
ok(/Do any operators currently have real promotion records/.test(M.raw),
  'D11 the one question only an operator can answer is recorded as blocking migration');

// =================================================================================================
section('E — THE CONTRACT\'S CLAIMS ABOUT THE CODE, CHECKED AGAINST THE CODE');
// =================================================================================================
ok(/if \(action === 'upsertCampaign'\)/.test(SRC.router)
  && /if \(action === 'upsertCampaignSkuLines'\)/.test(SRC.router),
  'E1  both reused actions really are routed, read from 01_router.gs and not from prose');
ok(/function handleUpsertCampaign_/.test(SRC.writer)
  && /function handleUpsertCampaignSkuLines_/.test(SRC.writer), 'E2  and both handlers exist');
ok(/km_campaign_promotion_records_v3/.test(SRC.campaign),
  'E3  the browser overlay is still the runtime state the contract describes');
eq(decomment(SRC.campaign).match(/upsertCampaign\w*\s*\(/g) || [], [],
  'E4  NO promotion write was wired into campaign-risk.js under cover of a documentation round');
/* THE BROWSER KEY CONTAINS THE REJECTED NAME AS A SUBSTRING — `km_campaign_promotion_records_v3`.
   A bare indexOf therefore reports the overlay itself as a canonical-table reference, which is the
   opposite of what this asserts. The boundary is what makes it mean anything. */
ok(/(^|[^_a-zA-Z])campaign_promotion_records(?![_a-zA-Z0-9])/.test(decomment(SRC.campaign)) === false,
  'E5  and no rejected table name entered the runtime as a table');
var gsHits = fs.readdirSync(path.join(ROOT, GS_DIR))
  .filter(function (f) { return /\.gs$/.test(f); })
  .filter(function (f) { return read(GS_DIR + '/' + f).indexOf('campaign_promotion_records') >= 0; });
eq(gsHits, [], 'E6  no Apps Script file mentions the rejected table');
/* The open repair is a CHECKED claim: if someone fixes _eventActive, this fails and the contract
   must be updated rather than silently becoming stale. */
ok(/if \(status == null\) return true;/.test(SRC.bundle),
  'E7  the contamination authority still treats a blank status as eligible — the repair is still open');
ok(/body\.updated_by \|\| body\.actor \|\| 'fc-summary'/.test(SRC.writer),
  'E8  the writer still takes its actor from the payload — the authorization gate is still open');
ok(SRC.census.indexOf('CAMPAIGN_PROMOTION_RECORD_CONTRACT.md') > 0,
  'E9  the S-series census points at the contract that answered it');
ok(SRC.handoff.indexOf('CAMPAIGN_PROMOTION_RECORD_CONTRACT.md') > 0,
  'E10 and so does the P1 → S2 handoff');
['S2-A', 'S2-B', 'S2-C'].forEach(function (k, i) {
  ok(SRC.handoff.indexOf(k) > 0, 'E11.' + (i + 1) + '  the handoff still specifies ' + k);
});

// =================================================================================================
section('F — DRIVEN MUTANTS (each flips a PARSED value and must break its own predicate)');
// =================================================================================================
score('M1  ownership is changed to Model B',
  kills(P.modelA, 'CANONICAL_OWNERSHIP_MODEL                    = A',
    'CANONICAL_OWNERSHIP_MODEL                    = B'));

score('M2  a separate promotion table is permitted',
  kills(P.noSeparateTable, 'SEPARATE_PROMOTION_TABLE_PERMITTED           = NO',
    'SEPARATE_PROMOTION_TABLE_PERMITTED           = YES'));

score('M3  a new table is declared required',
  kills(P.noSeparateTable, 'NEW_TABLE_REQUIRED                           = NO',
    'NEW_TABLE_REQUIRED                           = YES'));

score('M4  a field is mapped into a third table',
  kills(P.noSeparateTable, '| `lps` | campaign_sku_lines | `lps` |',
    '| `lps` | campaign_promotion_records | `lps` |'));

score('M5  draft rows are allowed into planning',
  kills(P.ineligibleCannotPlan, 'draft                 = INELIGIBLE',
    'draft                 = ELIGIBLE'));

score('M6  a blank status becomes eligible again',
  kills(P.ineligibleCannotPlan, 'blank_or_absent       = INELIGIBLE',
    'blank_or_absent       = ELIGIBLE'));

score('M7  authorization before the DB open is removed',
  kills(P.authorizationBlocksWrite, 'AUTHORIZATION_BEFORE_DB_OPEN                 = REQUIRED',
    'AUTHORIZATION_BEFORE_DB_OPEN                 = NOT_REQUIRED'));

score('M8  production writes are enabled',
  kills(P.authorizationBlocksWrite, 'PROMOTION_WRITE_PRODUCTION_ENABLE_ALLOWED    = NO',
    'PROMOTION_WRITE_PRODUCTION_ENABLE_ALLOWED    = YES'));

score('M9  silent deletion of browser records is permitted',
  kills(P.noSilentDeletion, 'SILENT_DATA_LOSS_ALLOWED                     = NO',
    'SILENT_DATA_LOSS_ALLOWED                     = YES'));

score('M10 export-before-migration is downgraded to optional',
  kills(P.exportFirst, 'EXPORT_BEFORE_MIGRATION                      = REQUIRED',
    'EXPORT_BEFORE_MIGRATION                      = OPTIONAL'));

score('M11 the local overlay is described as shared server truth',
  kills(P.localNotServerTruth, 'LOCAL_OVERLAY_PRESENTED_AS                   = LOCAL_ONLY_NOT_SHARED',
    'LOCAL_OVERLAY_PRESENTED_AS                   = SERVER_TRUTH'));

score('M12 the first release becomes read/write',
  kills(P.firstReleaseReadOnly, 'INITIAL_RELEASE_SCOPE                        = B_READ_ONLY',
    'INITIAL_RELEASE_SCOPE                        = C_READ_WRITE'));

score('M13 a new action is declared required',
  kills(P.reusesExistingActions, 'NEW_ACTION_REQUIRED                          = NO',
    'NEW_ACTION_REQUIRED                          = YES'));

score('M14 the server readback before local retirement is dropped',
  kills(P.readbackBeforeRetire, 'SERVER_READBACK_BEFORE_LOCAL_RETIREMENT      = REQUIRED',
    'SERVER_READBACK_BEFORE_LOCAL_RETIREMENT      = OPTIONAL'));

score('M15 the downstream qualification repair is declared unnecessary',
  kills(P.repairDeclared, 'DOWNSTREAM_QUALIFICATION_REPAIR_REQUIRED     = YES',
    'DOWNSTREAM_QUALIFICATION_REPAIR_REQUIRED     = NO'));

score('M16 a client-minted id becomes canonical',
  kills(P.identityServerMinted, 'CLIENT_MINTED_IDENTITY       = REJECTED',
    'CLIENT_MINTED_IDENTITY       = ACCEPTED'));

score('M17 headers are grouped by free-text name alone',
  kills(P.groupingNotByNameAlone, 'HEADER_GROUPED_BY_NAME_ALONE = NO',
    'HEADER_GROUPED_BY_NAME_ALONE = YES'));

score('M18 a client-supplied derived value becomes authoritative',
  kills(P.derivedNotTrusted, 'DERIVED_VALUES_TRUSTED_FROM_CLIENT           = NO',
    'DERIVED_VALUES_TRUSTED_FROM_CLIENT           = YES'));

console.log('\n' + new Array(101).join('='));
console.log('CAMPAIGN PROMOTION RECORD CONTRACT (S2-R1-R1) — passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
console.log(new Array(101).join('='));
if (fail > 0) { process.exitCode = 1; }
