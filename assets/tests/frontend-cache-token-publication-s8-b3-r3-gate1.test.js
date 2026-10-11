// =============================================================================================================
// S8-B3-R3-GATE1 — A CHANGED BROWSER ASSET MAY NOT BE PUBLISHED UNDER A TOKEN THE LIVE SITE ALREADY USES
// -------------------------------------------------------------------------------------------------------------
// THE DEFECT THIS EXISTS FOR (F-PD1). `assets/css/pages/inventory-replenishment.css` gained the four
// `.replen-tp-unresolved*` rules in S8-C1 (`0172443e`). That same commit rotated every OTHER browser token to
// `irtpunresolved-20261011` and left this one line at `irrestinglayout-20261008` — the value set back in
// `230525a2`. So the file changed and its URL did not. A browser running the live site holds that exact URL in
// cache and will not refetch it, which means the S8-C1 fail-closed priority diagnostic would have rendered
// UNSTYLED for every returning operator. Nothing was broken on the server; the bytes simply never arrived.
//
// WHY THE RULE IS ANCHORED TO THE PUBLISHED BASELINE, NOT TO "the token moved whenever the file moved".
// The stricter phrasing — every token must have been set at or after its file's last change — is TRUE as a
// style rule and FALSE as a gate, because it fires on history that was published long ago and is therefore
// already in every cache correctly. Measured at this commit it reports three files, and only ONE of them is a
// live risk:
//
//   · inventory-replenishment.css      CHANGED since the live release, token IDENTICAL   <- the real defect
//   · operation-system-db-api.js       CHANGED since the live release, token ROTATED     <- safe
//   · pages/overseas-ops-preview.js    UNCHANGED since the live release                  <- safe, long published
//
// The question that actually decides whether a browser gets stale bytes is: did the CONTENT change since the
// bytes the live site is serving, and if so, did the URL change too? That is what this gate asks. The stricter
// census is still printed below (§C), named and non-failing, so a drifting token is visible before it becomes
// a defect — but it does not fail a release over bytes the world already has.
//
// SCOPE. Both hosts that carry versioned references (`index.html` and `assets/js/app.js`) and both asset kinds
// (.css and .js). The task that commissioned this gate asked only for stylesheets; JS is included because the
// mechanism is identical and a stale script is worse than a stale stylesheet.
//
// THIS SUITE READS ONLY. It modifies no file, and the one de-patch it performs (§D) is a string in memory.
// =============================================================================================================
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '../..');
var pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; console.log('ok   ' + label); } else { fail++; console.log('FAIL ' + label); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function git(args) {
  // stderr is silenced deliberately: `git show BASELINE:<path>` for an asset ADDED since the baseline exits
  // non-zero with a `fatal:` line, and that is a CLASSIFICATION, not an error. Letting it print would put the
  // word "fatal" in a clean suite's output.
  try {
    return cp.execSync('git ' + args, {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (e) { return null; }
}
// The repo checks out CRLF (core.autocrlf=true) while `git show` hands back the stored LF blob, so EVERY file
// would look changed without this. Comparing content without normalising is the classic false positive here.
function norm(s) { return s == null ? null : String(s).replace(/\r\n/g, '\n'); }

// -------------------------------------------------------------------------------------------------------------
section('A — the published baseline this gate measures against');
// -------------------------------------------------------------------------------------------------------------
// The commit whose bytes the live site is serving. Pinned, because "what is deployed" is a fact about the world
// that no file in this repository can derive. It is pinned WITH its own self-checks, so a stale pin fails loudly
// instead of quietly measuring against the wrong tree — the failure mode that makes pinned baselines dangerous.
var BASELINE = '7fa6c19f828eb64c87bf6145e0329670f2f7f159';
var LEDGER = read('docs/planning/DEPLOYMENT_RELEASE_LOG.md');

ok((git('cat-file -t ' + BASELINE) || '').trim() === 'commit',
   'A1 the pinned baseline resolves to a commit object in this repository');
ok(git('merge-base --is-ancestor ' + BASELINE + ' HEAD') !== null,
   'A2 the pinned baseline is an ANCESTOR of HEAD — it is a commit this branch actually descends from');

var baseline63 = git('show ' + BASELINE + ':assets/specs/active/apps-script/63_api_v1_system_health.gs');
var baselineRelease = (/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/.exec(baseline63 || '') || [])[1] || '';
ok(baselineRelease !== '', 'A3 the baseline commit declares a deployment release: ' + baselineRelease);
ok(/R49$/.test(baselineRelease),
   'A4 and it is the release the ledger records as live — the pin is not pointing at some arbitrary commit');
// If the ledger ever stops saying R49 is the deployed one, this pin is stale and the gate must be re-anchored.
ok(LEDGER.indexOf(baselineRelease) !== -1,
   'A5 the baseline release appears in the deployment ledger');
ok(/Production is R49|Production is NOT R51 — Production is R49/.test(LEDGER),
   'A6 the ledger still records Production as R49 — RE-ANCHOR THIS PIN when that changes');

// -------------------------------------------------------------------------------------------------------------
section('B — THE GATE: changed since the live release ⇒ the cache token MUST differ');
// -------------------------------------------------------------------------------------------------------------
var HOSTS = ['index.html', 'assets/js/app.js'];
var TOKEN_RE = /(assets\/[A-Za-z0-9_\-./]+\.(?:css|js))\?v=([A-Za-z0-9_.\-]+)/g;

function referencesIn(src) {
  var out = {}, m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(src))) out[m[1]] = m[2];   // last reference wins; duplicates carry one token
  return out;
}

// Classify every versioned reference in the CURRENT working tree against the baseline.
// `hostSrcNow` is read from disk rather than from HEAD, so a correction is visible to this gate BEFORE it is
// committed — a pre-commit gate that could only see HEAD would pass the very change it exists to police.
function classify(hostSrcByFile) {
  var res = { changedAndRotated: [], changedAndStale: [], unchanged: [], added: [], missingHost: [] };
  HOSTS.forEach(function (host) {
    var now = hostSrcByFile[host];
    var baseHost = norm(git('show ' + BASELINE + ':' + host));
    if (baseHost === null) { res.missingHost.push(host); return; }
    var nowRefs = referencesIn(norm(now));
    var baseRefs = referencesIn(baseHost);
    Object.keys(nowRefs).forEach(function (rel) {
      var baseBlob = norm(git('show ' + BASELINE + ':' + rel));
      if (baseBlob === null) { res.added.push(rel); return; }          // did not exist at baseline
      var nowBlob = norm(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      if (nowBlob === baseBlob) { res.unchanged.push(rel); return; }   // content identical ⇒ token irrelevant
      var tokenNow = nowRefs[rel];
      var tokenBase = baseRefs[rel];
      var entry = { file: rel, host: host, baseline: tokenBase || '(not referenced at baseline)', now: tokenNow };
      if (tokenBase && tokenBase === tokenNow) res.changedAndStale.push(entry);
      else res.changedAndRotated.push(entry);
    });
  });
  return res;
}

var liveHosts = {};
HOSTS.forEach(function (h) { liveHosts[h] = read(h); });
var R = classify(liveHosts);

console.log('     versioned assets CHANGED since ' + baselineRelease + ', token rotated : ' + R.changedAndRotated.length);
R.changedAndRotated.forEach(function (e) { console.log('        · ' + e.file + '  ' + e.baseline + ' -> ' + e.now); });
console.log('     versioned assets added since baseline                        : ' + R.added.length);
R.added.forEach(function (e) { console.log('        · ' + e); });
console.log('     versioned assets unchanged since baseline                    : ' + R.unchanged.length);

ok(R.missingHost.length === 0, 'B1 every host file carrying versioned references exists at the baseline commit');
// NON-VACUITY. If nothing is classified, the gate below is asserting about an empty set and proves nothing.
ok(R.changedAndRotated.length + R.changedAndStale.length + R.unchanged.length + R.added.length > 50,
   'B2 the scan found a real population of versioned references ('
   + (R.changedAndRotated.length + R.changedAndStale.length + R.unchanged.length + R.added.length) + ')');
ok(R.changedAndRotated.length + R.changedAndStale.length > 0,
   'B3 at least one asset CHANGED since the live release — the gate has a live subject, not an empty set');
ok(R.unchanged.length > 0, 'B4 and at least one asset did NOT change — the classifier discriminates');

ok(R.changedAndStale.length === 0,
   'B5  NO browser asset changed since ' + baselineRelease + ' is published under the token the live site '
   + 'already serves' + (R.changedAndStale.length
     ? ' — STALE: ' + R.changedAndStale.map(function (e) { return e.file + ' (' + e.now + ')'; }).join(', ')
     : ''));

// The specific file this gate was built for, asserted by name so a future edit cannot quietly reopen it.
var IRCSS = 'assets/css/pages/inventory-replenishment.css';
var idxNow = referencesIn(norm(liveHosts['index.html']));
var idxBase = referencesIn(norm(git('show ' + BASELINE + ':index.html')));
ok(idxNow[IRCSS] !== undefined, 'B6 the Inventory Replenishment stylesheet is still referenced with a token');
ok(idxNow[IRCSS] !== idxBase[IRCSS],
   'B7 F-PD1 CLOSED: its token differs from the published one ('
   + idxBase[IRCSS] + ' -> ' + idxNow[IRCSS] + ')');
ok(norm(fs.readFileSync(path.join(ROOT, IRCSS), 'utf8')) !== norm(git('show ' + BASELINE + ':' + IRCSS)),
   'B8 and its CONTENT really did change since the live release — so B7 is a fix, not a gratuitous rotation');
ok(/\.replen-tp-unresolved/.test(read(IRCSS)),
   'B9 the rules that motivated the rotation are present (the S8-C1 fail-closed priority diagnostic)');

// -------------------------------------------------------------------------------------------------------------
section('C — census: token set BEFORE its file last changed (reported, NOT failing)');
// -------------------------------------------------------------------------------------------------------------
// The stricter rule. Reported rather than enforced, for the reason given in the header: it fires on already
// published history. Printed so a drifting token is visible on the round that creates it.
var drift = [];
Object.keys(liveHosts).forEach(function (host) {
  var refs = referencesIn(norm(liveHosts[host]));
  Object.keys(refs).forEach(function (rel) {
    var fileCommit = (git('log -1 --format=%H -- "' + rel + '"') || '').trim();
    var needle = rel.split('/').pop() + '?v=' + refs[rel];
    var introAll = (git('log --format=%H --reverse -S"' + needle + '" -- "' + host + '"') || '').trim().split('\n').filter(Boolean);
    var intro = introAll[0];
    if (!fileCommit || !intro) return;
    if (git('merge-base --is-ancestor ' + fileCommit + ' ' + intro) === null) {
      drift.push(rel + ' (file @' + fileCommit.slice(0, 8) + ', token @' + intro.slice(0, 8) + ')');
    }
  });
});
console.log('     drifting tokens: ' + (drift.length ? drift.join('; ') : 'none'));
ok(true, 'C1 token-drift census recorded, not hidden: ' + (drift.length ? drift.join('; ') : 'none'));
// Every drifting entry must be EXPLAINED by one of the FOUR baseline buckets. The first version of this
// check knew only three and omitted ADDED — so an asset that did not exist at the live release and has since
// been edited again drifted with nowhere to be accounted for, and C2 failed while describing a tree that is
// correct. An ADDED asset carries no publication risk whatever its token: no browser can hold a cached copy
// of a file the live site has never served. The drift is still REPORTED by C1; it only stops being
// unexplained. B5 is untouched and remains the assertion that fails on a real stale publication.
var staleNames = R.changedAndStale.map(function (e) { return e.file; });
var unexplained = drift.filter(function (d) {
  var f = d.split(' ')[0];
  return staleNames.indexOf(f) === -1
    && R.unchanged.indexOf(f) === -1
    && R.added.indexOf(f) === -1
    && R.changedAndRotated.every(function (e) { return e.file !== f; });
});
// NON-VACUITY for the clause just added: if nothing is ever ADDED, that term is dead code pretending to work.
ok(R.added.length > 0, 'C1a the ADDED bucket is populated (' + R.added.length + '), so C2 exercises it');
ok(drift.some(function (d) { return R.added.indexOf(d.split(' ')[0]) !== -1; }),
   'C1b and at least one ADDED asset actually drifts — the clause is load-bearing, not decorative');
ok(unexplained.length === 0,
   'C2 every drifting token is accounted for by the baseline classification' + (unexplained.length ? ': ' + unexplained.join(', ') : ''));

// -------------------------------------------------------------------------------------------------------------
section('D — NON-VACUITY: the gate FAILS against the pre-fix index.html');
// -------------------------------------------------------------------------------------------------------------
// A guard that has never been seen to fail is a guard nobody has tested. De-patch the correction in memory and
// re-run the SAME classifier over the SAME baseline.
var PRE_FIX = liveHosts['index.html'].replace(
  'inventory-replenishment.css?v=irtpunresolved-20261011',
  'inventory-replenishment.css?v=irrestinglayout-20261008');
ok(PRE_FIX !== liveHosts['index.html'], 'D1 a de-patched pre-fix index.html was produced');

var preHosts = { 'index.html': PRE_FIX, 'assets/js/app.js': liveHosts['assets/js/app.js'] };
var PRE = classify(preHosts);
ok(PRE.changedAndStale.length === 1,
   'D2 PRE-FIX: the gate reports exactly ONE stale publication (' + PRE.changedAndStale.length + ')');
ok(PRE.changedAndStale.length === 1 && PRE.changedAndStale[0].file === IRCSS,
   'D3 PRE-FIX: and it names the Inventory Replenishment stylesheet — B5 is load-bearing, not decorative');

// And the converse: a file that changed AND rotated must NOT be reported, or B5 would fail everything and
// "green" would mean nothing.
ok(PRE.changedAndRotated.some(function (e) { return /operation-system-db-api\.js$/.test(e.file); }),
   'D4 a changed asset WITH a rotated token is classified safe — the gate discriminates rather than blanket-fails');

var total = pass + fail;
console.log('\n----------------------------------------');
if (total === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('FRONTEND CACHE TOKEN PUBLICATION GATE (S8-B3-R3-GATE1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
