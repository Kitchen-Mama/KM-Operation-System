'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extract } = require('../ad4/extract.cjs');
const root = path.resolve(__dirname, '../../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const dbSource = read('assets/js/api/operation-system-db-api.js');
function parts(source, functions, variables = []) {
  return extract(source, n => functions.includes(n), n => variables.includes(n)).map(p => p.text).join('\n');
}
const guardSource = parts(dbSource, ['_kmWriteFlightKey_', '_kmGuardWriteCommand_', '_kmInstallWriteCommandGuards_'], ['_kmWriteFlights_', '_KM_SOURCE_WRITE_FAMILIES_']);
// Reuse the established full-client, network-stubbed VM fixture without executing its test registrations.
const fixtureSource = parts(read('assets/tests/dc1-r1-source-write-epoch-and-reader-invalidation.test.js'), ['makeClient'])
  .replace('var ctx = vm.createContext(sb);', "sb.window.KM_PRODUCTION_CONFIG_ = { endpoint: 'https://script.google.com/macros/s/FIXTURE/exec' }; var ctx = vm.createContext(sb);");
const makeClient = new Function('vm', 'DBAPI', fixtureSource + '\nreturn makeClient;')(vm, dbSource);
module.exports = { root, read, parts, guardSource, makeClient };
