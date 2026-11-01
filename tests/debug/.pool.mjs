import fs from 'fs';
import { createRequire } from 'module';
const require=createRequire(import.meta.url);
const JSZip=require('jszip');
const zip=await JSZip.loadAsync(fs.readFileSync('/tmp/devinfo.apk'));
const buf=await zip.file('res/color/mtrl_tabs_colored_ripple_color.xml').async('nodebuffer');
const dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);
let off=8; // skip xml header (type u16, hsize u16, size u32)
const type=dv.getUint16(off,true), hsz=dv.getUint16(off+2,true), sz=dv.getUint32(off+4,true);
const sc=dv.getUint32(off+8,true), stc=dv.getUint32(off+12,true), flags=dv.getUint32(off+16,true);
const ss=dv.getUint32(off+20,true);
console.log('type',type.toString(16),'strings',sc,'flags',flags.toString(16),'utf8',!!(flags&0x100));
for(let i=0;i<sc;i++){
  const so=dv.getUint32(off+28+i*4,true);
  const p=off+ss+so;
  const b=dv.getUint8(p);
  if(flags&0x100){ // utf8: u16 length of chars, u8 byteslen? actually utf8 uses 1-2 byte lengths
    let q=p; let l1=dv.getUint8(q++); if(l1&0x80){l1=((l1&0x7f)<<8)|dv.getUint8(q++);}
    let l2=dv.getUint8(q++); if(l2&0x80){l2=((l2&0x7f)<<8)|dv.getUint8(q++);}
    let s='';for(let k=0;k<l2;k++)s+=String.fromCharCode(dv.getUint8(q+k));
    console.log(i,JSON.stringify(s));
  } else {
    let q=p; let l=dv.getUint16(q,true); q+=2; if(l&0x8000){l=((l&0x7fff)<<16)|dv.getUint16(q,true);q+=2;}
    let s='';for(let k=0;k<l;k++)s+=String.fromCharCode(dv.getUint16(q+k*2,true));
    console.log(i,JSON.stringify(s));
  }
}
