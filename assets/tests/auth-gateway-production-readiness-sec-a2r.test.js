/**
 * ==================================================================================================
 * SEC-A2R — AUTH GATEWAY PRODUCTION READINESS                                     §3–§10
 * ==================================================================================================
 *
 * SEC-A2 built the gateway and attacked its logic. Everything it proved was proved against a tree
 * with NOTHING INSTALLED: `google-auth-library` was declared and absent, so the production verifier
 * was the one component the suite could not execute. This round installs it, runs it, and asks what
 * the real thing actually does — and the answer was not what the design assumed.
 *
 * THREE THINGS ONLY THE INSTALLED LIBRARY COULD TELL US, all in §B:
 *
 *   1. IT FETCHES GOOGLE'S CERTIFICATES BEFORE IT PARSES THE TOKEN, and wraps every failure of that
 *      fetch in one message. The old adapter classified by inspecting the cause, so a cause with no
 *      transport-looking word — a 500 from Google, an unparseable document — became "rejected", and
 *      the gateway told a real operator their sign-in was invalid while Google was down.
 *   2. IT ACCEPTS A TOKEN UP TO 300 SECONDS PAST `exp`. Its own clock-skew allowance. A design that
 *      had deleted the gateway's expiry check as "already done by the library" would have had a
 *      five-minute replay window and no way to discover it.
 *   3. IT NEVER LOOKS AT `email_verified`. Not its job — but it is somebody's, and the only reason it
 *      is anybody's is that the gateway kept its own claim checks instead of trusting the library to
 *      be complete.
 *
 * Points 2 and 3 are why `checkClaims` is not redundant. That was an argument in SEC-A2 and is a
 * MEASUREMENT here.
 *
 * ------------------------------------------------------------------------------------------------
 * WHY NOTHING HERE TOUCHES THE NETWORK
 * ------------------------------------------------------------------------------------------------
 * The real library is driven through a TRANSPORTER it was handed, serving a certificate set generated
 * in this process. The cryptography is genuine — real RSA keys, real signatures, the library's real
 * verification path — and the only fiction is WHERE the certificates came from. That fiction is also
 * the limit of what this proves, and §B says so out loud: a token this suite accepts was signed by a
 * key this suite created. REAL_GOOGLE_TOKEN_ACCEPTANCE remains NOT_YET_PROVEN and cannot be proved
 * without a real OAuth client and a real sign-in, which §2 forbids this round.
 * ==================================================================================================
 */
'use strict';

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var child = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var PKG = path.join(ROOT, 'services', 'auth-gateway');
var GW = path.join(PKG, 'src');

var codes = require(path.join(GW, 'codes.js'));
var C = codes.CODES;
var configLib = require(path.join(GW, 'config.js'));
var verifierLib = require(path.join(GW, 'verifier.js'));
var pipeline = require(path.join(GW, 'pipeline.js'));
var httpUtil = require(path.join(GW, 'http.js'));
var guardLib = require(path.join(GW, 'guard.js'));
var H = require('./_sec-a2-harness.js');

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) {
  var x = JSON.stringify(a), y = JSON.stringify(b);
  ok(x === y, label, x === y ? undefined : { got: a, want: b });
}

var steps = [];
function step(fn) { steps.push(fn); }

// ===================================================================================================
// A REAL GOOGLE LIBRARY, DRIVEN OFFLINE
// ===================================================================================================
var GOOGLE = (function () {
  var lib = null, loadError = null;
  try { lib = require(path.join(PKG, 'node_modules', 'google-auth-library')); }
  catch (e) { loadError = e; }
  return { lib: lib, loadError: loadError };
})();

/* An RSA key pair and a certificate document the library will be handed. The keys are real and the
   signatures are real; only the provenance is ours. */
var FAKE_CA = (function () {
  var kp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  var other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    kid: 'sec-a2r-test-kid',
    privateKey: kp.privateKey,
    publicPem: kp.publicKey.export({ type: 'spki', format: 'pem' }),
    otherPrivate: other.privateKey
  };
})();

function b64u(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }

function mintRs256(claims, opts) {
  opts = opts || {};
  var header = { alg: opts.alg || 'RS256', kid: opts.kid === undefined ? FAKE_CA.kid : opts.kid, typ: 'JWT' };
  var h = b64u(header), p = b64u(claims);
  if (header.alg === 'none') return h + '.' + p + '.';
  var sig = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p),
    opts.key || FAKE_CA.privateKey).toString('base64url');
  return h + '.' + p + '.' + sig;
}

/**
 * A real OAuth2Client whose certificate fetch is answered locally.
 * @param mode 'serve'  hand over our certificate set
 *             'refuse' throw a TRANSPORT-shaped failure
 *             'broken' throw a failure with NO transport-looking word in it — the case the old
 *                      classifier got wrong, and the reason this parameter exists
 */
function realClient(mode) {
  var c = new GOOGLE.lib.OAuth2Client();
  var hits = 0;
  c.transporter = {
    request: function () {
      hits++;
      if (mode === 'refuse') return Promise.reject(new Error('getaddrinfo ENOTFOUND www.googleapis.com'));
      if (mode === 'broken') return Promise.reject(new Error('Request failed with status code 500'));
      var m = {}; m[FAKE_CA.kid] = FAKE_CA.publicPem;
      return Promise.resolve({ data: m, headers: new Headers({ 'cache-control': 'public, max-age=3600' }) });
    }
  };
  c.__hits = function () { return hits; };
  return c;
}

function googleAdapter(mode, audience) {
  return verifierLib.googleVerifier({
    audience: audience === undefined ? 'AUD.apps.googleusercontent.com' : audience,
    client: realClient(mode)
  });
}

var NOW_S = Math.floor(Date.now() / 1000);
function goodClaims(over) {
  var c = {
    iss: 'https://accounts.google.com', aud: 'AUD.apps.googleusercontent.com',
    sub: '1122334455', exp: NOW_S + 600, iat: NOW_S,
    email: 'ops.fixture@shopkitchenmama.com', email_verified: true
  };
  for (var k in (over || {})) { if (over[k] === undefined) delete c[k]; else c[k] = over[k]; }
  return c;
}

// ===================================================================================================
step(function () {
  console.log('\n=== §A  THE DEPENDENCY IS PINNED, LOCKED, CLEAN AND NOT COMMITTED ===');

  var pkg = JSON.parse(read(path.join(PKG, 'package.json')));
  var lockPath = path.join(PKG, 'package-lock.json');
  ok(fs.existsSync(lockPath), 'A1 a lockfile exists — `npm ci` has something to be deterministic about');
  var lock = JSON.parse(read(lockPath));
  eq(lock.lockfileVersion, 3, 'A2 lockfileVersion 3');

  var declared = pkg.dependencies['google-auth-library'];
  /* EXACT, NOT A RANGE. A caret plus a lockfile is reproducible for `npm ci` and NOT for a fresh
     `npm install` — and a Cloud Run source build runs in an environment we do not control. An exact
     pin makes the two agree, and makes an upgrade a commit somebody reviewed rather than a side
     effect of building on a different day. */
  ok(/^\d+\.\d+\.\d+$/.test(declared), 'A3 the dependency is pinned EXACTLY, with no range: ' + declared);
  ok(declared.indexOf('^') < 0 && declared.indexOf('~') < 0, 'A3a no caret and no tilde');

  var installed = JSON.parse(read(path.join(PKG, 'node_modules', 'google-auth-library', 'package.json')));
  eq(installed.version, declared, 'A4 the installed version is the pinned one');
  eq(lock.packages['node_modules/google-auth-library'].version, declared, 'A5 and the lockfile agrees');

  /* Every entry carries an integrity hash, which is what makes the lock a SUPPLY-CHAIN control rather
     than a version list: a tarball whose content changed under the same version fails to install. */
  var names = Object.keys(lock.packages).filter(function (k) { return k !== ''; });
  var noIntegrity = names.filter(function (k) { return !lock.packages[k].integrity; });
  ok(names.length >= 20, 'A6 the lockfile pins the whole tree (' + names.length + ' packages)');
  eq(noIntegrity, [], 'A7 every package in the lock carries an integrity hash');
  var noResolved = names.filter(function (k) { return !lock.packages[k].resolved; });
  eq(noResolved, [], 'A8 and every one records where it came from');

  /* NO PACKAGE MAY EXECUTE CODE DURING INSTALL. There are no preinstall/install/postinstall hooks in
     this tree at all; the `prepare` hooks belong to packages that build from source when installed
     from GIT, and npm does not run them for a registry tarball. The Dockerfile passes
     --ignore-scripts anyway, which removes a capability nothing is using. */
  var hooks = [];
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (e) {
      var p = path.join(d, e);
      if (!fs.statSync(p).isDirectory()) return;
      if (e === 'node_modules' || e.charAt(0) === '@') return walk(p);
      var pj = path.join(p, 'package.json');
      if (fs.existsSync(pj)) {
        var j = JSON.parse(read(pj));
        ['preinstall', 'install', 'postinstall'].forEach(function (k) {
          if (j.scripts && j.scripts[k]) hooks.push(j.name + ':' + k);
        });
        walk(path.join(p, 'node_modules'));
      }
    });
  })(path.join(PKG, 'node_modules'));
  eq(hooks, [], 'A9 not one package in the tree declares an install-time hook');

  /* Licences: everything permissive. A copyleft dependency in a service that will be deployed is a
     legal question, and the moment to ask it is before it is deployed. */
  var lic = {};
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (e) {
      var p = path.join(d, e);
      if (!fs.statSync(p).isDirectory()) return;
      if (e === 'node_modules' || e.charAt(0) === '@') return walk(p);
      var pj = path.join(p, 'package.json');
      if (fs.existsSync(pj)) {
        var j = JSON.parse(read(pj));
        var l = typeof j.license === 'string' ? j.license : 'UNKNOWN';
        lic[l] = (lic[l] || 0) + 1;
        walk(path.join(p, 'node_modules'));
      }
    });
  })(path.join(PKG, 'node_modules'));
  var permissive = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC', '0BSD'];
  var foreign = Object.keys(lic).filter(function (k) { return permissive.indexOf(k) < 0; });
  eq(foreign, [], 'A10 every licence in the tree is permissive: ' + JSON.stringify(lic));

  /* NOT COMMITTED. The lockfile is the record; the tree is restored from it. */
  var tracked = child.execFileSync('git',
    ['ls-files', '--', 'services/auth-gateway/node_modules'], { cwd: ROOT, encoding: 'utf8' }).trim();
  eq(tracked, '', 'A11 no file under node_modules is tracked by git');
  ok(read(path.join(PKG, '.gitignore')).indexOf('node_modules/') >= 0, 'A12 and .gitignore is why');

  /* The engine floor is not decoration: v11 of the library requires Node 22, and a container built on
     an older base would fail at require() time rather than at build time. */
  ok(/>=\s*22/.test(pkg.engines.node), 'A13 the package requires Node >= 22, matching the library');
  ok(Number(process.versions.node.split('.')[0]) >= 22,
    'A14 and the Node running these tests satisfies it (' + process.versions.node + ')');
  ok(read(path.join(PKG, 'Dockerfile')).indexOf('node:24') >= 0,
    'A15 the image is built on a Node that satisfies it too');
});

// ===================================================================================================
step(function () {
  console.log('\n=== §B  THE REAL GOOGLE LIBRARY, LOADED AND EXECUTED ===');

  ok(!GOOGLE.loadError, 'B1 google-auth-library really loads' +
    (GOOGLE.loadError ? ' — ' + GOOGLE.loadError.message : ''));
  if (!GOOGLE.lib) { console.log('  (the rest of §B cannot run)'); return; }
  ok(typeof GOOGLE.lib.OAuth2Client === 'function', 'B2 OAuth2Client is the real exported class');
  var probe = new GOOGLE.lib.OAuth2Client();
  ok(typeof probe.verifyIdToken === 'function', 'B3 and it really has verifyIdToken');

  var done = [];
  function check(label, mode, token, audience, expect) {
    done.push(googleAdapter(mode, audience).verify(token).then(function (r) {
      if (expect === 'ok') { ok(r.ok === true, label); return; }
      if (expect === 'unavailable') {
        ok(r.ok === false && r.unavailable === true, label, r);
        return;
      }
      ok(r.ok === false && !r.unavailable, label, r);
    }));
  }

  check('B4 a malformed token is refused by the real library', 'serve', 'not-a-jwt', undefined, 'no');
  check('B5 a two-segment token is refused', 'serve', 'a.b', undefined, 'no');
  check('B6 alg:none is refused', 'serve', mintRs256(goodClaims(), { alg: 'none' }), undefined, 'no');
  check('B7 an unknown key id is refused', 'serve', mintRs256(goodClaims(), { kid: 'not-a-real-kid' }), undefined, 'no');
  check('B8 a token signed with another key is refused', 'serve',
    mintRs256(goodClaims(), { key: FAKE_CA.otherPrivate }), undefined, 'no');
  check('B9 a tampered payload is refused', 'serve', (function () {
    var t = mintRs256(goodClaims()).split('.'); t[1] = b64u(goodClaims({ sub: '999' })); return t.join('.');
  })(), undefined, 'no');
  check('B10 the wrong audience is refused BY THE LIBRARY', 'serve',
    mintRs256(goodClaims()), 'SOMEBODY-ELSE.apps.googleusercontent.com', 'no');
  check('B11 the wrong issuer is refused BY THE LIBRARY', 'serve',
    mintRs256(goodClaims({ iss: 'https://accounts.evil.test' })), undefined, 'no');

  /* THE DEFECT THIS ROUND FOUND, IN BOTH ITS SHAPES. */
  check('B12 an unreachable certificate source is an OUTAGE, not a rejected token', 'refuse',
    mintRs256(goodClaims()), undefined, 'unavailable');
  check('B13 and so is a certificate fetch that fails with NO transport word in the message',
    'broken', mintRs256(goodClaims()), undefined, 'unavailable');

  return Promise.all(done).then(function () {
    /* --- the two facts that justify keeping the gateway's own claim checks ----------------------- */
    var late = mintRs256(goodClaims({ exp: NOW_S - 240, iat: NOW_S - 3600 }));
    return googleAdapter('serve').verify(late).then(function (r) {
      ok(r.ok === true,
        'B14 MEASURED: the real library ACCEPTS a token 240s past exp — it allows 300s of clock skew');
      var cfg = H.baseConfig();
      cfg.googleClientId = 'AUD.apps.googleusercontent.com';
      var verdict = pipeline.checkClaims(goodClaims({ exp: NOW_S - 240, iat: NOW_S - 3600 }), cfg, NOW_S);
      eq(verdict.code, C.TOKEN_EXPIRED,
        'B14a and the gateway refuses it anyway — which is why checkClaims is not redundant');

      var unverified = mintRs256(goodClaims({ email_verified: false }));
      return googleAdapter('serve').verify(unverified).then(function (r2) {
        ok(r2.ok === true, 'B15 MEASURED: the real library does not look at email_verified at all');
        var v2 = pipeline.checkClaims(goodClaims({ email_verified: false }), cfg, NOW_S);
        eq(v2.code, C.EMAIL_NOT_VERIFIED, 'B15a and the gateway does');

        /* --- the library's error text is a credential ------------------------------------------- */
        var tok = mintRs256(goodClaims(), { key: FAKE_CA.otherPrivate });
        var raw = null;
        return realClient('serve').verifyIdToken({ idToken: tok, audience: 'AUD.apps.googleusercontent.com' })
          .then(function () { raw = '(accepted?!)'; }, function (e) { raw = e.message; })
          .then(function () {
            ok(raw.indexOf(tok.slice(0, 40)) >= 0,
              'B16 MEASURED: the library embeds the WHOLE TOKEN in its error message');
            return googleAdapter('serve').verify(tok).then(function (r3) {
              ok(JSON.stringify(r3).indexOf(tok.slice(0, 40)) < 0,
                'B17 and the adapter returns a classification only — the message never escapes');
              eq(r3.reason, 'rejected', 'B17a the classification carries no detail either');

              /* --- and it reaches neither the client nor the log ---------------------------------- */
              var lines = [];
              var logger = httpUtil.makeLogger(function (l) { lines.push(l); });
              logger.error('kmg_x', 'verification failed', { error: raw, credential: tok });
              var blob = lines.join('\n');
              ok(blob.indexOf(tok.slice(0, 40)) < 0, 'B18 the redacting logger drops it from a log line too');
              ok(blob.indexOf('<omitted>') >= 0 || blob.indexOf('<redacted') >= 0, 'B18a visibly, not silently');
            });
          });
      });
    });
  });
});

// ===================================================================================================
step(function () {
  console.log('\n=== §C  PRODUCTION REFUSES TO START WRONG ===');

  function base(over) {
    var env = {
      NODE_ENV: 'production', AUTH_VERIFIER: 'google',
      GOOGLE_OAUTH_CLIENT_ID: 'x.apps.googleusercontent.com',
      ALLOWED_ORIGINS: 'https://example.github.io',
      APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/PLACEHOLDER/exec',
      ALLOWED_ACTIONS: 'productPricing.siteUniverse.get',
      HMAC_ACTIVE_KEY_ID: 'k1', HMAC_ACTIVE_KEY_FILE: '/var/secrets/active',
      OPERATOR_REGISTRY_FILE: '/var/run/operators.json'
    };
    for (var k in (over || {})) { if (over[k] === undefined) delete env[k]; else env[k] = over[k]; }
    return configLib.load(env);
  }
  function probs(over) { return base(over).problems.join(' | '); }

  eq(base().ok, true, 'C1 a complete production configuration starts');

  [['C2 a wildcard origin', { ALLOWED_ORIGINS: '*' }, /wildcard/],
   ['C3 a wildcard inside an origin', { ALLOWED_ORIGINS: 'https://*.github.io' }, /wildcard/],
   ['C4 a loopback origin in production', { ALLOWED_ORIGINS: 'http://localhost:8801' }, /loopback/],
   ['C5 a plaintext origin in production', { ALLOWED_ORIGINS: 'http://example.github.io' }, /must be https/],
   ['C6 a plaintext upstream', { APPS_SCRIPT_EXEC_URL: 'http://script.google.com/macros/s/X/exec' }, /must be https/],
   ['C7 an upstream host that merely CONTAINS the real one',
    { APPS_SCRIPT_EXEC_URL: 'https://script.google.com.attacker.test/macros/s/X/exec' }, /host must be exactly/],
   ['C8 an upstream host that merely ENDS with it',
    { APPS_SCRIPT_EXEC_URL: 'https://notscript.google.com/macros/s/X/exec' }, /host must be exactly/],
   ['C9 an upstream that is not an /exec path',
    { APPS_SCRIPT_EXEC_URL: 'https://script.google.com/anything' }, /not an Apps Script/],
   ['C10 no operator registry source', { OPERATOR_REGISTRY_FILE: undefined }, /OPERATOR_REGISTRY_FILE/],
   ['C11 the test verifier selected in production', { AUTH_VERIFIER: 'local' }, /non-Google verifier/],
   ['C12 NODE_ENV misspelled', { NODE_ENV: 'prod' }, /NODE_ENV must be one of/],
   ['C13 an assertion TTL above the ceiling', { ASSERTION_TTL_SECONDS: '900' }, /ASSERTION_TTL_SECONDS/],
   ['C14 a negative clock skew', { CLOCK_SKEW_SECONDS: '-1' }, /CLOCK_SKEW_SECONDS/],
   ['C15 a clock skew beyond five minutes', { CLOCK_SKEW_SECONDS: '600' }, /CLOCK_SKEW_SECONDS/],
   ['C16 an upstream timeout that outlives the request', { UPSTREAM_TIMEOUT_MS: '60000' }, /shorter than REQUEST_TIMEOUT_MS/],
   ['C17 no client id', { GOOGLE_OAUTH_CLIENT_ID: undefined }, /GOOGLE_OAUTH_CLIENT_ID/],
   ['C18 no action allowlist', { ALLOWED_ACTIONS: undefined }, /ALLOWED_ACTIONS/]
  ].forEach(function (t) {
    ok(t[2].test(probs(t[1])) && base(t[1]).ok === false, t[0] + ' is refused at startup', probs(t[1]));
  });

  /* A LOOPBACK UPSTREAM IS THE ONE PLAINTEXT EXCEPTION, AND ONLY OUTSIDE PRODUCTION — because that is
     how the local end-to-end reaches its mock, and because a rule with no exception gets disabled
     wholesale the first time it blocks a developer. */
  ok(configLib.load({
    NODE_ENV: 'development', GOOGLE_OAUTH_CLIENT_ID: 'x', ALLOWED_ORIGINS: 'http://localhost:8801',
    APPS_SCRIPT_EXEC_URL: 'http://127.0.0.1:8812/exec', ALLOWED_ACTIONS: 'a.b',
    HMAC_ACTIVE_KEY_ID: 'k1', HMAC_ACTIVE_KEY_FILE: '/k'
  }).ok, 'C19 a loopback plaintext upstream is allowed OUTSIDE production');
  ok(!configLib.load({
    NODE_ENV: 'production', AUTH_VERIFIER: 'google', GOOGLE_OAUTH_CLIENT_ID: 'x',
    ALLOWED_ORIGINS: 'https://e.github.io', APPS_SCRIPT_EXEC_URL: 'http://127.0.0.1:8812/exec',
    ALLOWED_ACTIONS: 'a.b', HMAC_ACTIVE_KEY_ID: 'k1', HMAC_ACTIVE_KEY_FILE: '/k',
    OPERATOR_REGISTRY_FILE: '/r'
  }).ok, 'C20 and refused inside it');

  // --- the secret itself ---------------------------------------------------------------------------
  function ring(content) {
    return configLib.readKeyring({ activeKeyId: 'k1', activeKeyPath: '/x' }, function () { return content; });
  }
  ok(!ring('').active, 'C21 an empty secret file yields no key');
  ok(!ring('short').active, 'C22 a short one yields no key');
  ok(!ring(new Array(49).join('a')).active, 'C23 forty-eight characters of "a" is long and is NOT a key');
  ok(/distinct/.test(ring(new Array(49).join('a')).problems.join(' ')), 'C23a and the reason says why');
  ok(!ring('REPLACE_WITH_A_REAL_SECRET_GENERATED_OFF_MACHINE').active,
    'C24 the runbook placeholder is refused — it is long and varied and still not a secret');
  ok(!!ring(crypto.randomBytes(48).toString('base64')).active,
    'C25 what `openssl rand -base64 48` produces IS accepted');
  eq(ring('x').problems.length > 0, true, 'C26 and a bad key always reports a reason');
});

// ===================================================================================================
step(function () {
  console.log('\n=== §D  THE CONTAINER SPECIFICATION ===');

  var df = read(path.join(PKG, 'Dockerfile'));
  var di = read(path.join(PKG, '.dockerignore'));

  ok(/FROM\s+node:\d+\.\d+\.\d+-\w+-slim\s+AS\s+deps/.test(df), 'D1 a pinned base image with an exact patch version');
  ok(!/FROM\s+\S*:latest/.test(df), 'D2 nothing is built FROM a latest tag');
  ok((df.match(/^FROM /gm) || []).length >= 2, 'D3 the build is multi-stage');
  ok(/AS runtime/.test(df), 'D3a with a named runtime stage');
  /* The probe reads RUN INSTRUCTIONS ONLY. Matching the bare words anywhere in the file also matched
     the comment that EXPLAINS why `npm install` is not used — a probe that can be satisfied by prose
     is a probe that can never fail. Same defect class as SEC-A2 L1, found the same way. */
  var runLines = (df.match(/^RUN .*$/gm) || []).join('\n');
  ok(/npm ci /.test(runLines), 'D4 the build RUNS `npm ci`');
  ok(!/npm install/.test(runLines), 'D4a and never `npm install`, which would resolve versions nobody audited');
  ok(/--omit=dev/.test(df), 'D5 development dependencies never reach the image');
  ok(/--ignore-scripts/.test(df), 'D6 and no package may execute code during the install');
  ok(/^USER node$/m.test(df), 'D7 the process runs as a non-root user');
  ok(df.indexOf('USER node') < df.indexOf('CMD ['), 'D7a declared before anything runs');
  ok(/CMD \["node", "src\/index\.js"\]/.test(df),
    'D8 CMD is exec form — a shell at PID 1 would swallow SIGTERM and the drain would never run');
  ok(/STOPSIGNAL SIGTERM/.test(df), 'D9 the stop signal is declared');
  ok(/EXPOSE 8080/.test(df) && /PORT=8080/.test(df), 'D10 the port is explicit');
  ok(/HEALTHCHECK/.test(df) && /readyz/.test(df), 'D11 the health check asks about READINESS, not liveness');

  /* WHAT MUST NOT BE COPIED. A private key that appears in a layer is in that image forever; a later
     `rm` does not remove it, it only hides it from `ls`. */
  ok(!/COPY[^\n]*apps-script-verifier/.test(df), 'D12 the Apps Script source is not copied into the image');
  ok(!/COPY[^\n]*README/.test(df), 'D13 nor the runbook, which describes how to reach production');
  ok(!/COPY[^\n]*\.env/.test(df), 'D14 nor any env file');
  ok(!/COPY[^\n]*tests/.test(df), 'D15 nor the tests, which generate private keys and mint tokens');
  var copied = (df.match(/^COPY .*$/gm) || []);
  eq(copied.filter(function (l) { return !/package(-lock)?\.json|node_modules|\bsrc\b/.test(l); }), [],
    'D16 the ONLY things copied are the manifest, the dependency tree and src/');

  ['node_modules', '.git', '.env', '*.pem', '*.key', '*.test.js', 'secrets/'].forEach(function (t, i) {
    ok(di.indexOf(t) >= 0, 'D' + (17 + i) + ' .dockerignore excludes ' + t + ' from the build context');
  });

  /* THE HONEST PART. No image was built, because nothing on this machine can build one. */
  var runtimes = ['docker', 'podman', 'nerdctl'];
  var found = runtimes.filter(function (r) {
    try { child.execFileSync(process.platform === 'win32' ? 'where' : 'which', [r], { stdio: 'ignore' }); return true; }
    catch (e) { return false; }
  });
  eq(found, [],
    'D24 STOP_LOCAL_CONTAINER_RUNTIME_UNAVAILABLE — no container runtime exists here, so no image was built');
  ok(read(path.join(PKG, 'README.md')).indexOf('STOP_LOCAL_CONTAINER_RUNTIME_UNAVAILABLE') >= 0,
    'D25 and the README records that rather than implying the image was verified');
});

// ===================================================================================================
step(function () {
  console.log('\n=== §E  SECRETS, ROTATION, AND WHAT THE HEALTH ENDPOINTS SAY ===');

  /* Nothing key-shaped anywhere in the package, and nothing in the tests either. */
  var files = [];
  (function walk(d) {
    fs.readdirSync(d).forEach(function (f) {
      var p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p); } else files.push(p);
    });
  })(PKG);
  var blob = files.map(read).join('\n');
  ok(blob.indexOf('-----BEGIN') < 0, 'E1 the package contains no private key');
  ok(!/AKfycb/.test(blob), 'E2 no deployment id');
  ok(!/vic\.zhou/.test(blob), 'E3 no personal address');
  ok(!/client_secret\s*[:=]\s*["'][^"']+/.test(blob), 'E4 no client secret');

  /* Every value in .env.example is a placeholder. */
  var envx = read(path.join(PKG, '.env.example'));
  var vals = envx.split('\n').filter(function (l) { return /^[A-Z_]+=/.test(l); })
    .map(function (l) { return l.slice(l.indexOf('=') + 1); }).filter(function (v) { return v !== ''; });
  /* A PLACEHOLDER IS RECOGNISED BY WHAT IT SAYS, NOT BY ITS LENGTH. `REPLACE_WITH_DEPLOYMENT_ID` is
     twenty-six characters of exactly the alphabet a real deployment id uses, so a shape test alone
     flags it — and the fix is not to shorten the placeholder but to ask the question that matters. */
  function isPlaceholder(v) { return /REPLACE_WITH|PLACEHOLDER|CHANGEME|EXAMPLE/i.test(v); }
  var suspicious = vals.filter(function (v) {
    if (isPlaceholder(v)) return false;
    return /apps\.googleusercontent\.com$/.test(v) || /macros\/s\/[A-Za-z0-9_-]{25,}/.test(v);
  });
  eq(suspicious, [], 'E5 .env.example holds no value that could be real');

  // --- rotation ------------------------------------------------------------------------------------
  /* The CRYPTOGRAPHIC half of rotation - an assertion signed under the outgoing key still verifying
     during the overlap window, and an unknown key id failing closed - is proved in the SEC-A2 suite
     §F against real signatures. What is checked HERE is the half that is a configuration mistake
     rather than a cryptographic one, and that therefore happens at three in the morning. */
  var probs = configLib.load({
    NODE_ENV: 'development', GOOGLE_OAUTH_CLIENT_ID: 'x', ALLOWED_ORIGINS: 'https://e.github.io',
    APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/P/exec', ALLOWED_ACTIONS: 'a.b',
    HMAC_ACTIVE_KEY_ID: 'k1', HMAC_ACTIVE_KEY_FILE: '/a',
    HMAC_PREVIOUS_KEY_ID: 'k1', HMAC_PREVIOUS_KEY_FILE: '/b'
  }).problems.join(' ');
  ok(/previous key id equals the active/.test(probs),
    'E7 rotating a key to its own id is refused — it would be an overlap window that never closes');
  ok(/previous key id was given with no file/.test(configLib.load({
    NODE_ENV: 'development', GOOGLE_OAUTH_CLIENT_ID: 'x', ALLOWED_ORIGINS: 'https://e.github.io',
    APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/P/exec', ALLOWED_ACTIONS: 'a.b',
    HMAC_ACTIVE_KEY_ID: 'k1', HMAC_ACTIVE_KEY_FILE: '/a', HMAC_PREVIOUS_KEY_ID: 'k0'
  }).problems.join(' ')), 'E8 a previous key id with no file is refused');

  /* An unreadable ACTIVE key is not an exception at request time — it is a keyring with nothing in it,
     which is what makes /readyz able to answer 503 instead of the process crashing on the first call. */
  var broken = configLib.readKeyring({ activeKeyId: 'k1', activeKeyPath: '/nope' },
    function () { throw new Error('EACCES'); });
  eq(broken.active, null, 'E9 an unreadable secret yields no key rather than an exception');
  ok(/unreadable/.test(broken.problems.join(' ')), 'E9a with a reason');
});

// ===================================================================================================
step(function () {
  console.log('\n=== §F  COST AND ABUSE CONTROLS, AND WHAT THEY MAY BE CALLED ===');

  var g = guardLib.bestEffortInstanceLocalRateGuard({});
  eq(g.isGlobal, false, 'F1 the rate guard reports that it is NOT global');
  ok(/instance-local/.test(g.scope) && /NOT a global/.test(g.scope),
    'F2 and its own description says so, so that nothing quoting it can imply otherwise');
  ok(Object.keys(guardLib).indexOf('bestEffortInstanceLocalRateGuard') >= 0,
    'F3 the exported NAME says so too — a summary cannot quote it and sound reassuring');
  var guardSrc = read(path.join(GW, 'guard.js'));
  ok(/MUST NEVER BE DESCRIBED AS A GLOBAL RATE LIMIT/.test(guardSrc),
    'F4 and the file opens by forbidding the claim');
  ok(/max-instances/.test(guardSrc),
    'F5 and names what the ACTUAL hard bound on spend is: the max-instances flag, not this code');

  /* The bucket itself. A fake clock, because a rate limiter tested against the real one is a test that
     passes at a different rate on a busy machine. */
  var t = 1000;
  var b = guardLib.tokenBucket({ capacity: 3, refillPerSecond: 1, now: function () { return t; } });
  eq([b.take('a').allowed, b.take('a').allowed, b.take('a').allowed, b.take('a').allowed],
    [true, true, true, false], 'F6 a burst of three is allowed and the fourth is not');
  eq(b.take('b').allowed, true, 'F7 a different caller has its own budget');
  t += 2000;
  eq([b.take('a').allowed, b.take('a').allowed, b.take('a').allowed],
    [true, true, false], 'F8 two seconds later exactly two tokens have returned');

  /* THE TABLE IS BOUNDED. An unbounded map keyed by remote address IS the denial of service. */
  var big = guardLib.tokenBucket({ capacity: 1, refillPerSecond: 1, maxKeys: 50, now: function () { return t; } });
  for (var i = 0; i < 500; i++) big.take('ip-' + i);
  ok(big.size() <= 50, 'F9 the bucket table is capped, so the limiter cannot become the memory attack');

  /* CONSULTING THE BUDGET SPENDS NOTHING. The failed-authentication limiter is consulted on every
     request and charged only when a verification fails; if the consultation spent a token, a
     legitimate operator would be paying into the flooder's budget every time they signed in. */
  var pk = guardLib.tokenBucket({ capacity: 2, refillPerSecond: 0.01, now: function () { return t; } });
  for (var j = 0; j < 20; j++) pk.peek('same-ip');
  eq([pk.take('same-ip').allowed, pk.take('same-ip').allowed, pk.take('same-ip').allowed],
    [true, true, false], 'F9a twenty consultations spend nothing; the two tokens are still there');
  eq(pk.peek('never-seen').allowed, true, 'F9b and an unknown caller is not charged for being asked about');

  // --- the circuit breaker -------------------------------------------------------------------------
  var ct = 0;
  var cb = guardLib.upstreamCircuitBreaker({ threshold: 3, cooldownMs: 1000, now: function () { return ct; } });
  eq(cb.admit().allowed, true, 'F10 the circuit starts closed');
  cb.recordFailure(); cb.recordFailure();
  eq(cb.state(), 'closed', 'F11 two failures do not open it');
  cb.recordFailure();
  eq(cb.state(), 'open', 'F12 the third does');
  eq(cb.admit().allowed, false, 'F13 and an open circuit calls nothing at all');
  ct += 1001;
  var probe = cb.admit();
  eq([probe.allowed, probe.state], [true, 'half'], 'F14 after the cooldown exactly one probe is let through');
  eq(cb.admit().allowed, false, 'F15 and only one — a second probe is refused while the first is in flight');
  cb.recordFailure();
  eq(cb.state(), 'open', 'F16 a failed probe re-opens it immediately, without another three failures');
  ct += 1001; cb.admit(); cb.recordSuccess();
  eq(cb.state(), 'closed', 'F17 a successful probe closes it');

  /* A TRIPPED BREAKER IS AN OUTAGE. Reporting it as NOT_AUTHORIZED would tell every operator at once
     that they had lost their permissions. */
  var r = codes.refusal(C.UPSTREAM_UNAVAILABLE, 'kmg_x');
  eq([r.kind, r.retryable, r.http_status], ['outage', true, 503],
    'F18 the code a tripped breaker returns is an outage, retryable, 503');

  // --- the two new codes ---------------------------------------------------------------------------
  var tm = codes.refusal(C.TOO_MANY_REQUESTS, 'kmg_x');
  eq([tm.kind, tm.retryable, tm.http_status], ['throttle', true, 429],
    'F19 TOO_MANY_REQUESTS is its own kind: neither a statement about rights nor a fault');
  ok(!/\d/.test(tm.message), 'F20 and its message quotes no number a flooder could calibrate against');
  var pl = codes.refusal(C.PAYLOAD_TOO_LARGE, 'kmg_x');
  eq([pl.kind, pl.http_status], ['answer', 413], 'F21 PAYLOAD_TOO_LARGE is an answer, 413');
  ok(pl.message !== codes.PUBLIC_MESSAGE.ACTION_MISMATCH,
    'F22 and no longer says "altered in transit", which sent people to look for a network fault');
  eq(Object.keys(C).length, 20, 'F23 twenty codes — the two additions are declared, not smuggled');

  /* Every code still has all four of its parts. A code added without its message would surface as
     "The request was refused." and mean nothing. */
  var missing = Object.keys(C).filter(function (k) {
    return !codes.PUBLIC_MESSAGE[k] || !codes.HTTP_STATUS[k]
      || (codes.ANSWERS.concat(codes.OUTAGES, codes.THROTTLES).indexOf(k) < 0);
  });
  eq(missing, [], 'F24 every code has a message, a status and exactly one classification');
});

// ===================================================================================================
step(function () {
  console.log('\n=== §G  HEADERS, REDIRECTS AND THE RESPONSE CEILING ===');

  var SH = httpUtil.SECURITY_HEADERS;
  eq(SH['Cache-Control'], 'no-store', 'G1 no-store');
  ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Content-Security-Policy']
    .forEach(function (h, i) { ok(!!SH[h], 'G' + (2 + i) + ' ' + h + ' is set'); });
  ok(!SH['Access-Control-Allow-Credentials'],
    'G6 and there is still no Access-Control-Allow-Credentials anywhere');

  var srvSrc = read(path.join(GW, 'server.js'));
  ok(/httpUtil\.SECURITY_HEADERS/.test(srvSrc), 'G7 the server applies them from one place');
  ok(/res\.writeHead\(404, httpUtil\.SECURITY_HEADERS\)/.test(srvSrc),
    'G8 including on the 404, which is the response easiest to forget');

  /* Redirect destinations are an allowlist. */
  eq(httpUtil.redirectHostAllowed('script.google.com'), true, 'G9 the Apps Script host is followed');
  eq(httpUtil.redirectHostAllowed('script.googleusercontent.com'), true, 'G10 and its echo host');
  eq(httpUtil.redirectHostAllowed('attacker.test'), false, 'G11 an arbitrary host is not');
  eq(httpUtil.redirectHostAllowed('script.google.com.attacker.test'), false,
    'G12 nor one that merely CONTAINS the real name');
  eq(httpUtil.redirectHostAllowed('notscript.google.com'), false, 'G13 nor one that ends with it');
  eq(httpUtil.redirectHostAllowed('a.googleusercontent.com', ['.googleusercontent.com']), true,
    'G14 a leading-dot entry means "a subdomain of"');
  eq(httpUtil.redirectHostAllowed('notgoogleusercontent.com', ['.googleusercontent.com']), false,
    'G15 and only at a label boundary');
  eq(httpUtil.redirectHostAllowed('googleusercontent.com', ['.googleusercontent.com']), false,
    'G16 the bare domain is not a subdomain of itself');

  var httpSrc = read(path.join(GW, 'http.js'));
  ok(/maxBytes/.test(httpSrc) && /exceeded/.test(httpSrc),
    'G17 the upstream reply is bounded while it is read, not after it has been buffered');

  /* G18 IS A REGRESSION TEST FOR A MISTAKE MADE WHILE WRITING G9-G16. The allowlist was applied to the
     FIRST hop as well as to redirects, so a deployment whose configured upstream was not on the list -
     which includes every local end-to-end, pointing at a mock on 127.0.0.1 - turned a working 200 into
     UPSTREAM_UNAVAILABLE. The configured destination was already validated at startup; the thing that
     needs an allowlist is where the ANSWER says to go next. Caught by the browser end-to-end, which is
     why that end-to-end exists. */
  ok(!/function go\(target, hops\) \{[\s\S]{0,200}?redirectHostAllowed/.test(httpSrc),
    'G18 the allowlist governs REDIRECTS, not the configured upstream the deployment was told to call');
  ok(/urlmod\.parse\(urlStr\)\.hostname/.test(httpSrc),
    'G18a the configured upstream host is added to the allowed destinations, so a redirect home is fine');
  ok(/function getFollow\(target, hops\) \{[\s\S]{0,320}?redirectHostAllowed/.test(httpSrc),
    'G19 and the redirect hop IS checked');
});

// ===================================================================================================
step(function () {
  console.log('\n=== §H  THE ISOLATED ACCEPTANCE PATH IS ISOLATED ===');

  /* §9 requires the two evidence paths to be SEPARATED, and the separation has to be a property of the
     code rather than of the discipline of whoever runs the tests. */
  ok(!configLib.load({
    NODE_ENV: 'production', AUTH_VERIFIER: 'local', GOOGLE_OAUTH_CLIENT_ID: 'x',
    ALLOWED_ORIGINS: 'https://e.github.io', APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/P/exec',
    ALLOWED_ACTIONS: 'a.b', HMAC_ACTIVE_KEY_ID: 'k1', HMAC_ACTIVE_KEY_FILE: '/k',
    OPERATOR_REGISTRY_FILE: '/r'
  }).ok, 'H1 the acceptance verifier cannot be selected in production, whatever the environment says');

  var vsrc = read(path.join(GW, 'verifier.js'));
  ok(/IS NOT A RELAXED PRODUCTION PATH AND MUST NEVER BECOME ONE/.test(vsrc),
    'H2 and the file says so where somebody would be editing it');
  ok(!/googleapis\.com/.test(vsrc.split('localJwksVerifier')[1] || ''),
    'H3 the test verifier has no code path that could fetch Google\'s keys');

  /* The acceptance path genuinely accepts — with a key this process made. */
  var v = verifierLib.localJwksVerifier(H.jwks());
  return v.verify(H.mintToken(H.claims())).then(function (r) {
    eq(r.ok, true, 'H4 a correctly signed test identity is accepted by the test verifier');
    eq(r.verified_by, 'local-jwks', 'H5 and is LABELLED as test-verified, in the principal itself');
    return v.verify(H.mintToken(H.claims(), { key: FAKE_CA.otherPrivate })).then(function (r2) {
      eq(r2.ok, false, 'H6 and a wrongly signed one is refused — the cryptography is real');
      ok(true, 'H7 REAL_GOOGLE_TOKEN_ACCEPTANCE = NOT_YET_PROVEN: no real token exists to try');
    });
  });
});

// ===================================================================================================
step(function () {
  console.log('\n=== §I  THE PRODUCTION PROCESS, AS A PROCESS ===');
  var proof = require('./_sec-a2r-prod-mode-proof.js');
  return proof.run().then(function (R) {
    ok(!R.error, 'I1 the production-mode proof ran' + (R.error ? ': ' + R.error : ''));
    eq(R.started, true, 'I2 a correctly configured production process starts');

    /* Every bad configuration EXITS, with EX_CONFIG, having said why. */
    var bad = R.startup.filter(function (s) { return s.value.exitCode !== 78 || !s.value.printedReason; });
    eq(bad.map(function (b) { return b.name; }), [],
      'I3 all ' + R.startup.length + ' bad configurations exit 78 with a printed reason');

    function c(name) {
      var f = R.cases.filter(function (x) { return x.name === name; })[0];
      return f ? f.value : null;
    }
    eq(c('healthz').status, 200, 'I4 /healthz answers');
    eq(c('healthz').cacheControl, 'no-store', 'I4a with no-store');
    eq(Object.keys(c('healthz').body).sort(), ['ok', 'service'],
      'I4b and says NOTHING else — no config, no endpoint, no version');
    eq(c('readyz').status, 200, 'I5 /readyz answers when the key is present');
    eq(c('readyz').body.signing_key, 'present', 'I5a as a presence flag');
    ok(JSON.stringify(c('readyz').body).indexOf('/') < 0,
      'I5b and no path, id or address appears in it');
    eq(c('readyz').body.operators, { operators: 1, active: 1, disabled: 0, awaiting_first_sign_in: 1 },
      'I5c the registry is reported as COUNTS, never as names');

    eq(c('unknown route').status, 404, 'I6 an unknown route is 404');
    eq(c('unknown route').allowOrigin, null, 'I6a with no CORS headers, so a browser cannot read it');
    eq(c('preflight from an allowed origin').status, 204, 'I7 a real preflight is answered');
    eq(c('preflight from an allowed origin').allowCredentials, null, 'I7a without credentials');
    eq(c('preflight from a foreign origin').status, 403, 'I8 a foreign preflight is refused');

    eq(c('no credential').code, C.NOT_AUTHENTICATED, 'I9 no credential -> NOT_AUTHENTICATED 401');
    eq(c('an action this gateway does not serve').code, C.NOT_AUTHORIZED,
      'I10 a real production action this gateway does not serve is refused AT the gateway');

    /* THE REGRESSION TEST. */
    var cert = c('token offered while the certificate source is unreachable');
    eq(cert.code, C.IDENTITY_PROVIDER_UNAVAILABLE,
      'I11 an unreachable certificate source is an OUTAGE, not a rejected sign-in');
    eq([cert.status, cert.kind, cert.retryable], [503, 'outage', true], 'I11a 503, outage, retryable');
    ok(/^CONNECT www\.googleapis\.com:443/.test(cert.proxyFirstLine || ''),
      'I11b and the real library really tried — the CONNECT landed on THIS machine, not at Google');

    eq(c('foreign origin on the call itself').status, 403, 'I12 a call from a foreign origin is refused');
    eq(c('a body above the limit').status, 413, 'I13 an oversized body is refused');
    eq(c('a body above the limit').code, C.PAYLOAD_TOO_LARGE,
      'I13a and the caller actually RECEIVES the reason rather than a reset socket');

    var flood = c('a flood from one address');
    ok(flood.throttled > 0, 'I14 a flood from one address meets the guard (' + flood.throttled + ' of ' + flood.total + ')');
    eq(flood.code, C.TOO_MANY_REQUESTS, 'I14a with TOO_MANY_REQUESTS');
    ok(!!flood.retryAfterHeader, 'I14b Retry-After is a header');
    eq(flood.bodyMentionsANumber, false, 'I14c and the body quotes no number');

    // --- leakage ---------------------------------------------------------------------------------
    eq(R.leakage.tokenInLogs, false, 'I15 the token appears in no log line');
    eq(R.leakage.tokenTailInLogs, false, 'I15a not even a fragment of it');
    eq(R.leakage.secretInLogs, false, 'I16 nor the HMAC secret');
    eq(R.leakage.secretPathInLogs, false, 'I16a nor the path it is mounted at');
    eq(R.leakage.stackTraceInLogs, false, 'I17 no stack trace was printed');
    eq(R.leakage.libraryErrorTextInLogs, false, 'I17a nor the library\'s own error text');
    eq(R.leakage.logLinesAreJson, true, 'I18 every log line is structured JSON');

    // --- shutdown --------------------------------------------------------------------------------
    return proof.drainProof().then(function (D) {
      eq(D.started, true, 'I19 the drain proof started a real process');
      eq(D.readyBeforeTermination, 200, 'I20 ready before termination');
      eq(D.readyDuringDrain, 503, 'I21 NOT ready during the drain — the flip is observable, not notional');
      eq(D.drainingFlagDuringDrain, true, 'I21a and /readyz says draining');
      eq(D.drainLogged, true, 'I22 the handler ran');
      eq(D.closedCleanly, true, 'I23 the server closed cleanly rather than being cut off');
      eq(D.exitCode, 0, 'I24 and the process chose its own exit code');
      ok(true, 'I25 NOTE platform=' + D.platform + ': ' + (D.platform === 'win32'
        ? 'Windows has no SIGTERM, so DELIVERY is unproven here and the handler was invoked directly'
        : 'the OS delivered the signal'));
    });
  });
});

// ===================================================================================================
step(function () {
  console.log('\n=== §J  MUTANTS ===');
  function mutant(label, broken) {
    var caught = false;
    try { caught = broken() === true; } catch (e) { caught = true; }
    if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
    else { mutSurvived++; console.log('  SURVIVED ' + label); }
  }

  var cfgSrc = read(path.join(GW, 'config.js'));
  var vSrc = read(path.join(GW, 'verifier.js'));
  var gSrc = read(path.join(GW, 'guard.js'));
  var dSrc = read(path.join(PKG, 'Dockerfile'));
  var sSrc = read(path.join(GW, 'server.js'));
  var iSrc = read(path.join(GW, 'index.js'));

  function prodCfg(over) {
    var env = {
      NODE_ENV: 'production', AUTH_VERIFIER: 'google', GOOGLE_OAUTH_CLIENT_ID: 'x',
      ALLOWED_ORIGINS: 'https://e.github.io',
      APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/P/exec',
      ALLOWED_ACTIONS: 'a.b', HMAC_ACTIVE_KEY_ID: 'k1', HMAC_ACTIVE_KEY_FILE: '/k',
      OPERATOR_REGISTRY_FILE: '/r'
    };
    for (var k in (over || {})) { if (over[k] === undefined) delete env[k]; else env[k] = over[k]; }
    return configLib.load(env);
  }

  /* J1 — the defect this round found. Remove the wrapper match and classify by cause only; a
     certificate fetch that fails with no transport word becomes a REJECTED TOKEN. */
  mutant('J1 the certificate-fetch wrapper stops being matched, so a Google outage reads as a bad token', function () {
    var anchored = /CERT_FETCH_FAILURE\.test\(m\)/.test(vSrc);
    var beforeGeneric = vSrc.indexOf('CERT_FETCH_FAILURE.test(m)') < vSrc.indexOf('var transport =');
    var generic = /getaddrinfo\|ENOTFOUND/.test(vSrc);
    /* The probe is the ORDER, because the two lines only differ when the wrapper is matched first. */
    return anchored && beforeGeneric && generic;
  });

  /* THERE IS NO J1a. It was written as `return true` with a comment explaining that the real
     assertion lives in §B13 — which is to say, a mutant that could not fail. A mutant that catches
     nothing is more misleading than no mutant at all, because the count says something was checked.
     Deleted rather than dressed up. */

  mutant('J2 the production origin check accepts a loopback origin', function () {
    return prodCfg({ ALLOWED_ORIGINS: 'http://localhost:8801' }).ok === false;
  });
  mutant('J3 the upstream host check becomes a substring match', function () {
    return prodCfg({ APPS_SCRIPT_EXEC_URL: 'https://script.google.com.attacker.test/macros/s/X/exec' }).ok === false
      && /hostname !== APPS_SCRIPT_HOST/.test(cfgSrc);
  });
  mutant('J4 a plaintext upstream is permitted in production', function () {
    return prodCfg({ APPS_SCRIPT_EXEC_URL: 'http://script.google.com/macros/s/X/exec' }).ok === false;
  });
  mutant('J5 NODE_ENV is no longer validated, so a typo disables every production check', function () {
    var typo = prodCfg({ NODE_ENV: 'prod' });
    /* Without the check this would pass AND skip the loopback/https rules entirely. */
    return typo.ok === false && /VALID_NODE_ENVS/.test(cfgSrc);
  });
  mutant('J6 the secret entropy floor is removed, so a long run of one character is a key', function () {
    var r = configLib.readKeyring({ activeKeyId: 'k', activeKeyPath: '/x' },
      function () { return new Array(49).join('a'); });
    return r.active === null;
  });
  mutant('J7 the runbook placeholder stops being recognised as a placeholder', function () {
    var r = configLib.readKeyring({ activeKeyId: 'k', activeKeyPath: '/x' },
      function () { return 'REPLACE_WITH_A_REAL_SECRET_GENERATED_OFF_MACHINE'; });
    return r.active === null;
  });
  mutant('J8 production stops requiring a named operator registry', function () {
    return prodCfg({ OPERATOR_REGISTRY_FILE: undefined }).ok === false;
  });
  mutant('J9 the wildcard origin check is removed', function () {
    return prodCfg({ ALLOWED_ORIGINS: '*' }).ok === false;
  });
  mutant('J10 the upstream timeout is allowed to outlive the inbound request', function () {
    return prodCfg({ UPSTREAM_TIMEOUT_MS: '60000' }).ok === false;
  });

  mutant('J11 the redirect allowlist becomes endsWith, admitting notscript.google.com', function () {
    return httpUtil.redirectHostAllowed('notscript.google.com') === false;
  });
  mutant('J12 a leading-dot allowlist entry starts matching a bare suffix', function () {
    return httpUtil.redirectHostAllowed('evilgoogleusercontent.com', ['.googleusercontent.com']) === false;
  });
  mutant('J34 the redirect check is put back on the FIRST hop, breaking every non-Google upstream', function () {
    var h = read(path.join(GW, 'http.js'));
    return !/function go\(target, hops\) \{[\s\S]{0,200}?redirectHostAllowed/.test(h)
      && /function getFollow\(target, hops\) \{[\s\S]{0,320}?redirectHostAllowed/.test(h);
  });

  mutant('J13 the token-bucket key table becomes unbounded — the limiter becomes the memory attack', function () {
    var b = guardLib.tokenBucket({ capacity: 1, refillPerSecond: 1, maxKeys: 10, now: function () { return 0; } });
    for (var i = 0; i < 200; i++) b.take('k' + i);
    return b.size() <= 10;
  });
  mutant('J14 the circuit breaker lets more than one probe through while half open', function () {
    var t = 0;
    var cb = guardLib.upstreamCircuitBreaker({ threshold: 1, cooldownMs: 10, now: function () { return t; } });
    cb.recordFailure(); t += 11;
    return cb.admit().allowed === true && cb.admit().allowed === false;
  });
  mutant('J15 a failed half-open probe no longer re-opens the circuit', function () {
    var t = 0;
    var cb = guardLib.upstreamCircuitBreaker({ threshold: 3, cooldownMs: 10, now: function () { return t; } });
    cb.recordFailure(); cb.recordFailure(); cb.recordFailure(); t += 11;
    cb.admit(); cb.recordFailure();
    return cb.state() === 'open';
  });
  mutant('J16 the rate guard starts calling itself global', function () {
    return guardLib.bestEffortInstanceLocalRateGuard({}).isGlobal === false
      && /NOT a global/.test(guardLib.bestEffortInstanceLocalRateGuard({}).scope);
  });
  mutant('J17 a throttle is reclassified as an outage, making a limit look like a fault', function () {
    return codes.refusal(C.TOO_MANY_REQUESTS, 'x').kind === 'throttle';
  });
  mutant('J18 the throttle message starts quoting the remaining budget', function () {
    return /\d/.test(codes.PUBLIC_MESSAGE.TOO_MANY_REQUESTS) === false;
  });
  mutant('J19 an oversized body goes back to "altered in transit"', function () {
    return codes.PUBLIC_MESSAGE.PAYLOAD_TOO_LARGE !== codes.PUBLIC_MESSAGE.ACTION_MISMATCH;
  });

  mutant('J20 the Dockerfile drops USER node and runs as root', function () {
    return /^USER node$/m.test(dSrc);
  });
  mutant('J21 the base image floats to a tag without a patch version', function () {
    return /FROM\s+node:\d+\.\d+\.\d+-/.test(dSrc) && !/FROM\s+\S*:latest/.test(dSrc);
  });
  mutant('J22 the build goes back to npm install, resolving versions nobody audited', function () {
    var runs = (dSrc.match(/^RUN .*$/gm) || []).join('\n');
    return /npm ci /.test(runs) && !/npm install/.test(runs);
  });
  mutant('J23 CMD becomes shell form, so nothing forwards SIGTERM and the drain never runs', function () {
    return /CMD \[/.test(dSrc);
  });
  mutant('J24 the runtime stage starts copying the tests, putting test private keys in the image', function () {
    return !/COPY[^\n]*tests/.test(dSrc) && read(path.join(PKG, '.dockerignore')).indexOf('*.test.js') >= 0;
  });

  mutant('J25 the 404 loses its security headers', function () {
    return /res\.writeHead\(404, httpUtil\.SECURITY_HEADERS\)/.test(sSrc);
  });
  mutant('J26 no-store is dropped from the shared header set', function () {
    return httpUtil.SECURITY_HEADERS['Cache-Control'] === 'no-store';
  });
  mutant('J27 the oversized-body response goes back to destroying the socket before it flushes', function () {
    return /res\.on\('finish'/.test(sSrc) && /req\.pause\(\)/.test(sSrc);
  });
  mutant('J28 readiness stops reporting the drain, so the flip becomes unobservable again', function () {
    return /deps\.draining/.test(sSrc) && /SHUTDOWN_PREDRAIN_MS/.test(iSrc);
  });
  mutant('J29 the socket closes in the same tick as the readiness flip', function () {
    return /setTimeout\(function \(\) \{\s*srv\.close/.test(iSrc);
  });
  mutant('J30 the failed-attempt limiter starts announcing itself instead of answering INVALID_TOKEN', function () {
    var pSrc = read(path.join(GW, 'pipeline.js'));
    return /attemptBudget\.allowed/.test(pSrc) && /deny\(CODES\.INVALID_TOKEN, 'attempt budget exhausted'\)/.test(pSrc);
  });
  /* The consult must not SPEND. If it does, every successful sign-in pays into the flooder's budget
     and a busy legitimate operator eventually locks themselves out of an invisible limiter. */
  mutant('J32 consulting the failed-auth budget starts spending from it', function () {
    var t = 0;
    var b = guardLib.tokenBucket({ capacity: 2, refillPerSecond: 0.1, now: function () { return t; } });
    b.peek('ip'); b.peek('ip'); b.peek('ip'); b.peek('ip'); b.peek('ip');
    return b.take('ip').allowed === true && b.take('ip').allowed === true;
  });
  mutant('J33 the failed-auth budget stops being charged when a verification actually fails', function () {
    var pSrc = read(path.join(GW, 'pipeline.js'));
    return /chargeFailedAuth/.test(pSrc) && /peekAuthAttempt/.test(pSrc);
  });
  mutant('J31 the guard file stops naming max-instances as the real bound on spend', function () {
    return /max-instances/.test(gSrc);
  });
});

// ===================================================================================================
(function runAll(i) {
  if (i >= steps.length) {
    console.log('\n' + new Array(101).join('='));
    console.log('passed ' + pass + '  failed ' + fail
      + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
    console.log(new Array(101).join('='));
    process.exit(fail || mutSurvived ? 1 : 0);
    return;
  }
  var r;
  try { r = steps[i](); }
  catch (e) { fail++; console.log('  FAIL step ' + i + ' threw: ' + (e && e.stack || e)); }
  Promise.resolve(r).then(function () { runAll(i + 1); }, function (e) {
    fail++; console.log('  FAIL step ' + i + ' rejected: ' + (e && e.stack || e));
    runAll(i + 1);
  });
})(0);
