'use strict';
// Derive an A-only release from the frozen, reviewed c2. Never reads private GS/pin files.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const base = path.resolve(process.argv[2] || 'C:/Users/viczh/kmc/pkg/phase1-next-20261113/joint-afinal-ad3-install-c2');
const workspace = path.resolve(__dirname, '../..');
const work = path.join(workspace, 'output/ad4-codex-20261122/work');
const out = path.resolve(process.argv[3] || path.join(workspace, 'output/ad4-codex-20261122/release-final'));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const read = f => fs.readFileSync(f, 'utf8');
const write = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
const json = (f, j) => write(f, JSON.stringify(j, null, 2) + '\n');
const privateName = n => /^(?:00_config|84_|\.env)|pin.*\.local/i.test(n);
function files(dir, pre = '') {
  return fs.readdirSync(path.join(dir, pre), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en')).flatMap(e => {
    if (privateName(e.name)) return [];
    if (e.isSymbolicLink()) throw Error('SYMLINK_REFUSED');
    const r = (pre ? pre + '/' : '') + e.name;
    return e.isDirectory() ? files(dir, r) : [r];
  });
}
const replace = (s, a, b) => { if (!s.includes(a)) throw Error('ANCHOR_MISSING ' + a.slice(0,70)); return s.split(a).join(b); };
const pin = '500385013d7795cd99cb88c493633397ccaed7fd9fa1b4d95ebaf12be30d3184';
if (sha(fs.readFileSync(path.join(base, 'INSTALL.sha256.txt'))) !== pin) throw Error('BASE_INSTALL_MANIFEST_MISMATCH');
if (fs.existsSync(out)) throw Error('OUTPUT_EXISTS: choose a new release folder, do not overwrite a reviewed release');
const gsNames = Object.keys(JSON.parse(read(path.join(base, 'expected/gs-expected.ad3.Production.json'))));
const order = ['22_shipment_dispatch_handlers.gs', '12_shipment_handlers.gs', '11_shipping_plan_handlers.gs'].concat(gsNames.filter(n => !/^(22_|12_|11_|63_|01_)/.test(n)), ['63_api_v1_system_health.gs', '01_router.gs']);
const report = { build: 'r6.7-ad4-codex-c3', base_install_sha256: pin, sandbox_delta_gs: ['12_shipment_handlers.gs', '11_shipping_plan_handlers.gs', '63_api_v1_system_health.gs'], production_delta_gs: ['12_shipment_handlers.gs', '11_shipping_plan_handlers.gs', '63_api_v1_system_health.gs', '01_router.gs'], production_gs_in_paste_order: order, environments: {} };
for (const env of ['Sandbox', 'Production']) {
  const source = path.join(base, 'candidate', env), target = path.join(out, 'candidate', env);
  for (const r of files(source)) write(path.join(target,r), fs.readFileSync(path.join(source,r)));
  for (const r of ['apps-script/11_shipping_plan_handlers.gs', 'apps-script/12_shipment_handlers.gs', 'site/assets/js/pages/shipping-plan.js']) write(path.join(target,r), fs.readFileSync(path.join(work,env,r)));
  const stamps = {};
  const stampFiles = [['11_shipping_plan_handlers.gs','SP_BUILD_VERSION_'], ['12_shipment_handlers.gs','SHIPMENT_BUILD_VERSION_'], ['63_api_v1_system_health.gs','SYS_BUILD_VERSION_']];
  if (env === 'Production') stampFiles.push(['01_router.gs','RTR_BUILD_VERSION_']);
  for (const [file, symbol] of stampFiles) {
    const f = path.join(target,'apps-script',file), s = read(f);
    const m = s.match(new RegExp('var\\s+' + symbol + '\\s*=\\s*[\'\"]([^\'\"]+)[\'\"]'));
    if (!m || m[1].includes('AD4')) throw Error('UNEXPECTED_BASE_STAMP ' + file);
    stamps[symbol] = { old: m[1], next: m[1] + '-AD4' };
    write(f, replace(s,m[1],m[1] + '-AD4'));
  }
  const health = path.join(target,'apps-script/63_api_v1_system_health.gs');
  let hs = read(health);
  for (const [sym,v] of Object.entries(stamps)) if (sym !== 'SYS_BUILD_VERSION_') hs = replace(hs,v.old,v.next);
  write(health,hs);
  let prodProfile;
  if (env === 'Production') {
    const rf = path.join(target,'apps-script/01_router.gs'); let rt = read(rf);
    for (const [sym,v] of Object.entries(stamps)) if (sym !== 'RTR_BUILD_VERSION_') rt = replace(rt,v.old,v.next);
    const anchor = 'var RTR_PRODUCTION_PROFILE_ = ', start = rt.indexOf(anchor), end = rt.indexOf('\n};',start);
    if (start < 0 || end < 0) throw Error('PRODUCTION_PROFILE_MISSING');
    prodProfile = JSON.parse(rt.slice(start + anchor.length,end + 2));
    const oldPolicy = prodProfile.policy_sha256; const policyInput = Object.assign({},prodProfile); delete policyInput.policy_sha256;
    prodProfile.policy_sha256 = sha(JSON.stringify(policyInput));
    rt = replace(rt,oldPolicy,prodProfile.policy_sha256); write(rf,rt);
    const cf = path.join(target,'site/production-config.js'); write(cf,replace(read(cf),oldPolicy,prodProfile.policy_sha256));
  }
  const index = path.join(target,'site/index.html');
  let ix = read(index); const tag = ix.match(/shipping-plan\.js\?v=([^\"']+)/);
  if (!tag || tag[1].includes('ad4')) throw Error('INDEX_TOKEN');
  write(index, replace(ix, 'shipping-plan.js?v=' + tag[1], 'shipping-plan.js?v=' + tag[1] + '-ad4'));
  if (env === 'Production') {
    const pi = read(index), pt = pi.match(/production-config\.js\?v=([^\"']+)/);
    if (!pt) throw Error('PRODUCTION_CONFIG_TOKEN_MISSING');
    write(index,replace(pi,'production-config.js?v=' + pt[1],'production-config.js?v=' + pt[1] + '-ad4'));
  }
  const short = env === 'Sandbox' ? 'sbx' : 'prod';
  let e = JSON.parse(read(path.join(base,'expected/expected-health-' + short + '-ad3.json')));
  for (const arr of [e.register,e.a_files,e.changed_stamps_vs_fix2]) if (Array.isArray(arr)) for (const r of arr) if (stamps[r.symbol]) r.expected = stamps[r.symbol].next;
  e.build = report.build; e.about = 'AD4 expected stamps; derived from c2. No live acceptance implied.';
  if (prodProfile) {
    e.production_gate.policy_sha256 = prodProfile.policy_sha256;
    e.production_gate.gate_module_stamps = Object.fromEntries(prodProfile.module_stamps.map(x => [x.symbol,x.expected]));
    e.client_config.policy_sha256 = prodProfile.policy_sha256;
    for (const pin of prodProfile.module_stamps) if (!e.register.some(r => r.symbol === pin.symbol && r.expected === pin.expected)) throw Error('ROUTER_HEALTH_PIN_MISMATCH ' + pin.symbol);
  }
  const ef = 'expected-health-' + short + '-ad4.json'; json(path.join(out,'expected',ef),e);
  const checkerName = 'check-' + short + '-health-ad3.cjs';
  let checker = read(path.join(base,'tools',checkerName));
  const oldHealthFile = 'expected-health-' + short + '-ad3.json';
  const oldHash = sha(fs.readFileSync(path.join(base,'expected',oldHealthFile)));
  checker = replace(checker,oldHealthFile,ef); checker = replace(checker,oldHash,sha(fs.readFileSync(path.join(out,'expected',ef))));
  checker = checker.replace(/r6\.6-ad3-c2/g,report.build).replace(/HEALTH_AD3/g,'HEALTH_AD4');
  write(path.join(out,'tools','check-' + short + '-health-ad4.cjs'),checker);
  const siteRows = files(path.join(target,'site')).map(r => ({ file:r, sha256:sha(fs.readFileSync(path.join(target,'site',r))) }));
  const list = siteRows.map(r => r.sha256 + ' *site/' + r.file.replace(/ /g,'%20')).join('\n') + '\n';
  const listName = 'AD4.' + env + '.site.sha256.txt'; write(path.join(out,'expected',listName),list);
  const gs = Object.fromEntries(gsNames.map(n => [n,sha(Buffer.from(read(path.join(target,'apps-script',n)).replace(/\r\n/g,'\n')))]));
  json(path.join(out,'expected','gs-ad4.' + env + '.json'),gs);
  const m = JSON.parse(read(path.join(source,'MANIFEST.json')));
  m.release = report.build + '-' + env; m.status = 'LOCAL_TESTED_OWNER_UAT_PENDING';
  m.files = files(target).filter(r => r !== 'MANIFEST.json').map(r => r + ' ' + sha(fs.readFileSync(path.join(target,r))));
  m.joint_a_delta4 = { base_manifest_sha256:sha(fs.readFileSync(path.join(source,'MANIFEST.json'))), stamps, no_schema_changes:true, no_b8_merge:true };
  json(path.join(target,'MANIFEST.json'),m);
  for (const n of gsNames) new vm.Script(read(path.join(target,'apps-script',n)),{ filename:n });
  new vm.Script(read(path.join(target,'site/assets/js/pages/shipping-plan.js')));
  report.environments[env] = { manifest_sha256:sha(fs.readFileSync(path.join(target,'MANIFEST.json'))), site_files:siteRows.length, site_list_sha256:sha(Buffer.from(list)), gs_files:gsNames.length, stamps };
}
// Reuse the reviewed server/collectors. Only the release pins and labels change.
let launcher = read(path.join(base,'launcher/serve-ad3.cjs'));
launcher = replace(launcher,'AD3.Sandbox.site.sha256.txt','AD4.Sandbox.site.sha256.txt');
launcher = replace(launcher,'0a0e2958351c08053d75a0e02dda253264c1a348e53fedbdd3e742fcb1594412',report.environments.Sandbox.manifest_sha256);
launcher = replace(launcher,'792511f1daecc6f35f2c9508d369c41d5a09231fcfb31a6bfcded102643c442f',report.environments.Sandbox.site_list_sha256);
launcher = launcher.replace(/r6\.6-ad3-c2/g,report.build).replace(/AD3_PACKAGE_BYTES_OK/g,'AD4_PACKAGE_BYTES_OK');
write(path.join(out,'launcher/serve-ad4.cjs'),launcher);
let assetsCheck = read(path.join(base,'tools/readback-assets-ad3.cjs'));
assetsCheck = replace(assetsCheck,'AD3.Sandbox.site.sha256.txt','AD4.Sandbox.site.sha256.txt');
assetsCheck = replace(assetsCheck,'792511f1daecc6f35f2c9508d369c41d5a09231fcfb31a6bfcded102643c442f',report.environments.Sandbox.site_list_sha256);
write(path.join(out,'tools/readback-assets-ad4.cjs'),assetsCheck);
for (const n of ['SANDBOX_HEALTH_COPY_A2.v3_1.js','PROD_HEALTH_COPY_A2.v2_1.js']) write(path.join(out,'tools',n),fs.readFileSync(path.join(base,'tools',n)));
write(path.join(out,'expected/expected-health-prod-R0.json'),fs.readFileSync(path.join(base,'expected/expected-health-prod-R0.json')));
json(path.join(out,'RELEASE.json'),report);
const entries = files(out).map(r => sha(fs.readFileSync(path.join(out,r))) + ' *' + r.replace(/ /g,'%20'));
write(path.join(out,'INSTALL.sha256.txt'),entries.join('\n') + '\n');
console.log('AD4_BUILD_OK ' + out + '\n' + JSON.stringify(report,null,2));
