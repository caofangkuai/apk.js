import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
import { loadApkFiles } from './src/framework/engine.js';
const apk=await loadApkFiles(await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk')));
const t=apk.resourceTable;
// find attr ids for tabSelectedTextColor / tabTextColor
const r=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const buf=await r.file('res/layout/fragment_main_item_list.xml').async('nodebuffer');
