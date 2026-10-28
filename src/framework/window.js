import { ViewGroup, VISIBILITY, MeasureSpec, getChildMeasureSpec, resolveSize } from './view.js';
import { FrameLayout } from './layouts.js';
import { cssColor, Paint, drawVectorRaw } from './graphics.js';

export class Window {
  constructor(context, decorView, screen) {
    this.context = context;
    this.decorView = decorView;
    this.screen = screen;
    this.statusBarColor = 0xfff8f9fa;
    this.navigationBarColor = 0xffffffff;
    this.statusBarHeight = 24;
    this.darkStatusBarIcons = true;
  }

  addFlags(flags) {}

  clearFlags(flags) {}

  setStatusBarColor(color) {
    this.statusBarColor = color >>> 0;
    this.screen?.invalidate();
  }

  setNavigationBarColor(color) {
    this.navigationBarColor = color >>> 0;
    this.screen?.invalidate();
  }

  setSoftInputMode(mode) {}

  requestFeature(feature) {
    return true;
  }

  findViewById(id) {
    return this.decorView.findViewById(id);
  }

  getDecorView() {
    return this.decorView;
  }

  setContentView(view) {
    this.contentView = view;
    this.decorView.setContentView(view);
    if (this.host) {
      this.host.contentView = view;
      this.host.relayout?.();
    }
  }

  getAttributes() {
    if (this.attributes) return this.attributes;
    const vm = this.host?.vm || this.context?.$vm || this.context?.vm || this.$vm;
    if (!vm) {
      this.attributes = {};
      return this.attributes;
    }
    const def = vm.registry.resolve('Landroid/view/WindowManager$LayoutParams;');
    const object = vm.allocateObject(def);
    object.$peer = {
      width: -1,
      height: -1,
      x: 0,
      y: 0,
      gravity: 0,
      flags: 0,
      format: -1,
      type: 1,
      softInputMode: 0,
      layoutInDisplayCutoutMode: 0,
      horizontalMargin: 0,
      verticalMargin: 0,
      windowAnimations: 0,
      alpha: 1,
      screenBrightness: -1,
      buttonBrightness: -1,
    };
    object.$fields = object.$fields || new Map();
    this.attributes = object;
    return object;
  }
}

export class DecorView extends ViewGroup {
  constructor(context, screen) {
    super(context);
    this.screen = screen;
    this.contentView = null;
    this.statusBarColor = 0xfffffff8;
    this.navigationBarColor = 0xffffffff;
    this.showStatusBar = true;
    this.showNavigationBar = true;
    this.statusBarHeight = 24;
    this.navigationBarHeight = 12;
    this.background = { type: 'color', color: 0xfff8f9fa };
    this.contentHost = new FrameLayout(context);
    this.contentHost.id = 0x01020002;
    this.contentHost.layoutParams = { width: -1, height: -1 };
    this.contentFrame = new FrameLayout(context);
    this.contentFrame.layoutParams = { width: -1, height: -1 };
    this.contentHost.addView(this.contentFrame, { width: -1, height: -1 });
    this.addView(this.contentHost, { width: -1, height: -1 });
  }

  setContentView(view) {
    if (this.contentView) this.contentFrame.removeView(this.contentView);
    this.contentView = view;
    view.layoutParams = { width: -1, height: -1 };
    this.contentFrame.addView(view);
    this.requestLayout();
  }

  getContentView() {
    return this.contentView;
  }

  onMeasure(widthSpec, heightSpec) {
    const width = MeasureSpec.getSize(widthSpec);
    const height = MeasureSpec.getSize(heightSpec);
    for (const child of this.children) {
      if (child.visibility === VISIBILITY.GONE) continue;
      const params = child.layoutParams || { width: -1, height: -1 };
      const childWidthSpec = getChildMeasureSpec(widthSpec, this.paddingLeft + this.paddingRight, params.width);
      const childHeightSpec = getChildMeasureSpec(heightSpec, this.paddingTop + this.paddingBottom, params.height);
      child.measure(childWidthSpec, childHeightSpec);
    }
    this.setMeasuredDimension(width, height);
  }

  onLayout(changed, left, top, right, bottom) {
    const width = right - left;
    const height = bottom - top;
    for (const child of this.children) {
      if (child.visibility === VISIBILITY.GONE) continue;
      child.layout(0, 0, width, height);
    }
  }

  dispatchDraw(canvas) {
    const width = this.getWidth();
    const height = this.getHeight();
    const ctx = canvas.context;
    ctx.save();
    ctx.fillStyle = cssColor(this.statusBarColor);
    ctx.fillRect(0, 0, width, this.statusBarHeight);
    ctx.fillStyle = cssColor(this.navigationBarColor);
    ctx.fillRect(0, height - this.navigationBarHeight, width, this.navigationBarHeight);
    ctx.restore();
    if (this.contentView) {
      canvas.save();
      this.contentView.draw(canvas);
      canvas.restore();
    }
  }
}

export class SurfaceScreen {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.context = canvasElement.getContext('2d');
    this.width = options.width || 360;
    this.height = options.height || 720;
    this.dpr = options.dpr || (typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1);
    this.decorView = null;
    this.overlays = [];
    this.dirty = false;
    this.frameRequested = false;
    this.touchHandler = null;
    this.style = options.style || 'material';
    this.onDraw = options.onDraw || null;
    this.resize(options.width || 360, options.height || 720);
    this.bindInput();
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.decorView) {
      this.decorView.measure(
        MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
      );
      this.decorView.layout(0, 0, width, height);
    }
    this.invalidate();
  }

  setDecorView(decorView) {
    this.decorView = decorView;
    decorView.measure(
      MeasureSpec.makeMeasureSpec(this.width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(this.height, MeasureSpec.EXACTLY)
    );
    decorView.layout(0, 0, this.width, this.height);
    this.invalidate();
  }

  bindInput() {
    if (!this.canvas || typeof this.canvas.addEventListener !== 'function') return;
    const toLocal = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) * this.width) / rect.width,
        y: ((event.clientY - rect.top) * this.height) / rect.height,
      };
    };
    this.canvas.addEventListener('pointerdown', (event) => {
      const point = toLocal(event);
      this.dispatchTouch({ action: 'down', x: point.x, y: point.y, rawX: point.x, rawY: point.y });
      this.canvas.setPointerCapture?.(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.pointerDown) return;
      const point = toLocal(event);
      this.dispatchTouch({ action: 'move', x: point.x, y: point.y, rawX: point.x, rawY: point.y });
    });
    this.canvas.addEventListener('pointerup', (event) => {
      const point = toLocal(event);
      this.dispatchTouch({ action: 'up', x: point.x, y: point.y, rawX: point.x, rawY: point.y });
    });
    this.canvas.addEventListener('pointercancel', (event) => {
      const point = toLocal(event);
      this.dispatchTouch({ action: 'cancel', x: point.x, y: point.y, rawX: point.x, rawY: point.y });
    });
  }

  findViewAt(point, view = this.decorView) {
    if (!view) return null;
    if (view.visibility !== undefined && view.visibility !== 0) return null;
    if (Array.isArray(view.children)) {
      for (let i = view.children.length - 1; i >= 0; i--) {
        const child = view.children[i];
        const x = point.x - (child.left || 0) - (child.translationX || 0);
        const y = point.y - (child.top || 0) - (child.translationY || 0);
        const w = child.getWidth ? child.getWidth() : child.width || 0;
        const h = child.getHeight ? child.getHeight() : child.height || 0;
        if (x >= 0 && y >= 0 && x < w && y < h) {
          return this.findViewAt({ x, y }, child) || child;
        }
      }
    }
    if (view.child) {
      const child = view.child;
      const x = point.x - (child.left || 0);
      const y = point.y - (child.top || 0);
      const w = child.getWidth ? child.getWidth() : child.width || 0;
      const h = child.getHeight ? child.getHeight() : child.height || 0;
      if (x >= 0 && y >= 0 && x < w && y < h) {
        return this.findViewAt({ x, y }, child) || child;
      }
    }
    return view;
  }

  dispatchTouch(event) {
    if (event.action === 'down') this.pointerDown = true;
    if (event.action === 'up' || event.action === 'cancel') this.pointerDown = false;

    if (this.overlays.length) {
      for (let i = this.overlays.length - 1; i >= 0; i--) {
        const overlay = this.overlays[i];
        if (overlay.handleTouch && overlay.handleTouch(event)) {
          this.invalidate();
          return true;
        }
      }
    }

    if (this.decorView) {
      if (event.action === 'down' && this.keyboardTarget) {
        const hit = this.findViewAt({ x: event.x, y: event.y });
        if (hit !== this.keyboardTarget) this.hideKeyboard();
      }
      const handled = this.decorView.dispatchTouchEvent({ ...event, action: event.action });
      if (handled) {
        this.invalidate();
        return true;
      }
    }
    if (this.touchHandler) this.touchHandler(event);
    this.invalidate();
    return false;
  }

  ensureKeyboardInput() {
    if (this.keyboardInput) return this.keyboardInput;
    const doc = typeof document !== 'undefined' ? document : null;
    if (!doc) return null;
    const input = doc.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-hidden', 'true');
    input.style.position = 'absolute';
    input.style.left = '0';
    input.style.top = '0';
    input.style.width = '1px';
    input.style.height = '1px';
    input.style.opacity = '0.01';
    input.style.border = '0';
    input.style.padding = '0';
    input.style.margin = '0';
    input.style.fontSize = '16px';
    input.style.zIndex = '-1';
    input.style.pointerEvents = 'none';
    input.style.caretColor = 'transparent';
    const parent = this.canvas.parentNode || doc.body;
    if (parent) parent.appendChild(input);

    const sync = () => {
      const target = this.keyboardTarget;
      if (!target) return;
      const value = input.value;
      const selection = input.selectionStart ?? value.length;
      target.setText(value);
      target.selectionStart = selection;
      target.selectionEnd = input.selectionEnd ?? selection;
      this.invalidate();
    };

    input.addEventListener('input', sync);
    input.addEventListener('keydown', (event) => {
      const target = this.keyboardTarget;
      if (!target) return;
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sync();
        if (target.singleLine !== false && target.maxLines === 1) {
          this.hideKeyboard();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.hideKeyboard();
      }
    });
    input.addEventListener('blur', () => {
      if (this.keyboardTarget) {
        this.keyboardTarget.focused = false;
        this.keyboardTarget.invalidate?.();
        this.invalidate();
      }
    });

    this.keyboardInput = input;
    return input;
  }

  showKeyboard(view) {
    const input = this.ensureKeyboardInput();
    this.keyboardTarget = view;
    if (!input) return false;
    input.value = view.getText ? view.getText() : '';
    try {
      input.focus({ preventScroll: true });
      const length = input.value.length;
      input.setSelectionRange(length, length);
    } catch {
      input.focus?.();
    }
    view.showCursor = true;
    view.invalidate?.();
    this.invalidate();
    return true;
  }

  hideKeyboard() {
    const view = this.keyboardTarget;
    this.keyboardTarget = null;
    if (view) {
      view.showCursor = false;
      view.invalidate?.();
    }
    if (this.keyboardInput) {
      try {
        this.keyboardInput.blur();
      } catch {
        /* ignore */
      }
    }
    this.invalidate();
    return true;
  }

  isKeyboardShown() {
    return !!this.keyboardTarget;
  }

  /**
   * Dispatch a hardware-style key press to the currently focused editable view.
   * Supports printable characters, Backspace and Enter.
   */
  sendKey(event) {
    const target = this.keyboardTarget;
    if (!target) return false;
    let text = target.getText ? target.getText() : '';
    let caret = target.selectionEnd ?? text.length;
    if (event.key === 'Backspace') {
      if (caret > 0) {
        text = text.slice(0, caret - 1) + text.slice(caret);
        caret -= 1;
      }
    } else if (event.key === 'Delete') {
      text = text.slice(0, caret) + text.slice(caret + 1);
    } else if (event.key === 'ArrowLeft') {
      caret = Math.max(0, caret - 1);
    } else if (event.key === 'ArrowRight') {
      caret = Math.min(text.length, caret + 1);
    } else if (event.key === 'Enter') {
      if (target.singleLine !== false && target.maxLines === 1) {
        this.hideKeyboard();
        return true;
      }
      text = text.slice(0, caret) + '\n' + text.slice(caret);
      caret += 1;
    } else if (event.key && event.key.length === 1) {
      text = text.slice(0, caret) + event.key + text.slice(caret);
      caret += 1;
    } else {
      return false;
    }
    target.setText(text);
    target.selectionStart = caret;
    target.selectionEnd = caret;
    if (this.keyboardInput) {
      this.keyboardInput.value = text;
      try {
        this.keyboardInput.setSelectionRange(caret, caret);
      } catch {
        /* ignore */
      }
    }
    target.invalidate?.();
    this.invalidate();
    return true;
  }

  addOverlay(overlay) {
    this.overlays.push(overlay);
    this.invalidate();
  }

  removeOverlay(overlay) {
    const index = this.overlays.indexOf(overlay);
    if (index >= 0) this.overlays.splice(index, 1);
    this.invalidate();
  }

  invalidate() {
    this.dirty = true;
    if (!this.frameRequested) {
      this.frameRequested = true;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => this.render());
      } else {
        setTimeout(() => this.render(), 0);
      }
    }
  }

  render() {
    this.frameRequested = false;
    if (!this.dirty) return;
    this.dirty = false;
    const ctx = this.context;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.decorView) {
      const canvas = {
        context: ctx,
        width: this.width,
        height: this.height,
        originX: 0,
        originY: 0,
        save: () => ctx.save(),
        restore: () => ctx.restore(),
        translate: (x, y) => ctx.translate(x, y),
        scale: (x, y) => ctx.scale(x, y),
        rotate: (d) => ctx.rotate((d * Math.PI) / 180),
        clipRect: (l, t, r, b) => {
          ctx.beginPath();
          ctx.rect(l, t, r - l, b - t);
          ctx.clip();
        },
        drawColor: (color) => {
          ctx.fillStyle = cssColor(color);
          ctx.fillRect(0, 0, this.width, this.height);
        },
        drawRect: (l, t, r, b, paint) => drawRectRaw(ctx, l, t, r, b, paint),
        drawRoundRect: (l, t, r, b, rx, ry, paint) => drawRoundRectRaw(ctx, l, t, r, b, rx, ry, paint),
        drawCircle: (cx, cy, radius, paint) => {
          ctx.save();
          applyPaintRaw(ctx, paint);
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          if (paint?.style === 'stroke') ctx.stroke();
          else ctx.fill();
          ctx.restore();
        },
        drawLine: (x1, y1, x2, y2, paint) => {
          ctx.save();
          applyPaintRaw(ctx, paint);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.restore();
        },
        drawText: (text, x, y, paint) => {
          ctx.save();
          applyPaintRaw(ctx, paint);
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(String(text ?? ''), x, y);
          ctx.restore();
        },
        drawBitmap: (bitmap, left, top) => {
          if (bitmap?.image) ctx.drawImage(bitmap.image, left, top, bitmap.width, bitmap.height);
        },
        drawBitmapRect: (bitmap, src, dst) => {
          if (!bitmap?.image) return;
          const sx = src ? src.left : 0;
          const sy = src ? src.top : 0;
          const sw = src ? src.width() : bitmap.width;
          const sh = src ? src.height() : bitmap.height;
          ctx.drawImage(bitmap.image, sx, sy, sw, sh, dst.left, dst.top, dst.width(), dst.height());
        },
        drawVector: (drawable, left, top, width, height) =>
          drawVectorRaw(ctx, 0, 0, drawable, left, top, width, height),
      };
      this.decorView.draw(canvas);
    }
    if (this.onDraw) this.onDraw(ctx, this);
    for (const overlay of this.overlays) {
      if (overlay.draw) overlay.draw(ctx, this);
    }
    ctx.restore();
  }
}

function drawRectRaw(ctx, l, t, r, b, paint) {
  ctx.save();
  applyPaintRaw(ctx, paint);
  if (paint?.style === 'stroke') ctx.strokeRect(l, t, r - l, b - t);
  else ctx.fillRect(l, t, r - l, b - t);
  ctx.restore();
}

function drawRoundRectRaw(ctx, l, t, r, b, rx, ry, paint) {
  ctx.save();
  applyPaintRaw(ctx, paint);
  const radiusX = Math.min(Math.abs(rx), Math.abs(r - l) / 2);
  const radiusY = Math.min(Math.abs(ry), Math.abs(b - t) / 2);
  ctx.beginPath();
  ctx.moveTo(l + radiusX, t);
  ctx.lineTo(r - radiusX, t);
  ctx.quadraticCurveTo(r, t, r, t + radiusY);
  ctx.lineTo(r, b - radiusY);
  ctx.quadraticCurveTo(r, b, r - radiusX, b);
  ctx.lineTo(l + radiusX, b);
  ctx.quadraticCurveTo(l, b, l, b - radiusY);
  ctx.lineTo(l, t + radiusY);
  ctx.quadraticCurveTo(l, t, l + radiusX, t);
  ctx.closePath();
  if (paint?.style === 'stroke') ctx.stroke();
  else ctx.fill();
  ctx.restore();
}

function applyPaintRaw(ctx, paint) {
  const p = paint || new Paint();
  ctx.fillStyle = cssColor(p.color);
  ctx.strokeStyle = cssColor(p.color);
  ctx.lineWidth = p.strokeWidth || 1;
  ctx.font = `${p.fontWeight || 'normal'} ${p.textSize}px ${p.typeface || 'sans-serif'}`;
  ctx.textAlign = p.textAlign || 'left';
  if (p.alpha !== undefined) ctx.globalAlpha = p.alpha;
}
