#!/usr/bin/env node
// 静态自检：禁止将非 Android/Java 框架类名、混淆类名、单一应用特判写进运行时。
// 与 AGENTS.md 的“不要为某个具体应用写特判”“androidx/Material 在 DEX 里执行”对应。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

const FORBIDDEN_TOKENS = [
  { pattern: /\bandroidx\b/i, label: 'AndroidX 引用' },
  { pattern: /\bcom\.google(\.android)?(\.material)?\b/i, label: 'Google/Material 包名' },
  { pattern: /\bandroid\.support\b/i, label: 'support library 引用' },
  {
    pattern: /\b(RecyclerView|TabLayout|AppBarLayout|CoordinatorLayout|DrawerLayout|BottomNavigationView|TextInputLayout|FloatingActionButton|SwipeRefreshLayout|NestedScrollView|MaterialButton|MaterialCardView|MaterialShapeDrawable|ViewPager2?|ContentFrameLayout|FitWindows[A-Za-z]*|ResourceManagerInternal|checkVectorDrawableSetup)\b/,
    label: 'AndroidX/Material/应用内部类名',
  },
  {
    pattern: /\b(ru\.andr7e|deviceinfohw|SGH-I747|msm8996[a-z0-9]*|wsa881x[a-z0-9-]*|goodix_ts|bma255|ak09918|pa22c|bq25890|GT9886|Mali-G78|tashasn[a-z0-9]*)\b/i,
    label: '具体设备/应用指纹',
  },
];

// 允许的 descriptor 根包（Android 框架与标准 Java/Kotlin 运行时）。
const ALLOWED_DESCRIPTOR_PREFIXES = [
  'Landroid/', 'Ljava/', 'Ljavax/', 'Ldalvik/', 'Lorg/', 'Lkotlin/', 'Lsun/', 'Llibcore/',
];

// 混淆类名特征：descriptor 至少有一个 1-3 字符的包段（如 Lf/a/h/a;、Lq7/l;）。
const OBFUSCATED_DESCRIPTOR = /'L(?:[a-z][a-z0-9]{0,2}\/){1,4}[A-Za-z][A-Za-z0-9$]*;'/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(srcDir)) {
  const relative = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const rule of FORBIDDEN_TOKENS) {
      if (rule.pattern.test(line)) {
        violations.push({ file: relative, line: index + 1, label: rule.label, text: line.trim().slice(0, 160) });
      }
    }
    const descriptors = line.match(/'L[a-zA-Z0-9_$/]+;'/g) || [];
    for (const literal of descriptors) {
      const value = literal.slice(1, -1);
      if (!ALLOWED_DESCRIPTOR_PREFIXES.some((prefix) => value.startsWith(prefix))) {
        // 'LayoutParams;' 之类的后缀常量不是 descriptor。
        if (!value.includes('/')) continue;
        violations.push({ file: relative, line: index + 1, label: '非框架 descriptor', text: literal });
      }
    }
    if (OBFUSCATED_DESCRIPTOR.test(line)) {
      violations.push({ file: relative, line: index + 1, label: '混淆类名 descriptor', text: line.trim().slice(0, 160) });
    }
    if (relative !== 'src/runtime/debug.js' && line.includes('process.env')) {
      violations.push({ file: relative, line: index + 1, label: '浏览器运行时直接读 process.env', text: line.trim().slice(0, 160) });
    }
  });
}

if (violations.length) {
  console.error(`发现 ${violations.length} 处禁用引用：`);
  for (const item of violations) {
    console.error(`  ${item.file}:${item.line} [${item.label}] ${item.text}`);
  }
  process.exit(1);
}

console.log('check:refs ok');
