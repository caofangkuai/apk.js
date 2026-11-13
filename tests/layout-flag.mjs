/**
 * requestLayout / isLayoutRequested / layout 的 AOSP 语义回归。
 * 之前 $layoutRequested 只被读、从未被写，isLayoutRequested() 恒为 false。
 */
import assert from 'node:assert/strict';
import { View } from '../src/framework/view.js';

const root = new View(null);
const child = new View(null);
child.parent = root;
root.children = [child];

assert.equal(root.isLayoutRequested(), false, '初始状态不应有布局请求');
assert.equal(child.isLayoutRequested(), false, '子视图初始状态不应有布局请求');

child.requestLayout();
assert.equal(child.isLayoutRequested(), true, 'requestLayout 之后自身应标记为待布局');
assert.equal(root.isLayoutRequested(), true, 'requestLayout 应沿父链一路标记到根');

child.layout(0, 0, 100, 50);
assert.equal(child.isLayoutRequested(), false, 'layout 完成后自身标记应清除');
assert.equal(root.isLayoutRequested(), true, '父容器在自身 layout 之前仍应处于请求状态');

root.layout(0, 0, 200, 100);
assert.equal(root.isLayoutRequested(), false, '根 layout 完成后标记应清除');

// requestLayout 只向上传播，不主动标记子视图
const outer2 = new View(null);
const inner2 = new View(null);
inner2.parent = outer2;
outer2.children = [inner2];
outer2.requestLayout();
assert.equal(outer2.isLayoutRequested(), true);
assert.equal(inner2.isLayoutRequested(), false, 'requestLayout 不应向下标记子视图');

// 递归清理
const outer = new View(null);
const inner = new View(null);
inner.parent = outer;
outer.children = [inner];
inner.requestLayout();
assert.equal(inner.isLayoutRequested(), true);
assert.equal(outer.isLayoutRequested(), true, '子视图请求应冒泡到父容器');
outer.clearLayoutRequested();
assert.equal(outer.isLayoutRequested(), false);
assert.equal(inner.isLayoutRequested(), false, 'clearLayoutRequested 应递归清理子树');

console.log('layout flag OK', { chainMarked: true, clearedAfterLayout: true, recursion: true });
