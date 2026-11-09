import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apkPath = process.argv[2] || process.env.APK_PATH || '/tmp/devinfo.apk';
if (!fs.existsSync(apkPath)) {
  console.log('SKIP: 未找到 APK', apkPath);
  process.exit(0);
}
let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.log('SKIP: 未安装 playwright'); process.exit(0); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.apk': 'application/vnd.android.package-archive', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let target = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (target.endsWith('/')) target += 'index.html';
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const executablePath = process.env.CHROME_PATH || '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: fs.existsSync(executablePath) ? executablePath : undefined, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error.message).slice(0, 160)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 160)); });
await page.goto(`http://127.0.0.1:${server.address().port}/playground.html`);
await page.setInputFiles('#apk-file', apkPath);
await page.waitForTimeout(5000);
const box = await page.locator('canvas').first().boundingBox();
const snapshot = () => page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let dark = 0;
  let hash = 2166136261;
  const colors = new Set();
  for (let i = 0; i < data.length; i += 4 * 53) {
    hash = Math.imul(hash ^ data[i] ^ (data[i + 1] << 8), 16777619) >>> 0;
    if (data[i] + data[i + 1] + data[i + 2] < 360) dark++;
    colors.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
  }
  return { dark, hash, colors: colors.size };
});
const tap = async (x, y, wait = 700) => { await page.mouse.click(box.x + x, box.y + y); await page.waitForTimeout(wait); };
const results = [];
const check = async (name) => { const state = await snapshot(); results.push({ name, ...state }); return state; };
await check('base');
for (const [name, x] of [['常规', 54], ['芯片', 126], ['系统', 198], ['SCREEN', 270], ['内存', 330]]) {
  await tap(x, 80, 900); await check('tab-' + name);
}
for (const [name, y] of [['相机', 320], ['电池', 368], ['温度', 416], ['传感器', 464], ['分区', 560]]) {
  await tap(22, 28, 500); await tap(144, y, 1500); await check('page-' + name);
}
await tap(338, 28, 500); await tap(250, 80, 1200); await check('menu-info');
await page.screenshot({ path: path.join(root, 'image-debug/browser-features.png'), fullPage: true });
await browser.close();
server.close();
const failures = results.filter((item) => !(item.dark > 15 && item.colors > 3));
const hashes = results.map((item) => item.hash);
const unique = new Set(hashes).size;
const ok = failures.length === 0 && unique >= results.length - 3 && errors.length === 0;
console.log(ok ? 'browser features OK' : 'browser features FAILED', { steps: results.length, unique, failures, errors: errors.slice(0, 3) });
if (!ok) console.log(results);
process.exit(ok ? 0 : 1);
