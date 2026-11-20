/**
 * Material elevation overlay 回归。
 *
 * 暗色主题下，表面色应随 elevation 提高叠加一层白色；浅色主题与无背景视图不变。
 * 之前完全没有实现，高层视图（卡片、对话框、AppBar）在暗色下与底层同色。
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { View } from '../src/framework/view.js';
import { Canvas } from '../src/framework/graphics.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require('canvas');

const hex = (color) => '#' + (color >>> 0).toString(16).padStart(8, '0');

const darkVm = { themeAttributes: { colorSurface: 0xff121212, isLightTheme: false }, resources: {} };
const lightVm = { themeAttributes: { colorSurface: 0xffffffff, isLightTheme: true }, resources: {} };

const darkView = new View(null);
darkView.$vm = darkVm;
const lightView = new View(null);
lightView.$vm = lightVm;

/* ---------------- 计算层 ---------------- */
assert.equal(hex(darkView.elevationOverlayColor(0xff121212, 0)), '#ff121212', 'elevation 为 0 时不叠加');
const levels = [2, 4, 6, 8].map((z) => darkView.elevationOverlayColor(0xff121212, z) >>> 0);
for (let i = 1; i < levels.length; i += 1) {
  assert.ok(levels[i] > levels[i - 1], `elevation 越高应越亮（第 ${i} 档）`);
}
assert.notEqual(levels[0], 0xff121212, '有 elevation 时必须发生变化');
assert.equal(darkView.elevationOverlayColor(0xff121212, -3), 0xff121212, '负 elevation 不叠加');
assert.equal(
  hex(lightView.elevationOverlayColor(0xffffffff, 8)),
  '#ffffffff',
  '浅色主题不叠加'
);

/* ---------------- 主题自定义叠层色 ---------------- */
const makeView = (themeAttributes, resources = {}) => {
  const view = new View(null);
  view.$vm = { themeAttributes, resources };
  return view;
};

const customDark = makeView({ colorSurface: 0xff121212, isLightTheme: false, elevationOverlayColor: 0xffff0000 });
const customDarkColor = customDark.elevationOverlayColor(0xff121212, 8) >>> 0;
assert.ok(((customDarkColor >>> 16) & 0xff) > 0x12, '自定义暖色应把背景推向红色');
assert.ok((customDarkColor & 0xff) < 0x12, '自定义暖色应压低蓝色通道');

const customLight = makeView({ isLightTheme: true, elevationOverlayEnabled: true, elevationOverlayColor: 0xff000000 });
const customLightColor = customLight.elevationOverlayColor(0xffffffff, 8) >>> 0;
assert.ok((customLightColor & 0xff) < 0xff, '浅色主题显式启用叠层时应叠加自定义色');

const disabledDark = makeView({ isLightTheme: false, elevationOverlayEnabled: false });
assert.equal(hex(disabledDark.elevationOverlayColor(0xff121212, 8)), '#ff121212', '关闭叠层后不应变化');

const transparentLight = makeView({ isLightTheme: true, elevationOverlayEnabled: true, elevationOverlayColor: 0x00000000 });
assert.equal(hex(transparentLight.elevationOverlayColor(0xffffffff, 8)), '#ffffffff', '透明叠层色等同不叠加');

const referenced = makeView(
  {
    isLightTheme: false,
    $attrReferences: { elevationOverlayColor: 0x7f010001 },
  },
  { resolve: (id) => (id === 0x7f010001 ? 0xff00ff00 : null) }
);
assert.ok(((referenced.elevationOverlayColor(0xff121212, 8) >>> 8) & 0xff) > 0x12, '叠层色支持资源引用解析');

/* ---------------- 像素层 ---------------- */
const render = (view, { background, elevation }) => {
  const surface = createCanvas(40, 40);
  const ctx = surface.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 40, 40);
  view.left = 0;
  view.top = 0;
  view.right = 40;
  view.bottom = 40;
  view.background = background;
  view.elevation = elevation;
  view.drawBackground(new Canvas(ctx, 40, 40));
  return ctx.getImageData(20, 20, 1, 1).data[0];
};

const flat = render(darkView, { background: { type: 'color', color: 0xff121212 }, elevation: 0 });
const raised = render(darkView, { background: { type: 'color', color: 0xff121212 }, elevation: 8 });
assert.ok(raised > flat, `暗色下 elevation=8 的表面应变亮（${flat} → ${raised}）`);

const lightFlat = render(lightView, { background: { type: 'color', color: 0xffffffff }, elevation: 0 });
const lightRaised = render(lightView, { background: { type: 'color', color: 0xffffffff }, elevation: 8 });
assert.equal(lightRaised, lightFlat, '浅色主题的表面色不应改变');

const tintedSurface = render(customLight, { background: { type: 'color', color: 0xffffffff }, elevation: 8 });
assert.ok(tintedSurface < 255, `自定义叠层色应作用到实际绘制（红色通道 ${tintedSurface}）`);

console.log('elevation overlay OK', { flat, raised, lightFlat, lightRaised });
