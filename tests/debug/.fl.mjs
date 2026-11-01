import fs from 'node:fs';
import { DexFile } from './src/dex/dexfile.js';
const buf=fs.readFileSync('/tmp/di.dex');
const dex=new DexFile(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength));
const cls=dex.classesByDescriptor.get(process.argv[2]);
console.log((cls.instanceFields||[]).map(e=>e.field.name+':'+e.field.type).join('\n'));
