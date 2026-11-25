'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { read, root, guardSource } = require('./helpers/write-command-flight-world.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const output = path.join(root, 'output/manual-gap-status-20261124');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }

async function mount(page, mode) {
  await page.goto('http://fixture.test/');
  for (const css of ['base.css', 'components.css', 'layout.css', 'responsive-foundation.css', 'pages/inventory-replenishment.css']) await page.addStyleTag({ content: read('assets/css/' + css) });
  await page.addStyleTag({ content: '.module-section{display:block}#ops-section{padding:12px}body{margin:0}' });
  await page.evaluate(mode => {
    const nativeTimer = window.setTimeout;
    // Speed up observation timers only. Production defaults remain 30s for Inventory, 120s for Submit.
    // The acknowledged-progress screenshot must not race a synthetic 120ms observation deadline.
    window.setTimeout = (fn, ms, ...args) => nativeTimer(fn, mode === 'status-delayed' && ms === 30000 ? ms
      : [30000, 60000, 120000].includes(ms) ? 120 : ms === 3000 ? 5 : ms === 1500 ? 10 : ms, ...args);
    window.calls = { starts: 0, statuses: 0, refreshes: 0, submits: 0, plans: 0 };
    window.fixtureMode = mode;
    window.scope = { mode: 'CURRENT_SCOPE', company: 'KM', country: 'US', marketplace: 'Amazon' };
    window.job = (status, runId = 'RUN') => ({ success: true, data: { product: 'INVENTORY', status, runId, requestedScope: scope, scopesProcessed: 1, scopesTotal: 1 } });
    window.confirm = () => true; window.alert = () => {};
    window.KM = { lifecycle: { register() {} }, DB: { envId: () => 'FIXTURE',
      startInventoryReplenishmentGapJob: () => {
        calls.starts++;
        const statusReads = calls.statuses;
        for (let i = 0; i < 5; i++) handleRecalcAllInventoryGap(scope);
        window.doubleClickBeforeAck = calls.statuses === statusReads && !_irManualGap.unknown;
        if (fixtureMode === 'refused') return Promise.resolve({ success: false, error: { code: 'GAP_JOB_LOCK_UNAVAILABLE', message: 'Fixture refusal' } });
        if (['recovered', 'unknown', 'late'].includes(fixtureMode)) return new Promise(resolve => { window.resolveStart = resolve; });
        return Promise.resolve(job('PENDING'));
      },
      getGapJobStatus: (product, runId) => {
        calls.statuses++;
        if (fixtureMode === 'precheck-hung' || (fixtureMode === 'status-hung' && calls.statuses > 1)) return new Promise(() => {});
        if (fixtureMode === 'status-lost' && calls.statuses > 1) return Promise.resolve({ success: false, error: { code: 'TEMPORARY_UNAVAILABLE' } });
        if (fixtureMode === 'status-delayed' && calls.statuses > 1) return new Promise(resolve => { window.resolveStatus = resolve; });
        if (calls.statuses === 1 || ['unknown', 'late'].includes(fixtureMode) && !runId) return Promise.resolve(job('NONE', null));
        return Promise.resolve(job('DONE', runId || 'RUN'));
      },
      submitAllocationDraftsToShippingPlans: () => {
        calls.submits++;
        if (fixtureMode === 'submit-refused') return Promise.resolve({ success: false, code: 'SUBMIT_VALIDATION_FAILED', zero_write: true });
        return new Promise(resolve => { window.resolveSubmit = resolve; });
      }
    }, scopeModal: { open: options => { window.scopeOptions = options; } } };
  }, mode);
  await page.addScriptTag({ content: guardSource + '\n_kmInstallWriteCommandGuards_();' });
  await page.addScriptTag({ content: read('assets/js/utils/gap-recalc-transport.js') });
  await page.addScriptTag({ content: read('assets/js/pages/inventory-replenishment.js') });
  await page.evaluate(() => {
    _irRecoScopeRequest = () => fixtureMode === 'real-refresh-context' ? null : scope;
    _irAppliedScopeKey_ = () => 'FIXTURE-DISPLAYED-SCOPE';
    if (fixtureMode.startsWith('real-refresh-')) {
      _irUseMaterializedGapRead = () => true;
      _irRecoRerenderSummaries = () => {}; _irRecoUpdateSuggestedCells = () => {};
      KM.DB.getInventoryReplenishmentGap = () => { calls.refreshes++; return Promise.resolve({ success: false, error: { code: 'FIXTURE_READ_FAILED' } }); };
    } else {
      refreshInventoryGapAfterRecalc_ = () => {
        calls.refreshes++;
        if (fixtureMode === 'refresh-hung') return new Promise(() => {});
        _irMatState = { status: 'READY', loadedOk: true, error: null, scopeKey: JSON.stringify(scope), appliedScopeKey: 'FIXTURE-DISPLAYED-SCOPE' };
        return Promise.resolve();
      };
    }
    _irAppliedSubmitScope_ = () => scope;
    _irSubmitGateRefusal_ = () => null;
    _irKeepUnsubmittedRoutesDw2_ = () => {};
    _irOverseasPrecheckText_ = () => '';
    _irSaveBusySync_ = () => {}; _irRevealSyncActionAvailability_ = () => {};
    window.showSection = () => { calls.plans++; }; window.renderShippingPlan = () => {};
  });
}
async function clickScope(page) {
  await page.locator('#replenAiSupportTrigger').click();
  await page.getByRole('menuitem', { name: 'Recalculate Current Scope', exact: true }).click();
  await page.evaluate(() => { window.operation = scopeOptions.onConfirm(scope); for (let i = 0; i < 8; i++) handleRecalcAllInventoryGap(scope); });
}
module.exports = { mount, clickScope };
if (require.main === module) (async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      for (const mode of ['recovered', 'unknown', 'late', 'refused', 'status-hung', 'status-lost', 'status-delayed', 'refresh-hung', 'real-refresh-failed', 'real-refresh-context', 'precheck-hung', 'submit-late', 'submit-refused']) {
        const page = await browser.newPage({ viewport: { width, height: 950 } }), errors = [], outbound = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', r => {
          if (r.request().url() === 'http://fixture.test/') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body>' + read('assets/html/pages/inventory-replenishment.html') + '</body></html>' });
          outbound.push(r.request().url()); return r.abort();
        });
        await mount(page, mode);
        const trigger = page.locator('#replenAiSupportTrigger');
        const submit = page.locator('[onclick="submitReplenishmentPlans()"]');
        if (mode.startsWith('submit-')) {
          await page.evaluate(() => {
            submitReplenishmentPlans = () => _replenCanonicalSubmit(['D1'], 'EXECUTION-KEY', 1, { lineIds: ['L1'], expectedVersions: { D1: 1 } });
            document.querySelector('[onclick="submitReplenishmentPlans()"]').click();
            for (let i = 0; i < 10; i++) _replenCanonicalSubmit(['D1'], 'EXECUTION-KEY', 1, { lineIds: ['L1'] });
          });
          if (mode === 'submit-refused') {
            await page.waitForFunction(() => _irSubmitPhase_ === '');
            check(width + ' Submit business refusal clears loading with no duplicate write', await page.evaluate(() => calls.submits === 1) && await submit.isEnabled());
          } else {
            await page.waitForFunction(() => _irSubmitPhase_ === 'UNKNOWN');
            check(width + ' hung Submit becomes UNKNOWN, held without busy spinner', await submit.isDisabled() && await submit.getAttribute('aria-busy') === null);
            await page.evaluate(() => { for (let i = 0; i < 5; i++) _replenCanonicalSubmit(['D1'], 'EXECUTION-KEY', 1); });
            check(width + ' UNKNOWN Submit cannot issue another POST', await page.evaluate(() => calls.submits === 1));
            await page.screenshot({ path: path.join(output, 'submit-unknown-' + width + '.png'), fullPage: true });
            await page.evaluate(() => resolveSubmit({ success: true, data: { plans: ['PLAN'], plan_count: 1, line_count: 1, execution_key: 'EXECUTION-KEY' } }));
            await page.waitForFunction(() => _irSubmitPhase_ === '');
            check(width + ' late Submit success completes original operation exactly once', await page.evaluate(() => calls.submits === 1 && calls.plans === 1) && await submit.isEnabled());
          }
        } else {
          await clickScope(page);
          if (mode === 'precheck-hung') {
            check(width + ' pre-START hung status read creates no persistent write hold', await page.evaluate(() => calls.starts === 0 && sessionStorage.getItem(_irManualGapKey_()) === null));
            await page.reload();
            check(width + ' reload before dispatch retains no false unknown lock', await page.evaluate(() => sessionStorage.length === 0));
          } else {
            await page.waitForFunction(() => calls.starts === 1);
            if (mode === 'status-delayed') {
              await page.waitForFunction(() => typeof resolveStatus === 'function');
              check(width + ' acknowledged run leaves Starting while first status read is pending', (await trigger.innerText()).includes('Calculating') && await trigger.getAttribute('aria-busy') === 'true');
              await page.screenshot({ path: path.join(output, 'acknowledged-calculating-' + width + '.png'), fullPage: true });
              await page.evaluate(() => resolveStatus(job('DONE')));
              await page.waitForFunction(() => !_irRecalcAllBusy && !_irAiSupportTriggerOwner);
              check(width + ' terminal run restores the literal AI Support label', await trigger.innerText() === '\u2726 AI Support' && await trigger.getAttribute('aria-busy') === null && await page.evaluate(() => calls.starts === 1 && calls.refreshes === 1));
            } else if (mode === 'refused' || mode === 'refresh-hung' || mode === 'recovered' || mode.startsWith('real-refresh-')) {
              await page.waitForFunction(() => !_irRecalcAllBusy);
              const notice = await page.locator('#replen-ai-support-notice').innerText();
              check(width + ' ' + mode + ' leaves Starting with truthful terminal notice', !/Starting/.test(await trigger.innerText()) &&
                (mode === 'refused' ? notice.includes('GAP_JOB_LOCK_UNAVAILABLE') : mode === 'refresh-hung' || mode.startsWith('real-refresh-') ? notice.includes('could not be read') : notice.includes('completed')));
              if (mode.startsWith('real-refresh-')) check(width + ' ' + mode + ' actual refresh returning undefined/null cannot claim refreshed', await page.evaluate(() => !_irMatState.loadedOk && /^(READ_ERROR|CONTEXT_NOT_READY)$/.test(_irMatState.status)) && !notice.includes('was refreshed'));
              check(width + ' ' + mode + ' dispatched only one job', await page.evaluate(() => calls.starts === 1 && !_irManualGapHeld_()));
              if (mode === 'recovered') await page.screenshot({ path: path.join(output, 'recalculated-' + width + '.png'), fullPage: true });
            } else {
              await page.waitForFunction(() => _irManualGap && _irManualGap.unknown);
              check(width + ' ' + mode + ' unknown outcome has a visible read-only status action', (await trigger.innerText()).includes('Status unconfirmed') && await page.getByRole('button', { name: 'Check status', exact: true }).isVisible());
              if (mode === 'status-lost') check(width + ' three unusable polls stop spinning without marking backend failed', await page.evaluate(() => calls.statuses === 4) && await trigger.getAttribute('aria-busy') === null);
              await page.evaluate(() => { for (let i = 0; i < 8; i++) handleRecalcAllInventoryGap(scope); });
              check(width + ' ' + mode + ' unknown holds prevent duplicate job starts', await page.evaluate(() => calls.starts === 1 && !!sessionStorage.getItem(_irManualGapKey_())));
              await page.screenshot({ path: path.join(output, mode + '-' + width + '.png'), fullPage: true });
              if (mode === 'late') {
                check(width + ' double-click before START acknowledgment retains normal progress with no extra observer', await page.evaluate(() => doubleClickBeforeAck));
                await page.evaluate(() => resolveStart(job('PENDING')));
                await page.waitForFunction(() => !_irRecalcAllBusy);
                check(width + ' late START acknowledgment reconciles targeted DONE without another write', await page.evaluate(() => calls.starts === 1 && calls.refreshes === 1 && !sessionStorage.getItem(_irManualGapKey_())));
              }
              if (mode === 'unknown') {
                await page.reload();
                check(width + ' dispatched unknown hold survives reload', await page.evaluate(() => !!sessionStorage.getItem('km.ir.manualGap.FIXTURE')));
              }
            }
          }
        }
        check(width + ' ' + mode + ' no browser errors or outbound requests', errors.length === 0 && outbound.length === 0);
        await page.close();
      }
    }
    console.log('MANUAL_GAP_STATUS_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
