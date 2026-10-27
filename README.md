# apk.js

在浏览器里直接运行 Android APK 的纯 JavaScript 模拟器。

解析 APK 中的 `classes.dex`、`AndroidManifest.xml`、`resources.arsc`，用 DEX 字节码解释器执行应用逻辑，再用 Canvas 版 Android Framework 子集把界面画出来。整个过程不依赖 Android 设备、模拟器或原生库。

## 特性

- **纯前端**：解压、解析、执行、渲染都在浏览器内完成，不需后端服务
- **DEX 解释器**：支持 Dalvik 指令集主体、异常处理、switch/数组/字段/方法调用
- **资源解析**：二进制 `AndroidManifest.xml`（AXML）与 `resources.arsc` 资源表
- **Framework 子集**：`Activity` 生命周期、`View` 树与测量布局、`LinearLayout`/`FrameLayout`/`RelativeLayout`、`TextView`/`Button`/`ImageView`、`ActionBar`/`Toolbar`、`Toast`、`Context`/`Intent`/`Bundle` 等
- **可执行示例**：仓库自带 `samples/hello-dex.apk`，打开页面即可运行

## 快速开始

```bash
# 安装依赖
npm install

# 打包（产物输出到 dist/）
npm run build

# 启动本地静态服务器
npm run serve
```

浏览器打开 <http://localhost:8080>，点击「选择 APK」或把 APK 拖进页面即可运行。

仓库已提交打包产物 `dist/apk.min.js` 与 `dist/android-framework.min.js`，因此也可以直接把 `index.html`、`dist/`、`vendor/`、`samples/` 放到任意静态服务器上使用。

## 产物说明

`npm run build` 使用 webpack 生成两个 ES Module 文件：

| 产物 | 内容 |
| --- | --- |
| `dist/android-framework.min.js` | DEX 解析、运行时、Canvas 版 Android Framework 全部代码 |
| `dist/apk.min.js` | 页面入口逻辑（选择文件、拖拽、日志、启动引擎），依赖上一个文件 |

`index.html` 通过 `<script type="module">` 引用 `dist/apk.min.js`，它会自动加载 `android-framework.min.js`。JSZip 以全局变量形式提供，来自 `vendor/jszip.min.js`。

开发时可用 `npm run build:dev` 生成带 source map 的未压缩版本。

## 目录结构

```
.
├── apk.js                    # 页面入口源码（webpack 入口之一）
├── index.html                # 演示页面
├── webpack.config.js         # 打包配置
├── dist/                     # 打包产物（已提交）
│   ├── apk.min.js
│   └── android-framework.min.js
├── samples/
│   ├── hello-dex.apk         # 可运行示例 APK
│   └── apk-src/              # 示例 APK 的源码
├── src/
│   ├── core/binary.js        # 二进制读取工具
│   ├── dex/                  # DEX 文件解析与指令定义
│   ├── res/                  # AXML / ARSC 解析
│   ├── runtime/              # VM、解释器、类注册表、值模型
│   └── framework/            # Canvas 版 Android Framework 子集
├── tests/                    # 回归测试
├── tools/                    # 构建示例 APK 的脚本
└── vendor/jszip.min.js       # JSZip（全局提供）
```

### `src` 各模块职责

| 目录 | 职责 |
| --- | --- |
| `core/` | 字节序安全的二进制读取 |
| `dex/` | DEX 头、字符串池、类型、方法、字段、类定义与字节码解析 |
| `res/` | `AndroidManifest.xml`、`resources.arsc` 的二进制格式解析 |
| `runtime/` | `JavaVM`、`DexInterpreter`、`ClassRegistry`、`JavaObject`/`JavaArray` 值模型 |
| `framework/` | `Engine` 编排、`View` 体系、布局、控件、资源、窗口、`Context`/`Intent`、Java 核心类 native 实现 |

## 支持范围与限制

- 仅支持**纯 Java/Kotlin APK**，含 `lib/` 原生库的 APK 无法运行
- APK 大小上限 50MB
- Framework 是 Android 的一小部分子集，覆盖率持续扩充中；未实现的 Framework 类或方法会以日志形式报错
- `startActivity` 仅支持应用内部 Activity，启动其他应用会抛 `ActivityNotFoundException`
- 界面渲染目标为 360×640 的 Canvas

## 测试

```bash
# 运行完整回归（加载示例 APK 并模拟点击）
npm test

# 校验 APK 解析结果
npm run check
```

`npm test` 会解析 `samples/hello-dex.apk`、构建 View 树、模拟点击按钮并检查事件回调是否生效。

## 构建示例 APK

`tools/build-sample-apk.sh` 演示如何把 `samples/apk-src` 编译打包成可运行的 APK，需要本机安装 Android SDK 与 build-tools。

## 已知问题

- 部分复杂第三方应用（如大型浏览器）在生命周期 `onStart` 阶段仍可能因 Framework 覆盖不全而失败
- 调试开关（`DBG_INV`、`DBG_CAST`、`CAS_DBG`、`FV_DBG`）在打包时会被编译期替换为 `false`

## 许可

本仓库未附带许可证文件，使用前请与作者确认。
