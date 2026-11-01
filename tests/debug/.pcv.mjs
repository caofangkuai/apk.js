import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const cls=dex.classesByDescriptor.get('Landroidx/fragment/app/j;');
for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
  const ins=m.code?.insns; if(!ins)continue; let pc=0;
  while(pc<ins.length){ const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
    if((op>=0x6e&&op<=0x72)||(op>=0x74&&op<=0x78)){ const r=dex.methods[ins[pc+1]];
      if(r&&(/[Cc]reateView/.test(r.name)||r.name==='a(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;Landroid/os/Bundle;)Landroid/view/View;')) console.log(m.name+m.proto.descriptor+' -> '+r.classDesc.split('/').pop()+'.'+r.name+r.proto.descriptor+' @pc'+pc);
    }
    pc+=sz;}
}
