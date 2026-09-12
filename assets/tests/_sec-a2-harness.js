/**
 * SEC-A2 test harness — a local issuer, an Apps Script platform shim, and the fixtures.
 *
 * THE APPS SCRIPT SHIM IS THE INTERESTING PART. `SEC_A2_GATEWAY_ASSERTION_VERIFIER.gs` is written
 * against `Utilities`, `CacheService` and `PropertiesService`, and the suite has to run it in Node to
 * prove it agrees with the gateway byte for byte. So the shim implements those three APIs with node's
 * crypto — faithfully, including the things that are easy to get wrong:
 *
 *   · `Utilities.newBlob(s).getBytes()` returns UTF-8 BYTES, so `kmgaUtf8Length_` measures the same
 *     thing on both sides. A shim that returned `s.length` would make the suite pass and production
 *     fail on the first non-ASCII email.
 *   · `computeDigest` and `computeHmacSha256Signature` return SIGNED bytes in Apps Script (-128..127),
 *     not 0..255. The .gs code compensates with `(b + 256) % 256`; the shim must therefore hand it
 *     signed bytes, or that line would be dead and its absence would never be noticed.
 *   · `base64EncodeWebSafe` keeps padding, which the .gs strips. Reproduced, so the strip is real.
 *
 * Nothing here contacts Google. The keys are generated per run.
 */
'use strict';

var crypto = require('crypto');

// --- a local issuer, with real RSA --------------------------------------------------------------
var KEYS = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
var OTHER = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
var KID = 'test-kid-1';
var CLIENT_ID = 'sec-a2-test-client.apps.googleusercontent.com';   // placeholder, not anyone's
var DOMAIN = 'shopkitchenmama.com';
var NOW = 1800000000;

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function mintToken(claims, opts) {
  opts = opts || {};
  var header = { alg: opts.alg || 'RS256', kid: opts.kid || KID, typ: 'JWT' };
  var body = b64u(JSON.stringify(header)) + '.' + b64u(JSON.stringify(claims));
  if (opts.alg === 'none') return body + '.';
  if (opts.alg === 'HS256') {
    return body + '.' + b64u(crypto.createHmac('sha256', 'whatever').update(body).digest());
  }
  return body + '.' + b64u(crypto.sign('RSA-SHA256', Buffer.from(body), opts.key || KEYS.privateKey));
}
function claims(over) {
  var c = {
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '1122334455',
    email: 'operator.one@' + DOMAIN, email_verified: true, hd: DOMAIN,
    iat: NOW - 60, exp: NOW + 3540
  };
  for (var k in (over || {})) { if (over[k] === undefined) delete c[k]; else c[k] = over[k]; }
  return c;
}

// --- the Apps Script platform shim ---------------------------------------------------------------
function toSigned(buf) {
  var out = [];
  for (var i = 0; i < buf.length; i++) out.push(buf[i] > 127 ? buf[i] - 256 : buf[i]);
  return out;
}
function fromSigned(arr) {
  return Buffer.from(arr.map(function (b) { return (b + 256) % 256; }));
}

function installAppsScriptShim(global, opts) {
  opts = opts || {};
  var cacheStore = opts.cacheStore || {};
  var props = opts.properties || {};
  global.Utilities = {
    Charset: { UTF_8: 'UTF-8' },
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    newBlob: function (s) {
      var buf = Buffer.from(String(s), 'utf8');
      return { getBytes: function () { return toSigned(buf); } };
    },
    computeDigest: function (alg, value) {
      return toSigned(crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest());
    },
    computeHmacSha256Signature: function (value, key) {
      return toSigned(crypto.createHmac('sha256', Buffer.from(String(key), 'utf8'))
        .update(Buffer.from(String(value), 'utf8')).digest());
    },
    base64EncodeWebSafe: function (bytes) {
      var buf = Array.isArray(bytes) ? fromSigned(bytes) : Buffer.from(bytes);
      return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');   // padding KEPT
    }
  };
  global.CacheService = {
    getScriptCache: function () {
      if (opts.cacheUnavailable) throw new Error('cache unavailable');
      if (opts.cacheSilentlyDrops) {
        return { get: function () { return null; }, put: function () {} };
      }
      return {
        get: function (k) { return Object.prototype.hasOwnProperty.call(cacheStore, k) ? cacheStore[k] : null; },
        put: function (k, v) { cacheStore[k] = v; }
      };
    }
  };
  global.PropertiesService = {
    getScriptProperties: function () {
      return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; } };
    }
  };
  return { cacheStore: cacheStore, properties: props };
}

// --- fixtures -------------------------------------------------------------------------------------
var SECRET_A = 'k1-secret-for-tests-only-0123456789abcdef';   // 40 chars, never a real key
var SECRET_B = 'k2-secret-for-tests-only-fedcba9876543210';
var KEYRING = { active: { key_id: 'k1', secret: SECRET_A }, previous: null };
var ROTATED = { active: { key_id: 'k2', secret: SECRET_B }, previous: { key_id: 'k1', secret: SECRET_A } };

var REGISTRY = [{
  principal_id: 'google:1122334455',
  seed_email: 'operator.one@' + DOMAIN,
  display_label: 'Test operator - read only',
  status: 'active',
  allowed_actions: ['productPricing.siteUniverse.get'],
  allowed_sites: [{ company: 'KM', country: 'US', marketplace: 'Shopify' }],
  created_at: NOW, updated_at: NOW
}];

function baseConfig(over) {
  var c = {
    port: 0, nodeEnv: 'test', verifier: 'local',
    googleClientId: CLIENT_ID,
    allowedOrigins: ['http://127.0.0.1:8801'],
    requiredHostedDomain: null,
    upstreamUrl: 'http://127.0.0.1:8802/exec',
    upstreamTimeoutMs: 5000,
    maxBodyBytes: 65536,
    assertionTtlSeconds: 120,
    activeKeyId: 'k1', activeKeyPath: '/dev/null',
    previousKeyId: '', previousKeyPath: '',
    allowedActions: ['productPricing.workspace.get', 'productPricing.siteUniverse.get'],
    registryPath: ''
  };
  for (var k in (over || {})) c[k] = over[k];
  return c;
}

function silentLogger(lines) {
  function push(sev) {
    return function (c, m, f) { (lines || []).push(JSON.stringify({ sev: sev, c: c, m: m, f: f })); };
  }
  return { info: push('INFO'), warn: push('WARN'), error: push('ERROR'),
    redact: require('../../services/auth-gateway/src/http.js').redactValue };
}

module.exports = {
  KEYS: KEYS, OTHER: OTHER, KID: KID, CLIENT_ID: CLIENT_ID, DOMAIN: DOMAIN, NOW: NOW,
  b64u: b64u, mintToken: mintToken, claims: claims,
  jwks: function () { var m = {}; m[KID] = KEYS.publicKey; return m; },
  installAppsScriptShim: installAppsScriptShim,
  toSigned: toSigned, fromSigned: fromSigned,
  SECRET_A: SECRET_A, SECRET_B: SECRET_B, KEYRING: KEYRING, ROTATED: ROTATED,
  REGISTRY: REGISTRY, baseConfig: baseConfig, silentLogger: silentLogger
};
