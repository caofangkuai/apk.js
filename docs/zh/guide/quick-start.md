# 快速开始

## 环境要求

Node.js 18 或更新版本。演示页面在任何现代浏览器里都能运行。

## 安装和打包

```bash
# 安装依赖
npm install

# 打包到 dist/
npm run build

# 启动静态服务器
npm run serve
```

浏览器打开 `http://localhost:8080`，点击「选择 APK」或把 APK 拖进页面。

## 运行示例

仓库自带 `samples/hello-dex.apk`，这个小应用覆盖了大部分 Framework 功能。从演示页面下载，或直接加载：

```js
await sim.loadFromUrl('https://caofangkuai.github.io/apk.js/samples/hello-dex.apk');
```

## 把真实 APK 渲染成图片

`tools/render-apk.mjs` 会启动一个 node-canvas 画布，跑完 APK 后保存 PNG：

```bash
# 输出到 image-debug/my-app.png
npm run render -- /path/to/app.apk my-app
```

改 `RENDER_WIDTH`、`RENDER_HEIGHT` 或 `RENDER_DENSITY` 可以调整输出尺寸。

## 开发构建

```bash
npm run build:dev
```

生成未压缩、带 source map 的产物。
