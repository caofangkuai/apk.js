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

export class TextView extends View {
  constructor(context = null) {
    super(context);
    this.text = '';
    this.textPaint = new Paint();
    this.textPaint.color = 0xff000000;
    this.textPaint.textSize = 14;
    this.textSize = 14;
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
    this.typeface = 'sans-serif';
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
    this.typeface = typeface || 'sans-serif';
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
    this.setMeasuredDimension(width, height);
  }

  onDraw(canvas) {
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
    } else {
      paint.color = this.enabled ? this.textColor : 0x61000000;
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

  onMeasure(widthSpec, heightSpec) {
    const bitmap = this.drawable?.bitmap;
    const desiredWidth = (bitmap?.width || 0) + this.paddingLeft + this.paddingRight;
    const desiredHeight = (bitmap?.height || 0) + this.paddingTop + this.paddingBottom;
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
    if (drawable.type === 'color') {
      canvas.context.save();
      canvas.context.fillStyle = cssColor(drawable.color);
      canvas.context.fillRect(0, 0, this.getWidth(), this.getHeight());
      canvas.context.restore();
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

  dispatchDraw(canvas) {
    if (!this.child) return;
    canvas.save();
    canvas.translate(0, -this.scrollY);
    this.child.draw(canvas);
    canvas.restore();
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
