import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
for(const d of ['Landroidx/fragment/app/d;','Landroidx/activity/ComponentActivity;','Landroidx/appcompat/app/e;']){
  const c=dex.classesByDescriptor.get(d);
  console.log('===',d,'super=',c.superclass);
  console.log('  fields:',(c.instanceFields||[]).map(e=>e.field.name+':'+e.field.type).join(', '));
}
