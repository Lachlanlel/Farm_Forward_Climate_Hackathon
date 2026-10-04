import { createCdiRepository } from './data/cdi-repository.js';
import { lookupBaseline } from './services/cdi-lookup-service.js';
import { projectScenario, sampleProjection, projectedCondition } from './simulation/project-scenario.js';
import { createRunDescriptor, calculateRunResults } from './results/results-service.js';
import { ResultsError } from '../shared/results-contract.js';

export function createWorker(dataset, assets) {
  const repository = createCdiRepository(dataset);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === '/api/cdi/baseline') {
        if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
        if (Number(request.headers.get('content-length') || 0) > 10000) return json({ error: 'request-too-large' }, 413);
        try {
          const text = await request.text();
          if (text.length > 10000) return json({ error: 'request-too-large' }, 413);
          return json(lookupBaseline(repository, JSON.parse(text)));
        } catch { return json({ status: 'unavailable', official: false, baselineCDI: null, reason: 'invalid-request' }, 400); }
      }
      if (url.pathname === '/api/simulation/project') {
        if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
        try {
          const text = await request.text();
          if (text.length > 10000) return json({ error: 'request-too-large' }, 413);
          const input = JSON.parse(text);
          const baselineState = lookupBaseline(repository, { location: input.location, simulationStartDate: input.simulationStartDate });
          if (baselineState.status !== 'ready') return json({ error: 'official-baseline-unavailable', reason: baselineState.reason }, 422);
          const projection = projectScenario({ ...input, baselineCDI: baselineState.baselineCDI });
          const samples = Array.from({ length: 85 }, (_, day) => {
            const frame = sampleProjection(projection, day);
            return { ...frame, condition: day === 0 ? baselineState.baselineCDI.cdiPhase : projectedCondition(frame) };
          });
          const runDescriptor = input.farmAreaHa === undefined ? null : await createRunDescriptor(baselineState.baselineCDI, projection, input.farmAreaHa);
          return json({ baselineCDI: baselineState.baselineCDI, projection, samples, runDescriptor });
        } catch (error) { return json({ error: 'invalid-simulation-request', detail: String(error.message || error) }, 400); }
      }
      if (url.pathname === '/api/results') {
        if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
        try {
          const text = await request.text();
          if (text.length > 10000) return json({ error: 'request-too-large' }, 413);
          const input = JSON.parse(text);
          return json(await calculateRunResults(repository, input?.completedRun));
        } catch (error) {
          if (error instanceof ResultsError) return json({ error: error.code, detail: error.message }, error.status);
          if (error instanceof SyntaxError) return json({ error: 'invalid-results-request', detail: 'Results request must be valid JSON.' }, 400);
          console.error('Results service failed', error);
          return json({ error: 'results-unavailable', detail: 'Results could not be calculated. No demo values have been substituted.' }, 500);
        }
      }
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      const path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname;
      const asset = assets[path];
      if (!asset) return new Response('Not found', { status: 404 });
      const bytes = Uint8Array.from(atob(asset.body), char => char.charCodeAt(0));
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: { 'content-type': asset.type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' } });
    }
  };
}
