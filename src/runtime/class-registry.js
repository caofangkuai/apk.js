import { isJavaArray, isJavaObject } from './values.js';

export class NativeClassDef {
  constructor(descriptor, options = {}) {
    this.descriptor = descriptor;
    this.name = descriptor.slice(1, -1).replace(/\//g, '.');
    this.superDescriptor = options.super || (descriptor === 'Ljava/lang/Object;' ? null : 'Ljava/lang/Object;');
    this.interfaces = options.interfaces || [];
    this.ctor = options.ctor || null;
    this.methods = toMethodMap(options.methods);
    this.staticMethods = toMethodMap(options.staticMethods);
    this.staticFields = toValueMap(options.staticFields);
    this.instanceFields = toValueMap(options.instanceFields);
    this.abstract = options.abstract || false;
  }

  findInstanceMethod(name, proto) {
    const key = mangleMethodKey(name, proto);
    return (
      this.methods.get(key) ||
      this.methods.get(`${name}${proto}`) ||
      matchWildcard(this.methods, key) ||
      null
    );
  }

  findStaticMethod(name, proto) {
    const key = mangleMethodKey(name, proto);
    return (
      this.staticMethods.get(key) ||
      this.staticMethods.get(`${name}${proto}`) ||
      matchWildcard(this.staticMethods, key) ||
      null
    );
  }
}

function toMethodMap(input) {
  const map = new Map();
  if (!input) return map;
  if (input instanceof Map) {
    for (const [key, value] of input) map.set(mangleMethodKey(...splitMethodKey(key)), value);
    return map;
  }
  for (const [key, value] of Object.entries(input)) {
    map.set(mangleMethodKey(...splitMethodKey(key)), value);
  }
  return map;
}

function toValueMap(input) {
  const map = new Map();
  if (!input) return map;
  if (input instanceof Map) {
    for (const [key, value] of input) map.set(key, value);
    return map;
  }
  for (const [key, value] of Object.entries(input)) map.set(key, value);
  return map;
}

function splitMethodKey(key) {
  const open = key.indexOf('(');
  if (open === -1) return [key, ''];
  return [key.slice(0, open), key.slice(open)];
}

function mangleMethodKey(name, proto) {
  return `${name}${proto}`;
}

function matchWildcard(map, key) {
  const open = key.indexOf('(');
  if (open === -1) return null;
  const wildcard = `${key.slice(0, open)}(*)`;
  return map.get(wildcard) || null;
}

export class RuntimeClass {
  constructor(descriptor, { dexClass = null, nativeDef = null } = {}) {
    this.descriptor = descriptor;
    this.dexClass = dexClass;
    this.nativeDef = nativeDef;
    this.initialized = false;
    this.initializing = false;
    this.staticValues = new Map();
  }

  get name() {
    return this.descriptor.startsWith('L') ? this.descriptor.slice(1, -1).replace(/\//g, '.') : this.descriptor;
  }

  get superDescriptor() {
    return this.dexClass?.superclass || this.nativeDef?.superDescriptor || null;
  }

  get interfaces() {
    return this.dexClass?.interfaces || this.nativeDef?.interfaces || [];
  }

  get isNativeOnly() {
    return !this.dexClass && !!this.nativeDef;
  }

  findDeclaredStaticField(field) {
    if (this.dexClass) {
      for (const entry of this.dexClass.staticFields) {
        if (entry.field.name === field.name && entry.field.type === field.type) return entry;
      }
    }
    return this.nativeDef?.instanceFields?.get?.(`${field.name}:${field.type}`) || null;
  }

  staticFieldKey(field) {
    return `${field.name}:${field.type}`;
  }
}

export class ClassRegistry {
  constructor(vm, dexFile) {
    this.vm = vm;
    this.dexFile = dexFile;
    this.nativeDefs = new Map();
    this.cache = new Map();
    this.wrappers = new Map();
  }

  findDexClass(descriptor) {
    if (this.dexFile) {
      const fromPrimary = this.dexFile.findClass(descriptor);
      if (fromPrimary) return fromPrimary;
    }
    const dexFiles = this.vm?.dexFiles;
    if (Array.isArray(dexFiles)) {
      for (const dex of dexFiles) {
        if (!dex || dex === this.dexFile) continue;
        const found = dex.findClass ? dex.findClass(descriptor) : null;
        if (found) return found;
      }
    }
    return null;
  }

  registerNative(def) {
    this.nativeDefs.set(def.descriptor, def);
    this.cache.delete(def.descriptor);
    return this;
  }

  registerWrappers(map) {
    for (const [descriptor, ctor] of Object.entries(map)) {
      this.wrappers.set(descriptor, ctor);
      if (ctor) ctor.$descriptor = descriptor;
    }
  }

  registerNativeClass(descriptor, options) {
    const def = options instanceof NativeClassDef ? options : new NativeClassDef(descriptor, options);
    return this.registerNative(def);
  }

  resolve(descriptor) {
    if (!descriptor) return null;
    let found = this.cache.get(descriptor);
    if (found) return found;
    const dexClass = this.findDexClass(descriptor);
    const nativeDef = this.nativeDefs.get(descriptor) || null;
    if (!dexClass && !nativeDef) {
      if (descriptor.startsWith('[')) {
        found = new RuntimeClass(descriptor, {
          nativeDef: new NativeClassDef(descriptor, { super: 'Ljava/lang/Object;' }),
        });
      } else {
        found = new RuntimeClass(descriptor, {
          nativeDef: new NativeClassDef(descriptor, { super: 'Ljava/lang/Object;' }),
        });
      }
    } else {
      found = new RuntimeClass(descriptor, { dexClass, nativeDef });
    }
    this.cache.set(descriptor, found);
    return found;
  }

  resolveName(name) {
    return this.resolve(`L${name.replace(/\./g, '/')};`);
  }

  getPeer(receiver, preferredDescriptor = null) {
    if (receiver === null || receiver === undefined) {
      this.vm.throwException('Ljava/lang/NullPointerException;', 'Attempt to invoke virtual method on a null object reference');
    }
    if (!isJavaObject(receiver)) return receiver;
    if (receiver.$peer) return receiver.$peer;
    let descriptor =
      receiver.$nativeClass ||
      receiver.$runtimeClass?.descriptor ||
      preferredDescriptor;
    if (!descriptor && receiver.$dexClass) {
      descriptor = receiver.$dexClass.superclass;
    }
    const def = descriptor ? this.nativeDefs.get(descriptor) : null;
    if (!def || !def.ctor) {
      let cursor = null;
      if (receiver.$dexClass) {
        cursor = receiver.$dexClass.superclass;
      } else if (def) {
        cursor = def.superDescriptor;
      }
      while (cursor) {
        const candidate = this.nativeDefs.get(cursor);
        if (candidate && candidate.ctor) {
          receiver.$peer = new candidate.ctor(this.vm, receiver);
          return receiver.$peer;
        }
        const rc = this.resolve(cursor);
        cursor = rc?.superDescriptor || null;
      }
      return receiver;
    }
    if (!receiver.$nativeClass && receiver.$runtimeClass?.descriptor) {
      receiver.$nativeClass = receiver.$runtimeClass.descriptor;
    }
    receiver.$peer = new def.ctor(this.vm, receiver);
    return receiver.$peer;
  }

  hasPeer(receiver) {
    return isJavaObject(receiver) && !!receiver.$peer;
  }

  wrap(peer, descriptor, extra = {}) {
    const obj = this.vm.allocateObject(this.resolve(descriptor));
    obj.$peer = peer;
    obj.$nativeClass = descriptor;
    Object.assign(obj, extra);
    return obj;
  }

  wrapPrimitiveArray(values, descriptor = '[I') {
    return { $type: descriptor, $data: values };
  }

  classNameOf(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return 'Ljava/lang/String;';
    if (typeof value === 'boolean') return 'Z';
    if (typeof value === 'bigint') return 'J';
    if (typeof value === 'number') return 'I';
    if (isJavaArray(value)) return value.$type;
    if (isJavaObject(value)) {
      return (
        value.$dexClass?.descriptor ||
        value.$runtimeClass?.descriptor ||
        value.$nativeClass ||
        'Ljava/lang/Object;'
      );
    }
    if (typeof value === 'object' && value.$descriptor) return value.$descriptor;
    if (typeof value === 'object' && value.constructor?.$descriptor) return value.constructor.$descriptor;
    return 'Ljava/lang/Object;';
  }

  isAssignable(fromDescriptor, toDescriptor) {
    if (!toDescriptor) return true;
    if (!fromDescriptor) return false;
    if (fromDescriptor === toDescriptor) return true;
    if (toDescriptor === 'Ljava/lang/Object;') return true;
    if (fromDescriptor.startsWith('[')) {
      if (toDescriptor === 'Ljava/lang/Cloneable;' || toDescriptor === 'Ljava/io/Serializable;') return true;
      if (toDescriptor.startsWith('[')) {
        return this.isAssignable(fromDescriptor.slice(1), toDescriptor.slice(1));
      }
      return false;
    }
    if (fromDescriptor.length === 1 || toDescriptor.length === 1) return false;
    const visited = new Set();
    const walk = (descriptor) => {
      if (!descriptor || visited.has(descriptor)) return false;
      visited.add(descriptor);
      if (descriptor === toDescriptor) return true;
      const rc = this.resolve(descriptor);
      if (!rc) return false;
      for (const iface of rc.interfaces) {
        if (walk(iface)) return true;
      }
      return walk(rc.superDescriptor);
    };
    if (!this.resolve(fromDescriptor)) return true;
    const fromClass = this.resolve(fromDescriptor);
    if (!fromClass.dexClass) {
      const def = fromClass.nativeDef;
      const isPlaceholder = !def || (!def.ctor && def.methods.size === 0 && def.interfaces.length === 0 && def.superDescriptor === 'Ljava/lang/Object;' && def.descriptor === fromDescriptor);
      if (isPlaceholder) return true;
    }
    return walk(fromDescriptor);
  }

  checkCast(value, descriptor) {
    if (value === null || value === undefined || value === 0) return null;
    const actual = this.classNameOf(value);
    if (!this.isAssignable(actual, descriptor)) {
      if (this.vm.debugCast) console.error('CASTFAIL obj=' + actual + ' -> ' + descriptor + ' peer=' + (value?.$peer?.constructor?.$descriptor) + ' d=' + value?.$descriptor + ' keys=' + (value && typeof value === 'object' ? Object.keys(value).slice(0,8).join('|') : typeof value) + ' isVM=' + (value === this.vm) + ' ctor=' + (value?.constructor?.name) + ' stack=' + (this.vm.methodStack||[]).slice(-8).join(' <- '));
      this.vm.throwException(
        'Ljava/lang/ClassCastException;',
        `${actual} cannot be cast to ${descriptor}`
      );
    }
    return value;
  }

  instanceOf(value, descriptor) {
    if (value === null || value === undefined) return false;
    return this.isAssignable(this.classNameOf(value), descriptor);
  }
}
