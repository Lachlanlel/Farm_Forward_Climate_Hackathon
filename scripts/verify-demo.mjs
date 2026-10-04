import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import worker from '../dist/server/index.js';

const root = new URL('../', import.meta.url);
let assetCount = 0;
async function verifyAssets(directory, prefix, excludes = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excludes.includes(entry.name)) continue;
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) await verifyAssets(file, prefix + entry.name + '/');
    else {
      const response = await worker.fetch(new Request('http://demo.test' + prefix + entry.name));
      assert.equal(response.status, 200, prefix + entry.name);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(file), prefix + entry.name);
      assetCount++;
    }
  }
}
await verifyAssets(new URL('src/frontend/public/', root), '/');
await verifyAssets(new URL('src/frontend/', root), '/frontend/', ['public', 'scene']);
await verifyAssets(new URL('src/shared/', root), '/shared/');
for (const route of ['/', '/simulation/', '/results/', '/data-attribution/', '/frontend/scene/farm-scene.js']) {
  const response = await worker.fetch(new Request('http://demo.test' + route));
  assert.equal(response.status, 200, route);
  assert.ok((await response.arrayBuffer()).byteLength > 0, route);
}
assert.equal((await worker.fetch(new Request('http://demo.test/frontend/mock/results-data.js'))).status, 404);
async function post(route, body) {
  const response = await worker.fetch(new Request('http://demo.test' + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return data;
}
const input = { location: { latitude: -35.115, longitude: 147.3677778, displayName: 'Wagga Wagga NSW 2650' }, simulationStartDate: '2026-10-04', farmAreaHa: 100, droughtIntensity: 'severe', soilType: 'clay', waterSupply: 'rainfed', adaptations: { stubbleRetention: true, widerRows: true } };
const baseline = await post('/api/cdi/baseline', input);
assert.equal(baseline.status, 'ready');
const projection = await post('/api/simulation/project', input);
assert.equal(projection.samples.length, 85);
const result = await post('/api/results', { completedRun: { ...projection.runDescriptor, completedDay: 84 } });
assert.equal(result.finalMetrics.strategyCostAud, 840);
assert.equal(result.comparisons.length, 3);
assert.ok(result.finalMetrics.netBenefitAud > 1105 && result.finalMetrics.netBenefitAud < 1107);
assert.ok(result.comparisons.find(c => c.id === 'stubble').metrics.netBenefitAud > result.finalMetrics.netBenefitAud);
console.log(`PASS: ${assetCount} served assets match source bytes, all page routes and compiled scene load, old Results fixture is absent, all three backend APIs work.`);
