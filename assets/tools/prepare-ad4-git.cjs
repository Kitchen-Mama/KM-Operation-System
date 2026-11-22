'use strict';
// Local-only, explicit Production paths. Never copies private files or overwrites unrelated paths.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..'), release=path.join(repo,'output/ad4-codex-20261122/release-final');
const report=JSON.parse(fs.readFileSync(path.join(release,'RELEASE.json'),'utf8'));
const base=path.join(release,'candidate/Production'), sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const dstReport=path.join(repo,'output/ad4-codex-20261122/GIT_SYNC.json');
if(fs.existsSync(dstReport))throw Error('ALREADY_PREPARED');
const plan=report.production_gs_in_paste_order.map(n=>['apps-script/'+n,'assets/specs/active/apps-script/'+n]);
function walk(pre){for(const e of fs.readdirSync(path.join(base,'site',pre),{withFileTypes:true})){
  if(/^(?:00_config|84_|\.env)|pin.*\.local/i.test(e.name))continue;
  const r=(pre?pre+'/':'')+e.name;
  if(e.isSymbolicLink())throw Error('SYMLINK');
  if(e.isDirectory())walk(r);else plan.push(['site/'+r,r]);
}}walk('');
const changed=[];
for(const [src,dst] of plan){
  const original=path.join(repo,dst), bytes=fs.readFileSync(path.join(base,src));
  const prev=fs.existsSync(original)?fs.readFileSync(original):null;
  const text=/\.(?:gs|js|css|html|json|txt|md)$/.test(dst);
  if(prev&&(prev.equals(bytes)||(text&&prev.toString('utf8').replace(/\r\n/g,'\n')===bytes.toString('utf8').replace(/\r\n/g,'\n'))))continue;
  if(prev){const backup=path.join(repo,'output/ad4-codex-20261122/git-before',dst);fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,prev);}
  fs.mkdirSync(path.dirname(original),{recursive:true});fs.copyFileSync(path.join(base,src),original);
  changed.push({file:dst,before:prev?sha(prev):null,after:sha(bytes)});
}
fs.writeFileSync(dstReport,JSON.stringify({release:report.build,changed},null,2)+'\n');
console.log('PRODUCTION_LOCAL_SYNC '+changed.length+' files; no remote writes\n'+changed.map(x=>x.file).join('\n'));
