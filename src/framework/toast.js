const DURATION_MS = [2000, 3500];
const FADE_MS = 180;
const MARGIN_BOTTOM = 96;

export const Toast = {
  show(vm, text, duration = 0) {
    const screen = vm.screen;
    const message = text === null || text === undefined ? '' : String(text);
    vm.log('info', 'Toast', message);
    if (!screen || typeof screen.addOverlay !== 'function') return;
    if (vm.toastOverlay) {
      vm.toastOverlay.close();
      vm.toastOverlay = null;
    }
    const total = DURATION_MS[duration === 1 ? 1 : 0];
    const overlay = new ToastOverlay(message, total);
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
  constructor(text, duration) {
    this.text = text;
    this.duration = duration;
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
    this.close();
    return true;
  }

  draw(ctx, screen) {
    this.screen = screen;
    const textSize = 14;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha)) * 0.9;
    ctx.font = `500 ${textSize}px sans-serif`;
    const metrics = ctx.measureText(this.text);
    const paddingX = 20;
    const paddingY = 12;
    const width = Math.min(screen.width - 48, Math.ceil(metrics.width) + paddingX * 2);
    const height = textSize + paddingY * 2;
    const left = Math.round((screen.width - width) / 2);
    const top = Math.round(screen.height - MARGIN_BOTTOM - height);
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
}

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}
