process.on('uncaughtException', () => {});
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { loadApkFiles, EmulatorEngine } = await import('./src/framework/engine.js');

const apkPath = process.argv[2] || './samples/hello-dex.apk';
const zip = await JSZip.loadAsync(fs.readFileSync(apkPath));
const apk = await loadApkFiles(zip);
const engine = new EmulatorEngine({ onLog: () => {} });
await engine.start(apk);
const vm = engine.vm;
const stat = (desc, name, params, ret) => vm.invoke(
  { classDesc: desc, name, proto: { descriptor: params.length ? `(${params.join('')})${ret}` : `()${ret}`, parameters: params, returnType: ret } },
  null, [], 'static');
const getProp = (key) => {
  const m = { classDesc: 'Landroid/os/SystemProperties;', name: 'get',
    proto: { descriptor: '(Ljava/lang/String;)Ljava/lang/String;', parameters: ['Ljava/lang/String;'], returnType: 'Ljava/lang/String;' } };
  return vm.invoke(m, null, [key], 'static');
};
console.log('locale   =', JSON.stringify(getProp('ro.product.locale')));
console.log('device   =', JSON.stringify(getProp('ro.product.device')));
console.log('region   =', JSON.stringify(getProp('ro.product.locale.region')));
