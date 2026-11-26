'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { root, read } = require('./helpers/write-command-flight-world.cjs');
const { mount } = require('./manual-gap-status-browser.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const out = path.join(root, 'output/manual-gap-unlinked-20261125');
let checks = 0;
function check(label, ok) { assert(ok, label); checks++; console.log('PASS ' + label); }
async function scenario(browser, width, name, run) {
  const page = await browser.newPage({ viewport: { width, height: 950 } }), errors = [], outbound = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => r.request().url() === 'http://fixture.test/'
    ? r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body>' + read('assets/html/pages/inventory-replenishment.html') + '</body></html>' })
    : (outbound.push(r.request().url()), r.abort()));
  try {
    await mount(page, 'legacy-check');
    await page.evaluate(() => {
      sessionStorage.setItem(_irManualGapKey_(), JSON.stringify({ scope, runId: null, dispatched: true }));
      _irManualGap = null; _irManualGapHeld_(); _irManualGapUnknown_();
    });
    await run(page, width);
    check(width + ' ' + name + ' has no errors, live requests, or START writes',
      errors.length === 0 && outbound.length === 0 && await page.evaluate(() => calls.starts === 0));
  } finally { await page.close(); }
}
const notice = page => page.locator('#replen-ai-support-notice').innerText();
const action = (page, label) => page.getByRole('button', { name: label, exact: true }).click();
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      await scenario(browser, width, 'legacy DONE', async page => {
        await page.evaluate(() => {
          KM.DB.getGapJobStatus = () => { calls.statuses++; return new Promise(resolve => { window.resolveStatusCheck = resolve; }); };
        });
        await action(page, 'Check status');
        check(width + ' missing run ID still issues a real status read with visible loading',
          await page.evaluate(() => calls.statuses === 1) && await page.getByRole('button', { name: 'Checking...', exact: true }).isDisabled());
        await page.evaluate(() => { for (let i = 0; i < 8; i++) _irManualGapCheck_(); resolveStatusCheck(job('DONE', 'OLD')); });
        await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' completed check has visible time/result and a credential-free Console diagnostic',
          (await notice(page)).includes('Last check:') && await page.evaluate(() => {
            const d = _irJobStatusDiagnostic_(); return d.requestCount >= 1 && d.serverStatus === 'DONE' &&
              d.build === 'gap-investigation-20261126-v1' && !JSON.stringify(d).includes('access_session');
          }));
        check(width + ' unrelated DONE is displayed but never confirms the original request',
          (await notice(page)).includes('Latest server job: DONE') && (await notice(page)).includes('cannot prove') &&
          await page.evaluate(() => calls.statuses === 1 && !_irManualGap.runId && calls.refreshes === 0));
        await page.screenshot({ path: path.join(out, 'legacy-done-' + width + '.png'), fullPage: true });
        await page.evaluate(() => { window.confirm = () => false; });
        await action(page, 'Clear local wait');
        check(width + ' declining local-clear confirmation preserves the wait without any request', await page.evaluate(() => !!_irManualGap && calls.statuses === 1));
        await page.evaluate(() => { window.confirm = () => true; KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve(job('DONE', 'OLD')); }; });
        await action(page, 'Clear local wait');
        await page.waitForFunction(() => !_irManualGap);
        check(width + ' explicit local clear rechecks idle and never claims original completion',
          (await notice(page)).includes('original request outcome is still unknown') &&
          await page.evaluate(() => calls.statuses === 2 && calls.refreshes === 0 && !sessionStorage.getItem(_irManualGapKey_())));
        await page.evaluate(()=>_irManualGapUnknown_('Late observation failure after clear'));
        check(width+' a late status callback cannot resurrect a cleared wait or its button label',await page.evaluate(()=>!_irManualGap&&!_irRecalcAllBusy&&!document.getElementById('replenAiSupportTrigger').textContent.includes('unconfirmed')));
      });
      await scenario(browser, width, 'active server job', async page => {
        await page.evaluate(() => { KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve({ ...job('RUNNING', 'ACTIVE'), data: { ...job('RUNNING', 'ACTIVE').data, scopesProcessed: 3, scopesTotal: 10 } }); }; });
        await action(page, 'Check status');
        await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' unlinked active job displays progress, does not unlock or assign its identity',
          (await notice(page)).includes('RUNNING') && (await notice(page)).includes('3 / 10') &&
          await page.getByRole('button', { name: 'Clear local wait', exact: true }).count() === 0 &&
          await page.evaluate(() => !_irManualGap.runId));
        await page.evaluate(() => { KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve(job('DONE', 'ACTIVE')); }; });
        await action(page, 'Check status'); await page.waitForFunction(() => !_irManualGap.checking);
        await page.evaluate(() => { KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve(job('RUNNING', 'NEW')); }; });
        await action(page, 'Clear local wait'); await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' a newly active job during clear blocks local release', (await notice(page)).includes('NEW') &&
          await page.evaluate(() => !!sessionStorage.getItem(_irManualGapKey_())) &&
          await page.getByRole('button', { name: 'Clear local wait', exact: true }).count() === 0);
      });
      await scenario(browser, width, 'unusable status', async page => {
        await page.evaluate(() => { KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve({ success: false, error: { code: 'FIXTURE_STATUS_UNAVAILABLE' } }); }; });
        await action(page, 'Check status'); await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' failed status read names the error and retains the hold', (await notice(page)).includes('FIXTURE_STATUS_UNAVAILABLE') &&
          await page.evaluate(() => calls.statuses === 1 && !!_irManualGap) &&
          await page.getByRole('button', { name: 'Clear local wait', exact: true }).count() === 0);
      });
      await scenario(browser, width, 'known baseline recovery', async page => {
        await page.evaluate(() => {
          _irManualGap.baselineKnown = true; _irManualGap.baselineRunId = 'BASE';
          _irRecoScopeRequest = () => null; _irAppliedScopeKey_ = () => null;
          KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve(job('DONE', 'NEW')); };
        });
        await action(page, 'Check status'); await page.waitForFunction(() => !_irManualGap);
        check(width + ' new exact-scope run can recover from persisted baseline without Search',
          (await notice(page)).includes('DONE confirmed') && (await notice(page)).includes('press Search') &&
          await page.evaluate(() => calls.statuses === 1 && calls.refreshes === 0));
      });
      await scenario(browser, width, 'old baseline cannot recover', async page => {
        await page.evaluate(() => {
          _irManualGap.baselineKnown = true; _irManualGap.baselineRunId = 'OLD';
          KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve(job('DONE', 'OLD')); };
        });
        await action(page, 'Check status'); await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' same old DONE cannot satisfy a newer unknown start', (await notice(page)).includes('cannot prove') &&
          await page.evaluate(() => !_irManualGap.runId && calls.refreshes === 0));
      });
      await scenario(browser, width, 'readback after confirmed DONE', async page => {
        await page.evaluate(() => {
          _irManualGap.runId = 'ACK';
          KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve(job('DONE', 'ACK')); };
          refreshInventoryGapAfterRecalc_ = () => { calls.refreshes++; return Promise.reject(Error('fixture readback failure')); };
        });
        await action(page, 'Check status'); await page.waitForFunction(() => !_irManualGap);
        check(width + ' confirmed DONE with failed readback does not re-lock the finished job',
          (await notice(page)).includes('DONE confirmed, but results could not be refreshed') &&
          await page.evaluate(() => calls.statuses === 1 && calls.refreshes === 1));
      });
      await scenario(browser, width, 'wrong scope cannot recover', async page => {
        await page.evaluate(() => {
          _irManualGap.baselineKnown = true; _irManualGap.baselineRunId = 'BASE';
          KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve({ success: true,
            data: { ...job('DONE', 'OTHER-SCOPE').data, requestedScope: { ...scope, marketplace: 'Shopify' } } }); };
        });
        await action(page, 'Check status'); await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' a new run for another scope cannot confirm the held request',
          (await notice(page)).includes('cannot prove') && await page.evaluate(() => !_irManualGap.runId && calls.refreshes === 0));
      });
      await scenario(browser, width, 'server STALLED', async page => {
        await page.evaluate(() => {
          _irManualGap.runId = 'ACK';
          KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve(job('STALLED', 'ACK')); };
        });
        await action(page, 'Check status'); await page.waitForFunction(() => !_irManualGap);
        check(width + ' authoritative STALLED with the same run ID releases a terminal wait', await page.evaluate(() => calls.statuses === 1 && calls.refreshes === 0));
      });
      await scenario(browser, width, 'known run still active', async page => {
        await page.evaluate(() => {
          _irManualGap.runId = 'ACK';
          KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve(job('RUNNING', 'ACK')); };
        });
        await action(page, 'Check status'); await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' a bounded check reports known RUNNING without mistaking client stall for server failure',
          (await notice(page)).includes('Run ACK: RUNNING') && await page.evaluate(() => _irManualGap.runId === 'ACK' && calls.refreshes === 0));
      });
      await scenario(browser, width, 'known ID no longer current', async page => {
        await page.evaluate(() => {
          _irManualGap.runId = 'SUPERSEDED';
          KM.DB.getGapJobStatus = (product, runId) => {
            calls.statuses++;
            return Promise.resolve(runId ? job('NONE', runId) : job('DONE', 'CURRENT'));
          };
        });
        await action(page, 'Check status'); await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' missing known ID falls back to latest server status without claiming completion',
          (await notice(page)).includes('Requested run SUPERSEDED was not confirmed') && (await notice(page)).includes('CURRENT') &&
          await page.evaluate(() => calls.statuses === 2 && _irManualGap.runId === 'SUPERSEDED'));
        await action(page, 'Clear local wait'); await page.waitForFunction(() => !_irManualGap);
        check(width + ' an explicitly cleared superseded ID remains an unknown original outcome',
          (await notice(page)).includes('original request outcome is still unknown') && await page.evaluate(() => calls.statuses === 3 && calls.refreshes === 0));
      });
      await scenario(browser, width, 'missing targeted identity then same run recovered', async page => {
        await page.evaluate(() => {
          _irManualGap.runId = 'ACK';
          KM.DB.getGapJobStatus = (product, runId) => {
            calls.statuses++;
            return Promise.resolve(runId ? { success: true, data: { status: 'DONE' } } : job('DONE', 'ACK'));
          };
        });
        await action(page, 'Check status'); await page.waitForFunction(() => !_irManualGap);
        check(width + ' latest endpoint may confirm the exact known ID after an unusable targeted reply',
          (await notice(page)).includes('Recalculation completed') && await page.evaluate(() => calls.statuses === 2 && calls.refreshes === 1));
      });
      await scenario(browser, width, 'hung unlinked read', async page => {
        await page.evaluate(() => { KM.DB.getGapJobStatus = () => { calls.statuses++; return new Promise(() => {}); }; });
        await action(page, 'Check status'); await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' hung unlinked read has a deadline and never exposes local clear',
          (await notice(page)).includes('status read did not complete') && await page.evaluate(() => calls.statuses === 1) &&
          await page.getByRole('button', { name: 'Clear local wait', exact: true }).count() === 0);
      });
      await scenario(browser, width, 'NONE and clear read failure', async page => {
        await page.evaluate(() => { KM.DB.getGapJobStatus = () => { calls.statuses++; return Promise.resolve(job('NONE', null)); }; });
        await action(page, 'Check status'); await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' NONE is shown as no current job, not proof of original completion', (await notice(page)).includes('Latest server job: NONE') && await page.evaluate(() => !_irManualGap.runId));
        await page.evaluate(() => { KM.DB.getGapJobStatus = () => { calls.statuses++; throw Error('FIXTURE_CLEAR_READ_FAILED'); }; });
        await action(page, 'Clear local wait'); await page.waitForFunction(() => _irManualGap && !_irManualGap.checking);
        check(width + ' failed clear recheck keeps the local wait', (await notice(page)).includes('not cleared') && await page.evaluate(() => !!sessionStorage.getItem(_irManualGapKey_())));
      });
    }
    console.log('MANUAL_GAP_UNLINKED_STATUS_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
