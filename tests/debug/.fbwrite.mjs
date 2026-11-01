import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
for(const [desc,cls] of dex.classesByDescriptor){
  for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
    const ins=m.code?.insns; if(!ins)continue; let pc=0;
    while(pc<ins.length){ const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
      if(op>=0x59&&op<=0x5f){ const ff=dex.fields[ins[pc+1]]; if(ff&&ff.classDesc==='Landroidx/fragment/app/Fragment;'&&ff.name==='b') console.log(desc.split('/').pop()+'.'+m.name+m.proto.descriptor+' iput Fragment.b @pc'+pc); }
      pc+=sz;}
  }
}
