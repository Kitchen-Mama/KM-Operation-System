'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const read = f => fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8');
(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 try {
  const page = await browser.newPage(); await page.route('**/*', r => r.abort());
  await page.setContent('<div id="sp-card-SP-A3CB6C0B-8"><div id="sp-rc-SP-A3CB6C0B-8" data-sel-card="0"><select class="sp-rc-customs"><option value="tax_refund_customs">Tax refund</option></select><button class="sp-rc-save" onclick="spRcSave(\'SP-A3CB6C0B-8\')">Save</button></div></div>');
  await page.addScriptTag({ content: read('assets/js/pages/shipping-plan.js') });
  await page.evaluate(() => {
   window.alert = () => {}; window.writes = []; window.refuse = true;
   _spPlanTok_ = () => '2026-11-25T00:00:00Z'; _spReadbackAfterWrite_ = async () => ({ readbackFailed: false });
   SP_RC_['SP-A3CB6C0B-8'] = { current: { carrier_id: 'C' }, lane: { customs: [{ id: 'tax_refund_customs' }] }, options: [{ service_only: true, carrier_id: 'C', shipping_method: 'sea_express', last_mile_delivery: 'truck', quote: { priced: false } }] };
   window.KM = { DB: { selectShippingPlanRateCardWithCustoms: async (...args) => { writes.push(args); return refuse ? { success: false, code: 'LOCK_TIMEOUT', message: 'Busy, try again.' } : { success: true, ...args[1], customs_type: args[4], priced: false }; } } };
  });
  await page.evaluate(() => spRcSave('SP-A3CB6C0B-8'));
  assert.equal(await page.locator('.sp-rc-save').isEnabled(), true); assert.equal(await page.locator('.sp-rc-save').innerText(), 'Save');
  assert.match(await page.locator('.sp-command-notice').innerText(), /LOCK_TIMEOUT/);
  await page.evaluate(() => { refuse = false; }); await page.evaluate(() => spRcSave('SP-A3CB6C0B-8'));
  assert.equal(await page.evaluate(() => writes.length), 2); assert.equal(await page.evaluate(() => writes[1][4]), 'tax_refund_customs');
  assert.match(await page.locator('.sp-command-notice').innerText(), /Saved/); assert.equal(await page.locator('.sp-rc-save').isEnabled(), true);
  await page.evaluate(() => { _spHandleCommandResult_ = async () => { throw Error('render'); }; });
  await page.evaluate(() => _spRunCommand_('SP-A3CB6C0B-8:ratecard', async () => ({ success: true }), { planId: 'SP-A3CB6C0B-8' }));
  assert.equal(await page.evaluate(() => _spPlanBusy_('SP-A3CB6C0B-8')), false); assert.equal(await page.evaluate(() => _spReadbackBlocked_), true);
  console.log('REVIEW_SAVE_RECOVERY_PASS 9 real command runner; no production writes');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
