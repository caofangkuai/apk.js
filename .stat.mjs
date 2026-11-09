import { chromium } from 'playwright';
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell',args:['--no-sandbox','--disable-gpu']});
const page=await browser.newPage({viewport:{width:1000,height:900}});
await page.goto('http://127.0.0.1:8123/playground.html');await page.setInputFiles('#apk-file','/tmp/devinfo.apk');await page.waitForTimeout(5000);
const text=await page.locator('body').innerText();console.log('STATUS',text.match(/已停止|运行中/g),text.includes('Activity 已结束'));
await browser.close();
