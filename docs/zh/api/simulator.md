# 模拟器选项

`createSimulator(options)` 返回一个 `ApkSimulator`。除渲染目标外，所有选项都可以省略。

## 选项

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `element` | string \| Element | `null` | 渲染目标。CSS 选择器或 DOM 节点，会在其中创建 canvas。 |
| `canvas` | HTMLCanvasElement | `null` | 已有 canvas，优先于 `element`。 |
| `device.width` | number | `360` | 逻辑宽度（像素） |
| `device.height` | number | `640` | 逻辑高度（像素） |
| `device.dpr` | number | `window.devicePixelRatio`，上限 2 | 设备像素比 |
| `device.style` | string | `'material'` | 主题风格 |
| `device.maxApkSize` | number | `Infinity` | APK 大小上限（字节），默认不限制 |
| `onLog` | `(entry) => void` | `null` | 日志回调，收到 `{ level, tag, message }` |
| `onFinished` | `() => void` | `null` | Activity 结束时触发 |
| `onError` | `(error) => void` | `null` | 加载或启动失败时触发 |

## 示例

```js
import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/android-framework.min.js';

const sim = createSimulator({
  element: '#screen',
  device: { width: 390, height: 844, dpr: 2 },
  onLog: ({ level, tag, message }) => console.log(level, tag, message),
});
```

## 默认值

```js
const DEFAULT_DEVICE = {
  width: 360,
  height: 640,
  dpr: undefined,
  style: 'material',
  maxApkSize: Infinity,
};
```

## 事件

`sim.on(event, handler)` 返回取消函数，另有 `sim.once`、`sim.off`、`sim.clearHooks`；`sim.hooks` 是原始 `HookBus`。

| 事件 | payload |
| --- | --- |
| `load:before` / `load:after` | `{ simulator, zip, apk?, result? }` |
| `start:before` / `start:after` | `{ engine, apk, vm? }` |
| `log` | `{ level, tag, message, time }` |
| `activity:finish` | `{ engine, vm, activity }` |

## 拦截方法（Xposed API）

`sim.xposed` 是 `XposedRuntime`，提供 `bridge` 与 `helpers`。VM 还没创建时就能注册拦截，引擎启动时自动生效。拦截挂在「方法解析完成之后、执行之前」，所以 DEX 方法、宿主（`android.*` / `java.*`）方法和构造方法都能拦。

```js
import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/android-framework.min.js';

const sim = createSimulator({ element: '#screen' });
const { bridge, helpers } = sim.xposed;

bridge.hookAllMethods('android.widget.TextView', 'setText', {
  beforeHookedMethod(param) {
    param.args[0] = '被改写了';
  },
});

helpers.findAndHookMethod('java.lang.String', null, 'trim', {
  afterHookedMethod(param) {
    param.setResult(param.getResult() + '!');
  },
});
```

| API | 说明 |
| --- | --- |
| `XposedBridge.hookAllMethods(className, methodName, callback)` | 拦截该类声明的同名全部重载，返回一组 `Unhook`。 |
| `XposedBridge.hookAllConstructors(className, callback)` | 拦截 `<init>` 重载。 |
| `XposedBridge.hookMethod(methodInfo, callback)` | 拦截 `findMethodExact` 返回的方法对象。 |
| `XposedHelpers.findAndHookMethod(className, classLoader, methodName, ...参数类型, callback)` | 精确拦截单个重载；`classLoader` 仅为对齐 Xposed 签名，可传 `null`。 |
| `XposedHelpers.findMethodExact(className, methodName, ...参数类型)` | 只解析方法，不拦截。 |
| `XposedHelpers.findClass(className)` | 类信息（`getName`、`getDescriptor`）。 |
| `XposedHelpers.getObjectField` / `setObjectField` 及 `Int` / `Long` / `Boolean` / `Float` / `Double` 变体 | 直接读写字段。 |
| `XposedHelpers.callMethod` / `callStaticMethod` / `newInstance` | 从 JS 调用方法和构造。 |
| `unhook()` | 每个返回的句柄都可调用，用于摘除拦截。 |

`MethodHookParam` 提供 `method`、`thisObject`、`args`、`isStatic`、`getResult()` / `setResult(value)`、`getThrowable()` / `setThrowable(error)` / `hasThrowable()`。在 `beforeHookedMethod` 里调用 `setResult` 会完全跳过原方法；`setThrowable` 让这次调用抛出异常。

回调可以是 `XC_MethodHook` 实例、它的子类，或 `{ beforeHookedMethod, afterHookedMethod }` 对象。
