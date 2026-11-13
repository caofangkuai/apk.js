import { JavaVM } from '../runtime/vm.js';
import { DexInterpreter } from '../runtime/interpreter.js';
import { Resources } from './resources.js';
import { SurfaceScreen } from './window.js';
import { registerFrameworkNativeClasses, loadThemeFromStyleId } from './registry.js';
import { JAVA_CORE_CLASSES, seedHardwareFs } from './java-core.js';
import { installSensorSources } from './sensors.js';
import { contextFacade, viewObject } from './bridge.js';
import { Looper, Handler } from './os.js';
import { DBG } from '../runtime/debug.js';
import { createHookBus } from '../runtime/hooks.js';
import { loadApkFiles } from '../core/apk-file.js';
import { XposedRuntime } from '../runtime/xposed.js';

export { loadApkFiles };

function toPackageDescriptor(name, packageName = '') {
  if (!name) return null;
  if (name.startsWith('L') && name.endsWith(';')) return name;
  let full = name;
  if (full.startsWith('.')) full = `${packageName}${full}`;
  else if (!full.includes('.')) full = `${packageName}.${full}`;
  return `L${full.replace(/\./g, '/')};`;
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
    this.hooks = createHookBus(options.hooks);
    this.xposed = options.xposed instanceof XposedRuntime ? options.xposed : new XposedRuntime(null);
    this.vm = null;
    this.screen = null;
    this.activity = null;
    this.running = false;
    seedHardwareFs();
    installSensorSources();
  }

  attachCanvas(canvas) {
    if (!canvas) return this.screen;
    this.screen = new SurfaceScreen(canvas, {
      width: this.options.width || canvas.clientWidth || 360,
      height: this.options.height || canvas.clientHeight || 640,
      dpr: this.options.dpr,
      style: this.options.style || 'default',
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
    vm.loadActivityTheme = (descriptor) => this.applyActivityTheme(vm, apk, descriptor);
  }

  applyActivityTheme(vm, apk, descriptor) {
    const manifest = apk.manifest;
    if (!manifest) return;
    const desired = String(descriptor || '');
    const toDescriptor = (name) => (name && name.startsWith('.') ? apk.packageName + name : name);
    const application = manifest.findChild?.('application');
    let activityNode = null;
    for (const activity of application?.findAll?.('activity') || []) {
      const name = toDescriptor(activity.getAttribute('android:name') || activity.getAttribute('name'));
      if (name && `L${name.replace(/\./g, '/')};` === desired) {
        activityNode = activity;
        break;
      }
    }
    const pick = (node) => {
      if (!node) return null;
      for (const key of ['android:theme', 'theme']) {
        const raw = node.getAttribute(key);
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
    const styleId = pick(activityNode) ?? pick(application);
    if (styleId && loadThemeFromStyleId(vm, styleId)) {
      vm.themeStyleId = styleId;
      this.onLog({ level: 'info', tag: 'engine', message: `应用主题 0x${styleId.toString(16)}` });
    }
  }

  async start(apk) {
    this.hooks.emit('start:before', { engine: this, apk });
    const vm = new JavaVM({
      dexFiles: apk.dexFiles,
      logger: (entry) => this.onLog(entry),
      screen: this.screen,
      packageName: apk.packageName,
      maxFrames: this.options.maxFrames || 512,
      hooks: this.hooks,
      xposed: this.xposed,
    });
    this.vm = vm;
    vm.nightMode = this.options.nightMode ?? null;
    vm.apk = apk;
    apk.invalidate = () => this.screen?.invalidate?.();
    vm.interpreter = new DexInterpreter(vm);
    vm.engine = this;
    this.hooks.emit('start:after', { engine: this, apk, vm });
    const resources = new Resources(apk, vm);
    vm.resources = resources;
    for (const cls of Object.values(JAVA_CORE_CLASSES)) vm.registry.registerNative(cls);
    registerFrameworkNativeClasses(vm);
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
    vm.onActivityFinished = (peer) => {
      const notify = () => {
        const stack = vm.activityStack || [];
        const activeMain = !peer || peer?.object === vm.activity;
        if (stack.length === 0 && activeMain && (!peer || peer.finished !== false)) {
          this.hooks.emit('activity:finish', { engine: this, vm, activity: peer });
          this.onFinished();
        }
      };
      setTimeout(notify, 0);
    };

    const activityPeer = vm.registry.getPeer(activity, descriptor);
    vm.seedActivityTitle?.(activityPeer, descriptor);
    if (activityPeer && !activityPeer.intent) {
      const intent = vm.instantiate('Landroid/content/Intent;', []);
      activityPeer.intent = intent;
      activity.$fields?.set('Landroid/app/Activity;->mIntent:Landroid/content/Intent;', intent);
    }

    const lifecycles = [
      ['onCreate', '(Landroid/os/Bundle;)V', [null]],
      ['onStart', '()V', []],
      ['onResume', '()V', []],
      ['onPostResume', '()V', []],
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

    this.running = true;
    return this;
  }

  stop() {
    this.running = false;
    if (this.vm?.messageQueue) this.vm.messageQueue.clear?.();
  }

  wrapView(view) {
    return viewObject(this.vm, view);
  }
}
