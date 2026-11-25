'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const source = fs.readFileSync(path.join(root, 'assets/js/core/password-access.js'), 'utf8');
const style = fs.readFileSync(path.join(root, 'assets/css/core/password-access.css'), 'utf8');
const out = path.join(root, 'output/password-access-busy-20261124/browser');
const endpoint = 'https://script.google.com/macros/s/SYNTHETIC_AUTH_BUSY_20261124_123456/exec';
const password = 'Synthetic password used only by this isolated test';
const salt = 'b'.repeat(64), session = 'f'.repeat(64);
const expected = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 600000, 32, 'sha256').toString('hex');
const busyReply = { success: false, code: 'AUTH_BUSY', business_writes: 0, message: 'Please sign in again.' };
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }
async function fixture(browser, width, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 } }), page = await context.newPage();
  const requests = [], errors = [], outbound = [], replies = (options.replies || []).slice();
  let businessReply = { success: true, fixture: true };
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if (url === 'https://auth-fixture.test/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><header class="top-header"><div class="header-right"><span class="user-info"></span></div></header><main>Fixture</main>' });
    if (!url.startsWith(endpoint)) {
      if (url.includes('/assets/img/')) return route.fulfill({ contentType: 'image/png', body: fs.readFileSync(path.join(root, 'assets/img/logo_500_500-removebg.png')) });
      outbound.push(url); return route.abort();
    }
    const body = JSON.parse(req.postData() || '{}');
    requests.push({ action: body.action, method: req.method(), url, hasSession: !!body.access_session });
    let reply;
    if (body.action === 'auth.config') reply = options.configBad ? { success: false, code: 'AUTH_NOT_CONFIGURED' } : { success: true, version: 1, salt, iterations: 600000, hash: 'SHA-256' };
    else if (body.action === 'auth.login') {
      if (options.networkFailure) return route.abort('failed');
      const expiry = Date.now() + (options.expiryOffsetMs || 3600000);
      reply = body.password_key !== expected ? { success: false, code: 'AUTH_INVALID_PASSWORD' } : replies.length ? replies.shift() : { success: true, access_session: session, expires_at: options.expiryType === 'string' ? String(expiry) : expiry };
    } else reply = businessReply;
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply) });
  });
  async function mount() {
    await page.addScriptTag({ content: 'window.KM_PRODUCTION_CONFIG_=' + JSON.stringify({ endpoint }) });
    await page.addStyleTag({ content: style });
    await page.addScriptTag({ content: source });
  }
  await page.goto('https://auth-fixture.test/'); await mount();
  const logins = () => requests.filter(r => r.action === 'auth.login').length;
  const business = () => requests.filter(r => !/^auth\./.test(r.action)).length;
  const submit = async (value = password) => {
    await page.locator('#km-access-password').fill(value);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#km-password-access button').disabled);
  };
  return { page, context, requests, errors, outbound, logins, business, submit, mount, setBusinessReply: r => { businessReply = r; } };
}
module.exports = { fixture, endpoint, root };
if (require.main === module) (async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const h = await fixture(browser, width, { replies: [busyReply, busyReply] }), { page } = h;
      try {
        await page.evaluate(ep => { window.pendingRead = fetch(ep + '?action=getTable&table=fixture').then(r => r.json()); }, endpoint);
        const blocked = await page.evaluate(ep => fetch(ep, { method: 'POST', body: JSON.stringify({ action: 'updateShipment' }) }).then(() => '', e => e.apiCode), endpoint);
        check(width + ' locked business writes are refused before network', blocked === 'AUTH_REQUIRED' && h.business() === 0);
        await page.locator('#km-access-password').fill(password);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#km-password-access p').textContent.includes('Retrying'));
        await page.locator('#km-password-access form').dispatchEvent('submit');
        check(width + ' AUTH_BUSY keeps gate closed and disables double-submit', await page.locator('#km-password-access').isVisible() && await page.getByRole('button', { name: 'Sign in', exact: true }).isDisabled() && h.business() === 0);
        await page.screenshot({ path: path.join(out, 'busy-retry-' + width + '.png') });
        await page.locator('#km-password-access').waitFor({ state: 'hidden' });
        check(width + ' two explicit busy refusals recover with exactly three real KDF login attempts', h.logins() === 3 && (await page.evaluate(() => pendingRead)).success === true);
        check(width + ' recovery clears safe diagnostics and never puts credentials in URLs', await page.evaluate(() => KM.passwordAccess.lastFailure()) === null && h.requests.every(r => !/access_session|password_key|password=/.test(r.url)));
        h.setBusinessReply(busyReply);
        const before = h.business(); await page.evaluate(ep => fetch(ep, { method: 'POST', body: JSON.stringify({ action: 'updateShipment' }) }).then(r => r.json()), endpoint);
        await page.waitForTimeout(1200);
        check(width + ' business AUTH_BUSY is never replayed or converted to sign-out', h.business() === before + 1 && await page.evaluate(() => KM.passwordAccess.isSignedIn()));
        await page.reload(); await h.mount();
        check(width + ' same-tab session still restores without another login', await page.locator('#km-password-access').isHidden() && h.logins() === 3);
        check(width + ' responsive login fits with no runtime errors or real network', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && h.errors.length === 0 && h.outbound.length === 0);
      } finally { await h.context.close(); }
    }
    const cases = [
      ['persistent busy', { replies: [busyReply, busyReply, busyReply] }, 3, 'AUTH_BUSY'],
      ['rate limit', { replies: [{ success: false, code: 'AUTH_RATE_LIMIT' }] }, 1, 'AUTH_RATE_LIMIT'],
      ['wrong password', {}, 1, 'AUTH_INVALID_PASSWORD', 'Not the test password'],
      ['busy without zero-write proof', { replies: [{ success: false, code: 'AUTH_BUSY' }] }, 1, 'AUTH_BUSY'],
      ['busy with possible writes', { replies: [{ success: false, code: 'AUTH_BUSY', business_writes: 1 }] }, 1, 'AUTH_BUSY'],
      ['network ambiguity', { networkFailure: true }, 1, 'AUTH_NETWORK_ERROR'],
      ['invalid successful response', { replies: [{ success: true }] }, 1, 'AUTH_RESPONSE_INVALID'],
      ['config unavailable', { configBad: true }, 0, 'AUTH_CONFIG_UNAVAILABLE']
    ];
    for (const [label, opts, attempts, code, value] of cases) {
      const h = await fixture(browser, 390, opts);
      try {
        await h.submit(value || password);
        const text = await h.page.locator('#km-password-access p').innerText(), diagnostic = await h.page.evaluate(() => KM.passwordAccess.lastFailure());
        check(label + ' remains locked with a specific diagnostic and bounded attempts', h.logins() === attempts && await h.page.locator('#km-password-access').isVisible() && text.includes(code) && diagnostic?.code === code);
        check(label + ' exposes no credential and sends no business request', h.business() === 0 && Object.keys(diagnostic).sort().join(',') === 'at,code,phase' && await h.page.locator('#km-access-password').inputValue() === '' && !await h.page.evaluate(() => KM.passwordAccess.isSignedIn()));
        if (code !== 'AUTH_INVALID_PASSWORD') check(label + ' does not blame the password', !/Incorrect password|Check your password/i.test(text));
        if (label === 'persistent busy') await h.page.screenshot({ path: path.join(out, 'busy-exhausted-390.png') });
      } finally { await h.context.close(); }
    }
    console.log('PASSWORD_ACCESS_BUSY_BROWSER_PASS ' + checks + ' live_business_writes=0; no real credential used');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
