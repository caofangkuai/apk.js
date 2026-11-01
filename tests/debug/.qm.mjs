import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const c=dex.classesByDescriptor.get('Landroidx/fragment/app/j;');
for(const m of [...(c.directMethods||[]),...(c.virtualMethods||[])]){
  if(m.proto.descriptor==='()V'||m.name==='q') console.log(m.name+m.proto.descriptor);
}
