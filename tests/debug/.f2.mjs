import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const c=dex.classesByDescriptor.get('Landroidx/fragment/app/f;');
console.log('fields=',(c.instanceFields||[]).map(e=>e.field.name+':'+e.field.type));
console.log('methods=',[...(c.directMethods||[]),...(c.virtualMethods||[])].map(m=>m.name+m.proto.descriptor).join('\n'));
