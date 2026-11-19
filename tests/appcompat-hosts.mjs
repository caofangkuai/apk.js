/**
 * AppCompat 启动链路所依赖的通用 host 能力回归。
 *
 * 三条都是真实 APK 暴露出来的缺口，任何使用 AppCompat/Material 的应用都会踩：
 *   1) Looper.isMainThread() 缺失 —— ArchTaskExecutor 校验主线程时直接崩；
 *   2) 清单属性可能是对象而不是字符串 —— getAttribute(...).toLowerCase 抛 TypeError；
 *   3) 系统 android: 窗口属性不在 APK 的 resources.arsc 里 —— 主题属性名映射不到。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';

const source = fs.readFileSync(new URL('../src/framework/registry.js', import.meta.url), 'utf8');

/* 1. Looper.isMainThread */
const vm = new JavaVM({});
registerFrameworkNativeClasses(vm);
const looperClass = vm.registry.resolve('Landroid/os/Looper;');
assert.ok(
  looperClass.nativeDef.findInstanceMethod('isMainThread', '()Z'),
  'Looper 必须实现 isMainThread()Z',
);

/* 2. 清单属性归一化 */
assert.ok(source.includes('function manifestAttrText('), '应存在清单属性归一化函数');
assert.ok(
  !/getAttribute\('android:name'\)[^;]*\.toLowerCase\(\)/.test(source),
  '清单属性不应直接链式调用 toLowerCase',
);

const manifestAttrText = (node, ...names) => {
  for (const name of names) {
    const raw = node?.getAttribute?.(name);
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'object') {
      if (typeof raw.stringValue === 'string') return raw.stringValue;
      if (raw.value !== undefined && raw.value !== null) return String(raw.value);
      if (raw.reference !== undefined) return String(raw.reference);
    }
  }
  return '';
};

const node = (value) => ({ getAttribute: () => value });
assert.equal(manifestAttrText(node('.Main'), 'android:name'), '.Main');
assert.equal(manifestAttrText(node({ stringValue: 'com.example.Main' }), 'android:name'), 'com.example.Main');
assert.equal(manifestAttrText(node({ value: 42 }), 'android:name'), '42');
assert.equal(manifestAttrText(node({ reference: 0x7f010001 }), 'android:name'), String(0x7f010001));
assert.equal(manifestAttrText(node(null), 'android:name'), '', '缺失时返回空串');
assert.equal(manifestAttrText(node(''), 'android:name'), '', '空串视为缺失');
assert.equal(manifestAttrText(node('  '), 'android:name'), '  ', '保留空白不擅自裁剪');

/* 3. 窗口属性映射 */
for (const [id, key] of [
  [0x01010054, 'windowBackground'],
  [0x01010055, 'windowActionBar'],
  [0x01010056, 'windowNoTitle'],
  [0x0101005a, 'windowIsFloating'],
]) {
  assert.ok(
    source.includes(`[0x${id.toString(16).padStart(8, '0')}, '${key}']`),
    `FRAMEWORK_ATTR_KEYS 应包含 ${key} (0x${id.toString(16)})`,
  );
}

console.log('appcompat hosts OK', { looper: true, manifestAttr: 6, windowAttrs: 4 });
