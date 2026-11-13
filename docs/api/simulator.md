# Simulator options

`createSimulator(options)` returns an `ApkSimulator`. Every option is optional except the render target.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `element` | string \| Element | `null` | Render target. A CSS selector or a DOM node; a canvas is created inside it. |
| `canvas` | HTMLCanvasElement | `null` | Existing canvas. Takes precedence over `element`. |
| `device.width` | number | `360` | Logical width in pixels |
| `device.height` | number | `640` | Logical height in pixels |
| `device.dpr` | number | `window.devicePixelRatio` capped at 2 | Device pixel ratio |
| `device.style` | string | `'material'` | Theme style |
| `device.maxApkSize` | number | `Infinity` | APK size limit in bytes; unlimited by default |
| `onLog` | `(entry) => void` | `null` | Log callback, receives `{ level, tag, message }` |
| `onFinished` | `() => void` | `null` | Fired when the activity finishes |
| `onError` | `(error) => void` | `null` | Fired on load or start failure |

## Example

```js
import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/android-framework.min.js';

const sim = createSimulator({
  element: '#screen',
  device: { width: 390, height: 844, dpr: 2 },
  onLog: ({ level, tag, message }) => console.log(level, tag, message),
});
```

## Defaults

```js
const DEFAULT_DEVICE = {
  width: 360,
  height: 640,
  dpr: undefined,
  style: 'material',
  maxApkSize: Infinity,
};
```

## Events

`sim.on(event, handler)` returns a disposer. `sim.once`, `sim.off` and `sim.clearHooks` are also available, and `sim.hooks` exposes the raw `HookBus`.

| Event | Payload |
| --- | --- |
| `load:before` / `load:after` | `{ simulator, zip, apk?, result? }` |
| `start:before` / `start:after` | `{ engine, apk, vm? }` |
| `log` | `{ level, tag, message, time }` |
| `activity:finish` | `{ engine, vm, activity }` |

## Hooking methods (Xposed API)

`sim.xposed` is an `XposedRuntime` exposing `bridge` and `helpers`. Hooks may be registered before the VM exists; they are applied once the engine starts. Interception happens right after method resolution, so DEX methods, host (`android.*` / `java.*`) methods and constructors can all be hooked.

```js
import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/android-framework.min.js';

const sim = createSimulator({ element: '#screen' });
const { bridge, helpers } = sim.xposed;

bridge.hookAllMethods('android.widget.TextView', 'setText', {
  beforeHookedMethod(param) {
    param.args[0] = 'rewritten';
  },
});

helpers.findAndHookMethod('java.lang.String', null, 'trim', {
  afterHookedMethod(param) {
    param.setResult(param.getResult() + '!');
  },
});
```

| API | Description |
| --- | --- |
| `XposedBridge.hookAllMethods(className, methodName, callback)` | Hook every overload declared on that class; returns a set of `Unhook`. |
| `XposedBridge.hookAllConstructors(className, callback)` | Hook the `<init>` overloads. |
| `XposedBridge.hookMethod(methodInfo, callback)` | Hook a method object from `findMethodExact`. |
| `XposedHelpers.findAndHookMethod(className, classLoader, methodName, ...paramTypes, callback)` | Hook one exact overload. `classLoader` mirrors the Xposed signature and may be `null`. |
| `XposedHelpers.findMethodExact(className, methodName, ...paramTypes)` | Resolve a method without hooking it. |
| `XposedHelpers.findClass(className)` | Class info (`getName`, `getDescriptor`). |
| `XposedHelpers.getObjectField` / `setObjectField` plus the `Int` / `Long` / `Boolean` / `Float` / `Double` variants | Read and write fields directly. |
| `XposedHelpers.callMethod` / `callStaticMethod` / `newInstance` | Call methods and constructors from JS. |
| `unhook()` | Available on every returned handle to remove the hook. |

`MethodHookParam` exposes `method`, `thisObject`, `args`, `isStatic`, `getResult()` / `setResult(value)`, `getThrowable()` / `setThrowable(error)` / `hasThrowable()`. Calling `setResult` inside `beforeHookedMethod` skips the original method entirely; `setThrowable` makes the call throw.

The callback may be an `XC_MethodHook` instance, a subclass of it, or a plain `{ beforeHookedMethod, afterHookedMethod }` object.
