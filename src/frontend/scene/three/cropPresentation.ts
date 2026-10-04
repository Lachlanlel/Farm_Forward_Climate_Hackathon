import type { CropModelVisualInputs } from '../simulation/types';
import { cropStageAnchors } from './cropStageMapping';

/** Supplied visual/model outputs, not a crop model or week-to-stage curve. */
export interface CropPresentationState extends Pick<CropModelVisualInputs, 'cropDevelopment' | 'cropStress'> {}
export const CROP_PREVIEW: CropPresentationState = { cropDevelopment: cropStageAnchors.week0.rendererDevelopment, cropStress: 0 };
export const CROP_DISPLAY = {
  version: 3, transitionSeconds: .65,
  minimumStemExtension: .40, plantedBaseHeight: .08,
  headStart: .58, headFull: .82,
  leafDroop: .18, stemBend: .085, canopyContraction: .08, wiltStart: .10,
  // Late natural maturity is structural-development-derived, not drought.
  maturityStart: .84, maturityFull: .98, maturityStrength: .55,
  // The ONE live-wheat palette. Colour depends only on baseline-relative PGI
  // stress; development, instance variation and adaptations never tint it.
  // Olive remains through severe stress; dry straw/brown is reserved for the end.
  stressStops: [0, .25, .55, .80, 1],
  stressColors: ['#56743c', '#698048', '#83934c', '#a1a263', '#a18b70'],
  labelBands: [.20, .40, .65, .85],
  labels: ['Healthy', 'Mild stress', 'Stressed', 'Severe stress', 'Critical'],
} as const;
export const CROP_PRESETS = [
  { id: 'A', cropDevelopment: .25, cropStress: 0 },
  { id: 'B', cropDevelopment: .25, cropStress: .70 },
  { id: 'C', cropDevelopment: .55, cropStress: 0 },
  { id: 'D', cropDevelopment: .55, cropStress: .40 },
  { id: 'E', cropDevelopment: .55, cropStress: .80 },
  { id: 'F', cropDevelopment: .85, cropStress: 0 },
  { id: 'G', cropDevelopment: .85, cropStress: .70 },
] as const;

export function validateCropPresentation(state: CropPresentationState) {
  for (const key of ['cropDevelopment', 'cropStress'] as const)
    if (!Number.isFinite(state?.[key]) || state[key] < 0 || state[key] > 1)
      throw new RangeError(`${key} must be a finite normalised visual input from 0 to 1.`);
}
/** Reserved PGI/performance inputs are deliberately ignored by this adapter.
 * The model will decide their use; no arbitrary second drought multiplier. */
export function adaptCropModelInputs(state: CropModelVisualInputs): CropPresentationState {
  const crop = { cropDevelopment: state.cropDevelopment, cropStress: state.cropStress };
  validateCropPresentation(crop);
  return crop;
}
const smooth = (value: number) => value * value * (3 - 2 * value);
export function cropDebugLabel(stress: number) {
  return CROP_DISPLAY.labels[CROP_DISPLAY.labelBands.filter(limit => stress >= limit).length];
}
export function resolveCropAppearance(state: CropPresentationState) {
  validateCropPresentation(state);
  const { cropDevelopment: development, cropStress: stress } = state;
  return { stemExtension: CROP_DISPLAY.minimumStemExtension + (1 - CROP_DISPLAY.minimumStemExtension) * smooth(development),
    headDevelopment: smooth(Math.max(0, Math.min(1, (development - CROP_DISPLAY.headStart) / (CROP_DISPLAY.headFull - CROP_DISPLAY.headStart)))),
    naturalMaturity: CROP_DISPLAY.maturityStrength * smooth(Math.max(0, Math.min(1, (development - CROP_DISPLAY.maturityStart) / (CROP_DISPLAY.maturityFull - CROP_DISPLAY.maturityStart)))),
    wilt: smooth(Math.max(0, Math.min(1, (stress - CROP_DISPLAY.wiltStart) / (1 - CROP_DISPLAY.wiltStart)))), stressLabel: cropDebugLabel(stress) };
}

/** Finite reversible visual settling only; retarget from the current sample.
 * Model/timeline callers may supply already-interpolated samples immediately. */
export class CropTransition {
  displayed: CropPresentationState;
  target: CropPresentationState;
  private start: CropPresentationState;
  private elapsed: number = CROP_DISPLAY.transitionSeconds;
  constructor(state = CROP_PREVIEW) {
    validateCropPresentation(state);
    this.displayed = { ...state }; this.target = { ...state }; this.start = { ...state };
  }
  setState(state: CropPresentationState, immediate = false) {
    validateCropPresentation(state);
    this.start = { ...this.displayed }; this.target = { ...state }; this.elapsed = 0;
    if (immediate) { this.displayed = { ...state }; this.elapsed = CROP_DISPLAY.transitionSeconds; }
  }
  get settled() { return this.elapsed >= CROP_DISPLAY.transitionSeconds; }
  step(delta: number) {
    if (!Number.isFinite(delta)) throw new RangeError('Crop display step must be finite.');
    if (this.settled) return false;
    this.elapsed = Math.min(CROP_DISPLAY.transitionSeconds, this.elapsed + Math.max(0, delta));
    const amount = smooth(this.elapsed / CROP_DISPLAY.transitionSeconds);
    this.displayed = this.settled ? { ...this.target } : {
      cropDevelopment: this.start.cropDevelopment + (this.target.cropDevelopment - this.start.cropDevelopment) * amount,
      cropStress: this.start.cropStress + (this.target.cropStress - this.start.cropStress) * amount,
    };
    return true;
  }
}
