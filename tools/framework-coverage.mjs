import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frameworkDir = path.join(root, 'src/framework');
const files = fs.readdirSync(frameworkDir).filter((name) => name.endsWith('.js'));
const classes = new Map();
let methodKeys = 0;
for (const file of files) {
  const source = fs.readFileSync(path.join(frameworkDir, file), 'utf8');
  for (const match of source.matchAll(/nativeDef\(\s*'([^']+)'/g)) {
    const descriptor = match[1];
    classes.set(descriptor, file);
  }
  for (const match of source.matchAll(/^\s*'([A-Za-z0-9_$<>]+\([^']*\)[^']*)'\s*:/gm)) {
    methodKeys++;
  }
}
const rows = [...classes.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([descriptor, file]) => `| \`${descriptor}\` | ${file} |`);
const output = `# Framework Coverage

> 本文件由 \`npm run docs:coverage\` 生成，请勿手工修改。

- 源文件：${files.length}
- 注册的 native 类：${classes.size}
- 方法/构造函数键（静态统计）：${methodKeys}

## Native 类清单

| Descriptor | 源文件 |
| --- | --- |
${rows.join('\n')}
`;
const zhOutput = output.replace('# Framework Coverage', '# Framework 覆盖矩阵');
const targets = [
  [path.join(root, 'docs/framework-coverage.md'), output],
  [path.join(root, 'docs/zh/framework-coverage.md'), zhOutput],
];
if (process.argv.includes('--check')) {
  let stale = false;
  for (const [target, content] of targets) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
      console.error('覆盖矩阵已过期:', path.relative(root, target));
      stale = true;
    }
  }
  if (stale) process.exit(1);
  console.log('framework coverage 已是最新');
  process.exit(0);
}
for (const [target, content] of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
console.log(`已生成 framework coverage：${classes.size} 个类，${methodKeys} 个方法键`);
