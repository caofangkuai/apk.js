import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const {parseBinaryXml}=await import('./src/res/axml.js');
const z=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const b=await z.file('res/layout/fragment_main_item_list.xml').async('uint8array');
const r=parseBinaryXml(b);
const root=r.root||r.first;
function walk(n,d){console.log(' '.repeat(d)+n.name, JSON.stringify((n.attributes||[]).map(a=>({n:a.name,ns:a.ns,rid:a.resourceId,w:JSON.stringify(a.value)}))));(n.children||[]).forEach(c=>walk(c,d+1));}
walk(root,0);
