# AGENTS.md

面向在本仓库工作的 AI Agent。人类协作者也可以参考。

## 项目定位

apk.js 是在浏览器里运行 Android APK 的纯 JavaScript 模拟器。核心约束：解压、解析、执行、渲染全部发生在浏览器内，不引入后端，也不加载原生 `.so`。

## 环境

- Node.js 18+
- 浏览器端不需要任何全局 polyfill；`Buffer` 和 `process` 不可用
- Debian 12 环境，可用 `python3 -m http.server` 提供静态服务

## 常用命令

```bash
# 安装依赖
npm install

# 打包浏览器产物到 dist/
npm run build

# 开发模式打包（带 source map）
npm run build:dev

# 回归测试
npm run test
npm run check

# 三项一起跑
npm run test:all

# 把真实 APK 渲染成 PNG，输出到 image-debug/
npm run render -- /path/to/app.apk 输出名

# 构建完整站点（文档站 + playground）
npm run site

# 本地预览完整站点
npm run serve

# 文档站开发
npm run docs:dev
```

## 目录约定

| 路径 | 内容 |
| --- | --- |
| `apk.js` | 公开入口，导出 `createSimulator` / `ApkSimulator` |
| `src/dex/` | DEX 解析与指令表 |
| `src/res/` | AXML / ARSC 解析 |
| `src/runtime/` | VM、解释器、类注册表、值模型 |
| `src/framework/` | Canvas 版 Android Framework 子集 |
| `src/core/` | 二进制读取工具 |
| `tests/` | 回归测试；`tests/debug/` 是历史调试脚本 |
| `tools/` | 构建与渲染脚本 |
| `image-debug/` | node-canvas 出图，用于视觉对照 |
| `docs/` | VitePress 文档源，中英双语 |
| `site/` | 站点构建产物（文档 + playground），由 `npm run site` 生成 |
| `dist/` | 浏览器打包产物，已提交 |
| `samples/` | 示例 APK 与源码 |

## 代码约定

### 浏览器兼容

这是最容易踩的坑。所有运行时代码都会在浏览器里执行：

- 不要使用 `Buffer`。用 `utf8Encode` / `utf8Decode`（`src/framework/java-core.js`），它们基于 `TextEncoder` / `TextDecoder`。
- 不要直接读 `process.env`。用 `debugFlag(name)`（`src/runtime/debug.js`），它在浏览器里返回 `false`。
- 新的调试开关要同时加到 `webpack.config.js` 的 `debugFlags` 数组，这样生产构建会把它内联成 `false`。
- 需要 Node 专有能力（如 `fs`）时，先判断 `typeof process !== 'undefined' && process.versions?.node`，并提供浏览器回退。

### 执行 dex，补 host

- `androidx.*`、`com.google.android.material.*` 在 APK 的 DEX 里真实执行，不要重写这些类。
- 缺的是 `android.*` / `java.*` 的 host 实现，就在 `src/framework/` 里补。
- 不要为某个具体应用写特判分支。需要设备数据时，走 `VIRTUAL_FS` 预置或 `navigator` 读取，让任意 APK 都能受益。

### 设备信息

设备标识优先取浏览器实时值：

- `navigator.platform` → `ro.product.device` / board / hardware
- `navigator.language` → `ro.product.locale` / region
- `navigator.hardwareConcurrency` → `Runtime.availableProcessors()`
- `navigator.deviceMemory` → `MemoryInfo.totalMem`
- `navigator.maxTouchPoints` → 触摸能力

取不到时才回退到固定默认值，且只在确实读到 `navigator` 时缓存，避免 node 环境下把默认值固化。

### 调试钩子

- 临时探针用 `globalThis.__XXX` 开关，或 `debugFlag`。
- 交付前清理只针对单个 APK 类名的钩子。
- `tests/debug/` 下的历史脚本不属于测试套件，不要依赖它们。

## 提交前检查

```bash
npm run build
npm run test:all
npm run site
```

三项都要通过。`npm run site` 会暴露文档死链和 playground 资源路径问题。

## 语言与文案

- 用户用中文交流时，回复用中文。
- `README.md` 是英文，`README.zh-CN.md` 是中文，两者内容对应，改一处要同步另一处。
- 文档站 `docs/` 与 `docs/zh/` 同样双语对应。
- 品牌名统一写 `apk.js`，设备预置值里也一样。

## 已知约束

- 含 `lib/` 原生库的 APK 无法运行。
- APK 默认上限 50MB。
- Framework 覆盖有限，大型应用常在 `onStart` 阶段失败。
- `startActivity` 只支持应用内部跳转。
