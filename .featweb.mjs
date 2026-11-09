import { chromium } from 'playwright';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--disable-gpu']});
const page=await browser.newPage({viewport:{width:1000,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,120));});
await page.goto('http://127.0.0.1:8123/playground.html');await page.setInputFiles('#apk-file','/tmp/devinfo.apk');await page.waitForTimeout(5000);
const box=await page.locator('canvas').first().boundingBox();
const snap=()=>page.evaluate(()=>{const c=document.querySelector('canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let dark=0,hash=2166136261;const col=new Set();for(let i=0;i<d.length;i+=4*53){hash=Math.imul(hash^d[i]^(d[i+1]<<8),16777619)>>>0;if(d[i]+d[i+1]+d[i+2]<360)dark++;col.add((d[i]>>4)<<8|(d[i+1]>>4)<<4|(d[i+2]>>4));}return{dark,hash,colors:col.size};});
const tap=async(x,y,ms=700)=>{await page.mouse.click(box.x+x,box.y+y);await page.waitForTimeout(ms);};
const results=[];
const check=async(name)=>{const s=await snap();results.push({name,...s,ok:s.dark>15&&s.colors>3});return s;};
await check('base');
for(const [name,x] of [['常规',54],['芯片',126],['系统',198],['SCREEN',270],['内存',330]]){await tap(x,80,900);await check('tab-'+name);}
for(const [name,y] of [['相机',320],['电池',368],['温度',416],['传感器',464],['应用程序',512],['分区',560]]){await tap(22,28,500);await tap(144,y,1500);await check('page-'+name);}
for(const [name,y] of [['信息中心',80],['屏幕测试',128],['设置',176],['关于',224]]){await tap(338,28,500);await tap(250,y,1200);await check('menu-'+name);}
console.log(JSON.stringify(results,null,1));console.log('errors',errors.slice(0,3));
await page.screenshot({path:'/tmp/browser-features.png',fullPage:true});await browser.close();
