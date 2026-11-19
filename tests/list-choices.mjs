/**
 * ListView / GridView 的 CHOICE_MODE 回归。
 *
 * 之前 clearChoices / setItemChecked / isItemChecked / getCheckedItemPosition
 * 在 host 里完全不存在，应用调用只会得到「未绑定方法」。
 */
import assert from 'node:assert/strict';
import { ListView } from '../src/framework/layouts.js';
import { MeasureSpec } from '../src/framework/view.js';
import { TextView } from '../src/framework/widgets.js';

const vm = {
  invokeByName(name) {
    if (name === 'getCount') return 5;
    if (name === 'getItemId') return 100;
    if (name === 'getView') return { $view: new TextView(null) };
    return null;
  },
};
const makeList = () => {
  const list = new ListView(null);
  list.$vm = vm;
  list.adapter = {};
  list.onMeasure(MeasureSpec.makeMeasureSpec(320, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(480, MeasureSpec.EXACTLY));
  list.layout(0, 0, 320, 480);
  return list;
};

/* CHOICE_MODE_NONE：忽略选中请求 */
const none = makeList();
none.choiceMode = 0;
none.setItemChecked(2, true);
assert.equal(none.isItemChecked(2), false, 'CHOICE_MODE_NONE 下不应记录选中');
assert.equal(none.getCheckedItemCount(), 0);

/* CHOICE_MODE_SINGLE：互斥 */
const single = makeList();
single.choiceMode = 1;
single.setItemChecked(2, true);
assert.equal(single.isItemChecked(2), true);
assert.equal(single.getCheckedItemPosition(), 2);
single.setItemChecked(4, true);
assert.equal(single.isItemChecked(2), false, 'SINGLE 模式应互斥');
assert.equal(single.isItemChecked(4), true);
assert.equal(single.getCheckedItemCount(), 1);
single.setItemChecked(4, false);
assert.equal(single.getCheckedItemCount(), 0);
assert.equal(single.getCheckedItemPosition(), -1, '没有选中项时为 -1');

/* CHOICE_MODE_MULTIPLE：累加 */
const multi = makeList();
multi.choiceMode = 2;
multi.setItemChecked(1, true);
multi.setItemChecked(3, true);
assert.equal(multi.getCheckedItemCount(), 2);
assert.equal(multi.isItemChecked(1), true);
assert.equal(multi.isItemChecked(3), true);
assert.equal(multi.getCheckedItemPosition(), -1, 'MULTIPLE 模式没有单一位置');
multi.setItemChecked(1, false);
assert.equal(multi.getCheckedItemCount(), 1);

/* clearChoices */
multi.clearChoices();
assert.equal(multi.getCheckedItemCount(), 0, 'clearChoices 应清空全部');
assert.equal(multi.isItemChecked(3), false);

/* 点击在 MULTIPLE 模式下切换选中 */
const clickable = makeList();
clickable.choiceMode = 2;
clickable.performItemClick(2);
assert.equal(clickable.isItemChecked(2), true, '点击应勾选');
clickable.performItemClick(2);
assert.equal(clickable.isItemChecked(2), false, '再次点击应取消');

/* 负索引忽略 */
const negative = makeList();
negative.choiceMode = 1;
negative.setItemChecked(-1, true);
assert.equal(negative.getCheckedItemCount(), 0);

console.log('list choices OK', {
  single: single.getCheckedItemCount(),
  multiAfterClear: multi.getCheckedItemCount(),
  clickToggle: true,
});
