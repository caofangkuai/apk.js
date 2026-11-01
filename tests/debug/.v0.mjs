import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const vm0=apk.dexFiles||apk.dexes;
for(const dex of (apk.dexFiles||[])){
  const c=(dex.classes||[]).find(c=>c.descriptor==='Lru/andr7e/deviceinfohw/j/w;');
  if(!c) continue;
  const m=(c.directMethods||[]).find(m=>m.name==='v0');
  if(m) console.log('v0 code bytes:', Buffer.from(m.code||[]).toString('hex'));
}
