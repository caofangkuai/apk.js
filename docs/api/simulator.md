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
| `device.maxApkSize` | number | `50 * 1024 * 1024` | APK size limit in bytes |
| `onLog` | `(entry) => void` | `null` | Log callback, receives `{ level, tag, message }` |
| `onFinished` | `() => void` | `null` | Fired when the activity finishes |
| `onError` | `(error) => void` | `null` | Fired on load or start failure |

## Example

```js
import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/apk.min.js';

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
  maxApkSize: 50 * 1024 * 1024,
};
```
