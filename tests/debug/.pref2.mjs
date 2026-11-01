import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { parseBinaryXml } = await import('./src/res/axml.js');
const zip = await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const buf = await zip.file('res/xml/pref_main.xml').async('nodebuffer');
const root = parseBinaryXml(buf);
const out = [];
const walk = (n, depth) => {
  if (n && n.name) {
    const attrs = [...(n.attributes || [])].map(a => `${a.name ?? a.key}=${a.value ?? a.typedValue?.value}`).join(' ');
    out.push(' '.repeat(depth) + n.name + ' ' + attrs);
  }
  for (const c of n?.children || []) walk(c, depth + 1);
};
walk(root, 0);
console.log(out.join('\n'));
