'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const root = path.resolve(__dirname, '../..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const out = path.join(root, 'output/maintenance-20261125');
let checks = 0; function check(name, value) { assert(value, name); checks++; console.log('PASS ' + name); }
(async () => {
 fs.mkdirSync(out, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
 try { for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept()); await page.route('**/*', r => r.abort());
  await page.setContent(read('assets/html/pages/carrier-rate-card.html'));
  await page.addStyleTag({ content: 'body{font:14px Arial;margin:12px}*{box-sizing:border-box}.crc-page{display:block}' });
  await page.addStyleTag({ content: read('assets/css/pages/carrier-rate-card.css') });
  await page.addScriptTag({ content: 'window.KM={DB:{isScopedReadEligible:()=>true,getCarrierRateCards:()=>cards,getCarriers:()=>[{carrierId:"C",carrierName:"Carrier One"}],saveCarrierRateCardsQuick:async p=>{writes.push(p);return refusal?{success:false,error:{code:"EDIT_CONFLICT",details:{zero_write:true}}}:{success:true,data:{verified:true,rows:p.rows.map(r=>({...r,updated_at:"v2"}))}}}},lifecycle:{register(){}}}; window.cards=[20,50,100].map(t=>({rateCardId:"R"+t,carrierId:"C",originCountry:"CN",destinationCountry:"US",shippingMethod:"air",lastMileDelivery:"parcel",shippingMethodLabel:"Air Parcel",chargeType:"weight",chargeUnit:"kg",weightTier:t,weightTierUnit:"kg",currency:"USD",unitRate:10,effectiveFrom:"2026-01-01",effectiveTo:"",status:"active",updatedAt:"v1"}));window.writes=[];window.refusal=true;window.KM_SCOPED_PAGE_READS=false;' });
  await page.addScriptTag({ content: read('assets/js/pages/carrier-rate-card.js') });
  await page.evaluate(() => crcQuickOpen()); await page.locator('[data-quick-service]').selectOption('0');
  check(width + ' one service retains three tiers', await page.locator('.crc-quick tbody tr').count() === 3);
  await page.locator('[data-price-index="1"]').fill('9.5'); await page.locator('[data-quick-save]').click();
  await page.waitForFunction(() => document.querySelector('[data-quick-notice]').textContent !== 'Saving...');
  check(width + ' refusal retains edits and enables Save', await page.locator('[data-quick-save]').isEnabled() && await page.locator('[data-price-index="1"]').inputValue() === '9.5');
  check(width + ' explicit conflict visible', (await page.locator('[data-quick-notice]').innerText()).includes('EDIT_CONFLICT'));
  await page.evaluate(() => { refusal = false; }); await page.locator('[data-quick-save]').click();
  check(width + ' changed row only, token sent', await page.evaluate(() => writes[1].rows.length === 1 && writes[1].rows[0].expected_updated_at === 'v1' && writes[1].rows[0].unit_rate === 9.5));
  await page.locator('[data-quick-new]').click();
  await page.locator('[name="carrier_id"]').selectOption('C'); await page.locator('[name="destination_country"]').fill('US'); await page.locator('[name="shipping_method_label"]').fill('Air Parcel'); await page.locator('[name="unit_rate"]').fill('10');
  await page.locator('[data-quick-save]').click();
  check(width + ' duplicate service blocked before POST', await page.evaluate(() => writes.length === 2) && /already exists/.test(await page.locator('[data-quick-notice]').innerText()));
  check(width + ' form fits viewport', await page.locator('.crc-quick').evaluate(d => d.scrollWidth <= d.clientWidth + 1));
  await page.screenshot({ path: path.join(out, 'rate-maintenance-' + width + '.png') });
  check(width + ' no browser exceptions', errors.length === 0);
  await page.close();

  const inv = await browser.newPage({ viewport: { width, height: 900 } }); await inv.route('**/*', r => r.abort());
  await inv.setContent('<section id="ops-section"></section>');
  for (const f of ['base.css', 'components.css', 'layout.css', 'pages/inventory-replenishment.css']) await inv.addStyleTag({ content: read('assets/css/' + f) });
  await inv.addScriptTag({ content: 'window.KM={lifecycle:{register(){}}};' });
  await inv.addScriptTag({ content: read('assets/js/pages/inventory-replenishment.js') });
  await inv.evaluate(() => {
   _irFactoryDetailRowsCached_ = () => ({ unknownCountry: 0, rows: [{ name: 'CN Youxin Factory', pool: { warehouse_id: 'W', factory_current_stock: 730, factory_reserved_stock: 0, active_allocation_draft_qty: 80, active_shipping_plan_qty: 320, available_to_allocate: 330 } }] });
   var els = _irFactoryDetailEls_(); els.modal.classList.add('is-open');
   document.getElementById('replen-factory-detail-title').textContent = 'CO1100-R - CN factory';
   document.getElementById('replen-factory-detail-body').innerHTML = _irFactoryDetailHtml_('CO1100-R', 'CN', { cnStock: 33 }, 'READY', {}, [], null, 'site');
  });
  check(width + ' all six factory columns visible without horizontal scroll', await inv.locator('#replen-factory-detail-body table').evaluate(t => t.querySelectorAll('th').length === 6 && t.scrollWidth <= t.clientWidth + 1 && t.parentElement.scrollWidth <= t.parentElement.clientWidth + 1));
  await inv.evaluate(() => { window.nav = ''; window.showSection = s => { nav = s; }; document.getElementById('ops-section').insertAdjacentHTML('beforeend', _irOverdueValue_({ overdue: 37, overdueIds: ['SH1', 'SH2'] })); });
  await inv.locator('.ir-overdue-link').evaluate(e => e.click());
  check(width + ' overdue links carry exact shipment IDs', await inv.evaluate(() => nav === 'global-logistics-map' && _glmPendingShipmentIds.join(',') === 'SH1,SH2'));
  await inv.screenshot({ path: path.join(out, 'factory-modal-' + width + '.png') }); await inv.close();
 } } finally { await browser.close(); }
 console.log('MAINTENANCE_UI_PASS ' + checks + ' offline');
})().catch(e => { console.error(e); process.exitCode = 1; });
