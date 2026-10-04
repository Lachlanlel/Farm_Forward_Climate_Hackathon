import { validateCompletedRun, validateResultsResponse } from '../../shared/results-contract.js';

export async function loadResults(completedRun, signal) {
  validateCompletedRun(completedRun);
  const response = await fetch('/api/results', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ completedRun })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || 'Results are unavailable. Run the simulation again.');
  validateResultsResponse(body);
  return body;
}
