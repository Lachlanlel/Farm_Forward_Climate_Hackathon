import { ensureBaseline } from '../services/baseline-client.js';
import { loadProjection, frameAtDay } from '../services/projection-client.js';
import { mountFarmScene } from '../components/farm-scene-host.js';
import { getMockSimulationSnapshot } from '../mock/simulation-data.js';
import { createSimulatorUiState } from '../state/simulator-ui-state.js';
import { renderSimulationViewport } from '../components/simulation-viewport.js';
import { renderCDIOverview, updateCDIOverview } from '../components/cdi-overview.js';
import { renderSimulatorSettings } from '../components/simulator-settings.js';
import { renderAdaptationSolutions } from '../components/adaptation-solutions.js';
import { renderStepNavigation } from '../components/step-navigation.js';
import { appSession } from '../state/app-session.js';
import { installPageTransition } from '../transitions/page-transition.js';

const root = document.getElementById('simulation-root');
if (root) {
  const pageTransition = installPageTransition();
  const farm = window.farmForwardState?.get() ?? null;
  const snapshot = getMockSimulationSnapshot(farm);
  const ui = createSimulatorUiState(snapshot.scenario.droughtSeverity, appSession.get().simulation);
  const initial = ui.get();
  root.innerHTML = `<main class="simulation-page">
    <div class="simulation-main">
      ${renderSimulationViewport()}
      <div class="simulator-sidebar">
        <div id="official-baseline">${renderCDIOverview(appSession.get().baseline, farm?.farmLocation)}</div>
        ${renderSimulatorSettings(initial.droughtIntensity)}
        ${renderAdaptationSolutions(snapshot.strategies, initial.selectedStrategies)}
      </div>
    </div>
    ${renderStepNavigation()}
  </main>`;

  const baselineEl = root.querySelector('#official-baseline');
  const sceneElement = root.querySelector('#scene-host');
  const sceneStatus = root.querySelector('#scene-status');
  const assetStatus = root.querySelector('#scene-asset-status');
  const layerReadouts = Object.fromEntries(['topsoil', 'rootZone', 'deepSoil'].map(key => [key, root.querySelector(`#layer-${key}`)]));
  const cta = root.querySelector('#simulation-cta');
  const ctaText = cta.querySelector('.simulation-cta-text');
  const ctaArrow = cta.querySelector('.continue-arrow');
  const weekLabel = root.querySelector('#timeline-week');
  const processLabel = root.querySelector('#simulation-process');
  const scrub = root.querySelector('#simulation-scrub');
  const playback = root.querySelector('#simulation-playback');
  const restart = root.querySelector('#simulation-restart');
  const resetView = root.querySelector('#simulation-reset-view');
  let scene = null, projectionData = null, requestController = null, generation = 0, disposed = false, persisted = '', projectionError = '';
  const sceneOptions = state => ({
    farmAreaHa: Number(farm?.paddockSizeHa) || 1,
    soilType: farm?.soilType,
    droughtIntensity: state.droughtIntensity,
    waterSupply: farm?.waterSupply === 'irrigated' ? 'irrigated' : 'rainfed',
    adaptations: { stubbleRetention: state.selectedStrategies.includes('stubble-retention'), widerRows: state.selectedStrategies.includes('wider-rows') }
  });

  function display(state) {
    const ready = !!projectionData;
    const running = state.simulationStatus === 'running';
    const complete = state.simulationStatus === 'complete';
    const paused = state.simulationStatus === 'paused';
    const day = state.simulationDay;
    cta.disabled = running || !ready;
    cta.classList.toggle('is-running', running);
    ctaText.textContent = running ? 'Simulation running…' : complete ? 'View results' : paused ? 'Resume simulation' : 'Start simulation';
    ctaArrow.hidden = running;
    scrub.disabled = !ready;
    playback.disabled = !ready;
    restart.disabled = !ready;
    resetView.disabled = !scene;
    playback.textContent = running ? 'Pause' : 'Play';
    scrub.value = String(day);
    weekLabel.textContent = `Week ${(day / 7).toFixed(day === 0 || day === 84 ? 0 : 1)} of 12`;
    if (ready) {
      const frame = frameAtDay(projectionData.samples, day);
      updateCDIOverview(baselineEl, projectionData.baselineCDI, frame);
      processLabel.textContent = day === 0 ? 'Official NSW baseline' : complete ? 'End of simulation' : frame.condition;
      if (scene) {
        try {
          const presentation = scene.apply(frame, sceneOptions(state));
          if (presentation) {
            if (day > 0 && !complete) processLabel.textContent = `${paused ? 'Paused example' : 'Illustrative'} · ${presentation.process}`;
            for (const [key, element] of Object.entries(layerReadouts)) element.textContent = `${presentation.moisture[key].toFixed(2)} / 1`;
          }
        }
        catch (error) { sceneStatus.hidden = false; sceneStatus.textContent = `3D farm unavailable: ${error.message}`; }
      }
    } else if (day === 0) processLabel.textContent = projectionError ? 'Simulation unavailable' : 'Waiting for official NSW baseline';
    const persistKey = `${state.droughtIntensity}|${state.selectedStrategies.join(',')}|${state.simulationStatus}|${Math.floor(day)}`;
    if (persisted !== persistKey) {
      persisted = persistKey;
      appSession.updateSimulation({ droughtIntensity: state.droughtIntensity, selectedStrategies: state.selectedStrategies,
        status: state.simulationStatus, simulationDay: day,
        output: null,
        completedRun: complete && projectionData?.runDescriptor ? { ...projectionData.runDescriptor, completedDay: 84 } : null });
    }
  }

  ui.subscribe(display);
  display(initial);
  const loadCurrentProjection = async () => {
    const serial = ++generation;
    requestController?.abort(); requestController = new AbortController();
    projectionData = null;
    for (const element of Object.values(layerReadouts)) element.textContent = '—';
    projectionError = '';
    ui.reset();
    display(ui.get());
    const baseline = await ensureBaseline(farm?.farmLocation);
    if (serial !== generation || disposed) return;
    baselineEl.innerHTML = renderCDIOverview(baseline, farm?.farmLocation);
    if (baseline.status !== 'ready' || !baseline.baselineCDI?.official) {
      projectionError = 'Official NSW CDI data is unavailable for this location. Try another location or return later.';
      sceneStatus.hidden = false;
      sceneStatus.textContent = projectionError;
      display(ui.get());
      return;
    }
    try {
      const state = ui.get();
      const options = sceneOptions(state);
      const result = await loadProjection({ location: farm.farmLocation,
        simulationStartDate: appSession.get().simulationStartDate,
        droughtIntensity: state.droughtIntensity, soilType: farm.soilType,
        waterSupply: farm.waterSupply, adaptations: options.adaptations,
        farmAreaHa: farm.paddockSizeHa }, requestController.signal);
      if (serial !== generation || disposed) return;
      projectionData = result;
      if (scene) sceneStatus.hidden = true;
      if (scene) scene.setTrajectory(serial, result.samples, options);
      display(ui.get());
    } catch (error) {
      if (error.name === 'AbortError' || serial !== generation || disposed) return;
      projectionError = error.message;
      sceneStatus.hidden = false;
      sceneStatus.textContent = projectionError;
      display(ui.get());
    }
  };

  if (farm?.farmLocation && Number(farm.paddockSizeHa) >= 1 && Number(farm.paddockSizeHa) <= 10000 && ['sandy', 'clay'].includes(farm.soilType) && ['rain-fed', 'irrigated'].includes(farm.waterSupply)) {
    void mountFarmScene(sceneElement, Number(farm.paddockSizeHa), status => {
      if (status === 'ready') sceneStatus.hidden = !!projectionError ? false : true;
      else { sceneStatus.hidden = false; sceneStatus.textContent = '3D view unavailable; projected indicators still work.'; }
    }, message => { assetStatus.textContent = message; assetStatus.hidden = !message; }).then(instance => {
      if (disposed) { instance.dispose(); return; }
      scene = instance;
      if (projectionData) scene.setTrajectory(generation, projectionData.samples, sceneOptions(ui.get()));
      display(ui.get());
    }).catch(error => { sceneStatus.hidden = false; sceneStatus.textContent = `3D view unavailable: ${error.message}`; });
    void loadCurrentProjection();
  } else {
    sceneStatus.textContent = 'Complete Farm Setup to start the simulator.';
    void ensureBaseline(farm?.farmLocation).then(state => { baselineEl.innerHTML = renderCDIOverview(state, farm?.farmLocation); });
  }

  root.querySelector('#simulation-previous').addEventListener('click', () => pageTransition.navigate('/'));
  cta.addEventListener('click', () => {
    const state = ui.get();
    if (state.simulationStatus === 'complete') pageTransition.navigate('/results/');
    else if (projectionData) ui.startSimulation();
  });
  playback.addEventListener('click', () => {
    const state = ui.get();
    if (state.simulationStatus === 'running') ui.pause();
    else if (projectionData) ui.startSimulation();
  });
  restart.addEventListener('click', () => ui.reset());
  resetView.addEventListener('click', () => scene?.resetView());
  scrub.addEventListener('input', () => ui.seek(Number(scrub.value)));
  root.querySelectorAll('input[name="droughtIntensity"]').forEach(input => input.addEventListener('change', () => { ui.setDroughtIntensity(input.value); void loadCurrentProjection(); }));
  root.querySelectorAll('input[name="adaptationStrategy"]').forEach(input => input.addEventListener('change', () => {
    ui.toggleStrategy(input.value);
    scene?.setAdaptations(sceneOptions(ui.get()).adaptations);
    void loadCurrentProjection();
  }));
  window.addEventListener('pagehide', () => { disposed = true; generation++; requestController?.abort(); ui.dispose(); scene?.dispose(); }, { once: true });

  const infoButton = root.querySelector('#drought-info');
  const tooltip = root.querySelector('#drought-tooltip');
  const infoWrap = infoButton.parentElement;
  let lastPointerType = '';
  const setTooltipOpen = open => { tooltip.hidden = !open; infoButton.setAttribute('aria-expanded', String(open)); };
  infoButton.addEventListener('pointerdown', event => { lastPointerType = event.pointerType; });
  infoWrap.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') setTooltipOpen(true); });
  infoWrap.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch' && !infoButton.matches(':focus-visible')) setTooltipOpen(false); });
  infoButton.addEventListener('focus', () => { if (lastPointerType !== 'touch') setTooltipOpen(true); });
  infoButton.addEventListener('blur', () => setTooltipOpen(false));
  infoButton.addEventListener('click', () => { if (lastPointerType === 'touch') setTooltipOpen(tooltip.hidden); lastPointerType = ''; });
  document.addEventListener('pointerdown', event => { if (!infoWrap.contains(event.target)) setTooltipOpen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setTooltipOpen(false); });
}
