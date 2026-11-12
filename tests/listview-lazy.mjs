import assert from 'node:assert/strict';
import { ListView } from '../src/framework/layouts.js';
import { MeasureSpec } from '../src/framework/view.js';
import { TextView } from '../src/framework/widgets.js';

const list = new ListView(null);
list.$vm = {
  invokeByName(name) {
    if (name === 'getCount') return 500;
    if (name === 'getView') {
      const view = new TextView(null);
      view.setText('row');
      return { $view: view };
    }
    return null;
  },
};
list.adapter = {};
const widthSpec = MeasureSpec.makeMeasureSpec(320, MeasureSpec.EXACTLY);
const heightSpec = MeasureSpec.makeMeasureSpec(480, MeasureSpec.EXACTLY);
list.onMeasure(widthSpec, heightSpec);
assert.equal(list.$itemCount, 500, '应识别 500 行');
assert.ok(list.children.length < 60, `懒窗口子视图应很少，实际 ${list.children.length}`);
assert.ok(list.$lazy, '大列表应进入懒模式');
list.onLayout(true, 0, 0, 320, 480);
list.scrollTo(0, 5000);
list.onLayout(true, 0, 0, 320, 480);
assert.ok(list.children.length > 0, '滚动后仍应有可视行');
assert.ok(list.children.every((view) => view.top >= 4000), '窗口应移动到滚动位置附近');
console.log('listview lazy OK', { children: list.children.length, itemCount: list.$itemCount });

const variable = new ListView(null);
variable.$vm = {
  invokeByName(name, _proto, adapter, args) {
    if (name === 'getCount') return 400;
    if (name === 'getView') {
      const index = args?.[0] | 0;
      const height = 20 + (index % 4) * 10;
      const view = {
        top: 0, bottom: 0, parent: variable, visibility: 0,
        measure() { this.height = height; },
        layout(_l, top, _r, _b) { this.top = top; this.bottom = top + height; },
        getMeasuredHeight() { return height; },
        getMeasuredWidth() { return 300; },
      };
      return { $view: view };
    }
    return null;
  },
};
variable.adapter = {};
variable.onMeasure(MeasureSpec.makeMeasureSpec(320, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(480, MeasureSpec.EXACTLY));
variable.onLayout(true, 0, 0, 320, 480);
variable.scrollTo(0, 1200);
variable.onLayout(true, 0, 0, 320, 480);
const tops = variable.children.map((view) => view.top).sort((a, b) => a - b);
for (let i = 1; i < tops.length; i++) assert.ok(tops[i] >= tops[i - 1] + 20, '异形行不应重叠');
assert.ok(tops[0] > 0, '滚动后应有可视行');
console.log('listview variable heights OK', { children: variable.children.length, firstTop: tops[0] });

const grid = new ListView(null);
grid.numColumns = 2;
grid.$vm = {
  invokeByName(name, _proto, adapter, args) {
    if (name === 'getCount') return 4;
    if (name === 'getView') {
      const index = args?.[0] | 0;
      const height = 20;
      return { $view: {
        top: 0, bottom: 0, left: 0, right: 0, parent: grid, visibility: 0,
        measure(_w, _h) { this.height = height; },
        layout(left, top, right, bottom) { this.left = left; this.top = top; this.right = right; this.bottom = bottom; },
        getMeasuredHeight() { return height; },
        getMeasuredWidth() { return 160; },
      } };
    }
    return null;
  },
};
grid.adapter = {};
grid.onMeasure(MeasureSpec.makeMeasureSpec(320, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(480, MeasureSpec.EXACTLY));
grid.onLayout(true, 0, 0, 320, 480);
const gridItems = grid.$items.filter((item) => item && item.bottom > item.top);
assert.ok(gridItems.length >= 4, '网格应布局 4 项');
assert.equal(gridItems[1].top, gridItems[0].top, '同一行 top 应一致');
assert.ok(gridItems[1].left > gridItems[0].left, '第二列应在右侧');
console.log('gridview OK', { items: gridItems.length, rowTop: gridItems[0].top, secondLeft: gridItems[1].left });

const huge = new ListView(null);
let hugeCalls = 0;
huge.$vm = {
  invokeByName(name) {
    if (name === 'getCount') return 100000;
    if (name === 'getView') {
      hugeCalls += 1;
      const view = new TextView(null);
      view.setText('row');
      return { $view: view };
    }
    return null;
  },
};
huge.adapter = {};
huge.onMeasure(MeasureSpec.makeMeasureSpec(320, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(480, MeasureSpec.EXACTLY));
huge.scrollTo(0, 900000);
huge.onLayout(true, 0, 0, 320, 480);
assert.ok(hugeCalls < 600, '超长列表跳转不应全量测量，实际 ' + hugeCalls);
assert.ok(huge.children.length < 80, '超长列表窗口应保持少量子视图');
assert.ok(huge.$lazyViews.size < 120, '超长列表应回收窗口外视图');
console.log('listview huge jump OK', { calls: hugeCalls, children: huge.children.length, cached: huge.$lazyViews.size });
