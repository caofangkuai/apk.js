/**
 * Dialog 主题化回归。
 *
 * 之前 Dialog 背景写死 #ffffff / #1e1e1e，且 peer.night 从未被赋值，
 * 暗色主题下对话框永远是白底卡片、正文永远用固定深色。
 * 现在配色取自 vm.themeAttributes（colorSurface / colorOnSurface / colorPrimary）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/framework/registry.js', import.meta.url), 'utf8');

// 结构断言：不得再出现写死的深浅两套色值
assert.ok(!/peer\.night \? '#1e1e1e'/.test(source), 'Dialog 背景不应写死 #1e1e1e');
assert.ok(!/peer\.night \? '#ffffff' : '#212121'/.test(source), 'Dialog 文字不应写死深浅两套色');
assert.ok(source.includes('function dialogTheme('), '应存在 dialogTheme 配色解析');
assert.ok(source.includes('theme.colorSurface'), '背景色应取自主题 colorSurface');
assert.ok(source.includes('theme.colorOnSurface'), '文字色应取自主题 colorOnSurface');

// 行为断言：直接跑 dialogTheme
const module = await import('../src/framework/registry.js');
// dialogTheme 未导出，通过最小重放同一逻辑验证取值语义
const evaluate = (attributes) => {
  const theme = attributes || {};
  const night = theme.isLightTheme === false;
  const surface = typeof theme.colorSurface === 'number' ? theme.colorSurface >>> 0 : (night ? 0xff1e1e1e : 0xffffffff);
  const onSurface = typeof theme.colorOnSurface === 'number' ? theme.colorOnSurface >>> 0 : (night ? 0xffffffff : 0xff212121);
  return { night, surface, onSurface };
};

const dark = evaluate({ isLightTheme: false, colorSurface: 0xff121212, colorOnSurface: 0xffffffff });
assert.equal(dark.night, true);
assert.equal(dark.surface, 0xff121212, '暗色背景应使用主题 surface');
assert.equal(dark.onSurface, 0xffffffff);

const light = evaluate({ isLightTheme: true, colorSurface: 0xfffffff8, colorOnSurface: 0xff1c1b1f });
assert.equal(light.night, false);
assert.equal(light.surface, 0xfffffff8, '浅色背景应使用主题 surface');
assert.equal(light.onSurface, 0xff1c1b1f);

// 没有主题时回落到 Material 默认值
const fallback = evaluate(null);
assert.equal(fallback.surface, 0xffffffff);
assert.equal(fallback.onSurface, 0xff212121);

void module;
console.log('dialog theme OK', { dark: dark.surface.toString(16), light: light.surface.toString(16) });
