import { BinaryReader, toUint8Array } from '../core/binary.js';
import { StringPool, formatTypedValue, TYPED_VALUE_TYPE } from './axml.js';

const RES_TABLE_TYPE = 0x0002;
const RES_TABLE_PACKAGE_TYPE = 0x0200;
const RES_TABLE_TYPE_TYPE = 0x0201;
const RES_TABLE_TYPE_SPEC_TYPE = 0x0202;
const RES_TABLE_LIBRARY_TYPE = 0x0203;

const TYPE_FLAG_SPARSE = 0x01;
const TYPE_FLAG_OFFSET16 = 0x02;

export class ResourceTable {
  constructor(input) {
    const reader = new BinaryReader(toUint8Array(input));
    const type = reader.u16();
    const headerSize = reader.u16();
    const size = reader.u32();
    if (type !== RES_TABLE_TYPE) throw new Error('resources.arsc 格式无效');
    const packageCount = reader.u32();
    reader.offset = headerSize;

    this.strings = null;
    this.packages = [];
    this.values = new Map();
    this.entries = new Map();
    this.layouts = new Map();
    this.stringResources = new Map();
    this.drawables = new Map();

    while (reader.offset < size) {
      const chunkStart = reader.offset;
      const chunkType = reader.u16();
      const chunkHeaderSize = reader.u16();
      const chunkSize = reader.u32();
      if (chunkSize <= 0) break;

      if (chunkType === 0x0001) {
        reader.offset = chunkStart;
        this.strings = new StringPool(reader);
        continue;
      }

      if (chunkType === RES_TABLE_PACKAGE_TYPE) {
        this.parsePackage(reader, chunkStart, chunkHeaderSize, chunkSize);
        reader.offset = chunkStart + chunkSize;
        continue;
      }

      reader.offset = chunkStart + chunkSize;
    }
  }

  parsePackage(reader, chunkStart, chunkHeaderSize, chunkSize) {
    const pkgStart = reader.offset;
    const id = reader.u32();
    const nameChars = [];
    for (let i = 0; i < 128; i++) {
      const code = reader.u16();
      if (code !== 0) nameChars.push(String.fromCharCode(code));
    }
    const name = nameChars.join('');
    const typeStringsOffset = reader.u32();
    const lastPublicType = reader.u32();
    const keyStringsOffset = reader.u32();
    const lastPublicKey = reader.u32();

    const typeStrings = this.readStringPoolAt(reader, chunkStart + typeStringsOffset);
    const keyStrings = this.readStringPoolAt(reader, chunkStart + keyStringsOffset);
    const pkg = { id, name, typeStrings: typeStrings.strings, keyStrings: keyStrings.strings, types: new Map() };
    this.packages.push(pkg);

    const end = chunkStart + chunkSize;
    reader.offset = chunkStart + chunkHeaderSize;
    while (reader.offset < end) {
      const subStart = reader.offset;
      const subType = reader.u16();
      const subHeaderSize = reader.u16();
      const subSize = reader.u32();
      if (subSize <= 0) break;

      if (subType === RES_TABLE_TYPE_TYPE) {
        this.parseType(reader, subStart, subHeaderSize, subSize, pkg, typeStrings, keyStrings);
      }
      reader.offset = subStart + subSize;
    }
  }

  readStringPoolAt(reader, offset) {
    const saved = reader.offset;
    reader.offset = offset;
    const pool = new StringPool(reader);
    reader.offset = saved;
    return pool;
  }

  parseType(reader, chunkStart, chunkHeaderSize, chunkSize, pkg, typeStrings, keyStrings) {
    const typeId = reader.u8();
    const flags = reader.u8();
    reader.u16();
    const entryCount = reader.u32();
    const entriesStart = reader.u32();
    const configSize = reader.u32();
    const configStart = reader.offset - 4;
    const config = readConfig(reader, configStart, configSize);
    const typeName = typeStrings.get(typeId - 1) || `type${typeId}`;

    const isSparse = (flags & TYPE_FLAG_SPARSE) !== 0;
    const isOffset16 = (flags & TYPE_FLAG_OFFSET16) !== 0;
    const offsets = [];
    const indices = [];

    reader.offset = chunkStart + chunkHeaderSize;
    if (isSparse) {
      for (let i = 0; i < entryCount; i++) {
        indices.push(reader.u16());
        const v = reader.u16();
        offsets.push(v === 0xffff ? -1 : v * 4);
      }
    } else if (isOffset16) {
      for (let i = 0; i < entryCount; i++) {
        indices.push(i);
        const v = reader.u16();
        offsets.push(v === 0xffff ? -1 : v * 4);
      }
    } else {
      for (let i = 0; i < entryCount; i++) {
        indices.push(i);
        offsets.push(reader.u32());
      }
    }

    const entriesBase = chunkStart + entriesStart;
    for (let i = 0; i < entryCount; i++) {
      const offset = offsets[i];
      if (offset < 0 || offset === 0xffffffff) continue;
      const entryPos = entriesBase + offset;
      if (entryPos + 6 > chunkStart + chunkSize) continue;
      const entryReader = new BinaryReader(reader.bytes, entryPos, chunkStart + chunkSize);
      const entrySize = entryReader.u16();
      const entryFlags = entryReader.u16();
      const keyIndex = entryReader.u32();
      const key = keyStrings.get(keyIndex) || `${typeName}_${indices[i]}`;
      const resId = (pkg.id << 24) | (typeId << 16) | indices[i];
      let value = null;
      let bag = null;
      if ((entryFlags & 0x0001) === 0) {
        entryReader.u16();
        entryReader.u8();
        const dataType = entryReader.u8();
        const data = entryReader.u32();
        value = formatTypedValue(dataType, data);
        if (dataType === TYPED_VALUE_TYPE.STRING) {
          value = this.strings ? this.strings.get(data) : String(data);
        }
      } else {
        const parentId = entryReader.u32();
        const count = entryReader.u32();
        bag = { parent: parentId >>> 0, items: new Map() };
        for (let k = 0; k < count; k++) {
          const nameId = entryReader.u32() >>> 0;
          entryReader.u16();
          entryReader.u8();
          const dataType = entryReader.u8();
          const data = entryReader.u32();
          let itemValue = formatTypedValue(dataType, data);
          if (dataType === TYPED_VALUE_TYPE.STRING) {
            itemValue = this.strings ? this.strings.get(data) : String(data);
          }
          bag.items.set(nameId, itemValue);
        }
        value = bag;
      }
      if (typeName === 'id' && (value === false || value === null || value === 0)) value = resId;
      const record = { resId, typeName, key, value, bag, config };
      const existing = this.entries.get(resId);
      if (!existing || configRank(config) <= configRank(existing.config)) {
        this.entries.set(resId, record);
        if (isBetterDefault(config, existing ? existing.config : null)) {
          this.values.set(resId, value);
          pkg.types.get(typeName)?.set(key, value);
        }
      }
      if (!pkg.types.has(typeName)) pkg.types.set(typeName, new Map());
      pkg.types.get(typeName).set(key, this.entries.get(resId).value);
    }
  }

  resolve(resId, seen = new Set()) {
    if (typeof resId !== 'number') return resId;
    if (seen.has(resId)) return null;
    seen.add(resId);
    const entry = this.entries.get(resId);
    if (!entry) return null;
    if (entry.value && typeof entry.value === 'object' && 'reference' in entry.value) {
      return this.resolve(entry.value.reference, seen);
    }
    return entry.value;
  }

  getEntry(resId) {
    return this.entries.get(resId) || null;
  }

  getString(resId, fallback = '') {
    const value = this.resolve(resId);
    return value === null || value === undefined ? fallback : String(value);
  }

  getLayoutName(resId) {
    const entry = this.entries.get(resId);
    return entry ? entry.key : null;
  }

  getTypeEntries(typeName) {
    const result = new Map();
    for (const [resId, entry] of this.entries) {
      if (entry.typeName === typeName) result.set(resId, entry);
    }
    return result;
  }

  getStyleAttributes(styleId, seen = new Set()) {
    const attributes = new Map();
    if (typeof styleId !== 'number' || seen.has(styleId)) return attributes;
    seen.add(styleId);
    const entry = this.entries.get(styleId);
    if (!entry) return attributes;
    let bag = entry.bag;
    if (!bag && entry.value && typeof entry.value === 'object' && 'reference' in entry.value) {
      return this.getStyleAttributes(entry.value.reference, seen);
    }
    if (!bag) return attributes;
    if (bag.parent) {
      for (const [key, value] of this.getStyleAttributes(bag.parent, seen)) {
        attributes.set(key, value);
      }
    }
    for (const [key, value] of bag.items) attributes.set(key, value);
    return attributes;
  }

  getStyleAttribute(styleId, attrId) {
    return this.getStyleAttributes(styleId).get(attrId >>> 0);
  }
}

function readConfig(reader, start, size) {
  const view = reader.view;
  const base = start;
  const config = {
    size,
    mcc: view.getUint16(base + 4, true),
    mnc: view.getUint16(base + 6, true),
    language: readLocale(view, base + 8, 2),
    country: readLocale(view, base + 10, 2),
    orientation: view.getUint8(base + 12),
    density: view.getUint16(base + 14, true),
    sdkVersion: size >= 24 ? view.getUint16(base + 12 + 12, true) : 0,
  };
  return config;
}

function readLocale(view, offset, length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out;
}

function configRank(config) {
  if (!config) return 999;
  return (
    (config.language ? 1 : 0) +
    (config.country ? 1 : 0) +
    (config.density ? 1 : 0) +
    (config.orientation ? 1 : 0)
  );
}

function isBetterDefault(next, previous) {
  if (!previous) return true;
  return configRank(next) <= configRank(previous);
}
