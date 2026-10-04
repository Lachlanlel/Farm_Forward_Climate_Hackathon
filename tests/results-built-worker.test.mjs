// Run after npm run build, as in the documented clean-check workflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import builtWorker from '../dist/server/index.js';
import { createWorker } from '../src/backend/worker.js';
const dataset = JSON.parse(await readFile(new URL('../src/backend/data/cdi-repository.json', import.meta.url)));
const sourceWorker = createWorker(dataset, {});
const input = { location: { latitude: -35.115, longitude: 147.3677778, displayName: 'Wagga Wagga NSW 2650' }, simulationStartDate: '2026-10-04',
  droughtIntensity: 'extreme', soilType: 'sandy', waterSupply: 'rain-fed', adaptations: { stubbleRetention: true, widerRows: true }, farmAreaHa: 100 };
const post = (server, path, body) => server.fetch(new Request(`http://test${path}`, { method: 'POST', body: JSON.stringify(body) }));
test('built Worker reproduces source Results, projection and pinned run identity', async () => {
  const projectionResponse = await post(builtWorker, '/api/simulation/project', input);
  assert.equal(projectionResponse.status, 200);
  const projection = await projectionResponse.json();
  assert.equal(projection.samples.length, 85);
  const completedRun = { ...projection.runDescriptor, completedDay: 84 };
  const builtResponse = await post(builtWorker, '/api/results', { completedRun });
  assert.equal(builtResponse.status, 200);
  const built = await builtResponse.json();
  const source = await (await post(sourceWorker, '/api/results', { completedRun })).json();
  assert.deepEqual(built, source);
  assert.ok(built.finalMetrics.finalYieldTPerHa > built.finalMetrics.referenceYieldTPerHa, 'Extreme sandy/rainfed/stubble is below the wide-row crossover');
  assert.equal(built.finalMetrics.strategyCostAud, 840);
  assert.equal(built.finalMetrics.costStatus, 'research-informed-scenario-assumption');
  assert.equal(built.finalMetrics.netBenefitAud, built.finalMetrics.grossValueProtectedAud - 840);
});
test('built frontend serves Results client/contract/components without production mock imports', async () => {
  for (const path of ['/results/', '/frontend/pages/results.js', '/frontend/services/results-client.js', '/shared/results-contract.js', '/frontend/components/results/results-format.js']) {
    const response = await builtWorker.fetch(new Request(`http://test${path}`));
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).length > 0);
  }
  const page = await (await builtWorker.fetch(new Request('http://test/frontend/pages/results.js'))).text();
  assert.match(page, /loadResults/);
  assert.doesNotMatch(page, /mockResults|results-data/);
});
