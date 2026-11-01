import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
for(const c of dex.classesByDescriptor.values()){
  if(!c.descriptor.includes('androidx/fragment/'))continue;
  const ms=[...(c.directMethods||[]),...(c.virtualMethods||[])];
  if(ms.length>=14) console.log(c.descriptor,'super=',c.superclass,'n='+ms.length);
}
