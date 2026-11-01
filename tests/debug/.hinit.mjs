import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const c=dex.classesByDescriptor.get('Landroidx/fragment/app/j;');
for(const m of [...c.directMethods,...c.virtualMethods]){ const ins=m.code?.insns; if(!ins)continue; let pc=0; while(pc<ins.length){const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
  if(op>=0x59&&op<=0x5f){const ff=dex.fields[ins[pc+1]]; if(ff&&ff.classDesc==='Landroidx/fragment/app/j;'&&ff.name==='H')console.log('put j.H in '+m.name+m.proto.descriptor+' @pc'+pc);}
  pc+=sz;}}
// 也看谁读 H (iget)
for(const m of [...c.directMethods,...c.virtualMethods]){ const ins=m.code?.insns; if(!ins)continue; let pc=0; while(pc<ins.length){const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
  if(op>=0x52&&op<=0x58){const ff=dex.fields[ins[pc+1]]; if(ff&&ff.classDesc==='Landroidx/fragment/app/j;'&&ff.name==='H')console.log('get j.H in '+m.name+m.proto.descriptor+' @pc'+pc);}
  pc+=sz;}}
