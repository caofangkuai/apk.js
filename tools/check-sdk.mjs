#!/usr/bin/env node
/**
 * 对比 android.jar（Robolectric android-all）与宿主类实现，列出缺失的方法签名。
 *
 * 用法：
 *   node tools/check-sdk.mjs [--jar=/path/android-all.jar] [--all] [--json=out.json]
 *
 * 默认从 ANDROID_ALL_JAR 或 /tmp/sdk/android-all.jar 读取；文件不存在时直接跳过，
 * 因此可以安全地放进本地流程，不依赖网络。
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { buildFrameworkDefinitions } from '../src/framework/registry.js';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const ACC_PUBLIC = 0x0001;
const ACC_PROTECTED = 0x0004;
const ACC_STATIC = 0x0008;
const ACC_SYNTHETIC = 0x1000;
const ACC_BRIDGE = 0x0040;
const ACC_ABSTRACT = 0x0400;

function parseArgs(argv) {
  const options = { jar: process.env.ANDROID_ALL_JAR || '/tmp/sdk/android-all.jar', all: false, json: null };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--jar=')) options.jar = arg.slice(6);
    else if (arg.startsWith('--json=')) options.json = arg.slice(7);
    else if (arg === '--all') options.all = true;
  }
  return options;
}

/** 解析 class 文件，返回类名与 public/protected 方法签名。 */
function parseClass(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  const poolCount = view.getUint16(offset);
  offset += 2;
  const utf8 = new Array(poolCount).fill(null);
  const classNames = new Array(poolCount).fill(0);
  for (let i = 1; i < poolCount; i++) {
    const tag = bytes[offset++];
    if (tag === 1) {
      const length = view.getUint16(offset);
      offset += 2;
      utf8[i] = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(offset, offset + length));
      offset += length;
    } else if (tag === 7) {
      classNames[i] = view.getUint16(offset);
      offset += 2;
    } else if (tag === 3 || tag === 4 || tag === 9 || tag === 10 || tag === 11 || tag === 12 || tag === 17 || tag === 18) {
      offset += 4;
    } else if (tag === 5 || tag === 6) {
      offset += 8;
      i++;
    } else if (tag === 8 || tag === 16 || tag === 19 || tag === 20) {
      offset += 2;
    } else if (tag === 15) {
      offset += 3;
    } else {
      return null;
    }
  }
  offset += 2;
  const thisClass = view.getUint16(offset);
  offset += 4;
  const interfaceCount = view.getUint16(offset);
  offset += 2 + interfaceCount * 2;
  const name = utf8[classNames[thisClass]] ?? null;
  const skipAttributes = () => {
    const length = view.getUint32(offset + 2);
    offset += 6 + length;
  };
  const skipMembers = () => {
    const count = view.getUint16(offset);
    offset += 2;
    for (let i = 0; i < count; i++) {
      offset += 6;
      const attributes = view.getUint16(offset);
      offset += 2;
      for (let a = 0; a < attributes; a++) skipAttributes();
    }
  };
  skipMembers();
  const methodCount = view.getUint16(offset);
  offset += 2;
  const methods = [];
  for (let i = 0; i < methodCount; i++) {
    const flags = view.getUint16(offset);
    const nameIndex = view.getUint16(offset + 2);
    const descriptorIndex = view.getUint16(offset + 4);
    offset += 6;
    const attributes = view.getUint16(offset);
    offset += 2;
    for (let a = 0; a < attributes; a++) skipAttributes();
    methods.push({ flags, name: utf8[nameIndex], descriptor: utf8[descriptorIndex] });
  }
  return { name, methods };
}

function ownSignatures(def, byDescriptor) {
  const set = new Set();
  for (const key of def.methods.keys()) set.add(key);
  for (const key of def.staticMethods.keys()) set.add(key);
  let superDescriptor = def.superDescriptor;
  const visited = new Set([def.descriptor]);
  while (superDescriptor && byDescriptor.has(superDescriptor) && !visited.has(superDescriptor)) {
    visited.add(superDescriptor);
    const parent = byDescriptor.get(superDescriptor);
    for (const key of parent.methods.keys()) set.add(key);
    for (const key of parent.staticMethods.keys()) set.add(key);
    superDescriptor = parent.superDescriptor;
  }
  return set;
}

async function main() {
  const options = parseArgs(process.argv);
  if (!fs.existsSync(options.jar)) {
    console.log(`sdk coverage skipped: 未找到 ${options.jar}（可用 --jar= 指定）`);
    return;
  }
  const defs = buildFrameworkDefinitions({});
  const byDescriptor = new Map();
  for (const def of defs) byDescriptor.set(def.descriptor, def);

  const archive = await JSZip.loadAsync(fs.readFileSync(options.jar));
  const available = new Set();
  archive.forEach((relativePath, entry) => {
    if (!entry.dir && relativePath.endsWith('.class')) available.add(relativePath);
  });

  const report = [];
  const absent = [];
  let totalMissing = 0;
  let totalExpected = 0;
  for (const def of defs) {
    const className = def.descriptor.slice(1, -1);
    const entry = `${className}.class`;
    if (!available.has(entry)) {
      if (className.startsWith('android/') || className.startsWith('java/') || className.startsWith('javax/')) {
        absent.push(className);
      }
      continue;
    }
    const parsed = parseClass(await archive.file(entry).async('uint8array'));
    if (!parsed) continue;
    const implemented = ownSignatures(def, byDescriptor);
    const missing = [];
    let expected = 0;
    for (const method of parsed.methods) {
      if (!method.name || !method.descriptor) continue;
      if (method.name === '<clinit>') continue;
      if (method.flags & ACC_SYNTHETIC || method.flags & ACC_BRIDGE) continue;
      if (!(method.flags & (ACC_PUBLIC | ACC_PROTECTED))) continue;
      expected++;
      const signature = `${method.name}${method.descriptor}`;
      if (implemented.has(signature)) continue;
      missing.push(`${signature}${method.flags & ACC_STATIC ? ' [static]' : ''}${method.flags & ACC_ABSTRACT ? ' [abstract]' : ''}`);
    }
    totalExpected += expected;
    totalMissing += missing.length;
    report.push({ className, expected, missing });
  }

  report.sort((a, b) => b.missing.length - a.missing.length);
  console.log(`sdk classes: 已实现 ${report.length} 个 / android-all ${available.size} 个 class`);
  console.log(`方法覆盖: ${totalExpected - totalMissing}/${totalExpected}，缺失 ${totalMissing}`);
  if (absent.length) console.log(`android-all 中不存在（隐藏类或内部类）: ${absent.length}`);
  console.log('\n缺失最多的类:');
  for (const item of report.slice(0, 25)) {
    console.log(`  ${item.className}: ${item.missing.length}/${item.expected}`);
  }
  if (options.all) {
    console.log('\n全部缺失签名:');
    for (const item of report) {
      if (!item.missing.length) continue;
      console.log(`- ${item.className}`);
      for (const signature of item.missing) console.log(`    ${signature}`);
    }
  }
  if (options.json) {
    fs.writeFileSync(options.json, JSON.stringify(report, null, 2));
    console.log(`\n报告已写入 ${options.json}`);
  }
}

await main();
