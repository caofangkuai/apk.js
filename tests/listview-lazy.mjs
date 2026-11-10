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
