import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const buf=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const cls=dex.classesByDescriptor.get(process.argv[2]);
const want=process.argv[3];
for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
  const ins=m.code?.insns; if(!ins)continue; let pc=0; const hits=[];
  while(pc<ins.length){ const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
    if((op>=0x52&&op<=0x58)||(op>=0x59&&op<=0x5f)){ const idx=ins[pc+1]; try{const f=dex.fields[idx]; if(f&&f.name===want) hits.push('pc'+pc+' op'+op.toString(16));}catch(e){} }
    pc+=sz; }
  if(hits.length) console.log(m.name+m.proto.descriptor, hits.join(' | '));
}
