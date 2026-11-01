import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
for(const [desc,cls] of dex.classesByDescriptor){
  for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
    const ins=m.code?.insns; if(!ins)continue; let pc=0;
    while(pc<ins.length){ const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
      if((op>=0x6e&&op<=0x72)||(op>=0x74&&op<=0x78)){ const r=dex.methods[ins[pc+1]];
        if(r&&r.classDesc==='Landroidx/fragment/app/j;'&&r.proto.descriptor==='(ILandroidx/fragment/app/a;)V') console.log(desc.split('/').pop()+'.'+m.name+m.proto.descriptor+' @pc'+pc);
      }
      pc+=sz;}
  }
}
