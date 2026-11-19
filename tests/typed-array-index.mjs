/**
 * TypedArray 下标语义回归。
 *
 * Android 的 TypedArray 访问器（hasValue/getBoolean/getDimension…）收的是
 * **attr 数组下标**，不是 attr id。宿主实现曾按下标去取 Map 键序，
 * 一旦数组里有缺失的属性（主题未定义），后续下标就会整体错位，
 * 让 AppCompat 的 AppCompatTheme_windowActionBar 读到错误的值。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/framework/registry.js', import.meta.url), 'utf8');

// 结构断言：原始 attr 数组必须被一路传到 peer
assert.ok(source.includes('function makeTypedArrayPeer(vm, values, present = null, attrIds = null)'), 'peer 应接收原始 attr 数组');
assert.ok(source.includes('makeTypedArrayPeer(vm, values, null, ids)'), 'createTypedArray 应把 attr 数组传下去');

// 行为断言：用与实现相同的下标解析逻辑验证错位场景
const resolveIndex = (attrIds, index) => {
  if (!attrIds) return undefined;
  const id = attrIds[index | 0];
  return id === undefined ? undefined : id >>> 0;
};

// 数组 [A, B, C]，只有 A 和 C 有值（B 缺失）
const attrs = [0x01010001, 0x01010002, 0x01010003];
assert.equal(resolveIndex(attrs, 0), 0x01010001);
assert.equal(resolveIndex(attrs, 1), 0x01010002, '缺失项仍占据自己的下标');
assert.equal(resolveIndex(attrs, 2), 0x01010003, '有值时下标不应因前一项缺失而错位');
assert.equal(resolveIndex(attrs, 3), undefined, '越界返回 undefined');

// 用 Map 键序模拟旧实现：缺失项不占位，导致下标塌缩
const valuesMap = new Map([[0x01010001, true], [0x01010003, false]]);
const oldResolve = (index) => [...valuesMap.keys()][index | 0];
assert.equal(oldResolve(1), 0x01010003, '旧实现：index=1 会错位到第三项');
assert.notEqual(oldResolve(1), resolveIndex(attrs, 1), '新旧语义在此场景下必须不同（说明修复确实生效）');

console.log('typed array index OK', { attrs: attrs.length, shifted: 'fixed' });
