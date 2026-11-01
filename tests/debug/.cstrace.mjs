import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
import { EmulatorEngine } from './src/framework/engine.js';
const zip=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const apk=await loadApkFiles(zip);
const eng=new EmulatorEngine(apk,{width:720,height:1520,density:2});
eng.install();
const vm=eng.vm;
vm.resources.setConfig?.('zh-CN');
const ctx=eng.createApplicationContext ? eng.createApplicationContext() : null;
// find Context
const app=vm.application || null;
console.log('has app', !!app);
// try call b.a.k.a.a.b(Context,I)
const ctxObj = globalThis.__ctx || null;
if(!ctxObj){ console.log('no ctx'); process.exit(0);}
