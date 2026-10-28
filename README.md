# apk.js

在浏览器里直接运行 Android APK 的纯 JavaScript 模拟器。

解析 APK 中的 `classes.dex`、`AndroidManifest.xml`、`resources.arsc`，用 DEX 字节码解释器执行应用逻辑，再用 Canvas 版 Android Framework 子集把界面画出来。整个过程不依赖 Android 设备、模拟器或原生库。

## 特性

- **纯前端**：解压、解析、执行、渲染都在浏览器内完成，不需后端服务
- **DEX 解释器**：支持 Dalvik 指令集主体、异常处理、switch/数组/字段/方法调用
- **资源解析**：二进制 `AndroidManifest.xml`（AXML）与 `resources.arsc` 资源表
- **Framework 子集**：`Activity` 生命周期、`View` 树与测量布局、`LinearLayout`/`FrameLayout`/`RelativeLayout`/`ScrollView`、`TextView`/`Button`/`EditText`/`ImageView`/`ProgressBar`、`ActionBar`/`Toolbar`、`Toast`、`Context`/`Intent`/`Bundle` 等
- **可绘制资源与主题**：`shape`/`vector`/`ripple`/`selector` 绘制、`RippleDrawable` 内容解包、`GradientDrawable`、`backgroundTint`、`@android:color/*` 解析、`Context.setTheme` 主题继承链
- **软键盘输入**：点击 `EditText` 聚焦并弹出系统键盘（隐藏输入框桥接），支持 `InputMethodManager`、光标闪烁与 `getSelectionStart`/`setSelection`
- **系统与反射**：`android.os.Build`/`VERSION`、`Class.forName`/`getMethod`/`Method.invoke`（含基本类型参数拆箱）、`startActivity` 携带 `Intent` 参数的多 Activity 跳转
- **可执行示例**：仓库自带 `samples/hello-dex.apk`，打开页面即可运行，涵盖计数、输入回显、动态添加视图、进度条、形状背景按钮、Build 信息、反射调用与第二个 Activity 跳转

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
| `dist/android-framework.min.js` | 纯框架实现：DEX 解析、运行时、资源解析、Canvas 版 Android Framework。不含任何页面/DOM 逻辑 |
| `dist/apk.min.js` | 用户调用层：设备信息、渲染目标元素、文件加载、状态与日志回调，依赖上一个文件 |

`index.html` 通过 `<script type="module">` 引用 `dist/apk.min.js`，它会自动加载 `android-framework.min.js`。JSZip 以全局变量形式提供，来自 `vendor/jszip.min.js`。

## 在页面中使用

`apk.min.js` 对外暴露 `createSimulator` 与 `ApkSimulator`，由调用方指定设备信息与渲染目标元素：

```html
<script src="vendor/jszip.min.js"></script>
<script type="module">
  import { createSimulator } from './dist/apk.min.js';

  const sim = createSimulator({
    // 渲染目标：可传 CSS 选择器、DOM 元素，或直接传已有 canvas
    element: '#phone-screen',
    // 设备信息
    device: {
      width: 360,
      height: 640,
      dpr: window.devicePixelRatio || 1,
      style: 'material',
      maxApkSize: 50 * 1024 * 1024,
    },
    onLog: (entry) => console.log(`[${entry.level}] ${entry.tag}: ${entry.message}`),
    onFinished: () => console.log('Activity 已结束'),
    onError: (error) => console.error(error),
  });

  // 从 File 对象加载（例如 <input type="file">）
  await sim.loadFromFile(file);

  // 也支持 URL、ArrayBuffer 或已解压的 JSZip 实例
  // await sim.loadFromUrl('samples/hello-dex.apk');
  // await sim.loadFromArrayBuffer(buffer);
  // await sim.loadFromZip(zip);

  sim.setDevice({ width: 280, height: 480 }); // 运行中调整尺寸
  sim.destroy();                              // 停止并从目标元素移除 canvas
</script>
```

| 选项 | 说明 |
| --- | --- |
| `element` | 渲染目标，接受 CSS 选择器字符串或 DOM 元素，自动在其中创建 canvas |
| `canvas` | 直接使用已有的 `<canvas>`，优先于 `element` |
| `device.width` / `device.height` | 逻辑分辨率，默认 360×640 |
| `device.dpr` | 设备像素比，默认取 `window.devicePixelRatio`（上限 2）；canvas 物理尺寸为逻辑尺寸 × dpr |
| `device.style` | 主题风格，默认 `material` |
| `device.maxApkSize` | APK 大小上限，默认 50MB |
| `onLog` / `onFinished` / `onError` | 日志、结束、错误回调 |

| 方法 | 说明 |
| --- | --- |
| `loadFromFile(file)` | 从浏览器 `File` 对象加载 |
| `loadFromUrl(url, options)` | 通过 `fetch` 下载后加载 |
| `loadFromArrayBuffer(buffer)` | 从二进制内容加载 |
| `loadFromZip(zip)` | 从 JSZip 实例加载 |
| `setDevice(device)` | 更新设备信息并立即应用新尺寸 |
| `stop()` / `destroy()` | 停止运行 / 停止并清理 canvas |
| `vm` | 当前 `JavaVM` 实例（只读） |

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

`npm test` 会解析 `samples/hello-dex.apk`、构建 View 树，并依次模拟：点击计数按钮、聚焦编辑框并用键盘输入回显、动态添加视图、推进进度条、点击形状背景按钮、读取 `Build` 信息、运行反射调用、`startActivity` 跳转到第二个 Activity 并校验传递的参数，检查各项事件回调是否生效。

## 构建示例 APK

`tools/build-sample-apk.sh` 演示如何把 `samples/apk-src` 编译打包成可运行的 APK，需要本机安装 Android SDK 与 build-tools。

## 已知问题

- 部分复杂第三方应用（如大型浏览器）在生命周期 `onStart` 阶段仍可能因 Framework 覆盖不全而失败
- 调试开关（`DBG_INV`、`DBG_CAST`、`CAS_DBG`、`FV_DBG`）在打包时会被编译期替换为 `false`

## 许可

本项目基于 [MIT License](./LICENSE) 开源。
