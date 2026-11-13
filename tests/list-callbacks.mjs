/**
 * ListView 的 OnScrollListener / OnItemSelectedListener 回调链回归。
 * 之前这两个监听器只被存下来、从未触发，setSelection 也是空实现。
 */
import assert from 'node:assert/strict';
import { ListView } from '../src/framework/layouts.js';
import { MeasureSpec } from '../src/framework/view.js';
import { TextView } from '../src/framework/widgets.js';

const calls = [];
const makeVm = (count) => ({
  invokeByName(name, proto, receiver, args) {
    if (name === 'getCount') return count;
    if (name === 'getItemId') return (args?.[0] | 0) * 10;
    if (name === 'getView') {
      const view = new TextView(null);
      view.setText('row');
      return { $view: view };
    }
    calls.push({ name, args });
    return null;
  },
});

const widthSpec = MeasureSpec.makeMeasureSpec(320, MeasureSpec.EXACTLY);
const heightSpec = MeasureSpec.makeMeasureSpec(480, MeasureSpec.EXACTLY);

function buildList(count) {
  const list = new ListView(null);
  list.$vm = makeVm(count);
  list.adapter = {};
  list.onMeasure(widthSpec, heightSpec);
  list.layout(0, 0, 320, 480);
  return list;
}

/* ---------------- 滚动回调 ---------------- */
const list = buildList(500);
assert.ok(list.$lazy, '大列表应进入懒模式');

const scrollEvents = [];
const stateEvents = [];
list.$onScrollListener = { $onScroll: true };
const originalInvoke = list.$vm.invokeByName;
list.$vm.invokeByName = function (name, proto, receiver, args) {
  if (name === 'onScroll') scrollEvents.push(args.slice());
  if (name === 'onScrollStateChanged') stateEvents.push(args.slice());
  return originalInvoke.call(this, name, proto, receiver, args);
};

list.scrollTo(0, 1200);
assert.equal(list.scrollY, 1200, 'scrollTo 应更新滚动位置');
assert.equal(scrollEvents.length, 1, '滚动后应触发 onScroll');
assert.ok(scrollEvents[0][1] > 0, `firstVisibleItem 应随滚动前进，实际 ${scrollEvents[0][1]}`);
assert.ok(scrollEvents[0][2] >= 1, 'visibleItemCount 至少为 1');
assert.equal(scrollEvents[0][3], 500, 'totalItemCount 应为条目总数');

// 位置没变时不重复通知
list.scrollTo(0, 1200);
assert.equal(scrollEvents.length, 1, '位置未变化不应重复触发 onScroll');

// 越界钳制
list.scrollTo(0, 10 ** 9);
assert.ok(list.scrollY <= list.scrollRange, '滚动位置应被钳制在内容范围内');

/* ---------------- 滚动状态 ---------------- */
list.setScrollState(1);
assert.equal(stateEvents.length, 1, '拖动开始应触发 onScrollStateChanged');
assert.equal(stateEvents[0][1], 1, '状态应为 TOUCH_SCROLL(1)');
list.setScrollState(1);
assert.equal(stateEvents.length, 1, '相同状态不应重复通知');
list.setScrollState(0);
assert.equal(stateEvents.length, 2, '拖动结束应触发 onScrollStateChanged');
assert.equal(stateEvents[1][1], 0, '状态应为 IDLE(0)');

/* ---------------- 选中回调 ---------------- */
const selectedEvents = [];
list.$onItemSelectedListener = { $onItemSelected: true };
const invoke2 = list.$vm.invokeByName;
list.$vm.invokeByName = function (name, proto, receiver, args) {
  if (name === 'onItemSelected') selectedEvents.push(args.slice());
  return invoke2.call(this, name, proto, receiver, args);
};

list.setSelection(7);
assert.equal(list.$selectedPosition, 7, 'setSelection 应记住选中位置');
assert.equal(selectedEvents.length, 1, 'setSelection 应触发 onItemSelected');
assert.equal(selectedEvents[0][2], 7, '回调应带选中位置');
assert.equal(selectedEvents[0][3], 70, '回调应带 getItemId 的结果');

// 越界位置忽略
list.setSelection(999);
assert.equal(list.$selectedPosition, 7, '越界位置不应改变选中项');

// 非懒模式（小列表）
const small = buildList(3);
small.adapter = {};
small.$vm.invokeByName = makeVm(3).invokeByName;
small.onMeasure(widthSpec, heightSpec);
small.layout(0, 0, 320, 480);
small.$items = [new TextView(null), new TextView(null), new TextView(null)];
small.$items.forEach((item, index) => {
  item.layout(0, index * 100, 320, index * 100 + 100);
});
small.setSelection(2);
assert.equal(small.$selectedPosition, 2, '小列表也应支持 setSelection');
assert.equal(small.scrollY, Math.min(small.scrollRange, 200), '小列表应把目标项滚到可见位置（受内容范围钳制）');

console.log('list callbacks OK', {
  scrollEvents: scrollEvents.length,
  stateEvents: stateEvents.length,
  selected: 7,
});
