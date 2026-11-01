import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync(process.argv[2])));
const app=apk.manifest.findChild('application');
for(const a of app.findAll('activity')){
 const name=a.getAttribute('android:name')||a.getAttribute('name');
 const fl=a.findAll('intent-filter').map(f=>({act:f.findAll('action').map(x=>x.getAttribute('android:name')),cat:f.findAll('category').map(x=>x.getAttribute('android:name'))}));
 console.log('ACT',name,JSON.stringify(fl));
}
