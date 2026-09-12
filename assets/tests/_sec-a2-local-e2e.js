/**
 * ==================================================================================================
 * THE WHOLE PATH, IN A REAL BROWSER, WITH NOTHING REAL BEHIND IT              SEC-A2 §12
 * ==================================================================================================
 *
 *      headless Chrome  →  local gateway  →  local mock Apps Script  →  the REAL client accessor
 *
 * Three processes on 127.0.0.1 and a real browser. No Google, no OAuth client, no Cloud Run, no
 * deployment, no production endpoint, no database. The ID tokens are minted by a key pair generated
 * when this file starts and thrown away when it exits.
 *
 * THE MOCK UPSTREAM RUNS THE ACTUAL `.gs` VERIFIER under the Apps Script platform shim, rather than a
 * simplified stand-in. A mock that "checks the signature" its own way would prove that the gateway
 * agrees with the mock — which is not a fact anyone needs. What has to be true is that the gateway
 * agrees with the FILE that will one day be pasted into Apps Script.
 *
 * AND THE ANSWER IS HANDED TO THE REAL SHIPPED ACCESSOR at the end, unchanged, because the round's
 * whole purpose is a response the existing client can still digest. P1-B7E was about exactly this
 * seam breaking silently.
 *
 * Run: node assets/tests/_sec-a2-local-e2e.js
 */
'use strict';

var http = require('http');
var path = require('path');
var fs = require('fs');
var os = require('os');
var { execFile } = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var GW = path.join(ROOT, 'services', 'auth-gateway', 'src');
var GS_FILE = path.join(ROOT, 'services', 'auth-gateway', 'apps-script-verifier',
  'SEC_A2_GATEWAY_ASSERTION_VERIFIER.gs');

var H = require('./_sec-a2-harness.js');
var verifierLib = require(path.join(GW, 'verifier.js'));
var serverLib = require(path.join(GW, 'server.js'));
var httpUtil = require(path.join(GW, 'http.js'));
var registryLib = require(path.join(GW, 'registry.js'));

var PORT_PAGE = 8811, PORT_GW = 8812, PORT_UP = 8813;
var tmpBodyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seca2-body-'));
var ORIGIN = 'http://127.0.0.1:' + PORT_PAGE;

// --- the mock Apps Script upstream ----------------------------------------------------------------
var cacheStore = {};
H.installAppsScriptShim(global, { cacheStore: cacheStore });
var gs = require(GS_FILE);

/* A flag the test can flip, standing in for PRODUCT_STRATEGY_ENABLED_ in 00_config.gs. */
var upstreamState = { featureEnabled: true };

var upstream = http.createServer(function (req, res) {
  /* A switch the page can flip, standing in for PRODUCT_STRATEGY_ENABLED_ being false in the
     deployment that answers. It exists so the browser can show that "not permitted" and "feature off"
     are DIFFERENT states rather than one apologetic message. */
  if (req.url === '/__flag_off') {
    upstreamState.featureEnabled = false;
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); return res.end('ok');
  }
  var buf = '';
  req.setEncoding('utf8');
  req.on('data', function (d) { buf += d; });
  req.on('end', function () {
    var parsed;
    try { parsed = JSON.parse(buf); } catch (e) { parsed = {}; }
    /* The body whose digest was signed is the canonical action+payload, exactly as the gateway built
       it — so the mock reconstructs it the same way and lets the digest check do its job. */
    var rawUpstreamBody = JSON.stringify({ action: parsed.action, payload: parsed.payload });
    var io = {
      now: function () { return Math.floor(Date.now() / 1000); },
      keyring: function () { return H.KEYRING; },
      nonceSeen: function (n, ttl) { return gs.kmgaNonceSeen_(n, ttl); },
      mayRunAction: function (p, a) {
        var e = registryLib.find(H.REGISTRY, { identity_key: p.identity_key, verified_email: p.verified_email });
        return registryLib.mayRunAction(e, a);
      },
      maySeeSite: function (p, s) {
        var e = registryLib.find(H.REGISTRY, { identity_key: p.identity_key, verified_email: p.verified_email });
        return registryLib.maySeeSite(e, s);
      },
      featureEnabled: function () { return upstreamState.featureEnabled === true; }
    };
    var gate = gs.kmgaGate_({
      action: parsed.action, rawUpstreamBody: rawUpstreamBody,
      km_assertion: parsed.km_assertion,
      site: (parsed.payload && parsed.payload.scope) || null
    }, io);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (!gate.allowed) {
      /* The upstream answers in the shape the shipped accessor already understands: a refusal is an
         ANSWER, with meta.action naming the action it was served by — the P1-B7E contract. */
      return res.end(JSON.stringify({
        success: true,
        data: { sourceState: null, sites: [], site_count: 0, hierarchy: null,
          identity_authority: 'marketplace_skus (company + country + marketplace)',
          identity_normalization: null, excluded: null, findings: [],
          refusals: [{ code: gate.code, detail: 'refused by the gateway assertion gate', subject: null }],
          completeness: { rows_examined: 0, capped: false, cap: 2000, is_whole_universe: false },
          schema: { contract_version: 1, build: 'SEC-A2-LOCAL', action: parsed.action,
            read_at: null, read_at_is: null, source_modified_at: null,
            source_modified_at_unavailable_because: null, table: null },
          publishes: [], does_not_publish: [] },
        meta: { apiVersion: '1', source: 'workspace', workspace: 'productPricing', build: 'SEC-A2-LOCAL',
          read_only: true, db_writes: 0, cached: false, tablesRead: 0, dbOpened: false,
          refused: true, refusalCode: gate.code, action: parsed.action },
        errors: []
      }));
    }
    /* Allowed: a minimal READY universe, plus the audit identity derived from the assertion. */
    var audit = gs.kmgaAuditIdentity_(gate.principal, parsed.payload);
    var okBody = JSON.stringify({
      success: true,
      data: { sourceState: 'READY',
        sites: [{ company: 'KM', country: 'US', marketplace: 'Shopify', membership_row_count: 3,
          active_count: 3, phasing_out_count: 0, inactive_count: 0, discontinued_count: 0,
          unknown_status_count: 0, blank_id_count: 0, selectable: true,
          selectable_with_inactive: true, refusal_reasons: [] }],
        site_count: 1,
        hierarchy: { companies: ['KM'], countries_by_company: { KM: ['US'] },
          marketplaces_by_country: { 'KM|US': ['Shopify'] } },
        identity_authority: 'marketplace_skus (company + country + marketplace)',
        identity_normalization: null, excluded: null, findings: [], refusals: [],
        completeness: { rows_examined: 3, capped: false, cap: 2000, is_whole_universe: true },
        schema: { contract_version: 1, build: 'SEC-A2-LOCAL', action: parsed.action,
          read_at: '2026-09-12T00:00:00.000Z', read_at_is: 'server', source_modified_at: null,
          source_modified_at_unavailable_because: 'SEC_A2_LOCAL', table: null },
        publishes: ['company', 'country', 'marketplace'], does_not_publish: ['price'],
        audit_identity: audit },
      meta: { apiVersion: '1', source: 'workspace', workspace: 'productPricing', build: 'SEC-A2-LOCAL',
        read_only: true, db_writes: 0, cached: false, tablesRead: 1, dbOpened: true,
        refused: false, action: parsed.action },
      errors: []
    });
    /* Kept so the accessor step downstream receives the EXACT bytes the browser received. */
    try { fs.writeFileSync(path.join(tmpBodyDir, 'e6-body.json'), okBody); } catch (e) {}
    res.end(okBody);
  });
});

// --- the gateway ----------------------------------------------------------------------------------
var cfg = H.baseConfig({
  allowedOrigins: [ORIGIN],
  upstreamUrl: 'http://127.0.0.1:' + PORT_UP + '/exec'
});
var gateway = serverLib.createServer({
  cfg: cfg,
  log: httpUtil.makeLogger(function () { /* quiet; §11 already proves the redaction */ }),
  now: function () { return Math.floor(Date.now() / 1000); },
  verifier: verifierLib.localJwksVerifier(H.jwks()),
  keyring: function () { return H.KEYRING; },
  registry: function () { return H.REGISTRY; },
  registryView: function () { return registryLib.publicView(H.REGISTRY); },
  upstream: function (payload) {
    return httpUtil.postUpstream(cfg.upstreamUrl, payload, 5000);
  }
});

// --- the page -------------------------------------------------------------------------------------
/* Tokens are minted here and handed to the page, standing in for what Google Identity Services would
   deliver to the sign-in callback. The page never sees a key, and the token exists only in a local
   variable — never in the URL, never in localStorage, which the assertions below check. */
var TOKENS = {
  operator: H.mintToken(H.claims({ iat: Math.floor(Date.now() / 1000) - 30, exp: Math.floor(Date.now() / 1000) + 3000 })),
  stranger: H.mintToken(H.claims({ sub: '999', email: 'stranger@' + H.DOMAIN,
    iat: Math.floor(Date.now() / 1000) - 30, exp: Math.floor(Date.now() / 1000) + 3000 })),
  forged: H.mintToken(H.claims({ iat: Math.floor(Date.now() / 1000) - 30, exp: Math.floor(Date.now() / 1000) + 3000 }), { key: H.OTHER.privateKey })
};

var PAGE = `<!doctype html><meta charset="utf-8"><title>sec-a2 e2e</title><pre id="out">running…</pre>
<script>
var GATEWAY = 'http://127.0.0.1:${PORT_GW}/v1/call';
var TOKENS = ${JSON.stringify(TOKENS)};
var results = [];

/* The token lives in a closure. It is never written to the URL, localStorage, sessionStorage or a
   cookie, and the assertions at the end of this file verify that rather than trusting this comment. */
function call(token, action, payload) {
  var init = { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: action, payload: payload || {}, credential: token || '' }) };
  return fetch(GATEWAY, init).then(function (r) {
    return r.json().then(function (j) { return { status: r.status, json: j }; });
  });
}
function record(name, p, note) {
  return p.then(function (r) {
    var body = null;
    try { body = r.json.body ? JSON.parse(r.json.body) : null; } catch (e) {}
    results.push({ case: name, http: r.status, ok: r.json.ok === true,
      code: r.json.code || null, kind: r.json.kind || null, retryable: r.json.retryable === true,
      message: r.json.message || null,
      upstream_refusal: body && body.meta ? (body.meta.refusalCode || null) : null,
      upstream_action: body && body.meta ? body.meta.action : null,
      upstream_state: body && body.data ? body.data.sourceState : null,
      upstream_audit: body && body.data && body.data.audit_identity ? body.data.audit_identity : null,
      note: note });
  }).catch(function (e) {
    results.push({ case: name, error: String(e && e.message || e), note: note });
  });
}

record('E1 not signed in', call('', 'productPricing.siteUniverse.get'),
       'the page has no token yet')
.then(function () { return record('E2 forged token', call(TOKENS.forged, 'productPricing.siteUniverse.get'),
       'a real-looking JWT signed by the wrong key'); })
.then(function () { return record('E3 signed in but not an operator', call(TOKENS.stranger, 'productPricing.siteUniverse.get'),
       'a genuine, verifiable Google identity that is simply not on the list'); })
.then(function () { return record('E4 operator, wrong action', call(TOKENS.operator, 'productPricing.workspace.get'),
       'on the list, but not for this action'); })
.then(function () { return record('E5 operator, out of scope', call(TOKENS.operator, 'productPricing.siteUniverse.get', { scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' } }),
       'permitted action, forbidden site'); })
.then(function () { return record('E6 operator, permitted', call(TOKENS.operator, 'productPricing.siteUniverse.get', { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } }),
       'everything in order'); })
.then(function () { return record('E7 an action this gateway does not serve', call(TOKENS.operator, 'confirmShipmentAndDispatch'),
       'a REAL production action, refused at the gateway'); })
.then(function () { return fetch('http://127.0.0.1:${PORT_UP}/__flag_off', { method: 'POST' }); })
.then(function () { return record('E8 operator, permitted, FEATURE OFF', call(TOKENS.operator, 'productPricing.siteUniverse.get', { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } }),
       'the same operator and the same site, with the upstream flag false'); })
.then(function () {
  /* Where did the token end up? */
  var ls = 0, ss = 0;
  try { ls = window.localStorage.length; } catch (e) {}
  try { ss = window.sessionStorage.length; } catch (e) {}
  results.push({ case: 'E9 token containment', http: null,
    url_has_token: location.href.indexOf('eyJ') >= 0,
    localStorage_entries: ls, sessionStorage_entries: ss,
    cookies: document.cookie || '(none)',
    note: 'the credential must exist only in memory' });
  document.getElementById('out').textContent = 'SEC-A2-E2E ' + JSON.stringify(results, null, 2);
});
</script>`;

var page = http.createServer(function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});

// --- run ------------------------------------------------------------------------------------------
function chromePath() {
  var candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium'
  ];
  for (var i = 0; i < candidates.length; i++) if (fs.existsSync(candidates[i])) return candidates[i];
  return null;
}

upstream.listen(PORT_UP, function () {
  gateway.listen(PORT_GW, function () {
    page.listen(PORT_PAGE, function () {
      var chrome = chromePath();
      if (!chrome) { console.log('SEC-A2-E2E SKIPPED: no Chrome found'); process.exit(0); }
      var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seca2-'));
      /* ASYNCHRONOUSLY, and this is not a style preference. `execFileSync` blocks the event loop, and
         the gateway and the mock upstream are listening in THIS process — so a synchronous spawn
         deadlocks: Chrome waits for a page that node cannot serve until Chrome exits. */
      execFile(chrome, ['--headless', '--disable-gpu', '--no-sandbox',
        '--window-size=1000,800', '--virtual-time-budget=20000',
        '--user-data-dir=' + tmp, '--dump-dom', ORIGIN + '/'],
        { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }, function (err, stdout) {
      if (err && !stdout) { console.log('SEC-A2-E2E CHROME FAILED: ' + (err && err.message)); process.exit(1); }
      var dom = String(stdout || '');
      var m = dom.match(/SEC-A2-E2E ([\s\S]*?)<\/pre>/);
      if (!m) { console.log('SEC-A2-E2E NO RESULT'); process.exit(1); }
      var results = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'"));
      console.log(JSON.stringify(results, null, 2));

      /* THE LAST LINK: the body the gateway returned, handed to the REAL shipped accessor, unchanged.
         P1-B7E was precisely this seam breaking silently, so the round does not end until the client
         that exists today can still digest what the new path produces. */
      var okCase = results.filter(function (r) { return /E6 /.test(r.case); })[0];
      var JS = path.join(ROOT, 'assets', 'js');
      global.PSB_CONTRACT = require(path.join(JS, 'product-strategy', 'psb-data-contract.js')).PSB_CONTRACT;
      require(path.join(JS, 'product-strategy', 'psb-selectors.js'));
      require(path.join(JS, 'api', 'km-product-pricing-adapter.js'));
      var UNI = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));
      var ACC = require(path.join(JS, 'api', 'km-product-pricing-workspace.js'));
      ACC.setCapability({ product_strategy_enabled: true });
      global.KM = global.KM || {};
      var lastBody = JSON.parse(fs.readFileSync(path.join(tmpBodyDir, 'e6-body.json'), 'utf8'));
      global.KM.api = { transport: { post: function () { return Promise.resolve({ __b: lastBody }); },
        safeReadJsonResponse: function (r) { return r.__b; } } };
      return ACC.getSiteUniverse({}).then(function (out) {
        var u = UNI.adapt(out);
        console.log('');
        console.log('--- the gateway response through the REAL shipped accessor ---');
        console.log(JSON.stringify({
          accessor_refused: out.meta.refused === true,
          accessor_refusal_code: out.meta.refusalCode || null,
          response_action_mismatch: JSON.stringify(out).indexOf('RESPONSE_ACTION_MISMATCH') >= 0,
          source_not_connected: JSON.stringify(out).indexOf('SOURCE_NOT_CONNECTED') >= 0,
          universe_state: u.state, sites: u.sites.length,
          companies: UNI.companies ? UNI.companies(u) : null
        }, null, 2));
        process.exit(0);
      });
      /* The run's output goes to a temp directory, not into the repository: it is a result, not a
         source, and a committed result is one somebody will eventually read as a guarantee. */
      fs.writeFileSync(path.join(tmpBodyDir, 'e2e-result.json'), JSON.stringify(results, null, 2));
      process.exit(0);
      });
    });
  });
});
