import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
import { parseBinaryXml } from '../src/res/axml.js';
import { ResourceTable } from '../src/res/arsc.js';
import { DexFile } from '../src/dex/dexfile.js';

const apkPath = process.argv[2] || './samples/hello-dex.apk';
const data = fs.readFileSync(apkPath);
const zip = await JSZip.loadAsync(data);
const axml = parseBinaryXml(await zip.file('AndroidManifest.xml').async('uint8array'));
console.log('manifest package:', axml.manifest.getAttribute('package'));
console.log('activities:', axml.manifest.findChild('application')?.findAll('activity').map((a) => a.getAttribute('android:name') || a.attrs.map(x=>x.name)));

const layoutFile = zip.file('res/layout/activity_main.xml');
const layout = parseBinaryXml(await layoutFile.async('uint8array'));
const root = layout.root.children.find((c) => c.type === 'element');
console.log('layout root:', root.name, root.attrs.map((a) => `${a.name}[${a.resId.toString(16)}]=${typeof a.value === 'object' ? JSON.stringify(a.value) : a.value}`));

const arsc = new ResourceTable(await zip.file('resources.arsc').async('uint8array'));
for (const [id, entry] of arsc.entries) {
  console.log('res', id.toString(16), entry.typeName, entry.key, JSON.stringify(entry.value));
}

const dex = new DexFile(await zip.file('classes.dex').async('uint8array'));
console.log('dex version', dex.version, 'classes', dex.classes.length);
for (const cls of dex.classes) {
  console.log('class', cls.name, 'super', cls.superclass, 'methods', cls.directMethods.length + cls.virtualMethods.length);
}
