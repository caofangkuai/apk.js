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
import { drawDrawable } from './drawables.js';

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
    this.ellipsize = null;
    this.includeFontPadding = true;
    this.singleLine = false;
    this.textAllCaps = false;
    this.lineSpacingExtra = 0;
    this.lineSpacingMultiplier = 1;
    this.letterSpacing = 0;
    this.textScaleX = 1;
    this.textSkewX = 0;
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

  fontSpec() {
    const style = this.textStyle | 0;
    return (style & 2 ? 'italic ' : '') + (style & 1 ? 'bold ' : '') + (this.typeface || 'Noto Sans CJK SC');
  }

  measureText(text, size = this.textSize) {
    const value = String(text ?? '');
    const spacing = (Number(this.letterSpacing) || 0) * size;
    return measureTextWidth(value, size, this.fontSpec()) * (Number(this.textScaleX) || 1) + (spacing && value.length > 1 ? spacing * (value.length - 1) : 0);
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

  setEllipsize(where) {
    this.ellipsize = where ?? null;
    this.layoutDirty = true;
    this.requestLayout();
    return this;
  }

  getEllipsize() {
    return this.ellipsize ?? null;
  }

  setIncludeFontPadding(value) {
    this.includeFontPadding = !!value;
    this.layoutDirty = true;
    this.requestLayout();
    return this;
  }

  textLineMetrics() {
    const paint = this.textPaint;
    paint.textSize = this.textSize;
    const metrics = paint.getFontMetricsInt();
    const pitch = Math.max(1, Math.round((metrics.descent - metrics.ascent) * this.lineSpacingMultiplier + this.lineSpacingExtra));
    const topPadding = this.includeFontPadding ? Math.max(0, -metrics.top) : Math.max(0, -metrics.ascent);
    const bottomPadding = this.includeFontPadding ? Math.max(0, metrics.bottom - metrics.descent) : 0;
    return {
      ascent: metrics.ascent,
      descent: metrics.descent,
      top: metrics.top,
      bottom: metrics.bottom,
      leading: metrics.leading,
      pitch,
      topPadding,
      bottomPadding,
      firstBaseline: (this.includeFontPadding ? -metrics.top : -metrics.ascent),
    };
  }

  lineHeightPx() {
    return this.textLineMetrics().pitch;
  }

  getBaseline() {
    const { firstBaseline } = this.textLineMetrics();
    return Math.round(this.paddingTop + (this.includeFontPadding ? firstBaseline : firstBaseline));
  }

  getLineHeight() {
    return Math.round(this.lineHeightPx());
  }

  getLineCount() {
    this.ensureTextLayout(this.getWidth() || this.measuredWidth || 0);
    return this.lines.length;
  }

  compoundWidth(which) {
    let width = 0;
    for (const index of which) {
      const drawable = this.compoundDrawables[index];
      const size = drawable ? vectorIntrinsicSize(drawable) : null;
      const drawableWidth = size?.width || drawable?.bitmap?.width || drawable?.$peer?.intrinsicWidth || 0;
      if (drawableWidth > 0) {
        width += drawableWidth + this.compoundDrawablePadding;
      }
    }
    return width;
  }

  ellipsizeLine(text, maxWidth, force = false) {
    if (!text && !force) return text;
    if (this.ellipsize === null || this.ellipsize === undefined) return text;
    if (!force && this.measureText(text) <= maxWidth) return text;
    const ellipsis = '\u2026';
    const chars = Array.from(text);
    let width = 0;
    const ellipsisWidth = this.measureText(ellipsis);
    let out = '';
    for (const char of chars) {
      const charWidth = this.measureText(char);
      if (width + charWidth + ellipsisWidth > maxWidth) break;
      out += char;
      width += charWidth;
    }
    return out + ellipsis;
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

  setTextScaleX(value) {
    this.textScaleX = Number(value) || 1;
    this.layoutDirty = true;
    this.requestLayout();
    return this;
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

  ensureTextLayout(maxWidth) {
    const content = this.textAllCaps ? this.text.toUpperCase() : this.text;
    const display = content.length ? content : (this.hintText || '');
    const compound = this.compoundPadding();
    const available = Math.max(1, maxWidth - compound.left - compound.right);
    if (!this.layoutDirty && this.lastLayoutWidth === available) return;
    this.lastLayoutWidth = available;
    let lines = this.singleLine ? [display.replace(/\n/g, ' ')] : wrapText(display, this.textSize, available, this.fontSpec());
    if (this.maxLines > 0 && lines.length > this.maxLines) {
      lines = lines.slice(0, this.maxLines);
      const lastIndex = lines.length - 1;
      lines[lastIndex] = this.ellipsizeLine(lines[lastIndex], available, true);
    }
    this.lines = lines;
    this.layoutDirty = false;
  }

  onMeasure(widthSpec, heightSpec) {
    const display = this.textAllCaps ? this.text.toUpperCase() : this.text || this.hintText || '';
    const compoundLeft = this.compoundWidth([0]);
    const compoundRight = this.compoundWidth([2]);
    const compoundPadding = this.compoundPadding();
    const desiredWidth = Math.ceil(
      this.measureText(display)
      + compoundPadding.left + compoundPadding.right + compoundLeft + compoundRight,
    );
    const textMetrics = this.textLineMetrics();
    const widthMode = MeasureSpec.getMode(widthSpec);
    const heightMode = MeasureSpec.getMode(heightSpec);
    let width = desiredWidth;
    if (widthMode === MeasureSpec.EXACTLY) width = MeasureSpec.getSize(widthSpec);
    else if (widthMode === MeasureSpec.AT_MOST) width = Math.min(desiredWidth, MeasureSpec.getSize(widthSpec));
    width = Math.max(width, this.minWidth + this.paddingLeft + this.paddingRight);
    this.ensureTextLayout(width);
    const lines = Math.max(1, this.lines.length);
    const textHeight = (this.includeFontPadding ? textMetrics.bottom - textMetrics.top : textMetrics.descent - textMetrics.ascent) + (lines - 1) * textMetrics.pitch;
    let height = Math.ceil(Math.max(textMetrics.pitch, textHeight)) + compoundPadding.top + compoundPadding.bottom;
    if (heightMode === MeasureSpec.EXACTLY) height = MeasureSpec.getSize(heightSpec);
    else if (heightMode === MeasureSpec.AT_MOST) height = Math.min(height, MeasureSpec.getSize(heightSpec));
    height = Math.max(height, this.minHeight + compoundPadding.top + compoundPadding.bottom);
    this.setMeasuredDimension(width, height);
  }

  onDraw(canvas) {
    const width = this.getWidth();
    const height = this.getHeight();
    this.ensureTextLayout(width);
    const display = this.textAllCaps ? this.text.toUpperCase() : this.text;
    const paint = this.textPaint;
    paint.textSize = this.textSize;
    paint.typeface = this.fontSpec();
    paint.textScaleX = Number(this.textScaleX) || 1;
    paint.textSkewX = Number(this.textSkewX) || 0;
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
    const metrics = this.textLineMetrics();
    const paintMetrics = paint.getFontMetricsInt();
    const lineHeight = metrics.pitch;
    const firstBaselineOffset = metrics.firstBaseline;
    const compoundPadding = this.compoundPadding();
    const compoundLeftDrawable = this.compoundWidth([0]);
    const compoundRightDrawable = this.compoundWidth([2]);
    const boxHeight = height - compoundPadding.top - compoundPadding.bottom;
    const textHeight = (this.includeFontPadding ? metrics.bottom - metrics.top : metrics.descent - metrics.ascent) + (this.lines.length - 1) * metrics.pitch;
    const layoutHeight = Math.max(lineHeight, textHeight);
    const gravity = this.gravity;
    let voffset = 0;
    if ((gravity & 0x70) !== 0x30 && layoutHeight < boxHeight) {
      if ((gravity & 0x70) === 0x50) voffset = boxHeight - layoutHeight;
      else if ((gravity & 0x70) === 0x10) voffset = Math.floor((boxHeight - layoutHeight) / 2);
    }
    const contentLines = display || this.hintText ? this.lines : [];
    const ctx = canvas.context;
    if (ctx) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        compoundPadding.left,
        compoundPadding.top,
        Math.max(0, width - compoundPadding.left - compoundPadding.right),
        Math.max(0, boxHeight),
      );
      ctx.clip();
    }
    const baseLeft = compoundPadding.left + compoundLeftDrawable;
    const baseRight = width - compoundPadding.right - compoundRightDrawable;
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];
      const lineWidth = this.measureText(line);
      let x = baseLeft;
      if ((gravity & 0x07) === 0x01) {
        x = baseLeft + (baseRight - baseLeft - lineWidth) / 2;
      } else if ((gravity & 0x07) === 0x05) {
        x = baseRight - lineWidth;
      }
      const baseline = compoundPadding.top + voffset + firstBaselineOffset + i * lineHeight;
      canvas.drawText(line, x, baseline, paint);
    }
    if (ctx) ctx.restore();

    for (let i = 0; i < 4; i++) {
      const drawable = this.compoundDrawables[i];
      if (drawable?.bitmap?.image) {
        const bitmap = drawable.bitmap;
        if (i === 0) canvas.drawBitmap(bitmap, this.paddingLeft, (height - bitmap.height) / 2, null);
        else if (i === 3) canvas.drawBitmap(bitmap, width - this.paddingRight - bitmap.width, (height - bitmap.height) / 2, null);
        else if (i === 1) canvas.drawBitmap(bitmap, (width - bitmap.width) / 2, this.paddingTop, null);
      }
    }
  }
}

export class Button extends TextView {
  constructor(context = null) {
    super(context);
    this.clickable = true;
    this.focusable = true;
    this.textAllCaps = true;
    this.textSize = 14 * this.getDensity();
    this.textPaint.textSize = this.textSize;
    this.textColor = themeColorOf(this, 'textColorPrimary', 0xde000000);
    this.gravity = CENTER;
    this.minHeight = Math.round(48 * this.getDensity());
    this.minWidth = Math.round(88 * this.getDensity());
    this.background = defaultButtonBackground(this);
    this.pressedScale = 1;
    this.backgroundTint = null;
    this.layoutDirty = true;
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

const SCALE_TYPES = ['matrix', 'fitXY', 'fitStart', 'fitCenter', 'fitEnd', 'center', 'centerCrop', 'centerInside'];
const SCALE_ORDINALS = {
  0: 'matrix', 1: 'fitXY', 2: 'fitStart', 3: 'fitCenter', 4: 'fitEnd', 5: 'center', 6: 'centerCrop', 7: 'centerInside',
};

function normalizeScaleType(value) {
  if (value === null || value === undefined) return 'fitCenter';
  if (typeof value === 'number') return SCALE_ORDINALS[value] || 'fitCenter';
  const text = String(value);
  if (/^\d+$/.test(text)) return SCALE_ORDINALS[Number(text)] || 'fitCenter';
  const index = SCALE_TYPES.findIndex((name) => name.toLowerCase() === text.toLowerCase().replace(/[_-]/g, ''));
  if (index >= 0) return SCALE_TYPES[index];
  return 'fitCenter';
}

function createOffscreenContext(sourceCtx, width, height) {
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      return canvas.getContext('2d');
    }
    const Ctor = sourceCtx?.canvas?.constructor;
    if (Ctor) {
      const canvas = new Ctor(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
      return canvas.getContext('2d');
    }
  } catch (_) {
    void _;
  }
  return null;
}

function drawDexDrawableCentered(ctx, drawable, target, vm, view) {
  const width = Math.max(1, Math.round(target.right - target.left));
  const height = Math.max(1, Math.round(target.bottom - target.top));
  const pad = Math.max(width, height);
  const surfaceWidth = width + pad * 2;
  const surfaceHeight = height + pad * 2;
  const offscreen = createOffscreenContext(ctx, surfaceWidth, surfaceHeight);
  if (!offscreen) {
    drawDrawable(ctx, drawable, target, { vm, state: view.drawableStateMap(), stateSet: view.drawableState() });
    return;
  }
  drawDrawable(offscreen, drawable, { left: pad, top: pad, right: pad + width, bottom: pad + height }, {
    vm,
    state: view.drawableStateMap(),
    stateSet: view.drawableState(),
  });
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  try {
    const data = offscreen.getImageData(0, 0, surfaceWidth, surfaceHeight).data;
    for (let y = 0; y < surfaceHeight; y++) {
      for (let x = 0; x < surfaceWidth; x++) {
        if (data[(y * surfaceWidth + x) * 4 + 3] === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  } catch (_) {
    minX = maxX = minY = maxY = -1;
  }
  if (maxX < 0) {
    drawDrawable(ctx, drawable, target, { vm, state: view.drawableStateMap(), stateSet: view.drawableState() });
    return;
  }
  const inkWidth = maxX - minX + 1;
  const inkHeight = maxY - minY + 1;
  const dx = target.left + Math.round((width - inkWidth) / 2) - minX;
  const dy = target.top + Math.round((height - inkHeight) / 2) - minY;
  ctx.drawImage(offscreen.canvas, dx, dy);
}

export class ImageView extends View {
  constructor(context = null) {
    super(context);
    this.drawable = null;
    this.scaleType = 'fitCenter';
    this.adjustViewBounds = false;
    this.cropToPadding = false;
    this.maxWidth = 0;
    this.maxHeight = 0;
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
    const next = normalizeScaleType(scaleType);
    if (next === this.scaleType) return this;
    this.scaleType = next;
    this.requestLayout();
    this.invalidate();
    return this;
  }

  getScaleType() {
    return this.scaleType;
  }

  setAdjustViewBounds(adjust) {
    this.adjustViewBounds = !!adjust;
    return this;
  }

  setMaxWidth(width) {
    this.maxWidth = Number(width) || 0;
    return this;
  }

  setMaxHeight(height) {
    this.maxHeight = Number(height) || 0;
    return this;
  }

  setCropToPadding(crop) {
    this.cropToPadding = !!crop;
    return this;
  }

  getDrawable() {
    return this.drawable;
  }

  drawableIntrinsicSize() {
    const drawable = this.drawable;
    if (!drawable || typeof drawable !== 'object') return null;
    if (drawable.type === 'bitmap' && drawable.bitmap?.width) {
      return { width: drawable.bitmap.width, height: drawable.bitmap.height };
    }
    if (drawable.type === 'xml' && drawable.xml?.name === 'vector') {
      const size = vectorIntrinsicSize(drawable);
      if (size) return size;
    }
    if (drawable.$peer || (!drawable.type && (this.$vm || this.vm))) {
      const vm = this.$vm || this.vm;
      if (!vm?.invokeByName) return null;
      try {
        const width = Number(vm.invokeByName('getIntrinsicWidth', '()I', drawable, []));
        const height = Number(vm.invokeByName('getIntrinsicHeight', '()I', drawable, []));
        if (width > 0 && height > 0) return { width, height };
      } catch (_) {}
      const peer = drawable.$peer;
      if (peer?.image?.width) return { width: peer.image.width, height: peer.image.height };
    }
    if (drawable.$peer?.root || drawable.xml) {
      const root = drawable.$peer?.root || drawable.xml;
      const size = vectorIntrinsicSize({ xml: root });
      if (size) return size;
    }
    return null;
  }

  onMeasure(widthSpec, heightSpec) {
    const intrinsic = this.drawableIntrinsicSize() || { width: 0, height: 0 };
    let desiredWidth = intrinsic.width + this.paddingLeft + this.paddingRight;
    let desiredHeight = intrinsic.height + this.paddingTop + this.paddingBottom;

    if (this.adjustViewBounds && intrinsic.width > 0 && intrinsic.height > 0) {
      const widthMode = MeasureSpec.getMode(widthSpec);
      const heightMode = MeasureSpec.getMode(heightSpec);
      if (widthMode === MeasureSpec.EXACTLY && heightMode !== MeasureSpec.EXACTLY) {
        const width = MeasureSpec.getSize(widthSpec);
        const contentWidth = Math.max(1, width - this.paddingLeft - this.paddingRight);
        desiredHeight = Math.ceil((contentWidth * intrinsic.height) / intrinsic.width) + this.paddingTop + this.paddingBottom;
      } else if (heightMode === MeasureSpec.EXACTLY && widthMode !== MeasureSpec.EXACTLY) {
        const height = MeasureSpec.getSize(heightSpec);
        const contentHeight = Math.max(1, height - this.paddingTop - this.paddingBottom);
        desiredWidth = Math.ceil((contentHeight * intrinsic.width) / intrinsic.height) + this.paddingLeft + this.paddingRight;
      }
    }
    if (this.maxWidth > 0) desiredWidth = Math.min(desiredWidth, this.maxWidth + this.paddingLeft + this.paddingRight);
    if (this.maxHeight > 0) desiredHeight = Math.min(desiredHeight, this.maxHeight + this.paddingTop + this.paddingBottom);

    let width = desiredWidth;
    let height = desiredHeight;
    const widthMode = MeasureSpec.getMode(widthSpec);
    const heightMode = MeasureSpec.getMode(heightSpec);
    if (widthMode === MeasureSpec.EXACTLY) width = MeasureSpec.getSize(widthSpec);
    else if (widthMode === MeasureSpec.AT_MOST) width = Math.min(desiredWidth, MeasureSpec.getSize(widthSpec));
    if (heightMode === MeasureSpec.EXACTLY) height = MeasureSpec.getSize(heightSpec);
    else if (heightMode === MeasureSpec.AT_MOST) height = Math.min(desiredHeight, MeasureSpec.getSize(heightSpec));
    width = Math.max(width, this.minWidth + this.paddingLeft + this.paddingRight);
    height = Math.max(height, this.minHeight + this.paddingTop + this.paddingBottom);
    this.setMeasuredDimension(width, height);
  }

  computeDrawRect(intrinsicWidth, intrinsicHeight) {
    const padL = this.paddingLeft;
    const padT = this.paddingTop;
    const vwidth = Math.max(0, this.getWidth() - padL - this.paddingRight);
    const vheight = Math.max(0, this.getHeight() - padT - this.paddingBottom);
    const dwidth = intrinsicWidth;
    const dheight = intrinsicHeight;
    if (dwidth <= 0 || dheight <= 0) return { left: padL, top: padT, width: vwidth, height: vheight };
    const scaleType = this.scaleType;
    if (scaleType === 'fitXY') return { left: padL, top: padT, width: vwidth, height: vheight };
    if (dwidth <= vwidth && dheight <= vheight && scaleType !== 'centerCrop') {
      // fits in the content box
      if (scaleType === 'matrix') return { left: padL, top: padT, width: dwidth, height: dheight };
      if (scaleType === 'center') {
        return { left: padL + Math.round((vwidth - dwidth) * 0.5), top: padT + Math.round((vheight - dheight) * 0.5), width: dwidth, height: dheight };
      }
    }
    switch (scaleType) {
      case 'matrix':
        return { left: padL, top: padT, width: dwidth, height: dheight };
      case 'center':
        return { left: padL + Math.round((vwidth - dwidth) * 0.5), top: padT + Math.round((vheight - dheight) * 0.5), width: dwidth, height: dheight };
      case 'centerCrop': {
        const scale = Math.max(vwidth / dwidth, vheight / dheight);
        const width = dwidth * scale;
        const height = dheight * scale;
        return { left: padL + Math.round((vwidth - width) * 0.5), top: padT + Math.round((vheight - height) * 0.5), width, height };
      }
      case 'centerInside': {
        const scale = (dwidth <= vwidth && dheight <= vheight) ? 1 : Math.min(vwidth / dwidth, vheight / dheight);
        const width = dwidth * scale;
        const height = dheight * scale;
        return { left: padL + Math.round((vwidth - width) * 0.5), top: padT + Math.round((vheight - height) * 0.5), width, height };
      }
      case 'fitStart':
      case 'fitCenter':
      case 'fitEnd': {
        const scale = Math.min(vwidth / dwidth, vheight / dheight);
        const width = dwidth * scale;
        const height = dheight * scale;
        let left = padL;
        if (scaleType === 'fitCenter') left = padL + (vwidth - width) / 2;
        else if (scaleType === 'fitEnd') left = padL + (vwidth - width);
        const top = padT + (vheight - height) / 2;
        return { left, top, width, height };
      }
      default:
        return { left: padL, top: padT, width: dwidth, height: dheight };
    }
  }

  onDraw(canvas) {
    const drawable = this.drawable;
    if (!drawable) return;
    const intrinsic = this.drawableIntrinsicSize();
    if (!intrinsic) {
      if (drawable.type === 'color') {
        canvas.context.save();
        canvas.context.fillStyle = cssColor(drawable.color);
        canvas.context.fillRect(this.paddingLeft, this.paddingTop, this.getWidth() - this.paddingLeft - this.paddingRight, this.getHeight() - this.paddingTop - this.paddingBottom);
        canvas.context.restore();
      }
      return;
    }
    const rect = this.computeDrawRect(intrinsic.width, intrinsic.height);
    const ctx = canvas.context;
    ctx.save();
    if (this.cropToPadding) {
      ctx.beginPath();
      ctx.rect(this.paddingLeft, this.paddingTop, this.getWidth() - this.paddingLeft - this.paddingRight, this.getHeight() - this.paddingTop - this.paddingBottom);
      ctx.clip();
    }
    const target = { left: rect.left, top: rect.top, right: rect.left + rect.width, bottom: rect.top + rect.height };
    if (drawable.type === 'bitmap' && drawable.bitmap?.image) {
      ctx.drawImage(drawable.bitmap.image, rect.left, rect.top, rect.width, rect.height);
    } else if (drawable.type === 'xml' && drawable.xml?.name === 'vector') {
      canvas.drawVector(drawable, rect.left, rect.top, rect.width, rect.height);
    } else {
      const vm = this.$vm || this.vm;
      if (drawable.$dexClass) drawDexDrawableCentered(ctx, drawable, target, vm, this);
      else drawDrawable(ctx, drawable, target, { vm, state: this.drawableStateMap(), stateSet: this.drawableState() });
    }
    ctx.restore();
  }
}

function themeColorOf(view, key, fallback) {
  const vm = view?.$vm || view?.vm;
  const store = vm?.themeAttributes;
  if (!store) return fallback >>> 0;
  const direct = store[key];
  if (typeof direct === 'number') return direct >>> 0;
  const ref = store.$attrReferences?.[key];
  if (ref !== undefined) {
    const resolved = vm.resources?.resolve?.(ref >>> 0);
    if (typeof resolved === 'number') return resolved >>> 0;
  }
  return fallback >>> 0;
}

export class ProgressBar extends View {
  constructor(context = null) {
    super(context);
    this.progress = 0;
    this.secondaryProgress = 0;
    this.max = 100;
    this.indeterminate = false;
    this.horizontal = false;
    this.progressTint = null;
    this.progressBackgroundTint = null;
    this.secondaryProgressTint = null;
    this.indeterminateTint = null;
    this.$progressAnimation = null;
    this.$visualProgress = 0;
    this.$indeterminateStart = 0;
  }

  getDensity() {
    const density = this.$vm?.resources?.displayMetrics?.density
      || this.vm?.resources?.displayMetrics?.density
      || this.context?.vm?.resources?.displayMetrics?.density
      || 1;
    return density;
  }

  get styleHorizontal() {
    return this.horizontal;
  }

  setStyleHorizontal(horizontal) {
    this.horizontal = !!horizontal;
    this.requestLayout();
    return this;
  }

  setProgress(value) {
    const next = Number(value) || 0;
    if (next === this.progress) return this;
    this.progress = next;
    this.invalidate();
    return this;
  }

  getProgress() {
    return this.progress;
  }

  setSecondaryProgress(value) {
    this.secondaryProgress = Number(value) || 0;
    this.invalidate();
    return this;
  }

  getSecondaryProgress() {
    return this.secondaryProgress;
  }

  setMax(value) {
    const next = Number(value) || 0;
    if (next === this.max) return this;
    this.max = next;
    this.progress = Math.min(this.progress, next);
    this.invalidate();
    return this;
  }

  getMax() {
    return this.max;
  }

  setMin(value) {
    this.min = Number(value) || 0;
    return this;
  }

  setIndeterminate(value) {
    this.indeterminate = !!value;
    if (value) this.$indeterminateStart = Date.now();
    this.requestLayout();
    this.invalidate();
    return this;
  }

  isIndeterminate() {
    return this.indeterminate;
  }

  setProgressTintList(list) { this.progressTint = list; this.invalidate(); return this; }
  setProgressBackgroundTintList(list) { this.progressBackgroundTint = list; this.invalidate(); return this; }
  setSecondaryProgressTintList(list) { this.secondaryProgressTint = list; this.invalidate(); return this; }
  setIndeterminateTintList(list) { this.indeterminateTint = list; this.invalidate(); return this; }
  setProgressTintListColor(color) { this.progressTint = color >>> 0; this.invalidate(); return this; }

  progressFraction(value = this.progress) {
    const range = (this.max || 0) - (this.min || 0);
    if (range <= 0) return 0;
    return Math.max(0, Math.min(1, (value - (this.min || 0)) / range));
  }

  onMeasure(widthSpec, heightSpec) {
    const density = this.getDensity();
    const horizontal = this.horizontal;
    const defaultWidth = horizontal ? 0 : 48 * density;
    const minWidth = this.minWidth || (horizontal ? 0 : 48 * density);
    const maxWidth = this.maxWidth || (horizontal ? Number.MAX_SAFE_INTEGER : 48 * density);
    const minHeight = this.minHeight || (horizontal ? 16 * density : 48 * density);
    const maxHeight = this.maxHeight || (horizontal ? 16 * density : 48 * density);
    let desiredWidth = Math.max(minWidth, Math.min(maxWidth, defaultWidth)) + this.paddingLeft + this.paddingRight;
    let desiredHeight = Math.max(minHeight, Math.min(maxHeight, horizontal ? 16 * density : 48 * density)) + this.paddingTop + this.paddingBottom;
    this.setMeasuredDimension(
      resolveSize(desiredWidth, widthSpec),
      resolveSize(desiredHeight, heightSpec),
    );
  }

  applyTint(color, tint) {
    if (tint === null || tint === undefined) return color >>> 0;
    if (typeof tint === 'number') return tint >>> 0;
    const peer = tint.$peer || tint;
    if (Array.isArray(peer.colors) && peer.colors.length) return peer.colors[0] >>> 0;
    if (typeof peer.color === 'number') return peer.color >>> 0;
    return color >>> 0;
  }

  onDraw(canvas) {
    const ctx = canvas.context;
    const width = this.getWidth();
    const height = this.getHeight();
    const density = this.getDensity();
    const accent = themeColorOf(this, 'colorControlActivated', themeColorOf(this, 'colorAccent', 0xff1a73e8));
    const trackColor = themeColorOf(this, 'colorProgressBackgroundNormal', 0x1f000000);
    ctx.save();
    if (this.horizontal) {
      this.drawHorizontal(ctx, width, height, density, accent, trackColor);
    } else {
      this.drawCircular(ctx, width, height, density, accent, trackColor);
    }
    ctx.restore();
    if (this.indeterminate) {
      if (typeof requestAnimationFrame === 'function') this.invalidate();
      else this.invalidate();
    }
  }

  drawHorizontal(ctx, width, height, density, accent, trackColor) {
    const trackHeight = 4 * density;
    const top = (height - trackHeight) / 2;
    const left = this.paddingLeft;
    const right = width - this.paddingRight;
    const span = Math.max(0, right - left);
    const primary = this.applyTint(accent, this.progressTint);
    const secondary = this.applyTint(accent, this.secondaryProgressTint);
    const background = this.applyTint(trackColor, this.progressBackgroundTint);
    ctx.fillStyle = cssColor(background);
    ctx.fillRect(left, top, span, trackHeight);
    const secondaryWidth = span * this.progressFraction(this.secondaryProgress);
    if (secondaryWidth > 0) {
      ctx.fillStyle = cssColor(secondary);
      ctx.fillRect(left, top, secondaryWidth, trackHeight);
    }
    const primaryWidth = span * this.progressFraction();
    if (primaryWidth > 0) {
      ctx.fillStyle = cssColor(primary);
      ctx.fillRect(left, top, primaryWidth, trackHeight);
    }
  }

  drawCircular(ctx, width, height, density, accent, trackColor) {
    const strokeWidth = 4 * density;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(0, Math.min(width, height) / 2 - strokeWidth);
    const primary = this.applyTint(accent, this.indeterminate ? (this.indeterminateTint ?? this.progressTint) : this.progressTint);
    const background = this.applyTint(trackColor, this.progressBackgroundTint);
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'butt';
    if (!this.indeterminate) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = cssColor(background);
      ctx.stroke();
      const fraction = this.progressFraction();
      if (fraction > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
        ctx.strokeStyle = cssColor(primary);
        ctx.stroke();
      }
      return;
    }
    const now = Date.now();
    const rotation = (((now - (this.$indeterminateStart || now)) % 4444) / 4444) * 720;
    const trim = ((now - (this.$indeterminateStart || now)) % 1333) / 1333;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = cssColor(background);
    ctx.stroke();
    const start = (rotation - 90) * Math.PI / 180;
    const sweep = Math.PI * 2 * 0.75;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, start, start + sweep * Math.max(0.05, trim));
    ctx.strokeStyle = cssColor(primary);
    ctx.stroke();
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

function buttonBackgroundShape(normalColor) {
  const elem = (name, attrs, children = []) => ({ type: 'element', name, attrs, children });
  return elem('shape', [], [
    elem('solid', [{ name: 'color', value: normalColor >>> 0 }]),
    elem('corners', [{ name: 'radius', value: '2dp' }]),
    elem('padding', [
      { name: 'left', value: '8dp' },
      { name: 'top', value: '4dp' },
      { name: 'right', value: '8dp' },
      { name: 'bottom', value: '4dp' },
    ]),
  ]);
}

function defaultButtonBackground(view) {
  const normal = themeColorOf(view, 'colorButtonNormal', 0xffd6d7d7);
  const rippleColor = themeColorOf(view, 'colorControlHighlight', 0x33000000);
  const elem = (name, attrs, children = []) => ({ type: 'element', name, attrs, children });
  return {
    type: 'xml',
    xml: elem('ripple', [{ name: 'color', value: rippleColor >>> 0 }], [
      elem('item', [], [
        elem('inset', [
          { name: 'insetLeft', value: '4dp' },
          { name: 'insetTop', value: '6dp' },
          { name: 'insetRight', value: '4dp' },
          { name: 'insetBottom', value: '6dp' },
        ], [buttonBackgroundShape(normal)]),
      ]),
    ]),
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

export class AnalogClock extends View {
  onDraw(canvas) {
    const ctx = canvas.context;
    const width = this.getWidth();
    const height = this.getHeight();
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(1, Math.min(width, height) / 2 - 4);
    const now = new Date();
    const seconds = now.getSeconds();
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#546e7a';
    ctx.lineWidth = 2;
    ctx.stroke();
    const hand = (angle, length, widthValue, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = widthValue;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(angle) * length, -Math.cos(angle) * length);
      ctx.stroke();
    };
    hand((hours / 12) * Math.PI * 2, radius * 0.5, 4, '#263238');
    hand((minutes / 60) * Math.PI * 2, radius * 0.72, 3, '#37474f');
    hand((seconds / 60) * Math.PI * 2, radius * 0.82, 1, '#e53935');
    ctx.beginPath();
    ctx.fillStyle = '#263238';
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class TimePicker extends View {
  onDraw(canvas) {
    const ctx = canvas.context;
    const width = this.getWidth();
    const height = this.getHeight();
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(1, Math.min(width, height) / 2 - 6);
    const hour = Number(this.hour ?? 0) % 12;
    const minute = Number(this.minute ?? 0) % 60;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#546e7a';
    ctx.lineWidth = 2;
    ctx.stroke();
    const hand = (angle, length, widthValue, color) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = widthValue;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(angle) * length, -Math.cos(angle) * length);
      ctx.stroke();
    };
    hand(((hour + minute / 60) / 12) * Math.PI * 2, radius * 0.5, 4, '#263238');
    hand((minute / 60) * Math.PI * 2, radius * 0.74, 3, '#37474f');
    ctx.beginPath();
    ctx.fillStyle = '#263238';
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class DatePicker extends TextView {
  constructor(context = null) {
    super(context);
    this.year = 1970;
    this.month = 0;
    this.day = 1;
    this.setText('1970-01-01');
  }

  setDate(year, month, day) {
    this.year = Number(year) || 0;
    this.month = Number(month) || 0;
    this.day = Number(day) || 1;
    this.setText(`${this.year}-${String(this.month + 1).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`);
    this.invalidate?.();
  }
}
