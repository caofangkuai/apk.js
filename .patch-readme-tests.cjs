const fs = require('fs');

function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [oldText, newText] of pairs) {
    if (!s.includes(oldText)) throw new Error(file + ' 未找到片段: ' + JSON.stringify(oldText.slice(0, 60)));
    s = s.replace(oldText, newText);
  }
  fs.writeFileSync(file, s);
  console.log('patched', file);
}

const enTestsOld = [
  '```bash',
  '# Full regression: load the sample APK and simulate taps',
  'npm test',
  '',
  '# Verify the APK parse result',
  'npm run check',
  '',
  '# All of the above',
  'npm run diagnose -- /path/to/app.apk',
  'npm run test:ui',
  'npm run test:all',
  '```'
].join('\n');

const enTestsNew = [
  '```bash',
  '# Full regression: load the sample APK and simulate taps',
  'npm test',
  '',
  '# Verify the APK parse result',
  'npm run check',
  '',
  '# Everything, including the framework regressions below',
  'npm run test:all',
  '```',
  '',
  'Framework behaviours each have a focused regression you can run on its own:',
  '',
  '| Command | Covers |',
  '| --- | --- |',
  '| `npm run test:recyclerview` | Nested-scroll contract and scrolling through real touch dispatch |',
  '| `npm run test:appbar` | Sub-view offsets feed container scroll position |',
  '| `npm run test:elevation-overlay` | Material elevation overlay in dark themes |',
  '| `npm run test:dialog-theme` | Dialog colours resolved from the theme |',
  '| `npm run test:progress-animation` | ProgressBar visual progress interpolation |',
  '| `npm run test:list-choices` | `CHOICE_MODE` selection sets |',
  '| `npm run test:layout-flag` | `requestLayout` / `isLayoutRequested` semantics |',
  '| `npm run test:list-callbacks` | Scroll and selection listener dispatch |'
].join('\n');

const enIssuesOld = [
  '- Some large third-party apps still fail during `onStart` because the framework coverage is incomplete.',
  '- Debug switches (`DBG_INV`, `DBG_CAST`, `CAS_DBG`, `FV_DBG`) are replaced with `false` at build time.',
  '- `tests/debug/` contains roughly 400 ad-hoc scripts from development. They are kept for reference and will be pruned.'
].join('\n');

const enIssuesNew = [
  '- Some large third-party apps still fail during `onStart` because the framework coverage is incomplete.',
  '- Debug switches (`DBG_INV`, `DBG_CAST`, `CAS_DBG`, `FV_DBG`) are replaced with `false` at build time.',
  '- The elevation overlay only covers the built-in dark theme; an app-provided overlay colour is not honoured yet.',
  '- `AppBarLayout` collapse and `TextInputLayout` floating labels run entirely from the APK DEX. The reference APK has no scrollable region and no `TextInputLayout`, so those two paths have no pixel-level regression yet.',
  '- `tests/debug/` contains roughly 400 ad-hoc scripts from development. They are kept for reference and will be pruned.'
].join('\n');

patch('README.md', [
  [enTestsOld, enTestsNew],
  [enIssuesOld, enIssuesNew],
]);

const zhTestsOld = [
  '```bash',
  '# 完整回归：加载示例 APK 并模拟点击',
  'npm test',
  '',
  '# 校验 APK 解析结果',
  'npm run check',
  '',
  '# 一次跑完上面两项',
  'npm run diagnose -- /path/to/app.apk',
  'npm run test:ui',
  'npm run test:all',
  '```'
].join('\n');

const zhTestsNew = [
  '```bash',
  '# 完整回归：加载示例 APK 并模拟点击',
  'npm test',
  '',
  '# 校验 APK 解析结果',
  'npm run check',
  '',
  '# 全部回归（含下面这些 Framework 专项）',
  'npm run test:all',
  '```',
  '',
  'Framework 的每项行为都有一个可单独运行的专项回归：',
  '',
  '| 命令 | 覆盖内容 |',
  '| --- | --- |',
  '| `npm run test:recyclerview` | 嵌套滚动契约与走真实触摸分发的滚动 |',
  '| `npm run test:appbar` | 子项平移计入容器滚动量 |',
  '| `npm run test:elevation-overlay` | 暗色主题下的 Material elevation overlay |',
  '| `npm run test:dialog-theme` | Dialog 配色从主题解析 |',
  '| `npm run test:progress-animation` | ProgressBar 的 VisualProgress 插值 |',
  '| `npm run test:list-choices` | `CHOICE_MODE` 选中集合 |',
  '| `npm run test:layout-flag` | `requestLayout` / `isLayoutRequested` 语义 |',
  '| `npm run test:list-callbacks` | 滚动与选中监听器派发 |'
].join('\n');

patch('README.zh-CN.md', [
  [zhTestsOld, zhTestsNew],
]);

let zh = fs.readFileSync('README.zh-CN.md', 'utf8');
const zhIssuesOld = '- `tests/debug/` 里的脚本是开发期留下的探索性探针，不属于回归测试。';
const zhIssuesNew = [
  '- elevation overlay 目前只覆盖内置暗色主题；应用自定义的 overlay 颜色尚未支持。',
  '- `AppBarLayout` collapse 与 `TextInputLayout` 浮动标签完全由 APK 的 DEX 驱动。参考 APK 里没有可滚动区域、也没有 `TextInputLayout`，这两条路径**仍缺像素级回归**。',
  '- `tests/debug/` 里的脚本是开发期留下的探索性探针，不属于回归测试。'
].join('\n');
if (!zh.includes(zhIssuesOld)) throw new Error('zh issues anchor missing');
zh = zh.replace(zhIssuesOld, zhIssuesNew);
fs.writeFileSync('README.zh-CN.md', zh);
console.log('patched README.zh-CN.md issues');
