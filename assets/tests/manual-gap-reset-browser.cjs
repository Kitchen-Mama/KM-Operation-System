'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { root, read } = require('./helpers/write-command-flight-world.cjs');
const { mount } = require('./manual-gap-status-browser.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
let checks = 0;
const check = (label, value) => { assert(value, label); checks++; console.log('PASS ' + label); };
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), out = path.join(root, 'output/manual-gap-reset-20261125');
  fs.mkdirSync(out, { recursive: true });
  try {
    for (const width of [1440,390]) for (const mode of ['idle','active','decline','other-run','read-failed','cancel-hung','cancel-mismatch']) {
      const page = await browser.newPage({ viewport: { width, height: 950 } }), errors = [], outbound = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => r.request().url() === 'http://fixture.test/'
        ? r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><body>' + read('assets/html/pages/inventory-replenishment.html') + '</body>' })
        : (outbound.push(r.request().url()), r.abort()));
      await mount(page, 'reset');
      await page.evaluate(mode => {
        window.resetMode = mode; calls.cancels = [];
        _irManualGap = { runId: 'RUN', scope, dispatched: true, unknown: true }; _irManualGapStore_(_irManualGap);
        KM.DB.getGapJobStatus = () => { calls.statuses++;
          if (resetMode === 'read-failed') return Promise.reject(new Error('PRODUCTION_MODULE_MISMATCH'));
          return Promise.resolve(resetMode === 'idle' ? job('NONE', null) : job('RUNNING', resetMode === 'other-run' ? 'OTHER' : 'RUN'));
        };
        KM.DB.cancelInventoryReplenishmentGapJob = id => { calls.cancels.push(id);
          return new Promise(resolve => { window.resolveResetCancel = () => resolve(job('CANCELLED', resetMode === 'cancel-mismatch' ? 'OTHER' : id)); });
        };
        window.confirm = () => resetMode !== 'decline'; _irManualGapUnknown_();
      }, mode);
      await page.getByRole('button', { name: 'Reset calculation', exact: true }).click();
      await page.evaluate(() => { for (let i = 0; i < 8; i++) _irManualGapReset_(); });
      if (mode === 'active' || mode === 'cancel-mismatch') await page.evaluate(() => resolveResetCancel());
      if (['active','idle'].includes(mode)) {
        await page.waitForFunction(() => !_irManualGapHeld_());
        check(width + ' ' + mode + ' clears only after confirmed idle/cancel', await page.evaluate(() => !_irRecalcAllBusy && !sessionStorage.getItem(_irManualGapKey_())));
        check(width + ' ' + mode + ' issues exactly the required cancel', await page.evaluate(mode => calls.cancels.length === (mode === 'active' ? 1 : 0), mode));
      } else {
        await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' ' + mode + ' retains wait on refusal, different run or unconfirmed outcome', await page.evaluate(() => !!_irManualGapHeld_()));
        check(width + ' ' + mode + ' does not duplicate cancel', await page.evaluate(mode => calls.cancels.length === (mode.startsWith('cancel-') ? 1 : 0), mode));
      }
      check(width + ' ' + mode + ' never STARTs a replacement calculation', await page.evaluate(() => calls.starts === 0));
      check(width + ' ' + mode + ' no browser errors or live network', errors.length === 0 && outbound.length === 0);
      if (mode === 'active' || mode === 'read-failed') await page.screenshot({ path: path.join(out, mode + '-' + width + '.png'), fullPage: true });
      await page.close();
    }
    console.log('MANUAL_GAP_RESET_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
