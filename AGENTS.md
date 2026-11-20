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

# Widget 绘制像素级回归（node-canvas）
npm run test:widgets

# Drawable / 绘制像素级回归（node-canvas）
npm run test:drawables

# 检查 native 类重复注册
npm run check:duplicates

# 检查实例属性遮蔽同名原型方法
npm run check:shadowing

# 本地 UI/触摸回归（需要字体）
npm run test:ui

# 全部回归一起跑（coverage + duplicates + shadowing + playground + refs + api + hooks + hooks-apk + bundles + layout-flag + zip + listview + format + diagnose + touch + interaction + widgets + drawables）
npm run test:all


# 带 hook 渲染（先装 hook 模块，再出图）
npm run hook:apk -- samples/hello-dex.apk samples/hooks/rename-title.mjs demo-hooked

# 调用热点剖析（次数 + inclusive 耗时）
npm run profile:apk -- /path/to/app.apk 20

# 渲染性能基准（120 帧）
npm run bench:render -- /path/to/app.apk

# 诊断 APK 启动日志
npm run diagnose -- /path/to/app.apk

# 渲染 Widget 画廊
npm run render:widgets

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
| `apk.js` | 核心引擎入口：dex/axml/arsc 解析、APK 装载、VM、Xposed 拦截层（不依赖 Android 宿主类） |
| `android-framework.js` | 模拟器入口：Java/Android 宿主类 + `createSimulator` / `ApkSimulator`，依赖 `apk.js` |
| `src/dex/` | DEX 解析与指令表 |
| `src/res/` | AXML / ARSC 解析 |
| `src/runtime/` | VM、解释器、类注册表、值模型 |
| `src/framework/` | Canvas 版 Android Framework 子集 |
| `src/core/` | 二进制读取工具、框架无关的 APK 装载器（`apk-file.js`） |
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
- APK 默认不限制大小，实际受浏览器可用内存约束。
- Framework 覆盖有限，大型应用常在 `onStart` 阶段失败。
- `startActivity` 只支持应用内部跳转。

## 交接记录

本节记录 DeviceInfoHW（`ru.andr7e.deviceinfohw`）渲染修复、系统性 UI 差异的推进情况，以及给下一位 Agent 的接手建议。历史轮次保留在下方，最新一轮在最前面。

### 当前状态

- 分支 `main`，已与 `origin/main` 同步（`4b82e2c` 之后又有本轮记录），提交后无需再补推。
- TextInputLayout 浮动标签这条线**已闭环**：样例 APK 能画出输入框，底色是正确的主题色（详见下方「洋红底色已修复」）。
- 推送认证注意：GitHub 不接受 `用户名:token` 形式（会返回 401），要用 `x-access-token:token` 作为凭据，或写进 `~/.git-credentials` 的 `https://x-access-token:<token>@github.com` 行配合 `git config credential.helper store`。
- 入口分层：`apk.js`（核心引擎）/ `android-framework.js`（宿主类 + 模拟器）。
- 拦截层：`src/runtime/xposed.js`（Xposed 风格 API）；`src/runtime/hooks.js` 只剩生命周期事件。
- 测试套件：coverage、duplicates、shadowing、playground、refs、run、check、parse、api、hooks、hooks-apk、bundles、layout-flag、list-callbacks、recyclerview、appbar、elevation-overlay、dialog-theme、progress-animation、list-choices、appcompat-hosts、typed-array、measure-constraints、style-precedence、inflate-dispatch、system-service、class-object、linked-hash-set、material-input-color、zip、listview、format、diagnose、touch、interaction、widgets、drawables、scrollbars、compat。
- 提交前三项校验：`npm run build`、`npm run test:all`、`npm run site`。
- 自检：`grep -rin "androidx\|com.google" src/` 必须为空；`npm run test:bundles` 会校验两个产物的依赖方向与导出面。
- Via 浏览器（`/tmp/via.apk`）：隐私弹窗 → 主页可正常渲染（标题/底栏改为主题深色文字，此前误显示白字），冒烟无未捕获异常；WebView 内容区仍为空（宿主不解析真实网页）。

### 本轮已完成（2026-11-21 第十七轮：主题属性引用与系统颜色解析）

Via 主页此前标题与底部导航文字为白色、底栏呈半透明深灰。定位到三处互相独立的通用缺陷（都不是 Via 特判）：

1. **ARSC 复杂尺寸的二次符号修正**（`src/res/axml.js` `decodeComplex`）：AOSP 的 `mantissa = (data & 0xffffff00) >> 8` 是**算术右移**，本身已带符号；旧代码又补了一次 `-= 0x1000000`，把 `0xFFFFB701`（-73dp）算成 -16777289，底部导航 ImageView 因此出现 `left=-33554578` 的越界矩形。删除二次修正后与 AOSP 一致。
2. **`Theme.resolveAttribute` 不解引用**（`src/framework/registry.js`）：旧实现把主题属性值一律写成 `type=0x10`（INT_DEC）、`data=0x7f06000b`，调用方（Via 的 `com.tuyafeng.support.utils.e.a`）直接读 `tv.data` 当颜色用，于是渲染出完全不相关的深色。新增模块级 `themeTypedValue` / `themeTypedValueReference`：字符串先试颜色再作字符串、`dimension` 走 `type=0x05`、资源 id 在 `resolveRefs=true` 时解析成 `type=0x1c`（颜色）/ `0x05`（尺寸）/ `0x03`（字符串）/ `0x10`（整数），无法解引用时退回 `0x01`（REFERENCE）。同时 `resolveAttribute` 现在也读 `store.$attrReferences`，不再漏掉只存在于引用表的属性。
3. **系统色引用链**（`src/framework/resources.js`）：新增 `resolveColorValue(resId)`，按「内置系统色映射 → 表项 reference 递归 → `resolve()` 结果 → 颜色字符串」取值。`getColor` 的 number 分支、最终兜底，`getColorStateList` 的 number / null 分支，以及 CSL XML selector 的 `color` 属性都改走它。此前 `0x7f06000b → 0x0106000b`（`android.R.color.white`）这类指向 framework-res 的引用会 `resolve` 失败并回退黑色。

验证：`tests/format.mjs` 改为断言式并覆盖 `decodeComplex`（`0x00000801→8dp`、`0xffffb701→-73dp`、负指数浮点）；DeviceInfoHW 渲染与基线 `devinfo-00-常规.png` **像素完全一致（changed=0）**；Via 冒烟通过且主页文字恢复为深色；`test:all` / `build` / `site` 全绿。

### 本轮已完成（2026-11-21 第十八轮：SDK 方法面大批补全）

按 `node tools/check-sdk.mjs --jar=/tmp/sdk/sdk-android-31.jar` 的缺口列表逐类补齐，覆盖 **5017 → 5385/8850**（本批 +368；加上第十七轮前基线共 +1053）：

1. **`android/app/Fragment`（0/109 → 109/109）**：完整宿主实现——id/tag/arguments/target/parentFragment/retainInstance/menuVisibility/userVisibleHint、`getContext`/`getActivity`/`getHost`/`getResources`/`getText`/`getString`、`instantiate(Context,String[,Bundle])` 静态工厂、全部生命周期回调（`onAttach(Context|Activity)` 写入 context/activity、`onResume/onPause` 维护 resumed、`onDestroyView` 清 view、`onDetach` 清 context）、`startActivity*` 走 `vm.startActivity`、transition 与 sharedElement 系列 getter/setter。`FragmentTransaction.add` 同步写 `$peer.$id/$tag/$added`，`getFragments()` 返回真实列表。
2. **`android/view/Window`（→ 全覆盖，+121）**：`getContext`/`getWindowStyle`（空 TypedArray）、container 链、WindowManager、`setGravity/Type/Format/WindowAnimations/DimAmount/Attributes`（同时写回 LayoutParams peer）、colorMode、`makeActive/isActive`、`requireViewById`、`addContentView`、`getLayoutInflater`、status/navigation bar 颜色与 contrast、systemGestureExclusionRects、transition 系列、`getDefaultFeatures(Context)` 静态方法。
3. **`android/content/Intent`（+66）**：data/type/identifier/categories/selector/clipData/sourceBounds 全字段；`addCategory`/`getCategories`/`hasCategory`、`setData*`/`getDataString`/`getScheme`、14 种 `putExtra` 重载与 ArrayList/Parcelable 变体、`putExtras/replaceExtras`、`fillIn`、`filterEquals/filterHashCode`、`clone/cloneFilter`、`resolveActivity(Info)`、`toUri`、静态 `createChooser/makeMainActivity/makeRestartActivityTask/parseUri/getIntent/normalizeMimeType`。新增 `resolveIntentComponent()`：按 AOSP `IntentFilter.match` 的 action/category 语义扫描清单 `intent-filter`，找不到再回退 launcher activity。
4. **`android/content/pm/PackageManager`（→ 全覆盖，+117）**：`queryIntentActivities`/`resolveActivity` 改用上面的清单匹配（返回带 `activityInfo` 的 ResolveInfo）；`getLaunchIntentForPackage`/leanback 变体；uid/gids/`getPackagesForUid`/`getNameForUid`；`checkPermission`/`checkSignatures` 全授予；`getPackagesHoldingPermissions`、权限组查询、restricted permission、instant app、`getResourcesForApplication`、图标/banner/logo（从清单 `android:icon|banner|logo` 取资源 id 走 `resources.getDrawable` + `drawableObject`）。
5. **`android/view/ViewGroup`（→ 全覆盖，+103）**：`dispatchKeyEvent/KeyShortcutEvent/TrackballEvent/HoverEvent/Generic*Event` 按 AOSP 从后往前派发（`dispatchToHostChildren`）；focus 链（`addFocusables`/`getFocusables`/`clearChildFocus`/`restoreDefaultFocus`/`onRequestFocusInDescendants`）；`removeViews*`/`detachViewsFromParent`/`updateViewLayout`/`measureChild`/`offsetRectIntoDescendantCoords`；`dispatchSetSelected/Activated/Pressed`、`dispatchDrawableHotspotChanged`、`onCreateDrawableState`、drawing cache 与 layout animation 状态。
6. **`android/view/View`（+216，余 65）**：insets 动画分发、focus/accessibility/触摸模式、key 与 hover 事件、`dispatchDraw`/`onDrawForeground`/`onDrawScrollBars`、fadingEdge、`invalidate` 各重载、drawing cache、clipBounds、`verifyDrawable`、drawable state（`onCreateDrawableState`）、`getGlobalVisibleRect`/`getFocusedRect`、`requireViewById`、`getUniqueDrawingId`。
7. **`android/telephony/TelephonyManager`（3/130 → 130/130）**：单卡 READY、GSM/LTE、数据已连接；IMEI/IMSI 等权限受限项返回 null；国家码从 `resources.getConfiguration().locale` 推导；补 `SignalStrength` 与 `ServiceState` 两个值对象；static 常量齐全。
8. **回归**：`test:all` / `build` / `site` 全绿；DeviceInfoHW 渲染与基线 `devinfo-00-常规.png` **像素完全一致（changed=0）**。

### 本轮已完成（2026-11-21 第十六轮：Context 与 OpenGL 方法面补全）

1. **Context API 批**（`registry.js`）：补数据/外部目录（`getDataDir`/`getCodeCacheDir`/`getObbDir(s)`/`getExternalCacheDir(s)`/`getExternalFilesDirs`/`getExternalMediaDirs`）、文件 IO（`getFileStreamPath`、`openFileInput/Output` 接 `VIRTUAL_FS`、`deleteFile`、`fileList`）、数据库路径与 `openOrCreateDatabase`、包路径、权限检查与 `enforce*`、Uri 权限、广播与 `startService/bindService` 默认值、壁纸、`create*Context` 返回自身、`getSystemServiceName`（走 `vm.getSystemServiceNameByClass`）。
2. **OpenGL 方法面**（`opengl.js`）：`GL10` 实例方法从 8 条扩到约 60 条（矩阵、顶点数组、固定管线、纹理、客户端状态）；新增 `GLES_COMMON_METHODS`（约 75 条，shader/program/buffer/texture/uniform/vertexAttrib/draw/query）与 `GLES30_EXTRA_METHODS`（约 31 条，VAO/FBO/RBO/instancing/query/UBO）。
3. **其余 GL 方法统一桩**：从 android-31 语料取 GL10/GLES20/GLES30 剩余 306 条签名，按返回类型生成默认值（`void→undefined`、`int/long→0`、`boolean→false`、`String→''`、`Buffer→null`），带 `[I`/`[F`/`[J`/`[B` 出参的 getter 会把数组清零。显式实现优先于桩（`Object.assign` 顺序保证）。
4. **覆盖度**：android-31 方法覆盖 3672 → **4332/8804**（+660；Context +203、GL 家族 +457），GLES20/GLES30 除构造器外全部覆盖。
5. **回归**：`tests/compat.mjs` 增加 OpenGL 断言（`glGenTextures`/`glGenVertexArrays` 清零、`glCreateProgram→0`、`glGetShaderInfoLog→''`、`glFenceSync→0`、GL10 方法存在）；`test:all`、`build`、`site` 全绿，DeviceInfoHW 渲染与基线像素一致（`changed=0`），Via 冒烟仍通过。

### 本轮已完成（2026-11-21 第十五轮：View/TextView/Activity API 面补全）

1. **View 状态与度量 API**（`view.js` + `compat.js`）：补 `keepScreenOn`、`scrollContainer`、`revealOnFocusHint`、`showingLayoutBounds`、`nextFocus*`/`nextClusterForward`、`drawingCacheQuality`、`fadingEdgeLength`、滚动条 thumb/track drawable、`accessibilityPaneTitle`/`stateDescription`/`accessibilityTraversal*`；实现 `getBoundsOnScreen`、`getHotspotBounds`、`mapRectFromViewToScreenCoords`、`isVisibleToUser`、`onFocusChanged`/`onFocusLost`、`startActionMode`、`hasExplicitFocusable`。
2. **View 空缺 API**：autofill / content-capture / accessibility 事件与结构（`onProvide*Structure`、`createAccessibilityNodeInfo`、`sendAccessibilityEvent*`、frame metrics、`initializeScrollbars`、`fitSystemWindows` 等）按 AOSP 默认语义补齐。
3. **TextView API**：补 `setText` 的 `BufferType`/`[CII`/资源 id 重载、`setHint` 与 hint 颜色、`getGravity`/`paintFlags`、min/max `Lines/Ems/Height/Width`、`lines`/`lineHeight`、`inputType`/`imeOptions`/`EditorAction`/私密 IME、`breakStrategy`/`hyphenation`/`justification`、`textLocale`、`shadow*`、`error`、`filters`、`setFrame`、select handle/cursor drawable，以及 `append(CharSequence,I,I)`。
4. **Activity API**：补 `getCurrentFocus`（沿 decor 深度优先找 `focused`）、`attachBaseContext`、`onPostCreate`/`onSaveInstanceState`/`onRestoreInstanceState` 的 `PersistableBundle` 重载（委托给单参版本）、`onNewIntent`、多窗口/画中画/语音交互/助手/键盘快捷键等生命周期与状态查询默认实现。
5. **覆盖度**：`tools/check-sdk.mjs` 对 android-31 语料从 3345/8804 提升到 **3672/8804**（+327 个方法）。
6. **回归**：`tests/compat.mjs` 增加 View/TextView 状态读写断言；DeviceInfoHW 渲染与基线像素完全一致（`changed=0`），Via 冒烟仍通过。

### 本轮已完成（2026-11-21 第十四轮：Via 浏览器启动打通）

1. **`Collections.addAll(Collection, Object[])`**：此前只认 List 的 `items`，目标是 Set 时静默丢弃全部元素。Firebase `Component.Builder` 用它保存附加接口，导致组件只登记主接口，依赖校验误报 `MissingDependencyException: android.content.Context`。现同时支持 List 与 Set（Set 走 `findSetIndex` 去重）。
2. **`Executors.unconfigurableExecutorService`**：缺失时返回 null，GMS 的 `u2` 把 null 存进 `ExecutorService` 字段，后续 `execute` 直接 NPE。补 `ThreadPoolExecutor`（构造、池度量、`allowCoreThreadTimeOut`、`getQueue`）、`LinkedBlockingQueue`、`ThreadFactory` 与 `unconfigurable*`。
3. **`java.nio.charset.Charset` / `StandardCharsets`**：整个命名空间缺失，`m8.a.<clinit>` 的 `Charset.name()` 空指针。补齐 `forName/defaultCharset/isSupported`、`name/displayName/aliases` 与六个标准编码静态字段。
4. **`String.indexOf(II)` / `lastIndexOf(II)` / `lastIndexOf(String,I)` / `startsWith(String,I)`**：缺重载会被兜底成 0，Via 的按字符切分循环因此不再前进（实测各 160 万次调用后撞上 8M 调用上限）。补齐后切分立即收敛。
5. **`android.os.StrictMode`**：整个类缺失，`new ThreadPolicy.Builder().detectResourceMismatches()...` 链式调用在空方法上 NPE。补 Thread/VmPolicy 与其 Builder（链式方法返回自身，`build` 产出空策略）。
6. **`WebView.getCurrentWebViewPackage()`**：返回 null 会让应用判定 WebView 未安装并弹「关闭应用」。改为返回 `PackageInfo`（`com.android.webview`）。
7. **验证**：`node tools/apk-smoke.mjs /tmp/via.apk --settle=1500` 冒烟通过（隐私弹窗 → 主页），无未捕获异常；`image-debug/via9-00-同意并继续.png`。剩余差距：宿主 WebView 不渲染真实网页内容，浏览/搜索功能不可用。

### 本轮已完成（2026-11-21 第十三轮：AOSP 滚动条绘制）

1. **滚动条**：`View.drawForeground` 现在按 AOSP `onDrawForeground` 的顺序在绘制前景后调用 `drawScrollBars`。滚动条宽度取 4dp（`scrollBarSize` 可覆盖），垂直条贴右内边缘（`verticalScrollBarPosition=1` 时贴左），track 为 `height - paddingTop - paddingBottom`；thumb 长度 = `max(24dp, track * extent / range)`，位置按 `offset / (range - extent)` 比例滑动。
2. **可见性时序**：与 AOSP 一致——初始不显示，滚动时 `awakenScrollBars()` 把 `$scrollBarFadeStart` 置为 `now + 300ms`，之后 250ms 线性淡出；淡出期间通过 `invalidate()` 继续出帧。`setScrollbarFadingEnabled(false)` 可常显。
3. **度量来源**：`scrollBarMetric()` 优先调用 DEX 覆写的 `compute*ScrollRange/Offset/Extent`，否则回退宿主实现。宿主 `ListView` 取 `$contentHeight` / `scrollY` / 视口高度，`ScrollView` 取子项高度，`HorizontalScrollView` 取 `scrollRangeX + 宽度`（并默认关闭垂直条）；基类 `View` 保持 AOSP 默认（range = extent = 自身尺寸、offset = 0）。
4. **API 补全**：`compat.js` 的 `VIEW_METHODS` 补 `set/isVerticalScrollBarEnabled`、`set/isHorizontalScrollBarEnabled`、`set/getScrollBarStyle`、`set/getScrollBarSize`、`set/isScrollbarFadingEnabled`、`set/getScrollBarFadeDuration`、`set/getScrollBarDefaultDelayBeforeFade`、`awakenScrollBars` 三种重载、`compute*Scroll*` 六件套、`getVerticalScrollbarWidth/Height`。`AbsListView` 里原先吞掉 `setVerticalScrollBarEnabled` 的空实现改为真正写回 view。
5. **滚动唤醒**：`View.scrollTo`、`ListView.applyScroll`、`ScrollView.scrollTo`、`HorizontalScrollView.scrollTo` 在位置变化时唤醒滚动条。
6. **回归**：新增 `tests/scrollbars.mjs`（不可滚动不出条、offset 移动 thumb、水平条、淡出、关闭开关、drawForeground 联动、各容器度量），已并入 `test:all`。DeviceInfoHW 静态渲染与上一轮基线像素完全一致（0 changed），滚动 hello-dex 的 ScrollView 后右边缘出现 26% 黑 thumb（像素 184,185,185），验证通过。

### 本轮已完成（2026-11-21 第十二轮：集合/反射语义修正与 AOSP 绘制管线对照）

1. **`new HashSet(Collection)` 缺失**：`java.util.HashSet` 只有 `()` / `(I)` 构造，`new HashSet(this.a)` 生成的集合始终为空。Firebase 的 `Component.Builder` 用它保存 provided 接口，导致依赖图里每个组件都「没有提供任何接口」，`ComponentRuntime` 的拓扑排序提前结束并误报 `DependencyCycleException: []`。已补 `(Collection)` / `(IF)` / `(IFZ)` 三个构造，`LinkedHashSet` 同步补 `(IF)` / `(IFZ)`。
2. **`Collections.newSetFromMap(Map)` 缺失**：返回 null 会让 `n2.v.<init>` 的 `addAll` 直接 NPE。现按 Map 的键构造 Set 副本（调用方只把返回值当容器用）。
3. **Map 值语义**：只覆写 `hashCode`、不覆写 `toString` 的键类（Firebase 的 `Qualified`）此前用 `hash:toString` 做规范化键，等值实例查不到彼此。改为 `findValueSlot()`：对值对象用 dex `equals` 线性比对已有原始键，身份键仅用于普通对象。注意这与第三轮「不要凭直觉加缓存」的结论不冲突——这里是语义修正，不是缓存。
4. **`java.lang.Class` 的 `equals` / `hashCode` / `toString`**：此前缺省走 `Object` 的身份比较，`Class` 相等应比较 descriptor。补上后 `Qualified.equals` 里的 `Class.equals` 才能正确返回。
5. **`String.format("%s", 对象)`**：改为调用覆写了 `toString` 的 dex 实现（`javaValueToString`），异常消息不再是 `[object Object]`。
6. **Via 浏览器 APK 冒烟**：从「隐私弹窗后立刻崩溃」推进到完成 Firebase 组件图构建，最终停在 `MissingDependencyException`（缺少 `android.content.Context` 等提供方）。已确认 Map/Set/Class 语义正确（逐键比对字段后确认是真实缺失），剩余原因是 Firebase 的 `ComponentRegistrar` 发现链路（manifest meta-data / `ComponentDiscoveryService`）尚未支持，与 Via 本身无关，属于通用宿主缺口。
7. **回归**：DeviceInfoHW 18 个标签页全部 `clicked=true`、`未绑定=0`、`异常=0`；`npm run test:all`（38 项）、`npm run build`、`npm run site` 全绿；SDK 方法覆盖 3251/8744（较上轮 +32）。

### AOSP UI 绘制逻辑对照（本轮审计结论）

按 AOSP `View.draw(Canvas)` 的顺序逐段核对 `src/framework/view.js`：

| AOSP 阶段 | 本项目实现 | 结论 |
| --- | --- | --- |
| `computeScroll()` | `computeScrollWithDex()`，DEX 覆写优先 | 一致 |
| 阴影（RenderNode 负责） | `drawElevation()` 离屏 ambient/spot 双 Pass | 近似；AOSP 由父级 RenderNode 统一绘制，遮挡关系略有差异 |
| `drawBackground()` | `drawBackground()` + `drawElevationOverlay()` | 一致（overlay 仅在暗色/主题启用时叠加） |
| `onDraw()` | 宿主 `onDraw`，DEX 覆写优先 | 一致 |
| `dispatchDraw()` | `dispatchDraw()`：`clipChildren` → `clipToPadding` → 滚动平移 → 按 Z 排序 → 跳过 GONE/INVISIBLE | 与 `ViewGroup.dispatchDraw` 一致 |
| `onDrawForeground()` | `drawForeground()`（前景 drawable + tint + `drawScrollBars`） | 前景与滚动条一致（4dp 宽、最小 24dp、滚动后 300ms 延迟 + 250ms 淡出）；`defaultFocusHighlight` 未绘制（模拟器不建模触摸模式） |
| `alpha` / `translation` | `canvas.translate` + `globalAlpha` | 一致 |
| DEX 覆写 `draw()` 的 super 调用 | `$dexDrawActive` 防止二次平移 | 与 AOSP「先定位画布再调用 super」一致 |

测量/布局侧：`MeasureSpec` 三态、`MATCH_PARENT` 二趟测量、`LinearLayout` 权重递减分配与 baseline 对齐、`FrameLayout` 二趟测量都已按 AOSP 实现（见第五轮记录）。已知剩余差距：

1. `defaultFocusHighlight` 未绘制；AOSP 只在非触摸模式下绘制，本模拟器的交互都由触摸驱动，暂不实现以免凭空多出高亮框。
2. 阴影由子视图自绘而非父级统一合成，重叠区域可能比原生更暗。
3. `View.draw` 未处理 `matrix` 与 `clipToOutline` 之外的硬件层（`setLayerType`）。
4. `elevation overlay` 目前对所有背景生效，Material 只在背景色等于 `colorSurface` 时叠加。

这四条都不影响 DeviceInfoHW / 自建 Material 样例的像素对照，已记录在下方「仍待修复的系统性 UI 差异」。

### 本轮已完成（2026-11-20 第十一轮：真实 NinePatch 块越界修复）

1. 用 node-canvas 实际渲染 DeviceInfoHW，发现抽屉菜单初始化反复抛出 `getDrawable: Offset is outside the bounds of the DataView`，导致溢出菜单图标缺失、诊断直接失败。
2. 根因是 `parseNinePatchChunk` 把 `numX` / `numY` 当成顶点数，按 `count + 1` 读取；真实 `npTc` 块每轴只有 `numX` / `numY` 个 div。现按实际 div 数读取，并在块长度不足时忽略该块。
3. `tests/drawables.mjs` 增加真实布局的 52 字节 `npTc` fixture，断言 x/y div 与 padding，并覆盖截断块不越界。修复后 `npm run diagnose -- /tmp/devinfo.apk` 为 `interesting=0`，渲染无未捕获异常，溢出菜单图标恢复。

### 本轮已完成（2026-11-20 第十轮：elevation overlay 主题自定义）

1. `View.elevationOverlayTint()` 读取主题 `elevationOverlayColor` / `elevationOverlayEnabled`：支持颜色整数、颜色字符串与 `$attrReferences` 资源引用；显式透明等同不叠加；属性未配置时保留「暗色叠白、浅色不叠」的旧行为。
2. 叠层透明度曲线抽成 `elevationOverlayAlpha(z)`，颜色计算与绘制共用；`drawElevationOverlay` 不再写死白色，改用主题叠层色做逐通道混色。
3. `tests/elevation-overlay.mjs` 增加自定义色（暗色/浅色启用）、禁用、显式透明、资源引用解析与像素级断言。

### 本轮已完成（2026-11-09 第九轮：性能定位）

1. CPU profiling 发现 inflate 阶段 `findNestedLayoutParamsClass` 占约 26% JS 采样，已按 `(vm, parentDescriptor)` 缓存。
2. 360×640 渲染基准约 20.7ms/帧、48.2 FPS（`npm run bench:render`）。
3. 剩余热点集中在 DEX 解释器 `runLoop/invoke/findVirtual` 与 Canvas 原生绘制。

### 本轮已完成（2026-11-09 第八轮：缺失方法清零）

1. 依据真实 APK 日志补齐 `org.json`、`Matrix.invert`、`Settings.Global`、`PointerIcon`、`PointF`、`BitSet`、`Process`、`Camera`、`AccessibilityDelegate` 等 host。
2. 修复 `MarginLayoutParams(Context,AttributeSet)` 被误插入 `PopupWindow` 的问题。
3. 剩余未绑定方法仅来自 `TabLayout`/`SwipeRefreshLayout` 自身 DEX 的 `generateDefaultLayoutParams`，不属于 host 缺失。

### 本轮已完成（2026-11-09 第七轮：host 补全）

1. host 补全：`android.os.Trace`、`android.widget.EdgeEffect`、`Paint.setColorFilter(ColorFilter, Mode)`、`ViewGroup.onInterceptTouchEvent`。
2. 浏览器入口默认 style 名改为 `default`，`src/` 与入口均无 material/androidx 字样。
3. 浏览器 E2E 工具与 Playwright 依赖已按用户要求移除。

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
7. **NinePatch**：`npTc` 解析修正为 padding@12、xDivs@32；绘制支持多段可拉伸区域按比例缩放（div 数量问题在第十一轮修正）。
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

- **`_invoke` 热路径不要新增无条件记账**。调用计数已由 `DBG_INVSTATS` 开关控制（默认关，开启后单次调用约慢 30%，真实 APK 启动中位数 78.9ms → 113.5ms）。需要剖析用 `npm run profile:apk`。

- **宿主类不要用与原型方法同名的实例字段**。`this.isLayoutRequested = false` 曾遮蔽同名方法，让 `isLayoutRequested()` 直接不可调用；`npm run check:shadowing` 会扫出这类冲突，字段请统一用 `$` 前缀（如 `$layoutRequested`）。

- **不要凭直觉给方法解析加缓存**。实测 DeviceInfoHW 启动期只有 138 次
  `findVirtual` / `findStatic` / `resolveMethod` 调用、合计约 1.8ms；真正开销在
  measure/layout 的宿主实现里（`View.onMeasure` 1400 次、`View.measure` 243 次、
  `ViewGroup.measureChildWithMargins` 56 次）。先用 `npm run profile:apk` 的宿主方法表
  定位，再决定改哪里。
- **float 字段存的是 IEEE 位**，不是数值。运行时约定：`iget/iput` 的 `F` 字段保存 `numberToFloatBits` 结果。`RectF` peer 因此存位；原生读取必须用 `floatBitsToNumber`，写入用 `numberToFloatBits`。`Path.arcTo/addRect`、`Canvas.readRectF` 已按此转换。
- **native 方法的 `F` 参数已被 `decodeNativeArgs` 解码**，host 里直接 `Number(x)` 即可；只有数组 `[F` 与字段仍是位。
- **Java 枚举必须返回 JavaObject 单例**。`Paint$Style/Join/Cap`、`PorterDuff$Mode` 若返回裸整数，dex 的 `if-eq` 引用比较会失配（曾导致填充分支被跳过）。
- **`vm.getField` 的优先级**：`$peer` 上的 own accessor（get/set）> `$fields` > `$peer` own 属性 > 默认值。peer 若用普通数据属性，`setField` 会写到 `$fields` 而 `getField` 可能读到 peer 旧值；需在 peer 构造函数里 `Object.defineProperty` 定义 own accessor。
- **`Drawable.getBounds()` 会缓存 `boundsObject`**。它可能只写 `$fields`（此时 `$peer` 尚未创建），读取 Rect 边界请用 `rectField()`（`registry.js`），不要直接 `rect.left`。
- **绘制 Drawable 子级前要配 `setBounds`**：`drawables.js` 的 `drawNested` 会先写 `peer.bounds`，再对 DEX 子类调 `setBounds(IIII)`。
- **`drawRoundRect` vs `drawPath`**：MaterialShapeDrawable 的圆角矩形走 `k.a(RectF)` 为真时的 `drawRoundRect`，路径分支只在非圆角/凸形状时用。
- **不要为单个 APK 写特判**；设备数据走 `VIRTUAL_FS` / `navigator`。调试钩子只针对单 APK 类名的必须交付前清理。

- **`getColor` 的三个来源要分清**：资源里取到的值可能是「颜色整数」「指向 color 资源的引用」「指向主题属性的引用（`?attr/xxx`，值形如 `0x7f0xxxxx`）」。第三类必须查 `themeAttributes`，系统资源（`0x01xxxxxx`）必须走 `resources.resolve` 的内置映射。少了任何一步，调用方就会拿一个 id 当颜色渲染——实测 Material 输入框因此被涂成洋红 `#FFFF00FF`（`Color.MAGENTA` 正是它的兜底值）。看到洋红先怀疑这一条。

- **库级 R 包要列全**：`--extra-packages` 只为列出的包生成 R 类。缺 `androidx.core` 时 `R$styleable` 取不到，`ColorStateList` 解析整体退化成兜底；缺 `androidx.appcompat.resources` 时 `R$drawable.abc_vector_test` 为 0，vector 自检失败并中断整个控件构造。

### 已知的行为简化（不是 bug，但和原生有差距）

1. **ProgressBar 插值**：已实现 VisualProgress——`setProgress` 记录起止值与起始时间，`visualProgress()` 按 250ms 减速曲线插值，绘制与帧循环都读它；不确定态仍走自己的旋转动画。仍缺：进入不确定态时的 morph 过渡。
2. **`setSelection` 只滚到目标项**：不触发 `onNothingSelected`，也不处理 `setSelectionFromTop` 的偏移。

### 仍待修复的系统性 UI 差异

1. **elevation overlay**：暗色主题下按 8 档 alpha 曲线叠加，叠层色取自主题 `elevationOverlayColor`（缺省暗色白/浅色不叠），`elevationOverlayEnabled` 可显式开关；支持颜色整数、颜色字符串与 `$attrReferences` 资源引用，显式透明等同不叠加（`View.elevationOverlayTint` / `elevationOverlayAlpha` / `drawElevationOverlay`）。剩余差距：Material 仅在背景色等于 `colorSurface` 时叠加，当前对所有背景生效。
2. **RecyclerView 真机验证**：host 基建已补，但缺少使用 RecyclerView 的独立回归 APK。
3. **TextInputLayout / AppBarLayout**：依赖 DEX 执行；嵌套滚动契约与子项平移已补齐，并用 `tests/appbar-collapse.mjs` 覆盖。但 DeviceInfoHW 里没有超过一屏的滚动区（各容器 getScrollRange 为 0），collapse 无法在真实场景触发，**仍缺像素级对照**。
   - 自建 Material 样例 APK 已跑通（`samples/textinput-src/` + `tools/build-textinput-apk.sh`）：工具链与依赖齐备，APK 能产出并**正常启动**（从「createSubDecor 抛异常」到 Activity 正常 onCreate）。关键经验：`R$styleable` 必须与最终 APK 用**同一次** `aapt2 link` 生成并加 `--extra-packages androidx.appcompat:com.google.android.material`；用 `--static-lib` 单独生成会把 id 全清成 0，分两次 link 则 id 段不同（0x7f02 vs 0x7f03），运行时对不上。
   - 因此浮动标签的像素基线**仍无法建立**。两条可行路径：用 Gradle 构建一个带 TextInputLayout 的 APK，或补齐资源静态库管线（工作量在构建层，不在框架层）。
   - **排查已推进到的最后一环**（2026-11-20）：自建样例能启动后，控件 `TextInputLayout` 的 `endLayout` / `editText` 一直是 null。逐层定位如下：
     1. `EndCompoundLayout` 构造期调用 `ResourceManagerInternal.checkVectorDrawableSetup`；
     2. 该方法取 `R$drawable.abc_vector_test` 交给 `getDrawable`，实测 `resId=0x0` → 返回 null；
     3. 拿到 null 后它把 `mHasCheckedVectorDrawableSetup` 重置回 false 并抛 `IllegalStateException`，构造中断；
     4. 根因：`Landroidx/appcompat/resources/R$drawable;` 这个 R 类**没有进 dex**——构建脚本的 `--extra-packages` 只列了 `androidx.appcompat` 和 `com.google.android.material`。
   - **尝试过但失败的修法**：把 `--extra-packages` 扩成十几个包后，R 类确实生成了、吞掉的异常也归零，但资源 id 整体偏移，画面变成全白。说明多包 `--extra-packages` 会让 id 分配与 dex 里的 R 常量对不上。已回退。
   - **更正**（2026-11-20 复核，推翻此前记录）：`--extra-packages` **确实会为库包生成 R 类**。实测把 `androidx.appcompat.resources` 写进 `--extra-packages` 后，`androidx/appcompat/resources/R.java` 正常产出、link 无报错。
   - 真正的问题在**包归属**：现有 link 用了 `--no-static-lib-packages`，它把所有资源并进应用包（id 前缀 `0x7f`），于是库 R 里的常量全是 0（实测 `abc_vector_test=0`，而资源表里该资源 id 是 `0x7f070076`，确实存在）。
   - 另外单独对单个 AAR 用 `--static-lib` 生成 R 也能成功（`appcompat-resources` 的 R.java 能产出），但 id 同样是 0——`--static-lib` 下库资源 id 本就不确定，运行时对不上。
   - **再更正**（2026-11-20 末次复核）：去掉 `--no-static-lib-packages` 重新 link，**并没有**出现 `SearchView` styleable 冲突（此前的推断是错的），但 `abc_vector_test` 在主包 R 与 `androidx.appcompat.resources` R 里**仍为 0**。已确认该资源确实编译进了 `dep-3.zip`（`drawable_abc_vector_test.xml.flat`），主包 R 也含这个符号（共 7172 个常量）——只是值为 0。
   - 也就是说：`--extra-packages` 生成的是主包 R 的**副本**（换包名），并不是各库自己的符号表；库资源的 id 在这一链路里拿不到有效值。要正确产出，需要真正的库级资源发布（Gradle 的 `processResources`/`generateRClass`）。
   - **最终更正（务必读）**（2026-11-20）：前面几条关于「R 里 id 为 0」的判断**全部是误报**。原因是我用 `grep -o "符号=[0-9]*"` 统计，遇到 `=0x7f070076` 时会在 `0` 处截断，于是看起来像 0。重新用 `=0x[0-9a-f]*` 匹配后确认：`abc_vector_test=0x7f070076`，**主包 R 与 `androidx.appcompat.resources` 的 R 都是正确值**，`--extra-packages` 完全能用。
   - 因此构建脚本的正确配置就是：`aapt2 link` 一次（不加 `--static-lib`），`--extra-packages` 里列出 `androidx.appcompat:androidx.appcompat.resources:com.google.android.material`，再把这些 R 类一起编译进 dex。已验证 `R$drawable` 能拿到 dexClass。
   - **已解决**（2026-11-20）：真正的卡点是 `java.util.LinkedHashSet` **没有 host 实现**。`EndCompoundLayout` 用它存监听器，构造期 `initEndIconView → setEndIconMode → dispatchOnEndIconChanged` 就要遍历，集合退化成裸对象后 `iterator()` 返回 null，于是报「调用 hasNext 时对象为空」，`endLayout` / `editText` 一直是 null。补齐该集合后两者立即正常，**样例 APK 首次画出输入框**。
   - 顺带修掉：`setText(null)` 之前经 `jsString(null)` 变成字面量 `"null"`（应为清空），两处 `setText(CharSequence)` 绑定已挡掉空引用；`themedStyledValue` 对系统资源 id（`0x01xxxxxx`）查不到时改走 `resources.resolve` 的内置映射。
   - **洋红底色已修复**（2026-11-20）：根因是三处叠加的取色缺陷，而非资源缺失。
     1. `TypedArray.getColor` 拿到 `?attr/colorPrimary` 这类**主题属性引用**（值形如 `0x7f0xxxxx`）时，把它当颜色整数直接返回——调用方拿着 attr id 去渲染，显示出完全不相关的颜色；
     2. **系统资源**（`0x01xxxxxx`）不在 APK 的 arsc 里，查表查不到时同样被原样当成颜色；
     3. `themeAttributeValues` 在「表里没有 key、但样式确实给了值」时凭空写 0，丢了真实引用。
     修复：`getColor` 按「attr 引用查主题 → 系统资源走内置映射 → 普通资源正常解析」取值；`themeAttributeValues` 保留原始引用交给访问器解析。同时构建脚本补上 `androidx.appcompat.resources` 与 `androidx.core` 两个 R 包——缺了它们 `R$styleable`/`R$drawable` 取不到，颜色列表解析会整体退化成兜底值。
     实测：输入框底色从 `rgb(255,0,255)` 变为 `rgb(98,0,238)`（#6200EE，主题主色）。回归见 `tests/material-input-color.mjs`。
   - 以下是**排查中被推翻的错误结论**，保留仅为记录弯路，不要再据此行动：
     1. 曾认为 `boxBackgroundColor` / `defaultFilledBackgroundColor` 取到 `0xffff00ff` 是资源缺失所致；
     2. 追踪到 `TypedArray.getColor(idx=0, fallback=0xffff00ff)` 返回 fallback，调用栈是 `ResourcesCompat.getColorStateList → inflateColorStateList → ColorStateListInflaterCompat.createFromXml`，即 **color XML 解析失败后走了兜底**；
     3. 用 `parseBinaryXml` 直接解析 `res/color/mtrl_filled_background_color.xml`，结构完全正常：`selector` 下 4 个 `item`，各带 `color`/`alpha`/`state_*`；
     4. 但 `item` 的 `color` 属性值是 `2130903306`（`0x7f03000a`），在资源表里指向 **`attr/actionBarTabTextStyle`**，而 `R.java` 里 `colorSurface=0x7f030120`——**同一份 APK 内 id 不自洽**。
     5. 曾据此结论为「构建链路问题、框架侧不予兜底」——**错误**。真实原因是取色时把 `?attr` 引用当成了颜色整数，已在 `getColor` 修复。
   - 排查方法教训：`parseBinaryXml` 返回的是 `{ root, first, manifest, pool }` 而不是节点本身，直接当节点用会误判成「解析失败」。
   - 浮动标签文本控件的尺寸为 `0x0` 属正常：未输入时 hint 由 `CollapsingTextHelper` 自绘，不走 TextView。
   - 教训：统计型 grep 必须用完整模式（`0x[0-9a-f]*`），否则会把十六进制值误读成 0。本文件此前三条基于该误读的结论已作废。
   - 期间顺带修掉的通用缺陷（都有独立测试，与这个样例无关）：`MATCH_PARENT` 测量、`LayoutParams` 默认值、`TypedArray` 下标、`defStyleAttr` 优先级、样式引用解析、inflate 派发 `addView`、系统服务类型、`Class` 对象类型归属、静默吞异常。
4. **Dialog/AlertDialog**：圆角表面、阴影、三段按钮已有；配色改为从主题解析（colorSurface / colorOnSurface / colorPrimary），用 tests/dialog-theme.mjs 覆盖。仍缺：应用自定义 Dialog 主题样式（setTheme）与自定义 contentView 的像素对照。

### 建议接手顺序

1. elevation overlay 与深色主题。
2. RecyclerView 回归样例。
3. Dialog/AppCompat 复杂主题真机像素对照。
4. 继续用 `node tools/render-apk.mjs <apk> <名称>` 对照原生截图。

### 调试与复现

- CJK 字体：`npm run setup:fonts`（或 `bash tools/setup-fonts.sh`）。容器缺 fontconfig 配置时 node-canvas 只能画豆腐块。
- 上传的测试 APK：`/tmp/devinfo.apk`（DeviceInfoHW 5.4.1）；启动链路依赖 `src/framework/opengl.js` 与 Thread 子类 `start()`。
- 渲染出图：`node tools/render-apk.mjs /tmp/devinfo.apk <名称>` → `image-debug/<名称>.png`。
- 目标 APK：`/tmp/devinfo.apk`；可选探测脚本历史位置 `/tmp/opencode/`（`drawer_probe.mjs`、`bg_real2.mjs`、`rectcheck.mjs`、`dex_dis.mjs`、`dis_types.mjs`、`px2.mjs`、`tabs_shot.mjs` 等），若已清理可按功能重写。
- 触发路径：溢出菜单 tap `(697,53)`；菜单项 `(400,201)`；抽屉 swipe `(10,760)→(610,760)`。
- 验证抽屉填充：对 NavigationView 的背景走 `drawDrawable`，断点应看到 `drawRoundRect(0,0,560,1520,0)`，采样像素为 `255,255,255,255`。
- Drawable 回归：`npm run test:drawables`（node-canvas 像素断言，覆盖 Layer/Inset/Ripple/StateList/tint/TextView 基线）。

### 已修复（2026-11-12）

1. 温度/电池：String.format 解箱、double 参数解码、onPostResume 生命周期。
2. 分区页：newArray 元素表语义。
3. 相机页：Camera1/2 host、装箱 formats/characteristics；页面显示 2 台相机。
4. 应用程序页：PackageItemInfo.loadLabel、ColorStateList 包装、应用名称解析。
5. SearchView：ColorStateList 不再 ClassCast，诊断 interesting=0。
6. APK 大小默认不限制。
7. 拦截层：`src/runtime/xposed.js` 的 Xposed API（`XC_MethodHook`、`MethodHookParam`、`XposedBridge`、`XposedHelpers`），拦截点移到 `JavaVM._invoke` 解析之后；`HookBus` 只保留生命周期事件；`npm run test:hooks`。打包重划为 `apk.js`（核心引擎）+ `android-framework.js`（宿主类与模拟器），新增 `npm run test:bundles` 校验两个产物的分层与导出面。
8. MaterialShapeDrawable ambient/key/spot 三段阴影。
9. AnimatedVectorDrawable trimPath 路径裁剪与时间动画。
10. ListView 超长列表跳转窗口化与视图回收。
11. Dialog Material 圆角表面/阴影/三段按钮。

### 待用户确认

- “屏幕测试”子页顶部 ActionBar 缺失是否为预期。
- 是否继续清理剩余通用调试钩子（已无类名）：`__DBG_EQ`、`__DBG_FLAG`、`__DBG_ARG`、`__DBG_FVID`、`__DBG_CV`、`__TXT`、`__DBG_TLS`、`__DBG_SH`、`__DBG_NPE_RV` 等。
- `image-debug/` 是否只保留最新一张图（删除旧图需用户确认）。
- 历史凭据如曾泄露，需要用户在平台侧轮换（不要把明文写入仓库或文档）。
