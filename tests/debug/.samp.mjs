import Canvas from 'canvas';
import fs from 'fs';
for(const [label,path] of [['OUT','/workspace/out.png'],['TARGET','/workspace/.monkeycode-tmp-files/406ca14e-Screenshot_20261101-153649-1.webp']]){
  try{
    const img=await Canvas.loadImage(path);
    const c=Canvas.createCanvas(img.width,img.height); const x=c.getContext('2d'); x.drawImage(img,0,0);
    console.log(label, img.width+'x'+img.height);
    for(const y of [300,312,325,340]){
      const row=[]; for(const px of [40,120,200,280,400,520,620]){ const d=x.getImageData(px,y,1,1).data; row.push(((d[0]<<16)|(d[1]<<8)|d[2]).toString(16).padStart(6,'0')); }
      console.log(' y='+y, row.join(' '));
    }
  }catch(e){console.log(label,'ERR',e.message);}
}
