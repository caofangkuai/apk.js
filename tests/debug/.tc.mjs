import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { parseBinaryXml } from './src/res/axml.js';
const buf = fs.readFileSync('/tmp/devinfo.apk');
const zip = await JSZip.loadAsync(buf);
// find item layout 0x7f0c003c from resources.arsc
const arsc = await zip.file('resources.arsc').async('nodebuffer');
const txt = arsc.toString('latin1');
// find "item_" layout names
const names = Object.keys(zip.files).filter(n=>/res\/layout\/.*\.xml$/.test(n));
function walk(n, d) {
  if (!n || n.type !== 'element') return;
  const a = (n.attrs||[]).map(x=>x.name+'='+JSON.stringify(x.value)).join(' ');
  console.log('  '.repeat(d) + n.name + ' ' + a);
  for (const c of n.children||[]) walk(c, d+1);
}
for (const n of names) {
  const f = zip.file(n); if(!f) continue;
  const b = await f.async('nodebuffer');
  let x; try { x = parseBinaryXml(b); } catch(e) { continue; }
  const rootNode = (x.root.children||[]).find(c=>c.type==='element');
  if (!rootNode) continue;
  if (/CoordinatorLayout/.test(rootNode.name)) { console.log('=== '+n); walk(rootNode, 0); }
}
