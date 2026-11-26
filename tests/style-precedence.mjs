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
import { JavaVM } from '../src/runtime/vm.js';
import { registerFrameworkNativeClasses } from '../src/framework/registry.js';

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

/*
 * 主题颜色属性的链式解引用回归。
 *
 * 真实主题里颜色属性经常是一条引用链：
 *   colorControlNormal -> ?android:attr/textColorTertiary (0x01010038)
 *   -> @color/abc_secondary_text_material_light
 * 宿主曾只解一级，把系统 attr id 当颜色值返回，取色方据此绘制的
 * 抽屉汉堡图标画笔颜色为 0（完全透明），图标整个消失。
 */
const themeVm = new JavaVM({});
registerFrameworkNativeClasses(themeVm);
const themeEntries = new Map([
  [0x7f0400b4, { key: 'color', typeName: 'attr' }],
  [0x7f0400b5, { key: 'colorPrimary', typeName: 'attr' }],
  [0x7f0400be, { key: 'colorControlNormal', typeName: 'attr' }],
  [
    0x7f060012,
    { key: 'abc_secondary_text_material_light', typeName: 'color', value: 'res/color/abc_secondary_text_material_light.xml' },
  ],
]);
const themeStyles = new Map([
  // Widget.AppCompat.DrawerArrowToggle: color = ?attr/colorControlNormal
  [0x7f120232, new Map([[0x7f0400b4, 0x7f0400be]])],
  // 样式直接引用系统 attr
  [0x7f120240, new Map([[0x7f0400b4, 0x01010038]])],
  // 普通颜色整数直接透传
  [0x7f120250, new Map([[0x7f0400b5, 0xff01946f]])],
]);
themeVm.resources = {
  table: {
    getEntry: (id) => themeEntries.get(id >>> 0) || null,
    getStyleAttributes: (id) => themeStyles.get(id >>> 0) || new Map(),
    resolve: (id) => themeEntries.get(id >>> 0)?.value ?? null,
  },
  resolve: (id) => themeEntries.get(id >>> 0)?.value ?? null,
  resolveColorValue: (id) => ((id >>> 0) === 0x7f060012 ? 0x8a000000 : null),
  getColorStateList: (id) => ((id >>> 0) === 0x7f060012
    ? { states: [[]], colors: [0x8a000000], color: 0x8a000000 }
    : null),
};
themeVm.themeAttributes = {
  colorPrimary: 0xff01946f,
  colorControlNormal: 0x01010038,
  textColorPrimary: 0xde000000,
  textColorTertiary: 'res/color/abc_secondary_text_material_light.xml',
  $attrReferences: { textColorTertiary: 0x7f060012 },
};

const contextDef = themeVm.registry.resolve('Landroid/content/Context;').nativeDef;
const obtain = contextDef.methods.get('obtainStyledAttributes(Landroid/util/AttributeSet;[III)Landroid/content/res/TypedArray;');
const colorOfStyle = (styleId, attrId) => {
  const typedArray = obtain({}, [null, [attrId], 0, styleId], themeVm);
  return typedArray.$peer.getColor(0, 0) >>> 0;
};

assert.equal(colorOfStyle(0x7f120232, 0x7f0400b4), 0x8a000000, 'colorControlNormal 应解到真实颜色');
assert.equal(colorOfStyle(0x7f120240, 0x7f0400b4), 0x8a000000, '样式里直接引用系统 attr 也要解到颜色');
assert.equal(colorOfStyle(0x7f120250, 0x7f0400b5), 0xff01946f, '普通颜色整数不能被误当 attr 解引用');
console.log('theme color chain OK');
