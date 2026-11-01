import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeName, opcodeSize } from './src/dex/opcodes.js';
const buf=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const cls=dex.classesByDescriptor.get('Landroidx/viewpager/widget/ViewPager;');
for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
  const ins=m.code?.insns; if(!ins)continue; let pc=0; const calls=[];
  while(pc<ins.length){ const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
    if(op>=0x6e&&op<=0x72||op>=0x74&&op<=0x78){ const idx=ins[pc+1]; try{const r=dex.methods[idx]; if(r){ const cd=r.classDesc||''; if(cd.includes('ViewPager$a;')||cd==='Landroidx/viewpager/widget/ViewPager$adapter;'||cd==='Landroidx/viewpager/widget/a;'||r.name==='addView'||r.name==='instantiateItem'||r.name==='destroyItem') calls.push(pc+':'+cd.split('/').pop()+'.'+r.name);} }catch(e){} }
    pc+=sz; }
  if(calls.length) console.log(m.name+m.proto.descriptor, '=>', calls.join(', '));
}
