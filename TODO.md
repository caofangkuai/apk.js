# TODO

待办事项。完成的条目移到下方「已完成」区段。

## 进行中

- [ ] Playground 移动端布局在 375px 宽度下复查，确认手机框、按钮与卡片不再重叠

## 待办

### 运行时

- [ ] 补齐 `startActivity` 跨应用解析，支持启动系统 Activity
- [ ] 增加 `RecyclerView` 的 `notifyItemChanged` 局部刷新
- [ ] 支持 `WebView` 加载 `assets/` 内 HTML
- [ ] 补 `ContentProvider` 与 `FileProvider` 的最小实现
- [ ] `MediaPlayer` / `SoundPool` 走 Web Audio
- [ ] `PackageManager` 读取 manifest `meta-data` / `ComponentProvider`，补齐 Firebase `ComponentRegistrar` 发现链路

### Framework

- [x] MaterialShapeDrawable 三段渐变阴影
- [x] `AnimatedVectorDrawable` 属性动画
- [x] `ListView` 回收与局部布局
- [x] elevation overlay 与深色主题（暗色 8 档 alpha 曲线；支持主题 `elevationOverlayColor` / `elevationOverlayEnabled` 自定义与引用解析，`tests/elevation-overlay.mjs`）
- [x] `PopupWindow`、`AlertDialog` 的布局与绘制（配色取自主题，`tests/dialog-theme.mjs`）
- [ ] `TextInputLayout` 的浮动标签动画（该控件依赖 DEX 执行，缺少可回归的样例 APK）
- [x] AppBarLayout collapse 依赖的嵌套滚动契约与子项平移（`tests/appbar-collapse.mjs`；真实 APK 无可滚区，仍缺像素对照）
- [x] RecyclerView 滚动基建（嵌套滚动 + offset 记入滚动量，`tests/recyclerview.mjs`）
- [x] ProgressBar VisualProgress 平滑插值（`tests/progress-animation.mjs`）
- [x] ListView / GridView `CHOICE_MODE` 选中集合（`tests/list-choices.mjs`）
- [ ] `BottomSheetDialog` 的拖拽行为
- [ ] `ViewPager2` 与 `ViewPager` 的滚动惯性对齐
- [ ] `Spinner`、`AutoCompleteTextView` 的下拉列表
- [ ] 深色主题（`AppCompatDelegate.setDefaultNightMode`）

### 工具链

- [ ] `tests/debug/` 下约 400 个历史脚本，保留与清理分开处理
- [x] 增加 CI 配置，跑 `build` + `test:all` + `site`
- [x] 出图增加像素差异报告（`npm run diff:image`）
- [x] `render-apk.mjs` 支持批量目录（`npm run render:batch`）

### 文档

- [x] Framework 覆盖矩阵（`npm run docs:coverage` 生成 `docs/framework-coverage.md`）
- [x] 文档站接入搜索（VitePress `search.provider = 'local'`，中英文各一份索引）
- [ ] 增加录屏式 GIF 演示，放进 README

### 站点

- [ ] `site/` 产物是否需要提交，还是由 CI 构建
- [ ] 自定义域名与部署流程

## 已完成

- [x] 渲染性能基准 `npm run bench:render`
- [x] PNG 像素差异报告 `npm run diff:image`
- [x] APK 批量渲染 `npm run render:batch`
- [x] 真实字体测量（node 共享测量画布）与 bold/italic/letterSpacing
- [x] DisplayMetrics 密度链路、TabLayout 48dp、Toolbar 导航按钮 56dp
- [x] View 最小尺寸与 MATCH_PARENT 二趟测量
- [x] AOSP TextView 行距/基线/includeFontPadding
- [x] FrameLayout/LinearLayout baseline 与权重修正
- [x] NinePatch npTc 偏移与多段拉伸修正
- [x] Matrix/Canvas.concat/clipPath host
- [x] ArrayList 集合构造、BatteryManager/USB/Trace/EdgeEffect/Accessibility host
- [x] 抽屉菜单点击（拦截态冒泡到可点击父项）
- [x] DEX 覆写 `draw(Canvas)` 支持与 View canvas 解包
- [x] Paint Shader / LinearGradient / RadialGradient / SweepGradient host
- [x] NinePatch `npTc` 解析与九宫格绘制
- [x] 资源 Drawable intrinsic 尺寸与 colorFilter 着色
- [x] 删除混淆类 host（Lf/a/*、Lk7/t;）与三方 LayoutParams 特判
- [x] 清理类名/混淆名调试探针与 process.env 直读，删除死调试开关
- [x] VIRTUAL_FS 硬件指纹改为 navigator 推导
- [x] 修复 mask/id、ProgressBar 横向、主题颜色等启发式质量风险
- [x] 新增 `npm run check:refs` 并接入 test:all 与 CI
- [x] CJK 字体安装脚本 `tools/setup-fonts.sh`
- [x] EGL10/GLES/GLSurfaceView host 与 Thread 子类 `start()`，DeviceInfoHW 可启动
- [x] 资源 Drawable 包装成 Java Drawable，修复 TabLayout `getBounds()` NPE
- [x] Button Material 默认背景与 compound padding/基线居中
- [x] LinearLayout 权重按 AOSP 递减算法
- [x] ImageView 全量 `ScaleType` 几何
- [x] ProgressBar Material 圆形/横向轨道与 indeterminate 动画
- [x] ListView divider/selector/滚动
- [x] Outline/ViewOutlineProvider 与 ambient+spot 阴影；Ripple 动画
- [x] Clip/Scale/Rotate/NinePatch/AnimatedVector Drawable host
- [x] `InsetDrawable` / `LayerDrawable` / `StateListDrawable` host 与统一 `drawDrawable` 解包
- [x] `GradientDrawable.draw()` 与 shape gradient/stroke/dash
- [x] tint 链路：View/Drawable tint、`PorterDuffColorFilter`、Canvas 消费 colorFilter
- [x] Drawable state 传递与 `ColorStateList` 按序匹配
- [x] `TextView` 字体度量行高/基线、`maxLines`+`ellipsize`、内容裁剪、compound drawable
- [x] elevation 阴影与 foreground 绘制
- [x] Canvas native 补全（circle/line/oval/arc/point/bitmap/clip/scale/saveLayer）
- [x] 新增 `tests/drawables.mjs` 像素级回归
- [x] 设备信息预置值中的品牌名统一为 `apk.js`
- [x] 移除针对具体 APK 的 LayoutParams 与 SharedPreferences 硬编码，改为通用推导
- [x] 设备信息接入 `navigator`（platform / language / hardwareConcurrency / deviceMemory / maxTouchPoints）
- [x] 修复浏览器端 `Buffer is not defined` 与 `process is not defined`
- [x] 调试脚本移入 `tests/debug/`，出图移入 `image-debug/`
- [x] 中英双语 README
- [x] VitePress 中英双语文档站
- [x] 演示页面改名为 `playground.html`，文档站设为默认入口
- [x] AGENTS.md

## 本轮新增完成

- [x] 按真实 `npTc` 的 numX/numY 读取 NinePatch div，截断块安全回退；DeviceInfoHW 诊断异常清零。
- [x] 拦截层改为 Xposed API：`XC_MethodHook`、`MethodHookParam`、`XposedBridge.hookAllMethods/hookAllConstructors/hookMethod`、`XposedHelpers.findAndHookMethod/get*Field/callMethod/newInstance`、`Unhook`；支持 VM 创建前延迟注册。
- [x] 移除 `invoke:before/after` 与 `hookResult`，`HookBus` 只保留生命周期事件（`load:*`、`start:*`、`log`、`activity:finish`）。
- [x] 打包结构重划：`apk.js` 为基础引擎（dex/axml/arsc 解析、APK 装载、VM、拦截层），`android-framework.js` 为宿主类模拟 + `ApkSimulator`，webpack 用 `dependOn` 分层。

- [x] 移除 APK 大小上限，默认 `Infinity`，文档同步。
- [x] MaterialShapeDrawable 三段阴影（ambient/key/spot）与像素回归。
- [x] AnimatedVectorDrawable trimPath 解析、路径裁剪与按时间动画。
- [x] ListView 超长列表跳转限制前缀测量并回收窗口外视图，10 万行跳转回归。
- [x] Dialog 圆角 Material 表面、阴影、三段按钮与 neutral 回调。

## 已知剩余缺口

- [x] 相机页：修复 `getSupportedPictureFormats` 裸数字导致 ClassCast，页面已显示 2 台相机（需等待后台采集或下拉刷新）。
- [ ] 应用程序页的 “System Applications” 行由应用自身 UI 生成，宿主列表只返回当前包。
- [x] 温度页数值：修复 String.format 装箱数字解箱与 double 参数解码，已显示 42/41/38/30/36/34 °C。
- [x] 电池充电速度：同一修复后显示 420.0 mA；内核配置文件/型号已补。
- [x] 电池电量/健康/状态/电压：补 `onPostResume()` 后 Fragment 恢复，显示 87% / Good / Charging / 4200 mV。
- [x] 应用程序页：补 `PackageItemInfo.loadLabel` 与 `ApplicationInfo` super 链，列表已显示。
- [x] 分区页：修正 `newArray` 元素表语义，挂载点/设备/fs/读写属性已正常。
- [x] SearchView：`TypedArray.getColorStateList` 返回 JavaObject，构造不再 ClassCast；诊断 interesting=0。
- [ ] 复现：`npm run diagnose -- /tmp/devinfo.apk`；`npm run render -- /tmp/devinfo.apk check`。
