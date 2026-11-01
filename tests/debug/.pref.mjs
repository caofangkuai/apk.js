import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const JSZipMod = await import('./src/res/axml.js').catch(() => ({}));
console.log('axml exports:', Object.keys(JSZipMod));
const zip = await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const buf = await zip.file('res/xml/pref_main.xml').async('nodebuffer');
console.log('size', buf.length, 'magic', buf.slice(0,4).toString('hex'));
