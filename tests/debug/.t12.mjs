import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { loadApkFiles, EmulatorEngine } from './src/framework/engine.js';
const eng=new EmulatorEngine({onLog:()=>{},width:360,height:720});
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
await eng.start(apk);
const vm=eng.vm;
// find the layout containing NavigationView
const res=vm.resources;
console.log('has getLayout', typeof res.getLayout);
