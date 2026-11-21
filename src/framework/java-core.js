import { NativeClassDef } from '../runtime/class-registry.js';
import {
  defaultValueFor,
  hashCode,
  isJavaArray,
  isJavaObject,
  stringify,
  toInt,
  toLong,
} from '../runtime/values.js';
import { descriptorToName, nameToDescriptor } from '../dex/dexfile.js';
import { parseBinaryXml } from '../res/axml.js';
import { matchesStateSpec } from './drawables.js';

export function nativeDef(descriptor, options = {}) {
  return new NativeClassDef(descriptor, options);
}

function collectionItems(value) {
  if (!value) return [];
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.setItems)) return value.setItems;
  if (isJavaObject(value)) {
    const peer = value.$peer;
    if (peer) {
      if (Array.isArray(peer.items)) return peer.items;
      if (Array.isArray(peer.setItems)) return peer.setItems;
      if (Array.isArray(peer.list)) return peer.list;
    }
  }
  if (isJavaObject(value) && Array.isArray(value.$data)) return value.$data;
  return [];
}

function decodeUtf8Bytes(value, charset) {
  if (value === null || value === undefined) return '';
  const raw = Array.isArray(value.$data) ? value.$data : (Array.isArray(value) ? value : []);
  const bytes = Uint8Array.from(raw.map((b) => (typeof b === 'number' ? b : 0) & 0xff));
  const name = charset === null || charset === undefined ? 'UTF-8' : jsString(charset).toUpperCase();
  if (name.includes('ASCII') || name.includes('8859') || name.includes('LATIN')) {
    return Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export function jsString(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (isJavaObject(value)) {
    if (value.$string !== undefined) return value.$string;
    if (Array.isArray(value.$peer?.parts)) return value.$peer.parts.join('');
    if (value.$peer && typeof value.$peer.text === 'string') return value.$peer.text;
    if (value.$peer && typeof value.$peer.toString === 'function' && value.$peer.toString !== Object.prototype.toString) {
      const result = value.$peer.toString();
      if (typeof result === 'string') return result;
    }
  }
  if (isJavaArray(value)) {
    if (value.$type === '[C') return value.$data.map((c) => String.fromCharCode(c & 0xffff)).join('');
    return stringify(value);
  }
  if (value && typeof value === 'object' && typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
    const result = value.toString();
    if (typeof result === 'string') return result;
  }
  return String(value);
}


function typeDescriptorOf(klass) {
  if (klass === null || klass === undefined) return null;
  if (typeof klass === 'string') return klass;
  return klass.$descriptor || klass.$peer?.descriptor || null;
}

function paramDescriptorList(paramTypes) {
  if (!isJavaArray(paramTypes)) return [];
  return paramTypes.$data.map((item) => typeDescriptorOf(item)).filter(Boolean);
}

function protoDescriptorOf(name, paramTypes) {
  const params = paramDescriptorList(paramTypes).join('');
  return `(${params})V`;
}

function matchParameters(method, paramTypes) {
  const expected = paramDescriptorList(paramTypes);
  if (!expected.length) return true;
  const actual = method.proto?.parameters || [];
  if (actual.length !== expected.length) return false;
  return expected.every((descriptor, index) => descriptor === actual[index]);
}

function matchParametersLoose(method, expected) {
  if (!expected.length) return true;
  const actual = method.proto?.parameters || [];
  if (actual.length !== expected.length) return false;
  return expected.every((descriptor, index) => descriptor === actual[index]);
}

function reflectArray(vm, elementDescriptor, arrayDescriptor, items) {
  const array = vm.newArray(arrayDescriptor, items.length, null);
  items.forEach((item, index) => {
    array.$data[index] = item;
  });
  return array;
}

function makeMethodObject(vm, classDescriptor, method) {
  const object = vm.allocateRawObject('Ljava/lang/reflect/Method;');
  object.$peer = {
    name: method.name,
    classDesc: method.classDesc || classDescriptor,
    proto: method.proto,
    $target: method,
    isNative: !!method.nativeFn,
    accessible: false,
  };
  return object;
}

function makeFieldObject(vm, field, classDescriptor, isStatic) {
  const object = vm.allocateRawObject('Ljava/lang/reflect/Field;');
  object.$peer = {
    name: field.name,
    classDesc: field.classDesc || classDescriptor,
    type: field.type,
    isStatic: !!isStatic,
    accessible: false,
  };
  return object;
}

function makeConstructorObject(vm, classDescriptor, method) {
  const object = vm.allocateRawObject('Ljava/lang/reflect/Constructor;');
  object.$peer = {
    name: '<init>',
    classDesc: classDescriptor,
    proto: method.proto,
    $target: method,
    accessible: false,
  };
  return object;
}

function walkClassChain(vm, classDescriptor, declaredOnly, visit) {
  const visited = new Set();
  let current = classDescriptor;
  let first = true;
  while (current && !visited.has(current)) {
    visited.add(current);
    const rc = vm.registry.resolve(current);
    if (!rc) break;
    if (visit(rc, current) === false) break;
    if (declaredOnly) break;
    if (first) {
      first = false;
      for (const iface of rc.interfaces || []) {
        const ifaceRc = vm.registry.resolve(iface);
        if (ifaceRc?.dexClass) {
          for (const method of ifaceRc.dexClass.methods || []) visit(ifaceRc, iface, method);
        }
      }
    }
    current = rc.superDescriptor;
  }
}

function collectFields(vm, classDescriptor, { declaredOnly }) {
  const result = [];
  const seen = new Set();
  walkClassChain(vm, classDescriptor, declaredOnly, (rc, descriptor) => {
    if (rc.dexClass) {
      for (const entry of rc.dexClass.staticFields || []) {
        const field = entry.field || entry;
        const key = `${field.name}:${field.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(makeFieldObject(vm, field, descriptor, true));
      }
      for (const entry of rc.dexClass.instanceFields || []) {
        const field = entry.field || entry;
        const key = `${field.name}:${field.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(makeFieldObject(vm, field, descriptor, false));
      }
    }
    if (rc.nativeDef) {
      for (const key of rc.nativeDef.staticFields?.keys?.() || []) {
        const [name, type] = key.split(':');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(makeFieldObject(vm, { classDesc: descriptor, name, type }, descriptor, true));
      }
      for (const key of rc.nativeDef.instanceFields?.keys?.() || []) {
        const [name, type] = key.split(':');
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(makeFieldObject(vm, { classDesc: descriptor, name, type }, descriptor, false));
      }
    }
  });
  return result;
}

function splitNativeKey(key) {
  const index = key.indexOf('(');
  if (index < 0) return { name: key, proto: '()V' };
  return { name: key.slice(0, index), proto: key.slice(index) };
}

function collectMethods(vm, classDescriptor, { declaredOnly }) {
  const result = [];
  const seen = new Set();
  walkClassChain(vm, classDescriptor, declaredOnly, (rc, descriptor) => {
    if (rc.dexClass) {
      const declared = [...(rc.dexClass.virtualMethods || []), ...(rc.dexClass.directMethods || [])];
      for (const method of declared) {
        if (method.name === '<init>' || method.name === '<clinit>') continue;
        const key = `${method.name}${method.proto?.descriptor || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(makeMethodObject(vm, descriptor, method));
      }
    }
    if (rc.nativeDef) {
      for (const [rawKey, fn] of rc.nativeDef.methods || []) {
        const { name, proto } = splitNativeKey(rawKey);
        if (name === '<init>' || name === '<clinit>') continue;
        const key = `${name}${proto}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const synthetic = {
          classDesc: descriptor,
          name,
          proto: { descriptor: proto, parameters: parseProtoParameters(proto), returnType: parseProtoReturn(proto) },
          accessFlags: 1,
          nativeFn: fn,
        };
        result.push(makeMethodObject(vm, descriptor, synthetic));
      }
      for (const [rawKey, fn] of rc.nativeDef.staticMethods || []) {
        const { name, proto } = splitNativeKey(rawKey);
        if (name === '<init>' || name === '<clinit>') continue;
        const key = `${name}${proto}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const synthetic = {
          classDesc: descriptor,
          name,
          proto: { descriptor: proto, parameters: parseProtoParameters(proto), returnType: parseProtoReturn(proto) },
          accessFlags: 1,
          nativeFn: fn,
          isStatic: true,
        };
        result.push(makeMethodObject(vm, descriptor, synthetic));
      }
    }
  });
  return result;
}

function parseProtoParameters(descriptor) {
  const inner = descriptor.slice(1, descriptor.lastIndexOf(')'));
  const params = [];
  let index = 0;
  while (index < inner.length) {
    const start = index;
    while (inner[index] === '[') index += 1;
    if (inner[index] === 'L') {
      const end = inner.indexOf(';', index);
      index = end < 0 ? inner.length : end + 1;
    } else {
      index += 1;
    }
    params.push(inner.slice(start, index));
  }
  return params;
}

function parseProtoReturn(descriptor) {
  const tail = descriptor.slice(descriptor.lastIndexOf(')') + 1);
  return tail || 'V';
}

function collectConstructors(vm, classDescriptor, { declaredOnly }) {
  const result = [];
  walkClassChain(vm, classDescriptor, declaredOnly, (rc, descriptor) => {
    if (!rc.dexClass) return;
    for (const method of rc.dexClass.directMethods || []) {
      if (method.name !== '<init>') continue;
      result.push(makeConstructorObject(vm, descriptor, method));
    }
  });
  return result;
}

function findMethod(vm, classDescriptor, name, paramTypes, { declaredOnly }) {
  const methodName = jsString(name);
  const expected = paramDescriptorList(paramTypes);
  const candidates = collectMethods(vm, classDescriptor, { declaredOnly });
  for (const candidate of candidates) {
    const peer = candidate.$peer;
    if (peer.name !== methodName) continue;
    if (!matchParametersLoose(peer.$target, expected)) continue;
    return candidate;
  }
  return null;
}

function findField(vm, classDescriptor, name, { declaredOnly }) {
  const fieldName = jsString(name);
  const fields = collectFields(vm, classDescriptor, { declaredOnly });
  return fields.find((field) => field.$peer?.name === fieldName) || null;
}

function findConstructor(vm, classDescriptor, paramTypes, { declaredOnly }) {
  const expected = paramDescriptorList(paramTypes);
  const constructors = collectConstructors(vm, classDescriptor, { declaredOnly });
  for (const candidate of constructors) {
    if (matchParametersLoose(candidate.$peer?.$target, expected)) return candidate;
  }
  return null;
}

function javaArrayToJs(array) {
  if (!isJavaArray(array)) return [];
  return array.$data.map((item) => jsString(item));
}

function peerClass(fn, fields = {}) {
  return class {
    constructor(vm, object) {
      this.vm = vm;
      this.$object = object;
      Object.assign(this, fields);
      fn.call(this, vm, object);
    }
  };
}

function refsEqual(a, b) {
  if (a === b) return true;
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return true;
  if (aNull || bNull) {
    const other = aNull ? b : a;
    if (typeof other === 'number') return (other | 0) === 0 && !Number.isInteger(other) === false && (other === 0 || other === 0.0);
    if (isJavaObject(other) && other.$peer && (other.$peer.value === 0 || other.$peer.value === undefined || other.$peer.value === null)) return true;
    return false;
  }
  if (isJavaObject(a) && isJavaObject(b)) {
    if (a === b) return true;
    const av = a.$peer && a.$peer.value;
    const bv = b.$peer && b.$peer.value;
    if (av !== undefined || bv !== undefined) return av === bv;
    return false;
  }
  if (isJavaObject(a) || isJavaObject(b)) {
    const obj = isJavaObject(a) ? a : b;
    const raw = isJavaObject(a) ? b : a;
    if (obj.$peer && obj.$peer.value !== undefined) return obj.$peer.value === raw;
    return false;
  }
  return false;
}

function describeV(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undef';
  if (typeof v !== 'object') return typeof v + ':' + v;
  return (v.$descriptor || 'obj') + '#' + (v.__id ??= ++describeV.c);
}
describeV.c = 0;

function classOverridesMethod(vm, value, name, proto) {
  const descriptor = vm?.registry?.classNameOf?.(value);
  if (!descriptor || descriptor.length === 1) return false;
  const visited = new Set();
  let current = descriptor;
  while (current && current !== 'Ljava/lang/Object;' && !visited.has(current)) {
    visited.add(current);
    const rc = vm.registry.resolve(current);
    if (!rc) return false;
    if (rc.dexClass) {
      const methods = [...(rc.dexClass.virtualMethods || []), ...(rc.dexClass.directMethods || [])];
      if (methods.some((method) => method.name === name && method.proto?.descriptor === proto)) return true;
    }
    if (rc.nativeDef?.methods?.has(name + proto)) return true;
    current = rc.superDescriptor;
  }
  return false;
}

function mapKey(value, vm) {
  if (value === null || value === undefined) return 'null:';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int:' + (value | 0) : 'num:' + value;
  if (typeof value === 'string') return 'str:' + value;
  if (typeof value === 'boolean') return 'bool:' + value;
  if (isJavaObject(value)) {
    const peer = value.$peer;
    if (peer && peer.value !== undefined && typeof peer.value !== 'object') return 'num:' + peer.value;
    if (value.$string !== undefined) return 'str:' + value.$string;
    // 覆写了 hashCode 的类需要按 Java 值语义比较（equals），不能靠身份键，
    // 也不能靠 toString（很多等值类并不覆写 toString，默认实现带身份哈希）。
    // mapKey 只给出身份槽位，真正的等值查找由 findValueSlot 用 equals 完成。
    if (peer && typeof peer.toString === 'function') {
      const text = peer.toString();
      if (typeof text === 'string' && text !== '[object Object]') return 'str:' + text;
    }
    return 'ref:' + (value.__mapId ??= ++mapKeyCounter);
  }
  if (isJavaArray(value)) return 'array:' + stringify(value);
  if (typeof value === 'object') {
    const text = String(value);
    if (text !== '[object Object]') return 'str:' + text;
    return 'ref:' + (value.__mapId ??= ++mapKeyCounter);
  }
  return 'str:' + String(value);
}
let mapKeyCounter = 0;

/**
 * 值语义对象的等值查找：Java 的 HashMap 用 hashCode + equals 定位键。
 * 只覆写 hashCode 不覆写 toString 的类（Firebase 的 Qualified 就是典型）
 * 用身份键会查不到「本应相等」的另一个实例，表现为依赖边丢失、
 * 拓扑排序提前结束、最后被误判成循环依赖。
 */
function findValueSlot(self, key, vm) {
  if (!vm || !isJavaObject(key) || !self.rawKeys || self.rawKeys.size === 0) return null;
  const overrides = classOverridesMethod(vm, key, 'hashCode', '()I');
  if (!overrides) return null;
  for (const [slot, raw] of self.rawKeys) {
    if (raw === key) return slot;
    if (!isJavaObject(raw)) continue;
    try {
      // dex 里返回 Z 的方法给的是数字 1/0，不能只认布尔 true。
      if (vm.invokeByName('equals', '(Ljava/lang/Object;)Z', key, [raw])) return slot;
    } catch (_error) {
      // equals 抛错按不相等处理，避免把宿主异常带进 Map 语义。
    }
  }
  return null;
}

/**
 * Set 与 Map 一样要按 Java 语义比较：只覆写 hashCode/equals 的值对象（如
 * Firebase 的 Qualified）必须用 dex 的 equals 查找，否则「同一个接口的另一个实例」
 * 会被当成新元素，依赖解析就会误报缺依赖。
 */
function findSetIndex(self, value, vm) {
  const items = self.setItems || [];
  if (!vm || !isJavaObject(value) || !classOverridesMethod(vm, value, 'hashCode', '()I')) {
    return items.indexOf(value);
  }
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item === value) return index;
    if (!isJavaObject(item)) continue;
    try {
      // 同上：dex 的 equals 返回 1/0，按真假判断。
      if (vm.invokeByName('equals', '(Ljava/lang/Object;)Z', value, [item])) return index;
    } catch (_error) {
      // equals 抛错按不相等处理
    }
  }
  return -1;
}


/**
 * Class.forName：缺失的应用/库类必须抛 ClassNotFoundException，
 * 否则依赖「反射探测可选类」的库（如 RxJava/AutoDispose 的反射适配器）
 * 会把不存在的类当成空壳类继续用，随后在调用处 NPE。
 * 未建模的 android/java/javax/org 类仍按框架类返回空壳。
 */
function forNameClass(vm, name) {
  const text = typeof name === 'string' ? name : name?.$value ?? String(name ?? '');
  const descriptor = text.startsWith('L') || text.startsWith('[') ? text : `L${text.replace(/\./g, '/')};`;
  const known = vm.registry.findDexClass(descriptor) || vm.registry.nativeDefs.get(descriptor);
  if (!known && !/^L(android|java|javax|org|dalvik|sun|libcore)\//.test(descriptor)) {
    vm.throwException('Ljava/lang/ClassNotFoundException;', descriptorToName(descriptor));
  }
  return vm.getClassObject(descriptor);
}

export const JAVA_CORE_CLASSES = {
  'Ljava/lang/Object;': nativeDef('Ljava/lang/Object;', {
    super: null,
    methods: {
      '<init>()V': () => undefined,
      'toString()Ljava/lang/String;': (self) => (isJavaObject(self) ? `${self.$dexClass?.name || 'Object'}@${hashCode(self).toString(16)}` : String(self)),
      'equals(Ljava/lang/Object;)Z': (self, [other], _vm, ctx) => {
        const receiver = ctx?.receiver;
        const rv = receiver?.$view;
        const ov = other?.$view;
        const r = receiver === other || self === other
          || (!!receiver && !!receiver.$peer && receiver.$peer === other)
          || (!!rv && !!ov && rv === ov)
          || (!!self?.$object && self.$object === other)
          || (!!other?.$object && self === other.$object);
        return r;
      },
      'hashCode()I': (self) => hashCode(self),
      'getClass()Ljava/lang/Class;': (self, _args, vm) => vm.getClassObject(vm.registry.classNameOf(self)),
      'clone()Ljava/lang/Object;': (self, _args, vm) => {
        if (isJavaArray(self)) {
          return vm.newArray(self.$type, self.$data.length, [...self.$data]);
        }
        if (isJavaObject(self)) {
          const copy = vm.allocateObject(self.$runtimeClass);
          if (self.$fields) for (const [key, value] of self.$fields) copy.$fields.set(key, value);
          copy.$nativeClass = self.$nativeClass;
          if (self.$peer) copy.$peer = { ...self.$peer };
          return copy;
        }
        return self;
      },
    },
  }),

  'Ljava/lang/reflect/Modifier;': nativeDef('Ljava/lang/reflect/Modifier;', {
    super: 'Ljava/lang/Object;',
    staticMethods: {
      'isPublic(I)Z': (_self, [flags]) => (toInt(flags) & 0x0001) !== 0,
      'isPrivate(I)Z': (_self, [flags]) => (toInt(flags) & 0x0002) !== 0,
      'isProtected(I)Z': (_self, [flags]) => (toInt(flags) & 0x0004) !== 0,
      'isStatic(I)Z': (_self, [flags]) => (toInt(flags) & 0x0008) !== 0,
      'isFinal(I)Z': (_self, [flags]) => (toInt(flags) & 0x0010) !== 0,
      'isSynchronized(I)Z': (_self, [flags]) => (toInt(flags) & 0x0020) !== 0,
      'isVolatile(I)Z': (_self, [flags]) => (toInt(flags) & 0x0040) !== 0,
      'isTransient(I)Z': (_self, [flags]) => (toInt(flags) & 0x0080) !== 0,
      'isNative(I)Z': (_self, [flags]) => (toInt(flags) & 0x0100) !== 0,
      'isInterface(I)Z': (_self, [flags]) => (toInt(flags) & 0x0200) !== 0,
      'isAbstract(I)Z': (_self, [flags]) => (toInt(flags) & 0x0400) !== 0,
      'isStrict(I)Z': (_self, [flags]) => (toInt(flags) & 0x0800) !== 0,
      'toString(I)Ljava/lang/String;': (_self, [flags]) => String(toInt(flags)),
    },
  }),
  'Ljava/lang/reflect/Constructor;': nativeDef('Ljava/lang/reflect/Constructor;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'newInstance([Ljava/lang/Object;)Ljava/lang/Object;': (self, [args], vm) => {
        const peer = self.$peer || self;
        if (!peer || !peer.classDesc) return null;
        const values = args?.$data ? [...args.$data] : [];
        const made = vm.instantiate(peer.classDesc, values);
        return made;
      },
      'getName()Ljava/lang/String;': (self) => descriptorToName((self.$peer || self)?.classDesc || ''),
      'getParameterTypes()[Ljava/lang/Class;': (self, _args, vm) => {
        const params = (self.$peer || self)?.proto?.parameters || [];
        const array = vm.newArray('[Ljava/lang/Class;', params.length, null);
        params.forEach((descriptor, index) => {
          array.$data[index] = vm.getClassObject(descriptor);
        });
        return array;
      },
      'setAccessible(Z)V': (self, [flag]) => {
        const peer = self.$peer || self;
        if (peer) peer.accessible = !!flag;
      },
      'isAccessible()Z': (self) => !!(self.$peer || self)?.accessible,
      'equals(Ljava/lang/Object;)Z': (self, [other]) => {
        const a = self.$peer || self;
        const b = other?.$peer || other;
        return !!b && a?.classDesc === b?.classDesc && (a?.proto?.descriptor || '') === (b?.proto?.descriptor || '');
      },
    },
  }),
  'Ljava/lang/reflect/Method;': nativeDef('Ljava/lang/reflect/Method;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'invoke(Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;': (self, [target, args], vm) => {
        const peer = self.$peer || self;
        if (!peer) return null;
        const values = args?.$data ? [...args.$data] : [];
        const targetMethod = peer.$target;
        if (!targetMethod) return null;
        if (targetMethod.nativeFn) {
          return targetMethod.nativeFn(targetMethod.isStatic ? null : (target ?? null), values, vm);
        }
        if (targetMethod.isStatic) return vm.executeMethod(targetMethod, null, values);
        return vm.executeMethod(targetMethod, target === null || target === undefined ? peer : target, values);
      },
      'getName()Ljava/lang/String;': (self) => (self.$peer || self)?.name || '',
      'getReturnType()Ljava/lang/Class;': (self, _args, vm) =>
        vm.getClassObject((self.$peer || self)?.proto?.returnType || 'Ljava/lang/Object;'),
      'getParameterTypes()[Ljava/lang/Class;': (self, _args, vm) => {
        const params = (self.$peer || self)?.proto?.parameters || [];
        const array = vm.newArray('[Ljava/lang/Class;', params.length, null);
        params.forEach((descriptor, index) => {
          array.$data[index] = vm.getClassObject(descriptor);
        });
        return array;
      },
      'setAccessible(Z)V': (self, [flag]) => {
        const peer = self.$peer || self;
        if (peer) peer.accessible = !!flag;
      },
      'isAccessible()Z': (self) => !!(self.$peer || self)?.accessible,
      'getModifiers()I': (self) => {
        const target = (self.$peer || self)?.$target;
        if (target?.accessFlags !== undefined) return target.accessFlags | 0;
        return 1;
      },
      'equals(Ljava/lang/Object;)Z': (self, [other]) => {
        const a = self.$peer || self;
        const b = other?.$peer || other;
        return !!b && a?.name === b?.name && (a?.classDesc || '') === (b?.classDesc || '');
      },
    },
  }),
  'Ljava/lang/reflect/Field;': nativeDef('Ljava/lang/reflect/Field;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'getName()Ljava/lang/String;': (self) => (self.$peer || self)?.name || '',
      'getType()Ljava/lang/Class;': (self, _args, vm) => vm.getClassObject((self.$peer || self)?.type || 'Ljava/lang/Object;'),
      'get(Ljava/lang/Object;)Ljava/lang/Object;': (self, [target], vm) => {
        const peer = self.$peer || self;
        if (!peer?.classDesc) return null;
        if (peer.isStatic) {
          return vm.getStaticField({ classDesc: peer.classDesc, name: peer.name, type: peer.type });
        }
        return vm.getField(target, { classDesc: peer.classDesc, name: peer.name, type: peer.type });
      },
      'set(Ljava/lang/Object;Ljava/lang/Object;)V': (self, [target, value], vm) => {
        const peer = self.$peer || self;
        if (!peer?.classDesc) return;
        if (peer.isStatic) {
          vm.setStaticField({ classDesc: peer.classDesc, name: peer.name, type: peer.type }, value);
          return;
        }
        vm.setField(target, { classDesc: peer.classDesc, name: peer.name, type: peer.type }, value);
      },
      'setAccessible(Z)V': (self, [flag]) => {
        const peer = self.$peer || self;
        if (peer) peer.accessible = !!flag;
      },
      'isAccessible()Z': (self) => !!(self.$peer || self)?.accessible,
      'getModifiers()I': (self) => (self.$peer || self)?.modifiers ?? 1,
    },
  }),
  'Ljava/lang/Package;': nativeDef('Ljava/lang/Package;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'getName()Ljava/lang/String;': (self) => self?.$name || '',
    },
  }),
  'Ljava/lang/Class;': nativeDef('Ljava/lang/Class;', {
    super: 'Ljava/lang/Object;',
    staticMethods: {
      'forName(Ljava/lang/String;)Ljava/lang/Class;': (self, [name], vm) => forNameClass(vm, name),
      'forName(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;': (self, [name], vm) => forNameClass(vm, name),
    },
    methods: {
      'equals(Ljava/lang/Object;)Z': (self, [other]) => {
        if (self === other) return true;
        if (!other || typeof other !== 'object') return false;
        const left = self.$descriptor;
        const right = other.$descriptor;
        return !!left && left === right;
      },
      'hashCode()I': (self) => hashCode(self.$descriptor || ''),
      'toString()Ljava/lang/String;': (self) => `class ${self.$name || descriptorToName(self.$descriptor || '')}`,
      'getName()Ljava/lang/String;': (self) => self.$name || descriptorToName(self.$descriptor || ''),
      'getCanonicalName()Ljava/lang/String;': (self) => self.$name || descriptorToName(self.$descriptor || ''),
      'getSimpleName()Ljava/lang/String;': (self) => {
        const full = self.$name || descriptorToName(self.$descriptor || '');
        const simple = full.split('.').filter(Boolean).pop() || full;
        return simple.split('$').pop();
      },
      'getTypeName()Ljava/lang/String;': (self) => self.$name || descriptorToName(self.$descriptor || ''),
      'getClassLoader()Ljava/lang/ClassLoader;': (_self, _args, vm) => {
        if (!vm) return null;
        if (!vm.__classLoaderPeer) {
          vm.__classLoaderPeer = { $descriptor: 'Ljava/lang/ClassLoader;', $name: 'java.lang.ClassLoader' };
        }
        return vm.__classLoaderPeer;
      },
      'asSubclass(Ljava/lang/Class;)Ljava/lang/Class;': (self) => self,
      'getPackage()Ljava/lang/Package;': (self, _args, vm) => {
        if (!vm?.allocateRawObject) return null;
        const full = self.$name || descriptorToName(self.$descriptor || '');
        const index = full.lastIndexOf('.');
        const pkg = vm.allocateRawObject('Ljava/lang/Package;');
        if (pkg) pkg.$name = index < 0 ? '' : full.slice(0, index);
        return pkg;
      },
      'getPackageName()Ljava/lang/String;': (self) => {
        const full = self.$name || descriptorToName(self.$descriptor || '');
        const index = full.lastIndexOf('.');
        return index < 0 ? '' : full.slice(0, index);
      },
      'getModifiers()I': (self, _args, vm) => {
        const rc = vm?.registry?.resolve(self.$descriptor);
        if (rc?.dexClass && typeof rc.dexClass.accessFlags === 'number') return rc.dexClass.accessFlags;
        return 1;
      },
      'isInterface()Z': (self, _args, vm) => {
        const rc = vm?.registry?.resolve(self.$descriptor);
        return !!(rc?.dexClass && (rc.dexClass.accessFlags & 0x0200) !== 0);
      },
      'isAnnotation()Z': (self, _args, vm) => {
        const rc = vm?.registry?.resolve(self.$descriptor);
        return !!(rc?.dexClass && (rc.dexClass.accessFlags & 0x2000) !== 0);
      },
      'isArray()Z': (self) => (self.$descriptor || '').startsWith('['),
      'isPrimitive()Z': () => false,
      'isEnum()Z': () => false,
      'isAnonymousClass()Z': (self) => /^\d+$/.test((self.$name || '').split('$').pop() || ''),
      'isLocalClass()Z': () => false,
      'isMemberClass()Z': (self) => (self.$name || '').includes('$'),
      'getSuperclass()Ljava/lang/Class;': (self, _args, vm) => {
        const rc = vm.registry.resolve(self.$descriptor);
        return rc?.superDescriptor ? vm.getClassObject(rc.superDescriptor) : null;
      },
      'getInterfaces()[Ljava/lang/Class;': (self, _args, vm) => {
        const rc = vm.registry.resolve(self.$descriptor);
        const descriptors = rc?.interfaces || [];
        const array = vm.newArray('[Ljava/lang/Class;', descriptors.length, null);
        descriptors.forEach((descriptor, index) => {
          array.$data[index] = vm.getClassObject(descriptor);
        });
        return array;
      },
      'getDeclaredFields()[Ljava/lang/reflect/Field;': (self, _args, vm) => {
        const fields = collectFields(vm, self.$descriptor, { declaredOnly: true });
        return reflectArray(vm, 'Ljava/lang/reflect/Field;', '[Ljava/lang/reflect/Field;', fields);
      },
      'getFields()[Ljava/lang/reflect/Field;': (self, _args, vm) => {
        const fields = collectFields(vm, self.$descriptor, { declaredOnly: false });
        return reflectArray(vm, 'Ljava/lang/reflect/Field;', '[Ljava/lang/reflect/Field;', fields);
      },
      'getDeclaredMethods()[Ljava/lang/reflect/Method;': (self, _args, vm) => {
        const methods = collectMethods(vm, self.$descriptor, { declaredOnly: true });
        return reflectArray(vm, 'Ljava/lang/reflect/Method;', '[Ljava/lang/reflect/Method;', methods);
      },
      'getMethods()[Ljava/lang/reflect/Method;': (self, _args, vm) => {
        const methods = collectMethods(vm, self.$descriptor, { declaredOnly: false });
        return reflectArray(vm, 'Ljava/lang/reflect/Method;', '[Ljava/lang/reflect/Method;', methods);
      },
      'getDeclaredConstructors()[Ljava/lang/reflect/Constructor;': (self, _args, vm) => {
        const constructors = collectConstructors(vm, self.$descriptor, { declaredOnly: true });
        return reflectArray(vm, 'Ljava/lang/reflect/Constructor;', '[Ljava/lang/reflect/Constructor;', constructors);
      },
      'getConstructors()[Ljava/lang/reflect/Constructor;': (self, _args, vm) => {
        const constructors = collectConstructors(vm, self.$descriptor, { declaredOnly: false });
        return reflectArray(vm, 'Ljava/lang/reflect/Constructor;', '[Ljava/lang/reflect/Constructor;', constructors);
      },
      'getConstructor([Ljava/lang/Class;)Ljava/lang/reflect/Constructor;': (self, [paramTypes], vm) => {
        const result = findConstructor(vm, self.$descriptor, paramTypes, { declaredOnly: true });
        if (!result) {
          vm.throwException('Ljava/lang/NoSuchMethodException;',
            `${descriptorToName(self.$descriptor || '')}${protoDescriptorOf('<init>', paramTypes)}`);
        }
        return result;
      },
      'getDeclaredConstructor([Ljava/lang/Class;)Ljava/lang/reflect/Constructor;': (self, [paramTypes], vm) => {
        const result = findConstructor(vm, self.$descriptor, paramTypes, { declaredOnly: true });
        if (!result) {
          vm.throwException('Ljava/lang/NoSuchMethodException;',
            `${descriptorToName(self.$descriptor || '')}${protoDescriptorOf('<init>', paramTypes)}`);
        }
        return result;
      },
      'getMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;': (self, [name, paramTypes], vm) => {
        const found = findMethod(vm, self.$descriptor, name, paramTypes, { declaredOnly: false, isStatic: false });
        if (!found) {
          vm.throwException('Ljava/lang/NoSuchMethodException;',
            `${descriptorToName(self.$descriptor || '')}.${jsString(name)}${protoDescriptorOf(name, paramTypes)}`);
        }
        return found;
      },
      'getDeclaredMethod(Ljava/lang/String;[Ljava/lang/Class;)Ljava/lang/reflect/Method;': (self, [name, paramTypes], vm) => {
        const found = findMethod(vm, self.$descriptor, name, paramTypes, { declaredOnly: true, isStatic: false });
        if (!found) {
          vm.throwException('Ljava/lang/NoSuchMethodException;',
            `${descriptorToName(self.$descriptor || '')}.${jsString(name)}${protoDescriptorOf(name, paramTypes)}`);
        }
        return found;
      },
      'getField(Ljava/lang/String;)Ljava/lang/reflect/Field;': (self, [name], vm) => {
        const found = findField(vm, self.$descriptor, name, { declaredOnly: false });
        if (!found) {
          vm.throwException('Ljava/lang/NoSuchFieldException;',
            `${descriptorToName(self.$descriptor || '')}.${jsString(name)}`);
        }
        return found;
      },
      'getDeclaredField(Ljava/lang/String;)Ljava/lang/reflect/Field;': (self, [name], vm) => {
        const found = findField(vm, self.$descriptor, name, { declaredOnly: true });
        if (!found) {
          vm.throwException('Ljava/lang/NoSuchFieldException;',
            `${descriptorToName(self.$descriptor || '')}.${jsString(name)}`);
        }
        return found;
      },
      'newInstance()Ljava/lang/Object;': (self, _args, vm) => {
        if (!self.$descriptor) return null;
        return vm.instantiate(self.$descriptor, []);
      },
      'isAssignableFrom(Ljava/lang/Class;)Z': (self, [other], vm) => {
        const otherDescriptor = other?.$descriptor;
        if (!self.$descriptor || !otherDescriptor) return false;
        return vm.registry.isAssignable(otherDescriptor, self.$descriptor);
      },
      'isInstance(Ljava/lang/Object;)Z': (self, [value], vm) => {
        if (!self.$descriptor) return false;
        return vm.registry.instanceOf(value, self.$descriptor);
      },
      'cast(Ljava/lang/Object;)Ljava/lang/Object;': (self, [value], vm) => {
        if (value === null) return null;
        if (!self.$descriptor) return value;
        return vm.registry.checkCast(value, self.$descriptor);
      },
      'equals(Ljava/lang/Object;)Z': (self, [other]) => {
        if (other === null || other === undefined) return false;
        return (self.$descriptor || '') === (other.$descriptor || '');
      },
      'hashCode()I': (self) => hashCode(self.$name || self.$descriptor || ''),
      'toString()Ljava/lang/String;': (self) => `class ${self.$name || descriptorToName(self.$descriptor || '')}`,
    },
  }),

  'Ljava/lang/CharSequence;': nativeDef('Ljava/lang/CharSequence;', { super: null }),

  'Ljava/lang/Runnable;': nativeDef('Ljava/lang/Runnable;', { super: null }),

  'Ljava/lang/Throwable;': nativeDef('Ljava/lang/Throwable;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function (vm, object) {
      this.message = object.$exceptionMessage || null;
    }),
    methods: {
      '<init>()V': (self) => undefined,
      '<init>(Ljava/lang/String;)V': (self, [message]) => {
        const text = message === null || message === undefined ? null : jsString(message);
        self.message = text;
        self.$exceptionMessage = text;
        if (self.object) self.object.$exceptionMessage = text;
      },
      'getMessage()Ljava/lang/String;': (self) => (self.message === null || self.message === undefined ? null : self.message),
      'getLocalizedMessage()Ljava/lang/String;': (self) => self.message ?? null,
      'toString()Ljava/lang/String;': (self) => self.message ?? 'Throwable',
      'printStackTrace()V': (self, _args, vm) => vm.log('error', 'java', self.message || 'Throwable'),
      'printStackTrace(Ljava/io/PrintWriter;)V': (self, [writer], vm) => {
        const text = self.message || 'Throwable';
        if (writer?.$peer?.writer !== undefined) {
          writeThrough(writer.$peer, text);
        }
        vm.log('error', 'java', text);
      },
      'printStackTrace(Ljava/io/PrintStream;)V': (self, [_stream], vm) => {
        vm.log('error', 'java', self.message || 'Throwable');
      },
      'getStackTrace()[Ljava/lang/StackTraceElement;': (self, _args, vm) => {
        const frames = (vm.methodStack || []).slice().reverse();
        const array = vm.newArray('[Ljava/lang/StackTraceElement;', frames.length);
        for (let i = 0; i < frames.length; i++) {
          const element = vm.allocateRawObject('Ljava/lang/StackTraceElement;');
          const full = frames[i];
          const dot = full.lastIndexOf('.');
          const className = dot < 0 ? full : full.slice(0, dot);
          const methodName = dot < 0 ? '' : full.slice(dot + 1);
          element.$peer = { className, methodName, fileName: null, lineNumber: -1 };
          array.$data[i] = element;
        }
        return array;
      },
      'setStackTrace([Ljava/lang/StackTraceElement;)V': (self, [stack]) => {
        self.stackTrace = stack;
      },
      'fillInStackTrace()Ljava/lang/Throwable;': (self) => self,
      'getCause()Ljava/lang/Throwable;': (self) => self.cause ?? null,
      'initCause(Ljava/lang/Throwable;)Ljava/lang/Throwable;': (self, [cause]) => {
        self.cause = cause;
        return self;
      },
      'addSuppressed(Ljava/lang/Throwable;)V': (self, [other]) => {
        if (!self.suppressed) self.suppressed = [];
        self.suppressed.push(other);
      },
      'getSuppressed()[Ljava/lang/Throwable;': (self, _args, vm) => {
        const list = self.suppressed || [];
        const array = vm.newArray('[Ljava/lang/Throwable;', list.length);
        for (let i = 0; i < list.length; i++) array.$data[i] = list[i];
        return array;
      },
    },
  }),
  'Ljava/lang/StackTraceElement;': nativeDef('Ljava/lang/StackTraceElement;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.className = '';
      this.methodName = '';
      this.fileName = null;
      this.lineNumber = -1;
    }),
    methods: {
      'getClassName()Ljava/lang/String;': (self) => self.className || '',
      'getMethodName()Ljava/lang/String;': (self) => self.methodName || '',
      'getFileName()Ljava/lang/String;': (self) => self.fileName ?? null,
      'getLineNumber()I': (self) => self.lineNumber ?? -1,
      'toString()Ljava/lang/String;': (self) => `${self.className || ''}.${self.methodName || ''}`,
    },
  }),

  'Ljava/lang/Exception;': nativeDef('Ljava/lang/Exception;', { super: 'Ljava/lang/Throwable;' }),
  'Ljava/lang/RuntimeException;': nativeDef('Ljava/lang/RuntimeException;', { super: 'Ljava/lang/Exception;' }),
  'Ljava/lang/IllegalStateException;': nativeDef('Ljava/lang/IllegalStateException;', { super: 'Ljava/lang/RuntimeException;' }),
  'Landroid/content/ActivityNotFoundException;': nativeDef('Landroid/content/ActivityNotFoundException;', { super: 'Ljava/lang/RuntimeException;' }),
  'Ljava/lang/NoSuchMethodException;': nativeDef('Ljava/lang/NoSuchMethodException;', { super: 'Ljava/lang/ReflectiveOperationException;' }),
  'Ljava/lang/NoSuchFieldException;': nativeDef('Ljava/lang/NoSuchFieldException;', { super: 'Ljava/lang/ReflectiveOperationException;' }),
  'Ljava/lang/ReflectiveOperationException;': nativeDef('Ljava/lang/ReflectiveOperationException;', { super: 'Ljava/lang/Exception;' }),
  'Ljava/lang/IllegalArgumentException;': nativeDef('Ljava/lang/IllegalArgumentException;', { super: 'Ljava/lang/RuntimeException;' }),
  'Ljava/lang/NullPointerException;': nativeDef('Ljava/lang/NullPointerException;', { super: 'Ljava/lang/RuntimeException;' }),
  'Ljava/lang/IndexOutOfBoundsException;': nativeDef('Ljava/lang/IndexOutOfBoundsException;', { super: 'Ljava/lang/RuntimeException;' }),
  'Ljava/lang/ArrayIndexOutOfBoundsException;': nativeDef('Ljava/lang/ArrayIndexOutOfBoundsException;', { super: 'Ljava/lang/IndexOutOfBoundsException;' }),
  'Ljava/lang/ClassCastException;': nativeDef('Ljava/lang/ClassCastException;', { super: 'Ljava/lang/RuntimeException;' }),
  'Ljava/lang/NumberFormatException;': nativeDef('Ljava/lang/NumberFormatException;', { super: 'Ljava/lang/IllegalArgumentException;' }),
  'Ljava/lang/ArithmeticException;': nativeDef('Ljava/lang/ArithmeticException;', { super: 'Ljava/lang/RuntimeException;' }),
  'Ljava/lang/UnsupportedOperationException;': nativeDef('Ljava/lang/UnsupportedOperationException;', { super: 'Ljava/lang/RuntimeException;' }),

  'Ljava/io/IOException;': nativeDef('Ljava/io/IOException;', { super: 'Ljava/lang/Exception;' }),
  'Ljava/io/FileNotFoundException;': nativeDef('Ljava/io/FileNotFoundException;', { super: 'Ljava/io/IOException;' }),
  'Ljava/io/EOFException;': nativeDef('Ljava/io/EOFException;', { super: 'Ljava/io/IOException;' }),
  'Ljava/io/InterruptedIOException;': nativeDef('Ljava/io/InterruptedIOException;', { super: 'Ljava/io/IOException;' }),
  'Ljava/io/UnsupportedEncodingException;': nativeDef('Ljava/io/UnsupportedEncodingException;', { super: 'Ljava/io/IOException;' }),
  'Ljava/net/MalformedURLException;': nativeDef('Ljava/net/MalformedURLException;', { super: 'Ljava/io/IOException;' }),
  'Ljava/net/UnknownHostException;': nativeDef('Ljava/net/UnknownHostException;', { super: 'Ljava/io/IOException;' }),
  'Ljava/net/SocketException;': nativeDef('Ljava/net/SocketException;', { super: 'Ljava/io/IOException;' }),
  'Ljava/net/ConnectException;': nativeDef('Ljava/net/ConnectException;', { super: 'Ljava/net/SocketException;' }),
  'Ljava/net/SocketTimeoutException;': nativeDef('Ljava/net/SocketTimeoutException;', { super: 'Ljava/io/InterruptedIOException;' }),
  'Ljava/net/URISyntaxException;': nativeDef('Ljava/net/URISyntaxException;', { super: 'Ljava/lang/Exception;' }),
  'Ljavax/net/ssl/SSLException;': nativeDef('Ljavax/net/ssl/SSLException;', { super: 'Ljava/io/IOException;' }),

  'Ljava/lang/String;': nativeDef('Ljava/lang/String;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function (vm, object) {
      if (object.$string === undefined) this.value = '';
    }, { value: '' }),
    methods: {
      '<init>()V': (self) => {
        self.value = '';
      },
      '<init>(Ljava/lang/String;)V': (self, [value]) => {
        self.value = jsString(value);
      },
      '<init>([B)V': (self, [bytes]) => {
        self.value = decodeUtf8Bytes(bytes);
      },
      '<init>([BLjava/lang/String;)V': (self, [bytes, charset]) => {
        self.value = decodeUtf8Bytes(bytes, charset);
      },
      'length()I': (self) => jsString(self).length,
      'charAt(I)C': (self, [index]) => jsString(self).charCodeAt(toInt(index)),
      'isEmpty()Z': (self) => jsString(self).length === 0,
      'isBlank()Z': (self) => jsString(self).trim().length === 0,
      'equals(Ljava/lang/Object;)Z': (self, [other]) => jsString(self) === jsString(other),
      'equalsIgnoreCase(Ljava/lang/String;)Z': (self, [other]) => jsString(self).toLowerCase() === jsString(other).toLowerCase(),
      'hashCode()I': (self) => hashCode(jsString(self)),
      'toString()Ljava/lang/String;': (self) => jsString(self),
      'intern()Ljava/lang/String;': (self) => jsString(self),
      'substring(I)Ljava/lang/String;': (self, [start]) => jsString(self).slice(toInt(start)),
      'substring(II)Ljava/lang/String;': (self, [start, end]) => jsString(self).slice(toInt(start), toInt(end)),
      'concat(Ljava/lang/String;)Ljava/lang/String;': (self, [other]) => jsString(self) + jsString(other),
      'indexOf(I)I': (self, [ch]) => jsString(self).indexOf(String.fromCharCode(toInt(ch))),
      'indexOf(Ljava/lang/String;)I': (self, [text]) => jsString(self).indexOf(jsString(text)),
      'indexOf(Ljava/lang/String;I)I': (self, [text, from]) => jsString(self).indexOf(jsString(text), toInt(from)),
      'indexOf(II)I': (self, [ch, from]) => jsString(self).indexOf(String.fromCharCode(toInt(ch)), toInt(from)),
      'lastIndexOf(I)I': (self, [ch]) => jsString(self).lastIndexOf(String.fromCharCode(toInt(ch))),
      'lastIndexOf(Ljava/lang/String;)I': (self, [text]) => jsString(self).lastIndexOf(jsString(text)),
      'lastIndexOf(Ljava/lang/String;I)I': (self, [text, from]) => jsString(self).lastIndexOf(jsString(text), toInt(from)),
      'lastIndexOf(II)I': (self, [ch, from]) => jsString(self).lastIndexOf(String.fromCharCode(toInt(ch)), toInt(from)),
      'startsWith(Ljava/lang/String;I)Z': (self, [text, offset]) => jsString(self).startsWith(jsString(text), toInt(offset)),
      'contains(Ljava/lang/CharSequence;)Z': (self, [text]) => jsString(self).includes(jsString(text)),
      'startsWith(Ljava/lang/String;)Z': (self, [text]) => jsString(self).startsWith(jsString(text)),
      'endsWith(Ljava/lang/String;)Z': (self, [text]) => jsString(self).endsWith(jsString(text)),
      'replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Ljava/lang/String;': (self, [from, toLog]) =>
        jsString(self).split(jsString(from)).join(jsString(toLog)),
      'replace(CC)Ljava/lang/String;': (self, [from, toLog]) =>
        jsString(self).split(String.fromCharCode(toInt(from))).join(String.fromCharCode(toInt(toLog))),
      'toUpperCase()Ljava/lang/String;': (self) => jsString(self).toUpperCase(),
      'toLowerCase()Ljava/lang/String;': (self) => jsString(self).toLowerCase(),
      'toUpperCase(Ljava/util/Locale;)Ljava/lang/String;': (self) => jsString(self).toUpperCase(),
      'toLowerCase(Ljava/util/Locale;)Ljava/lang/String;': (self) => jsString(self).toLowerCase(),
      'trim()Ljava/lang/String;': (self) => jsString(self).trim(),
      'split(Ljava/lang/String;)[Ljava/lang/String;': (self, [pattern], vm) => {
        const parts = javaSplit(jsString(self), jsString(pattern), 0);
        return vm.newArray('[Ljava/lang/String;', parts.length, parts);
      },
      'split(Ljava/lang/String;I)[Ljava/lang/String;': (self, [pattern, limit], vm) => {
        const parts = javaSplit(jsString(self), jsString(pattern), toInt(limit));
        return vm.newArray('[Ljava/lang/String;', parts.length, parts);
      },
      'replaceAll(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (self, [regex, replacement]) =>
        jsString(self).replace(new RegExp(jsString(regex), 'g'), javaRegexReplacement(jsString(replacement))),
      'replaceFirst(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (self, [regex, replacement]) =>
        jsString(self).replace(new RegExp(jsString(regex)), javaRegexReplacement(jsString(replacement))),
      'matches(Ljava/lang/String;)Z': (self, [pattern]) => {
        try {
          return new RegExp(`^(?:${jsString(pattern)})$`).test(jsString(self));
        } catch {
          return false;
        }
      },
      'toCharArray()[C': (self, _args, vm) => {
        const text = jsString(self);
        const array = vm.newArray('[C', text.length);
        for (let i = 0; i < text.length; i++) array.$data[i] = text.charCodeAt(i);
        return array;
      },
      'getBytes()[B': (self, _args, vm) => {
        const encoded = new TextEncoder().encode(jsString(self));
        const bytes = Array.from(encoded);
        if (vm) {
          const array = vm.newArray('[B', bytes.length);
          for (let i = 0; i < bytes.length; i++) array.$data[i] = bytes[i];
          return array;
        }
        return { $type: '[B', $data: bytes };
      },
      'compareTo(Ljava/lang/String;)I': (self, [other]) => {
        const a = jsString(self);
        const b = jsString(other);
        return a < b ? -1 : a > b ? 1 : 0;
      },
    },
    staticMethods: {
      'valueOf(I)Ljava/lang/String;': (_self, [value]) => String(toInt(value)),
      'valueOf(J)Ljava/lang/String;': (_self, [value]) => toLong(value).toString(),
      'valueOf(F)Ljava/lang/String;': (_self, [value]) => String(Number(value)),
      'valueOf(D)Ljava/lang/String;': (_self, [value]) => String(Number(value)),
      'valueOf(Z)Ljava/lang/String;': (_self, [value]) => (value ? 'true' : 'false'),
      'valueOf(C)Ljava/lang/String;': (_self, [value]) => String.fromCharCode(toInt(value)),
      'valueOf(Ljava/lang/Object;)Ljava/lang/String;': (_self, [value]) => (value === null ? 'null' : jsString(value)),
      'format(Ljava/util/Locale;Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;': (_self, [locale, format, args], vm) => formatJavaString(format, args, vm),
      'format(Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;': (_self, [format, args], vm) => formatJavaString(format, args, vm),
      'join(Ljava/lang/CharSequence;[Ljava/lang/CharSequence;)Ljava/lang/String;': (_self, [separator, parts]) =>
        (isJavaArray(parts) ? parts.$data : []).map(jsString).join(jsString(separator)),
    },
  }),

  'Ljava/lang/StringBuilder;': nativeDef('Ljava/lang/StringBuilder;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.parts = [];
    }, { parts: [] }),
    methods: {
      '<init>()V': (self) => {
        self.parts = [];
      },
      '<init>(Ljava/lang/String;)V': (self, [value]) => {
        self.parts = [jsString(value)];
      },
      '<init>(I)V': (self, [capacity]) => {
        self.parts = [];
        self.capacityValue = Math.max(0, toInt(capacity));
      },
      '<init>(Ljava/lang/CharSequence;)V': (self, [value]) => {
        self.parts = [jsString(value)];
      },
      'append(Ljava/lang/String;)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(jsString(value));
        return self.object || self;
      },
      'append(Ljava/lang/Object;)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(value === null ? 'null' : jsString(value));
        return self.object || self;
      },
      'append(Ljava/lang/CharSequence;)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(jsString(value));
        return self.object || self;
      },
      'append(C)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(String.fromCharCode(toInt(value)));
        return self.object || self;
      },
      'append(I)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(String(toInt(value)));
        return self.object || self;
      },
      'append(J)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(toLong(value).toString());
        return self.object || self;
      },
      'append(F)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(String(Number(value)));
        return self.object || self;
      },
      'append(D)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(String(Number(value)));
        return self.object || self;
      },
      'append(Z)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(value ? 'true' : 'false');
        return self.object || self;
      },
      'toString()Ljava/lang/String;': (self) => self.parts.join(''),
      'length()I': (self) => self.parts.join('').length,
      'reverse()Ljava/lang/StringBuilder;': (self) => {
        self.parts = [self.parts.join('').split('').reverse().join('')];
        return self.object || self;
      },
      'setLength(I)V': (self, [length]) => {
        const size = Math.max(0, toInt(length));
        const text = self.parts.join('');
        self.parts = [size <= text.length ? text.slice(0, size) : text + '\u0000'.repeat(size - text.length)];
      },
      'charAt(I)C': (self, [index]) => self.parts.join('').charCodeAt(toInt(index)),
      'insert(ILjava/lang/String;)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        self.parts = [text.slice(0, toInt(index)) + jsString(value) + text.slice(toInt(index))];
        return self.object || self;
      },
      'append(Ljava/lang/StringBuffer;)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(jsString(value));
        return self.object || self;
      },
      'append([C)Ljava/lang/StringBuilder;': (self, [chars]) => {
        self.parts.push(charArrayText(chars, 0, charArrayLength(chars)));
        return self.object || self;
      },
      'append([CII)Ljava/lang/StringBuilder;': (self, [chars, offset, length]) => {
        const start = toInt(offset);
        self.parts.push(charArrayText(chars, start, start + toInt(length)));
        return self.object || self;
      },
      'append(Ljava/lang/CharSequence;II)Ljava/lang/StringBuilder;': (self, [value, start, end]) => {
        self.parts.push(jsString(value).slice(toInt(start), toInt(end)));
        return self.object || self;
      },
      'appendCodePoint(I)Ljava/lang/StringBuilder;': (self, [value]) => {
        self.parts.push(String.fromCodePoint(toInt(value)));
        return self.object || self;
      },
      'delete(II)Ljava/lang/StringBuilder;': (self, [start, end]) => {
        const text = self.parts.join('');
        const from = Math.max(0, toInt(start));
        const to = Math.min(text.length, toInt(end));
        self.parts = [from >= to ? text : text.slice(0, from) + text.slice(to)];
        return self.object || self;
      },
      'deleteCharAt(I)Ljava/lang/StringBuilder;': (self, [index]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [at < 0 || at >= text.length ? text : text.slice(0, at) + text.slice(at + 1)];
        return self.object || self;
      },
      'replace(IILjava/lang/String;)Ljava/lang/StringBuilder;': (self, [start, end, value]) => {
        const text = self.parts.join('');
        const from = Math.max(0, toInt(start));
        const to = Math.min(text.length, toInt(end));
        self.parts = [text.slice(0, from) + jsString(value) + text.slice(to)];
        return self.object || self;
      },
      'insert(I[C)Ljava/lang/StringBuilder;': (self, [index, chars]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + charArrayText(chars, 0, charArrayLength(chars)) + text.slice(at)];
        return self.object || self;
      },
      'insert(I[CII)Ljava/lang/StringBuilder;': (self, [index, chars, offset, length]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        const from = toInt(offset);
        self.parts = [text.slice(0, at) + charArrayText(chars, from, from + toInt(length)) + text.slice(at)];
        return self.object || self;
      },
      'insert(ILjava/lang/CharSequence;)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + jsString(value) + text.slice(at)];
        return self.object || self;
      },
      'insert(ILjava/lang/CharSequence;II)Ljava/lang/StringBuilder;': (self, [index, value, start, end]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + jsString(value).slice(toInt(start), toInt(end)) + text.slice(at)];
        return self.object || self;
      },
      'insert(ILjava/lang/Object;)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + (value === null ? 'null' : jsString(value)) + text.slice(at)];
        return self.object || self;
      },
      'insert(IZ)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + (value ? 'true' : 'false') + text.slice(at)];
        return self.object || self;
      },
      'insert(IC)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + String.fromCharCode(toInt(value)) + text.slice(at)];
        return self.object || self;
      },
      'insert(II)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + String(toInt(value)) + text.slice(at)];
        return self.object || self;
      },
      'insert(IJ)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + toLong(value).toString() + text.slice(at)];
        return self.object || self;
      },
      'insert(IF)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + String(Number(value)) + text.slice(at)];
        return self.object || self;
      },
      'insert(ID)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        self.parts = [text.slice(0, at) + String(Number(value)) + text.slice(at)];
        return self.object || self;
      },
      'indexOf(Ljava/lang/String;)I': (self, [value]) => self.parts.join('').indexOf(jsString(value)),
      'indexOf(Ljava/lang/String;I)I': (self, [value, from]) => self.parts.join('').indexOf(jsString(value), Math.max(0, toInt(from))),
      'lastIndexOf(Ljava/lang/String;)I': (self, [value]) => self.parts.join('').lastIndexOf(jsString(value)),
      'lastIndexOf(Ljava/lang/String;I)I': (self, [value, from]) => self.parts.join('').lastIndexOf(jsString(value), Math.max(0, toInt(from))),
      'capacity()I': (self) => Math.max(self.capacityValue || 16, self.parts.join('').length),
      'ensureCapacity(I)V': (self, [capacity]) => {
        self.capacityValue = Math.max(self.capacityValue || 16, toInt(capacity), self.parts.join('').length);
      },
      'trimToSize()V': (self) => {
        self.capacityValue = self.parts.join('').length;
      },
      'codePointAt(I)I': (self, [index]) => codePointAtText(self.parts.join(''), toInt(index)),
      'codePointBefore(I)I': (self, [index]) => codePointBeforeText(self.parts.join(''), toInt(index)),
      'codePointCount(II)I': (self, [begin, end]) => countCodePointsText(self.parts.join(''), toInt(begin), toInt(end)),
      'offsetByCodePoints(II)I': (self, [index, offset]) => offsetByCodePoint(self.parts.join(''), toInt(index), toInt(offset)),
      'getChars(II[CI)V': (self, [start, end, target, targetStart]) => {
        const data = charArrayData(target);
        const text = self.parts.join('');
        const from = Math.max(0, toInt(start));
        const to = Math.min(text.length, toInt(end));
        let cursor = toInt(targetStart);
        for (let index = from; index < to; index++) data[cursor++] = text.charCodeAt(index);
      },
      'setCharAt(IC)V': (self, [index, value]) => {
        const text = self.parts.join('');
        const at = toInt(index);
        if (at < 0 || at >= text.length) return undefined;
        self.parts = [text.slice(0, at) + String.fromCharCode(toInt(value)) + text.slice(at + 1)];
        return undefined;
      },
      'subSequence(II)Ljava/lang/CharSequence;': (self, [start, end]) => self.parts.join('').slice(toInt(start), toInt(end)),
      'substring(I)Ljava/lang/String;': (self, [start]) => self.parts.join('').slice(toInt(start)),
      'substring(II)Ljava/lang/String;': (self, [start, end]) => self.parts.join('').slice(toInt(start), toInt(end)),
    },
  }),

  'Ljava/lang/Integer;': integerDef('Ljava/lang/Integer;', 32),
  'Ljava/lang/Long;': integerDef('Ljava/lang/Long;', 64),
  'Ljava/lang/Boolean;': nativeDef('Ljava/lang/Boolean;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function (vm, object) {
      this.value = false;
    }, { value: false }),
    methods: {
      '<init>(Z)V': (self, [value]) => {
        self.value = !!value;
      },
      'booleanValue()Z': (self) => !!self.value,
      'toString()Ljava/lang/String;': (self) => (self.value ? 'true' : 'false'),
    },
    staticMethods: {
      'valueOf(Z)Ljava/lang/Boolean;': (_self, [value], vm) =>
        vm.wrapPeer({ value: !!value, constructor: { $descriptor: 'Ljava/lang/Boolean;' } }),
      'toString(Z)Ljava/lang/String;': (_self, [value]) => (value ? 'true' : 'false'),
      'parseBoolean(Ljava/lang/String;)Z': (_self, [value]) => jsString(value).toLowerCase() === 'true',
      'getBoolean(Ljava/lang/String;)Z': (_self, [name], vm) => {
        const system = vm.getSystemProperty ? vm.getSystemProperty(jsString(name)) : null;
        return String(system ?? 'false').toLowerCase() === 'true';
      },
    },
    staticFields: new Map([
      ['TRUE:Ljava/lang/Boolean;', { lazy: (vm) => vm.wrapPeer({ value: true, constructor: { $descriptor: 'Ljava/lang/Boolean;' } }) }],
      ['FALSE:Ljava/lang/Boolean;', { lazy: (vm) => vm.wrapPeer({ value: false, constructor: { $descriptor: 'Ljava/lang/Boolean;' } }) }],
      ['TYPE:Ljava/lang/Class;', { lazy: (vm) => vm.getClassObject('Z') }],
    ]),
  }),
  'Ljava/lang/Float;': floatDef('Ljava/lang/Float;', 'F'),
  'Ljava/lang/Double;': floatDef('Ljava/lang/Double;', 'D'),
  'Ljava/lang/Character;': nativeDef('Ljava/lang/Character;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.value = 0;
    }, { value: 0 }),
    methods: {
      '<init>(C)V': (self, [value]) => {
        self.value = toInt(value) & 0xffff;
      },
      'charValue()C': (self) => (self.value | 0) & 0xffff,
      'toString()Ljava/lang/String;': (self) => String.fromCharCode((self.value | 0) & 0xffff),
      'hashCode()I': (self) => (self.value | 0) & 0xffff,
      'equals(Ljava/lang/Object;)Z': (self, [other]) => {
        const peer = other?.$peer ?? other;
        return peer && typeof peer.value === 'number' && (peer.value | 0) === (self.value | 0) ? 1 : 0;
      },
      'compareTo(Ljava/lang/Character;)I': (self, [other]) => {
        const peer = other?.$peer ?? other;
        return ((self.value | 0) - (Number(peer?.value) | 0)) | 0;
      },
    },
    staticMethods: {
      'valueOf(C)Ljava/lang/Character;': (_self, [value], vm) =>
        vm.wrapPeer({ value: toInt(value) & 0xffff, constructor: { $descriptor: 'Ljava/lang/Character;' } }),
      'toString(C)Ljava/lang/String;': (_self, [value]) => String.fromCharCode(toInt(value) & 0xffff),
      'hashCode(C)I': (_self, [value]) => toInt(value) & 0xffff,
      'compare(CC)I': (_self, [left, right]) => ((toInt(left) & 0xffff) - (toInt(right) & 0xffff)) | 0,
      'reverseBytes(C)C': (_self, [value]) => (((toInt(value) & 0xff) << 8) | ((toInt(value) >> 8) & 0xff)) & 0xffff,
      'isValidCodePoint(I)Z': (_self, [value]) => (toInt(value) >= 0 && toInt(value) <= 0x10ffff ? 1 : 0),
      'isBmpCodePoint(I)Z': (_self, [value]) => (toInt(value) >>> 16 === 0 && toInt(value) >= 0 ? 1 : 0),
      'isSupplementaryCodePoint(I)Z': (_self, [value]) => (toInt(value) >= 0x10000 && toInt(value) <= 0x10ffff ? 1 : 0),
      'isHighSurrogate(C)Z': (_self, [value]) => ((toInt(value) & 0xffff) >= 0xd800 && (toInt(value) & 0xffff) <= 0xdbff ? 1 : 0),
      'isLowSurrogate(C)Z': (_self, [value]) => ((toInt(value) & 0xffff) >= 0xdc00 && (toInt(value) & 0xffff) <= 0xdfff ? 1 : 0),
      'isSurrogate(C)Z': (_self, [value]) => ((toInt(value) & 0xffff) >= 0xd800 && (toInt(value) & 0xffff) <= 0xdfff ? 1 : 0),
      'isSurrogatePair(CC)Z': (_self, [high, low]) =>
        ((toInt(high) & 0xffff) >= 0xd800 && (toInt(high) & 0xffff) <= 0xdbff
          && (toInt(low) & 0xffff) >= 0xdc00 && (toInt(low) & 0xffff) <= 0xdfff ? 1 : 0),
      'charCount(I)I': (_self, [value]) => (toInt(value) >= 0x10000 ? 2 : 1),
      'toCodePoint(CC)I': (_self, [high, low]) =>
        ((((toInt(high) & 0xffff) - 0xd800) << 10) + ((toInt(low) & 0xffff) - 0xdc00) + 0x10000) | 0,
      'highSurrogate(I)C': (_self, [value]) => (((toInt(value) >>> 10) + 0xd7c0) & 0xffff),
      'lowSurrogate(I)C': (_self, [value]) => (((toInt(value) & 0x3ff) + 0xdc00) & 0xffff),
      'toChars(I[CI)I': (_self, [value, target, index]) => {
        const code = toInt(value);
        const data = Array.isArray(target?.$data) ? target.$data : [];
        const at = toInt(index);
        if (code >= 0x10000) {
          data[at] = (code >>> 10) + 0xd7c0;
          data[at + 1] = (code & 0x3ff) + 0xdc00;
          return 2;
        }
        data[at] = code & 0xffff;
        return 1;
      },
      'toChars(I)[C': (_self, [value], vm) => {
        const code = toInt(value);
        const chars = code >= 0x10000
          ? [(code >>> 10) + 0xd7c0, (code & 0x3ff) + 0xdc00]
          : [code & 0xffff];
        return vm.newArray('[C', chars.length, chars);
      },
      'codePointAt(Ljava/lang/CharSequence;I)I': (_self, [text, index]) => codePointAtText(jsString(text), toInt(index)),
      'codePointAt([CI)I': (_self, [chars, index]) => codePointAtChars(chars, toInt(index), charArrayLength(chars)),
      'codePointAt([CII)I': (_self, [chars, index, limit]) => codePointAtChars(chars, toInt(index), toInt(limit)),
      'codePointBefore(Ljava/lang/CharSequence;I)I': (_self, [text, index]) => codePointBeforeText(jsString(text), toInt(index)),
      'codePointBefore([CI)I': (_self, [chars, index]) => codePointBeforeChars(chars, toInt(index)),
      'codePointBefore([CII)I': (_self, [chars, index, start]) => codePointBeforeChars(chars, toInt(index), toInt(start)),
      'codePointCount(Ljava/lang/CharSequence;II)I': (_self, [text, begin, end]) =>
        countCodePointsText(jsString(text), toInt(begin), toInt(end)),
      'codePointCount([CII)I': (_self, [chars, begin, end]) => countCodePointsChars(chars, toInt(begin), toInt(end)),
      'offsetByCodePoints(Ljava/lang/CharSequence;II)I': (_self, [text, index, offset]) =>
        offsetByCodePoint(jsString(text), toInt(index), toInt(offset)),
      'offsetByCodePoints([CIIII)I': (_self, [chars, start, count, index, offset]) =>
        offsetByCodePoint(charArrayText(chars, toInt(start), toInt(start) + toInt(count)), toInt(index) - toInt(start), toInt(offset)) + toInt(start),
      'isLowerCase(C)Z': (_self, [value]) => charMatches(toInt(value), /\p{Ll}/u),
      'isLowerCase(I)Z': (_self, [value]) => charMatches(toInt(value), /\p{Ll}/u),
      'isUpperCase(C)Z': (_self, [value]) => charMatches(toInt(value), /\p{Lu}/u),
      'isUpperCase(I)Z': (_self, [value]) => charMatches(toInt(value), /\p{Lu}/u),
      'isTitleCase(C)Z': (_self, [value]) => charMatches(toInt(value), /\p{Lt}/u),
      'isTitleCase(I)Z': (_self, [value]) => charMatches(toInt(value), /\p{Lt}/u),
      'isDigit(C)Z': (_self, [value]) => charMatches(toInt(value), /\p{Nd}/u),
      'isDigit(I)Z': (_self, [value]) => charMatches(toInt(value), /\p{Nd}/u),
      'isDefined(C)Z': (_self, [value]) => (isDefinedCodePoint(toInt(value)) ? 1 : 0),
      'isDefined(I)Z': (_self, [value]) => (isDefinedCodePoint(toInt(value)) ? 1 : 0),
      'isLetter(C)Z': (_self, [value]) => charMatches(toInt(value), /\p{L}/u),
      'isLetter(I)Z': (_self, [value]) => charMatches(toInt(value), /\p{L}/u),
      'isLetterOrDigit(C)Z': (_self, [value]) => charMatches(toInt(value), /[\p{L}\p{Nd}]/u),
      'isLetterOrDigit(I)Z': (_self, [value]) => charMatches(toInt(value), /[\p{L}\p{Nd}]/u),
      'isJavaLetter(C)Z': (_self, [value]) => charMatches(toInt(value), /[\p{L}\p{Nl}$_]/u),
      'isJavaLetterOrDigit(C)Z': (_self, [value]) => charMatches(toInt(value), /[\p{L}\p{Nl}$_\p{Nd}\p{Mn}\p{Mc}\p{Pc}\p{Cf}]/u),
      'isAlphabetic(I)Z': (_self, [value]) => charMatches(toInt(value), /[\p{L}\p{Nl}]/u),
      'isIdeographic(I)Z': (_self, [value]) => (isIdeographicCodePoint(toInt(value)) ? 1 : 0),
      'isJavaIdentifierStart(C)Z': (_self, [value]) => charMatches(toInt(value), /[\p{L}\p{Nl}$_]/u),
      'isJavaIdentifierStart(I)Z': (_self, [value]) => charMatches(toInt(value), /[\p{L}\p{Nl}$_]/u),
      'isJavaIdentifierPart(C)Z': (_self, [value]) => (isJavaIdentifierPartCodePoint(toInt(value)) ? 1 : 0),
      'isJavaIdentifierPart(I)Z': (_self, [value]) => (isJavaIdentifierPartCodePoint(toInt(value)) ? 1 : 0),
      'isUnicodeIdentifierStart(C)Z': (_self, [value]) => charMatches(toInt(value), /[\p{L}\p{Nl}]/u),
      'isUnicodeIdentifierStart(I)Z': (_self, [value]) => charMatches(toInt(value), /[\p{L}\p{Nl}]/u),
      'isUnicodeIdentifierPart(C)Z': (_self, [value]) => (isUnicodeIdentifierPartCodePoint(toInt(value)) ? 1 : 0),
      'isUnicodeIdentifierPart(I)Z': (_self, [value]) => (isUnicodeIdentifierPartCodePoint(toInt(value)) ? 1 : 0),
      'isIdentifierIgnorable(C)Z': (_self, [value]) => (isIdentifierIgnorableCodePoint(toInt(value)) ? 1 : 0),
      'isIdentifierIgnorable(I)Z': (_self, [value]) => (isIdentifierIgnorableCodePoint(toInt(value)) ? 1 : 0),
      'toLowerCase(C)C': (_self, [value]) => charTransform(toInt(value), (text) => text.toLowerCase()),
      'toLowerCase(I)I': (_self, [value]) => charTransform(toInt(value), (text) => text.toLowerCase()),
      'toUpperCase(C)C': (_self, [value]) => charTransform(toInt(value), (text) => text.toUpperCase()),
      'toUpperCase(I)I': (_self, [value]) => charTransform(toInt(value), (text) => text.toUpperCase()),
      'toTitleCase(C)C': (_self, [value]) => charTransform(toInt(value), (text) => text.toUpperCase()),
      'toTitleCase(I)I': (_self, [value]) => charTransform(toInt(value), (text) => text.toUpperCase()),
      'digit(CI)I': (_self, [value, radix]) => digitValueOf(toInt(value) & 0xffff, toInt(radix)),
      'digit(II)I': (_self, [value, radix]) => digitValueOf(toInt(value), toInt(radix)),
      'getNumericValue(C)I': (_self, [value]) => numericValueOf(toInt(value) & 0xffff),
      'getNumericValue(I)I': (_self, [value]) => numericValueOf(toInt(value)),
      'isSpace(C)Z': (_self, [value]) => (toInt(value) === 0x20 ? 1 : 0),
      'isSpaceChar(C)Z': (_self, [value]) => charMatches(toInt(value), /\p{Z}/u),
      'isSpaceChar(I)Z': (_self, [value]) => charMatches(toInt(value), /\p{Z}/u),
      'isWhitespace(C)Z': (_self, [value]) => (isWhitespaceCodePoint(toInt(value)) ? 1 : 0),
      'isWhitespace(I)Z': (_self, [value]) => (isWhitespaceCodePoint(toInt(value)) ? 1 : 0),
      'isISOControl(C)Z': (_self, [value]) => (isIsoControl(toInt(value)) ? 1 : 0),
      'isISOControl(I)Z': (_self, [value]) => (isIsoControl(toInt(value)) ? 1 : 0),
      'getType(C)I': (_self, [value]) => charTypeOf(toInt(value) & 0xffff),
      'getType(I)I': (_self, [value]) => charTypeOf(toInt(value)),
      'forDigit(II)C': (_self, [digit, radix]) => {
        const value = toInt(digit);
        const base = toInt(radix);
        if (base < 2 || base > 36 || value < 0 || value >= base) return 0;
        return (value < 10 ? 0x30 + value : 0x61 + value - 10) & 0xffff;
      },
      'getDirectionality(C)B': (_self, [value]) => directionalityOf(toInt(value) & 0xffff),
      'getDirectionality(I)B': (_self, [value]) => directionalityOf(toInt(value)),
      'isMirrored(C)Z': (_self, [value]) => (isMirroredCodePoint(toInt(value) & 0xffff) ? 1 : 0),
      'isMirrored(I)Z': (_self, [value]) => (isMirroredCodePoint(toInt(value)) ? 1 : 0),
      'getName(I)Ljava/lang/String;': (_self, [value]) => characterName(toInt(value)),
    },
    staticFields: new Map([
      ['TYPE:Ljava/lang/Class;', { lazy: (vm) => vm.getClassObject('C') }],
      ['MIN_VALUE:C', 0],
      ['MAX_VALUE:C', 0xffff],
      ['MIN_RADIX:I', 2],
      ['MAX_RADIX:I', 36],
      ['SIZE:B', 16],
      ['BYTES:B', 2],
      ['MIN_CODE_POINT:I', 0],
      ['MAX_CODE_POINT:I', 0x10ffff],
      ['MIN_SUPPLEMENTARY_CODE_POINT:I', 0x10000],
      ['MIN_HIGH_SURROGATE:C', 0xd800],
      ['MAX_HIGH_SURROGATE:C', 0xdbff],
      ['MIN_LOW_SURROGATE:C', 0xdc00],
      ['MAX_LOW_SURROGATE:C', 0xdfff],
      ['MIN_SURROGATE:C', 0xd800],
      ['MAX_SURROGATE:C', 0xdfff],
    ]),
  }),

  'Ljava/lang/System;': nativeDef('Ljava/lang/System;', {
    super: 'Ljava/lang/Object;',
    staticMethods: {
      'currentTimeMillis()J': () => BigInt(Date.now()),
      'nanoTime()J': () => BigInt(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) * 1e6)),
      'lineSeparator()Ljava/lang/String;': () => '\n',
      'exit(I)V': (_self, [code], vm) => vm.log('warn', 'System', `exit(${code}) 被忽略`),
      'gc()V': () => undefined,
      'getProperty(Ljava/lang/String;)Ljava/lang/String;': (_self, [key]) => {
        const name = jsString(key);
        if (name === 'java.version') return '0';
        if (name === 'line.separator') return '\n';
        return null;
      },
      'getProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (_self, [key, fallback]) => {
        const name = jsString(key);
        if (name === 'java.version') return '0';
        if (name === 'line.separator') return '\n';
        return fallback ?? null;
      },
      'setProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (_self, [key, value]) => {
        return value ?? null;
      },
      'getenv(Ljava/lang/String;)Ljava/lang/String;': () => null,
      'identityHashCode(Ljava/lang/Object;)I': (_self, [value], vm) => vm.identityHash(value),
      'arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V': (_self, [src, srcPos, dst, dstPos, length]) => {
        if (!isJavaArray(src) || !isJavaArray(dst)) return;
        const from = toInt(srcPos);
        const to = toInt(dstPos);
        const count = toInt(length);
        const same = src === dst || src.$data === dst.$data;
        if (same && to > from && to < from + count) {
          for (let i = count - 1; i >= 0; i--) dst.$data[to + i] = src.$data[from + i];
        } else {
          for (let i = 0; i < count; i++) dst.$data[to + i] = src.$data[from + i];
        }
      },
    },
    staticFields: new Map([
      ['out:Ljava/io/PrintStream;', { $descriptor: 'Ljava/io/PrintStream;' }],
      ['err:Ljava/io/PrintStream;', { $descriptor: 'Ljava/io/PrintStream;' }],
    ]),
  }),

  'Ljava/io/PrintStream;': nativeDef('Ljava/io/PrintStream;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'println(Ljava/lang/String;)V': (self, [value], vm) => vm.log('info', 'System.out', jsString(value)),
      'println(Ljava/lang/Object;)V': (self, [value], vm) => vm.log('info', 'System.out', jsString(value)),
      'println(I)V': (self, [value], vm) => vm.log('info', 'System.out', String(toInt(value))),
      'println(J)V': (self, [value], vm) => vm.log('info', 'System.out', toLong(value).toString()),
      'println(Z)V': (self, [value], vm) => vm.log('info', 'System.out', value ? 'true' : 'false'),
      'println(D)V': (self, [value], vm) => vm.log('info', 'System.out', String(Number(value))),
      'println(F)V': (self, [value], vm) => vm.log('info', 'System.out', String(Number(value))),
      'println()V': (self, _args, vm) => vm.log('info', 'System.out', ''),
      'print(Ljava/lang/String;)V': (self, [value], vm) => vm.log('info', 'System.out', jsString(value)),
      'print(Ljava/lang/Object;)V': (self, [value], vm) => vm.log('info', 'System.out', jsString(value)),
      'print(I)V': (self, [value], vm) => vm.log('info', 'System.out', String(toInt(value))),
    },
  }),

  'Ljava/lang/Math;': nativeDef('Ljava/lang/Math;', {
    super: 'Ljava/lang/Object;',
    staticMethods: {
      'abs(I)I': (_self, [v]) => Math.abs(toInt(v)),
      'abs(J)J': (_self, [v]) => (toLong(v) < 0n ? -toLong(v) : toLong(v)),
      'abs(F)F': (_self, [v]) => Math.abs(Number(v)),
      'abs(D)D': (_self, [v]) => Math.abs(Number(v)),
      'max(II)I': (_self, [a, b]) => Math.max(toInt(a), toInt(b)),
      'max(JJ)J': (_self, [a, b]) => (toLong(a) > toLong(b) ? toLong(a) : toLong(b)),
      'max(FF)F': (_self, [a, b]) => Math.max(Number(a), Number(b)),
      'max(DD)D': (_self, [a, b]) => Math.max(Number(a), Number(b)),
      'min(II)I': (_self, [a, b]) => Math.min(toInt(a), toInt(b)),
      'min(JJ)J': (_self, [a, b]) => (toLong(a) < toLong(b) ? toLong(a) : toLong(b)),
      'min(FF)F': (_self, [a, b]) => Math.min(Number(a), Number(b)),
      'min(DD)D': (_self, [a, b]) => Math.min(Number(a), Number(b)),
      'sqrt(D)D': (_self, [v]) => Math.sqrt(Number(v)),
      'pow(DD)D': (_self, [a, b]) => Math.pow(Number(a), Number(b)),
      'floor(D)D': (_self, [v]) => Math.floor(Number(v)),
      'ceil(D)D': (_self, [v]) => Math.ceil(Number(v)),
      'round(D)J': (_self, [v]) => BigInt(Math.round(Number(v))),
      'round(F)I': (_self, [v]) => Math.round(Number(v)),
      'random()D': () => Math.random(),
      'sin(D)D': (_self, [v]) => Math.sin(Number(v)),
      'cos(D)D': (_self, [v]) => Math.cos(Number(v)),
      'tan(D)D': (_self, [v]) => Math.tan(Number(v)),
      'log(D)D': (_self, [v]) => Math.log(Number(v)),
      'log10(D)D': (_self, [v]) => Math.log10(Number(v)),
      'exp(D)D': (_self, [v]) => Math.exp(Number(v)),
      'toRadians(D)D': (_self, [v]) => (Number(v) * Math.PI) / 180,
      'toDegrees(D)D': (_self, [v]) => (Number(v) * 180) / Math.PI,
      'atan(D)D': (_self, [v]) => Math.atan(Number(v)),
      'atan2(DD)D': (_self, [a, b]) => Math.atan2(Number(a), Number(b)),
      'asin(D)D': (_self, [v]) => Math.asin(Number(v)),
      'acos(D)D': (_self, [v]) => Math.acos(Number(v)),
      'hypot(DD)D': (_self, [a, b]) => Math.hypot(Number(a), Number(b)),
      'cbrt(D)D': (_self, [v]) => Math.cbrt(Number(v)),
      'signum(D)D': (_self, [v]) => Math.sign(Number(v)),
      'signum(F)F': (_self, [v]) => Math.sign(Number(v)),
      'IEEEremainder(DD)D': (_self, [a, b]) => ieeeRemainder(Number(a), Number(b)),
      'rint(D)D': (_self, [v]) => roundHalfEven(Number(v)),
      'sinh(D)D': (_self, [v]) => Math.sinh(Number(v)),
      'cosh(D)D': (_self, [v]) => Math.cosh(Number(v)),
      'tanh(D)D': (_self, [v]) => Math.tanh(Number(v)),
      'expm1(D)D': (_self, [v]) => Math.expm1(Number(v)),
      'log1p(D)D': (_self, [v]) => Math.log1p(Number(v)),
      'addExact(II)I': (_self, [a, b], vm) => exactInt(vm, toInt(a) + toInt(b)),
      'addExact(JJ)J': (_self, [a, b]) => BigInt.asIntN(64, toLong(a) + toLong(b)),
      'subtractExact(II)I': (_self, [a, b], vm) => exactInt(vm, toInt(a) - toInt(b)),
      'subtractExact(JJ)J': (_self, [a, b]) => BigInt.asIntN(64, toLong(a) - toLong(b)),
      'multiplyExact(II)I': (_self, [a, b], vm) => exactInt(vm, toInt(a) * toInt(b)),
      'multiplyExact(JI)J': (_self, [a, b]) => BigInt.asIntN(64, toLong(a) * BigInt(toInt(b))),
      'multiplyExact(JJ)J': (_self, [a, b]) => BigInt.asIntN(64, toLong(a) * toLong(b)),
      'incrementExact(I)I': (_self, [a], vm) => exactInt(vm, toInt(a) + 1),
      'incrementExact(J)J': (_self, [a]) => BigInt.asIntN(64, toLong(a) + 1n),
      'decrementExact(I)I': (_self, [a], vm) => exactInt(vm, toInt(a) - 1),
      'decrementExact(J)J': (_self, [a]) => BigInt.asIntN(64, toLong(a) - 1n),
      'negateExact(I)I': (_self, [a], vm) => exactInt(vm, -toInt(a)),
      'negateExact(J)J': (_self, [a]) => BigInt.asIntN(64, -toLong(a)),
      'toIntExact(J)I': (_self, [a], vm) => {
        const value = toLong(a);
        if (value < -2147483648n || value > 2147483647n) {
          vm.throwException?.('Ljava/lang/ArithmeticException;', 'integer overflow');
          return 0;
        }
        return Number(value);
      },
      'multiplyFull(II)J': (_self, [a, b]) => toLong(toInt(a)) * toLong(toInt(b)),
      'multiplyHigh(JJ)J': (_self, [a, b]) => BigInt.asIntN(64, (toLong(a) * toLong(b)) >> 64n),
      'floorDiv(II)I': (_self, [a, b]) => Math.floor(toInt(a) / toInt(b)),
      'floorDiv(JI)J': (_self, [a, b]) => floorDivLong(toLong(a), toLong(toInt(b))),
      'floorDiv(JJ)J': (_self, [a, b]) => floorDivLong(toLong(a), toLong(b)),
      'floorMod(II)I': (_self, [a, b]) => {
        const divisor = toInt(b);
        return ((toInt(a) % divisor) + divisor) % divisor;
      },
      'floorMod(JI)I': (_self, [a, b]) => Number(floorModLong(toLong(a), toLong(toInt(b)))),
      'floorMod(JJ)J': (_self, [a, b]) => floorModLong(toLong(a), toLong(b)),
      'ulp(D)D': (_self, [v]) => ulpDouble(Number(v)),
      'ulp(F)F': (_self, [v]) => ulpFloat(Number(v)),
      'copySign(DD)D': (_self, [magnitude, sign]) => Math.abs(Number(magnitude)) * (Number(sign) < 0 || Object.is(Number(sign), -0) ? -1 : 1),
      'copySign(FF)F': (_self, [magnitude, sign]) => Math.abs(Number(magnitude)) * (Number(sign) < 0 || Object.is(Number(sign), -0) ? -1 : 1),
      'getExponent(F)I': (_self, [v]) => exponentOf(Number(v), 23, 8),
      'getExponent(D)I': (_self, [v]) => exponentOf(Number(v), 52, 11),
      'nextAfter(DD)D': (_self, [start, direction]) => nextAfterNumber(Number(start), Number(direction), false),
      'nextAfter(FD)F': (_self, [start, direction]) => nextAfterNumber(Number(start), Number(direction), true),
      'nextUp(D)D': (_self, [v]) => nextAfterNumber(Number(v), Infinity, false),
      'nextUp(F)F': (_self, [v]) => nextAfterNumber(Number(v), Infinity, true),
      'nextDown(D)D': (_self, [v]) => nextAfterNumber(Number(v), -Infinity, false),
      'nextDown(F)F': (_self, [v]) => nextAfterNumber(Number(v), -Infinity, true),
      'scalb(DI)D': (_self, [value, scale]) => Number(value) * Math.pow(2, toInt(scale)),
      'scalb(FI)F': (_self, [value, scale]) => Number(value) * Math.pow(2, toInt(scale)),
    },
    staticFields: new Map([['PI:D', Math.PI], ['E:D', Math.E]]),
  }),

  'Ljava/math/BigDecimal;': nativeDef('Ljava/math/BigDecimal;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.value = 0;
    }, { value: 0 }),
    methods: {
      '<init>(D)V': (self, [v]) => {
        self.value = Number(v) || 0;
      },
      '<init>(I)V': (self, [v]) => {
        self.value = toInt(v);
      },
      '<init>(J)V': (self, [v]) => {
        self.value = Number(toLong(v));
      },
      '<init>(Ljava/lang/String;)V': (self, [v]) => {
        self.value = Number(jsString(v)) || 0;
      },
      '<init>(Ljava/math/BigInteger;)V': (self, [v]) => {
        self.value = Number(v?.$peer?.value ?? v?.value ?? 0) || 0;
      },
      'setScale(I)Ljava/math/BigDecimal;': (self) => self.object || self,
      'setScale(ILjava/math/RoundingMode;)Ljava/math/BigDecimal;': (self) => self.object || self,
      'setScale(ILjava/lang/Object;)Ljava/math/BigDecimal;': (self) => self.object || self,
      'setScale(ILjava/math/RoundingMode;Z)Ljava/math/BigDecimal;': (self) => self.object || self,
      'multiply(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;': (self, [other]) => {
        self.value = self.value * (other?.$peer?.value ?? other?.value ?? 0);
        return self.object || self;
      },
      'divide(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;': (self, [other]) => {
        const d = other?.$peer?.value ?? other?.value ?? 0;
        self.value = d === 0 ? 0 : self.value / d;
        return self.object || self;
      },
      'add(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;': (self, [other]) => {
        self.value = self.value + (other?.$peer?.value ?? other?.value ?? 0);
        return self.object || self;
      },
      'subtract(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;': (self, [other]) => {
        self.value = self.value - (other?.$peer?.value ?? other?.value ?? 0);
        return self.object || self;
      },
      'doubleValue()D': (self) => Number(self.value) || 0,
      'floatValue()F': (self) => Number(self.value) || 0,
      'intValue()I': (self) => self.value | 0,
      'longValue()J': (self) => BigInt(Math.trunc(Number(self.value) || 0)),
      'toString()Ljava/lang/String;': (self) => String(self.value),
      'toPlainString()Ljava/lang/String;': (self) => String(self.value),
      'compareTo(Ljava/math/BigDecimal;)I': (self, [other]) => {
        const o = other?.$peer?.value ?? other?.value ?? 0;
        return self.value > o ? 1 : self.value < o ? -1 : 0;
      },
      'equals(Ljava/lang/Object;)Z': (self, [other]) => {
        const o = other?.$peer?.value ?? other?.value;
        return o !== undefined && self.value === o;
      },
      'intValueExact()I': (self) => self.value | 0,
      'longValueExact()J': (self) => BigInt(Math.trunc(Number(self.value) || 0)),
    },
  }),

  'Ljava/lang/ref/Reference;': nativeDef('Ljava/lang/ref/Reference;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.referent = null;
    }, { referent: null }),
    methods: {
      '<init>(Ljava/lang/Object;)V': (self, [referent]) => {
        self.referent = referent ?? null;
      },
      'get()Ljava/lang/Object;': (self) => self.referent ?? null,
      'clear()V': (self) => {
        self.referent = null;
      },
      'isEnqueued()Z': () => false,
    },
  }),
  'Ljava/lang/ref/WeakReference;': nativeDef('Ljava/lang/ref/WeakReference;', {
    super: 'Ljava/lang/ref/Reference;',
    ctor: peerClass(function () {
      this.referent = null;
    }, { referent: null }),
    methods: {
      '<init>(Ljava/lang/Object;)V': (self, [referent]) => {
        self.referent = referent ?? null;
      },
      'get()Ljava/lang/Object;': (self) => self.referent ?? null,
    },
  }),
  'Ljava/lang/ref/SoftReference;': nativeDef('Ljava/lang/ref/SoftReference;', {
    super: 'Ljava/lang/ref/Reference;',
    ctor: peerClass(function () {
      this.referent = null;
    }, { referent: null }),
    methods: {
      '<init>(Ljava/lang/Object;)V': (self, [referent]) => {
        self.referent = referent ?? null;
      },
      'get()Ljava/lang/Object;': (self) => self.referent ?? null,
    },
  }),
  'Ljava/lang/Enum;': nativeDef('Ljava/lang/Enum;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.name = '';
      this.ordinal = 0;
    }, { name: '', ordinal: 0 }),
    methods: {
      '<init>(Ljava/lang/String;I)V': (self, [name, ordinal]) => {
        self.name = jsString(name);
        self.ordinal = toInt(ordinal);
      },
      'name()Ljava/lang/String;': (self) => self.name ?? '',
      'ordinal()I': (self) => toInt(self.ordinal),
      'toString()Ljava/lang/String;': (self) => self.name ?? '',
      'compareTo(Ljava/lang/Enum;)I': (self, [other], vm) => {
        const otherOrdinal = (() => {
          if (other === null || other === undefined) return 0;
          if (typeof other === 'object') {
            if (other.$peer && other.$peer !== other) return toInt(other.$peer.ordinal);
            if (other.ordinal !== undefined) return toInt(other.ordinal);
          }
          return 0;
        })();
        return toInt(self.ordinal) - otherOrdinal;
      },
      'equals(Ljava/lang/Object;)Z': (self, [other]) => self.$object === other,
      'hashCode()I': (self) => hashCode(self.$object),
    },
  }),
  'Ljava/lang/Thread$UncaughtExceptionHandler;': nativeDef('Ljava/lang/Thread$UncaughtExceptionHandler;', { super: null }),
  'Ljava/lang/Thread;': nativeDef('Ljava/lang/Thread;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.runnable = null;
      this.threadName = '';
    }, { runnable: null, threadName: '' }),
    methods: {
      '<init>()V': () => {},
      '<init>(Ljava/lang/Runnable;)V': (self, [runnable]) => {
        self.runnable = runnable ?? null;
      },
      '<init>(Ljava/lang/Runnable;Ljava/lang/String;)V': (self, [runnable, name]) => {
        self.runnable = runnable ?? null;
        self.threadName = jsString(name);
      },
      '<init>(Ljava/lang/String;)V': (self, [name]) => {
        self.threadName = jsString(name);
      },
      'run()V': (self, _args, vm) => {
        if (self.runnable) vm.runRunnable(self.runnable);
      },
      'start()V': (self, _args, vm) => {
        const task = () => {
          try {
            if (self.runnable) {
              vm.runRunnable(self.runnable);
              return;
            }
            const object = self.$object || self.object || null;
            if (object && typeof vm.invokeByName === 'function') {
              vm.invokeByName('run', '()V', object, []);
            }
          } catch (error) {
            if (!error || error.message !== 'vm-thread-exit') throw error;
          }
        };
        const queue = vm.messageQueue;
        if (queue && typeof queue.post === 'function') queue.post(task, 0);
        else setTimeout(task, 0);
      },
      'startAsync()V': (self, _args, vm) => {
        const object = self.$object || self.object || null;
        if (object && typeof vm.invokeByName === 'function') vm.invokeByName('run', '()V', object, []);
      },
      'getName()Ljava/lang/String;': (self) => self.threadName || 'main',
      'setName(Ljava/lang/String;)V': (self, [name]) => {
        self.threadName = jsString(name);
      },
      'join()V': () => {},
      'interrupt()V': () => {},
      'isAlive()Z': () => false,
      'getStackTrace()[Ljava/lang/StackTraceElement;': (self, _args, vm) => {
        const frames = (vm.methodStack || []).slice().reverse();
        const array = vm.newArray('[Ljava/lang/StackTraceElement;', frames.length);
        for (let i = 0; i < frames.length; i++) {
          const element = vm.allocateRawObject('Ljava/lang/StackTraceElement;');
          const full = frames[i];
          const dot = full.lastIndexOf('.');
          const className = dot < 0 ? full : full.slice(0, dot);
          const methodName = dot < 0 ? '' : full.slice(dot + 1);
          element.$peer = { className, methodName, fileName: null, lineNumber: -1 };
          array.$data[i] = element;
        }
        return array;
      },
    },
    staticMethods: {
      'currentThread()Ljava/lang/Thread;': (_self, _args, vm) => vm.currentThreadObject?.() ?? vm.wrapPeer({
        constructor: { $descriptor: 'Ljava/lang/Thread;' },
        threadName: 'main',
      }),
      'sleep(J)V': () => {},
      'getDefaultUncaughtExceptionHandler()Ljava/lang/Thread$UncaughtExceptionHandler;': () => null,
      'setDefaultUncaughtExceptionHandler(Ljava/lang/Thread$UncaughtExceptionHandler;)V': () => {},
    },
  }),
  'Ljava/util/Objects;': nativeDef('Ljava/util/Objects;', {
    super: 'Ljava/lang/Object;',
    staticMethods: {
      'equals(Ljava/lang/Object;Ljava/lang/Object;)Z': (_self, [a, b]) => a === b,
      'hashCode(Ljava/lang/Object;)I': (_self, [v]) => hashCode(v),
      'requireNonNull(Ljava/lang/Object;)Ljava/lang/Object;': (_self, [v], vm) => {
        if (v === null) vm.throwException('Ljava/lang/NullPointerException;', 'requireNonNull');
        return v;
      },
      'requireNonNull(Ljava/lang/Object;Ljava/lang/String;)Ljava/lang/Object;': (_self, [v, message], vm) => {
        if (v === null) vm.throwException('Ljava/lang/NullPointerException;', jsString(message));
        return v;
      },
      'requireNonNull(Ljava/lang/Object;Ljava/util/function/Supplier;)Ljava/lang/Object;': (_self, [v, _supplier], vm) => {
        if (v === null) vm.throwException('Ljava/lang/NullPointerException;', 'requireNonNull');
        return v;
      },
      'toString(Ljava/lang/Object;)Ljava/lang/String;': (_self, [v]) => (v === null ? 'null' : jsString(v)),
    },
  }),

  'Ljava/util/ArrayList;': nativeDef('Ljava/util/ArrayList;', {
    super: 'Ljava/lang/Object;',
    interfaces: ['Ljava/util/List;', 'Ljava/util/Collection;'],
    ctor: peerClass(function () {
      this.items = [];
    }, { items: [] }),
    methods: Object.assign(listMethods(), {
      '<init>(I)V': (self, [capacity]) => { self.items = new Array(Math.max(0, toInt(capacity) | 0)).fill(undefined); self.items.length = 0; },
      '<init>(Ljava/util/Collection;)V': (self, [collection]) => {
        const source = collection?.$peer?.items || collection?.items || collection?.$data || [];
        self.items = Array.from(source);
      },
      '<init>(Ljava/lang/Iterable;)V': (self, [iterable]) => {
        const source = iterable?.$peer?.items || iterable?.items || iterable?.$data || [];
        self.items = Array.from(source);
      },
    }),
  }),
  'Ljava/util/HashMap;': nativeDef('Ljava/util/HashMap;', {
    super: 'Ljava/lang/Object;',
    interfaces: ['Ljava/util/Map;'],
    ctor: peerClass(function () {
      this.map = new Map();
    }, { map: new Map() }),
    methods: mapMethods(),
  }),
  'Ljava/util/LinkedHashMap;': nativeDef('Ljava/util/LinkedHashMap;', {
    super: 'Ljava/util/HashMap;',
    ctor: peerClass(function () {
      this.map = new Map();
    }, { map: new Map() }),
    methods: mapMethods(),
  }),
  'Ljava/util/WeakHashMap;': nativeDef('Ljava/util/WeakHashMap;', {
    super: 'Ljava/util/HashMap;',
    ctor: peerClass(function () {
      this.map = new Map();
    }, { map: new Map() }),
    methods: mapMethods(),
  }),
  'Ljava/util/Map;': nativeDef('Ljava/util/Map;', { super: null }),
};

JAVA_CORE_CLASSES['Ljava/util/Map$Entry;'] = nativeDef('Ljava/util/Map$Entry;', {
  super: 'Ljava/lang/Object;',
  methods: {
    'getKey()Ljava/lang/Object;': (self) => self.key ?? null,
    'getValue()Ljava/lang/Object;': (self) => self.value ?? null,
    'setValue(Ljava/lang/Object;)Ljava/lang/Object;': (self, [value]) => {
      const previous = self.value;
      self.value = value;
      if (self.owner?.map && self.mapKey !== undefined) self.owner.map.set(self.mapKey, value);
      return previous ?? null;
    },
    'toString()Ljava/lang/String;': (self) => `${jsString(self.key)}=${jsString(self.value)}`,
    'hashCode()I': (self) => hashCode(self.key) ^ hashCode(self.value),
    'equals(Ljava/lang/Object;)Z': (self, [other], vm) => {
      const peer = other?.$peer ?? other;
      return !!peer && mapKey(peer.key, vm) === mapKey(self.key, vm) && mapKey(peer.value, vm) === mapKey(self.value, vm);
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/LinkedList;'] = nativeDef('Ljava/util/LinkedList;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/util/List;', 'Ljava/util/Collection;'],
  ctor: peerClass(function () {
    this.items = [];
  }, { items: [] }),
  methods: Object.assign(listMethods(), {
    'addFirst(Ljava/lang/Object;)V': (self, [value]) => { self.items.unshift(value); },
    'addLast(Ljava/lang/Object;)V': (self, [value]) => { self.items.push(value); },
    'offer(Ljava/lang/Object;)Z': (self, [value]) => { self.items.push(value); return true; },
    'offerFirst(Ljava/lang/Object;)Z': (self, [value]) => { self.items.unshift(value); return true; },
    'offerLast(Ljava/lang/Object;)Z': (self, [value]) => { self.items.push(value); return true; },
    'peek()Ljava/lang/Object;': (self) => self.items[0] ?? null,
    'peekFirst()Ljava/lang/Object;': (self) => self.items[0] ?? null,
    'peekLast()Ljava/lang/Object;': (self) => self.items[self.items.length - 1] ?? null,
    'poll()Ljava/lang/Object;': (self) => (self.items.length ? self.items.shift() : null),
    'pollFirst()Ljava/lang/Object;': (self) => (self.items.length ? self.items.shift() : null),
    'pollLast()Ljava/lang/Object;': (self) => (self.items.length ? self.items.pop() : null),
    'removeFirst()Ljava/lang/Object;': (self) => { const v = self.items.shift(); if (v === undefined) throw new Error('NoSuchElementException'); return v; },
    'removeLast()Ljava/lang/Object;': (self) => { const v = self.items.pop(); if (v === undefined) throw new Error('NoSuchElementException'); return v; },
    'element()Ljava/lang/Object;': (self) => { if (!self.items.length) throw new Error('NoSuchElementException'); return self.items[0]; },
    'push(Ljava/lang/Object;)V': (self, [value]) => { self.items.unshift(value); },
    'pop()Ljava/lang/Object;': (self) => { const v = self.items.shift(); if (v === undefined) throw new Error('NoSuchElementException'); return v; },
  }),
});

JAVA_CORE_CLASSES['Ljava/util/List;'] = nativeDef('Ljava/util/List;', {
  super: null,
  methods: {
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => makeIterator(vm, self.items || []),
    'listIterator()Ljava/util/ListIterator;': (self, _args, vm) => {
      const object = vm.allocateRawObject('Ljava/util/ListIterator;');
      object.$peer = { cursor: 0, abstractList: self.$object ?? self };
      return object;
    },
    'listIterator(I)Ljava/util/ListIterator;': (self, [index], vm) => {
      const object = vm.allocateRawObject('Ljava/util/ListIterator;');
      object.$peer = { cursor: toInt(index), abstractList: self.$object ?? self };
      return object;
    },
    'size()I': (self) => (self.items || []).length,
    'isEmpty()Z': (self) => (self.items || []).length === 0,
    'contains(Ljava/lang/Object;)Z': (self, [value]) => (self.items || []).some((item) => refsEqual(item, value)),
    'indexOf(Ljava/lang/Object;)I': (self, [value]) => (self.items || []).findIndex((item) => refsEqual(item, value)),
    'lastIndexOf(Ljava/lang/Object;)I': (self, [value]) => {
      const items = self.items || [];
      for (let i = items.length - 1; i >= 0; i -= 1) if (refsEqual(items[i], value)) return i;
      return -1;
    },
    'get(I)Ljava/lang/Object;': (self, [index]) => (self.items || [])[toInt(index)] ?? null,
    'set(ILjava/lang/Object;)Ljava/lang/Object;': (self, [index, value]) => {
      const list = self.items || [];
      const previous = list[toInt(index)];
      list[toInt(index)] = value;
      return previous ?? null;
    },
    'toArray()[Ljava/lang/Object;': (self, _args, vm) => vm.newArray('[Ljava/lang/Object;', [...(self.items || [])]),
    'subList(II)Ljava/util/List;': (self, [from, to], vm) => makeList(vm, (self.items || []).slice(toInt(from), toInt(to))),
  },
});
JAVA_CORE_CLASSES['Ljava/util/Set;'] = nativeDef('Ljava/util/Set;', { super: 'Ljava/util/Collection;' });
JAVA_CORE_CLASSES['Ljava/util/Collection;'] = nativeDef('Ljava/util/Collection;', {
  super: null,
  methods: {
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => makeIterator(vm, self.items || self.setItems || []),
    'size()I': (self) => (self.items || self.setItems || []).length,
    'isEmpty()Z': (self) => (self.items || self.setItems || []).length === 0,
    'remove(Ljava/lang/Object;)Z': (self, [value]) => {
      const list = self.items || self.setItems || [];
      const index = list.findIndex((item) => refsEqual(item, value));
      if (index < 0) return false;
      list.splice(index, 1);
      return true;
    },
    'removeAll(Ljava/util/Collection;)Z': (self, [other]) => {
      const list = self.items || self.setItems || [];
      const otherItems = collectionItems(other);
      let changed = false;
      for (let i = list.length - 1; i >= 0; i--) {
        if (otherItems.some((item) => refsEqual(item, list[i]))) {
          list.splice(i, 1);
          changed = true;
        }
      }
      return changed;
    },
    'addAll(Ljava/util/Collection;)Z': (self, [other]) => {
      const list = self.items || self.setItems || [];
      const otherItems = collectionItems(other);
      list.push(...otherItems);
      return otherItems.length > 0;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value]) => (self.items || self.setItems || []).some((item) => refsEqual(item, value)),
    'toArray()[Ljava/lang/Object;': (self, _args, vm) => {
      const list = self.items || self.setItems || [];
      const array = vm.newArray('[Ljava/lang/Object;', list.length);
      for (let i = 0; i < list.length; i++) array.$data[i] = list[i];
      return array;
    },
    'toArray([Ljava/lang/Object;)[Ljava/lang/Object;': (self, [target], vm) => {
      const list = self.items || self.setItems || [];
      const descriptor = target?.$type || target?.$descriptor || '[Ljava/lang/Object;';
      if (target && target.$data && target.$data.length >= list.length) {
        for (let i = 0; i < list.length; i++) target.$data[i] = list[i];
        if (target.$data.length > list.length) target.$data[list.length] = null;
        return target;
      }
      const array = vm.newArray(descriptor, list.length);
      for (let i = 0; i < list.length; i++) array.$data[i] = list[i];
      return array;
    },
    'clear()V': (self) => {
      const list = self.items || self.setItems;
      if (list) list.length = 0;
    },
  },
});
JAVA_CORE_CLASSES['Ljava/util/AbstractList;'] = nativeDef('Ljava/util/AbstractList;', {
  super: 'Ljava/util/AbstractCollection;',
  interfaces: ['Ljava/util/List;'],
  methods: {
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => {
      const object = vm.allocateRawObject('Ljava/util/Iterator;');
      object.$peer = { cursor: 0, abstractList: self };
      return object;
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/Iterator;'] = nativeDef('Ljava/util/Iterator;', {
  super: null,
  methods: {
    'hasNext()Z': (self, _args, vm) => {
      if (self.abstractList) {
        const size = Number(vm.invokeByName('size', '()I', self.abstractList, [])) | 0;
        return self.cursor < size;
      }
      return self.cursor < self.snapshot.length;
    },
    'next()Ljava/lang/Object;': (self, _args, vm) => {
      if (self.abstractList) {
        const size = Number(vm.invokeByName('size', '()I', self.abstractList, [])) | 0;
        if (self.cursor >= size) return null;
        return vm.invokeByName('get', '(I)Ljava/lang/Object;', self.abstractList, [self.cursor++]) ?? null;
      }
      if (self.cursor >= self.snapshot.length) return null;
      return self.snapshot[self.cursor++] ?? null;
    },
    'remove()V': () => undefined,
  },
});
JAVA_CORE_CLASSES['Ljava/util/ListIterator;'] = nativeDef('Ljava/util/ListIterator;', {
  super: null,
  methods: {
    'hasNext()Z': (self, _args, vm) => {
      const size = Number(vm.invokeByName('size', '()I', self.abstractList, [])) | 0;
      return self.cursor < size;
    },
    'next()Ljava/lang/Object;': (self, _args, vm) => {
      const size = Number(vm.invokeByName('size', '()I', self.abstractList, [])) | 0;
      if (self.cursor >= size) return null;
      return vm.invokeByName('get', '(I)Ljava/lang/Object;', self.abstractList, [self.cursor++]) ?? null;
    },
    'hasPrevious()Z': (self) => (self.cursor | 0) > 0,
    'previous()Ljava/lang/Object;': (self, _args, vm) => {
      if ((self.cursor | 0) <= 0) return null;
      self.cursor -= 1;
      return vm.invokeByName('get', '(I)Ljava/lang/Object;', self.abstractList, [self.cursor]) ?? null;
    },
    'nextIndex()I': (self) => self.cursor | 0,
    'previousIndex()I': (self) => (self.cursor | 0) - 1,
    'remove()V': () => undefined,
    'set(Ljava/lang/Object;)V': () => undefined,
    'add(Ljava/lang/Object;)V': () => undefined,
  },
});
function readNavigator() {
  try {
    if (typeof navigator !== 'undefined' && navigator) return navigator;
  } catch (error) {
    void error;
  }
  return null;
}

const DEVICE_CAPABILITY_FALLBACK = {
  cores: 4,
  memoryBytes: 4 * 1024 * 1024 * 1024,
  availBytes: 2 * 1024 * 1024 * 1024,
};

let cachedDeviceCapabilities = null;

export function deviceCapabilities() {
  if (cachedDeviceCapabilities) return cachedDeviceCapabilities;
  const nav = readNavigator();
  const reportedCores = Number(nav?.hardwareConcurrency);
  const cores = Number.isFinite(reportedCores) && reportedCores > 0
    ? Math.floor(reportedCores)
    : DEVICE_CAPABILITY_FALLBACK.cores;
  const reportedMemoryGb = Number(nav?.deviceMemory);
  const memoryBytes = Number.isFinite(reportedMemoryGb) && reportedMemoryGb > 0
    ? Math.round(reportedMemoryGb * 1024 * 1024 * 1024)
    : DEVICE_CAPABILITY_FALLBACK.memoryBytes;
  const capabilities = {
    cores,
    memoryBytes,
    availBytes: Math.round(memoryBytes / 2),
    touchPoints: Number.isFinite(Number(nav?.maxTouchPoints)) ? Number(nav.maxTouchPoints) : 0,
  };
  if (nav) cachedDeviceCapabilities = capabilities;
  return capabilities;
}


function sharedPrefsStore(vm, name) {
  if (!vm.$sharedPrefs) vm.$sharedPrefs = new Map();
  const store = vm.$sharedPrefs;
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name);
}

JAVA_CORE_CLASSES['Landroid/content/SharedPreferences;'] = nativeDef('Landroid/content/SharedPreferences;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (vm, object, name) {
    this.name = String(name ?? 'default');
  }, { name: 'default' }),
  methods: {
    'getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (self, [key, fallback], vm) => {
      const store = sharedPrefsStore(vm, self.name);
      const value = store.get(jsString(key));
      return value === undefined ? (fallback ?? null) : value;
    },
    'getInt(Ljava/lang/String;I)I': (self, [key, fallback], vm) => {
      const store = sharedPrefsStore(vm, self.name);
      const value = store.get(jsString(key));
      return value === undefined ? toInt(fallback) : toInt(value);
    },
    'getLong(Ljava/lang/String;J)J': (self, [key, fallback], vm) => {
      const store = sharedPrefsStore(vm, self.name);
      const value = store.get(jsString(key));
      return value === undefined ? toLong(fallback) : toLong(value);
    },
    'getFloat(Ljava/lang/String;F)F': (self, [key, fallback], vm) => {
      const store = sharedPrefsStore(vm, self.name);
      const value = store.get(jsString(key));
      return value === undefined ? Number(fallback) || 0 : Number(value) || 0;
    },
    'getBoolean(Ljava/lang/String;Z)Z': (self, [key, fallback], vm) => {
      const store = sharedPrefsStore(vm, self.name);
      const value = store.get(jsString(key));
      return value === undefined ? (fallback ? 1 : 0) : (value ? 1 : 0);
    },
    'getStringSet(Ljava/lang/String;Ljava/util/Set;)Ljava/util/Set;': (self, [key, fallback], vm) => {
      const store = sharedPrefsStore(vm, self.name);
      const value = store.get(jsString(key));
      return value === undefined ? (fallback ?? null) : value;
    },
    'contains(Ljava/lang/String;)Z': (self, [key], vm) => (sharedPrefsStore(vm, self.name).has(jsString(key)) ? 1 : 0),
    'getAll()Ljava/util/Map;': (self, _args, vm) => {
      const store = sharedPrefsStore(vm, self.name);
      const map = makeMap(vm);
      for (const [k, v] of store) map.$peer.map.set(k, v);
      return map;
    },
    'edit()Landroid/content/SharedPreferences$Editor;': (self, _args, vm) => {
      const editor = vm.allocateRawObject('Landroid/content/SharedPreferences$Editor;');
      editor.$peer = { name: self.name, pending: new Map(), clear: false };
      return editor;
    },
    'registerOnSharedPreferenceChangeListener(Landroid/content/SharedPreferences$OnSharedPreferenceChangeListener;)V': () => undefined,
    'unregisterOnSharedPreferenceChangeListener(Landroid/content/SharedPreferences$OnSharedPreferenceChangeListener;)V': () => undefined,
  },
});

JAVA_CORE_CLASSES['Landroid/content/SharedPreferences$Editor;'] = nativeDef('Landroid/content/SharedPreferences$Editor;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.name = 'default';
    this.pending = new Map();
    this.clear = false;
  }, { name: 'default', pending: null, clear: false }),
  methods: {
    'putString(Ljava/lang/String;Ljava/lang/String;)Landroid/content/SharedPreferences$Editor;': (self, [key, value]) => {
      self.pending.set(jsString(key), value ?? null);
      return self.$object ?? self;
    },
    'putInt(Ljava/lang/String;I)Landroid/content/SharedPreferences$Editor;': (self, [key, value]) => {
      self.pending.set(jsString(key), toInt(value));
      return self.$object ?? self;
    },
    'putLong(Ljava/lang/String;J)Landroid/content/SharedPreferences$Editor;': (self, [key, value]) => {
      self.pending.set(jsString(key), toLong(value));
      return self.$object ?? self;
    },
    'putFloat(Ljava/lang/String;F)Landroid/content/SharedPreferences$Editor;': (self, [key, value]) => {
      self.pending.set(jsString(key), Number(value) || 0);
      return self.$object ?? self;
    },
    'putBoolean(Ljava/lang/String;Z)Landroid/content/SharedPreferences$Editor;': (self, [key, value]) => {
      self.pending.set(jsString(key), value ? 1 : 0);
      return self.$object ?? self;
    },
    'putStringSet(Ljava/lang/String;Ljava/util/Set;)Landroid/content/SharedPreferences$Editor;': (self, [key, value]) => {
      self.pending.set(jsString(key), value ?? null);
      return self.$object ?? self;
    },
    'remove(Ljava/lang/String;)Landroid/content/SharedPreferences$Editor;': (self, [key]) => {
      self.pending.set(jsString(key), undefined);
      return self.$object ?? self;
    },
    'clear()Landroid/content/SharedPreferences$Editor;': (self) => {
      self.clear = true;
      return self.$object ?? self;
    },
    'commit()Z': (self, _args, vm) => {
      const store = sharedPrefsStore(vm, self.name);
      if (self.clear) store.clear();
      for (const [key, value] of self.pending) {
        if (value === undefined) store.delete(key);
        else store.set(key, value);
      }
      self.pending.clear();
      self.clear = false;
      return 1;
    },
    'apply()V': (self, _args, vm) => {
      const store = sharedPrefsStore(vm, self.name);
      if (self.clear) store.clear();
      for (const [key, value] of self.pending) {
        if (value === undefined) store.delete(key);
        else store.set(key, value);
      }
      self.pending.clear();
      self.clear = false;
    },
  },
});

function preferenceDefaultValue(vm, attr) {
  if (!attr || !attr.name) return undefined;
  const value = attr.value;
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') {
    if ('reference' in value) return undefined;
    if (typeof value.string === 'string') return value.string;
    return undefined;
  }
  return value;
}

function collectPreferenceDefaults(vm, node, out) {
  if (!node) return;
  const attrs = Array.isArray(node.attrs) ? node.attrs : [];
  const keyAttr = attrs.find((a) => a?.name === 'key');
  const defaultAttr = attrs.find((a) => a?.name === 'defaultValue');
  if (keyAttr && typeof keyAttr.value === 'string' && defaultAttr && defaultAttr.value !== undefined && defaultAttr.value !== null) {
    const normalized = preferenceDefaultValue(vm, defaultAttr);
    if (normalized !== undefined) out.set(keyAttr.value, normalized);
  }
  for (const child of node.children || []) collectPreferenceDefaults(vm, child, out);
}

function applyPreferenceDefaults(vm, resId) {
  const apk = vm?.apk;
  if (!apk || !apk.resourceTable || typeof apk.zipEntry !== 'function') return;
  const entry = apk.resourceTable.getEntry(resId);
  if (!entry || typeof entry.value !== 'string') return;
  const path = String(entry.value);
  let xml = apk.xmlCache?.get(path);
  if (!xml) {
    try {
      xml = parseBinaryXml(apk.zipEntry(path));
      apk.xmlCache?.set(path, xml);
    } catch (error) {
      void error;
      return;
    }
  }
  const root = xml?.root?.children?.find((c) => c.type === 'element') || null;
  if (!root) return;
  const defaults = new Map();
  collectPreferenceDefaults(vm, root, defaults);
  if (!defaults.size) return;
  const storeName = `${vm.packageName || 'app'}_preferences`;
  const store = sharedPrefsStore(vm, storeName);
  for (const [key, value] of defaults) {
    if (!store.has(key)) store.set(key, value);
  }
}

function makeSharedPreferences(vm, name) {
  const object = vm.allocateRawObject('Landroid/content/SharedPreferences;');
  object.$peer = { name: String(name ?? 'default') };
  const key = String(name ?? 'default');
  return object;
}

JAVA_CORE_CLASSES['Landroid/preference/PreferenceManager;'] = nativeDef('Landroid/preference/PreferenceManager;', {
  super: 'Ljava/lang/Object;',
  staticMethods: {
    'getDefaultSharedPreferences(Landroid/content/Context;)Landroid/content/SharedPreferences;': (_self, _args, vm) =>
      makeSharedPreferences(vm, (vm.packageName || 'app') + '_preferences'),
    'getDefaultSharedPreferencesName(Landroid/content/Context;)Ljava/lang/String;': (_self, _args, vm) =>
      (vm.packageName || 'app') + '_preferences',
    'setDefaultValues(Landroid/content/Context;ILjava/lang/Boolean;)V': (_self, args, vm) => {
      const [, resId] = args;
      applyPreferenceDefaults(vm, resId);
    },
  },
});

JAVA_CORE_CLASSES['Landroid/content/pm/ConfigurationInfo;'] = nativeDef('Landroid/content/pm/ConfigurationInfo;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.reqGlEsVersion = 0x00030000;
    this.glEsVersion = 0x00030000;
  }, {}),
  instanceFields: [
    ['reqGlEsVersion:I', 0x00030000],
    ['glEsVersion:I', 0x00030000],
  ],
  methods: {
    'getGlEsVersion()Ljava/lang/String;': () => '3.0',
  },
});

JAVA_CORE_CLASSES['Landroid/bluetooth/BluetoothManager;'] = nativeDef('Landroid/bluetooth/BluetoothManager;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (vm) {
    this.vm = vm;
  }, {}),
  methods: {
    'getAdapter()Landroid/bluetooth/BluetoothAdapter;': () => null,
    'getConnectedDevices(I)Ljava/util/List;': (_self, _args, vm) => makeList(vm, []),
  },
});

JAVA_CORE_CLASSES['Landroid/app/ActivityManager;'] = nativeDef('Landroid/app/ActivityManager;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (vm) {
    this.vm = vm;
  }, {}),
  methods: {
    'getDeviceConfigurationInfo()Landroid/content/pm/ConfigurationInfo;': (_self, _args, vm) =>
      vm.instantiate('Landroid/content/pm/ConfigurationInfo;', []),
    'getMemoryClass()I': () => 256,
    'getLargeMemoryClass()I': () => 512,
    'isLowRamDevice()Z': () => 0,
    'getMemoryInfo(Landroid/app/ActivityManager$MemoryInfo;)V': (_self, [info]) => {
      const peer = info?.$peer || info;
      if (peer) {
        const caps = deviceCapabilities();
        peer.availMem = caps.availBytes;
        peer.totalMem = caps.memoryBytes;
        peer.threshold = 256 * 1024 * 1024;
      }
    },
    'getRunningAppProcesses()Ljava/util/List;': (_self, _args, vm) => makeList(vm, []),
    'getRunningServices(I)Ljava/util/List;': (_self, _args, vm) => makeList(vm, []),
  },
});

JAVA_CORE_CLASSES['Landroid/app/ActivityManager$MemoryInfo;'] = nativeDef('Landroid/app/ActivityManager$MemoryInfo;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    const caps = deviceCapabilities();
    this.availMem = caps.availBytes;
    this.totalMem = caps.memoryBytes;
    this.threshold = 256 * 1024 * 1024;
  }, {}),
  instanceFields: [
    ['availMem:J', 2 * 1024 * 1024 * 1024],
    ['totalMem:J', 4 * 1024 * 1024 * 1024],
    ['threshold:J', 256 * 1024 * 1024],
  ],
});

function makeExecutor(vm, descriptor = 'Ljava/util/concurrent/ExecutorService;') {
  const object = vm.allocateRawObject(descriptor);
  object.$peer = { vm, shutdown: false };
  return object;
}

function executorDef(descriptor) {
  return nativeDef(descriptor, {
    super: 'Ljava/lang/Object;',
    interfaces: ['Ljava/util/concurrent/Executor;'],
    ctor: peerClass(function (vm) {
      this.vm = vm;
      this.shutdown = false;
    }, { shutdown: false }),
    methods: {
      'execute(Ljava/lang/Runnable;)V': (self, [runnable]) => {
        if (self.shutdown || !runnable) return;
        self.vm.runRunnable(runnable);
      },
      'submit(Ljava/lang/Runnable;)Ljava/util/concurrent/Future;': (self, [runnable], vm) => {
        const future = vm.allocateRawObject('Ljava/util/concurrent/Future;');
        future.$peer = { done: true, cancelled: false, result: null };
        if (!self.shutdown && runnable) {
          try { vm.runRunnable(runnable); } catch (_) {}
        }
        return future;
      },
      'submit(Ljava/lang/Runnable;Ljava/lang/Object;)Ljava/util/concurrent/Future;': (self, [runnable, result], vm) => {
        const future = vm.allocateRawObject('Ljava/util/concurrent/Future;');
        future.$peer = { done: true, cancelled: false, result: result ?? null };
        if (!self.shutdown && runnable) {
          try { vm.runRunnable(runnable); } catch (_) {}
        }
        return future;
      },
      'submit(Ljava/util/concurrent/Callable;)Ljava/util/concurrent/Future;': (self, [callable], vm) => {
        const future = vm.allocateRawObject('Ljava/util/concurrent/Future;');
        future.$peer = { done: true, cancelled: false, result: null };
        if (!self.shutdown && callable) {
          try { future.$peer.result = vm.invokeInterface(callable, 'call', '()Ljava/lang/Object;', []); } catch (_) {}
        }
        return future;
      },
      'shutdown()V': (self) => { self.shutdown = true; },
      'shutdownNow()Ljava/util/List;': (self, _args, vm) => {
        self.shutdown = true;
        return makeList(vm, []);
      },
      'isShutdown()Z': (self) => (self.shutdown ? 1 : 0),
      'isTerminated()Z': (self) => (self.shutdown ? 1 : 0),
      'awaitTermination(JLjava/util/concurrent/TimeUnit;)Z': () => 1,
      'schedule(Ljava/lang/Runnable;JLjava/util/concurrent/TimeUnit;)Ljava/util/concurrent/ScheduledFuture;': (self, [runnable], vm) => {
        const future = vm.allocateRawObject('Ljava/util/concurrent/ScheduledFuture;');
        future.$peer = { done: true, cancelled: false };
        if (!self.shutdown && runnable) { try { self.vm.runRunnable(runnable); } catch (_) {} }
        return future;
      },
      'scheduleAtFixedRate(Ljava/lang/Runnable;JJLjava/util/concurrent/TimeUnit;)Ljava/util/concurrent/ScheduledFuture;': (self, [runnable], vm) => {
        const future = vm.allocateRawObject('Ljava/util/concurrent/ScheduledFuture;');
        future.$peer = { done: false, cancelled: false, periodic: true };
        return future;
      },
      'scheduleWithFixedDelay(Ljava/lang/Runnable;JJLjava/util/concurrent/TimeUnit;)Ljava/util/concurrent/ScheduledFuture;': (self, [runnable], vm) => {
        const future = vm.allocateRawObject('Ljava/util/concurrent/ScheduledFuture;');
        future.$peer = { done: false, cancelled: false, periodic: true };
        return future;
      },
    },
  });
}

JAVA_CORE_CLASSES['Ljava/util/concurrent/Executor;'] = nativeDef('Ljava/util/concurrent/Executor;', { super: 'Ljava/lang/Object;' });
JAVA_CORE_CLASSES['Ljava/util/concurrent/ExecutorService;'] = executorDef('Ljava/util/concurrent/ExecutorService;');
JAVA_CORE_CLASSES['Ljava/util/concurrent/ScheduledExecutorService;'] = nativeDef('Ljava/util/concurrent/ScheduledExecutorService;', {
  super: 'Ljava/util/concurrent/ExecutorService;',
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/ScheduledFuture;'] = nativeDef('Ljava/util/concurrent/ScheduledFuture;', {
  super: 'Ljava/util/concurrent/Future;',
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/Future;'] = nativeDef('Ljava/util/concurrent/Future;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.done = true;
    this.cancelled = false;
    this.result = null;
  }, { done: true, cancelled: false, result: null }),
  methods: {
    'get()Ljava/lang/Object;': (self) => self.result ?? null,
    'get(JLjava/util/concurrent/TimeUnit;)Ljava/lang/Object;': (self) => self.result ?? null,
    'cancel(Z)Z': (self) => { self.cancelled = true; return 1; },
    'isCancelled()Z': (self) => (self.cancelled ? 1 : 0),
    'isDone()Z': (self) => (self.done ? 1 : 0),
  },
});

JAVA_CORE_CLASSES['Ljava/util/concurrent/TimeUnit;'] = nativeDef('Ljava/util/concurrent/TimeUnit;', {
  super: 'Ljava/lang/Enum;',
  ctor: peerClass(function (vm, object, name, ordinal) {
    this.name = String(name ?? 'NANOSECONDS');
    this.ordinal = toInt(ordinal);
  }, { name: 'NANOSECONDS', ordinal: 0 }),
  methods: {
    'toNanos(J)J': (self, [value]) => {
      const scale = { NANOSECONDS: 1n, MICROSECONDS: 1000n, MILLISECONDS: 1000000n, SECONDS: 1000000000n, MINUTES: 60000000000n, HOURS: 3600000000000n, DAYS: 86400000000000n };
      return toLong(value) * (scale[self.name] ?? 1n);
    },
    'toMillis(J)J': (self, [value]) => {
      const scale = { NANOSECONDS: 0n, MICROSECONDS: 0n, MILLISECONDS: 1n, SECONDS: 1000n, MINUTES: 60000n, HOURS: 3600000n, DAYS: 86400000n };
      return toLong(value) * (scale[self.name] ?? 1n);
    },
    'toSeconds(J)J': (self, [value]) => toLong(value),
    'name()Ljava/lang/String;': (self) => self.name || '',
  },
  staticFields: new Map(
    ['NANOSECONDS', 'MICROSECONDS', 'MILLISECONDS', 'SECONDS', 'MINUTES', 'HOURS', 'DAYS'].map((n, i) => [
      n + ':Ljava/util/concurrent/TimeUnit;',
      {
        lazy: (vm) => {
          const object = vm.allocateRawObject('Ljava/util/concurrent/TimeUnit;');
          object.$peer = { name: n, ordinal: i };
          return object;
        },
      },
    ])
  ),
  staticMethods: {
    'values()[Ljava/util/concurrent/TimeUnit;': (_self, _args, vm) => {
      const names = ['NANOSECONDS', 'MICROSECONDS', 'MILLISECONDS', 'SECONDS', 'MINUTES', 'HOURS', 'DAYS'];
      const def = vm.registry.resolve('Ljava/util/concurrent/TimeUnit;');
      const items = names.map((n, i) => {
        const key = n + ':Ljava/util/concurrent/TimeUnit;';
        let object = def?.staticValues?.get(key);
        if (!object) {
          object = vm.allocateRawObject('Ljava/util/concurrent/TimeUnit;');
          object.$peer = { name: n, ordinal: i };
          def?.staticValues?.set(key, object);
        }
        return object;
      });
      return vm.newArray('[Ljava/util/concurrent/TimeUnit;', items.length, items);
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/concurrent/Executors;'] = nativeDef('Ljava/util/concurrent/Executors;', {
  super: 'Ljava/lang/Object;',
  staticMethods: {
    'newSingleThreadExecutor()Ljava/util/concurrent/ExecutorService;': (_self, _args, vm) => makeExecutor(vm),
    'newSingleThreadExecutor(Ljava/util/concurrent/ThreadFactory;)Ljava/util/concurrent/ExecutorService;': (_self, _args, vm) => makeExecutor(vm),
    'newCachedThreadPool()Ljava/util/concurrent/ExecutorService;': (_self, _args, vm) => makeExecutor(vm),
    'newCachedThreadPool(Ljava/util/concurrent/ThreadFactory;)Ljava/util/concurrent/ExecutorService;': (_self, _args, vm) => makeExecutor(vm),
    'newFixedThreadPool(I)Ljava/util/concurrent/ExecutorService;': (_self, _args, vm) => makeExecutor(vm),
    'newFixedThreadPool(ILjava/util/concurrent/ThreadFactory;)Ljava/util/concurrent/ExecutorService;': (_self, _args, vm) => makeExecutor(vm),
    'newSingleThreadScheduledExecutor()Ljava/util/concurrent/ScheduledExecutorService;': (_self, _args, vm) => makeExecutor(vm, 'Ljava/util/concurrent/ScheduledExecutorService;'),
    'newSingleThreadScheduledExecutor(Ljava/util/concurrent/ThreadFactory;)Ljava/util/concurrent/ScheduledExecutorService;': (_self, _args, vm) => makeExecutor(vm, 'Ljava/util/concurrent/ScheduledExecutorService;'),
    'newScheduledThreadPool(I)Ljava/util/concurrent/ScheduledExecutorService;': (_self, _args, vm) => makeExecutor(vm, 'Ljava/util/concurrent/ScheduledExecutorService;'),
    'newScheduledThreadPool(ILjava/util/concurrent/ThreadFactory;)Ljava/util/concurrent/ScheduledExecutorService;': (_self, _args, vm) => makeExecutor(vm, 'Ljava/util/concurrent/ScheduledExecutorService;'),
    'newWorkStealingPool()Ljava/util/concurrent/ExecutorService;': (_self, _args, vm) => makeExecutor(vm),
    'defaultThreadFactory()Ljava/util/concurrent/ThreadFactory;': (_self, _args, vm) => {
      const object = vm.allocateRawObject('Ljava/util/concurrent/ThreadFactory;');
      object.$peer = { vm };
      return object;
    },
    // 「不可配置」只是封装语义，模拟器不需要禁止 setter，原样返回即可。
    'unconfigurableExecutorService(Ljava/util/concurrent/ExecutorService;)Ljava/util/concurrent/ExecutorService;': (_self, [executor]) => executor ?? null,
    'unconfigurableScheduledExecutorService(Ljava/util/concurrent/ScheduledExecutorService;)Ljava/util/concurrent/ScheduledExecutorService;': (_self, [executor]) => executor ?? null,
  },
});

JAVA_CORE_CLASSES['Ljava/util/concurrent/ThreadFactory;'] = nativeDef('Ljava/util/concurrent/ThreadFactory;', {
  super: 'Ljava/lang/Object;',
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/BlockingQueue;'] = nativeDef('Ljava/util/concurrent/BlockingQueue;', {
  super: 'Ljava/util/Collection;',
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/LinkedBlockingQueue;'] = nativeDef('Ljava/util/concurrent/LinkedBlockingQueue;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/util/concurrent/BlockingQueue;'],
  ctor: peerClass(function () {
    this.items = [];
    this.capacity = 0x7fffffff;
  }, { items: [], capacity: 0x7fffffff }),
  methods: {
    '<init>()V': () => undefined,
    '<init>(I)V': (self, [capacity]) => { self.capacity = toInt(capacity) || 0x7fffffff; },
    '<init>(Ljava/util/Collection;)V': (self, [collection]) => { self.items = [...collectionItems(collection)]; },
    'offer(Ljava/lang/Object;)Z': (self, [value]) => {
      if (self.items.length >= self.capacity) return false;
      self.items.push(value);
      return true;
    },
    'offer(Ljava/lang/Object;JLjava/util/concurrent/TimeUnit;)Z': (self, [value]) => {
      if (self.items.length >= self.capacity) return false;
      self.items.push(value);
      return true;
    },
    'put(Ljava/lang/Object;)V': (self, [value]) => { self.items.push(value); },
    'take()Ljava/lang/Object;': (self) => (self.items.length ? self.items.shift() : null),
    'poll()Ljava/lang/Object;': (self) => (self.items.length ? self.items.shift() : null),
    'poll(JLjava/util/concurrent/TimeUnit;)Ljava/lang/Object;': (self) => (self.items.length ? self.items.shift() : null),
    'peek()Ljava/lang/Object;': (self) => (self.items.length ? self.items[0] : null),
    'size()I': (self) => self.items.length,
    'isEmpty()Z': (self) => (self.items.length ? 0 : 1),
    'clear()V': (self) => { self.items.length = 0; },
    'add(Ljava/lang/Object;)Z': (self, [value]) => { self.items.push(value); return true; },
    'remove(Ljava/lang/Object;)Z': (self, [value]) => {
      const index = self.items.indexOf(value);
      if (index < 0) return false;
      self.items.splice(index, 1);
      return true;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value]) => (self.items.includes(value) ? 1 : 0),
    'remainingCapacity()I': (self) => Math.max(0, self.capacity - self.items.length),
    'drainTo(Ljava/util/Collection;)I': (self, [collection]) => drainQueueTo(self, collection),
    'drainTo(Ljava/util/Collection;I)I': (self, [collection, max]) => drainQueueTo(self, collection, toInt(max)),
    'toArray()[Ljava/lang/Object;': (self, _args, vm) => vm.newArray('[Ljava/lang/Object;', self.items.length, [...self.items]),
  },
});

function drainQueueTo(self, collection, max = Infinity) {
  const target = collection?.$peer ?? collection;
  if (!Array.isArray(target?.items)) return 0;
  const values = self.items.splice(0, Math.max(0, max));
  target.items.push(...values);
  return values.length;
}

JAVA_CORE_CLASSES['Ljava/util/concurrent/ThreadPoolExecutor;'] = nativeDef('Ljava/util/concurrent/ThreadPoolExecutor;', {
  super: 'Ljava/util/concurrent/ExecutorService;',
  ctor: peerClass(function () {
    this.shutdown = false;
    this.queue = null;
  }, { shutdown: false, queue: null }),
  methods: {
    '<init>(IIJLjava/util/concurrent/TimeUnit;Ljava/util/concurrent/BlockingQueue;Ljava/util/concurrent/ThreadFactory;)V': (self, args) => {
      self.queue = args?.[5] ?? null;
    },
    '<init>(IIJLjava/util/concurrent/TimeUnit;Ljava/util/concurrent/BlockingQueue;Ljava/util/concurrent/ThreadFactory;Ljava/util/concurrent/RejectedExecutionHandler;)V': (self, args) => {
      self.queue = args?.[5] ?? null;
    },
    'allowCoreThreadTimeOut(Z)V': (self, [value]) => { self.allowCoreTimeOut = !!value; },
    'prestartAllCoreThreads()I': () => 0,
    'prestartCoreThread()Z': () => 0,
    'getPoolSize()I': () => 0,
    'getActiveCount()I': () => 0,
    'getLargestPoolSize()I': () => 0,
    'getCorePoolSize()I': () => 0,
    'getMaximumPoolSize()I': () => 1,
    'getTaskCount()J': () => 0n,
    'getCompletedTaskCount()J': () => 0n,
    'setCorePoolSize(I)V': () => undefined,
    'setMaximumPoolSize(I)V': () => undefined,
    'setKeepAliveTime(JLjava/util/concurrent/TimeUnit;)V': () => undefined,
    'getQueue()Ljava/util/concurrent/BlockingQueue;': (self) => self.queue ?? null,
    'purge()V': () => undefined,
  },
});

function normalizeCharsetName(value, fallback = 'UTF-8') {
  const name = String(jsString(value) || '').trim().toUpperCase();
  if (!name) return fallback;
  if (name === 'UTF8' || name === 'UTF-8') return 'UTF-8';
  if (name === 'US-ASCII' || name === 'ASCII' || name === '646') return 'US-ASCII';
  if (name === 'ISO-8859-1' || name === 'ISO8859-1' || name === 'LATIN1') return 'ISO-8859-1';
  if (name === 'UTF-16') return 'UTF-16';
  if (name === 'UTF-16BE') return 'UTF-16BE';
  if (name === 'UTF-16LE') return 'UTF-16LE';
  return String(jsString(value));
}

function makeCharset(vm, name) {
  const object = vm.allocateRawObject('Ljava/nio/charset/Charset;');
  object.$peer = { vm, name: normalizeCharsetName(name) };
  return object;
}

JAVA_CORE_CLASSES['Ljava/nio/charset/Charset;'] = nativeDef('Ljava/nio/charset/Charset;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (_vm, _object, name) {
    this.name = normalizeCharsetName(name);
  }, { name: 'UTF-8' }),
  methods: {
    'name()Ljava/lang/String;': (self) => self.name ?? 'UTF-8',
    'displayName()Ljava/lang/String;': (self) => self.name ?? 'UTF-8',
    'displayName(Ljava/util/Locale;)Ljava/lang/String;': (self) => self.name ?? 'UTF-8',
    'aliases()Ljava/util/Set;': (_self, _args, vm) => makeSet(vm, []),
    'canEncode()Z': () => 1,
    'isRegistered()Z': () => 1,
    'equals(Ljava/lang/Object;)Z': (self, [other]) => ((other?.$peer?.name ?? other?.name ?? '') === (self.name ?? '') ? 1 : 0),
    'hashCode()I': (self) => hashCode(self.name ?? 'UTF-8'),
    'compareTo(Ljava/nio/charset/Charset;)I': (self, [other]) =>
      String(self.name ?? '').localeCompare(String(other?.$peer?.name ?? '')),
    'toString()Ljava/lang/String;': (self) => self.name ?? 'UTF-8',
  },
  staticMethods: {
    'forName(Ljava/lang/String;)Ljava/nio/charset/Charset;': (_self, [name], vm) => makeCharset(vm, name),
    'isSupported(Ljava/lang/String;)Z': () => 1,
    'defaultCharset()Ljava/nio/charset/Charset;': (_self, _args, vm) => makeCharset(vm, 'UTF-8'),
    'availableCharsets()Ljava/util/SortedMap;': (_self, _args, vm) => makeMap(vm),
  },
  staticFields: new Map(
    ['UTF-8', 'US-ASCII', 'ISO-8859-1', 'UTF-16', 'UTF-16BE', 'UTF-16LE'].map((name) => [
      name.replace(/-/g, '_') + ':Ljava/nio/charset/Charset;',
      { lazy: (vm) => makeCharset(vm, name) },
    ])
  ),
});

JAVA_CORE_CLASSES['Ljava/nio/charset/StandardCharsets;'] = nativeDef('Ljava/nio/charset/StandardCharsets;', {
  super: 'Ljava/lang/Object;',
  staticFields: new Map(
    ['UTF-8', 'US-ASCII', 'ISO-8859-1', 'UTF-16', 'UTF-16BE', 'UTF-16LE'].map((name) => [
      name.replace(/-/g, '_') + ':Ljava/nio/charset/Charset;',
      { lazy: (vm) => makeCharset(vm, name) },
    ])
  ),
});

function animatorFinish(vm, self) {
  if (self.running) return;
  self.running = true;
  const listeners = self.listeners || [];
  try { if (typeof self.startAction === 'function') self.startAction(); } catch (_) {}
  if (!self.listenersTold) {
    self.listenersTold = true;
    for (const l of listeners) {
      try { vm.invokeInterface(l, 'onAnimationStart', '(Landroid/animation/Animator;)V', [self.$object ?? self]); } catch (_) {}
    }
  }
  try { if (typeof self.endAction === 'function') self.endAction(); } catch (_) {}
  for (const l of listeners) {
    const target = self.$object ?? self;
    try { l?.$peer?.onAnimationEnd && l.$peer.onAnimationEnd(); } catch (_) {}
    try { vm.invokeInterface(l, 'onAnimationEnd', '(Landroid/animation/Animator;)V', [target]); } catch (_) {}
  }
}

function animatorDef(descriptor) {
  return nativeDef(descriptor, {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.running = false;
      this.listeners = [];
      this.listenersTold = false;
      this.duration = 300;
      this.startAction = null;
      this.endAction = null;
    }, { running: false, listeners: null, listenersTold: false, duration: 300, startAction: null, endAction: null }),
    methods: {
      'setDuration(J)Landroid/animation/Animator;': (self, [duration]) => {
        self.duration = Number(toLong(duration));
        return self.$object ?? self;
      },
      'getDuration()J': (self) => toLong(self.duration ?? 300),
      'setStartDelay(J)V': () => undefined,
      'setRepeatCount(I)V': (self, [count]) => { self.repeatCount = count | 0; },
      'setRepeatMode(I)V': (self, [mode]) => { self.repeatMode = mode | 0; },
      'getStartDelay()J': () => 0n,
      'setInterpolator(Landroid/animation/TimeInterpolator;)V': () => undefined,
      'addListener(Landroid/animation/Animator$AnimatorListener;)V': (self, [listener]) => {
        if (listener) self.listeners.push(listener);
      },
      'removeListener(Landroid/animation/Animator$AnimatorListener;)V': (self, [listener]) => {
        const index = self.listeners.indexOf(listener);
        if (index >= 0) self.listeners.splice(index, 1);
      },
      'removeAllListeners()V': (self) => { self.listeners.length = 0; },
      'addUpdateListener(Landroid/animation/ValueAnimator$AnimatorUpdateListener;)V': () => undefined,
      'start()V': (self, _args, vm) => animatorFinish(vm, self),
      'start(J)V': (self, _args, vm) => animatorFinish(vm, self),
      'cancel()V': (self) => { self.cancelled = true; },
      'end()V': (self, _args, vm) => animatorFinish(vm, self),
      'pause()V': () => undefined,
      'resume()V': () => undefined,
      'isRunning()Z': (self) => (self.running ? 1 : 0),
      'isStarted()Z': (self) => (self.running ? 1 : 0),
      'getListeners()Ljava/util/ArrayList;': (self) => self.listeners,
      'setupStartValues()V': () => undefined,
      'setTarget(Ljava/lang/Object;)V': (self, [target]) => { self.target = target; },
      'getTarget()Ljava/lang/Object;': (self) => self.target ?? null,
      'setValues([Landroid/animation/PropertyValuesHolder;)V': () => undefined,
    },
  });
}

JAVA_CORE_CLASSES['Landroid/animation/Animator;'] = animatorDef('Landroid/animation/Animator;');
JAVA_CORE_CLASSES['Landroid/animation/ValueAnimator;'] = nativeDef('Landroid/animation/ValueAnimator;', {
  super: 'Landroid/animation/Animator;',
  ctor: peerClass(function () {
    this.running = false;
    this.listeners = [];
    this.duration = 300;
  }, { running: false, listeners: null, duration: 300 }),
  staticMethods: {
    'ofFloat([F)Landroid/animation/ValueAnimator;': (_self, _args, vm) => {
      const object = vm.allocateRawObject('Landroid/animation/ValueAnimator;');
      object.$peer = { running: false, listeners: [], duration: 300 };
      return object;
    },
    'ofInt([I)Landroid/animation/ValueAnimator;': (_self, _args, vm) => {
      const object = vm.allocateRawObject('Landroid/animation/ValueAnimator;');
      object.$peer = { running: false, listeners: [], duration: 300 };
      return object;
    },
    'ofPropertyValuesHolder([Landroid/animation/PropertyValuesHolder;)Landroid/animation/ValueAnimator;': (_self, _args, vm) => {
      const object = vm.allocateRawObject('Landroid/animation/ValueAnimator;');
      object.$peer = { running: false, listeners: [], duration: 300 };
      return object;
    },
  },
});
JAVA_CORE_CLASSES['Landroid/animation/ObjectAnimator;'] = nativeDef('Landroid/animation/ObjectAnimator;', {
  super: 'Landroid/animation/ValueAnimator;',
  ctor: peerClass(function () {
    this.running = false;
    this.listeners = [];
    this.duration = 300;
  }, { running: false, listeners: null, duration: 300 }),
  staticMethods: {
    'ofFloat(Ljava/lang/Object;Landroid/util/Property;[F)Landroid/animation/ObjectAnimator;': (_self, _args, vm) => {
      const object = vm.allocateRawObject('Landroid/animation/ObjectAnimator;');
      object.$peer = { running: false, listeners: [], duration: 300 };
      return object;
    },
    'ofInt(Ljava/lang/Object;Landroid/util/Property;[I)Landroid/animation/ObjectAnimator;': (_self, _args, vm) => {
      const object = vm.allocateRawObject('Landroid/animation/ObjectAnimator;');
      object.$peer = { running: false, listeners: [], duration: 300 };
      return object;
    },
  },
});
JAVA_CORE_CLASSES['Landroid/animation/AnimatorSet;'] = nativeDef('Landroid/animation/AnimatorSet;', {
  super: 'Landroid/animation/Animator;',
  ctor: peerClass(function () {
    this.running = false;
    this.listeners = [];
    this.duration = 0;
    this.children = [];
  }, { running: false, listeners: null, duration: 0, children: null }),
  methods: {
    'playTogether([Landroid/animation/Animator;)V': (self, [animators], vm) => {
      const items = arrayValues(animators) || [];
      self.children = items;
    },
    'playSequentially([Landroid/animation/Animator;)V': (self, [animators]) => {
      self.children = arrayValues(animators) || [];
    },
    'play(Landroid/animation/Animator;)Landroid/animation/AnimatorSet$Builder;': (self, [animator], vm) => {
      self.children.push(animator);
      const builder = vm.allocateRawObject('Landroid/animation/AnimatorSet$Builder;');
      builder.$peer = { set: self };
      return builder;
    },
    'start()V': (self, _args, vm) => {
      if (self.running) return;
      self.running = true;
      for (const child of self.children || []) {
        try {
          const descriptor = vm.registry.classNameOf(child);
          if (descriptor) vm.invokeByName('start', '()V', child, []);
        } catch (_) {}
      }
      const target = self.$object ?? self;
      for (const l of self.listeners || []) {
        try { vm.invokeInterface(l, 'onAnimationEnd', '(Landroid/animation/Animator;)V', [target]); } catch (_) {}
      }
      if (typeof self.endAction === 'function') self.endAction();
    },
    'setDuration(J)Landroid/animation/AnimatorSet;': (self, [duration]) => {
      self.duration = Number(toLong(duration));
      return self.$object ?? self;
    },
    'getChildAnimations()Ljava/util/ArrayList;': (self, _args, vm) => makeList(vm, self.children || []),
  },
});
JAVA_CORE_CLASSES['Landroid/animation/AnimatorSet$Builder;'] = nativeDef('Landroid/animation/AnimatorSet$Builder;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {}, {}),
  methods: {
    'with(Landroid/animation/Animator;)Landroid/animation/AnimatorSet$Builder;': (self) => self.$object ?? self,
    'before(Landroid/animation/Animator;)Landroid/animation/AnimatorSet$Builder;': (self) => self.$object ?? self,
    'after(Landroid/animation/Animator;)Landroid/animation/AnimatorSet$Builder;': (self) => self.$object ?? self,
    'after(J)Landroid/animation/AnimatorSet$Builder;': (self) => self.$object ?? self,
  },
});
JAVA_CORE_CLASSES['Landroid/animation/TimeInterpolator;'] = nativeDef('Landroid/animation/TimeInterpolator;', { super: 'Ljava/lang/Object;' });
JAVA_CORE_CLASSES['Landroid/view/animation/Interpolator;'] = nativeDef('Landroid/view/animation/Interpolator;', { super: 'Ljava/lang/Object;' });
JAVA_CORE_CLASSES['Landroid/view/animation/LinearInterpolator;'] = nativeDef('Landroid/view/animation/LinearInterpolator;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Landroid/view/animation/Interpolator;'],
  ctor: peerClass(function () {}, {}),
});
JAVA_CORE_CLASSES['Landroid/animation/Animator$AnimatorListener;'] = nativeDef('Landroid/animation/Animator$AnimatorListener;', { super: 'Ljava/lang/Object;' });

JAVA_CORE_CLASSES['Ljava/util/Locale;'] = nativeDef('Ljava/util/Locale;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (vm, object, language, country) {
    this.language = String(language ?? 'en').toLowerCase();
    this.country = String(country ?? 'US').toUpperCase();
  }, { language: 'en', country: 'US' }),
  methods: {
    'getLanguage()Ljava/lang/String;': (self) => self.language || 'en',
    'getCountry()Ljava/lang/String;': (self) => self.country || 'US',
    'toString()Ljava/lang/String;': (self) => (self.language || 'en') + '_' + (self.country || 'US'),
  },
  staticMethods: {
    'getDefault()Ljava/util/Locale;': (_self, _args, vm) => getDefaultLocale(vm),
    'forLanguageTag(Ljava/lang/String;)Ljava/util/Locale;': (_self, [tag], vm) => {
      const raw = String(jsString(tag) || '').replace(/_/g, '-');
      const [lang, country] = raw.split('-');
      const object = vm.allocateRawObject('Ljava/util/Locale;');
      object.$peer = { language: (lang || 'en').toLowerCase(), country: (country || '').toUpperCase() };
      return object;
    },
  },
  staticFields: new Map([['US:Ljava/util/Locale;', null], ['ENGLISH:Ljava/util/Locale;', null], ['ROOT:Ljava/util/Locale;', null]]),
});

function decimalFormatOptions(pattern) {
  const text = String(pattern ?? '#.##');
  const halves = text.split(';');
  const positive = analyzeDecimalSubpattern(halves[0] ?? '#.##');
  const negative = halves.length > 1 ? analyzeDecimalSubpattern(halves[1]) : null;
  const percent = positive.core.includes('%') || positive.suffix.includes('%');
  const permille = positive.core.includes('\u2030') || positive.suffix.includes('\u2030');
  const multiplier = percent ? 100 : (permille ? 1000 : 1);
  const options = {
    pattern: text,
    maxFractionDigits: positive.maxFractionDigits,
    minFractionDigits: positive.minFractionDigits,
    minIntegerDigits: Math.max(1, positive.minIntegerDigits),
    grouping: positive.grouping,
    groupingSize: positive.groupingSize || 3,
    multiplier,
    positivePrefix: positive.prefix,
    positiveSuffix: positive.suffix,
    negativePrefix: negative ? negative.prefix : `-${positive.prefix}`,
    negativeSuffix: negative ? negative.suffix : positive.suffix,
    decimalSeparatorAlwaysShown: false,
    parseBigDecimal: false,
    parseIntegerOnly: false,
    explicitMaxIntegerDigits: false,
    maxIntegerDigits: 0,
    roundingMode: null,
  };
  if (percent) {
    options.positiveSuffix = options.positiveSuffix || '%';
    options.negativeSuffix = options.negativeSuffix || '%';
  } else if (permille) {
    options.positiveSuffix = options.positiveSuffix || '\u2030';
    options.negativeSuffix = options.negativeSuffix || '\u2030';
  }
  return options;
}

function analyzeDecimalSubpattern(source) {
  const part = String(source ?? '');
  const first = part.search(/[0#.,]/);
  const last = part.length - 1 - [...part].reverse().join('').search(/[0#.,]/);
  const prefix = first > 0 ? part.slice(0, first) : '';
  const suffix = last >= 0 && last + 1 < part.length ? part.slice(last + 1) : '';
  const core = first >= 0 && last >= first ? part.slice(first, last + 1) : '';
  const dot = core.indexOf('.');
  let maxFractionDigits = 0;
  let minFractionDigits = 0;
  if (dot >= 0) {
    for (let index = dot + 1; index < core.length; index++) {
      const ch = core[index];
      if (ch !== '0' && ch !== '#') break;
      maxFractionDigits++;
      if (ch === '0') minFractionDigits++;
    }
  }
  const integerPart = dot >= 0 ? core.slice(0, dot) : core;
  const commas = [];
  let minIntegerDigits = 0;
  for (let index = 0; index < integerPart.length; index++) {
    const ch = integerPart[index];
    if (ch === ',') commas.push(index);
    else if (ch === '0') minIntegerDigits++;
  }
  const grouping = commas.length > 0;
  const groupingSize = grouping ? Math.max(1, integerPart.length - commas[commas.length - 1] - 1) : 3;
  return { prefix, suffix, core, maxFractionDigits, minFractionDigits, minIntegerDigits, grouping, groupingSize };
}

function groupDecimalDigits(text, size = 3) {
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [integer, fraction] = body.split('.');
  const group = Math.max(1, size | 0);
  let grouped = '';
  for (let index = 0; index < integer.length; index++) {
    if (index > 0 && (integer.length - index) % group === 0) grouped += ',';
    grouped += integer[index];
  }
  return (negative ? '-' : '') + grouped + (fraction !== undefined ? '.' + fraction : '');
}

function formatDecimalNumber(value, options) {
  const opt = options || {};
  const number = Number(value) * (opt.multiplier === undefined ? 1 : Number(opt.multiplier) || 0);
  if (Number.isNaN(number)) return opt.positivePrefix ? `${opt.positivePrefix}NaN${opt.positiveSuffix ?? ''}` : 'NaN';
  if (number === Infinity) return '\u221e';
  if (number === -Infinity) return '-\u221e';
  const negative = number < 0 || Object.is(number, -0);
  const fixed = Math.abs(number).toFixed(opt.maxFractionDigits ?? 2);
  let [integer, fraction] = fixed.split('.');
  const minInt = Math.max(0, opt.minIntegerDigits ?? 1);
  while (integer.length < minInt) integer = '0' + integer;
  if (opt.explicitMaxIntegerDigits && opt.maxIntegerDigits >= 0 && integer.length > opt.maxIntegerDigits) {
    integer = integer.slice(integer.length - opt.maxIntegerDigits);
  }
  if (fraction !== undefined) {
    while (fraction.length > (opt.minFractionDigits ?? 0) && fraction.endsWith('0')) fraction = fraction.slice(0, -1);
  }
  const dot = fraction ? '.' + fraction : (opt.decimalSeparatorAlwaysShown ? '.' : '');
  let body = integer + dot;
  if (opt.grouping) body = groupDecimalDigits(body, opt.groupingSize || 3);
  const prefix = negative ? (opt.negativePrefix ?? '-') : (opt.positivePrefix ?? '');
  const suffix = negative ? (opt.negativeSuffix ?? '') : (opt.positiveSuffix ?? '');
  return prefix + body + suffix;
}

function parseDecimalValue(text, options) {
  const opt = options || {};
  let source = String(jsString(text) ?? '').trim();
  let negative = false;
  const negPrefix = opt.negativePrefix ?? '-';
  const negSuffix = opt.negativeSuffix ?? '';
  if (negPrefix && source.startsWith(negPrefix)) {
    negative = true;
    source = source.slice(negPrefix.length);
  } else {
    const posPrefix = opt.positivePrefix ?? '';
    if (posPrefix && source.startsWith(posPrefix)) source = source.slice(posPrefix.length);
    if (source.startsWith('-')) {
      negative = true;
      source = source.slice(1);
    }
  }
  if (negSuffix && source.endsWith(negSuffix)) source = source.slice(0, -negSuffix.length);
  const posSuffix = opt.positiveSuffix ?? '';
  if (posSuffix && source.endsWith(posSuffix)) source = source.slice(0, -posSuffix.length);
  source = source.replace(/,/g, '');
  const parsed = parseFloat(source);
  if (Number.isNaN(parsed)) return null;
  const multiplier = Number(opt.multiplier) || 1;
  return (negative ? -parsed : parsed) / multiplier;
}

function appendToCharBuffer(buffer, text) {
  const peer = buffer?.$peer ?? buffer;
  if (peer && Array.isArray(peer.parts)) {
    peer.parts.push(text);
    return buffer;
  }
  if (peer) {
    peer.parts = [String(text)];
    return buffer;
  }
  return buffer;
}

function updateFieldPosition(position, begin, end) {
  const peer = position?.$peer;
  if (!peer) return;
  peer.beginIndex = begin;
  peer.endIndex = end;
}


JAVA_CORE_CLASSES['Ljava/text/DecimalFormatSymbols;'] = nativeDef('Ljava/text/DecimalFormatSymbols;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.decimalSeparator = '.';
    this.groupingSeparator = ',';
    this.zeroDigit = '0';
  }, { decimalSeparator: '.', groupingSeparator: ',', zeroDigit: '0' }),
  methods: {
    '<init>()V': () => undefined,
    '<init>(Ljava/util/Locale;)V': () => undefined,
    'getDecimalSeparator()C': (self) => (self.decimalSeparator || '.').charCodeAt(0),
    'getGroupingSeparator()C': (self) => (self.groupingSeparator || ',').charCodeAt(0),
    'getZeroDigit()C': (self) => (self.zeroDigit || '0').charCodeAt(0),
    'setDecimalSeparator(C)V': (self, [value]) => { self.decimalSeparator = String.fromCharCode(toInt(value)); },
    'setGroupingSeparator(C)V': (self, [value]) => { self.groupingSeparator = String.fromCharCode(toInt(value)); },
    'setZeroDigit(C)V': (self, [value]) => { self.zeroDigit = String.fromCharCode(toInt(value)); },
  },
  staticMethods: {
    'getInstance()Ljava/text/DecimalFormatSymbols;': (_self, _args, vm) =>
      vm.allocateRawObject('Ljava/text/DecimalFormatSymbols;'),
    'getInstance(Ljava/util/Locale;)Ljava/text/DecimalFormatSymbols;': (_self, _args, vm) =>
      vm.allocateRawObject('Ljava/text/DecimalFormatSymbols;'),
  },
});

JAVA_CORE_CLASSES['Ljava/text/DecimalFormat;'] = nativeDef('Ljava/text/DecimalFormat;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.options = decimalFormatOptions('#.##');
    this.symbols = null;
  }, { options: null, symbols: null }),
  methods: {
    '<init>()V': (self) => { self.options = decimalFormatOptions('#.##'); },
    '<init>(Ljava/lang/String;)V': (self, [pattern]) => {
      self.options = decimalFormatOptions(jsString(pattern));
    },
    '<init>(Ljava/lang/String;Ljava/text/DecimalFormatSymbols;)V': (self, [pattern, symbols]) => {
      self.options = decimalFormatOptions(jsString(pattern));
      self.symbols = symbols;
    },
    'format(D)Ljava/lang/String;': (self, [value]) => formatDecimalNumber(Number(value), self.options),
    'format(J)Ljava/lang/String;': (self, [value]) => formatDecimalNumber(Number(value), self.options),
    'format(Ljava/lang/Object;)Ljava/lang/String;': (self, [value]) => {
      const number = typeof value === 'object' && value !== null ? value.value : value;
      return formatDecimalNumber(Number(number), self.options);
    },
    'applyPattern(Ljava/lang/String;)V': (self, [pattern]) => {
      self.options = decimalFormatOptions(jsString(pattern));
    },
    'setMaximumFractionDigits(I)V': (self, [value]) => {
      self.options.maxFractionDigits = Math.max(0, toInt(value));
    },
    'setMinimumFractionDigits(I)V': (self, [value]) => {
      self.options.minFractionDigits = Math.max(0, toInt(value));
    },
    'setGroupingUsed(Z)V': (self, [value]) => {
      self.options.grouping = !!value;
    },
    'setDecimalSeparatorAlwaysShown(Z)V': () => undefined,
    'setRoundingMode(Ljava/math/RoundingMode;)V': () => undefined,
    'getDecimalFormatSymbols()Ljava/text/DecimalFormatSymbols;': (self, _args, vm) =>
      self.symbols ?? vm.allocateRawObject('Ljava/text/DecimalFormatSymbols;'),
  },
});

JAVA_CORE_CLASSES['Ljava/lang/ThreadLocal;'] = nativeDef('Ljava/lang/ThreadLocal;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.hasValue = false;
    this.value = null;
  }, { hasValue: false, value: null }),
  methods: {
    'get()Ljava/lang/Object;': (self) => (self.hasValue ? self.value : null),
    'set(Ljava/lang/Object;)V': (self, [value]) => {
      self.hasValue = true;
      self.value = value;
    },
    'remove()V': (self) => {
      self.hasValue = false;
      self.value = null;
    },
    'initialValue()Ljava/lang/Object;': () => null,
  },
});

JAVA_CORE_CLASSES['Landroid/text/SpannableString;'] = nativeDef('Landroid/text/SpannableString;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Landroid/text/Spannable;', 'Ljava/lang/CharSequence;'],
  ctor: peerClass(function (vm, object, source) {
    this.text = jsString(source);
    this.spans = [];
  }, { text: '', spans: [] }),
  methods: {
    '<init>()V': (self) => {
      self.text = '';
      self.spans = [];
    },
    '<init>(Ljava/lang/CharSequence;)V': (self, [source]) => {
      self.text = jsString(source);
      self.spans = [];
    },
    '<init>(Ljava/lang/String;)V': (self, [source]) => {
      self.text = jsString(source);
      self.spans = [];
    },
    'toString()Ljava/lang/String;': (self) => self.text || '',
    'length()I': (self) => (self.text || '').length,
    'setSpan(Ljava/lang/Object;III)V': (self, [span, start, end, flags]) => {
      self.spans.push({ span, start: toInt(start), end: toInt(end), flags: toInt(flags) });
    },
    'getSpanStart(Ljava/lang/Object;)I': (self, [span]) => self.spans.find((s) => s.span === span)?.start ?? -1,
    'getSpanEnd(Ljava/lang/Object;)I': (self, [span]) => self.spans.find((s) => s.span === span)?.end ?? -1,
    'getSpans(IILjava/lang/Class;)[Ljava/lang/Object;': (self, [start, end, cls], vm) => {
      const items = self.spans.map((s) => s.span);
      return vm.newArray('[Ljava/lang/Object;', items);
    },
  },
});

JAVA_CORE_CLASSES['Landroid/text/style/ForegroundColorSpan;'] = nativeDef('Landroid/text/style/ForegroundColorSpan;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (vm, object, color) {
    this.color = toInt(color) >>> 0;
  }, { color: 0 }),
  methods: {
    '<init>(I)V': (self, [color]) => {
      self.color = toInt(color) >>> 0;
    },
    'getForegroundColor()I': (self) => self.color | 0,
    'updateDrawState(Landroid/text/TextPaint;)V': () => undefined,
  },
});

JAVA_CORE_CLASSES['Ljava/util/concurrent/CountDownLatch;'] = nativeDef('Ljava/util/concurrent/CountDownLatch;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (count) {
    this.count = Number(count) || 0;
  }, { count: 0 }),
  methods: {
    '<init>(I)V': (self, [count]) => { self.count = Number(count) || 0; },
    'await()V': () => undefined,
    'await(JLjava/util/concurrent/TimeUnit;)Z': () => true,
    'countDown()V': (self) => { self.count = Math.max(0, (self.count | 0) - 1); },
    'getCount()J': (self) => self.count | 0,
    'toString()Ljava/lang/String;': (self) => 'CountDownLatch(' + (self.count | 0) + ')',
  },
});

JAVA_CORE_CLASSES['Landroid/text/style/BackgroundColorSpan;'] = nativeDef('Landroid/text/style/BackgroundColorSpan;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (vm, object, color) {
    this.color = toInt(color) >>> 0;
  }, { color: 0 }),
  methods: {
    '<init>(I)V': (self, [color]) => {
      self.color = toInt(color) >>> 0;
    },
    'getBackgroundColor()I': (self) => self.color | 0,
    'updateDrawState(Landroid/text/TextPaint;)V': () => undefined,
  },
});

JAVA_CORE_CLASSES['Landroid/text/method/LinkMovementMethod;'] = nativeDef('Landroid/text/method/LinkMovementMethod;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {}, {}),
  staticFields: new Map([['instance:Landroid/text/method/MovementMethod;', null]]),
  staticMethods: {
    'getInstance()Landroid/text/method/MovementMethod;': (_self, _args, vm) => {
      const def = vm.registry.resolve('Landroid/text/method/LinkMovementMethod;');
      let instance = def?.staticValues?.get('instance:Landroid/text/method/MovementMethod;');
      if (!instance) {
        instance = vm.allocateRawObject('Landroid/text/method/LinkMovementMethod;');
        def?.staticValues?.set('instance:Landroid/text/method/MovementMethod;', instance);
      }
      return instance;
    },
  },
});

JAVA_CORE_CLASSES['Landroid/graphics/drawable/Drawable;'] = nativeDef('Landroid/graphics/drawable/Drawable;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.alpha = 255;
  }, { bounds: null, alpha: 255 }),
  methods: {
    'setBounds(IIII)V': (self, [l, t, r, b]) => {
      self.bounds = { left: toInt(l), top: toInt(t), right: toInt(r), bottom: toInt(b) };
      if (self.boundsObject) {
        const rect = self.boundsObject;
        const set = (name, value) => {
          if (rect.$peer) rect.$peer[name] = value | 0;
          if (rect.$fields) rect.$fields.set('Landroid/graphics/Rect;->' + name + ':I', value | 0);
        };
        set('left', toInt(l)); set('top', toInt(t)); set('right', toInt(r)); set('bottom', toInt(b));
      }
    },
    'getBounds()Landroid/graphics/Rect;': (self, _args, vm) => {
      if (!self) return null;
      if (self.boundsObject) return self.boundsObject;
      const rect = vm?.allocateRawObject ? vm.allocateRawObject('Landroid/graphics/Rect;') : null;
      if (rect) {
        self.boundsObject = rect;
        const b = self.bounds || { left: 0, top: 0, right: 0, bottom: 0 };
        const set = (name, value) => {
          if (rect.$peer) rect.$peer[name] = value | 0;
          if (rect.$fields) rect.$fields.set('Landroid/graphics/Rect;->' + name + ':I', value | 0);
        };
        set('left', b.left | 0); set('top', b.top | 0); set('right', b.right | 0); set('bottom', b.bottom | 0);
      }
      return rect;
    },
    'setBounds(Landroid/graphics/Rect;)V': (self, [rect]) => {
      self.bounds = {
        left: toInt(rect?.left),
        top: toInt(rect?.top),
        right: toInt(rect?.right),
        bottom: toInt(rect?.bottom),
      };
    },
    'setAlpha(I)V': (self, [alpha]) => { self.alpha = toInt(alpha) & 0xff; },
    'getAlpha()I': (self) => self.alpha ?? 255,
    'setColorFilter(Landroid/graphics/ColorFilter;)V': () => undefined,
    'getIntrinsicWidth()I': () => -1,
    'getIntrinsicHeight()I': () => -1,
    'isStateful()Z': () => 0,
    'mutate()Landroid/graphics/drawable/Drawable;': (self) => self.$object ?? self,
    'invalidateSelf()V': () => undefined,
  },
});

JAVA_CORE_CLASSES['Landroid/graphics/drawable/ColorDrawable;'] = nativeDef('Landroid/graphics/drawable/ColorDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function (color) { this.color = toInt(color) >>> 0; }, { color: 0 }),
  methods: {
    'getColor()I': (self) => self.color | 0,
    'setColor(I)V': (self, [color]) => { self.color = toInt(color) >>> 0; },
    'getAlpha()I': (self) => (self.alpha ?? 255),
    'setAlpha(I)V': (self, [alpha]) => { self.alpha = toInt(alpha) & 0xff; },
    'getOpacity()I': () => -1,
    'draw(Landroid/graphics/Canvas;)V': () => undefined,
    'setColorFilter(Landroid/graphics/ColorFilter;)V': () => undefined,
  },
});

JAVA_CORE_CLASSES['Landroid/graphics/drawable/GradientDrawable;'] = nativeDef('Landroid/graphics/drawable/GradientDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.shape = 0;
    this.color = 0;
    this.strokeColor = 0;
    this.strokeWidth = 0;
    this.cornerRadii = null;
    this.cornerRadius = 0;
  }, { shape: 0, color: 0, strokeColor: 0, strokeWidth: 0, cornerRadii: null, cornerRadius: 0 }),
  methods: {
    'setShape(I)V': (self, [shape]) => { self.shape = toInt(shape); },
    'setColor(I)V': (self, [color]) => { self.color = toInt(color) >>> 0; },
    'setColor(Landroid/content/res/ColorStateList;)V': (self, [csl]) => { const c=csl&&(csl.defaultColor!==undefined?csl.defaultColor:csl.color); if(typeof c==='number') self.color = c>>>0; },
    'setStroke(ILandroid/content/res/ColorStateList;)V': (self, [width]) => { self.strokeWidth = toInt(width); },
    'setStroke(II)V': (self, [width, color]) => {
      self.strokeWidth = toInt(width);
      self.strokeColor = toInt(color) >>> 0;
    },
    'setCornerRadius(F)V': (self, [radius]) => { self.cornerRadius = Number(radius) || 0; },
    'setCornerRadii([F)V': (self, [radii]) => { self.cornerRadii = arrayValues(radii) || null; },
    'setGradientType(I)V': () => undefined,
  },
});

JAVA_CORE_CLASSES['Landroid/graphics/drawable/RippleDrawable;'] = nativeDef('Landroid/graphics/drawable/RippleDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.content = null;
    this.mask = null;
    this.rippleColor = null;
  }, { content: null, mask: null, rippleColor: null }),
  methods: {
    '<init>(Landroid/content/res/ColorStateList;)V': (self, [colorStateList]) => {
      self.rippleColor = colorStateList;
    },
    '<init>(Landroid/content/res/ColorStateList;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V': (self, [colorStateList, content, mask]) => {
      self.rippleColor = colorStateList;
      self.content = content;
      self.mask = mask;
    },
    'setDrawableByLayerId(ILandroid/graphics/drawable/Drawable;)Z': (self, [_id, drawable]) => {
      self.content = drawable;
      return true;
    },
  },
});

const ARRAY_PRIMITIVE_TYPES = ['I', 'J', 'S', 'C', 'B', 'F', 'D', 'Z'];
const ARRAYS_SORT_METHODS = {};
const ARRAYS_BINARY_SEARCH_METHODS = {};
const ARRAYS_EQUALS_METHODS = {};
const ARRAYS_FILL_METHODS = {};
const ARRAYS_COPY_RANGE_METHODS = {};
const ARRAYS_HASH_METHODS = {};
const ARRAYS_TO_STRING_METHODS = {};
for (const type of ARRAY_PRIMITIVE_TYPES) {
  ARRAYS_SORT_METHODS[`sort([${type})V`] = (_self, [array]) => sortArrayRange(array, 0, undefined, defaultArrayCompare);
  ARRAYS_SORT_METHODS[`sort([${type}II)V`] = (_self, [array, from, to]) => sortArrayRange(array, from, to, defaultArrayCompare);
  ARRAYS_SORT_METHODS[`parallelSort([${type})V`] = (_self, [array]) => sortArrayRange(array, 0, undefined, defaultArrayCompare);
  ARRAYS_SORT_METHODS[`parallelSort([${type}II)V`] = (_self, [array, from, to]) => sortArrayRange(array, from, to, defaultArrayCompare);
  ARRAYS_BINARY_SEARCH_METHODS[`binarySearch([${type}${type})I`] = (_self, [array, key]) => binarySearchRange(array, 0, undefined, normalizeArrayValue(type, key), defaultArrayCompare);
  ARRAYS_BINARY_SEARCH_METHODS[`binarySearch([${type}II${type})I`] = (_self, [array, from, to, key]) => binarySearchRange(array, from, to, normalizeArrayValue(type, key), defaultArrayCompare);
  ARRAYS_EQUALS_METHODS[`equals([${type}[${type})Z`] = (_self, [left, right]) => arraysEqual(left, right, false);
  ARRAYS_FILL_METHODS[`fill([${type}${type})V`] = (_self, [array, value]) => fillArrayRange(array, 0, undefined, normalizeArrayValue(type, value));
  ARRAYS_FILL_METHODS[`fill([${type}II${type})V`] = (_self, [array, from, to, value]) => fillArrayRange(array, from, to, normalizeArrayValue(type, value));
  ARRAYS_COPY_RANGE_METHODS[`copyOfRange([${type}II)[${type}`] = (_self, [source, from, to], vm) => copyArrayRange(vm, source, from, to);
  ARRAYS_HASH_METHODS[`hashCode([${type})I`] = (_self, [array]) => arraysHashCode(array, type);
  ARRAYS_TO_STRING_METHODS[`toString([${type})Ljava/lang/String;`] = (_self, [array]) => arraysToString(array, type);
}

JAVA_CORE_CLASSES['Ljava/util/Arrays;'] = nativeDef('Ljava/util/Arrays;', {
  super: 'Ljava/lang/Object;',
  staticMethods: {
    'copyOf([Ljava/lang/Object;I)[Ljava/lang/Object;': (_self, [source, length], vm) => copyArrayOf(vm, source, length),
    'copyOf([II)[I': (_self, [source, length], vm) => copyArrayOf(vm, source, length),
    'copyOf([JI)[J': (_self, [source, length], vm) => copyArrayOf(vm, source, length),
    'copyOf([BI)[B': (_self, [source, length], vm) => copyArrayOf(vm, source, length),
    'copyOf([CI)[C': (_self, [source, length], vm) => copyArrayOf(vm, source, length),
    'copyOf([SI)[S': (_self, [source, length], vm) => copyArrayOf(vm, source, length),
    'copyOf([ZI)[Z': (_self, [source, length], vm) => copyArrayOf(vm, source, length),
    'copyOf([FI)[F': (_self, [source, length], vm) => copyArrayOf(vm, source, length),
    'copyOf([DI)[D': (_self, [source, length], vm) => copyArrayOf(vm, source, length),
    'copyOf([Ljava/lang/Object;ILjava/lang/Class;)[Ljava/lang/Object;': (_self, [source, length, newType], vm) =>
      copyArrayOfTyped(vm, source, length, newType),
    'copyOfRange([Ljava/lang/Object;II)[Ljava/lang/Object;': (_self, [source, from, to], vm) => copyArrayRange(vm, source, from, to),
    'copyOfRange([Ljava/lang/Object;IILjava/lang/Class;)[Ljava/lang/Object;': (_self, [source, from, to, newType], vm) =>
      copyArrayRangeTyped(vm, source, from, to, newType),
    ...ARRAYS_COPY_RANGE_METHODS,
    'toString([Ljava/lang/Object;)Ljava/lang/String;': (_self, [source]) => `[${arrayValues(source).map((value) => (value === null || value === undefined ? 'null' : jsString(value))).join(', ')}]`,
    'deepToString([Ljava/lang/Object;)Ljava/lang/String;': (_self, [source]) => deepArrayToString(source),
    ...ARRAYS_TO_STRING_METHODS,
    'equals([Ljava/lang/Object;[Ljava/lang/Object;)Z': (_self, [a, b], vm) => arraysEqual(a, b, false, vm),
    'deepEquals([Ljava/lang/Object;[Ljava/lang/Object;)Z': (_self, [a, b], vm) => arraysEqual(a, b, true, vm),
    ...ARRAYS_EQUALS_METHODS,
    'hashCode([Ljava/lang/Object;)I': (_self, [source]) => {
      let result = 1;
      for (const value of arrayValues(source)) result = ((31 * result) + (value === null ? 0 : (hashCode(value) | 0))) | 0;
      return result;
    },
    'deepHashCode([Ljava/lang/Object;)I': (_self, [source]) => deepArraysHashCode(source),
    ...ARRAYS_HASH_METHODS,
    'asList([Ljava/lang/Object;)Ljava/util/List;': (_self, [source], vm) => makeList(vm, arrayValues(source).slice()),
    ...ARRAYS_FILL_METHODS,
    'fill([Ljava/lang/Object;Ljava/lang/Object;)V': (_self, [array, value]) => fillArrayRange(array, 0, undefined, value),
    'fill([Ljava/lang/Object;IILjava/lang/Object;)V': (_self, [array, from, to, value]) => fillArrayRange(array, from, to, value),
    'sort([Ljava/lang/Object;)V': (_self, [source]) => sortArrayRange(source, 0, undefined, defaultArrayCompare),
    'sort([Ljava/lang/Object;II)V': (_self, [source, from, to]) => sortArrayRange(source, from, to, defaultArrayCompare),
    'sort([Ljava/lang/Comparable;)V': (_self, [source]) => sortArrayRange(source, 0, undefined, defaultArrayCompare),
    'sort([Ljava/lang/Comparable;II)V': (_self, [source, from, to]) => sortArrayRange(source, from, to, defaultArrayCompare),
    'sort([Ljava/lang/Object;Ljava/util/Comparator;)V': (_self, [source, comparator], vm) =>
      sortArrayRange(source, 0, undefined, comparatorFor(comparator, vm)),
    'sort([Ljava/lang/Object;IILjava/util/Comparator;)V': (_self, [source, from, to, comparator], vm) =>
      sortArrayRange(source, from, to, comparatorFor(comparator, vm)),
    'parallelSort([Ljava/lang/Comparable;)V': (_self, [source]) => sortArrayRange(source, 0, undefined, defaultArrayCompare),
    'parallelSort([Ljava/lang/Comparable;II)V': (_self, [source, from, to]) => sortArrayRange(source, from, to, defaultArrayCompare),
    'parallelSort([Ljava/lang/Object;Ljava/util/Comparator;)V': (_self, [source, comparator], vm) =>
      sortArrayRange(source, 0, undefined, comparatorFor(comparator, vm)),
    'parallelSort([Ljava/lang/Object;IILjava/util/Comparator;)V': (_self, [source, from, to, comparator], vm) =>
      sortArrayRange(source, from, to, comparatorFor(comparator, vm)),
    ...ARRAYS_SORT_METHODS,
    'binarySearch([Ljava/lang/Object;Ljava/lang/Object;)I': (_self, [array, key]) => binarySearchRange(array, 0, undefined, key, defaultArrayCompare),
    'binarySearch([Ljava/lang/Object;IILjava/lang/Object;)I': (_self, [array, from, to, key]) => binarySearchRange(array, from, to, key, defaultArrayCompare),
    'binarySearch([Ljava/lang/Object;Ljava/lang/Object;Ljava/util/Comparator;)I': (_self, [array, key, comparator], vm) =>
      binarySearchRange(array, 0, undefined, key, comparatorFor(comparator, vm)),
    'binarySearch([Ljava/lang/Object;IILjava/lang/Object;Ljava/util/Comparator;)I': (_self, [array, from, to, key, comparator], vm) =>
      binarySearchRange(array, from, to, key, comparatorFor(comparator, vm)),
    ...ARRAYS_BINARY_SEARCH_METHODS,
    'parallelPrefix([Ljava/lang/Object;Ljava/util/function/BinaryOperator;)V': (_self, [array, operator], vm) =>
      parallelPrefixRange(array, 0, undefined, operator, vm, 'apply', '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;'),
    'parallelPrefix([Ljava/lang/Object;IILjava/util/function/BinaryOperator;)V': (_self, [array, from, to, operator], vm) =>
      parallelPrefixRange(array, from, to, operator, vm, 'apply', '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;'),
    'parallelPrefix([JLjava/util/function/LongBinaryOperator;)V': (_self, [array, operator], vm) =>
      parallelPrefixRange(array, 0, undefined, operator, vm, 'applyAsLong', '(JJ)J'),
    'parallelPrefix([JIILjava/util/function/LongBinaryOperator;)V': (_self, [array, from, to, operator], vm) =>
      parallelPrefixRange(array, from, to, operator, vm, 'applyAsLong', '(JJ)J'),
    'parallelPrefix([DLjava/util/function/DoubleBinaryOperator;)V': (_self, [array, operator], vm) =>
      parallelPrefixRange(array, 0, undefined, operator, vm, 'applyAsDouble', '(DD)D'),
    'parallelPrefix([DIILjava/util/function/DoubleBinaryOperator;)V': (_self, [array, from, to, operator], vm) =>
      parallelPrefixRange(array, from, to, operator, vm, 'applyAsDouble', '(DD)D'),
    'parallelPrefix([ILjava/util/function/IntBinaryOperator;)V': (_self, [array, operator], vm) =>
      parallelPrefixRange(array, 0, undefined, operator, vm, 'applyAsInt', '(II)I'),
    'parallelPrefix([IIILjava/util/function/IntBinaryOperator;)V': (_self, [array, from, to, operator], vm) =>
      parallelPrefixRange(array, from, to, operator, vm, 'applyAsInt', '(II)I'),
    'setAll([Ljava/lang/Object;Ljava/util/function/IntFunction;)V': (_self, [array, generator], vm) =>
      setAllArray(array, generator, vm, 'apply', '(I)Ljava/lang/Object;'),
    'parallelSetAll([Ljava/lang/Object;Ljava/util/function/IntFunction;)V': (_self, [array, generator], vm) =>
      setAllArray(array, generator, vm, 'apply', '(I)Ljava/lang/Object;'),
    'setAll([ILjava/util/function/IntUnaryOperator;)V': (_self, [array, generator], vm) =>
      setAllArray(array, generator, vm, 'applyAsInt', '(I)I'),
    'parallelSetAll([ILjava/util/function/IntUnaryOperator;)V': (_self, [array, generator], vm) =>
      setAllArray(array, generator, vm, 'applyAsInt', '(I)I'),
    'setAll([JLjava/util/function/IntToLongFunction;)V': (_self, [array, generator], vm) =>
      setAllArray(array, generator, vm, 'applyAsLong', '(I)J'),
    'parallelSetAll([JLjava/util/function/IntToLongFunction;)V': (_self, [array, generator], vm) =>
      setAllArray(array, generator, vm, 'applyAsLong', '(I)J'),
    'setAll([DLjava/util/function/IntToDoubleFunction;)V': (_self, [array, generator], vm) =>
      setAllArray(array, generator, vm, 'applyAsDouble', '(I)D'),
    'parallelSetAll([DLjava/util/function/IntToDoubleFunction;)V': (_self, [array, generator], vm) =>
      setAllArray(array, generator, vm, 'applyAsDouble', '(I)D'),
  },
});

function arrayData(array) {
  if (!array) return null;
  if (Array.isArray(array.$data)) return array.$data;
  const peer = array.$peer ?? array;
  if (Array.isArray(peer.items)) return peer.items;
  if (Array.isArray(peer.setItems)) return peer.setItems;
  return null;
}

function arrayValues(array) {
  return arrayData(array) ?? [];
}

function normalizeArrayValue(type, value) {
  switch (type) {
    case 'J': return toLong(value);
    case 'F':
    case 'D': return Number(value) || 0;
    case 'Z': return !!value;
    default: return toInt(value);
  }
}

function defaultArrayCompare(a, b) {
  if (a === null || a === undefined) return (b === null || b === undefined) ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    const left = BigInt(a);
    const right = BigInt(b);
    return left < right ? -1 : (left > right ? 1 : 0);
  }
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : (a > b ? 1 : 0);
  const left = jsString(a);
  const right = jsString(b);
  return left < right ? -1 : (left > right ? 1 : 0);
}

function comparatorFor(comparator, vm) {
  if (!comparator) return defaultArrayCompare;
  return (a, b) => Number(vm.invokeInterface(comparator, 'compare', '(Ljava/lang/Object;Ljava/lang/Object;)I', [a, b])) | 0;
}

function sortArrayRange(array, from, to, compare) {
  const data = arrayData(array);
  if (!data) return undefined;
  const start = Math.max(0, toInt(from) | 0);
  const end = to === undefined ? data.length : Math.min(data.length, toInt(to) | 0);
  if (end - start < 2) return undefined;
  const slice = data.slice(start, end).sort(compare);
  for (let i = 0; i < slice.length; i++) data[start + i] = slice[i];
  return undefined;
}

function binarySearchRange(array, from, to, key, compare) {
  const data = arrayData(array);
  if (!data) return -1;
  let low = Math.max(0, toInt(from) | 0);
  let high = (to === undefined ? data.length : Math.min(data.length, toInt(to) | 0)) - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const order = compare(data[mid], key);
    if (order < 0) low = mid + 1;
    else if (order > 0) high = mid - 1;
    else return mid;
  }
  return -(low + 1);
}

function arraysEqual(left, right, deep, vm) {
  if (left === right) return 1;
  const a = arrayData(left);
  const b = arrayData(right);
  if (!a || !b || a.length !== b.length) return 0;
  for (let i = 0; i < a.length; i++) {
    if (isJavaArray(a[i]) && isJavaArray(b[i])) {
      if (deep) {
        if (!arraysEqual(a[i], b[i], true, vm)) return 0;
        continue;
      }
    }
    if (!valuesEqual(a[i], b[i], vm)) return 0;
  }
  return 1;
}

function valuesEqual(left, right, vm) {
  if (left === right) return true;
  if (left && right && typeof left === 'object' && typeof right === 'object' && typeof vm?.invokeByName === 'function') {
    try {
      return !!vm.invokeByName('equals', '(Ljava/lang/Object;)Z', left, [right]);
    } catch (_error) {
      return false;
    }
  }
  return Object.is(left, right);
}

function fillArrayRange(array, from, to, value) {
  const data = arrayData(array);
  if (!data) return undefined;
  const start = Math.max(0, toInt(from) | 0);
  const end = to === undefined ? data.length : Math.min(data.length, toInt(to) | 0);
  for (let i = start; i < end; i++) data[i] = value;
  return undefined;
}

const ARRAY_FLOAT_SCRATCH = new Float32Array(1);
const ARRAY_INT_SCRATCH = new Int32Array(ARRAY_FLOAT_SCRATCH.buffer);
const ARRAY_DOUBLE_SCRATCH = new Float64Array(1);
const ARRAY_DOUBLE_WORDS = new Uint32Array(ARRAY_DOUBLE_SCRATCH.buffer);

function arraysHashCode(array, type) {
  const data = arrayData(array);
  if (!data) return 0;
  let result = 1;
  for (const value of data) {
    let element;
    switch (type) {
      case 'J': {
        const wide = BigInt(value ?? 0);
        element = Number(BigInt.asIntN(32, wide ^ (wide >> 32n)));
        break;
      }
      case 'F':
        ARRAY_FLOAT_SCRATCH[0] = Number(value) || 0;
        element = ARRAY_INT_SCRATCH[0];
        break;
      case 'D':
        ARRAY_DOUBLE_SCRATCH[0] = Number(value) || 0;
        element = (ARRAY_DOUBLE_WORDS[0] ^ ARRAY_DOUBLE_WORDS[1]) | 0;
        break;
      case 'Z': element = value ? 1231 : 1237; break;
      default: element = toInt(value) | 0; break;
    }
    result = ((31 * result) + element) | 0;
  }
  return result;
}

function deepArraysHashCode(value) {
  if (value === null || value === undefined) return 0;
  if (isJavaArray(value)) {
    let result = 1;
    for (const item of arrayValues(value)) result = ((31 * result) + deepArraysHashCode(item)) | 0;
    return result;
  }
  return hashCode(value) | 0;
}

function arraysToString(array, type) {
  const data = arrayData(array);
  if (!data) return 'null';
  const parts = data.map((value) => {
    if (type === 'C') return String.fromCharCode(toInt(value) & 0xffff);
    if (typeof value === 'bigint') return value.toString();
    if (value === null || value === undefined) return 'null';
    return String(value);
  });
  return `[${parts.join(', ')}]`;
}

function deepArrayToString(value, seen = new Set()) {
  if (value === null || value === undefined) return 'null';
  if (!isJavaArray(value)) return jsString(value);
  if (seen.has(value)) return '[...]';
  seen.add(value);
  const text = `[${arrayValues(value).map((item) => deepArrayToString(item, seen)).join(', ')}]`;
  seen.delete(value);
  return text;
}

function parallelPrefixRange(array, from, to, operator, vm, method, proto) {
  const data = arrayData(array);
  if (!data) return undefined;
  const start = Math.max(0, toInt(from) | 0);
  const end = to === undefined ? data.length : Math.min(data.length, toInt(to) | 0);
  if (end - start < 2) return undefined;
  let accumulator = data[start];
  for (let i = start + 1; i < end; i++) {
    accumulator = vm.invokeInterface(operator, method, proto, [accumulator, data[i]]);
    data[i] = accumulator;
  }
  return undefined;
}

function setAllArray(array, generator, vm, method, proto) {
  const data = arrayData(array);
  if (!data || !generator) return undefined;
  for (let i = 0; i < data.length; i++) data[i] = vm.invokeInterface(generator, method, proto, [i]);
  return undefined;
}

function copyArrayOf(vm, source, length) {
  const values = arrayValues(source);
  const size = toInt(length);
  const descriptor = source?.$type || source?.$descriptor || '[Ljava/lang/Object;';
  const result = vm.newArray(descriptor, size);
  for (let i = 0; i < size && i < values.length; i++) result.$data[i] = values[i];
  return result;
}

function copyArrayRange(vm, source, from, to) {
  const values = arrayValues(source);
  const start = Math.max(0, toInt(from));
  const end = Math.min(values.length, toInt(to));
  const descriptor = source?.$type || source?.$descriptor || '[Ljava/lang/Object;';
  const size = Math.max(0, end - start);
  const result = vm.newArray(descriptor, size);
  for (let i = 0; i < size; i++) result.$data[i] = values[start + i];
  return result;
}

function componentDescriptorFor(newType) {
  const descriptor = typeDescriptorOf(newType);
  return descriptor ? `[${descriptor}` : null;
}

function copyArrayOfTyped(vm, source, length, newType) {
  const values = arrayValues(source);
  const size = Math.max(0, toInt(length));
  const descriptor = componentDescriptorFor(newType) || source?.$type || '[Ljava/lang/Object;';
  const result = vm.newArray(descriptor, size);
  for (let i = 0; i < size && i < values.length; i++) result.$data[i] = values[i];
  return result;
}

function copyArrayRangeTyped(vm, source, from, to, newType) {
  const values = arrayValues(source);
  const start = Math.max(0, toInt(from));
  const end = Math.min(values.length, toInt(to));
  const size = Math.max(0, end - start);
  const descriptor = componentDescriptorFor(newType) || source?.$type || '[Ljava/lang/Object;';
  const result = vm.newArray(descriptor, size);
  for (let i = 0; i < size; i++) result.$data[i] = values[start + i];
  return result;
}

function shuffleList(list, vm, random) {
  const items = arrayData(list);
  if (!items || items.length < 2) return undefined;
  for (let i = items.length - 1; i > 0; i--) {
    const bound = i + 1;
    let index = -1;
    if (random) {
      try {
        index = Number(vm.invokeByName('nextInt', '(I)I', random, [bound])) | 0;
      } catch (_error) {
        index = -1;
      }
    }
    if (index < 0 || index >= bound) index = Math.floor(Math.random() * bound);
    const swap = items[i];
    items[i] = items[index];
    items[index] = swap;
  }
  return undefined;
}

function extremumOf(collection, compare) {
  const items = arrayValues(collection);
  if (!items.length) return null;
  let best = items[0];
  for (let i = 1; i < items.length; i++) {
    if (compare(items[i], best) < 0) best = items[i];
  }
  return best;
}

function rotateList(list, distance) {
  const items = arrayData(list);
  if (!items || items.length < 2) return undefined;
  const size = items.length;
  const shift = ((toInt(distance) % size) + size) % size;
  if (!shift) return undefined;
  const tail = items.splice(size - shift, shift);
  items.unshift(...tail);
  return undefined;
}

function subListIndex(source, target, fromEnd, vm) {
  const outer = arrayValues(source);
  const inner = arrayValues(target);
  if (!inner.length) return fromEnd ? outer.length : 0;
  const last = outer.length - inner.length;
  if (last < 0) return -1;
  const matches = (start) => {
    for (let i = 0; i < inner.length; i++) if (!valuesEqual(outer[start + i], inner[i], vm)) return false;
    return true;
  };
  if (fromEnd) {
    for (let start = last; start >= 0; start--) if (matches(start)) return start;
  } else {
    for (let start = 0; start <= last; start++) if (matches(start)) return start;
  }
  return -1;
}

JAVA_CORE_CLASSES['Ljava/util/Comparator;'] = nativeDef('Ljava/util/Comparator;', {
  super: 'Ljava/lang/Object;',
  methods: {
    'compare(Ljava/lang/Object;Ljava/lang/Object;)I': (self, [left, right]) => {
      const peer = self.compare ? self : (self.$peer ?? self);
      return typeof peer.compare === 'function' ? Number(peer.compare(left, right)) | 0 : 0;
    },
    'equals(Ljava/lang/Object;)Z': (self, [other]) => (self === other || self.$peer === other?.$peer ? 1 : 0),
    'reversed()Ljava/util/Comparator;': (self, _args, vm) => {
      const peer = self.compare ? self : (self.$peer ?? self);
      return makeComparator(vm, (left, right) => -Number(peer.compare(left, right)));
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/Enumeration;'] = nativeDef('Ljava/util/Enumeration;', {
  super: 'Ljava/lang/Object;',
  methods: {
    'hasMoreElements()Z': (self) => {
      const peer = self.$peer ?? self;
      return (peer.cursor | 0) < (peer.items?.length || 0) ? 1 : 0;
    },
    'nextElement()Ljava/lang/Object;': (self) => {
      const peer = self.$peer ?? self;
      const items = peer.items || [];
      if ((peer.cursor | 0) >= items.length) return null;
      return items[peer.cursor++] ?? null;
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/Collections;'] = nativeDef('Ljava/util/Collections;', {
  super: 'Ljava/lang/Object;',
  staticFields: new Map([
    ['EMPTY_LIST:Ljava/util/List;', { lazy: (vm) => makeList(vm, []) }],
    ['EMPTY_SET:Ljava/util/Set;', { lazy: (vm) => makeSet(vm, []) }],
    ['EMPTY_MAP:Ljava/util/Map;', { lazy: (vm) => makeMap(vm) }],
  ]),
  staticMethods: {
    'emptyList()Ljava/util/List;': (_self, _args, vm) => makeList(vm, []),
    'emptySet()Ljava/util/Set;': (_self, _args, vm) => makeSet(vm, []),
    'emptyMap()Ljava/util/Map;': (_self, _args, vm) => makeMap(vm),
    'singleton(Ljava/lang/Object;)Ljava/util/Set;': (_self, [value], vm) => makeSet(vm, [value]),
    'singletonList(Ljava/lang/Object;)Ljava/util/List;': (_self, [value], vm) => makeList(vm, [value]),
    'unmodifiableList(Ljava/util/List;)Ljava/util/List;': (_self, [list]) => list,
    'unmodifiableSet(Ljava/util/Set;)Ljava/util/Set;': (_self, [set]) => set,
    'unmodifiableMap(Ljava/util/Map;)Ljava/util/Map;': (_self, [map]) => map,
    'sort(Ljava/util/List;)V': (_self, [list]) => sortArrayRange(list, 0, undefined, defaultArrayCompare),
    'reverse(Ljava/util/List;)V': (_self, [list]) => {
      arrayData(list)?.reverse?.();
    },
    'sort(Ljava/util/List;Ljava/util/Comparator;)V': (_self, [list, comparator], vm) => {
      if (!comparator) return sortArrayRange(list, 0, undefined, defaultArrayCompare);
      return sortArrayRange(list, 0, undefined, comparatorFor(comparator, vm));
    },
    'binarySearch(Ljava/util/List;Ljava/lang/Object;)I': (_self, [list, key]) => binarySearchRange(list, 0, undefined, key, defaultArrayCompare),
    'binarySearch(Ljava/util/List;Ljava/lang/Object;Ljava/util/Comparator;)I': (_self, [list, key, comparator], vm) =>
      binarySearchRange(list, 0, undefined, key, comparatorFor(comparator, vm)),
    'shuffle(Ljava/util/List;)V': (_self, [list], vm) => shuffleList(list, vm, null),
    'shuffle(Ljava/util/List;Ljava/util/Random;)V': (_self, [list, random], vm) => shuffleList(list, vm, random),
    'swap(Ljava/util/List;II)V': (_self, [list, first, second]) => {
      const items = arrayData(list);
      if (!items) return undefined;
      const a = toInt(first);
      const b = toInt(second);
      if (a < 0 || b < 0 || a >= items.length || b >= items.length) return undefined;
      const swap = items[a];
      items[a] = items[b];
      items[b] = swap;
      return undefined;
    },
    'fill(Ljava/util/List;Ljava/lang/Object;)V': (_self, [list, value]) => fillArrayRange(list, 0, undefined, value),
    'copy(Ljava/util/List;Ljava/util/List;)V': (_self, [destination, source]) => {
      const from = arrayValues(source);
      const to = arrayData(destination);
      if (!to || to.length < from.length) return undefined;
      for (let i = 0; i < from.length; i++) to[i] = from[i];
      return undefined;
    },
    'min(Ljava/util/Collection;)Ljava/lang/Object;': (_self, [collection]) => extremumOf(collection, defaultArrayCompare),
    'min(Ljava/util/Collection;Ljava/util/Comparator;)Ljava/lang/Object;': (_self, [collection, comparator], vm) =>
      extremumOf(collection, comparatorFor(comparator, vm)),
    'max(Ljava/util/Collection;)Ljava/lang/Object;': (_self, [collection]) => extremumOf(collection, (a, b) => defaultArrayCompare(b, a)),
    'max(Ljava/util/Collection;Ljava/util/Comparator;)Ljava/lang/Object;': (_self, [collection, comparator], vm) =>
      extremumOf(collection, (a, b) => comparatorFor(comparator, vm)(b, a)),
    'rotate(Ljava/util/List;I)V': (_self, [list, distance]) => rotateList(list, distance),
    'replaceAll(Ljava/util/List;Ljava/lang/Object;Ljava/lang/Object;)Z': (_self, [list, oldValue, newValue], vm) => {
      const items = arrayData(list);
      if (!items) return false;
      let replaced = false;
      for (let i = 0; i < items.length; i++) {
        if (!valuesEqual(items[i], oldValue, vm)) continue;
        items[i] = newValue;
        replaced = true;
      }
      return replaced;
    },
    'indexOfSubList(Ljava/util/List;Ljava/util/List;)I': (_self, [source, target], vm) => subListIndex(source, target, false, vm),
    'lastIndexOfSubList(Ljava/util/List;Ljava/util/List;)I': (_self, [source, target], vm) => subListIndex(source, target, true, vm),
    'unmodifiableSortedSet(Ljava/util/SortedSet;)Ljava/util/SortedSet;': (_self, [set]) => set ?? null,
    'unmodifiableNavigableSet(Ljava/util/NavigableSet;)Ljava/util/NavigableSet;': (_self, [set]) => set ?? null,
    'unmodifiableSortedMap(Ljava/util/SortedMap;)Ljava/util/SortedMap;': (_self, [map]) => map ?? null,
    'unmodifiableNavigableMap(Ljava/util/NavigableMap;)Ljava/util/NavigableMap;': (_self, [map]) => map ?? null,
    'synchronizedSortedSet(Ljava/util/SortedSet;)Ljava/util/SortedSet;': (_self, [set]) => set ?? null,
    'synchronizedNavigableSet(Ljava/util/NavigableSet;)Ljava/util/NavigableSet;': (_self, [set]) => set ?? null,
    'synchronizedSortedMap(Ljava/util/SortedMap;)Ljava/util/SortedMap;': (_self, [map]) => map ?? null,
    'synchronizedNavigableMap(Ljava/util/NavigableMap;)Ljava/util/NavigableMap;': (_self, [map]) => map ?? null,
    'unmodifiableCollection(Ljava/util/Collection;)Ljava/util/Collection;': (_self, [collection]) => collection ?? null,
    'checkedCollection(Ljava/util/Collection;Ljava/lang/Class;)Ljava/util/Collection;': (_self, [collection]) => collection ?? null,
    'checkedQueue(Ljava/util/Queue;Ljava/lang/Class;)Ljava/util/Queue;': (_self, [queue]) => queue ?? null,
    'checkedSet(Ljava/util/Set;Ljava/lang/Class;)Ljava/util/Set;': (_self, [set]) => set ?? null,
    'checkedList(Ljava/util/List;Ljava/lang/Class;)Ljava/util/List;': (_self, [list]) => list ?? null,
    'checkedSortedSet(Ljava/util/SortedSet;Ljava/lang/Class;)Ljava/util/SortedSet;': (_self, [set]) => set ?? null,
    'checkedNavigableSet(Ljava/util/NavigableSet;Ljava/lang/Class;)Ljava/util/NavigableSet;': (_self, [set]) => set ?? null,
    'checkedMap(Ljava/util/Map;Ljava/lang/Class;Ljava/lang/Class;)Ljava/util/Map;': (_self, [map]) => map ?? null,
    'checkedSortedMap(Ljava/util/SortedMap;Ljava/lang/Class;Ljava/lang/Class;)Ljava/util/SortedMap;': (_self, [map]) => map ?? null,
    'checkedNavigableMap(Ljava/util/NavigableMap;Ljava/lang/Class;Ljava/lang/Class;)Ljava/util/NavigableMap;': (_self, [map]) => map ?? null,
    'emptyIterator()Ljava/util/Iterator;': (_self, _args, vm) => makeIterator(vm, []),
    'emptyListIterator()Ljava/util/ListIterator;': (_self, _args, vm) => {
      const object = vm.allocateRawObject('Ljava/util/ListIterator;');
      object.$peer = { cursor: 0, snapshot: [], abstractList: makeList(vm, []) };
      return object;
    },
    'emptyEnumeration()Ljava/util/Enumeration;': (_self, _args, vm) => makeEnumeration(vm, []),
    'emptySortedSet()Ljava/util/SortedSet;': (_self, _args, vm) => makeSet(vm, []),
    'emptyNavigableSet()Ljava/util/NavigableSet;': (_self, _args, vm) => makeSet(vm, []),
    'emptySortedMap()Ljava/util/SortedMap;': (_self, _args, vm) => makeMap(vm),
    'emptyNavigableMap()Ljava/util/NavigableMap;': (_self, _args, vm) => makeMap(vm),
    'singletonMap(Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/Map;': (_self, [key, value], vm) => {
      const map = makeMap(vm);
      map.$peer.map.set(key, value);
      return map;
    },
    'nCopies(ILjava/lang/Object;)Ljava/util/List;': (_self, [count, value], vm) => makeList(vm, new Array(Math.max(0, toInt(count))).fill(value)),
    'reverseOrder()Ljava/util/Comparator;': (_self, _args, vm) => makeComparator(vm, (left, right) => defaultArrayCompare(right, left)),
    'reverseOrder(Ljava/util/Comparator;)Ljava/util/Comparator;': (_self, [comparator], vm) => {
      const forward = comparatorFor(comparator, vm);
      return makeComparator(vm, (left, right) => forward(right, left));
    },
    'enumeration(Ljava/util/Collection;)Ljava/util/Enumeration;': (_self, [collection], vm) => makeEnumeration(vm, arrayValues(collection).slice()),
    'list(Ljava/util/Enumeration;)Ljava/util/ArrayList;': (_self, [enumeration], vm) => {
      const items = [];
      let guard = 0;
      while (guard++ < 1000000 && Number(vm.invokeByName('hasMoreElements', '()Z', enumeration, [])) === 1) {
        items.push(vm.invokeByName('nextElement', '()Ljava/lang/Object;', enumeration, []));
      }
      const list = makeList(vm, items);
      const object = vm.allocateRawObject('Ljava/util/ArrayList;');
      object.$peer = list.$peer;
      return object;
    },
    'frequency(Ljava/util/Collection;Ljava/lang/Object;)I': (_self, [collection, value], vm) => {
      let count = 0;
      for (const item of arrayValues(collection)) if (valuesEqual(item, value, vm)) count += 1;
      return count;
    },
    'disjoint(Ljava/util/Collection;Ljava/util/Collection;)Z': (_self, [left, right], vm) => {
      const other = arrayValues(right);
      for (const item of arrayValues(left)) {
        for (const candidate of other) {
          if (valuesEqual(item, candidate, vm)) return 0;
        }
      }
      return 1;
    },
    'asLifoQueue(Ljava/util/Deque;)Ljava/util/Queue;': (_self, [deque]) => deque ?? null,
    'synchronizedMap(Ljava/util/Map;)Ljava/util/Map;': (_self, [map]) => map ?? null,
    // Set 视图以 Map 的键为内容；这里返回独立副本，调用方（Firebase 的
    // ComponentRuntime）只把返回的 Set 当作容器使用，不再回读原 Map。
    'newSetFromMap(Ljava/util/Map;)Ljava/util/Set;': (_self, [map], vm) => {
      const peer = map?.$peer ?? map;
      if (!peer || (!peer.map && !peer.rawKeys)) return makeSet(vm, []);
      const keys = peer.rawKeys ? [...peer.rawKeys.values()] : [...peer.map.keys()];
      return makeSet(vm, keys);
    },
    'synchronizedList(Ljava/util/List;)Ljava/util/List;': (_self, [list]) => list ?? null,
    'synchronizedSet(Ljava/util/Set;)Ljava/util/Set;': (_self, [set]) => set ?? null,
    'synchronizedCollection(Ljava/util/Collection;)Ljava/util/Collection;': (_self, [collection]) => collection ?? null,
    // 目标既可能是 List 也可能是 Set：Set 要走 equals 去重，
    // 否则 Firebase 的 Component.Builder 会把额外接口丢掉。
    'addAll(Ljava/util/Collection;[Ljava/lang/Object;)Z': (_self, [collection, values], vm) => {
      const target = collection?.$peer ?? collection;
      const items = arrayValues(values) || [];
      if (!items.length || !target) return false;
      if (Array.isArray(target.items)) {
        target.items.push(...items);
        return true;
      }
      if (Array.isArray(target.setItems)) {
        let added = false;
        for (const item of items) {
          if (findSetIndex(target, item, vm) >= 0) continue;
          target.setItems.push(item);
          added = true;
        }
        return added;
      }
      return false;
    },
  },
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/ThreadLocalRandom;'] = nativeDef('Ljava/util/concurrent/ThreadLocalRandom;', {
  super: 'Ljava/util/Random;',
  staticFields: new Map([['instance:Ljava/util/concurrent/ThreadLocalRandom;', null]]),
  staticMethods: {
    'current()Ljava/util/concurrent/ThreadLocalRandom;': (_self, _args, vm) => {
      const def = vm.registry.resolve('Ljava/util/concurrent/ThreadLocalRandom;');
      const existing = vm.getStaticField2 ? null : null;
      let instance = def.staticValues.get('instance:Ljava/util/concurrent/ThreadLocalRandom;');
      if (!instance) {
        instance = vm.allocateObject(def);
        if (!instance.$peer) instance.$peer = {};
        instance.$peer.seed = (Math.random() * 0x100000000) | 0;
        def.staticValues.set('instance:Ljava/util/concurrent/ThreadLocalRandom;', instance);
      }
      return instance;
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/Random;'] = nativeDef('Ljava/util/Random;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.seed = (Math.random() * 0x100000000) | 0;
  }, { seed: 0 }),
  methods: {
    '<init>()V': (self) => {
      self.seed = (Math.random() * 0x100000000) | 0;
    },
    '<init>(J)V': (self, [seed]) => {
      self.seed = toLong(seed) & 0xffff;
    },
    'setSeed(J)V': (self, [seed]) => {
      self.seed = toLong(seed) & 0xffff;
    },
    'next(I)I': (self, [bits]) => {
      const n = toInt(bits);
      if (n <= 32) {
        self.seed = (Math.imul(self.seed, 0x5deece66d) + 0xb) | 0;
        return (self.seed >>> (32 - n)) & (n === 32 ? 0xffffffff : ((1 << n) - 1));
      }
      return Math.floor(Math.random() * Math.pow(2, n));
    },
    'nextInt()I': (self) => {
      self.seed = (Math.imul(self.seed, 0x5deece66d) + 0xb) | 0;
      return self.seed & 0x7fffffff;
    },
    'nextInt(I)I': (self, [bound], vm) => {
      const n = toInt(bound);
      if (n <= 0) vm.throwException('Ljava/lang/IllegalArgumentException;', 'bound must be positive');
      self.seed = (Math.imul(self.seed, 0x5deece66d) + 0xb) | 0;
      return (self.seed >>> 0) % n;
    },
    'nextLong()J': (self) => {
      self.seed = (Math.imul(self.seed, 0x5deece66d) + 0xb) | 0;
      return self.seed;
    },
    'nextBoolean()Z': (self) => {
      self.seed = (Math.imul(self.seed, 0x5deece66d) + 0xb) | 0;
      return (self.seed & 0x80000000) !== 0;
    },
    'nextFloat()F': (self) => {
      self.seed = (Math.imul(self.seed, 0x5deece66d) + 0xb) | 0;
      return ((self.seed >>> 8) & 0xffffff) / 0x1000000;
    },
    'nextDouble()D': (self) => {
      self.seed = (Math.imul(self.seed, 0x5deece66d) + 0xb) | 0;
      return ((self.seed >>> 0) % 0x100000000) / 0x100000000;
    },
    'nextGaussian()D': (self) => {
      const u1 = Math.random(), u2 = Math.random();
      return Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2);
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/concurrent/atomic/AtomicReferenceArray;'] = nativeDef('Ljava/util/concurrent/atomic/AtomicReferenceArray;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.slots = [];
  }, { slots: [] }),
  methods: {
    '<init>(I)V': (self, [length]) => {
      self.slots = new Array(Math.max(0, toInt(length))).fill(null);
    },
    '<init>([Ljava/lang/Object;)V': (self, [array]) => {
      self.slots = array?.$data ? [...array.$data] : [];
    },
    'length()I': (self) => self.slots.length,
    'get(I)Ljava/lang/Object;': (self, [index]) => {
      const i = toInt(index);
      return i >= 0 && i < self.slots.length ? (self.slots[i] === undefined ? null : self.slots[i]) : null;
    },
    'set(ILjava/lang/Object;)V': (self, [index, value]) => {
      const i = toInt(index);
      if (i >= 0 && i < self.slots.length) self.slots[i] = value ?? null;
    },
    'lazySet(ILjava/lang/Object;)V': (self, [index, value]) => {
      const i = toInt(index);
      if (i >= 0 && i < self.slots.length) self.slots[i] = value ?? null;
    },
    'getAndSet(ILjava/lang/Object;)Ljava/lang/Object;': (self, [index, value]) => {
      const i = toInt(index);
      if (i < 0 || i >= self.slots.length) return null;
      const previous = self.slots[i] === undefined ? null : self.slots[i];
      self.slots[i] = value ?? null;
      return previous;
    },
    'compareAndSet(ILjava/lang/Object;Ljava/lang/Object;)Z': (self, [index, expected, update]) => {
      const i = toInt(index);
      if (i < 0 || i >= self.slots.length) return false;
      const current = self.slots[i] === undefined ? null : self.slots[i];
      if (current !== expected) return false;
      self.slots[i] = update ?? null;
      return true;
    },
    'weakCompareAndSet(ILjava/lang/Object;Ljava/lang/Object;)Z': (self, [index, expected, update]) => {
      const i = toInt(index);
      if (i < 0 || i >= self.slots.length) return false;
      const current = self.slots[i] === undefined ? null : self.slots[i];
      if (current !== expected) return false;
      self.slots[i] = update ?? null;
      return true;
    },
    'toString()Ljava/lang/String;': (self) => self.slots.map((v) => String(v ?? null)).join(','),
  },
});

JAVA_CORE_CLASSES['Ljava/util/concurrent/ConcurrentLinkedQueue;'] = nativeDef('Ljava/util/concurrent/ConcurrentLinkedQueue;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/util/Queue;', 'Ljava/util/Collection;'],
  ctor: peerClass(function () {
    this.items = [];
  }, { items: [] }),
  methods: {
    '<init>()V': (self) => {
      self.items = [];
    },
    '<init>(Ljava/util/Collection;)V': (self, [other]) => {
      self.items = [...collectionItems(other)];
    },
    'offer(Ljava/lang/Object;)Z': (self, [value]) => {
      self.items.push(value);
      return true;
    },
    'add(Ljava/lang/Object;)Z': (self, [value]) => {
      self.items.push(value);
      return true;
    },
    'poll()Ljava/lang/Object;': (self) => (self.items.length === 0 ? null : self.items.shift()),
    'peek()Ljava/lang/Object;': (self) => (self.items.length === 0 ? null : self.items[0]),
    'remove()Ljava/lang/Object;': (self, _args, vm) => {
      if (self.items.length === 0) vm.throwException('Ljava/util/NoSuchElementException;', 'queue empty');
      return self.items.shift();
    },
    'element()Ljava/lang/Object;': (self, _args, vm) => {
      if (self.items.length === 0) vm.throwException('Ljava/util/NoSuchElementException;', 'queue empty');
      return self.items[0];
    },
    'size()I': (self) => self.items.length,
    'isEmpty()Z': (self) => self.items.length === 0,
    'clear()V': (self) => {
      self.items = [];
    },
    'contains(Ljava/lang/Object;)Z': (self, [value]) => self.items.includes(value),
    'remove(Ljava/lang/Object;)Z': (self, [value]) => {
      const index = self.items.indexOf(value);
      if (index < 0) return false;
      self.items.splice(index, 1);
      return true;
    },
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => makeIterator(vm, self.items || []),
    'toArray()[Ljava/lang/Object;': (self, _args, vm) => {
      const array = vm.newArray('[Ljava/lang/Object;', self.items.length);
      for (let i = 0; i < self.items.length; i++) array.$data[i] = self.items[i];
      return array;
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/concurrent/atomic/AtomicReference;'] = nativeDef('Ljava/util/concurrent/atomic/AtomicReference;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.value = null;
  }, { value: null }),
  methods: {
    '<init>()V': (self) => {
      self.value = null;
    },
    '<init>(Ljava/lang/Object;)V': (self, [value]) => {
      self.value = value ?? null;
    },
    'get()Ljava/lang/Object;': (self) => (self.value === undefined ? null : self.value),
    'set(Ljava/lang/Object;)V': (self, [value]) => {
      self.value = value ?? null;
    },
    'lazySet(Ljava/lang/Object;)V': (self, [value]) => {
      self.value = value ?? null;
    },
    'getAndSet(Ljava/lang/Object;)Ljava/lang/Object;': (self, [value]) => {
      const previous = self.value === undefined ? null : self.value;
      self.value = value ?? null;
      return previous;
    },
    'compareAndSet(Ljava/lang/Object;Ljava/lang/Object;)Z': (self, [expected, update]) => {
      const current = self.value === undefined ? null : self.value;
      if (globalThis.CAS_DBG) console.error('CAS cur=' + describeV(current) + ' exp=' + describeV(expected) + ' eq=' + refsEqual(current, expected));
      if (!refsEqual(current, expected)) return false;
      self.value = update === undefined ? null : update;
      return true;
    },
    'weakCompareAndSet(Ljava/lang/Object;Ljava/lang/Object;)Z': (self, [expected, update]) => {
      const current = self.value === undefined ? null : self.value;
      if (!refsEqual(current, expected)) return false;
      self.value = update === undefined ? null : update;
      return true;
    },
    'toString()Ljava/lang/String;': (self) => String(self.value ?? null),
  },
});

JAVA_CORE_CLASSES['Ljava/util/concurrent/atomic/AtomicInteger;'] = nativeDef('Ljava/util/concurrent/atomic/AtomicInteger;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.value = 0;
  }, { value: 0 }),
  methods: {
    '<init>()V': (self) => {
      self.value = 0;
    },
    '<init>(I)V': (self, [value]) => {
      self.value = value | 0;
    },
    'get()I': (self) => self.value | 0,
    'set(I)V': (self, [value]) => {
      self.value = value | 0;
    },
    'getAndSet(I)I': (self, [value]) => {
      const previous = self.value | 0;
      self.value = value | 0;
      return previous;
    },
    'incrementAndGet()I': (self) => {
      self.value = (self.value | 0) + 1;
      return self.value;
    },
    'getAndIncrement()I': (self) => {
      const previous = self.value | 0;
      self.value = previous + 1;
      return previous;
    },
    'decrementAndGet()I': (self) => {
      self.value = (self.value | 0) - 1;
      return self.value;
    },
    'getAndDecrement()I': (self) => {
      const previous = self.value | 0;
      self.value = previous - 1;
      return previous;
    },
    'addAndGet(I)I': (self, [delta]) => {
      self.value = (self.value | 0) + (delta | 0);
      return self.value;
    },
    'getAndAdd(I)I': (self, [delta]) => {
      const previous = self.value | 0;
      self.value = previous + (delta | 0);
      return previous;
    },
    'compareAndSet(II)Z': (self, [expected, value]) => {
      if ((self.value | 0) !== (expected | 0)) return false;
      self.value = value | 0;
      return true;
    },
    'intValue()I': (self) => self.value | 0,
    'toString()Ljava/lang/String;': (self) => String(self.value | 0),
  },
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/atomic/AtomicBoolean;'] = nativeDef('Ljava/util/concurrent/atomic/AtomicBoolean;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.value = false;
  }, { value: false }),
  methods: {
    '<init>()V': (self) => {
      self.value = false;
    },
    '<init>(Z)V': (self, [value]) => {
      self.value = !!value;
    },
    'get()Z': (self) => !!self.value,
    'set(Z)V': (self, [value]) => {
      self.value = !!value;
    },
    'lazySet(Z)V': (self, [value]) => {
      self.value = !!value;
    },
    'getAndSet(Z)Z': (self, [value]) => {
      const previous = !!self.value;
      self.value = !!value;
      return previous;
    },
    'compareAndSet(ZZ)Z': (self, [expected, value]) => {
      if (!!self.value !== !!expected) return false;
      self.value = !!value;
      return true;
    },
    'weakCompareAndSet(ZZ)Z': (self, [expected, value]) => {
      if (!!self.value !== !!expected) return false;
      self.value = !!value;
      return true;
    },
    'compareAndExchange(ZZ)Z': (self, [expected, value]) => {
      const previous = !!self.value;
      if (previous === !!expected) self.value = !!value;
      return previous;
    },
    'toString()Ljava/lang/String;': (self) => String(!!self.value),
  },
});
JAVA_CORE_CLASSES['Ljava/lang/Runtime;'] = nativeDef('Ljava/lang/Runtime;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.cached = new Map();
  }, { cached: new Map() }),
  staticMethods: {
    'getRuntime()Ljava/lang/Runtime;': (_self, _args, vm) => getRuntimeSingleton(vm),
  },
  methods: {
    'availableProcessors()I': () => deviceCapabilities().cores,
    'maxMemory()J': () => BigInt(deviceCapabilities().memoryBytes),
    'totalMemory()J': () => BigInt(deviceCapabilities().memoryBytes),
    'freeMemory()J': () => BigInt(deviceCapabilities().availBytes),
    'gc()V': () => undefined,
    'runFinalization()V': () => undefined,
    'exit(I)V': () => undefined,
    'halt(I)V': () => undefined,
    'addShutdownHook(Ljava/lang/Thread;)V': () => undefined,
    'removeShutdownHook(Ljava/lang/Thread;)Z': () => false,
    'loadLibrary(Ljava/lang/String;)V': () => undefined,
    'load(Ljava/lang/String;)V': () => undefined,
  },
});
JAVA_CORE_CLASSES['Ljava/io/Writer;'] = nativeDef('Ljava/io/Writer;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/io/Closeable;', 'Ljava/io/Flushable;', 'Ljava/lang/Appendable;'],
  ctor: peerClass(function () {
    this.buffer = '';
    this.lock = this;
  }, { buffer: '', lock: null }),
  methods: {
    'write(I)V': (self, [code]) => {
      self.buffer = (self.buffer || '') + String.fromCharCode(code | 0);
    },
    'write([C)V': (self, [chars]) => {
      const values = Array.isArray(chars) ? chars : (chars?.$data || []);
      self.buffer = (self.buffer || '') + values.map((c) => String.fromCharCode(c | 0)).join('');
    },
    'write([CII)V': (self, [chars, offset, length]) => {
      const values = Array.isArray(chars) ? chars : (chars?.$data || []);
      self.buffer = (self.buffer || '') + values.slice(offset | 0, (offset | 0) + (length | 0)).map((c) => String.fromCharCode(c | 0)).join('');
    },
    'write(Ljava/lang/String;)V': (self, [text]) => {
      self.buffer = (self.buffer || '') + jsString(text);
    },
    'write(Ljava/lang/String;II)V': (self, [text, offset, length]) => {
      self.buffer = (self.buffer || '') + jsString(text).substr(offset | 0, length | 0);
    },
    'append(Ljava/lang/CharSequence;)Ljava/io/Writer;': (self, [text]) => {
      self.buffer = (self.buffer || '') + jsString(text);
      return self.$object ?? self;
    },
    'append(Ljava/lang/CharSequence;II)Ljava/io/Writer;': (self, [text, start, end]) => {
      self.buffer = (self.buffer || '') + jsString(text).slice(start | 0, end | 0);
      return self.$object ?? self;
    },
    'append(C)Ljava/io/Writer;': (self, [code]) => {
      self.buffer = (self.buffer || '') + String.fromCharCode(code | 0);
      return self.$object ?? self;
    },
    'flush()V': () => undefined,
    'close()V': () => undefined,
  },
});
JAVA_CORE_CLASSES['Ljava/io/FileWriter;'] = nativeDef('Ljava/io/FileWriter;', {
  super: 'Ljava/io/Writer;',
  ctor: peerClass(function () {
    this.path = '';
    this.buffer = '';
    this.append = false;
  }, { path: '', buffer: '', append: false }),
  methods: {
    '<init>(Ljava/lang/String;)V': (self, [path]) => {
      self.path = jsString(path);
      self.buffer = '';
      self.append = false;
    },
    '<init>(Ljava/lang/String;Z)V': (self, [path, append]) => {
      self.path = jsString(path);
      self.buffer = '';
      self.append = !!append;
    },
    '<init>(Ljava/io/File;)V': (self, [file]) => {
      self.path = file?.path ?? '';
      self.buffer = '';
      self.append = false;
    },
    '<init>(Ljava/io/File;Z)V': (self, [file, append]) => {
      self.path = file?.path ?? '';
      self.buffer = '';
      self.append = !!append;
    },
    '<init>(Ljava/io/FileDescriptor;)V': (self) => {
      self.path = '';
      self.buffer = '';
      self.append = false;
    },
    'write(I)V': (self, [code]) => {
      self.buffer = (self.buffer || '') + String.fromCharCode(code | 0);
    },
    'write([C)V': (self, [chars]) => {
      const values = Array.isArray(chars) ? chars : (chars?.$data || []);
      self.buffer = (self.buffer || '') + values.map((c) => String.fromCharCode(c | 0)).join('');
    },
    'write([CII)V': (self, [chars, offset, length]) => {
      const values = Array.isArray(chars) ? chars : (chars?.$data || []);
      self.buffer = (self.buffer || '') + values.slice(offset | 0, (offset | 0) + (length | 0)).map((c) => String.fromCharCode(c | 0)).join('');
    },
    'write(Ljava/lang/String;)V': (self, [text]) => {
      self.buffer = (self.buffer || '') + jsString(text);
    },
    'write(Ljava/lang/String;II)V': (self, [text, offset, length]) => {
      self.buffer = (self.buffer || '') + jsString(text).substr(offset | 0, length | 0);
    },
    'append(Ljava/lang/CharSequence;)Ljava/io/Writer;': (self, [text]) => {
      self.buffer = (self.buffer || '') + jsString(text);
      return self.$object ?? self;
    },
    'append(C)Ljava/io/Writer;': (self, [code]) => {
      self.buffer = (self.buffer || '') + String.fromCharCode(code | 0);
      return self.$object ?? self;
    },
    'flush()V': (self) => flushFileWriter(self),
    'close()V': (self) => flushFileWriter(self),
  },
});
JAVA_CORE_CLASSES['Ljava/io/Reader;'] ??= nativeDef('Ljava/io/Reader;', { super: 'Ljava/lang/Object;', interfaces: ['Ljava/io/Closeable;'] });

const TEXT_ENCODER = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const TEXT_DECODER = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

function utf8Encode(text) {
  const value = String(text ?? '');
  if (TEXT_ENCODER) return TEXT_ENCODER.encode(value);
  const bytes = [];
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(bytes);
}

function utf8Decode(bytes) {
  if (!bytes) return '';
  const view = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  if (TEXT_DECODER) return TEXT_DECODER.decode(view);
  let out = '';
  for (let i = 0; i < view.length; i++) out += String.fromCharCode(view[i]);
  return out;
}

function readFsText(path) {
  const name = String(path || '');
  const virtual = VIRTUAL_FS.read(name);
  if (virtual) return utf8Decode(virtual);
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = globalThis.__nodeFs;
      if (fs && name) return fs.existsSync(name) ? fs.readFileSync(name, 'utf8') : '';
    }
  } catch (error) {
    void error;
  }
  return '';
}

function javaRegexReplacement(replacement) {
  return replacement.replace(/\\(.)/g, '$1').replace(/\$(\d)/g, '$$$$$1');
}

function javaSplit(text, pattern, limit) {
  const input = String(text ?? '');
  const expression = String(pattern);
  if (limit > 0) {
    const parts = input.split(new RegExp(expression));
    if (parts.length <= limit) return parts;
    const head = parts.slice(0, limit - 1);
    head.push(parts.slice(limit - 1).join(expression));
    return head;
  }
  const parts = input.split(new RegExp(expression));
  if (limit === 0) {
    while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  }
  return parts;
}

function readerText(source) {
  if (source === null || source === undefined) return '';
  if (typeof source === 'string') return source;
  if (source.text !== undefined) return String(source.text ?? '');
  if (source.$peer && source.$peer.text !== undefined) return String(source.$peer.text ?? '');
  const bytes = source.data || source.$bytes;
  if (bytes) return utf8Decode(bytes);
  return '';
}

JAVA_CORE_CLASSES['Ljava/io/FileReader;'] = nativeDef('Ljava/io/FileReader;', {
  super: 'Ljava/io/Reader;',
  ctor: peerClass(function () {
    this.path = '';
    this.text = '';
    this.cursor = 0;
    this.closed = false;
  }, { path: '', text: '', cursor: 0, closed: false }),
  methods: {
    '<init>(Ljava/lang/String;)V': (self, [path], vm) => {
      self.path = jsString(path);
      self.text = readFsText(self.path);
      self.cursor = 0;
      self.closed = false;
    },
    '<init>(Ljava/io/File;)V': (self, [file], vm) => {
      self.path = file?.path ?? '';
      self.text = readFsText(self.path);
      self.cursor = 0;
      self.closed = false;
    },
    '<init>(Ljava/io/FileDescriptor;)V': (self) => {
      self.path = '';
      self.text = '';
      self.cursor = 0;
      self.closed = false;
    },
    'read()I': (self) => (self.closed || self.cursor >= self.text.length ? -1 : self.text.charCodeAt(self.cursor++)),
    'read([C)I': (self, [buffer]) => readCharsInto(self, buffer, 0, 0),
    'read([CII)I': (self, [buffer, offset, length]) => readCharsInto(self, buffer, offset, length),
    'ready()Z': (self) => !self.closed && self.cursor < self.text.length,
    'skip(J)J': (self, [count]) => {
      const step = Math.max(0, Number(count) || 0);
      const before = self.cursor;
      self.cursor = Math.min(self.text.length, self.cursor + step);
      return self.cursor - before;
    },
    'close()V': (self) => { self.closed = true; },
  },
});

JAVA_CORE_CLASSES['Ljava/io/BufferedReader;'] = nativeDef('Ljava/io/BufferedReader;', {
  super: 'Ljava/io/Reader;',
  ctor: peerClass(function () {
    this.text = '';
    this.cursor = 0;
    this.closed = false;
    this.source = null;
  }, { text: '', cursor: 0, closed: false, source: null }),
  methods: {
    '<init>(Ljava/io/Reader;)V': (self, [reader]) => {
      self.source = reader || null;
      self.text = readerText(reader);
      self.cursor = 0;
      self.closed = false;
    },
    '<init>(Ljava/io/Reader;I)V': (self, [reader]) => {
      self.source = reader || null;
      self.text = readerText(reader);
      self.cursor = 0;
      self.closed = false;
    },
    'readLine()Ljava/lang/String;': (self) => {
      if (self.closed || self.cursor >= self.text.length) return null;
      let end = self.text.indexOf('\n', self.cursor);
      if (end < 0) end = self.text.length;
      let line = self.text.slice(self.cursor, end);
      self.cursor = end < self.text.length ? end + 1 : end;
      if (line.endsWith('\r')) line = line.slice(0, -1);
      return line;
    },
    'read()I': (self) => (self.closed || self.cursor >= self.text.length ? -1 : self.text.charCodeAt(self.cursor++)),
    'read([C)I': (self, [buffer]) => readCharsInto(self, buffer, 0, 0),
    'read([CII)I': (self, [buffer, offset, length]) => readCharsInto(self, buffer, offset, length),
    'ready()Z': (self) => !self.closed && self.cursor < self.text.length,
    'skip(J)J': (self, [count]) => {
      const step = Math.max(0, Number(count) || 0);
      const before = self.cursor;
      self.cursor = Math.min(self.text.length, self.cursor + step);
      return self.cursor - before;
    },
    'close()V': (self) => {
      self.closed = true;
      if (self.source && typeof self.source === 'object') self.source.closed = true;
    },
  },
});

JAVA_CORE_CLASSES['Ljava/io/StringReader;'] = nativeDef('Ljava/io/StringReader;', {
  super: 'Ljava/io/Reader;',
  ctor: peerClass(function () {
    this.text = '';
    this.cursor = 0;
  }, { text: '', cursor: 0 }),
  methods: {
    '<init>(Ljava/lang/String;)V': (self, [text]) => {
      self.text = jsString(text);
      self.cursor = 0;
    },
    'read()I': (self) => (self.cursor >= self.text.length ? -1 : self.text.charCodeAt(self.cursor++)),
    'read([C)I': (self, [buffer]) => readCharsInto(self, buffer, 0, 0),
    'read([CII)I': (self, [buffer, offset, length]) => readCharsInto(self, buffer, offset, length),
    'close()V': () => undefined,
  },
});

JAVA_CORE_CLASSES['Ljava/io/StringWriter;'] = nativeDef('Ljava/io/StringWriter;', {
  super: 'Ljava/io/Writer;',
  ctor: peerClass(function () {
    this.buffer = '';
    this.lock = this;
  }, { buffer: '', lock: null }),
  methods: {
    '<init>()V': (self) => {
      self.buffer = '';
    },
    '<init>(I)V': (self) => {
      self.buffer = '';
    },
    'write(Ljava/lang/String;)V': (self, [text]) => {
      self.buffer += jsString(text);
    },
    'write(Ljava/lang/String;II)V': (self, [text, offset, length]) => {
      self.buffer += jsString(text).substr(offset | 0, length | 0);
    },
    'write(I)V': (self, [code]) => {
      self.buffer += String.fromCharCode(code | 0);
    },
    'write([CII)V': (self, [chars, offset, length]) => {
      const values = Array.isArray(chars) ? chars : (chars?.$data || []);
      self.buffer += values.slice(offset | 0, (offset | 0) + (length | 0)).map((c) => String.fromCharCode(c | 0)).join('');
    },
    'append(Ljava/lang/CharSequence;)Ljava/io/StringWriter;': (self, [text]) => {
      self.buffer += jsString(text);
      return self.$object ?? self;
    },
    'append(C)Ljava/io/StringWriter;': (self, [code]) => {
      self.buffer += String.fromCharCode(code | 0);
      return self.$object ?? self;
    },
    'getBuffer()Ljava/lang/StringBuffer;': (self, _args, vm) => vm.instantiate('Ljava/lang/StringBuffer;', [self.buffer]),
    'toString()Ljava/lang/String;': (self) => self.buffer,
    'flush()V': () => undefined,
    'close()V': () => undefined,
  },
});
JAVA_CORE_CLASSES['Ljava/io/PrintWriter;'] = nativeDef('Ljava/io/PrintWriter;', {
  super: 'Ljava/io/Writer;',
  ctor: peerClass(function () {
    this.writer = null;
    this.autoFlush = false;
  }, { writer: null, autoFlush: false }),
  methods: {
    '<init>(Ljava/io/Writer;)V': (self, [writer]) => {
      self.writer = writer;
      self.autoFlush = false;
    },
    '<init>(Ljava/io/Writer;Z)V': (self, [writer, autoFlush]) => {
      self.writer = writer;
      self.autoFlush = !!autoFlush;
    },
    '<init>(Ljava/io/OutputStream;)V': (self, [stream]) => {
      self.writer = stream;
      self.autoFlush = false;
    },
    '<init>(Ljava/io/OutputStream;Z)V': (self, [stream, autoFlush]) => {
      self.writer = stream;
      self.autoFlush = !!autoFlush;
    },
    'print(Ljava/lang/String;)V': (self, [text]) => writeThrough(self, jsString(text)),
    'print(Ljava/lang/Object;)V': (self, [value]) => writeThrough(self, value === null || value === undefined ? 'null' : String(value)),
    'print(C)V': (self, [code]) => writeThrough(self, String.fromCharCode(code | 0)),
    'print(I)V': (self, [value]) => writeThrough(self, String(value | 0)),
    'print(J)V': (self, [value]) => writeThrough(self, String(Number(value))),
    'print(Z)V': (self, [value]) => writeThrough(self, String(!!value)),
    'println()V': (self) => writeThrough(self, '\n'),
    'println(Ljava/lang/String;)V': (self, [text]) => writeThrough(self, `${jsString(text)}\n`),
    'println(Ljava/lang/Object;)V': (self, [value]) => writeThrough(self, `${value === null || value === undefined ? 'null' : String(value)}\n`),
    'println(I)V': (self, [value]) => writeThrough(self, `${value | 0}\n`),
    'println(J)V': (self, [value]) => writeThrough(self, `${Number(value)}\n`),
    'println(Z)V': (self, [value]) => writeThrough(self, `${!!value}\n`),
    'println(C)V': (self, [code]) => writeThrough(self, `${String.fromCharCode(code | 0)}\n`),
    'write(Ljava/lang/String;)V': (self, [text]) => writeThrough(self, jsString(text)),
    'flush()V': (self, _args, vm) => {
      if (self.writer) vm.invokeByName?.('flush', '()V', self.writer, []);
    },
    'close()V': (self, _args, vm) => {
      if (self.writer) vm.invokeByName?.('close', '()V', self.writer, []);
    },
    'checkError()Z': () => false,
  },
});
JAVA_CORE_CLASSES['Ljava/util/Date;'] = nativeDef('Ljava/util/Date;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.time = Date.now();
  }, { time: 0 }),
  methods: {
    '<init>()V': (self) => {
      self.time = Date.now();
    },
    '<init>(J)V': (self, [time]) => {
      self.time = Number(time) || 0;
    },
    'getTime()J': (self) => self.time || 0,
    'setTime(J)V': (self, [time]) => {
      self.time = Number(time) || 0;
    },
    'before(Ljava/util/Date;)Z': (self, [other]) => ((self.time || 0) < (other?.$peer?.time ?? 0) ? 1 : 0),
    'after(Ljava/util/Date;)Z': (self, [other]) => ((self.time || 0) > (other?.$peer?.time ?? 0) ? 1 : 0),
    'equals(Ljava/lang/Object;)Z': (self, [other]) => ((self.time || 0) === (other?.$peer?.time ?? NaN) ? 1 : 0),
    'compareTo(Ljava/util/Date;)I': (self, [other]) => Math.sign((self.time || 0) - (other?.$peer?.time ?? 0)) | 0,
    'toString()Ljava/lang/String;': (self) => new Date(self.time || 0).toISOString(),
  },
});

JAVA_CORE_CLASSES['Ljava/util/TimeZone;'] = nativeDef('Ljava/util/TimeZone;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.id = 'UTC';
  }, { id: 'UTC' }),
  methods: {
    'getID()Ljava/lang/String;': (self) => self.id || 'UTC',
    'setID(Ljava/lang/String;)V': (self, [id]) => {
      self.id = jsString(id) || 'UTC';
    },
    'getOffset(J)I': () => 0,
    'getRawOffset()I': () => 0,
    'inDaylightTime(Ljava/util/Date;)Z': () => 0,
    'useDaylightTime()Z': () => 0,
    'getDisplayName()Ljava/lang/String;': (self) => self.id || 'UTC',
    'getDisplayName(ZI)Ljava/lang/String;': (self) => self.id || 'UTC',
    'getDisplayName(Ljava/util/Locale;)Ljava/lang/String;': (self) => self.id || 'UTC',
  },
  staticMethods: {
    'getDefault()Ljava/util/TimeZone;': (_self, _args, vm) => vm.instantiate('Ljava/util/TimeZone;', []),
    'getTimeZone(Ljava/lang/String;)Ljava/util/TimeZone;': (_self, [id], vm) => {
      const tz = vm.instantiate('Ljava/util/TimeZone;', []);
      const peer = vm.registry.getPeer(tz, 'Ljava/util/TimeZone;');
      if (peer) peer.id = jsString(id) || 'UTC';
      return tz;
    },
    'getAvailableIDs()[Ljava/lang/String;': (_self, _args, vm) => {
      const array = vm.newArray('[Ljava/lang/String;', 1);
      array.$data[0] = 'UTC';
      return array;
    },
  },
});

JAVA_CORE_CLASSES['Ljava/sql/Timestamp;'] = nativeDef('Ljava/sql/Timestamp;', {
  super: 'Ljava/util/Date;',
  ctor: peerClass(function () {
    this.time = 0;
    this.nanos = 0;
  }, { time: 0, nanos: 0 }),
  methods: {
    '<init>(J)V': (self, [time]) => {
      self.time = Number(time) | 0;
      self.nanos = 0;
    },
    'getTime()J': (self) => self.time,
    'setTime(J)V': (self, [time]) => {
      self.time = Number(time) | 0;
    },
    'getNanos()I': (self) => self.nanos | 0,
    'setNanos(I)V': (self, [nanos]) => {
      self.nanos = nanos | 0;
    },
    'toString()Ljava/lang/String;': (self) => new Date(self.time).toISOString().replace('T', ' ').replace('Z', ''),
  },
  staticMethods: {
    'valueOf(Ljava/lang/String;)Ljava/sql/Timestamp;': (self) => self,
  },
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/locks/ReentrantReadWriteLock;'] = nativeDef('Ljava/util/concurrent/locks/ReentrantReadWriteLock;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/util/concurrent/locks/ReadWriteLock;'],
  ctor: peerClass(function () {
    this.readLockObject = null;
    this.writeLockObject = null;
  }, { readLockObject: null, writeLockObject: null }),
  methods: {
    '<init>()V': () => undefined,
    '<init>(Z)V': () => undefined,
    'readLock()Ljava/util/concurrent/locks/Lock;': (self, _args, vm) => getNamedLock(vm, self, 'read'),
    'writeLock()Ljava/util/concurrent/locks/Lock;': (self, _args, vm) => getNamedLock(vm, self, 'write'),
  },
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/locks/Lock;'] = nativeDef('Ljava/util/concurrent/locks/Lock;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.owner = null;
    this.held = false;
  }, { owner: null, held: false }),
  methods: {
    'lock()V': () => undefined,
    'lockInterruptibly()V': () => undefined,
    'tryLock()Z': () => true,
    'tryLock(JLjava/util/concurrent/TimeUnit;)Z': () => true,
    'unlock()V': () => undefined,
    'newCondition()Ljava/util/concurrent/locks/Condition;': () => null,
  },
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/CopyOnWriteArrayList;'] = nativeDef('Ljava/util/concurrent/CopyOnWriteArrayList;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/util/List;', 'Ljava/util/Collection;'],
  ctor: peerClass(function () {
    this.items = [];
  }, { items: [] }),
  methods: listMethods(),
});
JAVA_CORE_CLASSES['Ljava/util/ArrayDeque;'] = nativeDef('Ljava/util/ArrayDeque;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/util/Collection;'],
  ctor: peerClass(function () {
    this.items = [];
  }, { items: [] }),
  methods: {
    '<init>()V': (self) => {
      self.items = [];
    },
    'add(Ljava/lang/Object;)Z': (self, [value]) => {
      self.items.push(value);
      return true;
    },
    'addFirst(Ljava/lang/Object;)V': (self, [value]) => {
      self.items.unshift(value);
    },
    'addLast(Ljava/lang/Object;)V': (self, [value]) => {
      self.items.push(value);
    },
    'offer(Ljava/lang/Object;)Z': (self, [value]) => {
      self.items.push(value);
      return true;
    },
    'poll()Ljava/lang/Object;': (self) => (self.items.length ? self.items.shift() : null),
    'peek()Ljava/lang/Object;': (self) => (self.items.length ? self.items[0] : null),
    'size()I': (self) => self.items.length,
    'isEmpty()Z': (self) => self.items.length === 0,
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => makeIterator(vm, self.items || []),
  },
});
JAVA_CORE_CLASSES['Ljava/util/HashSet;'] = nativeDef('Ljava/util/HashSet;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/util/Set;', 'Ljava/util/Collection;'],
  ctor: peerClass(function () {
    this.setItems = [];
  }, { setItems: [] }),
  methods: {
    '<init>()V': (self) => {
      self.setItems = [];
    },
    '<init>(I)V': (self) => {
      self.setItems = [];
    },
    '<init>(IF)V': (self) => {
      self.setItems = [];
    },
    '<init>(IFZ)V': (self) => {
      self.setItems = [];
    },
    // new HashSet(collection)：漏掉这个构造会让集合保持空，
    // 依赖它的组件注册（Firebase Component.Builder）直接看不到任何接口。
    '<init>(Ljava/util/Collection;)V': (self, [source], vm) => {
      self.setItems = [];
      for (const item of collectionItems(source)) {
        if (findSetIndex(self, item, vm) < 0) self.setItems.push(item);
      }
    },
    'add(Ljava/lang/Object;)Z': (self, [value], vm) => {
      if (!self.setItems) self.setItems = [];
      if (findSetIndex(self, value, vm) >= 0) return false;
      self.setItems.push(value);
      return true;
    },
    'remove(Ljava/lang/Object;)Z': (self, [value], vm) => {
      const index = findSetIndex(self, value, vm);
      if (index < 0) return false;
      self.setItems.splice(index, 1);
      return true;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value], vm) => findSetIndex(self, value, vm) >= 0,
    'size()I': (self) => (self.setItems || []).length,
    'isEmpty()Z': (self) => (self.setItems || []).length === 0,
    'clear()V': (self) => {
      self.setItems = [];
    },
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => makeIterator(vm, self.setItems || []),
  },
});
// 保持插入顺序的 Set。Material 的监听器集合普遍用它，
// 缺了它这些集合会退化成裸对象，iterator() 返回 null，
// 表现为「调用 hasNext 时对象为空」，而报错点离真正的缺失很远。
JAVA_CORE_CLASSES['Ljava/util/LinkedHashSet;'] = nativeDef('Ljava/util/LinkedHashSet;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/util/Set;', 'Ljava/util/Collection;'],
  ctor: peerClass(function () {
    this.setItems = [];
  }, { setItems: [] }),
  methods: {
    '<init>()V': (self) => {
      self.setItems = [];
    },
    '<init>(I)V': (self) => {
      self.setItems = [];
    },
    '<init>(IF)V': (self) => {
      self.setItems = [];
    },
    '<init>(IFZ)V': (self) => {
      self.setItems = [];
    },
    '<init>(Ljava/util/Collection;)V': (self, [source], vm) => {
      const items = source?.$peer?.setItems || source?.$peer?.items || source?.$data || source?.setItems || source?.items || [];
      self.setItems = [];
      for (const item of items) if (findSetIndex(self, item, vm) < 0) self.setItems.push(item);
    },
    'add(Ljava/lang/Object;)Z': (self, [value], vm) => {
      if (!self.setItems) self.setItems = [];
      if (findSetIndex(self, value, vm) >= 0) return false;
      self.setItems.push(value);
      return true;
    },
    'remove(Ljava/lang/Object;)Z': (self, [value], vm) => {
      const index = findSetIndex(self, value, vm);
      if (index < 0) return false;
      self.setItems.splice(index, 1);
      return true;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value], vm) => findSetIndex(self, value, vm) >= 0,
    'size()I': (self) => (self.setItems || []).length,
    'isEmpty()Z': (self) => (self.setItems || []).length === 0,
    'clear()V': (self) => {
      self.setItems = [];
    },
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => makeIterator(vm, self.setItems || []),
  },
});
JAVA_CORE_CLASSES['Ljava/util/concurrent/CopyOnWriteArraySet;'] = nativeDef('Ljava/util/concurrent/CopyOnWriteArraySet;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/util/Set;', 'Ljava/util/Collection;'],
  ctor: peerClass(function () {
    this.setItems = [];
  }, { setItems: [] }),
  methods: {
    '<init>()V': (self) => {
      self.setItems = [];
    },
    '<init>(Ljava/util/Collection;)V': (self, [other], vm) => {
      self.setItems = [];
      for (const item of collectionItems(other)) if (findSetIndex(self, item, vm) < 0) self.setItems.push(item);
    },
    'add(Ljava/lang/Object;)Z': (self, [value], vm) => {
      if (findSetIndex(self, value, vm) >= 0) return false;
      self.setItems = [...self.setItems, value];
      return true;
    },
    'addIfAbsent(Ljava/lang/Object;)Z': (self, [value], vm) => {
      if (findSetIndex(self, value, vm) >= 0) return false;
      self.setItems = [...self.setItems, value];
      return true;
    },
    'remove(Ljava/lang/Object;)Z': (self, [value], vm) => {
      const index = findSetIndex(self, value, vm);
      if (index < 0) return false;
      self.setItems = self.setItems.filter((_item, i) => i !== index);
      return true;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value], vm) => findSetIndex(self, value, vm) >= 0,
    'size()I': (self) => self.setItems.length,
    'isEmpty()Z': (self) => self.setItems.length === 0,
    'clear()V': (self) => {
      self.setItems = [];
    },
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => makeIterator(vm, self.setItems || []),
    'toArray()[Ljava/lang/Object;': (self, _args, vm) => {
      const array = vm.newArray('[Ljava/lang/Object;', self.setItems.length);
      for (let i = 0; i < self.setItems.length; i++) array.$data[i] = self.setItems[i];
      return array;
    },
  },
});
JAVA_CORE_CLASSES['Ljava/util/Map$Entry;'] = nativeDef('Ljava/util/Map$Entry;', {
  super: 'Ljava/lang/Object;',
  methods: {
    'getKey()Ljava/lang/Object;': (self) => mapEntryPeer(self)?.key ?? null,
    'getValue()Ljava/lang/Object;': (self) => mapEntryPeer(self)?.value ?? null,
    'setValue(Ljava/lang/Object;)Ljava/lang/Object;': (self, [value]) => {
      const peer = mapEntryPeer(self);
      if (!peer) return null;
      const previous = peer.value ?? null;
      peer.value = value ?? null;
      if (peer.map instanceof Map) peer.map.set(peer.key, peer.value);
      return previous;
    },
    'equals(Ljava/lang/Object;)Z': (self, [other]) => {
      const left = mapEntryPeer(self);
      const right = mapEntryPeer(other);
      if (!left || !right) return self === other ? 1 : 0;
      return Object.is(left.key, right.key) && Object.is(left.value, right.value) ? 1 : 0;
    },
    'hashCode()I': (self) => {
      const peer = mapEntryPeer(self);
      if (!peer) return 0;
      return ((peer.key === null ? 0 : hashCode(peer.key)) ^ (peer.value === null ? 0 : hashCode(peer.value))) | 0;
    },
    'comparingByKey()Ljava/util/Comparator;': (_self, _args, vm) => makeComparator(vm, (a, b) => defaultArrayCompare(mapEntryPeer(a)?.key, mapEntryPeer(b)?.key)),
    'comparingByValue()Ljava/util/Comparator;': (_self, _args, vm) => makeComparator(vm, (a, b) => defaultArrayCompare(mapEntryPeer(a)?.value, mapEntryPeer(b)?.value)),
    'comparingByKey(Ljava/util/Comparator;)Ljava/util/Comparator;': (_self, [comparator], vm) => {
      const compare = comparatorFor(comparator, vm);
      return makeComparator(vm, (a, b) => compare(mapEntryPeer(a)?.key, mapEntryPeer(b)?.key));
    },
    'comparingByValue(Ljava/util/Comparator;)Ljava/util/Comparator;': (_self, [comparator], vm) => {
      const compare = comparatorFor(comparator, vm);
      return makeComparator(vm, (a, b) => compare(mapEntryPeer(a)?.value, mapEntryPeer(b)?.value));
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/Map;'] = nativeDef('Ljava/util/Map;', {
  super: null,
  methods: {
    'size()I': (self) => mapPeer(self)?.size ?? 0,
    'isEmpty()Z': (self) => ((mapPeer(self)?.size ?? 0) === 0 ? 1 : 0),
    'containsKey(Ljava/lang/Object;)Z': (self, [key]) => (mapPeer(self)?.has(key) ? 1 : 0),
    'containsValue(Ljava/lang/Object;)Z': (self, [value], vm) => {
      for (const current of mapPeer(self)?.values() ?? []) if (valuesEqual(current, value, vm)) return 1;
      return 0;
    },
    'get(Ljava/lang/Object;)Ljava/lang/Object;': (self, [key]) => mapPeer(self)?.get(key) ?? null,
    'getOrDefault(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, fallback]) => {
      const map = mapPeer(self);
      return map?.has(key) ? map.get(key) : (fallback ?? null);
    },
    'put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, value]) => {
      const map = mapPeer(self);
      if (!map) return null;
      const previous = map.has(key) ? map.get(key) : null;
      map.set(key, value ?? null);
      return previous;
    },
    'putAll(Ljava/util/Map;)V': (self, [source]) => {
      const target = mapPeer(self);
      const other = mapPeer(source);
      if (!target || !other) return undefined;
      for (const [key, value] of other) target.set(key, value);
      return undefined;
    },
    'remove(Ljava/lang/Object;)Ljava/lang/Object;': (self, [key]) => {
      const map = mapPeer(self);
      if (!map) return null;
      const previous = map.has(key) ? map.get(key) : null;
      map.delete(key);
      return previous;
    },
    'remove(Ljava/lang/Object;Ljava/lang/Object;)Z': (self, [key, value], vm) => {
      const map = mapPeer(self);
      if (!map?.has(key) || !valuesEqual(map.get(key), value, vm)) return 0;
      map.delete(key);
      return 1;
    },
    'clear()V': (self) => {
      mapPeer(self)?.clear();
      return undefined;
    },
    'keySet()Ljava/util/Set;': (self, _args, vm) => makeSet(vm, [...(mapPeer(self)?.keys() ?? [])]),
    'values()Ljava/util/Collection;': (self, _args, vm) => makeList(vm, [...(mapPeer(self)?.values() ?? [])]),
    'entrySet()Ljava/util/Set;': (self, _args, vm) => {
      const map = mapPeer(self);
      if (!map) return makeSet(vm, []);
      const entries = [];
      for (const [key, value] of map) {
        const entry = vm.allocateRawObject('Ljava/util/Map$Entry;');
        entry.$peer = { key, value, map };
        entries.push(entry);
      }
      return makeSet(vm, entries);
    },
    'equals(Ljava/lang/Object;)Z': (self, [other]) => {
      const left = mapPeer(self);
      const right = mapPeer(other);
      if (!left || !right) return self === other ? 1 : 0;
      if (left.size !== right.size) return 0;
      for (const [key, value] of left) {
        if (!right.has(key) || !Object.is(right.get(key), value)) return 0;
      }
      return 1;
    },
    'hashCode()I': (self) => {
      let result = 0;
      for (const [key, value] of mapPeer(self) ?? []) {
        result = (result + ((key === null ? 0 : hashCode(key)) ^ (value === null ? 0 : hashCode(value)))) | 0;
      }
      return result;
    },
    'forEach(Ljava/util/function/BiConsumer;)V': (self, [consumer], vm) => {
      for (const [key, value] of mapPeer(self) ?? []) {
        vm.invokeInterface(consumer, 'accept', '(Ljava/lang/Object;Ljava/lang/Object;)V', [key, value]);
      }
      return undefined;
    },
    'replaceAll(Ljava/util/function/BiFunction;)V': (self, [fn], vm) => {
      const map = mapPeer(self);
      if (!map) return undefined;
      for (const [key, value] of [...map]) {
        map.set(key, vm.invokeInterface(fn, 'apply', '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;', [key, value]));
      }
      return undefined;
    },
    'putIfAbsent(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, value]) => {
      const map = mapPeer(self);
      if (!map) return null;
      if (map.has(key) && map.get(key) !== null) return map.get(key);
      const previous = map.has(key) ? map.get(key) : null;
      map.set(key, value ?? null);
      return previous;
    },
    'replace(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, value]) => {
      const map = mapPeer(self);
      if (!map?.has(key)) return null;
      const previous = map.get(key);
      map.set(key, value ?? null);
      return previous;
    },
    'replace(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Z': (self, [key, oldValue, newValue], vm) => {
      const map = mapPeer(self);
      if (!map?.has(key) || !valuesEqual(map.get(key), oldValue, vm)) return 0;
      map.set(key, newValue ?? null);
      return 1;
    },
    'computeIfAbsent(Ljava/lang/Object;Ljava/util/function/Function;)Ljava/lang/Object;': (self, [key, fn], vm) => {
      const map = mapPeer(self);
      if (!map) return null;
      const current = map.get(key);
      if (current !== null && current !== undefined) return current;
      const computed = vm.invokeInterface(fn, 'apply', '(Ljava/lang/Object;)Ljava/lang/Object;', [key]);
      if (computed !== null && computed !== undefined) map.set(key, computed);
      return computed ?? null;
    },
    'computeIfPresent(Ljava/lang/Object;Ljava/util/function/BiFunction;)Ljava/lang/Object;': (self, [key, fn], vm) => {
      const map = mapPeer(self);
      if (!map?.has(key) || map.get(key) === null) return null;
      const computed = vm.invokeInterface(fn, 'apply', '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;', [key, map.get(key)]);
      if (computed === null || computed === undefined) map.delete(key);
      else map.set(key, computed);
      return computed ?? null;
    },
    'compute(Ljava/lang/Object;Ljava/util/function/BiFunction;)Ljava/lang/Object;': (self, [key, fn], vm) => {
      const map = mapPeer(self);
      if (!map) return null;
      const current = map.has(key) ? map.get(key) : null;
      const computed = vm.invokeInterface(fn, 'apply', '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;', [key, current]);
      if (computed === null || computed === undefined) map.delete(key);
      else map.set(key, computed);
      return computed ?? null;
    },
    'merge(Ljava/lang/Object;Ljava/lang/Object;Ljava/util/function/BiFunction;)Ljava/lang/Object;': (self, [key, value, fn], vm) => {
      const map = mapPeer(self);
      if (!map) return null;
      const current = map.get(key);
      let merged;
      if (current === null || current === undefined) merged = value;
      else if (value === null || value === undefined) merged = current;
      else merged = vm.invokeInterface(fn, 'apply', '(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;', [current, value]);
      if (merged === null || merged === undefined) map.delete(key);
      else map.set(key, merged);
      return merged ?? null;
    },
  },
  staticMethods: {
    'of()Ljava/util/Map;': (_self, _args, vm) => makeMap(vm),
    'of(Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/Map;': (_self, [key, value], vm) => {
      const map = makeMap(vm);
      map.$peer.map.set(key, value);
      return map;
    },
    'of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/Map;': (_self, [k1, v1, k2, v2], vm) => {
      const map = makeMap(vm);
      map.$peer.map.set(k1, v1);
      map.$peer.map.set(k2, v2);
      return map;
    },
    'of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/Map;': (_self, [k1, v1, k2, v2, k3, v3], vm) => {
      const map = makeMap(vm);
      map.$peer.map.set(k1, v1);
      map.$peer.map.set(k2, v2);
      map.$peer.map.set(k3, v3);
      return map;
    },
    'of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/Map;': (
      _self, [k1, v1, k2, v2, k3, v3, k4, v4], vm,
    ) => {
      const map = makeMap(vm);
      map.$peer.map.set(k1, v1);
      map.$peer.map.set(k2, v2);
      map.$peer.map.set(k3, v3);
      map.$peer.map.set(k4, v4);
      return map;
    },
    'ofEntries([Ljava/util/Map$Entry;)Ljava/util/Map;': (_self, [entries], vm) => {
      const map = makeMap(vm);
      for (const entry of arrayValues(entries)) {
        const peer = mapEntryPeer(entry);
        if (peer) map.$peer.map.set(peer.key, peer.value);
      }
      return map;
    },
    'entry(Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/Map$Entry;': (_self, [key, value], vm) => {
      const entry = vm.allocateRawObject('Ljava/util/Map$Entry;');
      entry.$peer = { key, value };
      return entry;
    },
    'copyOf(Ljava/util/Map;)Ljava/util/Map;': (_self, [source], vm) => {
      const map = makeMap(vm);
      const other = mapPeer(source);
      if (other) for (const [key, value] of other) map.$peer.map.set(key, value);
      return map;
    },
  },
});

function mapPeer(self) {
  if (!self) return null;
  if (self.map instanceof Map) return self.map;
  if (self.$peer?.map instanceof Map) return self.$peer.map;
  return null;
}

function mapEntryPeer(self) {
  if (!self) return null;
  if (typeof self === 'object' && 'key' in self && 'value' in self && !self.$peer) return self;
  return self.$peer ?? null;
}

JAVA_CORE_CLASSES['Landroid/content/res/ColorStateList;'] = nativeDef('Landroid/content/res/ColorStateList;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.states = [];
    this.colors = [];
  }, { states: [], colors: [] }),
  methods: {
    '<init>([[I[I)V': (self, [states, colors]) => {
      self.states = states?.$data || states || [];
      self.colors = colors?.$data || colors || [];
    },
    'getDefaultColor()I': (self) => {
      const states = self.states || [];
      const colors = self.colors || [];
      for (let i = 0; i < states.length; i++) {
        const spec = states[i]?.$data || states[i] || [];
        if (!spec.length && colors[i] !== undefined) return colors[i] | 0;
      }
      return Array.isArray(colors) && colors.length ? colors[0] | 0 : 0;
    },
    'getColorForState([II)I': (self, [stateSet, fallback]) => {
      const states = self.states || [];
      const colors = self.colors || [];
      for (let i = 0; i < states.length; i++) {
        if (!matchesStateSpec(states[i], stateSet)) continue;
        if (colors[i] !== undefined) return colors[i] | 0;
      }
      return fallback | 0;
    },
    'isStateful()Z': (self) => (self.states || []).some((s) => (s?.$data || s || []).length > 0),
    'withAlpha(I)Landroid/content/res/ColorStateList;': (self, [alpha], vm) => {
      const colors = (self.colors || []).map((color) => (((toInt(color) >>> 24) * (toInt(alpha) & 0xff) / 255) << 24 | (color & 0xffffff)) >>> 0);
      const wrapper = vm?.wrapPrimitiveArray ? vm.wrapPrimitiveArray(self.states || [], '[[I') : { $data: self.states };
      const colorArray = vm?.wrapPrimitiveArray ? vm.wrapPrimitiveArray(colors, '[I') : { $data: colors };
      void wrapper;
      const object = vm.allocateRawObject('Landroid/content/res/ColorStateList;');
      const peer = vm.registry.getPeer(object, 'Landroid/content/res/ColorStateList;');
      if (peer) {
        peer.states = self.states;
        peer.colors = colors;
      }
      return object;
    },
  },
  staticMethods: {
    'valueOf(I)Landroid/content/res/ColorStateList;': (self, [color], vm) => {
      const value = toInt(color) >>> 0;
      const existing = vm?._colorStateListCache?.get?.(value);
      if (existing) return existing;
      const object = vm.allocateRawObject('Landroid/content/res/ColorStateList;');
      const peer = vm.registry.getPeer(object, 'Landroid/content/res/ColorStateList;');
      if (peer) {
        peer.states = [[]];
        peer.colors = [value];
      }
      object.color = value;
      if (!vm._colorStateListCache) vm._colorStateListCache = new Map();
      vm._colorStateListCache.set(value, object);
      return object;
    },
  },
});

JAVA_CORE_CLASSES['Landroid/util/SparseArray;'] = nativeDef('Landroid/util/SparseArray;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.entries = new Map();
  }, { entries: new Map() }),
  methods: {
    'put(ILjava/lang/Object;)V': (self, [key, value]) => {
      self.entries.set(key | 0, value);
    },
    'get(I)Ljava/lang/Object;': (self, [key]) => {
      const v = self.entries.get(key | 0);
      return v === undefined ? null : v;
    },
    'get(ILjava/lang/Object;)Ljava/lang/Object;': (self, [key, fallback]) => {
      const v = self.entries.get(key | 0);
      return v === undefined ? fallback : v;
    },
    'delete(I)V': (self, [key]) => {
      self.entries.delete(key | 0);
    },
    'remove(I)V': (self, [key]) => {
      self.entries.delete(key | 0);
    },
    'removeAt(I)V': (self, [index]) => {
      const keys = Array.from(self.entries.keys());
      if (index >= 0 && index < keys.length) self.entries.delete(keys[index | 0]);
    },
    'size()I': (self) => self.entries.size,
    'clear()V': (self) => {
      self.entries.clear();
    },
    'keyAt(I)I': (self, [index]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      if (index < 0 || index >= keys.length) return 0;
      return keys[index | 0];
    },
    'valueAt(I)Ljava/lang/Object;': (self, [index]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      if (index < 0 || index >= keys.length) return null;
      const v = self.entries.get(keys[index | 0]);
      return v === undefined ? null : v;
    },
    'indexOfKey(I)I': (self, [key]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      return keys.indexOf(key | 0);
    },
    'indexOfValue(Ljava/lang/Object;)I': (self, [value]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      for (let i = 0; i < keys.length; i++) {
        if (self.entries.get(keys[i]) === value) return i;
      }
      return -1;
    },
    'containsKey(I)Z': (self, [key]) => self.entries.has(key | 0),
    'clone()Landroid/util/SparseArray;': (self, _args, vm) => {
      const object = vm.allocateRawObject('Landroid/util/SparseArray;');
      const copy = new Map(self.entries);
      if (object.$peer) object.$peer.entries = copy;
      return object;
    },
    'toString()Ljava/lang/String;': (self) => {
      const parts = [];
      for (const [k, v] of self.entries) parts.push(k + '=' + String(v));
      return '{' + parts.join(', ') + '}';
    },
  },
});

JAVA_CORE_CLASSES['Landroid/util/SparseIntArray;'] = nativeDef('Landroid/util/SparseIntArray;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.entries = new Map();
  }, { entries: new Map() }),
  methods: {
    'put(II)V': (self, [key, value]) => {
      self.entries.set(key | 0, value | 0);
    },
    'get(I)I': (self, [key]) => {
      const v = self.entries.get(key | 0);
      return v === undefined ? 0 : v;
    },
    'get(II)I': (self, [key, fallback]) => {
      const v = self.entries.get(key | 0);
      return v === undefined ? (fallback | 0) : v;
    },
    'delete(I)V': (self, [key]) => {
      self.entries.delete(key | 0);
    },
    'removeAt(I)V': (self, [index]) => {
      const keys = Array.from(self.entries.keys());
      if (index >= 0 && index < keys.length) self.entries.delete(keys[index | 0]);
    },
    'size()I': (self) => self.entries.size,
    'clear()V': (self) => {
      self.entries.clear();
    },
    'keyAt(I)I': (self, [index]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      if (index < 0 || index >= keys.length) return 0;
      return keys[index | 0];
    },
    'valueAt(I)I': (self, [index]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      if (index < 0 || index >= keys.length) return 0;
      const v = self.entries.get(keys[index | 0]);
      return v === undefined ? 0 : v;
    },
    'indexOfKey(I)I': (self, [key]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      return keys.indexOf(key | 0);
    },
    'containsKey(I)Z': (self, [key]) => self.entries.has(key | 0),
  },
});

JAVA_CORE_CLASSES['Landroid/util/LongSparseArray;'] = nativeDef('Landroid/util/LongSparseArray;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.entries = new Map();
  }, { entries: new Map() }),
  methods: {
    'put(JLjava/lang/Object;)V': (self, [key, value]) => {
      self.entries.set(Number(key), value);
    },
    'get(J)Ljava/lang/Object;': (self, [key]) => {
      const v = self.entries.get(Number(key));
      return v === undefined ? null : v;
    },
    'delete(J)V': (self, [key]) => {
      self.entries.delete(Number(key));
    },
    'remove(J)V': (self, [key]) => {
      self.entries.delete(Number(key));
    },
    'size()I': (self) => self.entries.size,
    'clear()V': (self) => {
      self.entries.clear();
    },
    'keyAt(I)J': (self, [index]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      if (index < 0 || index >= keys.length) return BigInt(0);
      return BigInt(keys[index | 0]);
    },
    'valueAt(I)Ljava/lang/Object;': (self, [index]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      if (index < 0 || index >= keys.length) return null;
      const v = self.entries.get(keys[index | 0]);
      return v === undefined ? null : v;
    },
    'indexOfKey(J)I': (self, [key]) => {
      const keys = Array.from(self.entries.keys()).sort((a, b) => a - b);
      return keys.indexOf(Number(key));
    },
    'containsKey(J)Z': (self, [key]) => self.entries.has(Number(key)),
  },
});

function makeIterator(vm, source) {
  const object = vm.allocateRawObject('Ljava/util/Iterator;');
  object.$peer = { cursor: 0, snapshot: [...source] };
  return object;
}

function makeComparator(vm, compare) {
  const object = vm.allocateRawObject('Ljava/util/Comparator;');
  object.$peer = { compare };
  return object;
}

function makeEnumeration(vm, items) {
  const object = vm.allocateRawObject('Ljava/util/Enumeration;');
  object.$peer = { cursor: 0, items: [...items] };
  return object;
}

function makeList(vm, items) {
  const object = vm.allocateRawObject('Ljava/util/ArrayList;');
  object.$peer = { items: [...items] };
  return object;
}

function getRuntimeSingleton(vm) {
  if (!vm.__runtimeSingleton) {
    vm.__runtimeSingleton = vm.instantiate('Ljava/lang/Runtime;', []);
  }
  return vm.__runtimeSingleton;
}

function writeThrough(writer, text) {
  const target = writer.writer;
  if (!target) return;
  if (typeof target.write === 'function') {
    target.write(text);
  } else if (target.buffer !== undefined) {
    target.buffer += text;
  }
}

function getNamedLock(vm, owner, kind) {
  const key = kind === 'read' ? 'readLockObject' : 'writeLockObject';
  if (!owner[key]) {
    owner[key] = vm.instantiate('Ljava/util/concurrent/locks/Lock;', []);
  }
  return owner[key];
}

function makeSet(vm, items) {
  const object = vm.allocateRawObject('Ljava/util/HashSet;');
  object.$peer = { setItems: [...items] };
  return object;
}

function iterableValues(source, vm) {
  if (!source) return [];
  if (Array.isArray(source.$data)) return [...source.$data];
  const peer = source.$peer || source;
  if (Array.isArray(peer.items)) return [...peer.items];
  if (Array.isArray(peer.setItems)) return [...peer.setItems];
  if (Array.isArray(peer.snapshot)) return [...peer.snapshot];
  if (source.$data !== undefined && typeof source.$data?.[Symbol.iterator] === 'function') return [...source.$data];
  if (typeof source.forEach === 'function' && !Array.isArray(peer)) return peer;
  return [];
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection.$data)) return [...collection.$data];
  const peer = collection.$peer || collection;
  if (Array.isArray(peer.items)) return [...peer.items];
  if (Array.isArray(peer.setItems)) return [...peer.setItems];
  return [];
}

function appendIterable(vm, builder, iterable) {
  for (const item of iterableValues(iterable, vm)) builder.add(item);
  return builder;
}

function getDefaultLocale(vm) {
  const def = vm.registry.resolve('Ljava/util/Locale;');
  let instance = def?.staticValues?.get('DEFAULT:Ljava/util/Locale;');
  if (!instance) {
    instance = vm.allocateRawObject('Ljava/util/Locale;');
    instance.$peer = { language: 'zh', country: 'CN' };
    def?.staticValues?.set('DEFAULT:Ljava/util/Locale;', instance);
  }
  return instance;
}

function makeMap(vm) {
  const object = vm.allocateRawObject('Ljava/util/HashMap;');
  object.$peer = { map: new Map() };
  return object;
}

function integerDef(descriptor, bits) {
  const isLong = bits === 64;
  const wrap = (value, vm) => vm.wrapPeer({ value: isLong ? toLong(value) : toInt(value), constructor: { $descriptor: descriptor } });
  const throwNumberFormat = (vm, text) => vm.throwException('Ljava/lang/NumberFormatException;', `For input string: "${text}"`);
  const digitValue = (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) return code - 48;
    if (code >= 97 && code <= 122) return code - 87;
    if (code >= 65 && code <= 90) return code - 55;
    return -1;
  };
  const parseIntChecked = (value, radix, vm) => {
    const text = String(jsString(value) ?? '').trim();
    const base = toInt(radix);
    if (base < 2 || base > 36) throwNumberFormat(vm, text);
    const negative = text[0] === '-';
    const body = text[0] === '-' || text[0] === '+' ? text.slice(1) : text;
    if (!body) throwNumberFormat(vm, text);
    let acc = 0;
    for (const ch of body) {
      const digit = digitValue(ch);
      if (digit < 0 || digit >= base) throwNumberFormat(vm, text);
      acc = acc * base + digit;
    }
    const signed = negative ? -acc : acc;
    if (signed < -2147483648 || signed > 2147483647) throwNumberFormat(vm, text);
    return signed | 0;
  };
  const parseLongChecked = (value, vm) => {
    const text = String(jsString(value) ?? '').trim();
    const body = text[0] === '-' || text[0] === '+' ? text.slice(1) : text;
    if (!body || !/^[0-9]+$/.test(body)) throwNumberFormat(vm, text);
    const result = BigInt(text);
    if (result < -(1n << 63n) || result > (1n << 63n) - 1n) throwNumberFormat(vm, text);
    return result;
  };
  return nativeDef(descriptor, {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function (vm, object) {
      this.value = isLong ? 0n : 0;
    }, { value: isLong ? 0n : 0 }),
    methods: {
      '<init>(I)V': (self, [value]) => {
        self.value = toInt(value);
      },
      '<init>(J)V': (self, [value]) => {
        self.value = toLong(value);
      },
      '<init>(Ljava/lang/String;)V': (self, [value], vm) => {
        self.value = isLong ? parseLongChecked(value, vm) : parseIntChecked(value, 10, vm);
      },
      'intValue()I': (self) => toInt(self.value),
      'longValue()J': (self) => toLong(self.value),
      'toString()Ljava/lang/String;': (self) => (isLong ? toLong(self.value).toString() : String(toInt(self.value))),
    },
    staticMethods: {
      'parseInt(Ljava/lang/String;)I': (_self, [value], vm) => parseIntChecked(value, 10, vm),
      'parseInt(Ljava/lang/String;I)I': (_self, [value, radix], vm) => parseIntChecked(value, radix, vm),
      'decode(Ljava/lang/String;)Ljava/lang/Integer;': (_self, [value], vm) => {
        const text = jsString(value).trim();
        const parsed = /^[-+]?0[xX]/.test(text) ? parseInt(text.replace(/^[-+]?0[xX]/, (m) => (m.startsWith('-') ? '-' : '')), 16)
          : /^[-+]?0/.test(text) && text.length > 1 ? parseInt(text, 8)
          : /^[-+]?#/.test(text) ? parseInt(text.replace('#', ''), 16)
          : parseInt(text, 10);
        return wrap(parsed | 0, vm);
      },
      'parseLong(Ljava/lang/String;)J': (_self, [value], vm) => parseLongChecked(value, vm),
      'valueOf(I)Ljava/lang/Integer;': (_self, [value], vm) => wrap(value, vm),
      'valueOf(J)Ljava/lang/Long;': (_self, [value], vm) => wrap(value, vm),
      'valueOf(Ljava/lang/String;)Ljava/lang/Integer;': (_self, [value], vm) => wrap(parseIntChecked(value, 10, vm), vm),
      'toString(I)Ljava/lang/String;': (_self, [value]) => String(toInt(value)),
      'toString(J)Ljava/lang/String;': (_self, [value]) => toLong(value).toString(),
      'toHexString(I)Ljava/lang/String;': (_self, [value]) => (toInt(value) >>> 0).toString(16),
      'toBinaryString(I)Ljava/lang/String;': (_self, [value]) => (toInt(value) >>> 0).toString(2),
      'toOctalString(I)Ljava/lang/String;': (_self, [value]) => (toInt(value) >>> 0).toString(8),
      'numberOfLeadingZeros(I)I': (_self, [value]) => Math.clz32(toInt(value)) | 0,
      'numberOfTrailingZeros(I)I': (_self, [value]) => {
        const v = toInt(value) >>> 0;
        return v === 0 ? 32 : (31 - Math.clz32(v & -v)) | 0;
      },
      ...(isLong ? {
        'bitCount(J)I': (_self, [value]) => {
          let v = BigInt.asUintN(64, toLong(value));
          let count = 0;
          while (v > 0n) { count += Number(v & 1n); v >>= 1n; }
          return count;
        },
        'rotateRight(JI)J': (_self, [value, distance]) => {
          const v = BigInt.asUintN(64, toLong(value));
          const d = ((toInt(distance) % 64) + 64) % 64;
          const shifted = (v >> BigInt(d)) | (v << BigInt(64 - d || 64));
          return BigInt.asIntN(64, BigInt.asUintN(64, shifted));
        },
        'rotateLeft(JI)J': (_self, [value, distance]) => {
          const v = BigInt.asUintN(64, toLong(value));
          const d = ((toInt(distance) % 64) + 64) % 64;
          const shifted = (v << BigInt(d)) | (v >> BigInt(64 - d || 64));
          return BigInt.asIntN(64, BigInt.asUintN(64, shifted));
        },
      } : {}),
      'bitCount(I)I': (_self, [value]) => {
        let v = toInt(value) >>> 0;
        let count = 0;
        while (v) { count += v & 1; v >>>= 1; }
        return count;
      },
      'highestOneBit(I)I': (_self, [value]) => {
        const v = toInt(value) >>> 0;
        return v === 0 ? 0 : (1 << (31 - Math.clz32(v))) | 0;
      },
      'lowestOneBit(I)I': (_self, [value]) => (toInt(value) & -toInt(value)) | 0,
      'compare(II)I': (_self, [a, b]) => (toInt(a) < toInt(b) ? -1 : toInt(a) > toInt(b) ? 1 : 0),
      'reverse(I)I': (_self, [value]) => {
        let v = toInt(value) >>> 0;
        let out = 0;
        for (let i = 0; i < 32; i += 1) { out = (out << 1) | (v & 1); v >>>= 1; }
        return out | 0;
      },
      'getInteger(Ljava/lang/String;)Ljava/lang/Integer;': (_self, [name], vm) => {
        const system = vm.getSystemProperty ? vm.getSystemProperty(jsString(name)) : null;
        if (system === null || system === undefined) return null;
        const parsed = parseInt(String(system), 10);
        return Number.isNaN(parsed) ? null : wrap(parsed, vm);
      },
      'getInteger(Ljava/lang/String;I)Ljava/lang/Integer;': (_self, [name, fallback], vm) => {
        const system = vm.getSystemProperty ? vm.getSystemProperty(jsString(name)) : null;
        if (system === null || system === undefined) return wrap(fallback, vm);
        const parsed = parseInt(String(system), 10);
        return wrap(Number.isNaN(parsed) ? fallback : parsed, vm);
      },
      'getInteger(Ljava/lang/String;Ljava/lang/Integer;)Ljava/lang/Integer;': (_self, [name, fallback], vm) => {
        const system = vm.getSystemProperty ? vm.getSystemProperty(jsString(name)) : null;
        if (system === null || system === undefined) return fallback ?? null;
        const parsed = parseInt(String(system), 10);
        return Number.isNaN(parsed) ? (fallback ?? null) : wrap(parsed, vm);
      },
      'getLong(Ljava/lang/String;)Ljava/lang/Long;': (_self, [name], vm) => {
        const system = vm.getSystemProperty ? vm.getSystemProperty(jsString(name)) : null;
        if (system === null || system === undefined) return null;
        const parsed = parseInt(String(system), 10);
        return Number.isNaN(parsed) ? null : wrap(parsed, vm);
      },
      'getLong(Ljava/lang/String;J)Ljava/lang/Long;': (_self, [name, fallback], vm) => {
        const system = vm.getSystemProperty ? vm.getSystemProperty(jsString(name)) : null;
        if (system === null || system === undefined) return wrap(fallback, vm);
        const parsed = parseInt(String(system), 10);
        return wrap(Number.isNaN(parsed) ? fallback : parsed, vm);
      },
      'getLong(Ljava/lang/String;Ljava/lang/Long;)Ljava/lang/Long;': (_self, [name, fallback], vm) => {
        const system = vm.getSystemProperty ? vm.getSystemProperty(jsString(name)) : null;
        if (system === null || system === undefined) return fallback ?? null;
        const parsed = parseInt(String(system), 10);
        return Number.isNaN(parsed) ? (fallback ?? null) : wrap(parsed, vm);
      },
    },
    staticFields: new Map([
      ['MAX_VALUE:I', isLong ? 0x7fffffff : 0x7fffffff],
      ['MIN_VALUE:I', -0x80000000],
      ['MAX_VALUE:J', 0x7fffffffffffffffn],
      ['MIN_VALUE:J', -0x8000000000000000n],
      ['TYPE:Ljava/lang/Class;', { lazy: (vm) => vm.getClassObject(isLong ? 'J' : 'I') }],
    ]),
  });
}

function floatDef(descriptor, type) {
  return nativeDef(descriptor, {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.value = 0;
    }, { value: 0 }),
    methods: {
      '<init>(F)V': (self, [value]) => {
        self.value = Number(value);
      },
      '<init>(D)V': (self, [value]) => {
        self.value = Number(value);
      },
      'floatValue()F': (self) => Number(self.value),
      'doubleValue()D': (self) => Number(self.value),
      'toString()Ljava/lang/String;': (self) => String(Number(self.value)),
    },
    staticMethods: {
      'parseFloat(Ljava/lang/String;)F': (_self, [value]) => parseFloat(jsString(value)) || 0,
      'parseDouble(Ljava/lang/String;)D': (_self, [value]) => parseDouble(jsString(value)),
      'valueOf(F)Ljava/lang/Float;': (_self, [value], vm) => vm.wrapPeer({ value: Number(value) }),
      'valueOf(D)Ljava/lang/Double;': (_self, [value], vm) => vm.wrapPeer({ value: Number(value) }),
      'toString(F)Ljava/lang/String;': (_self, [value]) => String(Number(value)),
      'toString(D)Ljava/lang/String;': (_self, [value]) => String(Number(value)),
      'isNaN(D)Z': (_self, [value]) => (Number.isNaN(Number(value)) ? 1 : 0),
      'isInfinite(D)Z': (_self, [value]) => (Number.isFinite(Number(value)) ? 0 : 1),
    },
    staticFields: new Map([['MAX_VALUE:F', 3.4028235e38], ['MIN_VALUE:F', 1.4e-45], ['TYPE:Ljava/lang/Class;', { lazy: (vm) => vm.getClassObject(type) }]]),
  });
}

function listMethods() {
  return {
    '<init>()V': (self) => {
      self.items = [];
    },
    '<init>(I)V': (self) => {
      self.items = [];
    },
    '<init>(Ljava/util/Collection;)V': (self, [other]) => {
      self.items = [...collectionItems(other)];
    },
    'add(Ljava/lang/Object;)Z': (self, [value]) => {
      self.items.push(value);
      return true;
    },
    'add(ILjava/lang/Object;)V': (self, [index, value]) => {
      self.items.splice(toInt(index), 0, value);
    },
    'get(I)Ljava/lang/Object;': (self, [index], vm) => {
      const i = toInt(index);
      if (i < 0 || i >= self.items.length) {
        vm.throwException('Ljava/lang/IndexOutOfBoundsException;', `Index: ${i}, Size: ${self.items.length}`);
      }
      return self.items[i] ?? null;
    },
    'set(ILjava/lang/Object;)Ljava/lang/Object;': (self, [index, value]) => {
      const previous = self.items[toInt(index)];
      self.items[toInt(index)] = value;
      return previous ?? null;
    },
    'size()I': (self) => self.items.length,
    'isEmpty()Z': (self) => self.items.length === 0,
    'clear()V': (self) => {
      self.items = [];
    },
    'remove(I)Ljava/lang/Object;': (self, [index]) => {
      const removed = self.items.splice(toInt(index), 1);
      return removed.length ? removed[0] : null;
    },
    'remove(Ljava/lang/Object;)Z': (self, [value]) => {
      const index = self.items.findIndex((item) => refsEqual(item, value));
      if (index >= 0) {
        self.items.splice(index, 1);
        return true;
      }
      return false;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value]) => self.items.some((item) => refsEqual(item, value)),
    'indexOf(Ljava/lang/Object;)I': (self, [value]) => self.items.findIndex((item) => refsEqual(item, value)),
    'lastIndexOf(Ljava/lang/Object;)I': (self, [value]) => {
      for (let index = self.items.length - 1; index >= 0; index -= 1) {
        if (refsEqual(self.items[index], value)) return index;
      }
      return -1;
    },
    'trimToSize()V': () => undefined,
    'ensureCapacity(I)V': () => undefined,
    'toArray()[Ljava/lang/Object;': (self, _args, vm) => vm.newArray('[Ljava/lang/Object;', [...self.items]),
    'toArray([Ljava/lang/Object;)[Ljava/lang/Object;': (self, [target], vm) => {
      const targetData = target?.$data;
      const descriptor = target?.$type || '[Ljava/lang/Object;';
      if (Array.isArray(targetData) && targetData.length >= self.items.length) {
        self.items.forEach((item, index) => { targetData[index] = item; });
        if (targetData.length > self.items.length) targetData[self.items.length] = null;
        return target;
      }
      const array = vm.newArray(descriptor, self.items.length, null);
      self.items.forEach((item, index) => { array.$data[index] = item; });
      return array;
    },
    'addAll(Ljava/util/Collection;)Z': (self, [other]) => {
      const source = collectionItems(other);
      if (!source.length) return false;
      self.items.push(...source);
      return true;
    },
    'addAll(ILjava/util/Collection;)Z': (self, [index, other]) => {
      const source = collectionItems(other);
      if (!source.length) return false;
      self.items.splice(Math.max(0, toInt(index)), 0, ...source);
      return true;
    },
    'addAllAbsent(Ljava/util/Collection;)I': (self, [other]) => {
      const source = collectionItems(other);
      let added = 0;
      for (const item of source) {
        if (self.items.some((existing) => refsEqual(existing, item))) continue;
        self.items.push(item);
        added++;
      }
      return added;
    },
    'addIfAbsent(Ljava/lang/Object;)Z': (self, [value]) => {
      if (self.items.some((item) => refsEqual(item, value))) return false;
      self.items.push(value);
      return true;
    },
    'containsAll(Ljava/util/Collection;)Z': (self, [other]) => {
      const source = collectionItems(other);
      return source.every((item) => self.items.some((existing) => refsEqual(existing, item)));
    },
    'removeRange(II)V': (self, [from, to]) => {
      self.items.splice(Math.max(0, toInt(from)), Math.max(0, toInt(to) - toInt(from)));
    },
    'removeAll(Ljava/util/Collection;)Z': (self, [other]) => {
      const source = collectionItems(other);
      const before = self.items.length;
      for (let index = self.items.length - 1; index >= 0; index -= 1) {
        if (source.some((item) => refsEqual(item, self.items[index]))) self.items.splice(index, 1);
      }
      return self.items.length !== before;
    },
    'retainAll(Ljava/util/Collection;)Z': (self, [other]) => {
      const source = collectionItems(other);
      const before = self.items.length;
      for (let index = self.items.length - 1; index >= 0; index -= 1) {
        if (!source.some((item) => refsEqual(item, self.items[index]))) self.items.splice(index, 1);
      }
      return self.items.length !== before;
    },
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => makeIterator(vm, self.items),
    'listIterator()Ljava/util/ListIterator;': (self, _args, vm) => {
      const object = vm.allocateRawObject('Ljava/util/ListIterator;');
      object.$peer = { cursor: 0, abstractList: self.$object ?? self };
      return object;
    },
    'listIterator(I)Ljava/util/ListIterator;': (self, [index], vm) => {
      const object = vm.allocateRawObject('Ljava/util/ListIterator;');
      object.$peer = { cursor: toInt(index), abstractList: self.$object ?? self };
      return object;
    },
    'subList(II)Ljava/util/List;': (self, [from, to], vm) => makeList(vm, self.items.slice(toInt(from), toInt(to))),
    'forEach(Ljava/util/function/Consumer;)V': (self, [consumer], vm) => {
      for (const item of [...self.items]) {
        vm.invokeByName('accept', '(Ljava/lang/Object;)V', consumer, [item]);
      }
    },
    'removeIf(Ljava/util/function/Predicate;)Z': (self, [predicate], vm) => {
      let changed = false;
      for (let index = self.items.length - 1; index >= 0; index -= 1) {
        const matched = vm.invokeByName('test', '(Ljava/lang/Object;)Z', predicate, [self.items[index]]);
        if (matched) {
          self.items.splice(index, 1);
          changed = true;
        }
      }
      return changed;
    },
    'replaceAll(Ljava/util/function/UnaryOperator;)V': (self, [operator], vm) => {
      for (let index = 0; index < self.items.length; index += 1) {
        self.items[index] = vm.invokeByName('apply', '(Ljava/lang/Object;)Ljava/lang/Object;', operator, [self.items[index]]);
      }
    },
    'sort(Ljava/util/Comparator;)V': (self, [comparator], vm) => {
      const compare = comparator
        ? (a, b) => vm.invokeByName('compare', '(Ljava/lang/Object;Ljava/lang/Object;)I', comparator, [a, b]) | 0
        : (a, b) => defaultArrayCompare(a, b);
      self.items.sort(compare);
    },
    'spliterator()Ljava/util/Spliterator;': (self, _args, vm) => makeSpliterator(vm, self.items),
    'toString()Ljava/lang/String;': (self) => `[${self.items.map(jsString).join(', ')}]`,
  };
}

function mapMethods() {
  return {
    '<init>()V': (self) => {
      self.map = new Map();
    },
    '<init>(I)V': (self) => {
      self.map = new Map();
    },
    '<init>(IF)V': (self) => {
      self.map = new Map();
    },
    '<init>(IFZ)V': (self) => {
      self.map = new Map();
    },
    '<init>(Ljava/util/Map;)V': (self, [other]) => {
      self.map = new Map(other?.map || []);
    },
    'put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, value], vm) => {
      const k = findValueSlot(self, key, vm) ?? mapKey(key, vm);
      if (!self.rawKeys) self.rawKeys = new Map();
      const previous = self.map.get(k);
      self.map.set(k, value);
      self.rawKeys.set(k, key);
      return previous ?? null;
    },
    'putAll(Ljava/util/Map;)V': (self, [other], vm) => {
      if (!other || !other.map) return;
      if (!self.rawKeys) self.rawKeys = new Map();
      if (other.rawKeys) {
        for (const [k, v] of other.map) {
          const raw = other.rawKeys.get(k) ?? k;
          const slot = findValueSlot(self, raw, vm) ?? k;
          self.map.set(slot, v);
          self.rawKeys.set(slot, raw);
        }
        return;
      }
      for (const [k, v] of other.map) {
        const canonical = findValueSlot(self, k, vm) ?? mapKey(k, vm);
        self.map.set(canonical, v);
        self.rawKeys.set(canonical, k);
      }
    },
    'putIfAbsent(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, value], vm) => {
      const k = findValueSlot(self, key, vm) ?? mapKey(key, vm);
      if (self.map.has(k) && self.map.get(k) != null) return self.map.get(k);
      if (!self.rawKeys) self.rawKeys = new Map();
      self.map.set(k, value);
      self.rawKeys.set(k, key);
      return null;
    },
    'getOrDefault(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, fallback], vm) => {
      const value = self.map.get(findValueSlot(self, key, vm) ?? mapKey(key, vm));
      return value == null ? fallback : value;
    },
    'get(Ljava/lang/Object;)Ljava/lang/Object;': (self, [key], vm) => {
      const slot = findValueSlot(self, key, vm) ?? mapKey(key, vm);
      return self.map.get(slot) ?? null;
    },
    'containsKey(Ljava/lang/Object;)Z': (self, [key], vm) => {
      const slot = findValueSlot(self, key, vm) ?? mapKey(key, vm);
      return self.map.has(slot);
    },
    'containsValue(Ljava/lang/Object;)Z': (self, [value], vm) => {
      const target = mapKey(value, vm);
      for (const v of self.map.values()) if (mapKey(v, vm) === target) return true;
      return false;
    },
    'keySet()Ljava/util/Set;': (self, _args, vm) => {
      const values = [...self.map.keys()].map((k) => (self.rawKeys && self.rawKeys.has(k) ? self.rawKeys.get(k) : k));
      return vm.wrapPeer({
        items: values,
        constructor: { $descriptor: 'Ljava/util/Set;' },
        size: () => values.length,
        iterator: () => ({ hasNext: () => values.length > 0, next: () => values.shift() }),
        toArray: () => values.slice(),
      });
    },
    'values()Ljava/util/Collection;': (self, _args, vm) => {
      const values = [...self.map.values()];
      return vm.wrapPeer({
        items: values,
        constructor: { $descriptor: 'Ljava/util/Collection;' },
        size: () => values.length,
        iterator: () => ({ hasNext: () => values.length > 0, next: () => values.shift() }),
        toArray: () => values.slice(),
      });
    },
    'entrySet()Ljava/util/Set;': (self, _args, vm) => {
      const entries = [...self.map.entries()].map(([key, value]) => {
        const entry = vm.allocateRawObject('Ljava/util/Map$Entry;');
        entry.$peer = {
          key: self.rawKeys && self.rawKeys.has(key) ? self.rawKeys.get(key) : key,
          value,
          owner: self,
          mapKey: key,
        };
        return entry;
      });
      return vm.wrapPeer({
        items: entries,
        constructor: { $descriptor: 'Ljava/util/Set;' },
        size: () => entries.length,
        iterator: () => ({ hasNext: () => entries.length > 0, next: () => entries.shift() }),
        toArray: () => entries.slice(),
      });
    },
    'remove(Ljava/lang/Object;)Ljava/lang/Object;': (self, [key], vm) => {
      const k = findValueSlot(self, key, vm) ?? mapKey(key, vm);
      const previous = self.map.get(k);
      self.map.delete(k);
      self.rawKeys?.delete(k);
      return previous ?? null;
    },
    'size()I': (self) => self.map.size,
    'isEmpty()Z': (self) => self.map.size === 0,
    'clear()V': (self) => {
      self.map = new Map();
      self.rawKeys = new Map();
    },
  };
}

function parseDouble(text) {
  const value = parseFloat(text);
  return Number.isFinite(value) ? value : 0;
}

const VIRTUAL_FS = {
  files: new Map(),
  dirs: new Set(['/']),
  normalize(path) {
    if (!path) return '/';
    let out = String(path).replace(/\\/g, '/');
    if (!out.startsWith('/')) out = '/' + out;
    const parts = [];
    for (const part of out.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return '/' + parts.join('/');
  },
  mkdirs(path) {
    const normalized = this.normalize(path);
    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      this.dirs.add(current);
    }
    return true;
  },
  exists(path) {
    const normalized = this.normalize(path);
    return this.files.has(normalized) || this.dirs.has(normalized);
  },
  isFile(path) {
    return this.files.has(this.normalize(path));
  },
  isDirectory(path) {
    return this.dirs.has(this.normalize(path));
  },
  write(path, bytes) {
    const normalized = this.normalize(path);
    const parent = normalized.slice(0, normalized.lastIndexOf('/')) || '/';
    this.mkdirs(parent);
    this.files.set(normalized, Uint8Array.from(bytes || []));
    if (typeof this.onWrite === 'function') {
      try {
        this.onWrite(normalized, this.files.get(normalized));
      } catch (_) {
        // 写入回调失败不应影响文件本身。
      }
    }
    return true;
  },
  read(path) {
    return this.files.get(this.normalize(path)) || null;
  },
  length(path) {
    return this.files.get(this.normalize(path))?.length ?? 0;
  },
  list(path) {
    const normalized = this.normalize(path);
    const names = new Set();
    for (const file of this.files.keys()) {
      if (file.startsWith(normalized + '/') || normalized === '/') {
        const rest = normalized === '/' ? file.slice(1) : file.slice(normalized.length + 1);
        if (rest) names.add(rest.split('/')[0]);
      }
    }
    for (const dir of this.dirs) {
      if (dir === normalized) continue;
      if (dir.startsWith(normalized + '/') || normalized === '/') {
        const rest = normalized === '/' ? dir.slice(1) : dir.slice(normalized.length + 1);
        if (rest) names.add(rest.split('/')[0]);
      }
    }
    return [...names];
  },
};

const STORAGE_CAPACITY_FALLBACK = {
  internalTotalBytes: 64 * 1024 * 1024 * 1024,
  internalFreeBytes: 32 * 1024 * 1024 * 1024,
  externalTotalBytes: 32 * 1024 * 1024 * 1024,
  externalFreeBytes: 16 * 1024 * 1024 * 1024,
};

const STORAGE_BLOCK_SIZE = 4096;

function isExternalStoragePath(path) {
  const normalized = VIRTUAL_FS.normalize(path || '/');
  if (normalized.startsWith('/mnt/media_rw/') || normalized.startsWith('/mnt/extsd')) return true;
  const match = /^\/storage\/([^/]+)/.exec(normalized);
  if (!match) return false;
  const name = match[1];
  return name !== 'emulated' && name !== 'self' && name !== 'sdcard0';
}

function storageCapacityForPath(path) {
  const external = isExternalStoragePath(path);
  return external
    ? {
      totalBytes: STORAGE_CAPACITY_FALLBACK.externalTotalBytes,
      availableBytes: STORAGE_CAPACITY_FALLBACK.externalFreeBytes,
    }
    : {
      totalBytes: STORAGE_CAPACITY_FALLBACK.internalTotalBytes,
      availableBytes: STORAGE_CAPACITY_FALLBACK.internalFreeBytes,
    };
}

function storageVolumePaths() {
  const paths = ['/storage/emulated/0', '/storage/sdcard0'];
  for (const dir of VIRTUAL_FS.dirs) {
    const match = /^\/storage\/([^/]+)$/.exec(dir);
    if (!match) continue;
    const name = match[1];
    if (name === 'emulated' || name === 'self') continue;
    if (!paths.includes(dir)) paths.push(dir);
  }
  return paths;
}

function filePathOf(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value.path === 'string') return value.path;
  if (typeof value.$peer?.path === 'string') return value.$peer.path;
  return jsString(value);
}

function makeStorageVolume(vm, path, options = {}) {
  const normalized = VIRTUAL_FS.normalize(path || '/storage/emulated/0');
  const external = isExternalStoragePath(normalized);
  const object = vm.allocateRawObject('Landroid/os/storage/StorageVolume;');
  object.$peer = {
    path: normalized,
    uuid: options.uuid ?? (external ? '1234-5678' : 'emulated'),
    state: options.state ?? 'mounted',
    primary: options.primary ?? !external,
    removable: options.removable ?? external,
    emulated: options.emulated ?? !external,
    description: options.description ?? (external ? 'SD card' : 'Internal shared storage'),
  };
  return object;
}

function volumeForStoragePath(vm, path, options = {}) {
  const normalized = VIRTUAL_FS.normalize(path || '/storage/emulated/0');
  const external = isExternalStoragePath(normalized);
  return makeStorageVolume(vm, normalized, {
    primary: options.primary ?? !external,
    removable: options.removable ?? external,
    emulated: options.emulated ?? !external,
  });
}

const sodiumSwapTotalKb = 2097148;

function describeMemory() {
  const nav = readNavigator();
  const reported = Number(nav?.deviceMemory);
  const gigabytes = Number.isFinite(reported) && reported > 0
    ? Math.round(reported)
    : Math.round(DEVICE_CAPABILITY_FALLBACK.memoryBytes / (1024 * 1024 * 1024));
  const type = gigabytes >= 8 ? 'LPDDR5' : (gigabytes >= 4 ? 'LPDDR4X' : 'LPDDR3');
  const maxFreqHz = type === 'LPDDR5' ? 3200000000 : (type === 'LPDDR4X' ? 2133000000 : 1600000000);
  const agent = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  let vendor = 'Micron';
  if (/samsung/i.test(agent)) vendor = 'Samsung';
  else if (/google|pixel/i.test(agent)) vendor = 'Hynix';
  return { type, vendor, maxFreqHz, gigabytes };
}

export function hardwareIdentity() {
  const nav = readNavigator();
  const platform = String(nav?.platform || 'Linux x86_64');
  const ua = String(nav?.userAgent || '');
  const combined = platform + ' ' + ua;
  const arch = /aarch64|arm64/i.test(combined) ? 'arm64' : (/arm/i.test(combined) ? 'arm' : 'x86_64');
  const cores = deviceCapabilities().cores;
  const tag = 'apkjs-' + arch;
  let panelSize = '';
  try {
    if (typeof screen !== 'undefined' && screen && screen.width && screen.height) {
      panelSize = ' ' + Math.round(screen.width) + 'x' + Math.round(screen.height);
    }
  } catch (error) {
    void error;
  }
  return {
    platform,
    arch,
    cores,
    tag,
    model: tag + ' browser',
    touch: tag + '-touch',
    panel: tag + ' panel' + panelSize,
    codec: tag + '-codec',
    soundCard: tag + '-sndcard',
    gpu: tag + '-gpu',
    charger: tag + '-charger',
    sensorAccel: tag + '-accel',
    sensorMagn: tag + '-magn',
    sensorAls: tag + '-als',
    sensorProx: tag + '-prox',
    fingerprint: tag + '-fp',
  };
}

const HARDWARE_FS_SEEDED = { done: false };

function seedHardwareFs() {
  if (HARDWARE_FS_SEEDED.done) return;
  HARDWARE_FS_SEEDED.done = true;
  const identity = hardwareIdentity();
  const write = (path, value) => {
    const bytes = typeof value === 'string' ? utf8Encode(value) : Uint8Array.from(value || []);
    VIRTUAL_FS.write(path, bytes);
  };
  write('/proc/version', 'Linux version 4.14.0 #1 SMP PREEMPT Thu Jan 1 00:00:00 UTC 2026\n');
  write('/proc/cpuinfo', [
    'processor\t: 0',
    'model name\t: ' + identity.platform + ' Processor',
    'Hardware\t: ' + identity.tag + ' SoC',
    'Features\t: fp asimd evtstrm aes pmull sha1 sha2 crc32',
    '',
  ].join('\n'));
  write('/proc/cmdline', 'console=ttyS0,115200n8 androidboot.hardware=' + identity.arch + ' androidboot.soc=' + identity.tag + '\n');
  write('/proc/meminfo', [
    'MemTotal:        7956184 kB',
    'MemFree:         3021448 kB',
    'MemAvailable:    5123456 kB',
    'Buffers:          132456 kB',
    'Cached:          2145678 kB',
    'SwapTotal:       2097148 kB',
    'SwapFree:        2097148 kB',
    '',
  ].join('\n'));
  write('/proc/partitions', [
    'major minor  #blocks  name',
    '',
    ' 259        0    3145728 dm-0',
    ' 259        1    2097152 dm-1',
    ' 259        2    1048576 dm-2',
    ' 259        3   52428800 dm-3',
    ' 259        4    2097152 dm-4',
    ' 179        0   61071360 mmcblk0',
    ' 179        1       8192 mmcblk0p1',
    ' 179        2      65536 mmcblk0p2',
    ' 179        3   52428800 mmcblk0p3',
    '   8        0   61071360 sda',
    '',
  ].join('\n'));
  const mountTable = [
    '/dev/block/dm-0 / ext4 ro,seclabel,relatime 0 0',
    '/dev/block/dm-1 /system ext4 ro,seclabel,relatime 0 0',
    '/dev/block/dm-2 /vendor ext4 ro,seclabel,relatime 0 0',
    '/dev/block/dm-3 /data ext4 rw,seclabel,nosuid,nodev,noatime 0 0',
    '/dev/block/dm-4 /cache ext4 rw,seclabel,nosuid,nodev,noatime 0 0',
    '/dev/block/by-name/userdata /data/media emulated rw,nosuid,nodev,noatime 0 0',
    'tmpfs /dev tmpfs rw,seclabel,nosuid,relatime 0 0',
    'tmpfs /mnt tmpfs rw,seclabel,nosuid,nodev,noexec,relatime 0 0',
    'proc /proc proc rw,relatime 0 0',
    'sysfs /sys sysfs rw,seclabel,relatime 0 0',
    '/dev/block/mmcblk0p1 /vendor ext4 ro,seclabel,relatime 0 0',
    '',
  ].join('\n');
  write('/proc/mounts', mountTable);
  write('/proc/self/mounts', mountTable);
  write('/proc/bootdevice/type', 'ufs\n');
  write('/proc/asound/card0/id', '\n');
  write('/proc/scsi/scsi', 'Host: scsi0 Channel: 00 Id: 00 Lun: 00\n  Vendor: Linux    Model: UFS 128GB        Rev: 0001\n');
  write('/proc/bus/input/devices', [
    'I: Bus=0018 Vendor=0000 Product=0000 Version=0000',
    'N: Name="apk.js-touchscreen"',
    'P: Phys=',
    'S: Sysfs=/devices/virtual/input/input2',
    'U: Uniq=',
    'H: Handlers=event2',
    'B: PROP=2',
    '',
    'I: Bus=0019 Vendor=0000 Product=0000 Version=0000',
    'N: Name="' + identity.soundCard + '"',
    'P: Phys=i2c-6-0023',
    'E: ABS=0',
    'X: ' + identity.soundCard,
    'Y: ' + identity.soundCard,
    'S: Sysfs=/devices/platform/soc/soc:qcom,sound/input0',
    'U: Uniq=',
    'H: Handlers=event3',
    'B: PROP=0',
    '',
  ].join('\n'));
  write('/proc/device-tree/model', identity.model + '\0');
  write('/proc/device-tree/compatible', identity.tag + ',browser\0' + identity.tag + ',soc\0');
  write('/proc/hardware', identity.tag + ',browser\n');
  write('/proc/interrupts', [
    '           CPU0       CPU1       CPU2       CPU3',
    ' 11:      12345      12000      11800      11600     GICv3  30 Level     arch_timer',
    ' 22:        456        432        410        399     GICv3 321 Level     i2c_geni',
    ' 45:       7890       7800       7700       7650     GICv3  45 Level     ' + identity.touch,
    ' 67:       2222       2100       2050       2010     GICv3  67 Level     ' + identity.touch + '-alt',
    '',
  ].join('\n'));
  write('/proc/driver/tp_info', identity.touch + '\n');
  write('/proc/driver/tpd_info', identity.touch + '\n');
  write('/proc/tp_info', identity.touch + '\n');
  write('/proc/driver/lcm_info', identity.panel + '\n');
  write('/proc/hw_info/lcd_info', identity.panel + '\n');
  write('/proc/hw_info/tp_info', identity.touch + '\n');
  write('/proc/hw_info/camera_info', identity.tag + ' camera\n');
  write('/proc/AllHWList/LCM', identity.panel + '\n');
  write('/proc/AllHWList/LCM0', identity.panel + '\n');
  write('/proc/devicesinfo', 'apk.js Browser\n');
  write('/proc/app_info', 'apk.js Browser\n');
  write('/proc/hctinfo', 'apk.js Browser\n');
  write('/proc/device-tree/chosen/atag,videolfb-lcmname', identity.panel + '\0');
  write('/proc/device-tree/chosen/atag,videolfb-islcmfound', '1\0');
  write('/proc/device-tree/amlogic-dt-id', 'apkjs\0');
  write('/proc/dumchar_info', 'apk.js Storage\n');
  write('/proc/mtd', 'dev:    size   erasesize  name\n');
  write('/proc/rknand', 'apk.js Storage\n');
  write('/proc/partinfo', 'mmcblk0p1 262144\nmmcblk0p2 60807168\n');
  write('/proc/devicesinfo', 'apk.js Browser\n');
  write('/proc/gt9xx_config', identity.touch + '\n');
  write('/proc/gt1x_debug', identity.touch + '\n');
  write('/proc/hwinfo', 'apk.js Browser\n');

  write('/sys/class/graphics/fb0/lcd_model', identity.panel + '\n');
  write('/sys/class/lcd/panel/lcd_type', 'TFT\n');
  write('/sys/class/lcdkit/lcd_model', identity.panel + '\n');
  write('/sys/class/graphics/fb0/panel_info', identity.panel + '\n');
  write('/sys/class/block/mmcblk0/size', '122142720\n');
  write('/sys/class/block/mmcblk0/queue/rotational', '0\n');
  write('/sys/class/mmc_host/mmc0/mmc0:0001/name', 'UFS 128GB\n');
  write('/sys/block/mmcblk0/size', '122142720\n');
  write('/sys/block/mmcblk0/device/model', 'apk.js Storage\n');
  write('/sys/block/sda/size', '122142720\n');
  write('/sys/block/sda/device/model', 'apk.js Storage\n');
  write('/sys/block/sda/device/vendor', 'apk.js\n');
  write('/sys/block/sda/device/rev', '0100\n');
  write('/proc/scsi/scsi', 'Attached devices:\nHost: scsi0 Channel: 00 Id: 00 Lun: 00\n  Vendor: apk.js Model: Storage          Rev: 0100\n  Type:   Direct-Access                    ANSI  SCSI revision: 06\n');
  write('/sys/devices/system/cpu/present', '0-7\n');
  write('/sys/devices/system/cpu/cpu0/cache/index3/size', '2048K\n');
  write('/sys/class/thermal/thermal_zone0/temp', '36000\n');
  write('/sys/class/net/wlan0/address', '02:00:00:00:00:01\n');
  write('/sys/class/fingerprint/fingerprint/name', identity.fingerprint + '\n');
  write('/sys/class/nfc/nfc_chip_type', identity.tag + '-nfc\n');
  write('/dev/block/by-name/boot', 'mmcblk0p1\n');
  write('/dev/block/by-name/system', 'mmcblk0p2\n');
  write('/dev/block/by-name/userdata', 'mmcblk0p3\n');
  write('/dev/block/by-name/recovery', 'mmcblk0p4\n');
  for (const [bus, addr, chip] of [
    [1, '0018', identity.sensorAccel], [2, '0019', identity.sensorMagn], [3, '0020', identity.sensorAls],
    [4, '0021', identity.touch], [5, '0022', identity.charger], [6, '0023', identity.codec],
  ]) {
    write(`/sys/bus/i2c/drivers/${chip}/${bus}-${addr}/name`, `${chip}\n`);
    write(`/sys/bus/i2c/devices/${bus}-${addr}/name`, `${chip}\n`);
    write(`/sys/bus/i2c/devices/${bus}-${addr}/modalias`, `i2c:${chip}\n`);
    write(`/sys/bus/i2c/devices/${bus}-${addr}/uevent`, [
      `DRIVER=${chip}`,
      `MODALIAS=i2c:${chip}`,
      '',
    ].join('\n'));
    write(`/sys/bus/i2c/drivers/${chip}/uevent`, [
      `DRIVER=${chip}`,
      `MODALIAS=i2c:${chip}`,
      '',
    ].join('\n'));
  }
  write('/dev/block/mmcblk0/device/type', 'MMC\n');
  write('/sys/class/mmc_host/mmc0/mmc0:0001/type', 'MMC\n');
  write('/sys/block/mmcblk0/device/type', 'MMC\n');
  const { memoryBytes, availBytes } = deviceCapabilities();
  const memTotalKb = Math.max(1, Math.round(memoryBytes / 1024));
  const memAvailKb = Math.max(1, Math.round(availBytes / 1024));
  const memFreeKb = Math.round(memAvailKb * 0.62);
  const memBuffersKb = Math.round(memAvailKb * 0.04);
  const memCachedKb = Math.round(memAvailKb * 0.28);
  write('/proc/meminfo', [
    `MemTotal:        ${memTotalKb} kB`,
    `MemFree:         ${memFreeKb} kB`,
    `MemAvailable:    ${memAvailKb} kB`,
    `Buffers:         ${memBuffersKb} kB`,
    `Cached:          ${memCachedKb} kB`,
    `SwapTotal:       ${sodiumSwapTotalKb} kB`,
    `SwapFree:        ${sodiumSwapTotalKb} kB`,
    '',
  ].join('\n'));
  const thermalZones = [
    ['cpu-0-0', 42000], ['cpu-1-0', 41500], ['gpu-0-0', 38000],
    ['battery', 30000], ['xo-therm', 36000], ['quiet-therm', 34000],
  ];
  thermalZones.forEach(([type, temp], index) => {
    const base = '/sys/class/thermal/thermal_zone' + index;
    write(base + '/type', type + '\n');
    write(base + '/temp', String(temp));
    write('/sys/devices/virtual/thermal/thermal_zone' + index + '/temp', String(temp));
    write(base + '/uevent', 'TEMP=' + temp + '\nTYPE=' + type + '\n');
  });
  write('/sys/module/msm_thermal/sensor_info', thermalZones.map(([type, temp]) => type + ':' + temp).join(' ') + '\n');
  write('/sys/class/power_supply/battery/manufacturer', 'apk.js\n');
  write('/sys/class/power_supply/battery/batt_capacity_max', '4500000\n');
  write('/sys/class/power_supply/battery/capacity', '87\n');
  write('/sys/class/power_supply/battery/voltage_now', '4200000\n');
  write('/sys/class/power_supply/battery/current_now', '-420000\n');
  write('/sys/class/power_supply/battery/current_avg', '-400000\n');
  write('/sys/class/power_supply/battery/temp', '300\n');
  write('/sys/class/power_supply/battery/status', 'Charging\n');
  write('/sys/class/power_supply/battery/health', 'Good\n');
  write('/sys/class/power_supply/battery/technology', 'Li-ion\n');
  write('/sys/class/power_supply/battery/present', '1\n');
  write('/sys/class/power_supply/battery/online', '1\n');
  write('/sys/class/power_supply/battery/charge_counter', '3200000\n');
  write('/sys/class/power_supply/battery/charge_full', '4500000\n');
  write('/sys/class/power_supply/battery/cycle_count', '120\n');
  write('/sys/class/power_supply/battery/battery_cycle', '120\n');
  write('/sys/class/power_supply/charge_full', '4500000\n');
  write('/sys/class/power_supply/bms/capacity', '87\n');
  write('/sys/class/power_supply/bms/voltage_now', '4200000\n');
  write('/sys/class/power_supply/bms/current_now', '-420000\n');
  write('/sys/class/power_supply/bms/temp', '300\n');
  write('/sys/class/power_supply/bms/status', 'Charging\n');
  write('/sys/class/power_supply/bms/health', 'Good\n');
  write('/sys/class/power_supply/bms/charge_counter', '3200000\n');
  write('/sys/class/power_supply/bms/charge_full', '4500000\n');
  write('/sys/class/power_supply/bms/charge_full_design', '4800000\n');
  write('/sys/class/power_supply/bms/battery_type', 'Li-ion\n');
  write('/sys/class/power_supply/bms/battery_cycle', '120\n');
  write('/sys/class/power_supply/battery/battery_type', 'Li-ion\n');
  write('/sys/class/power_supply/battery/battery_id', '1\n');
  write('/sys/class/power_supply/battery/battery_name', 'battery\n');
  write('/sys/class/power_supply/battery/battery_meter', 'battery\n');
  write('/sys/class/power_supply/bms/uevent', [
    'POWER_SUPPLY_NAME=bms',
    'POWER_SUPPLY_STATUS=Charging',
    'POWER_SUPPLY_PRESENT=1',
    'POWER_SUPPLY_TECHNOLOGY=Li-ion',
    'POWER_SUPPLY_CYCLE_COUNT=120',
    'POWER_SUPPLY_VOLTAGE_NOW=4200000',
    'POWER_SUPPLY_CURRENT_NOW=-420000',
    'POWER_SUPPLY_CHARGE_COUNTER=3200000',
    'POWER_SUPPLY_CAPACITY=87',
    'POWER_SUPPLY_TEMP=300',
    'POWER_SUPPLY_HEALTH=Good',
    '',
  ].join('\n'));
  write('/sys/class/power_supply/battery/uevent', [
    'POWER_SUPPLY_NAME=battery',
    'POWER_SUPPLY_STATUS=Charging',
    'POWER_SUPPLY_PRESENT=1',
    'POWER_SUPPLY_TECHNOLOGY=Li-ion',
    'POWER_SUPPLY_CYCLE_COUNT=120',
    'POWER_SUPPLY_VOLTAGE_MIN_DESIGN=4200000',
    'POWER_SUPPLY_VOLTAGE_NOW=4200000',
    'POWER_SUPPLY_CURRENT_NOW=-420000',
    'POWER_SUPPLY_CHARGE_COUNTER=3200000',
    'POWER_SUPPLY_CAPACITY=87',
    'POWER_SUPPLY_TEMP=300',
    'POWER_SUPPLY_HEALTH=Good',
    '',
  ].join('\n'));
  write('/sys/class/sensors/accelerometer_sensor/name', identity.sensorAccel + '\n');
  write('/sys/class/sensors/magnetic_sensor/name', identity.sensorMagn + '\n');
  write('/sys/class/sensors/acc_sensor/info', identity.sensorAccel + '\n');
  write('/sys/class/hw_info', identity.model + '\n');
  write('/sys/touchscreen/touch_chip_info', identity.touch + '\n');
  write('/sys/devices/platform/huawei_touch/touch_chip_info', identity.touch + '\n');
  write('/sys/module/mali/version', identity.gpu + '\n');
  write('/sys/class/kgsl/kgsl-3d0/gpu_available_frequencies', '800000000 600000000 400000000\n');
  write('/sys/bus/soc/devices/soc0/chip_name', identity.tag + ' SoC\n');
  write('/sys/bus/soc/devices/soc0/machine', identity.model + '\n');
  write('/sys/bus/soc/devices/soc0/soc_id', '1\n');
  const memoryDescriptor = describeMemory();
  const memoryGb = Math.max(1, Math.round(memoryBytes / (1024 * 1024 * 1024)));

  write('/system/build.prop', [
    'ro.product.model=Browser',
    'ro.product.manufacturer=apk.js',
    `ro.boot.hardware.ddrVendor=${memoryDescriptor.vendor}`,
    `ro.boot.ddr_type=${memoryDescriptor.type}`,
    'ro.hardware.fingerprint=apk.js',
    '',
  ].join('\n'));
  write('/proc/AllHWList/draminfo', `${memoryDescriptor.vendor} ${memoryDescriptor.type} ${memoryGb}GB\n`);
  write('/proc/ddr_rod', `${memoryDescriptor.type} ${memoryDescriptor.vendor}\n`);
  write('/proc/device-tree/memory/ddr_device_type', `${memoryDescriptor.type}\0`);
  write('/sys/bus/platform/drivers/ddr_type/ddr_type', `${memoryDescriptor.type}\n`);
  write('/sys/bus/platform/drivers/ddr_type/ddr_vendor', `${memoryDescriptor.vendor}\n`);
  write('/sys/bus/platform/drivers/ddr_type/ddr_size', `${memoryGb}GB\n`);
  write('/sys/bus/platform/drivers/ddr_type/uevent', [
    'DRIVER=ddr_type',
    `DRIVER_TYPE=${memoryDescriptor.type}`,
    `DRIVER_VENDOR=${memoryDescriptor.vendor}`,
    '',
  ].join('\n'));
  write('/sys/class/sec/sec_hw_param/ddr_info', `${memoryGb}GB ${memoryDescriptor.type} ${memoryDescriptor.vendor}\n`);
  write('/sys/class/devfreq/ddrfreq/max_freq', `${memoryDescriptor.maxFreqHz}\n`);

  const audioCodec = identity.codec;
  const audioDriverPath = '/sys/bus/i2c/drivers/' + audioCodec;
  write(audioDriverPath + '/6-0023/of_node/compatible', identity.tag + ',codec\0');
  write(audioDriverPath + '/6-0023/of_node/status', 'okay\n');
  write(audioDriverPath + '/6-0023/driver_name', audioCodec + '\n');
  write(audioDriverPath + '/6-0023/codec_name', audioCodec + '\n');
  write('/sys/bus/i2c/devices/6-0023/CID', audioCodec + '\n');
  write('/sys/bus/i2c/devices/6-0023/of_node/name', audioCodec + '\0');
  VIRTUAL_FS.mkdirs('/sys/bus/i2c/devices/i2c-6');
  write('/sys/bus/i2c/devices/i2c-6/name', 'i2c-6\n');
  write('/sys/bus/i2c/devices/i2c-6/6-0023/name', `${audioCodec}\n`);
  write('/sys/bus/i2c/devices/i2c-6/6-0023/of_node/name', `${audioCodec}\0`);
  write('/sys/bus/i2c/devices/i2c-6/6-0023/of_node/compatible', identity.tag + ',codec\0');
  VIRTUAL_FS.mkdirs('/sys/bus/i2c/devices/6-0023/of_node');
  VIRTUAL_FS.mkdirs('/sys/bus/i2c/devices/6-0023');
  write('/sys/bus/i2c/devices/6-0023/of_node/name', `${audioCodec}\0`);
  write('/sys/bus/i2c/devices/6-0023/of_node/compatible', identity.tag + ',codec\0');
  write('/sys/bus/i2c/devices/6-0023/of_node/status', 'okay\0');
  write(audioDriverPath + '/6-0023/of_node/name', audioCodec + '\n');
  write('/proc/asound/card0/codec#0', `Codec: ${audioCodec}\n`);
  write('/proc/asound/card0/codec#1', `Codec: ${audioCodec}\n`);
  write('/proc/asound/card0/pcm0p/info', `card: 0\ndevice: 0\nsubdevice: 0\nstream: PLAYBACK\nid: MultiMedia1\nname: MultiMedia1\nsubname: subdevice #0\nclass: 0\nsubclass: 0\nsubdevices_count: 1\nsubdevices_avail: 1\n`);
  write('/proc/asound/cards', ' 0 [' + identity.soundCard + ']: ' + identity.platform + ' - ' + identity.platform + '\n                      ' + identity.tag + ' SoC - ' + identity.soundCard + '\n');
  write('/proc/asound/devices', '  0: [ 0]   : control\n 16: [ 0- 0]: digital audio playback\n 24: [ 0- 0]: digital audio capture\n');
  write('/sys/class/sound/card0/id', identity.soundCard + '\n');

  const fingerprintDescriptor = identity.fingerprint;
  for (const driver of ['fpc1020', 'fpc1145', 'fpc1022_irq', 'goodix_fp', 'cdfinger_fp']) {
    write(`/sys/bus/platform/drivers/${driver}/uevent`, [
      `DRIVER=${driver}`,
      `MODALIAS=platform:${driver}`,
      '',
    ].join('\n'));
    write(`/sys/bus/platform/drivers/${driver}/name`, `${driver}\n`);
  }
  write('/sys/bus/platform/drivers/goodix_fp/goodix_fp.0/name', 'goodix_fp.0\n');
  write('/sys/bus/platform/drivers/mi2s/uevent', 'DRIVER=mi2s\nMODALIAS=platform:mi2s\n');
  write('/sys/bus/platform/drivers/mi2s/name', 'mi2s\n');
  VIRTUAL_FS.mkdirs(audioDriverPath);
  write(audioDriverPath + '/uevent', 'DRIVER=' + audioCodec + '\nMODALIAS=platform:' + audioCodec + '\n');
  write(audioDriverPath + '/name', audioCodec + '\n');
  for (let codecIndex = 0; codecIndex < 2; codecIndex++) {
    const dir = audioDriverPath + '/' + audioCodec + '.' + codecIndex;
    write(`${dir}/name`, `${audioCodec}\n`);
    write(`${dir}/uevent`, `DRIVER=${audioCodec}\nMODALIAS=platform:${audioCodec}\n`);
    VIRTUAL_FS.mkdirs(dir);
  }
  write('/sys/class/fingerprint/fingerprint/name', `${fingerprintDescriptor}\n`);
  write('/sys/class/fpsensor/fingerprint/module_id', `${fingerprintDescriptor}\n`);
  write('/sys/class/fpsensor/fingerprint_chip_info', `${fingerprintDescriptor}\n`);
  write('/sys/class/fpsensor/fingerprint/fingerprint_chip_info', `${fingerprintDescriptor}\n`);
  write('/sys/devices/platform/fingerprint/fingerprint_chip_info', `${fingerprintDescriptor}\n`);
  write('/sys/bus/i2c/devices/8-0025/name', `${fingerprintDescriptor}\n`);
}

function filePeerClass() {
  return peerClass(function (path) {
    this.path = typeof path === 'string' ? path : String(path ?? '');
  }, { path: '' });
}

function readCharsInto(self, buffer, offset, length) {
  if (!self || self.closed) return -1;
  const arr = buffer?.$data || buffer;
  if (!arr) return -1;
  const remaining = self.text.length - self.cursor;
  if (remaining <= 0) return -1;
  const start = offset | 0;
  const count = (length | 0) > 0 ? Math.min(length | 0, remaining) : remaining;
  for (let i = 0; i < count; i++) arr[start + i] = self.text.charCodeAt(self.cursor++);
  return count;
}

function flushFileWriter(self) {
  const text = self.buffer || '';
  self.buffer = '';
  if (!self.path) return;
  const encoded = new TextEncoder().encode(text);
  const existing = self.append ? VIRTUAL_FS.read(self.path) : null;
  if (existing) {
    const merged = new Uint8Array(existing.length + encoded.length);
    merged.set(existing, 0);
    merged.set(encoded, existing.length);
    VIRTUAL_FS.write(self.path, merged);
  } else {
    VIRTUAL_FS.write(self.path, encoded);
  }
  self.append = true;
}

JAVA_CORE_CLASSES['Ljava/io/Serializable;'] ??= nativeDef('Ljava/io/Serializable;', { super: null });
JAVA_CORE_CLASSES['Ljava/io/Closeable;'] ??= nativeDef('Ljava/io/Closeable;', { super: null });
JAVA_CORE_CLASSES['Ljava/io/InputStream;'] ??= nativeDef('Ljava/io/InputStream;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/io/Closeable;'],
  ctor: peerClass(function () {
    this.$streamData = null;
    this.$streamCursor = 0;
    this.$streamMark = 0;
    this.$streamMarkLimit = 0;
  }),
  methods: {
    '<init>()V': (self) => { self.$streamData = null; self.$streamCursor = 0; self.$streamMark = 0; self.$streamMarkLimit = 0; },
    'read()I': (self) => {
      const data = inputStreamData(self);
      const cursor = inputStreamCursor(self);
      if (cursor >= data.length) return -1;
      self.$streamCursor = cursor + 1;
      return data[cursor];
    },
    'read([B)I': (self, [buffer]) => readInputStreamInto(self, buffer, 0, -1),
    'read([BII)I': (self, [buffer, offset, length]) => readInputStreamInto(self, buffer, offset | 0, length | 0),
    'skip(J)J': (self, [count]) => {
      const data = inputStreamData(self);
      const cursor = inputStreamCursor(self);
      const step = Math.max(0, Number(count) || 0);
      const target = Math.min(data.length, cursor + step);
      self.$streamCursor = target;
      return BigInt(target - cursor);
    },
    'available()I': (self) => Math.max(0, inputStreamData(self).length - inputStreamCursor(self)),
    'mark(I)V': (self, [limit]) => {
      self.$streamMark = inputStreamCursor(self);
      self.$streamMarkLimit = Math.max(0, Number(limit) | 0);
    },
    'reset()V': (self) => { self.$streamCursor = Math.max(0, Number(self.$streamMark) || 0); },
    'markSupported()Z': () => 1,
    'close()V': () => undefined,
  },
});
/** OutputStream 落盘：带 $targetPath 的流在 flush/close 时把缓冲写入 VIRTUAL_FS。 */
function flushOutputStreamSink(self) {
  if (!self?.$targetPath || !Array.isArray(self.$buffer)) return;
  VIRTUAL_FS.write(self.$targetPath, Uint8Array.from(self.$buffer));
  self.$buffer = [];
}

JAVA_CORE_CLASSES['Ljava/io/OutputStream;'] ??= nativeDef('Ljava/io/OutputStream;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/io/Closeable;', 'Ljava/io/Flushable;'],
  methods: {
    'write(I)V': (self, [value]) => {
      if (!Array.isArray(self.$buffer)) self.$buffer = [];
      self.$buffer.push(value & 0xff);
    },
    'write([B)V': (self, [bytes]) => {
      if (!Array.isArray(self.$buffer)) self.$buffer = [];
      const data = bytes?.$data || bytes?._items || bytes?.items || [];
      for (const b of data) self.$buffer.push(b & 0xff);
    },
    'write([BII)V': (self, [bytes, offset, length]) => {
      if (!Array.isArray(self.$buffer)) self.$buffer = [];
      const data = bytes?.$data || bytes?._items || bytes?.items || [];
      const start = Number(offset) || 0;
      const end = start + (Number(length) || 0);
      for (let i = start; i < end && i < data.length; i += 1) self.$buffer.push(data[i] & 0xff);
    },
    'flush()V': (self) => flushOutputStreamSink(self),
    'close()V': (self) => flushOutputStreamSink(self),
  },
});
JAVA_CORE_CLASSES['Ljava/io/Flushable;'] ??= nativeDef('Ljava/io/Flushable;', { super: null });

JAVA_CORE_CLASSES['Ljava/io/File;'] = nativeDef('Ljava/io/File;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/io/Serializable;', 'Ljava/lang/Comparable;'],
  ctor: filePeerClass(),
  methods: {
    '<init>()V': (self) => { self.path = ''; },
    '<init>(Ljava/lang/String;)V': (self, [path]) => { self.path = jsString(path); },
    '<init>(Ljava/lang/String;Ljava/lang/String;)V': (self, [parent, child], vm) => {
      const left = jsString(parent);
      const right = jsString(child);
      self.path = joinPaths(left, right);
    },
    '<init>(Ljava/io/File;Ljava/lang/String;)V': (self, [parent, child], vm) => {
      const left = parent ? (parent.path ?? vm.getField(parent, { name: 'path', type: 'Ljava/lang/String;', classDesc: 'Ljava/io/File;' })) : '';
      self.path = joinPaths(String(left ?? ''), jsString(child));
    },
    'getPath()Ljava/lang/String;': (self) => self.path,
    'getAbsolutePath()Ljava/lang/String;': (self) => VIRTUAL_FS.normalize(self.path),
    'getCanonicalPath()Ljava/lang/String;': (self) => VIRTUAL_FS.normalize(self.path),
    'getName()Ljava/lang/String;': (self) => self.path.split('/').pop() || '',
    'getParent()Ljava/lang/String;': (self) => {
      const normalized = VIRTUAL_FS.normalize(self.path);
      const idx = normalized.lastIndexOf('/');
      return idx <= 0 ? (idx === 0 ? '/' : null) : normalized.slice(0, idx);
    },
    'getParentFile()Ljava/io/File;': (self, _args, vm) => {
      const normalized = VIRTUAL_FS.normalize(self.path);
      const idx = normalized.lastIndexOf('/');
      if (idx < 0) return null;
      return wrapFilePath(vm, idx === 0 ? '/' : normalized.slice(0, idx));
    },
    'exists()Z': (self) => VIRTUAL_FS.exists(self.path),
    'isFile()Z': (self) => VIRTUAL_FS.isFile(self.path),
    'isDirectory()Z': (self) => VIRTUAL_FS.isDirectory(self.path),
    'length()J': (self) => VIRTUAL_FS.length(self.path),
    'getTotalSpace()J': (self) => BigInt(storageCapacityForPath(self.path).totalBytes),
    'getFreeSpace()J': (self) => BigInt(storageCapacityForPath(self.path).availableBytes),
    'getUsableSpace()J': (self) => BigInt(storageCapacityForPath(self.path).availableBytes),
    'mkdir()Z': (self) => VIRTUAL_FS.mkdirs(self.path),
    'mkdirs()Z': (self) => VIRTUAL_FS.mkdirs(self.path),
    'delete()Z': (self) => {
      const normalized = VIRTUAL_FS.normalize(self.path);
      VIRTUAL_FS.dirs.delete(normalized);
      return VIRTUAL_FS.files.delete(normalized);
    },
    'list()[Ljava/lang/String;': (self, _args, vm) => {
      const names = VIRTUAL_FS.list(self.path);
      if (!vm) return names;
      const array = vm.newArray('[Ljava/lang/String;', names.length, null);
      names.forEach((name, index) => { array.$data[index] = name; });
      return array;
    },
    'listFiles()[Ljava/io/File;': (self, _args, vm) => {
      const names = VIRTUAL_FS.list(self.path);
      if (!vm) return names;
      const array = vm.newArray('[Ljava/io/File;', names.length, null);
      names.forEach((name, index) => { array.$data[index] = wrapFilePath(vm, joinPaths(self.path, name)); });
      return array;
    },
    'createNewFile()Z': (self) => {
      if (VIRTUAL_FS.exists(self.path)) return false;
      VIRTUAL_FS.write(self.path, []);
      return true;
    },
    'canRead()Z': () => true,
    'canWrite()Z': () => true,
    'setReadable(Z)Z': () => true,
    'setWritable(Z)Z': () => true,
    'setLastModified(J)Z': () => true,
    'lastModified()J': () => Date.now(),
    'toString()Ljava/lang/String;': (self) => self.path,
    'equals(Ljava/lang/Object;)Z': (self, [other], vm) => {
      if (!other) return false;
      const otherPath = other.path ?? other.$fields?.get?.('Ljava/io/File;->path:Ljava/lang/String;');
      return VIRTUAL_FS.normalize(self.path) === VIRTUAL_FS.normalize(String(otherPath ?? ''));
    },
    'hashCode()I': (self) => hashString(VIRTUAL_FS.normalize(self.path)),
    'compareTo(Ljava/io/File;)I': (self, [other]) => {
      const left = VIRTUAL_FS.normalize(self.path);
      const right = VIRTUAL_FS.normalize(other?.path ?? '');
      return left < right ? -1 : left > right ? 1 : 0;
    },
  },
  staticFields: new Map([
    ['separator:Ljava/lang/String;', '/'],
    ['pathSeparator:Ljava/lang/String;', ':'],
  ]),
});

function parseUrlParts(text) {
  const raw = String(text ?? '');
  const match = /^([a-zA-Z][a-zA-Z0-9+.\-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(raw);
  if (!match) {
    return { protocol: '', authority: '', host: '', port: -1, path: raw, file: raw, query: null, fragment: null };
  }
  const protocol = match[1].toLowerCase();
  const authority = match[2] || '';
  const path = match[3] || '';
  const query = match[4] === undefined ? null : match[4];
  const fragment = match[5] === undefined ? null : match[5];
  let host = authority;
  let port = -1;
  const at = authority.lastIndexOf('@');
  const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
  const colon = hostPort.lastIndexOf(':');
  if (colon > 0 && /^\d+$/.test(hostPort.slice(colon + 1))) {
    host = hostPort.slice(0, colon);
    port = parseInt(hostPort.slice(colon + 1), 10);
  } else {
    host = hostPort;
  }
  const file = query === null ? path : `${path}?${query}`;
  return { protocol, authority, host, port, path, file, query, fragment };
}

function urlTextOf(url) {
  if (url === null || url === undefined) return '';
  if (typeof url === 'string') return url;
  if (typeof url.text === 'string') return url.text;
  return jsString(url);
}

function makeUrlConnection(vm, url) {
  const text = urlTextOf(url);
  const parts = parseUrlParts(text);
  const secure = parts.protocol === 'https';
  const object = vm.allocateRawObject(secure ? 'Ljavax/net/ssl/HttpsURLConnection;' : 'Ljava/net/HttpURLConnection;');
  object.$peer = {
    vm,
    url: text,
    parts,
    method: 'GET',
    headers: new Map(),
    connected: false,
  };
  return object;
}

JAVA_CORE_CLASSES['Ljava/net/URL;'] = nativeDef('Ljava/net/URL;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/io/Serializable;'],
  ctor: class URLPeer {
    constructor(vm) {
      this.vm = vm;
      this.text = '';
      this.parts = parseUrlParts('');
    }
  },
  methods: {
    '<init>(Ljava/lang/String;)V': (self, [text]) => {
      self.text = jsString(text);
      self.parts = parseUrlParts(self.text);
    },
    '<init>(Ljava/lang/String;Ljava/lang/String;ILjava/lang/String;)V': (self, [protocol, host, port, file]) => {
      const suffix = Number(port) > 0 ? `:${port | 0}` : '';
      self.text = `${jsString(protocol)}://${jsString(host)}${suffix}/${String(jsString(file)).replace(/^\/+/, '')}`;
      self.parts = parseUrlParts(self.text);
    },
    '<init>(Ljava/net/URL;Ljava/lang/String;)V': (self, [base, file]) => {
      const text = urlTextOf(base);
      self.text = jsString(file).startsWith('/')
        ? `${text.replace(/^(https?:\/\/[^/]+).*$/, '$1')}${jsString(file)}`
        : `${text.replace(/\/[^/]*$/, '/')}${jsString(file)}`;
      self.parts = parseUrlParts(self.text);
    },
    'openConnection()Ljava/net/URLConnection;': (self, _args, vm) => makeUrlConnection(vm, self),
    'openStream()Ljava/io/InputStream;': (self, _args, vm) => {
      vm.throwException('Ljava/io/IOException;', `Unable to open stream: ${self.text}`);
      return null;
    },
    'getProtocol()Ljava/lang/String;': (self) => self.parts.protocol,
    'getHost()Ljava/lang/String;': (self) => self.parts.host,
    'getAuthority()Ljava/lang/String;': (self) => self.parts.authority,
    'getPort()I': (self) => self.parts.port,
    'getDefaultPort()I': (self) => (self.parts.protocol === 'https' ? 443 : self.parts.protocol === 'http' ? 80 : -1),
    'getPath()Ljava/lang/String;': (self) => self.parts.path,
    'getFile()Ljava/lang/String;': (self) => self.parts.file,
    'getQuery()Ljava/lang/String;': (self) => self.parts.query,
    'getRef()Ljava/lang/String;': (self) => self.parts.fragment,
    'getUserInfo()Ljava/lang/String;': (self) => {
      const at = String(self.parts.authority).lastIndexOf('@');
      return at >= 0 ? self.parts.authority.slice(0, at) : null;
    },
    'toURI()Ljava/net/URI;': (self, _args, vm) => {
      const object = vm.allocateRawObject('Ljava/net/URI;');
      object.$peer = { vm, text: self.text, parts: self.parts };
      return object;
    },
    'toString()Ljava/lang/String;': (self) => self.text,
    'toExternalForm()Ljava/lang/String;': (self) => self.text,
    'hashCode()I': (self) => hashString(self.text),
    'equals(Ljava/lang/Object;)Z': (self, [other]) => jsString(other?.text ?? other) === self.text,
  },
});

JAVA_CORE_CLASSES['Ljava/net/URI;'] = nativeDef('Ljava/net/URI;', {
  super: 'Ljava/lang/Object;',
  ctor: class URIPeer {
    constructor(vm) {
      this.vm = vm;
      this.text = '';
      this.parts = parseUrlParts('');
    }
  },
  methods: {
    '<init>(Ljava/lang/String;)V': (self, [text]) => {
      self.text = jsString(text);
      self.parts = parseUrlParts(self.text);
    },
    'toString()Ljava/lang/String;': (self) => self.text,
    'toASCIIString()Ljava/lang/String;': (self) => self.text,
    'toURL()Ljava/net/URL;': (self, _args, vm) => {
      const object = vm.allocateRawObject('Ljava/net/URL;');
      object.$peer = { vm, text: self.text, parts: self.parts };
      return object;
    },
    'getScheme()Ljava/lang/String;': (self) => self.parts.protocol || null,
    'getHost()Ljava/lang/String;': (self) => self.parts.host || null,
    'getPort()I': (self) => self.parts.port,
    'getPath()Ljava/lang/String;': (self) => self.parts.path,
    'getRawPath()Ljava/lang/String;': (self) => self.parts.path,
    'getQuery()Ljava/lang/String;': (self) => self.parts.query,
    'getFragment()Ljava/lang/String;': (self) => self.parts.fragment,
    'isAbsolute()Z': (self) => !!self.parts.protocol,
    'hashCode()I': (self) => hashString(self.text),
    'equals(Ljava/lang/Object;)Z': (self, [other]) => jsString(other?.text ?? other) === self.text,
  },
});

JAVA_CORE_CLASSES['Ljava/net/URLConnection;'] = nativeDef('Ljava/net/URLConnection;', {
  super: 'Ljava/lang/Object;',
  methods: {
    'setDoInput(Z)V': (self, [value]) => { self.doInput = !!value; },
    'setDoOutput(Z)V': (self, [value]) => { self.doOutput = !!value; },
    'getDoInput()Z': (self) => self.doInput !== false,
    'getDoOutput()Z': (self) => !!self.doOutput,
    'setUseCaches(Z)V': (self, [value]) => { self.useCaches = !!value; },
    'getUseCaches()Z': (self) => !!self.useCaches,
    'setConnectTimeout(I)V': (self, [value]) => { self.connectTimeout = value | 0; },
    'getConnectTimeout()I': (self) => self.connectTimeout | 0,
    'setReadTimeout(I)V': (self, [value]) => { self.readTimeout = value | 0; },
    'getReadTimeout()I': (self) => self.readTimeout | 0,
    'setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V': (self, [key, value]) => {
      self.headers?.set(jsString(key), jsString(value));
    },
    'addRequestProperty(Ljava/lang/String;Ljava/lang/String;)V': (self, [key, value]) => {
      self.headers?.set(jsString(key), jsString(value));
    },
    'getRequestProperty(Ljava/lang/String;)Ljava/lang/String;': (self, [key]) => self.headers?.get(jsString(key)) ?? null,
    'connect()V': (_self, _args, vm) => {
      vm.throwException('Ljava/io/IOException;', 'Unable to resolve host: no network in simulator');
    },
    'disconnect()V': () => undefined,
    'getOutputStream()Ljava/io/OutputStream;': (_self, _args, vm) => {
      vm.throwException('Ljava/io/IOException;', 'Unable to resolve host: no network in simulator');
      return null;
    },
    'getInputStream()Ljava/io/InputStream;': (_self, _args, vm) => {
      vm.throwException('Ljava/io/IOException;', 'Unable to resolve host: no network in simulator');
      return null;
    },
    'getErrorStream()Ljava/io/InputStream;': () => null,
    'getHeaderField(Ljava/lang/String;)Ljava/lang/String;': (self, [key]) => self.headers?.get(jsString(key)) ?? null,
    'getHeaderFields()Ljava/util/Map;': (_self, _args, vm) => makeMap(vm),
    'getContentLength()I': () => -1,
    'getContentLengthLong()J': () => BigInt(-1),
    'getContentType()Ljava/lang/String;': () => null,
    'getContentEncoding()Ljava/lang/String;': () => null,
    'getURL()Ljava/net/URL;': (self, _args, vm) => {
      const object = vm.allocateRawObject('Ljava/net/URL;');
      object.$peer = { vm, text: self.url || '', parts: self.parts || parseUrlParts(self.url || '') };
      return object;
    },
    'usingProxy()Z': () => false,
    'getPermission()Ljava/security/Permission;': () => null,
  },
});

JAVA_CORE_CLASSES['Ljava/net/HttpURLConnection;'] = nativeDef('Ljava/net/HttpURLConnection;', {
  super: 'Ljava/net/URLConnection;',
  methods: {
    'setRequestMethod(Ljava/lang/String;)V': (self, [method]) => { self.method = jsString(method).toUpperCase(); },
    'getRequestMethod()Ljava/lang/String;': (self) => self.method || 'GET',
    'getResponseCode()I': (_self, _args, vm) => {
      vm.throwException('Ljava/io/IOException;', 'Unable to resolve host: no network in simulator');
      return -1;
    },
    'getResponseMessage()Ljava/lang/String;': () => null,
    'getInstanceFollowRedirects()Z': (self) => self.followRedirects !== false,
    'setInstanceFollowRedirects(Z)V': (self, [value]) => { self.followRedirects = !!value; },
    'setFixedLengthStreamingMode(I)V': (self, [value]) => { self.fixedLength = value | 0; },
    'setFixedLengthStreamingMode(J)V': (self, [value]) => { self.fixedLength = Number(value) || 0; },
    'setChunkedStreamingMode(I)V': (self, [value]) => { self.chunkedLength = value | 0; },
  },
  staticFields: new Map([
    ['HTTP_OK:I', 200],
    ['HTTP_CREATED:I', 201],
    ['HTTP_NO_CONTENT:I', 204],
    ['HTTP_MOVED_PERM:I', 301],
    ['HTTP_MOVED_TEMP:I', 302],
    ['HTTP_NOT_MODIFIED:I', 304],
    ['HTTP_BAD_REQUEST:I', 400],
    ['HTTP_UNAUTHORIZED:I', 401],
    ['HTTP_FORBIDDEN:I', 403],
    ['HTTP_NOT_FOUND:I', 404],
    ['HTTP_INTERNAL_ERROR:I', 500],
  ]),
});

JAVA_CORE_CLASSES['Ljavax/net/ssl/HttpsURLConnection;'] = nativeDef('Ljavax/net/ssl/HttpsURLConnection;', {
  super: 'Ljava/net/HttpURLConnection;',
  methods: {
    'getCipherSuite()Ljava/lang/String;': () => 'TLS_AES_256_GCM_SHA384',
    'getServerCertificates()[Ljava/security/cert/Certificate;': (_self, _args, vm) =>
      vm.newArray('[Ljava/security/cert/Certificate;', 0, null),
    'getSSLSocketFactory()Ljavax/net/ssl/SSLSocketFactory;': () => null,
    'setSSLSocketFactory(Ljavax/net/ssl/SSLSocketFactory;)V': () => undefined,
    'setHostnameVerifier(Ljavax/net/ssl/HostnameVerifier;)V': () => undefined,
    'getHostnameVerifier()Ljavax/net/ssl/HostnameVerifier;': () => null,
    'setDefaultHostnameVerifier(Ljavax/net/ssl/HostnameVerifier;)V': () => undefined,
    'getDefaultHostnameVerifier()Ljavax/net/ssl/HostnameVerifier;': () => null,
  },
});

JAVA_CORE_CLASSES['Landroid/os/storage/StorageManager;'] = nativeDef('Landroid/os/storage/StorageManager;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (vm) {
    this.vm = vm;
  }, { vm: null }),
  methods: {
    'getVolumePaths()[Ljava/lang/String;': (_self, _args, vm) => {
      const paths = storageVolumePaths();
      const array = vm.newArray('[Ljava/lang/String;', paths.length, null);
      paths.forEach((path, index) => { array.$data[index] = path; });
      return array;
    },
    'getVolumeList()[Landroid/os/storage/StorageVolume;': (_self, _args, vm) => {
      const paths = storageVolumePaths();
      const array = vm.newArray('[Landroid/os/storage/StorageVolume;', paths.length, null);
      paths.forEach((path, index) => {
        array.$data[index] = volumeForStoragePath(vm, path, { primary: index === 0 });
      });
      return array;
    },
    'getStorageVolumes()Ljava/util/List;': (_self, _args, vm) => {
      const volumes = storageVolumePaths().map((path, index) =>
        volumeForStoragePath(vm, path, { primary: index === 0 }));
      return makeList(vm, volumes);
    },
    'getPrimaryStorageVolume()Landroid/os/storage/StorageVolume;': (_self, _args, vm) =>
      volumeForStoragePath(vm, '/storage/emulated/0', { primary: true }),
    'getStorageVolume(Ljava/io/File;)Landroid/os/storage/StorageVolume;': (_self, [file], vm) => {
      const target = VIRTUAL_FS.normalize(filePathOf(file) || '/');
      const match = storageVolumePaths()
        .filter((path) => target === path || target.startsWith(path + '/'))
        .sort((left, right) => right.length - left.length)[0];
      if (match) return volumeForStoragePath(vm, match, { primary: match === '/storage/emulated/0' });
      if (target === '/data' || target.startsWith('/data/')) {
        return volumeForStoragePath(vm, '/storage/emulated/0', { primary: true });
      }
      return null;
    },
    'getVolumeState(Ljava/lang/String;)Ljava/lang/String;': () => 'mounted',
  },
});

JAVA_CORE_CLASSES['Landroid/os/storage/StorageVolume;'] = nativeDef('Landroid/os/storage/StorageVolume;', {
  super: 'Ljava/lang/Object;',
  methods: {
    'getPath()Ljava/lang/String;': (self) => self.path ?? '',
    'getPathFile()Ljava/io/File;': (self, _args, vm) => wrapFilePath(vm, self.path ?? ''),
    'getUuid()Ljava/lang/String;': (self) => self.uuid ?? null,
    'getState()Ljava/lang/String;': (self) => self.state ?? 'mounted',
    'getDescription()Ljava/lang/String;': (self) => self.description ?? '',
    'getDescription(Landroid/content/Context;)Ljava/lang/String;': (self) => self.description ?? '',
    'isPrimary()Z': (self) => (self.primary ? 1 : 0),
    'isRemovable()Z': (self) => (self.removable ? 1 : 0),
    'isEmulated()Z': (self) => (self.emulated ? 1 : 0),
    'getTotalBytes()J': (self) => BigInt(storageCapacityForPath(self.path).totalBytes),
    'getAvailableBytes()J': (self) => BigInt(storageCapacityForPath(self.path).availableBytes),
    'toString()Ljava/lang/String;': (self) => `StorageVolume:${self.path ?? ''}`,
  },
});

JAVA_CORE_CLASSES['Landroid/os/Environment;'] = nativeDef('Landroid/os/Environment;', {
  super: 'Ljava/lang/Object;',
  staticMethods: {
    'getExternalStorageDirectory()Ljava/io/File;': (_self, _args, vm) =>
      wrapFilePath(vm, '/storage/emulated/0'),
    'getExternalStoragePublicDirectory(Ljava/lang/String;)Ljava/io/File;': (_self, [type], vm) =>
      wrapFilePath(vm, joinPaths('/storage/emulated/0', jsString(type))),
    'getDataDirectory()Ljava/io/File;': (_self, _args, vm) => wrapFilePath(vm, '/data'),
    'getRootDirectory()Ljava/io/File;': (_self, _args, vm) => wrapFilePath(vm, '/system'),
    'getDownloadCacheDirectory()Ljava/io/File;': (_self, _args, vm) => wrapFilePath(vm, '/cache'),
    'getExternalStorageState()Ljava/lang/String;': () => 'mounted',
    'getExternalStorageState(Ljava/io/File;)Ljava/lang/String;': () => 'mounted',
    'getStorageState(Ljava/io/File;)Ljava/lang/String;': () => 'mounted',
    'isExternalStorageEmulated()Z': () => 1,
    'isExternalStorageEmulated(Ljava/io/File;)Z': () => 1,
    'isExternalStorageRemovable()Z': () => 0,
    'isExternalStorageRemovable(Ljava/io/File;)Z': () => 0,
  },
  staticFields: new Map([
    ['MEDIA_MOUNTED:Ljava/lang/String;', 'mounted'],
    ['MEDIA_UNMOUNTED:Ljava/lang/String;', 'unmounted'],
    ['MEDIA_REMOVED:Ljava/lang/String;', 'removed'],
    ['MEDIA_BAD_REMOVAL:Ljava/lang/String;', 'bad_removal'],
    ['MEDIA_SHARED:Ljava/lang/String;', 'shared'],
    ['MEDIA_CHECKING:Ljava/lang/String;', 'checking'],
    ['MEDIA_UNMOUNTABLE:Ljava/lang/String;', 'unmountable'],
    ['MEDIA_EJECTING:Ljava/lang/String;', 'ejecting'],
    ['DIRECTORY_MUSIC:Ljava/lang/String;', '/storage/emulated/0/Music'],
    ['DIRECTORY_PODCASTS:Ljava/lang/String;', '/storage/emulated/0/Podcasts'],
    ['DIRECTORY_RINGTONES:Ljava/lang/String;', '/storage/emulated/0/Ringtones'],
    ['DIRECTORY_ALARMS:Ljava/lang/String;', '/storage/emulated/0/Alarms'],
    ['DIRECTORY_NOTIFICATIONS:Ljava/lang/String;', '/storage/emulated/0/Notifications'],
    ['DIRECTORY_PICTURES:Ljava/lang/String;', '/storage/emulated/0/Pictures'],
    ['DIRECTORY_MOVIES:Ljava/lang/String;', '/storage/emulated/0/Movies'],
    ['DIRECTORY_DOWNLOADS:Ljava/lang/String;', '/storage/emulated/0/Download'],
    ['DIRECTORY_DCIM:Ljava/lang/String;', '/storage/emulated/0/DCIM'],
    ['DIRECTORY_DOCUMENTS:Ljava/lang/String;', '/storage/emulated/0/Documents'],
    ['DIRECTORY_SCREENSHOTS:Ljava/lang/String;', '/storage/emulated/0/Screenshots'],
    ['DIRECTORY_AUDIOBOOKS:Ljava/lang/String;', '/storage/emulated/0/Audiobooks'],
  ]),
});

JAVA_CORE_CLASSES['Landroid/os/StatFs;'] = nativeDef('Landroid/os/StatFs;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.path = '/data';
  }, { path: '/data' }),
  methods: {
    '<init>(Ljava/lang/String;)V': (self, [path]) => {
      self.path = jsString(path) || '/data';
    },
    '<init>(Ljava/io/File;)V': (self, [file]) => {
      self.path = filePathOf(file) || '/data';
    },
    'restat(Ljava/lang/String;)V': (self, [path]) => {
      self.path = jsString(path) || self.path;
    },
    'restat(Ljava/io/File;)V': (self, [file]) => {
      self.path = filePathOf(file) || self.path;
    },
    'getBlockSize()I': () => STORAGE_BLOCK_SIZE,
    'getBlockSizeLong()J': () => BigInt(STORAGE_BLOCK_SIZE),
    'getBlockCount()I': (self) => Math.floor(storageCapacityForPath(self.path).totalBytes / STORAGE_BLOCK_SIZE),
    'getBlockCountLong()J': (self) => BigInt(Math.floor(storageCapacityForPath(self.path).totalBytes / STORAGE_BLOCK_SIZE)),
    'getFreeBlocks()I': (self) => Math.floor(storageCapacityForPath(self.path).availableBytes / STORAGE_BLOCK_SIZE),
    'getFreeBlocksLong()J': (self) => BigInt(Math.floor(storageCapacityForPath(self.path).availableBytes / STORAGE_BLOCK_SIZE)),
    'getAvailableBlocks()I': (self) => Math.floor(storageCapacityForPath(self.path).availableBytes / STORAGE_BLOCK_SIZE),
    'getAvailableBlocksLong()J': (self) => BigInt(Math.floor(storageCapacityForPath(self.path).availableBytes / STORAGE_BLOCK_SIZE)),
    'getFreeBytes()J': (self) => BigInt(storageCapacityForPath(self.path).availableBytes),
    'getAvailableBytes()J': (self) => BigInt(storageCapacityForPath(self.path).availableBytes),
    'getTotalBytes()J': (self) => BigInt(storageCapacityForPath(self.path).totalBytes),
  },
});

JAVA_CORE_CLASSES['Ljava/io/FileInputStream;'] = nativeDef('Ljava/io/FileInputStream;', {
  super: 'Ljava/io/InputStream;',
  ctor: peerClass(function () { this.data = new Uint8Array(0); this.cursor = 0; }, { data: null, cursor: 0 }),
  methods: {
    '<init>(Ljava/io/File;)V': (self, [file]) => { resetStream(self, file?.path); },
    '<init>(Ljava/lang/String;)V': (self, [path]) => { resetStream(self, jsString(path)); },
    'read()I': (self) => (self.cursor < self.data.length ? self.data[self.cursor++] : -1),
    'read([B)I': (self, [buffer]) => readIntoBuffer(self, buffer),
    'read([BII)I': (self, [buffer, offset, length]) => readIntoBuffer(self, buffer, offset | 0, length | 0),
    'available()I': (self) => Math.max(0, self.data.length - self.cursor),
    'skip(J)J': (self, [count]) => { const step = Math.max(0, Number(count) || 0); self.cursor = Math.min(self.data.length, self.cursor + step); return step; },
    'close()V': (self) => { self.data = new Uint8Array(0); },
    'getChannel()Ljava/nio/channels/FileChannel;': () => null,
  },
});

JAVA_CORE_CLASSES['Ljava/io/FileOutputStream;'] = nativeDef('Ljava/io/FileOutputStream;', {
  super: 'Ljava/io/OutputStream;',
  ctor: peerClass(function () { this.path = ''; this.chunks = []; }, { path: '', chunks: [] }),
  methods: {
    '<init>(Ljava/io/File;)V': (self, [file]) => { self.path = file?.path ?? ''; self.chunks = []; },
    '<init>(Ljava/io/File;Z)V': (self, [file, append]) => { self.path = file?.path ?? ''; self.chunks = append && VIRTUAL_FS.read(self.path) ? [VIRTUAL_FS.read(self.path)] : []; },
    '<init>(Ljava/lang/String;)V': (self, [path]) => { self.path = jsString(path); self.chunks = []; },
    '<init>(Ljava/lang/String;Z)V': (self, [path, append]) => { self.path = jsString(path); self.chunks = append && VIRTUAL_FS.read(self.path) ? [VIRTUAL_FS.read(self.path)] : []; },
    'write(I)V': (self, [byte]) => { self.chunks.push(Uint8Array.of(byte & 0xff)); },
    'write([B)V': (self, [buffer]) => { self.chunks.push(Uint8Array.from(buffer?.$data ?? buffer ?? [])); },
    'write([BII)V': (self, [buffer, offset, length]) => {
      const data = Uint8Array.from(buffer?.$data ?? buffer ?? []);
      self.chunks.push(data.subarray(offset | 0, (offset | 0) + (length | 0)));
    },
    'flush()V': (self) => flushOutput(self),
    'close()V': (self) => flushOutput(self),
    'getFD()Ljava/io/FileDescriptor;': (self) => fileDescriptorOf(self.path),
  },
});

JAVA_CORE_CLASSES['Ljava/io/RandomAccessFile;'] = nativeDef('Ljava/io/RandomAccessFile;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/io/Closeable;'],
  ctor: peerClass(function () { this.path = ''; this.data = new Uint8Array(0); this.cursor = 0; }, { path: '', data: null, cursor: 0 }),
  methods: {
    '<init>(Ljava/io/File;Ljava/lang/String;)V': (self, [file]) => { openRandom(self, file?.path); },
    '<init>(Ljava/lang/String;Ljava/lang/String;)V': (self, [path]) => { openRandom(self, jsString(path)); },
    'length()J': (self) => self.data.length,
    'seek(J)V': (self, [position]) => { self.cursor = Math.max(0, Number(position) || 0); },
    'getFilePointer()J': (self) => self.cursor,
    'read()I': (self) => (self.cursor < self.data.length ? self.data[self.cursor++] : -1),
    'read([B)I': (self, [buffer]) => readIntoBuffer(self, buffer),
    'read([BII)I': (self, [buffer, offset, length]) => readIntoBuffer(self, buffer, offset | 0, length | 0),
    'readFully([B)V': (self, [buffer]) => { readIntoBuffer(self, buffer); },
    'readFully([BII)V': (self, [buffer, offset, length]) => { readIntoBuffer(self, buffer, offset | 0, length | 0); },
    'readLine()Ljava/lang/String;': (self) => {
      if (self.cursor >= self.data.length) return null;
      let end = self.cursor;
      while (end < self.data.length && self.data[end] !== 0x0a && self.data[end] !== 0x0d) end += 1;
      const line = utf8Decode(self.data.subarray(self.cursor, end));
      while (end < self.data.length && (self.data[end] === 0x0a || self.data[end] === 0x0d)) end += 1;
      self.cursor = end;
      return line;
    },
    'write(I)V': (self, [byte]) => { writeRandom(self, self.cursor, Uint8Array.of(byte & 0xff)); self.cursor += 1; },
    'write([B)V': (self, [buffer]) => { const data = Uint8Array.from(buffer?.$data ?? buffer ?? []); writeRandom(self, self.cursor, data); self.cursor += data.length; },
    'write([BII)V': (self, [buffer, offset, length]) => {
      const data = Uint8Array.from(buffer?.$data ?? buffer ?? []).subarray(offset | 0, (offset | 0) + (length | 0));
      writeRandom(self, self.cursor, data);
      self.cursor += data.length;
    },
    'setLength(J)V': (self, [length]) => {
      const size = Math.max(0, Number(length) || 0);
      const next = new Uint8Array(size);
      next.set(self.data.subarray(0, Math.min(size, self.data.length)));
      self.data = next;
      randomFiles.set(VIRTUAL_FS.normalize(self.path), next);
    },
    'close()V': (self) => { randomFiles.set(VIRTUAL_FS.normalize(self.path), self.data); VIRTUAL_FS.write(self.path, self.data); },
    'getFD()Ljava/io/FileDescriptor;': (self) => fileDescriptorOf(self.path),
  },
});

JAVA_CORE_CLASSES['Ljava/io/FileDescriptor;'] = nativeDef('Ljava/io/FileDescriptor;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (path) { this.path = path ?? ''; }, { path: '' }),
  methods: {
    'valid()Z': () => true,
    'sync()V': () => undefined,
  },
  staticFields: new Map([
    ['in:Ljava/io/FileDescriptor;', null],
    ['out:Ljava/io/FileDescriptor;', null],
    ['err:Ljava/io/FileDescriptor;', null],
  ]),
});

const randomFiles = new Map();

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash;
}

function joinPaths(parent, child) {
  const left = String(parent ?? '');
  const right = String(child ?? '');
  if (!left) return right;
  if (!right) return left;
  return left.endsWith('/') ? left + right : `${left}/${right}`;
}

function wrapFilePath(vm, path) {
  const object = vm.allocateRawObject('Ljava/io/File;');
  object.$peer = { path };
  return object;
}

function fileDescriptorOf(path) {
  return { $descriptor: 'Ljava/io/FileDescriptor;', path };
}

function resetStream(self, path) {
  const data = VIRTUAL_FS.read(String(path ?? ''));
  self.data = data ? Uint8Array.from(data) : new Uint8Array(0);
  self.cursor = 0;
}

function openRandom(self, path) {
  self.path = String(path ?? '');
  const normalized = VIRTUAL_FS.normalize(self.path);
  const cached = randomFiles.get(normalized);
  self.data = cached ? Uint8Array.from(cached) : (VIRTUAL_FS.read(self.path) ? Uint8Array.from(VIRTUAL_FS.read(self.path)) : new Uint8Array(0));
  randomFiles.set(normalized, self.data);
  self.cursor = 0;
}

function writeRandom(self, position, chunk) {
  const start = Math.max(0, position | 0);
  const needed = start + chunk.length;
  if (needed > self.data.length) {
    const next = new Uint8Array(needed);
    next.set(self.data);
    self.data = next;
  }
  self.data.set(chunk, start);
  randomFiles.set(VIRTUAL_FS.normalize(self.path), self.data);
  VIRTUAL_FS.write(self.path, self.data);
}

/** InputStream 的底层字节来源：兼容 FileInputStream 的 data/cursor 与 openInputStream 的 bytes/offset。 */
function inputStreamData(self) {
  if (self.$streamData instanceof Uint8Array) return self.$streamData;
  const raw = self.data instanceof Uint8Array ? self.data
    : self.bytes instanceof Uint8Array ? self.bytes
      : self.$bytes instanceof Uint8Array ? self.$bytes : null;
  self.$streamData = raw || new Uint8Array(0);
  return self.$streamData;
}

/** 读取并缓存 InputStream 的当前读取位置。 */
function inputStreamCursor(self) {
  if (typeof self.$streamCursor !== 'number' || !Number.isFinite(self.$streamCursor)) {
    const cursor = Number.isFinite(self.cursor) ? self.cursor : (Number.isFinite(self.offset) ? self.offset : 0);
    self.$streamCursor = Math.max(0, cursor | 0);
  }
  return self.$streamCursor;
}

/** read([B) / read([BII) 的真实实现：写入调用方数组并返回读取字节数（EOF 返回 -1）。 */
function readInputStreamInto(self, buffer, offset = 0, length = -1) {
  if (buffer === null || buffer === undefined) throw new Error('NullPointerException: buffer');
  const target = buffer?.$data || buffer?._items || buffer?.items || buffer;
  if (!target) return -1;
  const start = Math.max(0, offset | 0);
  const size = length < 0 ? target.length - start : Math.max(0, length | 0);
  if (size === 0) return 0;
  const data = inputStreamData(self);
  let cursor = inputStreamCursor(self);
  let count = 0;
  for (let i = 0; i < size && cursor < data.length; i += 1) {
    target[start + i] = data[cursor++];
    count += 1;
  }
  self.$streamCursor = cursor;
  return count > 0 ? count : -1;
}

function readIntoBuffer(self, buffer, offset = 0, length = -1) {
  const target = buffer?.$data ?? buffer;
  if (!target) return 0;
  const size = length < 0 ? target.length - offset : length;
  let count = 0;
  for (let i = 0; i < size && self.cursor < self.data.length; i++) {
    target[offset + i] = self.data[self.cursor++];
    count++;
  }
  return count || -1;
}

function flushOutput(self) {
  if (!self.path) return;
  const total = self.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of self.chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  VIRTUAL_FS.write(self.path, merged);
  self.chunks = [];
}

export { VIRTUAL_FS, wrapFilePath, joinPaths, seedHardwareFs, readFsText, inputStreamData, inputStreamCursor, readInputStreamInto };

JAVA_CORE_CLASSES['Ljava/util/UUID;'] = nativeDef('Ljava/util/UUID;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.text = '00000000-0000-0000-0000-000000000000';
  }, { text: '' }),
  methods: {
    '<init>(JJ)V': (self) => {
      const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
      self.text = [hex(), hex(), '-' + hex(), '-' + hex(), '-' + hex(), '-' + hex() + hex() + hex()].join('');
      self.text = self.text.replace(/^-/, '');
    },
    'randomUUID()Ljava/util/UUID;': null,
    'toString()Ljava/lang/String;': (self) => self.text,
    'equals(Ljava/lang/Object;)Z': (self, [other]) => (other && other.$peer ? other.$peer.text === self.text : false),
    'hashCode()I': (self) => {
      let hash = 0;
      for (let i = 0; i < self.text.length; i++) hash = (Math.imul(hash, 31) + self.text.charCodeAt(i)) | 0;
      return hash;
    },
  },
  staticMethods: {
    'randomUUID()Ljava/util/UUID;': (_self, _args, vm) => {
      const definition = vm.registry.resolve('Ljava/util/UUID;');
      const object = vm.allocateObject(definition);
      const hex = (n) => Math.floor(Math.random() * Math.pow(16, n)).toString(16).padStart(n, '0');
      object.$peer = {
        text: `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(4)}${hex(8)}`,
      };
      return object;
    },
    'fromString(Ljava/lang/String;)Ljava/util/UUID;': (_self, [text], vm) => {
      const definition = vm.registry.resolve('Ljava/util/UUID;');
      const object = vm.allocateObject(definition);
      object.$peer = { text: jsString(text) };
      return object;
    },
  },
});

JAVA_CORE_CLASSES['Ljava/util/regex/Pattern;'] = nativeDef('Ljava/util/regex/Pattern;', {
  super: 'Ljava/lang/Object;',
  staticMethods: {
    'compile(Ljava/lang/String;)Ljava/util/regex/Pattern;': (_self, [regex], vm) => makeRegexPattern(vm, regex, 0),
    'compile(Ljava/lang/String;I)Ljava/util/regex/Pattern;': (_self, [regex, flags], vm) => makeRegexPattern(vm, regex, flags | 0),
    'matches(Ljava/lang/String;Ljava/lang/CharSequence;)Z': (_self, [regex, input]) => {
      try { return new RegExp(`^(?:${jsString(regex)})$`).test(jsString(input)); } catch { return false; }
    },
    'quote(Ljava/lang/String;)Ljava/lang/String;': (_self, [input]) => jsString(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  },
  methods: {
    'matcher(Ljava/lang/CharSequence;)Ljava/util/regex/Matcher;': (self, [input], vm) => makeRegexMatcher(vm, self.regex, jsString(input)),
    'pattern()Ljava/lang/String;': (self) => self.regex || '',
    'toString()Ljava/lang/String;': (self) => self.regex || '',
    'flags()I': (self) => self.flags | 0,
  },
});

JAVA_CORE_CLASSES['Ljava/util/regex/Matcher;'] = nativeDef('Ljava/util/regex/Matcher;', {
  super: 'Ljava/lang/Object;',
  methods: {
    'matches()Z': (self) => {
      self.last = String(self.input ?? '').match(new RegExp(`^(?:${self.regex})$`));
      self.groups = self.last;
      return !!self.last;
    },
    'find()Z': (self) => {
      const re = new RegExp(self.regex, 'g');
      re.lastIndex = self.cursor | 0;
      const m = re.exec(String(self.input ?? ''));
      if (!m) { self.last = null; self.cursor = String(self.input ?? '').length; return false; }
      self.last = m;
      self.cursor = m.index + (m[0].length || 1);
      return true;
    },
    'group()Ljava/lang/String;': (self) => (self.last ? (self.last[0] ?? '') : null),
    'group(I)Ljava/lang/String;': (self, [index]) => (self.last ? (self.last[index | 0] ?? null) : null),
    'groupCount()I': (self) => (self.last ? Math.max(0, self.last.length - 1) : 0),
    'start()I': (self) => (self.last ? self.last.index : -1),
    'end()I': (self) => (self.last ? self.last.index + (self.last[0]?.length ?? 0) : -1),
    'reset()Ljava/util/regex/Matcher;': (self) => { self.cursor = 0; self.last = null; return self.object ?? null; },
    'reset(Ljava/lang/CharSequence;)Ljava/util/regex/Matcher;': (self, [input]) => { self.input = jsString(input); self.cursor = 0; self.last = null; return self.object ?? null; },
    'replaceAll(Ljava/lang/String;)Ljava/lang/String;': (self, [replacement]) => String(self.input ?? '').replace(new RegExp(self.regex, 'g'), (jsString(replacement) || '').replace(/\$(\d)/g, '$$$$$1')),
    'replaceFirst(Ljava/lang/String;)Ljava/lang/String;': (self, [replacement]) => String(self.input ?? '').replace(new RegExp(self.regex), (jsString(replacement) || '').replace(/\$(\d)/g, '$$$$$1')),
  },
});

function makeRegexPattern(vm, regex, flags) {
  const object = vm.allocateRawObject('Ljava/util/regex/Pattern;');
  object.$peer = { regex: jsString(regex), flags: flags | 0 };
  return object;
}

function makeRegexMatcher(vm, regex, input) {
  const object = vm.allocateRawObject('Ljava/util/regex/Matcher;');
  object.$peer = { regex: regex || '', input: input ?? '', cursor: 0, last: null };
  return object;
}

function unboxJavaValue(value) {
  if (!value || typeof value !== 'object') return value;
  const peer = value.$peer || null;
  if (peer && Object.prototype.hasOwnProperty.call(peer, 'value')) return peer.value;
  const fields = value.$fields;
  if (fields && typeof fields.get === 'function') {
    for (const key of ['value:I', 'value:J', 'value:D', 'value:F', 'value:S', 'value:B', 'value:C']) {
      if (fields.has(key)) return fields.get(key);
    }
  }
  return value;
}

function formatJavaString(format, args, vm) {
  const values = Array.isArray(args) ? args : (isJavaArray(args) ? args.$data : []);
  let index = 0;
  return jsString(format).replace(/%([0-9]+\$)?(?:\.(\d+))?([sdifxX%])/g, (match, positional, precision, type) => {
    if (type === '%') return '%';
    const at = positional ? parseInt(positional, 10) - 1 : index++;
    const value = unboxJavaValue(values[at]);
    if (type === 'd' || type === 'i') return String(Number(value) || 0);
    if (type === 'f') return (Number(value) || 0).toFixed(precision === undefined ? 2 : Math.min(20, Number(precision) || 0));
    if (type === 'x') return (Number(value) || 0).toString(16);
    if (type === 'X') return (Number(value) || 0).toString(16).toUpperCase();
    return javaValueToString(value, vm);
  });
}

/** %s / String.valueOf：覆写了 toString 的 Java 对象必须走它。 */
function javaValueToString(value, vm) {
  if (value === null || value === undefined) return 'null';
  if (vm && isJavaObject(value) && classOverridesMethod(vm, value, 'toString', '()Ljava/lang/String;')) {
    try {
      return jsString(vm.invokeByName('toString', '()Ljava/lang/String;', value, []));
    } catch (error) {
      // toString 抛错时退回普通字符串化。
    }
  }
  return jsString(value);
}

export { formatJavaString };

// ---- java.lang.Long 扩展（真实 64 位语义，全部基于 BigInt） ----
Object.assign(JAVA_CORE_CLASSES['Ljava/lang/Long;'].staticMethods, {});
const LONG_STATIC = JAVA_CORE_CLASSES['Ljava/lang/Long;'].staticMethods;
const LONG_METHODS = JAVA_CORE_CLASSES['Ljava/lang/Long;'].methods;
LONG_STATIC.set('toString(JI)Ljava/lang/String;', (_self, [value, radix]) => toLong(value).toString(toInt(radix) || 10));
LONG_STATIC.set('toUnsignedString(JI)Ljava/lang/String;', (_self, [value, radix]) => BigInt.asUintN(64, toLong(value)).toString(toInt(radix) || 10));
LONG_STATIC.set('toUnsignedString(J)Ljava/lang/String;', (_self, [value]) => BigInt.asUintN(64, toLong(value)).toString(10));
LONG_STATIC.set('toHexString(J)Ljava/lang/String;', (_self, [value]) => BigInt.asUintN(64, toLong(value)).toString(16));
LONG_STATIC.set('toOctalString(J)Ljava/lang/String;', (_self, [value]) => BigInt.asUintN(64, toLong(value)).toString(8));
LONG_STATIC.set('toBinaryString(J)Ljava/lang/String;', (_self, [value]) => BigInt.asUintN(64, toLong(value)).toString(2));
LONG_STATIC.set('parseLong(Ljava/lang/String;I)J', (_self, [text, radix], vm) => parseIntegerText(vm, jsString(text), toInt(radix), false, 64));
LONG_STATIC.set('parseUnsignedLong(Ljava/lang/String;I)J', (_self, [text, radix], vm) => parseIntegerText(vm, jsString(text), toInt(radix), true, 64));
LONG_STATIC.set('parseUnsignedLong(Ljava/lang/String;)J', (_self, [text], vm) => parseIntegerText(vm, jsString(text), 10, true, 64));
LONG_STATIC.set('valueOf(Ljava/lang/String;I)Ljava/lang/Long;', (_self, [text, radix], vm) =>
  vm.wrapPeer({ value: parseIntegerText(vm, jsString(text), toInt(radix), false, 64), constructor: { $descriptor: 'Ljava/lang/Long;' } }));
LONG_STATIC.set('valueOf(Ljava/lang/String;)Ljava/lang/Long;', (_self, [text], vm) =>
  vm.wrapPeer({ value: parseIntegerText(vm, jsString(text), 10, false, 64), constructor: { $descriptor: 'Ljava/lang/Long;' } }));
LONG_STATIC.set('decode(Ljava/lang/String;)Ljava/lang/Long;', (_self, [text], vm) => {
  const raw = String(jsString(text) ?? '').trim();
  let radix = 10;
  let digits = raw;
  if (/^[+-]?0[xX]/.test(raw)) {
    radix = 16;
    digits = raw.replace(/^([+-]?)0[xX]/, '$1');
  } else if (/^[+-]?#/.test(raw)) {
    radix = 16;
    digits = raw.replace(/^([+-]?)#/, '$1');
  } else if (/^[+-]?0[0-7]+$/.test(raw)) {
    radix = 8;
    digits = raw.replace(/^([+-]?)0/, '$1');
  }
  const value = parseIntegerText(vm, digits, radix, false, 64);
  return vm.wrapPeer({ value, constructor: { $descriptor: 'Ljava/lang/Long;' } });
});
LONG_STATIC.set('hashCode(J)I', (_self, [value]) => Number(BigInt.asIntN(32, toLong(value) ^ (toLong(value) >> 32n))));
LONG_STATIC.set('compare(JJ)I', (_self, [left, right]) => compareLong(toLong(left), toLong(right)));
LONG_STATIC.set('compareUnsigned(JJ)I', (_self, [left, right]) => compareLong(BigInt.asUintN(64, toLong(left)), BigInt.asUintN(64, toLong(right))));
LONG_STATIC.set('divideUnsigned(JJ)J', (_self, [left, right]) => (toLong(right) === 0n ? 0n : BigInt.asUintN(64, toLong(left)) / BigInt.asUintN(64, toLong(right))));
LONG_STATIC.set('remainderUnsigned(JJ)J', (_self, [left, right]) => (toLong(right) === 0n ? 0n : BigInt.asUintN(64, toLong(left)) % BigInt.asUintN(64, toLong(right))));
LONG_STATIC.set('highestOneBit(J)J', (_self, [value]) => {
  let bits = BigInt.asUintN(64, toLong(value));
  if (bits === 0n) return 0n;
  let shift = 0n;
  while ((bits >> 1n) > 0n) {
    bits >>= 1n;
    shift += 1n;
  }
  return 1n << shift;
});
LONG_STATIC.set('lowestOneBit(J)J', (_self, [value]) => {
  const bits = BigInt.asUintN(64, toLong(value));
  return bits === 0n ? 0n : bits & -bits;
});
LONG_STATIC.set('numberOfLeadingZeros(J)I', (_self, [value]) => {
  const bits = BigInt.asUintN(64, toLong(value));
  if (bits === 0n) return 64;
  return 64 - (bits.toString(2).length);
});
LONG_STATIC.set('numberOfTrailingZeros(J)I', (_self, [value]) => {
  const bits = BigInt.asUintN(64, toLong(value));
  if (bits === 0n) return 64;
  return bits.toString(2).replace(/0+$/, '').length === 64 ? 0 : 64 - bits.toString(2).replace(/0+$/, '').length;
});
LONG_STATIC.set('reverse(J)J', (_self, [value]) => {
  let bits = BigInt.asUintN(64, toLong(value));
  let result = 0n;
  for (let index = 0; index < 64; index++) {
    result = (result << 1n) | (bits & 1n);
    bits >>= 1n;
  }
  return BigInt.asIntN(64, result);
});
LONG_STATIC.set('reverseBytes(J)J', (_self, [value]) => {
  let bits = BigInt.asUintN(64, toLong(value));
  let result = 0n;
  for (let index = 0; index < 8; index++) {
    result = (result << 8n) | (bits & 0xffn);
    bits >>= 8n;
  }
  return BigInt.asIntN(64, result);
});
LONG_STATIC.set('signum(J)I', (_self, [value]) => (toLong(value) === 0n ? 0 : (toLong(value) > 0n ? 1 : -1)));
LONG_STATIC.set('sum(JJ)J', (_self, [left, right]) => BigInt.asIntN(64, toLong(left) + toLong(right)));
LONG_STATIC.set('max(JJ)J', (_self, [left, right]) => (toLong(left) >= toLong(right) ? toLong(left) : toLong(right)));
LONG_STATIC.set('min(JJ)J', (_self, [left, right]) => (toLong(left) <= toLong(right) ? toLong(left) : toLong(right)));
LONG_METHODS.set('byteValue()B', (self) => Number(BigInt.asIntN(8, toLong(self.value))));
LONG_METHODS.set('shortValue()S', (self) => Number(BigInt.asIntN(16, toLong(self.value))));
LONG_METHODS.set('floatValue()F', (self) => Number(toLong(self.value)));
LONG_METHODS.set('doubleValue()D', (self) => Number(toLong(self.value)));
LONG_METHODS.set('compareTo(Ljava/lang/Long;)I', (self, [other]) => {
  const peer = other?.$peer ?? other;
  return compareLong(toLong(self.value), toLong(peer?.value ?? 0));
});

function compareLong(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

function parseIntegerText(vm, text, radix, unsigned, bits) {
  const base = radix === 0 ? 10 : radix;
  if (base < 2 || base > 36) {
    vm?.throwException?.('Ljava/lang/NumberFormatException;', `radix ${radix}`);
    return 0n;
  }
  const raw = String(text ?? '').trim();
  if (!raw.length) {
    vm?.throwException?.('Ljava/lang/NumberFormatException;', 'empty string');
    return 0n;
  }
  let sign = 1n;
  let digits = raw;
  if (digits[0] === '-' || digits[0] === '+') {
    if (digits[0] === '-') sign = -1n;
    digits = digits.slice(1);
  }
  if (!digits.length) {
    vm?.throwException?.('Ljava/lang/NumberFormatException;', raw);
    return 0n;
  }
  let value = 0n;
  const radixBig = BigInt(base);
  for (const ch of digits) {
    const code = ch.codePointAt(0);
    const digit = digitValueOf(code, base);
    if (digit < 0) {
      vm?.throwException?.('Ljava/lang/NumberFormatException;', raw);
      return 0n;
    }
    value = value * radixBig + BigInt(digit);
  }
  value *= sign;
  if (unsigned) return BigInt.asUintN(bits, value);
  return BigInt.asIntN(bits, value);
}

// ---- java.lang.String 扩展 ----
const STRING_METHODS = JAVA_CORE_CLASSES['Ljava/lang/String;'].methods;
const STRING_STATIC = JAVA_CORE_CLASSES['Ljava/lang/String;'].staticMethods;
STRING_METHODS.set('<init>([C)V', (self, [chars]) => {
  self.value = charArrayText(chars, 0, charArrayLength(chars));
});
STRING_METHODS.set('<init>([CII)V', (self, [chars, offset, count]) => {
  const start = toInt(offset);
  self.value = charArrayText(chars, start, start + toInt(count));
});
STRING_METHODS.set('<init>([III)V', (self, [points, offset, count]) => {
  const data = Array.isArray(points?.$data) ? points.$data : [];
  const start = toInt(offset);
  self.value = data.slice(start, start + toInt(count)).map((code) => String.fromCodePoint(toInt(code))).join('');
});
STRING_METHODS.set('<init>([BII)V', (self, [bytes, offset, length]) => {
  self.value = decodeUtf8Bytes({ $data: sliceBytes(bytes, toInt(offset), toInt(length)) });
});
STRING_METHODS.set('<init>([BIII)V', (self, [bytes, high, offset, length]) => {
  self.value = decodeUtf8Bytes({ $data: sliceBytes(bytes, toInt(offset), toInt(length)) });
});
STRING_METHODS.set('<init>([BI)V', (self, [bytes, high]) => {
  self.value = decodeUtf8Bytes({ $data: sliceBytes(bytes, 0, toInt(high)) });
});
STRING_METHODS.set('<init>([BIILjava/lang/String;)V', (self, [bytes, offset, length, charset]) => {
  self.value = decodeUtf8Bytes({ $data: sliceBytes(bytes, toInt(offset), toInt(length)) }, charset);
});
STRING_METHODS.set('<init>([BLjava/nio/charset/Charset;)V', (self, [bytes, charset]) => {
  self.value = decodeUtf8Bytes(bytes, charset);
});
STRING_METHODS.set('<init>([BIILjava/nio/charset/Charset;)V', (self, [bytes, offset, length, charset]) => {
  self.value = decodeUtf8Bytes({ $data: sliceBytes(bytes, toInt(offset), toInt(length)) }, charset);
});
STRING_METHODS.set('<init>(Ljava/lang/StringBuffer;)V', (self, [buffer]) => {
  self.value = jsString(buffer);
});
STRING_METHODS.set('<init>(Ljava/lang/StringBuilder;)V', (self, [builder]) => {
  self.value = jsString(builder);
});
STRING_METHODS.set('codePointAt(I)I', (self, [index]) => codePointAtText(jsString(self), toInt(index)));
STRING_METHODS.set('codePointBefore(I)I', (self, [index]) => codePointBeforeText(jsString(self), toInt(index)));
STRING_METHODS.set('codePointCount(II)I', (self, [begin, end]) => countCodePointsText(jsString(self), toInt(begin), toInt(end)));
STRING_METHODS.set('offsetByCodePoints(II)I', (self, [index, offset]) => offsetByCodePoint(jsString(self), toInt(index), toInt(offset)));
STRING_METHODS.set('getChars(II[CI)V', (self, [start, end, target, targetStart]) => {
  const data = charArrayData(target);
  const text = jsString(self);
  const from = Math.max(0, toInt(start));
  const to = Math.min(text.length, toInt(end));
  let cursor = toInt(targetStart);
  for (let index = from; index < to; index++) data[cursor++] = text.charCodeAt(index);
});
STRING_METHODS.set('getBytes(II[BI)V', (self, [start, end, target, targetStart]) => {
  const data = Array.isArray(target?.$data) ? target.$data : [];
  const bytes = utf8EncodeBytes(jsString(self).slice(toInt(start), toInt(end)));
  let cursor = toInt(targetStart);
  for (const byte of bytes) data[cursor++] = byte;
});
STRING_METHODS.set('getBytes(Ljava/lang/String;)[B', (self, [charset], vm) => vm.newArray('[B', ...bytesArray(jsString(self), charset)));
STRING_METHODS.set('getBytes(Ljava/nio/charset/Charset;)[B', (self, [charset], vm) => vm.newArray('[B', ...bytesArray(jsString(self), charset)));
STRING_METHODS.set('contentEquals(Ljava/lang/StringBuffer;)Z', (self, [buffer]) => (jsString(self) === jsString(buffer) ? 1 : 0));
STRING_METHODS.set('contentEquals(Ljava/lang/CharSequence;)Z', (self, [value]) => (jsString(self) === jsString(value) ? 1 : 0));
STRING_METHODS.set('compareToIgnoreCase(Ljava/lang/String;)I', (self, [other]) => {
  const left = jsString(self).toLowerCase();
  const right = jsString(other).toLowerCase();
  return compareLong(BigInt(left.length), BigInt(right.length)) === 0
    ? (left < right ? -1 : (left > right ? 1 : 0))
    : (left < right ? -1 : 1);
});
STRING_METHODS.set('regionMatches(ILjava/lang/String;II)Z', (self, [offset, other, otherOffset, length]) =>
  regionMatchesText(jsString(self), toInt(offset), jsString(other), toInt(otherOffset), toInt(length), false));
STRING_METHODS.set('regionMatches(ZILjava/lang/String;II)Z', (self, [ignoreCase, offset, other, otherOffset, length]) =>
  regionMatchesText(jsString(self), toInt(offset), jsString(other), toInt(otherOffset), toInt(length), !!ignoreCase));
STRING_METHODS.set('subSequence(II)Ljava/lang/CharSequence;', (self, [start, end]) => jsString(self).slice(toInt(start), toInt(end)));
STRING_STATIC.set('join(Ljava/lang/CharSequence;Ljava/lang/Iterable;)Ljava/lang/String;', (_self, [delimiter, values], vm) =>
  iterableItemList(vm, values).map((item) => jsString(item)).join(jsString(delimiter)));
STRING_STATIC.set('valueOf([C)Ljava/lang/String;', (_self, [chars]) => charArrayText(chars, 0, charArrayLength(chars)));
STRING_STATIC.set('valueOf([CII)Ljava/lang/String;', (_self, [chars, offset, count]) => {
  const start = toInt(offset);
  return charArrayText(chars, start, start + toInt(count));
});
STRING_STATIC.set('copyValueOf([CII)Ljava/lang/String;', (_self, [chars, offset, count]) => {
  const start = toInt(offset);
  return charArrayText(chars, start, start + toInt(count));
});
STRING_STATIC.set('copyValueOf([C)Ljava/lang/String;', (_self, [chars]) => charArrayText(chars, 0, charArrayLength(chars)));

function sliceBytes(bytes, offset, length) {
  const data = Array.isArray(bytes?.$data) ? bytes.$data : [];
  return data.slice(offset, offset + length).map((value) => toInt(value) & 0xff);
}

function utf8EncodeBytes(text) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(String(text ?? '')));
  return Array.from(String(text ?? '')).map((ch) => ch.codePointAt(0) & 0xff);
}

function bytesArray(text, charset) {
  const bytes = utf8EncodeBytes(text);
  return [bytes, bytes.length];
}

function regionMatchesText(source, offset, other, otherOffset, length, ignoreCase) {
  if (offset < 0 || otherOffset < 0 || length < 0) return 0;
  if (offset + length > source.length || otherOffset + length > other.length) return 0;
  const left = source.slice(offset, offset + length);
  const right = other.slice(otherOffset, otherOffset + length);
  return (ignoreCase ? left.toLowerCase() === right.toLowerCase() : left === right) ? 1 : 0;
}

function iterableItemList(vm, iterable) {
  const direct = arrayData(iterable);
  if (direct) return direct;
  if (!iterable) return [];
  try {
    const iterator = vm.invokeByName('iterator', '()Ljava/util/Iterator;', iterable, []);
    const items = [];
    let guard = 0;
    while (guard++ < 1000000 && Number(vm.invokeByName('hasNext', '()Z', iterator, [])) === 1) {
      items.push(vm.invokeByName('next', 'Ljava/lang/Object;', iterator, []));
    }
    return items;
  } catch (_error) {
    return [];
  }
}

// ---- java.math.BigDecimal 真实运算（返回新对象，保留标度） ----
const BIGDECIMAL_METHODS = JAVA_CORE_CLASSES['Ljava/math/BigDecimal;'].methods;
const BIGDECIMAL_STATIC = JAVA_CORE_CLASSES['Ljava/math/BigDecimal;'].staticMethods;
function bigDecimalPeer(self) {
  return self?.$peer ?? self ?? {};
}
function bigDecimalNumber(self) {
  return Number(bigDecimalPeer(self).value) || 0;
}
function bigDecimalScale(self) {
  return Math.max(0, Number(bigDecimalPeer(self).scale) | 0);
}
function makeBigDecimal(vm, value, scale = 0) {
  const object = vm.allocateRawObject('Ljava/math/BigDecimal;');
  object.$peer = { value: Number(value) || 0, scale: Math.max(0, Number(scale) | 0) };
  return object;
}
function scaleOfText(text) {
  const dot = String(text).indexOf('.');
  return dot < 0 ? 0 : String(text).length - dot - 1;
}
function decimalPrecision(value, scale) {
  const text = Math.abs(Number(value)).toFixed(Math.max(0, scale));
  const digits = text.replace(/[^0-9]/g, '').replace(/^0+/, '');
  return Math.max(1, digits.length);
}
function mathContextPrecision(context) {
  const peer = context?.$peer ?? context;
  return Math.max(0, Number(peer?.precision) | 0);
}
function roundToPrecision(value, precision) {
  if (!precision || !Number.isFinite(value)) return Number(value) || 0;
  return Number(Number(value).toPrecision(Math.min(21, precision)));
}
BIGDECIMAL_METHODS.set('<init>([C)V', (self, [chars]) => {
  const text = charArrayText(chars, 0, charArrayLength(chars));
  self.value = Number(text) || 0;
  self.scale = scaleOfText(text);
});
BIGDECIMAL_METHODS.set('<init>([CII)V', (self, [chars, offset, count]) => {
  const start = toInt(offset);
  const text = charArrayText(chars, start, start + toInt(count));
  self.value = Number(text) || 0;
  self.scale = scaleOfText(text);
});
BIGDECIMAL_METHODS.set('<init>([CLjava/math/MathContext;)V', (self, [chars, context]) => {
  const text = charArrayText(chars, 0, charArrayLength(chars));
  self.value = roundToPrecision(Number(text) || 0, mathContextPrecision(context));
  self.scale = scaleOfText(text);
});
BIGDECIMAL_METHODS.set('<init>([CIILjava/math/MathContext;)V', (self, [chars, offset, count, context]) => {
  const start = toInt(offset);
  const text = charArrayText(chars, start, start + toInt(count));
  self.value = roundToPrecision(Number(text) || 0, mathContextPrecision(context));
  self.scale = scaleOfText(text);
});
BIGDECIMAL_METHODS.set('<init>(Ljava/lang/String;Ljava/math/MathContext;)V', (self, [text, context]) => {
  const raw = jsString(text);
  self.value = roundToPrecision(Number(raw) || 0, mathContextPrecision(context));
  self.scale = scaleOfText(raw);
});
BIGDECIMAL_METHODS.set('<init>(DLjava/math/MathContext;)V', (self, [value, context]) => {
  self.value = roundToPrecision(Number(value) || 0, mathContextPrecision(context));
  self.scale = 0;
});
BIGDECIMAL_METHODS.set('<init>(ILjava/math/MathContext;)V', (self, [value, context]) => {
  self.value = roundToPrecision(toInt(value), mathContextPrecision(context));
  self.scale = 0;
});
BIGDECIMAL_METHODS.set('<init>(JLjava/math/MathContext;)V', (self, [value, context]) => {
  self.value = roundToPrecision(Number(toLong(value)), mathContextPrecision(context));
  self.scale = 0;
});
BIGDECIMAL_METHODS.set('<init>(Ljava/math/BigInteger;Ljava/math/MathContext;)V', (self, [value, context]) => {
  self.value = roundToPrecision(Number(bigIntegerValue(value)), mathContextPrecision(context));
  self.scale = 0;
});
BIGDECIMAL_METHODS.set('<init>(Ljava/math/BigInteger;I)V', (self, [value, scale]) => {
  self.value = Number(bigIntegerValue(value)) / Math.pow(10, toInt(scale));
  self.scale = Math.max(0, toInt(scale));
});
BIGDECIMAL_METHODS.set('<init>(Ljava/math/BigInteger;ILjava/math/MathContext;)V', (self, [value, scale, context]) => {
  self.value = roundToPrecision(Number(bigIntegerValue(value)) / Math.pow(10, toInt(scale)), mathContextPrecision(context));
  self.scale = Math.max(0, toInt(scale));
});
BIGDECIMAL_METHODS.set('<init>(Ljava/lang/String;)V', (self, [text]) => {
  const raw = jsString(text);
  self.value = Number(raw) || 0;
  self.scale = scaleOfText(raw);
});
BIGDECIMAL_STATIC.set('valueOf(J)Ljava/math/BigDecimal;', (_self, [value], vm) => makeBigDecimal(vm, Number(toLong(value)), 0));
BIGDECIMAL_STATIC.set('valueOf(JI)Ljava/math/BigDecimal;', (_self, [value, scale], vm) =>
  makeBigDecimal(vm, Number(toLong(value)) / Math.pow(10, toInt(scale)), toInt(scale)));
BIGDECIMAL_STATIC.set('valueOf(D)Ljava/math/BigDecimal;', (_self, [value], vm) => {
  const text = String(Number(value));
  return makeBigDecimal(vm, Number(value), scaleOfText(text));
});
BIGDECIMAL_METHODS.set('add(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;', (self, [other], vm) =>
  makeBigDecimal(vm, bigDecimalNumber(self) + bigDecimalNumber(other), Math.max(bigDecimalScale(self), bigDecimalScale(other))));
BIGDECIMAL_METHODS.set('add(Ljava/math/BigDecimal;Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [other, context], vm) =>
  makeBigDecimal(vm, roundToPrecision(bigDecimalNumber(self) + bigDecimalNumber(other), mathContextPrecision(context)), Math.max(bigDecimalScale(self), bigDecimalScale(other))));
BIGDECIMAL_METHODS.set('subtract(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;', (self, [other], vm) =>
  makeBigDecimal(vm, bigDecimalNumber(self) - bigDecimalNumber(other), Math.max(bigDecimalScale(self), bigDecimalScale(other))));
BIGDECIMAL_METHODS.set('subtract(Ljava/math/BigDecimal;Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [other, context], vm) =>
  makeBigDecimal(vm, roundToPrecision(bigDecimalNumber(self) - bigDecimalNumber(other), mathContextPrecision(context)), Math.max(bigDecimalScale(self), bigDecimalScale(other))));
BIGDECIMAL_METHODS.set('multiply(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;', (self, [other], vm) =>
  makeBigDecimal(vm, bigDecimalNumber(self) * bigDecimalNumber(other), bigDecimalScale(self) + bigDecimalScale(other)));
BIGDECIMAL_METHODS.set('multiply(Ljava/math/BigDecimal;Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [other, context], vm) =>
  makeBigDecimal(vm, roundToPrecision(bigDecimalNumber(self) * bigDecimalNumber(other), mathContextPrecision(context)), bigDecimalScale(self) + bigDecimalScale(other)));
BIGDECIMAL_METHODS.set('divide(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;', (self, [other], vm) => {
  const divisor = bigDecimalNumber(other);
  return makeBigDecimal(vm, divisor === 0 ? 0 : bigDecimalNumber(self) / divisor, Math.max(10, bigDecimalScale(self)));
});
BIGDECIMAL_METHODS.set('divide(Ljava/math/BigDecimal;I)Ljava/math/BigDecimal;', (self, [other, scale], vm) => {
  const divisor = bigDecimalNumber(other);
  return makeBigDecimal(vm, divisor === 0 ? 0 : Number((bigDecimalNumber(self) / divisor).toFixed(Math.max(0, toInt(scale)))), toInt(scale));
});
BIGDECIMAL_METHODS.set('divide(Ljava/math/BigDecimal;II)Ljava/math/BigDecimal;', (self, [other, scale, mode], vm) => {
  const divisor = bigDecimalNumber(other);
  return makeBigDecimal(vm, divisor === 0 ? 0 : roundValue(bigDecimalNumber(self) / divisor, toInt(scale), toInt(mode)), toInt(scale));
});
BIGDECIMAL_METHODS.set('divide(Ljava/math/BigDecimal;ILjava/math/RoundingMode;)Ljava/math/BigDecimal;', (self, [other, scale, mode], vm) => {
  const divisor = bigDecimalNumber(other);
  const modeValue = Number(mode?.$peer?.ordinal ?? mode?.ordinal ?? 6);
  return makeBigDecimal(vm, divisor === 0 ? 0 : roundValue(bigDecimalNumber(self) / divisor, toInt(scale), modeValue), toInt(scale));
});
BIGDECIMAL_METHODS.set('divide(Ljava/math/BigDecimal;Ljava/math/RoundingMode;)Ljava/math/BigDecimal;', (self, [other, mode], vm) => {
  const divisor = bigDecimalNumber(other);
  const modeValue = Number(mode?.$peer?.ordinal ?? mode?.ordinal ?? 6);
  return makeBigDecimal(vm, divisor === 0 ? 0 : roundValue(bigDecimalNumber(self) / divisor, 10, modeValue), 10);
});
BIGDECIMAL_METHODS.set('divide(Ljava/math/BigDecimal;Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [other, context], vm) => {
  const divisor = bigDecimalNumber(other);
  return makeBigDecimal(vm, divisor === 0 ? 0 : roundToPrecision(bigDecimalNumber(self) / divisor, mathContextPrecision(context)), Math.max(0, mathContextPrecision(context)));
});
BIGDECIMAL_METHODS.set('divideToIntegralValue(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;', (self, [other], vm) => {
  const divisor = bigDecimalNumber(other);
  return makeBigDecimal(vm, divisor === 0 ? 0 : Math.trunc(bigDecimalNumber(self) / divisor), 0);
});
BIGDECIMAL_METHODS.set('divideToIntegralValue(Ljava/math/BigDecimal;Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [other, context], vm) => {
  const divisor = bigDecimalNumber(other);
  return makeBigDecimal(vm, divisor === 0 ? 0 : roundToPrecision(Math.trunc(bigDecimalNumber(self) / divisor), mathContextPrecision(context)), 0);
});
BIGDECIMAL_METHODS.set('remainder(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;', (self, [other], vm) => {
  const divisor = bigDecimalNumber(other);
  return makeBigDecimal(vm, divisor === 0 ? 0 : bigDecimalNumber(self) % divisor, Math.max(bigDecimalScale(self), bigDecimalScale(other)));
});
BIGDECIMAL_METHODS.set('remainder(Ljava/math/BigDecimal;Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [other, context], vm) => {
  const divisor = bigDecimalNumber(other);
  return makeBigDecimal(vm, divisor === 0 ? 0 : roundToPrecision(bigDecimalNumber(self) % divisor, mathContextPrecision(context)), Math.max(bigDecimalScale(self), bigDecimalScale(other)));
});
BIGDECIMAL_METHODS.set('divideAndRemainder(Ljava/math/BigDecimal;)[Ljava/math/BigDecimal;', (self, [other], vm) => {
  const divisor = bigDecimalNumber(other);
  const quotient = divisor === 0 ? 0 : Math.trunc(bigDecimalNumber(self) / divisor);
  const remainder = divisor === 0 ? 0 : bigDecimalNumber(self) % divisor;
  return vm.newArray('[Ljava/math/BigDecimal;', [makeBigDecimal(vm, quotient, 0), makeBigDecimal(vm, remainder, Math.max(bigDecimalScale(self), bigDecimalScale(other)))]);
});
BIGDECIMAL_METHODS.set('divideAndRemainder(Ljava/math/BigDecimal;Ljava/math/MathContext;)[Ljava/math/BigDecimal;', (self, [other, context], vm) => {
  const divisor = bigDecimalNumber(other);
  const precision = mathContextPrecision(context);
  const quotient = divisor === 0 ? 0 : roundToPrecision(Math.trunc(bigDecimalNumber(self) / divisor), precision);
  const remainder = divisor === 0 ? 0 : roundToPrecision(bigDecimalNumber(self) % divisor, precision);
  return vm.newArray('[Ljava/math/BigDecimal;', [makeBigDecimal(vm, quotient, 0), makeBigDecimal(vm, remainder, Math.max(bigDecimalScale(self), bigDecimalScale(other)))]);
});
BIGDECIMAL_METHODS.set('pow(I)Ljava/math/BigDecimal;', (self, [exponent], vm) =>
  makeBigDecimal(vm, Math.pow(bigDecimalNumber(self), toInt(exponent)), bigDecimalScale(self) * Math.max(0, toInt(exponent))));
BIGDECIMAL_METHODS.set('pow(ILjava/math/MathContext;)Ljava/math/BigDecimal;', (self, [exponent, context], vm) =>
  makeBigDecimal(vm, roundToPrecision(Math.pow(bigDecimalNumber(self), toInt(exponent)), mathContextPrecision(context)), bigDecimalScale(self) * Math.max(0, toInt(exponent))));
BIGDECIMAL_METHODS.set('abs()Ljava/math/BigDecimal;', (self, _args, vm) => makeBigDecimal(vm, Math.abs(bigDecimalNumber(self)), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('abs(Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [context], vm) =>
  makeBigDecimal(vm, roundToPrecision(Math.abs(bigDecimalNumber(self)), mathContextPrecision(context)), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('negate()Ljava/math/BigDecimal;', (self, _args, vm) => makeBigDecimal(vm, -bigDecimalNumber(self), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('negate(Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [context], vm) =>
  makeBigDecimal(vm, roundToPrecision(-bigDecimalNumber(self), mathContextPrecision(context)), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('plus()Ljava/math/BigDecimal;', (self, _args, vm) => makeBigDecimal(vm, bigDecimalNumber(self), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('plus(Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [context], vm) =>
  makeBigDecimal(vm, roundToPrecision(bigDecimalNumber(self), mathContextPrecision(context)), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('signum()I', (self) => Math.sign(bigDecimalNumber(self)) | 0);
BIGDECIMAL_METHODS.set('scale()I', (self) => bigDecimalScale(self));
BIGDECIMAL_METHODS.set('precision()I', (self) => decimalPrecision(bigDecimalNumber(self), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('unscaledValue()Ljava/math/BigInteger;', (self, _args, vm) => {
  const object = vm.allocateRawObject('Ljava/math/BigInteger;');
  object.$peer = { value: BigInt(Math.round(bigDecimalNumber(self) * Math.pow(10, bigDecimalScale(self)))) };
  return object;
});
BIGDECIMAL_METHODS.set('round(Ljava/math/MathContext;)Ljava/math/BigDecimal;', (self, [context], vm) =>
  makeBigDecimal(vm, roundToPrecision(bigDecimalNumber(self), mathContextPrecision(context)), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('setScale(I)Ljava/math/BigDecimal;', (self, [scale], vm) =>
  makeBigDecimal(vm, Number(bigDecimalNumber(self).toFixed(Math.max(0, toInt(scale)))), toInt(scale)));
BIGDECIMAL_METHODS.set('setScale(ILjava/math/RoundingMode;)Ljava/math/BigDecimal;', (self, [scale, mode], vm) =>
  makeBigDecimal(vm, roundValue(bigDecimalNumber(self), toInt(scale), Number(mode?.$peer?.ordinal ?? mode?.ordinal ?? 6)), toInt(scale)));
BIGDECIMAL_METHODS.set('setScale(II)Ljava/math/BigDecimal;', (self, [scale, mode], vm) =>
  makeBigDecimal(vm, roundValue(bigDecimalNumber(self), toInt(scale), toInt(mode)), toInt(scale)));
BIGDECIMAL_METHODS.set('setScale(ILjava/math/RoundingMode;Z)Ljava/math/BigDecimal;', (self, [scale, mode], vm) =>
  makeBigDecimal(vm, roundValue(bigDecimalNumber(self), toInt(scale), Number(mode?.$peer?.ordinal ?? mode?.ordinal ?? 6)), toInt(scale)));
BIGDECIMAL_METHODS.set('movePointLeft(I)Ljava/math/BigDecimal;', (self, [digits], vm) =>
  makeBigDecimal(vm, bigDecimalNumber(self) / Math.pow(10, toInt(digits)), bigDecimalScale(self) + toInt(digits)));
BIGDECIMAL_METHODS.set('movePointRight(I)Ljava/math/BigDecimal;', (self, [digits], vm) =>
  makeBigDecimal(vm, bigDecimalNumber(self) * Math.pow(10, toInt(digits)), Math.max(0, bigDecimalScale(self) - toInt(digits))));
BIGDECIMAL_METHODS.set('scaleByPowerOfTen(I)Ljava/math/BigDecimal;', (self, [digits], vm) =>
  makeBigDecimal(vm, bigDecimalNumber(self) * Math.pow(10, toInt(digits)), Math.max(0, bigDecimalScale(self) - toInt(digits))));
BIGDECIMAL_METHODS.set('stripTrailingZeros()Ljava/math/BigDecimal;', (self, _args, vm) => {
  let value = bigDecimalNumber(self);
  let scale = bigDecimalScale(self);
  while (scale > 0 && Math.abs(value * Math.pow(10, scale)) % 10 === 0) {
    value /= 10;
    scale -= 1;
  }
  return makeBigDecimal(vm, value, scale);
});
BIGDECIMAL_METHODS.set('min(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;', (self, [other], vm) =>
  makeBigDecimal(vm, Math.min(bigDecimalNumber(self), bigDecimalNumber(other)), Math.max(bigDecimalScale(self), bigDecimalScale(other))));
BIGDECIMAL_METHODS.set('max(Ljava/math/BigDecimal;)Ljava/math/BigDecimal;', (self, [other], vm) =>
  makeBigDecimal(vm, Math.max(bigDecimalNumber(self), bigDecimalNumber(other)), Math.max(bigDecimalScale(self), bigDecimalScale(other))));
BIGDECIMAL_METHODS.set('toEngineeringString()Ljava/lang/String;', (self) => formatBigDecimalText(bigDecimalNumber(self), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('toString()Ljava/lang/String;', (self) => formatBigDecimalText(bigDecimalNumber(self), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('toPlainString()Ljava/lang/String;', (self) => formatBigDecimalText(bigDecimalNumber(self), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('toBigInteger()Ljava/math/BigInteger;', (self, _args, vm) => {
  const object = vm.allocateRawObject('Ljava/math/BigInteger;');
  object.$peer = { value: BigInt(Math.trunc(bigDecimalNumber(self))) };
  return object;
});
BIGDECIMAL_METHODS.set('toBigIntegerExact()Ljava/math/BigInteger;', (self, _args, vm) => {
  const object = vm.allocateRawObject('Ljava/math/BigInteger;');
  object.$peer = { value: BigInt(Math.trunc(bigDecimalNumber(self))) };
  return object;
});
BIGDECIMAL_METHODS.set('shortValueExact()S', (self) => Number(BigInt.asIntN(16, BigInt(Math.trunc(bigDecimalNumber(self))))));
BIGDECIMAL_METHODS.set('byteValueExact()B', (self) => Number(BigInt.asIntN(8, BigInt(Math.trunc(bigDecimalNumber(self))))));
BIGDECIMAL_METHODS.set('ulp()Ljava/math/BigDecimal;', (self, _args, vm) => makeBigDecimal(vm, Math.pow(10, -bigDecimalScale(self)), bigDecimalScale(self)));
BIGDECIMAL_METHODS.set('compareTo(Ljava/math/BigDecimal;)I', (self, [other]) => {
  const left = bigDecimalNumber(self);
  const right = bigDecimalNumber(other);
  return left < right ? -1 : (left > right ? 1 : 0);
});
BIGDECIMAL_METHODS.set('equals(Ljava/lang/Object;)Z', (self, [other]) => {
  const peer = other?.$peer ?? other;
  if (!peer || peer.value === undefined) return 0;
  return (bigDecimalNumber(self) === Number(peer.value) && bigDecimalScale(self) === Math.max(0, Number(peer.scale) | 0)) ? 1 : 0;
});
BIGDECIMAL_METHODS.set('hashCode()I', (self) => {
  const unscaled = BigInt(Math.round(bigDecimalNumber(self) * Math.pow(10, bigDecimalScale(self))));
  return Number(BigInt.asIntN(32, unscaled ^ BigInt(bigDecimalScale(self)))) | 0;
});

function bigIntegerValue(value) {
  const peer = value?.$peer ?? value;
  return peer?.value ?? 0n;
}

function formatBigDecimalText(value, scale) {
  if (!Number.isFinite(value)) return String(value);
  return Number(value).toFixed(Math.max(0, scale));
}

function roundValue(value, scale, mode) {
  const factor = Math.pow(10, Math.max(0, scale));
  const scaled = value * factor;
  let rounded;
  switch (mode) {
    case 0: rounded = Math.ceil(scaled); break;
    case 1: rounded = Math.floor(scaled); break;
    case 2: rounded = Math.abs(scaled % 1) >= 0.5 ? scaled + Math.sign(scaled) : Math.trunc(scaled); break;
    case 3: rounded = Math.trunc(scaled); break;
    case 4: rounded = Math.round(scaled); break;
    case 7: rounded = scaled < 0 ? Math.floor(scaled) : Math.ceil(scaled); break;
    default: rounded = roundHalfEven(scaled); break;
  }
  return rounded / factor;
}

// ---- java.util.Locale 扩展 ----
const LOCALE_METHODS = JAVA_CORE_CLASSES['Ljava/util/Locale;'].methods;
const LOCALE_STATIC = JAVA_CORE_CLASSES['Ljava/util/Locale;'].staticMethods;
LOCALE_METHODS.set('<init>(Ljava/lang/String;)V', (self, [language]) => {
  self.language = String(jsString(language) || '').toLowerCase();
  self.country = '';
  self.variant = '';
});
LOCALE_METHODS.set('<init>(Ljava/lang/String;Ljava/lang/String;)V', (self, [language, country]) => {
  self.language = String(jsString(language) || '').toLowerCase();
  self.country = String(jsString(country) || '').toUpperCase();
  self.variant = '';
});
LOCALE_METHODS.set('<init>(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V', (self, [language, country, variant]) => {
  self.language = String(jsString(language) || '').toLowerCase();
  self.country = String(jsString(country) || '').toUpperCase();
  self.variant = String(jsString(variant) || '');
});
LOCALE_METHODS.set('getScript()Ljava/lang/String;', (self) => self.script || '');
LOCALE_METHODS.set('getVariant()Ljava/lang/String;', (self) => self.variant || '');
LOCALE_METHODS.set('hasExtensions()Z', (self) => (self.extensions && Object.keys(self.extensions).length ? 1 : 0));
LOCALE_METHODS.set('stripExtensions()Ljava/util/Locale;', (self, _args, vm) => {
  const object = vm.allocateRawObject('Ljava/util/Locale;');
  object.$peer = { language: self.language || 'en', country: self.country || '', variant: self.variant || '' };
  return object;
});
LOCALE_METHODS.set('getExtension(C)Ljava/lang/String;', (self, [key]) => self.extensions?.[String.fromCharCode(toInt(key))] ?? null);
LOCALE_METHODS.set('getExtensionKeys()Ljava/util/Set;', (self, _args, vm) => makeSet(vm, Object.keys(self.extensions || {})));
LOCALE_METHODS.set('getUnicodeLocaleAttributes()Ljava/util/Set;', (self, _args, vm) => makeSet(vm, self.unicodeAttributes || []));
LOCALE_METHODS.set('getUnicodeLocaleType(Ljava/lang/String;)Ljava/lang/String;', (self, [key]) => self.unicodeTypes?.[jsString(key)] ?? null);
LOCALE_METHODS.set('getUnicodeLocaleKeys()Ljava/util/Set;', (self, _args, vm) => makeSet(vm, Object.keys(self.unicodeTypes || {})));
LOCALE_METHODS.set('toLanguageTag()Ljava/lang/String;', (self) => localeTag(self));
LOCALE_METHODS.set('getISO3Language()Ljava/lang/String;', (self) => ISO3_LANGUAGES[self.language] || '');
LOCALE_METHODS.set('getISO3Country()Ljava/lang/String;', (self) => ISO3_COUNTRIES[self.country] || '');
LOCALE_METHODS.set('getDisplayLanguage()Ljava/lang/String;', (self) => displayNameOf(self.language, 'language', self.language || 'en'));
LOCALE_METHODS.set('getDisplayLanguage(Ljava/util/Locale;)Ljava/lang/String;', (self, [display]) => displayNameOf(self.language, 'language', localePeer(display).language || 'en'));
LOCALE_METHODS.set('getDisplayScript()Ljava/lang/String;', (self) => self.script || '');
LOCALE_METHODS.set('getDisplayScript(Ljava/util/Locale;)Ljava/lang/String;', (self) => self.script || '');
LOCALE_METHODS.set('getDisplayCountry()Ljava/lang/String;', (self) => displayNameOf(self.country, 'region', self.language || 'en'));
LOCALE_METHODS.set('getDisplayCountry(Ljava/util/Locale;)Ljava/lang/String;', (self, [display]) => displayNameOf(self.country, 'region', localePeer(display).language || 'en'));
LOCALE_METHODS.set('getDisplayVariant()Ljava/lang/String;', (self) => self.variant || '');
LOCALE_METHODS.set('getDisplayVariant(Ljava/util/Locale;)Ljava/lang/String;', (self) => self.variant || '');
LOCALE_METHODS.set('getDisplayName()Ljava/lang/String;', (self) => localeDisplayName(self, self.language || 'en'));
LOCALE_METHODS.set('getDisplayName(Ljava/util/Locale;)Ljava/lang/String;', (self, [display]) => localeDisplayName(self, localePeer(display).language || 'en'));
LOCALE_METHODS.set('getLanguage()Ljava/lang/String;', (self) => self.language || '');
LOCALE_METHODS.set('getCountry()Ljava/lang/String;', (self) => self.country || '');
LOCALE_METHODS.set('toString()Ljava/lang/String;', (self) => localeTag(self));
LOCALE_METHODS.set('equals(Ljava/lang/Object;)Z', (self, [other]) => (localeTag(self) === localeTag(other) ? 1 : 0));
LOCALE_METHODS.set('hashCode()I', (self) => hashCode(localeTag(self)));
LOCALE_STATIC.set('getDefault(Ljava/util/Locale$Category;)Ljava/util/Locale;', (_self, _args, vm) => getDefaultLocale(vm));
LOCALE_STATIC.set('setDefault(Ljava/util/Locale;)V', (_self, [locale], vm) => {
  vm.defaultLocale = locale;
  return undefined;
});
LOCALE_STATIC.set('setDefault(Ljava/util/Locale$Category;Ljava/util/Locale;)V', (_self, [_category, locale], vm) => {
  vm.defaultLocale = locale;
  return undefined;
});
LOCALE_STATIC.set('getAvailableLocales()[Ljava/util/Locale;', (_self, _args, vm) => {
  const tags = typeof Intl !== 'undefined' && Intl.supportedValuesOf ? Intl.supportedValuesOf('language') : ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'ar', 'pt'];
  return vm.newArray('[Ljava/util/Locale;', tags.length, tags.map((tag) => localeObject(vm, tag)));
});
LOCALE_STATIC.set('getISOCountries()[Ljava/lang/String;', (_self, _args, vm) => vm.newArray('[Ljava/lang/String;', ISO_COUNTRY_CODES.length, ISO_COUNTRY_CODES.slice()));
LOCALE_STATIC.set('getISOLanguages()[Ljava/lang/String;', (_self, _args, vm) => vm.newArray('[Ljava/lang/String;', ISO_LANGUAGE_CODES.length, ISO_LANGUAGE_CODES.slice()));
LOCALE_STATIC.set('filter(Ljava/util/List;Ljava/util/Collection;)Ljava/util/List;', (_self, [tags, priorities], vm) =>
  localeFilterList(vm, tags, priorities, false));
LOCALE_STATIC.set('filter(Ljava/util/List;Ljava/util/Collection;Ljava/util/Locale$FilteringMode;)Ljava/util/List;', (_self, [tags, priorities, mode], vm) =>
  localeFilterList(vm, tags, priorities, Number(mode?.$peer?.ordinal ?? mode?.ordinal ?? 1) === 1));
LOCALE_STATIC.set('filterTags(Ljava/util/List;Ljava/util/Collection;)Ljava/util/List;', (_self, [tags, priorities], vm) =>
  localeFilterList(vm, tags, priorities, false));
LOCALE_STATIC.set('filterTags(Ljava/util/List;Ljava/util/Collection;Ljava/util/Locale$FilteringMode;)Ljava/util/List;', (_self, [tags, priorities, mode], vm) =>
  localeFilterList(vm, tags, priorities, Number(mode?.$peer?.ordinal ?? mode?.ordinal ?? 1) === 1));
LOCALE_STATIC.set('lookup(Ljava/util/List;Ljava/util/Collection;)Ljava/util/Locale;', (_self, [tags, priorities], vm) =>
  localeLookup(vm, tags, priorities, false));
LOCALE_STATIC.set('lookupTag(Ljava/util/List;Ljava/util/Collection;)Ljava/lang/String;', (_self, [tags, priorities], vm) =>
  localeLookup(vm, tags, priorities, true));

function localePeer(self) {
  const peer = self?.$peer ?? self ?? {};
  return {
    language: peer.language ?? '',
    country: peer.country ?? '',
    variant: peer.variant ?? '',
    script: peer.script ?? '',
    extensions: peer.extensions ?? null,
    unicodeAttributes: peer.unicodeAttributes ?? null,
    unicodeTypes: peer.unicodeTypes ?? null,
  };
}

function localeObject(vm, tag) {
  const raw = String(tag ?? '').replace(/_/g, '-');
  const parts = raw.split('-');
  const object = vm.allocateRawObject('Ljava/util/Locale;');
  object.$peer = {
    language: (parts[0] || 'en').toLowerCase(),
    country: (parts[1] || '').toUpperCase(),
    variant: parts.slice(2).join('_'),
  };
  return object;
}

function localeTag(self) {
  const peer = localePeer(self);
  let tag = peer.language || 'en';
  if (peer.script) tag += `-${peer.script}`;
  if (peer.country) tag += `-${peer.country}`;
  if (peer.variant) tag += `-${peer.variant}`;
  return tag;
}

function displayNameOf(code, type, displayLanguage) {
  if (!code) return '';
  try {
    if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
      const names = new Intl.DisplayNames([displayLanguage || 'en'], { type });
      const label = names.of(code);
      if (label && label !== code) return label;
    }
  } catch (_error) {
    // 浏览器不支持该语言标签时退回原始代码，等价于 Java 的 fallback 行为。
  }
  return code;
}

function localeDisplayName(self, displayLanguage) {
  const peer = localePeer(self);
  let name = displayNameOf(peer.language, 'language', displayLanguage);
  if (peer.country) name += ` (${displayNameOf(peer.country, 'region', displayLanguage)})`;
  if (peer.variant) name += `, ${peer.variant}`;
  return name;
}

function localeFilterList(vm, tags, priorities, matchAll) {
  const candidates = arrayValues(tags).map((tag) => String(jsString(tag)).replace(/_/g, '-').toLowerCase());
  const preferred = arrayValues(priorities).map((tag) => String(jsString(tag)).replace(/_/g, '-').toLowerCase());
  const result = [];
  for (const preferredTag of preferred) {
    for (const candidate of candidates) {
      const matches = matchAll ? candidate.split('-')[0] === preferredTag.split('-')[0] : true;
      if (matches && !result.includes(candidate)) result.push(candidate);
    }
  }
  return makeList(vm, result);
}

function localeLookup(vm, tags, priorities, asString) {
  const candidates = arrayValues(tags).map((tag) => String(jsString(tag)).replace(/_/g, '-'));
  const preferred = arrayValues(priorities).map((tag) => String(jsString(tag)).replace(/_/g, '-'));
  for (const want of preferred) {
    const lowered = want.toLowerCase();
    const scored = candidates
      .map((candidate) => ({ candidate, score: localeMatchScore(candidate.toLowerCase(), lowered) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length) return asString ? scored[0].candidate : localeObject(vm, scored[0].candidate);
  }
  return asString ? '' : localeObject(vm, 'en');
}

function localeMatchScore(candidate, wanted) {
  if (candidate === wanted) return 3;
  if (candidate.startsWith(`${wanted}-`) || wanted.startsWith(`${candidate}-`)) return 2;
  if (candidate.split('-')[0] === wanted.split('-')[0]) return 1;
  return 0;
}

const ISO3_LANGUAGES = {
  en: 'eng', zh: 'zho', ja: 'jpn', ko: 'kor', fr: 'fra', de: 'deu', es: 'spa', ru: 'rus',
  ar: 'ara', pt: 'por', it: 'ita', nl: 'nld', pl: 'pol', tr: 'tur', th: 'tha', vi: 'vie',
  id: 'ind', hi: 'hin', he: 'heb', el: 'ell', sv: 'swe', da: 'dan', fi: 'fin', no: 'nor',
  cs: 'ces', hu: 'hun', uk: 'ukr', ro: 'ron', ms: 'msa', tl: 'tgl',
};

const ISO3_COUNTRIES = {
  US: 'USA', CN: 'CHN', JP: 'JPN', KR: 'KOR', GB: 'GBR', DE: 'DEU', FR: 'FRA', IT: 'ITA',
  ES: 'ESP', RU: 'RUS', CA: 'CAN', AU: 'AUS', IN: 'IND', BR: 'BRA', MX: 'MEX', NL: 'NLD',
  SE: 'SWE', CH: 'CHE', SG: 'SGP', HK: 'HKG', TW: 'TWN', TH: 'THA', VN: 'VNM', ID: 'IDN',
  MY: 'MYS', PH: 'PHL', TR: 'TUR', PL: 'POL', UA: 'UKR', SA: 'SAU', AE: 'ARE', IL: 'ISR',
};

const ISO_COUNTRY_CODES = 'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');

const ISO_LANGUAGE_CODES = 'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(' ');

// ---- java.lang.Thread 扩展 ----
const THREAD_METHODS = JAVA_CORE_CLASSES['Ljava/lang/Thread;'].methods;
const THREAD_STATIC = JAVA_CORE_CLASSES['Ljava/lang/Thread;'].staticMethods;
for (const [key, runnableIndex, nameIndex] of [
  ['<init>(Ljava/lang/ThreadGroup;Ljava/lang/Runnable;)V', 1, -1],
  ['<init>(Ljava/lang/ThreadGroup;Ljava/lang/String;)V', -1, 1],
  ['<init>(Ljava/lang/ThreadGroup;Ljava/lang/Runnable;Ljava/lang/String;)V', 1, 2],
  ['<init>(Ljava/lang/ThreadGroup;Ljava/lang/Runnable;Ljava/lang/String;J)V', 1, 2],
]) {
  THREAD_METHODS.set(key, (self, args) => {
    self.threadGroup = args[0] ?? null;
    if (runnableIndex >= 0) self.runnable = args[runnableIndex] ?? null;
    if (nameIndex >= 0) self.threadName = jsString(args[nameIndex]);
    if (args.length > 3) self.stackSize = toLong(args[3]);
  });
}
THREAD_STATIC.set('yield()V', () => undefined);
THREAD_STATIC.set('sleep(J)V', (_self, [duration], vm) => performThreadSleep(vm, Number(toLong(duration))));
THREAD_STATIC.set('sleep(JI)V', (_self, [duration], vm) => performThreadSleep(vm, Number(toLong(duration))));
THREAD_STATIC.set('interrupted()Z', (_self, _args, vm) => {
  const current = vm.currentThreadObject?.();
  const peer = current?.$peer ?? current;
  if (!peer) return 0;
  const flag = peer.interrupted === true;
  peer.interrupted = false;
  return flag ? 1 : 0;
});
THREAD_STATIC.set('activeCount()I', () => 1);
THREAD_STATIC.set('enumerate([Ljava/lang/Thread;)I', (_self, [target], vm) => {
  const data = Array.isArray(target?.$data) ? target.$data : [];
  if (data.length) data[0] = vm.currentThreadObject?.() ?? null;
  return data.length ? 1 : 0;
});
THREAD_STATIC.set('dumpStack()V', () => undefined);
THREAD_STATIC.set('holdsLock(Ljava/lang/Object;)Z', (_self, [object]) => (object?.$monitorOwner ? 1 : 0));
THREAD_STATIC.set('getAllStackTraces()Ljava/util/Map;', (_self, _args, vm) => {
  const map = makeMap(vm);
  const current = vm.currentThreadObject?.();
  if (current) {
    const frames = (vm.methodStack || []).slice().reverse();
    const elements = vm.newArray('[Ljava/lang/StackTraceElement;', frames.length);
    frames.forEach((full, index) => {
      const element = vm.allocateRawObject('Ljava/lang/StackTraceElement;');
      const dot = full.lastIndexOf('.');
      element.$peer = {
        className: dot < 0 ? full : full.slice(0, dot),
        methodName: dot < 0 ? '' : full.slice(dot + 1),
        fileName: null,
        lineNumber: -1,
      };
      elements.$data[index] = element;
    });
    map.$peer.map.set(current, elements);
  }
  return map;
});
THREAD_METHODS.set('stop()V', (self) => {
  self.stopped = true;
});
THREAD_METHODS.set('stop(Ljava/lang/Throwable;)V', (self) => {
  self.stopped = true;
});
THREAD_METHODS.set('interrupt()V', (self) => {
  self.interrupted = true;
});
THREAD_METHODS.set('isInterrupted()Z', (self) => (self.interrupted ? 1 : 0));
THREAD_METHODS.set('destroy()V', (self) => {
  self.stopped = true;
});
THREAD_METHODS.set('suspend()V', (self) => {
  self.suspended = true;
});
THREAD_METHODS.set('resume()V', (self) => {
  self.suspended = false;
});
THREAD_METHODS.set('setPriority(I)V', (self, [priority]) => {
  self.priority = Math.max(1, Math.min(10, toInt(priority)));
});
THREAD_METHODS.set('getPriority()I', (self) => (self.priority || 5));
THREAD_METHODS.set('getThreadGroup()Ljava/lang/ThreadGroup;', (self, _args, vm) => {
  if (!self.threadGroup) {
    const group = vm.allocateRawObject('Ljava/lang/ThreadGroup;');
    group.$peer = { name: 'main' };
    self.threadGroup = group;
  }
  return self.threadGroup;
});
THREAD_METHODS.set('countStackFrames()I', (self, _args, vm) => (self === (vm.currentThreadObject?.()?.$peer ?? null) ? (vm.methodStack?.length || 0) : 0));
THREAD_METHODS.set('join(J)V', () => undefined);
THREAD_METHODS.set('join(JI)V', () => undefined);
THREAD_METHODS.set('setDaemon(Z)V', (self, [daemon]) => {
  self.daemon = !!daemon;
});
THREAD_METHODS.set('isDaemon()Z', (self) => (self.daemon ? 1 : 0));
THREAD_METHODS.set('checkAccess()V', () => undefined);
THREAD_METHODS.set('getContextClassLoader()Ljava/lang/ClassLoader;', (self) => self.contextClassLoader ?? null);
THREAD_METHODS.set('setContextClassLoader(Ljava/lang/ClassLoader;)V', (self, [loader]) => {
  self.contextClassLoader = loader ?? null;
});
THREAD_METHODS.set('getId()J', (self, _args, vm) => {
  if (self.threadId === undefined) self.threadId = BigInt(++THREAD_ID_SEQUENCE);
  return self.threadId;
});
THREAD_METHODS.set('getState()Ljava/lang/Thread$State;', (self) => threadStateObject(self));
THREAD_METHODS.set('getUncaughtExceptionHandler()Ljava/lang/Thread$UncaughtExceptionHandler;', (self) => self.uncaughtExceptionHandler ?? null);
THREAD_METHODS.set('setUncaughtExceptionHandler(Ljava/lang/Thread$UncaughtExceptionHandler;)V', (self, [handler]) => {
  self.uncaughtExceptionHandler = handler ?? null;
});

let THREAD_ID_SEQUENCE = 0;

function performThreadSleep(vm, milliseconds) {
  const duration = Number(milliseconds) || 0;
  if (duration <= 0) return undefined;
  const canBlock = typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined'
    && typeof window === 'undefined';
  if (canBlock) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(duration, 60000));
    return undefined;
  }
  // 浏览器主线程不能阻塞：推进模拟器虚拟时钟，让依赖 sleep 的时间计算仍然前进。
  if (vm) vm.clockOffset = (vm.clockOffset || 0) + duration;
  return undefined;
}

function threadStateObject(thread) {
  const state = thread?.stopped ? 'TERMINATED' : (thread?.suspended ? 'WAITING' : 'RUNNABLE');
  const object = { $peer: { name: state, ordinal: THREAD_STATES.indexOf(state) } };
  return object;
}

const THREAD_STATES = ['NEW', 'RUNNABLE', 'BLOCKED', 'WAITING', 'TIMED_WAITING', 'TERMINATED'];

function exactInt(vm, value) {
  if (!Number.isFinite(value) || value < -2147483648 || value > 2147483647) {
    vm?.throwException?.('Ljava/lang/ArithmeticException;', 'integer overflow');
    return 0;
  }
  return value | 0;
}

function roundHalfEven(value) {
  if (!Number.isFinite(value)) return value;
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function ieeeRemainder(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) return NaN;
  return left - roundHalfEven(left / right) * right;
}

function floorDivLong(left, right) {
  const quotient = left / right;
  return (left % right !== 0n && ((left < 0n) !== (right < 0n))) ? quotient - 1n : quotient;
}

function floorModLong(left, right) {
  const remainder = left % right;
  return (remainder !== 0n && ((remainder < 0n) !== (right < 0n))) ? remainder + right : remainder;
}

const MATH_FLOAT_BITS = new Float32Array(1);
const MATH_FLOAT_INT = new Int32Array(MATH_FLOAT_BITS.buffer);
const MATH_DOUBLE_BITS = new Float64Array(1);

function nextAfterNumber(start, direction, single) {
  if (Number.isNaN(start) || Number.isNaN(direction)) return NaN;
  if (start === direction) return direction;
  const minimum = single ? 1.401298464324817e-45 : Number.MIN_VALUE;
  if (start === 0) return direction > 0 ? minimum : -minimum;
  if (single) {
    MATH_FLOAT_BITS[0] = start;
    let bits = MATH_FLOAT_INT[0];
    bits += ((direction > start) === (start > 0)) ? 1 : -1;
    MATH_FLOAT_INT[0] = bits;
    return MATH_FLOAT_BITS[0];
  }
  MATH_DOUBLE_BITS[0] = start;
  const view = new DataView(MATH_DOUBLE_BITS.buffer);
  let bits = view.getBigInt64(0, true);
  bits += ((direction > start) === (start > 0)) ? 1n : -1n;
  view.setBigInt64(0, bits, true);
  return MATH_DOUBLE_BITS[0];
}

function ulpDouble(value) {
  if (Number.isNaN(value)) return NaN;
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude)) return Infinity;
  return nextAfterNumber(magnitude, Infinity, false) - magnitude;
}

function ulpFloat(value) {
  if (Number.isNaN(value)) return NaN;
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude)) return Infinity;
  return nextAfterNumber(magnitude, Infinity, true) - magnitude;
}

function exponentOf(value, mantissaBits, exponentBits) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return Math.pow(2, exponentBits - 1) + 1;
  if (mantissaBits === 23) {
    MATH_FLOAT_BITS[0] = value;
    const raw = (MATH_FLOAT_INT[0] >>> 23) & 0xff;
    return raw === 0 ? -126 : raw - 127;
  }
  MATH_DOUBLE_BITS[0] = value;
  const view = new DataView(MATH_DOUBLE_BITS.buffer);
  const raw = Number((view.getBigInt64(0, true) >> 52n) & 0x7ffn);
  return raw === 0 ? -1022 : raw - 1023;
}

function charMatches(code, pattern) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return 0;
  try {
    return pattern.test(String.fromCodePoint(code)) ? 1 : 0;
  } catch (_error) {
    return 0;
  }
}

function charTransform(code, transform) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return code;
  const text = transform(String.fromCodePoint(code));
  return text.length ? text.codePointAt(0) : code;
}

function charArrayData(chars) {
  return Array.isArray(chars?.$data) ? chars.$data : [];
}

function charArrayLength(chars) {
  return charArrayData(chars).length;
}

function charArrayText(chars, from, to) {
  return charArrayData(chars)
    .slice(from, to)
    .map((value) => String.fromCharCode(toInt(value) & 0xffff))
    .join('');
}

function isHighSurrogateCode(code) {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogateCode(code) {
  return code >= 0xdc00 && code <= 0xdfff;
}

function codePointAtText(text, index) {
  if (index < 0 || index >= text.length) return 0;
  return text.codePointAt(index) ?? 0;
}

function codePointAtChars(chars, index, limit) {
  const data = charArrayData(chars);
  const at = index;
  const end = Math.min(limit, data.length);
  if (at < 0 || at >= end) return 0;
  const high = toInt(data[at]) & 0xffff;
  if (isHighSurrogateCode(high) && at + 1 < end) {
    const low = toInt(data[at + 1]) & 0xffff;
    if (isLowSurrogateCode(low)) return ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
  }
  return high;
}

function codePointBeforeText(text, index) {
  if (index <= 0 || index > text.length) return 0;
  const low = text.charCodeAt(index - 1);
  if (isLowSurrogateCode(low) && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (isHighSurrogateCode(high)) return ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
  }
  return low;
}

function codePointBeforeChars(chars, index, start = 0) {
  const data = charArrayData(chars);
  if (index <= start || index > data.length) return 0;
  const low = toInt(data[index - 1]) & 0xffff;
  if (isLowSurrogateCode(low) && index - 2 >= start) {
    const high = toInt(data[index - 2]) & 0xffff;
    if (isHighSurrogateCode(high)) return ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
  }
  return low;
}

function countCodePointsText(text, begin, end) {
  let count = 0;
  for (let index = begin; index < end;) {
    const code = text.codePointAt(index) ?? 0;
    index += code > 0xffff ? 2 : 1;
    count += 1;
  }
  return count;
}

function countCodePointsChars(chars, begin, end) {
  const data = charArrayData(chars);
  let count = 0;
  for (let index = begin; index < end && index < data.length;) {
    const code = toInt(data[index]) & 0xffff;
    index += isHighSurrogateCode(code) && index + 1 < end ? 2 : 1;
    count += 1;
  }
  return count;
}

function offsetByCodePoint(text, index, offset) {
  let cursor = index;
  if (offset >= 0) {
    for (let step = 0; step < offset && cursor < text.length; step++) {
      const code = text.codePointAt(cursor) ?? 0;
      cursor += code > 0xffff ? 2 : 1;
    }
  } else {
    for (let step = 0; step < -offset && cursor > 0; step++) {
      cursor -= 1;
      if (cursor > 0 && isLowSurrogateCode(text.charCodeAt(cursor))) cursor -= 1;
    }
  }
  return cursor;
}

function isDefinedCodePoint(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return false;
  if (code >= 0xd800 && code <= 0xdfff) return false;
  if (code >= 0xfdd0 && code <= 0xfdef) return false;
  return (code & 0xfffe) !== 0xfffe;
}

function isIdeographicCodePoint(code) {
  return (code >= 0x3006 && code <= 0x3007)
    || (code >= 0x3021 && code <= 0x3029)
    || (code >= 0x3038 && code <= 0x303a)
    || (code >= 0x3400 && code <= 0x4dbf)
    || (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0x20000 && code <= 0x2fa1f);
}

function isJavaIdentifierPartCodePoint(code) {
  if (charMatches(code, /[\p{L}\p{Nl}$_]/u)) return true;
  return !!charMatches(code, /[\p{Nd}\p{Mn}\p{Mc}\p{Pc}\p{Cf}]/u) || isIdentifierIgnorableCodePoint(code);
}

function isUnicodeIdentifierPartCodePoint(code) {
  if (charMatches(code, /[\p{L}\p{Nl}]/u)) return true;
  return !!charMatches(code, /[\p{Nd}\p{Mn}\p{Mc}\p{Pc}\p{Cf}]/u) || isIdentifierIgnorableCodePoint(code);
}

function isIdentifierIgnorableCodePoint(code) {
  if ((code >= 0 && code <= 8) || (code >= 0x0e && code <= 0x1b) || (code >= 0x7f && code <= 0x9f)) return true;
  return !!charMatches(code, /\p{Cf}/u);
}

function isWhitespaceCodePoint(code) {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || (code >= 0x1c && code <= 0x1f);
}

function isIsoControl(code) {
  return (code >= 0 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f);
}

function digitValueOf(code, radix) {
  if (radix < 2 || radix > 36 || !Number.isFinite(code) || code < 0) return -1;
  let value = -1;
  if (code >= 0x30 && code <= 0x39) value = code - 0x30;
  else if (code >= 0x61 && code <= 0x7a) value = code - 0x61 + 10;
  else if (code >= 0x41 && code <= 0x5a) value = code - 0x41 + 10;
  else if (code >= 0xff10 && code <= 0xff19) value = code - 0xff10;
  else if (code >= 0xff21 && code <= 0xff3a) value = code - 0xff21 + 10;
  else if (code >= 0xff41 && code <= 0xff5a) value = code - 0xff41 + 10;
  return value >= 0 && value < radix ? value : -1;
}

function numericValueOf(code) {
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x5a) return code - 0x41 + 10;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 10;
  if (code >= 0xff10 && code <= 0xff19) return code - 0xff10;
  if (code === 0x00bc) return -2;
  if (code === 0x00bd) return -2;
  if (code === 0x00be) return -2;
  return -1;
}

function charTypeOf(code) {
  const categories = [
    [1, /\p{Lu}/u], [2, /\p{Ll}/u], [3, /\p{Lt}/u], [4, /\p{Lm}/u], [5, /\p{Lo}/u],
    [6, /\p{Mn}/u], [7, /\p{Me}/u], [8, /\p{Mc}/u], [9, /\p{Nd}/u], [10, /\p{Nl}/u],
    [11, /\p{No}/u], [12, /\p{Zs}/u], [13, /\p{Zl}/u], [14, /\p{Zp}/u], [15, /\p{Cc}/u],
    [16, /\p{Cf}/u], [18, /\p{Co}/u], [19, /\p{Cs}/u], [20, /\p{Pd}/u], [21, /\p{Ps}/u],
    [22, /\p{Pe}/u], [23, /\p{Pc}/u], [24, /\p{Po}/u], [25, /\p{Sm}/u], [26, /\p{Sc}/u],
    [27, /\p{Sk}/u], [28, /\p{So}/u],
  ];
  for (const [value, pattern] of categories) {
    if (charMatches(code, pattern)) return value;
  }
  return 0;
}

function directionalityOf(code) {
  if ((code >= 0x0590 && code <= 0x05ff)) return 1;
  if ((code >= 0x0600 && code <= 0x07bf) || (code >= 0x08a0 && code <= 0x08ff)) return 1;
  if (code >= 0xfb1d && code <= 0xfdff) return 1;
  if (code >= 0xfe70 && code <= 0xfeff) return 2;
  return 0;
}

function isMirroredCodePoint(code) {
  return (code >= 0x28 && code <= 0x29)
    || (code >= 0x3c && code <= 0x3e)
    || (code >= 0x5b && code <= 0x5d)
    || code === 0x7b || code === 0x7d
    || (code >= 0xab && code <= 0xab)
    || (code >= 0xbb && code <= 0xbb)
    || (code >= 0x2018 && code <= 0x201f)
    || (code >= 0x2039 && code <= 0x203a)
    || (code >= 0x2045 && code <= 0x2046)
    || (code >= 0x207d && code <= 0x207e)
    || (code >= 0x208d && code <= 0x208e)
    || (code >= 0x2200 && code <= 0x22ff);
}

const CHARACTER_ASCII_NAMES = {
  0x09: 'CHARACTER TABULATION',
  0x0a: 'LINE FEED (LF)',
  0x0d: 'CARRIAGE RETURN (CR)',
  0x20: 'SPACE',
  0x21: 'EXCLAMATION MARK',
  0x22: 'QUOTATION MARK',
  0x23: 'NUMBER SIGN',
  0x24: 'DOLLAR SIGN',
  0x25: 'PERCENT SIGN',
  0x26: 'AMPERSAND',
  0x27: 'APOSTROPHE',
  0x28: 'LEFT PARENTHESIS',
  0x29: 'RIGHT PARENTHESIS',
  0x2a: 'ASTERISK',
  0x2b: 'PLUS SIGN',
  0x2c: 'COMMA',
  0x2d: 'HYPHEN-MINUS',
  0x2e: 'FULL STOP',
  0x2f: 'SOLIDUS',
  0x3a: 'COLON',
  0x3b: 'SEMICOLON',
  0x3c: 'LESS-THAN SIGN',
  0x3d: 'EQUALS SIGN',
  0x3e: 'GREATER-THAN SIGN',
  0x3f: 'QUESTION MARK',
  0x40: 'COMMERCIAL AT',
  0x5b: 'LEFT SQUARE BRACKET',
  0x5c: 'REVERSE SOLIDUS',
  0x5d: 'RIGHT SQUARE BRACKET',
  0x5e: 'CIRCUMFLEX ACCENT',
  0x5f: 'LOW LINE',
  0x60: 'GRAVE ACCENT',
  0x7b: 'LEFT CURLY BRACKET',
  0x7c: 'VERTICAL LINE',
  0x7d: 'RIGHT CURLY BRACKET',
  0x7e: 'TILDE',
};

const CHARACTER_DIGIT_NAMES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];

function characterName(code) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return null;
  if (code >= 0x30 && code <= 0x39) return `DIGIT ${CHARACTER_DIGIT_NAMES[code - 0x30]}`;
  if (code >= 0x41 && code <= 0x5a) return `LATIN CAPITAL LETTER ${String.fromCharCode(code)}`;
  if (code >= 0x61 && code <= 0x7a) return `LATIN SMALL LETTER ${String.fromCharCode(code).toUpperCase()}`;
  return CHARACTER_ASCII_NAMES[code] ?? null;
}

// ---- Integer / Float / Double 数值语义补全 ----
const INTEGER_METHODS = JAVA_CORE_CLASSES['Ljava/lang/Integer;'].methods;
const INTEGER_STATIC = JAVA_CORE_CLASSES['Ljava/lang/Integer;'].staticMethods;
const FLOAT_METHODS = JAVA_CORE_CLASSES['Ljava/lang/Float;'].methods;
const FLOAT_STATIC = JAVA_CORE_CLASSES['Ljava/lang/Float;'].staticMethods;
const DOUBLE_METHODS = JAVA_CORE_CLASSES['Ljava/lang/Double;'].methods;
const DOUBLE_STATIC = JAVA_CORE_CLASSES['Ljava/lang/Double;'].staticMethods;

const FLOAT_VIEW = new Float32Array(1);
const FLOAT_INT_VIEW = new Int32Array(FLOAT_VIEW.buffer);
const DOUBLE_VIEW = new Float64Array(1);
const DOUBLE_LONG_VIEW = new BigInt64Array(DOUBLE_VIEW.buffer);

function floatToRawIntBitsValue(value) {
  FLOAT_VIEW[0] = Number(value);
  return FLOAT_INT_VIEW[0] | 0;
}

function intBitsToFloatValue(bits) {
  FLOAT_INT_VIEW[0] = toInt(bits);
  return FLOAT_VIEW[0];
}

function doubleToRawLongBitsValue(value) {
  DOUBLE_VIEW[0] = Number(value);
  return DOUBLE_LONG_VIEW[0];
}

function longBitsToDoubleValue(bits) {
  DOUBLE_LONG_VIEW[0] = BigInt.asIntN(64, toLong(bits));
  return DOUBLE_VIEW[0];
}

function parseRadixDigits(text, radix, vm) {
  const source = String(jsString(text) ?? '').trim();
  const base = toInt(radix);
  if (base < 2 || base > 36) {
    if (vm?.throwException) vm.throwException('Ljava/lang/NumberFormatException;', `radix ${base}`);
    return null;
  }
  const negative = source.startsWith('-');
  const body = source[0] === '-' || source[0] === '+' ? source.slice(1) : source;
  if (!body) {
    if (vm?.throwException) vm.throwException('Ljava/lang/NumberFormatException;', `For input string: "${source}"`);
    return null;
  }
  let acc = 0n;
  for (const ch of body) {
    const code = ch.codePointAt(0);
    let digit = -1;
    if (code >= 48 && code <= 57) digit = code - 48;
    else if (code >= 97 && code <= 122) digit = code - 87;
    else if (code >= 65 && code <= 90) digit = code - 55;
    if (digit < 0 || digit >= base) {
      if (vm?.throwException) vm.throwException('Ljava/lang/NumberFormatException;', `For input string: "${source}"`);
      return null;
    }
    acc = acc * BigInt(base) + BigInt(digit);
  }
  return negative ? -acc : acc;
}

function integerRadixText(value, radix) {
  return (toInt(value) >>> 0).toString(toInt(radix));
}

function unsignedIntegerText(value, radix) {
  const base = toInt(radix);
  if (base < 2 || base > 36) return (toInt(value) >>> 0).toString();
  return (toInt(value) >>> 0).toString(base);
}

function compareFloatNumbers(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1;
  if (Number.isNaN(right)) return -1;
  if (left < right) return -1;
  if (left > right) return 1;
  if (left === 0 && right === 0) return Object.is(left, -0) && !Object.is(right, -0) ? -1 : (Object.is(right, -0) && !Object.is(left, -0) ? 1 : 0);
  return 0;
}

INTEGER_STATIC.set('toString(II)Ljava/lang/String;', (_self, [value, radix]) => integerRadixText(value, radix));
INTEGER_STATIC.set('toUnsignedString(I)Ljava/lang/String;', (_self, [value]) => unsignedIntegerText(value, 10));
INTEGER_STATIC.set('toUnsignedString(II)Ljava/lang/String;', (_self, [value, radix]) => unsignedIntegerText(value, radix));
INTEGER_STATIC.set('parseUnsignedInt(Ljava/lang/String;)I', (_self, [value], vm) => {
  const parsed = parseRadixDigits(value, 10, vm);
  return parsed === null ? 0 : Number(BigInt.asIntN(32, parsed));
});
INTEGER_STATIC.set('parseUnsignedInt(Ljava/lang/String;I)I', (_self, [value, radix], vm) => {
  const parsed = parseRadixDigits(value, radix, vm);
  return parsed === null ? 0 : Number(BigInt.asIntN(32, parsed));
});
INTEGER_STATIC.set('valueOf(Ljava/lang/String;I)Ljava/lang/Integer;', (_self, [value, radix], vm) => {
  const parsed = parseRadixDigits(value, radix, vm);
  return vm.wrapPeer({ value: parsed === null ? 0 : Number(BigInt.asIntN(32, parsed)) });
});
INTEGER_STATIC.set('hashCode(I)I', (_self, [value]) => toInt(value));
INTEGER_STATIC.set('compareUnsigned(II)I', (_self, [a, b]) => {
  const left = toInt(a) >>> 0;
  const right = toInt(b) >>> 0;
  return left < right ? -1 : left > right ? 1 : 0;
});
INTEGER_STATIC.set('toUnsignedLong(I)J', (_self, [value]) => BigInt(toInt(value) >>> 0));
INTEGER_STATIC.set('divideUnsigned(II)I', (_self, [a, b]) => {
  const divisor = toInt(b) >>> 0;
  if (divisor === 0) return 0;
  return Number(BigInt.asIntN(32, BigInt(Math.floor((toInt(a) >>> 0) / divisor))));
});
INTEGER_STATIC.set('remainderUnsigned(II)I', (_self, [a, b]) => {
  const divisor = toInt(b) >>> 0;
  if (divisor === 0) return 0;
  return Number(BigInt.asIntN(32, BigInt((toInt(a) >>> 0) % divisor)));
});
INTEGER_STATIC.set('rotateLeft(II)I', (_self, [value, distance]) => {
  const v = toInt(value);
  const d = ((toInt(distance) % 32) + 32) % 32;
  return ((v << d) | (v >>> (32 - d))) | 0;
});
INTEGER_STATIC.set('rotateRight(II)I', (_self, [value, distance]) => {
  const v = toInt(value);
  const d = ((toInt(distance) % 32) + 32) % 32;
  return ((v >>> d) | (v << (32 - d))) | 0;
});
INTEGER_STATIC.set('signum(I)I', (_self, [value]) => {
  const v = toInt(value);
  return v > 0 ? 1 : (v < 0 ? -1 : 0);
});
INTEGER_STATIC.set('reverseBytes(I)I', (_self, [value]) => {
  const v = toInt(value) >>> 0;
  return (((v >>> 24) & 0xff) | ((v >>> 8) & 0xff00) | ((v << 8) & 0xff0000) | (v << 24)) | 0;
});
INTEGER_STATIC.set('sum(II)I', (_self, [a, b]) => (toInt(a) + toInt(b)) | 0);
INTEGER_STATIC.set('max(II)I', (_self, [a, b]) => (toInt(a) >= toInt(b) ? toInt(a) : toInt(b)));
INTEGER_STATIC.set('min(II)I', (_self, [a, b]) => (toInt(a) <= toInt(b) ? toInt(a) : toInt(b)));
INTEGER_METHODS.set('byteValue()B', (self) => (toInt(self.value) << 24) >> 24);
INTEGER_METHODS.set('shortValue()S', (self) => (toInt(self.value) << 16) >> 16);
INTEGER_METHODS.set('floatValue()F', (self) => Number(toInt(self.value)));
INTEGER_METHODS.set('doubleValue()D', (self) => Number(toInt(self.value)));
INTEGER_METHODS.set('compareTo(Ljava/lang/Integer;)I', (self, [other]) => {
  const value = toInt(self.value);
  const target = toInt(other?.$peer?.value ?? other?.value ?? 0);
  return value < target ? -1 : value > target ? 1 : 0;
});

FLOAT_STATIC.set('toHexString(F)Ljava/lang/String;', (_self, [value]) => {
  const number = Number(value);
  if (Number.isNaN(number)) return 'NaN';
  if (!Number.isFinite(number)) return number > 0 ? 'Infinity' : '-Infinity';
  const text = number.toString(16);
  return `0x${text}p0`;
});
FLOAT_STATIC.set('valueOf(Ljava/lang/String;)Ljava/lang/Float;', (_self, [value], vm) =>
  vm.wrapPeer({ value: parseFloat(jsString(value)) || 0 }));
FLOAT_STATIC.set('isNaN(F)Z', (_self, [value]) => (Number.isNaN(Number(value)) ? 1 : 0));
FLOAT_STATIC.set('isInfinite(F)Z', (_self, [value]) => (Number.isFinite(Number(value)) ? 0 : 1));
FLOAT_STATIC.set('isFinite(F)Z', (_self, [value]) => (Number.isFinite(Number(value)) ? 1 : 0));
FLOAT_STATIC.set('hashCode(F)I', (_self, [value]) => floatToRawIntBitsValue(value));
FLOAT_STATIC.set('floatToIntBits(F)I', (_self, [value]) => floatToRawIntBitsValue(value));
FLOAT_STATIC.set('floatToRawIntBits(F)I', (_self, [value]) => floatToRawIntBitsValue(value));
FLOAT_STATIC.set('intBitsToFloat(I)F', (_self, [bits]) => intBitsToFloatValue(bits));
FLOAT_STATIC.set('compare(FF)I', (_self, [a, b]) => compareFloatNumbers(a, b));
FLOAT_STATIC.set('sum(FF)F', (_self, [a, b]) => Number(a) + Number(b));
FLOAT_STATIC.set('max(FF)F', (_self, [a, b]) => (compareFloatNumbers(a, b) >= 0 ? Number(a) : Number(b)));
FLOAT_STATIC.set('min(FF)F', (_self, [a, b]) => (compareFloatNumbers(a, b) <= 0 ? Number(a) : Number(b)));
FLOAT_METHODS.set('<init>(Ljava/lang/String;)V', (self, [value]) => {
  self.value = parseFloat(jsString(value)) || 0;
});
FLOAT_METHODS.set('isNaN()Z', (self) => (Number.isNaN(Number(self.value)) ? 1 : 0));
FLOAT_METHODS.set('isInfinite()Z', (self) => (Number.isFinite(Number(self.value)) ? 0 : 1));
FLOAT_METHODS.set('byteValue()B', (self) => ((Number(self.value) | 0) << 24) >> 24);
FLOAT_METHODS.set('shortValue()S', (self) => ((Number(self.value) | 0) << 16) >> 16);
FLOAT_METHODS.set('intValue()I', (self) => Math.trunc(Number(self.value)) | 0);
FLOAT_METHODS.set('longValue()J', (self) => BigInt(Math.trunc(Number(self.value) || 0)));
FLOAT_METHODS.set('compareTo(Ljava/lang/Float;)I', (self, [other]) =>
  compareFloatNumbers(self.value, other?.$peer?.value ?? other?.value ?? 0));

DOUBLE_STATIC.set('toHexString(D)Ljava/lang/String;', (_self, [value]) => {
  const number = Number(value);
  if (Number.isNaN(number)) return 'NaN';
  if (!Number.isFinite(number)) return number > 0 ? 'Infinity' : '-Infinity';
  return `0x${number.toString(16)}p0`;
});
DOUBLE_STATIC.set('valueOf(Ljava/lang/String;)Ljava/lang/Double;', (_self, [value], vm) =>
  vm.wrapPeer({ value: parseDouble(jsString(value)) }));
DOUBLE_STATIC.set('isFinite(D)Z', (_self, [value]) => (Number.isFinite(Number(value)) ? 1 : 0));
DOUBLE_STATIC.set('hashCode(D)I', (_self, [value]) => {
  const bits = doubleToRawLongBitsValue(value);
  return Number(BigInt.asIntN(32, bits ^ (bits >> 32n)));
});
DOUBLE_STATIC.set('doubleToLongBits(D)J', (_self, [value]) => doubleToRawLongBitsValue(value));
DOUBLE_STATIC.set('doubleToRawLongBits(D)J', (_self, [value]) => doubleToRawLongBitsValue(value));
DOUBLE_STATIC.set('longBitsToDouble(J)D', (_self, [bits]) => longBitsToDoubleValue(bits));
DOUBLE_STATIC.set('compare(DD)I', (_self, [a, b]) => compareFloatNumbers(a, b));
DOUBLE_STATIC.set('sum(DD)D', (_self, [a, b]) => Number(a) + Number(b));
DOUBLE_STATIC.set('max(DD)D', (_self, [a, b]) => (compareFloatNumbers(a, b) >= 0 ? Number(a) : Number(b)));
DOUBLE_STATIC.set('min(DD)D', (_self, [a, b]) => (compareFloatNumbers(a, b) <= 0 ? Number(a) : Number(b)));
DOUBLE_METHODS.set('<init>(Ljava/lang/String;)V', (self, [value]) => {
  self.value = parseDouble(jsString(value));
});
DOUBLE_METHODS.set('isNaN()Z', (self) => (Number.isNaN(Number(self.value)) ? 1 : 0));
DOUBLE_METHODS.set('isInfinite()Z', (self) => (Number.isFinite(Number(self.value)) ? 0 : 1));
DOUBLE_METHODS.set('byteValue()B', (self) => ((Number(self.value) | 0) << 24) >> 24);
DOUBLE_METHODS.set('shortValue()S', (self) => ((Number(self.value) | 0) << 16) >> 16);
DOUBLE_METHODS.set('intValue()I', (self) => Math.trunc(Number(self.value)) | 0);
DOUBLE_METHODS.set('longValue()J', (self) => BigInt(Math.trunc(Number(self.value) || 0)));
DOUBLE_METHODS.set('compareTo(Ljava/lang/Double;)I', (self, [other]) =>
  compareFloatNumbers(self.value, other?.$peer?.value ?? other?.value ?? 0));

// ---- java.lang.StringBuffer（复用 StringBuilder 的真实缓冲语义）----
(() => {
  const builder = JAVA_CORE_CLASSES['Ljava/lang/StringBuilder;'];
  if (!builder) return;
  const buffer = nativeDef('Ljava/lang/StringBuffer;', {
    super: 'Ljava/lang/Object;',
    ctor: peerClass(function () {
      this.parts = [];
    }, { parts: [] }),
    methods: {},
    staticMethods: {},
  });
  for (const [key, fn] of builder.methods) {
    buffer.methods.set(key.split('Ljava/lang/StringBuilder;').join('Ljava/lang/StringBuffer;'), fn);
  }
  JAVA_CORE_CLASSES['Ljava/lang/StringBuffer;'] = buffer;
})();

// ---- java.text.FieldPosition / ParsePosition / AttributedCharacterIterator ----
JAVA_CORE_CLASSES['Ljava/text/FieldPosition;'] = nativeDef('Ljava/text/FieldPosition;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (vm, object, field) {
    this.field = field ?? 0;
    this.beginIndex = 0;
    this.endIndex = 0;
  }, { field: 0, beginIndex: 0, endIndex: 0 }),
  methods: {
    '<init>(I)V': (self, [field]) => { self.field = toInt(field); },
    '<init>(Ljava/text/Format$Field;)V': (self, [field]) => { self.field = field ?? null; },
    'getField()I': (self) => toInt(self.field) | 0,
    'getFieldAttribute()Ljava/text/Format$Field;': (self) => self.fieldAttribute ?? null,
    'getBeginIndex()I': (self) => toInt(self.beginIndex),
    'getEndIndex()I': (self) => toInt(self.endIndex),
    'setBeginIndex(I)V': (self, [value]) => { self.beginIndex = toInt(value); },
    'setEndIndex(I)V': (self, [value]) => { self.endIndex = toInt(value); },
    'toString()Ljava/lang/String;': (self) => `java.text.FieldPosition[field=${toInt(self.field)},beginIndex=${toInt(self.beginIndex)},endIndex=${toInt(self.endIndex)}]`,
  },
});

JAVA_CORE_CLASSES['Ljava/text/ParsePosition;'] = nativeDef('Ljava/text/ParsePosition;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function (vm, object, index) {
    this.index = index ?? 0;
    this.errorIndex = -1;
  }, { index: 0, errorIndex: -1 }),
  methods: {
    '<init>(I)V': (self, [index]) => { self.index = toInt(index); },
    'getIndex()I': (self) => toInt(self.index),
    'setIndex(I)V': (self, [index]) => { self.index = toInt(index); },
    'getErrorIndex()I': (self) => toInt(self.errorIndex),
    'setErrorIndex(I)V': (self, [index]) => { self.errorIndex = toInt(index); },
    'toString()Ljava/lang/String;': (self) => `java.text.ParsePosition[index=${toInt(self.index)},errorIndex=${toInt(self.errorIndex)}]`,
  },
});

JAVA_CORE_CLASSES['Ljava/text/AttributedCharacterIterator;'] = nativeDef('Ljava/text/AttributedCharacterIterator;', {
  super: 'Ljava/lang/Object;',
  interfaces: ['Ljava/text/CharacterIterator;'],
  ctor: peerClass(function (vm, object, text) {
    this.text = String(text ?? '');
    this.index = 0;
    this.attributes = [];
  }, { text: '', index: 0, attributes: [] }),
  methods: {
    'getText()Ljava/lang/String;': (self) => self.text,
    'getBeginIndex()I': () => 0,
    'getEndIndex()I': (self) => self.text.length,
    'getIndex()I': (self) => toInt(self.index),
    'setIndex(I)C': (self, [index]) => {
      self.index = Math.max(0, Math.min(self.text.length, toInt(index)));
      return self.text.charCodeAt(self.index) || 0xffff;
    },
    'current()C': (self) => self.text.charCodeAt(toInt(self.index)) || 0xffff,
    'first()C': (self) => {
      self.index = 0;
      return self.text.charCodeAt(0) || 0xffff;
    },
    'last()C': (self) => {
      self.index = Math.max(0, self.text.length - 1);
      return self.text.charCodeAt(self.index) || 0xffff;
    },
    'next()C': (self) => {
      if (self.index >= self.text.length) {
        self.index = self.text.length;
        return 0xffff;
      }
      self.index += 1;
      return self.index >= self.text.length ? 0xffff : self.text.charCodeAt(self.index);
    },
    'previous()C': (self) => {
      if (self.index <= 0) return 0xffff;
      self.index -= 1;
      return self.text.charCodeAt(self.index);
    },
    'getRunStart()I': (self) => toInt(self.index),
    'getRunLimit()I': (self) => self.text.length,
    'getRunStart(Ljava/util/Set;)I': (self) => toInt(self.index),
    'getRunLimit(Ljava/util/Set;)I': (self) => self.text.length,
    'getAttributes()Ljava/util/Set;': (self, _args, vm) => makeSet(vm, self.attributes ?? []),
    'getAllAttributeKeys()Ljava/util/Set;': (self, _args, vm) => makeSet(vm, self.attributes ?? []),
    'getAttribute(Ljava/lang/Object;)Ljava/lang/Object;': () => null,
    'clone()Ljava/lang/Object;': (self, _args, vm) => {
      const copy = vm.allocateRawObject('Ljava/text/AttributedCharacterIterator;');
      copy.$peer = { text: self.text, index: toInt(self.index), attributes: [...(self.attributes ?? [])] };
      return copy;
    },
  },
});

// ---- java.text.DecimalFormatSymbols 补全 ----
const DFS_METHODS = JAVA_CORE_CLASSES['Ljava/text/DecimalFormatSymbols;'].methods;
const DFS_STATIC = JAVA_CORE_CLASSES['Ljava/text/DecimalFormatSymbols;'].staticMethods;
function symbolChar(self, key, fallback) {
  const value = self[key];
  return (typeof value === 'string' ? value : fallback).charCodeAt(0);
}
function setSymbolChar(self, key, value) {
  self[key] = String.fromCharCode(toInt(value));
}
DFS_STATIC.set('getAvailableLocales()[Ljava/util/Locale;', (_self, _args, vm) => {
  const tags = ['zh-CN', 'zh-TW', 'en-US', 'en-GB', 'ja-JP', 'ko-KR', 'fr-FR', 'de-DE', 'es-ES', 'ru-RU'];
  const array = vm.newArray('[Ljava/util/Locale;', tags.length, null);
  tags.forEach((tag, index) => { array.$data[index] = localeObject(vm, tag); });
  return array;
});
DFS_METHODS.set('getPerMill()C', (self) => symbolChar(self, 'perMill', '\u2030'));
DFS_METHODS.set('setPerMill(C)V', (self, [value]) => setSymbolChar(self, 'perMill', value));
DFS_METHODS.set('getPercent()C', (self) => symbolChar(self, 'percent', '%'));
DFS_METHODS.set('setPercent(C)V', (self, [value]) => setSymbolChar(self, 'percent', value));
DFS_METHODS.set('getDigit()C', (self) => symbolChar(self, 'digit', '#'));
DFS_METHODS.set('setDigit(C)V', (self, [value]) => setSymbolChar(self, 'digit', value));
DFS_METHODS.set('getPatternSeparator()C', (self) => symbolChar(self, 'patternSeparator', ';'));
DFS_METHODS.set('setPatternSeparator(C)V', (self, [value]) => setSymbolChar(self, 'patternSeparator', value));
DFS_METHODS.set('getInfinity()Ljava/lang/String;', (self) => self.infinity ?? '\u221e');
DFS_METHODS.set('setInfinity(Ljava/lang/String;)V', (self, [value]) => { self.infinity = jsString(value); });
DFS_METHODS.set('getNaN()Ljava/lang/String;', (self) => self.nan ?? 'NaN');
DFS_METHODS.set('setNaN(Ljava/lang/String;)V', (self, [value]) => { self.nan = jsString(value); });
DFS_METHODS.set('getMinusSign()C', (self) => symbolChar(self, 'minusSign', '-'));
DFS_METHODS.set('setMinusSign(C)V', (self, [value]) => setSymbolChar(self, 'minusSign', value));
DFS_METHODS.set('getCurrencySymbol()Ljava/lang/String;', (self) => self.currencySymbol ?? '\u00a4');
DFS_METHODS.set('setCurrencySymbol(Ljava/lang/String;)V', (self, [value]) => { self.currencySymbol = jsString(value); });
DFS_METHODS.set('getInternationalCurrencySymbol()Ljava/lang/String;', (self) => self.internationalCurrencySymbol ?? '');
DFS_METHODS.set('setInternationalCurrencySymbol(Ljava/lang/String;)V', (self, [value]) => {
  self.internationalCurrencySymbol = jsString(value);
});
DFS_METHODS.set('getCurrency()Ljava/util/Currency;', (self) => self.currency ?? null);
DFS_METHODS.set('setCurrency(Ljava/util/Currency;)V', (self, [value]) => { self.currency = value ?? null; });
DFS_METHODS.set('getMonetaryDecimalSeparator()C', (self) => symbolChar(self, 'monetaryDecimalSeparator', self.decimalSeparator || '.'));
DFS_METHODS.set('setMonetaryDecimalSeparator(C)V', (self, [value]) => setSymbolChar(self, 'monetaryDecimalSeparator', value));
DFS_METHODS.set('getExponentSeparator()Ljava/lang/String;', (self) => self.exponentSeparator ?? 'E');
DFS_METHODS.set('setExponentSeparator(Ljava/lang/String;)V', (self, [value]) => { self.exponentSeparator = jsString(value); });

// ---- java.text.DecimalFormat 补全 ----
const DF_METHODS = JAVA_CORE_CLASSES['Ljava/text/DecimalFormat;'].methods;
function decimalOptions(self) {
  if (!self.options) self.options = decimalFormatOptions('#.##');
  return self.options;
}
function formatDecimalValue(self, value) {
  const number = typeof value === 'object' && value !== null
    ? Number(value.$peer?.value ?? value.value)
    : Number(value);
  return formatDecimalNumber(number, decimalOptions(self));
}
function decimalNumberObject(vm, value, self) {
  if (self.options?.parseBigDecimal) return makeBigDecimal(vm, value, scaleOfText(String(value)));
  if (self.options?.parseIntegerOnly) {
    const object = vm.allocateRawObject('Ljava/lang/Long;');
    object.$peer = { value: BigInt(Math.trunc(value)) };
    return object;
  }
  const object = vm.allocateRawObject('Ljava/lang/Double;');
  object.$peer = { value: Number(value) };
  return object;
}
DF_METHODS.set('format(Ljava/lang/Object;Ljava/lang/StringBuffer;Ljava/text/FieldPosition;)Ljava/lang/StringBuffer;', (self, [value, buffer, position]) => {
  const text = formatDecimalValue(self, value);
  const start = (buffer?.$peer?.parts || []).join('').length;
  updateFieldPosition(position, start, start + text.length);
  return appendToCharBuffer(buffer, text);
});
DF_METHODS.set('format(DLjava/lang/StringBuffer;Ljava/text/FieldPosition;)Ljava/lang/StringBuffer;', (self, [value, buffer, position]) => {
  const text = formatDecimalNumber(Number(value), decimalOptions(self));
  const start = (buffer?.$peer?.parts || []).join('').length;
  updateFieldPosition(position, start, start + text.length);
  return appendToCharBuffer(buffer, text);
});
DF_METHODS.set('format(JLjava/lang/StringBuffer;Ljava/text/FieldPosition;)Ljava/lang/StringBuffer;', (self, [value, buffer, position]) => {
  const text = formatDecimalNumber(Number(toLong(value)), decimalOptions(self));
  const start = (buffer?.$peer?.parts || []).join('').length;
  updateFieldPosition(position, start, start + text.length);
  return appendToCharBuffer(buffer, text);
});
DF_METHODS.set('formatToCharacterIterator(Ljava/lang/Object;)Ljava/text/AttributedCharacterIterator;', (self, [value], vm) => {
  const text = formatDecimalValue(self, value);
  const iterator = vm.allocateRawObject('Ljava/text/AttributedCharacterIterator;');
  iterator.$peer = { text, index: 0, attributes: [] };
  return iterator;
});
DF_METHODS.set('parse(Ljava/lang/String;Ljava/text/ParsePosition;)Ljava/lang/Number;', (self, [text, position], vm) => {
  const parsed = parseDecimalValue(text, decimalOptions(self));
  const peer = position?.$peer;
  if (parsed === null) {
    if (peer) peer.errorIndex = toInt(peer.index);
    return null;
  }
  if (peer) {
    peer.index = String(jsString(text) ?? '').length;
    peer.errorIndex = -1;
  }
  return decimalNumberObject(vm, parsed, self);
});
DF_METHODS.set('setDecimalFormatSymbols(Ljava/text/DecimalFormatSymbols;)V', (self, [symbols]) => { self.symbols = symbols ?? null; });
DF_METHODS.set('getPositivePrefix()Ljava/lang/String;', (self) => String(decimalOptions(self).positivePrefix ?? ''));
DF_METHODS.set('setPositivePrefix(Ljava/lang/String;)V', (self, [value]) => { decimalOptions(self).positivePrefix = jsString(value); });
DF_METHODS.set('getNegativePrefix()Ljava/lang/String;', (self) => String(decimalOptions(self).negativePrefix ?? ''));
DF_METHODS.set('setNegativePrefix(Ljava/lang/String;)V', (self, [value]) => { decimalOptions(self).negativePrefix = jsString(value); });
DF_METHODS.set('getPositiveSuffix()Ljava/lang/String;', (self) => String(decimalOptions(self).positiveSuffix ?? ''));
DF_METHODS.set('setPositiveSuffix(Ljava/lang/String;)V', (self, [value]) => { decimalOptions(self).positiveSuffix = jsString(value); });
DF_METHODS.set('getNegativeSuffix()Ljava/lang/String;', (self) => String(decimalOptions(self).negativeSuffix ?? ''));
DF_METHODS.set('setNegativeSuffix(Ljava/lang/String;)V', (self, [value]) => { decimalOptions(self).negativeSuffix = jsString(value); });
DF_METHODS.set('getMultiplier()I', (self) => toInt(decimalOptions(self).multiplier));
DF_METHODS.set('setMultiplier(I)V', (self, [value]) => { decimalOptions(self).multiplier = toInt(value); });
DF_METHODS.set('isGroupingUsed()Z', (self) => (decimalOptions(self).grouping ? 1 : 0));
DF_METHODS.set('getGroupingSize()I', (self) => toInt(decimalOptions(self).groupingSize ?? 3));
DF_METHODS.set('setGroupingSize(I)V', (self, [value]) => { decimalOptions(self).groupingSize = Math.max(1, toInt(value)); });
DF_METHODS.set('isDecimalSeparatorAlwaysShown()Z', (self) => (decimalOptions(self).decimalSeparatorAlwaysShown ? 1 : 0));
DF_METHODS.set('isParseBigDecimal()Z', (self) => (decimalOptions(self).parseBigDecimal ? 1 : 0));
DF_METHODS.set('setParseBigDecimal(Z)V', (self, [value]) => { decimalOptions(self).parseBigDecimal = !!value; });
DF_METHODS.set('isParseIntegerOnly()Z', (self) => (decimalOptions(self).parseIntegerOnly ? 1 : 0));
DF_METHODS.set('setParseIntegerOnly(Z)V', (self, [value]) => { decimalOptions(self).parseIntegerOnly = !!value; });
DF_METHODS.set('toPattern()Ljava/lang/String;', (self) => String(decimalOptions(self).pattern ?? '#.##'));
DF_METHODS.set('toLocalizedPattern()Ljava/lang/String;', (self) => String(decimalOptions(self).pattern ?? '#.##'));
DF_METHODS.set('applyLocalizedPattern(Ljava/lang/String;)V', (self, [pattern]) => {
  self.options = decimalFormatOptions(jsString(pattern));
});
DF_METHODS.set('setMaximumIntegerDigits(I)V', (self, [value]) => {
  const options = decimalOptions(self);
  options.explicitMaxIntegerDigits = true;
  options.maxIntegerDigits = Math.max(0, toInt(value));
});
DF_METHODS.set('setMinimumIntegerDigits(I)V', (self, [value]) => {
  decimalOptions(self).minIntegerDigits = Math.max(0, toInt(value));
});
DF_METHODS.set('getMaximumIntegerDigits()I', (self) => {
  const options = decimalOptions(self);
  return options.explicitMaxIntegerDigits ? toInt(options.maxIntegerDigits) : 40;
});
DF_METHODS.set('getMinimumIntegerDigits()I', (self) => toInt(decimalOptions(self).minIntegerDigits ?? 1));
DF_METHODS.set('getMaximumFractionDigits()I', (self) => toInt(decimalOptions(self).maxFractionDigits));
DF_METHODS.set('getMinimumFractionDigits()I', (self) => toInt(decimalOptions(self).minFractionDigits));
DF_METHODS.set('getCurrency()Ljava/util/Currency;', (self) => self.currency ?? null);
DF_METHODS.set('setCurrency(Ljava/util/Currency;)V', (self, [value]) => { self.currency = value ?? null; });
DF_METHODS.set('getRoundingMode()Ljava/math/RoundingMode;', (self) => decimalOptions(self).roundingMode ?? null);

// ---- 集合：List 接口委托、CopyOnWriteArrayList/LinkedList/ArrayDeque 补全 ----
function listBacking(self) {
  if (!self || typeof self !== 'object') return null;
  if (Array.isArray(self.items)) return self.items;
  if (Array.isArray(self.setItems)) return self.setItems;
  if (Array.isArray(self.$data)) return self.$data;
  const peer = self.$peer;
  if (peer) {
    if (Array.isArray(peer.items)) return peer.items;
    if (Array.isArray(peer.setItems)) return peer.setItems;
  }
  return null;
}

function collectionArrayOf(other) {
  const items = collectionItems(other);
  if (items.length) return items;
  const backing = listBacking(other);
  return backing ? [...backing] : [];
}

function makeSpliterator(vm, items) {
  const object = vm.allocateRawObject('Ljava/util/Spliterator;');
  object.$peer = { items: [...(items || [])], cursor: 0 };
  return object;
}

JAVA_CORE_CLASSES['Ljava/util/Spliterator;'] = nativeDef('Ljava/util/Spliterator;', {
  super: 'Ljava/lang/Object;',
  staticFields: {
    'ORDERED:I': 16,
    'DISTINCT:I': 1,
    'SORTED:I': 4,
    'SIZED:I': 64,
    'NONNULL:I': 256,
    'IMMUTABLE:I': 1024,
    'CONCURRENT:I': 4096,
    'SUBSIZED:I': 16384,
  },
  methods: {
    'tryAdvance(Ljava/util/function/Consumer;)Z': (self, [consumer], vm) => {
      if (self.cursor >= self.items.length) return false;
      const value = self.items[self.cursor++];
      if (consumer) vm.invokeByName('accept', '(Ljava/lang/Object;)V', consumer, [value]);
      return true;
    },
    'forEachRemaining(Ljava/util/function/Consumer;)V': (self, [consumer], vm) => {
      while (self.cursor < self.items.length) {
        const value = self.items[self.cursor++];
        if (consumer) vm.invokeByName('accept', '(Ljava/lang/Object;)V', consumer, [value]);
      }
    },
    'trySplit()Ljava/util/Spliterator;': (self, _args, vm) => {
      const remaining = self.items.length - self.cursor;
      if (remaining < 2) return null;
      const half = self.cursor + Math.floor(remaining / 2);
      const head = self.items.slice(self.cursor, half);
      const split = makeSpliterator(vm, head);
      self.cursor = half;
      return split;
    },
    'estimateSize()J': (self) => BigInt(self.items.length - self.cursor),
    'getExactSizeIfKnown()J': (self) => BigInt(self.items.length - self.cursor),
    'characteristics()I': () => 16464,
    'hasCharacteristics(I)Z': (_self, [flags]) => ((16464 & toInt(flags)) === toInt(flags) ? 1 : 0),
    'getComparator()Ljava/util/Comparator;': () => null,
  },
});

const LIST_METHODS = JAVA_CORE_CLASSES['Ljava/util/List;'].methods;
const LIST_STATIC = JAVA_CORE_CLASSES['Ljava/util/List;'].staticMethods;
LIST_METHODS.set('add(Ljava/lang/Object;)Z', (self, [value]) => {
  const list = listBacking(self);
  if (!list) return false;
  list.push(value);
  return true;
});
LIST_METHODS.set('add(ILjava/lang/Object;)V', (self, [index, value]) => {
  const list = listBacking(self);
  if (list) list.splice(toInt(index), 0, value);
});
LIST_METHODS.set('remove(Ljava/lang/Object;)Z', (self, [value]) => {
  const list = listBacking(self);
  if (!list) return false;
  const index = list.findIndex((item) => refsEqual(item, value));
  if (index < 0) return false;
  list.splice(index, 1);
  return true;
});
LIST_METHODS.set('remove(I)Ljava/lang/Object;', (self, [index]) => {
  const list = listBacking(self);
  if (!list) return null;
  const removed = list.splice(toInt(index), 1);
  return removed.length ? removed[0] : null;
});
LIST_METHODS.set('clear()V', (self) => {
  const list = listBacking(self);
  if (list) list.length = 0;
});
LIST_METHODS.set('containsAll(Ljava/util/Collection;)Z', (self, [other]) => {
  const list = listBacking(self) || [];
  const source = collectionArrayOf(other);
  return source.every((item) => list.some((existing) => refsEqual(existing, item)));
});
LIST_METHODS.set('addAll(Ljava/util/Collection;)Z', (self, [other]) => {
  const list = listBacking(self);
  const source = collectionArrayOf(other);
  if (!list || !source.length) return false;
  list.push(...source);
  return true;
});
LIST_METHODS.set('addAll(ILjava/util/Collection;)Z', (self, [index, other]) => {
  const list = listBacking(self);
  const source = collectionArrayOf(other);
  if (!list || !source.length) return false;
  list.splice(Math.max(0, toInt(index)), 0, ...source);
  return true;
});
LIST_METHODS.set('removeAll(Ljava/util/Collection;)Z', (self, [other]) => {
  const list = listBacking(self);
  if (!list) return false;
  const source = collectionArrayOf(other);
  const before = list.length;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (source.some((item) => refsEqual(item, list[index]))) list.splice(index, 1);
  }
  return list.length !== before;
});
LIST_METHODS.set('retainAll(Ljava/util/Collection;)Z', (self, [other]) => {
  const list = listBacking(self);
  if (!list) return false;
  const source = collectionArrayOf(other);
  const before = list.length;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (!source.some((item) => refsEqual(item, list[index]))) list.splice(index, 1);
  }
  return list.length !== before;
});
LIST_METHODS.set('toArray([Ljava/lang/Object;)[Ljava/lang/Object;', (self, [target], vm) => {
  const list = listBacking(self) || [];
  const data = target?.$data;
  if (Array.isArray(data) && data.length >= list.length) {
    list.forEach((item, index) => { data[index] = item; });
    if (data.length > list.length) data[list.length] = null;
    return target;
  }
  const array = vm.newArray(target?.$type || '[Ljava/lang/Object;', list.length, null);
  list.forEach((item, index) => { array.$data[index] = item; });
  return array;
});
LIST_METHODS.set('replaceAll(Ljava/util/function/UnaryOperator;)V', (self, [operator], vm) => {
  const list = listBacking(self);
  if (!list) return;
  for (let index = 0; index < list.length; index += 1) {
    list[index] = vm.invokeByName('apply', '(Ljava/lang/Object;)Ljava/lang/Object;', operator, [list[index]]);
  }
});
LIST_METHODS.set('sort(Ljava/util/Comparator;)V', (self, [comparator], vm) => {
  const list = listBacking(self);
  if (!list) return;
  list.sort(comparator
    ? (a, b) => vm.invokeByName('compare', '(Ljava/lang/Object;Ljava/lang/Object;)I', comparator, [a, b]) | 0
    : (a, b) => defaultArrayCompare(a, b));
});
LIST_METHODS.set('spliterator()Ljava/util/Spliterator;', (self, _args, vm) => makeSpliterator(vm, listBacking(self) || []));
const listOf = (vm, args) => makeList(vm, args);
LIST_STATIC.set('of()Ljava/util/List;', (_self, _args, vm) => listOf(vm, []));
LIST_STATIC.set('of(Ljava/lang/Object;)Ljava/util/List;', (_self, [a], vm) => listOf(vm, [a]));
LIST_STATIC.set('of(Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/List;', (_self, args, vm) => listOf(vm, args));
LIST_STATIC.set('of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/List;', (_self, args, vm) => listOf(vm, args));
LIST_STATIC.set('of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/List;', (_self, args, vm) => listOf(vm, args));
LIST_STATIC.set('of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/List;', (_self, args, vm) => listOf(vm, args));
LIST_STATIC.set('of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/List;', (_self, args, vm) => listOf(vm, args));
LIST_STATIC.set('of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/List;', (_self, args, vm) => listOf(vm, args));
LIST_STATIC.set('of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/List;', (_self, args, vm) => listOf(vm, args));
LIST_STATIC.set('of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/List;', (_self, args, vm) => listOf(vm, args));
LIST_STATIC.set('of(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/util/List;', (_self, args, vm) => listOf(vm, args));
LIST_STATIC.set('of([Ljava/lang/Object;)Ljava/util/List;', (_self, [array], vm) => listOf(vm, array?.$data ? [...array.$data] : []));
LIST_STATIC.set('copyOf(Ljava/util/Collection;)Ljava/util/List;', (_self, [other], vm) => listOf(vm, collectionArrayOf(other)));

const COWAL_METHODS = JAVA_CORE_CLASSES['Ljava/util/concurrent/CopyOnWriteArrayList;'].methods;
COWAL_METHODS.set('<init>([Ljava/lang/Object;)V', (self, [array]) => { self.items = array?.$data ? [...array.$data] : []; });
COWAL_METHODS.set('indexOf(Ljava/lang/Object;I)I', (self, [value, from]) => {
  const start = Math.max(0, toInt(from));
  for (let index = start; index < self.items.length; index += 1) {
    if (refsEqual(self.items[index], value)) return index;
  }
  return -1;
});
COWAL_METHODS.set('lastIndexOf(Ljava/lang/Object;)I', (self, [value]) => {
  for (let index = self.items.length - 1; index >= 0; index -= 1) {
    if (refsEqual(self.items[index], value)) return index;
  }
  return -1;
});
COWAL_METHODS.set('lastIndexOf(Ljava/lang/Object;I)I', (self, [value, from]) => {
  for (let index = Math.min(toInt(from), self.items.length - 1); index >= 0; index -= 1) {
    if (refsEqual(self.items[index], value)) return index;
  }
  return -1;
});

const LINKED_LIST_METHODS = JAVA_CORE_CLASSES['Ljava/util/LinkedList;'].methods;
LINKED_LIST_METHODS.set('getFirst()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items[0] ?? null;
});
LINKED_LIST_METHODS.set('getLast()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items[self.items.length - 1] ?? null;
});
LINKED_LIST_METHODS.set('remove()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items.shift();
});
LINKED_LIST_METHODS.set('removeFirstOccurrence(Ljava/lang/Object;)Z', (self, [value]) => {
  const index = self.items.findIndex((item) => refsEqual(item, value));
  if (index < 0) return false;
  self.items.splice(index, 1);
  return true;
});
LINKED_LIST_METHODS.set('removeLastOccurrence(Ljava/lang/Object;)Z', (self, [value]) => {
  for (let index = self.items.length - 1; index >= 0; index -= 1) {
    if (refsEqual(self.items[index], value)) {
      self.items.splice(index, 1);
      return true;
    }
  }
  return false;
});
LINKED_LIST_METHODS.set('descendingIterator()Ljava/util/Iterator;', (self, _args, vm) => makeIterator(vm, [...self.items].reverse()));

const DEQUE_METHODS = JAVA_CORE_CLASSES['Ljava/util/ArrayDeque;'].methods;
DEQUE_METHODS.set('<init>(I)V', (self) => { self.items = []; });
DEQUE_METHODS.set('<init>(Ljava/util/Collection;)V', (self, [other]) => { self.items = collectionArrayOf(other); });
DEQUE_METHODS.set('offerFirst(Ljava/lang/Object;)Z', (self, [value]) => { self.items.unshift(value); return true; });
DEQUE_METHODS.set('offerLast(Ljava/lang/Object;)Z', (self, [value]) => { self.items.push(value); return true; });
DEQUE_METHODS.set('removeFirst()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items.shift();
});
DEQUE_METHODS.set('removeLast()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items.pop();
});
DEQUE_METHODS.set('pollFirst()Ljava/lang/Object;', (self) => (self.items.length ? self.items.shift() : null));
DEQUE_METHODS.set('pollLast()Ljava/lang/Object;', (self) => (self.items.length ? self.items.pop() : null));
DEQUE_METHODS.set('getFirst()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items[0];
});
DEQUE_METHODS.set('getLast()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items[self.items.length - 1];
});
DEQUE_METHODS.set('peekFirst()Ljava/lang/Object;', (self) => self.items[0] ?? null);
DEQUE_METHODS.set('peekLast()Ljava/lang/Object;', (self) => self.items[self.items.length - 1] ?? null);
DEQUE_METHODS.set('removeFirstOccurrence(Ljava/lang/Object;)Z', (self, [value]) => {
  const index = self.items.findIndex((item) => refsEqual(item, value));
  if (index < 0) return false;
  self.items.splice(index, 1);
  return true;
});
DEQUE_METHODS.set('removeLastOccurrence(Ljava/lang/Object;)Z', (self, [value]) => {
  for (let index = self.items.length - 1; index >= 0; index -= 1) {
    if (refsEqual(self.items[index], value)) {
      self.items.splice(index, 1);
      return true;
    }
  }
  return false;
});
DEQUE_METHODS.set('remove()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items.shift();
});
DEQUE_METHODS.set('element()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items[0];
});
DEQUE_METHODS.set('push(Ljava/lang/Object;)V', (self, [value]) => { self.items.unshift(value); });
DEQUE_METHODS.set('pop()Ljava/lang/Object;', (self, _args, vm) => {
  if (!self.items.length) vm.throwException('Ljava/util/NoSuchElementException;', '');
  return self.items.shift();
});
DEQUE_METHODS.set('descendingIterator()Ljava/util/Iterator;', (self, _args, vm) => makeIterator(vm, [...self.items].reverse()));
DEQUE_METHODS.set('contains(Ljava/lang/Object;)Z', (self, [value]) => (self.items.some((item) => refsEqual(item, value)) ? 1 : 0));
DEQUE_METHODS.set('remove(Ljava/lang/Object;)Z', (self, [value]) => {
  const index = self.items.findIndex((item) => refsEqual(item, value));
  if (index < 0) return false;
  self.items.splice(index, 1);
  return true;
});
DEQUE_METHODS.set('clear()V', (self) => { self.items = []; });
DEQUE_METHODS.set('toArray()[Ljava/lang/Object;', (self, _args, vm) => vm.newArray('[Ljava/lang/Object;', [...self.items]));
DEQUE_METHODS.set('toArray([Ljava/lang/Object;)[Ljava/lang/Object;', (self, [target], vm) => {
  const data = target?.$data;
  if (Array.isArray(data) && data.length >= self.items.length) {
    self.items.forEach((item, index) => { data[index] = item; });
    if (data.length > self.items.length) data[self.items.length] = null;
    return target;
  }
  const array = vm.newArray(target?.$type || '[Ljava/lang/Object;', self.items.length, null);
  self.items.forEach((item, index) => { array.$data[index] = item; });
  return array;
});
DEQUE_METHODS.set('clone()Ljava/util/ArrayDeque;', (self, _args, vm) => {
  const copy = vm.allocateRawObject('Ljava/util/ArrayDeque;');
  copy.$peer = { items: [...self.items] };
  return copy;
});
DEQUE_METHODS.set('spliterator()Ljava/util/Spliterator;', (self, _args, vm) => makeSpliterator(vm, self.items));

// ---- java.time.Instant 与 java.util.Date 补全 ----
JAVA_CORE_CLASSES['Ljava/time/Instant;'] = nativeDef('Ljava/time/Instant;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.epochMilli = 0n;
  }, { epochMilli: 0n }),
  methods: {
    'toEpochMilli()J': (self) => BigInt(self.epochMilli ?? 0n),
    'getEpochSecond()J': (self) => BigInt(Number(self.epochMilli ?? 0n) / 1000 | 0),
    'getNano()I': (self) => (Number(self.epochMilli ?? 0n) % 1000) * 1000000,
    'toString()Ljava/lang/String;': (self) => new Date(Number(self.epochMilli ?? 0n)).toISOString(),
    'isBefore(Ljava/time/Instant;)Z': (self, [other]) => (BigInt(self.epochMilli ?? 0n) < BigInt(other?.$peer?.epochMilli ?? 0n) ? 1 : 0),
    'isAfter(Ljava/time/Instant;)Z': (self, [other]) => (BigInt(self.epochMilli ?? 0n) > BigInt(other?.$peer?.epochMilli ?? 0n) ? 1 : 0),
    'compareTo(Ljava/time/Instant;)I': (self, [other]) => {
      const left = BigInt(self.epochMilli ?? 0n);
      const right = BigInt(other?.$peer?.epochMilli ?? 0n);
      return left < right ? -1 : (left > right ? 1 : 0);
    },
    'equals(Ljava/lang/Object;)Z': (self, [other]) => (BigInt(self.epochMilli ?? 0n) === BigInt(other?.$peer?.epochMilli ?? 0n) ? 1 : 0),
    'plusMillis(J)Ljava/time/Instant;': (self, [amount], vm) => {
      const copy = vm.allocateRawObject('Ljava/time/Instant;');
      copy.$peer = { epochMilli: BigInt(self.epochMilli ?? 0n) + BigInt(amount) };
      return copy;
    },
    'minusMillis(J)Ljava/time/Instant;': (self, [amount], vm) => {
      const copy = vm.allocateRawObject('Ljava/time/Instant;');
      copy.$peer = { epochMilli: BigInt(self.epochMilli ?? 0n) - BigInt(amount) };
      return copy;
    },
  },
  staticMethods: {
    'now()Ljava/time/Instant;': (_self, _args, vm) => {
      const object = vm.allocateRawObject('Ljava/time/Instant;');
      object.$peer = { epochMilli: BigInt(Date.now()) };
      return object;
    },
    'ofEpochMilli(J)Ljava/time/Instant;': (_self, [milli], vm) => {
      const object = vm.allocateRawObject('Ljava/time/Instant;');
      object.$peer = { epochMilli: BigInt(milli) };
      return object;
    },
    'ofEpochSecond(J)Ljava/time/Instant;': (_self, [seconds], vm) => {
      const object = vm.allocateRawObject('Ljava/time/Instant;');
      object.$peer = { epochMilli: BigInt(seconds) * 1000n };
      return object;
    },
  },
});

const DATE_METHODS = JAVA_CORE_CLASSES['Ljava/util/Date;'].methods;
const DATE_STATIC = JAVA_CORE_CLASSES['Ljava/util/Date;'].staticMethods;
function datePeer(self) {
  return { date: new Date(Number(self.time ?? 0)) };
}
function storeDate(self, date) {
  self.time = date.getTime();
}
DATE_METHODS.set('<init>(III)V', (self, [year, month, day]) => {
  storeDate(self, new Date(Number(year) + 1900, toInt(month), toInt(day)));
});
DATE_METHODS.set('<init>(IIIII)V', (self, [year, month, day, hour, minute]) => {
  storeDate(self, new Date(Number(year) + 1900, toInt(month), toInt(day), toInt(hour), toInt(minute)));
});
DATE_METHODS.set('<init>(IIIIII)V', (self, [year, month, day, hour, minute, second]) => {
  storeDate(self, new Date(Number(year) + 1900, toInt(month), toInt(day), toInt(hour), toInt(minute), toInt(second)));
});
DATE_METHODS.set('<init>(Ljava/lang/String;)V', (self, [text]) => {
  const parsed = Date.parse(jsString(text));
  self.time = Number.isNaN(parsed) ? 0 : parsed;
});
DATE_METHODS.set('getYear()I', (self) => datePeer(self).date.getFullYear() - 1900);
DATE_METHODS.set('setYear(I)V', (self, [year]) => {
  const { date } = datePeer(self);
  const value = toInt(year);
  date.setFullYear(value >= 0 && value <= 99 ? value + 1900 : value);
  storeDate(self, date);
});
DATE_METHODS.set('getMonth()I', (self) => datePeer(self).date.getMonth());
DATE_METHODS.set('setMonth(I)V', (self, [month]) => {
  const { date } = datePeer(self);
  date.setMonth(toInt(month));
  storeDate(self, date);
});
DATE_METHODS.set('getDate()I', (self) => datePeer(self).date.getDate());
DATE_METHODS.set('setDate(I)V', (self, [day]) => {
  const { date } = datePeer(self);
  date.setDate(toInt(day));
  storeDate(self, date);
});
DATE_METHODS.set('getDay()I', (self) => datePeer(self).date.getDay());
DATE_METHODS.set('getHours()I', (self) => datePeer(self).date.getHours());
DATE_METHODS.set('setHours(I)V', (self, [hour]) => {
  const { date } = datePeer(self);
  date.setHours(toInt(hour));
  storeDate(self, date);
});
DATE_METHODS.set('getMinutes()I', (self) => datePeer(self).date.getMinutes());
DATE_METHODS.set('setMinutes(I)V', (self, [minute]) => {
  const { date } = datePeer(self);
  date.setMinutes(toInt(minute));
  storeDate(self, date);
});
DATE_METHODS.set('getSeconds()I', (self) => datePeer(self).date.getSeconds());
DATE_METHODS.set('setSeconds(I)V', (self, [second]) => {
  const { date } = datePeer(self);
  date.setSeconds(toInt(second));
  storeDate(self, date);
});
DATE_METHODS.set('toLocaleString()Ljava/lang/String;', (self) => datePeer(self).date.toLocaleString());
DATE_METHODS.set('toGMTString()Ljava/lang/String;', (self) => datePeer(self).date.toUTCString());
DATE_METHODS.set('getTimezoneOffset()I', (self) => -datePeer(self).date.getTimezoneOffset());
DATE_METHODS.set('toInstant()Ljava/time/Instant;', (self, _args, vm) => {
  const object = vm.allocateRawObject('Ljava/time/Instant;');
  object.$peer = { epochMilli: BigInt(Math.trunc(Number(self.time ?? 0))) };
  return object;
});
DATE_STATIC.set('UTC(IIIIII)J', (_self, [year, month, day, hour, minute, second]) =>
  BigInt(Date.UTC(Number(year) + 1900, toInt(month), toInt(day), toInt(hour), toInt(minute), toInt(second))));
DATE_STATIC.set('parse(Ljava/lang/String;)J', (_self, [text]) => {
  const parsed = Date.parse(jsString(text));
  return BigInt(Number.isNaN(parsed) ? 0 : parsed);
});
DATE_STATIC.set('from(Ljava/time/Instant;)Ljava/util/Date;', (_self, [instant], vm) => {
  const object = vm.allocateRawObject('Ljava/util/Date;');
  object.$peer = { time: Number(instant?.$peer?.epochMilli ?? 0) };
  return object;
});
