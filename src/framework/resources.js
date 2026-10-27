import { Bitmap } from './graphics.js';
import { parseBinaryXml, typedValueToNumber, typedValueToString } from '../res/axml.js';

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
    this.density = 1;
    this.displayMetrics = { widthPixels: 360, heightPixels: 640, density: 1, densityDpi: 160, scaledDensity: 1 };
    this.cache = new Map();
    this.bitmapCache = new Map();
    this._assetManager = new AssetManager(apk);
    this._config = {
      orientation: 1,
      locale: 'zh-CN',
      uiMode: 0x11,
      fontScale: 1,
      screenLayout: 0x02,
      screenWidthDp: 360,
      screenHeightDp: 640,
      smallestScreenWidthDp: 360,
      densityDpi: 160,
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
    return this.table.resolve(resId);
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
    const value = this.resolve(resId);
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

  getDrawable(resId) {
    const value = this.resolve(resId);
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
        return {
          type: 'xml',
          xml: root,
          $descriptor: 'Landroidx/vectordrawable/graphics/drawable/VectorDrawableCompat;',
        };
      }
      return { type: 'xml', xml: root };
    }
    const entry = this.apk.zipEntry(path);
    const bitmap = this.decodeBitmap(entry, path);
    return { type: 'bitmap', bitmap, path };
  }

  decodeBitmap(bytes, key) {
    if (this.bitmapCache.has(key)) return this.bitmapCache.get(key);
    const loader = this.apk.imageLoader;
    if (loader) {
      const bitmap = new Bitmap(null, 0, 0, key);
      bitmap.pending = true;
      loader(bytes, key)
        .then((image) => {
          bitmap.image = image;
          bitmap.width = image.width;
          bitmap.height = image.height;
          bitmap.pending = false;
          this.apk.invalidate();
        })
        .catch(() => {
          bitmap.pending = false;
        });
      this.bitmapCache.set(key, bitmap);
      return bitmap;
    }
    const bitmap = new Bitmap(null, 1, 1, key);
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
