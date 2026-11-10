import fs from 'node:fs';

const allowed = new Set([
  'Landroid/graphics/drawable/Drawable;',
  'Landroid/graphics/drawable/ColorDrawable;',
  'Landroid/graphics/drawable/GradientDrawable;',
  'Landroid/graphics/drawable/RippleDrawable;',
  'Ljava/lang/reflect/Constructor;',
  'Ljava/lang/reflect/Method;',
  'Ljava/lang/reflect/Field;',
  'Ljava/util/Map;',
  'Ljava/lang/Runtime;',
  'Ljava/io/InputStream;',
]);
const counts = new Map();
for (const file of fs.readdirSync('src/framework').filter((name) => name.endsWith('.js'))) {
  const source = fs.readFileSync(`src/framework/${file}`, 'utf8');
  for (const match of source.matchAll(/nativeDef\(\s*'([^']+)'/g)) {
    const descriptor = match[1];
    counts.set(descriptor, (counts.get(descriptor) || 0) + 1);
  }
}
const unexpected = [...counts].filter(([descriptor, count]) => count > 1 && !allowed.has(descriptor));
if (unexpected.length) {
  console.error('发现未登记的重复 native 类:', unexpected);
  process.exit(1);
}
console.log('native duplicates OK');
