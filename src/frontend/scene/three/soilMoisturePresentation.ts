import { SOIL_LAYERS } from './visualTokens';

export type MoistureLayerId = typeof SOIL_LAYERS[number]['id'];
export type SoilMoisture = Record<MoistureLayerId, number>;
/** Caller-defined numerical time; screen seconds are separately supplied.
 * No conversion to physical velocity or hydrology is performed here. */
export interface MoistureSimulationTiming {
  startTime: number; stepDuration: number; timeUnit: 'second' | 'hour' | 'day' | 'week';
}
export interface MoistureTrajectorySample { progress: number; soilMoisture: SoilMoisture }
export interface MoistureActivitySample { progress: number; level: number }
/** Presentation input, already normalised by the caller. In this prototype 0/1
 * are dry/high display endpoints, NOT water content, capacity or availability.
 * A model adapter will own unit conversion and any future flux interpretation. */
export interface SoilMoisturePresentationState {
  /** The ONLY authoritative quantity per layer: supplied destination state. */
  soilMoisture: SoilMoisture;
  transition?: MoistureTransitionPlan;
}
/** The visual adapter interprets (start state, model fluxes, destination state)
 * into this transient explanation. No water amount or physics lives in it.
 * Completion MUST match the ordinary stored-moisture destination rendering. */
export interface MoistureTransitionPlan {
  startMoisture?: SoilMoisture; // Otherwise begin from the currently displayed sample.
  durationSeconds?: number; // Presentation duration, never a biological/transport rate.
  simulationTiming?: MoistureSimulationTiming;
  /** Optional model-provided trajectory. No shader-arrival-derived wetness. */
  moistureSamples?: readonly MoistureTrajectorySample[];
  fieldMotion?: Partial<Record<MoistureLayerId, MoistureFieldMotion>>;
  easing?: 'settle' | 'smooth' | 'linear';
  /** Flux-qualified, finite presentation cues. Never water quantities. */
  transport?: Partial<Record<MoistureLayerId, MoistureTransportCue>>;
  /** Read-only explanatory fronts on the SAME field. Depth fractions refer
   * to the exaggerated displayed profile, never metres or water quantities. */
  directionalFronts?: readonly MoistureDirectionalFront[];
}
export interface MoistureDirectionalFront {
  kind: 'wetting' | 'transfer' | 'drying' | 'drainage';
  /** Bounds stay ordered; direction describes the supplied adjacent-layer flux. */
  direction?: 'down' | 'up';
  from: number; to: number; strength: number;
  window: readonly [number, number];
  activityTrack?: readonly MoistureActivitySample[];
}
export interface MoistureFrontSample extends MoistureDirectionalFront {
  phase: number; weight: number;
  activity: number; // Relative explanation only; no water quantity.
  /** Canonical endpoint shading coefficients, frozen with a carried drying
   * explanation so a new target cannot snap its contour floor. No quantity. */
  destinationFloor?: Record<MoistureLayerId, { threshold: number; opacity: number }>;
}
export const MAX_ACTIVE_MOISTURE_FRONTS = 8;
export const MAX_MOISTURE_FRONTS = 16; // bounded current explanations + interrupted predecessors
export interface MoistureTransportCue {
  downward?: number;
  upward?: number;
  drainage?: number;
  infiltration?: number;
  surfaceDrying?: number;
  uptake?: number;
  accessibleFraction?: number;
  /** Illustrative timing within the supplied duration, not model rates. */
  window?: readonly [number, number];
  activityTrack?: readonly MoistureActivitySample[];
  activityTracks?: Partial<Record<MoistureTransportChannel, readonly MoistureActivitySample[]>>;
}
export type MoistureTransportChannel = 'downward' | 'upward' | 'drainage' | 'infiltration' | 'surfaceDrying' | 'uptake';
export interface MoistureCueSample {
  downward: number; upward: number; drainage: number; infiltration: number; surfaceDrying: number; uptake: number; accessibleFraction: number;
}
const emptyCue = (): MoistureCueSample => ({ downward: 0, upward: 0, drainage: 0, infiltration: 0, surfaceDrying: 0, uptake: 0, accessibleFraction: 0 });
const smooth = (t: number) => t * t * (3 - 2 * t);
function validateTrack(track: readonly { progress: number }[], label: string) {
  if (track.length < 2 || track[0].progress !== 0 || track.at(-1)?.progress !== 1 ||
    track.some((point, index) => !Number.isFinite(point.progress) || point.progress < 0 || point.progress > 1 ||
      (index > 0 && point.progress <= track[index - 1].progress)))
    throw new RangeError(`${label} must have strictly increasing progress samples including 0 and 1.`);
}
function validateActivity(track?: readonly MoistureActivitySample[]) {
  if (!track) return;
  validateTrack(track, 'Relative flux activity');
  if (track.some(point => !Number.isFinite(point.level) || point.level < 0 || point.level > 2))
    throw new RangeError('Relative explanatory activity must be finite from 0 to 2.');
}
export function sampleMoistureActivity(track: readonly MoistureActivitySample[] | undefined, progress: number) {
  if (!track) return 1; // Legacy supplied positive flags preserve approved motion.
  const upper = track.findIndex(point => point.progress >= progress), right = track[Math.max(0, upper)];
  if (upper <= 0) return right.level;
  const left = track[upper - 1], fraction = (progress - left.progress) / (right.progress - left.progress);
  return left.level + (right.level - left.level) * fraction;
}
/** Peak transient shape changes of the SAME field, returning to zero at the
 * destination. They cannot override amount, extent, opacity or soil wetness. */
export interface MoistureFieldMotion {
  offset?: readonly [number, number, number];
  morph?: number;
}
export const MOISTURE_PREVIEW: SoilMoisture = { topsoil: .15, rootZone: .45, deepSoil: .75 };
export const MOISTURE_DISPLAY = {
  transitionSeconds: .24, transitionDurationSeconds: 1.2,
  // Linear albedo multiplier: subdued blue-grey bias blended into LOCAL earth.
  // All channels remain below one: moisture never becomes bright blue paint.
  fieldTone: [.45, .60, .75], fieldOpacity: .82,
  spatialFrequency: 1.20, boundarySoftness: .17,
  dryRoughness: 1, wetRoughness: .90,
  wetColors: { topsoil: '#635041', rootZone: '#6e5d50', deepSoil: '#625850' },
} as const; // Provisional generic-soil appearance only; no scientific coefficients.

/** Temporary transport tint only. Stored moisture and earth endpoints retain
 * their approved Part 1 palette; this tint has no quantity or layer state. */
export const MOISTURE_TRANSPORT_DISPLAY = {
  color: '#657f88', tintStrength: .32,
  // Rendering only: stronger near-surface recession, restrained top-face
  // lightening, and reduced emphasis for short model-time drying intervals.
  dryingRetreat: .42, dryingErosion: .36,
  surfaceLightening: .14, fullDryingCueDays: 6,
} as const;

function validateAmounts(amounts: SoilMoisture) {
  for (const { id } of SOIL_LAYERS) {
    const amount = amounts?.[id];
    if (!Number.isFinite(amount) || amount < 0 || amount > 1)
      throw new RangeError(`${id} relative moisture requires a finite display value from 0 to 1.`);
  }
}
export function validateMoisturePresentation(state: SoilMoisturePresentationState) {
  validateAmounts(state.soilMoisture);
  const plan = state.transition;
  if (plan?.simulationTiming) {
    const timing = plan.simulationTiming;
    if (!Number.isFinite(timing.startTime) || !Number.isFinite(timing.stepDuration) ||
      !Number.isFinite(timing.startTime + timing.stepDuration) || timing.stepDuration <= 0 ||
      !['second', 'hour', 'day', 'week'].includes(timing.timeUnit))
      throw new RangeError('Model timing requires a finite start, positive step duration and explicit time unit.');
  }
  if (plan?.moistureSamples) {
    validateTrack(plan.moistureSamples, 'Model moisture trajectory');
    plan.moistureSamples.forEach(sample => validateAmounts(sample.soilMoisture));
    if (!plan.startMoisture || SOIL_LAYERS.some(({ id }) => plan.moistureSamples![0].soilMoisture[id] !== plan.startMoisture![id] ||
      plan.moistureSamples!.at(-1)!.soilMoisture[id] !== state.soilMoisture[id]))
      throw new RangeError('Model moisture trajectory endpoints must match the supplied previous/destination states.');
  }
  if (plan?.startMoisture !== undefined) validateAmounts(plan.startMoisture);
  if (plan?.durationSeconds !== undefined && (!Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0))
    throw new RangeError('Moisture transition duration must be positive and finite.');
  for (const { id } of SOIL_LAYERS) {
    const motion = plan?.fieldMotion?.[id];
    if (motion?.morph !== undefined && (!Number.isFinite(motion.morph) || motion.morph < 0 || motion.morph > 1))
      throw new RangeError('Moisture field morph must be from 0 to 1.');
    if (motion?.offset && (motion.offset.length !== 3 || motion.offset.some(value => !Number.isFinite(value))))
      throw new RangeError('Moisture field offset requires three finite display coordinates.');
    const cue = plan?.transport?.[id];
    validateActivity(cue?.activityTrack);
    for (const track of Object.values(cue?.activityTracks ?? {})) validateActivity(track);
    for (const key of ['downward', 'upward', 'drainage', 'infiltration', 'surfaceDrying', 'uptake', 'accessibleFraction'] as const) {
      const value = cue?.[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1))
        throw new RangeError(`Moisture ${key} cue requires a finite fraction from 0 to 1.`);
    }
    if (cue?.window && (cue.window.length !== 2 || !cue.window.every(Number.isFinite) ||
      cue.window[0] < 0 || cue.window[1] > 1 || cue.window[0] >= cue.window[1]))
      throw new RangeError('Transport timing window must increase within 0 to 1.');
  }
  if (plan?.easing !== undefined && !['settle', 'smooth', 'linear'].includes(plan.easing))
    throw new RangeError('Unknown moisture easing.');
  if (plan?.directionalFronts && plan.directionalFronts.length > MAX_ACTIVE_MOISTURE_FRONTS)
    throw new RangeError(`At most ${MAX_ACTIVE_MOISTURE_FRONTS} simultaneous moisture explanations are supported.`);
  for (const front of plan?.directionalFronts ?? []) {
    validateActivity(front.activityTrack);
    if (!['wetting', 'transfer', 'drying', 'drainage'].includes(front.kind) ||
      (front.direction !== undefined && !['down', 'up'].includes(front.direction)) ||
      ![front.from, front.to, front.strength, ...front.window].every(Number.isFinite) ||
      front.from < 0 || front.to > 1 || front.from >= front.to || front.strength < 0 || front.strength > 1 ||
      front.window.length !== 2 || front.window[0] < 0 || front.window[1] > 1 || front.window[0] >= front.window[1])
      throw new RangeError('Moisture front requires a known kind and increasing finite depth/timing fractions.');
  }
}

/** Separate amount, opacity and extent; smooth boundaries change the occupied
 * region continuously without scaling soil or creating/deleting field meshes. */
export function moistureAppearance(amount: number) {
  return { wetness: amount, opacity: MOISTURE_DISPLAY.fieldOpacity * amount ** .85,
    extent: amount, threshold: .78 - .47 * amount,
    roughness: MOISTURE_DISPLAY.dryRoughness +
      (MOISTURE_DISPLAY.wetRoughness - MOISTURE_DISPLAY.dryRoughness) * amount };
}

/** One moisture controller. Displayed values are samples between supplied
 * states, NOT a second water store: no integration, flux balance or physics.
 * Soil shading and field extent/strength use this same sample together. */
export class MoistureTransition {
  private displayedSample: SoilMoisture;
  private destination: SoilMoisture;
  get displayed(): Readonly<SoilMoisture> { return this.displayedSample; }
  get target(): Readonly<SoilMoisture> { return this.destination; }
  readonly motion: Record<MoistureLayerId, { offset: [number, number, number]; morph: number }>;
  readonly cues: Record<MoistureLayerId, MoistureCueSample>;
  /** Finite shape samples only; no separate moisture amount or physics. */
  fronts: MoistureFrontSample[] = [];
  private start: SoilMoisture;
  private startMotion: typeof this.motion;
  private peakMotion: typeof this.motion;
  private startCues: typeof this.cues;
  private plan?: MoistureTransitionPlan;
  private startFronts: MoistureFrontSample[] = [];
  private frontDestinationFloor?: MoistureFrontSample['destinationFloor'];
  private elapsed = 0;
  private duration = MOISTURE_DISPLAY.transitionDurationSeconds as number;
  progress = 1;
  get simulationTime(): number | undefined {
    const timing = this.plan?.simulationTiming;
    return timing ? timing.startTime + timing.stepDuration * this.progress : undefined;
  }
  constructor(initial: SoilMoisture) {
    validateMoisturePresentation({ soilMoisture: initial });
    this.displayedSample = { ...initial }; this.destination = { ...initial };
    this.start = { ...initial };
    this.motion = Object.fromEntries(SOIL_LAYERS.map(({ id }) => [id, { offset: [0, 0, 0], morph: 0 }])) as typeof this.motion;
    this.startMotion = structuredClone(this.motion);
    this.peakMotion = structuredClone(this.motion);
    this.cues = Object.fromEntries(SOIL_LAYERS.map(({ id }) => [id, emptyCue()])) as typeof this.cues;
    this.startCues = structuredClone(this.cues);
    this.startFronts = structuredClone(this.fronts);
  }
  setState(state: SoilMoisturePresentationState) {
    validateMoisturePresentation(state); // atomic: reject invalid/missing data before any mutation
    this.elapsed = 0; this.progress = 0;
    this.duration = state.transition?.durationSeconds ?? MOISTURE_DISPLAY.transitionDurationSeconds;
    this.plan = state.transition ? structuredClone(state.transition) : undefined;
    this.startMotion = structuredClone(this.motion);
    this.startCues = structuredClone(this.cues);
    this.startFronts = structuredClone(this.fronts);
    // An explicit start is an intentional fixture/model snapshot. Retargeting
    // without it preserves the current shape as well as the current amount.
    if (state.transition?.startMoisture) {
      this.startFronts = [];
      for (const { id } of SOIL_LAYERS) {
        this.startMotion[id] = { offset: [0, 0, 0], morph: 0 };
        this.startCues[id] = emptyCue();
      }
    }
    let hasChange = false;
    for (const { id } of SOIL_LAYERS) {
      this.start[id] = state.transition?.startMoisture?.[id] ?? this.displayed[id];
      this.displayedSample[id] = this.start[id];
      this.destination[id] = state.soilMoisture[id];
      const motion = state.transition?.fieldMotion?.[id];
      this.peakMotion[id] = { offset: [...(motion?.offset ?? [0, 0, 0])], morph: motion?.morph ?? 0 };
      hasChange ||= this.start[id] !== this.destination[id] || this.startMotion[id].morph !== 0 ||
        this.peakMotion[id].morph !== 0 || this.startMotion[id].offset.some(value => value !== 0) ||
        this.peakMotion[id].offset.some(value => value !== 0) ||
        Object.values(this.startCues[id]).some(value => value !== 0);
    }
    hasChange ||= this.startFronts.some(front => front.weight > 0);
    hasChange ||= this.plan?.moistureSamples?.some(sample => SOIL_LAYERS.some(({ id }) => sample.soilMoisture[id] !== this.start[id])) ?? false;
    hasChange ||= !!this.plan?.transport || !!this.plan?.directionalFronts?.length;
    this.frontDestinationFloor = Object.fromEntries(SOIL_LAYERS.map(({ id }) => {
      const { threshold, opacity } = moistureAppearance(this.target[id]);
      return [id, { threshold, opacity }];
    })) as NonNullable<MoistureFrontSample['destinationFloor']>;
    if (!hasChange) this.progress = 1;
    this.sample();
  }
  step(deltaSeconds: number): boolean {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || this.progress === 1) return false;
    this.elapsed = Math.min(this.duration, this.elapsed + deltaSeconds);
    this.progress = this.elapsed / this.duration;
    this.sample();
    // Progress itself is a presentation change, even if amounts rounded to
    // their destinations on the previous frame. Publish the final completion.
    return true;
  }
  /** Pure re-sampling of one recorded transition: forward/back without stale
   * geometry, integration or accumulated visual water. */
  seek(progress: number) {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1)
      throw new RangeError('Moisture review progress must be from 0 to 1.');
    this.progress = progress; this.elapsed = progress * this.duration; this.sample();
  }
  /** A production model clock can supply selected time directly. Same sample
   * controls authoritative wetness and explanatory flux activity; no new clock. */
  seekSimulationTime(time: number) {
    const timing = this.plan?.simulationTiming;
    if (!timing || !Number.isFinite(time) || time < timing.startTime || time > timing.startTime + timing.stepDuration)
      throw new RangeError('Selected model time must lie within the supplied simulation step.');
    this.seek((time - timing.startTime) / timing.stepDuration);
  }
  private sample() {
    const complete = this.progress === 1;
    const settleAlpha = complete ? 1 : (1 - Math.exp(-this.elapsed / MOISTURE_DISPLAY.transitionSeconds)) /
      (1 - Math.exp(-this.duration / MOISTURE_DISPLAY.transitionSeconds));
    const globalAlpha = this.plan?.easing === 'linear' ? this.progress :
      this.plan?.easing === 'smooth' ? smooth(this.progress) : settleAlpha;
    const fronts = complete ? [] : this.startFronts.map(front => ({ ...front, weight: front.weight * (1 - globalAlpha) }));
    if (!complete) for (const front of this.plan?.directionalFronts ?? []) {
      const activity = sampleMoistureActivity(front.activityTrack, this.progress);
      const phase = Math.max(0, Math.min(1, (this.progress - front.window[0]) / (front.window[1] - front.window[0])));
      // A front travels monotonically. Its separate envelope only introduces
      // and clears the explanation; it never reverses the travelling tip.
      const weight = Math.min(1, front.strength * Math.sqrt(activity)) * smooth(Math.min(1, phase / .12)) *
        (1 - smooth(Math.max(0, Math.min(1, (phase - .78) / .22))));
      if (weight > 0) fronts.push({ ...front, phase, weight, activity,
        destinationFloor: front.kind === 'drying' || front.kind === 'drainage' ? this.frontDestinationFloor : undefined });
    }
    // Bound repeated causal retargeting without accumulating visual objects.
    // Ordinary interruption preserves all three preceding samples exactly.
    this.fronts = fronts.filter(front => front.weight > 0).sort((a, b) => b.weight - a.weight).slice(0, MAX_MOISTURE_FRONTS);
    for (const { id } of SOIL_LAYERS) {
      const cue = this.plan?.transport?.[id];
      const [begin, end] = cue?.window ?? [0, 1];
      const local = Math.max(0, Math.min(1, (this.progress - begin) / (end - begin)));
      // One authoritative interpolation drives soil AND stored field. Local
      // cue windows stagger explanations only; they cannot delay material or
      // use a separate layer amount. Sample an explicit model trajectory when
      // supplied; otherwise model/debug endpoints use the same linear progress.
      const alpha = globalAlpha;
      const pulse = complete || local === 0 || local === 1 ? 0 : Math.sin(Math.PI * local) ** 2;
      // Assign destination exactly at completion, including zero/one endpoints.
      const track = this.plan?.moistureSamples;
      const upper = track?.findIndex(point => point.progress >= this.progress) ?? -1;
      const right = track?.[Math.max(0, upper)], left = track?.[Math.max(0, upper - 1)];
      const trackAlpha = right && left && right.progress !== left.progress ?
        (this.progress - left.progress) / (right.progress - left.progress) : 0;
      const next = complete ? this.target[id] : right && left ?
        left.soilMoisture[id] + (right.soilMoisture[id] - left.soilMoisture[id]) * trackAlpha :
        this.start[id] + (this.target[id] - this.start[id]) * alpha;
      this.displayedSample[id] = next;
      const a = this.motion[id], start = this.startMotion[id], peak = this.peakMotion[id];
      const morph = complete ? 0 : start.morph * (1 - alpha) + peak.morph * pulse;
      a.morph = morph;
      for (let axis = 0; axis < 3; axis++) {
        const nextOffset = complete ? 0 : start.offset[axis] * (1 - alpha) + peak.offset[axis] * pulse;
        a.offset[axis] = nextOffset;
      }
      for (const key of ['downward', 'upward', 'drainage', 'infiltration', 'surfaceDrying', 'uptake'] as const) {
        const activity = sampleMoistureActivity(cue?.activityTracks?.[key] ?? cue?.activityTrack, this.progress);
        this.cues[id][key] = complete ? 0 : Math.min(1, this.startCues[id][key] * (1 - globalAlpha) + (cue?.[key] ?? 0) * pulse * Math.sqrt(activity));
      }
      this.cues[id].accessibleFraction = this.cues[id].uptake === 0 ? 0 :
        Math.min(cue?.accessibleFraction ?? this.startCues[id].accessibleFraction, 1);
    }
  }
}
