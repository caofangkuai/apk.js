import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const zip=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const names=Object.keys(zip.files).filter(n=>n.startsWith('res/layout'));
console.log(names.join('\n'));
