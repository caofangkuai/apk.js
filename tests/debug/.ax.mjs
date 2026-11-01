import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const zip=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const { parseBinaryXml } = await import('./src/res/axml.js');
const buf=await zip.file('res/layout/fragment_item.xml').async('nodebuffer');
const x=parseBinaryXml(buf);
function walk(n,d){if(n.type==='element'){console.log(' '.repeat(d)+n.name, JSON.stringify((n.attrs||[]).map(a=>[a.name,a.value])));}for(const c of n.children||[])walk(c,d+1);}
walk(x.root,0);
