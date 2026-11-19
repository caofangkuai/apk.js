/**
 * getSystemService 的类型正确性回归。
 *
 * 控件在构造期会取系统服务并 checkcast 到具体类型。宿主若返回裸对象，
 * checkcast 会直接抛 IllegalStateException、整个构造中断——实测表现是
 * 控件的内部成员场一直是 null，外层却只看到"没渲染"，极难定位。
 *
 * 这里验证 accessibility 服务返回的对象带正确的 descriptor。
 */
import assert from 'node:assert/strict';
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';
import { contextFacade } from '../src/framework/bridge.js';

const vm = new JavaVM({});
registerFrameworkNativeClasses(vm);
vm.contextObject = contextFacade(vm);

const service = vm.invokeByName(
  'getSystemService',
  '(Ljava/lang/String;)Ljava/lang/Object;',
  vm.contextObject,
  ['accessibility'],
);

assert.ok(service, 'accessibility 服务不能为空');
const descriptor =
  service?.$descriptor ||
  service?.$nativeClass ||
  service?.constructor?.$descriptor ||
  null;
assert.ok(descriptor, 'accessibility 服务必须带 descriptor，否则 checkcast 会失败');
assert.equal(
  descriptor,
  'Landroid/view/accessibility/AccessibilityManager;',
  `descriptor 应为 AccessibilityManager，实际 ${descriptor}`,
);

// 该服务应能被当作 AccessibilityManager 调用
const enabled = vm.invokeByName('isEnabled', '()Z', service, []);
assert.ok(enabled === 0 || enabled === false, 'isEnabled 应返回假值');

console.log('system service typing OK', { descriptor });
