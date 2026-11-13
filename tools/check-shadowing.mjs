/**
 * 扫描「实例属性遮蔽同名原型方法」的缺陷。
 *
 * 起因：View 构造函数里 `this.isLayoutRequested = false` 遮蔽了同名方法，
 * 导致 isLayoutRequested() 永远不可调用，而 AOSP 里它是真方法。
 * 这类命名冲突在 JS 里不会报错，只会静悄悄地让方法失效，所以单独检查。
 *
 * 用法：node tools/check-shadowing.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 需要检查的模块（导出类的地方）。 */
const TARGETS = [
  'src/framework/view.js',
  'src/framework/widgets.js',
  'src/framework/layouts.js',
  'src/framework/drawables.js',
  'src/framework/window.js',
  'src/framework/graphics.js',
  'src/framework/java-core.js',
  'src/framework/resources.js',
  'src/framework/os.js',
  'src/framework/opengl.js',
  'src/framework/sensors.js',
  'src/runtime/xposed.js',
  'src/runtime/hooks.js',
  'src/runtime/values.js',
  'src/runtime/class-registry.js',
];

const problems = [];
let checkedClasses = 0;
let checkedInstances = 0;

for (const relative of TARGETS) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) continue;
  let mod;
  try {
    mod = await import(pathToFileURL(absolute).href);
  } catch (error) {
    console.warn(`跳过 ${relative}: 无法导入（${error.message}）`);
    continue;
  }
  for (const [exportName, value] of Object.entries(mod)) {
    if (typeof value !== 'function' || !value.prototype) continue;
    const methods = new Set(
      Object.getOwnPropertyNames(value.prototype).filter((name) => {
        if (name === 'constructor') return false;
        const descriptor = Object.getOwnPropertyDescriptor(value.prototype, name);
        return !!descriptor && typeof descriptor.value === 'function';
      })
    );
    if (!methods.size) continue;
    checkedClasses += 1;

    // 用 null 尝试实例化；构造函数依赖真实 vm/context 的类会抛错，跳过即可。
    let instance;
    try {
      instance = new value(null);
    } catch {
      continue;
    }
    if (!instance || typeof instance !== 'object') continue;
    checkedInstances += 1;

    for (const ownName of Object.getOwnPropertyNames(instance)) {
      if (!methods.has(ownName)) continue;
      problems.push({ module: relative, className: exportName, member: ownName });
    }
  }
}

if (problems.length) {
  console.error(`发现 ${problems.length} 处实例属性遮蔽同名方法：`);
  for (const item of problems) {
    console.error(`  ${item.module}  ${item.className}.${item.member}`);
  }
  console.error('实例属性会覆盖原型方法，调用方拿到的是值而不是函数；请改用 $ 前缀或其它字段名。');
  process.exit(1);
}

console.log('member shadowing OK', { classes: checkedClasses, instances: checkedInstances });
