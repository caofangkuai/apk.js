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

### Framework

- [ ] `PopupWindow`、`AlertDialog` 的布局与绘制
- [ ] `TextInputLayout` 的浮动标签动画
- [ ] `BottomSheetDialog` 的拖拽行为
- [ ] `ViewPager2` 与 `ViewPager` 的滚动惯性对齐
- [ ] `Spinner`、`AutoCompleteTextView` 的下拉列表
- [ ] 深色主题（`AppCompatDelegate.setDefaultNightMode`）

### 工具链

- [ ] `tests/debug/` 下约 400 个历史脚本，保留与清理分开处理
- [ ] 增加 CI 配置，跑 `build` + `test:all` + `site`
- [ ] `render-apk.mjs` 支持批量目录与基准图对比
- [ ] 出图增加像素差异报告

### 文档

- [ ] 补一份「Framework 覆盖矩阵」文档，逐类列出支持的方法
- [ ] 文档站接入搜索（`vitepress-plugin-search` 或本地索引）
- [ ] 增加录屏式 GIF 演示，放进 README

### 站点

- [ ] `site/` 产物是否需要提交，还是由 CI 构建
- [ ] 自定义域名与部署流程

## 已完成

- [x] 设备信息预置值中的品牌名统一为 `apk.js`
- [x] 移除针对具体 APK 的 LayoutParams 与 SharedPreferences 硬编码，改为通用推导
- [x] 设备信息接入 `navigator`（platform / language / hardwareConcurrency / deviceMemory / maxTouchPoints）
- [x] 修复浏览器端 `Buffer is not defined` 与 `process is not defined`
- [x] 调试脚本移入 `tests/debug/`，出图移入 `image-debug/`
- [x] 中英双语 README
- [x] VitePress 中英双语文档站
- [x] 演示页面改名为 `playground.html`，文档站设为默认入口
- [x] AGENTS.md
