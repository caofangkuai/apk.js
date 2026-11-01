import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const b=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
// 找所有对 p$a 字段 c 的 iput
for(const [desc,cls] of dex.classesByDescriptor){
  for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
    const ins=m.code?.insns; if(!ins)continue; let pc=0;
    while(pc<ins.length){ const op=ins[pc]&0xff; const sz=opcodeSize(op,ins,pc);
      if(op>=0x59&&op<=0x5f){ const ff=dex.fields[ins[pc+1]]; if(ff&&ff.classDesc==='Landroidx/fragment/app/p$a;') console.log(desc.split('/').pop()+'.'+m.name+m.proto.descriptor+' iput op.'+ff.name+' @pc'+pc); }
      pc+=sz;}
  }
}
// 也看 p.a(IL,Fragment,String,I)V 是否 set Op.c (通过构造参数?)
const c=dex.classesByDescriptor.get('Landroidx/fragment/app/p;');
const m=[...c.directMethods,...c.virtualMethods].find(x=>x.name==='a'&&x.proto.descriptor==='(ILandroidx/fragment/app/Fragment;Ljava/lang/String;I)V');
console.log('--- addOp params:', m.proto.parameters.map(p=>p.descriptor||p).join(','));
