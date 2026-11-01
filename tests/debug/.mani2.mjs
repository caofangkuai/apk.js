import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
const app=apk.manifest.findChild('application');
const acts=app.findAll('activity');
for(const a of acts.slice(0,4)){
  const f=a.findAll('intent-filter')[0];
  if(!f)continue;
  const act=f.findAll('action')[0];
  console.log('NAME',a.getAttribute('android:name'));
  console.log('  action attrs', JSON.stringify(act.attributes ?? act.$attrs ?? Object.keys(act)));
  try{ console.log('  raw', JSON.stringify(act)); }catch(e){ console.log('  rawstr', String(act)); }
}
