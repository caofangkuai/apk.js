import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeName, opcodeSize, opcodeFormat } from './src/dex/opcodes.js';
const buf=fs.readFileSync(process.argv[2]);
const dex=new DexFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength));
const cls=dex.classesByDescriptor.get(process.argv[3]);
const target=process.argv[4];
for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
  if(m.name===target) dump(m);
}
function mref(idx){ const mm=dex.methods[idx]; if(!mm) return '?'+idx; try{ const c=dex.classesByDescriptor.get((mm.classDesc||""))||dex; return ((mm.classDesc||"")||'')+'.'+mm.name; }catch(e){ return '?'+idx; } }
function dump(m){ console.log('##',m.name+m.proto.descriptor,'regs',m.code?.registersSize,'ins',m.code?.insSize); const ins=m.code?.insns; if(!ins)return; let pc=0;
 while(pc<ins.length){ const unit=ins[pc]; const op=unit&0xff; const sz=opcodeSize(op,ins,pc); let extra='';
   if(op===0x6e||op===0x6f||op===0x70||op===0x71||op===0x72||op===0x74||op===0x75||op===0x76||op===0x77){ const idx=ins[pc+1]; extra=' '+mref(idx); }
   if(op===0x1a||op===0x1b){ const idx=op===0x1a?ins[pc+1]:((ins[pc+1]|(ins[pc+2]<<16))>>>0); try{extra=' str='+dex.strings[idx];}catch(e){} }
   if(op===0x52||op===0x53||op===0x54||op===0x55||op===0x56||op===0x57||op===0x58||op===0x59||op===0x5a||op===0x5b||op===0x5c||op===0x5d||op===0x5e||op===0x5f){ let idx; if(op>=0x52&&op<=0x58) idx=ins[pc+1]; else idx=(ins[pc+1]|(ins[pc+2]<<16))>>>0; try{const f=dex.fields[idx]; extra=' fld='+(f?.type)+' '+f?.name;}catch(e){} }
   if(op===0x22){ const idx=ins[pc+1]; try{extra=' type='+dex.types[idx];}catch(e){} }
   console.log('  '+pc.toString().padStart(3)+': '+opcodeName(op)+extra); pc+=sz; if(pc>400)break; }
}
