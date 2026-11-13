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
import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/apk.min.js';

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

## Hook 接口

`sim.on(event, handler)` 返回取消函数，另有 `sim.once`、`sim.off`、`sim.clearHooks`；`sim.hooks` 是原始 `HookBus`（产物同时导出 `HookBus` 与 `hookResult`）。

| 事件 | payload |
| --- | --- |
| `load:before` / `load:after` | `{ simulator, zip, apk?, result? }` |
| `start:before` / `start:after` | `{ engine, apk, vm? }` |
| `invoke:before` | `{ ref, receiver, args, mode, currentMethod, native }` |
| `invoke:after` | 同上并带 `result` |
| `log` | `{ level, tag, message, time }` |
| `activity:finish` | `{ engine, vm, activity }` |

在 `invoke:before` 返回 `hookResult(value)` 可短路调用，在 `invoke:after` 返回它可替换返回值：

```js
import { createSimulator, hookResult } from 'https://caofangkuai.github.io/apk.js/dist/apk.min.js';

const sim = createSimulator({ element: '#screen' });
sim.on('invoke:before', (ctx) => {
  if (ctx.ref.name === 'getDeviceModel') return hookResult('Hooked Device');
});
```
