const textDecoder = new TextDecoder('utf-8', { fatal: false });

export class BinaryReader {
  constructor(bytes, start = 0, end = bytes.byteLength) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.start = start;
    this.end = end;
    this.offset = start;
  }

  get length() {
    return this.end - this.start;
  }

  get position() {
    return this.offset - this.start;
  }

  get remaining() {
    return this.end - this.offset;
  }

  seek(position) {
    this.offset = this.start + position;
    return this;
  }

  skip(count) {
    this.offset += count;
    return this;
  }

  require(count) {
    if (this.offset + count > this.end) {
      throw new RangeError(`读取越界: ${this.position} + ${count} > ${this.length}`);
    }
  }

  u8() {
    this.require(1);
    return this.view.getUint8(this.offset++);
  }

  i8() {
    this.require(1);
    return this.view.getInt8(this.offset++);
  }

  u16() {
    this.require(2);
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  i16() {
    this.require(2);
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  u32() {
    this.require(4);
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  i32() {
    this.require(4);
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  u64() {
    this.require(8);
    const v = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return v;
  }

  i64() {
    this.require(8);
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }

  peekU16(offset = this.offset) {
    return this.view.getUint16(offset, true);
  }

  peekU32(offset = this.offset) {
    return this.view.getUint32(offset, true);
  }

  useBytes(start, end) {
    return new BinaryReader(this.bytes, this.start + start, this.start + Math.min(end, this.length));
  }

  uleb128() {
    let result = 0;
    let shift = 0;
    for (;;) {
      this.require(1);
      const byte = this.view.getUint8(this.offset++);
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new Error('ULEB128 过大');
    }
    return result >>> 0;
  }

  uleb128p1() {
    return this.uleb128() - 1;
  }

  sleb128() {
    let result = 0;
    let shift = 0;
    let byte = 0;
    for (;;) {
      this.require(1);
      byte = this.view.getUint8(this.offset++);
      result |= (byte & 0x7f) << shift;
      shift += 7;
      if ((byte & 0x80) === 0) break;
      if (shift > 35) throw new Error('SLEB128 过大');
    }
    if (shift < 32 && (byte & 0x40) !== 0) result |= -1 << shift;
    return result | 0;
  }

  utf8(byteLength) {
    this.require(byteLength);
    const value = textDecoder.decode(this.bytes.subarray(this.offset, this.offset + byteLength));
    this.offset += byteLength;
    return value;
  }
}

export function signExtend(value, bits) {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

export function decodeMutf8(bytes, offset, byteLength) {
  const units = [];
  let cursor = offset;
  const end = offset + byteLength;
  while (cursor < end) {
    const a = bytes[cursor++] & 0xff;
    if (a < 0x80) {
      units.push(a);
      continue;
    }
    if ((a & 0xe0) === 0xc0 && cursor < end) {
      const b = bytes[cursor++] & 0xff;
      units.push(((a & 0x1f) << 6) | (b & 0x3f));
      continue;
    }
    if ((a & 0xf0) === 0xe0 && cursor + 1 < end) {
      const b = bytes[cursor++] & 0xff;
      const c = bytes[cursor++] & 0xff;
      units.push(((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f));
      continue;
    }
    units.push(a);
  }
  let output = '';
  for (let i = 0; i < units.length; i += 8192) {
    output += String.fromCharCode.apply(null, units.slice(i, i + 8192));
  }
  return output;
}

export function readMutf8String(reader, offset) {
  const view = new DataView(reader.bytes.buffer, reader.bytes.byteOffset, reader.bytes.byteLength);
  let cursor = offset;
  let shift = 0;
  let utf16Length = 0;
  for (;;) {
    const byte = view.getUint8(cursor++);
    utf16Length |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  let end = cursor;
  while (end < view.byteLength && view.getUint8(end) !== 0) end++;
  const value = decodeMutf8(reader.bytes, reader.bytes.byteOffset + cursor, end - cursor);
  return { value, utf16Length, end: end + 1 };
}

export function align4(value) {
  return (value + 3) & ~3;
}

export function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('不支持的二进制输入');
}
