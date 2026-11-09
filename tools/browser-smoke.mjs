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
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('SKIP: 未安装 playwright');
  process.exit(0);
}
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.apk': 'application/vnd.android.package-archive', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.json': 'application/json',
};
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
const port = server.address().port;
const executablePath = process.env.CHROME_PATH
  || '/root/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await chromium.launch({ executablePath: fs.existsSync(executablePath) ? executablePath : undefined, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error.message).slice(0, 160)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 160)); });
await page.goto(`http://127.0.0.1:${port}/playground.html`);
await page.setInputFiles('#apk-file', apkPath);
await page.waitForTimeout(6000);
const stats = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = new Set();
  let dark = 0;
  for (let i = 0; i < data.length; i += 4 * 97) {
    colors.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
    if (data[i] + data[i + 1] + data[i + 2] < 360) dark++;
  }
  return { width: canvas.width, height: canvas.height, colors: colors.size, dark };
});
fs.mkdirSync(path.join(root, 'image-debug'), { recursive: true });
await page.screenshot({ path: path.join(root, 'image-debug/browser-smoke.png'), fullPage: true });
await browser.close();
server.close();
const ok = stats && stats.dark > 20 && stats.colors > 3 && errors.length === 0;
console.log(ok ? 'browser smoke OK' : 'browser smoke FAILED', stats, errors.slice(0, 5));
process.exit(ok ? 0 : 1);
