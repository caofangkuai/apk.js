import { Bitmap } from './graphics.js';
import { parseBinaryXml, typedValueToNumber, typedValueToString } from '../res/axml.js';

const ANDROID_FRAMEWORK_COLORS = new Map([
  [0x01060000, 0xffff4444], [0x0106000b, 0xffffffff], [0x0106000c, 0xff000000],
  [0x0106000d, 0x00000000], [0x0106000e, 0xff000000], [0x0106000f, 0xffffffff],
  [0x01060012, 0xff00ddff], [0x01060013, 0xff0099cc], [0x01060014, 0xff669900],
  [0x01060015, 0xff338800], [0x01060016, 0xffff4444], [0x01060017, 0xffcc0000],
  [0x01060018, 0xffff8800], [0x01060019, 0xffcc6600], [0x0106001a, 0xffaa66cc],
  [0x0106001b, 0xff33b5e5], [0x0106006a, 0xfff0f0f0], [0x0106006b, 0xff000000],
  [0x0106006f, 0xfffafafa], [0x01060070, 0xfff5f5f5], [0x01060071, 0xffeeeeee],
  [0x01060072, 0xffe0e0e0], [0x01060073, 0xffdddddd], [0x01060074, 0xffcccccc],
  [0x01060075, 0xff999999], [0x01060076, 0xff888888], [0x01060077, 0xff777777],
  [0x01060078, 0xff666666], [0x01060079, 0xff555555], [0x0106007a, 0xff444444],
  [0x0106007b, 0xff333333], [0x0106007c, 0xff222222], [0x0106007d, 0xff111111],
]);

function toByteView(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (bytes && bytes.buffer instanceof ArrayBuffer) return new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength || bytes.length);
  return new Uint8Array(0);
}

export function parseNinePatchChunk(bytes) {
  const data = toByteView(bytes);
  if (data.length < 12 || data[0] !== 0x89 || data[1] !== 0x50) return null;
  let offset = 8;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  while (offset + 8 <= data.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
    const chunkStart = offset + 8;
    if (type === 'npTc') {
      const chunk = data.subarray(chunkStart, chunkStart + length);
      if (chunk.length < 32) return null;
      const view2 = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      const numX = chunk[1];
      const numY = chunk[2];
      const padding = [view2.getInt32(12), view2.getInt32(16), view2.getInt32(20), view2.getInt32(24)];
      let cursor = 32;
      const xDivs = [];
      const yDivs = [];
      for (let i = 0; i <= numX; i++) { xDivs.push(view2.getInt32(cursor)); cursor += 4; }
      for (let i = 0; i <= numY; i++) { yDivs.push(view2.getInt32(cursor)); cursor += 4; }
      return { xDivs, yDivs, padding };
    }
    if (type === 'IEND') break;
    offset = chunkStart + length + 4;
  }
  return null;
}

function resolveAndroidColor(value) {
  let v = value;
  if (v && typeof v === 'object') v = v.reference ?? v.value ?? v;
  if (typeof v !== 'number') return null;
  v = v >>> 0;
  const mapped = ANDROID_FRAMEWORK_COLORS.get(v);
  if (mapped !== undefined) return mapped >>> 0;
  if (v >= 0x01000000 && v < 0x02000000) return null;
  if ((v >>> 24) === 0xff) return v;
  if (v <= 0xffffff) return (0xff000000 | v) >>> 0;
  return null;
}

const STATE_ATTR_IDS = {
  state_selected: 0x010100a1,
  state_pressed: 0x010100a7,
  state_focused: 0x0101009c,
  state_enabled: 0x0101009e,
  state_hovered: 0x01010367,
  state_activated: 0x010102fe,
  state_checked: 0x010100a0,
  state_accelerated: 0x0101031e,
  state_above_anchor: 0x010102c0,
  state_accessibility_focused: 0x0101036e,
};

export class AssetManager {
  constructor(apk) {
    this.apk = apk;
    this.assets = apk.assetFiles;
  }

  open(path) {
    const normalized = path.replace(/^\/+/, '');
    const entry = this.assets.get(normalized);
    if (!entry) throw new Error(`Asset 不存在: ${normalized}`);
    return entry;
  }

  readBytes(path) {
    const entry = this.open(path);
    return entry.bytes;
  }

  readText(path) {
    return new TextDecoder('utf-8', { fatal: false }).decode(this.readBytes(path));
  }

  list(path = '') {
    const prefix = path.replace(/^\/+/, '').replace(/\/?$/, '/');
    const result = [];
    for (const key of this.assets.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        if (!rest.includes('/')) result.push(rest);
      }
    }
    return result;
  }

  exists(path) {
    return this.assets.has(path.replace(/^\/+/, ''));
  }
}

export class Resources {
  constructor(apk, vm) {
    this.apk = apk;
    this.vm = vm;
    this.table = apk.resourceTable;
    const initDensity = vm?.engine?.options?.density ?? apk?.density ?? 1;
    const initW = vm?.engine?.options?.width ?? 360;
    const initH = vm?.engine?.options?.height ?? 640;
    this.density = initDensity;
    this.displayMetrics = {
      widthPixels: initW,
      heightPixels: initH,
      density: initDensity,
      densityDpi: Math.round(initDensity * 160),
      scaledDensity: initDensity,
    };
    this.cache = new Map();
    this.bitmapCache = new Map();
    this._assetManager = new AssetManager(apk);
    if (this.table && typeof this.table.setConfig === 'function') {
      this.table.setConfig('zh-CN', initDensity);
    }
    this._config = {
      orientation: 1,
      locale: 'zh-CN',
      uiMode: 0x11,
      fontScale: 1,
      screenLayout: 0x02,
      screenWidthDp: Math.round(initW / initDensity),
      screenHeightDp: Math.round(initH / initDensity),
      smallestScreenWidthDp: Math.round(Math.min(initW, initH) / initDensity),
      densityDpi: Math.round(initDensity * 160),
      touchscreen: 3,
      keyboard: 1,
      keyboardHidden: 1,
      navigation: 1,
      navigationHidden: 1,
      hardKeyboardHidden: 1,
      colorMode: 0,
      grammaticalGender: 0,
      assets: null,
    };
  }

  getAssets() {
    return this._assetManager;
  }

  getDisplayMetrics() {
    return this.displayMetrics;
  }

  getConfiguration() {
    return this._config;
  }

  getIdentifier(name, type, packageName) {
    const typeName = type || 'string';
    const entries = this.table.getTypeEntries(typeName);
    for (const [resId, entry] of entries) {
      if (entry.key === name) return resId;
    }
    return 0;
  }

  resolve(resId) {
    const value = this.table.resolve(resId);
    if (value !== null && value !== undefined) return value;
    if (typeof resId === 'number' && ANDROID_FRAMEWORK_COLORS.has(resId >>> 0)) {
      return ANDROID_FRAMEWORK_COLORS.get(resId >>> 0);
    }
    return value;
  }

  resolveThemedAttr(resId) {
    if (typeof resId !== 'number') return undefined;
    const entry = this.table?.getEntry?.(resId >>> 0);
    if (!entry || entry.typeName !== 'attr') return undefined;
    const store = this.vm?.themeAttributes;
    if (!store) return undefined;
    let value = store[entry.key];
    if (value === undefined) {
      const ref = store.$attrReferences?.[entry.key];
      if (ref !== undefined) value = this.resolve(ref >>> 0);
    }
    return value;
  }

  getString(resId, ...args) {
    const value = this.resolve(resId);
    let text = value === null || value === undefined ? '' : String(value);
    if (args.length) text = formatStringArgs(text, args);
    return text;
  }

  getText(resId) {
    return this.getString(resId);
  }

  getQuantityString(resId, quantity, ...args) {
    return this.getString(resId, ...args);
  }

  getColor(resId) {
    const value = typeof resId === 'number' && this.table?.getEntry?.(resId >>> 0)?.typeName === 'attr'
      ? this.resolveThemedAttr(resId)
      : this.resolve(resId);
    if (typeof value === 'number') return value >>> 0;
    if (typeof value === 'string') {
      const parsed = parseColorString(value);
      if (parsed !== null) return parsed;
    }
    return 0xff000000;
  }

  getDimension(resId) {
    return this.getDimensionPixelSize(resId);
  }

  getDimensionPixelSize(resId) {
    const value = this.resolve(resId);
    return convertDimension(value, this.density);
  }

  getBoolean(resId) {
    return Boolean(this.resolve(resId));
  }

  getInteger(resId) {
    return Number(this.resolve(resId)) | 0;
  }

  getLayout(resId) {
    const entry = this.table.getEntry(resId);
    if (!entry) throw new Error(`布局资源不存在: 0x${resId.toString(16)}`);
    const path = String(entry.value);
    const xml = this.apk.xmlCache.get(path) || parseBinaryXml(this.apk.zipEntry(path));
    this.apk.xmlCache.set(path, xml);
    return xml;
  }

  resolveVectorTint(root) {
    const attr = (root?.attrs || []).find((a) => a && (a.name === 'tint' || a.namespaceName === 'tint'));
    if (!attr) return undefined;
    let ref = attr.value;
    if (ref && typeof ref === 'object') ref = ref.reference ?? ref.value ?? ref;
    if (typeof ref !== 'number') return resolveAndroidColor(ref) ?? 0xff000000;
    const key = this.table?.getEntry?.(ref >>> 0)?.key;
    const themed = key ? this.vm?.themeAttributes?.[key] : undefined;
    const resolved = this.resolve(ref);
    const color = resolveAndroidColor(themed) ?? resolveAndroidColor(resolved) ?? resolveAndroidColor(ref);
    if (color !== null) return color;
    return key === 'colorControlNormal' ? 0xff000000 : undefined;
  }

  getDrawable(resId) {
    let value;
    if (typeof resId === 'number' && this.table?.getEntry?.(resId >>> 0)?.typeName === 'attr') {
      value = this.resolveThemedAttr(resId);
    } else {
      value = this.resolve(resId);
    }
    if (typeof value === 'number') return { color: value >>> 0, type: 'color' };
    if (typeof value !== 'string') return null;
    const path = value;
    if (path.endsWith('.xml')) {
      const xml = this.apk.xmlCache.get(path) || parseBinaryXml(this.apk.zipEntry(path));
      this.apk.xmlCache.set(path, xml);
      const root = xml.root.children.find((c) => c.type === 'element');
      if (root?.name === 'shape') {
        return { type: 'shape', xml: root };
      }
      if (root?.name === 'vector') {
        const tint = this.resolveVectorTint(root);
        return { type: 'xml', xml: root, tint, density: this.density, $descriptor: 'Landroid/graphics/drawable/VectorDrawable;' };
      }
      return { type: 'xml', xml: root };
    }
    const entry = this.apk.zipEntry(path);
    const bitmap = this.decodeBitmap(entry, path);
    return { type: 'bitmap', bitmap, path };
  }

  decodeBitmap(bytes, key) {
    if (this.bitmapCache.has(key)) return this.bitmapCache.get(key);
    const ninePatch = /\.9\.png$/i.test(String(key)) ? parseNinePatchChunk(bytes) : null;
    const loader = this.apk.imageLoader;
    if (loader) {
      const bitmap = new Bitmap(null, 0, 0, key);
      bitmap.pending = true;
      if (ninePatch) bitmap.ninePatch = ninePatch;
      loader(bytes, key)
        .then((image) => {
          bitmap.image = image;
          bitmap.width = image.width;
          bitmap.height = image.height;
          bitmap.pending = false;
          this.apk.invalidate();
          this.vm?.screen?.decorView?.requestLayout?.();
        })
        .catch(() => {
          bitmap.pending = false;
          this.vm?.screen?.decorView?.requestLayout?.();
        });
      this.bitmapCache.set(key, bitmap);
      return bitmap;
    }
    const bitmap = new Bitmap(null, 1, 1, key);
    if (ninePatch) bitmap.ninePatch = ninePatch;
    this.bitmapCache.set(key, bitmap);
    return bitmap;
  }

  getResourceEntryName(resId) {
    return this.table.getEntry(resId)?.key || '';
  }

  getResourceTypeName(resId) {
    return this.table.getEntry(resId)?.typeName || '';
  }

  getResourcePackageName() {
    return this.apk.packageName;
  }

  getColorStateList(resId) {
    const value = this.table?.getEntry?.(resId >>> 0)?.typeName === 'attr'
      ? (this.resolveThemedAttr(resId) ?? this.resolve(resId >>> 0))
      : this.resolve(resId >>> 0);
    if (typeof value === 'number') {
      const color = value >>> 0;
      return { states: [[]], colors: [color], color };
    }
    if (typeof value !== 'string' || !value.endsWith('.xml')) return null;
    const xml = this.apk.xmlCache.get(value) || parseBinaryXml(this.apk.zipEntry(value));
    this.apk.xmlCache.set(value, xml);
    const root = xml.root.children.find((c) => c.type === 'element');
    if (!root || root.name !== 'selector') return null;
    const states = [];
    const colors = [];
    for (const item of root.children || []) {
      if (item.type !== 'element' || item.name !== 'item') continue;
      const stateSet = [];
      let color = 0;
      let alpha = 1;
      for (const attr of item.attrs || []) {
        const name = attr.name;
        if (name === 'color') {
          const raw = attr.value;
          if (typeof raw === 'number') color = raw >>> 0;
          else if (raw && typeof raw === 'object' && raw.reference !== undefined) {
            const resolved = this.resolve(raw.reference >>> 0);
            if (typeof resolved === 'number') color = resolved >>> 0;
            else if (typeof resolved === 'string') color = parseColorString(resolved) ?? 0;
          }
        } else if (name === 'alpha') {
          alpha = Number(attr.value) || 0;
        } else if (name.startsWith('state_')) {
          const id = STATE_ATTR_IDS[name];
          if (id !== undefined && attr.value === true) stateSet.push(id);
          else if (id !== undefined && attr.value === false) stateSet.push(-id);
        }
      }
      if (alpha < 1) {
        const a = Math.round(((color >>> 24) & 0xff) * alpha);
        color = (((a & 0xff) << 24) | (color & 0x00ffffff)) >>> 0;
      }
      states.push(stateSet);
      colors.push(color);
    }
    if (!states.length) return null;
    return { states, colors, color: colors[colors.length - 1] };
  }

  openRawResource(resId) {
    const entry = this.table.getEntry(resId);
    if (!entry || typeof entry.value !== 'string') return new Uint8Array();
    const raw = this.apk.zipEntry(entry.value);
    return { bytes: raw, read: () => raw, close: () => {} };
  }

  newTheme() {
    return { applyStyle: () => {}, setTo: () => {} };
  }
}

export function convertDimension(value, density = 1) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value.dimension) {
    const { value: amount, unit } = value.dimension;
    switch (unit) {
      case 'dp':
        return Math.round(amount * density);
      case 'sp':
        return Math.round(amount * density);
      case 'pt':
        return Math.round(amount * (density * 160) / 72);
      case 'in':
        return Math.round(amount * density * 160);
      case 'mm':
        return Math.round((amount * density * 160) / 25.4);
      default:
        return Math.round(amount);
    }
  }
  if (typeof value === 'string') {
    const match = /^(-?\d+(?:\.\d+)?)(dp|dip|sp|px|pt|in|mm)$/.exec(value.trim());
    if (match) return convertDimension({ dimension: { value: parseFloat(match[1]), unit: match[2] === 'dip' ? 'dp' : match[2] } }, density);
    const numeric = parseFloat(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

export function parseColorString(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 3) {
      const [r, g, b] = hex.split('').map((c) => parseInt(c + c, 16));
      return (0xff000000 | (r << 16) | (g << 8) | b) >>> 0;
    }
    if (hex.length === 6) return (0xff000000 | parseInt(hex, 16)) >>> 0;
    if (hex.length === 8) return parseInt(hex, 16) >>> 0;
  }
  if (text.startsWith('@')) {
    const parsed = parseInt(text.slice(1), 16);
    if (Number.isFinite(parsed)) return parsed >>> 0;
  }
  return null;
}

export function formatStringArgs(template, args) {
  let index = 0;
  return template.replace(/%(\d+\$)?([sdifxX%])/g, (match, positional, type) => {
    if (type === '%') return '%';
    const explicit = positional ? parseInt(positional, 10) - 1 : index++;
    const value = args[explicit];
    switch (type) {
      case 'd':
        return String(Math.trunc(Number(value) || 0));
      case 'f':
        return Number(value || 0).toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0');
      case 'x':
        return (Number(value) | 0).toString(16);
      case 'X':
        return (Number(value) | 0).toString(16).toUpperCase();
      default:
        return String(value ?? '');
    }
  });
}

export function resolveResourceValue(value, resources) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value.reference !== undefined) {
    return resources.resolve(value.reference);
  }
  return value;
}

export function resourceString(value, resources) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && value.reference !== undefined) {
    return resources.getString(value.reference);
  }
  return typedValueToString(value);
}

export function resourceDimension(value, resources, density) {
  const resolved = resolveResourceValue(value, resources);
  if (resolved && typeof resolved === 'object' && resolved.dimension) {
    return convertDimension(resolved, density);
  }
  return convertDimension(resolved, density);
}
