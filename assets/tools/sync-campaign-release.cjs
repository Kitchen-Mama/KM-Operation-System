'use strict';
// Mechanical release pin/config synchronization. No credentials, deployment or DB mutation.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'../specs/active/apps-script'),root=path.resolve(__dirname,'../..'),c=vm.createContext({});
const file=path.join(base,'01_router.gs');let source=fs.readFileSync(file,'utf8');vm.runInContext(source,c);
for(const name of ['14_fc_write_handlers.gs','20_campaign_write_handlers.gs','78_api_v1_import_batch.gs'])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),c);
const p=JSON.parse(JSON.stringify(c.RTR_PRODUCTION_PROFILE_));
for(const action of ['campaign.builder.get','campaign.builder.status','campaign.builder.save'])if(!p.allowed.includes(action))p.allowed.push(action);
for(const action of ['campaign.builder.get','campaign.builder.status'])if(!p.reads.includes(action))p.reads.push(action);
let health=fs.readFileSync(path.join(base,'63_api_v1_system_health.gs'),'utf8');
for(const symbol of ['FCW_BUILD_VERSION_','CAMPAIGN_BUILD_VERSION_','IMB_BUILD_VERSION_']){
 const pin=p.module_stamps.find(m=>m.symbol===symbol);assert(pin);pin.expected=c[symbol];
 const re=new RegExp('("symbol": "'+symbol+'",\\s*"expected": ")[^"]+(")','g');
 health=health.replace(re,'$1'+c[symbol]+'$2');assert(health.includes('"expected": "'+c[symbol]+'"'));
}
delete p.policy_sha256;p.policy_sha256=crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const start=source.indexOf('var RTR_PRODUCTION_PROFILE_ = '),end=source.indexOf('\n};',start)+3;assert(start>=0&&end>start);
source=source.slice(0,start)+'var RTR_PRODUCTION_PROFILE_ = '+JSON.stringify(p,null,2)+';'+source.slice(end);
fs.writeFileSync(file,source);fs.writeFileSync(path.join(base,'63_api_v1_system_health.gs'),health);
const pub={...p};delete pub.blocked;delete pub.module_stamps;
let config=fs.readFileSync(path.join(root,'production-config.js'),'utf8');const a=config.indexOf('var c = ')+8,b=config.indexOf('\n};',a)+2;assert(a>=8&&b>a);
config=config.slice(0,a)+JSON.stringify(pub,null,2)+config.slice(b);fs.writeFileSync(path.join(root,'production-config.js'),config);
const tag=process.argv[2]||'campaign-builder-20261125-v1';
let index=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const n of ['production-config.js','production-guard.js','assets/js/api/operation-system-db-api.js'])index=index.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\?v=[^"\\s]+'),n+'?v='+tag);fs.writeFileSync(path.join(root,'index.html'),index);
console.log('CAMPAIGN_RELEASE_SYNC_PASS policy='+p.policy_sha256);
