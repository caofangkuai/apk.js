import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCanvas } = require('canvas');

import { View, MeasureSpec } from '../src/framework/view.js';
import { ListView, HorizontalScrollView } from '../src/framework/layouts.js';
import { ScrollView } from '../src/framework/widgets.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeSurface(width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const adapter = {
    context: ctx,
    save: () => ctx.save(),
    restore: () => ctx.restore(),
    translate: (x, y) => ctx.translate(x, y),
  };
  return { canvas, ctx, adapter };
}

function alphaAt(ctx, x, y) {
  return ctx.getImageData(x, y, 1, 1).data[3];
}

class ScrollableView extends View {
  constructor() {
    super(null);
    this.$range = 1000;
    this.$offset = 0;
    this.scrollBarFadingEnabled = false;
  }

  computeVerticalScrollRange() {
    return this.$range;
  }

  computeVerticalScrollOffset() {
    return this.$offset;
  }

  computeVerticalScrollExtent() {
    return this.getHeight();
  }
}

function sized(view, width, height) {
  view.right = width;
  view.bottom = height;
  return view;
}

// 1) 内容未超出视口时不画滚动条。
{
  const { ctx, adapter } = makeSurface(100, 100);
  const view = sized(new ScrollableView(), 100, 100);
  view.$range = 100;
  view.$scrollBarAlpha = 1;
  view.drawScrollBars(adapter);
  assert(alphaAt(ctx, 98, 50) === 0, '不可滚动时不应出现垂直滚动条');
  assert(alphaAt(ctx, 50, 98) === 0, '不可滚动时不应出现水平滚动条');
}

// 2) 可滚动且 offset 为 0 时，垂直 thumb 贴在顶部。
{
  const { ctx, adapter } = makeSurface(100, 100);
  const view = sized(new ScrollableView(), 100, 100);
  view.$scrollBarAlpha = 1;
  view.drawScrollBars(adapter);
  assert(alphaAt(ctx, 98, 5) > 30, '顶部应出现滚动条 thumb');
  assert(alphaAt(ctx, 98, 70) === 0, 'offset=0 时 thumb 不应出现在底部');
}

// 3) offset 变化时 thumb 按比例下移（范围 1000、视口 100、offset 450）。
{
  const { ctx, adapter } = makeSurface(100, 100);
  const view = sized(new ScrollableView(), 100, 100);
  view.$scrollBarAlpha = 1;
  view.$offset = 450;
  view.drawScrollBars(adapter);
  assert(alphaAt(ctx, 98, 50) > 30, 'offset 在中段时 thumb 应位于中部');
}

// 4) 水平滚动条：范围 600、视口 100、offset 250。
{
  const { ctx, adapter } = makeSurface(100, 100);
  const view = sized(new ScrollableView(), 100, 100);
  view.$scrollBarAlpha = 1;
  view.verticalScrollBarEnabled = false;
  view.computeHorizontalScrollRange = () => 600;
  view.computeHorizontalScrollOffset = () => 250;
  view.computeHorizontalScrollExtent = () => view.getWidth();
  view.drawScrollBars(adapter);
  assert(alphaAt(ctx, 60, 98) > 30, '水平滚动条 thumb 应出现在底部中段');
  assert(alphaAt(ctx, 10, 98) === 0, '水平滚动条 thumb 不应覆盖左端');
}

// 5) 淡出：延迟未到时完全不透明，超过淡出时长后消失。
{
  const { ctx, adapter } = makeSurface(100, 100);
  const view = sized(new ScrollableView(), 100, 100);
  view.scrollBarFadingEnabled = true;
  view.scrollBarFadeDuration = 100;
  view.$scrollBarFadeStart = Date.now() + 1000;
  assert(view.scrollBarAlpha() === 1, '滚动后延迟期内应完全不透明');
  view.$scrollBarFadeStart = Date.now() - 1000;
  assert(view.scrollBarAlpha() === 0, '淡出完成后应完全透明');
  view.drawScrollBars(adapter);
  assert(alphaAt(ctx, 98, 5) === 0, '淡出完成后不应再绘制滚动条');
}

// 6) 关闭滚动条后即使可滚动也不绘制。
{
  const { ctx, adapter } = makeSurface(100, 100);
  const view = sized(new ScrollableView(), 100, 100);
  view.$scrollBarAlpha = 1;
  view.setVerticalScrollBarEnabled(false);
  assert(view.getVerticalScrollbarWidth() === 0, '关闭后滚动条宽度应为 0');
  view.drawScrollBars(adapter);
  assert(alphaAt(ctx, 98, 5) === 0, '关闭滚动条后不应绘制');
}

// 7) drawForeground 在没有前景 drawable 时也要绘制滚动条。
{
  const { ctx, adapter } = makeSurface(100, 100);
  const view = sized(new ScrollableView(), 100, 100);
  view.$scrollBarAlpha = 1;
  view.drawForeground(adapter);
  assert(alphaAt(ctx, 98, 5) > 30, 'drawForeground 应包含滚动条绘制');
}

// 8) 宿主容器按 AOSP 语义提供滚动度量。
{
  const list = sized(new ListView(null), 200, 100);
  list.$contentHeight = 1000;
  list.scrollY = 300;
  assert(list.computeVerticalScrollRange() === 1000, 'ListView range 应取内容高度');
  assert(list.computeVerticalScrollOffset() === 300, 'ListView offset 应取 scrollY');
  assert(list.computeVerticalScrollExtent() === 100, 'ListView extent 应取视口高度');

  const scroll = sized(new ScrollView(null), 200, 100);
  const child = new View(null);
  child.measuredWidth = 200;
  child.measuredHeight = 400;
  scroll.child = child;
  assert(scroll.computeVerticalScrollRange() === 400, 'ScrollView range 应取子项高度');
  scroll.scrollRange = 300;
  scroll.scrollTo(0, 120);
  assert(scroll.computeVerticalScrollOffset() === 120, 'ScrollView offset 应取 scrollY');
  assert(scroll.$scrollBarFadeStart > 0, '滚动后应唤醒滚动条');

  const horizontal = sized(new HorizontalScrollView(null), 200, 100);
  horizontal.scrollRangeX = 400;
  horizontal.scrollTo(150, 0);
  assert(horizontal.computeHorizontalScrollRange() === 600, 'HorizontalScrollView range 应为内容宽度');
  assert(horizontal.computeHorizontalScrollOffset() === 150, 'HorizontalScrollView offset 应取 scrollX');
  assert(horizontal.computeHorizontalScrollExtent() === 200, 'HorizontalScrollView extent 应取视口宽度');
  assert(horizontal.verticalScrollBarEnabled === false, 'HorizontalScrollView 默认不显示垂直滚动条');
}

// 9) MeasureSpec 未受影响（回归保护：导入路径仍然可用）。
assert(MeasureSpec.getSize(MeasureSpec.makeMeasureSpec(120, MeasureSpec.EXACTLY)) === 120, 'MeasureSpec 正常');

console.log('scrollbars OK');
