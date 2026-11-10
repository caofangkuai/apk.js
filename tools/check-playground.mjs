import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync('playground.html', 'utf8');
const ids = new Set([...source.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const refs = [...source.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1]);
const missing = [...new Set(refs)].filter((id) => !ids.has(id));
if (missing.length) {
  console.error('playground.html 引用了不存在的元素:', missing);
  process.exit(1);
}
for (const [index, match] of [...source.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].entries()) {
  const file = path.join(os.tmpdir(), `playground-inline-${process.pid}-${index}.mjs`);
  fs.writeFileSync(file, match[1]);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  fs.unlinkSync(file);
  if (result.status !== 0) {
    console.error('playground inline module 语法错误:', result.stderr);
    process.exit(1);
  }
}
console.log('playground DOM refs OK', { ids: ids.size, refs: new Set(refs).size });
