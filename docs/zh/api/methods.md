# 方法

## 加载

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `loadFromFile(file)` | `Promise<this>` | 从 `File` 对象加载 |
| `loadFromUrl(url, options?)` | `Promise<this>` | 用 `fetch` 下载后加载 |
| `loadFromArrayBuffer(buffer)` | `Promise<this>` | 从原始字节加载 |
| `loadFromZip(zip)` | `Promise<this>` | 从 JSZip 实例加载 |

四种方式在文件不是有效 APK、含原生库或超出体积上限时都会 reject。

## 生命周期

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `setDevice(device)` | `this` | 合并设备覆盖项并应用新尺寸 |
| `stop()` | `this` | 停止引擎，保留 canvas |
| `destroy()` | `this` | 停止并从宿主元素移除 canvas |

## 属性

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `vm` | `JavaVM \| null` | 当前 VM 实例，只读 |
| `canvas` | `HTMLCanvasElement \| null` | 正在使用的 canvas |
| `running` | `boolean` | 是否有 Activity 在运行 |
| `device` | object | 实际生效的设备配置 |

## 示例

```js
const sim = createSimulator({ element: '#screen' });

await sim.loadFromUrl('https://caofangkuai.github.io/apk.js/samples/hello-dex.apk');
console.log(sim.vm?.packageName);

sim.setDevice({ width: 280, height: 480 });
sim.destroy();
```
