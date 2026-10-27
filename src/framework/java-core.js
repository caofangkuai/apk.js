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

export function nativeDef(descriptor, options = {}) {
  return new NativeClassDef(descriptor, options);
}

export function jsString(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (isJavaObject(value)) {
    if (value.$string !== undefined) return value.$string;
    if (Array.isArray(value.$peer?.parts)) return value.$peer.parts.join('');
    if (value.$peer && typeof value.$peer.toString === 'function') {
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

function mapKey(value) {
  if (value === null || value === undefined) return 'null:';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int:' + (value | 0) : 'num:' + value;
  if (typeof value === 'string') return 'str:' + value;
  if (typeof value === 'boolean') return 'bool:' + value;
  if (isJavaObject(value)) {
    const peer = value.$peer;
    if (peer && peer.value !== undefined && typeof peer.value !== 'object') return 'num:' + peer.value;
    if (value.$string !== undefined) return 'str:' + value.$string;
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

export const JAVA_CORE_CLASSES = {
  'Ljava/lang/Object;': nativeDef('Ljava/lang/Object;', {
    super: null,
    methods: {
      '<init>()V': () => undefined,
      'toString()Ljava/lang/String;': (self) => (isJavaObject(self) ? `${self.$dexClass?.name || 'Object'}@${hashCode(self).toString(16)}` : String(self)),
      'equals(Ljava/lang/Object;)Z': (self, [other]) => self === other,
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
        console.error('CTOR-HIT ' + JSON.stringify(Object.keys(self || {})));
        const peer = self.$peer || self;
        if (!peer || !peer.classDesc) return null;
        const values = args?.$data ? [...args.$data] : [];
        const made = vm.instantiate(peer.classDesc, values);
        console.error('CTOR-NEWINST ' + peer.classDesc + ' -> ' + (made === null ? 'NULL' : (made?.$dexClass?.descriptor || made?.$nativeClass || typeof made)));
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
  'Ljava/lang/Class;': nativeDef('Ljava/lang/Class;', {
    super: 'Ljava/lang/Object;',
    staticMethods: {
      'forName(Ljava/lang/String;)Ljava/lang/Class;': (self, [name], vm) => {
        const text = typeof name === 'string' ? name : name?.$value ?? String(name ?? '');
        const descriptor = text.startsWith('L') || text.startsWith('[') ? text : `L${text.replace(/\./g, '/')};`;
        return vm.getClassObject(descriptor);
      },
      'forName(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;': (self, [name], vm) => {
        const text = typeof name === 'string' ? name : name?.$value ?? String(name ?? '');
        const descriptor = text.startsWith('L') || text.startsWith('[') ? text : `L${text.replace(/\./g, '/')};`;
        return vm.getClassObject(descriptor);
      },
    },
    methods: {
      'getName()Ljava/lang/String;': (self) => self.$name || descriptorToName(self.$descriptor || ''),
      'getCanonicalName()Ljava/lang/String;': (self) => self.$name || descriptorToName(self.$descriptor || ''),
      'getSimpleName()Ljava/lang/String;': (self) => {
        const full = self.$name || descriptorToName(self.$descriptor || '');
        const simple = full.split('.').filter(Boolean).pop() || full;
        return simple.split('$').pop();
      },
      'getTypeName()Ljava/lang/String;': (self) => self.$name || descriptorToName(self.$descriptor || ''),
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
        if (process.env.DBG_INV) console.error('GETCTOR ' + self.$descriptor + ' params=' + (paramTypes?.$data?.length ?? 'null') + ' -> ' + (result ? 'ok' : 'NULL'));
        return result;
      },
      'getDeclaredConstructor([Ljava/lang/Class;)Ljava/lang/reflect/Constructor;': (self, [paramTypes], vm) =>
        findConstructor(vm, self.$descriptor, paramTypes, { declaredOnly: true }),
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
        self.message = message === null || message === undefined ? null : jsString(message);
      },
      'getMessage()Ljava/lang/String;': (self) => (self.message === null || self.message === undefined ? null : self.message),
      'getLocalizedMessage()Ljava/lang/String;': (self) => self.message ?? null,
      'toString()Ljava/lang/String;': (self) => self.message ?? 'Throwable',
      'printStackTrace()V': (self, _args, vm) => vm.log('error', 'java', self.message || 'Throwable'),
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
      'lastIndexOf(I)I': (self, [ch]) => jsString(self).lastIndexOf(String.fromCharCode(toInt(ch))),
      'lastIndexOf(Ljava/lang/String;)I': (self, [text]) => jsString(self).lastIndexOf(jsString(text)),
      'contains(Ljava/lang/CharSequence;)Z': (self, [text]) => jsString(self).includes(jsString(text)),
      'startsWith(Ljava/lang/String;)Z': (self, [text]) => jsString(self).startsWith(jsString(text)),
      'endsWith(Ljava/lang/String;)Z': (self, [text]) => jsString(self).endsWith(jsString(text)),
      'replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Ljava/lang/String;': (self, [from, toLog]) =>
        jsString(self).split(jsString(from)).join(jsString(toLog)),
      'replace(CC)Ljava/lang/String;': (self, [from, toLog]) =>
        jsString(self).split(String.fromCharCode(toInt(from))).join(String.fromCharCode(toInt(toLog))),
      'toUpperCase()Ljava/lang/String;': (self) => jsString(self).toUpperCase(),
      'toLowerCase()Ljava/lang/String;': (self) => jsString(self).toLowerCase(),
      'trim()Ljava/lang/String;': (self) => jsString(self).trim(),
      'isEmpty()Z': (self) => jsString(self).length === 0,
      'split(Ljava/lang/String;)[Ljava/lang/String;': (self, [pattern], vm) => {
        const parts = jsString(self).split(jsString(pattern));
        return vm.newArray('[Ljava/lang/String;', parts.length, parts);
      },
      'toCharArray()[C': (self, _args, vm) => {
        const text = jsString(self);
        const array = vm.newArray('[C', text.length);
        for (let i = 0; i < text.length; i++) array.$data[i] = text.charCodeAt(i);
        return array;
      },
      'getBytes()[B': (self) => {
        const encoded = new TextEncoder().encode(jsString(self));
        return { $type: '[B', $data: Array.from(encoded) };
      },
      'compareTo(Ljava/lang/String;)I': (self, [other]) => {
        const a = jsString(self);
        const b = jsString(other);
        return a < b ? -1 : a > b ? 1 : 0;
      },
      'matches(Ljava/lang/String;)Z': (self, [pattern]) => {
        try {
          return new RegExp(`^(?:${jsString(pattern)})$`).test(jsString(self));
        } catch {
          return false;
        }
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
      'format(Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;': (_self, [format, args]) => {
        const values = isJavaArray(args) ? args.$data : [];
        let index = 0;
        return jsString(format).replace(/%(\d+\$)?([sdifxX%])/g, (match, positional, type) => {
          if (type === '%') return '%';
          const at = positional ? parseInt(positional, 10) - 1 : index++;
          const value = values[at];
          if (type === 'd') return String(toInt(value));
          if (type === 'f') return (Number(value) || 0).toFixed(2);
          if (type === 'x') return toInt(value).toString(16);
          if (type === 'X') return toInt(value).toString(16).toUpperCase();
          return jsString(value);
        });
      },
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
      '<init>(I)V': (self) => {
        self.parts = [];
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
        self.parts = [self.parts.join('').slice(0, toInt(length))];
      },
      'charAt(I)C': (self, [index]) => self.parts.join('').charCodeAt(toInt(index)),
      'insert(ILjava/lang/String;)Ljava/lang/StringBuilder;': (self, [index, value]) => {
        const text = self.parts.join('');
        self.parts = [text.slice(0, toInt(index)) + jsString(value) + text.slice(toInt(index))];
        return self.object || self;
      },
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
    ]),
  }),
  'Ljava/lang/Float;': floatDef('Ljava/lang/Float;', 'F'),
  'Ljava/lang/Double;': floatDef('Ljava/lang/Double;', 'D'),
  'Ljava/lang/Character;': nativeDef('Ljava/lang/Character;', {
    super: 'Ljava/lang/Object;',
    staticMethods: {
      'isDigit(C)Z': (_self, [value]) => /\d/.test(String.fromCharCode(toInt(value))),
      'isLetter(C)Z': (_self, [value]) => /[a-zA-Z]/.test(String.fromCharCode(toInt(value))),
      'toString(C)Ljava/lang/String;': (_self, [value]) => String.fromCharCode(toInt(value)),
    },
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
        for (let i = 0; i < count; i++) dst.$data[to + i] = src.$data[from + i];
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
      'exp(D)D': (_self, [v]) => Math.exp(Number(v)),
      'toRadians(D)D': (_self, [v]) => (Number(v) * Math.PI) / 180,
    },
    staticFields: new Map([['PI:D', Math.PI], ['E:D', Math.E]]),
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
        if (self.runnable) vm.runRunnable(self.runnable);
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
      'toString(Ljava/lang/Object;)Ljava/lang/String;': (_self, [v]) => (v === null ? 'null' : jsString(v)),
    },
  }),

  'Ljava/util/ArrayList;': nativeDef('Ljava/util/ArrayList;', {
    super: 'Ljava/lang/Object;',
    interfaces: ['Ljava/util/List;', 'Ljava/util/Collection;'],
    ctor: peerClass(function () {
      this.items = [];
    }, { items: [] }),
    methods: listMethods(),
  }),
  'Ljava/util/HashMap;': nativeDef('Ljava/util/HashMap;', {
    super: 'Ljava/lang/Object;',
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

JAVA_CORE_CLASSES['Ljava/util/List;'] = nativeDef('Ljava/util/List;', { super: null });
JAVA_CORE_CLASSES['Ljava/util/Set;'] = nativeDef('Ljava/util/Set;', { super: 'Ljava/util/Collection;' });
JAVA_CORE_CLASSES['Ljava/util/Collection;'] = nativeDef('Ljava/util/Collection;', {
  super: null,
  methods: {
    'iterator()Ljava/util/Iterator;': (self, _args, vm) => makeIterator(vm, self.items || self.setItems || []),
    'size()I': (self) => (self.items || self.setItems || []).length,
    'isEmpty()Z': (self) => (self.items || self.setItems || []).length === 0,
    'remove(Ljava/lang/Object;)Z': (self, [value]) => {
      const list = self.items || self.setItems || [];
      const index = list.indexOf(value);
      if (index < 0) return false;
      list.splice(index, 1);
      return true;
    },
    'removeAll(Ljava/util/Collection;)Z': (self, [other]) => {
      const list = self.items || self.setItems || [];
      const otherItems = other?.items || other?.setItems || [];
      let changed = false;
      for (let i = list.length - 1; i >= 0; i--) {
        if (otherItems.includes(list[i])) {
          list.splice(i, 1);
          changed = true;
        }
      }
      return changed;
    },
    'addAll(Ljava/util/Collection;)Z': (self, [other]) => {
      const list = self.items || self.setItems || [];
      const otherItems = other?.items || other?.setItems || [];
      list.push(...otherItems);
      return otherItems.length > 0;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value]) => (self.items || self.setItems || []).includes(value),
    'toArray()[Ljava/lang/Object;': (self, _args, vm) => {
      const list = self.items || self.setItems || [];
      const array = vm.newArray('[Ljava/lang/Object;', list.length);
      for (let i = 0; i < list.length; i++) array.$data[i] = list[i];
      return array;
    },
    'toArray([Ljava/lang/Object;)[Ljava/lang/Object;': (self, [target], vm) => {
      const list = self.items || self.setItems || [];
      if (target && target.$data) {
        for (let i = 0; i < list.length; i++) target.$data[i] = list[i];
        if (target.$data.length > list.length) target.$data[list.length] = null;
        return target;
      }
      const array = vm.newArray('[Ljava/lang/Object;', list.length);
      for (let i = 0; i < list.length; i++) array.$data[i] = list[i];
      return array;
    },
    'clear()V': (self) => {
      const list = self.items || self.setItems;
      if (list) list.length = 0;
    },
  },
});
JAVA_CORE_CLASSES['Ljava/util/Iterator;'] = nativeDef('Ljava/util/Iterator;', {
  super: null,
  methods: {
    'hasNext()Z': (self) => self.cursor < self.snapshot.length,
    'next()Ljava/lang/Object;': (self) => {
      if (self.cursor >= self.snapshot.length) return null;
      return self.snapshot[self.cursor++] ?? null;
    },
    'remove()V': () => undefined,
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
    'sort(Ljava/util/List;)V': (self, [list]) => {
      const items = list?.items;
      if (Array.isArray(items)) items.sort((a, b) => String(jsString(a)).localeCompare(String(jsString(b))));
    },
    'reverse(Ljava/util/List;)V': (self, [list]) => {
      list?.items?.reverse?.();
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
      self.items = [...(other?.items || other?.setItems || [])];
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
    'add(Ljava/lang/Object;)Z': (self, [value]) => {
      if (self.setItems.includes(value)) return false;
      self.setItems.push(value);
      return true;
    },
    'remove(Ljava/lang/Object;)Z': (self, [value]) => {
      const index = self.setItems.indexOf(value);
      if (index < 0) return false;
      self.setItems.splice(index, 1);
      return true;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value]) => self.setItems.includes(value),
    'size()I': (self) => self.setItems.length,
    'isEmpty()Z': (self) => self.setItems.length === 0,
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
    '<init>(Ljava/util/Collection;)V': (self, [other]) => {
      self.setItems = [...(other?.setItems || other?.items || [])];
    },
    'add(Ljava/lang/Object;)Z': (self, [value]) => {
      if (self.setItems.includes(value)) return false;
      self.setItems = [...self.setItems, value];
      return true;
    },
    'addIfAbsent(Ljava/lang/Object;)Z': (self, [value]) => {
      if (self.setItems.includes(value)) return false;
      self.setItems = [...self.setItems, value];
      return true;
    },
    'remove(Ljava/lang/Object;)Z': (self, [value]) => {
      const index = self.setItems.indexOf(value);
      if (index < 0) return false;
      self.setItems = self.setItems.filter((_item, i) => i !== index);
      return true;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value]) => self.setItems.includes(value),
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
JAVA_CORE_CLASSES['Ljava/util/Map;'] = nativeDef('Ljava/util/Map;', { super: null });

function makeIterator(vm, source) {
  const object = vm.allocateRawObject('Ljava/util/Iterator;');
  object.$peer = { cursor: 0, snapshot: [...source] };
  return object;
}

function makeList(vm, items) {
  const object = vm.allocateRawObject('Ljava/util/ArrayList;');
  object.$peer = { items: [...items] };
  return object;
}

function makeSet(vm, items) {
  const object = vm.allocateRawObject('Ljava/util/HashSet;');
  object.$peer = { setItems: [...items] };
  return object;
}

function makeMap(vm) {
  const object = vm.allocateRawObject('Ljava/util/HashMap;');
  object.$peer = { map: new Map() };
  return object;
}

function integerDef(descriptor, bits) {
  const isLong = bits === 64;
  const wrap = (value, vm) => vm.wrapPeer({ value: isLong ? toLong(value) : toInt(value) });
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
      '<init>(Ljava/lang/String;)V': (self, [value]) => {
        const parsed = isLong ? BigInt(jsString(value) || '0') : parseInt(jsString(value), 10) | 0;
        self.value = parsed;
      },
      'intValue()I': (self) => toInt(self.value),
      'longValue()J': (self) => toLong(self.value),
      'toString()Ljava/lang/String;': (self) => (isLong ? toLong(self.value).toString() : String(toInt(self.value))),
    },
    staticMethods: {
      'parseInt(Ljava/lang/String;)I': (_self, [value]) => parseInt(jsString(value).trim(), 10) | 0,
      'parseInt(Ljava/lang/String;I)I': (_self, [value, radix]) => parseInt(jsString(value).trim(), toInt(radix)) | 0,
      'parseLong(Ljava/lang/String;)J': (_self, [value]) => BigInt(jsString(value).trim() || '0'),
      'valueOf(I)Ljava/lang/Integer;': (_self, [value], vm) => wrap(value, vm),
      'valueOf(J)Ljava/lang/Long;': (_self, [value], vm) => wrap(value, vm),
      'valueOf(Ljava/lang/String;)Ljava/lang/Integer;': (_self, [value], vm) => wrap(parseInt(jsString(value), 10), vm),
      'toString(I)Ljava/lang/String;': (_self, [value]) => String(toInt(value)),
      'toString(J)Ljava/lang/String;': (_self, [value]) => toLong(value).toString(),
      'toHexString(I)Ljava/lang/String;': (_self, [value]) => (toInt(value) >>> 0).toString(16),
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
    },
    staticFields: new Map([['MAX_VALUE:F', 3.4028235e38], ['MIN_VALUE:F', 1.4e-45]]),
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
      const index = self.items.indexOf(value);
      if (index >= 0) {
        self.items.splice(index, 1);
        return true;
      }
      return false;
    },
    'contains(Ljava/lang/Object;)Z': (self, [value]) => self.items.includes(value),
    'indexOf(Ljava/lang/Object;)I': (self, [value]) => self.items.indexOf(value),
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
    'put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, value]) => {
      const k = mapKey(key);
      if (!self.rawKeys) self.rawKeys = new Map();
      const previous = self.map.get(k);
      self.map.set(k, value);
      self.rawKeys.set(k, key);
      return previous ?? null;
    },
    'putIfAbsent(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, value]) => {
      const k = mapKey(key);
      if (self.map.has(k) && self.map.get(k) != null) return self.map.get(k);
      self.map.set(k, value);
      return null;
    },
    'getOrDefault(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;': (self, [key, fallback]) => {
      const value = self.map.get(mapKey(key));
      return value == null ? fallback : value;
    },
    'get(Ljava/lang/Object;)Ljava/lang/Object;': (self, [key]) => self.map.get(mapKey(key)) ?? null,
    'containsKey(Ljava/lang/Object;)Z': (self, [key]) => self.map.has(mapKey(key)),
    'containsValue(Ljava/lang/Object;)Z': (self, [value]) => {
      const target = mapKey(value);
      for (const v of self.map.values()) if (mapKey(v) === target) return true;
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
    'remove(Ljava/lang/Object;)Ljava/lang/Object;': (self, [key]) => {
      const k = mapKey(key);
      const previous = self.map.get(k);
      self.map.delete(k);
      return previous ?? null;
    },
    'size()I': (self) => self.map.size,
    'isEmpty()Z': (self) => self.map.size === 0,
    'clear()V': (self) => {
      self.map = new Map();
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

function filePeerClass() {
  return peerClass(function (path) {
    this.path = typeof path === 'string' ? path : String(path ?? '');
  }, { path: '' });
}

JAVA_CORE_CLASSES['Ljava/io/Serializable;'] ??= nativeDef('Ljava/io/Serializable;', { super: null });
JAVA_CORE_CLASSES['Ljava/io/Closeable;'] ??= nativeDef('Ljava/io/Closeable;', { super: null });
JAVA_CORE_CLASSES['Ljava/io/InputStream;'] ??= nativeDef('Ljava/io/InputStream;', { super: 'Ljava/lang/Object;', interfaces: ['Ljava/io/Closeable;'] });
JAVA_CORE_CLASSES['Ljava/io/OutputStream;'] ??= nativeDef('Ljava/io/OutputStream;', { super: 'Ljava/lang/Object;', interfaces: ['Ljava/io/Closeable;', 'Ljava/io/Flushable;'] });
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
    'mkdir()Z': (self) => VIRTUAL_FS.mkdirs(self.path),
    'mkdirs()Z': (self) => VIRTUAL_FS.mkdirs(self.path),
    'delete()Z': (self) => {
      const normalized = VIRTUAL_FS.normalize(self.path);
      VIRTUAL_FS.dirs.delete(normalized);
      return VIRTUAL_FS.files.delete(normalized);
    },
    'list()[Ljava/lang/String;': (self) => VIRTUAL_FS.list(self.path),
    'listFiles()[Ljava/io/File;': (self, _args, vm) =>
      VIRTUAL_FS.list(self.path).map((name) => wrapFilePath(vm, joinPaths(self.path, name))),
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

export { VIRTUAL_FS, wrapFilePath, joinPaths };

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
