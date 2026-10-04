// Thin DOM host for the supplied FarmScene class. Presentation mappings below
// are illustrative proxies from projected scores, not physical water balances.

export async function mountFarmScene(container, farmAreaHa, onStatus, onAssetIssue = () => {}) {
  const { FarmScene, createWaterPlayback, createCrackPlayback, conditionPresentation } = await import('/frontend/scene/farm-scene.js');
  const issues = new Map();
  const report = (key, message) => {
    if (message) issues.set(key, message); else issues.delete(key);
    onAssetIssue([...issues.values()].join(' '));
  };
  const scene = new FarmScene(container, { farmAreaHa }, onStatus,
    status => report('wheat', status === 'fallback' ? 'Simplified wheat shown: detailed crop asset unavailable.' : ''),
    status => report('roots', status === 'unavailable' ? 'Root illustration unavailable.' : ''),
    status => report('moisture', status === 'material-only' ? 'Soil wetness colours shown; moving moisture fields unavailable.' : ''),
    undefined,
    status => report('stubble', status === 'fallback' ? 'Simplified stubble shown: detailed residue asset unavailable.' : ''));
  let trajectoryKey = null;
  let waterPlayback = null, crackPlayback = null, intervalKey = null;
  let baseline = null;
  return {
    setConfig(area) { scene.setConfig({ farmAreaHa: area }); },
    setAdaptations(adaptations) { scene.setAdaptations(adaptations); },
    setTrajectory(key, samples, options) {
      if (trajectoryKey === key) return;
      trajectoryKey = key;
      baseline = { ...samples[0] };
      scene.setConfig({ farmAreaHa: options.farmAreaHa });
      scene.setAdaptations(options.adaptations);
      scene.setSoilAppearance({ soilType: options.soilType, surfaceCrackSeverity: 0 });
      waterPlayback = createWaterPlayback(samples, options);
      crackPlayback = createCrackPlayback(waterPlayback, options.soilType);
      intervalKey = null;
    },
    apply(frame, options) {
      const progress = frame.simulationDay / 84;
      if (!baseline) return;
      let presentation = null;
      const { rootStress, plantStress } = conditionPresentation(frame, baseline);
      const crackSeverity = crackPlayback.at(frame.simulationDay);
      scene.setSoilAppearance({ soilType: options.soilType, surfaceCrackSeverity: crackSeverity });
      scene.setRootPresentation({ rootReveal: 1, rootSenescence: rootStress, layerAccess: { topsoil: true, rootZone: true, deepSoil: true } });
      scene.setCropPresentation({ cropDevelopment: .48 + .48 * progress, cropStress: plantStress }, true);
      if (waterPlayback) {
        const waterFrame = waterPlayback.at(frame.simulationDay);
        presentation = waterFrame;
        if (intervalKey !== waterFrame.key) {
          scene.setMoistureTransport(waterFrame.transport, true);
          intervalKey = waterFrame.key;
        }
        scene.setMoistureSimulationTime(frame.simulationDay);
        // Apply last: replacing/seeking moisture may update water presentation.
        scene.setWaterSourceFrame(waterFrame.water);
        container.dataset.waterPlayback = JSON.stringify({ event: waterFrame.event,
          moisture: waterFrame.moisture, refillLevel: waterPlayback.refillLevel,
          evaporation: waterFrame.evaporation,
          surfaceCrackSeverity: crackSeverity,
          events: waterPlayback.events,
          authority: 'illustrative scheduling and crack response; model scores unchanged' });
      }
      container.dataset.simulationDay = frame.simulationDay.toFixed(2);
      return presentation;
    },
    resetView() { scene.resetView(); },
    dispose() { scene.dispose(); }
  };
}
