'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const out = path.join(root, 'output/price-service-fixes-20261125');
const fixture = read('assets/tests/shipping-plan-quotation-policy.test.cjs').split('const ids = cards')[0];
const make = new Function('require', '__dirname', fixture + '\nreturn {ctx,setup,plan,line,card,writes,getBook:()=>book};');
let checks = 0;
function check(name, value) { assert(value, name); checks++; console.log('PASS ' + name); }
async function blockedPage(browser, width, html) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('dialog', d => d.accept()); await page.route('**/*', r => r.abort());
  await page.setContent(html);
  for (const f of ['base.css', 'components.css', 'layout.css']) await page.addStyleTag({ content: read('assets/css/' + f) });
  await page.evaluate(() => document.querySelectorAll('.module-section').forEach(el => el.classList.add('active')));
  return page;
}
(async () => {
  fs.mkdirSync(out, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try { for (const width of [1440, 390]) {
    const h = make(require, __dirname), { ctx, setup, plan, line, card } = h;
    const sheets = setup([card(100, { import_duty_treatment: 'excluded_in_rate' })], plan({ carrier_id: '', updated_at: '2026-11-24T00:00:00.000Z' }), [line(100)]);
    ctx.editNextStamp_ = () => '2026-11-24T00:00:01.000Z';
    let busy = false; const calls = [];
    ctx.LockService = { getScriptLock: () => ({ tryLock: () => !busy, releaseLock() {} }) };
    const p = await blockedPage(browser, width, read('assets/html/pages/shipping-plan.html'));
    await p.addStyleTag({ content: read('assets/css/pages/shipping-plan.css') });
    await p.exposeFunction('dispatchFixture', body => {
      calls.push(body);
      if (body.action === 'shippingPlan.rateCardOptions') return JSON.parse(JSON.stringify(ctx.handleShippingPlanRateCardOptions_(body)));
      if (body.action === 'shippingPlan.selectRateCard') return JSON.parse(JSON.stringify(ctx.handleShippingPlanSelectRateCard_(body)));
      throw Error('Unexpected action ' + body.action);
    });
    await p.exposeFunction('readPlanFixture', () => JSON.parse(JSON.stringify(ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0])));
    await p.addScriptTag({ content: `window.KM_PRODUCTION_CONFIG_={endpoint:'https://script.google.com/macros/s/SYNTHETIC_ONLY/exec'};window.fetch=async(u,o)=>new Response(JSON.stringify(await dispatchFixture(JSON.parse(o.body))),{status:200});` });
    await p.addScriptTag({ content: read('assets/js/api/operation-system-db-api.js') });
    await p.addScriptTag({ content: read('assets/js/pages/shipping-plan.js') });
    check(width + ' priced selections retain their card identity; incomplete metadata cannot become a service', await p.evaluate(() => {
      const priced = { rate_card_id: 'R', rate_card_version: 'v', quote: { priced: true } };
      return _spRcSaveOption_(priced) === priced && _spRcSaveOption_({ carrier_id: 'C', quote: { priced: false } }) === null;
    }));
    await p.evaluate(async () => {
      window.alert = () => {};
      window.renderFixture = async () => {
        const raw = await readPlanFixture();
        window.testPlan = { shippingPlanId: 'P', status: 'draft', carrierId: raw.carrier_id, carrierName: 'Carrier One', shippingMethod: raw.shipping_method, lastMileDelivery: raw.last_mile_delivery, currency: raw.currency, updatedAt: raw.updated_at, planVersion: 1, country: 'US', marketplace: 'Amazon', raw };
        const lines = [{ shippingPlanLineId: 'L', shippingPlanId: 'P', sku: 'SKU', approvedQty: 100, cartonQty: 10 }];
        _spLastModel = { source: 'workspace', plans: [testPlan], lines };
        _spRenderDbSection('shippingPlanCards', [testPlan], 'draft', { P: lines }, '', null);
        document.getElementById('sp-card-P').classList.add('is-expanded');
        await spRcRefresh('P');
      };
      _spReadbackAfterWrite_ = async () => { await renderFixture(); return { readbackFailed: false }; };
      await renderFixture();
    });
    await p.locator('#sp-rc-P .sp-rc-carrier').selectOption('C1');
    await p.locator('#sp-rc-P .sp-rc-method').selectOption('0');
    check(width + ' actual unpriced card, not service-only, permits service Save', await p.locator('#sp-rc-P .sp-rc-save').isEnabled() && await p.evaluate(() => SP_RC_.P.options[0].service_only !== true && SP_RC_.P.options[0].quote.priced === false));
    await p.locator('#sp-rc-P .sp-rc-save').click();
    await p.waitForFunction(() => !_spPlanBusy_('P') && !_SP_WK1_SAVING_.P);
    const sent = calls.filter(c => c.action === 'shippingPlan.selectRateCard');
    assert(sent.length === 1 && sent[0].service_only === true && !sent[0].customs_only && !sent[0].rate_card_id && sent[0].customs_type === 'self_customs', JSON.stringify({ sent, notice: await p.locator('#sp-card-P').innerText() }));
    check(width + ' actual DB adapter sends one service tuple and customs, not a customs-only fallback', sent.length === 1 && sent[0].service_only === true && !sent[0].customs_only && !sent[0].rate_card_id && sent[0].customs_type === 'self_customs');
    const saved = ctx.shippingPlanReadObjects_(sheets.shipping_plans)[0];
    check(width + ' real locked backend saves transport and clears unquoted cost', saved.carrier_id === 'C1' && saved.shipping_method === 'sea' && saved.last_mile_delivery === 'ups' && saved.customs_type === 'self_customs' && saved.estimated_total_cost === '' && saved.estimated_freight_cost === '');
    check(width + ' readback presents inline saved state and frees Save', /Saved/.test(await p.locator('.sp-rc-feedback').innerText()) && await p.locator('.sp-rc-save').isEnabled());
    busy = true; const before = h.writes.length;
    await p.locator('.sp-rc-save').click(); await p.waitForFunction(() => !_spPlanBusy_('P') && !_SP_WK1_SAVING_.P);
    check(width + ' real lock refusal is visible beside Save with zero writes', /LOCK_TIMEOUT/.test(await p.locator('.sp-rc-feedback').innerText()) && h.writes.length === before && await p.locator('.sp-rc-save').isEnabled());
    await p.evaluate(() => {
      const base = { ...testPlan, carrierId: 'AGL', carrierName: 'AGL', currency: 'RMB', estimatedTotalCost: '', raw: { estimated_freight_cost: 1000, estimated_customs_fee: 20, estimated_duty: 30, estimated_duty_currency: 'USD', estimated_total_cost: '' } };
      const lines = [{ shippingPlanLineId: 'L', shippingPlanId: 'P', sku: 'SKU', approvedQty: 10, cartonQty: 1 }];
      _spRenderDbSection('shippingPlanCards', [base], 'draft', { P: lines }, '', null);
      document.getElementById('sp-card-P').classList.add('is-expanded');
    });
    assert.deepEqual(await p.locator('#sp-cost-P .sp-cost-label').allTextContents(), ['Carrier', 'Freight', 'Duty / Custom', 'Total Cost', 'Currency', 'Cost per pcs']);
    check(width + ' split-currency cost uses the same six standard rows', true);
    const costs = await p.locator('#sp-cost-P .sp-cost-value').allTextContents();
    check(width + ' total and unit cost keep currencies separate', costs[3] === 'RMB 1020.00 + USD 30.00' && costs[5] === 'RMB 102.0000 + USD 3.0000');
    check(width + ' missing or invalid amounts never fabricate a mixed total', await p.evaluate(() => ['', ' ', null, false, 'bad'].every(v => _spSplitCost_({ carrierId: 'C', currency: 'RMB', raw: { estimated_duty_currency: 'USD', estimated_freight_cost: 10, estimated_duty: v, estimated_customs_fee: 0 } }) === null)));
    check(width + ' header total is not falsely pending for a split-currency quote', await p.locator('.sp-card-summary .sp-summary-item').filter({ hasText: 'Total Cost' }).innerText().then(s => s.includes('RMB 1020.00 + USD 30.00')));
    check(width + ' cost text does not overlap or overflow', await p.locator('#sp-cost-P').evaluate(el => [...el.querySelectorAll('.sp-cost-row')].every(row => row.scrollWidth <= row.clientWidth + 1 && row.children[0].getBoundingClientRect().right <= row.children[1].getBoundingClientRect().left + 1)));
    await p.screenshot({ path: path.join(out, 'standard-split-cost-' + width + '.png') }); await p.close();

    const q = await blockedPage(browser, width, read('assets/html/pages/carrier-rate-card.html'));
    await q.addStyleTag({ content: read('assets/css/pages/carrier-rate-card.css') });
    await q.addScriptTag({ content: `window.loads=0;window.failLoad=false;window.cards=[20,50,100].map(t=>({rateCardId:'R'+t,carrierId:'C',originCountry:'CN',destinationCountry:'US',shippingMethod:'air',lastMileDelivery:'parcel',shippingMethodLabel:'Air Parcel',chargeType:'weight',chargeUnit:'kg',weightTier:t,weightTierUnit:'kg',currency:'USD',unitRate:10,effectiveFrom:'2026-01-01',effectiveTo:'',status:'active',updatedAt:'v1'}));window.KM={DB:{isScopedReadEligible:()=>true,getCarrierRateCards:()=>[],getCarriers:()=>[],loadScopedTables:async names=>{loads++;await new Promise(r=>setTimeout(r,200));if(failLoad)throw Error('SYNTHETIC_DB_FAILURE');return {carrierRateCards:cards,carriers:[{carrierId:'C',carrierName:'Carrier One'}]};}},lifecycle:{register(){}}};` });
    await q.addScriptTag({ content: read('assets/js/pages/carrier-rate-card.js') });
    await q.getByRole('button', { name: 'Update Price/Service', exact: true }).click();
    check(width + ' modal starts with an explicit loading state on a cold page', /Loading/.test(await q.locator('[data-quick-notice]').innerText()));
    await q.waitForFunction(() => document.querySelector('[data-quick-service]')?.options.length === 2);
    check(width + ' Choose Service loads DB without Search or broad getters', await q.evaluate(() => loads === 1));
    await q.locator('[data-quick-service]').selectOption('0');
    check(width + ' all existing tiers remain within one service', await q.locator('.crc-quick tbody tr').count() === 3);
    const box = await q.locator('.crc-quick').boundingBox();
    check(width + ' native dialog is centered in both dimensions with the real reset CSS', Math.abs(box.x + box.width / 2 - width / 2) <= 2 && Math.abs(box.y + box.height / 2 - 450) <= 2);
    check(width + ' modal has no horizontal page overflow', await q.locator('.crc-quick').evaluate(d => d.scrollWidth <= d.clientWidth + 1));
    await q.screenshot({ path: path.join(out, 'centered-price-service-' + width + '.png') });
    await q.evaluate(() => { failLoad = true; }); await q.locator('[data-quick-refresh]').click();
    await q.waitForFunction(() => document.querySelector('[data-quick-notice]').textContent.includes('SYNTHETIC_DB_FAILURE'));
    check(width + ' failed DB load is not presented as an empty service list or writable form', await q.locator('[data-quick-new]').isDisabled() && await q.locator('[data-quick-save]').isDisabled());
    await q.evaluate(() => { failLoad = false; }); await q.locator('[data-quick-refresh]').click();
    await q.waitForFunction(() => !document.querySelector('[data-quick-service]').disabled);
    check(width + ' Refresh recovers the real service list after a read refusal', await q.locator('[data-quick-service] option').count() === 2);
    await q.locator('[data-quick-close]').click();
    await q.getByRole('button', { name: 'Update Price/Service', exact: true }).click();
    await q.locator('[data-quick-close]').click();
    await q.getByRole('button', { name: 'Update Price/Service', exact: true }).click();
    await q.waitForFunction(() => document.querySelector('[data-quick-service]')?.options.length === 2 && !document.querySelector('[data-quick-service]').disabled);
    check(width + ' closing and reopening during a DB read cannot paint an obsolete dialog', await q.locator('.crc-quick').count() === 1 && await q.locator('[data-quick-save]').isDisabled());
    await q.close();
  } } finally { await browser.close(); }
  console.log('PRICE_SERVICE_FIXES_PASS ' + checks + ' synthetic fixtures, production writes=0');
})().catch(e => { console.error(e); process.exitCode = 1; });
