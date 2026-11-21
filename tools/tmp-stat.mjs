import fs from 'fs';
const r = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/sdk-n4.json', 'utf8'));
const wanted = process.argv.slice(3);
for (const name of wanted) {
  const c = r.find((x) => x.className === name);
  if (!c) {
    console.log('==', name, 'NOT FOUND');
    continue;
  }
  console.log('==', name, `${c.expected - c.missing.length}/${c.expected}`);
  for (const m of c.missing) console.log('   ', m);
}
