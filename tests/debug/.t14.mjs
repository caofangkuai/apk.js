import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
await eng.start(apk);
const vm=eng.vm;
const rc=vm.registry.resolve('Lc/a/a/a/l;');
if(!rc.dexClass){console.log('no class');process.exit(0);}
for(const f of rc.dexClass.staticFields){ if(/headerLayout|_menu:|View_/.test(f.field.name)) console.log(f.field.name, f.value); }
