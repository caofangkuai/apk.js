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

- 分支 `main`，基线 HEAD `0a77108`；2026-11-09 六轮改动已推送（用户未要求 commit/push）。
- 新增：`src/framework/drawables.js`、`src/framework/opengl.js`、`tests/drawables.mjs`、`tools/setup-fonts.sh`、`tools/check-refs.mjs`。
- 修改：`view.js`、`widgets.js`、`layouts.js`、`graphics.js`、`window.js`、`registry.js`、`java-core.js`、`layout-inflater.js`、`package.json`、`AGENTS.md`、`TODO.md`。
- 本轮验证通过：`npm run check:refs`、`npm run test:all`、`npm run build`、`npm run site`。
- 自检：`grep -rin "androidx\|com.google" src/` 必须为空。

### 本轮已完成（2026-11-09 第六轮：真实字体测量与布局回归）

1. **node 渲染接入真实字体测量**：`tools/render-apk.mjs` 创建共享测量画布并挂到 `globalThis.__APKJS_MEASURE_CANVAS`，`graphics.measureTextWidth` 在无 DOM 环境下使用它；长文本（如 `4.14.0 #1 SMP PREEMPT`）不再被字符宽度表误判换行，表格行显示与原生一致。
2. **ArrayList 集合构造**：补 `ArrayList(Collection/Iterable)`，避免 `new ArrayList(list)` 时数据丢失。
3. **抽屉点击**：拦截态触摸向可点击父项冒泡，`NavigationMenuItemView` 能收到点击并关闭抽屉。
4. **BatteryManager**：补 `batterymanager` 服务别名与 Class 重载，电池页不再空指针。

### 本轮已完成（2026-11-08 第五轮：AOSP 控件绘制对齐）

1. **DisplayMetrics 密度链路**：`TypedValue.applyDimension` 之前直接读 `metrics.density`（JavaObject 上为 undefined，回退 1），导致 Material 的 dp→px 全部减半。新增 `metricsValue()` 从 `$fields` 读 `density:F` 并按 IEEE 位解码；TabLayout 高度从 48px 恢复为 96px（48dp），AppBar 总高 208px。
2. **程序化控件样式属性**：新增 `applyProgrammaticViewStyle()`，在 `View/ImageView` 的 `(Context,AttributeSet,I)` 构造路径通过 `themeAttributeValues` 读取 defStyleAttr，应用 minWidth/minHeight/scaleType/padding/textSize/textColor/textAllCaps/gravity。Toolbar 导航按钮从 48px 恢复 112px（56dp），图标居中。
3. **View 最小尺寸**：`View.measure` 在 onMeasure/dex 测量后按 minWidth/minHeight 钳制测量结果（AT_MOST 封顶）；尺寸被放大后重新测量 MATCH_PARENT 子项。NavigationView 菜单项从 34px 恢复 96px（48dp），CheckedTextView 同步填满 96px 并由 gravity 垂直居中。
4. **文本排版回归 AOSP**：TextView 统一行距模型（pitch=descent-ascent，首行 baseline=-top/-ascent，includeFontPadding 计入 top/bottom），测量与绘制共用；getBaseline 改 `paddingTop+firstBaseline`；字体度量 leading 改 0、bottom 0.27em；wrapText 增加整段快速路径和词边界折行。
5. **LinearLayout**：权重只在 EXACTLY 下分配（AT_MOST 不再拉伸）；水平布局增加 baselineAligned 对齐（maxAscent/maxDescent）；水平测量增加 MATCH_PARENT 高度二趟测量。
6. **FrameLayout**：增加 MATCH_PARENT 子项二趟测量。
7. **NinePatch**：`npTc` 解析修正为 padding@12、xDivs@32、numX+1 顶点；绘制支持多段可拉伸区域按比例缩放。
8. **Drawable**：线性渐变按矩形在方向上的投影长度取端点（不再用 max(w,h)/2）；ring 改为描边圆环；矩形 stroke 内缩 strokeWidth/2；DEX GradientDrawable 支持 angle/radial/sweep 与多色 stop；Drawable 补 setCallback/getCallback。
9. **elevation 阴影**：改为离屏画布绘制 ambient(0.039)/spot(0.19) 两遍阴影并挖掉本体，修复 Canvas 阴影被源 alpha(0.01) 衰减到不可见的问题。
10. **杂项 host**：TextView getLineCount/getMaxLines/setSingleLine/setCompoundDrawables*、View getMinimumWidth/Height/getSuggestedMinimum*、hasTransientState、Drawable setCallback、Arrays.fill、Long.bitCount/rotateRight 等。

### 本轮已完成（2026-11-08 第四轮：DEX 绘制与渲染补全）

1. **支持 DEX 覆写的 `View.draw(Canvas)`**（`view.js`）：之前在宿主 `View.draw` 里只处理 `onDraw`/`dispatchDraw`，导致 `AppBarLayout`、`ViewPager`、`TabLayout$f`（SlidingTabIndicator）等覆写 `draw` 的类被跳过或报错。现在检测并调用 DEX `draw`，super 调用进入宿主管线时不再二次 translate（避免内容整体偏移），TabLayout 指示条、AppBar/ViewPager 自绘恢复正常。
2. **View native canvas 解包**：`onDraw/draw/dispatchDraw` 的 native 入口把 Java `Canvas` 解成 adapter，修复 DEX super 调用时 `canvas.save is not a function`。
3. **Paint Shader 链路**：新增 `Shader` / `Shader$TileMode` / `LinearGradient` / `RadialGradient` / `SweepGradient` host，`Paint.setShader` 参与 `applyPaint`/`applyPaintRaw`，Canvas2D 生成对应 gradient；修复依赖 shader 的渐变绘制。
4. **NinePatch**：解析 PNG `npTc` 块（`resources.js#parseNinePatchChunk`），`NinePatchDrawable` 与 bitmap drawable 走九宫格切片绘制。
5. **资源 Drawable intrinsic / colorFilter**：资源包装对象补 `getIntrinsicWidth/Height`（selector/layer/inset/shape/vector），`colorFilter` 作为 SRC_IN 颜色参与填充，修复 TabLayout 指示条高度/着色。
6. 同步修复 `Drawable` 的 `getBounds` 与 DEX draw 调用顺序。
7. 位图异步加载完成后触发 `decorView.requestLayout()`，避免 ImageView 在图片到达前测量为 0x0 后不再重新布局。
8. ListView 支持 `convertView` 复用：`notifyDataSetChanged/notifyDataSetInvalidated` 标记版本并触发观察者，`ensureItems` 用旧 item 作为 convertView 重新绑定；`getFirstVisiblePosition/getLastVisiblePosition` 按滚动位置计算。
9. 交互验证：抽屉、Tab 切换、列表滚动、溢出 PopupMenu 均正常；抽屉 header 的 teal/orange 分块是应用自身 layer-list（70dp 左条 + 橙色主体），非渲染错误。
10. Vector drawable 携带 `resources.density`，修复 24dp 图标被按 24px 绘制（三点菜单过小）。
11. DEX Drawable 绘制改为「画布 translate + bounds 归零」；Canvas.drawPath 补 rMoveTo/quadTo/rQuadTo/cubicTo/rCubicTo/arcTo。
12. ImageView 对纯 DEX Drawable 增加「离屏渲染 + ink bbox 居中」：先画到带 padding 的离屏画布（避免自绘 drawable 越界被裁），扫描 alpha 包围盒，再按包围盒中心对齐到目标 rect。修复 Toolbar 两横线导航图标贴左上问题；现在图标为 36×14px 的两条横线，水平居中（x≈6..41）、与右侧三点菜单同一行。

### 上一轮已完成（2026-11-08 第三轮：类名/特判清理）

按静态审计结论依次清理：

1. 删除 4 处确认违规：`Lf/a/h/a;`、`Lf/a/m/a$a;`（混淆 shell 宿主）、`Lk7/t;`/`Lq7/l;`（R8 后的 Kotlin collections 映射）、`MarginsLayoutParams$LayoutParams` 分支；同时删掉因此失效的 `kotlinJoinToString`。
2. 删除 21 处类名/混淆名调试探针：TabLayout/Toolbar/RecyclerView/appcompat/FitWindows/CoordinatorLayout/ResourceManagerInternal、`Lpc/a;`、`Lf7/a;`、混淆字段 `b`、`checkVectorDrawableSetup`、`apk.js Browser`、`kotlin.jvm.internal.h.i`、`h0.b.b` 等；移除直接 `process.env` 读取（浏览器不兼容），调试开关统一走 `debugFlag`/`globalThis` 且不再含类名。`debug.js` 与 `webpack.config.js` 删除 9+ 个死 flag。
3. VIRTUAL_FS 硬件指纹改为 `hardwareIdentity()` 按 `navigator.platform` / UA / `hardwareConcurrency` / `screen` 生成（`apkjs-<arch>-*` 系列）：音频 codec/card、i2c BOM、触摸/LCD、GPU、中断名、input devices 均不再写死真机型号；`INPUT_DEVICE_DEFINITIONS` 同步。
4. 修 9 处质量风险：三份 `id.includes('mask')` 合并为精确 `isMaskItemId()`（0x0102000a / `/mask`）；ProgressBar 横向判定改为精确 `ProgressBar.Horizontal`；主题颜色回退去掉 `/background|text|color/i` 猜测，改白名单 key；`LayoutParams` 判断改 `endsWith`。
5. 新增 `tools/check-refs.mjs` + `npm run check:refs`：禁止 androidx/Material/应用内部类名、非 `android/java/javax/org` descriptor、混淆 descriptor、具体设备指纹与 `process.env` 直读；已并入 `test:all` 和 CI（`.github/workflows/deploy.yml`）。

验证：DeviceInfoHW 仍可启动渲染（`image-debug/devinfo-clean.png`），硬件项显示 navigator 推导值；`npm run check:refs` 为空。

### 上一轮已完成（2026-11-08 第二轮：真机 APK 与控件对齐）

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

已知差异（第四轮已修 TabLayout 自绘 indicator / DEX draw；表格行自身无 divider 与原生一致）；Toolbar/AppBar 阴影仍偏淡。

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

1. **MaterialShapeDrawable 阴影**：Shader host 已具备，但 Material 的 `ShadowRenderer` 三段渐变（0x44/0x14/0x00）尚未按其几何复现；当前 Card/Button 阴影仍走 Canvas shadow。
2. **elevation overlay**：深色主题下 MaterialShapeDrawable 的 elevation overlay 颜色叠加未实现。
3. **AnimatedVectorDrawable 属性动画**：只画目标 vector，未执行 trimPath/旋转动画（ProgressBar circular indeterminate 仍是 JS 近似）。
4. **ListView 窗口化布局**：已支持 convertView 复用与可见位置，但仍是全量创建 + scrollY 位移，未实现 fillDown/fillUp 窗口。
5. **RecyclerView 真机验证**：host 基建已补，但缺少使用 RecyclerView 的回归 APK。
6. **TextInputLayout / AppBarLayout 细节**：浮动标签、collapse 行为依赖 DEX 执行，未做 host 兜底。

### 建议接手顺序

1. MaterialShapeDrawable `ShadowRenderer` 三段渐变阴影。
2. AnimatedVectorDrawable 属性动画。
3. ListView 回收/局部布局与 RecyclerView 回归样例。
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
- 是否继续清理剩余通用调试钩子（已无类名）：`__DBG_EQ`、`__DBG_FLAG`、`__DBG_ARG`、`__DBG_FVID`、`__DBG_CV`、`__TXT`、`__DBG_TLS`、`__DBG_SH`、`__DBG_NPE_RV` 等。
- `image-debug/` 是否只保留最新一张图（删除旧图需用户确认）。
- 历史凭据如曾泄露，需要用户在平台侧轮换（不要把明文写入仓库或文档）。
