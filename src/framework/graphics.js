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

  drawVector(drawable, left, top, width, height) {
    drawVectorRaw(this.context, this.originX, this.originY, drawable, left, top, width, height);
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

export function drawVectorRaw(ctx, originX, originY, drawable, left, top, width, height) {
  const root = drawable?.xml;
  if (!root || root.name !== 'vector') return false;
  const attrs = attrsToMap(root.attrs);
  const viewportWidth = Number(attrs.viewportWidth) || 0;
  const viewportHeight = Number(attrs.viewportHeight) || 0;
  if (!viewportWidth || !viewportHeight || !width || !height) return false;
  ctx.save();
  ctx.translate(originX + left, originY + top);
  ctx.scale(width / viewportWidth, height / viewportHeight);
  for (const child of root.children || []) drawVectorNode(ctx, child);
  ctx.restore();
  return true;
}

function attrsToMap(attrs) {
  const map = {};
  for (const attr of attrs || []) {
    if (!attr) continue;
    const name = attr.name || attr.namespaceName;
    let value = attr.value;
    if (value && typeof value === 'object') {
      if (value.dimension) value = value.dimension.value;
      else if (value.reference !== undefined) value = value.reference;
    }
    map[name] = value;
  }
  return map;
}

function drawVectorNode(ctx, node) {
  if (!node) return;
  if (node.name === 'group') {
    const attrs = attrsToMap(node.attrs);
    const rotation = Number(attrs.rotation) || 0;
    const pivotX = Number(attrs.pivotX) || 0;
    const pivotY = Number(attrs.pivotY) || 0;
    const scaleX = attrs.scaleX === undefined ? 1 : Number(attrs.scaleX) || 0;
    const scaleY = attrs.scaleY === undefined ? 1 : Number(attrs.scaleY) || 0;
    const translateX = Number(attrs.translateX) || 0;
    const translateY = Number(attrs.translateY) || 0;
    ctx.save();
    if (translateX || translateY) ctx.translate(translateX, translateY);
    if (rotation) {
      ctx.translate(pivotX, pivotY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-pivotX, -pivotY);
    }
    if (scaleX !== 1 || scaleY !== 1) {
      ctx.translate(pivotX, pivotY);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-pivotX, -pivotY);
    }
    for (const child of node.children || []) drawVectorNode(ctx, child);
    ctx.restore();
    return;
  }
  if (node.name === 'path') {
    drawVectorPath(ctx, node);
  }
}

function drawVectorPath(ctx, node) {
  const attrs = attrsToMap(node.attrs);
  const pathData = attrs.pathData;
  if (!pathData) return;
  const fillColor = attrs.fillColor;
  const strokeColor = attrs.strokeColor;
  const fillAlpha = attrs.fillAlpha === undefined ? 1 : Number(attrs.fillAlpha);
  const strokeAlpha = attrs.strokeAlpha === undefined ? 1 : Number(attrs.strokeAlpha);
  const strokeWidth = attrs.strokeWidth === undefined ? 0 : Number(attrs.strokeWidth);
  const strokeLineCap = attrs.strokeLineCap;
  const strokeLineJoin = attrs.strokeLineJoin;
  const fillType = attrs.fillType;
  ctx.save();
  ctx.beginPath();
  applyPathData(ctx, pathData);
  if (fillColor !== undefined && fillColor !== null && fillAlpha > 0) {
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = cssColor(normalizeColor(fillColor));
    if (fillType === 'evenOdd' || fillType === 1) ctx.fill('evenodd');
    else ctx.fill();
  }
  if (strokeColor !== undefined && strokeColor !== null && strokeWidth > 0 && strokeAlpha > 0) {
    ctx.globalAlpha = strokeAlpha;
    ctx.strokeStyle = cssColor(normalizeColor(strokeColor));
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = ['butt', 'round', 'square'][strokeLineCap] || 'butt';
    ctx.lineJoin = ['miter', 'round', 'bevel'][strokeLineJoin] || 'miter';
    ctx.stroke();
  }
  ctx.restore();
}

function applyPathData(ctx, data) {
  const tokens = tokenizePathData(data);
  let i = 0;
  let command = null;
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;
  let lastControlX = 0;
  let lastControlY = 0;
  let lastCommand = null;
  const read = () => tokens[i++];
  const isCommand = (t) => typeof t === 'string';
  const nextNumber = () => {
    while (i < tokens.length && isCommand(tokens[i]) && tokens[i] !== command) return null;
    return read();
  };
  while (i < tokens.length) {
    const token = tokens[i];
    if (isCommand(token)) {
      command = token;
      i++;
      if (command === 'Z' || command === 'z') {
        ctx.closePath();
        currentX = startX;
        currentY = startY;
        lastCommand = 'Z';
        continue;
      }
    } else if (!command) {
      i++;
      continue;
    }
    const relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case 'M': {
        let x = Number(read());
        let y = Number(read());
        if (relative) { x += currentX; y += currentY; }
        ctx.moveTo(x, y);
        currentX = x; currentY = y; startX = x; startY = y;
        command = relative ? 'l' : 'L';
        break;
      }
      case 'L': {
        let x = Number(read());
        let y = Number(read());
        if (relative) { x += currentX; y += currentY; }
        ctx.lineTo(x, y);
        currentX = x; currentY = y;
        break;
      }
      case 'H': {
        let x = Number(read());
        if (relative) x += currentX;
        ctx.lineTo(x, currentY);
        currentX = x;
        break;
      }
      case 'V': {
        let y = Number(read());
        if (relative) y += currentY;
        ctx.lineTo(currentX, y);
        currentY = y;
        break;
      }
      case 'C': {
        let x1 = Number(read()); let y1 = Number(read());
        let x2 = Number(read()); let y2 = Number(read());
        let x = Number(read()); let y = Number(read());
        if (relative) { x1 += currentX; y1 += currentY; x2 += currentX; y2 += currentY; x += currentX; y += currentY; }
        ctx.bezierCurveTo(x1, y1, x2, y2, x, y);
        lastControlX = x2; lastControlY = y2;
        currentX = x; currentY = y;
        break;
      }
      case 'S': {
        let x2 = Number(read()); let y2 = Number(read());
        let x = Number(read()); let y = Number(read());
        if (relative) { x2 += currentX; y2 += currentY; x += currentX; y += currentY; }
        const cx1 = (lastCommand === 'C' || lastCommand === 'S') ? 2 * currentX - lastControlX : currentX;
        const cy1 = (lastCommand === 'C' || lastCommand === 'S') ? 2 * currentY - lastControlY : currentY;
        ctx.bezierCurveTo(cx1, cy1, x2, y2, x, y);
        lastControlX = x2; lastControlY = y2;
        currentX = x; currentY = y;
        break;
      }
      case 'Q': {
        let x1 = Number(read()); let y1 = Number(read());
        let x = Number(read()); let y = Number(read());
        if (relative) { x1 += currentX; y1 += currentY; x += currentX; y += currentY; }
        ctx.quadraticCurveTo(x1, y1, x, y);
        lastControlX = x1; lastControlY = y1;
        currentX = x; currentY = y;
        break;
      }
      case 'T': {
        let x = Number(read()); let y = Number(read());
        if (relative) { x += currentX; y += currentY; }
        const cx = (lastCommand === 'Q' || lastCommand === 'T') ? 2 * currentX - lastControlX : currentX;
        const cy = (lastCommand === 'Q' || lastCommand === 'T') ? 2 * currentY - lastControlY : currentY;
        ctx.quadraticCurveTo(cx, cy, x, y);
        lastControlX = cx; lastControlY = cy;
        currentX = x; currentY = y;
        break;
      }
      case 'A': {
        const rx = Number(read());
        const ry = Number(read());
        const xAxisRotation = Number(read());
        const largeArcFlag = Number(read());
        const sweepFlag = Number(read());
        let x = Number(read());
        let y = Number(read());
        if (relative) { x += currentX; y += currentY; }
        drawArcTo(ctx, currentX, currentY, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, x, y);
        currentX = x; currentY = y;
        break;
      }
      default:
        i++;
        break;
    }
    lastCommand = command.toUpperCase();
  }
}

function tokenizePathData(data) {
  const tokens = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let match;
  while ((match = re.exec(data)) !== null) {
    tokens.push(match[1] ? match[1] : parseFloat(match[2]));
  }
  return tokens;
}

function drawArcTo(ctx, x1, y1, rx, ry, angle, largeArc, sweep, x2, y2) {
  if (rx === 0 || ry === 0) {
    ctx.lineTo(x2, y2);
    return;
  }
  const phi = (angle * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  let rxSq = rx * rx;
  let rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
    rxSq = rx * rx;
    rySq = ry * ry;
  }
  const sign = largeArc !== sweep ? 1 : -1;
  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const den = rxSq * y1pSq + rySq * x1pSq;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const angleBetween = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let ang = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) ang = -ang;
    return ang;
  };
  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let deltaTheta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && deltaTheta > 0) deltaTheta -= Math.PI * 2;
  else if (sweep && deltaTheta < 0) deltaTheta += Math.PI * 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(phi);
  ctx.scale(1, ry / rx);
  ctx.arc(0, 0, rx, theta1, theta1 + deltaTheta, !sweep);
  ctx.restore();
}
