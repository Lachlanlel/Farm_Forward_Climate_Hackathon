const severities = new Set(['moderate', 'severe', 'extreme']);
const strategyIds = new Set(['stubble-retention', 'wider-rows']);
const DURATION_DAYS = 84;
const PLAYBACK_MS = 24000;

// One application clock owns simulationDay. Scene and indicators use this same value.
export function createSimulatorUiState(initialSeverity = 'severe', saved = {}) {
  const savedStatus = saved.status === 'complete' ? 'complete' : saved.status === 'running' || saved.status === 'paused' ? 'paused' : 'idle';
  let state = {
    droughtIntensity: severities.has(saved.droughtIntensity) ? saved.droughtIntensity : severities.has(initialSeverity) ? initialSeverity : 'severe',
    selectedStrategies: new Set(Array.isArray(saved.selectedStrategies) ? saved.selectedStrategies.filter(id => strategyIds.has(id)) : ['stubble-retention']),
    simulationStatus: savedStatus,
    simulationDay: savedStatus === 'complete' ? DURATION_DAYS : Math.min(DURATION_DAYS, Math.max(0, Number(saved.simulationDay) || 0))
  };
  const listeners = new Set();
  let raf = 0, originTime = 0, originDay = 0;
  const snapshot = () => ({ droughtIntensity: state.droughtIntensity, selectedStrategies: [...state.selectedStrategies], simulationStatus: state.simulationStatus, simulationDay: state.simulationDay });
  const notify = () => listeners.forEach(listener => listener(snapshot()));
  const stopClock = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const tick = now => {
    state.simulationDay = Math.min(DURATION_DAYS, originDay + (now - originTime) * DURATION_DAYS / PLAYBACK_MS);
    if (state.simulationDay >= DURATION_DAYS) { state.simulationStatus = 'complete'; raf = 0; }
    notify();
    if (state.simulationStatus === 'running') raf = requestAnimationFrame(tick);
  };
  const run = () => { stopClock(); originTime = performance.now(); originDay = state.simulationDay; state.simulationStatus = 'running'; notify(); raf = requestAnimationFrame(tick); };
  const reset = () => { stopClock(); state.simulationStatus = 'idle'; state.simulationDay = 0; notify(); };
  return Object.freeze({
    get: snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setDroughtIntensity(value) { if (severities.has(value) && value !== state.droughtIntensity) { state.droughtIntensity = value; reset(); } },
    toggleStrategy(id) { if (!strategyIds.has(id)) return; const next = new Set(state.selectedStrategies); if (next.has(id)) next.delete(id); else next.add(id); state.selectedStrategies = next; reset(); },
    startSimulation() { if (state.simulationStatus === 'idle' || state.simulationStatus === 'complete') { state.simulationDay = 0; run(); } else if (state.simulationStatus === 'paused') run(); },
    pause() { if (state.simulationStatus !== 'running') return; stopClock(); state.simulationStatus = 'paused'; notify(); },
    resume() { if (state.simulationStatus === 'paused') run(); },
    seek(day) {
      if (!Number.isFinite(day)) return;
      state.simulationDay = Math.min(DURATION_DAYS, Math.max(0, day));
      if (state.simulationDay >= DURATION_DAYS) { stopClock(); state.simulationStatus = 'complete'; }
      else if (state.simulationStatus === 'running') { originTime = performance.now(); originDay = state.simulationDay; }
      else state.simulationStatus = state.simulationDay === 0 ? 'idle' : 'paused';
      notify();
    },
    reset,
    dispose() { stopClock(); listeners.clear(); }
  });
}
