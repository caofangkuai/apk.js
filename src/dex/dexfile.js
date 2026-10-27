import { BinaryReader, readMutf8String, signExtend, toUint8Array } from '../core/binary.js';
import { DBG } from '../runtime/debug.js';

const NO_INDEX = 0xffffffff;

export class DexProto {
  constructor(shorty, returnType, parameters, descriptor) {
    this.shorty = shorty;
    this.returnType = returnType;
    this.parameters = parameters;
    this.descriptor = descriptor;
  }

  get isWideReturn() {
    return this.returnType === 'J' || this.returnType === 'D';
  }
}

export class DexField {
  constructor(classDesc, type, name) {
    this.classDesc = classDesc;
    this.type = type;
    this.name = name;
  }

  get key() {
    return `${this.name}:${this.type}`;
  }
}

export class DexMethod {
  constructor(classDesc, name, proto, accessFlags, code, dex) {
    this.classDesc = classDesc;
    this.name = name;
    this.proto = proto;
    this.accessFlags = accessFlags;
    this.code = code;
    this.dex = dex;
    this.key = `${name}${proto.descriptor}`;
  }

  get isStatic() {
    return (this.accessFlags & 0x0008) !== 0;
  }

  get isPrivate() {
    return (this.accessFlags & 0x0002) !== 0;
  }

  get isConstructor() {
    return this.name === '<init>';
  }

  get isStaticInitializer() {
    return this.name === '<clinit>';
  }
}

export class DexClass {
  constructor() {
    this.descriptor = '';
    this.superclass = null;
    this.interfaces = [];
    this.accessFlags = 0;
    this.sourceFile = null;
    this.staticFields = [];
    this.instanceFields = [];
    this.directMethods = [];
    this.virtualMethods = [];
    this.staticValues = [];
    this.methodsByName = new Map();
    this.initialized = false;
    this.initializing = false;
  }

  get name() {
    return descriptorToName(this.descriptor);
  }

  findDeclaredMethod(name, protoDescriptor) {
    const key = `${name}${protoDescriptor}`;
    return this.methodsByName.get(key) || null;
  }

  addMethod(method) {
    this.methodsByName.set(method.key, method);
  }

  allFields() {
    return [...this.staticFields, ...this.instanceFields];
  }
}

export class DexFile {
  constructor(input) {
    const bytes = toUint8Array(input);
    this.bytes = bytes;
    const reader = new BinaryReader(bytes);
    const magic = String.fromCharCode(...bytes.subarray(0, 8));
    if (!magic.startsWith('dex\n')) throw new Error('文件不是有效的 DEX');
    this.version = magic.slice(4, 7);
    reader.seek(8);
    this.checksum = reader.u32();
    reader.skip(20);
    this.fileSize = reader.u32();
    this.headerSize = reader.u32();
    this.endianTag = reader.u32();
    if (this.endianTag !== 0x12345678) throw new Error('仅支持小端 DEX');
    this.linkSize = reader.u32();
    this.linkOff = reader.u32();
    this.mapOff = reader.u32();
    const stringIdsSize = reader.u32();
    const stringIdsOff = reader.u32();
    const typeIdsSize = reader.u32();
    const typeIdsOff = reader.u32();
    const protoIdsSize = reader.u32();
    const protoIdsOff = reader.u32();
    const fieldIdsSize = reader.u32();
    const fieldIdsOff = reader.u32();
    const methodIdsSize = reader.u32();
    const methodIdsOff = reader.u32();
    const classDefsSize = reader.u32();
    const classDefsOff = reader.u32();
    if (this.fileSize !== bytes.byteLength) {
      this.fileSize = Math.min(this.fileSize, bytes.byteLength);
    }

    this.strings = new Array(stringIdsSize);
    for (let i = 0; i < stringIdsSize; i++) {
      reader.offset = stringIdsOff + i * 4;
      const dataOff = reader.u32();
      this.strings[i] = readMutf8String(reader, dataOff).value;
    }

    this.types = new Array(typeIdsSize);
    for (let i = 0; i < typeIdsSize; i++) {
      reader.offset = typeIdsOff + i * 4;
      this.types[i] = this.strings[reader.u32()];
    }

    this.protos = new Array(protoIdsSize);
    for (let i = 0; i < protoIdsSize; i++) {
      reader.offset = protoIdsOff + i * 12;
      const shortyIdx = reader.u32();
      const returnTypeIdx = reader.u32();
      const parametersOff = reader.u32();
      const parameters = [];
      if (parametersOff) {
        reader.offset = parametersOff;
        const count = reader.u32();
        for (let p = 0; p < count; p++) parameters.push(this.types[reader.u16()]);
      }
      const returnType = this.types[returnTypeIdx];
      this.protos[i] = new DexProto(
        this.strings[shortyIdx],
        returnType,
        parameters,
        `(${parameters.join('')})${returnType}`
      );
    }

    this.fields = new Array(fieldIdsSize);
    for (let i = 0; i < fieldIdsSize; i++) {
      reader.offset = fieldIdsOff + i * 8;
      const classIdx = reader.u16();
      const typeIdx = reader.u16();
      const nameIdx = reader.u32();
      this.fields[i] = new DexField(this.types[classIdx], this.types[typeIdx], this.strings[nameIdx]);
    }

    this.methods = new Array(methodIdsSize);
    for (let i = 0; i < methodIdsSize; i++) {
      reader.offset = methodIdsOff + i * 8;
      const classIdx = reader.u16();
      const protoIdx = reader.u16();
      const nameIdx = reader.u32();
      this.methods[i] = {
        classDesc: this.types[classIdx],
        name: this.strings[nameIdx],
        proto: this.protos[protoIdx],
      };
    }

    this.classes = new Array(classDefsSize);
    this.classesByDescriptor = new Map();
    for (let i = 0; i < classDefsSize; i++) {
      reader.offset = classDefsOff + i * 32;
      const classIdx = reader.u32();
      const accessFlags = reader.u32();
      const superclassIdx = reader.u32();
      const interfacesOff = reader.u32();
      const sourceFileIdx = reader.u32();
      reader.u32();
      const classDataOff = reader.u32();
      const staticValuesOff = reader.u32();

      const dexClass = new DexClass();
      dexClass.descriptor = this.types[classIdx];
      dexClass.accessFlags = accessFlags;
      dexClass.superclass = superclassIdx === NO_INDEX ? null : this.types[superclassIdx];
      dexClass.sourceFile = sourceFileIdx === NO_INDEX ? null : this.strings[sourceFileIdx];

      if (interfacesOff) {
        reader.offset = interfacesOff;
        const count = reader.u32();
        for (let n = 0; n < count; n++) dexClass.interfaces.push(this.types[reader.u16()]);
      }

      if (classDataOff) this.parseClassData(reader, dexClass, classDataOff);
      if (staticValuesOff) dexClass.staticValues = this.parseEncodedArray(reader, staticValuesOff);

      this.classes[i] = dexClass;
      this.classesByDescriptor.set(dexClass.descriptor, dexClass);
    }

    this.packages = new Map();
    for (const cls of this.classes) {
      const slash = cls.descriptor.lastIndexOf('/');
      if (slash > 0) {
        const pkg = cls.descriptor.slice(1, slash).replace(/\//g, '.');
        if (!this.packages.has(pkg)) this.packages.set(pkg, []);
        this.packages.get(pkg).push(cls);
      }
    }
  }

  parseClassData(reader, dexClass, offset) {
    reader.offset = offset;
    const staticFieldsSize = reader.uleb128();
    const instanceFieldsSize = reader.uleb128();
    const directMethodsSize = reader.uleb128();
    const virtualMethodsSize = reader.uleb128();

    let fieldIdx = 0;
    for (let i = 0; i < staticFieldsSize; i++) {
      fieldIdx += reader.uleb128();
      const flags = reader.uleb128();
      const field = this.fields[fieldIdx];
      dexClass.staticFields.push({ field, accessFlags: flags, value: undefined });
    }

    fieldIdx = 0;
    for (let i = 0; i < instanceFieldsSize; i++) {
      fieldIdx += reader.uleb128();
      const flags = reader.uleb128();
      const field = this.fields[fieldIdx];
      dexClass.instanceFields.push({ field, accessFlags: flags });
    }

    let methodIdx = 0;
    for (let i = 0; i < directMethodsSize; i++) {
      methodIdx += reader.uleb128();
      const flags = reader.uleb128();
      const codeOff = reader.uleb128();
      this.addMethod(dexClass, methodIdx, flags, codeOff);
    }

    methodIdx = 0;
    for (let i = 0; i < virtualMethodsSize; i++) {
      methodIdx += reader.uleb128();
      const flags = reader.uleb128();
      const codeOff = reader.uleb128();
      this.addMethod(dexClass, methodIdx, flags, codeOff);
    }
  }

  addMethod(dexClass, methodIdx, flags, codeOff) {
    const ref = this.methods[methodIdx];
    if (DBG.codeOff && ref.name === 'checkVectorDrawableSetup') console.log('CODEOFF', ref.classDesc, codeOff >>> 0);
    const isNative = (flags & 0x0100) !== 0;
    const code = !isNative && codeOff ? this.parseCode(this, codeOff) : null;
    const method = new DexMethod(dexClass.descriptor, ref.name, ref.proto, flags, code, this);
    dexClass.addMethod(method);
    if ((flags & 0x0008) !== 0 || (flags & 0x0002) !== 0 || method.isConstructor) {
      if (!dexClass.directMethods.includes(method)) dexClass.directMethods.push(method);
    } else {
      if (!dexClass.virtualMethods.includes(method)) dexClass.virtualMethods.push(method);
    }
  }

  parseCode(dex, offset) {
    const reader = new BinaryReader(dex.bytes, offset);
    const registersSize = reader.u16();
    const insSize = reader.u16();
    const outsSize = reader.u16();
    const triesSize = reader.u16();
    const debugInfoOff = reader.u32();
    const insnsSize = reader.u32();
    const insnsStart = reader.offset;
    const insns = new Uint16Array(insnsSize);
    for (let i = 0; i < insnsSize; i++) insns[i] = reader.u16();

    const tries = [];
    if (triesSize > 0) {
      reader.offset = insnsStart + insnsSize * 2;
      if ((insnsSize & 1) !== 0) reader.skip(2);
      const tryBase = reader.offset;
      for (let i = 0; i < triesSize; i++) {
        const startAddr = reader.u32();
        const insnCount = reader.u16();
        const handlerOff = reader.u16();
        tries.push({ startAddr, insnCount, handlerOff, base: tryBase });
      }
      const handlersBase = tryBase + triesSize * 8;
      for (const t of tries) {
        reader.offset = handlersBase + t.handlerOff;
        const size = reader.sleb128();
        const handlers = [];
        for (let i = 0; i < Math.abs(size); i++) {
          handlers.push({ type: dex.types[reader.uleb128()], addr: reader.uleb128() });
        }
        const catchAll = size <= 0 ? reader.uleb128() : -1;
        t.handlers = handlers;
        t.catchAll = catchAll;
      }
    }

    return {
      registersSize,
      insSize,
      outsSize,
      triesSize,
      debugInfoOff,
      insnsStart,
      insns,
      tries,
      dex,
    };
  }

  parseEncodedArray(reader, offset) {
    reader.offset = offset;
    const size = reader.uleb128();
    const values = [];
    for (let i = 0; i < size; i++) values.push(readEncodedValue(reader, this));
    return values;
  }

  findClass(descriptor) {
    return this.classesByDescriptor.get(descriptor) || null;
  }

  findClassByName(name) {
    return this.findClass(nameToDescriptor(name));
  }

  findPackageClasses(packageName) {
    return this.packages.get(packageName) || [];
  }

  getMethod(ref) {
    return this.methods[ref];
  }
}

function readEncodedValue(reader, dex) {
  const header = reader.u8();
  const valueType = header & 0x1f;
  const valueArg = header >>> 5;
  const readUnsigned = () => {
    let result = 0;
    for (let i = 0; i <= valueArg; i++) result |= reader.u8() << (i * 8);
    return result >>> 0;
  };
  const readSigned = () => signExtend(readUnsigned(), (valueArg + 1) * 8);
  switch (valueType) {
    case 0x00:
      return readSigned();
    case 0x02:
      return readSigned();
    case 0x03:
      return readUnsigned();
    case 0x04:
      return readSigned();
    case 0x06: {
      let result = 0n;
      for (let i = 0; i <= valueArg; i++) result |= BigInt(reader.u8()) << BigInt(i * 8);
      return BigInt.asIntN(64, result);
    }
    case 0x10: {
      const bits = readUnsigned() << ((3 - valueArg) * 8);
      const view = new DataView(new ArrayBuffer(4));
      view.setUint32(0, bits >>> 0, true);
      return view.getFloat32(0, true);
    }
    case 0x11: {
      let bits = 0n;
      for (let i = 0; i <= valueArg; i++) bits |= BigInt(reader.u8()) << BigInt(i * 8);
      bits <<= BigInt((7 - valueArg) * 8);
      const view = new DataView(new ArrayBuffer(8));
      view.setBigUint64(0, bits & 0xffffffffffffffffn, true);
      return view.getFloat64(0, true);
    }
    case 0x17:
      return dex.strings[readUnsigned()];
    case 0x18:
      return dex.types[readUnsigned()];
    case 0x19: {
      const field = dex.fields[readUnsigned()];
      return field ? `${field.classDesc}->${field.name}:${field.type}` : null;
    }
    case 0x1a:
    case 0x1b: {
      const method = dex.methods[readUnsigned()];
      return method ? `${method.classDesc}->${method.name}${method.proto.descriptor}` : null;
    }
    case 0x1c: {
      const values = [];
      for (let i = 0; i < valueArg; i++) values.push(readEncodedValue(reader, dex));
      return values;
    }
    case 0x1e:
      return null;
    case 0x1f:
      return valueArg !== 0;
    default:
      for (let i = 0; i <= valueArg; i++) reader.u8();
      return null;
  }
}

export function descriptorToName(descriptor) {
  if (!descriptor) return '';
  if (descriptor.startsWith('L') && descriptor.endsWith(';')) {
    return descriptor.slice(1, -1).replace(/\//g, '.');
  }
  if (descriptor.startsWith('[')) return descriptor;
  return descriptor;
}

export function nameToDescriptor(name) {
  if (!name) return '';
  if (name.startsWith('[') || name.length === 1) return name;
  return `L${name.replace(/\./g, '/')};`;
}

export function descriptorToJavaType(descriptor) {
  if (!descriptor) return 'void';
  if (descriptor.startsWith('[')) return `${descriptorToJavaType(descriptor.slice(1))}[]`;
  const map = {
    V: 'void',
    Z: 'boolean',
    B: 'byte',
    S: 'short',
    C: 'char',
    I: 'int',
    J: 'long',
    F: 'float',
    D: 'double',
  };
  if (map[descriptor]) return map[descriptor];
  return descriptorToName(descriptor);
}
