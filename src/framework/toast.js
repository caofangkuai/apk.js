import { createCanvasAdapter } from './window.js';
import { MeasureSpec } from './view.js';

const DURATION_MS = [2000, 3500];
const FADE_MS = 180;
const MARGIN_BOTTOM = 96;
const GRAVITY_CENTER_HORIZONTAL = 1;
const GRAVITY_LEFT = 3;
const GRAVITY_RIGHT = 5;
const GRAVITY_TOP = 48;
const GRAVITY_CENTER_VERTICAL = 16;
const GRAVITY_BOTTOM = 80;

export const Toast = {
  show(vm, text, duration = 0, options = {}) {
    const screen = vm.screen;
    const message = text === null || text === undefined ? '' : String(text);
    vm.log('info', 'Toast', options.view ? '[custom view]' : message);
    if (!screen || typeof screen.addOverlay !== 'function') return;
    if (vm.toastOverlay) {
      vm.toastOverlay.close();
      vm.toastOverlay = null;
    }
    const total = DURATION_MS[duration === 1 ? 1 : 0];
    const density = Number(vm.resources?.density) || Number(vm.resources?.displayMetrics?.density) || 1;
    const overlay = new ToastOverlay(message, total, density, options);
    vm.toastOverlay = overlay;
    screen.addOverlay(overlay);
    overlay.start(() => {
      screen.removeOverlay(overlay);
      if (vm.toastOverlay === overlay) vm.toastOverlay = null;
    });
  },

  cancel(vm) {
    if (vm.toastOverlay) {
      vm.toastOverlay.close();
      vm.toastOverlay = null;
    }
  },
};

class ToastOverlay {
  constructor(text, duration, density = 1, options = {}) {
    this.text = text;
    this.duration = duration;
    this.density = density;
    this.view = options.view || null;
    this.gravity = Number(options.gravity ?? (GRAVITY_BOTTOM | GRAVITY_CENTER_HORIZONTAL));
    this.xOffset = Number(options.xOffset) || 0;
    this.yOffset = Number(options.yOffset) || 0;
    this.horizontalMargin = Number(options.horizontalMargin) || 0;
    this.verticalMargin = Number(options.verticalMargin) || 0;
    this.startedAt = 0;
    this.alpha = 0;
    this.closed = false;
    this.onClose = null;
  }

  start(onClose) {
    this.onClose = onClose;
    this.startedAt = now();
    this.frame();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.onClose) this.onClose();
  }

  frame() {
    if (this.closed) return;
    const elapsed = now() - this.startedAt;
    if (elapsed >= this.duration) {
      this.close();
      return;
    }
    if (elapsed < FADE_MS) this.alpha = elapsed / FADE_MS;
    else if (elapsed > this.duration - FADE_MS) this.alpha = (this.duration - elapsed) / FADE_MS;
    else this.alpha = 1;
    const screen = this.screen;
    if (screen && typeof screen.invalidate === 'function') screen.invalidate();
    setTimeout(() => this.frame(), 32);
  }

  handleTouch() {
    return false;
  }

  /** 按 gravity/margin/offset 计算浮层位置（对应 AOSP Toast 的窗口定位）。 */
  position(screen, width, height) {
    const density = this.density || 1;
    const marginX = Math.round(this.horizontalMargin * screen.width);
    const marginY = Math.round(this.verticalMargin * screen.height);
    let left;
    if (this.gravity & GRAVITY_CENTER_HORIZONTAL) left = Math.round((screen.width - width) / 2);
    else if ((this.gravity & GRAVITY_LEFT) === GRAVITY_LEFT) left = marginX;
    else if ((this.gravity & GRAVITY_RIGHT) === GRAVITY_RIGHT) left = screen.width - width - marginX;
    else left = Math.round((screen.width - width) / 2);
    let top;
    if ((this.gravity & GRAVITY_TOP) === GRAVITY_TOP) top = marginY;
    else if ((this.gravity & GRAVITY_CENTER_VERTICAL) === GRAVITY_CENTER_VERTICAL) top = Math.round((screen.height - height) / 2);
    else top = screen.height - MARGIN_BOTTOM * density - height - marginY;
    return { left: left + this.xOffset, top: top + this.yOffset };
  }

  draw(ctx, screen) {
    this.screen = screen;
    const density = this.density || 1;
    if (this.view) {
      this.drawView(ctx, screen);
      return;
    }
    const textSize = 14 * density;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha)) * 0.9;
    ctx.font = `500 ${textSize}px 'Noto Sans CJK SC'`;
    const metrics = ctx.measureText(this.text);
    const paddingX = 20 * density;
    const paddingY = 12 * density;
    const width = Math.min(screen.width - 48, Math.ceil(metrics.width) + paddingX * 2);
    const height = textSize + paddingY * 2;
    const { left, top } = this.position(screen, width, height);
    const radius = height / 2;
    ctx.fillStyle = 'rgba(50, 50, 50, 0.92)';
    ctx.beginPath();
    ctx.moveTo(left + radius, top);
    ctx.lineTo(left + width - radius, top);
    ctx.quadraticCurveTo(left + width, top, left + width, top + radius);
    ctx.lineTo(left + width, top + height - radius);
    ctx.quadraticCurveTo(left + width, top + height, left + width - radius, top + height);
    ctx.lineTo(left + radius, top + height);
    ctx.quadraticCurveTo(left, top + height, left, top + height - radius);
    ctx.lineTo(left, top + radius);
    ctx.quadraticCurveTo(left, top, left + radius, top);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(this.text, left + width / 2, top + height / 2);
    ctx.restore();
  }

  /** 自定义 View 的 Toast：测量、布局后按 gravity 绘制到浮层画布。 */
  drawView(ctx, screen) {
    const view = this.view;
    if (!view || typeof view.measure !== 'function') return;
    const maxWidth = Math.max(0, screen.width - 2 * Math.round(20 * (this.density || 1)));
    view.measure(
      MeasureSpec.makeMeasureSpec(maxWidth, MeasureSpec.AT_MOST),
      MeasureSpec.makeMeasureSpec(screen.height, MeasureSpec.AT_MOST)
    );
    const width = view.getMeasuredWidth();
    const height = view.getMeasuredHeight();
    if (view.layout) view.layout(0, 0, width, height);
    const { left, top } = this.position(screen, width, height);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha));
    ctx.translate(left, top);
    view.draw(createCanvasAdapter(ctx, { width, height }));
    ctx.restore();
  }
}

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}
