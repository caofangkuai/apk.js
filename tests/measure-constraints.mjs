/**
 * 测量链路回归：MATCH_PARENT 子项在 AT_MOST 下必须撑满。
 *
 * 之前 TextView.onMeasure 完全不看 layoutParams.width，AT_MOST 下一律取
 * min(desiredWidth, size)。空输入的 EditText desiredWidth 约等于 0，
 * 于是整个输入框量出 0 宽、界面上直接看不见。
 * 另外 ViewGroup 缺 generateDefaultLayoutParams 时 layoutParams 会是空，
 * 测量同样会塌成 0。
 */
import assert from 'node:assert/strict';
import { TextView } from '../src/framework/widgets.js';
import { View, ViewGroup, MeasureSpec } from '../src/framework/view.js';
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';

const AT_MOST = (size) => MeasureSpec.makeMeasureSpec(size, MeasureSpec.AT_MOST);
const EXACTLY = (size) => MeasureSpec.makeMeasureSpec(size, MeasureSpec.EXACTLY);

/* MATCH_PARENT 在 AT_MOST 下撑满 */
const matchParent = new TextView(null);
matchParent.layoutParams = { width: -1, height: -2 };
matchParent.text = '';
matchParent.measure(AT_MOST(624), AT_MOST(100));
assert.equal(matchParent.measuredWidth, 624, 'MATCH_PARENT 的 EditText 应撑满可用宽度');

/* WRAP_CONTENT 仍按内容宽度，不无脑撑满 */
const wrap = new TextView(null);
wrap.layoutParams = { width: -2, height: -2 };
wrap.text = '短';
wrap.measure(AT_MOST(624), AT_MOST(100));
assert.ok(wrap.measuredWidth < 624, `WRAP_CONTENT 不应撑满（实际 ${wrap.measuredWidth}）`);
assert.ok(wrap.measuredWidth > 0, 'WRAP_CONTENT 仍应有内容宽度');

/* EXACTLY 下两者都取给定尺寸 */
for (const width of [-1, -2]) {
  const view = new TextView(null);
  view.layoutParams = { width, height: -2 };
  view.text = '';
  view.measure(EXACTLY(300), AT_MOST(100));
  assert.equal(view.measuredWidth, 300, `EXACTLY 下 width=${width} 应取 300`);
}

/* 没有 layoutParams 时按 WRAP_CONTENT 处理，不撑满 */
const noParams = new TextView(null);
noParams.text = '短';
noParams.measure(AT_MOST(624), AT_MOST(100));
assert.ok(noParams.measuredWidth < 624, '缺少 layoutParams 时不应撑满');

/* ViewGroup.generateDefaultLayoutParams 必须存在且给出 WRAP_CONTENT */
const vmg = new JavaVM({});
registerFrameworkNativeClasses(vmg);
const group = vmg.registry.resolve('Landroid/view/ViewGroup;');
assert.ok(
  group.nativeDef.findInstanceMethod('generateDefaultLayoutParams', '()Landroid/view/ViewGroup$LayoutParams;'),
  'ViewGroup 必须实现 generateDefaultLayoutParams',
);

const container = new ViewGroup(null);
const generated = container.generateDefaultLayoutParams?.();
if (generated) {
  assert.equal(generated.width, -2, '默认 LayoutParams 宽度应为 WRAP_CONTENT');
  assert.equal(generated.height, -2, '默认 LayoutParams 高度应为 WRAP_CONTENT');
}

/* 容器持有子项时，缺少 layoutParams 也能完成测量 */
const parent = new ViewGroup(null);
const child = new View(null);
child.parent = parent;
parent.children = [child];
child.top = 0;
child.bottom = 10;
assert.doesNotThrow(() => parent.measure(AT_MOST(300), AT_MOST(300)), '缺少 layoutParams 不应抛错');

console.log('measure constraints OK', {
  matchParent: matchParent.measuredWidth,
  wrap: wrap.measuredWidth,
  exactly: 300,
});
