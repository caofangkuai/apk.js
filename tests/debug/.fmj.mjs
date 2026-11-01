import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const c=dex.classesByDescriptor.get('Landroidx/fragment/app/j;');
console.log('fields=');
for(const e of (c.instanceFields||[])) console.log('  '+e.field.name+':'+e.field.type);
