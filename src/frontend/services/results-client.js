import { validateCompletedRun, validateResultsResponse } from '../../shared/results-contract.js';

export async function loadResults(completedRun, signal, { timeoutMs = 30000 } = {}) {
  validateCompletedRun(completedRun);
  const timeout = AbortSignal.timeout(timeoutMs);
  let response, body;
  try {
    response = await fetch('/api/results', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({ completedRun })
    });
    body = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new Error('Results are taking too long to load. Refresh to retry, or return to the simulation.');
    throw new Error('Results could not be loaded. Refresh to retry, or run the simulation again.');
  }
  if (!response.ok) throw new Error(body.detail || 'Results are unavailable. Run the simulation again.');
  validateResultsResponse(body);
  return body;
}
