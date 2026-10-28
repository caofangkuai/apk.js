import { DexFile } from '../dex/dexfile.js';
import { ResourceTable } from '../res/arsc.js';
import { parseBinaryXml } from '../res/axml.js';
import { JavaVM } from '../runtime/vm.js';
import { DexInterpreter } from '../runtime/interpreter.js';
import { Resources } from './resources.js';
import { SurfaceScreen } from './window.js';
import { registerFrameworkNativeClasses, loadThemeFromStyleId } from './registry.js';
import { JAVA_CORE_CLASSES } from './java-core.js';
import { contextFacade, viewObject } from './bridge.js';
import { Looper, Handler } from './os.js';
import { DBG } from '../runtime/debug.js';

function toPackageDescriptor(name, packageName = '') {
  if (!name) return null;
  if (name.startsWith('L') && name.endsWith(';')) return name;
  let full = name;
  if (full.startsWith('.')) full = `${packageName}${full}`;
  else if (!full.includes('.')) full = `${packageName}.${full}`;
  return `L${full.replace(/\./g, '/')};`;
}

export async function loadApkFiles(zip) {
  const files = zip.files;
  const assetFiles = new Map();
  const resourceBytes = new Map();
  for (const [name, entry] of Object.entries(files)) {
    if (entry.dir) continue;
    if (name === 'AndroidManifest.xml' || name === 'resources.arsc' || /^classes\d*\.dex$/.test(name)) continue;
    if (!name.startsWith('assets/')) {
      const bytes = await entry.async('uint8array');
      resourceBytes.set(name, bytes);
    }
    if (!name.startsWith('assets/')) continue;
    assetFiles.set(name.slice('assets/'.length), { name, bytes: await entry.async('uint8array') });
  }

  const manifestBytes = await zip.file('AndroidManifest.xml').async('uint8array');
  const manifestXml = parseBinaryXml(manifestBytes);
  const arscBytes = await zip.file('resources.arsc').async('uint8array');
  const resourceTable = new ResourceTable(arscBytes);

  const dexNames = Object.keys(files).filter((n) => /^classes\d*\.dex$/.test(n)).sort();
  const dexFiles = [];
  for (const name of dexNames) {
    dexFiles.push(new DexFile(await zip.file(name).async('uint8array')));
  }

  const layoutCache = new Map();
  const layoutLoader = async (resId) => {
    if (layoutCache.has(resId)) return layoutCache.get(resId);
    const entry = resourceTable.getEntry(resId);
    if (!entry || typeof entry.value !== 'string') return null;
    const file = zip.file(entry.value);
    if (!file) return null;
    const tree = parseBinaryXml(await file.async('uint8array'));
    layoutCache.set(resId, tree);
    return tree;
  };

  return {
    manifest: manifestXml.manifest,
    packageName: manifestXml.manifest.getAttribute('package'),
    resourceTable,
    dexFiles,
    assetFiles,
    layoutLoader,
    xmlCache: new Map(),
    zip,
    zipEntry(path) {
      const normalized = path.replace(/^\/+/, '');
      const bytes = resourceBytes.get(normalized) || resourceBytes.get(`res/${normalized}`);
      if (!bytes) throw new Error(`资源文件不存在: ${normalized}`);
      return bytes;
    },
    rawZip: zip,
    imageLoader: defaultImageLoader,
    invalidate: null,
  };
}

async function defaultImageLoader(bytes, key) {
  if (typeof createImageBitmap === 'function' && typeof Blob === 'function') {
    const blob = new Blob([bytes], { type: guessImageMime(key) });
    return createImageBitmap(blob);
  }
  if (typeof Image === 'function' && typeof URL !== 'undefined' && typeof Blob === 'function') {
    const blob = new Blob([bytes], { type: guessImageMime(key) });
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return null;
}

function guessImageMime(key) {
  const lower = String(key).toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

function createApplication(vm, apk) {
  const applicationName =
    apk.manifest?.findChild('application')?.getAttribute('android:name') ||
    apk.manifest?.findChild('application')?.getAttribute('name') ||
    null;
  if (applicationName) {
    const descriptor = toPackageDescriptor(applicationName, apk.packageName);
    try {
      const app = vm.instantiate(descriptor, []);
      vm.applicationDescriptor = descriptor;
      vm.registry.getPeer?.(app, descriptor);
      return app;
    } catch (error) {
      vm.log('warn', 'engine', `实例化 Application 失败(${descriptor}): ${error.message}`);
    }
  }
  const fallback = vm.allocateRawObject('Landroid/app/Application;');
  vm.registry.getPeer(fallback, 'Landroid/app/Application;');
  return fallback;
}

function runApplicationCreate(vm, application, descriptor) {
  if (!application || !descriptor) return;
  try {
    vm.invoke(
      {
        classDesc: descriptor,
        name: 'onCreate',
        proto: { descriptor: '()V', parameters: [], returnType: 'V' },
      },
      application,
      [],
      'virtual'
    );
  } catch (error) {
    vm.log('error', 'engine', `Application.onCreate 失败: ${error.message}`);
  }
}

export class EmulatorEngine {
  constructor(options = {}) {
    this.options = options;
    this.onLog = options.onLog || (() => {});
    this.onFinished = options.onFinished || (() => {});
    this.vm = null;
    this.screen = null;
    this.activity = null;
    this.running = false;
  }

  attachCanvas(canvas) {
    if (!canvas) return this.screen;
    this.screen = new SurfaceScreen(canvas, {
      width: this.options.width || canvas.clientWidth || 360,
      height: this.options.height || canvas.clientHeight || 640,
      dpr: this.options.dpr,
      style: this.options.style || 'material',
    });
    if (this.vm) this.vm.screen = this.screen;
    return this.screen;
  }

  setCanvasSize(width, height) {
    if (!this.screen) return;
    this.screen.resize(width, height);
    if (this.vm) this.vm.screen = this.screen;
  }

  get width() {
    return this.screen?.width ?? this.options.width ?? 360;
  }

  get height() {
    return this.screen?.height ?? this.options.height ?? 640;
  }

  applyManifestTheme(vm, apk) {
    const manifest = apk.manifest;
    if (!manifest) return;
    const pick = (node) => {
      if (!node) return null;
      for (const name of ['android:theme', 'theme']) {
        const raw = node.getAttribute(name);
        if (raw === null || raw === undefined || raw === '') continue;
        if (typeof raw === 'object' && 'reference' in raw) return raw.reference >>> 0;
        if (typeof raw === 'string') {
          const match = raw.match(/@(0x[0-9a-f]+|\d+)/i);
          if (match) return match[1].startsWith('0x') ? parseInt(match[1], 16) : parseInt(match[1], 10);
        }
        if (typeof raw === 'number') return raw >>> 0;
      }
      return null;
    };
    const application = manifest.findChild?.('application');
    const activity = vm.findMainActivity?.(manifest);
    const styleId = pick(activity) ?? pick(application);
    if (styleId) vm.themeStyleId = styleId;
    if (styleId && loadThemeFromStyleId(vm, styleId)) {
      this.onLog({ level: 'info', tag: 'engine', message: `应用主题 0x${styleId.toString(16)}` });
    }
  }

  async start(apk) {
    const vm = new JavaVM({
      dexFiles: apk.dexFiles,
      logger: (entry) => this.onLog(entry),
      screen: this.screen,
      packageName: apk.packageName,
      maxFrames: this.options.maxFrames || 512,
    });
    this.vm = vm;
    vm.apk = apk;
    apk.invalidate = () => this.screen?.invalidate?.();
    vm.interpreter = new DexInterpreter(vm);
    const resources = new Resources(apk, vm);
    vm.resources = resources;
    for (const cls of Object.values(JAVA_CORE_CLASSES)) vm.registry.registerNative(cls);
    registerFrameworkNativeClasses(vm);
    if (DBG.traceToolbar) {
      const it = vm.interpreter;
      const origExec = it.execute.bind(it);
      it.execute = function (method, thisArg, args) {
        if (method.classDesc === 'Landroidx/appcompat/widget/Toolbar;' && method.name === '<init>') {
          const ins = method.code.insns;
          console.log('INIT', method.proto.descriptor, 'regs', method.code.registersSize, 'ins', method.code.insSize, 'n', ins.length);
          console.log('  units:', [...ins].slice(0, 20).map((u) => u.toString(16).padStart(4, '0')).join(' '));
          let n = 0;
          it.trace = (pc, op) => { if (n++ < 12) console.log(`   pc=${pc} op=0x${op.toString(16)} unit=0x${ins[pc].toString(16)}`); };
          try { return origExec(method, thisArg, args); } finally { it.trace = null; }
        }
        return origExec(method, thisArg, args);
      };
    }
    this.specialEffectControllers = [];
    if (typeof vm.executeMethod === 'function' && !vm.$specialEffectsHooked) {
      vm.$specialEffectsHooked = true;
      const engineRef = this;
      const origExecute = vm.executeMethod.bind(vm);
      vm.executeMethod = function (method, thisArg, args) {
        const descriptor = String(method.classDesc || '');
        if (descriptor.endsWith('SpecialEffectsController;') || descriptor.endsWith('DefaultSpecialEffectsController;')) {
          if (method.name === 'j' || method.name === '<init>') {
            const known = engineRef.specialEffectControllers;
            if (!known.includes(thisArg)) known.push(thisArg);
          }
        }
        return origExecute(method, thisArg, args);
      };
    }
    const mainLooper = new Looper(vm);
    const queue = mainLooper.queue;
    vm.messageQueue = queue;
    vm.mainLooper = mainLooper;
    const handler = new Handler(vm);
    vm.handler = handler;
    handler.$javaObject = vm.wrapPeer(handler);

    const context = contextFacade(vm);
    vm.contextObject = context;
    if (!DBG.noThemeApply) this.applyManifestTheme(vm, apk);
    vm.resourcesObject = vm.wrapPeer({
      resources,
      constructor: { $descriptor: 'Landroid/content/res/Resources;' },
    });
    vm.applicationObject = createApplication(vm, apk);
    runApplicationCreate(vm, vm.applicationObject, vm.applicationDescriptor);

    const activityInfo = vm.findMainActivity(apk.manifest);
    const activityName = activityInfo?.getAttribute('android:name') || activityInfo?.getAttribute('name');
    if (!activityName) throw new Error('未在 AndroidManifest 中找到 Activity');

    const descriptor = toPackageDescriptor(activityName, apk.packageName);
    let activity;
    try {
      activity = vm.instantiate(descriptor, []);
    } catch (error) {
      this.onLog({ level: 'error', tag: 'engine', message: `实例化 Activity 失败: ${error.message}` });
      throw error;
    }
    this.activity = activity;
    vm.onActivityFinished = () => this.onFinished();

    const activityPeer = vm.registry.getPeer(activity, descriptor);
    if (activityPeer && !activityPeer.intent) {
      const intent = vm.instantiate('Landroid/content/Intent;', []);
      activityPeer.intent = intent;
      activity.$fields?.set('Landroid/app/Activity;->mIntent:Landroid/content/Intent;', intent);
    }

    const lifecycles = [
      ['onCreate', '(Landroid/os/Bundle;)V', [null]],
      ['onStart', '()V', []],
      ['onResume', '()V', []],
    ];
    for (const [name, proto, args] of lifecycles) {
      try {
        vm.invoke(
          {
            classDesc: descriptor,
            name,
            proto: { descriptor: proto, parameters: [], returnType: 'V' },
          },
          activity,
          args,
          'virtual'
        );
      } catch (error) {
        this.onLog({ level: 'error', tag: 'lifecycle', message: `${name}: ${error.message}` });
        throw error;
      }
    }

    if (this.screen && !this.screen.decorView) {
      const peer = vm.registry.getPeer(activity, descriptor);
      peer.ensureWindow?.();
    }
    if (this.screen?.decorView) {
      const peer = vm.registry.getPeer(activity, descriptor);
      peer?.relayout?.();
      this.screen.invalidate?.();
    }

    this.flushSpecialEffects(vm);
    this.running = true;
    return this;
  }

  flushSpecialEffects(vm) {
    const pending = new Set();
    const seen = new Set();
    const visit = (value, depth) => {
      if (!value || typeof value !== 'object' || depth > 6 || seen.has(value)) return;
      seen.add(value);
      const descriptor = value.$dexClass?.descriptor;
      if (descriptor && /SpecialEffectsController;?$/.test(descriptor)) pending.add(value);
      const fields = value.$fields;
      if (fields) {
        for (const entry of fields.values()) visit(entry, depth + 1);
      }
      if (Array.isArray(value.children)) {
        for (const child of value.children) visit(child, depth + 1);
      }
      if (value.child) visit(value.child, depth + 1);
    };
    visit(this.activity, 0);
    visit(this.activity?.$peer, 0);
    for (const controller of this.specialEffectControllers || []) pending.add(controller);

    for (const controller of pending) {
      this.runPendingOperations(vm, controller);
    }
  }

  runPendingOperations(vm, controller) {
    const fields = controller.$fields;
    if (!fields) return;
    const key = (name, type) => `Landroidx/fragment/app/SpecialEffectsController;->${name}:${type}`;
    const pendingList = fields.get(key('b', 'Ljava/util/List;'));
    const queuedList = fields.get(key('c', 'Ljava/util/List;'));
    if (!pendingList || !queuedList) return;

    const takeItems = (list) => {
      if (!list) return [];
      if (Array.isArray(list.$peer?.items)) return list.$peer.items.splice(0, list.$peer.items.length);
      if (Array.isArray(list.$data)) return list.$data.splice(0, list.$data.length);
      return [];
    };

    const pendingItems = takeItems(pendingList);
    if (pendingItems.length === 0) return;

    const queuedItems = queuedList.$peer?.items || queuedList.$data;
    if (!Array.isArray(queuedItems)) return;
    for (const operation of pendingItems) queuedItems.push(operation);

    const descriptor = controller.$dexClass?.descriptor || 'Landroidx/fragment/app/SpecialEffectsController;';
    const executingFlag = fields.get(key('d', 'Z')) ?? false;
    try {
      vm.invokeByName('d', '(Ljava/util/List;Z)V', controller, [queuedList, executingFlag], 'virtual');
    } catch (error) {
      this.onLog({ level: 'warn', tag: 'engine', message: `执行待处理动画失败: ${error.message}` });
    }
    queuedItems.length = 0;
    for (const operation of pendingItems) this.completeOperation(vm, operation);
  }

  completeOperation(vm, operation) {
    const fields = operation?.$fields;
    if (!fields) return;
    const fieldOf = (name) => {
      for (const [key, value] of fields) {
        if (key.includes(`->${name}:`)) return value;
      }
      return undefined;
    };
    if (!this.stateIsVisible(vm, fieldOf('a'))) return;
    const fragment = fieldOf('c');
    let targetView = null;
    for (const [key, value] of fragment?.$fields || new Map()) {
      if (key.includes('->R:Landroid/view/View;')) targetView = value;
    }
    const view = targetView?.$view || targetView;
    if (!view) return;
    view.setVisibility?.(0);
    view.setAlpha?.(1);
  }

  stateIsVisible(vm, stateObject) {
    if (!stateObject) return false;
    try {
      const name = vm.invokeByName('name', '()Ljava/lang/String;', stateObject, []);
      return String(name) === 'VISIBLE';
    } catch (_) {
      return false;
    }
  }

  stop() {
    this.running = false;
    if (this.vm?.messageQueue) this.vm.messageQueue.clear?.();
  }

  wrapView(view) {
    return viewObject(this.vm, view);
  }
}
