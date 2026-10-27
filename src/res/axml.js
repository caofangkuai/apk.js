import { BinaryReader, decodeMutf8, toUint8Array } from '../core/binary.js';

const RES_STRING_POOL_TYPE = 0x0001;
const RES_XML_TYPE = 0x0003;
const RES_XML_START_NAMESPACE_TYPE = 0x0100;
const RES_XML_END_NAMESPACE_TYPE = 0x0101;
const RES_XML_START_ELEMENT_TYPE = 0x0102;
const RES_XML_END_ELEMENT_TYPE = 0x0103;
const RES_XML_CDATA_TYPE = 0x0104;
const RES_XML_RESOURCE_MAP_TYPE = 0x0180;

const UTF8_FLAG = 0x100;
const NO_INDEX = 0xffffffff;

export const ATTR_IDS = {
  theme: 0x01010000,
  label: 0x01010001,
  name: 0x01010003,
  text: 0x0101000e,
  id: 0x010100d0,
  orientation: 0x010100c4,
  layout_width: 0x010100f4,
  layout_height: 0x010100f5,
  layout_margin: 0x010100f6,
  layout_marginLeft: 0x010100f7,
  layout_marginTop: 0x010100f8,
  layout_marginRight: 0x010100f9,
  layout_marginBottom: 0x010100fa,
  layout_gravity: 0x010100b3,
  gravity: 0x010100af,
  padding: 0x010100d5,
  paddingLeft: 0x010100d6,
  paddingTop: 0x010100d7,
  paddingRight: 0x010100d8,
  paddingBottom: 0x010100d9,
  textSize: 0x01010095,
  textColor: 0x01010098,
  textStyle: 0x01010097,
  textAllCaps: 0x010103df,
  background: 0x010100d4,
  src: 0x01010119,
  scaleType: 0x0101011d,
  minWidth: 0x0101013f,
  minHeight: 0x01010140,
  visibility: 0x010100dc,
  weight: 0x01010181,
  alpha: 0x0101031f,
  clickable: 0x010100e5,
  enabled: 0x010100ec,
  contentDescription: 0x01010273,
  colorAccent: 0x01010435,
  windowBackground: 0x01010054,
  backgroundTint: 0x0101046b,
  fontFamily: 0x010103ac,
  layout_alignParentTop: 0x01010117,
  layout_alignParentBottom: 0x01010119,
  layout_alignParentLeft: 0x0101011a,
  layout_alignParentRight: 0x0101011b,
  layout_centerInParent: 0x01010113,
  layout_centerHorizontal: 0x01010114,
  layout_centerVertical: 0x01010115,
  layout_below: 0x01010103,
  layout_above: 0x01010104,
  layout_toLeftOf: 0x01010105,
  layout_toRightOf: 0x01010106,
  layout_alignTop: 0x01010107,
  layout_alignBottom: 0x01010108,
  layout_alignLeft: 0x01010109,
  layout_alignRight: 0x0101010a,
  layout_alignBaseline: 0x0101010b,
  layout_alignWithParentIfMissing: 0x0101010c,
};

export const TYPED_VALUE_TYPE = {
  NULL: 0x00,
  REFERENCE: 0x01,
  ATTRIBUTE: 0x02,
  STRING: 0x03,
  FLOAT: 0x04,
  DIMENSION: 0x05,
  FRACTION: 0x06,
  DYNAMIC_REFERENCE: 0x07,
  DYNAMIC_ATTRIBUTE: 0x08,
  INT_DEC: 0x10,
  INT_HEX: 0x11,
  INT_BOOLEAN: 0x12,
  INT_COLOR_ARGB8: 0x1c,
  INT_COLOR_RGB8: 0x1d,
  INT_COLOR_ARGB4: 0x1e,
  INT_COLOR_RGB4: 0x1f,
};

export class StringPool {
  constructor(reader) {
    const start = reader.offset;
    const type = reader.u16();
    const headerSize = reader.u16();
    const size = reader.u32();
    if (type !== RES_STRING_POOL_TYPE) throw new Error(`字符串池类型错误: 0x${type.toString(16)}`);
    const stringCount = reader.u32();
    const styleCount = reader.u32();
    const flags = reader.u32();
    const stringsStart = reader.u32();
    const stylesStart = reader.u32();
    const isUtf8 = (flags & UTF8_FLAG) !== 0;

    const offsets = new Array(stringCount);
    for (let i = 0; i < stringCount; i++) offsets[i] = reader.u32();

    this.strings = new Array(stringCount);
    this.raw = [];
    for (let i = 0; i < stringCount; i++) {
      const base = start + stringsStart + offsets[i];
      this.strings[i] = isUtf8 ? readUtf8String(reader, base) : readUtf16String(reader, base);
    }

    this.offset = start + size;
    reader.offset = start + size;
  }

  get(index) {
    if (index === NO_INDEX || index === 0xffffffff) return null;
    return this.strings[index] ?? null;
  }
}

function readUtf8String(reader, offset) {
  let cursor = offset;
  let utf16Length = 0;
  let shift = 0;
  for (;;) {
    const b = reader.view.getUint8(cursor++);
    utf16Length |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  shift = 0;
  let byteLength = 0;
  for (;;) {
    const b = reader.view.getUint8(cursor++);
    byteLength |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  const bytes = reader.bytes;
  const dataStart = bytes.byteOffset + cursor;
  return decodeMutf8(bytes, dataStart, byteLength);
}

function readUtf16String(reader, offset) {
  let cursor = offset;
  let charCount = 0;
  let shift = 0;
  for (;;) {
    const b = reader.view.getUint16(cursor, true);
    cursor += 2;
    charCount |= (b & 0x7fff) << shift;
    if ((b & 0x8000) === 0) break;
    shift += 15;
  }
  let out = '';
  for (let i = 0; i < charCount; i++) out += String.fromCharCode(reader.view.getUint16(cursor + i * 2, true));
  return out;
}

export class XmlNode {
  constructor(type, name = null, attrs = [], children = []) {
    this.type = type;
    this.name = name;
    this.attrs = attrs;
    this.children = children;
    this.parent = null;
    this.text = '';
  }

  getAttribute(name) {
    const found = this.attrs.find((a) => a.name === name || a.namespaceName === name);
    return found ? found.value : null;
  }

  getAttributeValue(name) {
    return this.getAttribute(name);
  }

  findChild(name) {
    return this.children.find((c) => c.type === 'element' && c.name === name) || null;
  }

  findAll(name) {
    return this.children.filter((c) => c.type === 'element' && c.name === name);
  }

  toString(indent = 0) {
    const pad = '  '.repeat(indent);
    if (this.type === 'element') {
      const attrs = this.attrs.map((a) => `${a.name}="${a.value}"`).join(' ');
      const inner = this.children.map((c) => c.toString(indent + 1)).join('');
      return `${pad}<${this.name}${attrs ? ' ' + attrs : ''}>${inner}${pad}</${this.name}>\n`;
    }
    return `${pad}${this.text}\n`;
  }
}

export function parseBinaryXml(input) {
  const reader = new BinaryReader(toUint8Array(input));
  const type = reader.u16();
  const headerSize = reader.u16();
  const totalSize = reader.u32();
  if (type !== RES_XML_TYPE) throw new Error('不是二进制 Android XML');
  reader.offset = headerSize;

  let pool = null;
  const resourceIds = [];
  const root = new XmlNode('document');
  const stack = [root];
  let pendingNs = null;

  while (reader.offset < totalSize) {
    const chunkStart = reader.offset;
    const chunkType = reader.u16();
    const chunkHeaderSize = reader.u16();
    const chunkSize = reader.u32();

    if (chunkType === RES_STRING_POOL_TYPE) {
      reader.offset = chunkStart;
      pool = new StringPool(reader);
      continue;
    }

    if (chunkType === RES_XML_RESOURCE_MAP_TYPE) {
      const count = (chunkSize - chunkHeaderSize) / 4;
      for (let i = 0; i < count; i++) resourceIds.push(reader.u32());
      continue;
    }

    if (chunkType === RES_XML_START_NAMESPACE_TYPE) {
      const line = reader.u32();
      reader.u32();
      const prefix = pool.get(reader.u32());
      const uri = pool.get(reader.u32());
      pendingNs = { prefix, uri };
      continue;
    }

    if (chunkType === RES_XML_END_NAMESPACE_TYPE) {
      reader.u32();
      reader.u32();
      reader.u32();
      reader.u32();
      pendingNs = null;
      continue;
    }

    if (chunkType === RES_XML_START_ELEMENT_TYPE) {
      const line = reader.u32();
      const comment = reader.u32();
      const nsIndex = reader.u32();
      const nameIndex = reader.u32();
      const attributeStart = reader.u16();
      const attributeSize = reader.u16();
      const attributeCount = reader.u16();
      const idIndex = reader.u16();
      const classIndex = reader.u16();
      const styleIndex = reader.u16();

      const name = pool.get(nameIndex);
      const attrs = [];
      let cursor = chunkStart + chunkHeaderSize + attributeStart;
      for (let i = 0; i < attributeCount; i++) {
        const attrNs = pool.get(reader.view.getUint32(cursor, true));
        const attrNameIndex = reader.view.getUint32(cursor + 4, true);
        const rawIndex = reader.view.getInt32(cursor + 8, true);
        const dataType = reader.view.getUint8(cursor + 15);
        const data = reader.view.getUint32(cursor + 16, true);
        const attrName = pool.get(attrNameIndex);
        const resId = attrNameIndex < resourceIds.length ? resourceIds[attrNameIndex] : 0;
        const rawValue = rawIndex === -1 ? null : pool.get(rawIndex);
        attrs.push({
          namespace: attrNs,
          namespaceName: attrNs ? attrNs : null,
          name: attrName,
          resId,
          dataType,
          data,
          rawValue,
          value: rawValue !== null ? rawValue : formatTypedValue(dataType, data),
        });
        cursor += attributeSize;
      }
      const element = new XmlNode('element', name, attrs);
      element.line = line;
      element.namespace = nsIndex !== NO_INDEX ? pool.get(nsIndex) : (pendingNs ? pendingNs.uri : null);
      const parent = stack[stack.length - 1];
      element.parent = parent;
      parent.children.push(element);
      stack.push(element);
      reader.offset = chunkStart + chunkSize;
      continue;
    }

    if (chunkType === RES_XML_END_ELEMENT_TYPE) {
      if (stack.length > 1) stack.pop();
      reader.offset = chunkStart + chunkSize;
      continue;
    }

    if (chunkType === RES_XML_CDATA_TYPE) {
      const dataIndex = reader.u32();
      const text = pool.get(dataIndex);
      const parent = stack[stack.length - 1];
      parent.text = (parent.text || '') + (text || '');
      reader.offset = chunkStart + chunkSize;
      continue;
    }

    reader.offset = chunkStart + chunkSize;
  }

  const first = root.children.find((c) => c.type === 'element') || null;
  const manifest = first && first.name === 'manifest' ? first : null;
  return { root, first, manifest, pool };
}

export function formatTypedValue(dataType, data) {
  switch (dataType) {
    case TYPED_VALUE_TYPE.NULL:
      return null;
    case TYPED_VALUE_TYPE.REFERENCE:
      return { reference: data };
    case TYPED_VALUE_TYPE.STRING:
      return String(data);
    case TYPED_VALUE_TYPE.FLOAT: {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setUint32(0, data, true);
      return new DataView(buf).getFloat32(0, true);
    }
    case TYPED_VALUE_TYPE.INT_BOOLEAN:
      return data !== 0;
    case TYPED_VALUE_TYPE.INT_DEC:
    case TYPED_VALUE_TYPE.INT_HEX:
      return data | 0;
    case TYPED_VALUE_TYPE.INT_COLOR_ARGB8:
    case TYPED_VALUE_TYPE.INT_COLOR_RGB8:
    case TYPED_VALUE_TYPE.INT_COLOR_ARGB4:
    case TYPED_VALUE_TYPE.INT_COLOR_RGB4:
      return data >>> 0;
    case TYPED_VALUE_TYPE.DIMENSION:
      return { dimension: decodeComplex(data) };
    case TYPED_VALUE_TYPE.FRACTION:
      return { fraction: decodeComplex(data) };
    default:
      return data;
  }
}

export function decodeComplex(data) {
  const radix = [1, 1 / 128, 1 / 32768, 1 / 8388608];
  let mantissa = (data & 0xffffff00) >> 8;
  if (mantissa & 0x800000) mantissa -= 0x1000000;
  const value = mantissa * radix[(data >> 4) & 0x3];
  const unit = data & 0xf;
  const units = ['px', 'dp', 'sp', 'pt', 'in', 'mm'];
  return { value, unit: units[unit] || 'px', raw: data };
}

export function typedValueToNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value.dimension) return value.dimension.value;
  if (typeof value === 'object' && value.fraction) return value.fraction.value;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function typedValueToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.reference !== undefined) return `@${value.reference.toString(16)}`;
    if (value.dimension) return `${value.dimension.value}${value.dimension.unit}`;
  }
  return String(value);
}
