# 嵌入页面

`dist/apk.min.js` 导出 `createSimulator` 和 `ApkSimulator`。先加载 JSZip，再加载这个包。

```html
<script src="https://caofangkuai.github.io/apk.js/vendor/jszip.min.js"></script>
<script type="module">
  import { createSimulator } from 'https://caofangkuai.github.io/apk.js/dist/apk.min.js';

  const sim = createSimulator({
    element: '#phone-screen',
    device: {
      width: 360,
      height: 640,
      dpr: window.devicePixelRatio || 1,
      style: 'material',
      maxApkSize: Infinity,
    },
    onLog: (entry) => console.log(`[${entry.level}] ${entry.tag}: ${entry.message}`),
    onFinished: () => console.log('Activity 已结束'),
    onError: (error) => console.error(error),
  });

  await sim.loadFromFile(file);
</script>
```

## 加载来源

`ApkSimulator` 接受四种输入：

| 方法 | 输入 |
| --- | --- |
| `loadFromFile(file)` | 浏览器 `File` 对象，通常来自 `<input type="file">` 或拖拽事件 |
| `loadFromUrl(url, options)` | URL，用 `fetch` 下载 |
| `loadFromArrayBuffer(buffer)` | 原始字节 |
| `loadFromZip(zip)` | 已解压的 JSZip 实例 |

## 渲染目标

`element` 和 `canvas` 二选一：

- `element` 接受 CSS 选择器或 DOM 节点，会在其中创建并挂载 canvas。
- `canvas` 直接使用已有的 `<canvas>`，两者都设置时优先使用它。

## 运行中调整尺寸

```js
sim.setDevice({ width: 280, height: 480 });
```

canvas 的 CSS 尺寸和引擎分辨率会一起更新。

## 清理

```js
sim.stop();     // 停止执行，保留 canvas
sim.destroy();  // 停止并从宿主元素移除 canvas
```

## 访问 VM

`sim.vm` 返回当前的 `JavaVM`，只读。开发时可以用它查看运行中的 Activity、资源表或类注册表。
