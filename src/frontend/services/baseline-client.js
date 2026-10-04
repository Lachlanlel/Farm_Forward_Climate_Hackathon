import { appSession } from '../state/app-session.js';
import { locationKey } from '../../shared/baseline-contract.js';
let pending = null;
let requestController = null;
let generation = 0;

export function invalidateLocation(location) {
  const key = locationKey(location);
  const state = appSession.get();
  if (state.baseline.locationKey === key) return;
  generation++;
  requestController?.abort();
  pending = null;
  appSession.setBaseline({ status: 'idle', locationKey: key, baselineCDI: null, official: false });
  appSession.updateSimulation({ status: 'idle', output: null });
}

export function ensureBaseline(location) {
  invalidateLocation(location);
  const session = appSession.get();
  if (!locationKey(location)) return Promise.resolve(session.baseline);
  if (session.baseline.status === 'ready') return Promise.resolve(session.baseline);
  if (pending) return pending;
  const startDate = appSession.beginJourney();
  const key = locationKey(location);
  const serial = ++generation;
  requestController = new AbortController();
  appSession.setBaseline({ status: 'loading', locationKey: key, baselineCDI: null, official: false });
  pending = (async () => {
    let result;
    try {
      const response = await fetch('/api/cdi/baseline', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, simulationStartDate: startDate }), signal: requestController.signal
      });
      if (!response.ok) throw new Error('lookup-failed');
      result = await response.json();
    } catch (error) {
      if (error.name === 'AbortError') return appSession.get().baseline;
      result = { status: 'unavailable', reason: 'lookup-failed', official: false, baselineCDI: null };
    }
    // An older request can never replace the newly selected location.
    if (serial !== generation || appSession.get().baseline.locationKey !== key) return appSession.get().baseline;
    appSession.setBaseline({ ...result, locationKey: key });
    pending = null;
    return appSession.get().baseline;
  })();
  return pending;
}
