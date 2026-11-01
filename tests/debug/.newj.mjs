import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
for(const c of dex.classesByDescriptor.values()){
  for(const m of [...(c.directMethods||[]),...(c.virtualMethods||[])]){
    const ins=m.code?.insns; if(!ins)continue;
    // new-instance = 0x22, type idx at ins[pc+1]
    let pc=0;
    while(pc<ins.length){ const op=ins[pc]&0xff; 
      if(op===0x22){ const t=dex.types?.[ins[pc+1]]||dex.typeIds?.[ins[pc+1]]; }
      pc += (op===0x22?2:2); if(pc>2000)break;
    }
  }
}
