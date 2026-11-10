# Changelog

## 2026-11-10

### Framework

- 补齐 AOSP 文本排版：真实字体测量、行距/基线/includeFontPadding、bold/italic、textScaleX/textSkewX、letterSpacing。
- 补齐 Paint 文本 API：`measureText`、`getTextBounds`、`getTextWidths`、`breakText`、`getFontMetrics/getFontSpacing`、Typeface family/style。
- 修复密度链路、View 最小尺寸、LinearLayout 权重/基线、FrameLayout MATCH_PARENT 二趟测量。
- Drawable：NinePatch npTc、GradientDrawable 渐变/圆角/描边、Ripple、StateList、Layer/Inset、tint/colorFilter。
- Canvas：Matrix、clipPath、drawTextRun、Xfermode、shader 渐变。
- ListView：大列表懒创建、逐行高度缓存、可视窗口回收。
- Dialog：Dialog/AlertDialog/ProgressDialog host，支持 getWindow、布局解析、列表/单选/多选、按钮回调。
- 主题：Material 默认色、uiMode 夜间模式、nightMode 渲染选项。
- 补齐常用 host：org.json、BatteryManager、Camera、Process、Settings.Global、BitSet、PointF、Accessibility 等。

### Widgets

- 选择类：CheckBox、RadioButton/RadioGroup、ToggleButton、Switch、SeekBar、RatingBar、Spinner、AutoCompleteTextView/MultiAutoCompleteTextView、Gallery、GridView。
- 容器类：ViewAnimator/ViewFlipper/ViewSwitcher/TextSwitcher/ImageSwitcher、AdapterViewFlipper。
- 计时/列表：Chronometer、ViewStub、Space、ImageButton、ArrayAdapter。

### 工具链

- `npm run bench:render`：启动/帧耗时基准。
- `npm run render:batch`：目录批量渲染。
- `npm run diff:image`：像素差异报告。
- `npm run docs:coverage` / `check:coverage`：Framework 覆盖矩阵与 CI 校验。
- `test:all` 现包含 coverage、zip limits、ListView lazy、Drawable 回归。

### 安全

- 所有 APK 入口统一 50MB 限制。
- 解压条目数/解压后总体积限制，防 zip bomb。
