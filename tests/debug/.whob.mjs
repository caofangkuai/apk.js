import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
for(const [desc,cls] of dex.classesByDescriptor){
  if(!desc.startsWith('Landroidx/fragment/app/'))continue;
  for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
    const ins=m.code?.insns; if(!ins)continue; let pc=0;
    while(pc<ins.length){ const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
      if((op>=0x6e&&op<=0x72)||(op>=0x74&&op<=0x78)){ const r=dex.methods[ins[pc+1]];
        if(r&&r.classDesc==='Landroidx/fragment/app/Fragment;'&&(r.proto.descriptor==='(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;Landroid/os/Bundle;)V'||r.proto.descriptor==='(Landroid/view/LayoutInflater;Landroid/view/ViewGroup;Landroid/os/Bundle;)Landroid/view/View;')) console.log(desc.split('/').pop()+'.'+m.name+m.proto.descriptor+' -> '+r.name+' @pc'+pc);
      }
      pc+=sz;}
  }
}
