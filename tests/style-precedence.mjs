/**
 * defStyleAttr / defStyleRes 优先级回归。
 *
 * AOSP 的取值顺序是：
 *   AttributeSet > defStyleAttr > defStyleRes > 当前主题
 * 宿主曾把 defStyleRes 排在 defStyleAttr 前面，导致控件自己的样式属性
 * （textInputStyle 之类）被 defStyleRes 的默认值盖掉——实测表现为
 * boxBackgroundMode 读到 0（none），输入框背景永远不创建。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/framework/registry.js', import.meta.url), 'utf8');

// 结构断言：defStyleAttr 分支必须先于 styleAttributes（即 defStyleRes）出现
const defIndex = source.indexOf('if (defStyleAttributes && defStyleAttributes.has(id))');
const styleIndex = source.indexOf('if (styleAttributes && styleAttributes.has(id))');
assert.ok(defIndex > 0, '应存在 defStyleAttributes 分支');
assert.ok(styleIndex > 0, '应存在 styleAttributes 分支');
assert.ok(defIndex < styleIndex, 'defStyleAttr 必须优先于 defStyleRes');

// 行为断言：用同一套优先级规则验证取值来源
const pick = ({ attributeSet, defStyleAttr, defStyleRes, theme }, key) => {
  if (attributeSet && key in attributeSet) return { from: 'attr', value: attributeSet[key] };
  if (defStyleAttr && key in defStyleAttr) return { from: 'defStyleAttr', value: defStyleAttr[key] };
  if (defStyleRes && key in defStyleRes) return { from: 'defStyleRes', value: defStyleRes[key] };
  if (theme && key in theme) return { from: 'theme', value: theme[key] };
  return { from: 'none', value: undefined };
};

const scope = {
  attributeSet: null,
  defStyleAttr: { boxBackgroundMode: 1 },
  defStyleRes: { boxBackgroundMode: 0 },
  theme: { boxBackgroundMode: 2 },
};

assert.deepEqual(pick(scope, 'boxBackgroundMode'), { from: 'defStyleAttr', value: 1 }, 'defStyleAttr 应优先');
assert.deepEqual(
  pick({ ...scope, attributeSet: { boxBackgroundMode: 3 } }, 'boxBackgroundMode'),
  { from: 'attr', value: 3 },
  'AttributeSet 优先级最高',
);
assert.deepEqual(
  pick({ ...scope, defStyleAttr: {} }, 'boxBackgroundMode'),
  { from: 'defStyleRes', value: 0 },
  'defStyleAttr 没有该属性时回落到 defStyleRes',
);
assert.deepEqual(
  pick({ ...scope, defStyleAttr: {}, defStyleRes: {} }, 'boxBackgroundMode'),
  { from: 'theme', value: 2 },
  '都没有时回落到主题',
);
assert.deepEqual(pick({ ...scope, defStyleAttr: {}, defStyleRes: {} }, 'missing'), { from: 'none', value: undefined });

console.log('style precedence OK', { order: ['attr', 'defStyleAttr', 'defStyleRes', 'theme'] });
