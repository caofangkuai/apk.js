import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
for(const d of ['Landroidx/fragment/app/o;','Landroidx/fragment/app/p;']){
  const c=dex.classesByDescriptor.get(d);
  console.log('===',d,'super=',c.superclass);
  console.log('  fields=',(c.instanceFields||[]).map(e=>e.field.name+':'+e.field.type).join(', '));
  console.log('  methods=',[...(c.directMethods||[]),...(c.virtualMethods||[])].map(m=>m.name+m.proto.descriptor).join(' | '));
}
