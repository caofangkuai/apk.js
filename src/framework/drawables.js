import { NativeClassDef } from '../runtime/class-registry.js';
import { floatBitsToNumber, isJavaObject, numberToFloatBits, toInt } from '../runtime/values.js';
import { Canvas, cssColor, drawVectorRaw } from './graphics.js';
import { parseColorString } from './resources.js';

// Android state 常量（android.R.attr.*）
export const STATE = {
  enabled: 0x0101009e,
  pressed: 0x010100a7,
  focused: 0x0101009c,
  selected: 0x010100a1,
  checked: 0x010100a0,
  activated: 0x010100a2,
  hovered: 0x01010367,
};

const STATE_NAMES = {
  0x0101009e: 'enabled',
  0x010100a7: 'pressed',
  0x0101009c: 'focused',
  0x010100a1: 'selected',
  0x010100a0: 'checked',
  0x010100a2: 'activated',
  0x01010367: 'hovered',
};

export function stateNameOf(id) {
  return STATE_NAMES[id | 0] || null;
}

export function nativeDef(descriptor, options) {
  return new NativeClassDef(descriptor, options);
}

function peerClass(fn, fields = {}) {
  return class {
    constructor(vm, object) {
      this.vm = vm;
      this.$object = object;
      this.object = object;
      Object.assign(this, fields);
      fn.call(this, vm, object);
    }
  };
}

function isResourceDrawable(value) {
  return !!value && typeof value === 'object' && typeof value.type === 'string' && !value.$peer;
}

function resolvePeer(value, vm) {
  if (!value || typeof value !== 'object') return null;
  if (value.$peer) return value.$peer;
  if (typeof value.kind === 'string' && !value.$object) return value;
  const registry = vm?.registry;
  if (registry?.getPeer) {
    try {
      const peer = registry.getPeer(value);
      return peer && typeof peer === 'object' ? peer : null;
    } catch (_error) {
      return null;
    }
  }
  return null;
}

function descriptorOf(value, vm) {
  const raw =
    value?.$descriptor ||
    value?.$dexClass?.descriptor ||
    value?.$runtimeClass?.descriptor ||
    value?.$nativeClass ||
    null;
  if (raw) return raw;
  const vmDescriptor = value?.$vm?.registry?.classNameOf?.(value);
  if (vmDescriptor) return vmDescriptor;
  const resolved = vm?.registry?.classNameOf?.(value);
  return resolved || null;
}

/* ----------------------------------------------------------------------------
 * 属性 / 资源值解析
 * ------------------------------------------------------------------------- */

export function attrValue(node, name) {
  if (!node || !name) return null;
  if (typeof node.getAttribute === 'function') {
    const value = node.getAttribute(name);
    if (value !== undefined && value !== null) return value;
  }
  let best = null;
  let bestScore = -1;
  for (const attr of node.attrs || []) {
    const attrName = attr?.name;
    if (!attrName) continue;
    const score =
      attrName === name ? 3
        : attrName === `android:${name}` ? 3
          : attrName.endsWith(`:${name}`) ? 2
            : -1;
    if (score > bestScore) {
      bestScore = score;
      best = attr.value ?? attr.data ?? null;
    }
  }
  return bestScore >= 0 ? best : null;
}

export function resolveReferenceValue(vm, value, depth = 0) {
  if (value === null || value === undefined || depth > 8) return value;
  if (typeof value !== 'object' || value.reference === undefined) return value;
  const resources = vm?.resources;
  const id = value.reference >>> 0;
  if (resources) {
    let resolved;
    try {
      resolved = resources.resolve(id);
    } catch (_error) {
      resolved = null;
    }
    if (resolved !== null && resolved !== undefined) {
      if (typeof resolved === 'object' && resolved.reference !== undefined) {
        return resolveReferenceValue(vm, resolved, depth + 1);
      }
      return resolved;
    }
    const key = resources.table?.getEntry?.(id)?.key;
    const theme = vm?.themeAttributes;
    if (key && theme && Object.prototype.hasOwnProperty.call(theme, key)) {
      return theme[key];
    }
    if (key && theme?.$attrReferences && Object.prototype.hasOwnProperty.call(theme.$attrReferences, key)) {
      return theme.$attrReferences[key];
    }
  }
  return value;
}

export function colorOf(vm, value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const resolved = resolveReferenceValue(vm, value);
  if (typeof resolved === 'number') return resolved >>> 0;
  if (typeof resolved === 'boolean') return resolved ? 0xffffffff : 0x00000000;
  if (typeof resolved === 'string') {
    const parsed = parseColorString(resolved);
    if (parsed !== null) return parsed >>> 0;
    const named = NAMED_COLORS[resolved.trim().toUpperCase()];
    if (named !== undefined) return named >>> 0;
    return fallback;
  }
  if (resolved && typeof resolved === 'object') {
    if (resolved.color !== undefined) return resolved.color >>> 0;
    if (resolved.reference !== undefined) return (resolved.reference >>> 0) | 0xff000000;
    if (Array.isArray(resolved.colors) && resolved.colors.length) return resolved.colors[0] >>> 0;
  }
  return fallback;
}

const NAMED_COLORS = {
  BLACK: 0xff000000,
  WHITE: 0xffffffff,
  TRANSPARENT: 0x00000000,
  RED: 0xffff0000,
  GREEN: 0xff00ff00,
  BLUE: 0xff0000ff,
  GRAY: 0xff888888,
  'DKGRAY': 0xff444444,
  'LTGRAY': 0xffcccccc,
  CYAN: 0xff00ffff,
  MAGENTA: 0xffff00ff,
  YELLOW: 0xffffff00,
};

export function dimensionOf(vm, value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const resolved = resolveReferenceValue(vm, value);
  const density = vm?.resources?.displayMetrics?.density || vm?.displayMetrics?.density || 1;
  if (typeof resolved === 'number') return resolved;
  if (resolved && typeof resolved === 'object') {
    if (resolved.dimension) {
      const { value: magnitude, unit } = resolved.dimension;
      if (unit === 'dp' || unit === 'dip' || unit === 'sp') return magnitude * density;
      if (unit === 'pt') return magnitude * density * 1.333;
      if (unit === 'in') return magnitude * density * 160;
      if (unit === 'mm') return (magnitude * density * 160) / 25.4;
      return magnitude;
    }
    if (resolved.fraction) {
      const { value: magnitude, unit } = resolved.fraction;
      const base = unit === '%' ? 1 : 100;
      return (vm?.resources?.displayMetrics?.widthPixels || 1) * (magnitude / base);
    }
    if (resolved.reference !== undefined) return fallback;
  }
  if (typeof resolved === 'string') {
    const trimmed = resolved.trim();
    const match = /^(-?\d+(?:\.\d+)?)(dp|dip|sp|px|pt|in|mm)$/i.exec(trimmed);
    if (match) {
      const unit = match[2].toLowerCase();
      const magnitude = parseFloat(match[1]);
      if (unit === 'px') return magnitude;
      if (unit === 'dp' || unit === 'dip' || unit === 'sp') return magnitude * density;
      if (unit === 'pt') return magnitude * density * 1.333;
      if (unit === 'in') return magnitude * density * 160;
      if (unit === 'mm') return (magnitude * density * 160) / 25.4;
    }
    const numeric = parseFloat(trimmed);
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  return fallback;
}

function fractionOf(vm, value, fallback = 1) {
  if (value === null || value === undefined) return fallback;
  const resolved = resolveReferenceValue(vm, value);
  if (typeof resolved === 'number') return resolved;
  if (resolved && typeof resolved === 'object' && resolved.fraction) {
    return resolved.fraction.unit === '%' ? resolved.fraction.value / 100 : resolved.fraction.value;
  }
  if (typeof resolved === 'string') {
    const match = /^(-?\d+(?:\.\d+)?)%$/.exec(resolved.trim());
    if (match) return parseFloat(match[1]) / 100;
  }
  return fallback;
}

function drawableFromAttr(vm, value) {
  if (value === null || value === undefined) return null;
  let id = null;
  if (typeof value === 'object' && value.reference !== undefined) id = value.reference >>> 0;
  else if (typeof value === 'number') id = value >>> 0;
  else if (typeof value === 'string') {
    const match = /^@(0x[0-9a-fA-F]+|\d+)$/.exec(value.trim());
    if (match) id = match[1].startsWith('0x') ? parseInt(match[1], 16) : parseInt(match[1], 10);
    else if (value.trim().startsWith('#')) return { type: 'color', color: parseColorString(value) ?? 0 };
  }
  if (id === null) return null;
  const resolved = resolveReferenceValue(vm, { reference: id });
  if (typeof resolved === 'number' && (resolved >>> 24) !== 0x01) {
    return { type: 'color', color: resolved >>> 0 };
  }
  const resources = vm?.resources;
  if (!resources?.getDrawable) return null;
  try {
    return resources.getDrawable(id);
  } catch (_error) {
    return null;
  }
}

function elementChildren(node) {
  return (node?.children || []).filter((child) => child && child.type === 'element');
}

function firstChildNamed(node, names) {
  const wanted = Array.isArray(names) ? names : [names];
  return elementChildren(node).find((child) => wanted.includes(child.name)) || null;
}

/* ----------------------------------------------------------------------------
 * 状态匹配
 * ------------------------------------------------------------------------- */

export function stateSetFor(state) {
  if (!state) return [STATE.enabled];
  if (Array.isArray(state)) return state;
  const set = [];
  for (const [name, id] of Object.entries(STATE)) {
    if (state[name]) set.push(id);
  }
  return set;
}

function stateMapFor(state) {
  if (!state) return { enabled: true };
  if (Array.isArray(state)) {
    const map = {};
    for (const id of state) {
      const name = stateNameOf(id);
      if (name) map[name] = true;
    }
    return map;
  }
  return state;
}

export function matchesStateSpec(spec, stateSet) {
  const values = spec?.$data || spec || [];
  const set = Array.isArray(stateSet) ? stateSet : stateSetFor(stateSet);
  for (const raw of values) {
    const state = raw | 0;
    if (!state) continue;
    const positive = state > 0;
    const key = Math.abs(state);
    const has = set.includes(key);
    if (positive !== has) return false;
  }
  return true;
}

export function colorStateListColor(value, stateSet) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value >>> 0;
  const peer = value.$peer || value;
  if (Array.isArray(peer.colors) && peer.colors.length) {
    const states = peer.states || [];
    for (let i = 0; i < states.length; i++) {
      const spec = states[i];
      if (matchesStateSpec(spec, stateSet) && peer.colors[i] !== undefined) {
        return peer.colors[i] >>> 0;
      }
    }
    for (let i = 0; i < states.length; i++) {
      const spec = states[i]?.$data || states[i] || [];
      if (!spec.length && peer.colors[i] !== undefined) return peer.colors[i] >>> 0;
    }
    return peer.colors[peer.colors.length - 1] >>> 0;
  }
  if (typeof peer.defaultColor === 'number') return peer.defaultColor >>> 0;
  if (typeof peer.color === 'number') return peer.color >>> 0;
  return null;
}

function tintColorOf(peer, options) {
  const stateSet = options.stateSet || stateSetFor(options.state);
  let tint = null;
  if (peer?.tintList) tint = colorStateListColor(peer.tintList, stateSet);
  if (tint === null && peer && peer.tint !== null && peer.tint !== undefined) {
    tint = typeof peer.tint === 'number' ? peer.tint >>> 0 : colorStateListColor(peer.tint, stateSet);
  }
  if (tint === null && options.tint !== null && options.tint !== undefined) {
    tint = colorStateListColor(options.tint, stateSet);
  }
  return tint;
}

function applyAlphaToColor(color, alpha, options) {
  let value = (color >>> 0);
  const drawableAlpha = alpha === undefined || alpha === null ? 255 : alpha & 0xff;
  const viewAlpha = options.alpha === undefined || options.alpha === null ? 1 : Number(options.alpha);
  const factor = (drawableAlpha / 255) * (Number.isFinite(viewAlpha) ? viewAlpha : 1);
  if (factor >= 1) return value >>> 0;
  const a = Math.round(((value >>> 24) & 0xff) * factor);
  return ((a << 24) | (value & 0xffffff)) >>> 0;
}

/* ----------------------------------------------------------------------------
 * 图形绘制
 * ------------------------------------------------------------------------- */

function shapePath(ctx, rect, radii) {
  const left = rect.left;
  const top = rect.top;
  const right = rect.right;
  const bottom = rect.bottom;
  const w = right - left;
  const h = bottom - top;
  const limit = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = (radii || [0, 0, 0, 0]).map((r) => Math.max(0, Math.min(Number(r) || 0, limit)));
  ctx.beginPath();
  if (!tl && !tr && !br && !bl) {
    ctx.rect(left, top, w, h);
    return;
  }
  ctx.moveTo(left + tl, top);
  ctx.lineTo(right - tr, top);
  if (tr) ctx.arcTo(right, top, right, top + tr, tr); else ctx.lineTo(right, top);
  ctx.lineTo(right, bottom - br);
  if (br) ctx.arcTo(right, bottom, right - br, bottom, br); else ctx.lineTo(right, bottom);
  ctx.lineTo(left + bl, bottom);
  if (bl) ctx.arcTo(left, bottom, left, bottom - bl, bl); else ctx.lineTo(left, bottom);
  ctx.lineTo(left, top + tl);
  if (tl) ctx.arcTo(left, top, left + tl, top, tl); else ctx.lineTo(left, top);
  ctx.closePath();
}

function ovalPath(ctx, rect) {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const rx = Math.abs(rect.right - rect.left) / 2;
  const ry = Math.abs(rect.bottom - rect.top) / 2;
  ctx.beginPath();
  if (typeof ctx.ellipse === 'function') ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  else ctx.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
  ctx.closePath();
}

function cornerRadiiOf(vm, corners) {
  if (!corners) return [0, 0, 0, 0];
  const uniform = dimensionOf(vm, attrValue(corners, 'radius'), 0);
  const pick = (name) => {
    const value = attrValue(corners, name);
    return value === null || value === undefined ? uniform : dimensionOf(vm, value, uniform);
  };
  return [
    pick('topLeftRadius'),
    pick('topRightRadius'),
    pick('bottomRightRadius'),
    pick('bottomLeftRadius'),
  ];
}

function parseRadiiArray(vm, value) {
  const raw = value?.$data || value;
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const num = (entry) => {
    if (typeof entry === 'number') return Number.isFinite(entry) ? (Math.abs(entry) > 4096 ? floatBitsToNumber(entry | 0) : entry) : 0;
    return dimensionOf(vm, entry, 0);
  };
  return [num(raw[0]), num(raw[1]), num(raw[2]), num(raw[3]), num(raw[4]), num(raw[5]), num(raw[6]), num(raw[7])];
}

function radiiToCorners(radii) {
  if (!radii || radii.length < 8) return [0, 0, 0, 0];
  return [radii[0], radii[2], radii[4], radii[6]];
}

function makeGradient(ctx, gradient, rect, vm) {
  const type = toInt(attrValue(gradient, 'type'));
  const isRadial = attrValue(gradient, 'type') === 'radial' || type === 1;
  const isSweep = attrValue(gradient, 'type') === 'sweep' || type === 2;
  const start = colorOf(vm, attrValue(gradient, 'startColor'), null);
  const center = colorOf(vm, attrValue(gradient, 'centerColor'), null);
  const end = colorOf(vm, attrValue(gradient, 'endColor'), null);
  const stops = [];
  if (start !== null) stops.push([0, start]);
  if (center !== null) stops.push([0.5, center]);
  if (end !== null) stops.push([1, end]);
  if (stops.length < 2) return null;
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  try {
    if (isRadial) {
      const radius = dimensionOf(vm, attrValue(gradient, 'gradientRadius'), Math.max(rect.right - rect.left, rect.bottom - rect.top) / 2);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, radius));
      for (const [offset, color] of stops) grad.addColorStop(offset, cssColor(color));
      return grad;
    }
    if (isSweep && typeof ctx.createConicGradient === 'function') {
      const grad = ctx.createConicGradient(0, cx, cy);
      for (const [offset, color] of stops) grad.addColorStop(offset, cssColor(color));
      return grad;
    }
    const angle = dimensionOf(vm, attrValue(gradient, 'angle'), 0);
    const radians = (angle * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = -Math.sin(radians);
    const half = Math.max(rect.right - rect.left, rect.bottom - rect.top) / 2;
    const grad = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
    for (const [offset, color] of stops) grad.addColorStop(offset, cssColor(color));
    return grad;
  } catch (_error) {
    return null;
  }
}

export function drawShapeNode(ctx, shape, rect, options = {}) {
  const vm = options.vm || null;
  const shapeType = String(attrValue(shape, 'shape') ?? 'rectangle').toLowerCase();
  const solid = firstChildNamed(shape, 'solid');
  const gradient = firstChildNamed(shape, 'gradient');
  const corners = firstChildNamed(shape, 'corners');
  const stroke = firstChildNamed(shape, 'stroke');
  const radii = cornerRadiiOf(vm, corners);
  const tint = tintColorOf(options.peer, options);
  const alpha = options.peer?.alpha;

  let fillStyle = null;
  if (gradient) fillStyle = makeGradient(ctx, gradient, rect, vm);
  if (!fillStyle && solid) fillStyle = cssColor(applyAlphaToColor(colorOf(vm, attrValue(solid, 'color'), 0), alpha, options));
  if (tint !== null && tint !== undefined) {
    fillStyle = cssColor(applyAlphaToColor(tint, alpha, options));
  }

  ctx.save();
  if (shapeType === 'oval' || shapeType === 'ring') {
    ovalPath(ctx, rect);
  } else if (shapeType === 'line') {
    const y = (rect.top + rect.bottom) / 2;
    ctx.beginPath();
    ctx.moveTo(rect.left, y);
    ctx.lineTo(rect.right, y);
  } else {
    shapePath(ctx, rect, radii);
  }
  if (fillStyle && shapeType !== 'line') {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (stroke) {
    const strokeColor = tint !== null && tint !== undefined
      ? tint
      : colorOf(vm, attrValue(stroke, 'color'), 0xff000000);
    const strokeWidth = dimensionOf(vm, attrValue(stroke, 'width'), 1) || 1;
    ctx.strokeStyle = cssColor(applyAlphaToColor(strokeColor, alpha, options));
    ctx.lineWidth = strokeWidth;
    const dashWidth = dimensionOf(vm, attrValue(stroke, 'dashWidth'), 0);
    const dashGap = dimensionOf(vm, attrValue(stroke, 'dashGap'), 0);
    if (dashWidth > 0) {
      try {
        ctx.setLineDash([dashWidth, dashGap || dashWidth]);
      } catch (_error) {
        void _error;
      }
    }
    if (shapeType === 'line') ctx.lineWidth = strokeWidth || 1;
    ctx.stroke();
    try {
      ctx.setLineDash([]);
    } catch (_error) {
      void _error;
    }
  }
  ctx.restore();
  return true;
}

function insetRect(vm, rect, node, defaults = {}) {
  const uniform = dimensionOf(vm, attrValue(node, 'inset'), null);
  const pick = (names, fallback) => {
    if (uniform !== null && uniform !== undefined && names.includes('insetLeft')) return uniform;
    for (const name of names) {
      const value = attrValue(node, name);
      if (value !== null && value !== undefined) return dimensionOf(vm, value, fallback);
    }
    return fallback;
  };
  const left = pick(['insetLeft', 'left'], defaults.left || 0);
  const top = pick(['insetTop', 'top'], defaults.top || 0);
  const right = pick(['insetRight', 'right'], defaults.right || 0);
  const bottom = pick(['insetBottom', 'bottom'], defaults.bottom || 0);
  return {
    left: rect.left + left,
    top: rect.top + top,
    right: rect.right - right,
    bottom: rect.bottom - bottom,
  };
}

function verticalInset(rect, y) {
  return { left: rect.left, top: rect.top + y, right: rect.right, bottom: rect.bottom + y };
}

function scaleRect(vm, rect, node) {
  const width = fractionOf(vm, attrValue(node, 'scaleWidth'), 1);
  const height = fractionOf(vm, attrValue(node, 'scaleHeight'), 1);
  if (width === 1 && height === 1) return rect;
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const halfW = ((rect.right - rect.left) * width) / 2;
  const halfH = ((rect.bottom - rect.top) * height) / 2;
  return { left: cx - halfW, top: cy - halfH, right: cx + halfW, bottom: cy + halfH };
}

function drawItem(ctx, item, rect, options) {
  if (!item) return false;
  const vm = options.vm;
  const stateMap = stateMapFor(options.state);
  if (!matchesStateNode(item, stateMap)) return false;
  const child = elementChildren(item).find((node) =>
    ['shape', 'vector', 'ripple', 'selector', 'inset', 'layer-list', 'bitmap', 'clip', 'scale', 'animated-vector', 'level-list', 'transition', 'animated-selector'].includes(node.name));
  if (child) {
    const nested = insetRect(vm, rect, item, {});
    return drawXmlRoot(ctx, child, clampRect(nested), { ...options, wrapper: null });
  }
  const drawableAttr = attrValue(item, 'drawable');
  if (drawableAttr !== null && drawableAttr !== undefined) {
    const resolved = drawableFromAttr(vm, drawableAttr);
    if (resolved) return drawDrawable(ctx, resolved, rect, options);
  }
  const colorAttr = attrValue(item, 'color');
  if (colorAttr !== null && colorAttr !== undefined) {
    const color = colorOf(vm, colorAttr, null);
    if (color !== null) {
      ctx.save();
      ctx.fillStyle = cssColor(applyAlphaToColor(color, options.peer?.alpha, options));
      ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
      ctx.restore();
      return true;
    }
  }
  return false;
}

function matchesStateNode(node, stateMap) {
  for (const attr of node?.attrs || []) {
    const name = attr?.name || '';
    const local = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
    if (!local.startsWith('state_')) continue;
    const key = local.slice('state_'.length);
    const expected = attr.value === true || attr.value === 'true' || attr.value === 1;
    const actual = !!stateMap[key];
    if (expected !== actual) return false;
  }
  return true;
}

function clampRect(rect) {
  return {
    left: rect.left,
    top: rect.top,
    right: Math.max(rect.left, rect.right),
    bottom: Math.max(rect.top, rect.bottom),
  };
}

function hasStateAttrs(node) {
  return (node?.attrs || []).some((attr) => {
    const name = attr?.name || '';
    const local = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
    return local.startsWith('state_');
  });
}

function drawXmlRoot(ctx, node, rect, options) {
  if (!node) return false;
  const vm = options.vm || null;
  const name = node.name;
  if (name === 'shape') return drawShapeNode(ctx, node, rect, options);
  if (name === 'vector') {
    return drawVectorRaw(ctx, 0, 0, { xml: node, tint: options.wrapper?.tint }, rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  }
  if (name === 'ripple') {
    let drew = false;
    for (const item of elementChildren(node)) {
      if (item.name !== 'item') continue;
      const id = String(attrValue(item, 'id') ?? '');
      if (id.includes('mask')) continue;
      drew = drawItem(ctx, item, rect, options) || drew;
    }
    return drew;
  }
  if (name === 'selector' || name === 'animated-selector' || name === 'transition' || name === 'level-list') {
    const items = elementChildren(node).filter((child) => child.name === 'item');
    const stateMap = stateMapFor(options.state);
    const matched = items.find((item) => {
      if (!hasStateAttrs(item)) return true;
      return matchesStateNode(item, stateMap);
    });
    if (matched) return drawItem(ctx, matched, rect, options);
    if (items.length) return drawItem(ctx, items[0], rect, options);
    return false;
  }
  if (name === 'inset') {
    const inner = insetRect(vm, rect, node, {});
    const child = elementChildren(node)[0];
    if (!child) {
      const drawableAttr = attrValue(node, 'drawable');
      const resolved = drawableFromAttr(vm, drawableAttr);
      return resolved ? drawDrawable(ctx, resolved, clampRect(inner), options) : false;
    }
    return drawXmlRoot(ctx, child, clampRect(inner), options);
  }
  if (name === 'layer-list') {
    let drew = false;
    for (const item of elementChildren(node)) {
      if (item.name !== 'item') continue;
      drew = drawItem(ctx, item, rect, options) || drew;
    }
    return drew;
  }
  if (name === 'clip') {
    const child = elementChildren(node)[0];
    if (!child) return false;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    ctx.clip();
    const drew = drawXmlRoot(ctx, child, rect, options);
    ctx.restore();
    return drew;
  }
  if (name === 'scale') {
    const child = elementChildren(node)[0];
    if (!child) {
      const drawableAttr = attrValue(node, 'drawable');
      const resolved = drawableFromAttr(vm, drawableAttr);
      return resolved ? drawDrawable(ctx, resolved, scaleRect(vm, rect, node), options) : false;
    }
    return drawXmlRoot(ctx, child, clampRect(scaleRect(vm, rect, node)), options);
  }
  if (name === 'animated-vector') {
    const drawableAttr = attrValue(node, 'drawable');
    const resolved = drawableFromAttr(vm, drawableAttr);
    if (resolved) return drawDrawable(ctx, resolved, rect, options);
    const target = firstChildNamed(node, 'target');
    const animation = attrValue(target, 'animation');
    void animation;
    return false;
  }
  const child = elementChildren(node)[0];
  if (child) return drawXmlRoot(ctx, child, rect, options);
  return false;
}

/* ----------------------------------------------------------------------------
 * 统一入口
 * ------------------------------------------------------------------------- */

export function drawDrawable(ctx, drawable, rect, options = {}) {
  if (!ctx || !drawable) return false;
  const safeRect = clampRect(rect);
  if (safeRect.right <= safeRect.left || safeRect.bottom <= safeRect.top) {
    // 仍然允许零尺寸时短路，避免 Canvas 报错
    return false;
  }
  if (isResourceDrawable(drawable)) {
    const wrapper = drawable;
    const innerOptions = { ...options, wrapper };
    switch (drawable.type) {
      case 'color': {
        const tint = tintColorOf(null, innerOptions);
        const color = tint !== null && tint !== undefined ? tint : drawable.color;
        ctx.save();
        ctx.fillStyle = cssColor(applyAlphaToColor(color, options.peer?.alpha, options));
        ctx.fillRect(safeRect.left, safeRect.top, safeRect.right - safeRect.left, safeRect.bottom - safeRect.top);
        ctx.restore();
        return true;
      }
      case 'shape':
        return drawShapeNode(ctx, drawable.xml, safeRect, innerOptions);
      case 'xml':
        return drawXmlRoot(ctx, drawable.xml, safeRect, innerOptions);
      case 'bitmap': {
        const image = drawable.bitmap?.image;
        if (!image) return false;
        ctx.save();
        ctx.drawImage(image, safeRect.left, safeRect.top, safeRect.right - safeRect.left, safeRect.bottom - safeRect.top);
        ctx.restore();
        return true;
      }
      default:
        return false;
    }
  }

  const vm = options.vm || drawable.$vm || drawable.vm || null;
  const peer = resolvePeer(drawable, vm);
  if (peer) return drawPeer(ctx, peer, safeRect, { ...options, vm });

  // 没有 host peer 的 Java 对象（例如纯 DEX Drawable）
  return drawDexObject(ctx, drawable, safeRect, { ...options, vm });
}

function drawPeer(ctx, peer, rect, options) {
  const vm = peer.vm || options.vm;
  if (peer.resource) {
    const state = peer.state?.$data || peer.state || options.state;
    return drawDrawable(ctx, peer.resource, rect, { ...options, vm, peer, state });
  }
  const kind = peer.kind || 'base';
  const drawer = PEER_DRAWERS[kind];
  if (drawer) return drawer(ctx, peer, rect, { ...options, vm });
  if (peer.$object) return drawDexObject(ctx, peer.$object, rect, { ...options, vm, peer });
  return false;
}

const PEER_DRAWERS = {};

function drawDexObject(ctx, object, rect, options) {
  const vm = options.vm || object?.$vm;
  if (!vm || typeof vm.findVirtual !== 'function' || !object) return false;
  const descriptor = descriptorOf(object, vm);
  if (!descriptor) return false;
  let drawRes = null;
  try {
    drawRes = vm.findVirtual(descriptor, 'draw', '(Landroid/graphics/Canvas;)V');
  } catch (_error) {
    return false;
  }
  if (!drawRes || (drawRes.kind !== 'dex' && drawRes.kind !== 'native')) return false;
  setDrawableBounds(vm, object, rect);
  try {
    const canvasObject = createCanvasObject(vm, ctx, rect);
    vm.invoke({ classDesc: descriptor, name: 'draw', proto: drawRes.method.proto }, object, [canvasObject], 'virtual');
    return true;
  } catch (_error) {
    return false;
  }
}

function createCanvasObject(vm, ctx, rect) {
  const object = vm.allocateRawObject('Landroid/graphics/Canvas;');
  const canvas = new Canvas(ctx, rect.right, rect.bottom, 0, 0);
  object.$peer = { canvas, $saveDepth: 0 };
  return object;
}

export function setDrawableBounds(vm, drawable, rect) {
  if (!drawable) return;
  const engine = vm || drawable.$vm || drawable.vm || null;
  const peer = resolvePeer(drawable, engine);
  if (peer && typeof peer === 'object' && ('bounds' in peer || peer.kind)) {
    peer.bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }
  if (!engine || typeof engine.findVirtual !== 'function') return;
  const descriptor = descriptorOf(drawable, engine);
  if (!descriptor) return;
  let boundsRes = null;
  try {
    boundsRes = engine.findVirtual(descriptor, 'setBounds', '(IIII)V');
  } catch (_error) {
    boundsRes = null;
  }
  if (!boundsRes) return;
  if (boundsRes.kind !== 'dex' && boundsRes.kind !== 'native') return;
  const proto = boundsRes.method?.proto || {
    descriptor: '(IIII)V',
    parameters: ['I', 'I', 'I', 'I'],
    returnType: 'V',
  };
  try {
    engine.invoke(
      { classDesc: descriptor, name: 'setBounds', proto },
      drawable,
      [rect.left | 0, rect.top | 0, rect.right | 0, rect.bottom | 0],
      'virtual',
    );
  } catch (_error) {
    void _error;
  }
}

function drawNested(ctx, drawable, rect, options) {
  if (!drawable) return false;
  setDrawableBounds(options.vm, drawable, rect);
  return drawDrawable(ctx, drawable, rect, options);
}

function nestedAlpha(peer, options) {
  return peer?.alpha === undefined ? options.alpha : peer.alpha;
}

/* ----------------------------------------------------------------------------
 * 各 Drawable 的绘制实现
 * ------------------------------------------------------------------------- */

PEER_DRAWERS.base = (ctx, peer, rect, options) => {
  if (peer.$drawing) return false;
  if (peer.content) return drawNested(ctx, peer.content, rect, { ...options, alpha: nestedAlpha(peer, options) });
  if (peer.drawable) return drawNested(ctx, peer.drawable, rect, { ...options, alpha: nestedAlpha(peer, options) });
  if (typeof peer.color === 'number') {
    const tint = tintColorOf(peer, options);
    ctx.save();
    ctx.fillStyle = cssColor(applyAlphaToColor(tint !== null && tint !== undefined ? tint : peer.color, peer.alpha, options));
    const radius = peer.cornerRadius || 0;
    shapePath(ctx, rect, radius ? [radius, radius, radius, radius] : [0, 0, 0, 0]);
    ctx.fill();
    ctx.restore();
    return true;
  }
  if (peer.$object) return drawDexObject(ctx, peer.$object, rect, options);
  return false;
};

PEER_DRAWERS.inset = (ctx, peer, rect, options) => {
  const inner = {
    left: rect.left + (peer.insetLeft | 0),
    top: rect.top + (peer.insetTop | 0),
    right: rect.right - (peer.insetRight | 0),
    bottom: rect.bottom - (peer.insetBottom | 0),
  };
  if (!peer.drawable) return false;
  return drawNested(ctx, peer.drawable, clampRect(inner), { ...options, alpha: nestedAlpha(peer, options) });
};

PEER_DRAWERS.layer = (ctx, peer, rect, options) => {
  const layers = Array.isArray(peer.layers) ? peer.layers : [];
  let drew = false;
  for (const layer of layers) {
    if (!layer?.drawable) continue;
    let target = {
      left: rect.left + (layer.insetLeft | 0),
      top: rect.top + (layer.insetTop | 0),
      right: rect.right - (layer.insetRight | 0),
      bottom: rect.bottom - (layer.insetBottom | 0),
    };
    if (typeof layer.width === 'number' && layer.width > 0) {
      target = verticalInset({ left: target.left, top: target.top, right: target.left + layer.width, bottom: target.top + (layer.height > 0 ? layer.height : target.bottom - target.top) }, 0);
    }
    drew = drawNested(ctx, layer.drawable, clampRect(target), { ...options, alpha: nestedAlpha(peer, options) }) || drew;
  }
  return drew;
};

function cubicBezier(t, x1, y1, x2, y2) {
  const sample = (u) => {
    const v = 1 - u;
    return 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u;
  };
  let low = 0;
  let high = 1;
  let u = t;
  for (let i = 0; i < 12; i++) {
    const x = sample(u);
    if (Math.abs(x - t) < 1e-4) break;
    if (x < t) low = u; else high = u;
    u = (low + high) / 2;
  }
  const v = 1 - u;
  return 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u;
}

const RIPPLE_ENTER = 225;
const RIPPLE_OPACITY_IN = 75;
const RIPPLE_OPACITY_OUT = 150;
const RIPPLE_HOLD = 225;

function rippleColorOf(peer, options) {
  const stateSet = options.stateSet || stateSetFor(options.state);
  const color = colorStateListColor(peer.rippleColor, stateSet);
  if (color !== null) return color >>> 0;
  if (typeof peer.fallbackRippleColor === 'number') return peer.fallbackRippleColor >>> 0;
  return 0x33000000;
}

function rippleRadius(peer, rect) {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const maxRadius = Number(peer.maxRadius);
  if (maxRadius >= 0) return maxRadius;
  return Math.hypot(width / 2, height / 2);
}

PEER_DRAWERS.ripple = (ctx, peer, rect, options) => {
  let drew = false;
  if (peer.content) drew = drawNested(ctx, peer.content, rect, { ...options, alpha: nestedAlpha(peer, options) });

  const now = Date.now();
  const pressed = peer.$pressed === true;
  if (pressed && !peer.$rippleActive) {
    peer.$rippleActive = true;
    peer.$rippleStart = now;
    peer.$rippleRelease = 0;
  }
  if (!pressed && peer.$rippleActive && !peer.$rippleRelease) peer.$rippleRelease = now;

  const active = peer.$rippleActive;
  if (!active) return drew;

  const start = peer.$rippleStart || now;
  const elapsed = now - start;
  const target = rippleRadius(peer, rect);
  const startRadius = Math.max(rect.right - rect.left, rect.bottom - rect.top) * 0.3;
  const enter = cubicBezier(Math.min(1, elapsed / RIPPLE_ENTER), 0.4, 0, 0.2, 1);
  let radius = startRadius + (target - startRadius) * enter;
  let opacity = 0;
  if (elapsed < RIPPLE_OPACITY_IN) opacity = elapsed / RIPPLE_OPACITY_IN;
  else opacity = 1;

  if (peer.$rippleRelease) {
    const releaseElapsed = now - peer.$rippleRelease;
    const hold = Math.max(0, RIPPLE_HOLD - (peer.$rippleRelease - start));
    if (releaseElapsed >= hold) {
      const fade = (releaseElapsed - hold) / RIPPLE_OPACITY_OUT;
      if (fade >= 1) {
        peer.$rippleActive = false;
        peer.$rippleRelease = 0;
        return drew;
      }
      opacity *= 1 - fade;
    } else {
      opacity = 1;
    }
    options.onInvalidate?.();
  } else {
    options.onInvalidate?.();
  }

  const color = rippleColorOf(peer, options);
  const alpha = ((color >>> 24) & 0xff) / 255;
  if (opacity <= 0) return drew;
  const cx = rect.left + (peer.hotspotX === undefined ? (rect.right - rect.left) / 2 : peer.hotspotX - rect.left);
  const cy = rect.top + (peer.hotspotY === undefined ? (rect.bottom - rect.top) / 2 : peer.hotspotY - rect.top);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(0, radius), 0, Math.PI * 2);
  ctx.fillStyle = cssColor(((color & 0xffffff) | (Math.round(alpha * opacity * 255) << 24)) >>> 0);
  ctx.fill();
  ctx.restore();
  return true;
};

PEER_DRAWERS.gradient = (ctx, peer, rect, options) => {
  const vm = peer.vm || options.vm;
  const radii = peer.cornerRadii ? radiiToCorners(peer.cornerRadii) : null;
  const uniform = Number(peer.cornerRadius) || 0;
  const corners = radii || [uniform, uniform, uniform, uniform];
  const tint = tintColorOf(peer, options);
  const alpha = peer.alpha === undefined ? options.alpha : peer.alpha;
  ctx.save();
  if (peer.shape === 1) ovalPath(ctx, rect);
  else shapePath(ctx, rect, corners);
  let fill = null;
  if (Array.isArray(peer.colors) && peer.colors.length >= 2) {
    const [c1, c2] = peer.colors;
    const gradient = ctx.createLinearGradient(
      rect.left, rect.top,
      peer.gradientType === 1 ? rect.left : rect.right,
      peer.gradientType === 1 ? rect.bottom : rect.top,
    );
    gradient.addColorStop(0, cssColor(c1));
    gradient.addColorStop(1, cssColor(c2));
    fill = gradient;
  } else if (typeof peer.color === 'number' && (peer.color >>> 24) !== 0) {
    fill = cssColor(applyAlphaToColor(peer.color, alpha, options));
  }
  if (tint !== null && tint !== undefined) fill = cssColor(applyAlphaToColor(tint, alpha, options));
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (peer.strokeWidth > 0) {
    ctx.strokeStyle = cssColor(applyAlphaToColor(peer.strokeColor ?? 0xff000000, alpha, options));
    ctx.lineWidth = peer.strokeWidth;
    ctx.stroke();
  }
  ctx.restore();
  return true;
};

PEER_DRAWERS.state = (ctx, peer, rect, options) => {
  const current = peer.current || pickStateLayer(peer, options.stateSet || stateSetFor(options.state));
  if (!current) return false;
  return drawNested(ctx, current, rect, { ...options, alpha: nestedAlpha(peer, options) });
};

function pickStateLayer(peer, stateSet) {
  const layers = Array.isArray(peer.layers) ? peer.layers : [];
  for (const layer of layers) {
    if (matchesStateSpec(layer.stateSet, stateSet)) return layer.drawable;
  }
  for (const layer of layers) {
    const spec = layer.stateSet?.$data || layer.stateSet || [];
    if (!spec.length) return layer.drawable;
  }
  const fallback = peer.layers;
  return Array.isArray(fallback) && fallback.length ? fallback[fallback.length - 1].drawable : null;
}

PEER_DRAWERS.shape = (ctx, peer, rect, options) => {
  if (peer.shape?.$peer) {
    try {
      peer.shape.$peer.draw?.(options.canvasObject, peer.paintPeer);
      return true;
    } catch (_error) {
      void _error;
    }
  }
  if (typeof peer.color === 'number') {
    ctx.save();
    ctx.fillStyle = cssColor(applyAlphaToColor(peer.color, peer.alpha, options));
    ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
    ctx.restore();
    return true;
  }
  return false;
};

PEER_DRAWERS.clip = (ctx, peer, rect, options) => {
  if (!peer.drawable) return false;
  const fraction = Math.max(0, Math.min(1, (peer.level | 0) / 10000));
  if (fraction <= 0) return false;
  const orientation = peer.clipOrientation | 0;
  const horizontal = (orientation & 0x1) === 0x1;
  const vertical = (orientation & 0x2) === 0x2;
  ctx.save();
  ctx.beginPath();
  if (horizontal && vertical) {
    ctx.rect(rect.left, rect.top, (rect.right - rect.left) * fraction, (rect.bottom - rect.top) * fraction);
  } else if (vertical) {
    ctx.rect(rect.left, rect.top, rect.right - rect.left, (rect.bottom - rect.top) * fraction);
  } else {
    ctx.rect(rect.left, rect.top, (rect.right - rect.left) * fraction, rect.bottom - rect.top);
  }
  ctx.clip();
  const drew = drawNested(ctx, peer.drawable, rect, { ...options, alpha: nestedAlpha(peer, options) });
  ctx.restore();
  return drew;
};

PEER_DRAWERS.scale = (ctx, peer, rect, options) => {
  if (!peer.drawable) return false;
  const fraction = Math.max(0, Math.min(1, (peer.level | 0) / 10000));
  const width = (rect.right - rect.left) * fraction * (Number(peer.scaleWidth) || 1);
  const height = (rect.bottom - rect.top) * (Number(peer.scaleHeight) || 1);
  if (width <= 0) return false;
  const target = { left: rect.left, top: rect.top, right: rect.left + width, bottom: rect.top + height };
  return drawNested(ctx, peer.drawable, target, { ...options, alpha: nestedAlpha(peer, options) });
};

PEER_DRAWERS.rotate = (ctx, peer, rect, options) => {
  if (!peer.drawable) return false;
  const fraction = Math.max(0, Math.min(1, (peer.level | 0) / 10000));
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const angle = ((Number(peer.fromDegrees) || 0) + ((Number(peer.toDegrees) || 0) - (Number(peer.fromDegrees) || 0)) * fraction) * Math.PI / 180;
  const pivotX = rect.left + width * (Number(peer.pivotX) || 0.5);
  const pivotY = rect.top + height * (Number(peer.pivotY) || 0.5);
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(angle);
  ctx.translate(-pivotX, -pivotY);
  const drew = drawNested(ctx, peer.drawable, rect, { ...options, alpha: nestedAlpha(peer, options) });
  ctx.restore();
  return drew;
};

PEER_DRAWERS.bitmap = (ctx, peer, rect, options) => {
  const image = peer.image || peer.bitmap?.image;
  if (!image) return false;
  ctx.save();
  ctx.globalAlpha = (peer.alpha === undefined ? 255 : peer.alpha) / 255;
  ctx.drawImage(image, rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  ctx.restore();
  return true;
};

PEER_DRAWERS.vector = (ctx, peer, rect, options) => {
  if (!peer.root) return false;
  return drawVectorRaw(ctx, 0, 0, { xml: peer.root, tint: peer.tint }, rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
};

PEER_DRAWERS.color = (ctx, peer, rect, options) => {
  const tint = tintColorOf(peer, options);
  const color = tint !== null && tint !== undefined ? tint : peer.color;
  ctx.save();
  ctx.fillStyle = cssColor(applyAlphaToColor(color, peer.alpha, options));
  const radius = Number(peer.cornerRadius) || 0;
  if (radius > 0) {
    shapePath(ctx, rect, [radius, radius, radius, radius]);
    ctx.fill();
  } else {
    ctx.fillRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
  }
  ctx.restore();
  return true;
};

/* ----------------------------------------------------------------------------
 * Drawable host 定义
 * ------------------------------------------------------------------------- */

function drawBase(self, canvas) {
  const peer = self;
  const canvasPeer = canvas?.$peer;
  const ctx = canvasPeer?.canvas?.context;
  if (!ctx) return;
  const bounds = peer.bounds || { left: 0, top: 0, right: 0, bottom: 0 };
  if (peer.$drawing) return;
  peer.$drawing = true;
  try {
    drawDrawable(ctx, peer.$object || peer, bounds, {
      vm: peer.vm,
      alpha: peer.alpha === undefined ? undefined : peer.alpha / 255,
      state: peer.state,
      stateSet: peer.state,
    });
  } finally {
    peer.$drawing = false;
  }
}

function ensureRectObject(self) {
  if (self.boundsObject) return self.boundsObject;
  const vm = self.vm;
  if (!vm?.allocateRawObject) return null;
  const rect = vm.allocateRawObject('Landroid/graphics/Rect;');
  self.boundsObject = rect;
  return rect;
}

function writeBoundsToRect(self, rect) {
  if (!rect) return;
  const bounds = self.bounds || { left: 0, top: 0, right: 0, bottom: 0 };
  const set = (name, value) => {
    if (rect.$peer) rect.$peer[name] = value | 0;
    if (rect.$fields) rect.$fields.set(`Landroid/graphics/Rect;->${name}:I`, value | 0);
  };
  set('left', bounds.left | 0);
  set('top', bounds.top | 0);
  set('right', bounds.right | 0);
  set('bottom', bounds.bottom | 0);
}

function boundsFromRect(rect) {
  const peer = rect?.$peer || rect || {};
  const num = (value) => (typeof value === 'number' ? value | 0 : 0);
  return { left: num(peer.left), top: num(peer.top), right: num(peer.right), bottom: num(peer.bottom) };
}

function setBoundsFields(self, left, top, right, bottom) {
  self.bounds = { left: left | 0, top: top | 0, right: right | 0, bottom: bottom | 0 };
  if (self.boundsObject) writeBoundsToRect(self, self.boundsObject);
}

function baseDrawableMethods() {
  return {
    'setBounds(IIII)V': (self, [left, top, right, bottom]) => {
      setBoundsFields(self, toInt(left), toInt(top), toInt(right), toInt(bottom));
    },
    'setBounds(Landroid/graphics/Rect;)V': (self, [rect]) => {
      const bounds = boundsFromRect(rect);
      setBoundsFields(self, bounds.left, bounds.top, bounds.right, bounds.bottom);
    },
    'getBounds()Landroid/graphics/Rect;': (self) => {
      const rect = ensureRectObject(self);
      if (!rect && globalThis.__DBG_BOUNDS) {
        console.error('GB-NULL kind=' + self?.kind + ' obj=' + (self?.$object?.$dexClass?.descriptor || self?.$object?.$nativeClass) + ' vm=' + !!self?.vm + ' selfDesc=' + (self?.$dexClass?.descriptor || self?.$nativeClass || self?.$descriptor) + ' ctor=' + self?.constructor?.name + ' keys=' + (self && typeof self === 'object' ? Object.keys(self).slice(0,6).join(',') : typeof self));
      }
      writeBoundsToRect(self, rect);
      return rect;
    },
    'copyBounds()Landroid/graphics/Rect;': (self) => {
      const rect = ensureRectObject(self);
      writeBoundsToRect(self, rect);
      return rect;
    },
    'copyBounds(Landroid/graphics/Rect;)V': (self, [rect]) => {
      writeBoundsToRect(self, rect);
    },
    'setAlpha(I)V': (self, [alpha]) => { self.alpha = toInt(alpha) & 0xff; },
    'getAlpha()I': (self) => (self.alpha ?? 255),
    'setColorFilter(Landroid/graphics/ColorFilter;)V': (self, [filter]) => { self.colorFilter = filter ?? null; },
    'getColorFilter()Landroid/graphics/ColorFilter;': (self) => self.colorFilter ?? null,
    'clearColorFilter()V': (self) => { self.colorFilter = null; },
    'setTint(I)V': (self, [color]) => { self.tint = toInt(color) >>> 0; },
    'setTintList(Landroid/content/res/ColorStateList;)V': (self, [list]) => { self.tintList = list ?? null; },
    'setTintMode(Landroid/graphics/PorterDuff$Mode;)V': (self, [mode]) => { self.tintMode = mode ?? null; },
    'getTintMode()Landroid/graphics/PorterDuff$Mode;': (self) => self.tintMode ?? null,
    'setState([I)Z': (self, [state]) => {
      self.state = state?.$data || state || [];
      return true;
    },
    'getState()[I': (self, _args, vm) => {
      const values = Array.isArray(self.state) ? self.state : [];
      const array = vm?.newArray ? vm.newArray('I', values.length) : { $data: values.slice() };
      for (let i = 0; i < values.length; i++) array.$data[i] = values[i] | 0;
      return array;
    },
    'isStateful()Z': (self) => (self.stateful ? 1 : 0),
    'getOpacity()I': () => -1,
    'isVisible()Z': (self) => (self.visible === false ? 0 : 1),
    'setVisible(ZZ)Z': (self, [visible]) => { self.visible = !!visible; return true; },
    'mutate()Landroid/graphics/drawable/Drawable;': (self) => self.$object ?? self,
    'invalidateSelf()V': () => undefined,
    'draw(Landroid/graphics/Canvas;)V': (self, [canvas]) => {
      drawBase(self, canvas);
    },
  };
}

function baseDrawableCtor(kind) {
  return peerClass(function () {
    this.kind = kind;
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.alpha = 255;
    this.state = [];
    this.tint = null;
    this.tintList = null;
    this.tintMode = null;
    this.visible = true;
  });
}

const DrawableDef = nativeDef('Landroid/graphics/drawable/Drawable;', {
  super: 'Ljava/lang/Object;',
  ctor: baseDrawableCtor('base'),
  methods: {
    ...baseDrawableMethods(),
    'getIntrinsicWidth()I': () => -1,
    'getIntrinsicHeight()I': () => -1,
    'getMinimumWidth()I': () => 0,
    'getMinimumHeight()I': () => 0,
    'getPadding(Landroid/graphics/Rect;)Z': () => 0,
    'jumpToCurrentState()V': () => undefined,
    'applyTheme(Landroid/content/res/Resources$Theme;)V': () => undefined,
  },
});

const ColorDrawableMethods = {
  'getColor()I': (self) => self.color | 0,
  'setColor(I)V': (self, [color]) => { self.color = toInt(color) >>> 0; },
};

const ColorDrawableDef = nativeDef('Landroid/graphics/drawable/ColorDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.kind = 'color';
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.alpha = 255;
    this.color = 0;
  }, { kind: 'color' }),
  methods: {
    '<init>()V': (self) => { self.color = 0; },
    '<init>(I)V': (self, [color]) => { self.color = toInt(color) >>> 0; },
    ...ColorDrawableMethods,
    ...baseDrawableMethods(),
  },
});

function gradientPeerInit(self) {
  self.kind = 'gradient';
  self.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
  self.shape = 0;
  self.color = 0;
  self.colors = null;
  self.gradientType = 0;
  self.strokeColor = 0;
  self.strokeWidth = 0;
  self.cornerRadius = 0;
  self.cornerRadii = null;
  self.alpha = 255;
  self.tint = null;
  self.tintList = null;
}

const ORIENTATION_ANGLES = [270, 225, 180, 135, 90, 45, 0, 315];

const GradientDrawableDef = nativeDef('Landroid/graphics/drawable/GradientDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(gradientPeerInit, { kind: 'gradient' }),
  methods: {
    '<init>()V': (self) => gradientPeerInit(self),
    '<init>(Landroid/graphics/drawable/GradientDrawable$Orientation;[I)V': (self, [orientation, colors]) => {
      gradientPeerInit(self);
      const ordinal = typeof orientation === 'number' ? orientation : orientation?.$peer?.ordinal;
      self.orientation = ordinal;
      self.colors = (colors?.$data || colors || []).map((c) => c >>> 0);
      self.gradientAngle = ORIENTATION_ANGLES[ordinal] ?? 270;
    },
    'setShape(I)V': (self, [shape]) => { self.shape = toInt(shape); },
    'getShape()I': (self) => self.shape | 0,
    'setColor(I)V': (self, [color]) => { self.color = toInt(color) >>> 0; self.colors = null; },
    'setColor(Landroid/content/res/ColorStateList;)V': (self, [csl]) => {
      const color = colorStateListColor(csl, stateSetFor(self.state));
      if (color !== null) self.color = color;
      self.colorStateList = csl ?? null;
    },
    'setColors([I)V': (self, [colors]) => {
      const values = (colors?.$data || colors || []).map((c) => c >>> 0);
      self.colors = values.length ? values : null;
      if (values.length) self.color = values[values.length - 1];
    },
    'getColors()[I': (self, _args, vm) => {
      const values = self.colors || [];
      const array = vm?.newArray ? vm.newArray('I', values.length) : { $data: [] };
      values.forEach((value, index) => { array.$data[index] = value | 0; });
      return array;
    },
    'setStroke(ILandroid/content/res/ColorStateList;)V': (self, [width, csl]) => {
      self.strokeWidth = toInt(width);
      const color = colorStateListColor(csl, stateSetFor(self.state));
      self.strokeColor = color === null ? 0xff000000 : color;
      self.strokeColorList = csl ?? null;
    },
    'setStroke(II)V': (self, [width, color]) => {
      self.strokeWidth = toInt(width);
      self.strokeColor = toInt(color) >>> 0;
    },
    'setCornerRadius(F)V': (self, [radius]) => { self.cornerRadius = Number(radius) || 0; self.cornerRadii = null; },
    'getCornerRadius()F': (self) => numberToFloatBits(Number(self.cornerRadius) || 0),
    'setCornerRadii([F)V': (self, [radii]) => {
      self.cornerRadii = parseRadiiArray(self.vm, radii);
      self.cornerRadius = 0;
    },
    'getCornerRadii()[F': (self, _args, vm) => {
      const values = self.cornerRadii || [0, 0, 0, 0, 0, 0, 0, 0];
      const array = vm?.newArray ? vm.newArray('F', values.length) : { $data: [] };
      values.forEach((value, index) => { array.$data[index] = numberToFloatBits(Number(value) || 0); });
      return array;
    },
    'setGradientType(I)V': (self, [type]) => { self.gradientType = toInt(type); },
    'getGradientType()I': (self) => self.gradientType | 0,
    'setGradientRadius(F)V': (self, [radius]) => { self.gradientRadius = Number(radius) || 0; },
    'setGradientCenter(FF)V': (self, [x, y]) => {
      self.gradientCenterX = Number(x) || 0;
      self.gradientCenterY = Number(y) || 0;
    },
    'setUseLevel(Z)V': () => undefined,
    'setSize(II)V': (self, [width, height]) => { self.intrinsicWidth = toInt(width); self.intrinsicHeight = toInt(height); },
    'getIntrinsicWidth()I': (self) => self.intrinsicWidth ?? -1,
    'getIntrinsicHeight()I': (self) => self.intrinsicHeight ?? -1,
    'setPadding(IIII)V': (self, [left, top, right, bottom]) => {
      self.padding = { left: toInt(left), top: toInt(top), right: toInt(right), bottom: toInt(bottom) };
    },
    'getPadding(Landroid/graphics/Rect;)Z': (self, [rect]) => {
      if (!self.padding || !rect) return 0;
      writeBoundsToRect({ bounds: self.padding }, rect);
      return 1;
    },
    'getOpacity()I': () => -3,
    ...baseDrawableMethods(),
  },
});

const InsetDrawableDef = nativeDef('Landroid/graphics/drawable/InsetDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.kind = 'inset';
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.drawable = null;
    this.insetLeft = 0;
    this.insetTop = 0;
    this.insetRight = 0;
    this.insetBottom = 0;
    this.alpha = 255;
  }, { kind: 'inset' }),
  methods: {
    '<init>(Landroid/graphics/drawable/Drawable;I)V': (self, [drawable, inset]) => {
      self.drawable = drawable ?? null;
      self.insetLeft = self.insetTop = self.insetRight = self.insetBottom = toInt(inset);
    },
    '<init>(Landroid/graphics/drawable/Drawable;IIII)V': (self, [drawable, left, top, right, bottom]) => {
      self.drawable = drawable ?? null;
      self.insetLeft = toInt(left);
      self.insetTop = toInt(top);
      self.insetRight = toInt(right);
      self.insetBottom = toInt(bottom);
    },
    '<init>(Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/InsetDrawable$InsetValue;Landroid/graphics/drawable/InsetDrawable$InsetValue;Landroid/graphics/drawable/InsetDrawable$InsetValue;Landroid/graphics/drawable/InsetDrawable$InsetValue;)V': (self, [drawable]) => {
      self.drawable = drawable ?? null;
    },
    'getDrawable()Landroid/graphics/drawable/Drawable;': (self) => self.drawable ?? null,
    'setDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => { self.drawable = drawable ?? null; },
    'setInsets(IIII)V': (self, [left, top, right, bottom]) => {
      self.insetLeft = toInt(left);
      self.insetTop = toInt(top);
      self.insetRight = toInt(right);
      self.insetBottom = toInt(bottom);
    },
    'setInsetLeft(I)V': (self, [value]) => { self.insetLeft = toInt(value); },
    'setInsetTop(I)V': (self, [value]) => { self.insetTop = toInt(value); },
    'setInsetRight(I)V': (self, [value]) => { self.insetRight = toInt(value); },
    'setInsetBottom(I)V': (self, [value]) => { self.insetBottom = toInt(value); },
    'getInsetLeft()I': (self) => self.insetLeft | 0,
    'getInsetTop()I': (self) => self.insetTop | 0,
    'getInsetRight()I': (self) => self.insetRight | 0,
    'getInsetBottom()I': (self) => self.insetBottom | 0,
    'getIntrinsicWidth()I': (self) => {
      const peer = resolvePeer(self.drawable, self.vm);
      const inner = peer?.intrinsicWidth;
      if (typeof inner === 'number' && inner >= 0) return inner + (self.insetLeft | 0) + (self.insetRight | 0);
      return -1;
    },
    'getIntrinsicHeight()I': (self) => {
      const peer = resolvePeer(self.drawable, self.vm);
      const inner = peer?.intrinsicHeight;
      if (typeof inner === 'number' && inner >= 0) return inner + (self.insetTop | 0) + (self.insetBottom | 0);
      return -1;
    },
    'setAlpha(I)V': (self, [alpha]) => {
      self.alpha = toInt(alpha) & 0xff;
      const peer = resolvePeer(self.drawable, self.vm);
      if (peer) peer.alpha = self.alpha;
      const vm = self.vm;
      if (vm && self.drawable) {
        try {
          vm.invoke({ classDesc: descriptorOf(self.drawable, vm), name: 'setAlpha', proto: { descriptor: '(I)V', parameters: ['I'], returnType: 'V' } }, self.drawable, [self.alpha], 'virtual');
        } catch (_error) {
          void _error;
        }
      }
    },
    'getOpacity()I': () => -3,
    ...baseDrawableMethods(),
  },
});

function layerEntry(drawable) {
  return { drawable, insetLeft: 0, insetTop: 0, insetRight: 0, insetBottom: 0, id: 0, width: -1, height: -1 };
}

const LayerDrawableDef = nativeDef('Landroid/graphics/drawable/LayerDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.kind = 'layer';
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.layers = [];
    this.alpha = 255;
  }, { kind: 'layer' }),
  methods: {
    '<init>([Landroid/graphics/drawable/Drawable;)V': (self, [drawables]) => {
      const values = drawables?.$data || drawables || [];
      self.layers = Array.from(values, layerEntry);
    },
    '<init>([Landroid/graphics/drawable/Drawable;[I)V': (self, [drawables]) => {
      const values = drawables?.$data || drawables || [];
      self.layers = Array.from(values, layerEntry);
    },
    '<init>([Landroid/graphics/drawable/Drawable;[I[I)V': (self, [drawables]) => {
      const values = drawables?.$data || drawables || [];
      self.layers = Array.from(values, layerEntry);
    },
    'getNumberOfLayers()I': (self) => (self.layers || []).length,
    'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [index]) => (self.layers || [])[toInt(index)]?.drawable ?? null,
    'setDrawable(IILandroid/graphics/drawable/Drawable;)Z': (self, [index, drawable]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (!layer) return false;
      layer.drawable = drawable ?? null;
      return true;
    },
    'addLayer(Landroid/graphics/drawable/Drawable;)I': (self, [drawable]) => {
      if (!self.layers) self.layers = [];
      self.layers.push(layerEntry(drawable ?? null));
      return self.layers.length - 1;
    },
    'findDrawableByLayerId(I)Landroid/graphics/drawable/Drawable;': (self, [id]) => {
      const layer = (self.layers || []).find((entry) => (entry.id | 0) === (toInt(id) | 0));
      return layer?.drawable ?? null;
    },
    'setDrawableByLayerId(ILandroid/graphics/drawable/Drawable;)Z': (self, [id, drawable]) => {
      const layer = (self.layers || []).find((entry) => (entry.id | 0) === (toInt(id) | 0));
      if (!layer) return false;
      layer.drawable = drawable ?? null;
      return true;
    },
    'getId(I)I': (self, [index]) => (self.layers || [])[toInt(index)]?.id | 0,
    'setId(II)V': (self, [index, id]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (layer) layer.id = toInt(id);
    },
    'setLayerInset(IIIII)V': (self, [index, left, top, right, bottom]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (!layer) return;
      layer.insetLeft = toInt(left);
      layer.insetTop = toInt(top);
      layer.insetRight = toInt(right);
      layer.insetBottom = toInt(bottom);
    },
    'setLayerInsetLeft(II)V': (self, [index, value]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (layer) layer.insetLeft = toInt(value);
    },
    'setLayerInsetTop(II)V': (self, [index, value]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (layer) layer.insetTop = toInt(value);
    },
    'setLayerInsetRight(II)V': (self, [index, value]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (layer) layer.insetRight = toInt(value);
    },
    'setLayerInsetBottom(II)V': (self, [index, value]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (layer) layer.insetBottom = toInt(value);
    },
    'setLayerInsetRelative(IIIII)V': (self, args) => {
      LayerDrawableDef.methods.get('setLayerInset(IIIII)V')?.(self, args);
    },
    'getLayerInsetLeft(I)I': (self, [index]) => (self.layers || [])[toInt(index)]?.insetLeft | 0,
    'getLayerInsetTop(I)I': (self, [index]) => (self.layers || [])[toInt(index)]?.insetTop | 0,
    'getLayerInsetRight(I)I': (self, [index]) => (self.layers || [])[toInt(index)]?.insetRight | 0,
    'getLayerInsetBottom(I)I': (self, [index]) => (self.layers || [])[toInt(index)]?.insetBottom | 0,
    'setLayerWidth(II)V': (self, [index, width]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (layer) layer.width = toInt(width);
    },
    'setLayerHeight(II)V': (self, [index, height]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (layer) layer.height = toInt(height);
    },
    'setPadding(IIII)V': () => undefined,
    'getIntrinsicWidth()I': (self) => {
      let result = -1;
      for (const layer of self.layers || []) {
        const peer = resolvePeer(layer.drawable, self.vm);
        const inner = peer?.intrinsicWidth;
        if (typeof inner === 'number' && inner > result) result = inner;
      }
      return result;
    },
    'getIntrinsicHeight()I': (self) => {
      let result = -1;
      for (const layer of self.layers || []) {
        const peer = resolvePeer(layer.drawable, self.vm);
        const inner = peer?.intrinsicHeight;
        if (typeof inner === 'number' && inner > result) result = inner;
      }
      return result;
    },
    'getOpacity()I': () => -3,
    ...baseDrawableMethods(),
  },
});

const RippleDrawableDef = nativeDef('Landroid/graphics/drawable/RippleDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.kind = 'ripple';
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.content = null;
    this.mask = null;
    this.rippleColor = null;
    this.alpha = 255;
  }, { kind: 'ripple' }),
  methods: {
    '<init>(Landroid/content/res/ColorStateList;)V': (self, [csl]) => { self.rippleColor = csl ?? null; },
    '<init>(Landroid/content/res/ColorStateList;Landroid/graphics/drawable/Drawable;Landroid/graphics/drawable/Drawable;)V': (self, [csl, content, mask]) => {
      self.rippleColor = csl ?? null;
      self.content = content ?? null;
      self.mask = mask ?? null;
    },
    'setColor(Landroid/content/res/ColorStateList;)V': (self, [csl]) => { self.rippleColor = csl ?? null; },
    'setRadius(I)V': (self, [radius]) => { self.maxRadius = toInt(radius); },
    'setHotspot(FF)V': (self, [x, y]) => { self.hotspotX = Number(x) || 0; self.hotspotY = Number(y) || 0; },
    'setHotspotBounds(IIII)V': (self, [left, top, right, bottom]) => {
      self.hotspotBounds = { left: toInt(left), top: toInt(top), right: toInt(right), bottom: toInt(bottom) };
    },
    'setState([I)Z': (self, [state], vm) => {
      const values = state?.$data || state || [];
      self.state = values;
      self.$pressed = values.includes(0x010100a7);
      return true;
    },
    'getDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [index]) => (toInt(index) === 0 ? self.content : null),
    'setDrawableByLayerId(ILandroid/graphics/drawable/Drawable;)Z': (self, [id, drawable]) => {
      const key = toInt(id) >>> 0;
      // android.R.id.background = 0x01020000, mask = 0x0102000a
      if (key === 0x0102000a) self.mask = drawable ?? null;
      else self.content = drawable ?? null;
      return true;
    },
    'getOpacity()I': () => -3,
    ...baseDrawableMethods(),
  },
});

const StateListDrawableDef = nativeDef('Landroid/graphics/drawable/StateListDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.kind = 'state';
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.layers = [];
    this.current = null;
    this.alpha = 255;
    this.stateful = true;
  }, { kind: 'state' }),
  methods: {
    'addState([ILandroid/graphics/drawable/Drawable;)V': (self, [stateSet, drawable]) => {
      if (!self.layers) self.layers = [];
      self.layers.push({ stateSet, drawable: drawable ?? null });
      self.stateful = true;
    },
    'getStateDrawableCount()I': (self) => (self.layers || []).length,
    'getStateDrawable(I)Landroid/graphics/drawable/Drawable;': (self, [index]) => {
      const layers = self.layers || [];
      return layers[toInt(index)]?.stateSet ? layers[toInt(index)].drawable : null;
    },
    'getStateSet(I)[I': (self, [index], vm) => {
      const spec = (self.layers || [])[toInt(index)]?.stateSet;
      const values = spec?.$data || spec || [];
      const array = vm?.newArray ? vm.newArray('I', values.length) : { $data: [] };
      values.forEach((value, i) => { array.$data[i] = value | 0; });
      return array;
    },
    'findStateDrawableIndex([I)I': (self, [stateSet]) => {
      const layers = self.layers || [];
      for (let i = 0; i < layers.length; i++) {
        if (matchesStateSpec(layers[i].stateSet, stateSet)) return i;
      }
      return -1;
    },
    'selectDrawable(I)Z': (self, [index]) => {
      const layer = (self.layers || [])[toInt(index)];
      if (!layer) return false;
      self.current = layer.drawable;
      return true;
    },
    'getCurrent()Landroid/graphics/drawable/Drawable;': (self) => self.current ?? null,
    'setState([I)Z': (self, [stateSet]) => {
      self.state = stateSet?.$data || stateSet || [];
      const index = StateListDrawableDef.methods.get('findStateDrawableIndex([I)I')?.(self, [stateSet]) ?? -1;
      if (index >= 0) self.current = (self.layers || [])[index]?.drawable ?? null;
      return true;
    },
    'isStateful()Z': () => 1,
    'getOpacity()I': () => -3,
    ...baseDrawableMethods(),
  },
});

const BitmapDrawableDef = nativeDef('Landroid/graphics/drawable/BitmapDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.kind = 'bitmap';
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.image = null;
    this.alpha = 255;
  }, { kind: 'bitmap' }),
  methods: {
    '<init>(Landroid/graphics/Bitmap;)V': (self, [bitmap]) => { self.image = bitmap?.image ?? null; },
    '<init>(Landroid/content/res/Resources;Landroid/graphics/Bitmap;)V': (self, [_res, bitmap]) => { self.image = bitmap?.image ?? null; },
    'getBitmap()Landroid/graphics/Bitmap;': (self) => self.bitmap ?? null,
    'setAlpha(I)V': (self, [alpha]) => { self.alpha = toInt(alpha) & 0xff; },
    'setGravity(I)V': (self, [gravity]) => { self.gravity = toInt(gravity); },
    'setTileModeX(I)V': () => undefined,
    'setTileModeY(I)V': () => undefined,
    'getIntrinsicWidth()I': (self) => self.image?.width ?? -1,
    'getIntrinsicHeight()I': (self) => self.image?.height ?? -1,
    'getOpacity()I': () => -3,
    ...baseDrawableMethods(),
  },
});

function attrPadding(vm, node) {
  const paddingNode = firstChildNamed(node, 'padding');
  if (!paddingNode) return null;
  const uniform = dimensionOf(vm, attrValue(paddingNode, 'padding'), null);
  const pick = (names) => {
    for (const name of names) {
      const value = attrValue(paddingNode, name);
      if (value !== null && value !== undefined) return dimensionOf(vm, value, 0);
    }
    return uniform === null || uniform === undefined ? 0 : uniform;
  };
  return {
    left: pick(['left', 'paddingLeft']),
    top: pick(['top', 'paddingTop']),
    right: pick(['right', 'paddingRight']),
    bottom: pick(['bottom', 'paddingBottom']),
  };
}

function mergePadding(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    left: Math.max(a.left || 0, b.left || 0),
    top: Math.max(a.top || 0, b.top || 0),
    right: Math.max(a.right || 0, b.right || 0),
    bottom: Math.max(a.bottom || 0, b.bottom || 0),
  };
}

function xmlDrawablePadding(node, vm) {
  if (!node) return null;
  if (node.name === 'shape') return attrPadding(vm, node);
  if (node.name === 'inset') {
    const child = xmlDrawablePadding(elementChildren(node)[0], vm);
    const uniform = dimensionOf(vm, attrValue(node, 'inset'), null);
    const pick = (names) => {
      for (const name of names) {
        const value = attrValue(node, name);
        if (value !== null && value !== undefined) return dimensionOf(vm, value, 0);
      }
      return uniform === null || uniform === undefined ? 0 : uniform;
    };
    return {
      left: pick(['insetLeft', 'left']) + (child?.left || 0),
      top: pick(['insetTop', 'top']) + (child?.top || 0),
      right: pick(['insetRight', 'right']) + (child?.right || 0),
      bottom: pick(['insetBottom', 'bottom']) + (child?.bottom || 0),
    };
  }
  if (node.name === 'layer-list') {
    let result = null;
    for (const item of elementChildren(node)) {
      if (item.name !== 'item') continue;
      result = mergePadding(result, xmlDrawablePadding(elementChildren(item)[0], vm));
    }
    return result;
  }
  if (node.name === 'ripple' || node.name === 'selector' || node.name === 'animated-selector') {
    let result = null;
    for (const item of elementChildren(node)) {
      if (item.name !== 'item') continue;
      const id = String(attrValue(item, 'id') ?? '');
      if (id.includes('mask')) continue;
      result = mergePadding(result, xmlDrawablePadding(elementChildren(item)[0], vm));
      if (!result && attrValue(item, 'drawable') !== null) {
        const resolved = drawableFromAttr(vm, attrValue(item, 'drawable'));
        result = mergePadding(result, drawablePadding(resolved, vm));
      }
    }
    return result;
  }
  if (node.name === 'clip' || node.name === 'scale' || node.name === 'rotate') {
    return xmlDrawablePadding(elementChildren(node)[0], vm);
  }
  return null;
}

export function drawablePadding(drawable, vm) {
  if (!drawable || typeof drawable !== 'object') return null;
  if (isResourceDrawable(drawable)) {
    if (drawable.type === 'shape') return attrPadding(vm, drawable.xml);
    if (drawable.type === 'xml') return xmlDrawablePadding(drawable.xml, vm);
    return null;
  }
  const peer = resolvePeer(drawable, vm);
  if (!peer) return null;
  if (peer.resource) return drawablePadding(peer.resource, peer.vm || vm);
  switch (peer.kind) {
    case 'gradient': return peer.padding ? { ...peer.padding } : null;
    case 'inset': {
      const child = drawablePadding(peer.drawable, peer.vm || vm) || { left: 0, top: 0, right: 0, bottom: 0 };
      return {
        left: (peer.insetLeft | 0) + child.left,
        top: (peer.insetTop | 0) + child.top,
        right: (peer.insetRight | 0) + child.right,
        bottom: (peer.insetBottom | 0) + child.bottom,
      };
    }
    case 'layer': {
      let result = null;
      for (const layer of peer.layers || []) {
        result = mergePadding(result, drawablePadding(layer.drawable, peer.vm || vm));
      }
      return result;
    }
    case 'ripple': {
      return mergePadding(drawablePadding(peer.content, peer.vm || vm), null);
    }
    case 'state': {
      const layers = peer.layers || [];
      let result = null;
      for (const layer of layers) result = mergePadding(result, drawablePadding(layer.drawable, peer.vm || vm));
      return result;
    }
    default:
      return peer.padding ? { ...peer.padding } : null;
  }
}

export function resourceDrawableDescriptor(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'color') return 'Landroid/graphics/drawable/ColorDrawable;';
  if (value.type === 'bitmap') return 'Landroid/graphics/drawable/BitmapDrawable;';
  if (value.type === 'shape') return 'Landroid/graphics/drawable/GradientDrawable;';
  if (value.type === 'xml') {
    switch (value.xml?.name) {
      case 'ripple': return 'Landroid/graphics/drawable/RippleDrawable;';
      case 'selector':
      case 'animated-selector': return 'Landroid/graphics/drawable/StateListDrawable;';
      case 'inset': return 'Landroid/graphics/drawable/InsetDrawable;';
      case 'layer-list': return 'Landroid/graphics/drawable/LayerDrawable;';
      case 'vector': return 'Landroid/graphics/drawable/VectorDrawable;';
      case 'animated-vector': return 'Landroid/graphics/drawable/AnimatedVectorDrawable;';
      case 'clip': return 'Landroid/graphics/drawable/ClipDrawable;';
      case 'scale': return 'Landroid/graphics/drawable/ScaleDrawable;';
      case 'rotate': return 'Landroid/graphics/drawable/RotateDrawable;';
      case 'bitmap': return 'Landroid/graphics/drawable/BitmapDrawable;';
      default: return 'Landroid/graphics/drawable/Drawable;';
    }
  }
  return null;
}

export function drawableObject(vm, value) {
  if (!value || typeof value !== 'object') return value;
  if (value.$peer || value.$nativeClass || value.$dexClass || value.$descriptor) return value;
  if (!vm || typeof vm.allocateRawObject !== 'function') return value;
  const descriptor = resourceDrawableDescriptor(value);
  if (!descriptor) return value;
  const object = vm.allocateRawObject(descriptor);
  const peer = vm.registry?.getPeer?.(object, descriptor) ?? null;
  if (!peer || typeof peer !== 'object') return value;
  peer.resource = value;
  if (value.type === 'color' && typeof value.color === 'number') peer.color = value.color >>> 0;
  if (value.type === 'bitmap' && value.bitmap?.image) {
    peer.image = value.bitmap.image;
    peer.bitmap = value.bitmap;
  }
  if (value.type === 'xml' && value.tint !== undefined) peer.tint = value.tint;
  return object;
}

function maxRadii(radii) {
  if (!radii || !radii.length) return 0;
  let max = 0;
  for (const value of radii) max = Math.max(max, Number(value) || 0);
  return max;
}

function xmlOutlineRadius(node, vm) {
  if (!node) return 0;
  if (node.name === 'shape') {
    const corners = firstChildNamed(node, 'corners');
    if (!corners) return 0;
    return maxRadii(cornerRadiiOf(vm, corners));
  }
  if (node.name === 'inset' || node.name === 'clip' || node.name === 'scale') {
    return xmlOutlineRadius(elementChildren(node)[0], vm);
  }
  if (node.name === 'ripple') {
    for (const item of elementChildren(node)) {
      if (item.name !== 'item') continue;
      const id = String(attrValue(item, 'id') ?? '');
      if (id.includes('mask')) continue;
      const child = elementChildren(item)[0];
      if (child) return xmlOutlineRadius(child, vm);
      const resolved = drawableFromAttr(vm, attrValue(item, 'drawable'));
      if (resolved) return outlineRadius(resolved, vm);
    }
    return 0;
  }
  if (node.name === 'layer-list') {
    const items = elementChildren(node);
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.name !== 'item') continue;
      const child = elementChildren(item)[0];
      if (child) return xmlOutlineRadius(child, vm);
      const resolved = drawableFromAttr(vm, attrValue(item, 'drawable'));
      if (resolved) return outlineRadius(resolved, vm);
    }
    return 0;
  }
  if (node.name === 'selector' || node.name === 'animated-selector') {
    for (const item of elementChildren(node)) {
      if (item.name !== 'item') continue;
      const child = elementChildren(item)[0];
      if (child) return xmlOutlineRadius(child, vm);
      const resolved = drawableFromAttr(vm, attrValue(item, 'drawable'));
      if (resolved) return outlineRadius(resolved, vm);
    }
    return 0;
  }
  return 0;
}

function peerOutlineRadius(peer, vm) {
  if (!peer || typeof peer !== 'object') return 0;
  switch (peer.kind) {
    case 'inset':
      return outlineRadius(peer.drawable, vm);
    case 'layer': {
      const layers = peer.layers || [];
      for (let i = layers.length - 1; i >= 0; i--) {
        const radius = outlineRadius(layers[i]?.drawable, vm);
        if (radius > 0) return radius;
      }
      return 0;
    }
    case 'ripple':
      return outlineRadius(peer.content, vm);
    case 'state': {
      const current = peer.current || peer.layers?.[0]?.drawable;
      return outlineRadius(current, vm);
    }
    case 'gradient': {
      if (peer.cornerRadii) return maxRadii(radiiToCorners(peer.cornerRadii));
      return Number(peer.cornerRadius) || 0;
    }
    default:
      return Number(peer.cornerRadius) || 0;
  }
}

export function outlineRadius(drawable, vm) {
  if (!drawable) return 0;
  if (isResourceDrawable(drawable)) {
    if (drawable.type === 'shape') return maxRadii(cornerRadiiOf(vm, firstChildNamed(drawable.xml, 'corners')));
    if (drawable.type === 'xml') return xmlOutlineRadius(drawable.xml, vm);
    return 0;
  }
  const peer = resolvePeer(drawable, vm);
  if (peer) return peerOutlineRadius(peer, peer.vm || vm);
  return 0;
}

const VectorDrawableDef = nativeDef('Landroid/graphics/drawable/VectorDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.kind = 'vector';
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.alpha = 255;
  }, { kind: 'vector' }),
  methods: {
    'getIntrinsicWidth()I': (self) => self.intrinsicWidth ?? -1,
    'getIntrinsicHeight()I': (self) => self.intrinsicHeight ?? -1,
    'setTint(I)V': (self, [color]) => { self.tint = toInt(color) >>> 0; },
    'setTintList(Landroid/content/res/ColorStateList;)V': (self, [list]) => { self.tintList = list ?? null; },
    'getOpacity()I': () => -3,
    ...baseDrawableMethods(),
  },
});

function containerDrawableDef(descriptor, kind) {
  return nativeDef(descriptor, {
    super: 'Landroid/graphics/drawable/Drawable;',
    ctor: peerClass(function () {
      this.kind = kind;
      this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
      this.drawable = null;
      this.alpha = 255;
      this.level = 0;
      this.pivotX = 0.5;
      this.pivotY = 0.5;
      this.fromDegrees = 0;
      this.toDegrees = 360;
      this.scaleWidth = 1;
      this.scaleHeight = 1;
      this.clipOrientation = 3;
    }, { kind }),
    methods: {
      '<init>(Landroid/graphics/drawable/Drawable;I)V': (self, [drawable, gravity]) => {
        self.drawable = drawable ?? null;
        self.gravity = toInt(gravity);
      },
      '<init>(Landroid/graphics/drawable/Drawable;II)V': (self, [drawable, gravity, orientation]) => {
        self.drawable = drawable ?? null;
        self.gravity = toInt(gravity);
        self.clipOrientation = toInt(orientation);
      },
      'getDrawable()Landroid/graphics/drawable/Drawable;': (self) => self.drawable ?? null,
      'setDrawable(Landroid/graphics/drawable/Drawable;)V': (self, [drawable]) => { self.drawable = drawable ?? null; },
      'setAlpha(I)V': (self, [alpha]) => { self.alpha = toInt(alpha) & 0xff; },
      'getAlpha()I': (self) => self.alpha ?? 255,
      'setLevel(I)Z': (self, [level]) => { self.level = toInt(level); return true; },
      'getLevel()I': (self) => self.level | 0,
      'setPivotX(F)V': (self, [value]) => { self.pivotX = Number(value) || 0; },
      'setPivotY(F)V': (self, [value]) => { self.pivotY = Number(value) || 0; },
      'setFromDegrees(F)V': (self, [value]) => { self.fromDegrees = Number(value) || 0; },
      'setToDegrees(F)V': (self, [value]) => { self.toDegrees = Number(value) || 0; },
      'setScaleWidth(F)V': (self, [value]) => { self.scaleWidth = Number(value) || 0; },
      'setScaleHeight(F)V': (self, [value]) => { self.scaleHeight = Number(value) || 0; },
      'setScaleGravity(I)V': (self, [gravity]) => { self.gravity = toInt(gravity); },
      'getOpacity()I': () => -3,
      ...baseDrawableMethods(),
    },
  });
}

const ClipDrawableDef = containerDrawableDef('Landroid/graphics/drawable/ClipDrawable;', 'clip');
const ScaleDrawableDef = containerDrawableDef('Landroid/graphics/drawable/ScaleDrawable;', 'scale');
const RotateDrawableDef = containerDrawableDef('Landroid/graphics/drawable/RotateDrawable;', 'rotate');
const NinePatchDrawableDef = nativeDef('Landroid/graphics/drawable/NinePatchDrawable;', {
  super: 'Landroid/graphics/drawable/Drawable;',
  ctor: peerClass(function () {
    this.kind = 'bitmap';
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.alpha = 255;
  }, { kind: 'bitmap' }),
  methods: {
    'getIntrinsicWidth()I': (self) => self.image?.width ?? -1,
    'getIntrinsicHeight()I': (self) => self.image?.height ?? -1,
    'getOpacity()I': () => -3,
    ...baseDrawableMethods(),
  },
});
const AnimatedVectorDrawableDef = nativeDef('Landroid/graphics/drawable/AnimatedVectorDrawable;', {
  super: 'Landroid/graphics/drawable/VectorDrawable;',
  ctor: peerClass(function () {
    this.kind = 'vector';
    this.bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    this.alpha = 255;
  }, { kind: 'vector' }),
  methods: {
    'start()V': () => undefined,
    'stop()V': () => undefined,
    'isRunning()Z': () => 0,
    'registerAnimationCallback(Landroid/graphics/drawable/Animatable2$AnimationCallback;)V': () => undefined,
    'getOpacity()I': () => -3,
    ...baseDrawableMethods(),
  },
});

const OutlineDef = nativeDef('Landroid/graphics/Outline;', {
  super: 'Ljava/lang/Object;',
  ctor: peerClass(function () {
    this.outlineEmpty = true;
    this.outlineRect = { left: 0, top: 0, right: 0, bottom: 0 };
    this.outlineRadius = 0;
    this.alpha = 1;
  }),
  methods: {
    'setEmpty()V': (self) => {
      self.outlineEmpty = true;
      self.outlineRadius = 0;
      self.outlineRect = { left: 0, top: 0, right: 0, bottom: 0 };
    },
    'setRect(IIII)V': (self, [left, top, right, bottom]) => {
      const values = [toInt(left), toInt(top), toInt(right), toInt(bottom)];
      if (values[0] >= values[2] || values[1] >= values[3]) {
        self.outlineEmpty = true;
        return;
      }
      self.outlineEmpty = false;
      self.outlineRect = { left: values[0], top: values[1], right: values[2], bottom: values[3] };
      self.outlineRadius = 0;
      self.outlineOval = false;
      self.outlinePath = false;
    },
    'setRoundRect(IIIIF)V': (self, [left, top, right, bottom, radius]) => {
      const values = [toInt(left), toInt(top), toInt(right), toInt(bottom)];
      if (values[0] >= values[2] || values[1] >= values[3]) {
        self.outlineEmpty = true;
        return;
      }
      self.outlineEmpty = false;
      self.outlineRect = { left: values[0], top: values[1], right: values[2], bottom: values[3] };
      self.outlineRadius = Number(radius) || 0;
      self.outlineOval = false;
      self.outlinePath = false;
    },
    'setOval(IIII)V': (self, [left, top, right, bottom]) => {
      const values = [toInt(left), toInt(top), toInt(right), toInt(bottom)];
      if (values[0] >= values[2] || values[1] >= values[3]) {
        self.outlineEmpty = true;
        return;
      }
      self.outlineEmpty = false;
      self.outlineRect = { left: values[0], top: values[1], right: values[2], bottom: values[3] };
      self.outlineRadius = (values[3] - values[1]) / 2;
      self.outlineOval = true;
      self.outlinePath = false;
    },
    'setPath(Landroid/graphics/Path;)V': (self, [path]) => {
      const peer = path?.$peer || path;
      const commands = peer?.commands || [];
      if (!commands.length) {
        self.outlineEmpty = true;
        return;
      }
      self.outlineEmpty = false;
      self.outlinePath = true;
      self.outlineCommands = commands;
    },
    'setAlpha(F)V': (self, [alpha]) => { self.alpha = Number(alpha) || 0; },
    'getAlpha()F': (self) => Number(self.alpha) || 0,
    'getRadius()F': (self) => Number(self.outlineRadius) || 0,
    'isEmpty()Z': (self) => (self.outlineEmpty ? 1 : 0),
    'canClip()Z': () => 1,
    'offset(II)V': (self, [dx, dy], vm) => {
      if (self.outlineEmpty || self.outlinePath) return;
      self.outlineRect = {
        left: self.outlineRect.left + toInt(dx),
        top: self.outlineRect.top + toInt(dy),
        right: self.outlineRect.right + toInt(dx),
        bottom: self.outlineRect.bottom + toInt(dy),
      };
    },
    'getRect(Landroid/graphics/Rect;)Z': (self, [rect], vm) => {
      if (!rect || self.outlineEmpty) return false;
      writeBoundsToRect({ bounds: self.outlineRect }, rect);
      return true;
    },
    'getBounds()Landroid/graphics/Rect;': (self, _args, vm) => {
      const rect = vm.allocateRawObject('Landroid/graphics/Rect;');
      writeBoundsToRect({ bounds: self.outlineRect }, rect);
      return rect;
    },
  },
});

const BACKGROUND_PROVIDER = { background: true };
const BOUNDS_PROVIDER = { bounds: true };
const PADDED_PROVIDER = { padded: true };

const ViewOutlineProviderDef = nativeDef('Landroid/view/ViewOutlineProvider;', {
  super: 'Ljava/lang/Object;',
  staticFields: new Map([
    ['BACKGROUND:Landroid/view/ViewOutlineProvider;', { lazy: (vm) => outlineProviderObject(vm, 'background') }],
    ['BOUNDS:Landroid/view/ViewOutlineProvider;', { lazy: (vm) => outlineProviderObject(vm, 'bounds') }],
    ['PADDED_BOUNDS:Landroid/view/ViewOutlineProvider;', { lazy: (vm) => outlineProviderObject(vm, 'padded') }],
  ]),
  methods: {
    'getOutline(Landroid/view/View;Landroid/graphics/Outline;)V': (self, [viewObject, outline], vm) => {
      if (!outline) return;
      const view = viewObject?.$view || viewObject?.$peer?.view || outlineViewFromObject(viewObject, vm);
      const peer = outline?.$peer;
      if (!peer) return;
      const kind = self?.$providerKind;
      if (kind === 'bounds') {
        peer.outlineEmpty = false;
        peer.outlineRect = { left: 0, top: 0, right: view?.getWidth?.() || 0, bottom: view?.getHeight?.() || 0 };
        peer.outlineRadius = 0;
        peer.alpha = 1;
        return;
      }
      if (kind === 'padded' && view) {
        peer.outlineEmpty = false;
        peer.outlineRect = {
          left: view.paddingLeft || 0,
          top: view.paddingTop || 0,
          right: (view.getWidth?.() || 0) - (view.paddingRight || 0),
          bottom: (view.getHeight?.() || 0) - (view.paddingBottom || 0),
        };
        peer.outlineRadius = 0;
        peer.alpha = 1;
        return;
      }
      if (view) {
        const radius = view.outlineRadius?.() || 0;
        const width = view.getWidth?.() || 0;
        const height = view.getHeight?.() || 0;
        peer.outlineEmpty = !view.background;
        peer.outlineRect = { left: 0, top: 0, right: width, bottom: height };
        peer.outlineRadius = radius;
        peer.alpha = view.background ? 1 : 0;
      }
    },
  },
});

function outlineProviderObject(vm, kind) {
  const object = vm.allocateRawObject('Landroid/view/ViewOutlineProvider;');
  object.$peer = { $providerKind: kind };
  return object;
}

function outlineViewFromObject(viewObject, vm) {
  if (!viewObject) return null;
  return viewObject.$view || viewObject.$peer?.view || null;
}

export const OUTLINE_CLASSES = {
  Outline: OutlineDef,
  ViewOutlineProvider: ViewOutlineProviderDef,
};

export const DRAWABLE_CLASSES = {
  Drawable: DrawableDef,
  ColorDrawable: ColorDrawableDef,
  GradientDrawable: GradientDrawableDef,
  InsetDrawable: InsetDrawableDef,
  LayerDrawable: LayerDrawableDef,
  RippleDrawable: RippleDrawableDef,
  StateListDrawable: StateListDrawableDef,
  BitmapDrawable: BitmapDrawableDef,
  VectorDrawable: VectorDrawableDef,
  ClipDrawable: ClipDrawableDef,
  ScaleDrawable: ScaleDrawableDef,
  RotateDrawable: RotateDrawableDef,
  NinePatchDrawable: NinePatchDrawableDef,
  AnimatedVectorDrawable: AnimatedVectorDrawableDef,
};
