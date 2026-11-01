import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const zip=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const { parseBinaryXml } = await import('./src/res/axml.js');
const x=parseBinaryXml(await zip.file('res/color/mtrl_tabs_colored_ripple_color.xml').async('nodebuffer'));
function walk(n,d){ if(n.type==='element'){ console.log(' '.repeat(d)+n.name, JSON.stringify((n.attrs||[]).map(a=>({name:a.name,val:typeof a.value==='object'?JSON.stringify(a.value).slice(0,40):a.value})))); } for(const c of n.children||[]) walk(c,d+1); }
walk(x.root,0);
