/**
 * Class 对象的类型归属回归。
 *
 * java.lang.Class 的实例描述的是"另一个类"，它自身类型永远是 java.lang.Class。
 * 宿主曾把被描述类的 descriptor 直接放在 $descriptor 上，于是：
 *   - classNameOf() 把 Class 对象当成被描述的那个类；
 *   - getName() 之类的方法因此被派发到错误的类型上，解析失败后返回 null。
 * 依赖 Class.getName() 做校验的库（例如 AppCompat 的 vector drawable
 * 自检）会拿到 null，进而抛异常、整段初始化中断。
 */
import assert from 'node:assert/strict';
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';
import { JAVA_CORE_CLASSES } from '../src/framework/java-core.js';

const vm = new JavaVM({});
for (const cls of Object.values(JAVA_CORE_CLASSES)) vm.registry.registerNative(cls);
registerFrameworkNativeClasses(vm);

const target = 'Landroid/graphics/drawable/VectorDrawable;';
const classObject = vm.getClassObject(target);

// 类型归属：它自己是 java.lang.Class
assert.equal(
  vm.registry.classNameOf(classObject),
  'Ljava/lang/Class;',
  'Class 对象的类型应为 java.lang.Class，而不是它描述的那个类',
);

// getName 必须返回被描述类的全名
const name = vm.invokeByName('getName', '()Ljava/lang/String;', classObject, []);
assert.equal(name, 'android.graphics.drawable.VectorDrawable', `getName 应返回被描述类的全名，实际 ${name}`);

// 同一个 descriptor 应复用同一个 Class 对象
assert.equal(vm.getClassObject(target), classObject, '同一个类应复用同一个 Class 对象');

// 不同 descriptor 得到不同对象，互不干扰
const other = vm.getClassObject('Ljava/lang/String;');
assert.notEqual(other, classObject);
assert.equal(vm.invokeByName('getName', '()Ljava/lang/String;', other, []), 'java.lang.String');

// 依赖类名比较的典型用法：AppCompat 的 vector drawable 自检就长这样
assert.equal(
  name === 'android.graphics.drawable.VectorDrawable',
  true,
  '类名比较应能通过（这正是 vector drawable 自检的逻辑）',
);

console.log('class object typing OK', { name });
