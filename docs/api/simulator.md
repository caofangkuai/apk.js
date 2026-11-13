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

## Hooking methods

`sim.xposed` exposes an `XposedRuntime` with `bridge` and `helpers`. Hooks may be registered before the VM exists; they are applied once the engine starts.

```js
import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/android-framework.min.js';

const sim = createSimulator({ element: '#screen' });
const { bridge } = sim.xposed;

bridge.hookAllMethods('android.widget.TextView', 'setText', {
  beforeHookedMethod(param) {
    param.args[0] = 'rewritten';
  },
});

await sim.loadFromFile(file);
```

The full API — registration helpers, `MethodHookParam`, field access, throwing from a hook and the limits — is documented in [Hooking methods](./hooks.md).
