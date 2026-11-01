process.on('uncaughtException', () => {});
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { loadApkFiles, EmulatorEngine } = await import('./src/framework/engine.js');
const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[2] || '/tmp/devinfo.apk'));
const apk = await loadApkFiles(zip);
const engine = new EmulatorEngine({ onLog: () => {} });
await engine.start(apk);
const vm = engine.vm;
const targets = [
  'Landroidx/drawerlayout/widget/DrawerLayout;',
  'Landroidx/recyclerview/widget/RecyclerView;',
  'Landroidx/coordinatorlayout/widget/CoordinatorLayout;',
  'Lcom/google/android/material/appbar/AppBarLayout;',
  'Landroidx/viewpager/widget/ViewPager;',
];
for (const t of targets) {
  const rc = vm.registry.resolve(t);
  const out = [];
  if (rc?.dexClass?.methodsByName) {
    for (const [k, m] of rc.dexClass.methodsByName) {
      if (k.startsWith('generateLayoutParams(')) out.push(k + ' -> ' + m?.proto?.returnType);
    }
  }
  console.log(t, '| own:', out.join(', ') || 'NONE', '| super:', rc?.superDescriptor);
}
