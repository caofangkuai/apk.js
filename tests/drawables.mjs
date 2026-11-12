import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { createCanvas } = require('canvas');

import { loadApkFiles, EmulatorEngine } from '../src/framework/engine.js';
import { drawDrawable, outlineRadius } from '../src/framework/drawables.js';
import { MeasureSpec } from '../src/framework/view.js';
import { parseParameterDescriptors } from '../src/runtime/vm.js';
import { numberToFloatBits } from '../src/runtime/values.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const stubContext = new Proxy(
  {
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    rect() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    clip() {},
    fillText() {},
    drawImage() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    measureText() {
      return { width: 8 };
    },
    setLineDash() {},
  },
  {
    get(target, prop) {
      return prop in target ? target[prop] : undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  },
);

const zip = await JSZip.loadAsync(fs.readFileSync(process.argv[2] || './samples/hello-dex.apk'));
const engine = new EmulatorEngine({ onLog() {}, width: 360, height: 640 });
engine.attachCanvas({
  clientWidth: 360,
  clientHeight: 640,
  width: 360,
  height: 640,
  style: {},
  getContext: () => stubContext,
  addEventListener() {},
  removeEventListener() {},
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 360, height: 640 };
  },
});
await engine.start(await loadApkFiles(zip));
const vm = engine.vm;

function call(object, descriptor, name, proto, args, returnType = 'V') {
  const ref = {
    classDesc: descriptor,
    name,
    proto: { descriptor: proto, parameters: parseParameterDescriptors(proto), returnType },
  };
  return vm.invoke(ref, object, args, 'virtual');
}

function construct(descriptor, proto, args) {
  const object = vm.allocateObject(vm.registry.resolve(descriptor));
  const ref = {
    classDesc: descriptor,
    name: '<init>',
    proto: { descriptor: proto, parameters: parseParameterDescriptors(proto), returnType: 'V' },
  };
  vm.invoke(ref, object, args, 'direct');
  return object;
}

function gradient(color, radius = 0) {
  const drawable = construct('Landroid/graphics/drawable/GradientDrawable;', '()V', []);
  call(drawable, 'Landroid/graphics/drawable/GradientDrawable;', 'setColor', '(I)V', [color]);
  if (radius) {
    call(drawable, 'Landroid/graphics/drawable/GradientDrawable;', 'setCornerRadius', '(F)V', [numberToFloatBits(radius)]);
  }
  return drawable;
}

function surface(size = 120) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  return { canvas, ctx };
}

function pixel(canvas, x, y) {
  return Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
}

const RECT = { left: 0, top: 0, right: 120, bottom: 120 };

// 1. GradientDrawable 圆角与填充
{
  const { canvas, ctx } = surface();
  const drawable = gradient(0xffff0000, 20);
  assert(drawDrawable(ctx, drawable, RECT, { vm }), 'GradientDrawable 未绘制');
  assert(pixel(canvas, 60, 60).join(',') === '255,0,0,255', 'GradientDrawable 中心像素错误');
  assert(pixel(canvas, 2, 2)[3] === 0, 'GradientDrawable 圆角外应为透明');
  assert(outlineRadius(drawable, vm) === 20, 'GradientDrawable outline 半径错误');
}

// 2. LayerDrawable 分层与 inset
{
  const { canvas, ctx } = surface();
  const bottom = gradient(0xffffff00);
  const top = gradient(0xff0000ff);
  const array = vm.newArray('[Landroid/graphics/drawable/Drawable;', 2);
  array.$data[0] = bottom;
  array.$data[1] = top;
  const layer = construct('Landroid/graphics/drawable/LayerDrawable;', '([Landroid/graphics/drawable/Drawable;)V', [array]);
  call(layer, 'Landroid/graphics/drawable/LayerDrawable;', 'setLayerInset', '(IIIII)V', [1, 30, 30, 30, 30]);
  assert(drawDrawable(ctx, layer, RECT, { vm }), 'LayerDrawable 未绘制');
  assert(call(layer, 'Landroid/graphics/drawable/LayerDrawable;', 'getNumberOfLayers', '()I', [], 'I') === 2, 'LayerDrawable 层数错误');
  assert(pixel(canvas, 60, 60).join(',') === '0,0,255,255', 'LayerDrawable 上层未覆盖');
  assert(pixel(canvas, 5, 60).join(',') === '255,255,0,255', 'LayerDrawable 底层 inset 区域错误');
}

// 3. InsetDrawable 内缩
{
  const { canvas, ctx } = surface();
  const inner = gradient(0xffffff00);
  const inset = construct('Landroid/graphics/drawable/InsetDrawable;', '(Landroid/graphics/drawable/Drawable;I)V', [inner, 20]);
  assert(drawDrawable(ctx, inset, RECT, { vm }), 'InsetDrawable 未绘制');
  assert(pixel(canvas, 60, 60).join(',') === '255,255,0,255', 'InsetDrawable 中心像素错误');
  assert(pixel(canvas, 5, 60)[3] === 0, 'InsetDrawable 内缩区域应透明');
  assert(call(inset, 'Landroid/graphics/drawable/InsetDrawable;', 'getInsetLeft', '()I', [], 'I') === 20, 'InsetDrawable 左内缩错误');
}

// 4. RippleDrawable 透传内容
{
  const { canvas, ctx } = surface();
  const content = gradient(0xff00aa00);
  const ripple = construct(
    'Landroid/graphics/drawable/RippleDrawable;',
    '(Landroid/content/res/ColorStateList;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V',
    [null, content, null],
  );
  assert(drawDrawable(ctx, ripple, RECT, { vm }), 'RippleDrawable 未绘制');
  assert(pixel(canvas, 60, 60).join(',') === '0,170,0,255', 'RippleDrawable 内容像素错误');
}

// 5. StateListDrawable 按状态切换
{
  const pressed = gradient(0xffff0000);
  const normal = gradient(0xffffff00);
  const list = construct('Landroid/graphics/drawable/StateListDrawable;', '()V', []);
  const pressedSpec = vm.newArray('I', 1);
  pressedSpec.$data[0] = 0x010100a7;
  call(list, 'Landroid/graphics/drawable/StateListDrawable;', 'addState', '([ILandroid/graphics/drawable/Drawable;)V', [pressedSpec, pressed]);
  const emptySpec = vm.newArray('I', 0);
  call(list, 'Landroid/graphics/drawable/StateListDrawable;', 'addState', '([ILandroid/graphics/drawable/Drawable;)V', [emptySpec, normal]);
  const pressedSurface = surface();
  drawDrawable(pressedSurface.ctx, list, RECT, { vm, state: { enabled: true, pressed: true } });
  assert(pixel(pressedSurface.canvas, 60, 60).join(',') === '255,0,0,255', 'StateListDrawable 按下态错误');
  const normalSurface = surface();
  drawDrawable(normalSurface.ctx, list, RECT, { vm, state: { enabled: true } });
  assert(pixel(normalSurface.canvas, 60, 60).join(',') === '255,255,0,255', 'StateListDrawable 默认态错误');
}

// 6. 资源 XML drawable：layer-list + inset + selector + tint
{
  const shape = (color) => ({
    name: 'shape',
    type: 'element',
    attrs: [{ name: 'shape', value: 'rectangle' }],
    children: [
      { name: 'solid', type: 'element', attrs: [{ name: 'color', value: color }], children: [] },
      { name: 'corners', type: 'element', attrs: [{ name: 'radius', value: { dimension: { value: 8, unit: 'dp' } } }], children: [] },
    ],
  });
  const layerList = {
    name: 'layer-list',
    type: 'element',
    attrs: [],
    children: [
      { name: 'item', type: 'element', attrs: [], children: [shape('#ffff0000')] },
      { name: 'item', type: 'element', attrs: [{ name: 'left', value: { dimension: { value: 20, unit: 'px' } } }], children: [shape('#ff0000ff')] },
    ],
  };
  const { canvas, ctx } = surface();
  assert(drawDrawable(ctx, { type: 'xml', xml: layerList }, RECT, { vm }), 'layer-list 未绘制');
  assert(pixel(canvas, 60, 60).join(',') === '0,0,255,255', 'layer-list 上层颜色错误');
  assert(pixel(canvas, 5, 60).join(',') === '255,0,0,255', 'layer-list 下层颜色错误');

  const tinted = surface();
  drawDrawable(tinted.ctx, { type: 'shape', xml: shape('#ffff0000') }, RECT, { vm, tint: 0xff00ff00 });
  assert(pixel(tinted.canvas, 60, 60).join(',') === '0,255,0,255', 'shape tint 未生效');

  const selector = {
    name: 'selector',
    type: 'element',
    attrs: [],
    children: [
      { name: 'item', type: 'element', attrs: [{ name: 'state_pressed', value: 'true' }], children: [shape('#ffff0000')] },
      { name: 'item', type: 'element', attrs: [], children: [shape('#ffffff00')] },
    ],
  };
  const selected = surface();
  drawDrawable(selected.ctx, { type: 'xml', xml: selector }, RECT, { vm, state: { enabled: true } });
  assert(pixel(selected.canvas, 60, 60).join(',') === '255,255,0,255', 'selector 默认态错误');
}

// 7. View 背景 tint 与前景绘制
{
  const view = engine.activity ? engine.vm.registry.getPeer(engine.activity).contentView : null;
  assert(view, '缺少根视图');
  assert(typeof view.drawableState === 'function', 'View 缺少 drawableState');
  assert(Array.isArray(view.drawableState()), 'drawableState 应返回数组');
  view.setBackground({ type: 'color', color: 0xff112233 });
  view.setBackgroundTintList(0xff445566);
  view.invalidate = () => {};
  const { canvas, ctx } = surface(200);
  view.drawBackground({ context: ctx });
  assert(pixel(canvas, 20, 20).join(',') === '68,85,102,255', 'View 背景 tint 未生效');
}

// 8. TextView 基线来自字体度量
{
  const { TextView } = await import('../src/framework/widgets.js');
  const text = new TextView(null);
  text.setTextSize(20);
  text.paddingTop = 4;
  const baseline = text.getBaseline();
  const metrics = text.textLineMetrics();
  assert(baseline === Math.round(text.paddingTop + metrics.firstBaseline), `TextView baseline 异常: ${baseline}`);
  assert(baseline > 0 && baseline < text.paddingTop + text.textSize * 1.2, `TextView baseline 越界: ${baseline}`);
  assert(text.lineHeightPx() < 20 * 1.35, 'TextView 行高未使用字体度量');
  text.textStyle = 0;
  const normalWidth = text.measureText('Bold Sample');
  text.textStyle = 1;
  const boldWidth = text.measureText('Bold Sample');
  assert(boldWidth >= normalWidth, 'bold 文本测量宽度应不小于 normal');
  text.setTextScaleX(1);
  const scaleWidth = text.measureText('Scale');
  text.setTextScaleX(0.5);
  assert(text.measureText('Scale') < scaleWidth, 'textScaleX 应缩小测量宽度');
  text.setTextScaleX(1);
  text.letterSpacing = 0;
  const plainWidth = text.measureText('Spacing');
  text.letterSpacing = 0.1;
  assert(text.measureText('Spacing') > plainWidth, 'letterSpacing 应增加测量宽度');
  text.letterSpacing = 0;
  text.textStyle = 0;
  text.maxLines = 1;
  text.ellipsize = 1;
  text.setText('这是一段很长很长很长很长很长很长很长很长的文本');
  text.ensureTextLayout(70);
  assert(text.lines.length === 1 && text.lines[0].includes('\u2026'), 'TextView 省略号截断未生效');
}

// 9. Paint colorFilter 参与绘制颜色
{
  const { Paint, applyColorFilter } = await import('../src/framework/graphics.js');
  const filter = { color: 0xff00ff00, mode: 5 };
  assert(applyColorFilter(0xffff0000, filter) === 0xff00ff00, 'SRC_IN colorFilter 未替换颜色');
  const paint = new Paint();
  paint.setColor(0xffff0000);
  paint.setColorFilter(filter);
  assert(paint.getColorFilter() === filter, 'Paint 未保存 colorFilter');
}

// 10. 空 Drawable 不递归
{
  const { ctx } = surface();
  const empty = construct('Landroid/graphics/drawable/Drawable;', '()V', []);
  const result = drawDrawable(ctx, empty, RECT, { vm });
  assert(result === false, '空 Drawable 应返回未绘制');
  call(empty, 'Landroid/graphics/drawable/Drawable;', 'setAlpha', '(I)V', [128]);
  assert(call(empty, 'Landroid/graphics/drawable/Drawable;', 'getAlpha', '()I', [], 'I') === 128, 'Drawable alpha 存取错误');
}

console.log('drawables OK');

// 11. Outline host
{
  const outline = construct('Landroid/graphics/Outline;', '()V', []);
  call(outline, 'Landroid/graphics/Outline;', 'setRoundRect', '(IIIIF)V', [0, 0, 100, 40, numberToFloatBits(8)]);
  const peer = outline.$peer;
  assert(peer.outlineEmpty === false, 'Outline.setRoundRect 未生效');
  assert(peer.outlineRadius === 8, 'Outline 圆角错误');
  assert(call(outline, 'Landroid/graphics/Outline;', 'isEmpty', '()Z', [], 'Z') === 0, 'Outline.isEmpty 错误');
  call(outline, 'Landroid/graphics/Outline;', 'setEmpty', '()V', []);
  assert(outline.$peer.outlineEmpty === true, 'Outline.setEmpty 未生效');
}

// 12. RippleDrawable 按下态绘制
{
  const { canvas, ctx } = surface();
  const content = gradient(0xffffffff);
  const ripple = construct(
    'Landroid/graphics/drawable/RippleDrawable;',
    '(Landroid/content/res/ColorStateList;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V',
    [null, content, null],
  );
  const pressed = vm.newArray('I', 1);
  pressed.$data[0] = 0x010100a7;
  call(ripple, 'Landroid/graphics/drawable/RippleDrawable;', 'setState', '([I)Z', [pressed]);
  ripple.$peer.rippleColor = 0x66000000;
  ripple.$peer.$rippleActive = true;
  ripple.$peer.$rippleStart = Date.now() - 400;
  assert(drawDrawable(ctx, ripple, RECT, { vm, state: { pressed: true } }), 'Ripple 未绘制');
  const center = pixel(canvas, 60, 60);
  assert(center[3] === 255 && center[0] < 255, 'Ripple 按下态未叠加');
}

// 13. LinearLayout 权重（0dp + weight）
{
  const { LinearLayout } = await import('../src/framework/layouts.js');
  const linear = new LinearLayout(null);
  linear.vm = vm;
  const { View } = await import('../src/framework/view.js');
  const make = (weight, width) => {
    const child = new View(null);
    child.vm = vm;
    child.layoutParams = { width, height: -2, weight, gravity: -1, leftMargin: 0, topMargin: 0, rightMargin: 0, bottomMargin: 0 };
    child.measure = function (widthSpec) {
      const mode = MeasureSpec.getMode(widthSpec);
      const size = mode === MeasureSpec.EXACTLY ? MeasureSpec.getSize(widthSpec) : (width === 0 ? 0 : 40);
      this.setMeasuredDimension(size, 20);
    };
    child.parent = linear;
    linear.children.push(child);
    return child;
  };
  const a = make(1, 0);
  const b = make(1, 0);
  linear.measure(MeasureSpec.makeMeasureSpec(300, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(100, MeasureSpec.EXACTLY));
  assert(a.getMeasuredWidth() === 150 && b.getMeasuredWidth() === 150, `LinearLayout 0dp 权重错误: ${a.getMeasuredWidth()},${b.getMeasuredWidth()}`);
  linear.children.length = 0;
  const c = make(1, -2);
  c.measure = function (widthSpec) {
    const mode = MeasureSpec.getMode(widthSpec);
    this.setMeasuredDimension(mode === MeasureSpec.EXACTLY ? MeasureSpec.getSize(widthSpec) : 80, 20);
  };
  linear.measure(MeasureSpec.makeMeasureSpec(300, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(100, MeasureSpec.EXACTLY));
  assert(c.getMeasuredWidth() === 300, `LinearLayout wrap_content 权重错误: ${c.getMeasuredWidth()}`);
}

// 14. ImageView scaleType
{
  const { ImageView } = await import('../src/framework/widgets.js');
  const view = new ImageView(null);
  view.vm = vm;
  view.drawable = { type: 'bitmap', bitmap: { image: null, width: 100, height: 50 } };
  view.setScaleType(1);
  assert(view.getScaleType() === 'fitXY', 'scaleType 数值未归一化');
  view.setScaleType('centerCrop');
  view.setMeasuredDimension(200, 200);
  view.layout(0, 0, 200, 200);
  const rect = view.computeDrawRect(100, 50);
  assert(rect.width === 400 && rect.height === 200 && rect.left === -100 && rect.top === 0, `centerCrop 几何错误: ${JSON.stringify(rect)}`);
  view.setScaleType('fitCenter');
  const fit = view.computeDrawRect(100, 50);
  assert(fit.width === 200 && fit.height === 100 && fit.top === 50, `fitCenter 几何错误: ${JSON.stringify(fit)}`);
}

// 15. ProgressBar 横向轨道
{
  const { ProgressBar } = await import('../src/framework/widgets.js');
  const bar = new ProgressBar(null);
  bar.vm = vm;
  bar.minHeight = 0;
  bar.maxHeight = 0;
  bar.setStyleHorizontal(true);
  bar.setMax(100);
  bar.setProgress(50);
  bar.setMeasuredDimension(200, 20);
  bar.layout(0, 0, 200, 20);
  bar.paddingLeft = 0;
  bar.paddingRight = 0;
  const { canvas, ctx } = surface(200);
  ctx.clearRect(0, 0, 200, 200);
  bar.onDraw({ context: ctx });
  const left = pixel(canvas, 10, 10);
  const right = pixel(canvas, 190, 10);
  assert(left[0] !== right[0] || left[3] !== right[3], 'ProgressBar 进度未绘制');
}

// 16. Material 三段阴影
{
  const { View } = await import('../src/framework/view.js');
  const view = new View(null);
  view.vm = vm;
  view.background = gradient(0xff3366cc, 12);
  view.background.$peer.bounds = { left: 0, top: 0, right: 80, bottom: 80 };
  view.elevation = 16;
  view.setMeasuredDimension(80, 80);
  view.layout(20, 20, 100, 100);
  const { canvas, ctx } = surface(160);
  ctx.clearRect(0, 0, 160, 160);
  ctx.save();
  ctx.translate(20, 20);
  view.drawElevation({ context: ctx });
  ctx.restore();
  const below = pixel(canvas, 60, 110);
  assert(below[3] > 0, 'Material 阴影未绘制到 View 下方');
}

// 17. Vector trimPath
{
  const { drawVectorRaw } = await import('../src/framework/graphics.js');
  const { canvas, ctx } = surface(100);
  ctx.clearRect(0, 0, 100, 100);
  const xml = {
    name: 'vector',
    attrs: [{ name: 'viewportWidth', value: 100 }, { name: 'viewportHeight', value: 100 }],
    children: [{
      name: 'path',
      attrs: [
        { name: 'name', value: 'p' },
        { name: 'pathData', value: 'M0,50 L100,50' },
        { name: 'strokeColor', value: 0xffff0000 },
        { name: 'strokeWidth', value: 10 },
      ],
    }],
  };
  drawVectorRaw(ctx, 0, 0, { xml }, 0, 0, 100, 100, { trim: { p: { start: 0.5, end: 1, offset: 0 } } });
  assert(pixel(canvas, 10, 50)[3] === 0, 'trimPath 起点前应透明');
  assert(pixel(canvas, 90, 50)[3] > 0, 'trimPath 终点区域应绘制');
}
