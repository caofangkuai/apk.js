import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeName, opcodeSize } from './src/dex/opcodes.js';
const buf=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const cls=dex.classesByDescriptor.get(process.argv[2]);
const want=process.argv[3];
for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
  if(m.name!==want) continue;
  console.log('##',m.name+m.proto.descriptor);
  const ins=m.code?.insns; if(!ins)continue; let pc=0, idx=0;
  while(pc<ins.length){
    const unit=ins[pc]; const op=unit&0xff; const sz=opcodeSize(op,ins,pc); let extra='';
    if((op>=0x6e&&op<=0x72)||(op>=0x74&&op<=0x78)){ const idx2=ins[pc+1]; const r=dex.methods[idx2]; extra=' '+((r?.classDesc||'').split('/').pop())+'.'+r?.name+(r?.proto?.descriptor||''); }
    if((op>=0x52&&op<=0x58)||(op>=0x59&&op<=0x6d)){ const ff=dex.fields[ins[pc+1]]; if(ff) extra=' fld='+(ff.name?ff.name:ff)+' @'+(ff.classDesc||'').split('/').pop(); }
    if(op===0x12||op===0x13||op===0x14||op===0x15){ extra=' lit='+(ins[pc+1]<<16>>16); }
    console.log('  ['+idx+'] pc'+pc+': '+opcodeName(op)+extra); pc+=sz; idx++;
  }
}
