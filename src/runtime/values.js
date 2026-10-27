export const JAVA_OBJECT = Symbol('javaObject');
export const JAVA_ARRAY = Symbol('javaArray');

export class JavaObject {
  constructor(dexClass, vm) {
    this[JAVA_OBJECT] = true;
    this.$dexClass = dexClass;
    this.$nativeClass = null;
    this.$vm = vm;
    this.$fields = new Map();
  }
}

export class JavaArray {
  constructor(type, data, vm) {
    this[JAVA_ARRAY] = true;
    this.$type = type;
    this.$data = data;
    this.$vm = vm;
  }
}

export const NULL = null;
export const VOID = undefined;

export function isJavaObject(value) {
  return value !== null && typeof value === 'object' && value[JAVA_OBJECT] === true;
}

export function isJavaArray(value) {
  return value !== null && typeof value === 'object' && value[JAVA_ARRAY] === true;
}

export function isReference(value) {
  return value === null || typeof value === 'string' || isJavaObject(value) || isJavaArray(value) || (typeof value === 'object' && !isPrimitiveNumber(value));
}

export function isWideType(descriptor) {
  return descriptor === 'J' || descriptor === 'D';
}

export function isObjectType(descriptor) {
  return descriptor.startsWith('L') || descriptor.startsWith('[');
}

export function defaultValueFor(descriptor) {
  if (!descriptor || descriptor === 'V') return undefined;
  switch (descriptor[0]) {
    case 'Z':
      return 0;
    case 'B':
    case 'S':
    case 'C':
    case 'I':
      return 0;
    case 'J':
      return 0n;
    case 'F':
    case 'D':
      return 0;
    default:
      return null;
  }
}

export function int32(value) {
  return value | 0;
}

export function toInt(value) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return Number(BigInt.asIntN(32, value));
  if (typeof value === 'number') return value | 0;
  return 0;
}

export function toLong(value) {
  if (typeof value === 'bigint') return BigInt.asIntN(64, value);
  if (typeof value === 'boolean') return value ? 1n : 0n;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

export function toFloat(value) {
  return Number(value) || 0;
}

export function toDouble(value) {
  return Number(value) || 0;
}

export function charToString(value) {
  return String.fromCharCode(value & 0xffff);
}

export function stringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (isJavaArray(value)) {
    const items = value.$data.map((v) => stringify(v));
    return `[${items.join(', ')}]`;
  }
  if (isJavaObject(value)) {
    const toString = value.$dexClass?.findDeclaredMethod('toString', '()Ljava/lang/String;');
    if (toString) return '[object]';
    return `${value.$dexClass?.name || 'Object'}@${hashCode(value).toString(16)}`;
  }
  return String(value);
}

export function equals(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b);
  return false;
}

export function hashCode(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') {
    let h = 0;
    for (let i = 0; i < value.length; i++) h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
    return h;
  }
  if (typeof value === 'number') return value | 0;
  if (typeof value === 'bigint') return Number(BigInt.asIntN(32, value ^ (value >> 32n)));
  if (typeof value === 'object') {
    if (!value.$identityHash) value.$identityHash = (Math.random() * 0x7fffffff) | 0;
    return value.$identityHash;
  }
  return 0;
}

function isPrimitiveNumber(value) {
  return typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean';
}
