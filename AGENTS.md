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

# Drawable / 绘制像素级回归（node-canvas）
npm run test:drawables

# 全部回归一起跑（test + check + test:parse + test:drawables）
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

## 交接记录

本节记录 DeviceInfoHW（`ru.andr7e.deviceinfohw`）渲染修复、系统性 UI 差异的推进情况，以及给下一位 Agent 的接手建议。历史轮次保留在下方，最新一轮在最前面。

### 当前状态

- 分支 `main`，基线 HEAD `0a77108`；2026-11-08 两轮改动均未提交（用户未要求 commit/push）。
- 新增：`src/framework/drawables.js`、`src/framework/opengl.js`、`tests/drawables.mjs`、`tools/setup-fonts.sh`。
- 修改：`view.js`、`widgets.js`、`layouts.js`、`graphics.js`、`window.js`、`registry.js`、`java-core.js`、`layout-inflater.js`、`package.json`、`AGENTS.md`、`TODO.md`。
- 本轮验证通过：`npm run test:all`、`npm run build`、`npm run site`。
- 自检：`grep -rin "androidx\|com.google" src/` 必须为空。

### 本轮已完成（2026-11-08 第二轮：真机 APK 与控件对齐）

1. **CJK 字体**：`tools/setup-fonts.sh`（`npm run setup:fonts`）下载 Noto Sans CJK SC 并生成 `/etc/fonts/fonts.conf`。容器默认没有 fontconfig 配置，node-canvas 会退回豆腐块；浏览器仍用系统字体。
2. **DeviceInfoHW 启动链路修复**（上传的 5.4.1 APK 之前只渲染出空壳）：
   - 新增 `src/framework/opengl.js`：`javax.microedition.khronos.egl.EGL10/EGLDisplay/EGLConfig/EGLContext`、`EGLContext.getEGL()`、`GL10/GLES20/GLES30.glGetString`、最小 `GLSurfaceView` 与 Renderer 回调。
   - `java.lang.Thread.start()` 现在对 **Thread 子类** 调用 `run()`（之前只处理 Runnable 构造参数，启动线程里的 `startActivity` 永不执行）；补 `CountDownLatch`。
   - `resources.getDrawable/Context.getDrawable/TypedArray.getDrawable/View.getBackground/ImageView.setImageResource` 统一经 `drawableObject()` 包装成 Java Drawable，修复 TabLayout 对 drawable 调 `getBounds()` 的 NPE。
3. **Button 原生风格**：默认背景改为 Material 链路 `Ripple → Inset 4/6dp → Shape(2dp 圆角 + padding 8/4dp)`，`minHeight 48dp / minWidth 88dp`、14sp、`textAllCaps`、`textColorPrimary`；新增 `View.compoundPadding()`（view padding + drawable padding），TextView 基线按 `fm.top/fm.bottom` + `voffset` 计算，文字水平/垂直居中与原生一致。
4. **LinearLayout 权重**：按 AOSP 的递减循环实现（`share = trunc(weight*remainingExcess/remainingWeightSum)`，逐个子项扣减），`0dp+weight` 用 share，非 0 宽度用 `measured + share`；支持 `weightSum`。
5. **ImageView**：实现全部 `ScaleType` 几何（`fitXY/fitStart/fitCenter/fitEnd/center/centerCrop/centerInside`，含 rounding 差异）与 `adjustViewBounds`、`cropToPadding`、padding 内容盒。
6. **ProgressBar**：默认 Material 圆形 48dp；`Widget.ProgressBar.Horizontal` 检测为 16dp 高、4dp 轨道；支持 secondaryProgress、tint、indeterminate 旋转/truncate 动画（4444ms/1333ms）。
7. **ListView**：默认 divider（theme `listDivider` 或 1dp `0x1f000000`）、`setDivider/getIntrinsicHeight`、selector（`setSelector` padding、pressed 高亮）、滚动（`scrollY` + 拖动、点击阈值）、divider 绘制。
8. **Outline / elevation**：新增 `Landroid/graphics/Outline;` 与 `Landroid/view/ViewOutlineProvider;`（BACKGROUND/BOUNDS/PADDED_BOUNDS），View 增加 `setOutlineProvider/setClipToOutline`，阴影改为 ambient(0.039)+spot(0.19) 双 Pass，半径取背景 outline。
9. **Ripple 动画**：`RippleDrawable` 记录 pressed 状态与 hotspot，绘制扩张圆（225ms `(0.4,0,0.2,1)`、75ms 淡入、150ms 淡出），View 触摸 down 时同步 hotspot，绘制期间通过 `onInvalidate` 持续渲染。
10. **剩余 Drawable**：`VectorDrawable/ClipDrawable/ScaleDrawable/RotateDrawable/NinePatchDrawable/AnimatedVectorDrawable` host 与对应绘制分支；drawable padding 解析（shape `<padding>`、inset、layer-list、ripple）用于 `compoundPadding`。
11. **RecyclerView 支撑**：补 `View.offsetTopAndBottom/LeftAndRight`、`ViewGroup.offsetChildrenTopAndBottom/LeftAndRight` native；RecyclerView 本体仍是 DEX 执行。

已知差异：TabLayout 选中下划线（TabView 自绘 indicator）尚未出现；DeviceInfoHW 的表格行自身不带 divider（原生同样如此）；Toolbar/AppBar 阴影在示例中仍偏淡。

### 上一轮已完成（2026-11-08 第一轮）

上一轮按 AOSP 收益排序清掉 Drawable 基础 1-7 项，核心改动集中在 `src/framework/drawables.js`：

1. **统一 Drawable 解包与绘制**（新增 `src/framework/drawables.js`）
   - `drawDrawable(ctx, drawable, rect, options)` 统一入口：同时支持资源侧描述对象（`color/shape/xml/bitmap`）与 Java 侧 Drawable 对象。
   - 补 `InsetDrawable` / `LayerDrawable` / `StateListDrawable` / `BitmapDrawable` host；`RippleDrawable` / `GradientDrawable` / `ColorDrawable` / `Drawable` 在 `drawables.js` 中重写并覆盖 `java-core.js` 的旧定义（后注册覆盖）。
   - XML drawable 递归解包：`ripple` / `selector` / `inset` / `layer-list` / `clip` / `scale` / `level-list` / `animated-vector` / `shape` / `vector`，item 支持 `android:drawable`、`android:color`、`left/top/right/bottom` 内缩。
   - 纯 DEX Drawable（如 MaterialShapeDrawable）走 `drawDexObject`：先 `setBounds` 再以 `Landroid/graphics/Canvas;` 对象调用 `draw`。
   - `view.js` 的 `drawBackground`/`drawForeground` 改走统一入口，旧的 `drawPeerDrawable` / `unwrapXmlDrawable` / `drawShapeBackground` / `drawDexBackground` 已删除。
2. **`GradientDrawable.draw()` 与 shape gradient**
   - 支持 `solid`、`gradient`（linear/radial/sweep、angle、start/center/endColor）、`corners`（四角半径）、`stroke`（含 dash）、`oval/ring/line`。
   - `setColors/[[F setCornerRadii]`、`setGradientType/setGradientRadius`、`Orientation` 角度映射（TOP_BOTTOM=270 … TL_BR=315）。
3. **tint 链路**
   - View：`setBackgroundTintList/getBackgroundTintList/setBackgroundTintMode`、foreground tint 一组方法真正落到 `View` 字段并传给绘制。
   - Drawable：`setTint/setTintList/setTintMode`，`ColorStateList` 按状态取色；shape/solid/gradient 都消费 tint。
   - Paint：`setColorFilter/getColorFilter` 保存过滤对象；新增 `PorterDuffColorFilter` / `ColorFilter` / `ColorMatrixColorFilter` host；`graphics.js` 的 `applyColorFilter` 在 `applyPaint`/`applyPaintRaw` 中生效（SRC_IN/SRC_ATOP/MULTIPLY/SCREEN/CLEAR）。
4. **Drawable state 传递**
   - `View.drawableState()/drawableStateMap()/refreshDrawableState()`；`setEnabled/setPressed/setSelected/setActivated/setBackground` 触发刷新并广播 `setState`。
   - `getDrawableState()[I`、`refreshDrawableState()V`、`drawableStateChanged()V` native；selector XML 按 `state_*` 属性首个匹配。
   - `ColorStateList.getColorForState` 改为按序首个匹配，`getDefaultColor` 取空状态项，`withAlpha` 返回新列表。
5. **TextView 排版回归字体度量**
   - 行高改为 `descent - ascent`（约 1.17×），基线为 `lineTop - ascent`；新增 `getBaseline()` / `getLineHeight()` / `textLineMetrics()`。
   - 新增 `maxLines` + `ellipsize` 截断（`setEllipsize`）、内容区 `clipRect`、compound drawable 宽度参与测量与左右偏移。
   - `measureTextWidth` 在浏览器里优先用真实 `CanvasRenderingContext2D.measureText`，无 `document` 时回退字符宽度表（node 测试行为不变）。
6. **elevation/outline 阴影与 foreground**
   - `View.draw` 增加 `drawElevation`：按 `outlineRadius` 取背景轮廓圆角，用 `shadowBlur/shadowOffsetY` 画低透明度填充产生阴影。
   - `drawForeground` 在 `dispatchDraw` 之后绘制，支持 foreground tint。
7. **Canvas native 补全**
   - 映射 `drawCircle/drawLine/drawOval/drawArc/drawPoint/drawBitmap(3 种重载)/clipRect(3 种)/clipPath/scale/saveLayer/saveLayerAlpha/drawARGB/drawText([CIIFF)/getWidth/getHeight`。
   - `graphics.Canvas` 与 `window.createCanvasAdapter` 同步补齐对应实现。

本轮验证：`npm run test:all`（含新增 `npm run test:drawables`）、`npm run build`、`npm run site` 全通过。新增 `tests/drawables.mjs` 用 node-canvas 做像素级回归：GradientDrawable 圆角、Layer/Inset/Ripple 组合、StateList 状态切换、layer-list/selector/tint、View 背景 tint、TextView 基线/省略号、Paint colorFilter。

### 关键实现陷阱（务必先读）

- **float 字段存的是 IEEE 位**，不是数值。运行时约定：`iget/iput` 的 `F` 字段保存 `numberToFloatBits` 结果。`RectF` peer 因此存位；原生读取必须用 `floatBitsToNumber`，写入用 `numberToFloatBits`。`Path.arcTo/addRect`、`Canvas.readRectF` 已按此转换。
- **native 方法的 `F` 参数已被 `decodeNativeArgs` 解码**，host 里直接 `Number(x)` 即可；只有数组 `[F` 与字段仍是位。
- **Java 枚举必须返回 JavaObject 单例**。`Paint$Style/Join/Cap`、`PorterDuff$Mode` 若返回裸整数，dex 的 `if-eq` 引用比较会失配（曾导致填充分支被跳过）。
- **`vm.getField` 的优先级**：`$peer` 上的 own accessor（get/set）> `$fields` > `$peer` own 属性 > 默认值。peer 若用普通数据属性，`setField` 会写到 `$fields` 而 `getField` 可能读到 peer 旧值；需在 peer 构造函数里 `Object.defineProperty` 定义 own accessor。
- **`Drawable.getBounds()` 会缓存 `boundsObject`**。它可能只写 `$fields`（此时 `$peer` 尚未创建），读取 Rect 边界请用 `rectField()`（`registry.js`），不要直接 `rect.left`。
- **绘制 Drawable 子级前要配 `setBounds`**：`drawables.js` 的 `drawNested` 会先写 `peer.bounds`，再对 DEX 子类调 `setBounds(IIII)`。
- **`drawRoundRect` vs `drawPath`**：MaterialShapeDrawable 的圆角矩形走 `k.a(RectF)` 为真时的 `drawRoundRect`，路径分支只在非圆角/凸形状时用。
- **不要为单个 APK 写特判**；设备数据走 `VIRTUAL_FS` / `navigator`。调试钩子只针对单 APK 类名的必须交付前清理。

### 仍待修复的系统性 UI 差异

1. **TabLayout 选中下划线**：TabView 自绘 indicator（`TabLayout$i.j`）通过 `setBounds(TabView 全宽) + draw` 绘制，目前未落到可见像素；需要确认该 drawable 是 Gradient/Ripple 的哪一种并验证 bounds。
2. **MaterialShapeDrawable 阴影**：Material 组件在软件层用 `ShadowRenderer` 的三段渐变（0x44/0x14/0x00）而不是高斯模糊；目前统一走 Canvas 阴影，Card/Button 阴影观感会偏软。
3. **elevation overlay**：深色主题下 MaterialShapeDrawable 的 elevation overlay 颜色叠加未实现。
4. **NinePatch 解码**：`NinePatchDrawable` 目前只按普通位图缩放，未解析 npTc 的拉伸/内边距。
5. **AnimatedVectorDrawable 属性动画**：只画出目标 vector，未执行 trimPath/旋转动画（ProgressBar 的 circular indeterminate 是 JS 近似）。
6. **RecyclerView 真机验证**：host 基建已补（offsetChildren / addViewInLayout / drawChild），但没有使用 RecyclerView 的测试 APK 做回归。
7. **ListView 回收**：仍是“一次性创建全部 item + scrollY 位移”，未实现 AbsListView 的 scrap/recycle 与 fillDown/fillUp 局部布局；大列表会有性能差。
8. **TextInputLayout / AppBarLayout 细节**：浮动标签、collapse 行为仍依赖 DEX 执行，未做 host 侧兜底。

### 建议接手顺序

1. TabLayout indicator 与 MaterialShapeDrawable 阴影（当前截图最明显的差异）。
2. NinePatch 解码与 AnimatedVectorDrawable 动画。
3. ListView 回收/局部布局，RecyclerView 回归样例。
4. elevation overlay 与深色主题。
5. 继续用 `node tools/render-apk.mjs <apk> <名称>` 对照原生截图。

### 调试与复现

- CJK 字体：`npm run setup:fonts`（或 `bash tools/setup-fonts.sh`）。容器缺 fontconfig 配置时 node-canvas 只能画豆腐块。
- 上传的测试 APK：`/tmp/devinfo.apk`（DeviceInfoHW 5.4.1）；启动链路依赖 `src/framework/opengl.js` 与 Thread 子类 `start()`。
- 渲染出图：`node tools/render-apk.mjs /tmp/devinfo.apk <名称>` → `image-debug/<名称>.png`。
- 目标 APK：`/tmp/devinfo.apk`；可选探测脚本历史位置 `/tmp/opencode/`（`drawer_probe.mjs`、`bg_real2.mjs`、`rectcheck.mjs`、`dex_dis.mjs`、`dis_types.mjs`、`px2.mjs`、`tabs_shot.mjs` 等），若已清理可按功能重写。
- 触发路径：溢出菜单 tap `(697,53)`；菜单项 `(400,201)`；抽屉 swipe `(10,760)→(610,760)`。
- 验证抽屉填充：对 NavigationView 的背景走 `drawDrawable`，断点应看到 `drawRoundRect(0,0,560,1520,0)`，采样像素为 `255,255,255,255`。
- Drawable 回归：`npm run test:drawables`（node-canvas 像素断言，覆盖 Layer/Inset/Ripple/StateList/tint/TextView 基线）。

### 待用户确认

- “屏幕测试”子页顶部 ActionBar 缺失是否为预期。
- 是否清理 `src/` 中遗留的通用调试钩子：`__DBG_EQ`、`__DBG_FLAG`、`__DBG_ARG`、`__DBG_FVID`、`__MS4`、`__DBG_CV`、`__nodeFs`、`__TXT`、`__DBG_TLS`、`__DBG_SH`、`__GFDBG`、`__DBG_NPE_RV` 等。
- `image-debug/` 是否只保留最新一张图（删除旧图需用户确认）。
- 历史凭据如曾泄露，需要用户在平台侧轮换（不要把明文写入仓库或文档）。
