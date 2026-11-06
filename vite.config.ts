import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync,readdirSync } from 'node:fs';
import { join } from 'node:path';
let publicDir='';
function assets(dir:string,prefix=''):Array<{path:string;content:Buffer}>{return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?assets(join(dir,entry.name),prefix+entry.name+'/'):[{path:prefix+entry.name,content:readFileSync(join(dir,entry.name))}]).sort((a,b)=>a.path.localeCompare(b.path));}
export default defineConfig({base:'./',plugins:[{name:'artlab-offline',configResolved(config){publicDir=config.publicDir;},generateBundle(_options,bundle){
  const files=assets(publicDir),hash=createHash('sha256');
  for(const [name,item] of Object.entries(bundle))hash.update(name).update(item.type==='chunk'?item.code:item.source);
  for(const file of files)hash.update(file.path).update(file.content);
  const paths=[...new Set(['./','./index.html',...files.map(f=>'./'+f.path),...Object.keys(bundle).filter(f=>!f.endsWith('.map')).map(f=>'./'+f)])];
  this.emitFile({type:'asset',fileName:'sw.js',source:`const PREFIX='artlab:'+encodeURIComponent(self.registration.scope)+':';const CACHE=PREFIX+'${hash.digest('hex').slice(0,12)}';const ASSETS=${JSON.stringify(paths)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(cache=>cache.match(event.request).then(hit=>hit||fetch(event.request).catch(error=>{if(event.request.mode==='navigate')return cache.match('./index.html');throw error;}))));});`});
}}]});
