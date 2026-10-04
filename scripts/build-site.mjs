import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
const root = new URL('../', import.meta.url);
const assets = {};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
async function collect(directory, prefix, excludes = []) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (excludes.includes(item.name)) continue;
    const file = new URL(item.name + (item.isDirectory() ? '/' : ''), directory);
    if (item.isDirectory()) await collect(file, prefix + item.name + '/');
    else assets[prefix + item.name] = { type: mime[extname(item.name)] || 'application/octet-stream', body: (await readFile(file)).toString('base64') };
  }
}
await collect(new URL('src/frontend/public/', root), '/');
await collect(new URL('src/frontend/', root), '/frontend/', ['public', 'scene']);
await collect(new URL('src/shared/', root), '/shared/');
const sceneBundle = await esbuild({ entryPoints: [fileURLToPath(new URL('src/frontend/scene/index.ts', root))], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, write: false, loader: { '.json': 'json' } });
assets['/frontend/scene/farm-scene.js'] = { type: mime['.js'], body: Buffer.from(sceneBundle.outputFiles[0].contents).toString('base64') };
// Bundle actual backend imports, including typed Results modules, instead of
// stripping export keywords (which would also damage JSDoc import types).
const backendBundle = await esbuild({ stdin: { contents: `import { createWorker } from './src/backend/worker.js';
const dataset = ${await readFile(new URL('src/backend/data/cdi-repository.json', root), 'utf8')};
const assets = ${JSON.stringify(assets)};
export default createWorker(dataset, assets);`, resolveDir: fileURLToPath(root) }, bundle: true, write: false,
  format: 'esm', platform: 'neutral', target: 'es2022', minify: true });
const code = backendBundle.outputFiles[0].text;
await rm(new URL('dist/', root), { recursive: true, force: true });
await mkdir(new URL('dist/server/', root), { recursive: true });
await mkdir(new URL('dist/.openai/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root), code);
await writeFile(new URL('dist/.openai/hosting.json', root), await readFile(new URL('.openai/hosting.json', root)));
console.log(`Built frontend assets + backend worker. Compressed worker: ${(gzipSync(code).length / 1048576).toFixed(2)} MiB`);
