/** The existing handoff configuration field used by this scene-only milestone.
 * No simulation engine, synthetic agricultural state or model parameters yet.
 */
export type FarmAreaConfig = { farmAreaHa: number };
export type SoilType = 'sandy' | 'clay';

export type WaterSystem = 'rainfed' | 'irrigated';
/** Caller-normalised VISUAL activity, not mm, ML/ha or an allocation rule.
 * The numerical model supplies water inputs and soil state separately. */
export interface WaterSourceState {
  waterSystem: WaterSystem;
  rainfallRate: number;
  irrigationRate: number;
}

/** Current MVP adaptations. Numerical consequences/costs are model-owned. */
export interface AdaptationState { stubbleRetention: boolean; widerRows: boolean }
/** Crop-placement subset; independent of the retained previous-crop residue. */
export type WheatPlantingState = Pick<AdaptationState, 'widerRows'>;

/** Future model-supplied visual inputs. Development (biological position),
 * drought stress and growth performance are different concepts. Reserved PGI
 * fields are optional and have no rendering effect or numerical calculation yet.
 * A CDI percentile must not be equated with normalised growth performance. */
export interface CropModelVisualInputs {
  cropDevelopment: number; // 0–1; representative established-crop window
  cropStress: number; // 0–1; critical stress is not guaranteed biological death
  plantGrowthPerformance?: number; // 0–1; future model-defined performance
  pgiPercentile?: number; // 0–100; future actual CDI indicator, not stress/stage
}
