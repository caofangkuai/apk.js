import assert from 'node:assert/strict';
import { HookBus } from '../src/runtime/hooks.js';
import { JavaVM } from '../src/runtime/vm.js';
import { NativeClassDef } from '../src/runtime/class-registry.js';
import { XposedRuntime, XC_MethodHook, parseProtoDescriptor } from '../src/runtime/xposed.js';
import { ApkSimulator } from '../android-framework.js';

/* ---------------- HookBus：生命周期事件总线 ---------------- */
const bus = new HookBus();
let count = 0;
const off = bus.on('ping', (payload) => { count += payload; });
assert.equal(bus.emit('ping', 2), undefined);
assert.equal(count, 2);
assert.equal(off(), true);
assert.equal(bus.emit('ping', 3), undefined);
let onceCount = 0;
bus.once('once', () => { onceCount += 1; });
bus.emit('once');
bus.emit('once');
assert.equal(onceCount, 1);
assert.throws(() => bus.on('', () => {}), TypeError);
assert.equal(bus.emit('missing'), undefined);
const errorBus = new HookBus({ bad: () => { throw new Error('boom'); } });
errorBus.onError = () => {};
assert.equal(errorBus.emit('bad'), undefined);

/* ---------------- proto 解析 ---------------- */
assert.deepEqual(parseProtoDescriptor('(Ljava/lang/String;I[F)Z'), {
  descriptor: '(Ljava/lang/String;I[F)Z',
  parameters: ['Ljava/lang/String;', 'I', '[F'],
  returnType: 'Z',
});

/* ---------------- Xposed 拦截 ---------------- */
function makeVm() {
  const vm = new JavaVM({});
  vm.registry.registerNative(
    new NativeClassDef('Ltest/Box;', {
      ctor: class BoxPeer {
        constructor(vmRef, object) {
          this.vm = vmRef;
          this.object = object;
          this._value = 1;
          // 宿主字段约定：peer 上用 own accessor，vm.getField/setField 才会走 peer
          Object.defineProperty(this, 'value', {
            get: () => this._value,
            set: (next) => { this._value = next; },
            enumerable: true,
            configurable: true,
          });
        }
      },
      methods: {
        '<init>()V': () => {},
        'get()I': (self) => self.value,
        'set(I)V': (self, args) => { self.value = args[0] | 0; },
        'label(Ljava/lang/String;)Ljava/lang/String;': (self, args) => `[${args[0]}]`,
        'label(I)Ljava/lang/String;': (self, args) => `#${args[0]}`,
      },
      staticMethods: {
        'make()Ltest/Box;': (self, args, vmRef) => vmRef.allocateRawObject('Ltest/Box;'),
        'version()I': () => 3,
      },
      instanceFields: { value: 1 },
      staticFields: { COUNT: 5 },
    })
  );
  return vm;
}

const getRef = { classDesc: 'Ltest/Box;', name: 'get', proto: parseProtoDescriptor('()I') };
const setRef = { classDesc: 'Ltest/Box;', name: 'set', proto: parseProtoDescriptor('(I)V') };
const labelRef = {
  classDesc: 'Ltest/Box;',
  name: 'label',
  proto: parseProtoDescriptor('(Ljava/lang/String;)Ljava/lang/String;'),
};
const versionRef = { classDesc: 'Ltest/Box;', name: 'version', proto: parseProtoDescriptor('()I') };

const vm = makeVm();
const box = vm.allocateRawObject('Ltest/Box;');
assert.equal(vm.invoke(getRef, box, []), 1);

const runtime = vm.xposed;
assert.equal(runtime.active, false, '没有 hook 时不应进入拦截路径');

const calls = [];
const before = runtime.bridge.hookAllMethods('test.Box', 'set', {
  beforeHookedMethod(param) {
    calls.push(['before', param.args[0], param.isStatic, param.method.getName()]);
    param.args[0] = 42;
  },
});
assert.equal(before.size, 1);
assert.equal(runtime.active, true);
vm.invoke(setRef, box, [5]);
assert.equal(vm.invoke(getRef, box, []), 42, 'beforeHookedMethod 应能改写参数');
assert.deepEqual(calls, [['before', 5, false, 'set']]);

// after 改写返回值
const afterHook = runtime.bridge.hookAllMethods('test.Box', 'get', {
  afterHookedMethod(param) {
    param.setResult(param.getResult() + 100);
  },
});
assert.equal(vm.invoke(getRef, box, []), 142);
afterHook.unhook();
assert.equal(vm.invoke(getRef, box, []), 42, 'unhook 之后不再拦截');

// before 里 setResult 直接短路原方法
const shortHook = runtime.bridge.hookAllMethods('test.Box', 'get', {
  beforeHookedMethod(param) {
    param.setResult(999);
  },
});
assert.equal(vm.invoke(getRef, box, []), 999);
shortHook.unhook();
assert.equal(vm.invoke(getRef, box, []), 42);

// setThrowable：拦截器抛出异常
const throwHook = runtime.bridge.hookAllMethods('test.Box', 'label', {
  beforeHookedMethod(param) {
    const error = vm.allocateRawObject('Ljava/lang/IllegalStateException;');
    error.$exceptionMessage = 'blocked';
    param.setThrowable(error);
  },
});
assert.throws(() => vm.invoke(labelRef, box, ['x']), (error) => error?.$exceptionMessage === 'blocked');
throwHook.unhook();
assert.equal(vm.invoke(labelRef, box, ['x']), '[x]');

// findAndHookMethod 按参数类型精确匹配重载
const exactHook = runtime.helpers.findAndHookMethod('test.Box', null, 'label', 'int', {
  afterHookedMethod(param) {
    param.setResult('hooked');
  },
});
assert.equal(
  vm.invoke({ classDesc: 'Ltest/Box;', name: 'label', proto: parseProtoDescriptor('(I)Ljava/lang/String;') }, box, [4]),
  'hooked',
  '精确匹配的重载应被拦截'
);
assert.equal(vm.invoke(labelRef, box, ['x']), '[x]', '未匹配的重载不受影响');
exactHook.unhook();

// 静态方法拦截拿到 isStatic=true 且 thisObject 为 null
let staticParam = null;
const staticHook = runtime.bridge.hookAllMethods('test.Box', 'version', (param) => {
  staticParam = { isStatic: param.isStatic, thisObject: param.thisObject };
  param.setResult(30);
});
assert.equal(vm.invoke(versionRef, null, [], 'static'), 30);
assert.deepEqual(staticParam, { isStatic: true, thisObject: null });
staticHook.unhook();

// 字段读写 helper
const helpers = runtime.helpers;
assert.equal(helpers.getIntField(box, 'value'), 42);
helpers.setIntField(box, 'value', 7);
assert.equal(vm.invoke(getRef, box, []), 7);
assert.equal(helpers.getStaticObjectField('test.Box', 'COUNT'), 5);
helpers.setStaticObjectField('test.Box', 'COUNT', 9);
assert.equal(helpers.getStaticObjectField('test.Box', 'COUNT'), 9);

// callMethod / callStaticMethod / newInstance
assert.equal(helpers.callMethod(box, 'get'), 7);
assert.equal(helpers.callStaticMethod('test.Box', 'version'), 3);
const fresh = helpers.newInstance('test.Box');
assert.ok(fresh);

// 类信息对象
const boxClass = helpers.findClass('test.Box');
assert.equal(boxClass.getName(), 'test.Box');
assert.equal(boxClass.getDescriptor(), 'Ltest/Box;');

// 构造方法拦截
let ctorSeen = 0;
const ctorHook = runtime.bridge.hookAllConstructors('test.Box', {
  afterHookedMethod() {
    ctorSeen += 1;
  },
});
helpers.newInstance('test.Box');
assert.equal(ctorSeen, 1);
ctorHook.unhook();

// XC_MethodHook 子类写法
class Doubler extends XC_MethodHook {
  afterHookedMethod(param) {
    param.setResult(param.getResult() * 2);
  }
}
const subclassHook = runtime.bridge.hookAllMethods('test.Box', 'get', new Doubler());
assert.equal(vm.invoke(getRef, box, []), 14);
subclassHook.unhook();

// 多个 hook 顺序叠加
const order = [];
const h1 = runtime.bridge.hookAllMethods('test.Box', 'get', { beforeHookedMethod: () => order.push('b1') });
const h2 = runtime.bridge.hookAllMethods('test.Box', 'get', { afterHookedMethod: () => order.push('a2') });
assert.equal(vm.invoke(getRef, box, []), 7);
assert.deepEqual(order, ['b1', 'a2']);
h1.unhook();
h2.unhook();

// 解绑后注册表干净
runtime.clear();
assert.equal(runtime.active, false);
assert.equal(vm.invoke(getRef, box, []), 7);

/* ---------------- 延迟注册（VM 创建前） ---------------- */
const deferredRuntime = new XposedRuntime(null);
const deferredHook = deferredRuntime.helpers.findAndHookMethod('test.Box', null, 'get', {
  afterHookedMethod(param) {
    param.setResult(param.getResult() + 1);
  },
});
assert.equal(deferredHook.deferred, true);
assert.equal(deferredRuntime.pending.length, 1);
const vm2 = makeVm();
deferredRuntime.attach(vm2);
assert.equal(deferredRuntime.pending.length, 0);
const box2 = vm2.allocateRawObject('Ltest/Box;');
assert.equal(vm2.invoke(getRef, box2, []), 2, '延迟注册的 hook 应在 attach 后生效');
deferredHook.unhook();
assert.equal(vm2.invoke(getRef, box2, []), 1);

/* ---------------- 原生静态字段：`名字:类型` 键 ---------------- */
const vm3 = makeVm();
vm3.registry.registerNative(
  new NativeClassDef('Ltest/Flag;', {
    staticFields: { 'VISIBLE:I': 0, 'TAG:Ljava/lang/String;': 'default' },
  })
);
const helpers3 = vm3.xposed.helpers;
assert.equal(helpers3.getStaticObjectField('test.Flag', 'VISIBLE'), 0, '带类型的键应能读到初始值');
helpers3.setStaticObjectField('test.Flag', 'VISIBLE', 4);
assert.equal(helpers3.getStaticObjectField('test.Flag', 'VISIBLE'), 4, '写入后应能读回');
assert.equal(helpers3.getStaticObjectField('test.Flag', 'TAG'), 'default');

/* ---------------- 重载选择 ---------------- */
const vm4 = makeVm();
const box4 = vm4.allocateRawObject('Ltest/Box;');
const helpers4 = vm4.xposed.helpers;
assert.equal(helpers4.callMethod(box4, 'label', 'a'), '[a]', '字符串重载');
assert.equal(helpers4.callMethod(box4, 'label', 7), '#7', '整数重载');
assert.throws(() => helpers4.callMethod(box4, 'label', null, null), /找不到匹配的重载/);

/* ---------------- clear() 与延迟注册 ---------------- */
const vm5 = makeVm();
const runtime5 = vm5.xposed;
runtime5.bridge.hookAllMethods('test.Box', 'get', { afterHookedMethod(p) { p.setResult(0); } });
assert.equal(runtime5.active, true);
runtime5.clear();
assert.equal(runtime5.active, false);
assert.equal(vm5.invoke(getRef, vm5.allocateRawObject('Ltest/Box;'), []), 1, 'clear 之后不再拦截');

const queuedRuntime = new XposedRuntime(null);
queuedRuntime.bridge.hookAllMethods('test.Box', 'get', { afterHookedMethod(p) { p.setResult(0); } });
assert.equal(queuedRuntime.pending.length, 1);
queuedRuntime.clear();
assert.equal(queuedRuntime.pending.length, 0, 'clear 应丢弃排队中的注册');

/* ---------------- 模拟器门面 ---------------- */
const simulator = new ApkSimulator({});
let hookCalls = 0;
const dispose = simulator.on('start:before', () => { hookCalls += 1; });
assert.equal(simulator.hooks.has('start:before'), true);
simulator.hooks.emit('start:before', {});
assert.equal(hookCalls, 1);
dispose();
assert.equal(simulator.hooks.has('start:before'), false);
assert.ok(simulator.xposed instanceof XposedRuntime, '模拟器应暴露 Xposed 运行时');
assert.equal(typeof simulator.xposed.bridge.hookAllMethods, 'function');
assert.equal(typeof simulator.xposed.helpers.getObjectField, 'function');
assert.throws(() => simulator.xposed.helpers.findClass('no.such.Class'), /找不到类/);

console.log('hooks OK', { events: true, xposed: true, deferred: true, publicApi: true, staticHook: true });
