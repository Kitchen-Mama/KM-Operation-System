'use strict';
// AD4 plan-page test. Runs the ACTUAL functions of shipping-plan.js (extracted) with labelled DOM / transport doubles (pattern of Codex's
// reproduce-ad3-zero-card-customs.cjs). No network, no DB. Not a full browser E2E.   node t-ad4-plan.cjs <c2|ad4>
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { extract } = require('./extract.cjs');
const ARM = process.argv[2] || 'ad4';
const source = ARM === 'c2'
  ? 'C:/Users/viczh/kmc/pkg/phase1-next-20261113/joint-afinal-ad3-install-c2/candidate/Sandbox/site/assets/js/pages/shipping-plan.js'
  : path.join(process.env.AD4_CANDIDATE || path.resolve('output/ad4-codex-20261122/release-final/candidate'), 'Sandbox', 'site', 'assets', 'js', 'pages', 'shipping-plan.js');
const names = ['_spRcRenderBase13_', 'spSvcSave', '_spCustomsNa_', '_spCustomsHtml_'];
const pieces = extract(fs.readFileSync(source, 'utf8'), (n) => names.includes(n), () => false);
async function scenario(lane, control) {
  const note = { style: {}, textContent: '' }, body = { innerHTML: '' }, button = { disabled: false, textContent: '' };
  const fields = { '.sp-svc-note': note, '.sp-svc-carrier': { value: 'CAR_BESTWAY' }, '.sp-svc-method': { value: 'truck' }, '.sp-svc-lastmile': { value: 'truck' }, '.sp-svc-dtype': { value: 'LTL' }, '.sp-svc-save': button };
  const service = { querySelector: (s) => fields[s] || null };
  const host = { getAttribute: () => null, querySelector: (s) => s === '.sp-rc-body' ? body : s === '.sp-svc' ? service : s === '.sp-rc-customs' ? control : null };
  const requests = [];
  const ctx = {
    SP_RC_: { UAT: { options: [], current: {}, lane } }, SP_RC_SEL_: {}, _SP_WK1_SAVING_: {},
    document: { getElementById: () => host },
    _spEsc: (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'),
    _spRcPlan_: () => ({ shippingMethod: 'truck' }), _spRcLoadingHtml_: (m) => '<div>' + m + '</div>', _spSvcHtml_: () => '<div class="sp-svc">explicit service fields</div>',
    _spPlanTok_: () => '2026-11-22 09:00:23', _spRunCommand_: async (k, fn) => fn(), _spSavedQuoteTextCp2d_: () => '',
    window: { KM: { DB: { selectShippingPlanRateCardWithCustoms: async (...a) => { requests.push(a); return { success: true, carrier_id: 'CAR_BESTWAY', shipping_method: 'truck', last_mile_delivery: 'truck', priced: false }; } } } }
  };
  vm.createContext(ctx); vm.runInContext(pieces.map((p) => p.text).join('\n'), ctx);
  ctx._spRcRenderBase13_('UAT'); await ctx.spSvcSave('UAT');
  return { select: /class="sp-rc-customs"/.test(body.innerHTML), na: /sp-rc-customs-na/.test(body.innerHTML), requests: requests.length, note: note.textContent, sent: requests[0] ? requests[0][4] : null };
}
(async () => {
  const CX = [{ id: 'third_party_customs', label: 'Fixture option' }];
  let pass = 0, fail = 0; const ok = (n, c, d) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + JSON.stringify(d))); };
  const dom = await scenario({ customs: [], customs_applicable: false, customs_basis: { reason: 'DOMESTIC_OVERSEAS_TRANSFER', country: 'US' } }, null);
  const domDef = await scenario({ customs: CX, customs_applicable: false, customs_basis: { country: 'US' } }, null);
  const intlNone = await scenario({ customs: CX, customs_applicable: true }, { value: '' });
  const intlNoCtl = await scenario({ customs: CX }, null);
  const intlPick = await scenario({ customs: CX, customs_applicable: true }, { value: 'third_party_customs' });
  if (ARM === 'ad4') {
    ok('P1 zero-card + proven domestic: "not applicable" shown, no select', dom.na && !dom.select, dom);
    ok('P2 zero-card + proven domestic: service Save is SENT once, customs blank', dom.requests === 1 && !dom.sent, dom);
    ok('P3 domestic flag wins even if a customs list is present (defensive)', domDef.na && !domDef.select && domDef.requests === 1, domDef);
    ok('P4 zero-card + customs required (international / not proven): the select IS rendered', intlNone.select && !intlNone.na, intlNone);
    ok('P5 [NEG] customs required and none chosen: refused before sending, zero requests', intlNone.requests === 0 && /Choose a customs type first/.test(intlNone.note), intlNone);
    ok('P6 [NEG] customs required, no flag, no control: still refused, zero requests', intlNoCtl.requests === 0, intlNoCtl);
    ok('P7 customs required and chosen: sent once with that customs', intlPick.requests === 1 && intlPick.sent === 'third_party_customs', intlPick);
  } else {
    ok('C1 [control c2] zero-card + customs list: the select is NOT rendered (the live blocker)', !intlNone.select, intlNone);
    ok('C2 [control c2] ... and Save is refused "Choose a customs type first" with no way to choose', intlNoCtl.requests === 0 && /Choose a customs type first/.test(intlNoCtl.note), intlNoCtl);
    ok('C3 [control c2] no "not applicable" statement exists', !dom.na, dom);
  }
  console.log('SUMMARY t-ad4-plan arm=' + ARM + ' pass=' + pass + ' fail=' + fail); process.exit(fail ? 1 : 0);
})();
