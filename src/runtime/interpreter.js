import { opcodeFormat, opcodeName, opcodeSize } from '../dex/opcodes.js';
import { descriptorToName } from '../dex/dexfile.js';
import { VMRuntimeError } from './vm.js';
import {
  defaultValueFor,
  isJavaArray,
  isJavaObject,
  isWideType,
  stringify,
  toInt,
  toLong,
} from './values.js';
import { DBG } from './debug.js';

const RETURN_MARKER = Symbol('return');

export class MethodReturn {
  constructor(value) {
    this.value = value;
  }
}

export class DexInterpreter {
  constructor(vm) {
    this.vm = vm;
    this.trace = null;
    this.stats = { instructions: 0, invokes: 0 };
  }

  execute(method, thisArg, args) {
    args = args || [];
    const code = method.code;
    const insns = code.insns;
    const registers = new Array(code.registersSize).fill(0);
    let regIndex = code.registersSize - code.insSize;
    if (!method.isStatic) registers[regIndex++] = thisArg;
    for (const param of method.proto.parameters) {
      registers[regIndex] = args.shift();
      regIndex += isWideType(param) ? 2 : 1;
    }

    const handlers = buildTryMap(code);
    const savedPendingException = this.vm.pendingException;
    const savedMethod = this.currentMethod;
    this.vm.pendingException = null;
    try {
      return this.runLoop(method, registers, handlers, insns, code);
    } finally {
      this.vm.pendingException = savedPendingException;
      this.currentMethod = savedMethod;
    }
  }

  runLoop(method, registers, handlers, insns, code) {
    this.currentMethod = method;
    let pc = 0;
    let _lastPc = -1, _samePc = 0;
    for (;;) {
      if (pc >= insns.length) return undefined;
      if (pc === _lastPc) { if (++_samePc > 20000) { console.error('PC-STUCK at', method.classDesc + '.' + method.name, 'pc', pc, 'op=0x' + (insns[pc]&0xff).toString(16), 'regs', registers.map((r,i)=>'v'+i+'='+(r===null?'n':typeof r==='object'?'obj':r)).join(',')); throw new Error('PC-STUCK'); } } else { _lastPc = pc; _samePc = 0; }
      const unit = insns[pc];
      const op = unit & 0xff;
      this.stats.instructions++;
      this.vm.currentPc = pc;
      if (this.trace) this.trace(pc, op, method, registers);


      try {
        switch (op) {
          case 0x00:
            pc += 1;
            break;

          case 0x01: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            registers[vA] = registers[vB];
            pc += 1;
            break;
          }
          case 0x02: {
            const vA = (unit >>> 8) & 0xff;
            const vB = insns[pc + 1];
            registers[vA] = registers[vB];
            pc += 2;
            break;
          }
          case 0x03: {
            const vA = insns[pc + 1];
            const vB = insns[pc + 2];
            registers[vA] = registers[vB];
            pc += 3;
            break;
          }
          case 0x04:
          case 0x05:
          case 0x06:
          case 0x07:
          case 0x08:
          case 0x09: {
            const { a, b, size } = readMove(op, insns, pc);
            registers[a] = registers[b];
            if (op === 0x04 || op === 0x05 || op === 0x06) registers[a + 1] = registers[b + 1];
            pc += size;
            break;
          }
          case 0x0a:
            registers[unit >>> 8] = this.vm.pendingResult === undefined ? 0 : toInt(this.vm.pendingResult);
            this.vm.pendingResult = undefined;
            pc += 1;
            break;
          case 0x0b: {
            const wideResult = this.vm.pendingResult;
            registers[unit >>> 8] = wideResult === undefined ? 0n : (typeof wideResult === 'number' ? wideResult : toLong(wideResult));
            registers[(unit >>> 8) + 1] = 0;
            this.vm.pendingResult = undefined;
            pc += 1;
            break;
          }
          case 0x0c: {
            const value = this.vm.pendingResult;
            registers[unit >>> 8] = value === 0 || value === undefined ? null : value;
            this.vm.pendingResult = undefined;
            pc += 1;
            break;
          }
          case 0x0d:
            registers[unit >>> 8] = this.vm.pendingException;
            this.vm.pendingException = null;
            pc += 1;
            break;
          case 0x0e:
            return undefined;
          case 0x0f:
            return toInt(registers[unit >>> 8]);
          case 0x10:
            return toLong(registers[unit >>> 8]);
          case 0x11: {
            const value = registers[unit >>> 8];
            return value === 0 || value === undefined ? null : value;
          }

          case 0x12: {
            const vA = (unit >> 8) & 0xf;
            const lit = (unit >> 12) & 0xf;
            registers[vA] = lit > 7 ? lit - 16 : lit;
            pc += 1;
            break;
          }
          case 0x13: {
            const vA = (unit >>> 8) & 0xff;
            const lit = insns[pc + 1];
            registers[vA] = lit > 32767 ? lit - 65536 : lit;
            pc += 2;
            break;
          }
          case 0x14: {
            const vA = (unit >>> 8) & 0xff;
            registers[vA] = ((insns[pc + 2] << 16) | insns[pc + 1]) | 0;
            pc += 3;
            break;
          }
          case 0x15: {
            const vA = (unit >>> 8) & 0xff;
            registers[vA] = (insns[pc + 1] << 16) | 0;
            pc += 2;
            break;
          }
          case 0x16: {
            const vA = (unit >>> 8) & 0xff;
            const lit = insns[pc + 1];
            const value = lit > 32767 ? lit - 65536 : lit;
            registers[vA] = BigInt(value);
            registers[vA + 1] = 0;
            pc += 2;
            break;
          }
          case 0x17: {
            const vA = (unit >>> 8) & 0xff;
            const lit = (insns[pc + 2] << 16) | insns[pc + 1];
            registers[vA] = BigInt(lit | 0);
            registers[vA + 1] = 0;
            pc += 3;
            break;
          }
          case 0x18: {
            const vA = unit >>> 8;
            let value = BigInt(insns[pc + 1]) | (BigInt(insns[pc + 2]) << 16n) | (BigInt(insns[pc + 3]) << 32n) | (BigInt(insns[pc + 4]) << 48n);
            registers[vA] = BigInt.asIntN(64, value);
            registers[vA + 1] = 0;
            pc += 5;
            break;
          }
          case 0x19: {
            const vA = (unit >>> 8) & 0xff;
            const value = BigInt(insns[pc + 1]) << 48n;
            registers[vA] = BigInt.asIntN(64, value);
            registers[vA + 1] = 0;
            pc += 2;
            break;
          }
          case 0x1a: {
            const vA = (unit >>> 8) & 0xff;
            registers[vA] = method.dex.strings[insns[pc + 1]];
            pc += 2;
            break;
          }
          case 0x1b: {
            const vA = (unit >>> 8) & 0xff;
            const idx = insns[pc + 1] | (insns[pc + 2] << 16);
            registers[vA] = method.dex.strings[idx];
            pc += 3;
            break;
          }
          case 0x1c: {
            const vA = (unit >>> 8) & 0xff;
            registers[vA] = this.vm.getClassObject(method.dex.types[insns[pc + 1]]);
            pc += 2;
            break;
          }
          case 0x1d:
          case 0x1e:
            pc += 1;
            break;
          case 0x1f: {
            const vA = (unit >>> 8) & 0xff;
            registers[vA] = this.vm.registry.checkCast(registers[vA], method.dex.types[insns[pc + 1]]);
            pc += 2;
            break;
          }
          case 0x20: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            const target = method.dex.types[insns[pc + 1]];
            registers[vA] = this.vm.registry.instanceOf(registers[vB], target) ? 1 : 0;
            pc += 2;
            break;
          }
          case 0x21: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            const array = registers[vB];
            if (!isJavaArray(array)) {
              if (DBG.npe) {
                console.error('ARRAY-LEN', method.classDesc + '.' + method.name, 'pc=', pc, 'reg', vB, 'stack=', (this.vm.methodStack||[]).slice(-8).join(' <- '));
                console.error('  INSN0..4:', [0,1,2,3,4].map(i=>'0x'+((insns[i]||0)>>>0).toString(16)).join(' '), 'regs', registers.map((r,i)=>'v'+i+'='+(r===null?'n':typeof r)).join(','));
                console.error('   stack:', (this.vm.methodStack||[]).slice(-10).join(' <- '));
              }
              this.vm.throwException('Ljava/lang/NullPointerException;', 'array-length 遇到空引用');
            }
            registers[vA] = array.$data.length;
            pc += 1;
            break;
          }
          case 0x22: {
            const vA = (unit >>> 8) & 0xff;
            registers[vA] = this.vm.allocateObject(this.vm.registry.resolve(method.dex.types[insns[pc + 1]]));
            pc += 2;
            break;
          }
          case 0x23: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            const type = method.dex.types[insns[pc + 1]];
            registers[vA] = this.vm.newArray(type, toInt(registers[vB]));
            pc += 2;
            break;
          }
          case 0x24:
          case 0x25: {
            const args2 = [];
            let refIndex;
            let size;
            if (op === 0x24) {
              const count = unit >>> 12;
              refIndex = insns[pc + 1];
              const third = insns[pc + 2];
              if (count > 0) args2.push(registers[third & 0xf]);
              if (count > 1) args2.push(registers[(third >> 4) & 0xf]);
              if (count > 2) args2.push(registers[(third >> 8) & 0xf]);
              if (count > 3) args2.push(registers[(third >> 12) & 0xf]);
              if (count > 4) args2.push(registers[(unit >> 8) & 0xf]);
              size = 3;
            } else {
              const count = unit >>> 8;
              refIndex = insns[pc + 1];
              const start = insns[pc + 2];
              for (let i = 0; i < count; i++) args2.push(registers[start + i]);
              size = 3;
            }
            const ref = method.dex.methods[refIndex];
            const array = this.vm.newArray('[' + ref.classDesc, args2.length, null);
            for (let i = 0; i < args2.length; i++) array.$data[i] = args2[i];
            this.vm.pendingResult = array;
            pc += size;
            break;
          }
          case 0x26: {
            const vA = (unit >>> 8) & 0xff;
            const relative = insns[pc + 1] | (insns[pc + 2] << 16);
            const base = method.code.insnsStart ?? 0;
            const payloadPc = pc + (relative | 0);
            this.fillArrayData(registers[vA], method.dex.bytes, base + payloadPc * 2);
            pc += 3;
            break;
          }
          case 0x27: {
            const value = registers[unit >>> 8];
            if (value === null) this.vm.throwException('Ljava/lang/NullPointerException;', 'throw 空引用');
            throw new VMRuntimeSignal(value);
          }
          case 0x28: {
            const offset = (unit >> 8) & 0xff;
            pc += offset > 127 ? offset - 256 : offset;
            break;
          }
          case 0x29: {
            const offset = insns[pc + 1];
            pc += offset > 32767 ? offset - 65536 : offset;
            break;
          }
          case 0x2a: {
            pc += insns[pc + 1] | (insns[pc + 2] << 16);
            break;
          }
          case 0x2b: {
            const vA = (unit >>> 8) & 0xff;
            const offset = signed32((insns[pc + 1] | (insns[pc + 2] << 16)) >>> 0);
            const table = readPackedSwitch(insns, pc + offset);
            const index = toInt(registers[vA]) - table.firstKey;
            pc += index >= 0 && index < table.targets.length ? table.targets[index] : 3;
            break;
          }
          case 0x2c: {
            const vA = (unit >>> 8) & 0xff;
            const offset = signed32((insns[pc + 1] | (insns[pc + 2] << 16)) >>> 0);
            const table = readSparseSwitch(insns, pc + offset);
            const index = table.keys.indexOf(toInt(registers[vA]));
            pc += index >= 0 ? table.targets[index] : 3;
            break;
          }
          case 0x2d:
          case 0x2e:
          case 0x2f:
          case 0x30:
          case 0x31: {
            const vA = unit >>> 8;
            const vB = insns[pc + 1] & 0xff;
            const vC = insns[pc + 1] >> 8;
            const left = registers[vB];
            const right = registers[vC];
            let value;
            if (op === 0x2d) {
              const l = floatBitsToNumber(left);
              const r = floatBitsToNumber(right);
              value = Number.isNaN(l) || Number.isNaN(r) ? -1 : l > r ? 1 : l < r ? -1 : 0;
            } else if (op === 0x2e) {
              const l = floatBitsToNumber(left);
              const r = floatBitsToNumber(right);
              value = Number.isNaN(l) || Number.isNaN(r) ? 1 : l > r ? 1 : l < r ? -1 : 0;
            } else if (op === 0x2f) {
              const l = doubleBitsToNumber(left);
              const r = doubleBitsToNumber(right);
              value = Number.isNaN(l) || Number.isNaN(r) ? -1 : l > r ? 1 : l < r ? -1 : 0;
            } else if (op === 0x30) {
              const l = doubleBitsToNumber(left);
              const r = doubleBitsToNumber(right);
              value = Number.isNaN(l) || Number.isNaN(r) ? 1 : l > r ? 1 : l < r ? -1 : 0;
            } else {
              const l = toLong(left);
              const r = toLong(right);
              value = l > r ? 1 : l < r ? -1 : 0;
            }
            registers[vA] = value;
            pc += 2;
            break;
          }
          case 0x32: case 0x33: case 0x34: case 0x35: case 0x36: case 0x37: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            const offset = insns[pc + 1];
            const signed = offset > 32767 ? offset - 65536 : offset;
            const left = registers[vA] == null ? 0 : registers[vA];
            const right = registers[vB] == null ? 0 : registers[vB];
            let take;
            if (op === 0x32) take = left === right;
            else if (op === 0x33) take = left !== right;
            else if (op === 0x34) take = left < right;
            else if (op === 0x35) take = left >= right;
            else if (op === 0x36) take = left > right;
            else take = left <= right;
            pc += take ? signed : 2;
            break;
          }
          case 0x38: case 0x39: case 0x3a: case 0x3b: case 0x3c: case 0x3d: {
            const vA = (unit >>> 8) & 0xff;
            const offset = insns[pc + 1];
            const signed = offset > 32767 ? offset - 65536 : offset;
            const raw = registers[vA];
            const value = raw === null || raw === undefined ? 0 : typeof raw === 'boolean' ? (raw ? 1 : 0) : raw;
            let take;
            if (op === 0x38) take = value === 0;
            else if (op === 0x39) take = value !== 0;
            else if (op === 0x3a) take = value < 0;
            else if (op === 0x3b) take = value >= 0;
            else if (op === 0x3c) take = value > 0;
            else take = value <= 0;
            if (DBG.npe && method.name === 'g') console.error('IFZ g vA=' + vA, 'raw=' + (raw === null ? 'null' : raw === undefined ? 'undef' : typeof raw), 'value=' + (typeof value === 'object' ? 'obj' : value), 'take=' + take, 'offset=' + signed);
            pc += take ? signed : 2;
            break;
          }
          case 0x44: case 0x45: case 0x46: case 0x47: case 0x48: case 0x49: case 0x4a: {
            const vA = (unit >> 8) & 0xff;
            const vB = insns[pc + 1] & 0xff;
            const vC = (insns[pc + 1] >> 8) & 0xff;
            const array = registers[vB];
            const index = toInt(registers[vC]);
            this.checkArrayBounds(array, index, 'aget');
            registers[vA] = array.$data[index];
            pc += 2;
            break;
          }
          case 0x4b: case 0x4c: case 0x4d: case 0x4e: case 0x4f: case 0x50: case 0x51: {
            const vA = (unit >> 8) & 0xff;
            const vB = insns[pc + 1] & 0xff;
            const vC = (insns[pc + 1] >> 8) & 0xff;
            const array = registers[vB];
            const index = toInt(registers[vC]);
            this.checkArrayBounds(array, index, 'aput');
            array.$data[index] = registers[vA];
            pc += 2;
            break;
          }
          case 0x52: case 0x53: case 0x54: case 0x55: case 0x56: case 0x57: case 0x58: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            registers[vA] = this.vm.getField(registers[vB], method.dex.fields[insns[pc + 1]]);
            pc += 2;
            break;
          }
          case 0x59: case 0x5a: case 0x5b: case 0x5c: case 0x5d: case 0x5e: case 0x5f: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            this.vm.setField(registers[vB], method.dex.fields[insns[pc + 1]], registers[vA]);
            pc += 2;
            break;
          }
          case 0x60: case 0x61: case 0x62: case 0x63: case 0x64: case 0x65: case 0x66: {
            const vA = unit >>> 8;
            registers[vA] = this.vm.getStaticField(method.dex.fields[insns[pc + 1]]);
            pc += 2;
            break;
          }
          case 0x67: case 0x68: case 0x69: case 0x6a: case 0x6b: case 0x6c: case 0x6d: {
            const vA = unit >>> 8;
            this.vm.setStaticField(method.dex.fields[insns[pc + 1]], registers[vA]);
            pc += 2;
            break;
          }
          case 0x6e: case 0x6f: case 0x70: case 0x71: case 0x72:
          case 0x74: case 0x75: case 0x76: case 0x77: case 0x78: {
            const { refIndex, argRegs, size } = readInvokeArgs(op, insns, pc);
            const ref = method.dex.methods[refIndex];
            if (this.vm.dbgInvoke) this.vm.dbgInvoke(method, ref, pc, argRegs, registers, insns, this.vm);
            const rawArgs = argRegs.map((index) => registers[index]);
            const mode =
              op === 0x71 || op === 0x77 ? 'static'
              : op === 0x6f || op === 0x75 ? 'super'
              : op === 0x70 || op === 0x76 ? 'direct'
              : op === 0x72 || op === 0x78 ? 'interface'
              : 'virtual';
            let args2;
            const parameters = ref.proto?.parameters;
            if (Array.isArray(parameters)) {
              args2 = [];
              let registerIndex = 0;
              if (mode !== 'static' && registerIndex < rawArgs.length) {
                args2.push(rawArgs[registerIndex++]);
              }
              for (const parameter of parameters) {
                if (registerIndex >= rawArgs.length) break;
                args2.push(rawArgs[registerIndex]);
                registerIndex += parameter === 'J' || parameter === 'D' ? 2 : 1;
              }
            } else {
              args2 = rawArgs.slice();
            }
            const receiver = mode === 'static' ? null : args2.shift();
            this.stats.invokes++;
            try {
              if (DBG.npe && ref.name === 'longValue') console.error('INVOKE-longValue recv=' + (receiver === null ? 'NULL' : typeof receiver) + ' at ' + method.classDesc + '.' + method.name + ' pc=' + pc);
              this.vm.pendingResult = this.vm.invoke(ref, receiver, args2, mode, method);

            } catch (error) {
              if (error instanceof VMRuntimeError && error.javaException) {
                throw new VMRuntimeSignal(error.javaException);
              }
              throw error;
            }
            pc += size;
            break;
          }
          case 0x7b: case 0x7c: case 0x7d: case 0x7e: case 0x7f: case 0x80: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            const value = registers[vB];
            let r;
            if (op === 0x7b) r = (-toInt(value)) | 0;
            else if (op === 0x7c) r = ~toInt(value);
            else if (op === 0x7d) r = BigInt.asIntN(64, -toLong(value));
            else if (op === 0x7e) r = BigInt.asIntN(64, ~toLong(value));
            else r = -value;
            registers[vA] = r;
            if (op === 0x7d || op === 0x7e) registers[vA + 1] = 0;
            pc += 1;
            break;
          }
          case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x86:
          case 0x87: case 0x88: case 0x89: case 0x8a: case 0x8b: case 0x8c:
          case 0x8d: case 0x8e: case 0x8f: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            const value = registers[vB];
            let r;
            switch (op) {
              case 0x81: r = BigInt(toInt(value)); break;
              case 0x82: r = numberToFloatBits(toInt(value)); break;
              case 0x83: r = toInt(value); break;
              case 0x84: r = Number(BigInt.asIntN(32, toLong(value))); break;
              case 0x85: r = numberToFloatBits(Number(toLong(value))); break;
              case 0x86: r = Number(toLong(value)); break;
              case 0x87: r = floatBitsToNumber(value) | 0; break;
              case 0x88: r = BigInt(floatBitsToNumber(value) | 0); break;
              case 0x89: r = floatBitsToNumber(value); break;
              case 0x8a: r = doubleBitsToNumber(value) | 0; break;
              case 0x8b: r = BigInt(doubleBitsToNumber(value) | 0); break;
              case 0x8c: r = numberToFloatBits(doubleBitsToNumber(value)); break;
              case 0x8d: r = ((toInt(value) << 24) >> 24) | 0; break;
              case 0x8e: r = toInt(value) & 0xffff; break;
              case 0x8f: r = ((toInt(value) << 16) >> 16) | 0; break;
              default: r = value;
            }
            registers[vA] = r;
            if (op === 0x81 || op === 0x88 || op === 0x8b) registers[vA + 1] = 0;
            pc += 1;
            break;
          }
          case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95:
          case 0x96: case 0x97: case 0x98: case 0x99: case 0x9a:
          case 0x9b: case 0x9c: case 0x9d: case 0x9e: case 0x9f: case 0xa0:
          case 0xa1: case 0xa2: case 0xa3: case 0xa4: case 0xa5:
          case 0xa6: case 0xa7: case 0xa8: case 0xa9: case 0xaa:
          case 0xab: case 0xac: case 0xad: case 0xae: case 0xaf: {
            const vA = unit >>> 8;
            const vB = insns[pc + 1] & 0xff;
            const vC = insns[pc + 1] >> 8;
            registers[vA] = computeBinop(op, registers[vB], registers[vC]);
            pc += 2;
            break;
          }
          case 0xb0: case 0xb1: case 0xb2: case 0xb3: case 0xb4: case 0xb5:
          case 0xb6: case 0xb7: case 0xb8: case 0xb9: case 0xba:
          case 0xbb: case 0xbc: case 0xbd: case 0xbe: case 0xbf: case 0xc0:
          case 0xc1: case 0xc2: case 0xc3: case 0xc4: case 0xc5:
          case 0xc6: case 0xc7: case 0xc8: case 0xc9: case 0xca:
          case 0xcb: case 0xcc: case 0xcd: case 0xce: case 0xcf: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            registers[vA] = computeBinop(op - 0x20, registers[vA], registers[vB]);
            pc += 1;
            break;
          }
          case 0xd0: case 0xd1: case 0xd2: case 0xd3: case 0xd4: case 0xd5:
          case 0xd6: case 0xd7: {
            const vA = (unit >> 8) & 0xf;
            const vB = unit >> 12;
            const lit = insns[pc + 1];
            const signed = lit > 32767 ? lit - 65536 : lit;
            const left = op === 0xd1 ? signed : toInt(registers[vB]);
            const right = op === 0xd1 ? toInt(registers[vB]) : signed;
            registers[vA] = computeBinop(op - 0x40, left, right);
            pc += 2;
            break;
          }
          case 0xd8: case 0xd9: case 0xda: case 0xdb: case 0xdc: case 0xdd:
          case 0xde: case 0xdf: case 0xe0: case 0xe1: case 0xe2: {
            const vA = unit >>> 8;
            const vB = insns[pc + 1] & 0xff;
            const lit = (insns[pc + 1] >> 8) & 0xff;
            const signed = lit > 127 ? lit - 256 : lit;
            const left = op === 0xd9 ? signed : toInt(registers[vB]);
            const right = op === 0xd9 ? toInt(registers[vB]) : signed;
            registers[vA] = computeBinop(op - 0x48, left, right);
            pc += 2;
            break;
          }
          default:
            throw new Error(`未实现的 Dalvik 指令 0x${op.toString(16)} (${opcodeName(op)}) @${pc}`);
        }
      } catch (signal) {
        const signalException = signal instanceof VMRuntimeSignal
          ? signal.exception
          : (signal instanceof VMRuntimeError ? signal.javaException : null);
        if (signalException !== null && signalException !== undefined) {
          const handler = findHandler(handlers, pc, signalException, this.vm);
          if (handler) {
            this.vm.pendingException = signalException;
            pc = handler.address;
            continue;
          }
        }
        if (signal instanceof VMRuntimeSignal) {
          if (DBG.exc) {
            const _ex = signal.exception;
            console.error('JAVA_EXC pc=', pc, 'cls=', this.vm?.registry?.classNameOf(_ex), 'handlers=', handlers.length, 'msg=', _ex?.$exceptionMessage, 'cause=', this.vm?.registry?.classNameOf(_ex?.cause), 'keys=', _ex && typeof _ex === 'object' ? Object.keys(_ex).slice(0,6).join('|') : typeof _ex, (this.vm?.methodStack || []).slice(-18).join(' <- '));
          }
          throw new VMRuntimeError(signal.exception, signal.exception?.$exceptionMessage || '未捕获的 Java 异常');
        }
        throw signal;
      }
    }
  }

  gatherArgs(ref, argRegs, registers) {
    const params = [...(ref.proto.parameters)];
    const result = [];
    let wideUsed = 0;
    for (let i = 0; i < argRegs.length; i++) {
      const registerIndex = argRegs[i];
      const value = registers[registerIndex];
      result.push(value);
    }
    return result;
  }

  checkArrayBounds(array, index, op) {
    if (!isJavaArray(array)) { this.vm.throwException('Ljava/lang/NullPointerException;', `${op} 遇到空数组`); }
    if (index < 0 || index >= array.$data.length) {
      this.vm.throwException('Ljava/lang/ArrayIndexOutOfBoundsException;', `index ${index}, length ${array.$data.length}`);
    }
  }

  fillArrayData(array, bytes, offset) {
    if (!isJavaArray(array)) this.vm.throwException('Ljava/lang/NullPointerException;', 'fill-array-data 遇到空数组');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ident = view.getUint16(offset, true);
    if (ident !== 0x0300) this.vm.throwException('Ljava/lang/IllegalStateException;', 'fill-array-data 载荷标识无效');
    const elementWidth = view.getUint16(offset + 2, true);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    for (let i = 0; i < size && i < array.$data.length; i++) {
      const base = dataStart + i * elementWidth;
      switch (elementWidth) {
        case 1:
          array.$data[i] = array.$type === '[Z' ? view.getUint8(base) !== 0 : view.getInt8(base);
          break;
        case 2:
          array.$data[i] = view.getInt16(base, true);
          break;
        case 4:
          array.$data[i] = view.getInt32(base, true);
          break;
        case 8:
          array.$data[i] = view.getBigInt64(base, true);
          break;
        default:
          array.$data[i] = 0;
      }
    }
  }
}

class VMRuntimeSignal extends Error {
  constructor(exception) {
    super('java-throw');
    this.exception = exception;
  }
}

class ReturnSignal extends Error {
  constructor(value) {
    super('return');
    this.value = value;
  }
}

function readMove(op, insns, pc) {
  if (op === 0x04 || op === 0x07) {
    return { a: (insns[pc] >> 8) & 0xf, b: insns[pc] >> 12, size: 1 };
  }
  if (op === 0x05 || op === 0x08) {
    return { a: insns[pc] >> 8, b: insns[pc + 1], size: 2 };
  }
  return { a: insns[pc + 1], b: insns[pc + 2], size: 3 };
}

function readInvoke(op, insns, pc) {
  return { a: insns[pc + 1], size: 3, isRange: op === 0x25 };
}

function readInvokeArgs(op, insns, pc) {
  const unit = insns[pc];
  const refIndex = insns[pc + 1];
  const isRange = [0x74, 0x75, 0x76, 0x77, 0x78].includes(op);
  if (isRange) {
    const start = insns[pc + 2];
    const count = unit >>> 8;
    const argRegs = [];
    for (let i = 0; i < count; i++) argRegs.push(start + i);
    return { refIndex, argRegs, size: 3 };
  }
  const count = unit >>> 12;
  const argRegs = [];
  const third = insns[pc + 2];
  if (count > 0) argRegs.push(third & 0xf);
  if (count > 1) argRegs.push((third >> 4) & 0xf);
  if (count > 2) argRegs.push((third >> 8) & 0xf);
  if (count > 3) argRegs.push((third >> 12) & 0xf);
  if (count > 4) argRegs.push((unit >> 8) & 0xf);
  return { refIndex, argRegs, size: 3 };
}

const FLOAT_BITS_VIEW = new DataView(new ArrayBuffer(4));

function floatBitsToNumber(value) {
  if (typeof value !== 'number') return Number(value) || 0;
  FLOAT_BITS_VIEW.setInt32(0, value | 0, false);
  return FLOAT_BITS_VIEW.getFloat32(0, false);
}

function numberToFloatBits(value) {
  FLOAT_BITS_VIEW.setFloat32(0, Number(value) || 0, false);
  return FLOAT_BITS_VIEW.getInt32(0, false);
}

const DOUBLE_BITS_VIEW = new DataView(new ArrayBuffer(8));

function doubleBitsToNumber(value) {
  if (typeof value === 'bigint') {
    DOUBLE_BITS_VIEW.setBigUint64(0, BigInt.asUintN(64, value));
    return DOUBLE_BITS_VIEW.getFloat64(0);
  }
  if (typeof value !== 'number') return Number(value) || 0;
  return value;
}

function computeBinop(op, a, b) {
  switch (op) {
    case 0x90: return (toInt(a) + toInt(b)) | 0;
    case 0x91: return (toInt(a) - toInt(b)) | 0;
    case 0x92: return Math.imul(toInt(a), toInt(b));
    case 0x93: {
      const divisor = toInt(b);
      if (divisor === 0) return 0;
      return (toInt(a) / divisor) | 0;
    }
    case 0x94: {
      const divisor = toInt(b);
      if (divisor === 0) return 0;
      return (toInt(a) % divisor) | 0;
    }
    case 0x95: return toInt(a) & toInt(b);
    case 0x96: return toInt(a) | toInt(b);
    case 0x97: return toInt(a) ^ toInt(b);
    case 0x98: return toInt(a) << (toInt(b) & 0x1f);
    case 0x99: return toInt(a) >> (toInt(b) & 0x1f);
    case 0x9a: return (toInt(a) >>> (toInt(b) & 0x1f)) | 0;
    case 0x9b: return BigInt.asIntN(64, toLong(a) + toLong(b));
    case 0x9c: return BigInt.asIntN(64, toLong(a) - toLong(b));
    case 0x9d: return BigInt.asIntN(64, toLong(a) * toLong(b));
    case 0x9e: {
      const d = toLong(b);
      return d === 0n ? 0n : toLong(a) / d;
    }
    case 0x9f: {
      const d = toLong(b);
      return d === 0n ? 0n : toLong(a) % d;
    }
    case 0xa0: return toLong(a) & toLong(b);
    case 0xa1: return toLong(a) | toLong(b);
    case 0xa2: return toLong(a) ^ toLong(b);
    case 0xa3: return BigInt.asIntN(64, toLong(a) << (toLong(b) & 63n));
    case 0xa4: return BigInt.asIntN(64, toLong(a) >> (toLong(b) & 63n));
    case 0xa5: return BigInt.asIntN(64, BigInt.asUintN(64, toLong(a)) >> (toLong(b) & 63n));
    case 0xa6: return numberToFloatBits(floatBitsToNumber(a) + floatBitsToNumber(b));
    case 0xa7: return numberToFloatBits(floatBitsToNumber(a) - floatBitsToNumber(b));
    case 0xa8: return numberToFloatBits(floatBitsToNumber(a) * floatBitsToNumber(b));
    case 0xa9: { const d = floatBitsToNumber(b); return d === 0 ? 0 : numberToFloatBits(floatBitsToNumber(a) / d); }
    case 0xaa: { const d = floatBitsToNumber(b); return d === 0 ? 0 : numberToFloatBits(floatBitsToNumber(a) % d); }
    case 0xab: return doubleBitsToNumber(a) + doubleBitsToNumber(b);
    case 0xac: return doubleBitsToNumber(a) - doubleBitsToNumber(b);
    case 0xad: return doubleBitsToNumber(a) * doubleBitsToNumber(b);
    case 0xae: { const d = doubleBitsToNumber(b); return d === 0 ? 0 : doubleBitsToNumber(a) / d; }
    case 0xaf: { const d = doubleBitsToNumber(b); return d === 0 ? 0 : doubleBitsToNumber(a) % d; }
    default: return 0;
  }
}

function buildTryMap(code) {
  return code.tries.map((t) => ({
    start: t.startAddr,
    end: t.startAddr + t.insnCount,
    handlers: t.handlers,
    catchAll: t.catchAll,
  }));
}

function findHandler(handlers, pc, exception, vm) {
  for (const handler of handlers) {
    if (pc < handler.start || pc >= handler.end) continue;
    const type = exception ? vm.registry.classNameOf(exception) : null;
    for (const entry of handler.handlers) {
      if (vm.registry.isAssignable(type, entry.type)) return { address: entry.addr };
    }
    if (handler.catchAll >= 0) return { address: handler.catchAll };
  }
  return null;
}

function readPackedSwitch(insns, index) {
  const size = insns[index + 1];
  const firstKey = signed32(insns[index + 2] | (insns[index + 3] << 16));
  const targets = [];
  for (let i = 0; i < size; i++) targets.push(signed32(insns[index + 4 + i * 2] | (insns[index + 5 + i * 2] << 16)));
  return { firstKey, targets };
}

function readSparseSwitch(insns, index) {
  const size = insns[index + 1];
  const keys = [];
  const targets = [];
  for (let i = 0; i < size; i++) keys.push(signed32(insns[index + 2 + i * 2] | (insns[index + 3 + i * 2] << 16)));
  for (let i = 0; i < size; i++) targets.push(signed32(insns[index + 2 + size * 2 + i * 2] | (insns[index + 3 + size * 2 + i * 2] << 16)));
  return { keys, targets };
}

function signed32(value) {
  return value | 0;
}
