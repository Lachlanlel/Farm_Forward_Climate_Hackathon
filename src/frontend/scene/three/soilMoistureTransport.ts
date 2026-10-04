import { SOIL_LAYERS } from './visualTokens';
import { resolveRootPresentation, type RootPresentationState } from './rootPresentation';
import { validateMoisturePresentation, MOISTURE_TRANSPORT_DISPLAY, type SoilMoisture, type SoilMoisturePresentationState,
  type MoistureLayerId, type MoistureTransportCue, type MoistureSimulationTiming,
  type MoistureTrajectorySample, type MoistureActivitySample, type MoistureTransportChannel } from './soilMoisturePresentation';

/** Optional model fluxes. Units/conversion and all water accounting belong to
 * the caller. Positive presence qualifies a causal cue; an explicit reference
 * rate can additionally map relative magnitudes into restrained activity. It
 * never integrates these numbers or treats them as visual water reservoirs. */
export interface MoistureFluxes {
  rainfallInput?: number; irrigationInput?: number; evaporationLoss?: number;
  topToRoot?: number; rootToDeep?: number; rootToTop?: number; deepToRoot?: number;
  bottomDrainage?: number;
  cropUptakeTop?: number; cropUptakeRoot?: number; cropUptakeDeep?: number;
}
export interface MoistureTransportInput {
  previousMoisture: SoilMoisture;
  nextMoisture: SoilMoisture;
  durationSeconds: number;
  fluxes?: MoistureFluxes;
  /** All samples share the SAME progression as authoritative stored moisture. */
  fluxSamples?: readonly { progress: number; fluxes: MoistureFluxes }[];
  /** Caller-owned comparison rate in the SAME units as supplied fluxes. Without
   * it, numbers qualify presence only. Never guess mm/day conversion here. */
  fluxReference?: number;
  simulationTiming?: MoistureSimulationTiming;
  moistureSamples?: readonly MoistureTrajectorySample[];
  /** Explicit model access only. Debug root reveal is NOT an access signal. */
  rootAccess?: RootPresentationState;
}

/** Model-to-presentation adapter. Positive flux AND compatible layer changes
 * are required for directional explanation. Net deltas alone imply no cause.
 * Window/strength constants are illustrative art direction, not transport or
 * growth coefficients. Soil wetness and field extent always share the sample. */
export function adaptMoistureTransport(input: MoistureTransportInput): SoilMoisturePresentationState {
  const state: SoilMoisturePresentationState = { soilMoisture: { ...input.nextMoisture },
    transition: { startMoisture: { ...input.previousMoisture }, durationSeconds: input.durationSeconds, easing: 'linear',
      simulationTiming: input.simulationTiming, moistureSamples: input.moistureSamples } };
  validateMoisturePresentation(state);
  if (input.fluxReference !== undefined && (!Number.isFinite(input.fluxReference) || input.fluxReference <= 0))
    throw new RangeError('Flux reference must be a positive finite caller-supplied comparison rate.');
  const samples = input.fluxSamples ?? [{ progress: 0, fluxes: input.fluxes ?? {} }, { progress: 1, fluxes: input.fluxes ?? {} }];
  if (samples.length < 2 || samples[0].progress !== 0 || samples.at(-1)?.progress !== 1 ||
    samples.some((point, index) => !Number.isFinite(point.progress) || point.progress < 0 || point.progress > 1 ||
      (index > 0 && point.progress <= samples[index - 1].progress)))
    throw new RangeError('Model flux samples require increasing progress including 0 and 1.');
  const flux: MoistureFluxes = {};
  for (const sample of samples) for (const [name, value] of Object.entries(sample.fluxes)) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0))
      throw new RangeError(`${name} flux must be finite and non-negative.`);
    const key = name as keyof MoistureFluxes;
    flux[key] = Math.max(flux[key] ?? 0, value ?? 0); // qualify union of EXPLICIT routes, not inferred physics
  }
  const activity = (keys: readonly (keyof MoistureFluxes)[]): MoistureActivitySample[] => samples.map(sample => {
    const supplied = Math.max(0, ...keys.map(key => sample.fluxes[key] ?? 0));
    const ratio = input.fluxReference === undefined ? undefined : supplied / input.fluxReference;
    return { progress: sample.progress, level: ratio === undefined ? (supplied > 0 ? 1 : 0) : 2 - 2 / (1 + ratio) };
  });
  const layerSources: Partial<Record<MoistureLayerId, Partial<Record<MoistureTransportChannel, Set<keyof MoistureFluxes>>>>> = {};
  const source = (id: MoistureLayerId, channel: MoistureTransportChannel, ...keys: (keyof MoistureFluxes)[]) => {
    const channels = layerSources[id] ??= {};
    keys.forEach(key => (channels[channel] ??= new Set()).add(key));
  };
  const transport: Partial<Record<MoistureLayerId, MoistureTransportCue>> = {};
  const delta = (id: MoistureLayerId) => input.nextMoisture[id] - input.previousMoisture[id];
  const trajectory = input.moistureSamples;
  const gains = (id: MoistureLayerId) => trajectory ? trajectory.some((point, i) => i > 0 && point.soilMoisture[id] > trajectory[i - 1].soilMoisture[id]) : delta(id) > 0;
  const declines = (id: MoistureLayerId) => trajectory ? trajectory.some((point, i) => i > 0 && point.soilMoisture[id] < trajectory[i - 1].soilMoisture[id]) : delta(id) < 0;
  const cue = (id: MoistureLayerId) => transport[id] ??= {};
  const changed = (id: MoistureLayerId) => gains(id) || declines(id);
  const entering = (flux.rainfallInput ?? 0) > 0 || (flux.irrigationInput ?? 0) > 0;
  // Explicit through-flow can coexist with unchanged/declining net storage.
  // Start with gaining receivers or supplied surface/bottom sinks, then admit
  // connected upstream routes. This only qualifies an explanation: no amount,
  // magnitude, rate or water balance is inferred or integrated here.
  const routes = [
    ['topToRoot', 'topsoil', 'rootZone', 'down'], ['rootToDeep', 'rootZone', 'deepSoil', 'down'],
    ['rootToTop', 'rootZone', 'topsoil', 'up'], ['deepToRoot', 'deepSoil', 'rootZone', 'up'],
  ] as const;
  const accepting = new Set(SOIL_LAYERS.filter(layer => gains(layer.id)).map(layer => layer.id));
  if ((flux.evaporationLoss ?? 0) > 0 && declines('topsoil')) accepting.add('topsoil');
  if ((flux.bottomDrainage ?? 0) > 0 && declines('deepSoil')) accepting.add('deepSoil');
  const enabled = new Set<keyof MoistureFluxes>();
  for (let pass = 0; pass < SOIL_LAYERS.length; pass++) for (const [name, donor, receiver] of routes)
    if ((flux[name] ?? 0) > 0 && accepting.has(receiver)) { enabled.add(name); accepting.add(donor); }
  const topTransfer = enabled.has('topToRoot');
  const deepTransfer = enabled.has('rootToDeep');
  const totalDepth = SOIL_LAYERS.reduce((sum, layer) => sum + layer.thickness, 0);
  const topEnd = SOIL_LAYERS[0].thickness / totalDepth;
  const rootEnd = (SOIL_LAYERS[0].thickness + SOIL_LAYERS[1].thickness) / totalDepth;
  const spans = { topsoil: [0, topEnd], rootZone: [topEnd, rootEnd], deepSoil: [rootEnd, 1] } as const;
  const fronts: NonNullable<NonNullable<SoilMoisturePresentationState['transition']>['directionalFronts']>[number][] = [];

  if (entering && gains('topsoil')) {
    Object.assign(cue('topsoil'), { infiltration: .85, downward: .65, window: [0, .52] });
    source('topsoil', 'infiltration', 'rainfallInput', 'irrigationInput');
    source('topsoil', 'downward', 'rainfallInput', 'irrigationInput');
    if (topTransfer && gains('rootZone')) Object.assign(cue('rootZone'), { infiltration: .65, downward: .50, window: [.24, .82] });
    if (topTransfer && deepTransfer && gains('deepSoil')) Object.assign(cue('deepSoil'), { infiltration: .45, downward: .40, window: [.52, 1] });
    if (topTransfer) { source('rootZone', 'infiltration', 'topToRoot'); source('rootZone', 'downward', 'topToRoot'); }
    if (topTransfer && deepTransfer) { source('deepSoil', 'infiltration', 'rootToDeep'); source('deepSoil', 'downward', 'rootToDeep'); }
    fronts.push({ kind: 'wetting', from: 0, to: topTransfer && deepTransfer ? .94 : topTransfer ? rootEnd : topEnd,
      strength: .95, window: [0, 1], activityTrack: activity(['rainfallInput', 'irrigationInput']) });
  }
  for (const [name, from, to, direction] of routes) {
    if (!enabled.has(name)) continue;
    const key = direction === 'up' ? 'upward' : 'downward';
    source(from, key, name); source(to, key, name);
    if (changed(from)) cue(from)[key] = Math.max(cue(from)[key] ?? 0, .60);
    cue(to)[key] = Math.max(cue(to)[key] ?? 0, .65);
    cue(to).window ??= direction === 'down' ? (to === 'deepSoil' ? [.22, 1] : [.10, .95]) :
      (to === 'topsoil' ? [.22, 1] : [.05, .92]);
    const inSurfacePath = entering && gains('topsoil') && gains(to) && direction === 'down' &&
      (from === 'topsoil' || topTransfer);
    // Shared bounds admit irregular pockets, never a drawn line. Internal
    // transfers can be upward or downward and have no surface-entry accent.
    if (!inSurfacePath) {
      const upper = direction === 'down' ? spans[from] : spans[to];
      const lower = direction === 'down' ? spans[to] : spans[from];
      fronts.push({ kind: 'transfer', direction,
        from: upper[0] + (upper[1] - upper[0]) * .38,
        to: lower[0] + (lower[1] - lower[0]) * .86,
        strength: .90, activityTrack: activity([name]),
        window: direction === 'down' && to === 'deepSoil' || direction === 'up' && to === 'topsoil' ? [.22, 1] : [0, .92] });
    }
  }
  if ((flux.evaporationLoss ?? 0) > 0 && declines('topsoil')) {
    // Surface evaporation explains only the topsoil. Deeper storage still
    // follows its supplied trajectory, transfers and separate crop-uptake cues.
    const timing = input.simulationTiming;
    const dayScale = { second: 1 / 86400, hour: 1 / 24, day: 1, week: 7 };
    const exposure = timing ? Math.min(1, timing.stepDuration * dayScale[timing.timeUnit] / MOISTURE_TRANSPORT_DISPLAY.fullDryingCueDays) : 1;
    const durationWeight = exposure * exposure * (3 - 2 * exposure);
    cue('topsoil').surfaceDrying = .95 * durationWeight;
    source('topsoil', 'surfaceDrying', 'evaporationLoss');
    cue('topsoil').window = [0, 1];
    fronts.push({ kind: 'drying', from: 0, to: topEnd, strength: durationWeight, window: [0, 1], activityTrack: activity(['evaporationLoss']) });
  }
  if ((flux.bottomDrainage ?? 0) > 0 && declines('deepSoil')) {
    cue('deepSoil').drainage = .65;
    source('deepSoil', 'drainage', 'bottomDrainage');
    fronts.push({ kind: 'drainage', direction: 'down', from: rootEnd, to: 1, strength: .75, window: [0, 1], activityTrack: activity(['bottomDrainage']) });
  }

  if (input.rootAccess) {
    // Ignore the debug rootReveal slider. Only developed depth and explicitly
    // supplied accessible layers permit uptake; storage itself is never hidden.
    const access = resolveRootPresentation({ ...input.rootAccess, rootReveal: 1 });
    let top = 0;
    for (const layer of SOIL_LAYERS) {
      const fraction = Math.max(0, Math.min(1, (access.displayDepth - top) / layer.thickness));
      const key = ({ topsoil: 'cropUptakeTop', rootZone: 'cropUptakeRoot', deepSoil: 'cropUptakeDeep' } as const)[layer.id];
      const uptake = flux[key] ?? 0;
      if (uptake > 0 && declines(layer.id) && fraction > 0) {
        source(layer.id, 'uptake', key);
        Object.assign(cue(layer.id), { uptake: .55, accessibleFraction: fraction });
      }
      top += layer.thickness;
    }
  }
  for (const { id } of SOIL_LAYERS) if (transport[id]) {
    transport[id]!.activityTracks = {};
    for (const [channel, sources] of Object.entries(layerSources[id] ?? {}))
      transport[id]!.activityTracks![channel as MoistureTransportChannel] = activity([...sources]);
  }
  if (Object.keys(transport).length) state.transition!.transport = transport;
  if (fronts.length) state.transition!.directionalFronts = fronts;
  validateMoisturePresentation(state);
  return state;
}
