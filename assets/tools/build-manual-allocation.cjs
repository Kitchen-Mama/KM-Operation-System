const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'output/manual-allocation-20261124/release-3');
assert(!fs.existsSync(out),'Use a fresh release directory');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),files={};
function put(relative,bytes){const target=path.join(out,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);files[relative]={bytes:bytes.length,sha256:hash(bytes)};assert.equal(hash(fs.readFileSync(target)),files[relative].sha256);}
for(const name of ['01_router.gs','15_request_allocation_handlers.gs','63_api_v1_system_health.gs']){
  const bytes=fs.readFileSync(path.join(root,'assets/specs/active/apps-script',name));new vm.Script(bytes.toString());put('Production/apps-script/'+name,bytes);
}
for(const name of ['index.html','production-config.js','production-guard.js','assets/js/pages/request-order.js'])put('Production/site-delta/'+name,fs.readFileSync(path.join(root,name)));
put('INSTALL.txt',Buffer.from([
  'MANUAL ORDER ALLOCATION - Production - 2026-11-24',
  '',
  'Back up the current Production Apps Script source and deployment.',
  'Replace ALL THREE files together:',
  '  01_router.gs',
  '  15_request_allocation_handlers.gs',
  '  63_api_v1_system_health.gs',
  'Save all three, then update the EXISTING Web App deployment to a NEW version. Keep the same /exec URL.',
  'Do not copy Production 01_/63_ into Sandbox. Do not change config, credentials, PIN, DB ID or OAuth scopes.',
  'No schema migration, initializer, 90_ bundle rebuild, reimport or data cleanup is needed.',
  '',
  'Health: router and health build strings end -DR4-MA1; required RAEE_BUILD_VERSION_ = MANUAL-ALLOCATION-20261124.',
  'Only 01_ + 63_ without the updated 15_ is deliberately refused as an incomplete module deployment.',
  'Saving in the editor does not prove /exec was redeployed.',
  '',
  'The authorized GitHub push publishes the frontend. Refresh with Ctrl+F5 after deploying GS.',
  'Order Planning: Search, expand SKU, enter Order Qty. Notes unlock after its first saved quantity.',
  'Confirmed NO_SAVED_DRAFT now supports an explicit manual quantity; it does not adopt Suggested automatically.',
  'T1/T2/T3 save with bound request months, reload from DB, and can proceed to Send Request.',
  'Loading, duplicate conflicts, unresolved scope and read failures remain locked.',
  'Unsaved or failed edits block Send even if the detail panel was closed.',
  'Existing AI Plan generation stays disabled in Production. Weekly/admin writes remain disabled.',
  '',
  'Staged rollout: the exact previous DR4 policy remains valid for its previous actions, but this new manual UI',
  'refuses its writes until the new backend identity is proven. Unknown policies or wrong DB identities are refused.',
  'The running local Sandbox and frozen cumulative Sandbox package are not changed.',
  'Existing legacy drafts with missing/wrong tier months are not silently migrated; a failed month readback is not Saved.',
  '',
  'Validation: 10 policy/backend tests + 44 desktop/mobile browser checks; mainline 98 Node + C1 64 + C2 39.',
  'Tests use synthetic Sheets/Drive only. No live Production order, stock, receipt, dispatch or file generation was performed.',
  ''
].join('\n')));
put('RELEASE.json',Buffer.from(JSON.stringify({release:'MANUAL-ALLOCATION-20261124',baseCommit:'8b5f8e8e8c323fc351f24a789ee0d8a4998120b5',gsFiles:3,
  policySha256:'cc77c5a4692be7e787c65557198f7d673bcc06ece2cfb658f6655601fffd9420',liveBusinessWrites:0,files:{...files}},null,2)+'\n'));
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),Object.entries(files).map(([f,r])=>r.sha256+'  '+f).join('\n')+'\n');
console.log(JSON.stringify({out,files:Object.keys(files).length,gsFiles:3,manifestSha256:hash(fs.readFileSync(path.join(out,'SHA256SUMS.txt')))}));
