/**
 * ==================================================================================================
 * CORS · LOGGING · CORRELATION · UPSTREAM                                    SEC-A2 §4 §6 §10 §11
 * ==================================================================================================
 *
 * CORS IS AN EXACT-STRING ALLOWLIST AND NOTHING ELSE. Every CORS bypass in the wild is a comparison
 * that was almost right: `startsWith` admits `https://example.com.attacker.test`, `endsWith` admits
 * `https://notexample.com`, a regular expression admits whatever an unescaped dot admits, and `null`
 * is an origin a sandboxed iframe can send at will. So: `indexOf(origin) >= 0`, and a request whose
 * Origin is absent or unknown gets NO CORS headers at all — the browser then refuses to hand the
 * response to the page, which is the correct outcome and needs no cooperation from us.
 *
 * THE LOGGER'S JOB IS TO REFUSE TO PRINT THINGS. A gateway handles exactly one class of value that
 * must never be written down, and it handles it on every request. Redaction by shape (anything
 * JWT-looking, anything long and base64url) is applied to every field of every log line, because the
 * one log call that forgot would be the one nobody reviewed.
 * ==================================================================================================
 */
'use strict';

var crypto = require('crypto');
var https = require('https');
var http = require('http');
var urlmod = require('url');

// --- CORS -----------------------------------------------------------------------------------------
function originAllowed(allowed, origin) {
  if (!origin) return false;
  if (origin === 'null') return false;          // sandboxed iframes, data: documents, file://
  return (allowed || []).indexOf(origin) >= 0;  // exact, always
}

function corsHeaders(allowed, origin) {
  if (!originAllowed(allowed, origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,      // the exact origin, never '*'
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-km-correlation-id',
    'Access-Control-Max-Age': '600'
    /* NO Access-Control-Allow-Credentials. The credential is a token in the body, so cookies are not
       wanted — and not asking for them removes a whole class of cross-site request forgery. */
  };
}

// --- correlation ----------------------------------------------------------------------------------
function newCorrelationId() { return 'kmg_' + crypto.randomBytes(9).toString('hex'); }

/** A client-supplied id is accepted for tracing but sanitised — it ends up in logs. */
function correlationFrom(headerValue) {
  var v = String(headerValue == null ? '' : headerValue);
  if (!/^[A-Za-z0-9_.-]{8,64}$/.test(v)) return newCorrelationId();
  return v;
}

// --- redaction ------------------------------------------------------------------------------------
var JWT_SHAPE = /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
var LONG_B64 = /\b[A-Za-z0-9_-]{40,}\b/g;

function redactValue(v) {
  if (typeof v === 'string') {
    return v.replace(JWT_SHAPE, '<redacted-token>').replace(LONG_B64, '<redacted>');
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === 'object') {
    var out = {};
    for (var k in v) {
      /* Named fields are dropped outright rather than pattern-matched: a short secret would survive
         a shape check, and `credential` has no business in a log under any circumstances. */
      if (/^(credential|id_token|token|secret|signature|authorization)$/i.test(k)) { out[k] = '<omitted>'; continue; }
      out[k] = redactValue(v[k]);
    }
    return out;
  }
  return v;
}

function makeLogger(sink) {
  var out = sink || function (line) { process.stdout.write(line + '\n'); };
  function emit(severity, correlationId, message, fields) {
    /* Cloud Logging picks up `severity` and the JSON body from stdout without any agent. */
    out(JSON.stringify(redactValue({
      severity: severity,
      correlation_id: correlationId,
      message: String(message),
      service: 'km-auth-gateway',
      fields: fields || {}
    })));
  }
  return {
    info: function (c, m, f) { emit('INFO', c, m, f); },
    warn: function (c, m, f) { emit('WARNING', c, m, f); },
    error: function (c, m, f) { emit('ERROR', c, m, f); },
    redact: redactValue
  };
}

// --- upstream -------------------------------------------------------------------------------------
/**
 * WHERE A REDIRECT MAY LEAD.
 *
 * Apps Script answers a POST to `script.google.com/macros/s/<id>/exec` with a 302 to
 * `*.googleusercontent.com` — the echo hop the browser transport already lives with. Following it is
 * required. Following it ANYWHERE is not: `location` is chosen by whatever answered, so an upstream
 * that was wrong, compromised, or simply misconfigured could point the next hop at a host of its
 * choosing, and the gateway would dutifully re-issue the request there. Nothing secret rides that hop
 * — the assertion is in the POST body that a redirect drops — but the REPLY would come from a
 * stranger, and the gateway hands replies to the browser as its own. So the destination is an
 * allowlist, not an instruction.
 *
 * The loopback entry is what lets the local end-to-end run at all, and it is why this list is a
 * PARAMETER rather than a constant: production passes the two Google hosts and nothing else.
 */
var DEFAULT_REDIRECT_HOSTS = ['script.google.com', 'script.googleusercontent.com'];

function redirectHostAllowed(host, allowed) {
  var h = String(host || '').toLowerCase();
  var list = allowed || DEFAULT_REDIRECT_HOSTS;
  for (var i = 0; i < list.length; i++) {
    var a = String(list[i]).toLowerCase();
    if (a.charAt(0) === '.') {
      /* A leading dot means "a subdomain of", and it must still be a LABEL boundary: `.example.com`
         admits `a.example.com` and refuses `notexample.com`. */
      if (h.length > a.length && h.slice(-a.length) === a) return true;
      continue;
    }
    if (h === a) return true;
  }
  return false;
}

/**
 * POST to the Apps Script /exec. Follows the 302 to the googleusercontent echo target, because that
 * is what every Apps Script answer does — the same hop the browser transport already handles.
 *
 * THE GOOGLE ID TOKEN IS NOT FORWARDED. What crosses this boundary is the assertion the gateway
 * signed, and nothing else: the upstream has no use for the token and every copy of a credential is a
 * place it can leak from.
 */
function postUpstream(urlStr, payload, timeoutMs, agentFactory, opts) {
  opts = opts || {};
  /* THE CONFIGURED DESTINATION IS ALWAYS ALLOWED; ONLY WHERE A REDIRECT LEADS IS IN QUESTION.
     `APPS_SCRIPT_EXEC_URL` has already been validated at startup - in production it must be exactly
     script.google.com on an /exec path - so re-checking it here against a fixed list adds nothing and
     breaks every deployment that legitimately points somewhere else, including the local end-to-end
     against a mock on 127.0.0.1. That is not hypothetical: it is what this function did when the list
     was first added, and the browser end-to-end went from a 200 to UPSTREAM_UNAVAILABLE. The risk was
     never the address we were told to call. It is the address the ANSWER tells us to call next. */
  var allowedHosts = [String((urlmod.parse(urlStr).hostname || '')).toLowerCase()]
    .concat(opts.redirectHosts || DEFAULT_REDIRECT_HOSTS);
  /* A BOUNDED REPLY. Apps Script can return up to Cloud Run's 32 MiB, and buffering whatever arrives
     is how one upstream answer becomes this instance's memory. The cap is applied while reading, not
     after — the point is to stop allocating, and a check on the finished string has already lost. */
  var maxBytes = opts.maxBytes || 4194304;
  return new Promise(function (resolve) {
    var body = JSON.stringify(payload);
    var u = urlmod.parse(urlStr);
    var lib = (u.protocol === 'http:') ? http : https;
    var done = false;
    function finish(r) { if (!done) { done = true; resolve(r); } }

    function collect(res, finishOk) {
      var buf = '', n = 0, over = false;
      res.setEncoding('utf8');
      res.on('data', function (d) {
        if (over) return;
        n += Buffer.byteLength(d, 'utf8');
        if (n > maxBytes) {
          over = true;
          res.destroy();
          return finish({ ok: false, reason: 'upstream response exceeded ' + maxBytes + ' bytes' });
        }
        buf += d;
      });
      res.on('end', function () { if (!over) finishOk(buf); });
    }

    function go(target, hops) {
      if (hops > 5) return finish({ ok: false, reason: 'too many redirects' });
      var t = urlmod.parse(target);
      var libT = (t.protocol === 'http:') ? http : https;
      var req = (agentFactory || libT).request({
        protocol: t.protocol, hostname: t.hostname, port: t.port,
        path: t.path, method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Content-Length': Buffer.byteLength(body) }
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          /* A redirect after a POST is re-issued as a GET with the body dropped, per the Fetch
             specification — the same hazard the browser transport documents. Apps Script's own echo
             hop is the only redirect we follow, and we follow it as a GET deliberately. */
          return getFollow(res.headers.location, hops + 1);
        }
        collect(res, function (buf) { finish({ ok: true, status: res.statusCode, body: buf }); });
      });
      req.on('error', function (e) { finish({ ok: false, reason: String(e && e.message) }); });
      req.setTimeout(timeoutMs, function () { req.destroy(); finish({ ok: false, reason: 'timeout' }); });
      req.write(body);
      req.end();
    }
    function getFollow(target, hops) {
      if (hops > 5) return finish({ ok: false, reason: 'too many redirects' });
      var t = urlmod.parse(target);
      if (!redirectHostAllowed(t.hostname, allowedHosts)) {
        /* The refusal names no host. This string reaches a log, and the log is read by people who
           would otherwise learn where a compromised upstream wanted to send them from our diagnostics
           rather than from the incident. It is in the structured field, under the correlation id. */
        return finish({ ok: false, reason: 'redirect destination is not allowed' });
      }
      var libT = (t.protocol === 'http:') ? http : https;
      var req = (agentFactory || libT).request({
        protocol: t.protocol, hostname: t.hostname, port: t.port, path: t.path, method: 'GET'
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); return getFollow(res.headers.location, hops + 1);
        }
        collect(res, function (buf) { finish({ ok: true, status: res.statusCode, body: buf }); });
      });
      req.on('error', function (e) { finish({ ok: false, reason: String(e && e.message) }); });
      req.setTimeout(timeoutMs, function () { req.destroy(); finish({ ok: false, reason: 'timeout' }); });
      req.end();
    }
    go(urlStr, 0);
    void u; void lib;
  });
}

/**
 * Headers on EVERY response, including refusals and 404s.
 *
 * `no-store` is the one that matters: a refusal naming a correlation id, or a successful answer
 * carrying somebody's data, must not sit in a shared cache or a browser's back-forward store. The
 * rest cost nothing and close doors this API has no use for — it returns JSON to a script, so it is
 * never a document, never framed, and never sniffed.
 */
var SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
};

module.exports = {
  originAllowed: originAllowed,
  SECURITY_HEADERS: SECURITY_HEADERS,
  DEFAULT_REDIRECT_HOSTS: DEFAULT_REDIRECT_HOSTS,
  redirectHostAllowed: redirectHostAllowed,
  corsHeaders: corsHeaders,
  newCorrelationId: newCorrelationId,
  correlationFrom: correlationFrom,
  redactValue: redactValue,
  makeLogger: makeLogger,
  postUpstream: postUpstream
};
