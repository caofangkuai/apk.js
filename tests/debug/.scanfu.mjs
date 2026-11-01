import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const cls=dex.classesByDescriptor.get('Landroidx/viewpager/widget/ViewPager;');
for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
  const ins=m.code?.insns; if(!ins)continue; let pc=0; const hits=[];
  while(pc<ins.length){ const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
    if((op>=0x6e&&op<=0x72)||(op>=0x74&&op<=0x78)){ const idx=ins[pc+1]; const r=dex.methods[idx];
      if(r&&(r.classDesc||'')==='Landroidx/viewpager/widget/a;'&&(r.proto?.descriptor||'').includes('ViewGroup;')) hits.push('pc'+pc+' '+r.name+r.proto.descriptor);}
    pc+=sz;}
  if(hits.length) console.log(m.name+m.proto.descriptor,'=>',hits.join(', '));
}
