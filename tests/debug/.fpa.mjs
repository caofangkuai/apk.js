import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
import { opcodeSize } from './src/dex/opcodes.js';
const buf=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
for(const cls of dex.classesByDescriptor.values()){
  if(!cls.descriptor.includes('androidx/fragment/app/'))continue;
  for(const m of [...(cls.directMethods||[]),...(cls.virtualMethods||[])]){
    if(m.name==='instantiateItem'||(m.name==='a'&&m.proto.descriptor.includes('Landroid/view/ViewGroup;I'))){
      console.log(cls.descriptor+' '+m.name+m.proto.descriptor+' len='+(m.code?.insns?.length||0));
    }
  }
}
