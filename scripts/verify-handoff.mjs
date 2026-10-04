import { readFile, writeFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', '.npm-cache', '.sites-runtime', '.data-venv', 'coverage']);
async function files(directory = root, prefix = '') {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name, absolute = path.join(directory, entry.name);
    if (ignoredDirectories.has(entry.name) && entry.isDirectory()) continue;
    if ((await lstat(absolute)).isSymbolicLink()) throw new Error(`Unexpected symlink: ${relative}`);
    if (entry.isDirectory()) found.push(...await files(absolute, relative + '/'));
    else if (relative !== 'HANDOFF_FILES.sha256' && !entry.name.endsWith('.log') && !entry.name.startsWith('.env.') && entry.name !== '.env') found.push(relative);
    else if (relative === '.env.example') found.push(relative);
  }
  return found.sort();
}
const hash = async relative => createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');
const actualFiles = await files();
if (process.argv.includes('--write')) {
  const lines = await Promise.all(actualFiles.map(async file => `${await hash(file)}  ${file}`));
  await writeFile(path.join(root, 'HANDOFF_FILES.sha256'), lines.join('\n') + '\n');
  console.log(`Recorded ${lines.length} handoff files.`);
} else {
  const lines = (await readFile(path.join(root, 'HANDOFF_FILES.sha256'), 'utf8')).trim().split(/\r?\n/);
  const expectedFiles = [];
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || match[2].includes('..') || path.isAbsolute(match[2])) throw new Error('Invalid handoff manifest entry.');
    expectedFiles.push(match[2]);
    if (await hash(match[2]) !== match[1]) throw new Error(`Handoff checksum mismatch: ${match[2]}`);
  }
  if (JSON.stringify(expectedFiles.sort()) !== JSON.stringify(actualFiles)) throw new Error('Handoff has missing, duplicate or unexpected deliverable files.');
  console.log(`PASS: all ${expectedFiles.length} handoff files match SHA-256; no extra deliverable files.`);
}
