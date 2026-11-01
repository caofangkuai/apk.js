import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
await eng.start(apk);
const vm = eng.vm;
for (const d of ['Lb/g/k/d;','Lb/g/k/w;','Landroidx/drawerlayout/widget/DrawerLayout;']) {
  const rc = vm.registry.resolve(d);
  const cls = rc.dexClass;
  const hasA = cls?.staticMethods?.find(m=>m.name==='a'&&m.proto?.descriptor==='(II)I');
  const wq = d.includes('/w;') ? cls?.staticMethods?.find(m=>m.name==='q') : null;
  console.log(d, 'dex?',!!cls, 'a(II)I code?', !!hasA, hasA?.code? 'YES':'no', 'methods', cls?.staticMethods?.length);
}
