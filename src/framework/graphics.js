export class Paint {
  constructor() {
    this.color = 0xff000000;
    this.textSize = 14;
    this.antiAlias = true;
    this.strokeWidth = 1;
    this.style = 'fill';
    this.textAlign = 'left';
    this.typeface = 'sans-serif';
    this.letterSpacing = 0;
  }

  setColor(color) {
    this.color = normalizeColor(color);
  }

  getColor() {
    return this.color;
  }

  setTextSize(size) {
    this.textSize = Number(size) || 0;
  }

  getTextSize() {
    return this.textSize;
  }

  setAntiAlias(value) {
    this.antiAlias = !!value;
  }

  setStrokeWidth(width) {
    this.strokeWidth = Number(width) || 0;
  }

  setStyle(style) {
    this.style = typeof style === 'number' ? (style === 0 ? 'fill' : style === 1 ? 'stroke' : 'fillAndStroke') : style;
  }

  setTextAlign(align) {
    this.textAlign = typeof align === 'number' ? ['left', 'center', 'right'][align] || 'left' : align;
  }

  setTypeface(typeface) {
    this.typeface = typeface;
  }

  measureText(text) {
    return measureTextWidth(String(text ?? ''), this.textSize, this.typeface);
  }

  getFontMetrics() {
    return {
      ascent: -this.textSize * 0.93,
      descent: this.textSize * 0.24,
      leading: this.textSize * 0.1,
      top: -this.textSize * 1.05,
      bottom: this.textSize * 0.3,
    };
  }

  getFontMetricsInt() {
    const m = this.getFontMetrics();
    return {
      ascent: Math.floor(m.ascent),
      descent: Math.ceil(m.descent),
      leading: Math.ceil(m.leading),
      top: Math.floor(m.top),
      bottom: Math.ceil(m.bottom),
    };
  }

  setShadowLayer(radius, dx, dy, color) {
    this.shadow = { radius, dx, dy, color };
  }

  clearShadowLayer() {
    this.shadow = null;
  }
}

export class Rect {
  constructor(left = 0, top = 0, right = 0, bottom = 0) {
    this.left = left;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
  }

  width() {
    return this.right - this.left;
  }

  height() {
    return this.bottom - this.top;
  }

  isEmpty() {
    return this.left >= this.right || this.top >= this.bottom;
  }

  set(left, top, right, bottom) {
    this.left = left;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
  }

  inset(dx, dy) {
    this.left += dx;
    this.top += dy;
    this.right -= dx;
    this.bottom -= dy;
  }

  offset(dx, dy) {
    this.left += dx;
    this.top += dy;
    this.right += dx;
    this.bottom += dy;
  }

  contains(x, y) {
    return x >= this.left && x < this.right && y >= this.top && y < this.bottom;
  }

  equals(other) {
    return !!other && this.left === other.left && this.top === other.top && this.right === other.right && this.bottom === other.bottom;
  }

  toString() {
    return `Rect(${this.left}, ${this.top}, ${this.right}, ${this.bottom})`;
  }
}

export class RectF extends Rect {}

export class Point {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

export class Canvas {
  constructor(context, width, height, originX = 0, originY = 0) {
    this.context = context;
    this.width = width;
    this.height = height;
    this.originX = originX;
    this.originY = originY;
    this.stack = [];
  }

  save() {
    this.stack.push(this.context.getTransform ? null : null);
    this.context.save();
  }

  restore() {
    this.stack.pop();
    this.context.restore();
  }

  translate(dx, dy) {
    this.context.translate(dx, dy);
  }

  scale(sx, sy = sx) {
    this.context.scale(sx, sy);
  }

  rotate(degrees) {
    this.context.rotate((degrees * Math.PI) / 180);
  }

  clipRect(left, top, right, bottom) {
    this.context.beginPath();
    this.context.rect(this.originX + left, this.originY + top, right - left, bottom - top);
    this.context.clip();
  }

  drawColor(color) {
    this.context.save();
    this.context.fillStyle = cssColor(color);
    this.context.fillRect(0, 0, this.width, this.height);
    this.context.restore();
  }

  drawRect(left, top, right, bottom, paint) {
    const ctx = this.context;
    ctx.save();
    applyPaint(ctx, paint);
    const w = right - left;
    const h = bottom - top;
    if (paint?.style === 'stroke') {
      ctx.strokeRect(this.originX + left, this.originY + top, w, h);
    } else {
      ctx.fillRect(this.originX + left, this.originY + top, w, h);
      if (paint?.style === 'fillAndStroke') ctx.strokeRect(this.originX + left, this.originY + top, w, h);
    }
    ctx.restore();
  }

  drawRoundRect(left, top, right, bottom, radiusX, radiusY, paint) {
    const ctx = this.context;
    ctx.save();
    applyPaint(ctx, paint);
    roundedRectPath(ctx, this.originX + left, this.originY + top, right - left, bottom - top, radiusX, radiusY);
    if (paint?.style === 'stroke') ctx.stroke();
    else ctx.fill();
    ctx.restore();
  }

  drawCircle(cx, cy, radius, paint) {
    const ctx = this.context;
    ctx.save();
    applyPaint(ctx, paint);
    ctx.beginPath();
    ctx.arc(this.originX + cx, this.originY + cy, radius, 0, Math.PI * 2);
    if (paint?.style === 'stroke') ctx.stroke();
    else ctx.fill();
    ctx.restore();
  }

  drawLine(x1, y1, x2, y2, paint) {
    const ctx = this.context;
    ctx.save();
    applyPaint(ctx, paint);
    ctx.beginPath();
    ctx.moveTo(this.originX + x1, this.originY + y1);
    ctx.lineTo(this.originX + x2, this.originY + y2);
    ctx.stroke();
    ctx.restore();
  }

  drawText(text, x, y, paint) {
    const ctx = this.context;
    ctx.save();
    applyPaint(ctx, paint);
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(text ?? ''), this.originX + x, this.originY + y);
    ctx.restore();
  }

  drawBitmap(bitmap, left, top, paint) {
    if (!bitmap || !bitmap.image) return;
    const ctx = this.context;
    ctx.save();
    if (paint?.alpha !== undefined) ctx.globalAlpha = paint.alpha;
    ctx.drawImage(bitmap.image, this.originX + left, this.originY + top, bitmap.width, bitmap.height);
    ctx.restore();
  }

  drawBitmapRect(bitmap, src, dst, paint) {
    if (!bitmap || !bitmap.image) return;
    const ctx = this.context;
    ctx.save();
    if (paint?.alpha !== undefined) ctx.globalAlpha = paint.alpha;
    const sx = src ? src.left : 0;
    const sy = src ? src.top : 0;
    const sw = src ? src.width() : bitmap.width;
    const sh = src ? src.height() : bitmap.height;
    ctx.drawImage(
      bitmap.image,
      sx,
      sy,
      sw,
      sh,
      this.originX + dst.left,
      this.originY + dst.top,
      dst.width(),
      dst.height()
    );
    ctx.restore();
  }
}

export class Bitmap {
  constructor(image, width, height, source) {
    this.image = image || null;
    this.width = width;
    this.height = height;
    this.source = source || null;
  }

  getWidth() {
    return this.width;
  }

  getHeight() {
    return this.height;
  }

  recycle() {
    this.image = null;
  }

  static create(width, height) {
    return new Bitmap(null, width, height);
  }
}

export function normalizeColor(color) {
  if (typeof color === 'string') {
    if (color.startsWith('#')) {
      if (color.length === 7) return (0xff000000 | parseInt(color.slice(1), 16)) >>> 0;
      if (color.length === 9) return parseInt(color.slice(1), 16) >>> 0;
    }
    return 0xff000000;
  }
  return color >>> 0;
}

export function colorAlpha(color) {
  return (normalizeColor(color) >>> 24) & 0xff;
}

export function cssColor(color, alphaMultiplier = 1) {
  const value = normalizeColor(color);
  const a = (((value >>> 24) & 0xff) / 255) * alphaMultiplier;
  const r = (value >>> 16) & 0xff;
  const g = (value >>> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function blendColor(base, overlay, alpha = 1) {
  const b = normalizeColor(base);
  const o = normalizeColor(overlay);
  const oa = (((o >>> 24) & 0xff) / 255) * alpha;
  const ba = ((b >>> 24) & 0xff) / 255;
  const outA = oa + ba * (1 - oa);
  if (outA === 0) return 0;
  const mix = (channel) => {
    const bc = (b >>> channel) & 0xff;
    const oc = (o >>> channel) & 0xff;
    return Math.round((oc * oa + bc * ba * (1 - oa)) / outA);
  };
  return (((Math.round(outA * 255) & 0xff) << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)) >>> 0;
}

export function measureTextWidth(text, textSize, typeface = 'sans-serif') {
  if (!text) return 0;
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code >= 0x2e80) width += textSize;
    else if (char === ' ') width += textSize * 0.28;
    else if (/[ilI.,'!|]/.test(char)) width += textSize * 0.28;
    else if (/[mwMW@%]/.test(char)) width += textSize * 0.86;
    else if (/[A-Z]/.test(char)) width += textSize * 0.67;
    else if (/[0-9]/.test(char)) width += textSize * 0.56;
    else width += textSize * 0.55;
  }
  return width;
}

export function wrapText(text, textSize, maxWidth, typeface = 'sans-serif') {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    let current = '';
    let width = 0;
    for (const char of paragraph) {
      const charWidth = measureTextWidth(char, textSize, typeface);
      if (width + charWidth > maxWidth && current) {
        lines.push(current);
        current = char;
        width = charWidth;
      } else {
        current += char;
        width += charWidth;
      }
    }
    lines.push(current);
  }
  return lines;
}

function applyPaint(ctx, paint) {
  const p = paint || new Paint();
  ctx.fillStyle = cssColor(p.color);
  ctx.strokeStyle = cssColor(p.color);
  ctx.lineWidth = p.strokeWidth || 1;
  ctx.font = `${p.fontWeight || 'normal'} ${p.textSize}px ${p.typeface || 'sans-serif'}`;
  ctx.textAlign = p.textAlign || 'left';
  ctx.globalAlpha = p.alpha ?? 1;
  if (p.letterSpacing) ctx.letterSpacing = `${p.letterSpacing}px`;
  if (p.shadow) {
    ctx.shadowColor = cssColor(p.shadow.color);
    ctx.shadowBlur = p.shadow.radius;
    ctx.shadowOffsetX = p.shadow.dx;
    ctx.shadowOffsetY = p.shadow.dy;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }
}

function roundedRectPath(ctx, x, y, w, h, rx, ry = rx) {
  const radiusX = Math.min(Math.abs(rx), Math.abs(w) / 2);
  const radiusY = Math.min(Math.abs(ry), Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radiusX, y);
  ctx.lineTo(x + w - radiusX, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radiusY);
  ctx.lineTo(x + w, y + h - radiusY);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radiusX, y + h);
  ctx.lineTo(x + radiusX, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radiusY);
  ctx.lineTo(x, y + radiusY);
  ctx.quadraticCurveTo(x, y, x + radiusX, y);
  ctx.closePath();
}
