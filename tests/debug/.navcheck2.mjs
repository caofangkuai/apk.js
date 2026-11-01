process.on('uncaughtException', () => {});
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'MacIntel', language: 'zh-CN', hardwareConcurrency: 12, deviceMemory: 16, maxTouchPoints: 5 },
  configurable: true, writable: true,
});
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { loadApkFiles, EmulatorEngine } = await import('./src/framework/engine.js');
const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[2] || './samples/hello-dex.apk'));
const apk = await loadApkFiles(zip);
const engine = new EmulatorEngine({ onLog: () => {} });
await engine.start(apk);
const vm = engine.vm;
const getProp = (key) => vm.invoke({ classDesc: 'Landroid/os/SystemProperties;', name: 'get',
  proto: { descriptor: '(Ljava/lang/String;)Ljava/lang/String;', parameters: ['Ljava/lang/String;'], returnType: 'Ljava/lang/String;' } },
  null, [key], 'static');
console.log('locale   =', JSON.stringify(getProp('ro.product.locale')));
console.log('device   =', JSON.stringify(getProp('ro.product.device')));
console.log('region   =', JSON.stringify(getProp('ro.product.locale.region')));
const rt = vm.invoke({ classDesc: 'Ljava/lang/Runtime;', name: 'getRuntime',
  proto: { descriptor: '()Ljava/lang/Runtime;', parameters: [], returnType: 'Ljava/lang/Runtime;' } }, null, [], 'static');
const cores = vm.invoke({ classDesc: 'Ljava/lang/Runtime;', name: 'availableProcessors',
  proto: { descriptor: '()I', parameters: [], returnType: 'I' } }, rt, [], 'virtual');
console.log('cores    =', cores);
