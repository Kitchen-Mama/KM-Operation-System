'use strict';
const assert = require('node:assert/strict');
const { fixture, endpoint } = require('./password-access-busy-browser.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
let checks = 0;
function check(label, ok) { assert(ok, label); checks++; console.log('PASS ' + label); }
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440,390]) for (const expiryType of ['number','string']) {
      const h = await fixture(browser, width, { expiryType, expiryOffsetMs: 4 * 3600000 + 30000 }), { page } = h;
      try {
        await h.submit(); await page.locator('#km-password-access').waitFor({ state: 'hidden' });
        const before = await page.evaluate(() => KM.passwordAccess.diagnostics());
        check(width + ' ' + expiryType + ' expiry is normalized and conservatively capped at four hours', Date.parse(before.expiresAt) - Date.now() <= 4 * 3600000);
        if (expiryType === 'string') await page.evaluate(ep => {
          const key = 'km-password-access-v1:' + ep, saved = JSON.parse(sessionStorage.getItem(key));
          saved.expires_at = String(saved.expires_at); sessionStorage.setItem(key, JSON.stringify(saved));
        }, endpoint);
        const cdp = await h.context.newCDPSession(page);
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
        await Promise.all([page.waitForEvent('domcontentloaded'), cdp.send('Page.reload', { ignoreCache: true })]);
        await h.mount();
        const restored = await page.evaluate(() => KM.passwordAccess.diagnostics());
        check(width + ' ' + expiryType + ' hard reload restores login without another auth request', restored.signedIn && restored.restoreState === 'RESTORED' && h.logins() === 1);
        check(width + ' ' + expiryType + ' reload does not extend session or expose credentials', restored.expiresAt === before.expiresAt && !JSON.stringify(restored).includes('access_session'));
        for (const code of ['AUTH_BUSY','AUTH_CONFIG_UNAVAILABLE','AUTH_NOT_CONFIGURED','AUTH_SESSION_STORE_UNAVAILABLE','AUTH_UNKNOWN_SERVICE_ERROR']) {
          h.setBusinessReply({ success: false, code }); const count = h.business();
          await page.evaluate(ep => fetch(ep + '?action=getTable&table=fixture').then(r => r.json()), endpoint);
          check(width + ' ' + expiryType + ' ' + code + ' preserves session with no replay', h.business() === count + 1 && await page.evaluate(() => KM.passwordAccess.isSignedIn()));
        }
        h.setBusinessReply({ success: false, code: 'AUTH_SESSION_EXPIRED' });
        const count = h.business(); await page.evaluate(ep => fetch(ep + '?action=getTable&table=fixture').then(r => r.json()), endpoint);
        check(width + ' ' + expiryType + ' real server expiry logs out exactly once without replay', !await page.evaluate(() => KM.passwordAccess.isSignedIn()) && h.business() === count + 1 && await page.locator('#km-password-access').isVisible());
        check(width + ' ' + expiryType + ' no runtime errors or credential-bearing URLs', h.errors.length === 0 && h.outbound.length === 0 && h.requests.every(r => !/access_session|password_key|password=/.test(r.url)));
      } finally { await h.context.close(); }
    }
    console.log('PASSWORD_ACCESS_RELOAD_BROWSER_PASS ' + checks + ' no real credential or live business writes');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
