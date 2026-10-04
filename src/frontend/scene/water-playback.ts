import { WATER_SOURCE_REVIEWS } from './three/waterSourcePresets';
import { MOISTURE_TRANSPORT_PRESETS as PRESETS } from './three/moistureTransportPresets';
import { sampleWaterSources, type WaterSourceFrame } from './three/waterSourcePresentation';
import { adaptMoistureTransport, type MoistureTransportInput, type MoistureFluxes } from './three/soilMoistureTransport';
import { MoistureTransition, sampleMoistureActivity, type SoilMoisture } from './three/soilMoisturePresentation';
import { evaporationFluxSamples, EVAPORATION_DISPLAY, type EvaporationOptions } from './evaporation-presentation';
import { layerMoistureAt } from './layer-moisture-presentation';

/** Presentation assumptions only: no mm-to-SWI conversion or water accounting.
 * A representative application names an authored handoff animation, not advice.
 * Scheduling reads the SAME displayed root-zone sample as the renderer.
 */
export const WATER_EVENT_DISPLAY = {
  representativeIrrigationDepthMm: 20,
  refillFractionOfStartingMoisture: .9,
  irrigationCooldownDays: 14,
  wettingDays: 4, redistributionDays: 2, dryingDays: 4,
  effectiveRainActivity: .25, effectiveRainHoldDaysAtFullActivity: 15,
  schedulingStepDays: .25,
} as const;
type Event = { kind: 'rain' | 'irrigation'; start: number; activity: number; representativeDepthMm?: number; triggerRootZone?: number };

export function createWaterPlayback(
  samples: readonly { soilWaterIndex: number }[],
  options: EvaporationOptions & { waterSupply: 'rainfed' | 'irrigated' }
) {
  const config = WATER_EVENT_DISPLAY;
  const rainActivity = { moderate: .8, severe: .4, extreme: .12 }[options.droughtIntensity];
  const layers = ['topsoil', 'rootZone', 'deepSoil'] as const;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const base = (day: number) => layerMoistureAt(samples, day);
  const sourceAt = (event: Event, progress: number) => ({
    waterSystem: options.waterSupply,
    rainfallRate: event.kind === 'rain' ? sampleWaterSources(WATER_SOURCE_REVIEWS.rain.source, progress).rainfallRate * event.activity : 0,
    irrigationRate: event.kind === 'irrigation' ? sampleWaterSources(WATER_SOURCE_REVIEWS.irrigation.source, progress).irrigationRate : 0
  });
  const wet = WATER_SOURCE_REVIEWS.irrigation.transport;
  const peak = Object.fromEntries(layers.map(layer => [layer, wet.nextMoisture[layer] - wet.previousMoisture[layer]])) as SoilMoisture;
  const retained = Object.fromEntries(layers.map(layer => [layer,
    peak[layer] + PRESETS.redistribution.nextMoisture[layer] - PRESETS.redistribution.previousMoisture[layer]
  ])) as SoilMoisture;
  const zero = { topsoil: 0, rootZone: 0, deepSoil: 0 };
  const moisture = (day: number, shape: SoilMoisture, accent: number): SoilMoisture => Object.fromEntries(
    layers.map(layer => [layer, clamp(base(day)[layer] + shape[layer] * accent)])
  ) as SoilMoisture;
  const eventLength = config.wettingDays + config.redistributionDays + config.dryingDays;
  // These are discrete illustrative storms, never instantaneous RI rates.
  const events: Event[] = [6, 34, 62].map(start => ({ kind: 'rain', start, activity: rainActivity }));
  const refillLevel = base(0).rootZone * config.refillFractionOfStartingMoisture;
  const recentRainDays = rainActivity >= config.effectiveRainActivity ? rainActivity * config.effectiveRainHoldDaysAtFullActivity : 0;

  function prepare() {
    const intervals: MoistureTransportInput[] = [];
    const add = (from: number, to: number, points: { progress: number; shape: SoilMoisture }[], accent: number, fluxSamples?: MoistureTransportInput['fluxSamples']) => {
      if (to <= from) return;
      const moistureSamples = points.map(({ progress, shape }) => ({ progress, soilMoisture: moisture(from + (to - from) * progress, shape, accent) }));
      intervals.push({ previousMoisture: moistureSamples[0].soilMoisture, nextMoisture: moistureSamples.at(-1)!.soilMoisture,
        durationSeconds: (to - from) / 84 * 24, simulationTiming: { startTime: from, stepDuration: to - from, timeUnit: 'day' },
        // Wetting/redistribution supply their own distinct fluxes. Only dry
        // intervals explain surface loss; this never modifies moistureSamples.
        moistureSamples, fluxSamples: fluxSamples ?? evaporationFluxSamples(moistureSamples, to - from, options), fluxReference: 1 });
    };
    const dryGap = (from: number, to: number) => {
      if (to <= from) return;
      const days = [from, ...samples.map((_, day) => day).filter(day => day > from && day < to), to];
      add(from, to, days.map(day => ({ progress: (day - from) / (to - from), shape: zero })), 0);
    };
    let cursor = 0;
    for (const event of [...events].sort((a,b) => a.start - b.start)) {
      const start = event.start, wetEnd = start + config.wettingDays, transferEnd = wetEnd + config.redistributionDays, end = start + eventLength;
      dryGap(cursor, start);
      const fluxes = [0, .15, .18, .52, .65, .82, .86, 1].map(progress => {
        const source = sourceAt(event, progress), activity = Math.max(source.rainfallRate, source.irrigationRate);
        return { progress, fluxes: { rainfallInput: source.rainfallRate, irrigationInput: source.irrigationRate,
          topToRoot: activity, rootToDeep: activity * progress } };
      });
      add(start, wetEnd, wet.moistureSamples!.map(point => ({ progress: point.progress,
        shape: Object.fromEntries(layers.map(layer => [layer, point.soilMoisture[layer] - wet.previousMoisture[layer]])) as SoilMoisture })), event.activity, fluxes);
      const fading = (fluxes: MoistureFluxes) => [0, .4, 1].map(progress => ({ progress,
        fluxes: Object.fromEntries(Object.entries(fluxes).map(([key, value]) => [key, value * event.activity * (1 - progress)])) }));
      add(wetEnd, transferEnd, [{ progress: 0, shape: peak }, { progress: 1, shape: retained }], event.activity, fading(PRESETS.redistribution.fluxes));
      add(transferEnd, end, [{ progress: 0, shape: retained }, { progress: 1, shape: zero }], event.activity);
      cursor = end;
    }
    dryGap(cursor, 84);
    // Reuse the handoff sampler: scheduling/cracks see exactly what soil renders.
    return intervals.map(transport => {
      const sampler = new MoistureTransition(transport.previousMoisture);
      sampler.setState(adaptMoistureTransport(transport));
      return { transport, sampler };
    });
  }
  let prepared = prepare();
  const sampleAt = (day: number) => {
    const index = prepared.findIndex(({ transport }) => day < transport.simulationTiming!.startTime + transport.simulationTiming!.stepDuration);
    const key = index < 0 ? prepared.length - 1 : index;
    const { sampler, transport } = prepared[key];
    sampler.seekSimulationTime(day);
    const activity = sampleMoistureActivity(transport.fluxSamples!.map(point => ({
      progress: point.progress, level: point.fluxes.evaporationLoss ?? 0
    })), sampler.progress);
    return { key, transport, moisture: { ...sampler.displayed }, evaporation: {
      activity, surfaceDrying: sampler.cues.topsoil.surfaceDrying,
      demandMultiplier: EVAPORATION_DISPLAY.demand[options.droughtIntensity],
      stubbleRetention: !!options.adaptations?.stubbleRetention,
    } };
  };
  // Compile once in model-day order. Scrubs/replays never reschedule or add water.
  // Deferring also leaves room for the wetting/retention tail before the next rain.
  let lastIrrigation = -Infinity;
  if (options.waterSupply === 'irrigated') for (let day = 0; day <= 84 - eventLength; day += config.schedulingStepDays) {
    const rootZone = sampleAt(day).moisture.rootZone;
    if (rootZone >= refillLevel || day - lastIrrigation < config.irrigationCooldownDays) continue;
    const occupied = events.some(event => day < event.start + eventLength && day + eventLength > event.start);
    const recentEffectiveRain = events.some(event => event.kind === 'rain' && day >= event.start && day < event.start + config.wettingDays + recentRainDays);
    if (occupied || recentEffectiveRain) continue;
    events.push({ kind: 'irrigation', start: day, activity: .8, representativeDepthMm: config.representativeIrrigationDepthMm, triggerRootZone: rootZone });
    lastIrrigation = day;
    prepared = prepare();
  }
  return {
    events: events.map(event => ({ ...event })), refillLevel, recentRainDays,
    at(simulationDay: number) {
      const day = Math.min(84, Math.max(0, simulationDay));
      const sample = sampleAt(day);
      const event = events.find(event => day >= event.start && day < event.start + config.wettingDays);
      const source = event ? sourceAt(event, (day - event.start) / config.wettingDays) : { waterSystem: options.waterSupply, rainfallRate: 0, irrigationRate: 0 };
      // Final invariant even if future event authoring changes scheduling rules.
      if (source.rainfallRate > 0 || options.waterSupply === 'rainfed') source.irrigationRate = 0;
      const water: WaterSourceFrame = { ...source, timeSeconds: day / 84 * 24 };
      const redistributing = events.some(event => day >= event.start + config.wettingDays && day < event.start + config.wettingDays + config.redistributionDays);
      const process = water.rainfallRate > 0 ? 'Rainfall · surface wetting' : water.irrigationRate > 0 ? 'Irrigation · surface wetting'
        : redistributing ? 'Water moving into deeper layers' : sample.evaporation.activity > 0 ? 'Surface drying' : 'Stored layer moisture';
      return { ...sample, water, event: event?.kind ?? null, process };
    }
  };
}
