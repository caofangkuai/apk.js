import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
await eng.start(apk);
const vm = eng.vm;
const cls = vm.registry.resolve('Lb/g/k/d;').dexClass;
const m = [...(cls.directMethods||[]),...(cls.virtualMethods||[])].find(x=>x.name==='a'&&x.proto?.descriptor==='(II)I');
const f = m.dex.fields;
// find the sget field at pc0
console.log('insns0..3', m.code.units ? Array.from(m.code.units.slice(0,4)) : 'no units');
