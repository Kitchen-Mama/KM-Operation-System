/**
 * ==================================================================================================
 * PRODUCTION-MODE PROCESS PROOF                                            SEC-A2R §4 §5 §6 §9
 * ==================================================================================================
 *
 * This is not a unit test. It starts `src/index.js` AS A SEPARATE OPERATING SYSTEM PROCESS, with
 * NODE_ENV=production, the real `google-auth-library` loaded, a real secret file on disk and a real
 * TCP socket — and then talks to it over HTTP and kills it with a real SIGTERM.
 *
 * WHY A CHILD PROCESS AND NOT A REQUIRE(). Everything this file proves is a property of the PROCESS
 * and cannot be observed from inside it: that a bad configuration makes it EXIT rather than warn,
 * that exit code 78 is what a deployment sees, that SIGTERM drains instead of severing, that the
 * headers on the socket are the headers the code intended. A test that imports `createServer` has
 * skipped the entry point, which is the file whose entire job is refusing to start.
 *
 * ------------------------------------------------------------------------------------------------
 * HOW THIS STAYS ENTIRELY ON LOOPBACK WHILE THE REAL GOOGLE LIBRARY REALLY RUNS
 * ------------------------------------------------------------------------------------------------
 * google-auth-library fetches Google's signing certificates before it will look at a token, so a
 * production-mode process handed any token wants to reach `www.googleapis.com`. SEC-A2R §2 permits
 * localhost only. The resolution is not to stub the library — stubbing it would prove nothing about
 * the production path — but to move the DESTINATION: `HTTPS_PROXY` is a standard environment control
 * that gaxios honours, and pointing it at a socket on 127.0.0.1 means the real library issues its
 * real request to a real address that happens to be this machine. NO CODE IS CHANGED FOR THE TEST,
 * and the proxy RECORDS the CONNECT line it receives, which is the positive evidence that the traffic
 * arrived here rather than at Google.
 *
 * AND THAT SETUP TESTS THE EXACT DEFECT THIS ROUND FOUND. With the certificates unreachable, the
 * library throws `Failed to retrieve verification certificates: <cause>` — for DNS failure, refused
 * connection, a 500 from Google, anything. Before SEC-A2R the adapter classified that by inspecting
 * the cause, so a cause without a transport-looking word became `rejected`, and the gateway told a
 * real operator their sign-in was invalid while the truth was that GOOGLE WAS UNREACHABLE. The
 * correct answer is IDENTITY_PROVIDER_UNAVAILABLE: an outage, retryable, nothing to do with them.
 *
 * The CRYPTOGRAPHIC rejections — wrong signature, wrong audience, wrong issuer, unknown key — are
 * proved in-process in the readiness suite, where the library's transporter can be handed a
 * controlled certificate set. Neither location proves a REAL Google token is accepted, and this file
 * says so where it reports.
 * ==================================================================================================
 */
'use strict';

var path = require('path');
var fs = require('fs');
var os = require('os');
var net = require('net');
var http = require('http');
var crypto = require('crypto');
var child = require('child_process');

var ROOT = path.resolve(__dirname, '..', '..');
var GW = path.join(ROOT, 'services', 'auth-gateway');
var ENTRY = path.join(GW, 'src', 'index.js');

/* THE WORKSPACE IS OUTSIDE THE REPOSITORY. It holds a real, randomly generated HMAC secret for the
   lifetime of this run. A secret written inside a working tree is a secret one `git add -A` away from
   being permanent, and the fact that this one is disposable is not visible to git. */
var WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'kmga-prod-'));

function cleanup() {
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}

// --------------------------------------------------------------------------------------------------
function freePort() {
  return new Promise(function (res) {
    var s = net.createServer();
    s.listen(0, '127.0.0.1', function () { var p = s.address().port; s.close(function () { res(p); }); });
  });
}

function request(port, opts) {
  return new Promise(function (resolve) {
    var body = opts.body === undefined ? null : opts.body;
    var req = http.request({
      host: '127.0.0.1', port: port, path: opts.path, method: opts.method || 'GET',
      headers: opts.headers || {}
    }, function (res) {
      var buf = '';
      res.setEncoding('utf8');
      res.on('data', function (d) { buf += d; });
      res.on('end', function () {
        var json = null;
        try { json = JSON.parse(buf); } catch (e) { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, raw: buf, json: json });
      });
    });
    req.on('error', function (e) { resolve({ status: 0, headers: {}, raw: String(e.message), json: null }); });
    if (body !== null) req.write(body);
    req.end();
  });
}

/**
 * A socket on loopback that pretends to be an HTTPS proxy and refuses every tunnel. Its purpose is
 * twofold: it keeps the library's certificate fetch on this machine, and the CONNECT lines it records
 * are the PROOF that it did.
 */
function startBlackholeProxy() {
  var seen = [];
  var srv = net.createServer(function (sock) {
    sock.once('data', function (d) {
      seen.push(String(d).split('\r\n')[0]);
      sock.destroy();                     // a refused tunnel: the fetch fails, nothing leaves the host
    });
    sock.on('error', function () {});
  });
  return new Promise(function (res) {
    srv.listen(0, '127.0.0.1', function () {
      res({ port: srv.address().port, seen: seen, close: function () { srv.close(); } });
    });
  });
}

// --------------------------------------------------------------------------------------------------
function writeFixtures() {
  /* Re-created on demand: `run()` deletes the workspace when it finishes, and `drainProof()` runs
     after it. A disposable secret directory that outlived the thing that needed it would be the
     opposite of the point. */
  fs.mkdirSync(WORK, { recursive: true });
  var secretPath = path.join(WORK, 'active-key');
  /* Generated here, now, and never the same twice. This is the shape the runbook's
     `openssl rand -base64 48` produces, and the entropy floor in config.readKeyring accepts. */
  fs.writeFileSync(secretPath, crypto.randomBytes(48).toString('base64'), 'utf8');

  var registryPath = path.join(WORK, 'operators.json');
  fs.writeFileSync(registryPath, JSON.stringify([{
    provider: 'google', subject: '1122334455', status: 'active',
    email: 'ops.fixture@shopkitchenmama.com',
    actions: ['productPricing.workspace.get', 'productPricing.siteUniverse.get'],
    sites: [{ company_code: 'KM', site_code: 'KM-MAIN' }]
  }], null, 2), 'utf8');

  return { secretPath: secretPath, registryPath: registryPath };
}

function prodEnv(fx, port, proxyPort) {
  return {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
    NODE_ENV: 'production',
    AUTH_VERIFIER: 'google',
    PORT: String(port),
    /* A placeholder client id and a placeholder deployment id. Both are SHAPES, not values: no real
       OAuth client and no real deployment exists, and §2 forbids either appearing here. */
    GOOGLE_OAUTH_CLIENT_ID: 'REPLACE-WITH-TEST-CLIENT-ID.apps.googleusercontent.com',
    ALLOWED_ORIGINS: 'https://example.github.io',
    APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/PLACEHOLDER_DEPLOYMENT_ID/exec',
    ALLOWED_ACTIONS: 'productPricing.workspace.get,productPricing.siteUniverse.get',
    HMAC_ACTIVE_KEY_ID: 'k1',
    HMAC_ACTIVE_KEY_FILE: fx.secretPath,
    OPERATOR_REGISTRY_FILE: fx.registryPath,
    SHUTDOWN_GRACE_MS: '3000',
    HTTPS_PROXY: 'http://127.0.0.1:' + proxyPort,
    HTTP_PROXY: 'http://127.0.0.1:' + proxyPort
  };
}

function spawnGateway(env) {
  var p = child.spawn(process.execPath, [ENTRY], { env: env, stdio: ['ignore', 'pipe', 'pipe'] });
  var out = [];
  p.stdout.on('data', function (d) { out.push(String(d)); });
  p.stderr.on('data', function (d) { out.push(String(d)); });
  return { proc: p, out: out, text: function () { return out.join(''); } };
}

function waitForListen(g, timeoutMs) {
  return new Promise(function (resolve) {
    var done = false, t0 = Date.now();
    var iv = setInterval(function () {
      if (done) return;
      if (/"message":"listening"/.test(g.text())) { done = true; clearInterval(iv); resolve(true); }
      else if (g.proc.exitCode !== null || Date.now() - t0 > timeoutMs) { done = true; clearInterval(iv); resolve(false); }
    }, 40);
  });
}

function waitForExit(proc, timeoutMs) {
  return new Promise(function (resolve) {
    var settled = false;
    var t = setTimeout(function () { if (!settled) { settled = true; resolve({ timedOut: true }); } }, timeoutMs);
    proc.on('exit', function (code, signal) {
      if (settled) return;
      settled = true; clearTimeout(t);
      resolve({ timedOut: false, code: code, signal: signal });
    });
  });
}

// --------------------------------------------------------------------------------------------------
function run() {
  var R = { cases: [], startup: [], notes: [] };
  function record(list, name, value) { list.push({ name: name, value: value }); return value; }

  var fx = writeFixtures();
  var proxy = null, gw = null;

  return startBlackholeProxy().then(function (p) {
    proxy = p;

    // ---- 1  A BAD CONFIGURATION MUST MAKE THE PROCESS EXIT, NOT WARN ------------------------------
    var startupCases = [
      ['no origins', { ALLOWED_ORIGINS: '' }],
      ['wildcard origin', { ALLOWED_ORIGINS: '*' }],
      ['loopback origin in production', { ALLOWED_ORIGINS: 'http://localhost:8801' }],
      ['plaintext http origin', { ALLOWED_ORIGINS: 'http://example.github.io' }],
      ['plaintext upstream', { APPS_SCRIPT_EXEC_URL: 'http://script.google.com/macros/s/X/exec' }],
      ['foreign upstream host', { APPS_SCRIPT_EXEC_URL: 'https://script.google.com.attacker.test/macros/s/X/exec' }],
      ['no client id', { GOOGLE_OAUTH_CLIENT_ID: '' }],
      ['no action allowlist', { ALLOWED_ACTIONS: '' }],
      ['no operator registry source', { OPERATOR_REGISTRY_FILE: '' }],
      ['test verifier selected', { AUTH_VERIFIER: 'local' }],
      ['NODE_ENV misspelled as prod', { NODE_ENV: 'prod' }],
      ['assertion ttl above the ceiling', { ASSERTION_TTL_SECONDS: '900' }],
      ['upstream timeout outlives the request', { UPSTREAM_TIMEOUT_MS: '60000' }]
    ];

    return freePort().then(function (basePort) {
      var chain = Promise.resolve();
      startupCases.forEach(function (c, i) {
        chain = chain.then(function () {
          var env = prodEnv(fx, basePort + 1 + i, proxy.port);
          for (var k in c[1]) env[k] = c[1][k];
          var g = spawnGateway(env);
          return waitForExit(g.proc, 8000).then(function (r) {
            try { g.proc.kill(); } catch (e) { /* already gone */ }
            record(R.startup, c[0], { exitCode: r.code, timedOut: !!r.timedOut, printedReason: /"problem"/.test(g.text()) });
          });
        });
      });

      // ---- 2  A WEAK SECRET IS NOT A KEY -----------------------------------------------------------
      chain = chain.then(function () {
        var weak = path.join(WORK, 'weak-key');
        fs.writeFileSync(weak, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'utf8');  // 48 chars, 1 distinct
        var env = prodEnv(fx, basePort + 40, proxy.port);
        env.HMAC_ACTIVE_KEY_FILE = weak;
        var g = spawnGateway(env);
        return waitForExit(g.proc, 8000).then(function (r) {
          try { g.proc.kill(); } catch (e) {}
          record(R.startup, 'long but non-random secret', {
            exitCode: r.code, timedOut: !!r.timedOut,
            printedReason: /distinct characters/.test(g.text())
          });
        });
      });

      chain = chain.then(function () {
        var ph = path.join(WORK, 'placeholder-key');
        fs.writeFileSync(ph, 'REPLACE_WITH_A_REAL_SECRET_GENERATED_OFF_MACHINE', 'utf8');
        var env = prodEnv(fx, basePort + 41, proxy.port);
        env.HMAC_ACTIVE_KEY_FILE = ph;
        var g = spawnGateway(env);
        return waitForExit(g.proc, 8000).then(function (r) {
          try { g.proc.kill(); } catch (e) {}
          record(R.startup, 'the runbook placeholder left in place', {
            exitCode: r.code, timedOut: !!r.timedOut, printedReason: /placeholder/.test(g.text())
          });
        });
      });

      return chain.then(function () { return basePort; });
    });
  })
  // ---- 3  THE PROCESS THAT DOES START ------------------------------------------------------------
  .then(function () {
    return freePort();
  })
  .then(function (port) {
    gw = spawnGateway(prodEnv(fx, port, proxy.port));
    return waitForListen(gw, 15000).then(function (up) {
      R.started = up;
      if (!up) { R.notes.push('the production process did not start; log: ' + gw.text().slice(0, 400)); return R; }

      var ORIGIN = 'https://example.github.io';
      function call(body, origin) {
        return request(port, {
          path: '/v1/call', method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Origin': origin === undefined ? ORIGIN : origin },
          body: body
        });
      }
      /* A syntactically real, cryptographically worthless token. It is never valid anywhere, and it is
         the string searched for afterwards in every response and every log line. */
      var FAKE_TOKEN = (function () {
        var b = function (o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); };
        var now = Math.floor(Date.now() / 1000);
        return b({ alg: 'RS256', kid: 'nonexistent-kid', typ: 'JWT' }) + '.'
          + b({ iss: 'https://accounts.google.com', aud: 'REPLACE-WITH-TEST-CLIENT-ID.apps.googleusercontent.com',
                sub: '1122334455', exp: now + 600, iat: now, email: 'ops.fixture@shopkitchenmama.com',
                email_verified: true })
          + '.' + crypto.randomBytes(256).toString('base64url');
      })();
      R.fakeTokenTail = FAKE_TOKEN.slice(-24);

      var chain = Promise.resolve();
      function c(name, p) { chain = chain.then(p).then(function (v) { record(R.cases, name, v); }); }

      c('healthz', function () {
        return request(port, { path: '/healthz' }).then(function (r) {
          return { status: r.status, body: r.json, cacheControl: r.headers['cache-control'],
                   nosniff: r.headers['x-content-type-options'] };
        });
      });

      c('readyz', function () {
        return request(port, { path: '/readyz' }).then(function (r) {
          return { status: r.status, body: r.json, cacheControl: r.headers['cache-control'] };
        });
      });

      c('unknown route', function () {
        return request(port, { path: '/admin' }).then(function (r) {
          return { status: r.status, cacheControl: r.headers['cache-control'],
                   allowOrigin: r.headers['access-control-allow-origin'] || null };
        });
      });

      c('preflight from an allowed origin', function () {
        return request(port, { path: '/v1/call', method: 'OPTIONS', headers: { Origin: ORIGIN } })
          .then(function (r) {
            return { status: r.status, allowOrigin: r.headers['access-control-allow-origin'] || null,
                     allowCredentials: r.headers['access-control-allow-credentials'] || null,
                     vary: r.headers['vary'] || null };
          });
      });

      c('preflight from a foreign origin', function () {
        return request(port, { path: '/v1/call', method: 'OPTIONS', headers: { Origin: 'https://example.github.io.attacker.test' } })
          .then(function (r) {
            return { status: r.status, allowOrigin: r.headers['access-control-allow-origin'] || null };
          });
      });

      c('no credential', function () {
        return call(JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {} })).then(function (r) {
          return { status: r.status, code: r.json && r.json.code, kind: r.json && r.json.kind,
                   retryable: r.json && r.json.retryable, message: r.json && r.json.message };
        });
      });

      c('an action this gateway does not serve', function () {
        return call(JSON.stringify({ action: 'replenishment.plan.submit', payload: {}, credential: FAKE_TOKEN }))
          .then(function (r) { return { status: r.status, code: r.json && r.json.code }; });
      });

      /* THE REGRESSION TEST FOR THE DEFECT THIS ROUND FOUND. The real library really tries to fetch
         Google's certificates, the fetch really fails because it was routed to a socket on this
         machine that refuses, and the answer must be an OUTAGE — not a statement about the token. */
      c('token offered while the certificate source is unreachable', function () {
        return call(JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {}, credential: FAKE_TOKEN }))
          .then(function (r) {
            return { status: r.status, code: r.json && r.json.code, kind: r.json && r.json.kind,
                     retryable: r.json && r.json.retryable, message: r.json && r.json.message,
                     proxyConnectsSeen: proxy.seen.length, proxyFirstLine: proxy.seen[0] || null };
          });
      });

      c('foreign origin on the call itself', function () {
        return call(JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {}, credential: FAKE_TOKEN }),
          'https://attacker.test').then(function (r) {
          return { status: r.status, code: r.json && r.json.code,
                   allowOrigin: r.headers['access-control-allow-origin'] || null };
        });
      });

      c('a body above the limit', function () {
        return call(JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: { blob: 'x'.repeat(200000) }, credential: FAKE_TOKEN }))
          .then(function (r) { return { status: r.status, code: r.json && r.json.code }; });
      });

      /* The coarse per-IP guard: burst 60, refill 2/s. Eighty rapid calls must find the wall. */
      c('a flood from one address', function () {
        var results = [];
        var seq = Promise.resolve();
        for (var i = 0; i < 80; i++) {
          seq = seq.then(function () {
            return call(JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {} }))
              .then(function (r) { results.push({ s: r.status, c: r.json && r.json.code, ra: r.headers['retry-after'] || null }); });
          });
        }
        return seq.then(function () {
          var throttled = results.filter(function (x) { return x.s === 429; });
          return {
            total: results.length,
            throttled: throttled.length,
            firstThrottledAt: results.findIndex(function (x) { return x.s === 429; }),
            code: throttled.length ? throttled[0].c : null,
            retryAfterHeader: throttled.length ? throttled[0].ra : null,
            bodyMentionsANumber: throttled.length ? /\d/.test(JSON.stringify(throttled[0].c)) : null
          };
        });
      });

      // ---- 4  NOTHING LEAKED ----------------------------------------------------------------------
      chain = chain.then(function () {
        var logs = gw.text();
        R.leakage = {
          tokenInLogs: logs.indexOf(FAKE_TOKEN) >= 0,
          tokenTailInLogs: logs.indexOf(R.fakeTokenTail) >= 0,
          secretInLogs: logs.indexOf(fs.readFileSync(fx.secretPath, 'utf8')) >= 0,
          secretPathInLogs: logs.indexOf(fx.secretPath) >= 0,
          stackTraceInLogs: /\n\s+at\s+\w/.test(logs),
          libraryErrorTextInLogs: /Failed to retrieve verification certificates/.test(logs),
          logLinesAreJson: logs.trim().split('\n').every(function (l) {
            if (!l.trim()) return true;
            try { JSON.parse(l); return true; } catch (e) { return false; }
          })
        };
      });

      // ---- 5  TERMINATION -------------------------------------------------------------------------
      /* WHAT `kill('SIGTERM')` ACTUALLY DOES HERE DEPENDS ON THE OPERATING SYSTEM, and pretending
         otherwise would be the whole point of this file wasted. Windows HAS NO SIGTERM: Node maps
         `kill('SIGTERM')` onto TerminateProcess, so the process dies at once, no handler runs, and a
         green result would mean nothing. Linux — which is what the container runs on, and what Cloud
         Run sends — delivers it to the handler. Both outcomes are recorded, and the platform is
         recorded next to them, so the evidence cannot later be read as stronger than it is. */
      chain = chain.then(function () {
        return request(port, { path: '/readyz' }).then(function (before) {
          var exited = waitForExit(gw.proc, 10000);
          gw.proc.kill('SIGTERM');
          return exited.then(function (r) {
            R.shutdown = {
              platform: process.platform,
              realSignalDelivered: r.signal !== 'SIGTERM' || /"message":"draining"/.test(gw.text()),
              readyBeforeTermination: before.status,
              exitCode: r.code, signal: r.signal, timedOut: !!r.timedOut,
              drainLogged: /"message":"draining"/.test(gw.text()),
              closedCleanly: /"message":"closed cleanly"/.test(gw.text())
            };
          });
        });
      });

      return chain.then(function () { return R; });
    });
  })
  .then(function (res) {
    if (proxy) proxy.close();
    R.proxyConnects = proxy ? proxy.seen.slice() : [];
    cleanup();
    return res;
  })
  .catch(function (e) {
    try { if (gw && gw.proc) gw.proc.kill(); } catch (x) {}
    if (proxy) proxy.close();
    cleanup();
    R.error = String(e && e.stack || e);
    return R;
  });
}

/**
 * THE DRAIN, PROVED WHERE THE OPERATING SYSTEM WILL NOT DELIVER THE SIGNAL.
 *
 * A wrapper — written to the temporary workspace, never to the repository — `require`s the REAL,
 * UNMODIFIED `src/index.js`, waits to be told, and then emits SIGTERM to itself. Everything under
 * test is genuine: the same entry point, the same configuration, a real listening socket, the real
 * handler, a real `server.close()` and a real process exit.
 *
 * WHAT THIS DOES NOT PROVE, STATED PLAINLY: that the operating system delivers SIGTERM to the process.
 * On Linux it does, and on Windows there is no such signal to deliver. So this establishes that THE
 * HANDLER IS CORRECT AND WIRED UP, and leaves delivery as a property of the platform the container
 * actually runs on — which is the honest division, and better than a test that quietly passes by
 * measuring nothing.
 */
function drainProof() {
  var fx = writeFixtures();
  var out = { platform: process.platform, method: 'in-process SIGTERM emit (the OS signal is not available on every platform)' };
  return startBlackholeProxy().then(function (proxy) {
    return freePort().then(function (port) {
      var wrapper = path.join(WORK, 'drain-wrapper.js');
      fs.writeFileSync(wrapper,
        '// TEST WRAPPER. Lives in a temporary directory, never in the repository.\n' +
        '// It loads the production entry point UNCHANGED and asks it to shut down.\n' +
        "require(" + JSON.stringify(ENTRY) + ");\n" +
        "process.stdin.on('data', function () { process.emit('SIGTERM'); });\n" +
        'process.stdin.resume();\n', 'utf8');

      var env = prodEnv(fx, port, proxy.port);
      var g = child.spawn(process.execPath, [wrapper], { env: env, stdio: ['pipe', 'pipe', 'pipe'] });
      var buf = [];
      g.stdout.on('data', function (d) { buf.push(String(d)); });
      g.stderr.on('data', function (d) { buf.push(String(d)); });
      var text = function () { return buf.join(''); };

      return new Promise(function (resolve) {
        var t0 = Date.now();
        var iv = setInterval(function () {
          if (/"message":"listening"/.test(text())) { clearInterval(iv); resolve(true); }
          else if (g.exitCode !== null || Date.now() - t0 > 15000) { clearInterval(iv); resolve(false); }
        }, 40);
      }).then(function (up) {
        out.started = up;
        if (!up) { try { g.kill(); } catch (e) {} return out; }
        return request(port, { path: '/readyz' }).then(function (before) {
          out.readyBeforeTermination = before.status;
          var exited = waitForExit(g, 12000);
          g.stdin.write('stop\n');
          /* READINESS MUST FLIP BEFORE THE SOCKET CLOSES. That gap is the entire mechanism: it is how
             a load balancer learns to stop sending new work to an instance that is still answering
             the work it already has. Sampled DURING the drain, which is the only moment it exists. */
          return new Promise(function (res) { setTimeout(res, 120); })
            .then(function () { return request(port, { path: '/readyz' }); })
            .then(function (during) {
              out.readyDuringDrain = during.status;
              out.drainingFlagDuringDrain = during.json ? during.json.draining : null;
              return exited;
            })
            .then(function (r) {
              out.exitCode = r.code;
              out.timedOut = !!r.timedOut;
              out.drainLogged = /"message":"draining"/.test(text());
              out.closedCleanly = /"message":"closed cleanly"/.test(text());
              return out;
            });
        });
      }).then(function (o) { proxy.close(); cleanup(); return o; })
        .catch(function (e) { try { g.kill(); } catch (x) {} proxy.close(); cleanup(); out.error = String(e && e.stack || e); return out; });
    });
  });
}

module.exports = { run: run, drainProof: drainProof };

if (require.main === module) {
  run().then(function (r) {
    return drainProof().then(function (d) {
      r.drainProof = d;
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.error ? 1 : 0);
    });
  });
}
