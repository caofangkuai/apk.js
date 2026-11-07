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
| `site/` | 站点构建产物（文档 + playground），由 `npm run site` 生成，不入库 |
| `dist/` | 浏览器打包产物，由 CI 构建，不入库 |
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

### 站点与资源引用

- 文档站 VitePress 的 `base` 固定为 `/apk.js/`，对应部署地址 `https://caofangkuai.github.io/apk.js/`。
- `playground.html` 与 `docs/**/*.md` 里引用 `dist/apk.min.js`、`vendor/jszip.min.js`、`samples/*.apk`、`logo.svg` 时，一律写 `https://caofangkuai.github.io/apk.js/...` 绝对地址，避免相对路径在文档页深链下失效。
- 站点由 `.github/workflows/deploy.yml` 在 push 到 `main` 后自动构建并发布到 `gh-pages` 分支；`dist/` 与 `site/` 都由 CI 生成，不要提交。

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

## 交接记录（2026-11-07）

本节记录最近一轮针对 DeviceInfoHW（`ru.andr7e.deviceinfohw`）的渲染修复、已定位但未修的系统性问题，以及给下一位 Agent 的接手建议。

### 当前状态

- 分支 `main`，HEAD `64fe15f`，已推送到 `origin`。
- 工作区只有未跟踪文件 `image-debug/drawer_after.png`。
- 本轮验证通过：`npm run test`、`npm run check`、`npm run test:parse`、`npm run build`、`npm run site`。
- 自检：`grep -rin "androidx\|com.google" src/` 必须为空。

### 已完成

1. **ViewStub 与布局参数测量**（提交 `e8b4476`）
   - `src/framework/layout-inflater.js` 补 `android.widget.ViewStub` 分支，导航抽屉菜单项能真正实例化。
   - `src/runtime/vm.js` 的 `getField`/`setField` 增加 `名称:类型` suffix 兜底。
   - `src/framework/view.js` 的 `effectiveLayoutParams` 覆盖 base LP，修复 CheckedTextView 宽度为 0。
2. **MaterialShapeDrawable 抽屉背景填充**（提交 `64fe15f`）
   - `Paint$Style/Join/Cap` 改为 lazy 枚举单例（`registry.js` 的 `PAINT_ENUM_SINGLETON` / `paintEnumStaticFields` / `paintEnumStaticMethods`），`setStyle/setStrokeJoin/setStrokeCap` 解包 `.$peer.ordinal`。
   - `Landroid/graphics/RectF;` 从空定义改为完整 host：peer 存 float 位，补 `set/inset/offset/round/roundOut/contains/width/height/centerX/Y/isEmpty` 等。
   - Canvas native 新增 `drawRoundRect(RectF;FF;Paint)`、`drawRect(RectF;Paint)`，模块级 `readRectF`。
   - `ColorStateList.valueOf(I)`、`getResourceId` 不再把颜色当资源 id、框架 attr（如 `windowBackground`）主题回退、`makeTypedArrayPeer.getDrawable` 支持框架 attr。
   - `drawDexBackground` 调用 native `setBounds` 时补 proto 回退。

### 关键实现陷阱（务必先读）

- **float 字段存的是 IEEE 位**，不是数值。运行时约定：`iget/iput` 的 `F` 字段保存 `numberToFloatBits` 结果。`RectF` peer 因此存位；原生读取必须用 `floatBitsToNumber`，写入用 `numberToFloatBits`。`Path.arcTo/addRect`、`Canvas.readRectF` 已按此转换。
- **Java 枚举必须返回 JavaObject 单例**。`Paint$Style/Join/Cap`、`PorterDuff$Mode` 若返回裸整数，dex 的 `if-eq` 引用比较会失配（曾导致填充分支被跳过）。
- **`vm.getField` 的优先级**：`$peer` 上的 own accessor（get/set）> `$fields` > `$peer` own 属性 > 默认值。peer 若用普通数据属性，`setField` 会写到 `$fields` 而 `getField` 可能读到 peer 旧值；需在 peer 构造函数里 `Object.defineProperty` 定义 own accessor。
- **`Drawable.getBounds()` 会缓存 `boundsObject`**。它可能只写 `$fields`（此时 `$peer` 尚未创建），读取 Rect 边界请用 `rectField()`（`registry.js`），不要直接 `rect.left`。
- **`drawDexBackground` 的分支**：native 解析结果没有 `.method`，`boundsRes.method?.proto` 需要回退字面 proto。
- **`drawRoundRect` vs `drawPath`**：MaterialShapeDrawable 的圆角矩形走 `k.a(RectF)` 为真时的 `drawRoundRect`，路径分支只在非圆角/凸形状时用。
- **不要为单个 APK 写特判**；设备数据走 `VIRTUAL_FS` / `navigator`。调试钩子只针对单 APK 类名的必须交付前清理。

### 已定位的系统性 UI 差异（尚未修复）

参考本机已下载源码：`/tmp/opencode/aosp-core/`（AOSP `platform_frameworks_base`）与 `/tmp/opencode/aosp-material/`（Material Components、androidx、cardview）。临时目录可能被清理，需要时按类名重新下载。

按修复收益排序：

1. **缺 `InsetDrawable` / `LayerDrawable` 的 host 实现**
   - 未知类被解析成空类：`src/runtime/class-registry.js:168`；`src/framework/view.js:1881-1909` 的 `getDrawablePeer`/`unwrapXmlDrawable` 只取首项。
   - 原生链路：MaterialButton `RippleDrawable → InsetDrawable → LayerDrawable → MaterialShapeDrawable`（`MaterialButtonHelper.java:218-256`）；MaterialCardView 背景同为 `InsetDrawable`（`MaterialCardViewHelper.java:232`）。
   - 影响：MaterialButton 背景、MaterialCardView 背景整体消失。
2. **`GradientDrawable` 没有 `draw()`**（`src/framework/java-core.js:2538-2560`）
   - 影响：TabLayout 选中指示条、RecyclerView `DividerItemDecoration`、部分 shape 背景不绘制。
3. **tint 链路为空**
   - `View.setBackgroundTintList/getBackgroundTintList` 等空实现（`src/framework/registry.js:6280`），`Paint.setColorFilter` 空实现（`src/framework/java-core.js:2515`），Canvas 不消费 colorFilter（`src/framework/window.js:672-680`）。
   - 影响：主题 tint、AppCompat tint、MaterialShapeDrawable elevation overlay 全部失效。
4. **Drawable state 传递缺失**
   - 无 `getDrawableState/setState/drawableStateChanged/refreshDrawableState`；`View.setEnabled/setPressed/setSelected` 只改字段（`src/framework/view.js:311`、`view.js:739`）。
   - `drawBackground` 对 selector 永远取第一个 `<item>`（`view.js:1312`、`view.js:1893`）。
   - 影响：按下/禁用/选中态、Ripple、Tab 选中色错误。
5. **TextView 文本排版与原生不同源**
   - 行高硬编码 `textSize*1.35`（`src/framework/widgets.js:330`），Paint 度量约 1.17×（`src/framework/graphics.js:80-84`）；基线用 `paddingTop+textSize`（`widgets.js:373`），原生为 `lbottom-descent`（`Layout.java:802`）；`measureTextWidth` 是字符宽度表（`graphics.js:419`）。
   - 缺 `clipRect`、`maxLines/ellipsize`、compound padding、`getBaseline()`。
   - 影响：文字偏高、行距偏大、换行与宽度不同、溢出。
6. **无 elevation/outline 阴影、无 foreground 绘制**
   - `View.draw()` 只画 background/onDraw/dispatchDraw（`src/framework/view.js:1224`），`setElevation` 只存值。
   - 影响：Card/AppBar/Drawer/BottomNav 无层次阴影；MaterialCardView foreground 涟漪/图标不显示。
7. **Canvas native 只暴露约 11 个方法**（`src/framework/registry.js:4417`）
   - `drawCircle/drawLine/drawOval/drawArc/drawBitmap/clipRect/scale/saveLayer` 未映射；`drawWithDex` 捕获异常后静默回退（`view.js:1292`）。
   - 影响：自定义 View 空白。
8. **其它**
   - ListView 无 divider/selector/滚动，一次性创建全部 item（`src/framework/layouts.js:1002-1171`）。
   - LinearLayout 横向权重写成 `weight>0 ? share : measuredWidth`（`layouts.js:314`），原生为 `measuredWidth + share`。
   - ImageView 忽略 `scaleType`（`src/framework/widgets.js:606-620`）。
   - ProgressBar 硬编码尺寸/颜色（`widgets.js:683-700`）。
   - `ColorStateList.getColorForState` 取最长匹配且 `getDefaultColor` 取末项，原生为按序首个匹配 / 空状态默认色。

### 建议接手顺序

1. `InsetDrawable` + `LayerDrawable` + 统一 `Drawable.draw()` 解包（收益最高，修按钮/卡片背景）。
2. `GradientDrawable.draw()`（tab 指示条、分割线）。
3. tint 链路（View tint 存取 + Drawable tint + Canvas colorFilter）。
4. Drawable state 传递。
5. TextView 文本度量/基线/裁剪。
6. elevation/outline 阴影与 foreground。
7. Canvas native 方法补全。

每步完成后跑 `npm run test && npm run check && npm run test:parse`，改 UI 后跑 `npm run build`、`npm run site`，并用 `node tools/render-apk.mjs /tmp/devinfo.apk <名称>` 出图对照。

### 调试与复现

- 渲染出图：`node tools/render-apk.mjs /tmp/devinfo.apk <名称>` → `image-debug/<名称>.png`。
- 目标 APK：`/tmp/devinfo.apk`；可选探测脚本历史位置 `/tmp/opencode/`（`drawer_probe.mjs`、`bg_real2.mjs`、`rectcheck.mjs`、`dex_dis.mjs`、`dis_types.mjs`、`px2.mjs`、`tabs_shot.mjs` 等），若已清理可按功能重写。
- 触发路径：溢出菜单 tap `(697,53)`；菜单项 `(400,201)`；抽屉 swipe `(10,760)→(610,760)`。
- 验证抽屉填充：对 NavigationView 调 `drawDexBackground(adapter,bg)`，断点应看到 `drawRoundRect(0,0,560,1520,0)`，采样像素为 `255,255,255,255`。

### 待用户确认

- “屏幕测试”子页顶部 ActionBar 缺失是否为预期。
- 是否清理 `src/` 中遗留的通用调试钩子：`__DBG_EQ`、`__DBG_FLAG`、`__DBG_ARG`、`__DBG_FVID`、`__MS4`、`__DBG_CV`、`__nodeFs`、`__TXT`、`__DBG_TLS`、`__DBG_SH`、`__GFDBG`、`__DBG_NPE_RV` 等。
- `image-debug/` 是否只保留最新一张图（删除旧图需用户确认）。
- 历史凭据如曾泄露，需要用户在平台侧轮换（不要把明文写入仓库或文档）。
