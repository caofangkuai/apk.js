import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
for(const d of ['Landroidx/fragment/app/f;','Landroidx/fragment/app/h;','Landroidx/fragment/app/j;','Landroidx/fragment/app/d;']){
  const c=dex.classesByDescriptor.get(d);
  console.log(d,'super=',c.superclass);
}
// 谁 new j / new h
