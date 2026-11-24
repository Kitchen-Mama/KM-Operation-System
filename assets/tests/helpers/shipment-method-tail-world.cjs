'use strict';
const vm = require('node:vm');
const { createEuWorld } = require('./shipment-import-eu-world.cjs');
const { read } = require('./order-mainline-world.cjs');
function createTokenWorld(country = 'PL') {
  const h = createEuWorld(country);
  for (const file of ['assets/specs/active/apps-script/12_shipment_handlers.gs',
    'output/dw2-workflow-20261122/release-4/candidate/Production/apps-script/17_carrier_handlers.gs']) {
    vm.runInContext(read(file), h.c, { filename: file });
  }
  return h;
}
module.exports = { createTokenWorld };
