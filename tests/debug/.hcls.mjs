import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const c=dex.classesByDescriptor.get('Landroidx/fragment/app/h;');
console.log('h super=',c.superclass,'fields=',(c.instanceFields||[]).map(e=>e.field.name+':'+e.field.type));
const e=dex.classesByDescriptor.get('Landroidx/fragment/app/e;');
console.log('e super=',e.superclass,'n=',[...(e.directMethods||[]),...(e.virtualMethods||[])].map(m=>m.name+m.proto.descriptor).join(','));
