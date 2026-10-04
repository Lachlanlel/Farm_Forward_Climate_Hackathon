import { deepFreeze, sydneyDate } from '../../shared/baseline-contract.js';
import { availableSelections } from '../components/results/comparison-selection.js';
const storageKey = 'farm-forward:experience:v1';
const defaults = {
  simulationStartDate: null,
  baseline: { status: 'idle', locationKey: null, baselineCDI: null, official: false },
  simulation: {
    droughtIntensity: 'severe',
    selectedStrategies: ['stubble-retention'],
    status: 'idle',
    output: null,
    completedRun: null
  },
  results: { step: 0, selectedStrategies: [] }
};

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || typeof saved !== 'object') return structuredClone(defaults);
    const simulation = { ...defaults.simulation, ...saved.simulation };
    if (simulation.status === 'running' && !Number.isFinite(simulation.completesAt)) simulation.status = 'idle';
    if (!Array.isArray(simulation.selectedStrategies)) simulation.selectedStrategies = [...defaults.simulation.selectedStrategies];
    const results = { ...defaults.results, ...saved.results };
    if (![0, 1, 2, 3].includes(results.step)) results.step = 0;
    // Migrate the former single selection; preserve every valid alternative.
    results.selectedStrategies = availableSelections(saved.results?.selectedStrategies ?? [saved.results?.comparisonStrategy], simulation.completedRun?.scenario?.adaptations);
    delete results.comparisonStrategy;
    const baseline = { ...defaults.baseline, ...saved.baseline };
    if (baseline.status === 'loading') baseline.status = 'idle';
    if (baseline.status === 'ready' && (!baseline.baselineCDI?.official || !baseline.baselineCDI?.snapshotDate)) Object.assign(baseline, defaults.baseline);
    return { simulation, results, baseline, simulationStartDate: saved.simulationStartDate || null };
  } catch { return structuredClone(defaults); }
}

let current = read();
const snapshot = () => deepFreeze(structuredClone(current));
const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(current)); } catch { /* In-memory state still works. */ } };

export const appSession = Object.freeze({
  get: snapshot,
  beginJourney() {
    if (!current.simulationStartDate) { current.simulationStartDate = sydneyDate(); save(); }
    return current.simulationStartDate;
  },
  setBaseline(baseline) {
    current = { ...current, baseline: structuredClone(baseline) };
    save();
    return snapshot();
  },
  finishSession() {
    // Keep the farm and chosen scenario; only the completed run starts afresh.
    current = {
      simulationStartDate: null,
      baseline: structuredClone(defaults.baseline),
      simulation: { ...current.simulation, status: 'idle', simulationDay: 0, output: null, completedRun: null, completesAt: null },
      results: structuredClone(defaults.results)
    };
    save();
    return snapshot();
  },
  updateSimulation(patch) {
    if (patch.status && patch.status !== 'complete') patch = { ...patch, completedRun: null };
    current = { ...current, simulation: { ...current.simulation, ...patch } };
    save();
    return snapshot();
  },
  updateResults(patch) {
    const results = { ...current.results, ...patch };
    results.selectedStrategies = availableSelections(results.selectedStrategies, current.simulation.completedRun?.scenario?.adaptations);
    current = { ...current, results };
    save();
    return snapshot();
  }
});
