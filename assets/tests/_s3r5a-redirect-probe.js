// S3-R5A §1/§3/§7 — the expired-redirect reproduction, driven through the REAL transport.
//
// Nothing here is a model of the transport. km-transport.js is required and created with an injected
// fetch, clock and sleep, so every URL printed below is a URL the shipped code actually built.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');   // the repo root, not a machine-specific path
const TF = require(path.join(ROOT, 'assets/js/api/km-transport.js'));

const CANONICAL = 'https://script.google.com/macros/s/AKfycbzQSU0ZR4EW5F79EzpOoBvUDxjJNLZkLrPkFjuaCBwiWXZMBPR4jnxvIS0FZnjNnp9Q/exec';
const ECHO = 'https://script.googleusercontent.com/macros/echo?user_content_key=';

function expired(reqUrl, key) {
  return {
    status: 404, redirected: true, url: ECHO + key,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: () => Promise.resolve('<!doctype html><html><head><title>Error 404</title></head>'
      + '<body><h1>Sorry, unable to open the file at this time.</h1><p>Please check the address and try again.</p></body></html>')
  };
}
function okJson(reqUrl, body) {
  return {
    status: 200, redirected: true, url: ECHO + 'FRESH',
    headers: { get: () => 'application/json' },
    text: () => Promise.resolve(JSON.stringify(body))
  };
}

/** A virtual clock so "how long did the caller wait" is exact rather than wall-clock noise. */
function makeClock() {
  let t = 0;
  const queue = [];
  return {
    now: () => t,
    sleep: (ms) => new Promise((r) => queue.push({ at: t + ms, r })),
    advance() {          // run every pending sleep in time order
      queue.sort((a, b) => a.at - b.at);
      while (queue.length) { const j = queue.shift(); t = Math.max(t, j.at); j.r(); }
    },
    set: (v) => { t = v; },
    get t() { return t; }
  };
}

async function scenario(name, plan) {
  const clock = makeClock();
  const seen = [];
  let n = 0;
  const tp = TF.create({
    baseUrl: CANONICAL,
    frontendOrigin: 'https://example.github.io',
    now: clock.now,
    random: () => 0.5,
    sleep: (ms) => { clock.set(clock.t + ms); return Promise.resolve(); },   // deterministic, no real waiting
    retryBaseMs: 400, retryCapMs: 2000,
    readTimeoutMs: 60000,
    fetch: function (url, init) {
      n += 1;
      seen.push({ n, url: String(url), method: (init && init.method) || 'GET', at: clock.t });
      return plan(n, String(url), clock);
    }
  });

  const res = await tp.request({ action: 'getTable', kind: 'read', requestId: 'REQ-T000001', payload: { table: 'campaign_sku_lines' } });
  const m = tp.metrics();
  const host = (u) => { const x = /^https?:\/\/([^/]+)/.exec(u); return x ? x[1] : '(none)'; };

  console.log('\n=== ' + name + ' ===');
  seen.forEach((s) => console.log('   attempt ' + s.n + '  t=' + s.at + 'ms  ' + s.method + '  host=' + host(s.url)));
  console.log('   PHYSICAL_ATTEMPTS  = ' + seen.length);
  console.log('   ALL_TO_CANONICAL   = ' + seen.every((s) => s.url.indexOf(CANONICAL) === 0));
  console.log('   ANY_TO_ECHO_HOST   = ' + seen.some((s) => /googleusercontent/.test(s.url)));
  console.log('   FINAL_CODE         = ' + (res.success ? 'SUCCESS' : res.code));
  console.log('   HTML_SOURCE        = ' + ((res.details && res.details.html_source) || '-'));
  console.log('   RECOVERY_FROM      = ' + ((res.details && res.details.recovery_from) || '-'));
  console.log('   ELAPSED_TO_CALLER  = ' + clock.t + 'ms');
  console.log('   metrics: requests=' + m.requests + ' retries=' + m.retries
    + ' recoveries=' + m.recoveries + ' peak=' + tp.peakConcurrentRequests()
    + ' open=' + tp.openRequests() + ' byCode=' + JSON.stringify(m.byCode));
  return { seen, res, m };
}

async function main() {
  // 1. The production family: the redirect target has expired. One bounded recovery, which succeeds.
  await scenario('expired redirect, recovery succeeds',
    (n, url) => Promise.resolve(n === 1 ? expired(url, 'AAA') : okJson(url, { success: true, data: { rows: [] }, meta: {} })));

  // 2. The production family as actually observed: the recovery ALSO lands on an expired target.
  await scenario('expired redirect, recovery also expired',
    (n, url) => Promise.resolve(expired(url, n === 1 ? 'AAA' : 'BBB')));

  // 3. §7 — attempt 1 never answers. Does the retry get a FRESH 60 s budget on top of the first?
  await scenario('timeout then success — whose 60 seconds?',
    (n, url, clock) => n === 1
      ? new Promise(() => { clock.set(clock.t + 60000); })      // never settles; the transport's own timer must fire
      : Promise.resolve(okJson(url, { success: true, data: {}, meta: {} })));
}
module.exports = { main, scenario };
// Launched only when run directly: requiring this file must never start a scenario.
if (require.main === module) main().catch((e) => { console.log('HARNESS ERROR ' + ((e && e.stack) || e)); process.exit(1); });

module.exports = { run: (typeof run === 'function') ? run : null };
