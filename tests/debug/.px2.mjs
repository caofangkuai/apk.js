import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const {parseBinaryXml}=await import('./src/res/axml.js');
const z=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const b=await z.file('res/layout/fragment_main_item_list.xml').async('uint8array');
const r=parseBinaryXml(b);
console.log('root', r.root?.children?.length);
