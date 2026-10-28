import { DexFile, descriptorToName } from '../dex/dexfile.js';
import { ClassRegistry, RuntimeClass } from './class-registry.js';
import {
  JavaArray,
  JavaObject,
  defaultValueFor,
  hashCode,
  isJavaArray,
  isJavaObject,
  isWideType,
  stringify,
  toInt,
  toLong,
} from './values.js';
import { DBG } from './debug.js';

export class VMRuntimeError extends Error {
  constructor(javaException, message) {
    super(message || javaException?.$exceptionMessage || 'Java 异常');
    this.name = 'VMRuntimeError';
    this.javaException = javaException;
  }
}

globalThis.CAS_DBG = process.env.CAS_DBG === '1';
globalThis.FV_DBG = process.env.FV_DBG === '1';
function jsStringDump(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return typeof v + ':' + v;
  return (v.$descriptor || 'obj') + ':peer=' + JSON.stringify(v.$peer && v.$peer.value);
}

export class JavaVM {
  constructor(options = {}) {
    this.dexFiles = options.dexFiles || [];
    this.dex = options.dexFiles?.[0] || null;
    this.registry = new ClassRegistry(this, this.dex);
    this.logger = options.logger || (() => {});
    this.screen = options.screen || null;
    this.resources = options.resources || null;
    this.assets = options.assets || null;
    this.packageName = options.packageName || '';
    this.maxFrames = options.maxFrames || 512;
    this.debugCast = process.env.DBG_CAST === '1';
    this.frameDepth = 0;
    this.mainLooper = null;
    this.pendingException = null;
    this.invocationCount = 0;
    this.nativeCallLog = [];
  }

  addDexFile(dexFile) {
    this.dexFiles.push(dexFile);
    if (!this.dex) this.dex = dexFile;
    this.registry.dexFile = this.dex;
    return this;
  }

  setSavedState(state) {
    this.savedState = state;
  }

  log(level, tag, message) {
    this.logger({ level, tag, message, time: Date.now() });
  }

  allocateObject(runtimeClass) {
    const object = new JavaObject(runtimeClass.dexClass, this);
    object.$runtimeClass = runtimeClass;
    let cursor = runtimeClass;
    const visited = new Set();
    for (;;) {
      if (!cursor || visited.has(cursor.descriptor)) break;
      visited.add(cursor.descriptor);
      if (cursor.dexClass) {
        for (const entry of cursor.dexClass.instanceFields) {
          object.$fields.set(this.fieldKey(cursor.descriptor, entry.field.name, entry.field.type), defaultValueFor(entry.field.type));
        }
      }
      cursor = cursor.superDescriptor ? this.registry.resolve(cursor.superDescriptor) : null;
    }
    return object;
  }

  currentThreadObject() {
    if (!this.mainThreadObject) {
      this.mainThreadObject = this.wrapPeer({
        constructor: { $descriptor: 'Ljava/lang/Thread;' },
        threadName: 'main',
      });
    }
    return this.mainThreadObject;
  }

  allocateRawObject(descriptor) {
    const object = new JavaObject(null, this);
    object.$nativeClass = descriptor;
    return object;
  }

  makeFile(path) {
    const object = this.allocateRawObject('Ljava/io/File;');
    object.$peer = { path: String(path ?? '') };
    return object;
  }

  getSystemService(name) {
    const key = String(name ?? '');
    if (!this.$systemServices) this.$systemServices = new Map();
    const services = this.$systemServices;
    if (services.has(key)) return services.get(key);
    const descriptorByService = {
      'notification': 'Landroid/app/NotificationManager;',
      'clipboard': 'Landroid/content/ClipboardManager;',
      'activity': 'Landroid/app/ActivityManager;',
      'window': 'Landroid/view/WindowManager;',
      'layout_inflater': 'Landroid/view/LayoutInflater;',
      'input_method': 'Landroid/view/inputmethod/InputMethodManager;',
      'connectivity': 'Landroid/net/ConnectivityManager;',
      'wifi': 'Landroid/net/wifi/WifiManager;',
      'audio': 'Landroid/media/AudioManager;',
      'vibrator': 'Landroid/os/Vibrator;',
      'power': 'Landroid/os/PowerManager;',
      'keyguard': 'Landroid/app/KeyguardManager;',
      'telephony': 'Landroid/telephony/TelephonyManager;',
      'accessibility': 'Landroid/view/accessibility/AccessibilityManager;',
      'download': 'Landroid/app/DownloadManager;',
      'uimode': 'Landroid/app/UiModeManager;',
      'display': 'Landroid/hardware/display/DisplayManager;',
      'sensor': 'Landroid/hardware/SensorManager;',
      'location': 'Landroid/location/LocationManager;',
    };
    const descriptor = descriptorByService[key];
    if (!descriptor) {
      services.set(key, null);
      return null;
    }
    const object = this.allocateRawObject(descriptor);
    object.$peer = { vm: this };
    services.set(key, object);
    return object;
  }

  focusedEditable() {
    const decor = this.screen?.decorView;
    if (!decor) return null;
    const stack = [decor];
    while (stack.length) {
      const view = stack.pop();
      if (view?.editable && view.focused) return view;
      if (Array.isArray(view?.children)) {
        for (let i = view.children.length - 1; i >= 0; i--) stack.push(view.children[i]);
      }
      if (view?.child) stack.push(view.child);
    }
    return null;
  }

  newArray(typeDescriptor, length, initial) {
    if (length < 0) this.throwException('Ljava/lang/NegativeArraySizeException;', String(length));
    let fill = undefined;
    if (initial) fill = initial;
    else if (typeDescriptor.startsWith('[') || typeDescriptor.startsWith('L')) fill = null;
    else fill = defaultValueFor(typeDescriptor);
    const data = new Array(length);
    if (fill !== undefined) data.fill(fill);
    const array = new JavaArray(typeDescriptor, data, this);
    return array;
  }

  fieldKey(classDescriptor, name, type) {
    return `${classDescriptor}->${name}:${type}`;
  }

  getField(object, field) {
    if (object === null || object === undefined) {
      if (DBG.npe && field.name === 'layoutInDisplayCutoutMode') console.error('IPUT-NULL obj=' + (obj === undefined ? 'undef' : obj === null ? 'null' : '?') + ' from ' + (this.methodStack||[]).slice(-5).join(' <- '));
      if (DBG.npe) console.error('NPE_GETFIELD', field.name, (this.methodStack||[]).slice(-6).join(' <- '));
      this.throwException('Ljava/lang/NullPointerException;', `读取字段 ${field.name} 时对象为空`);
    }
    if (!isJavaObject(object)) {
      if (typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, field.name)) {
        return object[field.name];
      }
      if (typeof object === 'object' && object.$peer && Object.prototype.hasOwnProperty.call(object.$peer, field.name)) {
        return object.$peer[field.name];
      }
      return defaultValueFor(field.type);
    }
    const key = this.fieldKey(field.classDesc, field.name, field.type);
    const stored = object.$fields.has(key) ? object.$fields.get(key) : undefined;
    if (stored !== undefined && stored !== null) return stored;
    const peer = object.$peer;
    if (peer && Object.prototype.hasOwnProperty.call(peer, field.name)) {
      const peerValue = peer[field.name];
      if (peerValue !== undefined && peerValue !== null) return peerValue;
    }
    const fallback = defaultValueFor(field.type);
    if (fallback === null && field.type === 'Ljava/lang/ClassLoader;') {
      if (!this.classLoaderObject) {
        this.classLoaderObject = this.allocateRawObject('Ljava/lang/ClassLoader;');
        this.classLoaderObject.$peer = { vm: this, constructor: { $descriptor: 'Ljava/lang/ClassLoader;' } };
      }
      return this.classLoaderObject;
    }
    return fallback;
  }

  setField(object, field, value) {
    if (object === null || object === undefined) {
      this.throwException('Ljava/lang/NullPointerException;', `写入字段 ${field.name} 时对象为空`);
    }
    if (!isJavaObject(object)) {
      if (typeof object === 'object' && object !== null) {
        object[field.name] = value;
        return;
      }
      if (DBG.npe) console.error('NOFIELD', field.name, typeof object, object, (this.methodStack||[]).slice(-6).join(' <- '));
      this.throwException('Ljava/lang/IllegalAccessError;', `对象无字段 ${field.name}`);
    }
    object.$fields.set(this.fieldKey(field.classDesc, field.name, field.type), value);
  }

  getSystemProperty(name) {
    const key = String(name);
    if (key === 'java.version') return '0';
    if (key === 'java.vendor') return 'MonkeyCode';
    if (key === 'line.separator') return '\n';
    if (key === 'file.separator') return '/';
    if (key === 'os.name') return 'Linux';
    return null;
  }

  getStaticField(field) {
    const rc = this.registry.resolve(field.classDesc);
    if (this.debugCast && field.classDesc === 'Lpc/a;') console.error('GETSTATIC', field.name, 'rc#', this._rcId?.(rc), 'has=', rc.staticValues.has(field.name+':'+field.type), 'val=', rc.staticValues.get(field.name+':'+field.type) === null ? 'null' : 'other');
    if (!rc) return defaultValueFor(field.type);
    this.ensureClassInitialized(rc);
    if (rc.dexClass) {
      const key = `${field.name}:${field.type}`;
      if (rc.staticValues.has(key)) return rc.staticValues.get(key);
      const entry = rc.dexClass.staticFields.find((e) => e.field.name === field.name && e.field.type === field.type);
      if (entry) {
        if (entry.value !== undefined) return entry.value;
        return defaultValueFor(field.type);
      }
    }
    if (rc.nativeDef) {
      const key = `${field.name}:${field.type}`;
      if (rc.nativeDef.staticFields.has(key)) {
        const value = rc.nativeDef.staticFields.get(key);
        if (value && typeof value === 'object' && typeof value.lazy === 'function') {
          const created = value.lazy.call(null, this);
          rc.nativeDef.staticFields.set(key, created);
          return created;
        }
        return value;
      }
    }
    return defaultValueFor(field.type);
  }

  _rcId(rc) {
    if (!this.__rcIds) this.__rcIds = new WeakMap();
    if (!this.__rcIds.has(rc)) this.__rcIds.set(rc, this.__rcIds.size ?? 0);
    return this.__rcIds.get(rc);
  }

  setStaticField(field, value) {
    const rc = this.registry.resolve(field.classDesc);
    this.ensureClassInitialized(rc);
    if (this.debugCast && field.classDesc === 'Lpc/a;') console.error('SETSTATIC', field.name, '=>', value === null ? 'null' : (value?.$data ? 'array['+value.$data.length+']' : typeof value), '| stack:', (this.methodStack||[]).slice(-6).join(' <- '));
    rc.staticValues.set(`${field.name}:${field.type}`, value);
  }

  getClassObject(descriptor) {
    if (!this.classObjects) this.classObjects = new Map();
    if (!this.classObjects.has(descriptor)) {
      const peer = { $descriptor: descriptor, $name: descriptorToName(descriptor) };
      this.classObjects.set(descriptor, peer);
    }
    return this.classObjects.get(descriptor);
  }

  ensureClassInitialized(runtimeClass) {
    if (!runtimeClass) return;
    if (runtimeClass.initialized || runtimeClass.initializing) return;
    runtimeClass.initializing = true;
    try {
      if (runtimeClass.superDescriptor) {
        const superClass = this.registry.resolve(runtimeClass.superDescriptor);
        this.ensureClassInitialized(superClass);
      }
      if (runtimeClass.dexClass) {
        const values = runtimeClass.dexClass.staticValues || [];
        runtimeClass.dexClass.staticFields.forEach((entry, index) => {
          const value = index < values.length ? this.convertStaticValue(values[index], entry.field.type) : undefined;
          runtimeClass.staticValues.set(`${entry.field.name}:${entry.field.type}`, value);
        });
        const clinit = runtimeClass.dexClass.findDeclaredMethod('<clinit>', '()V');
        if (clinit) this.executeMethod(clinit, null, []);
      }
      runtimeClass.initialized = true;
    } finally {
      runtimeClass.initializing = false;
    }
  }

  convertStaticValue(value, type) {
    if (value === null || value === undefined) return defaultValueFor(type);
    switch (type) {
      case 'J':
        return typeof value === 'bigint' ? value : BigInt(value);
      case 'F':
      case 'D':
        return Number(value);
      case 'Z':
        return Boolean(value);
      default:
        return value;
    }
  }

  presentActivity(activityObject, descriptor, intentObject) {
    const peer = this.registry.getPeer(activityObject, descriptor);
    if (!peer) return null;
    if (intentObject) {
      peer.intent = intentObject;
      activityObject.$fields?.set('Landroid/app/Activity;->mIntent:Landroid/content/Intent;', intentObject);
    }
    peer.ensureWindow?.();
    const lifecycles = [
      ['onCreate', '(Landroid/os/Bundle;)V', [null]],
      ['onStart', '()V', []],
      ['onResume', '()V', []],
    ];
    for (const [name, proto, args] of lifecycles) {
      const resolution = this.findVirtual(descriptor, name, proto);
      if (!resolution) continue;
      this.invoke(
        { classDesc: descriptor, name, proto: { descriptor: proto, parameters: [], returnType: 'V' } },
        activityObject,
        args,
        'virtual'
      );
    }
    peer.relayout?.();
    this.screen?.invalidate?.();
    return peer;
  }

  startActivity(intent, callerPeer = null) {
    if (!intent) {
      this.throwException('Ljava/lang/NullPointerException;', 'startActivity 的 Intent 为空');
    }
    const target = intent.$peer || intent;
    const className = target.className || null;
    if (!className) {
      this.log('warn', 'Activity', 'startActivity 忽略未指定组件的 Intent');
      return null;
    }
    const targetPackage = target.packageName || this.packageName;
    if (targetPackage && this.packageName && targetPackage !== this.packageName) {
      this.throwException(
        'Landroid/content/ActivityNotFoundException;',
        `Unable to find explicit activity class {${targetPackage}/${className}}; have you declared this activity in your AndroidManifest.xml?`
      );
    }
    const descriptor = `L${className.replace(/\./g, '/')};`;
    const declaredClass = this.dex?.findClass ? this.dex.findClass(descriptor) : this.registry.dexFile?.findClass?.(descriptor);
    const isFrameworkClass = !!this.registry.nativeDefs?.has?.(descriptor);
    if (!declaredClass && !isFrameworkClass) {
      this.throwException(
        'Landroid/content/ActivityNotFoundException;',
        `Unable to find explicit activity class {${targetPackage}/${className}}; have you declared this activity in your AndroidManifest.xml?`
      );
    }
    const runtimeClass = this.registry.resolve(descriptor);
    if (!this.activityStack) this.activityStack = [];
    if (callerPeer) {
      this.savedState = callerPeer;
      this.activityStack.push(callerPeer);
    }
    const activityObject = this.instantiate(descriptor, []);
    this.activity = activityObject;
    this.activityDescriptor = descriptor;
    this.presentActivity(activityObject, descriptor, intent);
    return activityObject;
  }

  throwException(descriptor, message) {
    const exception = this.allocateRawObject(descriptor);
    exception.$exceptionMessage = message;
    const rc = this.registry.resolve(descriptor);
    exception.$runtimeClass = rc;
    if (rc?.dexClass) {
      exception.$dexClass = rc.dexClass;
      const ctor = rc.dexClass.findDeclaredMethod('<init>', '(Ljava/lang/String;)V');
      if (ctor) {
        try {
          this.executeMethod(ctor, exception, [message]);
        } catch {
          // 构造异常对象失败时保留原始信息
        }
      }
    }
    throw new VMRuntimeError(exception, message);
  }

  throwJava(exception) {
    throw new VMRuntimeError(exception, exception?.$exceptionMessage || 'Java 异常');
  }

  resolveMethod(classDescriptor, name, proto, { isStatic = false } = {}) {
    const rc = this.registry.resolve(classDescriptor);
    if (!rc) return null;
    if (rc.dexClass) {
      const found = rc.dexClass.findDeclaredMethod(name, proto);
      if (found) return { kind: 'dex', method: found };
    }
    if (rc.nativeDef) {
      const fn = isStatic ? rc.nativeDef.findStaticMethod(name, proto) : rc.nativeDef.findInstanceMethod(name, proto);
      if (fn) return { kind: 'native', fn, def: rc.nativeDef };
    }
    return null;
  }

  findVirtual(classDescriptor, name, proto, { includeThis = true } = {}) {
    const visited = new Set();
    const walk = (descriptor) => {
      if (!descriptor || visited.has(descriptor)) return null;
      visited.add(descriptor);
      const rc = this.registry.resolve(descriptor);
      if (!rc) return null;
      if (rc.dexClass) {
        const found = rc.dexClass.findDeclaredMethod(name, proto);
        if (found && found.code) return { kind: 'dex', method: found };
      }
      if (rc.nativeDef) {
        const fn = rc.nativeDef.findInstanceMethod(name, proto);
        if (fn) return { kind: 'native', fn, def: rc.nativeDef };
      }
      if (includeThis) {
        for (const iface of rc.interfaces) {
          const result = this.findVirtual(iface, name, proto, { includeThis: false });
          if (result) return result;
        }
      }
      return rc.superDescriptor ? walk(rc.superDescriptor) : null;
    };
    return walk(classDescriptor);
  }

  findStatic(classDescriptor, name, proto) {
    const visited = new Set();
    const walk = (descriptor) => {
      if (!descriptor || visited.has(descriptor)) return null;
      visited.add(descriptor);
      const rc = this.registry.resolve(descriptor);
      if (!rc) return null;
      if (rc.dexClass) {
        const found = rc.dexClass.findDeclaredMethod(name, proto);
        if (found) return { kind: 'dex', method: found };
      }
      if (rc.nativeDef) {
        const fn = rc.nativeDef.findStaticMethod(name, proto);
        if (fn) return { kind: 'native', fn, def: rc.nativeDef };
      }
      return rc.superDescriptor ? walk(rc.superDescriptor) : null;
    };
    return walk(classDescriptor);
  }

  invoke(ref, receiver, args, mode = 'virtual', currentMethod = null) {
    args = normalizeReferenceArgs(args, ref?.proto?.parameters);
    this.invocationCount++;
    if (!this._invokeStats) this._invokeStats = new Map();
    const _k = (ref.classDesc || '?') + '.' + ref.name;
    this._invokeStats.set(_k, (this._invokeStats.get(_k) || 0) + 1);
    if (this.invocationCount > 8_000_000) {
      throw new Error('执行指令超限，疑似死循环');
    }
    let resolution = null;
    switch (mode) {
      case 'static':
        resolution = this.findStatic(ref.classDesc, ref.name, ref.proto.descriptor);
        break;
      case 'super': {
        const rc = currentMethod ? this.registry.resolve(currentMethod.classDesc) : null;
        const superDescriptor = rc?.superDescriptor;
        resolution = superDescriptor ? this.findVirtual(superDescriptor, ref.name, ref.proto.descriptor) : null;
        break;
      }
      case 'direct':
        resolution = this.resolveMethod(ref.classDesc, ref.name, ref.proto.descriptor, { isStatic: false });
        if (!resolution) {
          resolution = this.findVirtual(ref.classDesc, ref.name, ref.proto.descriptor);
        }
        break;
      case 'interface':
      case 'virtual':
      default: {
        let receiverDescriptor = receiver === null ? ref.classDesc : this.registry.classNameOf(receiver);
        if (!receiverDescriptor || receiverDescriptor === 'Ljava/lang/Object;') receiverDescriptor = ref.classDesc;
        resolution = this.findVirtual(receiverDescriptor, ref.name, ref.proto.descriptor);
        if (!resolution) {
          if (this.debugCast && ref.name === 'iterator') console.error('IFACE-MISS ref=' + ref.classDesc + '.' + ref.name + ' recvDesc=' + receiverDescriptor + ' recvKeys=' + (receiver && typeof receiver === 'object' ? Object.keys(receiver).slice(0,6).join('|') : typeof receiver) + ' peer=' + (receiver?.$peer?.constructor?.$descriptor));
          resolution = this.findVirtual(ref.classDesc, ref.name, ref.proto.descriptor);
        }
        break;
      }
    }
    if (!resolution) {
      const signature = `${descriptorToName(ref.classDesc)}.${ref.name}${ref.proto.descriptor}`;
      this._missingCount = (this._missingCount || 0) + 1;
      this.log('warn', 'vm', `未绑定方法，返回默认值: ${signature}`);
      if (DBG.missing && this.onMissingMethod) this.onMissingMethod(signature, ref, mode, receiver);
      return defaultValueFor(ref.proto.returnType);
    }
    if (DBG.gd && ref.name === 'getDrawable' && String(ref.classDesc).includes('ResourceManagerInternal')) {
      const r = resolution.kind === 'dex' ? this.executeMethod(resolution.method, mode === 'static' ? null : receiver, args) : this.invokeNative(resolution, receiver, args, ref, mode);
      console.log('GD', ref.proto.descriptor, '->', r === null ? 'NULL' : (r?.$descriptor || typeof r));
      return r;
    }
    if (resolution.kind === 'dex') {
      if (mode === 'static') this.ensureClassInitialized(this.registry.resolve(resolution.method.classDesc));
      if (process.env.DBG_INV && ref.name === 'newInstance') console.error('INV-DEX ' + ref.classDesc + ' method=' + resolution.method.classDesc);
      return this.executeMethod(resolution.method, mode === 'static' ? null : receiver, args);
    }
    if (process.env.DBG_INV && ref.name === 'newInstance') { const same = this.registry.nativeDefs && this.registry.nativeDefs.get ? this.registry.nativeDefs.get('Ljava/lang/reflect/Constructor;') : null; console.error('INV-NAT ' + ref.classDesc + ' def=' + resolution.def?.descriptor + ' defIsCtor=' + (resolution.def === same)); }
    return this.invokeNative(resolution, receiver, args, ref, mode);
  }

  invokeNative(resolution, receiver, args, ref, mode) {
    const isStatic = mode === 'static';
    let self = null;
    if (!isStatic) {
      if (receiver === null || receiver === undefined) {
        if (DBG.npe) console.error('NPE', ref.name, 'ref=' + (ref.classDesc || '?'), 'args=' + (args?.length || 0), 'pc=' + this.currentPc, 'from', (this.methodStack||[]).slice(-8).join(' <- '));
        this.throwException('Ljava/lang/NullPointerException;', `调用 ${ref.name} 时对象为空`);
      }
      if (isJavaObject(receiver)) {
        self = this.registry.getPeer(receiver, resolution.def?.descriptor);
      } else {
        self = receiver;
      }
    }
    if (process.env.DBG_INV && ref.name === 'newInstance') console.error('INV-CALL ' + ref.classDesc + ' fnSrc=' + String(resolution.fn).slice(0,60).replace(/\n/g,' '));
    try {
      const result = resolution.fn(self, args, this, { ref, receiver, mode });
      return normalizeNativeResult(result, ref?.proto?.returnType);
    } catch (error) {
      if (error instanceof VMRuntimeError) throw error;
      if (error && error.message === 'vm-thread-exit') throw error;
      this.throwException('Ljava/lang/RuntimeException;', `${ref.name}: ${error.message}`);
    }
  }

  invokeByName(name, proto, receiver, args, mode = 'virtual') {
    const descriptor = this.registry.classNameOf(receiver);
    const ref = { classDesc: descriptor, name, proto: { descriptor: proto, parameters: parseParameterDescriptors(proto), returnType: parseReturnDescriptor(proto) } };
    return this.invoke(ref, receiver, args, mode);
  }

  executeMethod(method, thisArg, args) {
    if (!method) throw new Error('方法不存在');
    if (!method.code) {
      this.throwException('Ljava/lang/AbstractMethodError;', `${descriptorToName(method.classDesc)}.${method.name}`);
    }
    if (this.frameDepth >= this.maxFrames) {
      this.throwException('Ljava/lang/StackOverflowError;', `调用层级超过 ${this.maxFrames}`);
    }
    this.frameDepth++;
    if (this.frameDepth === 1) this.invocationCount = 0;
    if (!this.methodStack) this.methodStack = [];
    this.methodStack.push(`${descriptorToName(method.classDesc)}.${method.name}`);
    try {
      const _r = this.interpreter.execute(method, thisArg, args);
      if (process.env.DBG_INV && ((method.classDesc === 'Landroidx/fragment/app/l0;')) ) console.error('L-RET ' + method.classDesc + '.' + method.name + ' ' + (_r === null ? 'null' : (typeof _r === 'object' ? (_r.$dexClass?.descriptor || _r.$nativeClass || 'obj') : String(_r))));
      if (process.env.DBG_INV && method.classDesc === 'Landroidx/fragment/app/FragmentManager$d;' && method.name === 'a') console.error('FMD-CALLER ' + (this.methodStack||[]).slice(-5).join(' <- '));
      if (process.env.DBG_INV && (method.classDesc === 'Landroidx/fragment/app/s;' || method.classDesc === 'Landroidx/fragment/app/FragmentManager$d;' || method.classDesc === 'Landroidx/fragment/app/v;') ) console.error('S-RET ' + method.classDesc + '.' + method.name + ' ' + (_r === null ? 'null' : (typeof _r === 'object' ? (_r.$dexClass?.descriptor || _r.$nativeClass || 'obj') : String(_r))));
      if (process.env.DBG_INV && method.classDesc === 'Landroidx/lifecycle/Lifecycle$Event;' && method.name === 'getTargetState') console.error('GTS arg=' + jsStringDump(thisArg) + ' -> ' + (_r === null ? 'NULL' : (typeof _r === 'object' ? (_r.$dexClass?.descriptor || _r.$nativeClass || 'obj') : String(_r))));
      if (process.env.DBG_INV && method.classDesc === 'Landroidx/fragment/app/Fragment;' && method.name === 'f1') console.error('F1-RET ' + (_r === null ? 'null' : (typeof _r === 'object' ? (_r.$dexClass?.descriptor || _r.$nativeClass || JSON.stringify(Object.keys(_r).slice(0,4))) : String(_r))));
      return _r;
    } finally {
      this.methodStack.pop();
      this.frameDepth--;
    }
  }

  instantiate(classDescriptor, args = []) {
    if (classDescriptor === 'Landroidx/fragment/app/a;' && process.env.DBG_INV) console.error('BSR-NEW stack=' + (this.methodStack||[]).slice(-6).join(' <- '));
    const rc = this.registry.resolve(classDescriptor);
    this.ensureClassInitialized(rc);
    const object = this.allocateObject(rc);
    const ctor = rc.dexClass?.findDeclaredMethod('<init>', descriptorOfArgs(args)) || null;
    if (ctor) {
      this.executeMethod(ctor, object, args);
    } else {
      const ref = {
        classDesc: classDescriptor,
        name: '<init>',
        proto: { descriptor: descriptorOfArgs(args), parameters: [], returnType: 'V' },
      };
      this.invoke(ref, object, args, 'direct');
    }
    return object;
  }

  wrapPeer(peer) {
    if (peer === null || peer === undefined) return null;
    if (isJavaObject(peer) || isJavaArray(peer)) return peer;
    if (peer.$object && isJavaObject(peer.$object)) return peer.$object;
    const descriptor = peer.constructor?.$descriptor || peer.$descriptor || 'Ljava/lang/Object;';
    const object = this.allocateObject(this.registry.resolve(descriptor));
    object.$peer = peer;
    object.$nativeClass = descriptor;
    peer.$object = object;
    return object;
  }

  toJavaString(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    return stringify(value);
  }

  toStringValue(value) {
    return this.toJavaString(value);
  }

  identityHash(value) {
    return hashCode(value);
  }

  defaultValue(descriptor) {
    return defaultValueFor(descriptor);
  }

  isAssignable(from, to) {
    return this.registry.isAssignable(from, to);
  }

  invokeInterface(target, name, proto, args = []) {
    if (target === null || target === undefined) return null;
    if (typeof target === 'function') return target(...args);
    if (isJavaObject(target)) {
      const descriptor = target.$dexClass?.descriptor || target.$nativeClass || 'Ljava/lang/Object;';
      const ref = {
        classDesc: descriptor,
        name,
        proto: { descriptor: proto, parameters: parseParameterDescriptors(proto), returnType: parseReturnDescriptor(proto) },
      };
      return this.invoke(ref, target, args, 'interface');
    }
    if (typeof target[name] === 'function') return target[name](...args);
    return null;
  }

  runRunnable(runnable) {
    if (runnable === null || runnable === undefined) return;
    if (typeof runnable === 'function') {
      runnable();
      return;
    }
    try {
      this.invokeInterface(runnable, 'run', '()V', []);
    } catch (error) {
      if (error && error.message === 'vm-thread-exit') return;
      throw error;
    } finally {
      this.__loopDepth = 0;
    }
  }

  invokeHandlerMessage(handler, message) {
    if (!handler) return;
    if (typeof handler === 'function') {
      handler(message);
      return;
    }
    this.invokeInterface(handler, 'handleMessage', '(Landroid/os/Message;)V', [message]);
  }

  get messageQueue() {
    return this._messageQueue || null;
  }

  set messageQueue(value) {
    this._messageQueue = value;
  }

  get handler() {
    return this._handler || null;
  }

  set handler(value) {
    this._handler = value;
  }

  get contextObject() {
    return this._contextObject || null;
  }

  set contextObject(value) {
    this._contextObject = value;
  }

  get applicationObject() {
    return this._applicationObject || null;
  }

  set applicationObject(value) {
    this._applicationObject = value;
  }

  get resourcesObject() {
    return this._resourcesObject || null;
  }

  set resourcesObject(value) {
    this._resourcesObject = value;
  }

  findMainActivity(manifest) {
    const application = manifest?.findChild('application');
    if (!application) return null;
    for (const activity of application.findAll('activity')) {
      const filters = activity.findAll('intent-filter');
      const isLauncher = filters.some((filter) => {
        const hasMain = filter.findAll('action').some((a) => (a.getAttribute('android:name') || a.getAttribute('name')) === 'android.intent.action.MAIN');
        const hasLauncher = filter.findAll('category').some((c) => (c.getAttribute('android:name') || c.getAttribute('name')) === 'android.intent.category.LAUNCHER');
        return hasMain && hasLauncher;
      });
      if (isLauncher) return activity;
    }
    return application.findAll('activity')[0] || null;
  }
}

function normalizeReferenceArgs(args, parameters) {
  if (!Array.isArray(args) || !Array.isArray(parameters) || args.length === 0) return args;
  let changed = false;
  const out = args.slice();
  for (let i = 0; i < out.length && i < parameters.length; i++) {
    const descriptor = parameters[i];
    if (!descriptor || (descriptor[0] !== 'L' && descriptor[0] !== '[')) continue;
    const value = out[i];
    if (typeof value === 'number' && value === 0) {
      out[i] = null;
      changed = true;
    }
  }
  return changed ? out : args;
}

function normalizeNativeResult(result, returnType) {
  if (returnType === 'Z') {
    if (result === true) return 1;
    if (result === false) return 0;
    return result;
  }
  return result;
}

export function descriptorOfArgs(args) {
  return `(${args.map((a) => descriptorOfValue(a)).join('')})V`;
}

export function descriptorOfValue(value) {
  if (value === null || value === undefined) return 'Ljava/lang/Object;';
  if (typeof value === 'string') return 'Ljava/lang/String;';
  if (typeof value === 'boolean') return 'Z';
  if (typeof value === 'bigint') return 'J';
  if (typeof value === 'number') return Number.isInteger(value) ? 'I' : 'F';
  if (isJavaArray(value)) return value.$type;
  if (isJavaObject(value)) return value.$dexClass?.descriptor || value.$nativeClass || 'Ljava/lang/Object;';
  return 'Ljava/lang/Object;';
}

export function parseParameterDescriptors(proto) {
  const inner = proto.slice(1, proto.lastIndexOf(')'));
  const result = [];
  let index = 0;
  while (index < inner.length) {
    const start = index;
    while (inner[index] === '[') index++;
    if (inner[index] === 'L') index = inner.indexOf(';', index) + 1;
    else index++;
    result.push(inner.slice(start, index));
  }
  return result;
}

export function parseReturnDescriptor(proto) {
  return proto.slice(proto.lastIndexOf(')') + 1);
}
