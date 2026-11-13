/**
 * Xposed 风格的方法拦截层。
 *
 * 用法与 Xposed API 保持一致：
 *
 *   const { XposedBridge, XposedHelpers } = sim.xposed;
 *   XposedBridge.hookAllMethods('android.widget.TextView', 'setText', {
 *     beforeHookedMethod(param) { param.args[0] = '被改写了'; },
 *   });
 *   XposedHelpers.findAndHookMethod('java.lang.String', null, 'trim', {
 *     afterHookedMethod(param) { param.setResult(param.getResult() + '!'); },
 *   });
 *
 * 拦截点挂在 JavaVM 的「方法解析完成之后、真正执行之前」，
 * 因此 dex 方法、native host 方法、构造方法（`<init>`）都可以拦。
 */
import { isObjectType } from './values.js';
import { descriptorToName, nameToDescriptor } from '../dex/dexfile.js';

/** 解析 `(Ljava/lang/String;I)V` 形式的 proto 描述符。 */
export function parseProtoDescriptor(descriptor) {
  const text = String(descriptor || '()V');
  const open = text.indexOf('(');
  const close = text.indexOf(')');
  if (open !== 0 || close < 0) return { descriptor: text, parameters: [], returnType: 'V' };
  const parameters = [];
  let cursor = open + 1;
  while (cursor < close) {
    const start = cursor;
    while (text[cursor] === '[') cursor++;
    if (text[cursor] === 'L') {
      const semi = text.indexOf(';', cursor);
      if (semi < 0 || semi >= close) throw new Error(`非法的类型描述符: ${text}`);
      cursor = semi + 1;
    } else {
      cursor++;
    }
    parameters.push(text.slice(start, cursor));
  }
  return { descriptor: text, parameters, returnType: text.slice(close + 1) || 'V' };
}

/** `java.lang.String` / `int` / `Ljava/lang/String;` → 描述符。 */
export function typeToDescriptor(type) {
  if (type === null || type === undefined) throw new Error('缺少类型参数');
  if (typeof type === 'object' && typeof type.descriptor === 'string') return type.descriptor;
  const text = String(type).trim();
  if (!text) throw new Error('缺少类型参数');
  const primitive = {
    void: 'V',
    boolean: 'Z',
    byte: 'B',
    short: 'S',
    char: 'C',
    int: 'I',
    long: 'J',
    float: 'F',
    double: 'D',
  };
  if (text in primitive) return primitive[text];
  if (text.startsWith('[') || (text.startsWith('L') && text.endsWith(';'))) return text;
  return nameToDescriptor(text);
}

/** 类信息对象：不依赖 java.lang.Class 的宿主实现，直接提供类名与描述符。 */
export class XposedClassInfo {
  constructor(descriptor) {
    this.descriptor = descriptor;
    this.name = descriptorToName(descriptor);
  }

  getName() {
    return this.name;
  }

  getDescriptor() {
    return this.descriptor;
  }

  toString() {
    return `class ${this.name}`;
  }
}

/** 方法信息对象：对应 Xposed 里的 `Method`，供 `param.method` 使用。 */
export class XposedMethodInfo {
  constructor({ descriptor, name, proto, isStatic = false }) {
    this.classDescriptor = descriptor;
    this.name = name;
    this.proto = proto;
    this.isStatic = isStatic;
  }

  get declaringDescriptor() {
    return this.classDescriptor;
  }

  getName() {
    return this.name;
  }

  getDescriptor() {
    return this.proto.descriptor;
  }

  isStaticMethod() {
    return this.isStatic;
  }

  isConstructor() {
    return this.name === '<init>';
  }

  getDeclaringClass() {
    return new XposedClassInfo(this.classDescriptor);
  }

  getParameterTypes() {
    return this.proto.parameters.map((item) => new XposedClassInfo(item));
  }

  getReturnType() {
    return new XposedClassInfo(this.proto.returnType);
  }

  toString() {
    return `${descriptorToName(this.classDescriptor)}.${this.name}${this.proto.descriptor}`;
  }
}

/**
 * 传给 before/after 回调的参数对象，对应 Xposed 的 `XC_MethodHook.MethodHookParam`。
 */
export class MethodHookParam {
  constructor({ method, thisObject = null, args = [], isStatic = false }) {
    this.method = method;
    this.thisObject = thisObject;
    this.args = args;
    this.isStatic = isStatic;
    this._result = undefined;
    this._resultSet = false;
    this._throwable = null;
  }

  setResult(value) {
    this._result = value;
    this._resultSet = true;
    this._throwable = null;
  }

  getResult() {
    return this._result;
  }

  get hasResult() {
    return this._resultSet;
  }

  setThrowable(throwable) {
    this._throwable = throwable === undefined ? null : throwable;
    if (this._throwable) this._resultSet = false;
  }

  getThrowable() {
    return this._throwable;
  }

  hasThrowable() {
    return this._throwable !== null && this._throwable !== undefined;
  }

  getObjectExtra(key) {
    return this._extras ? this._extras.get(key) : undefined;
  }

  setObjectExtra(key, value) {
    if (!this._extras) this._extras = new Map();
    this._extras.set(key, value);
  }
}

/**
 * 对应 Xposed 的 `XC_MethodHook`。可以直接 `new XC_MethodHook({ beforeHookedMethod, afterHookedMethod })`，
 * 也可以继承后覆写两个方法。
 */
export class XC_MethodHook {
  constructor(callbacks = {}) {
    const before = callbacks?.beforeHookedMethod;
    const after = callbacks?.afterHookedMethod;
    if (typeof before === 'function') this.beforeHookedMethod = before;
    if (typeof after === 'function') this.afterHookedMethod = after;
  }

  beforeHookedMethod() {}

  afterHookedMethod() {}

  /** 把任意回调形式（对象 / 函数 / XC_MethodHook）统一成 XC_MethodHook。 */
  static normalize(callback, label = 'hook') {
    if (callback instanceof XC_MethodHook) return callback;
    if (typeof callback === 'function') return new XC_MethodHook({ beforeHookedMethod: callback });
    if (callback && typeof callback === 'object') {
      if (typeof callback.beforeHookedMethod === 'function' || typeof callback.afterHookedMethod === 'function') {
        return new XC_MethodHook(callback);
      }
    }
    throw new TypeError(`${label} 需要 XC_MethodHook 实例、{ beforeHookedMethod, afterHookedMethod } 或函数`);
  }
}

/** 解绑句柄，对应 Xposed 的 `XC_MethodHook.Unhook`。 */
export class Unhook {
  constructor(registry, key, hook) {
    this.registry = registry;
    this.key = key;
    this.hook = hook;
    this.unhooked = false;
  }

  unhook() {
    if (this.unhooked) return;
    this.unhooked = true;
    this.registry.remove(this.key, this.hook);
  }
}

XC_MethodHook.Unhook = Unhook;

/** `hookAllMethods` 返回的集合，行为接近 Xposed 的 `Set<Unhook>`。 */
export class UnhookSet {
  constructor(items = []) {
    this.items = items;
  }

  get size() {
    return this.items.length;
  }

  add(item) {
    this.items.push(item);
    return this;
  }

  forEach(fn) {
    this.items.forEach(fn);
  }

  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }

  /** 一次性解绑全部。 */
  unhook() {
    for (const item of this.items) item.unhook();
    this.items = [];
    return this;
  }
}

function methodKey(descriptor, name, protoDescriptor) {
  return `${descriptor}.${name}${protoDescriptor}`;
}

/**
 * 每个 VM 一份的拦截注册表。没有注册任何 hook 时 `active` 为 false，
 * 解释器主循环不会产生额外键拼接开销。
 */
export class XposedRuntime {
  constructor(vm = null) {
    this.vm = vm;
    this.entries = new Map();
    this.count = 0;
    this.pending = [];
    this.bridge = new XposedBridge(this);
    this.helpers = new XposedHelpers(this);
  }

  /**
   * 绑定（或重新绑定）到某个 VM，并把排队中的 hook 展开。
   * 模拟器在 VM 创建前就可以注册拦截。
   * 同时让 VM 采用本注册表（`vm.xposed`），否则 VM 查询的是它自建的那份。
   */
  attach(vm) {
    this.bind(vm);
    if (!this.pending.length) return this;
    const tasks = this.pending;
    this.pending = [];
    for (const task of tasks) {
      if (task.cancelled) continue;
      try {
        task.handles = task.run(this.bridge);
      } catch (error) {
        // 目标类可能要到宿主类注册、甚至加载更多 dex 之后才存在；保留任务等下一次 attach 重试。
        task.attempts = (task.attempts || 0) + 1;
        if (task.attempts < 4) {
          this.pending.push(task);
          continue;
        }
        vm?.log?.('error', 'xposed', '延迟注册 hook 失败: ' + (error?.message || error));
      }
    }
    return this;
  }

  /** 只绑定 VM，不展开排队中的注册。VM 构造时用，避免宿主类尚未注册就回放。 */
  bind(vm) {
    this.vm = vm;
    if (vm && vm.xposed !== this) vm.xposed = this;
    return this;
  }

  /** VM 还不存在时先记下注册动作，等 attach 时执行。 */
  defer(run) {
    const record = { run, handles: null, cancelled: false };
    this.pending.push(record);
    const runtime = this;
    return {
      deferred: true,
      get size() {
        return record.handles?.size ?? 1;
      },
      unhook() {
        record.cancelled = true;
        const index = runtime.pending.indexOf(record);
        if (index >= 0) runtime.pending.splice(index, 1);
        record.handles?.unhook();
      },
      [Symbol.iterator]() {
        return (record.handles ? [...record.handles] : [])[Symbol.iterator]();
      },
    };
  }

  get active() {
    return this.count > 0;
  }

  add(descriptor, name, protoDescriptor, callback, label = 'hook') {
    const hook = XC_MethodHook.normalize(callback, label);
    const key = methodKey(descriptor, name, protoDescriptor);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { key, descriptor, name, protoDescriptor, hooks: [] };
      this.entries.set(key, entry);
    }
    entry.hooks.push(hook);
    this.count += 1;
    return new Unhook(this, key, hook);
  }

  remove(key, hook) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    const index = entry.hooks.indexOf(hook);
    if (index < 0) return false;
    entry.hooks.splice(index, 1);
    this.count -= 1;
    if (!entry.hooks.length) this.entries.delete(key);
    return true;
  }

  /** 清空全部拦截，包括还排在队列里、尚未绑定 VM 的注册。 */
  clear() {
    this.entries.clear();
    this.count = 0;
    for (const task of this.pending) task.cancelled = true;
    this.pending = [];
  }

  /** 按已解析的方法查找拦截项（native 方法额外尝试通配注册 `(*)`）。 */
  lookup(resolution, ref) {
    if (!this.count) return null;
    const keys = resolutionKeys(resolution, ref);
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (entry) return entry;
    }
    return null;
  }

  /**
   * 执行 before → 原方法 → after。before 里 setResult/setThrowable 会跳过原方法。
   */
  run(entry, param, callOriginal) {
    for (const hook of entry.hooks.slice()) {
      this.callHook(hook, 'beforeHookedMethod', param);
    }
    if (!param.hasThrowable() && !param.hasResult) {
      try {
        param.setResult(callOriginal(param.args));
      } catch (error) {
        param.setThrowable(error);
      }
    }
    for (const hook of entry.hooks.slice()) {
      this.callHook(hook, 'afterHookedMethod', param);
    }
    if (param.hasThrowable()) throw param.getThrowable();
    return param.getResult();
  }

  callHook(hook, phase, param) {
    const fn = hook[phase];
    if (typeof fn !== 'function') return;
    try {
      fn.call(hook, param);
    } catch (error) {
      // 回调自身抛错不应打断应用执行，但要让调用方看得见。
      this.vm?.log?.('error', 'xposed', `${phase} 回调异常: ${error?.message || error}`);
    }
  }

  /** 已经解析好的方法 → 拦截键。 */
  static keyOf(descriptor, name, protoDescriptor) {
    return methodKey(descriptor, name, protoDescriptor);
  }
}

/**
 * 已解析方法 → 候选拦截键。
 * native 方法的解析结果只是函数本身，没有名字/签名，所以用调用点 ref 还原；
 * 通配注册（`(*)`）作为兜底键。
 */
function resolutionKeys(resolution, ref) {
  if (!resolution) return [];
  if (resolution.kind === 'dex') {
    const method = resolution.method;
    if (!method || !method.proto) return [];
    return [methodKey(method.classDesc, method.name, method.proto.descriptor)];
  }
  const def = resolution.def;
  if (!def || !ref) return [];
  const name = ref.name;
  const proto = ref.proto?.descriptor || '()V';
  return [methodKey(def.descriptor, name, proto), methodKey(def.descriptor, name, '(*)')];
}

/** 对应 Xposed 的 `XposedBridge`。 */
export class XposedBridge {
  constructor(runtime) {
    this.runtime = runtime;
  }

  get vm() {
    return this.runtime.vm;
  }

  /** 拦截某个类的同名全部重载。 */
  hookAllMethods(className, methodName, callback) {
    if (!this.runtime.vm) {
      return this.runtime.defer((bridge) => bridge.hookAllMethods(className, methodName, callback));
    }
    const descriptor = resolveClassDescriptor(this.vm, className);
    const methods = listDeclaredMethods(this.vm, descriptor, methodName);
    if (!methods.length) {
      throw new Error(`类 ${descriptorToName(descriptor)} 中不存在方法 ${methodName}`);
    }
    const set = new UnhookSet();
    for (const method of methods) {
      set.add(this.runtime.add(descriptor, method.name, method.proto.descriptor, callback, `hookAllMethods(${methodName})`));
    }
    return set;
  }

  /** 拦截全部构造方法。 */
  hookAllConstructors(className, callback) {
    try {
      return this.hookAllMethods(className, '<init>', callback);
    } catch (error) {
      // 纯宿主类（只有 native ctor）没有可拦截的 <init>，给出明确提示。
      const rc = this.runtime.vm ? this.runtime.vm.registry.resolve(resolveClassDescriptor(this.runtime.vm, className)) : null;
      if (rc?.nativeDef && !rc?.dexClass && !(rc.nativeDef.methods?.has('<init>()V'))) {
        throw new Error(`${descriptorToName(rc.descriptor)} 是宿主类，对象在原生 ctor 里构造，没有可拦截的 <init>；请拦截它的其他方法`);
      }
      throw error;
    }
  }

  /** 按方法对象（XposedMethodInfo / 解析结果）拦截。 */
  hookMethod(member, callback) {
    if (!member) throw new Error('hookMethod 需要方法对象');
    if (member.kind === 'dex' && member.method) {
      const method = member.method;
      return this.runtime.add(method.classDesc, method.name, method.proto.descriptor, callback, 'hookMethod');
    }
    if (member.classDescriptor && member.proto) {
      return this.runtime.add(member.classDescriptor, member.name, member.proto.descriptor, callback, 'hookMethod');
    }
    throw new Error('hookMethod 需要方法对象（可用 hookAllMethods 选择）');
  }

  log(text) {
    this.vm?.log?.('info', 'xposed', String(text));
  }

  getXposedVersion() {
    return 90;
  }
}

/** 对应 Xposed 的 `XposedHelpers`。 */
export class XposedHelpers {
  constructor(runtime) {
    this.runtime = runtime;
  }

  get vm() {
    return this.runtime.vm;
  }

  findClass(className) {
    const descriptor = resolveClassDescriptor(this.vm, className);
    return new XposedClassInfo(descriptor);
  }

  findMethodExact(className, methodName, ...parameterTypes) {
    const descriptor = resolveClassDescriptor(this.vm, className);
    const wanted = parameterTypes.map((item) => typeToDescriptor(item));
    for (const method of listDeclaredMethods(this.vm, descriptor, methodName)) {
      const params = method.proto.parameters;
      if (params.length !== wanted.length) continue;
      if (params.every((item, index) => item === wanted[index])) {
        return new XposedMethodInfo({
          descriptor,
          name: method.name,
          proto: method.proto,
          isStatic: method.isStatic,
        });
      }
    }
    throw new Error(`找不到方法 ${descriptorToName(descriptor)}.${methodName}(${wanted.join('')})`);
  }

  /**
   * `findAndHookMethod(className, classLoader, methodName, ...参数类型, callback)`，
   * classLoader 在当前模拟器里可以传 null。
   */
  findAndHookMethod(className, classLoader, methodName, ...rest) {
    if (!rest.length) throw new Error('findAndHookMethod 缺少回调');
    if (!this.runtime.vm) {
      return this.runtime.defer((bridge) => bridge.runtime.helpers.findAndHookMethod(className, classLoader, methodName, ...rest));
    }
    const callback = rest.pop();
    const method = this.findMethodExact(className, methodName, ...rest);
    return this.runtime.add(method.classDescriptor, method.name, method.proto.descriptor, callback, 'findAndHookMethod');
  }

  hookAllMethods(className, methodName, callback) {
    return this.runtime.bridge.hookAllMethods(className, methodName, callback);
  }

  getObjectField(object, fieldName) {
    return this.vm.getField(object, this.fieldOf(object, fieldName));
  }

  getIntField(object, fieldName) {
    return Number(this.getObjectField(object, fieldName));
  }

  getLongField(object, fieldName) {
    const value = this.getObjectField(object, fieldName);
    return typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value) || 0));
  }

  getBooleanField(object, fieldName) {
    const value = this.getObjectField(object, fieldName);
    if (typeof value === 'boolean') return value;
    return Number(value) !== 0;
  }

  getFloatField(object, fieldName) {
    return Number(this.getObjectField(object, fieldName));
  }

  getDoubleField(object, fieldName) {
    return Number(this.getObjectField(object, fieldName));
  }

  setObjectField(object, fieldName, value) {
    this.vm.setField(object, this.fieldOf(object, fieldName), value);
  }

  setIntField(object, fieldName, value) {
    this.vm.setField(object, this.fieldOf(object, fieldName, 'I'), value | 0);
  }

  setLongField(object, fieldName, value) {
    const field = this.fieldOf(object, fieldName, 'J');
    this.vm.setField(object, field, typeof value === 'bigint' ? value : BigInt(Math.trunc(Number(value) || 0)));
  }

  setBooleanField(object, fieldName, value) {
    this.vm.setField(object, this.fieldOf(object, fieldName, 'Z'), value ? 1 : 0);
  }

  setFloatField(object, fieldName, value) {
    this.vm.setField(object, this.fieldOf(object, fieldName, 'F'), floatBits(Number(value)));
  }

  setDoubleField(object, fieldName, value) {
    this.vm.setField(object, this.fieldOf(object, fieldName, 'D'), doubleBits(Number(value)));
  }

  getStaticObjectField(className, fieldName) {
    const descriptor = resolveClassDescriptor(this.vm, className);
    return this.vm.getStaticField(fieldDescriptorOf(this.vm, descriptor, fieldName, null, true));
  }

  setStaticObjectField(className, fieldName, value) {
    const descriptor = resolveClassDescriptor(this.vm, className);
    this.vm.setStaticField(fieldDescriptorOf(this.vm, descriptor, fieldName, null, true), value);
  }

  /** 直接调用实例方法，参数按运行时值匹配重载。 */
  callMethod(object, methodName, ...args) {
    return this.call(object, null, methodName, args, 'virtual');
  }

  callStaticMethod(className, methodName, ...args) {
    return this.call(null, resolveClassDescriptor(this.vm, className), methodName, args, 'static');
  }

  newInstance(className, ...args) {
    const descriptor = resolveClassDescriptor(this.vm, className);
    return this.vm.instantiate(descriptor, args);
  }

  call(receiver, descriptorOverride, methodName, args, mode) {
    const descriptor =
      descriptorOverride ||
      (receiver ? this.vm.registry.classNameOf(receiver) : null);
    if (!descriptor) throw new Error(`无法确定 ${methodName} 的接收者类型`);
    const name = String(methodName);
    const candidates = [];
    let cursor = descriptor;
    const visited = new Set();
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      for (const method of listDeclaredMethods(this.vm, cursor, name)) candidates.push(method);
      const rc = this.vm.registry.resolve(cursor);
      cursor = rc?.superDescriptor || null;
    }
    const chosen = pickOverload(candidates, args);
    if (!chosen) {
      throw new Error(`找不到匹配的重载 ${descriptorToName(descriptor)}.${name}(${args.map(typeNameOf).join(', ')})`);
    }
    return this.vm.invoke(
      { classDesc: descriptor, name, proto: chosen.proto },
      mode === 'static' ? null : receiver,
      args,
      mode
    );
  }

  fieldOf(object, fieldName, forcedType) {
    if (!object) throw new Error(`读取字段 ${fieldName} 时对象为空`);
    const descriptor = this.vm.registry.classNameOf(object) || object.$dexClass?.descriptor;
    return fieldDescriptorOf(this.vm, descriptor, fieldName, forcedType, false);
  }
}

function floatBits(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return view.getInt32(0);
}

function doubleBits(value) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return view.getBigInt64(0);
}

function typeNameOf(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  if (typeof value === 'bigint') return 'long';
  if (typeof value === 'boolean') return 'boolean';
  if (value?.$descriptor) return descriptorToName(value.$descriptor);
  return typeof value;
}

/**
 * 按运行时值给重载打分。字符串可以直接喂给 `Ljava/lang/String;` / `Ljava/lang/CharSequence;`
 * 这类参数，避免调用方每次手工包一层 Java 字符串对象。
 */
function pickOverload(candidates, args) {
  let best = null;
  for (const candidate of candidates) {
    const params = candidate.proto.parameters;
    if (params.length !== args.length) continue;
    let score = 0;
    let ok = true;
    for (let i = 0; i < params.length; i++) {
      const match = matchArgument(params[i], args[i]);
      if (!match) {
        ok = false;
        break;
      }
      score += match;
    }
    if (!ok) continue;
    if (!best || score > best.score) best = { candidate, score };
  }
  return best?.candidate || null;
}

/** 返回匹配得分（越大越精确），不匹配返回 0。 */
function matchArgument(param, value) {
  if (param === 'Ljava/lang/String;' || param === 'Ljava/lang/CharSequence;') {
    if (typeof value === 'string') return 3;
  }
  if (isObjectType(param)) {
    if (value === null || value === undefined) return 1;
    return typeof value === 'object' ? 2 : 0;
  }
  if (param === 'J') {
    if (typeof value === 'bigint') return 3;
    return typeof value === 'number' && Number.isFinite(value) ? 1 : 0;
  }
  if (param === 'F' || param === 'D') {
    return typeof value === 'number' ? 2 : 0;
  }
  if (param === 'Z') {
    if (typeof value === 'boolean') return 3;
    return value === 0 || value === 1 ? 1 : 0;
  }
  return typeof value === 'number' && Number.isInteger(value) ? 2 : 0;
}

/** 类名（点分 / 描述符）→ 描述符，并校验类存在。 */
export function resolveClassDescriptor(vm, className) {
  if (className && typeof className === 'object') {
    if (typeof className.descriptor === 'string') return className.descriptor;
    if (typeof className.$descriptor === 'string') return className.$descriptor;
  }
  const descriptor = typeToDescriptor(className);
  if (!vm?.registry?.resolve?.(descriptor)) {
    throw new Error(`找不到类 ${descriptorToName(descriptor)}`);
  }
  return descriptor;
}

/** 列出某类自己声明的方法（不含父类），可选按名字过滤。 */
export function listDeclaredMethods(vm, descriptor, nameFilter = null) {
  const rc = vm?.registry?.resolve?.(descriptor);
  if (!rc) return [];
  const out = [];
  const push = (name, proto, isStatic) => {
    if (nameFilter && name !== nameFilter) return;
    out.push({ name, proto: normalizeProto(proto), isStatic });
  };
  if (rc.dexClass) {
    for (const method of rc.dexClass.directMethods) push(method.name, method.proto, (method.accessFlags & 0x8) !== 0);
    for (const method of rc.dexClass.virtualMethods) push(method.name, method.proto, false);
  }
  if (rc.nativeDef) {
    for (const key of rc.nativeDef.methods.keys()) {
      const parsed = splitNativeKey(key);
      if (parsed) push(parsed.name, parsed.proto, false);
    }
    for (const key of rc.nativeDef.staticMethods.keys()) {
      const parsed = splitNativeKey(key);
      if (parsed) push(parsed.name, parsed.proto, true);
    }
  }
  return out;
}

function splitNativeKey(key) {
  const open = key.indexOf('(');
  if (open <= 0) return null;
  return { name: key.slice(0, open), proto: key.slice(open) };
}

function normalizeProto(proto) {
  if (typeof proto === 'string') return parseProtoDescriptor(proto);
  if (proto && typeof proto.descriptor === 'string') return proto;
  return { descriptor: '()V', parameters: [], returnType: 'V' };
}

/**
 * 沿继承链查找字段声明，返回 `{ classDesc, name, type }`，可直接给 `vm.getField/setField`。
 * 原生类没有字段类型信息，按当前值推断。
 */
export function fieldDescriptorOf(vm, descriptor, fieldName, forcedType = null, isStatic = false) {
  const name = String(fieldName);
  let cursor = descriptor;
  const visited = new Set();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const rc = vm.registry.resolve(cursor);
    if (!rc) break;
    if (rc.dexClass) {
      for (const entry of rc.dexClass.allFields()) {
        const field = entry.field || entry;
        if (field.name !== name) continue;
        if (isStatic && !isStaticFieldOf(rc, name)) continue;
        return { classDesc: cursor, name, type: field.type };
      }
    }
    if (rc.nativeDef) {
      const map = isStatic ? rc.nativeDef.staticFields : rc.nativeDef.instanceFields;
      const found = nativeFieldOf(map, name);
      if (found) {
        return { classDesc: cursor, name, type: forcedType || found.type || inferType(found.value) };
      }
    }
    cursor = rc.superDescriptor || null;
  }
  if (forcedType) return { classDesc: descriptor, name, type: forcedType };
  return { classDesc: descriptor, name, type: 'Ljava/lang/Object;' };
}

function isStaticFieldOf(rc, name) {
  return (rc.dexClass?.staticFields || []).some((entry) => (entry.field || entry).name === name);
}

/**
 * 原生字段表既支持裸名（`COUNT`），也支持框架里常见的「名字:类型」键（`COUNT:I`、`VISIBLE:I`）。
 * 后者能直接给出字段类型，避免按值猜测。
 */
function nativeFieldOf(map, name) {
  if (!map) return null;
  if (map.has(name)) return { value: map.get(name), type: null };
  const prefix = `${name}:`;
  for (const [key, value] of map) {
    if (typeof key === 'string' && key.startsWith(prefix) && key.length > prefix.length) {
      return { value, type: key.slice(prefix.length) };
    }
  }
  return null;
}

function inferType(value) {
  if (typeof value === 'number') return 'I';
  if (typeof value === 'bigint') return 'J';
  if (typeof value === 'boolean') return 'Z';
  return 'Ljava/lang/Object;';
}

