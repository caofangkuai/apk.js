/**
 * AppBarLayout collapse 所依赖的通用宿主能力回归。
 *
 * 该应用里没有超过一屏的滚动区，因此无法在真实 APK 上触发 collapse；
 * 这里改为验证三件事，任何一件缺失都会让 AppBar 无法跟随滚动收起：
 *   1) 嵌套滚动契约齐全（onStartNestedScroll / onNestedPreScroll ...）；
 *   2) 子视图平移（offsetTopAndBottom / offsetChildrenTopAndBottom）会重绘并
 *      把滚动量记到容器上；
 *   3) 纯宿主层面能用 offsetChildrenTopAndBottom 做出"内容上移、容器 scrollY 增加"。
 */
import assert from 'node:assert/strict';
import { View, ViewGroup } from '../src/framework/view.js';
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';

/* 1. 嵌套滚动契约 */
const vm = new JavaVM({});
registerFrameworkNativeClasses(vm);
const group = vm.registry.resolve('Landroid/view/ViewGroup;');
for (const key of [
  'onStartNestedScroll(Landroid/view/View;Landroid/view/View;I)Z',
  'onNestedScrollAccepted(Landroid/view/View;Landroid/view/View;I)V',
  'onNestedPreScroll(Landroid/view/View;II[I)V',
  'onNestedScroll(Landroid/view/View;IIIII)V',
  'onStopNestedScroll(Landroid/view/View;)V',
  'onNestedPreScroll(Landroid/view/View;II[II)V',
  'onNestedScroll(Landroid/view/View;IIIIII[I)V',
  'onNestedFling(Landroid/view/View;FFZ)Z',
  'onNestedPreFling(Landroid/view/View;FF)Z',
]) {
  const name = key.slice(0, key.indexOf('('));
  const proto = key.slice(key.indexOf('('));
  assert.ok(group.nativeDef.findInstanceMethod(name, proto), `ViewGroup 缺少 ${key}`);
}

/* 2 & 3. 平移子项 = 滚动，并且要记录到容器上 */
const container = new ViewGroup(null);
let invalidated = 0;
container.invalidate = () => { invalidated += 1; };
const rows = [new View(null), new View(null), new View(null)];
rows.forEach((row, index) => {
  row.top = index * 50;
  row.bottom = row.top + 50;
  row.parent = container;
});
container.children = rows;

assert.equal(container.scrollY, 0);
container.offsetChildrenTopAndBottom(-120);
assert.equal(container.scrollY, 120, '子项上移应记成容器滚动量');
assert.equal(rows[0].top, -120, '子项坐标应同步平移');
assert.ok(invalidated > 0, '平移子项后必须重绘');

// 往下移不会把 scrollY 压成负数
container.offsetChildrenTopAndBottom(200);
assert.equal(container.scrollY, 0, 'scrollY 不应为负');
assert.equal(rows[0].top, 80);

// 单个子项平移同样要触发重绘
invalidated = 0;
rows[0].offsetTopAndBottom(-30);
assert.equal(rows[0].top, 50);
assert.ok(invalidated > 0, 'offsetTopAndBottom 之后必须重绘');

// 位移为 0 时不做无谓工作
invalidated = 0;
rows[0].offsetTopAndBottom(0);
assert.equal(invalidated, 0, '位移为 0 不应触发重绘');

console.log('appbar collapse OK', {
  nestedScrollMethods: 9,
  scrollY: container.scrollY,
  rowTop: rows[0].top,
  redrew: true,
});
