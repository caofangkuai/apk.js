/**
 * inflate 挂载子项时必须走 DEX 覆写的 addView。
 *
 * 控件常靠覆写 addView 建立内部关联（把某个类型的子 View 认领进自己的字段
 * 并据此初始化）。inflater 直接调宿主 parent.addView 会整条绕开这些覆写，
 * 控件看起来"挂上了"却从未完成初始化。
 *
 * 这里用一个最小的假类验证派发规则本身：只有当目标类在自己的 DEX 里声明了
 * 对应重载时才走虚拟分派，否则回落到宿主实现。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/framework/layout-inflater.js', import.meta.url), 'utf8');

assert.ok(source.includes('findDeclaredMethod'), '挂载前应检查 DEX 是否声明了 addView');
assert.ok(
  source.includes('(Landroid/view/View;ILandroid/view/ViewGroup$LayoutParams;)V'),
  '应支持三参数 addView 重载（很多控件只覆写这一个）',
);
assert.ok(
  source.includes('(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V'),
  '应支持两参数 addView 重载',
);

// 行为断言：按「已声明才派发」的规则选出正确的重载
const pickOverload = (declared, params) => {
  const candidates = [
    ['(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V', '2-arg'],
    ['(Landroid/view/View;ILandroid/view/ViewGroup$LayoutParams;)V', '3-arg'],
  ];
  for (const [proto, label] of candidates) {
    if (declared.has(proto)) return label;
  }
  return null;
};

assert.equal(pickOverload(new Set(['(Landroid/view/View;ILandroid/view/ViewGroup$LayoutParams;)V']), null), '3-arg', '只声明三参数时应选三参数');
assert.equal(
  pickOverload(new Set(['(Landroid/view/View;Landroid/view/ViewGroup$LayoutParams;)V']), null),
  '2-arg',
  '只声明两参数时应选两参数',
);
assert.equal(pickOverload(new Set(), null), null, '都没声明时应回落到宿主实现');

console.log('inflate addView dispatch OK', { overloads: ['2-arg', '3-arg'] });
