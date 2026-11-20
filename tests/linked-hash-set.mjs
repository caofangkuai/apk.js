/**
 * LinkedHashSet 回归。
 *
 * 这个集合之前完全没有 host 实现，于是依赖它的代码（例如 Material 的监听器
 * 列表）会静默退化成裸对象：add 不生效、iterator() 返回 null，最终在遍历处
 * 抛「调用 hasNext 时对象为空」。报错点离真正的缺失很远，极难定位。
 *
 * 要求：保持插入顺序、add 去重、iterator 可用且按顺序遍历。
 */
import assert from 'node:assert/strict';
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';
import { JAVA_CORE_CLASSES } from '../src/framework/java-core.js';

const vm = new JavaVM({});
for (const cls of Object.values(JAVA_CORE_CLASSES)) vm.registry.registerNative(cls);
registerFrameworkNativeClasses(vm);

const set = vm.instantiate('Ljava/util/LinkedHashSet;', []);
assert.ok(set, 'LinkedHashSet 应可实例化');

const add = (v) => vm.invokeByName('add', '(Ljava/lang/Object;)Z', set, [v]);
const size = () => vm.invokeByName('size', '()I', set, []);
const contains = (v) => vm.invokeByName('contains', '(Ljava/lang/Object;)Z', set, [v]);

// 空集合
assert.equal(size(), 0, '初始应为空');
assert.equal(vm.invokeByName('isEmpty', '()Z', set, []), 1, 'isEmpty 应为真');

// 插入顺序 + 去重
add('a');
add('b');
add('a');
assert.equal(size(), 2, '重复元素不应增加大小');
assert.equal(contains('a'), 1);
assert.equal(contains('missing'), 0);

// iterator 必须可用，且按插入顺序遍历
const it = vm.invokeByName('iterator', '()Ljava/util/Iterator;', set, []);
assert.ok(it, 'iterator() 不能返回 null');
const seen = [];
for (let guard = 0; guard < 10; guard += 1) {
  const has = vm.invokeByName('hasNext', '()Z', it, []);
  if (!has) break;
  const value = vm.invokeByName('next', '()Ljava/lang/Object;', it, []);
  seen.push(value?.$value ?? value);
}
assert.deepEqual(seen, ['a', 'b'], `应保持插入顺序遍历，实际 ${JSON.stringify(seen)}`);

// 删除与清空
assert.equal(vm.invokeByName('remove', '(Ljava/lang/Object;)Z', set, ['a']), 1);
assert.equal(size(), 1);
vm.invokeByName('clear', '()V', set, []);
assert.equal(size(), 0);

// Material 的典型用法：先 add，再遍历
const second = vm.instantiate('Ljava/util/LinkedHashSet;', []);
const add2 = (v) => vm.invokeByName('add', '(Ljava/lang/Object;)Z', second, [v]);
add2('p');
add2('q');
add2('p');
assert.equal(vm.invokeByName('size', '()I', second, []), 2, '重复添加不应增长');
const it2 = vm.invokeByName('iterator', '()Ljava/util/Iterator;', second, []);
assert.ok(it2, 'iterator 不能为 null');
assert.equal(vm.invokeByName('hasNext', '()Z', it2, []), 1, 'hasNext 应为真');
assert.ok(vm.invokeByName('next', '()Ljava/lang/Object;', it2, []) !== null, 'next 应返回元素');

console.log('linked hash set OK', { order: seen });
