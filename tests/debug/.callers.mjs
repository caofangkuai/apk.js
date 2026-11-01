import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const buf=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const cls=dex.classesByDescriptor.get('Landroidx/viewpager/widget/ViewPager;');
// find method index of a()V and a(IZZI)V
function sig(m){return m.name+m.proto.descriptor;}
const target=sig(cls.directMethods.concat(cls.virtualMethods).find(m=>m.name==='a'&&m.proto.descriptor==='()V'));
const all=[];
for(const c of dex.classesByDescriptor.values()) for(const m of [...(c.directMethods||[]),...(c.virtualMethods||[])]){
  const ins=m.code?.insns; if(!ins)continue; let pc=0;
  while(pc<ins.length){ const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
    if((op>=0x6e&&op<=0x72)||(op>=0x74&&op<=0x78)){ const idx=ins[pc+1]; const r=dex.methods[idx]; if(r&&r.name==='a'&&r.proto?.descriptor==='()V'&&(r.classDesc||'').includes('ViewPager;')) all.push((c.descriptor)+'.'+m.name+m.proto.descriptor+'@pc'+pc);}
    pc+=sz;}
}
console.log(all.join('\n')||'none');
