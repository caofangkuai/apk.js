# apk.js

**English** | [简体中文](./README.zh-CN.md)

[Docs](https://caofangkuai.github.io/apk.js/) · [Playground](https://caofangkuai.github.io/apk.js/playground.html)

[![Deploy site](https://github.com/caofangkuai/apk.js/actions/workflows/deploy.yml/badge.svg)](https://github.com/caofangkuai/apk.js/actions/workflows/deploy.yml)
[![stars](https://img.shields.io/github/stars/caofangkuai/apk.js?style=social)](https://github.com/caofangkuai/apk.js/stargazers)
[![forks](https://img.shields.io/github/forks/caofangkuai/apk.js?style=social)](https://github.com/caofangkuai/apk.js/network/members)
[![visitors](https://visitor-badge.laobi.icu/badge?page_id=caofangkuai.apk.js)](https://github.com/caofangkuai/apk.js)
[![license](https://img.shields.io/github/license/caofangkuai/apk.js)](https://github.com/caofangkuai/apk.js/blob/main/LICENSE)

Run Android APKs in the browser with plain JavaScript. apk.js parses `classes.dex`, `AndroidManifest.xml` and `resources.arsc` straight from the APK, executes the application logic with a DEX bytecode interpreter, and paints the UI through a Canvas-based subset of the Android Framework. No device, no emulator, no native libraries.

> **一切开始，尽在 apk.js** — Everything starts with apk.js.

<p align="center">
  <img src="screenshots/menu.png" width="320" alt="Overflow menu rendered by apk.js">
  <img src="screenshots/drawer.png" width="320" alt="Navigation drawer rendered by apk.js">
</p>

<p align="center"><em>DeviceInfoHW running in apk.js — overflow menu and navigation drawer.</em></p>

## Features

- **Pure frontend.** Unpacking, parsing, execution and rendering all happen inside the browser. There is no backend.
- **DEX interpreter.** Covers the bulk of the Dalvik instruction set, with exception handling, `switch`, arrays, fields and method dispatch.
- **Resource parsing.** Binary `AndroidManifest.xml` (AXML) and the `resources.arsc` resource table.
- **Framework subset.** `Activity` lifecycle, `View` tree with measure and layout, `LinearLayout` / `FrameLayout` / `RelativeLayout` / `ScrollView`, `TextView` / `Button` / `EditText` / `ImageView` / `ProgressBar` / `ListView` / `Spinner` / `CheckBox` / `RadioGroup` / `SeekBar` / `Dialog`, `ActionBar` / `Toolbar`, `Toast`, `Context` / `Intent` / `Bundle`, and more.
- **Drawables and themes.** `shape` / `vector` / `ripple` / `selector` rendering, `RippleDrawable` content unwrapping, `GradientDrawable`, `backgroundTint`, `@android:color/*` resolution, and `Context.setTheme` inheritance.
- **Soft keyboard input.** Tapping an `EditText` focuses it and raises the system keyboard through a hidden-input bridge. Supports `InputMethodManager`, a blinking caret, and `getSelectionStart` / `setSelection`.
- **System and reflection.** `android.os.Build` / `VERSION`, `Class.forName` / `getMethod` / `Method.invoke` (including primitive argument unboxing), and multi-`Activity` navigation through `startActivity` with `Intent` extras.
- **Runnable sample.** The repository ships `samples/hello-dex.apk`. Open the page and it runs: counters, input echo, dynamic view insertion, progress bars, shape-backed buttons, `Build` info, reflection calls, and a jump to a second `Activity`.

## Quick start

```bash
# Install dependencies
npm install

# Bundle into dist/
npm run build

# Serve the static site
npm run serve
```

Open <http://localhost:8080>, then click **Choose APK** or drop an APK onto the page.

The build output `dist/apk.min.js` and `dist/android-framework.min.js` is committed, so you can also copy `playground.html`, `dist/`, `vendor/` and `samples/` onto any static host and skip the build step.

## Build output

`npm run build` runs webpack and produces two ES modules:

| Artifact | Contents |
| --- | --- |
| `dist/apk.min.js` | Core engine: DEX parser, AXML/ARSC parsers, APK file loader, VM and interpreter, Xposed hook runtime. No Android host classes, no DOM. |
| `dist/android-framework.min.js` | Java/Android host classes plus `ApkSimulator` / `EmulatorEngine`. Imports the core engine above. |

`dist/android-framework.min.js` imports `./apk.min.js`, so load the simulator bundle and the browser pulls in the engine. If you only parse APKs (DEX, manifest, resources) you can import `dist/apk.min.js` on its own. JSZip is provided as a global from `vendor/jszip.min.js`.

## Using it on a page

`android-framework.min.js` exports `createSimulator` and `ApkSimulator`. The caller supplies the device info and the render target:

```html
<script src="vendor/jszip.min.js"></script>
<script type="module">
  import { createSimulator } from './dist/android-framework.min.js';

  const sim = createSimulator({
    // Render target: a CSS selector, a DOM element, or an existing canvas
    element: '#phone-screen',
    // Device info
    device: {
      width: 360,
      height: 640,
      dpr: window.devicePixelRatio || 1,
      style: 'material',
      maxApkSize: Infinity,
    },
    onLog: (entry) => console.log(`[${entry.level}] ${entry.tag}: ${entry.message}`),
    onFinished: () => console.log('Activity finished'),
    onError: (error) => console.error(error),
  });

  // Load from a File object (for example from <input type="file">)
  await sim.loadFromFile(file);

  // URL, ArrayBuffer and an unpacked JSZip instance also work
  // await sim.loadFromUrl('samples/hello-dex.apk');
  // await sim.loadFromArrayBuffer(buffer);
  // await sim.loadFromZip(zip);

  sim.setDevice({ width: 280, height: 480 }); // Resize while running
  sim.destroy();                              // Stop and remove the canvas
</script>
```

| Option | Description |
| --- | --- |
| `element` | Render target. Accepts a CSS selector string or a DOM element; a canvas is created inside it. |
| `canvas` | Use an existing `<canvas>`. Takes precedence over `element`. |
| `device.width` / `device.height` | Logical resolution. Defaults to 360×640. |
| `device.dpr` | Device pixel ratio. Defaults to `window.devicePixelRatio` capped at 2. The canvas backing size is logical size × dpr. |
| `device.style` | Theme style. Defaults to `default`. |
| `device.maxApkSize` | APK size limit. Defaults to unlimited. |
| `onLog` / `onFinished` / `onError` | Log, finish and error callbacks. |

| Method | Description |
| --- | --- |
| `loadFromFile(file)` | Load from a browser `File`. |
| `loadFromUrl(url, options)` | Download with `fetch`, then load. |
| `loadFromArrayBuffer(buffer)` | Load from binary contents. |
| `loadFromZip(zip)` | Load from a JSZip instance. |
| `setDevice(device)` | Update device info and apply the new size immediately. |
| `capture(type, quality)` | Export the current frame as a dataURL (PNG by default). |
| `stop()` / `destroy()` | Stop running / stop and clean up the canvas. |
| `vm` | The current `JavaVM` instance (read-only). |

`sim.on(event, handler)` returns a disposer; `sim.once` and `sim.off` are also available. `sim.hooks` exposes the raw `HookBus`.

```js
import { createSimulator } from './dist/android-framework.min.js';
const sim = createSimulator({ element: '#screen' });

const off = sim.on('log', (entry) => console.log(entry.level, entry.message));
sim.on('activity:finish', () => console.log('done'));
off();
```

Events:

| Event | Payload |
| --- | --- |
| `load:before` / `load:after` | `{ simulator, zip, apk?, result? }` |
| `start:before` / `start:after` | `{ engine, apk, vm? }` |
| `log` | `{ level, tag, message, time }` |
| `activity:finish` | `{ engine, vm, activity }` |

## Hooking methods

Method interception uses the Xposed API. Hooks are matched on the resolved method, so DEX methods, host (`android.*` / `java.*`) methods and constructors all work.

```js
import { createSimulator } from './dist/android-framework.min.js';

const sim = createSimulator({ element: '#screen' });

// Hooks can be registered before the VM exists; they are applied on start.
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

await sim.loadFromFile(file);
```

| API | Description |
| --- | --- |
| `XposedBridge.hookAllMethods(className, methodName, callback)` | Hook every overload declared on that class. Returns a set of `Unhook` handles. |
| `XposedBridge.hookAllConstructors(className, callback)` | Hook `<init>` overloads. |
| `XposedBridge.hookMethod(methodInfo, callback)` | Hook a method object returned by `XposedHelpers.findMethodExact`. |
| `XposedHelpers.findAndHookMethod(className, classLoader, methodName, ...paramTypes, callback)` | Hook one exact overload; `classLoader` is accepted for API parity and may be `null`. |
| `XposedHelpers.findClass(className)` | Class info (`getName`, `getDescriptor`). |
| `XposedHelpers.getObjectField` / `setObjectField` and the `Int`/`Long`/`Boolean`/`Float`/`Double` variants | Read and write fields directly. |
| `XposedHelpers.callMethod` / `callStaticMethod` / `newInstance` | Invoke methods and constructors from JS. |
| `unhook()` | Registered handles expose it to remove the hook. |

`beforeHookedMethod` / `afterHookedMethod` receive a `MethodHookParam` with `method`, `thisObject`, `args`, and `setResult(value)` / `getResult()` / `setThrowable(error)` / `getThrowable()`. Calling `setResult` in the "before" phase skips the original method entirely.

The callback may be an `XC_MethodHook` instance, a subclass of it, or a plain `{ beforeHookedMethod, afterHookedMethod }` object. `XC_MethodHook` is exported by the bundle if you prefer subclassing.

During development, `npm run build:dev` produces an unminified bundle with source maps.

## Project layout

```
.
├── apk.js                    # Core engine entry (webpack base chunk)
├── android-framework.js      # Simulator entry: host classes + ApkSimulator
├── playground.html           # Playground / demo page
├── webpack.config.js         # Build configuration
├── dist/                     # Build output (committed)
│   ├── apk.min.js
│   └── android-framework.min.js
├── samples/
│   ├── hello-dex.apk         # Runnable sample APK
│   └── apk-src/              # Sample APK source
├── src/
│   ├── core/apk-file.js      # APK file loader (framework-free)
│   ├── core/binary.js        # Binary reading helpers
│   ├── dex/                  # DEX parsing and instruction definitions
│   ├── res/                  # AXML / ARSC parsing
│   ├── runtime/              # VM, interpreter, class registry, value model, hooks
│   └── framework/            # Canvas Android Framework subset
├── tests/                    # Regression tests
│   └── debug/                # Ad-hoc debugging scripts kept for reference
├── image-debug/              # node-canvas renders of real APKs
├── tools/                    # Sample APK build script and render helper
├── docs/                     # VitePress documentation site
└── vendor/jszip.min.js       # JSZip (provided globally)
```

### What each `src` module does

| Directory | Responsibility |
| --- | --- |
| `core/` | Endian-safe binary reading, plus the framework-free APK loader (`apk-file.js`). |
| `dex/` | DEX header, string pool, types, methods, fields, class definitions and bytecode. |
| `res/` | Binary parsing of `AndroidManifest.xml` and `resources.arsc`. |
| `runtime/` | `JavaVM`, `DexInterpreter`, `ClassRegistry`, the `JavaObject` / `JavaArray` value model, `HookBus` and the Xposed hook runtime. |
| `framework/` | `Engine` orchestration, `View` hierarchy, layout, widgets, resources, windows, `Context` / `Intent`, and native implementations of Java core classes. |

## Rendering a real APK to an image

`tools/render-apk.mjs` runs an APK through node-canvas and writes a PNG to `image-debug/`:

```bash
npm run render -- /path/to/app.apk my-app
# writes image-debug/my-app.png
```

Set `RENDER_WIDTH`, `RENDER_HEIGHT` or `RENDER_DENSITY` to change the output size.

`tools/hook-apk.mjs` does the same with a hook module installed first, which is the quickest way to verify that a hook changes what the app renders:

```bash
npm run hook:apk -- samples/hello-dex.apk samples/hooks/rename-title.mjs demo-hooked
```

## Scope and limits

- **Java/Kotlin APKs only.** APKs containing native libraries under `lib/` cannot run.
- APK size is unlimited by default.
- The framework is a small subset of Android and keeps growing. Unimplemented framework classes or methods surface as log errors.
- `startActivity` only resolves activities inside the same app. Launching another app throws `ActivityNotFoundException`.
- The demo renders at 360×640.

## Tests

```bash
# Full regression: load the sample APK and simulate taps
npm test

# Verify the APK parse result
npm run check

# All of the above
npm run diagnose -- /path/to/app.apk
npm run test:ui
npm run test:all
```

`npm test` parses `samples/hello-dex.apk`, builds the view tree, then simulates a counter tap, focusing the editor and echoing keyboard input, dynamic view insertion, progress advancement, a shape-backed button tap, reading `Build` info, a reflection call, and a `startActivity` jump to a second `Activity` with argument checks.

The scripts in `tests/debug/` are older exploratory probes from development. They are not part of the regression suite.


## Building the sample APK

`tools/build-sample-apk.sh` shows how to compile `samples/apk-src` into a runnable APK. It needs the Android SDK and build-tools installed locally.

## Known issues

- Some large third-party apps still fail during `onStart` because the framework coverage is incomplete.
- Debug switches (`DBG_INV`, `DBG_CAST`, `CAS_DBG`, `FV_DBG`) are replaced with `false` at build time.
- `tests/debug/` contains roughly 400 ad-hoc scripts from development. They are kept for reference and will be pruned.

## Documentation

The VitePress site lives in `docs/`:

```bash
npm run docs:dev      # Local dev server
npm run docs:build    # Static build
npm run docs:preview  # Preview the build
```

## License

[MIT](./LICENSE)
