import type { WaterSourceState, WaterSystem } from '../simulation/types';

export const WATER_SOURCE_PREVIEW: WaterSourceState = { waterSystem: 'rainfed', rainfallRate: 0, irrigationRate: 0 };
export interface WaterSourceActivitySample { progress: number; rainfallRate: number; irrigationRate: number }
/** Sampled on the existing moisture controller's progress. No independent event
 * timer or reservoir. Screen seconds only control cosmetic droplet recycling. */
export interface WaterSourceReviewPlan {
  waterSystem: WaterSystem;
  durationSeconds: number;
  samples: readonly WaterSourceActivitySample[];
}
/** Atomic caller-supplied visual frame; optional transport seek uses the same
 * progression. Rates do not generate moisture, fluxes or crack changes. */
export interface WaterSourceFrame extends WaterSourceState {
  timeSeconds: number;
  transportProgress?: number;
}
export function validateWaterSources(state: WaterSourceState) {
  if (state.waterSystem !== 'rainfed' && state.waterSystem !== 'irrigated') throw new TypeError('Unknown water system.');
  for (const key of ['rainfallRate', 'irrigationRate'] as const)
    if (!Number.isFinite(state[key]) || state[key] < 0 || state[key] > 1)
      throw new RangeError(`${key} must be a supplied normalised visual activity in 0–1.`);
}
export function validateWaterSourceReview(plan: WaterSourceReviewPlan) {
  if (!Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0) throw new RangeError('Invalid source review duration.');
  if (plan.samples.length < 2 || plan.samples[0].progress !== 0 || plan.samples.at(-1)?.progress !== 1)
    throw new RangeError('Source activity samples must include 0 and 1.');
  plan.samples.forEach((point, i) => {
    validateWaterSources({ ...point, waterSystem: plan.waterSystem });
    if (!Number.isFinite(point.progress) || point.progress < 0 || point.progress > 1 ||
      (i > 0 && point.progress <= plan.samples[i - 1].progress)) throw new RangeError('Source samples must be strictly ordered.');
  });
}
export function sampleWaterSources(plan: WaterSourceReviewPlan, progress: number): WaterSourceState {
  const rightIndex = plan.samples.findIndex(point => point.progress >= progress);
  const right = plan.samples[rightIndex < 0 ? plan.samples.length - 1 : rightIndex];
  const left = plan.samples[Math.max(0, rightIndex - 1)];
  const t = left === right ? 0 : (progress - left.progress) / (right.progress - left.progress);
  return { waterSystem: plan.waterSystem,
    rainfallRate: left.rainfallRate + (right.rainfallRate - left.rainfallRate) * t,
    irrigationRate: left.irrigationRate + (right.irrigationRate - left.irrigationRate) * t };
}
