import { chromium } from 'playwright';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--disable-gpu']});
const page=await browser.newPage({viewport:{width:1000,height:900}});const warns=[];page.on('console',m=>{if(m.type()==='warning')warns.push(m.text());});
await page.goto('http://127.0.0.1:8123/playground.html');await page.setInputFiles('#apk-file','/tmp/devinfo.apk');await page.waitForTimeout(5000);
const counts={};for(const w of warns){const k=w.replace(/^.*未绑定方法，返回默认值[:：]\s*/,'').trim().slice(0,120);counts[k]=(counts[k]||0)+1;}
console.log('WARNCOUNT',warns.length);console.log(Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12));await browser.close();
