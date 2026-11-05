import { Paint, cssColor, measureTextWidth, wrapText } from './graphics.js';
import {
  MeasureSpec,
  VISIBILITY,
  View,
  colorToCss,
  getChildMeasureSpec,
  resolveSize,
} from './view.js';
import { convertDimension } from './resources.js';

const CENTER = 0x11;

function vectorIntrinsicSize(drawable) {
  const xml = drawable?.xml;
  if (!xml || xml.name !== 'vector') return null;
  const attrs = xml.attrs || [];
  const find = (name) => attrs.find((a) => a.name === name);
  const w = find('width');
  const h = find('height');
  if (!w || !h) return null;
  const density = drawable.density || 1;
  const width = convertDimension(w.value, density);
  const height = convertDimension(h.value, density);
  if (!width || !height) return null;
  return { width, height };
}

const FRAMEWORK_TEXT_COLOR_KEYS = new Map([
  [0x01010036, 'textColorPrimary'],
  [0x01010037, 'textColorSecondary'],
  [0x01010038, 'textColorTertiary'],
  [0x01010039, 'textColorPrimaryInverse'],
  [0x0101003a, 'textColorSecondaryInverse'],
  [0x01010099, 'textColorHighlight'],
  [0x0101009a, 'textColorHint'],
  [0x0101009b, 'textColorLink'],
]);

function resolveFrameworkTextColor(view, color) {
  const value = color >>> 0;
  if (value < 0x01010000 || value >= 0x02000000) return value;
  const key = FRAMEWORK_TEXT_COLOR_KEYS.get(value);
  const vm = view?.$vm || view?.vm;
  const store = vm?.themeAttributes;
  if (!key || !store) return value;
  const refId = store.$attrReferences?.[key];
  const list = refId ? vm.resources?.getColorStateList?.(refId) : null;
  const resolved = typeof list?.color === 'number' ? list.color : store[key];
  return typeof resolved === 'number' ? resolved >>> 0 : value;
}

const VIEW_STATE_IDS = {
  selected: 0x010100a1,
  pressed: 0x010100a7,
  focused: 0x0101009c,
  enabled: 0x0101009e,
  hovered: 0x01010367,
  activated: 0x010102fe,
  checked: 0x010100a0,
};

function viewStateSet(view) {
  const set = [];
  if (!view) return set;
  if (view.selected) set.push(VIEW_STATE_IDS.selected);
  if (view.pressed) set.push(VIEW_STATE_IDS.pressed);
  if (view.focused) set.push(VIEW_STATE_IDS.focused);
  if (view.hovered) set.push(VIEW_STATE_IDS.hovered);
  if (view.activated) set.push(VIEW_STATE_IDS.activated);
  if (view.checked) set.push(VIEW_STATE_IDS.checked);
  set.push(VIEW_STATE_IDS.enabled);
  return set;
}

function unwrapStateArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.$data)) return value.$data;
  if (Array.isArray(value?.data)) return value.data;
  return null;
}

export function resolveStateListColor(list, stateSet = []) {
  if (!list) return undefined;
  const source = list.$peer || list;
  const states = unwrapStateArray(source.states ?? source.$fields?.get?.('states'));
  const colors = unwrapStateArray(source.colors ?? source.$fields?.get?.('colors'));
  if (!Array.isArray(states) || !Array.isArray(colors) || !states.length) {
    const fallback = source.color ?? source.defaultColor;
    return typeof fallback === 'number' ? fallback >>> 0 : undefined;
  }
  const requested = stateSet.map((s) => Math.abs(s | 0));
  let bestIndex = -1;
  let bestLen = -1;
  for (let i = 0; i < states.length; i++) {
    const spec = unwrapStateArray(states[i]) || [];
    let matches = true;
    for (const entry of spec) {
      const state = entry | 0;
      if (state === 0) continue;
      const key = Math.abs(state);
      if ((state > 0) !== requested.includes(key)) {
        matches = false;
        break;
      }
    }
    if (matches && spec.length > bestLen) {
      bestLen = spec.length;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) bestIndex = states.length - 1;
  const color = colors[bestIndex];
  return typeof color === 'number' ? color >>> 0 : undefined;
}

export class TextView extends View {
  constructor(context = null) {
    super(context);
    this.text = '';
    this.textPaint = new Paint();
    this.textPaint.color = 0xff000000;
    const defaultTextSize = 14 * this.getDensity();
    this.textPaint.textSize = defaultTextSize;
    this.textSize = defaultTextSize;
    this.textColor = 0xff000000;
    this.hintText = null;
    this.hintColor = 0x80808080;
    this.gravity = 0x800003;
    this.maxLines = 0;
    this.singleLine = false;
    this.textAllCaps = false;
    this.lineSpacingExtra = 0;
    this.lineSpacingMultiplier = 1;
    this.letterSpacing = 0;
    this.typeface = 'Noto Sans CJK SC';
    this.textStyle = 0;
    this.paddingLeft = 0;
    this.paddingTop = 0;
    this.paddingRight = 0;
    this.paddingBottom = 0;
    this.compoundDrawables = [null, null, null, null];
    this.compoundDrawablePadding = 0;
    this.textShadow = null;
    this.lines = [];
    this.layoutDirty = true;
  }

  setText(text) {
    const normalized = text === null || text === undefined ? '' : String(text);
    if (normalized === this.text) return;
    this.text = normalized;
    this.layoutDirty = true;
    this.requestLayout();
    this.invalidate();
    return this;
  }

  getText() {
    return this.text;
  }

  getTextString() {
    return this.text;
  }

  setTextSize(size) {
    this.textSize = Number(size) || 0;
    this.textPaint.textSize = this.textSize;
    this.layoutDirty = true;
    this.requestLayout();
    return this;
  }

  setTextSizeUnit(unit, size) {
    return this.setTextSize(convertDimension({ dimension: { value: size, unit } }, 1));
  }

  getTextSize() {
    return this.textSize;
  }

  setTextColor(color) {
    this.textColor = color >>> 0;
    this.textPaint.color = this.textColor;
    this.invalidate();
    return this;
  }

  getTextColor() {
    return this.textColor;
  }

  setHint(text) {
    this.hintText = text;
    this.invalidate();
    return this;
  }

  setHintTextColor(color) {
    this.hintColor = color >>> 0;
    this.invalidate();
    return this;
  }

  setGravity(gravity) {
    this.gravity = gravity;
    this.layoutDirty = true;
    this.requestLayout();
    return this;
  }

  setMaxLines(lines) {
    this.maxLines = lines;
    this.layoutDirty = true;
    this.requestLayout();
    return this;
  }

  setLines(lines) {
    this.maxLines = lines;
    return this;
  }

  setSingleLine(value = true) {
    this.singleLine = !!value;
    this.layoutDirty = true;
    this.requestLayout();
    return this;
  }

  setTextAllCaps(value) {
    this.textAllCaps = !!value;
    this.layoutDirty = true;
    return this;
  }

  setAllCaps(value) {
    return this.setTextAllCaps(value);
  }

  setLetterSpacing(value) {
    this.letterSpacing = Number(value) || 0;
    this.textPaint.letterSpacing = this.letterSpacing * this.textSize;
    this.layoutDirty = true;
    this.requestLayout();
    return this;
  }

  setTypeface(typeface, style) {
    this.typeface = typeface || 'Noto Sans CJK SC';
    this.textPaint.typeface = this.typeface;
    if (style !== undefined) this.setTextStyle(style);
    return this;
  }

  setTextStyle(style) {
    this.textStyle = style;
    this.textPaint.fontWeight = (style & 1) === 1 ? 'bold' : 'normal';
    this.textPaint.fontStyle = (style & 2) === 2 ? 'italic' : 'normal';
    this.layoutDirty = true;
    this.requestLayout();
    return this;
  }

  setLineSpacing(extra, multiplier) {
    this.lineSpacingExtra = extra;
    this.lineSpacingMultiplier = multiplier;
    this.layoutDirty = true;
    this.requestLayout();
    return this;
  }

  setCompoundDrawables(left, top, right, bottom) {
    this.compoundDrawables = [left, top, right, bottom];
    this.requestLayout();
    return this;
  }

  setCompoundDrawablePadding(padding) {
    this.compoundDrawablePadding = padding;
    return this;
  }

  setShadowLayer(radius, dx, dy, color) {
    this.textShadow = { radius, dx, dy, color };
    this.invalidate();
    return this;
  }

  getPaint() {
    return this.textPaint;
  }

  getTextPaint() {
    return this.textPaint;
  }

  getCurrentTextColor() {
    return this.textColor;
  }

  append(text) {
    return this.setText(this.text + text);
  }

  length() {
    return this.text.length;
  }

  getLineCount() {
    this.ensureTextLayout(this.getWidth() || this.measuredWidth || 0);
    return this.lines.length;
  }

  ensureTextLayout(maxWidth) {
    const content = this.textAllCaps ? this.text.toUpperCase() : this.text;
    const display = content.length ? content : (this.hintText || '');
    const available = Math.max(1, maxWidth - this.paddingLeft - this.paddingRight);
    if (globalThis.__TXT && maxWidth > 100) console.error('TXLAY maxW=' + maxWidth + ' padL=' + this.paddingLeft + ' padR=' + this.paddingRight + ' avail=' + available + ' size=' + this.textSize + ' text=' + JSON.stringify(String(this.text).slice(0,20)));
    if (!this.layoutDirty && this.lastLayoutWidth === available) return;
    this.lastLayoutWidth = available;
    this.lines = this.singleLine ? [display.replace(/\n/g, ' ')] : wrapText(display, this.textSize, available, this.typeface);
    this.layoutDirty = false;
  }

  onMeasure(widthSpec, heightSpec) {
    const display = this.textAllCaps ? this.text.toUpperCase() : this.text || this.hintText || '';
    const desiredWidth = Math.ceil(measureTextWidth(display, this.textSize, this.typeface) + this.paddingLeft + this.paddingRight);
    const lineHeight = Math.ceil(this.textSize * 1.35);
    const widthMode = MeasureSpec.getMode(widthSpec);
    const heightMode = MeasureSpec.getMode(heightSpec);
    let width = desiredWidth;
    if (widthMode === MeasureSpec.EXACTLY) width = MeasureSpec.getSize(widthSpec);
    else if (widthMode === MeasureSpec.AT_MOST) width = Math.min(desiredWidth, MeasureSpec.getSize(widthSpec));
    width = Math.max(width, this.minWidth + this.paddingLeft + this.paddingRight);
    this.ensureTextLayout(width);
    const lines = Math.max(1, this.lines.length);
    let height = Math.ceil(lines * lineHeight * this.lineSpacingMultiplier + this.lineSpacingExtra * (lines - 1)) + this.paddingTop + this.paddingBottom;
    if (heightMode === MeasureSpec.EXACTLY) height = MeasureSpec.getSize(heightSpec);
    else if (heightMode === MeasureSpec.AT_MOST) height = Math.min(height, MeasureSpec.getSize(heightSpec));
    height = Math.max(height, this.minHeight + this.paddingTop + this.paddingBottom);
    if (globalThis.__TXT && this.text === 'apk.js Browser') console.error('TXMEAS w=' + width + ' h=' + height + ' lines=' + this.lines.length + ' lh=' + lineHeight + ' minH=' + this.minHeight + ' padT=' + this.paddingTop + ' padB=' + this.paddingBottom + ' hMode=' + heightMode + ' hSize=' + MeasureSpec.getSize(heightSpec));
    this.setMeasuredDimension(width, height);
  }

  onDraw(canvas) {
    if (globalThis.__TXT) console.error('TXDRAW left=' + this.left + ' top=' + this.top + ' w=' + this.getWidth() + ' h=' + this.getHeight() + ' text=' + JSON.stringify(String(this.text).slice(0,20)));
    const width = this.getWidth();
    const height = this.getHeight();
    this.ensureTextLayout(width);
    const display = this.textAllCaps ? this.text.toUpperCase() : this.text;
    const paint = this.textPaint;
    paint.textSize = this.textSize;
    paint.typeface = this.typeface;
    if (this.textShadow) {
      paint.shadow = this.textShadow;
    } else {
      paint.shadow = null;
    }
    if (!display && this.hintText) {
      paint.color = this.hintColor;
    } else if (this.$textColorStateList) {
      const stateColor = resolveStateListColor(this.$textColorStateList, viewStateSet(this));
      paint.color = typeof stateColor === 'number'
        ? stateColor
        : (this.enabled ? resolveFrameworkTextColor(this, this.textColor) : 0x61000000);
    } else {
      paint.color = this.enabled ? resolveFrameworkTextColor(this, this.textColor) : 0x61000000;
    }
    const lineHeight = this.textSize * 1.35 * this.lineSpacingMultiplier + this.lineSpacingExtra;
    const totalTextHeight = this.lines.length * lineHeight;
    let y = this.paddingTop;
    const gravity = this.gravity;
    if ((gravity & 0x10) === 0x10) {
      y = this.paddingTop + Math.max(0, (height - this.paddingTop - this.paddingBottom - totalTextHeight) / 2);
    } else if ((gravity & 0x50) === 0x50) {
      y = height - this.paddingBottom - totalTextHeight;
    }
    y += this.textSize;
    const contentLines = display || this.hintText ? this.lines : [];
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];
      const lineWidth = measureTextWidth(line, this.textSize, this.typeface);
      let x = this.paddingLeft;
      if ((gravity & 0x07) === 0x01) {
        x = this.paddingLeft + (width - this.paddingLeft - this.paddingRight - lineWidth) / 2;
      } else if ((gravity & 0x07) === 0x05) {
        x = width - this.paddingRight - lineWidth;
      }
      canvas.drawText(line, x, y + i * lineHeight, paint);
    }

    for (let i = 0; i < 4; i++) {
      const drawable = this.compoundDrawables[i];
      if (drawable?.bitmap?.image) {
        const bitmap = drawable.bitmap;
        if (i === 0) canvas.drawBitmap(bitmap, this.paddingLeft, (height - bitmap.height) / 2, null);
        else if (i === 3) canvas.drawBitmap(bitmap, width - this.paddingRight - bitmap.width, (height - bitmap.height) / 2, null);
      }
    }
  }
}

export class Button extends TextView {
  constructor(context = null) {
    super(context);
    this.clickable = true;
    this.focusable = true;
    this.textAllCaps = false;
    this.textColor = 0xff1a73e8;
    this.textSize = 15;
    this.gravity = CENTER;
    this.minHeight = 40;
    this.background = { type: 'shape', xml: defaultButtonShape() };
    this.pressedScale = 1;
    this.backgroundTint = null;
  }

  performClick() {
    const result = super.performClick();
    if (result) {
      this.pressedScale = 0.97;
      setTimeout(() => {
        this.pressedScale = 1;
        this.invalidate();
      }, 110);
    }
    return result;
  }

  onDraw(canvas) {
    super.onDraw(canvas);
  }
}

export class EditText extends TextView {
  constructor(context = null) {
    super(context);
    this.editable = true;
    this.hintText = '';
    this.inputType = 1;
    this.focused = false;
    this.focusable = true;
    this.focusableInTouchMode = true;
    this.clickable = true;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.showCursor = false;
    this.cursorVisible = true;
    this.cursorBlinkTimer = null;
  }

  onTouchEvent(event) {
    if (!this.enabled) return super.onTouchEvent(event);
    if (event.action === 'down') {
      this.requestFocus();
      this.showKeyboard();
      this.pressed = true;
      return true;
    }
    if (event.action === 'up') {
      this.pressed = false;
      this.invalidate();
      return true;
    }
    return super.onTouchEvent(event);
  }

  requestFocus() {
    const focused = super.requestFocus();
    if (focused) {
      this.selectionStart = this.selectionEnd = this.getText().length;
      this.startCursorBlink();
    }
    return focused;
  }

  clearFocus() {
    const had = this.focused;
    super.clearFocus();
    if (had) {
      this.showCursor = false;
      this.stopCursorBlink();
    }
  }

  startCursorBlink() {
    this.showCursor = true;
    this.cursorVisible = true;
    this.stopCursorBlink();
    if (typeof setInterval === 'function') {
      this.cursorBlinkTimer = setInterval(() => {
        this.cursorVisible = !this.cursorVisible;
        this.invalidate();
      }, 500);
    }
  }

  stopCursorBlink() {
    if (this.cursorBlinkTimer !== null) {
      clearInterval(this.cursorBlinkTimer);
      this.cursorBlinkTimer = null;
    }
  }

  showKeyboard() {
    const screen = this.vm?.screen;
    if (screen?.showKeyboard) {
      screen.showKeyboard(this);
    }
  }

  getSelectionStart() {
    return this.selectionStart ?? this.getText().length;
  }

  getSelectionEnd() {
    return this.selectionEnd ?? this.getText().length;
  }

  setSelection(index) {
    const length = this.getText().length;
    const clamped = Math.max(0, Math.min(length, index | 0));
    this.selectionStart = clamped;
    this.selectionEnd = clamped;
    this.invalidate();
  }

  onDraw(canvas) {
    super.onDraw(canvas);
    if (!this.showCursor || !this.cursorVisible) return;
    const ctx = canvas.context;
    if (!ctx) return;
    const text = this.getText() || '';
    const caret = Math.min(this.selectionEnd ?? text.length, text.length);
    const measured = measureTextWidth(text.slice(0, caret), this.textSize, this.typeface);
    const x = this.paddingLeft + measured;
    const height = this.textSize * 1.2;
    const top = Math.max(this.paddingTop, (this.getHeight() - height) / 2);
    ctx.save();
    ctx.fillStyle = cssColor(this.textColor, 0.85);
    ctx.fillRect(x, top, Math.max(1, this.textSize * 0.06), height);
    ctx.restore();
  }
}

export class ImageView extends View {
  constructor(context = null) {
    super(context);
    this.drawable = null;
    this.scaleType = 'fitCenter';
  }

  setImageDrawable(drawable) {
    this.drawable = drawable;
    this.invalidate();
    return this;
  }

  setImageResource(resId) {
    const resources = this.getResources();
    if (resources) this.drawable = resources.getDrawable(resId);
    this.invalidate();
    return this;
  }

  setImageBitmap(bitmap) {
    this.drawable = { type: 'bitmap', bitmap };
    this.invalidate();
    return this;
  }

  setScaleType(scaleType) {
    this.scaleType = scaleType;
    return this;
  }

  getDrawable() {
    return this.drawable;
  }

  drawableIntrinsicSize() {
    const drawable = this.drawable;
    if (!drawable || typeof drawable !== 'object' || drawable.type || !drawable.$peer) return null;
    const vm = this.$vm || this.vm;
    if (!vm?.invokeByName) return null;
    try {
      const width = Number(vm.invokeByName('getIntrinsicWidth', '()I', drawable, []));
      const height = Number(vm.invokeByName('getIntrinsicHeight', '()I', drawable, []));
      if (width > 0 && height > 0) return { width, height };
    } catch (_) {}
    return null;
  }

  onMeasure(widthSpec, heightSpec) {
    const bitmap = this.drawable?.bitmap;
    const intrinsic = bitmap ? null : (vectorIntrinsicSize(this.drawable) || this.drawableIntrinsicSize());
    const desiredWidth = (bitmap?.width || intrinsic?.width || 0) + this.paddingLeft + this.paddingRight;
    const desiredHeight = (bitmap?.height || intrinsic?.height || 0) + this.paddingTop + this.paddingBottom;
    let width = desiredWidth;
    let height = desiredHeight;
    if (MeasureSpec.getMode(widthSpec) === MeasureSpec.EXACTLY) width = MeasureSpec.getSize(widthSpec);
    else if (MeasureSpec.getMode(widthSpec) === MeasureSpec.AT_MOST) width = Math.min(desiredWidth, MeasureSpec.getSize(widthSpec));
    if (MeasureSpec.getMode(heightSpec) === MeasureSpec.EXACTLY) height = MeasureSpec.getSize(heightSpec);
    else if (MeasureSpec.getMode(heightSpec) === MeasureSpec.AT_MOST) height = Math.min(desiredHeight, MeasureSpec.getSize(heightSpec));
    this.setMeasuredDimension(width, height);
  }

  onDraw(canvas) {
    const drawable = this.drawable;
    if (!drawable) return;
    if (typeof drawable === 'object' && drawable.$peer && !drawable.type) {
      const vm = this.$vm || this.vm;
      if (vm?.invokeByName) {
        try {
          vm.invokeByName('setBounds', '(IIII)V', drawable, [0, 0, this.getWidth(), this.getHeight()]);
          vm.invokeByName('draw', '(Landroid/graphics/Canvas;)V', drawable, [this.canvasObject(canvas)]);
        } catch (_) {}
      }
      return;
    }
    if (drawable.type === 'color') {
      canvas.context.save();
      canvas.context.fillStyle = cssColor(drawable.color);
      canvas.context.fillRect(0, 0, this.getWidth(), this.getHeight());
      canvas.context.restore();
      return;
    }
    if (drawable.type === 'xml' && drawable.xml?.name === 'vector') {
      const vw = this.getWidth();
      const vh = this.getHeight();
      const intrinsic = vectorIntrinsicSize(drawable);
      if (!intrinsic) {
        canvas.drawVector(drawable, 0, 0, vw, vh);
        return;
      }
      const scale = Math.min(vw / intrinsic.width, vh / intrinsic.height);
      const dw = intrinsic.width * scale;
      const dh = intrinsic.height * scale;
      canvas.drawVector(drawable, (vw - dw) / 2, (vh - dh) / 2, dw, dh);
      return;
    }
    const bitmap = drawable.bitmap;
    if (!bitmap?.image) return;
    const width = this.getWidth();
    const height = this.getHeight();
    const scale = Math.min(width / bitmap.width, height / bitmap.height);
    const drawWidth = bitmap.width * scale;
    const drawHeight = bitmap.height * scale;
    canvas.drawBitmapRect(
      bitmap,
      null,
      { left: (width - drawWidth) / 2, top: (height - drawHeight) / 2, width: () => drawWidth, height: () => drawHeight },
      null
    );
  }
}

export class ProgressBar extends View {
  constructor(context = null) {
    super(context);
    this.progress = 0;
    this.max = 100;
    this.indeterminate = false;
  }

  setProgress(value) {
    this.progress = value;
    this.invalidate();
    return this;
  }

  getProgress() {
    return this.progress;
  }

  setMax(value) {
    this.max = value;
    return this;
  }

  onMeasure(widthSpec, heightSpec) {
    this.setMeasuredDimension(
      resolveSize(200, widthSpec),
      resolveSize(6, heightSpec)
    );
  }

  onDraw(canvas) {
    const width = this.getWidth();
    const height = this.getHeight();
    canvas.context.save();
    canvas.context.fillStyle = 'rgba(0,0,0,0.12)';
    canvas.context.fillRect(0, 0, width, height);
    const fraction = Math.max(0, Math.min(1, this.progress / (this.max || 1)));
    canvas.context.fillStyle = '#1a73e8';
    canvas.context.fillRect(0, 0, width * fraction, height);
    canvas.context.restore();
  }
}

export class ScrollView extends View {
  constructor(context = null) {
    super(context);
    this.child = null;
    this.scrollX = 0;
    this.scrollY = 0;
    this.scrollRange = 0;
  }

  addView(child) {
    this.child = child;
    child.parent = this;
    this.requestLayout();
    return this;
  }

  getChildCount() {
    return this.child ? 1 : 0;
  }

  getChildAt(index) {
    return index === 0 ? this.child : null;
  }

  onMeasure(widthSpec, heightSpec) {
    const width = MeasureSpec.getSize(widthSpec);
    const height = MeasureSpec.getSize(heightSpec);
    if (this.child) {
      this.child.measure(
        MeasureSpec.makeMeasureSpec(Math.max(0, width - this.paddingLeft - this.paddingRight), MeasureSpec.AT_MOST),
        MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED)
      );
    }
    this.setMeasuredDimension(width, height);
  }

  onLayout(changed, left, top, right, bottom) {
    if (this.child) {
      this.child.layout(
        this.paddingLeft,
        this.paddingTop,
        this.paddingLeft + this.child.getMeasuredWidth(),
        this.paddingTop + this.child.getMeasuredHeight()
      );
      this.scrollRange = Math.max(0, this.child.getMeasuredHeight() - (bottom - top));
    }
  }

  scrollTo(x, y) {
    this.scrollX = x;
    this.scrollY = Math.max(0, Math.min(this.scrollRange, y));
    this.invalidate();
  }

  findViewById(id) {
    if (this.id === id) return this;
    return this.child ? this.child.findViewById(id) : null;
  }

  dispatchDraw(canvas) {
    if (!this.child) return;
    canvas.save();
    canvas.translate(0, -this.scrollY);
    this.child.draw(canvas);
    canvas.restore();
  }

  dispatchTouchEvent(event) {
    if (this.visibility !== VISIBILITY.VISIBLE) return false;
    if (this.listeners.touch && this.listeners.touch(this, event)) return true;
    if (this.onTouchEvent(event)) return true;
    if (this.child && this.child.visibility === VISIBILITY.VISIBLE) {
      const x = event.x - this.child.left - this.child.translationX;
      const y = event.y - this.child.top - this.child.translationY + this.scrollY;
      if (x >= 0 && y >= 0 && x < this.child.getWidth() && y < this.child.getHeight()) {
        if (this.child.dispatchTouchEvent({ ...event, x, y })) return true;
      }
    }
    return false;
  }
}

function defaultButtonShape() {
  return {
    type: 'element',
    name: 'shape',
    attrs: [],
    children: [
      {
        type: 'element',
        name: 'solid',
        attrs: [{ name: 'color', value: '#FFE8F0FE' }],
        children: [],
      },
      {
        type: 'element',
        name: 'corners',
        attrs: [{ name: 'radius', value: '20dp' }],
        children: [],
      },
    ],
  };
}

export class WebView extends View {
  constructor(context = null) {
    super(context);
    this.url = '';
    this.html = '';
    this.title = '';
    this.webViewClient = null;
    this.webChromeClient = null;
    this.settings = {
      javaScriptEnabled: false,
      domStorageEnabled: false,
      databaseEnabled: false,
      useWideViewPort: false,
      loadWithOverviewMode: false,
      supportZoom: true,
      builtInZoomControls: false,
      displayZoomControls: true,
      setAllowFileAccessFromFileURLs: false,
      setAllowUniversalAccessFromFileURLs: false,
      javaScriptCanOpenWindowsAutomatically: false,
      loadsImagesAutomatically: true,
      mediaPlaybackRequiresUserGesture: true,
      mixedContentMode: 0,
      appCacheEnabled: false,
      cacheMode: -1,
      textZoom: 100,
      userAgentString: 'Mozilla/5.0 (Linux; Android 12; Browser) AppleWebKit/537.36',
    };
  }

  loadUrl(url) {
    this.url = String(url ?? '');
    this.onPageStarted(this.url);
    this.invalidate();
    return this;
  }

  loadData(data, mimeType, encoding) {
    this.html = String(data ?? '');
    this.onPageStarted('about:blank');
    this.invalidate();
    return this;
  }

  loadDataWithBaseURL(baseUrl, data, mimeType, encoding, historyUrl) {
    this.url = String(baseUrl ?? '');
    this.html = String(data ?? '');
    this.onPageStarted(this.url);
    this.invalidate();
    return this;
  }

  reload() {
    return this;
  }

  onPageStarted(url) {
    const client = this.webViewClient;
    if (client && typeof client.onPageStarted === 'function') {
      client.onPageStarted(this, url);
    }
  }

  getUrl() {
    return this.url;
  }

  getTitle() {
    return this.title;
  }

  onMeasure(widthSpec, heightSpec) {
    const width = resolveSize(320, widthSpec);
    const height = resolveSize(480, heightSpec);
    this.setMeasuredDimension(width, height);
  }

  onDraw(canvas) {
    const width = this.getWidth();
    const height = this.getHeight();
    const ctx = canvas.context;
    ctx.save();
    ctx.fillStyle = '#ffffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ff5f6368';
    const paint = new Paint();
    paint.textSize = 14;
    paint.color = 0xff5f6368;
    const label = this.title || this.url || 'WebView';
    canvas.drawText(label, 12, Math.min(height, 30), paint);
    ctx.restore();
  }
}
