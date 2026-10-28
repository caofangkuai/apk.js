import { JavaVM, descriptorOfValue, parseParameterDescriptors } from '../runtime/vm.js';
import { NativeClassDef } from '../runtime/class-registry.js';
import { JAVA_CORE_CLASSES, jsString, nativeDef } from './java-core.js';
import { LayoutInflater } from './layout-inflater.js';
import { Resources, convertDimension } from './resources.js';
import { Handler, Looper, Message, MessageQueue } from './os.js';
import { Toast } from './toast.js';
import { ActivityHost } from './app.js';
import { viewObject, unwrapView } from './bridge.js';
import { Paint, Canvas, Bitmap, Rect, RectF, Point, cssColor } from './graphics.js';
import {
  MeasureSpec,
  VISIBILITY,
  View,
  ViewGroup,
  colorToCss,
  resolveSize,
  getDefaultSize,
} from './view.js';
import {
  FrameLayout,
  LinearLayout,
  RelativeLayout,
  ActionBarContainer,
  ActionBarOverlayLayout,
  Toolbar,
} from './layouts.js';
import {
  Button,
  EditText,
  ImageView,
  ProgressBar,
  ScrollView,
  TextView,
} from './widgets.js';
import { DecorView, SurfaceScreen, Window } from './window.js';

export const FRAMEWORK_CLASSES = {};

const NATIVE_VIEW_CLASSES = {
  'Landroid/view/View;': View,
  'Landroid/view/ViewGroup;': ViewGroup,
  'Landroid/widget/FrameLayout;': FrameLayout,
  'Landroid/widget/LinearLayout;': LinearLayout,
  'Landroid/widget/RelativeLayout;': RelativeLayout,
  'Landroid/widget/TextView;': TextView,
  'Landroid/widget/Button;': Button,
  'Landroid/widget/EditText;': EditText,
  'Landroid/widget/ImageView;': ImageView,
  'Landroid/widget/ScrollView;': ScrollView,
  'Landroid/widget/ProgressBar;': ProgressBar,
  'Landroidx/appcompat/widget/ActionBarContainer;': ActionBarContainer,
  'Landroidx/appcompat/widget/ActionBarOverlayLayout;': ActionBarOverlayLayout,
  'Landroidx/appcompat/widget/Toolbar;': Toolbar,
};

const RELATIVE_RULE_NAMES = {
  0: 'leftOf', 1: 'rightOf', 2: 'above', 3: 'below',
  4: 'alignBaseline', 5: 'alignLeft', 6: 'alignTop', 7: 'alignRight', 8: 'alignBottom',
  9: 'alignParentLeft', 10: 'alignParentTop', 11: 'alignParentRight', 12: 'alignParentBottom',
  13: 'centerInParent', 14: 'centerHorizontal', 15: 'centerVertical',
  16: 'alignStart', 17: 'alignEnd', 18: 'alignParentStart', 19: 'alignParentEnd',
  20: 'startOf', 21: 'endOf',
};

function ruleVerb(rule) {
  return RELATIVE_RULE_NAMES[rule >>> 0] || `rule${rule >>> 0}`;
}

function layoutParamsDescriptorFor(view) {
  const parent = view?.parent;
  const parentName = parent?.constructor?.name;
  if (parentName === 'RelativeLayout') return 'Landroid/widget/RelativeLayout$LayoutParams;';
  if (parentName === 'LinearLayout') return 'Landroid/widget/LinearLayout$LayoutParams;';
  if (parentName === 'FrameLayout' || parentName === 'DecorView') return 'Landroid/widget/FrameLayout$LayoutParams;';
  if (parentName === 'AbsoluteLayout') return 'Landroid/widget/AbsoluteLayout$LayoutParams;';
  if (view?.layoutParams?.leftMargin !== undefined) return 'Landroid/view/ViewGroup$MarginLayoutParams;';
  return 'Landroid/view/ViewGroup$LayoutParams;';
}

function viewPeerConstructor(descriptor, superDescriptor = null) {
  const ViewClass = NATIVE_VIEW_CLASSES[descriptor]
    || (superDescriptor ? NATIVE_VIEW_CLASSES[superDescriptor] : null)
    || View;
  return class NativeViewPeer {
    constructor(vm, object) {
      this.vm = vm;
      this.object = object;
      if (!object.$view) {
        const context = vm.contextObject || null;
        object.$view = new ViewClass(context);
        object.$view.$vm = vm;
        object.$view.$javaObject = object;
        const viewDescriptor = object.$nativeClass || descriptor;
        object.$view.$descriptor = viewDescriptor;
        viewDescriptor && object.$fields?.set(
          `${viewDescriptor}->$view:Landroid/view/View;`,
          object.$view
        );
      }
      this.view = object.$view;
    }
  };
}

export function nativeClass(descriptor, options) {
  return new NativeClassDef(descriptor, options);
}

export function registerFrameworkNativeClasses(vm) {
  const definitions = buildFrameworkDefinitions(vm);
  for (const def of definitions) vm.registry.registerNative(def);
  injectViewConstructors(vm);
  return vm;
}

function isViewDescriptor(descriptor) {
  if (!descriptor || !descriptor.startsWith('L')) return false;
  if (Object.prototype.hasOwnProperty.call(NATIVE_VIEW_CLASSES, descriptor)) return true;
  return descriptor.startsWith('Landroidx/appcompat/widget/') ||
    descriptor.startsWith('Landroid/widget/') ||
    descriptor.startsWith('Landroid/view/') ||
    descriptor.startsWith('Lcom/google/android/material/');
}

const VIEW_CONSTRUCTOR_SIGNATURES = [
  '()V',
  '(Landroid/content/Context;)V',
  '(Landroid/content/Context;Landroid/util/AttributeSet;)V',
  '(Landroid/content/Context;Landroid/util/AttributeSet;I)V',
];

function injectViewConstructors(vm) {
  for (const [descriptor, def] of vm.registry.nativeDefs) {
    if (!def || !def.ctor) continue;
    if (!isViewDescriptor(descriptor)) continue;
    for (const signature of VIEW_CONSTRUCTOR_SIGNATURES) {
      const key = `<init>${signature}`;
      if (def.methods.has(key)) continue;
      def.methods.set(key, () => undefined);
    }
  }
}

function normalizeClassName(name, packageName) {
  if (name === null || name === undefined) return null;
  let text = String(name);
  if (text.startsWith('L') && text.endsWith(';') && text.includes('/')) {
    text = text.slice(1, -1).replace(/\//g, '.');
  }
  if (text.startsWith('.')) return `${packageName || ''}${text}`;
  if (!text.includes('.')) return `${packageName || ''}.${text}`;
  return text;
}

function packageOfClassName(className) {
  if (!className) return null;
  const index = className.lastIndexOf('.');
  return index < 0 ? null : className.slice(0, index);
}

function toIntValue(vm, fieldPeer, args) {
  const [target] = args || [];
  const value = fieldPeer.isStatic
    ? vm.getStaticField({ classDesc: fieldPeer.classDesc, name: fieldPeer.name, type: fieldPeer.type })
    : vm.getField(target, { classDesc: fieldPeer.classDesc, name: fieldPeer.name, type: fieldPeer.type });
  if (typeof value === 'number') return value | 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
}

function setFieldValue(vm, fieldPeer, target, value) {
  const field = { classDesc: fieldPeer.classDesc, name: fieldPeer.name, type: fieldPeer.type };
  if (fieldPeer.isStatic) {
    vm.setStaticField(field, value);
    return;
  }
  if (target === null || target === undefined) {
    vm.throwException('Ljava/lang/NullPointerException;', `写入字段 ${fieldPeer.name} 时对象为空`);
  }
  vm.setField(target, field, value);
}

function buildFrameworkDefinitions(vm) {
  const defs = [];
  defs.push(
    nativeDef('Landroid/app/Activity;', {
      super: 'Landroid/content/ContextThemeWrapper;',
      interfaces: ['Landroid/view/Window$Callback;'],
      instanceFields: new Map([
        ['$activity', null],
        ['$window', null],
        ['$contentView', null],
        ['$decorView', null],
        ['$title', null],
      ]),
      ctor: class ActivityPeer extends ActivityHost {
        constructor(vm, object) {
          super(vm, object);
          this.activity = this;
        }

        getContextObject() {
          return this.object;
        }

        setContentViewView(view) {
          this.setContentView(unwrapView(view) || view);
        }

        finishActivity() {
          this.finish();
        }
      },
      methods: {
        'onCreatePanelView(I)Landroid/view/View;': () => null,
        'onCreatePanelMenu(ILandroid/view/Menu;)Z': () => false,
        'onPreparePanel(ILandroid/view/View;Landroid/view/Menu;)Z': () => false,
        'onMenuOpened(ILandroid/view/Menu;)Z': () => true,
        'onPanelClosed(ILandroid/view/Menu;)V': () => undefined,
        'onMenuItemSelected(ILandroid/view/MenuItem;)Z': () => false,
        'dispatchKeyEvent(Landroid/view/KeyEvent;)Z': (self, [event], vm) => dispatchActivityKeyEvent(self, event, vm),
        'dispatchKeyShortcutEvent(Landroid/view/KeyEvent;)Z': (self, [event], vm) => dispatchActivityKeyEvent(self, event, vm),

        '<init>()V': () => undefined,
        'onCreate(Landroid/os/Bundle;)V': (self, _args, vm) => {
          vm.log('info', 'Activity', '默认 onCreate（未覆写）');
        },
        'onStart()V': () => undefined,
        'onResume()V': () => undefined,
        'invalidateOptionsMenu()V': () => undefined,
        'getApplication()Landroid/app/Application;': (self, _args, vm) => vm.applicationObject ?? null,
        'registerActivityLifecycleCallbacks(Landroid/app/Application$ActivityLifecycleCallbacks;)V': () => undefined,
        'onPause()V': () => undefined,
        'onStop()V': () => undefined,
        'onDestroy()V': () => undefined,
        'onRestart()V': () => undefined,
        'onBackPressed()V': (self) => {
          self.finish?.();
        },
        'onSaveInstanceState(Landroid/os/Bundle;)V': () => undefined,
        'onRestoreInstanceState(Landroid/os/Bundle;)V': () => undefined,
        'setContentView(I)V': (self, [resId], vm) => {
          const inflater = new LayoutInflater(vm.contextObject);
          inflater.vm = vm;
          const view = inflater.inflate(resId);
          self.setContentView(view);
        },
        'setContentView(Landroid/view/View;)V': (self, [view]) => {
          self.setContentView(unwrapView(view) || view);
        },
        'setContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view]) => {
          self.setContentView(unwrapView(view) || view);
        },
        'getContentView()Landroid/view/View;': (self) => (self.contentView ? viewObject(self.vm, self.contentView) : null),
        'findViewById(I)Landroid/view/View;': (self, [id]) => self.findViewById(id),
        'getWindow()Landroid/view/Window;': (self) => self.getWindowObject(),
        'getFragmentManager()Landroid/app/FragmentManager;': (self, _args, vm) => getFragmentManagerObject(vm),
        'getWindowManager()Landroid/view/WindowManager;': (self) => ({ $descriptor: 'Landroid/view/WindowManager;' }),
        'getLayoutInflater()Landroid/view/LayoutInflater;': (self, _args, vm) => { const li = new LayoutInflater(vm.contextObject); li.vm = vm; return li; },
        'getResources()Landroid/content/res/Resources;': (self, _args, vm) => vm.resources,
        'getAssets()Landroid/content/res/AssetManager;': (self, _args, vm) => vm.resources.getAssets(),
        'getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;': (self, [name], vm) => {
          const prefs = vm.allocateRawObject('Landroid/content/SharedPreferences;');
          prefs.$peer = { name: jsString(name) };
          return prefs;
        },
        'getFilesDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile?.('/data/user/0/' + (vm.packageName || 'app') + '/files') ?? null,
        'getCacheDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile?.('/data/user/0/' + (vm.packageName || 'app') + '/cache') ?? null,
        'getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;': (self, [type], vm) => {
          const suffix = type ? '/' + jsString(type) : '';
          return vm.makeFile?.('/storage/emulated/0/Android/data/' + (vm.packageName || 'app') + '/files' + suffix) ?? null;
        },
        'getClassLoader()Ljava/lang/ClassLoader;': (self, _args, vm) => {
          if (!vm.classLoaderObject) vm.classLoaderObject = vm.allocateRawObject('Ljava/lang/ClassLoader;');
          return vm.classLoaderObject;
        },
        'getPackageName()Ljava/lang/String;': (self, _args, vm) => vm.packageName || '',
        'getApplicationInfo()Landroid/content/pm/ApplicationInfo;': (self, _args, vm) => {
          const info = vm.allocateRawObject('Landroid/content/pm/ApplicationInfo;');
          info.$peer = { packageName: vm.packageName || '' };
          return info;
        },
        'getPackageManager()Landroid/content/pm/PackageManager;': (self, _args, vm) => {
          if (!vm.packageManagerObject) {
            vm.packageManagerObject = vm.allocateRawObject('Landroid/content/pm/PackageManager;');
            vm.packageManagerObject.$peer = { vm };
          }
          return vm.packageManagerObject;
        },
        'getSystemService(Ljava/lang/String;)Ljava/lang/Object;': (self, [name], vm) => {
          const key = jsString(name);
          return vm.getSystemService?.(key) ?? null;
        },
        'getMainLooper()Landroid/os/Looper;': (self, _args, vm) => vm.mainLooper ?? null,
        'getString(I)Ljava/lang/String;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getString(I[Ljava/lang/Object;)Ljava/lang/String;': (self, [resId, args], vm) => vm.resources.getString(resId >>> 0),
        'getText(I)Ljava/lang/CharSequence;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getColor(I)I': (self, [resId], vm) => vm.resources.getColor(resId >>> 0),
        'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [resId], vm) => vm.resources.getDrawable(resId >>> 0),
        'getApplicationContext()Landroid/content/Context;': (self, _args, vm) => {
          if (!vm.applicationObject && vm.contextObject) return vm.contextObject;
          return vm.applicationObject ?? vm.contextObject;
        },
        'getApplication()Landroid/app/Application;': (self, _args, vm) => vm.applicationObject,
        'getIntent()Landroid/content/Intent;': (self) => self.intent,
        'setIntent(Landroid/content/Intent;)V': (self, [intent]) => {
          self.intent = intent;
        },
        'getComponentName()Landroid/content/ComponentName;': (self, _args, vm) => {
          const activityDescriptor = vm.registry.classNameOf(self.object);
          const className = activityDescriptor?.startsWith('L')
            ? activityDescriptor.slice(1, -1).replace(/\//g, '.')
            : (vm.packageName || '');
          const packageName = vm.packageName || '';
          const object = vm.allocateRawObject('Landroid/content/ComponentName;');
          object.$peer = {
            vm,
            constructor: { $descriptor: 'Landroid/content/ComponentName;' },
            pkg: packageName,
            cls: className,
          };
          return object;
        },
        'getCallingActivity()Landroid/content/ComponentName;': () => null,
        'getCallingPackage()Ljava/lang/String;': () => null,
        'setTitle(Ljava/lang/CharSequence;)V': (self, [title]) => {
          self.title = jsString(title);
          self.screen?.invalidate();
        },
        'setTitle(I)V': (self, [resId], vm) => {
          self.title = vm.resources.getString(resId >>> 0);
          self.screen?.invalidate();
        },
        'getTitle()Ljava/lang/CharSequence;': (self) => self.title,
        'runOnUiThread(Ljava/lang/Runnable;)V': (self, [runnable], vm) => {
          vm.handler.post(() => vm.runRunnable(runnable));
        },
        'isFinishing()Z': (self) => !!self.finished,
        'finish()V': (self) => self.finish(),
        'startActivity(Landroid/content/Intent;)V': (self, [intent], vm) => {
          vm.startActivity(intent, self);
        },
        'startActivityForResult(Landroid/content/Intent;I)V': (self, [intent], vm) => {
          vm.startActivity(intent, self);
        },
        'startActivityIfNeeded(Landroid/content/Intent;I)Z': (self, [intent], vm) => {
          vm.startActivity(intent, self);
          return true;
        },
        'requestWindowFeature(I)Z': () => true,
        'setRequestedOrientation(I)V': () => undefined,
        'onCreateOptionsMenu(Landroid/view/Menu;)Z': () => false,
        'onOptionsItemSelected(Landroid/view/MenuItem;)Z': () => false,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/Context;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getResources()Landroid/content/res/Resources;': (self, _args, vm) => self.resources || vm.resources,
        'getAssets()Landroid/content/res/AssetManager;': (self, _args, vm) => (self.resources || vm.resources)?.getAssets(),
        'getApplicationContext()Landroid/content/Context;': (self, _args, vm) => self.contextObject || self,
        'getPackageName()Ljava/lang/String;': (self, _args, vm) => vm.packageName,
        'isRestricted()Z': () => false,
        'getString(I)Ljava/lang/String;': (self, [resId], vm) => (self.resources || vm.resources).getString(resId >>> 0),
        'getString(I[Ljava/lang/Object;)Ljava/lang/String;': (self, [resId, args]) => {
          const values = Array.isArray(args) ? args : args?.$data || [];
          return (self.resources || vm.resources).getString(resId >>> 0, ...values);
        },
        'getText(I)Ljava/lang/CharSequence;': (self, [resId], vm) => (self.resources || vm.resources).getString(resId >>> 0),
        'getColor(I)I': (self, [resId], vm) => (self.resources || vm.resources).getColor(resId >>> 0),
        'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [resId], vm) => (self.resources || vm.resources).getDrawable(resId >>> 0),
        'getSystemService(Ljava/lang/String;)Ljava/lang/Object;': (self, [name], vm) => vm.getSystemService?.(jsString(name)) ?? null,
        'getSharedPreferences(Ljava/lang/String;I)Landroid/content/SharedPreferences;': (self, [name], vm) => {
          const prefs = vm.allocateRawObject('Landroid/content/SharedPreferences;');
          prefs.$peer = { name: jsString(name) };
          return prefs;
        },
        'getFilesDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile('/data/user/0/' + (vm.packageName || 'app') + '/files'),
        'getCacheDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile('/data/user/0/' + (vm.packageName || 'app') + '/cache'),
        'getExternalFilesDir(Ljava/lang/String;)Ljava/io/File;': (self, [type], vm) => {
          const suffix = type ? '/' + jsString(type) : '';
          return vm.makeFile('/storage/emulated/0/Android/data/' + (vm.packageName || 'app') + '/files' + suffix);
        },
        'getNoBackupFilesDir()Ljava/io/File;': (self, _args, vm) => vm.makeFile('/data/user/0/' + (vm.packageName || 'app') + '/no_backup'),
        'getClassLoader()Ljava/lang/ClassLoader;': (self, _args, vm) => {
          if (!vm.classLoaderObject) vm.classLoaderObject = vm.allocateRawObject('Ljava/lang/ClassLoader;');
          return vm.classLoaderObject;
        },
        'getPackageManager()Landroid/content/pm/PackageManager;': (self, _args, vm) => {
          if (!vm.packageManagerObject) {
            const object = vm.allocateRawObject('Landroid/content/pm/PackageManager;');
            object.$peer = { vm, constructor: { $descriptor: 'Landroid/content/pm/PackageManager;' } };
            vm.packageManagerObject = object;
          }
          return vm.packageManagerObject;
        },
        'getMainLooper()Landroid/os/Looper;': (self, _args, vm) => vm.mainLooper,
        'getApplicationInfo()Landroid/content/pm/ApplicationInfo;': (self) => ({ $descriptor: 'Landroid/content/pm/ApplicationInfo;' }),
        'checkSelfPermission(Ljava/lang/String;)I': () => 0,
        'startActivity(Landroid/content/Intent;)V': (self, [intent], vm) => {
          vm.startActivity(intent, null);
        },
        'startActivity(Landroid/content/Intent;Landroid/os/Bundle;)V': (self, [intent], vm) => {
          vm.startActivity(intent, null);
        },
        'startActivityForResult(Landroid/content/Intent;I)V': (self, [intent], vm) => {
          vm.startActivity(intent, null);
        },
        'getTheme()Landroid/content/res/Resources$Theme;': (self, _args, vm) => getThemeObject(vm),
        'setTheme(I)V': () => undefined,
        'setTheme(Landroid/content/res/Resources$Theme;)V': () => undefined,
        'obtainStyledAttributes([I)Landroid/content/res/TypedArray;': (self, [attrs], vm) => createTypedArray(vm, attrs),
        'obtainStyledAttributes(I[I)Landroid/content/res/TypedArray;': (self, [_style, attrs], vm) => createTypedArray(vm, attrs),
        'obtainStyledAttributes(Landroid/util/AttributeSet;[I)Landroid/content/res/TypedArray;': (self, [_set, attrs], vm) => createTypedArray(vm, attrs),
        'obtainStyledAttributes(Landroid/util/AttributeSet;[III)Landroid/content/res/TypedArray;': (self, [_set, attrs], vm) => createTypedArray(vm, attrs),
        'obtainStyledAttributes([IIII)Landroid/content/res/TypedArray;': (self, [attrs], vm) => createTypedArray(vm, attrs),
      },
    })
  );

  defs.push(nativeDef('Landroid/content/ContextWrapper;', { super: 'Landroid/content/Context;' }));
  defs.push(nativeDef('Landroid/content/ContextThemeWrapper;', { super: 'Landroid/content/ContextWrapper;' }));

  defs.push(
    nativeDef('Landroid/app/Application;', {
      super: 'Landroid/content/ContextWrapper;',
      ctor: class ApplicationPeer {
        static $descriptor = 'Landroid/app/Application;';
        constructor(vm) {
          this.vm = vm;
          this.resources = vm?.resources ?? null;
          this.contextObject = vm?.contextObject ?? this;
        }
      },
      methods: {
        'onCreate()V': () => undefined,
        'onTerminate()V': () => undefined,
        'onLowMemory()V': () => undefined,
        'onTrimMemory(I)V': () => undefined,
        'onConfigurationChanged(Landroid/content/res/Configuration;)V': () => undefined,
        'registerActivityLifecycleCallbacks(Landroid/app/Application$ActivityLifecycleCallbacks;)V': () => undefined,
        'unregisterActivityLifecycleCallbacks(Landroid/app/Application$ActivityLifecycleCallbacks;)V': () => undefined,
        'registerOnProvideAssistDataListener(Landroid/app/Application$OnProvideAssistDataListener;)V': () => undefined,
        'unregisterOnProvideAssistDataListener(Landroid/app/Application$OnProvideAssistDataListener;)V': () => undefined,
        'getResources()Landroid/content/res/Resources;': (self, _args, vm) => self.resources ?? vm.resources,
        'getAssets()Landroid/content/res/AssetManager;': (self, _args, vm) => vm.resources.getAssets(),
        'getPackageName()Ljava/lang/String;': (self, _args, vm) => vm.apk?.manifest?.packageName ?? '',
        'getApplicationContext()Landroid/content/Context;': (self) => self,
        'getApplicationInfo()Landroid/content/pm/ApplicationInfo;': (self, _args, vm) =>
          vm.allocateRawObject('Landroid/content/pm/ApplicationInfo;'),
        'getSystemService(Ljava/lang/String;)Ljava/lang/Object;': (self, [name], vm) => contextSystemService(vm, jsString(name)),
        'getClassLoader()Ljava/lang/ClassLoader;': (self, _args, vm) => {
          if (!vm.classLoaderObject) {
            vm.classLoaderObject = vm.allocateRawObject('Ljava/lang/ClassLoader;');
            vm.classLoaderObject.$peer = { vm, constructor: { $descriptor: 'Ljava/lang/ClassLoader;' } };
          }
          return vm.classLoaderObject;
        },
        'isRestricted()Z': () => false,
        'getProcessName()Ljava/lang/String;': (self, _args, vm) => vm.apk?.manifest?.packageName ?? '',
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/res/TypedArray;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'length()I': (self) => self.length?.() ?? self.values?.size ?? 0,
        'getIndexCount()I': (self) => self.getIndexCount?.() ?? self.values?.size ?? 0,
        'hasValue(I)Z': (self, [index]) => !!self.hasValue?.(index | 0),
        'getBoolean(IZ)Z': (self, [index, fallback]) => self.getBoolean?.(index | 0, !!fallback) ?? !!fallback,
        'getInt(II)I': (self, [index, fallback]) => self.getInt?.(index | 0, fallback | 0) ?? (fallback | 0),
        'getInteger(II)I': (self, [index, fallback]) => self.getInteger?.(index | 0, fallback | 0) ?? (fallback | 0),
        'getFloat(IF)F': (self, [index, fallback]) => self.getFloat?.(index | 0, Number(fallback) || 0) ?? (Number(fallback) || 0),
        'getResourceId(II)I': (self, [index, fallback]) => (self.getResourceId?.(index | 0, fallback >>> 0) ?? fallback) >>> 0,
        'getDimension(IF)F': (self, [index, fallback]) => self.getDimension?.(index | 0, Number(fallback) || 0) ?? 0,
        'getDimensionPixelSize(II)I': (self, [index, fallback]) => self.getDimensionPixelSize?.(index | 0, fallback | 0) ?? 0,
        'getDimensionPixelOffset(II)I': (self, [index, fallback]) => self.getDimensionPixelOffset?.(index | 0, fallback | 0) ?? 0,
        'getLayoutDimension(II)I': (self, [index, fallback]) => self.getLayoutDimension?.(index | 0, fallback | 0) ?? 0,
        'getColor(II)I': (self, [index, fallback]) => (self.getColor?.(index | 0, fallback >>> 0) ?? fallback) >>> 0,
        'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [index]) => self.getDrawable?.(index | 0) ?? null,
        'getColorStateList(I)Landroid/content/res/ColorStateList;': (self, [index]) => {
          const color = self.getColor?.(index | 0);
          if (color === undefined || color === null) return null;
          return { $descriptor: 'Landroid/content/res/ColorStateList;', color: color >>> 0 };
        },
        'getString(I)Ljava/lang/String;': (self, [index]) => self.getString?.(index | 0) ?? null,
        'getNonResourceString(I)Ljava/lang/String;': (self, [index]) => self.getNonResourceString?.(index | 0) ?? null,
        'getText(I)Ljava/lang/CharSequence;': (self, [index]) => self.getText?.(index | 0) ?? null,
        'getFraction(IIF)F': (self, [index, base, fallback]) => self.getFraction?.(index | 0, base | 0, Number(fallback) || 0) ?? 0,
        'peekValue(I)Landroid/util/TypedValue;': (self, [index]) => self.peekValue?.(index | 0) ?? null,
        'getValue(ILandroid/util/TypedValue;)Z': (self, [index, out]) => !!self.getValue?.(index | 0, out),
        'recycle()V': (self) => self.recycle?.(),
        'close()V': (self) => self.close?.(),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/res/Resources$Theme;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'applyStyle(IZ)V': (self) => self.applyStyle?.(),
        'setTo(Landroid/content/res/Resources$Theme;)V': (self) => self.setTo?.(),
        'resolveAttribute(ILandroid/util/TypedValue;Z)Z': (self, [attrId, out, resolveRefs]) =>
          !!self.resolveAttribute?.(attrId >>> 0, out, !!resolveRefs),
        'obtainStyledAttributes([I)Landroid/content/res/TypedArray;': (self, [attrs], vm) =>
          self.obtainStyledAttributes?.(attrs) ?? createTypedArray(vm, attrs),
        'obtainStyledAttributes(I[I)Landroid/content/res/TypedArray;': (self, [styleId, attrs], vm) =>
          self.obtainStyledAttributesWithStyle?.(styleId, attrs, vm) ?? createTypedArray(vm, attrs),
        'obtainStyledAttributes(ILandroid/util/AttributeSet;[III)Landroid/content/res/TypedArray;': (self, [styleId, _set, attrs], vm) =>
          self.obtainStyledAttributesWithStyle?.(styleId, attrs, vm) ?? createTypedArray(vm, attrs),
        'obtainStyledAttributes(Landroid/util/AttributeSet;[III)Landroid/content/res/TypedArray;': (self, [_set, attrs], vm) =>
          self.obtainStyledAttributes?.(attrs) ?? createTypedArray(vm, attrs),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/util/TypedValue;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getFloat()F': (self) => Number(self.data) || 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Bundle;', {
      super: 'Ljava/lang/Object;',
      ctor: class BundlePeer {
        constructor() {
          this.map = new Map();
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.map = new Map();
        },
        '<init>(Landroid/os/Bundle;)V': (self, [other]) => {
          self.map = new Map(other?.$peer?.map || []);
        },
        '<init>(I)V': (self) => {
          self.map = new Map();
        },
        'putString(Ljava/lang/String;Ljava/lang/String;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getString(Ljava/lang/String;)Ljava/lang/String;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getString(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (self, [key, fallback]) => self.map.get(jsString(key)) ?? fallback,
        'putInt(Ljava/lang/String;I)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getInt(Ljava/lang/String;)I': (self, [key]) => self.map.get(jsString(key)) ?? 0,
        'getInt(Ljava/lang/String;I)I': (self, [key, fallback]) => self.map.get(jsString(key)) ?? fallback,
        'putBoolean(Ljava/lang/String;Z)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getBoolean(Ljava/lang/String;)Z': (self, [key]) => Boolean(self.map.get(jsString(key))),
        'getBoolean(Ljava/lang/String;Z)Z': (self, [key, fallback]) => self.map.has(jsString(key)) ? Boolean(self.map.get(jsString(key))) : fallback,
        'putLong(Ljava/lang/String;J)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getLong(Ljava/lang/String;)J': (self, [key]) => BigInt(self.map.get(jsString(key)) ?? 0),
        'putDouble(Ljava/lang/String;D)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getDouble(Ljava/lang/String;)D': (self, [key]) => Number(self.map.get(jsString(key)) ?? 0),
        'putFloat(Ljava/lang/String;F)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getFloat(Ljava/lang/String;)F': (self, [key]) => Number(self.map.get(jsString(key)) ?? 0),
        'putChar(Ljava/lang/String;C)V': (self, [key, value]) => {
          self.map.set(jsString(key), value);
        },
        'getChar(Ljava/lang/String;)C': (self, [key]) => Number(self.map.get(jsString(key)) ?? 0),
        'putBundle(Ljava/lang/String;Landroid/os/Bundle;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'getBundle(Ljava/lang/String;)Landroid/os/Bundle;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putParcelable(Ljava/lang/String;Landroid/os/Parcelable;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'getParcelable(Ljava/lang/String;)Landroid/os/Parcelable;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'getParcelable(Ljava/lang/String;Ljava/lang/Class;)Ljava/lang/Object;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putSerializable(Ljava/lang/String;Ljava/io/Serializable;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'getSerializable(Ljava/lang/String;)Ljava/io/Serializable;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putStringArrayList(Ljava/lang/String;Ljava/util/ArrayList;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'getStringArrayList(Ljava/lang/String;)Ljava/util/ArrayList;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putIntegerArrayList(Ljava/lang/String;Ljava/util/ArrayList;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'putParcelableArrayList(Ljava/lang/String;Ljava/util/ArrayList;)V': (self, [key, value]) => {
          self.map.set(jsString(key), value ?? null);
        },
        'containsKey(Ljava/lang/String;)Z': (self, [key]) => self.map.has(jsString(key)),
        'remove(Ljava/lang/String;)V': (self, [key]) => {
          self.map.delete(jsString(key));
        },
        'clear()V': (self) => {
          self.map.clear();
        },
        'size()I': (self) => self.map.size,
        'isEmpty()Z': (self) => self.map.size === 0,
        'keySet()Ljava/util/Set;': (self, _args, vm) => vm.wrapPeer({
          map: self.map,
          constructor: { $descriptor: 'Ljava/util/Set;' },
          toArray: () => [...self.map.keys()],
        }),
        'get(Ljava/lang/String;)Ljava/lang/Object;': (self, [key]) => self.map.get(jsString(key)) ?? null,
        'putAll(Landroid/os/Bundle;)V': (self, [other]) => {
          const source = other?.$peer?.map;
          if (source) for (const [key, value] of source) self.map.set(key, value);
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Looper;', {
      super: 'Ljava/lang/Object;',
      ctor: class LooperPeer {
        constructor(vm) {
          this.vm = vm;
          this.queue = vm.messageQueue;
        }
      },
      methods: {
        'getQueue()Landroid/os/MessageQueue;': (self) => self.queue,
        'getThread()Ljava/lang/Thread;': (self, _args, vm) => mainThreadObject(vm),
        'isCurrentThread()Z': () => true,
        'quit()V': (self) => self.quit?.(),
        'quitSafely()V': (self) => self.quit?.(),
      },
      staticMethods: {
        'getMainLooper()Landroid/os/Looper;': (_self, _args, vm) => vm.mainLooper,
        'myLooper()Landroid/os/Looper;': (_self, _args, vm) => vm.mainLooper,
        'prepare()V': () => undefined,
        'loop()V': (_self, _args, vm) => {
          const depth = (vm.__loopDepth = (vm.__loopDepth || 0) + 1);
          if (depth > 64) {
            vm.__loopDepth = 0;
            throw new Error('vm-thread-exit');
          }
          return undefined;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/MessageQueue;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'isIdle()Z': () => true,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Handler;', {
      super: 'Ljava/lang/Object;',
      ctor: class HandlerPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          this.queue = vm.messageQueue;
          this.callbacks = new Map();
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.handler = new Handler(self.vm);
        },
        '<init>(Landroid/os/Looper;)V': (self) => {
          self.handler = new Handler(self.vm);
          self.looper = self.vm.mainLooper;
        },
        'post(Ljava/lang/Runnable;)Z': (self, [runnable]) => {
          if (!self.handler) self.handler = new Handler(self.vm);
          self.handler.post(runnable);
          return true;
        },
        'postDelayed(Ljava/lang/Runnable;J)Z': (self, [runnable, delay]) => {
          if (!self.handler) self.handler = new Handler(self.vm);
          self.handler.postDelayed(runnable, Number(delay) || 0);
          return true;
        },
        'postAtFrontOfQueue(Ljava/lang/Runnable;)Z': (self, [runnable]) => {
          if (!self.handler) self.handler = new Handler(self.vm);
          self.handler.post(runnable);
          return true;
        },
        'removeCallbacks(Ljava/lang/Runnable;)V': (self, [runnable]) => {
          self.handler?.removeCallbacks(runnable);
        },
        'removeCallbacksAndMessages(Ljava/lang/Object;)V': (self, [token]) => {
          self.handler?.removeCallbacksAndMessages?.(token);
        },
        'removeMessages(I)V': (self, [what]) => {
          self.handler?.removeMessages(what);
        },
        'sendEmptyMessage(I)Z': (self, [what]) => {
          self.handler?.sendMessage({ what: Number(what) });
          return true;
        },
        'sendEmptyMessageDelayed(IJ)Z': (self, [what, delay]) => {
          self.handler?.sendMessageDelayed({ what: Number(what) }, Number(delay) || 0);
          return true;
        },
        'sendMessage(Landroid/os/Message;)Z': (self, [message]) => {
          self.handler?.sendMessage(message);
          return true;
        },
        'sendMessageDelayed(Landroid/os/Message;J)Z': (self, [message, delay]) => {
          self.handler?.sendMessageDelayed(message, Number(delay) || 0);
          return true;
        },
        'obtainMessage()Landroid/os/Message;': (self, _args, vm) => new MessagePeer(vm),
        'handleMessage(Landroid/os/Message;)V': () => undefined,
        'getLooper()Landroid/os/Looper;': (self) => self.vm.mainLooper,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Message;', {
      super: 'Ljava/lang/Object;',
      ctor: class MessagePeer {
        constructor(vm) {
          this.vm = vm;
          this.what = 0;
          this.obj = null;
          this.callback = null;
        }
      },
      methods: {
        'toString()Ljava/lang/String;': (self) => `Message{what=${self.what}}`,
      },
      staticMethods: {
        'obtain()Landroid/os/Message;': (_self, _args, vm) => new MessagePeer(vm),
        'obtain(Landroid/os/Handler;)Landroid/os/Message;': (_self, [handler], vm) => new MessagePeer(vm),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/SystemClock;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'uptimeMillis()J': () => BigInt(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()))),
        'elapsedRealtime()J': () => BigInt(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()))),
        'sleep(J)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Toast;', {
      super: 'Ljava/lang/Object;',
      ctor: class ToastPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          this.text = '';
          this.duration = 0;
          this.visible = false;
          this.overlay = null;
        }
      },
      methods: {
        'setText(Ljava/lang/CharSequence;)V': (self, [text]) => {
          self.text = jsString(text);
        },
        'setText(I)V': (self, [resId]) => {
          self.text = self.vm.resources.getString(resId >>> 0);
        },
        'setDuration(I)V': (self, [duration]) => {
          self.duration = Number(duration) || 0;
        },
        'show()V': (self) => {
          Toast.show(self.vm, self.text, self.duration);
        },
        'cancel()V': (self) => {
          Toast.cancel(self.vm);
        },
      },
      staticMethods: {
        'makeText(Landroid/content/Context;Ljava/lang/CharSequence;I)Landroid/widget/Toast;': (_self, [context, text, duration], vm) => {
          const toast = vm.allocateRawObject('Landroid/widget/Toast;');
          toast.$peer = {
            vm,
            text: jsString(text),
            duration: Number(duration) || 0,
            constructor: { $descriptor: 'Landroid/widget/Toast;' },
            show() {
              Toast.show(vm, this.text, this.duration);
            },
            cancel() {
              Toast.cancel(vm);
            },
          };
          return toast;
        },
        'makeText(Landroid/content/Context;I)Landroid/widget/Toast;': (_self, [context, resId], vm) => {
          const toast = vm.allocateRawObject('Landroid/widget/Toast;');
          toast.$peer = {
            vm,
            text: vm.resources.getString(resId >>> 0),
            duration: 0,
            constructor: { $descriptor: 'Landroid/widget/Toast;' },
            show() {
              Toast.show(vm, this.text, this.duration);
            },
          };
          return toast;
        },
      },
      staticFields: new Map([
        ['LENGTH_SHORT:I', 0],
        ['LENGTH_LONG:I', 1],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/content/Intent;', {
      super: 'Ljava/lang/Object;',
      ctor: class IntentPeer {
        constructor(vm) {
          this.vm = vm;
          this.action = null;
          this.component = null;
          this.className = null;
          this.packageName = null;
          this.extras = new Map();
          this.flags = 0;
        }

        setClass(className) {
          this.className = normalizeClassName(className, this.vm?.packageName);
          this.packageName = packageOfClassName(this.className) || this.vm?.packageName || null;
          return this;
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.action = null;
          self.className = null;
          self.packageName = null;
          self.extras = new Map();
          self.flags = 0;
        },
        '<init>(Landroid/content/Context;Ljava/lang/Class;)V': (self, [context, klass]) => {
          const descriptor = klass?.$descriptor || klass?.$peer?.descriptor || null;
          if (descriptor) self.setClass(descriptor);
        },
        '<init>(Ljava/lang/String;)V': (self, [action]) => {
          self.action = jsString(action);
        },
        '<init>(Landroid/content/Intent;)V': (self, [other]) => {
          const source = other?.$peer || other;
          self.action = source?.action ?? null;
          self.component = source?.component ?? null;
          self.className = source?.className ?? null;
          self.packageName = source?.packageName ?? null;
          self.extras = new Map(source?.extras || []);
          self.flags = source?.flags ?? 0;
        },
        'setClass(Landroid/content/Context;Ljava/lang/Class;)Landroid/content/Intent;': (self, [_context, klass]) => {
          const descriptor = klass?.$descriptor || klass?.$peer?.descriptor || null;
          if (descriptor) self.setClass(descriptor);
          return self;
        },
        'setClassName(Landroid/content/Context;Ljava/lang/String;)Landroid/content/Intent;': (self, [_context, name]) => {
          self.setClass(jsString(name));
          return self;
        },
        'setClassName(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;': (self, [pkg, name]) => {
          self.setClass(jsString(name));
          self.packageName = jsString(pkg);
          return self;
        },
        'setComponent(Landroid/content/ComponentName;)Landroid/content/Intent;': (self, [component]) => {
          const peer = component?.$peer || component;
          if (peer?.className) {
            self.className = normalizeClassName(peer.className, peer.packageName);
            self.packageName = peer.packageName || null;
          }
          return self;
        },
        'getComponent()Landroid/content/ComponentName;': (self) => {
          if (!self.className) return null;
          return { $descriptor: 'Landroid/content/ComponentName;', packageName: self.packageName, className: self.className };
        },
        'getClassName()Ljava/lang/String;': (self) => self.className ?? null,
        'setPackage(Ljava/lang/String;)Landroid/content/Intent;': (self, [pkg]) => {
          self.packageName = jsString(pkg);
          return self;
        },
        'getPackage()Ljava/lang/String;': (self) => self.packageName ?? null,
        'addFlags(I)Landroid/content/Intent;': (self, [flags]) => {
          self.flags = (self.flags | (flags | 0)) >>> 0;
          return self;
        },
        'setFlags(I)Landroid/content/Intent;': (self, [flags]) => {
          self.flags = flags >>> 0;
          return self;
        },
        'getFlags()I': (self) => self.flags | 0,
        'setAction(Ljava/lang/String;)Landroid/content/Intent;': (self, [action]) => {
          self.action = jsString(action);
          return self;
        },
        'getAction()Ljava/lang/String;': (self) => self.action ?? null,
        'putExtra(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;I)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;Z)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;J)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;F)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtra(Ljava/lang/String;Ljava/io/Serializable;)Landroid/content/Intent;': (self, [key, value]) => {
          self.extras.set(jsString(key), value);
          return self;
        },
        'putExtras(Landroid/os/Bundle;)Landroid/content/Intent;': (self, [bundle]) => {
          const data = bundle?.$peer?.map || bundle?.map;
          if (data instanceof Map) for (const [key, value] of data) self.extras.set(String(key), value);
          return self;
        },
        'getStringExtra(Ljava/lang/String;)Ljava/lang/String;': (self, [key]) => self.extras.get(jsString(key)) ?? null,
        'getIntExtra(Ljava/lang/String;I)I': (self, [key, fallback]) => {
          const value = self.extras.get(jsString(key));
          return typeof value === 'number' ? value | 0 : fallback;
        },
        'getBooleanExtra(Ljava/lang/String;Z)Z': (self, [key, fallback]) => {
          const value = self.extras.get(jsString(key));
          return typeof value === 'boolean' ? value : fallback;
        },
        'hasExtra(Ljava/lang/String;)Z': (self, [key]) => self.extras.has(jsString(key)),
        'removeExtra(Ljava/lang/String;)V': (self, [key]) => {
          self.extras.delete(jsString(key));
        },
        'getExtras()Landroid/os/Bundle;': (self, _args, vm) => {
          if (!self.extras.size) return null;
          const object = vm.allocateRawObject('Landroid/os/Bundle;');
          object.$peer = { vm, map: new Map(self.extras) };
          return object;
        },
        'toString()Ljava/lang/String;': (self) =>
          `Intent { ${self.action ? `act=${self.action} ` : ''}${self.className ? `cmp=${self.packageName || ''}/${self.className}` : ''} }`,
      },
      staticFields: new Map([
        ['ACTION_MAIN:Ljava/lang/String;', 'android.intent.action.MAIN'],
        ['ACTION_VIEW:Ljava/lang/String;', 'android.intent.action.VIEW'],
        ['ACTION_SEND:Ljava/lang/String;', 'android.intent.action.SEND'],
        ['ACTION_PICK:Ljava/lang/String;', 'android.intent.action.PICK'],
        ['ACTION_GET_CONTENT:Ljava/lang/String;', 'android.intent.action.GET_CONTENT'],
        ['ACTION_OPEN_DOCUMENT:Ljava/lang/String;', 'android.intent.action.OPEN_DOCUMENT'],
        ['ACTION_CREATE_DOCUMENT:Ljava/lang/String;', 'android.intent.action.CREATE_DOCUMENT'],
        ['CATEGORY_DEFAULT:Ljava/lang/String;', 'android.intent.category.DEFAULT'],
        ['CATEGORY_LAUNCHER:Ljava/lang/String;', 'android.intent.category.LAUNCHER'],
        ['FLAG_ACTIVITY_NEW_TASK:I', 0x10000000],
        ['FLAG_ACTIVITY_CLEAR_TOP:I', 0x04000000],
        ['FLAG_ACTIVITY_SINGLE_TOP:I', 0x20000000],
        ['FLAG_ACTIVITY_CLEAR_TASK:I', 0x00008000],
        ['FLAG_GRANT_READ_URI_PERMISSION:I', 0x00000001],
        ['FLAG_GRANT_WRITE_URI_PERMISSION:I', 0x00000002],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewConfiguration;', {
      super: 'Ljava/lang/Object;',
      ctor: class ViewConfigurationPeer {
        constructor() {
          this.touchSlop = 8;
          this.tapTimeout = 100;
          this.longPressTimeout = 500;
          this.doubleTapTimeout = 300;
          this.doubleTapSlop = 100;
          this.scrollBarSize = 4;
          this.pressedStateDuration = 64;
          this.keyRepeatTimeout = 500;
          this.windowTouchSlop = 8;
          this.hoverSlop = 8;
        }
      },
      methods: {
        'getScaledTouchSlop()I': (self) => self.touchSlop ?? 8,
        'getScaledDoubleTapSlop()I': (self) => self.doubleTapSlop ?? 100,
        'getScaledMinimumFlingVelocity()I': () => 50,
        'getScaledMaximumFlingVelocity()I': () => 8000,
        'getScaledScrollBarSize()I': (self) => self.scrollBarSize ?? 4,
        'getScaledPagingTouchSlop()I': (self) => (self.touchSlop ?? 8) * 2,
        'getScaledHoverSlop()I': (self) => self.hoverSlop ?? 8,
        'getScaledOverscrollDistance()I': () => 0,
        'getScaledOverflingDistance()I': () => 0,
        'getScaledWindowTouchSlop()I': (self) => self.windowTouchSlop ?? 8,
        'getTapTimeout()I': (self) => self.tapTimeout ?? 100,
        'getLongPressTimeout()I': (self) => self.longPressTimeout ?? 500,
        'getDoubleTapTimeout()I': (self) => self.doubleTapTimeout ?? 300,
        'getKeyRepeatTimeout()I': (self) => self.keyRepeatTimeout ?? 500,
        'getKeyRepeatDelay()I': () => 50,
        'getPressedStateDuration()I': (self) => self.pressedStateDuration ?? 64,
        'getJumpTapTimeout()I': () => 500,
        'hasPermanentMenuKey()Z': () => false,
        'hasShowStableMenuKey()Z': () => true,
        'hasPermanentMenuKey(I)Z': () => false,
        'getDefaultActionModeHideDuration()I': () => 300,
      },
      staticMethods: {
        'get(Landroid/content/Context;)Landroid/view/ViewConfiguration;': (_self, _args, vm) => {
          if (!vm) return null;
          if (!vm.viewConfigurationObject) {
            const object = vm.allocateRawObject('Landroid/view/ViewConfiguration;');
            object.$peer = new ViewConfigurationPeer();
            vm.viewConfigurationObject = object;
          }
          return vm.viewConfigurationObject;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewTreeObserver;', {
      super: 'Ljava/lang/Object;',
      ctor: class ViewTreeObserverPeer {
        static $descriptor = 'Landroid/view/ViewTreeObserver;';
        constructor() {
          this.onGlobalLayoutListeners = [];
          this.onPreDrawListeners = [];
          this.onDrawListeners = [];
          this.alive = true;
        }
      },
      methods: {
        'addOnGlobalLayoutListener(Landroid/view/ViewTreeObserver$OnGlobalLayoutListener;)V': (self, [listener]) => {
          if (listener) self.onGlobalLayoutListeners.push(listener);
        },
        'removeOnGlobalLayoutListener(Landroid/view/ViewTreeObserver$OnGlobalLayoutListener;)V': (self, [listener]) => {
          const index = self.onGlobalLayoutListeners.indexOf(listener);
          if (index >= 0) self.onGlobalLayoutListeners.splice(index, 1);
        },
        'addOnPreDrawListener(Landroid/view/ViewTreeObserver$OnPreDrawListener;)V': (self, [listener]) => {
          if (listener) self.onPreDrawListeners.push(listener);
        },
        'removeOnPreDrawListener(Landroid/view/ViewTreeObserver$OnPreDrawListener;)V': (self, [listener]) => {
          const index = self.onPreDrawListeners.indexOf(listener);
          if (index >= 0) self.onPreDrawListeners.splice(index, 1);
        },
        'addOnDrawListener(Landroid/view/ViewTreeObserver$OnDrawListener;)V': (self, [listener]) => {
          if (listener) self.onDrawListeners.push(listener);
        },
        'removeOnDrawListener(Landroid/view/ViewTreeObserver$OnDrawListener;)V': (self, [listener]) => {
          const index = self.onDrawListeners.indexOf(listener);
          if (index >= 0) self.onDrawListeners.splice(index, 1);
        },
        'addOnScrollChangedListener(Landroid/view/ViewTreeObserver$OnScrollChangedListener;)V': () => undefined,
        'removeOnScrollChangedListener(Landroid/view/ViewTreeObserver$OnScrollChangedListener;)V': () => undefined,
        'addOnTouchModeChangeListener(Landroid/view/ViewTreeObserver$OnTouchModeChangeListener;)V': () => undefined,
        'removeOnTouchModeChangeListener(Landroid/view/ViewTreeObserver$OnTouchModeChangeListener;)V': () => undefined,
        'isAlive()Z': (self) => !!self.alive,
        'dispatchOnGlobalLayout()V': (self, _args, vm) => {
          for (const listener of [...self.onGlobalLayoutListeners]) {
            vm.invokeByName?.('onGlobalLayout', '()V', listener, []);
          }
        },
        'dispatchOnPreDraw()Z': (self, _args, vm) => {
          let result = true;
          for (const listener of [...self.onPreDrawListeners]) {
            const value = vm.invokeByName?.('onPreDraw', '()Z', listener, []);
            if (value === false) result = false;
          }
          return result;
        },
        'dispatchOnDraw()V': (self, _args, vm) => {
          for (const listener of [...self.onDrawListeners]) {
            vm.invokeByName?.('onDraw', '()V', listener, []);
          }
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/View;', {
      super: 'Ljava/lang/Object;',
      ctor: viewPeerConstructor('Landroid/view/View;'),
      methods: viewMethods(),
      staticMethods: {
        'generateViewId()I': () => ++VIEW_ID_COUNTER,
      },
      staticFields: new Map([
        ['VISIBLE:I', 0],
        ['INVISIBLE:I', 4],
        ['GONE:I', 8],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewGroup;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/view/ViewGroup;'),
      methods: {
        'addView(Landroid/view/View;)V': (self, [view]) => {
          const child = view?.$view || view;
          if (child && self.view) self.view.addView(child);
        },
        'addView(Landroid/view/View;I)V': (self, [view, index]) => {
          const child = view?.$view || view;
          if (child && self.view) self.view.addView(child, index | 0);
        },
        'addView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view, params]) => {
          const child = view?.$view || view;
          if (child && self.view) {
            if (params) child.layoutParams = params;
            self.view.addView(child);
          }
        },
        'addView(Landroid/view/View;II)V': (self, [view, width, height]) => {
          const child = view?.$view || view;
          if (child && self.view) {
            child.layoutParams = { width: width | 0, height: height | 0 };
            self.view.addView(child);
          }
        },
        'removeView(Landroid/view/View;)V': (self, [view]) => {
          const child = view?.$view || view;
          if (child && self.view) self.view.removeView(child);
        },
        'removeViewAt(I)V': (self, [index]) => self.view?.removeViewAt?.(index | 0),
        'removeViewInLayout(Landroid/view/View;)V': (self, [view]) => {
          const child = view?.$view || view;
          if (child && self.view) self.view.removeView(child);
        },
        'removeAllViews()V': (self) => self.view?.removeAllViews?.(),
        'removeAllViewsInLayout()V': (self) => self.view?.removeAllViews?.(),
        'getChildCount()I': (self) => self.view?.getChildCount?.() ?? 0,
        'getChildAt(I)Landroid/view/View;': (self, [index], vm) => {
          if (globalThis.FV_DBG) console.error('GETCHILD self=', typeof self, 'hasView=', !!self?.view, 'idx=', index, 'kids=', self?.view?.children?.length);
          const child = self.view?.getChildAt?.(index | 0);
          return child ? viewObject(vm, child) : null;
        },
        'indexOfChild(Landroid/view/View;)I': (self, [view]) => {
          const child = view?.$view || view;
          return child && self.view ? self.view.indexOfChild(child) : -1;
        },
        'setClipChildren(Z)V': (self, [value]) => self.view?.setClipChildren?.(!!value),
        'setClipToPadding(Z)V': (self, [value]) => self.view?.setClipToPadding?.(!!value),
        'setPadding(IIII)V': (self, [l, t, r, b]) => self.view?.setPadding(l | 0, t | 0, r | 0, b | 0),
        'measureChildren(II)V': (self, [w, h]) => self.view?.measureChildren?.(w, h),
        'drawChild(Landroid/graphics/Canvas;Landroid/view/View;J)Z': () => true,
        'dispatchDraw(Landroid/graphics/Canvas;)V': (self, [canvas]) => self.view?.dispatchDraw?.(canvas),
        'getBackground()Landroid/graphics/drawable/Drawable;': (self) => self.view?.getBackground() ?? null,
        'getBaseline()I': (self) => self.view?.getBaseline?.() ?? -1,
        'getFocusedChild()Landroid/view/View;': () => null,
        'hasFocus()Z': (self) => self.view?.hasFocus?.() ?? false,
        'focusSearch(Landroid/view/View;I)Landroid/view/View;': () => null,
        'requestChildFocus(Landroid/view/View;Landroid/view/View;)V': () => undefined,
        'requestDisallowInterceptTouchEvent(Z)V': () => undefined,
        'onViewAdded(Landroid/view/View;)V': () => undefined,
        'onViewRemoved(Landroid/view/View;)V': () => undefined,
        'setOnHierarchyChangeListener(Landroid/view/ViewGroup$OnHierarchyChangeListener;)V': () => undefined,
        'setDescendantFocusability(I)V': () => undefined,
        'getLayoutMode()I': () => 0,
        'setLayoutMode(I)V': () => undefined,
        'getLayoutTransition()Landroid/animation/LayoutTransition;': () => null,
        'setLayoutTransition(Landroid/animation/LayoutTransition;)V': () => undefined,
        'setMotionEventSplittingEnabled(Z)V': () => undefined,
        'isTransitionGroup()Z': () => false,
        'setTransitionGroup(Z)V': () => undefined,
        'onRequestSendAccessibilityEvent(Landroid/view/View;Landroid/view/accessibility/AccessibilityEvent;)Z': () => true,
        'startViewTransition(Landroid/view/View;)V': () => undefined,
        'endViewTransition(Landroid/view/View;)V': () => undefined,
        'checkLayoutParams(Landroid/view/ViewGroup$LayoutParams;)Z': () => true,
        'getNestedScrollAxes()I': () => 0,
        'setNestedScrollAxes(I)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/MenuInflater;', {
      super: 'Ljava/lang/Object;',
      ctor: class MenuInflaterPeer {
        constructor(vm, context) {
          this.vm = vm;
          this.context = context ?? null;
        }
      },
      methods: {
        'inflate(ILandroid/view/Menu;)V': (self, [resId, menu]) => {
          if (!menu) return;
          const resources = self.vm?.resources;
          const parsed = resources ? parseMenuResource(resources, resId >>> 0, self.vm) : null;
          if (!parsed || !parsed.length) return;
          const menuPeer = menu.$peer || menu;
          for (const item of parsed) {
            menuPeer.add?.(item.groupId | 0, item.itemId | 0, item.order | 0, item.title);
          }
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/LayoutInflater;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'inflate(ILandroid/view/ViewGroup;)Landroid/view/View;': (self, [resId, root]) => {
          const inflater = new LayoutInflater(self.vm.contextObject);
          inflater.vm = self.vm;
          return viewObject(self.vm, inflater.inflate(resId, unwrapView(root) || null, false));
        },
        'inflate(ILandroid/view/ViewGroup;Z)Landroid/view/View;': (self, [resId, root, attach]) => {
          const inflater = new LayoutInflater(self.vm.contextObject);
          inflater.vm = self.vm;
          return viewObject(self.vm, inflater.inflate(resId, unwrapView(root) || null, !!attach));
        },
        'setFactory(Landroid/view/LayoutInflater$Factory;)V': (self, [factory]) => {
          self.factory = factory ?? null;
        },
        'setFactory2(Landroid/view/LayoutInflater$Factory2;)V': (self, [factory]) => {
          self.factory = factory ?? null;
        },
        'getFactory()Landroid/view/LayoutInflater$Factory;': (self) => self.factory ?? null,
        'getFactory2()Landroid/view/LayoutInflater$Factory2;': (self) => self.factory ?? null,
        'setPrivateFactory(Landroid/view/LayoutInflater$Factory2;)V': (self, [factory]) => {
          self.factory = factory ?? null;
        },
        'cloneInContext(Landroid/content/Context;)Landroid/view/LayoutInflater;': (self, _args, vm) => {
          const peer = { vm, constructor: { $descriptor: 'Landroid/view/LayoutInflater;' } };
          const object = vm.allocateRawObject('Landroid/view/LayoutInflater;');
          object.$peer = peer;
          return object;
        },
      },
      staticMethods: {
      'generateViewId()I': () => ++VIEW_ID_COUNTER,
        'from(Landroid/content/Context;)Landroid/view/LayoutInflater;': (_self, [context], vm) => {
          const peer = { vm, constructor: { $descriptor: 'Landroid/view/LayoutInflater;' } };
          const object = vm.allocateRawObject('Landroid/view/LayoutInflater;');
          object.$peer = peer;
          return object;
        },
      },
    })
  );

  defs.push(nativeDef('Landroid/view/Window;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'getCallback()Landroid/view/Window$Callback;': (self, _args, vm) =>
        vm?.windowCallback ?? self.callback ?? self.window?.callback ?? null,
      'setCallback(Landroid/view/Window$Callback;)V': (self, [callback], vm) => {
        self.callback = callback ?? null;
        if (vm) vm.windowCallback = callback ?? null;
        if (self.window) self.window.callback = callback ?? null;
      },
      'getDecorView()Landroid/view/View;': (self) => (self.window?.decorView ? viewObject(self.vm, self.window.decorView) : null),
      'getAttributes()Landroid/view/WindowManager$LayoutParams;': (self, _args, vm) => {
        if (self.attributes) return self.attributes;
        const definition = vm.registry.resolve('Landroid/view/WindowManager$LayoutParams;');
        const object = vm.allocateObject(definition);
        object.$peer = {
          width: -1,
          height: -1,
          x: 0,
          y: 0,
          gravity: 0,
          flags: 0,
          format: -1,
          type: 1,
          softInputMode: 0,
          layoutInDisplayCutoutMode: 0,
          horizontalMargin: 0,
          verticalMargin: 0,
          windowAnimations: 0,
          alpha: 1,
          screenBrightness: -1,
          buttonBrightness: -1,
        };
        self.attributes = object;
        return object;
      },
      'getCurrentFocus()Landroid/view/View;': () => null,
      'findViewById(I)Landroid/view/View;': (self, [id]) => {
        const view = self.window?.decorView?.findViewById(id >>> 0);
        return view ? self.vm.wrapView?.(view) ?? null : null;
      },
      'requestFeature(I)Z': () => true,
      'addFlags(I)V': () => {},
      'clearFlags(I)V': () => {},
      'setFlags(II)V': () => {},
      'setStatusBarColor(I)V': (self, [color]) => {
        if (self.window) self.window.statusBarColor = color >>> 0;
      },
      'setNavigationBarColor(I)V': (self, [color]) => {
        if (self.window) self.window.navigationBarColor = color >>> 0;
      },
      'setSoftInputMode(I)V': () => {},
      'setDecorFitsSystemWindows(Z)V': () => {},
      'peekDecorView()Landroid/view/View;': (self, _args, vm) => {
        if (!self.window) return null;
        return self.window.decorView ? self.vm.wrapView?.(self.window.decorView) ?? null : null;
      },
      'setBackgroundDrawable(Landroid/graphics/drawable/Drawable;)V': () => {},
      'setBackgroundDrawableResource(I)V': () => {},
      'setLayout(II)V': () => {},
      'isFloating()Z': () => false,
      'setTitle(Ljava/lang/CharSequence;)V': (self, [title]) => {
        if (self.window) self.window.title = jsString(title);
      },
      'setContentView(Landroid/view/View;)V': (self, [view], vm) => {
        const target = unwrapView(view);
        if (!target || !self.window) return;
        self.window.setContentView?.(target);
        self.window.contentView = target;
        self.screen?.invalidate?.();
        vm?.requestLayout?.();
      },
      'setContentView(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V': (self, [view, params], vm) => {
        const target = unwrapView(view);
        if (!target || !self.window) return;
        if (params) target.layoutParams = params;
        self.window.setContentView?.(target);
        self.window.contentView = target;
        self.screen?.invalidate?.();
        vm?.requestLayout?.();
      },
      'setContentView(I)V': (self, [layoutId], vm) => {
        if (!self.window || !vm?.resources) return;
        const view = vm.resources.getLayout?.(layoutId >>> 0, vm.contextObject);
        if (!view) return;
        self.window.setContentView?.(view);
        self.window.contentView = view;
        self.screen?.invalidate?.();
        vm?.requestLayout?.();
      },
    },
  }));
  defs.push(nativeDef('Landroid/view/WindowManager;', { super: 'Ljava/lang/Object;' }));
  defs.push(nativeDef('Landroid/view/Window$Callback;', { super: null }));
  defs.push(nativeDef('Landroid/view/LayoutInflater$Factory;', { super: null }));
  defs.push(nativeDef('Landroid/view/LayoutInflater$Factory2;', { super: 'Landroid/view/LayoutInflater$Factory;' }));
  defs.push(nativeDef('Landroid/view/Menu;', { super: 'Ljava/lang/Object;' }));
  defs.push(nativeDef('Landroid/view/MenuItem;', { super: 'Ljava/lang/Object;' }));

  defs.push(nativeDef('Landroid/app/FragmentManager;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'findFragmentByTag(Ljava/lang/String;)Landroid/app/Fragment;': (self, [tag]) => self.findFragmentByTag?.(tag) ?? null,
      'findFragmentById(I)Landroid/app/Fragment;': (self, [id]) => self.findFragmentById?.(id) ?? null,
      'beginTransaction()Landroid/app/FragmentTransaction;': (self) => self.beginTransaction?.() ?? null,
      'executePendingTransactions()Z': (self) => self.executePendingTransactions?.() ?? true,
      'isDestroyed()Z': () => false,
      'getFragments()Ljava/util/List;': () => null,
    },
  }));
  defs.push(nativeDef('Landroid/app/FragmentTransaction;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'add(Landroid/app/Fragment;Ljava/lang/String;)Landroid/app/FragmentTransaction;': (self, [fragment, tag]) => self.add?.(0, fragment, tag) ?? null,
      'add(ILandroid/app/Fragment;Ljava/lang/String;)Landroid/app/FragmentTransaction;': (self, [id, fragment, tag]) => self.add?.(id, fragment, tag) ?? null,
      'replace(ILandroid/app/Fragment;Ljava/lang/String;)Landroid/app/FragmentTransaction;': (self, [id, fragment, tag]) => self.replace?.(id, fragment, tag) ?? null,
      'remove(Landroid/app/Fragment;)Landroid/app/FragmentTransaction;': (self, [fragment]) => self.remove?.(fragment) ?? null,
      'hide(Landroid/app/Fragment;)Landroid/app/FragmentTransaction;': (self) => self,
      'show(Landroid/app/Fragment;)Landroid/app/FragmentTransaction;': (self) => self,
      'addToBackStack(Ljava/lang/String;)Landroid/app/FragmentTransaction;': (self) => self,
      'setTransition(I)Landroid/app/FragmentTransaction;': (self) => self,
      'setReorderingAllowed(Z)Landroid/app/FragmentTransaction;': (self) => self,
      'commit()I': (self) => self.commit?.() ?? 0,
      'commitAllowingStateLoss()I': (self) => self.commitAllowingStateLoss?.() ?? 0,
      'commitNow()V': (self) => self.commitNow?.(),
      'isEmpty()Z': (self) => self.isEmpty?.() ?? true,
    },
  }));
  defs.push(nativeDef('Landroid/app/Fragment;', { super: 'Ljava/lang/Object;' }));

  defs.push(nativeDef('Ljava/lang/reflect/Method;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'isAccessible()Z': (self) => self.accessible ?? true,
      'setAccessible(Z)V': (self, [value]) => {
        self.accessible = !!value;
      },
      'getName()Ljava/lang/String;': (self) => self.name ?? '',
      'getDeclaringClass()Ljava/lang/Class;': (self, _args, vm) =>
        self.classDesc ? vm.getClassObject(self.classDesc) : null,
      'getReturnType()Ljava/lang/Class;': (self, _args, vm) => {
        const type = self.proto?.returnType;
        return type && vm ? vm.getClassObject(type) : null;
      },
      'getParameterTypes()[Ljava/lang/Class;': (self, _args, vm) => {
        const params = self.proto?.parameters || [];
        const array = vm.newArray('[Ljava/lang/Class;', params.length, null);
        params.forEach((descriptor, index) => {
          array.$data[index] = vm.getClassObject(descriptor);
        });
        return array;
      },
      'isVarArgs()Z': () => false,
      'getModifiers()I': (self) => self.$target?.accessFlags ?? 1,
      'isBridge()Z': () => false,
      'isSynthetic()Z': () => false,
      'equals(Ljava/lang/Object;)Z': (self, [other]) =>
        !!other && other.name === self.name && other.classDesc === self.classDesc
          && other.proto?.descriptor === self.proto?.descriptor,
      'hashCode()I': (self) => hashCode(`${self.classDesc}#${self.name}${self.proto?.descriptor || ''}`),
      'toString()Ljava/lang/String;': (self) =>
        `${self.classDesc || ''}.${self.name}${self.proto?.descriptor || ''}`,
      'invoke(Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;': (self, [target, args], vm) => {
        const targetMethod = self.$target;
        if (!targetMethod) {
          vm.throwException('Ljava/lang/NullPointerException;', `反射方法 ${self.name} 未绑定目标`);
        }
        const argumentList = args?.$data || args || [];
        const isStatic = !!targetMethod.isStatic || (target === null && !targetMethod.isConstructor);
        const mode = isStatic ? 'static' : 'virtual';
        const receiver = mode === 'static' ? null : target;
        vm.ensureClassInitialized(vm.registry.resolve(targetMethod.classDesc));
        if (self.isNative) {
          return vm.invoke(
            { classDesc: targetMethod.classDesc, name: targetMethod.name, proto: targetMethod.proto },
            receiver,
            argumentList,
            mode === 'static' ? 'static' : 'virtual'
          );
        }
        if (mode === 'static') {
          return vm.executeMethod(targetMethod, null, argumentList);
        }
        return vm.invoke(
          { classDesc: targetMethod.classDesc, name: targetMethod.name, proto: targetMethod.proto },
          receiver,
          argumentList,
          'virtual'
        );
      },
    },
  }));
  defs.push(nativeDef('Ljava/lang/reflect/Field;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'isAccessible()Z': (self) => self.accessible ?? true,
      'setAccessible(Z)V': (self, [value]) => {
        self.accessible = !!value;
      },
      'getName()Ljava/lang/String;': (self) => self.name ?? '',
      'getDeclaringClass()Ljava/lang/Class;': (self, _args, vm) =>
        self.classDesc ? vm.getClassObject(self.classDesc) : null,
      'getType()Ljava/lang/Class;': (self, _args, vm) =>
        self.type && vm ? vm.getClassObject(self.type) : null,
      'getModifiers()I': () => 1,
      'isEnumConstant()Z': () => false,
      'isSynthetic()Z': () => false,
      'equals(Ljava/lang/Object;)Z': (self, [other]) =>
        !!other && other.name === self.name && other.classDesc === self.classDesc,
      'hashCode()I': (self) => hashCode(`${self.classDesc}#${self.name}`),
      'toString()Ljava/lang/String;': (self) => `${self.classDesc || ''}.${self.name}`,
      'get(Ljava/lang/Object;)Ljava/lang/Object;': (self, [target], vm) => {
        if (self.isStatic) {
          return vm.getStaticField({ classDesc: self.classDesc, name: self.name, type: self.type });
        }
        if (target === null || target === undefined) {
          vm.throwException('Ljava/lang/NullPointerException;', `读取字段 ${self.name} 时对象为空`);
        }
        return vm.getField(target, { name: self.name, type: self.type, classDesc: self.classDesc });
      },
      'getInt(Ljava/lang/Object;)I': (self, args, vm) => toIntValue(vm, self, args),
      'getLong(Ljava/lang/Object;)J': (self, args, vm) => toLong(toIntValue(vm, self, args)),
      'getBoolean(Ljava/lang/Object;)Z': (self, args, vm) => !!toIntValue(vm, self, args),
      'getFloat(Ljava/lang/Object;)F': (self, args, vm) => Number(toIntValue(vm, self, args)) || 0,
      'getDouble(Ljava/lang/Object;)D': (self, args, vm) => Number(toIntValue(vm, self, args)) || 0,
      'set(Ljava/lang/Object;Ljava/lang/Object;)V': (self, [target, value], vm) => {
        if (self.isStatic) {
          vm.setStaticField({ classDesc: self.classDesc, name: self.name, type: self.type }, value);
          return;
        }
        if (target === null || target === undefined) {
          vm.throwException('Ljava/lang/NullPointerException;', `写入字段 ${self.name} 时对象为空`);
        }
        vm.setField(target, { name: self.name, type: self.type, classDesc: self.classDesc }, value);
      },
      'setInt(Ljava/lang/Object;I)V': (self, [target, value], vm) => setFieldValue(vm, self, target, toInt(value)),
      'setLong(Ljava/lang/Object;J)V': (self, [target, value], vm) => setFieldValue(vm, self, target, toLong(value)),
      'setBoolean(Ljava/lang/Object;Z)V': (self, [target, value], vm) => setFieldValue(vm, self, target, value ? 1 : 0),
      'setFloat(Ljava/lang/Object;F)V': (self, [target, value], vm) => setFieldValue(vm, self, target, Number(value) || 0),
      'setDouble(Ljava/lang/Object;D)V': (self, [target, value], vm) => setFieldValue(vm, self, target, Number(value) || 0),
    },
  }));
  defs.push(nativeDef('Ljava/lang/reflect/Constructor;', {
    super: 'Ljava/lang/Object;',
    methods: {
      'isAccessible()Z': (self) => self.accessible ?? true,
      'setAccessible(Z)V': (self, [value]) => {
        self.accessible = !!value;
      },
      'getName()Ljava/lang/String;': () => '<init>',
      'getDeclaringClass()Ljava/lang/Class;': (self, _args, vm) =>
        self.classDesc ? vm.getClassObject(self.classDesc) : null,
      'getParameterTypes()[Ljava/lang/Class;': (self, _args, vm) => {
        const params = self.proto?.parameters || [];
        const array = vm.newArray('[Ljava/lang/Class;', params.length, null);
        params.forEach((descriptor, index) => {
          array.$data[index] = vm.getClassObject(descriptor);
        });
        return array;
      },
      'getModifiers()I': (self) => self.$target?.accessFlags ?? 1,
      'isVarArgs()Z': () => false,
      'isSynthetic()Z': () => false,
      'newInstance([Ljava/lang/Object;)Ljava/lang/Object;': (self, [args], vm) => {
        const targetMethod = self.$target;
        if (!targetMethod) return null;
        const argumentList = args?.$data || args || [];
        const rc = vm.registry.resolve(self.classDesc);
        vm.ensureClassInitialized(rc);
        const object = vm.allocateObject(rc);
        if (process.env.DBG_INV) console.error('REG-CTOR class=' + self.classDesc + ' rc=' + !!rc + ' obj=' + (object === null || object === undefined ? 'NIL' : typeof object) + ' args=' + (argumentList && argumentList.length));
        vm.executeMethod(targetMethod, object, argumentList);
        return object;
      },
    },
  }));

  defs.push(
    nativeDef('Landroid/widget/TextView;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/widget/TextView;'),
      methods: {
        'setText(Ljava/lang/CharSequence;)V': (self, [text]) => self.view?.setText(jsString(text)),
        'setText(I)V': (self, [resId]) => self.view?.setText(self.vm.resources.getString(resId >>> 0)),
        'getText()Ljava/lang/CharSequence;': (self) => self.view?.getText() ?? '',
        'setTextSize(F)V': (self, [size]) => self.view?.setTextSize(Number(size)),
        'setTextSize(IF)V': (self, [unit, size]) => self.view?.setTextSize(convertDimension({ dimension: { value: Number(size), unit: unit === 2 ? 'sp' : 'dp' } }, self.vm.resources.density)),
        'setTextColor(I)V': (self, [color]) => self.view?.setTextColor(color >>> 0),
        'setGravity(I)V': (self, [gravity]) => self.view?.setGravity(gravity | 0),
        'getTransformationMethod()Landroid/text/method/TransformationMethod;': () => null,
        'setMovementMethod(Landroid/text/method/MovementMethod;)V': (self, [method]) => {
          self.movementMethod = method ?? null;
        },
        'getMovementMethod()Landroid/text/method/MovementMethod;': (self) => self.movementMethod ?? null,
        'setTextColor(Landroid/content/res/ColorStateList;)V': (self, [csl]) => {
          const color = csl?.$peer?.color ?? csl?.color;
          if (typeof color === 'number') self.view?.setTextColor?.(color >>> 0);
        },
        'setHintTextColor(Landroid/content/res/ColorStateList;)V': () => undefined,
        'setLinkTextColor(Landroid/content/res/ColorStateList;)V': () => undefined,
        'setTextLocales(Landroid/os/LocaleList;)V': () => undefined,
        'setFontVariationSettings(Ljava/lang/String;)Z': () => true,
        'setTypeface(Landroid/graphics/Typeface;)V': () => undefined,
        'setTypeface(Landroid/graphics/Typeface;I)V': () => undefined,
        'setTypeface(Landroid/graphics/Typeface;)Landroid/widget/TextView;': (self) => self.object,
        'setTypeface(Landroid/graphics/Typeface;I)Landroid/widget/TextView;': (self) => self.object,
        'append(Ljava/lang/CharSequence;)V': (self, [text]) => self.view?.append(jsString(text)),
        'setSingleLine()V': (self) => self.view?.setSingleLine(true),
        'setSingleLine(Z)V': (self, [value]) => self.view?.setSingleLine(!!value),
        'setMaxLines(I)V': (self, [lines]) => self.view?.setMaxLines(Number(lines)),
        'setAllCaps(Z)V': (self, [value]) => self.view?.setTextAllCaps(!!value),
        'getTextSize()F': (self) => self.view?.getTextSize() ?? 0,
        'getCurrentTextColor()I': (self) => self.view?.getCurrentTextColor() ?? 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/Button;', {
      super: 'Landroid/widget/TextView;',
      ctor: viewPeerConstructor('Landroid/widget/Button;'),
      methods: {
        'setText(Ljava/lang/CharSequence;)V': (self, [text]) => self.view?.setText(jsString(text)),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/EditText;', {
      super: 'Landroid/widget/TextView;',
      ctor: viewPeerConstructor('Landroid/widget/EditText;'),
      methods: {
        'getText()Landroid/text/Editable;': (self) => self.view?.getText() ?? '',
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/OverScroller;', {
      super: 'Ljava/lang/Object;',
      methods: {
        '<init>(Landroid/content/Context;)V': () => undefined,
        '<init>(Landroid/content/Context;Landroid/view/animation/Interpolator;)V': () => undefined,
        'isFinished()Z': () => true,
        'abortAnimation()V': () => undefined,
        'computeScrollOffset()Z': () => false,
        'fling(IIIIIIIIII)Z': () => false,
        'springBack(IIIIII)Z': () => false,
        'getCurrX()I': () => 0,
        'getCurrY()I': () => 0,
        'startScroll(IIII)V': () => undefined,
        'startScroll(IIIII)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ImageView;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/widget/ImageView;'),
      methods: {
        'setImageResource(I)V': (self, [resId]) => {
          self.view.drawable = self.vm.resources.getDrawable(resId >>> 0);
          self.view.invalidate();
        },
        'setImageDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => {
          self.view.drawable = drawable;
          self.view.invalidate();
        },
        'getDrawable()Landroid/graphics/drawable/Drawable;': (self) => self.view?.drawable ?? null,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/LinearLayout;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/LinearLayout;'),
      methods: {
        'setOrientation(I)V': (self, [orientation]) => self.view?.setOrientation(orientation | 0),
        'setGravity(I)V': (self, [gravity]) => self.view?.setGravity(gravity | 0),
        'setWeightSum(F)V': (self, [sum]) => self.view?.setWeightSum(Number(sum)),
      },
      staticFields: new Map([['HORIZONTAL:I', 0], ['VERTICAL:I', 1]]),
    })
  );

  defs.push(
    nativeDef('Landroid/widget/FrameLayout;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/FrameLayout;'),
    })
  );

  defs.push(
    nativeDef('Landroidx/appcompat/widget/ContentFrameLayout;', {
      super: 'Landroid/widget/FrameLayout;',
      ctor: viewPeerConstructor('Landroid/widget/FrameLayout;'),
      methods: {
        ...viewMethods(),
        'setDecorPadding(IIII)V': (self, [l, t, r, b]) => {
          const object = self.object;
          const key = 'Landroidx/appcompat/widget/ContentFrameLayout;->mDecorPadding:Landroid/graphics/Rect;';
          let rect = object?.$fields?.get(key);
          if (!rect) {
            rect = self.vm.allocateRawObject('Landroid/graphics/Rect;');
            rect.$peer = { rect: new Rect(l | 0, t | 0, r | 0, b | 0) };
            object?.$fields?.set(key, rect);
          } else if (rect.$peer?.rect) {
            rect.$peer.rect.set(l | 0, t | 0, r | 0, b | 0);
          } else if (rect.$peer) {
            rect.$peer.rect = new Rect(l | 0, t | 0, r | 0, b | 0);
          }
        },
        'dispatchFitSystemWindows(Landroid/graphics/Rect;)V': () => undefined,
        'setAttachListener(Landroidx/appcompat/widget/ContentFrameLayout$OnAttachListener;)V': (self, [listener]) => {
          if (self.object) self.object.$attachListener = listener;
        },
        'getFixedHeightMajor()Landroid/util/TypedValue;': (self, _a, vm) => ensureTypedValue(self, 'mFixedHeightMajor', vm),
        'getFixedHeightMinor()Landroid/util/TypedValue;': (self, _a, vm) => ensureTypedValue(self, 'mFixedHeightMinor', vm),
        'getFixedWidthMajor()Landroid/util/TypedValue;': (self, _a, vm) => ensureTypedValue(self, 'mFixedWidthMajor', vm),
        'getFixedWidthMinor()Landroid/util/TypedValue;': (self, _a, vm) => ensureTypedValue(self, 'mFixedWidthMinor', vm),
        'getMinWidthMajor()Landroid/util/TypedValue;': (self, _a, vm) => ensureTypedValue(self, 'mMinWidthMajor', vm),
        'getMinWidthMinor()Landroid/util/TypedValue;': (self, _a, vm) => ensureTypedValue(self, 'mMinWidthMinor', vm),
      },
    })
  );

  for (const [descriptor, superDescriptor] of [
    ['Landroidx/appcompat/widget/FitWindowsFrameLayout;', 'Landroid/widget/FrameLayout;'],
    ['Landroidx/appcompat/widget/FitWindowsLinearLayout;', 'Landroid/widget/LinearLayout;'],
    ['Landroidx/appcompat/widget/ViewStubCompat;', 'Landroid/view/View;'],
    ['Landroidx/appcompat/widget/ActionBarContextView;', 'Landroid/widget/LinearLayout;'],
    ['Landroidx/appcompat/widget/ActionBarContainer;', 'Landroid/widget/FrameLayout;'],
    ['Landroidx/appcompat/widget/ActionBarOverlayLayout;', 'Landroid/widget/FrameLayout;'],
    ['Landroidx/appcompat/widget/ActionBarBackgroundDrawable;', 'Landroid/graphics/drawable/Drawable;'],
    ['Landroidx/appcompat/widget/AppCompatTextView;', 'Landroid/widget/TextView;'],
    ['Landroidx/appcompat/widget/AppCompatImageView;', 'Landroid/widget/ImageView;'],
    ['Landroidx/appcompat/widget/AppCompatButton;', 'Landroid/widget/Button;'],
    ['Landroidx/appcompat/widget/AppCompatEditText;', 'Landroid/widget/EditText;'],
    ['Landroid/widget/ImageButton;', 'Landroid/widget/ImageView;'],
  ]) {
    defs.push(
      nativeDef(descriptor, {
        super: superDescriptor,
        ctor: viewPeerConstructor(descriptor, superDescriptor),
        methods: viewMethods(),
      })
    );
  }

  defs.push(
    nativeDef('Landroid/widget/RelativeLayout;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/RelativeLayout;'),
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ScrollView;', {
      super: 'Landroid/view/ViewGroup;',
      ctor: viewPeerConstructor('Landroid/widget/ScrollView;'),
      methods: {
        'scrollTo(II)V': (self, [x, y]) => self.view?.scrollTo?.(x, y),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/ProgressBar;', {
      super: 'Landroid/view/View;',
      ctor: viewPeerConstructor('Landroid/widget/ProgressBar;'),
      methods: {
        'setProgress(I)V': (self, [value]) => self.view?.setProgress?.(value),
        'setMax(I)V': (self, [value]) => self.view?.setMax?.(value),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/View$OnClickListener;', {
      super: null,
      methods: {
        'onClick(Landroid/view/View;)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/View$OnLongClickListener;', { super: null })
  );

  defs.push(
    nativeDef('Landroid/widget/RelativeLayout$LayoutParams;', {
      super: 'Landroid/view/ViewGroup$MarginLayoutParams;',
      ctor: class RelativeLayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) {
            object.$layoutParams = { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0 };
          }
          object.$layoutParams.rules ||= {};
        }
        get rules() { return this.object.$layoutParams.rules; }
      },
      methods: {
        '<init>(II)V': (self, [w, h]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
          p.rules ||= {};
        },
        'addRule(I)V': (self, [rule]) => {
          self.object.$layoutParams.rules[ruleVerb(rule)] = true;
        },
        'addRule(II)V': (self, [rule, subject]) => {
          self.object.$layoutParams.rules[ruleVerb(rule)] = subject >>> 0;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/LinearLayout$LayoutParams;', {
      super: 'Landroid/view/ViewGroup$MarginLayoutParams;',
      ctor: class LinearLayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) {
            object.$layoutParams = { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0, weight: 0, gravity: -1 };
          }
        }
        get weight() { return this.object.$layoutParams.weight || 0; }
        set weight(v) { this.object.$layoutParams.weight = Number(v) || 0; }
        get gravity() { return this.object.$layoutParams.gravity ?? -1; }
        set gravity(v) { this.object.$layoutParams.gravity = v | 0; }
      },
      methods: {
        '<init>(II)V': (self, [w, h]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
        },
        '<init>(IIF)V': (self, [w, h, weight]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
          p.weight = Number(weight) || 0;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/widget/FrameLayout$LayoutParams;', {
      super: 'Landroid/view/ViewGroup$MarginLayoutParams;',
      ctor: class FrameLayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) {
            object.$layoutParams = { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0, gravity: -1 };
          }
        }
        get gravity() { return this.object.$layoutParams.gravity ?? -1; }
        set gravity(v) { this.object.$layoutParams.gravity = v | 0; }
      },
      methods: {
        '<init>(II)V': (self, [w, h]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
        },
        '<init>(III)V': (self, [w, h, gravity]) => {
          const p = self.object.$layoutParams;
          p.width = w | 0;
          p.height = h | 0;
          p.gravity = gravity | 0;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/GestureDetector$OnGestureListener;', { super: null })
  );

  defs.push(
    nativeDef('Landroid/view/GestureDetector;', {
      super: 'Ljava/lang/Object;',
      ctor: class GestureDetectorPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
        }
        get listener() { return this.object.$listener || null; }
        set listener(v) { this.object.$listener = v; }
      },
      methods: {
        '<init>(Landroid/content/Context;Landroid/view/GestureDetector$OnGestureListener;)V': (self, [context, listener]) => {
          self.object.$listener = listener;
        },
        '<init>(Landroid/view/GestureDetector$OnGestureListener;)V': (self, [listener]) => {
          self.object.$listener = listener;
        },
        'setIsLongpressEnabled(Z)V': () => undefined,
        'onTouchEvent(Landroid/view/MotionEvent;)Z': () => false,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewGroup$LayoutParams;', {
      super: 'Ljava/lang/Object;',
      ctor: class LayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) {
            object.$layoutParams = { width: -2, height: -2 };
          }
        }
        get width() { return this.object.$layoutParams.width; }
        set width(v) { this.object.$layoutParams.width = v | 0; }
        get height() { return this.object.$layoutParams.height; }
        set height(v) { this.object.$layoutParams.height = v | 0; }
      },
      methods: {
        '<init>(II)V': (self, [width, height]) => {
          const params = self.object.$layoutParams || {};
          params.width = width | 0;
          params.height = height | 0;
          self.object.$layoutParams = params;
        },
        '<init>(Landroid/view/ViewGroup$LayoutParams;)V': (self, [other]) => {
          const source = other?.$layoutParams || other || {};
          self.object.$layoutParams = {
            ...source,
            width: source.width ?? -2,
            height: source.height ?? -2,
          };
        },
        'setBaseAttributes(Landroid/content/res/TypedArray;II)V': () => undefined,
      },
      instanceFields: new Map([
        ['width:I', -2],
        ['height:I', -2],
      ]),
      staticFields: new Map([
        ['MATCH_PARENT:I', -1],
        ['FILL_PARENT:I', -1],
        ['WRAP_CONTENT:I', -2],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/view/ViewGroup$MarginLayoutParams;', {
      super: 'Landroid/view/ViewGroup$LayoutParams;',
      ctor: class MarginLayoutParamsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.object = object;
          if (!object.$layoutParams) object.$layoutParams = { width: -2, height: -2, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0 };
        }
        get width() { return this.object.$layoutParams.width; }
        set width(v) { this.object.$layoutParams.width = v | 0; }
        get height() { return this.object.$layoutParams.height; }
        set height(v) { this.object.$layoutParams.height = v | 0; }
        get leftMargin() { return this.object.$layoutParams.leftMargin | 0; }
        set leftMargin(v) { this.object.$layoutParams.leftMargin = v | 0; }
        get topMargin() { return this.object.$layoutParams.topMargin | 0; }
        set topMargin(v) { this.object.$layoutParams.topMargin = v | 0; }
        get rightMargin() { return this.object.$layoutParams.rightMargin | 0; }
        set rightMargin(v) { this.object.$layoutParams.rightMargin = v | 0; }
        get bottomMargin() { return this.object.$layoutParams.bottomMargin | 0; }
        set bottomMargin(v) { this.object.$layoutParams.bottomMargin = v | 0; }
      },
      methods: {
        'setMargins(IIII)V': (self, [l, t, r, b]) => {
          const params = self.object.$layoutParams || {};
          params.leftMargin = l | 0;
          params.topMargin = t | 0;
          params.rightMargin = r | 0;
          params.bottomMargin = b | 0;
          self.object.$layoutParams = params;
        },
        'getMargins()Landroid/graphics/Rect;': (self, _a, vm) => {
          const params = self.object.$layoutParams || {};
          const rect = vm.allocateRawObject('Landroid/graphics/Rect;');
          rect.$peer = { rect: new Rect(params.leftMargin | 0, params.topMargin | 0, params.rightMargin | 0, params.bottomMargin | 0) };
          return rect;
        },
      },
      instanceFields: new Map([
        ['leftMargin:I', 0],
        ['topMargin:I', 0],
        ['rightMargin:I', 0],
        ['bottomMargin:I', 0],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Typeface;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['DEFAULT:Landroid/graphics/Typeface;', { $descriptor: 'Landroid/graphics/Typeface;' }],
        ['DEFAULT_BOLD:Landroid/graphics/Typeface;', { $descriptor: 'Landroid/graphics/Typeface;' }],
        ['MONOSPACE:Landroid/graphics/Typeface;', { $descriptor: 'Landroid/graphics/Typeface;' }],
      ]),
      staticMethods: {
        'create(Ljava/lang/String;I)Landroid/graphics/Typeface;': () => ({ $descriptor: 'Landroid/graphics/Typeface;' }),
        'create(Landroid/graphics/Typeface;I)Landroid/graphics/Typeface;': () => ({ $descriptor: 'Landroid/graphics/Typeface;' }),
        'create(Landroid/graphics/Typeface;IZ)Landroid/graphics/Typeface;': () => ({ $descriptor: 'Landroid/graphics/Typeface;' }),
        'create(Ljava/lang/String;ILandroid/graphics/Typeface;)Landroid/graphics/Typeface;': () => ({ $descriptor: 'Landroid/graphics/Typeface;' }),
        'defaultFromStyle(I)Landroid/graphics/Typeface;': () => ({ $descriptor: 'Landroid/graphics/Typeface;' }),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/LocaleList;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'forLanguageTags(Ljava/lang/String;)Landroid/os/LocaleList;': () => ({
          $descriptor: 'Landroid/os/LocaleList;',
          locales: [],
        }),
        'getDefault()Landroid/os/LocaleList;': (self, _args, vm) => ({
          $descriptor: 'Landroid/os/LocaleList;',
          locales: [makeDefaultLocaleObject(vm)],
        }),
      },
      methods: {
        'isEmpty()Z': (self) => !self.locales || self.locales.length === 0,
        'size()I': (self) => (self.locales ? self.locales.length : 1),
        'get(I)Ljava/util/Locale;': (self, [index], vm) => {
          if (self.locales && self.locales.length) {
            return self.locales[index | 0] ?? self.locales[0];
          }
          return makeDefaultLocaleObject(vm);
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Color;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'rgb(III)I': (_self, [r, g, b]) => (((255 << 24) | (toInt(r) << 16) | (toInt(g) << 8) | toInt(b)) >>> 0),
        'argb(IIII)I': (_self, [a, r, g, b]) =>
          (((toInt(a) << 24) | (toInt(r) << 16) | (toInt(g) << 8) | toInt(b)) >>> 0),
        'parseColor(Ljava/lang/String;)I': (_self, [value]) => {
          const text = jsString(value);
          if (text.startsWith('#')) return parseInt(text.slice(1).padStart(8, 'f'), 16) >>> 0;
          return 0xff000000;
        },
        'red(I)I': (_self, [color]) => (toInt(color) >>> 16) & 0xff,
        'green(I)I': (_self, [color]) => (toInt(color) >>> 8) & 0xff,
        'blue(I)I': (_self, [color]) => toInt(color) & 0xff,
        'alpha(I)I': (_self, [color]) => (toInt(color) >>> 24) & 0xff,
      },
      staticFields: new Map([
        ['BLACK:I', 0xff000000],
        ['WHITE:I', 0xffffffff],
        ['RED:I', 0xffff0000],
        ['GREEN:I', 0xff00ff00],
        ['BLUE:I', 0xff0000ff],
        ['TRANSPARENT:I', 0],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Paint;', {
      super: 'Ljava/lang/Object;',
      ctor: class PaintPeer {
        constructor() {
          this.paint = new Paint();
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.paint = new Paint();
        },
        'setColor(I)V': (self, [color]) => self.paint.setColor(color),
        'getColor()I': (self) => self.paint.getColor(),
        'setTextSize(F)V': (self, [size]) => self.paint.setTextSize(size),
        'getTextSize()F': (self) => self.paint.getTextSize(),
        'setAntiAlias(Z)V': (self, [value]) => self.paint.setAntiAlias(value),
        'setStrokeWidth(F)V': (self, [width]) => self.paint.setStrokeWidth(width),
        'setStyle(Landroid/graphics/Paint$Style;)V': (self, [style]) => self.paint.setStyle(style),
        'measureText(Ljava/lang/String;)F': (self, [text]) => self.paint.measureText(jsString(text)),
        'getFontMetrics()Landroid/graphics/Paint$FontMetrics;': (self) => self.paint.getFontMetrics(),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/graphics/Bitmap;', { super: 'Ljava/lang/Object;' })
  );

  defs.push(
    nativeDef('Landroid/graphics/Canvas;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'drawColor(I)V': (self, [color]) => self.canvas?.drawColor(color),
        'drawText(Ljava/lang/String;FFLandroid/graphics/Paint;)V': (self, [text, x, y, paint]) =>
          self.canvas?.drawText(jsString(text), x, y, paint?.paint),
        'drawRect(FFFFLandroid/graphics/Paint;)V': (self, [l, t, r, b, paint]) =>
          self.canvas?.drawRect(l, t, r, b, paint?.paint),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/util/Log;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'isLoggable(Ljava/lang/String;I)Z': () => false,
        'v(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('debug', jsString(tag), jsString(message));
          return 0;
        },
        'd(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('debug', jsString(tag), jsString(message));
          return 0;
        },
        'i(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('info', jsString(tag), jsString(message));
          return 0;
        },
        'w(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('warn', jsString(tag), jsString(message));
          return 0;
        },
        'e(Ljava/lang/String;Ljava/lang/String;)I': (_self, [tag, message], vm) => {
          vm.log('error', jsString(tag), jsString(message));
          return 0;
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/ComponentName;', {
      super: 'Ljava/lang/Object;',
      ctor: class ComponentNamePeer {
        constructor() {
          this.pkg = '';
          this.cls = '';
        }
      },
      methods: {
        '<init>(Ljava/lang/String;Ljava/lang/String;)V': (self, [pkg, cls]) => {
          self.pkg = jsString(pkg);
          self.cls = jsString(cls);
        },
        '<init>(Landroid/content/Context;Ljava/lang/Class;)V': (self, [context, klass], vm) => {
          self.pkg = vm.packageName || '';
          self.cls = klass?.$dexClass?.name || '';
        },
        'getPackageName()Ljava/lang/String;': (self, _args, vm) => vm.toJavaString(self.pkg),
        'getClassName()Ljava/lang/String;': (self, _args, vm) => vm.toJavaString(self.cls),
        'getShortClassName()Ljava/lang/String;': (self, _args, vm) => {
          const pkg = self.pkg;
          if (self.cls?.startsWith(`${pkg}.`)) return vm.toJavaString(self.cls.slice(pkg.length));
          return vm.toJavaString(self.cls);
        },
        'flattenToString()Ljava/lang/String;': (self) => `${self.pkg}/${self.cls}`,
        'flattenToShortString()Ljava/lang/String;': (self) => {
          const pkg = self.pkg;
          if (self.cls?.startsWith(`${pkg}.`)) return `${pkg}/${self.cls.slice(pkg.length)}`;
          return `${pkg}/${self.cls}`;
        },
        'equals(Ljava/lang/Object;)Z': (self, [other]) => {
          const peer = other?.$peer;
          return !!peer && peer.pkg === self.pkg && peer.cls === self.cls;
        },
        'hashCode()I': (self) => {
          const text = `${self.pkg}/${self.cls}`;
          let hash = 0;
          for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
          return hash;
        },
        'toString()Ljava/lang/String;': (self) => `ComponentInfo{${self.pkg}/${self.cls}}`,
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/ActivityInfo;', {
      super: 'Landroid/content/pm/PackageItemInfo;',
      ctor: class ActivityInfoPeer {
        constructor() {
          this.parentActivityName = null;
          this.metaData = null;
          this.name = '';
          this.packageName = '';
          this.theme = 0;
          this.launchMode = 0;
          this.exported = false;
        }
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/PackageItemInfo;', { super: 'Ljava/lang/Object;' })
  );
  defs.push(
    nativeDef('Landroid/content/pm/PackageManager;', {
      super: 'Ljava/lang/Object;',
      ctor: class PackageManagerPeer {
        constructor(vm) {
          this.vm = vm;
        }
      },
      methods: {
        'getActivityInfo(Landroid/content/ComponentName;I)Landroid/content/pm/ActivityInfo;': (self, [component], vm) => {
          const peer = component?.$peer;
          const className = peer?.cls || '';
          const manifest = vm.apk?.manifest;
          const application = manifest?.findChild?.('application');
          const activities = application?.findAll?.('activity') || [];
          const target = activities.find((activity) => {
            const rawName = activity.getAttribute('android:name') || activity.getAttribute('name') || '';
            let fullName = rawName;
            if (rawName.startsWith('.')) fullName = `${peer?.pkg || ''}${rawName}`;
            else if (rawName && !rawName.includes('.')) fullName = `${peer?.pkg || ''}.${rawName}`;
            return fullName === className || rawName === className;
          });
          if (!target) return null;
          const info = vm.allocateRawObject('Landroid/content/pm/ActivityInfo;');
          const infoPeer = { vm, constructor: { $descriptor: 'Landroid/content/pm/ActivityInfo;' } };
          info.$peer = infoPeer;
          infoPeer.name = target.getAttribute('android:name') || target.getAttribute('name') || '';
          infoPeer.packageName = peer?.pkg || vm.packageName || '';
          infoPeer.parentActivityName = target.getAttribute('android:parentActivityName');
          infoPeer.exported = (target.getAttribute('android:exported') || '').toLowerCase() === 'true';
          const themeRaw = target.getAttribute('android:theme');
          if (themeRaw) {
            const resolved = vm.resources.resolveAttribute?.(themeRaw);
            if (typeof resolved === 'number') infoPeer.theme = resolved;
          }
          return info;
        },
        'getPackageInfo(Ljava/lang/String;I)Landroid/content/pm/PackageInfo;': (self, [pkg], vm) => {
          const info = vm.allocateRawObject('Landroid/content/pm/PackageInfo;');
          info.$peer = {
            vm,
            constructor: { $descriptor: 'Landroid/content/pm/PackageInfo;' },
            packageName: jsString(pkg),
          };
          return info;
        },
        'queryIntentActivities(Landroid/content/Intent;I)Ljava/util/List;': () => null,
        'resolveActivity(Landroid/content/Intent;I)Landroid/content/pm/ResolveInfo;': () => null,
        'getApplicationInfo(Ljava/lang/String;I)Landroid/content/pm/ApplicationInfo;': (self, _args, vm) => {
          const info = vm.allocateRawObject('Landroid/content/pm/ApplicationInfo;');
          info.$peer = { vm, constructor: { $descriptor: 'Landroid/content/pm/ApplicationInfo;' } };
          return info;
        },
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/PackageInfo;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getLongVersionCode()J': (self) => BigInt(Number(self.versionCode) || 0),
        'toString()Ljava/lang/String;': (self) => `PackageInfo{${self.packageName}}`,
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/ResolveInfo;', { super: 'Ljava/lang/Object;' })
  );
  defs.push(
    nativeDef('Landroidx/activity/ComponentActivity;', {
      super: 'Landroid/app/Activity;',
      methods: {
        'getLastNonConfigurationInstance()Ljava/lang/Object;': () => null,
        'onRetainNonConfigurationInstance()Ljava/lang/Object;': () => null,
        'getOnBackPressedDispatcher()Landroidx/activity/OnBackPressedDispatcher;': () => null,
        'addOnContextAvailableListener(Landroidx/activity/contextaware/OnContextAvailableListener;)V': () => undefined,
      },
    })
  );
  defs.push(
    nativeDef('Landroid/content/pm/ApplicationInfo;', { super: 'Ljava/lang/Object;' })
  );
  defs.push(
    nativeDef('Landroid/content/res/Configuration;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'toString()Ljava/lang/String;': () => 'Configuration{}',
        'getLocales()Landroid/os/LocaleList;': (self, _args, vm) => {
          const object = vm.allocateRawObject('Landroid/os/LocaleList;');
          object.$peer = { locales: [makeDefaultLocaleObject(vm)] };
          return object;
        },
        'getLocale()Ljava/util/Locale;': (self, _args, vm) => makeDefaultLocaleObject(vm),
        'getLayoutDirection()I': () => 0,
      },
    })
  );
  defs.push(
    nativeDef('Landroid/util/DisplayMetrics;', {
      super: 'Ljava/lang/Object;',
      ctor: class MetricsPeer {
        constructor() {
          this.widthPixels = 360;
          this.heightPixels = 720;
          this.density = 1;
          this.densityDpi = 160;
          this.scaledDensity = 1;
        }
      },
      instanceFields: new Map([
        ['widthPixels:I', 360],
        ['heightPixels:I', 720],
        ['density:F', 1],
        ['densityDpi:I', 160],
        ['scaledDensity:F', 1],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/text/TextUtils;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'isEmpty(Ljava/lang/CharSequence;)Z': (_self, [value]) => {
          if (value === null || value === undefined) return true;
          return jsString(value).length === 0;
        },
        'join(Ljava/lang/CharSequence;Ljava/lang/Iterable;)Ljava/lang/String;': (_self, [separator, values]) =>
          (values?.items || []).map(jsString).join(jsString(separator)),
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/Build;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['VERSION:Landroid/os/Build$VERSION;', { $descriptor: 'Landroid/os/Build$VERSION;' }],
        ['MODEL:Ljava/lang/String;', 'Browser'],
        ['MANUFACTURER:Ljava/lang/String;', 'MonkeyCode'],
        ['BRAND:Ljava/lang/String;', 'MonkeyCode'],
        ['DEVICE:Ljava/lang/String;', 'browser'],
        ['PRODUCT:Ljava/lang/String;', 'browser'],
        ['BOARD:Ljava/lang/String;', 'browser'],
        ['HARDWARE:Ljava/lang/String;', 'browser'],
        ['FINGERPRINT:Ljava/lang/String;', 'MonkeyCode/browser/browser:12/SQ3A.220705.004/1:user/release-keys'],
        ['TYPE:Ljava/lang/String;', 'user'],
        ['TAGS:Ljava/lang/String;', 'release-keys'],
        ['ID:Ljava/lang/String;', 'SQ3A.220705.004'],
        ['DISPLAY:Ljava/lang/String;', 'SQ3A.220705.004'],
        ['HOST:Ljava/lang/String;', 'monkeycode'],
        ['USER:Ljava/lang/String;', 'root'],
        ['CPU_ABI:Ljava/lang/String;', 'arm64-v8a'],
        ['CPU_ABI2:Ljava/lang/String;', ''],
        ['RADIO:Ljava/lang/String;', 'unknown'],
        ['BOOTLOADER:Ljava/lang/String;', 'unknown'],
        ['SERIAL:Ljava/lang/String;', 'unknown'],
        ['TIME:I', 0],
        ['SOC_MANUFACTURER:Ljava/lang/String;', 'MonkeyCode'],
        ['SOC_MODEL:Ljava/lang/String;', 'browser'],
      ]),
    })
  );
  defs.push(
    nativeDef('Landroid/os/Build$VERSION;', {
      super: 'Ljava/lang/Object;',
      staticFields: new Map([
        ['SDK_INT:I', 31],
        ['RELEASE:Ljava/lang/String;', '12'],
      ]),
    })
  );

  defs.push(
    nativeDef('Landroid/telephony/TelephonyManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getDeviceId()Ljava/lang/String;': () => null,
        'getNetworkOperatorName()Ljava/lang/String;': () => '',
        'getSimState()I': () => 0,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/hardware/SensorManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getDefaultSensor(I)Landroid/hardware/Sensor;': () => null,
        'registerListener(Landroid/hardware/SensorEventListener;Landroid/hardware/Sensor;I)Z': () => false,
        'unregisterListener(Landroid/hardware/SensorEventListener;)V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/app/NotificationManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'notify(ILandroid/app/Notification;)V': () => undefined,
        'cancel(I)V': () => undefined,
        'cancelAll()V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/res/Resources;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'getString(I)Ljava/lang/String;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getString(I[Ljava/lang/Object;)Ljava/lang/String;': (self, [resId, args], vm) =>
          vm.resources.getString(resId >>> 0, ...(args?.$data || [])),
        'getText(I)Ljava/lang/CharSequence;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getColor(I)I': (self, [resId], vm) => vm.resources.getColor(resId >>> 0),
        'getBoolean(I)Z': (self, [resId], vm) => !!vm.resources.getBoolean(resId >>> 0),
        'getInteger(I)I': (self, [resId], vm) => vm.resources.getInteger(resId >>> 0),
        'getQuantityString(II)Ljava/lang/String;': (self, [resId], vm) => vm.resources.getString(resId >>> 0),
        'getStringArray(I)[Ljava/lang/String;': (self, [resId], vm) => {
          const value = vm.resources.resolve(resId >>> 0);
          return Array.isArray(value) ? value : [];
        },
        'getIntArray(I)[I': (self, [resId], vm) => {
          const value = vm.resources.resolve(resId >>> 0);
          return Array.isArray(value) ? value : [];
        },
        'getDimension(I)F': (self, [resId], vm) => vm.resources.getDimensionPixelSize(resId >>> 0),
        'getDimensionPixelSize(I)I': (self, [resId], vm) => vm.resources.getDimensionPixelSize(resId >>> 0),
        'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [resId], vm) => vm.resources.getDrawable(resId >>> 0),
        'getValue(ILandroid/util/TypedValue;Z)V': (self, [resId, out], vm) => {
          const value = vm.resources.resolve(resId >>> 0);
          if (!out) return;
          const peer = out.$peer || (out.$peer = {});
          peer.type = typeof value === 'string' ? 3 : 5;
          peer.data = value;
          peer.string = value === null || value === undefined ? null : String(value);
          if (typeof value === 'number') peer.data = value >>> 0;
          out.$fields?.set('Landroid/util/TypedValue;->type:I', peer.type);
          out.$fields?.set('Landroid/util/TypedValue;->data:I', typeof value === 'number' ? value >>> 0 : 0);
        },
        'getAssets()Landroid/content/res/AssetManager;': (self, _args, vm) => vm.resources.getAssets(),
        'getIdentifier(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)I': (self, [name, type, pkg], vm) =>
          vm.resources.getIdentifier(jsString(name), jsString(type), jsString(pkg)),
        'getDisplayMetrics()Landroid/util/DisplayMetrics;': (self, _args, vm) => vm.resources.getDisplayMetrics(),
        'getConfiguration()Landroid/content/res/Configuration;': (self, _args, vm) => {
          const config = vm.resources.getConfiguration();
          config.locale = makeDefaultLocaleObject(vm);
          return vm.wrapPeer(config);
        },
      },
    })
  );

  defs.push(
    nativeDef('Landroid/content/res/AssetManager;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'open(Ljava/lang/String;)Ljava/io/InputStream;': (self, [path]) => ({
          $descriptor: 'Ljava/io/InputStream;',
          path: jsString(path),
          bytes: self.assets.readBytes(jsString(path)),
        }),
        'list(Ljava/lang/String;)[Ljava/lang/String;': (self, [path]) => self.assets.list(jsString(path)),
      },
    })
  );

  defs.push(
    nativeDef('Ljava/io/InputStream;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'read()I': (self) => {
          if (!self.offset) self.offset = 0;
          return self.offset < self.bytes.length ? self.bytes[self.offset++] : -1;
        },
        'close()V': () => undefined,
      },
    })
  );

  defs.push(
    nativeDef('Landroid/os/AsyncTask;', {
      super: 'Ljava/lang/Object;',
      methods: {
        'execute([Ljava/lang/Object;)Landroid/os/AsyncTask;': (self, [args], vm) => {
          if (typeof self.doInBackground === 'function') {
            try {
              self.doInBackground(args?.$data || []);
            } catch (error) {
              vm.log('error', 'AsyncTask', error.message);
            }
          }
          return self;
        },
        'doInBackground([Ljava/lang/Object;)Ljava/lang/Object;': () => null,
        'onPostExecute(Ljava/lang/Object;)V': () => undefined,
        'onPreExecute()V': () => undefined,
      },
    })
  );

  defs.push(...coreGraphicDefs());
  return defs;
}

function coreGraphicDefs() {
  return [
    nativeDef('Landroid/graphics/Rect;', {
      super: 'Ljava/lang/Object;',
      ctor: class RectPeer {
        constructor() {
          this.rect = new Rect();
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.rect = self.rect || new Rect();
        },
        '<init>(IIII)V': (self, [l, t, r, b]) => {
          self.rect = new Rect(l | 0, t | 0, r | 0, b | 0);
        },
        'set(IIII)V': (self, [l, t, r, b]) => {
          self.rect = self.rect || new Rect();
          self.rect.set(l | 0, t | 0, r | 0, b | 0);
        },
        'set(Landroid/graphics/Rect;)V': (self, [other]) => {
          self.rect = self.rect || new Rect();
          const src = other?.rect || other;
          if (src) self.rect.set(src.left | 0, src.top | 0, src.right | 0, src.bottom | 0);
        },
        'width()I': (self) => (self.rect ||= new Rect()).width(),
        'height()I': (self) => (self.rect ||= new Rect()).height(),
        'isEmpty()Z': (self) => (self.rect ||= new Rect()).isEmpty(),
        'left()I': (self) => (self.rect ||= new Rect()).left,
        'top()I': (self) => (self.rect ||= new Rect()).top,
        'right()I': (self) => (self.rect ||= new Rect()).right,
        'bottom()I': (self) => (self.rect ||= new Rect()).bottom,
        'centerX()I': (self) => { const r = (self.rect ||= new Rect()); return (r.left + r.right) >> 1; },
        'centerY()I': (self) => { const r = (self.rect ||= new Rect()); return (r.top + r.bottom) >> 1; },
        'inset(II)V': (self, [dx, dy]) => (self.rect ||= new Rect()).inset(dx | 0, dy | 0),
        'offset(II)V': (self, [dx, dy]) => (self.rect ||= new Rect()).offset(dx | 0, dy | 0),
        'contains(II)Z': (self, [x, y]) => (self.rect ||= new Rect()).contains(x | 0, y | 0),
        'toString()Ljava/lang/String;': (self) => (self.rect ||= new Rect()).toString(),
      },
      instanceFields: new Map([
        ['left:I', 0], ['top:I', 0], ['right:I', 0], ['bottom:I', 0],
      ]),
    }),
    nativeDef('Landroid/graphics/Insets;', {
      super: 'Ljava/lang/Object;',
      ctor: class InsetsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.$object = object;
          this.left = 0;
          this.top = 0;
          this.right = 0;
          this.bottom = 0;
        }
      },
      methods: {
        '<init>(IIII)V': (self, [left, top, right, bottom]) => {
          self.left = left | 0;
          self.top = top | 0;
          self.right = right | 0;
          self.bottom = bottom | 0;
        },
        'toRect()Landroid/graphics/Rect;': (self, _args, vm) => {
          const rect = vm.instantiate('Landroid/graphics/Rect;', []);
          vm.invokeByName('set', '(IIII)V', rect, [self.left | 0, self.top | 0, self.right | 0, self.bottom | 0]);
          return rect;
        },
        'equals(Ljava/lang/Object;)Z': (self, [other]) => {
          const peer = other?.$peer || other;
          if (!peer) return false;
          return peer.left === self.left && peer.top === self.top && peer.right === self.right && peer.bottom === self.bottom;
        },
        'hashCode()I': (self) => (((self.left * 31 + self.top) * 31 + self.right) * 31 + self.bottom) | 0,
        'toString()Ljava/lang/String;': (self) => `Insets{left=${self.left | 0}, top=${self.top | 0}, right=${self.right | 0}, bottom=${self.bottom | 0}}`,
      },
      staticMethods: {
        'of(IIII)Landroid/graphics/Insets;': (_self, [left, top, right, bottom], vm) => vm.instantiate('Landroid/graphics/Insets;', [left, top, right, bottom]),
      },
      staticFields: new Map([
        ['NONE:Landroid/graphics/Insets;', { lazy: (vm) => vm.instantiate('Landroid/graphics/Insets;', [0, 0, 0, 0]) }],
      ]),
      instanceFields: new Map([
        ['left:I', 0], ['top:I', 0], ['right:I', 0], ['bottom:I', 0],
      ]),
    }),
    nativeDef('Landroid/view/WindowInsets;', {
      super: 'Ljava/lang/Object;',
      ctor: class WindowInsetsPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.$object = object;
          this.left = 0;
          this.top = 0;
          this.right = 0;
          this.bottom = 0;
          this.stableLeft = 0;
          this.stableTop = 0;
          this.stableRight = 0;
          this.stableBottom = 0;
          this.consumed = false;
        }
      },
      methods: {
        '<init>(Landroid/view/WindowInsets;)V': (self, [other]) => {
          const peer = other?.$peer || other;
          if (!peer) return;
          self.left = peer.left | 0;
          self.top = peer.top | 0;
          self.right = peer.right | 0;
          self.bottom = peer.bottom | 0;
          self.stableLeft = peer.stableLeft | 0;
          self.stableTop = peer.stableTop | 0;
          self.stableRight = peer.stableRight | 0;
          self.stableBottom = peer.stableBottom | 0;
        },
        'getSystemWindowInsetLeft()I': (self) => (self.consumed ? 0 : self.left | 0),
        'getSystemWindowInsetTop()I': (self) => (self.consumed ? 0 : self.top | 0),
        'getSystemWindowInsetRight()I': (self) => (self.consumed ? 0 : self.right | 0),
        'getSystemWindowInsetBottom()I': (self) => (self.consumed ? 0 : self.bottom | 0),
        'getStableInsetLeft()I': (self) => (self.consumed ? 0 : self.stableLeft | 0),
        'getStableInsetTop()I': (self) => (self.consumed ? 0 : self.stableTop | 0),
        'getStableInsetRight()I': (self) => (self.consumed ? 0 : self.stableRight | 0),
        'getStableInsetBottom()I': (self) => (self.consumed ? 0 : self.stableBottom | 0),
        'getSystemWindowInsets()Landroid/graphics/Insets;': (self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [
          self.consumed ? 0 : self.left | 0,
          self.consumed ? 0 : self.top | 0,
          self.consumed ? 0 : self.right | 0,
          self.consumed ? 0 : self.bottom | 0,
        ]),
        'getStableInsets()Landroid/graphics/Insets;': (self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [
          self.consumed ? 0 : self.stableLeft | 0,
          self.consumed ? 0 : self.stableTop | 0,
          self.consumed ? 0 : self.stableRight | 0,
          self.consumed ? 0 : self.stableBottom | 0,
        ]),
        'getInsets(I)Landroid/graphics/Insets;': (self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [
          self.consumed ? 0 : self.left | 0,
          self.consumed ? 0 : self.top | 0,
          self.consumed ? 0 : self.right | 0,
          self.consumed ? 0 : self.bottom | 0,
        ]),
        'getInsetsIgnoringVisibility(I)Landroid/graphics/Insets;': (self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [
          self.stableLeft | 0, self.stableTop | 0, self.stableRight | 0, self.stableBottom | 0,
        ]),
        'getMandatorySystemGestureInsets()Landroid/graphics/Insets;': (_self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [0, 0, 0, 0]),
        'getTappableElementInsets()Landroid/graphics/Insets;': (_self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [0, 0, 0, 0]),
        'getSystemGestureInsets()Landroid/graphics/Insets;': (_self, _args, vm) => vm.instantiate('Landroid/graphics/Insets;', [0, 0, 0, 0]),
        'isVisible(I)Z': (self) => !self.consumed && (self.left | self.top | self.right | self.bottom) !== 0,
        'isConsumed()Z': (self) => !!self.consumed,
        'getDisplayCutout()Landroid/view/DisplayCutout;': () => null,
        'consumeSystemWindowInsets()Landroid/view/WindowInsets;': (self) => {
          self.consumed = true;
          return self.$object ?? self;
        },
        'consumeStableInsets()Landroid/view/WindowInsets;': (self) => {
          self.consumed = true;
          return self.$object ?? self;
        },
        'consumeDisplayCutout()Landroid/view/WindowInsets;': (self) => self.$object ?? self,
        'replaceSystemWindowInsets(IIII)Landroid/view/WindowInsets;': (self, [left, top, right, bottom]) => {
          self.left = left | 0;
          self.top = top | 0;
          self.right = right | 0;
          self.bottom = bottom | 0;
          return self.$object ?? self;
        },
        'toString()Ljava/lang/String;': (self) => `WindowInsets{left=${self.left | 0}, top=${self.top | 0}, right=${self.right | 0}, bottom=${self.bottom | 0}}`,
      },
      instanceFields: new Map([
        ['mSystemWindowInsets:Landroid/graphics/Rect;', null],
      ]),
      staticFields: new Map([
        ['NONE:Landroid/view/WindowInsets;', {
          lazy: (vm) => vm.instantiate('Landroid/view/WindowInsets;', []),
        }],
        ['CONSUMED:Landroid/view/WindowInsets;', {
          lazy: (vm) => {
            const insets = vm.instantiate('Landroid/view/WindowInsets;', []);
            const peer = vm.registry.getPeer(insets, 'Landroid/view/WindowInsets;');
            if (peer) peer.consumed = true;
            return insets;
          },
        }],
      ]),
    }),
    nativeDef('Landroid/view/WindowInsets$Builder;', {
      super: 'Ljava/lang/Object;',
      ctor: class WindowInsetsBuilderPeer {
        constructor(vm, object) {
          this.vm = vm;
          this.$object = object;
          this.left = 0;
          this.top = 0;
          this.right = 0;
          this.bottom = 0;
          this.stableLeft = 0;
          this.stableTop = 0;
          this.stableRight = 0;
          this.stableBottom = 0;
        }
      },
      methods: {
        '<init>()V': (self) => {
          self.left = 0;
          self.top = 0;
          self.right = 0;
          self.bottom = 0;
          self.stableLeft = 0;
          self.stableTop = 0;
          self.stableRight = 0;
          self.stableBottom = 0;
        },
        '<init>(Landroid/view/WindowInsets;)V': (self, [insets]) => {
          const peer = insets?.$peer || insets;
          if (!peer) return;
          self.left = peer.left | 0;
          self.top = peer.top | 0;
          self.right = peer.right | 0;
          self.bottom = peer.bottom | 0;
          self.stableLeft = peer.stableLeft | 0;
          self.stableTop = peer.stableTop | 0;
          self.stableRight = peer.stableRight | 0;
          self.stableBottom = peer.stableBottom | 0;
        },
        'setSystemWindowInsets(Landroid/graphics/Insets;)Landroid/view/WindowInsets$Builder;': (self, [insets]) => {
          const peer = insets?.$peer || insets;
          if (peer) {
            self.left = peer.left | 0;
            self.top = peer.top | 0;
            self.right = peer.right | 0;
            self.bottom = peer.bottom | 0;
          }
          return self.$object ?? self;
        },
        'setStableInsets(Landroid/graphics/Insets;)Landroid/view/WindowInsets$Builder;': (self, [insets]) => {
          const peer = insets?.$peer || insets;
          if (peer) {
            self.stableLeft = peer.left | 0;
            self.stableTop = peer.top | 0;
            self.stableRight = peer.right | 0;
            self.stableBottom = peer.bottom | 0;
          }
          return self.$object ?? self;
        },
        'setInsets(ILandroid/graphics/Insets;)Landroid/view/WindowInsets$Builder;': (self, [_type, insets]) => {
          const peer = insets?.$peer || insets;
          if (peer) {
            self.left = peer.left | 0;
            self.top = peer.top | 0;
            self.right = peer.right | 0;
            self.bottom = peer.bottom | 0;
          }
          return self.$object ?? self;
        },
        'setDisplayCutout(Landroid/view/DisplayCutout;)Landroid/view/WindowInsets$Builder;': (self) => self.$object ?? self,
        'build()Landroid/view/WindowInsets;': (self, _args, vm) => {
          const insets = vm.instantiate('Landroid/view/WindowInsets;', []);
          const peer = vm.registry.getPeer(insets, 'Landroid/view/WindowInsets;') || insets?.$peer;
          if (peer) {
            peer.left = self.left | 0;
            peer.top = self.top | 0;
            peer.right = self.right | 0;
            peer.bottom = self.bottom | 0;
            peer.stableLeft = self.stableLeft | 0;
            peer.stableTop = self.stableTop | 0;
            peer.stableRight = self.stableRight | 0;
            peer.stableBottom = self.stableBottom | 0;
          }
          return insets;
        },
      },
    }),
    nativeDef('Landroid/graphics/Point;', { super: 'Ljava/lang/Object;' }),
    nativeDef('Landroid/graphics/RectF;', { super: 'Ljava/lang/Object;' }),
    nativeDef('Landroid/graphics/drawable/Drawable;', { super: 'Ljava/lang/Object;' }),
    nativeDef('Landroid/view/View$MeasureSpec;', {
      super: 'Ljava/lang/Object;',
      staticMethods: {
        'makeMeasureSpec(II)I': (_self, [size, mode]) => MeasureSpec.makeMeasureSpec(toInt(size), toInt(mode)),
        'getMode(I)I': (_self, [spec]) => MeasureSpec.getMode(toInt(spec)),
        'getSize(I)I': (_self, [spec]) => MeasureSpec.getSize(toInt(spec)),
      },
    }),
    nativeDef('Landroid/widget/Toast$Length;', { super: 'Ljava/lang/Object;' }),
  ];
}

function viewMethods() {
  return {
    'makeOptionalFitsSystemWindows()V': () => undefined,
    'computeFitSystemWindows(Landroid/graphics/Rect;Landroid/graphics/Rect;)V': (self, [insets, outInsets]) => {
      const left = Number(insets?.left) || 0;
      const top = Number(insets?.top) || 0;
      const right = Number(insets?.right) || 0;
      const bottom = Number(insets?.bottom) || 0;
      if (outInsets && typeof outInsets === 'object') {
        outInsets.left = left;
        outInsets.top = top;
        outInsets.right = right;
        outInsets.bottom = bottom;
      }
      self.$fitInsets = { left, top, right, bottom };
    },
    'computeSystemWindowInsets(Landroid/view/WindowInsets;Landroid/graphics/Rect;)Landroid/view/WindowInsets;': (self, [_insets, outRect]) => {
      if (outRect && typeof outRect === 'object') {
        outRect.left = 0;
        outRect.top = 0;
        outRect.right = 0;
        outRect.bottom = 0;
      }
      return null;
    },
    'setWillNotDraw(Z)V': (self, [value]) => {
      if (self.view) self.view.willNotDraw = !!value;
    },
    'willNotDraw()Z': (self) => !!self.view?.willNotDraw,
    'setBackgroundTintList(Landroid/content/res/ColorStateList;)V': () => undefined,
    'getBackgroundTintList()Landroid/content/res/ColorStateList;': () => null,
    'setBackgroundTintMode(Landroid/graphics/PorterDuff$Mode;)V': () => undefined,
    'setImageTintList(Landroid/content/res/ColorStateList;)V': () => undefined,
    'setImageTintMode(Landroid/graphics/PorterDuff$Mode;)V': () => undefined,
    'setCompoundDrawableTintList(Landroid/content/res/ColorStateList;)V': () => undefined,
    'setCompoundDrawableTintMode(Landroid/graphics/PorterDuff$Mode;)V': () => undefined,
    'getBackgroundTintMode()Landroid/graphics/PorterDuff$Mode;': () => null,
    'setId(I)V': (self, [id]) => {
      if (self.view) self.view.id = id >>> 0;
    },
    'getId()I': (self) => self.view?.id ?? 0,
    'setVisibility(I)V': (self, [visibility]) => self.view?.setVisibility(visibility | 0),
    'getVisibility()I': (self) => self.view?.getVisibility() ?? 0,
    'setEnabled(Z)V': (self, [enabled]) => self.view?.setEnabled(!!enabled),
    'isEnabled()Z': (self) => self.view?.isEnabled() ?? true,
    'setClickable(Z)V': (self, [clickable]) => self.view?.setClickable(!!clickable),
    'setOnClickListener(Landroid/view/View$OnClickListener;)V': (self, [listener], vm) => {
      if (!self.view) return;
      self.view.setOnClickListener(
        listener
          ? () => vm.invokeInterface(listener, 'onClick', '(Landroid/view/View;)V', [viewObject(vm, self.view)])
          : null
      );
    },
    'setOnLongClickListener(Landroid/view/View$OnLongClickListener;)V': (self, [listener], vm) => {
      if (!self.view) return;
      self.view.setOnLongClickListener(
        listener
          ? () => !!vm.invokeInterface(listener, 'onLongClick', '(Landroid/view/View;)Z', [viewObject(vm, self.view)])
          : null
      );
    },
    'setBackgroundColor(I)V': (self, [color]) => self.view?.setBackgroundColor(color >>> 0),
    'setBackground(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => self.view?.setBackground(drawable),
    'setForeground(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => self.view?.setForeground?.(drawable),
    'getForeground()Landroid/graphics/drawable/Drawable;': (self) => self.view?.getForeground?.() ?? null,
    'setForegroundGravity(I)V': (self, [gravity]) => self.view?.setForegroundGravity?.(gravity | 0),
    'setPadding(IIII)V': (self, [l, t, r, b]) => self.view?.setPadding(l, t, r, b),
    'setAlpha(F)V': (self, [alpha]) => self.view?.setAlpha(alpha),
    'setTranslationX(F)V': (self, [value]) => self.view?.setTranslationX(value),
    'setTranslationY(F)V': (self, [value]) => self.view?.setTranslationY(value),
    'setTag(Ljava/lang/Object;)V': (self, [tag]) => self.view?.setTag(tag),
    'getTag()Ljava/lang/Object;': (self) => self.view?.getTag() ?? null,
    'setTag(ILjava/lang/Object;)V': (self, [key, tag]) => self.view?.setTag(tag, key),
    'getTag(I)Ljava/lang/Object;': (self, [key]) => self.view?.getTag(key) ?? null,
    'getAlpha()F': (self) => (typeof self.view?.getAlpha === 'function' ? self.view.getAlpha() : (self.view?.alpha ?? 1)),
    'findFocus()Landroid/view/View;': (self, _a, vm) => {
      const found = findFocusedView(self.view);
      return found ? viewObject(vm, found) : null;
    },
    'setFocusable(Z)V': (self, [focusable]) => self.view?.setFocusable(focusable !== 0 && focusable !== false),
    'setFocusableInTouchMode(Z)V': (self, [focusable]) => self.view?.setFocusableInTouchMode?.(focusable !== 0 && focusable !== false),
    'setAccessibilityDelegate(Landroid/view/View$AccessibilityDelegate;)V': () => undefined,
    'setSaveFromParentEnabled(Z)V': () => undefined,
    'requestApplyInsets()V': () => undefined,
    'setOnKeyListener(Landroid/view/View$OnKeyListener;)V': () => undefined,
    'getWidth()I': (self) => self.view?.getWidth() ?? 0,
    'getHeight()I': (self) => self.view?.getHeight() ?? 0,
    'getMeasuredWidth()I': (self) => self.view?.getMeasuredWidth() ?? 0,
    'getMeasuredHeight()I': (self) => self.view?.getMeasuredHeight() ?? 0,
    'getLeft()I': (self) => self.view?.getLeft() ?? 0,
    'getTop()I': (self) => self.view?.getTop() ?? 0,
    'getRight()I': (self) => self.view?.getRight() ?? 0,
    'getBottom()I': (self) => self.view?.getBottom() ?? 0,
    'getContext()Landroid/content/Context;': (self, _a, vm) => (self?.vm || vm)?.contextObject || null,
    'getResources()Landroid/content/res/Resources;': (self) => self.vm.resources,
    'findViewById(I)Landroid/view/View;': (self, [id], vm) => {
      const found = findView(self.view, mapContentId(vm, id >>> 0));
      return found ? viewObject(vm, found) : null;
    },
    'requestLayout()V': (self) => self.view?.requestLayout(),
    'invalidate()V': (self) => self.view?.invalidate(),
    'postInvalidate()V': (self) => self.view?.postInvalidate(),
    'post(Ljava/lang/Runnable;)Z': (self, [runnable]) => {
      self.view?.post(() => self.vm.runRunnable(runnable));
      return true;
    },
    'postDelayed(Ljava/lang/Runnable;J)Z': (self, [runnable, delay]) => {
      self.view?.postDelayed(() => self.vm.runRunnable(runnable), Number(delay) || 0);
      return true;
    },
    'performClick()Z': (self) => self.view?.performClick() ?? false,
    'isShown()Z': (self) => self.view?.isShown() ?? true,
    'getParent()Landroid/view/ViewParent;': (self) => self.view?.getParent() ?? null,
    'setMinimumWidth(I)V': (self, [width]) => self.view?.setMinimumWidth(width),
    'setMinimumHeight(I)V': (self, [height]) => self.view?.setMinimumHeight(height),
    'getMinimumWidth()I': (self) => self.view?.getMinimumWidth() ?? 0,
    'getMinimumHeight()I': (self) => self.view?.getMinimumHeight() ?? 0,
    'getScrollX()I': (self) => self.view?.getScrollX() ?? 0,
    'getScrollY()I': (self) => self.view?.getScrollY() ?? 0,
    'scrollTo(II)V': (self, [x, y]) => self.view?.scrollTo(x | 0, y | 0),
    'scrollBy(II)V': (self, [x, y]) => self.view?.scrollBy(x | 0, y | 0),
    'setScrollX(I)V': (self, [x]) => self.view?.setScrollX(x | 0),
    'setScrollY(I)V': (self, [y]) => self.view?.setScrollY(y | 0),
    'setScaleX(F)V': (self, [v]) => self.view?.setScaleX(v),
    'getScaleX()F': (self) => self.view?.getScaleX() ?? 1,
    'setScaleY(F)V': (self, [v]) => self.view?.setScaleY(v),
    'getScaleY()F': (self) => self.view?.getScaleY() ?? 1,
    'setRotation(F)V': (self, [v]) => self.view?.setRotation(v),
    'getRotation()F': (self) => self.view?.getRotation() ?? 0,
    'setRotationX(F)V': (self, [v]) => self.view?.setRotationX(v),
    'getRotationX()F': (self) => self.view?.getRotationX() ?? 0,
    'setRotationY(F)V': (self, [v]) => self.view?.setRotationY(v),
    'getRotationY()F': (self) => self.view?.getRotationY() ?? 0,
    'setPivotX(F)V': (self, [v]) => self.view?.setPivotX(v),
    'getPivotX()F': (self) => self.view?.getPivotX() ?? 0,
    'setPivotY(F)V': (self, [v]) => self.view?.setPivotY(v),
    'getPivotY()F': (self) => self.view?.getPivotY() ?? 0,
    'setTranslationZ(F)V': (self, [v]) => self.view?.setTranslationZ(v),
    'getTranslationZ()F': (self) => self.view?.getTranslationZ() ?? 0,
    'getTranslationX()F': (self) => self.view?.getTranslationX() ?? 0,
    'getTranslationY()F': (self) => self.view?.getTranslationY() ?? 0,
    'setX(F)V': (self, [v]) => self.view?.setX(v),
    'setY(F)V': (self, [v]) => self.view?.setY(v),
    'getX()F': (self) => self.view?.getX() ?? 0,
    'getY()F': (self) => self.view?.getY() ?? 0,
    'setZ(F)V': (self, [v]) => self.view?.setElevation(v),
    'getZ()F': (self) => self.view?.getZ() ?? 0,
    'setElevation(F)V': (self, [v]) => self.view?.setElevation(v),
    'getElevation()F': (self) => self.view?.getElevation() ?? 0,
    'setSelected(Z)V': (self, [v]) => self.view?.setSelected(!!v),
    'isSelected()Z': (self) => self.view?.isSelected() ?? false,
    'setActivated(Z)V': (self, [v]) => self.view?.setActivated(!!v),
    'isActivated()Z': (self) => self.view?.isActivated() ?? false,
    'setPressed(Z)V': (self, [v]) => self.view?.setPressed(!!v),
    'isPressed()Z': (self) => self.view?.isPressed() ?? false,
    'setLongClickable(Z)V': (self, [v]) => self.view?.setLongClickable(!!v),
    'isLongClickable()Z': (self) => self.view?.isLongClickable() ?? false,
    'isClickable()Z': (self) => self.view?.isClickable() ?? false,
    'setFitsSystemWindows(Z)V': (self, [v]) => self.view?.setFitsSystemWindows(!!v),
    'getFitsSystemWindows()Z': (self) => self.view?.getFitsSystemWindows() ?? false,
    'setAccessibilityLiveRegion(I)V': (self, [v]) => self.view?.setAccessibilityLiveRegion(v | 0),
    'getAccessibilityLiveRegion()I': (self) => self.view?.getAccessibilityLiveRegion() ?? 0,
    'setImportantForAccessibility(I)V': (self, [v]) => self.view?.setImportantForAccessibility(v | 0),
    'getImportantForAccessibility()I': (self) => self.view?.getImportantForAccessibility() ?? 0,
    'setNestedScrollingEnabled(Z)V': (self, [v]) => self.view?.setNestedScrollingEnabled(!!v),
    'isNestedScrollingEnabled()Z': (self) => self.view?.isNestedScrollingEnabled() ?? false,
    'setTooltipText(Ljava/lang/CharSequence;)V': (self, [v]) => self.view?.setTooltipText(v),
    'getTooltipText()Ljava/lang/CharSequence;': (self) => self.view?.getTooltipText() ?? null,
    'setContentDescription(Ljava/lang/CharSequence;)V': (self, [v]) => self.view?.setContentDescription(v),
    'getContentDescription()Ljava/lang/CharSequence;': (self) => self.view?.getContentDescription() ?? null,
    'setLabelFor(I)V': (self, [v]) => self.view?.setLabelFor(v >>> 0),
    'getLabelFor()I': (self) => self.view?.getLabelFor() ?? 0,
    'setLayerType(ILandroid/graphics/Paint;)V': (self, [type]) => self.view?.setLayerType(type | 0, null),
    'getLayerType()I': (self) => self.view?.getLayerType() ?? 0,
    'setLayoutDirection(I)V': (self, [v]) => self.view?.setLayoutDirection(v | 0),
    'getLayoutDirection()I': (self) => self.view?.getLayoutDirection() ?? 0,
    'setOverScrollMode(I)V': (self, [v]) => self.view?.setOverScrollMode(v | 0),
    'getOverScrollMode()I': (self) => self.view?.getOverScrollMode() ?? 1,
    'setOnTouchListener(Landroid/view/View$OnTouchListener;)V': (self, [listener], vm) => {
      if (!self.view) return;
      self.view.setOnTouchListener(
        listener
          ? (event) => !!vm.invokeInterface(listener, 'onTouch', '(Landroid/view/View;Landroid/view/MotionEvent;)Z', [viewObject(vm, self.view), event])
          : null
      );
    },
    'setOnHoverListener(Landroid/view/View$OnHoverListener;)V': (self, [listener]) => {
      self.view?.setOnHoverListener(listener || null);
    },
    'setOnFocusChangeListener(Landroid/view/View$OnFocusChangeListener;)V': (self, [listener]) => {
      self.view?.setOnFocusChangeListener(listener || null);
    },
    'addOnLayoutChangeListener(Landroid/view/View$OnLayoutChangeListener;)V': (self, [listener]) => {
      self.view?.addOnLayoutChangeListener(listener || null);
    },
    'removeOnLayoutChangeListener(Landroid/view/View$OnLayoutChangeListener;)V': (self, [listener]) => {
      self.view?.removeOnLayoutChangeListener(listener || null);
    },
    'addOnAttachStateChangeListener(Landroid/view/View$OnAttachStateChangeListener;)V': (self, [listener]) => {
      self.view?.addOnAttachStateChangeListener(listener || null);
    },
    'removeOnAttachStateChangeListener(Landroid/view/View$OnAttachStateChangeListener;)V': (self, [listener]) => {
      self.view?.removeOnAttachStateChangeListener(listener || null);
    },
    'getMeasuredState()I': (self) => self.view?.getMeasuredState() ?? 0,
    'getMeasuredWidthAndState()I': (self) => self.view?.getMeasuredWidthAndState() ?? 0,
    'getMeasuredHeightAndState()I': (self) => self.view?.getMeasuredHeightAndState() ?? 0,
    'getBaseline()I': (self) => self.view?.getBaseline() ?? -1,
    'isLaidOut()Z': (self) => self.view?.isLaidOut() ?? false,
    'getViewTreeObserver()Landroid/view/ViewTreeObserver;': (self, _args, vm) => {
      if (!self.viewTreeObserverObject) {
        self.viewTreeObserverObject = vm.instantiate('Landroid/view/ViewTreeObserver;', []);
      }
      return self.viewTreeObserverObject;
    },
    'getDrawingRect(Landroid/graphics/Rect;)V': (self, [rect]) => self.view?.getDrawingRect(rect),
    'getGlobalVisibleRect(Landroid/graphics/Rect;Landroid/graphics/Point;)Z': (self, [rect, point]) => self.view?.getGlobalVisibleRect(rect, point) ?? false,
    'getLocalVisibleRect(Landroid/graphics/Rect;)Z': (self, [rect]) => self.view?.getLocalVisibleRect(rect) ?? false,
    'getWindowVisibleDisplayFrame(Landroid/graphics/Rect;)V': (self, [rect]) => self.view?.getWindowVisibleDisplayFrame(rect),
    'getHitRect(Landroid/graphics/Rect;)V': (self, [rect]) => self.view?.getHitRect(rect),
    'getLocationOnScreen([I)V': (self, [out]) => self.view?.getLocationOnScreen(out),
    'getLocationInWindow([I)V': (self, [out]) => self.view?.getLocationInWindow(out),
    'getWindowToken()Landroid/os/IBinder;': (self) => self.view?.getWindowToken() ?? null,
    'getApplicationWindowToken()Landroid/os/IBinder;': (self) => self.view?.getApplicationWindowToken() ?? null,
    'isAttachedToWindow()Z': (self) => self.view?.isAttachedToWindow() ?? false,
    'hasFocus()Z': (self) => self.view?.hasFocus() ?? false,
    'isFocused()Z': (self) => self.view?.isFocused() ?? false,
    'requestFocus()Z': (self) => self.view?.requestFocus() ?? false,
    'clearFocus()V': (self) => self.view?.clearFocus(),
    'isFocusable()Z': (self) => self.view?.isFocusable() ?? false,
    'hasFocusable()Z': (self) => self.view?.hasFocusable() ?? false,
    'offsetLeftAndRight(I)V': (self, [offset]) => self.view?.offsetLeftAndRight(offset | 0),
    'offsetTopAndBottom(I)V': (self, [offset]) => self.view?.offsetTopAndBottom(offset | 0),
    'getRootView()Landroid/view/View;': (self, _args, vm) => {
      const root = self.view?.getRootView();
      return root ? viewObject(vm, root) : null;
    },
    'getRootWindowInsets()Landroid/view/WindowInsets;': (self, _args, vm) => {
      if (!self.windowInsetsObject) {
        self.windowInsetsObject = vm.instantiate('Landroid/view/WindowInsets;', []);
      }
      return self.windowInsetsObject;
    },
    'onApplyWindowInsets(Landroid/view/WindowInsets;)Landroid/view/WindowInsets;': (_self, [insets]) => insets ?? null,
    'dispatchApplyWindowInsets(Landroid/view/WindowInsets;)Landroid/view/WindowInsets;': (_self, [insets]) => insets ?? null,
    'hasOnClickListeners()Z': (self) => self.view?.hasOnClickListener() ?? false,
    'forceLayout()V': (self) => {
      self.view && (self.view.isLayoutRequested = true);
    },
    'isLayoutRequested()Z': (self) => self.view?.isLayoutRequestedFlag() ?? false,
    'jumpDrawablesToCurrentState()V': () => undefined,
    'postOnAnimation(Ljava/lang/Runnable;)V': (self, [runnable]) => {
      self.view?.post(() => self.vm.runRunnable(runnable));
    },
    'postOnAnimationDelayed(Ljava/lang/Runnable;J)V': (self, [runnable, delay]) => {
      self.view?.postDelayed(() => self.vm.runRunnable(runnable), Number(delay) || 0);
    },
    'postInvalidateOnAnimation()V': (self) => self.view?.postInvalidate(),
    'cancelLongPress()V': () => undefined,
    'cancelPendingInputEvents()V': () => undefined,
    'canScrollVertically(I)Z': () => false,
    'canScrollHorizontally(I)Z': () => false,
    'getLayoutDirectionResolved()Z': () => false,
    'isPaddingRelative()Z': () => false,
    'getPaddingStart()I': (self) => self.view?.getPaddingLeft() ?? 0,
    'getPaddingEnd()I': (self) => self.view?.getPaddingRight() ?? 0,
    'getPaddingLeft()I': (self) => self.view?.getPaddingLeft() ?? 0,
    'getPaddingTop()I': (self) => self.view?.getPaddingTop() ?? 0,
    'getPaddingRight()I': (self) => self.view?.getPaddingRight() ?? 0,
    'getPaddingBottom()I': (self) => self.view?.getPaddingBottom() ?? 0,
    'getLayoutParams()Landroid/view/ViewGroup$LayoutParams;': (self, _args, vm) => {
      const view = self.view;
      if (!view) return null;
      const descriptor = layoutParamsDescriptorFor(view);
      const existing = view.$layoutParamsObject;
      if (existing && (vm.registry.classNameOf(existing) === descriptor || vm.registry.instanceOf(existing, descriptor))) {
        return existing;
      }
      const params = view.layoutParams || { width: -2, height: -2 };
      const object = vm.allocateObject(vm.registry.resolve(descriptor));
      object.$layoutParams = params;
      view.$layoutParamsObject = object;
      return object;
    },
    'setLayoutParams(Landroid/view/ViewGroup$LayoutParams;)V': (self, [params]) => {
      if (!self.view) return;
      const raw = params?.$layoutParams || params;
      if (raw && typeof raw === 'object') {
        self.view.layoutParams = { ...raw };
        self.view.$layoutParamsObject = params || null;
      }
    },
    'setOnApplyWindowInsetsListener(Landroid/view/View$OnApplyWindowInsetsListener;)V': () => undefined,
    'setPaddingRelative(IIII)V': (self, [s, t, e, b]) => self.view?.setPaddingRelative(s, t, e, b),
    'combineMeasuredStates(II)I': (self, [cur, next]) => (cur | next) >>> 0,
    'resolveSizeAndState(III)I': (self, [size, spec, childState]) => {
      return ((resolveSize(size, spec) | (childState & 0xff000000)) >>> 0);
    },
    'resolveSize(II)I': (self, [size, spec]) => resolveSize(size, spec),
    'getDefaultSize(II)I': (self, [size, spec]) => getDefaultSize(size, spec),
    'measure(II)V': (self, [w, h]) => self.view?.measure(w, h),
    'layout(IIII)V': (self, [l, t, r, b]) => self.view?.layout(l, t, r, b),
    'onMeasure(II)V': (self, [w, h]) => self.view?.onMeasure(w, h),
    'onLayout(ZIIII)V': (self, [changed, l, t, r, b]) => self.view?.onLayout(!!changed, l, t, r, b),
    'onDraw(Landroid/graphics/Canvas;)V': (self, [canvas]) => self.view?.onDraw(canvas),
    'draw(Landroid/graphics/Canvas;)V': (self, [canvas]) => self.view?.draw(canvas),
    'onTouchEvent(Landroid/view/MotionEvent;)Z': (self, [event]) => self.view?.onTouchEvent(event) ?? false,
    'dispatchTouchEvent(Landroid/view/MotionEvent;)Z': (self, [event]) => self.view?.dispatchTouchEvent(event) ?? false,
    'onAttachedToWindow()V': (self) => self.view?.onAttachedToWindow(),
    'onDetachedFromWindow()V': (self) => self.view?.onDetachedFromWindow(),
    'animate()Landroid/view/ViewPropertyAnimator;': (self, _args, vm) => {
      const view = self.view;
      if (!view) return null;
      return makeViewPropertyAnimator(vm, view);
    },
    'getAnimation()Landroid/view/animation/Animation;': (self) => self.view?.animation ?? null,
    'startAnimation(Landroid/view/animation/Animation;)V': (self, [anim]) => {
      if (self.view) self.view.animation = anim;
    },
    'clearAnimation()V': (self) => {
      if (self.view) self.view.animation = null;
    },
  };
}

let VIEW_ID_COUNTER = 0x7f100000;

function getFragmentManagerObject(vm) {
  if (!vm) return null;
  if (vm.fragmentManagerObject) return vm.fragmentManagerObject;
  const manager = vm.allocateRawObject('Landroid/app/FragmentManager;');
  const fragments = new Map();
  const pending = [];
  manager.$peer = {
    vm,
    fragments,
    pending,
    findFragmentByTag: (tag) => {
      const key = jsString(tag);
      return fragments.get(key) || null;
    },
    findFragmentById: (id) => {
      for (const value of fragments.values()) if (value?.$fragmentId === (id >>> 0)) return value;
      return null;
    },
    beginTransaction: () => makeFragmentTransaction(vm, manager, fragments, pending),
    executePendingTransactions: () => {
      for (const op of pending.splice(0)) op();
      return true;
    },
    isDestroyed: () => false,
    getFragments: () => [...fragments.values()],
  };
  vm.fragmentManagerObject = manager;
  return manager;
}

function makeFragmentTransaction(vm, manager, fragments, pending) {
  const object = vm.allocateRawObject('Landroid/app/FragmentTransaction;');
  const ops = [];
  const self = {
    add: (containerId, fragment, tag) => {
      ops.push(() => {
        const key = jsString(tag) || `fragment-${fragments.size}`;
        if (fragment) fragment.$fragmentId = containerId >>> 0;
        fragments.set(key, fragment);
      });
      return object;
    },
    replace: (containerId, fragment, tag) => self.add(containerId, fragment, tag),
    remove: (fragment) => {
      ops.push(() => {
        for (const [key, value] of fragments) if (value === fragment) fragments.delete(key);
      });
      return object;
    },
    hide: () => object,
    show: () => object,
    addToBackStack: () => object,
    setTransition: () => object,
    setCustomAnimations: () => object,
    setReorderingAllowed: () => object,
    commit: () => {
      pending.push(() => {
        for (const op of ops.splice(0)) op();
      });
      return 0;
    },
    commitAllowingStateLoss: () => self.commit(),
    commitNow: () => {
      for (const op of ops.splice(0)) op();
      return undefined;
    },
    isEmpty: () => ops.length === 0,
  };
  object.$peer = self;
  return object;
}

function ensureTypedValue(self, fieldName, vm) {
  const object = self.object;
  if (!object) return null;
  const key = `${object.$nativeClass}->${fieldName}:Landroid/util/TypedValue;`;
  let value = object.$fields?.get(key);
  if (!value) {
    value = (vm || self.vm).allocateRawObject('Landroid/util/TypedValue;');
    value.$peer = { type: 0, data: 0, assetCookie: 0, string: null, resourceId: 0, density: 0 };
    object.$fields?.set(key, value);
  }
  return value;
}

function makeViewPropertyAnimator(vm, view) {
  const object = vm.allocateRawObject('Landroid/view/ViewPropertyAnimator;');
  const animator = view.animate();
  if (!animator) return null;
  object.$peer = {
    animator,
    setDuration: (d) => { animator.setDuration(d); return object; },
    setStartDelay: (d) => { animator.setStartDelay(d); return object; },
    setInterpolator: () => object,
    setListener: (listener) => { animator.setListener?.(listener); return object; },
    setUpdateListener: () => object,
    withStartAction: (action) => { animator.withStartAction?.(() => vm.runRunnable(action)); return object; },
    withEndAction: (action) => { animator.withEndAction(() => vm.runRunnable(action)); return object; },
    start: () => { animator.start(); return object; },
    cancel: () => { animator.cancel?.(); return object; },
    alpha: (v) => { animator.alpha?.(v); return object; },
    alphaBy: () => object,
    translationX: (v) => { animator.translationX?.(v); return object; },
    translationXBy: () => object,
    translationY: (v) => { animator.translationY?.(v); return object; },
    translationYBy: () => object,
    translationZ: () => object,
    translationZBy: () => object,
    scaleX: (v) => { animator.scaleX?.(v); return object; },
    scaleXBy: () => object,
    scaleY: (v) => { animator.scaleY?.(v); return object; },
    scaleYBy: () => object,
    rotation: () => object,
    rotationBy: () => object,
    rotationX: () => object,
    rotationXBy: () => object,
    rotationY: () => object,
    rotationYBy: () => object,
    x: () => object,
    xBy: () => object,
    y: () => object,
    yBy: () => object,
    z: () => object,
    zBy: () => object,
  };
  return object;
}

function mapContentId(vm, id) {
  if (id !== 0x01020002) return id;
  const table = vm.resources?.table;
  if (!table) return id;
  for (const [resId, entry] of table.entries) {
    if (entry.typeName === 'id' && entry.key === 'action_bar_activity_content') return resId;
  }
  return id;
}

function findFocusedView(view) {
  if (!view) return null;
  if (view.isFocused && view.isFocused()) return view;
  const children = view.children || [];
  for (const child of children) {
    const found = findFocusedView(child);
    if (found) return found;
  }
  if (!children.length && typeof view.getChildCount === 'function') {
    const count = view.getChildCount() | 0;
    for (let i = 0; i < count; i += 1) {
      const found = findFocusedView(view.getChildAt(i));
      if (found) return found;
    }
  }
  return null;
}

function findView(view, id) {
  if (!view) return null;
  if (view.id === id) return view;
  let children = view.children || [];
  if (!children.length && typeof view.getChildCount === 'function' && typeof view.getChildAt === 'function') {
    const count = view.getChildCount() | 0;
    children = [];
    for (let i = 0; i < count; i += 1) {
      const child = view.getChildAt(i);
      if (child) children.push(child);
    }
  }
  for (const child of children) {
    const found = findView(child, id);
    if (found) return found;
  }
  return null;
}

const DEFAULT_THEME_ATTRIBUTES = {
  windowActionBar: false,
  windowNoTitle: true,
  windowActionBarOverlay: false,
  windowActionModeOverlay: true,
  windowIsFloating: false,
  windowFixedWidthMajor: null,
  windowFixedWidthMinor: null,
  windowFixedHeightMajor: null,
  windowFixedHeightMinor: null,
  actionBarSize: 56,
  actionBarStyle: 0,
  background: 0,
  colorAccent: 0xff3f51b5 >>> 0,
  colorPrimary: 0xff3f51b5 >>> 0,
  colorPrimaryDark: 0xff303f9f >>> 0,
};

function themeStore(vm) {
  if (!vm) return DEFAULT_THEME_ATTRIBUTES;
  if (!vm.themeAttributes) vm.themeAttributes = { ...DEFAULT_THEME_ATTRIBUTES };
  return vm.themeAttributes;
}

export function loadThemeFromStyleId(vm, styleId) {
  const table = vm?.resources?.table;
  if (!table || typeof styleId !== 'number') return false;
  const attributes = table.getStyleAttributes(styleId);
  if (!attributes.size) return false;
  const store = themeStore(vm);
  store.$styleId = styleId;
  for (const [attrId, rawValue] of attributes) {
    const entry = table.getEntry(attrId);
    const key = entry?.key;
    if (!key) continue;
    let value = rawValue;
    if (value && typeof value === 'object' && 'reference' in value) {
      const resolved = table.resolve(value.reference);
      value = resolved === null || resolved === undefined ? value.reference : resolved;
    }
    if (key === 'actionBarSize' && typeof value === 'number' && value > 4096) {
      const resolved = table.resolve(value);
      if (typeof resolved === 'number') value = Math.round(resolved / (vm.displayMetrics?.density || 1));
    }
    store[key] = value;
  }
  return true;
}

function themeAttributeValues(vm, attrIds, styleId) {
  const store = themeStore(vm);
  const table = vm.resources?.table || null;
  const result = new Map();
  const styleAttributes = styleId ? table?.getStyleAttributes?.((styleId >>> 0) & 0xffffffff) : null;
  const ids = Array.isArray(attrIds) ? attrIds : (attrIds?.$data || []);
  for (const attrId of ids) {
    const entry = table ? table.getEntry(attrId >>> 0) : null;
    const key = entry?.key;
    const styleAttrId = styleAttributes ? lookupStyleAttributeId(table, styleAttributes, key) : 0;
    if (styleAttrId) {
      const raw = styleAttributes.get(styleAttrId);
      result.set(attrId >>> 0, typeof raw === 'string' ? table.resolve?.(raw) ?? raw : raw);
    } else if (key && Object.prototype.hasOwnProperty.call(store, key)) {
      result.set(attrId >>> 0, store[key]);
    } else if (key) {
      const cosmetic = /color/i.test(key);
      result.set(attrId >>> 0, cosmetic ? 0xff2196f3 >>> 0 : 0);
    } else {
      result.set(attrId >>> 0, 0);
    }
  }
  return result;
}

function lookupStyleAttributeId(table, styleAttributes, key) {
  if (!key || !styleAttributes) return 0;
  for (const attrId of styleAttributes.keys()) {
    const entry = table.getEntry(attrId >>> 0);
    if (entry?.key === key) return attrId >>> 0;
  }
  return 0;
}

function makeTypedArrayPeer(vm, values) {
  const lookup = (index) => {
    const attrIds = [...values.keys()];
    const attrId = attrIds[index | 0];
    return attrId === undefined ? undefined : values.get(attrId);
  };
  return {
    values,
    index: 0,
    getIndexCount: () => values.size,
    hasValue: (index) => lookup(index) !== undefined,
    getValue: (index, out) => {
      const value = lookup(index);
      if (value === undefined) return false;
      if (out && typeof out === 'object') {
        const data = typeof value === 'number' ? value | 0 : 0;
        const resourceId = typeof value === 'number' ? value >>> 0 : 0;
        const type = typeof value === 'string' ? 0x03 : typeof value === 'boolean' ? 0x12 : 0x10;
        if (out.$fields instanceof Map) {
          out.$fields.set('Landroid/util/TypedValue;->type:I', type);
          out.$fields.set('Landroid/util/TypedValue;->data:I', data);
          out.$fields.set('Landroid/util/TypedValue;->resourceId:I', resourceId);
          return true;
        }
        const peer = out.$peer;
        if (peer) {
          peer.type = type;
          peer.data = data;
          peer.resourceId = resourceId;
          return true;
        }
        out.type = type;
        out.data = data;
        out.resourceId = resourceId;
        return true;
      }
      return value;
    },
    getBoolean: (index, fallback) => {
      const value = lookup(index);
      if (value === true || value === false) return value;
      if (typeof value === 'number') return value !== 0;
      return fallback;
    },
    getInt: (index, fallback) => {
      const value = lookup(index);
      return typeof value === 'number' ? value | 0 : fallback;
    },
    getInteger: (index, fallback) => {
      const value = lookup(index);
      return typeof value === 'number' ? value | 0 : fallback;
    },
    getResourceId: (index, fallback) => {
      const value = lookup(index);
      return typeof value === 'number' ? value >>> 0 : fallback;
    },
    getDimension: (index, fallback) => {
      const value = lookup(index);
      if (typeof value === 'number') return value;
      if (value === undefined) return fallback;
      return convertDimension(value, vm.resources?.density || 1);
    },
    getDimensionPixelSize: (index, fallback) => {
      const value = makeTypedArrayPeer(vm, values).getDimension(index, fallback);
      return Math.round(Number(value) || 0);
    },
    getDimensionPixelOffset: (index, fallback) => {
      const value = makeTypedArrayPeer(vm, values).getDimension(index, fallback);
      return Math.trunc(Number(value) || 0);
    },
    getColor: (index, fallback) => {
      const value = lookup(index);
      return typeof value === 'number' ? value >>> 0 : fallback;
    },
    getDrawable: (index) => {
      const value = lookup(index);
      return typeof value === 'number' && value ? vm.resources.getDrawable(value >>> 0) : null;
    },
    getString: (index) => {
      const value = lookup(index);
      return value === undefined || value === null ? null : String(value);
    },
    getText: (index) => makeTypedArrayPeer(vm, values).getString(index),
    getLayoutDimension: (index, fallback) => makeTypedArrayPeer(vm, values).getDimensionPixelSize(index, fallback),
    getFraction: (index, base, fallback) => {
      const value = lookup(index);
      if (typeof value !== 'number') return fallback;
      return value;
    },
    getFloat: (index, fallback) => {
      const value = lookup(index);
      return typeof value === 'number' ? value : fallback;
    },
    getNonResourceString: (index) => makeTypedArrayPeer(vm, values).getString(index),
    peekValue: (index) => {
      const value = lookup(index);
      return value === undefined ? null : { data: value };
    },
    length: () => values.size,
    recycle: () => undefined,
    close: () => undefined,
  };
}

function contextSystemService(vm, name) {
  if (!vm) return null;
  const key = String(name || '');
  const cacheKey = `service:${key}`;
  if (!vm.serviceCache) vm.serviceCache = new Map();
  if (vm.serviceCache.has(cacheKey)) return vm.serviceCache.get(cacheKey);
  let object = null;
  if (key === 'layout_inflater') {
    const inflater = new LayoutInflater(vm.contextObject);
    inflater.vm = vm;
    object = inflater;
  } else if (key === 'window') {
    object = vm.contextObject?.windowObject ?? null;
  }
  vm.serviceCache.set(cacheKey, object);
  return object;
}

function mainThreadObject(vm) {
  return vm?.currentThreadObject?.() ?? null;
}

function makeDefaultLocaleObject(vm) {
  const object = vm.allocateRawObject('Ljava/util/Locale;');
  object.$peer = { language: 'zh', country: 'CN' };
  return object;
}

function dispatchActivityKeyEvent(self, event, vm) {
  if (!event) return false;
  const keyCode = event.keyCode ?? event.$peer?.keyCode ?? 0;
  if ((keyCode | 0) === 4 && typeof self.onBackPressed === 'function') {
    self.onBackPressed();
    return true;
  }
  return false;
}

function asInt(value) {
  if (typeof value === 'number') return value | 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function parseMenuResource(resources, resId, vm) {
  let xml = null;
  try {
    xml = resources?.getLayout?.(resId) ?? null;
  } catch {
    xml = null;
  }
  if (!xml?.root) return null;
  const items = [];
  const readAttr = (node, name) => {
    const found = node.attrs?.find((a) => a.name === name || a.namespaceName === name);
    return found ? found.value : null;
  };
  const collect = (node) => {
    if (!node || node.type !== 'element') return;
    if (node.name === 'item') {
      const title = readAttr(node, 'android:title') ?? readAttr(node, 'title') ?? '';
      const rawId = readAttr(node, 'android:id') ?? 0;
      items.push({
        groupId: asInt(readAttr(node, 'android:menuCategory')),
        itemId: typeof rawId === 'number' ? rawId | 0 : 0,
        order: asInt(readAttr(node, 'android:orderInCategory')),
        title: typeof title === 'string' ? title : '',
      });
    }
    for (const child of node.children || []) collect(child);
  };
  collect(xml.root);
  return items;
}

function createTypedArray(vm, attrs, styleId) {
  const values = themeAttributeValues(vm, attrs, styleId);
  const object = vm.allocateRawObject('Landroid/content/res/TypedArray;');
  object.$peer = makeTypedArrayPeer(vm, values);
  return object;
}

function getThemeObject(vm) {
  if (!vm) return null;
  if (!vm.themeObject) {
    const object = vm.allocateRawObject('Landroid/content/res/Resources$Theme;');
    object.$peer = {
      applyStyle: () => undefined,
      setTo: () => undefined,
      resolveAttribute: (attrId, out, _resolveRefs) => {
        const store = themeStore(vm);
        const table = vm.resources?.table || null;
        const key = table ? table.getEntry(attrId >>> 0)?.key : null;
        if (!key || !Object.prototype.hasOwnProperty.call(store, key)) return false;
        if (out) out.data = store[key];
        return true;
      },
      obtainStyledAttributes: (attrs) => createTypedArray(vm, attrs),
      obtainStyledAttributesWithStyle: (styleId, attrs) => createTypedArray(vm, attrs, styleId),
    };
    vm.themeObject = object;
  }
  return vm.themeObject;
}

export function toInt(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(BigInt.asIntN(32, value));
  if (typeof value === 'number') return value | 0;
  return 0;
}
