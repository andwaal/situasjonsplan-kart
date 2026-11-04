import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = new URL('../src/kommuner.json', import.meta.url);
const targetDir = new URL('../public/', import.meta.url);
const target = new URL('../public/kommune.json', import.meta.url);

const payload = JSON.parse(await readFile(source, 'utf8'));
if (!Array.isArray(payload) || payload.length === 0) {
  throw new Error('src/kommuner.json must contain a non-empty array');
}
for (const row of payload) {
  if (
    !row ||
    !/^\d{4}$/.test(String(row.nummer)) ||
    typeof row.navn !== 'string' ||
    !row.navn
  ) {
    throw new Error('src/kommuner.json contains an invalid municipality');
  }
}

await mkdir(targetDir, { recursive: true });
await writeFile(target, `${JSON.stringify(payload)}\n`);
console.log(`Wrote ${payload.length} municipalities to public/kommune.json`);
