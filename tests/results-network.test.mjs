import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorker } from '../src/backend/worker.js';
import { loadResults } from '../src/frontend/services/results-client.js';
const worker = createWorker(JSON.parse(await readFile(new URL('../src/backend/data/cdi-repository.json', import.meta.url))), {});
const projected = await (await worker.fetch(new Request('https://qa.test/api/simulation/project', { method: 'POST', body: JSON.stringify({ location: { latitude: -35.115, longitude: 147.3677778 }, simulationStartDate: '2026-10-04', farmAreaHa: 50, droughtIntensity: 'moderate', soilType: 'clay', waterSupply: 'rainfed', adaptations: { stubbleRetention: true, widerRows: false } }) }))).json();
const run = { ...projected.runDescriptor, completedDay: 84 };
test('Results network errors and non-JSON hosting failures give a recoverable message', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html>Bad gateway</html>', { status: 502 });
    await assert.rejects(loadResults(run), /could not be loaded.*Refresh.*run the simulation again/i);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(loadResults(run), /could not be loaded.*Refresh.*run the simulation again/i);
  } finally { globalThis.fetch = original; }
});
test('Results request timeout ends loading; navigation cancellation remains silent', async () => {
  const original = globalThis.fetch;
  const keepAlive = setTimeout(() => {}, 200);
  try {
    globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
    await assert.rejects(loadResults(run, undefined, { timeoutMs: 10 }), /taking too long.*Refresh/i);
    const controller = new AbortController();
    const pending = loadResults(run, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  } finally { clearTimeout(keepAlive); globalThis.fetch = original; }
});
test('a delayed Results response renders the same validated backend result', async () => {
  const original = globalThis.fetch;
  try {
    const expected = await (await worker.fetch(new Request('https://qa.test/api/results', { method: 'POST', body: JSON.stringify({ completedRun: run }) }))).json();
    globalThis.fetch = async () => { await new Promise(resolve => setTimeout(resolve, 20)); return Response.json(expected); };
    assert.deepEqual(await loadResults(run, undefined, { timeoutMs: 200 }), expected);
  } finally { globalThis.fetch = original; }
});
