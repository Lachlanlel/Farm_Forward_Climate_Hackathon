import type { SoilType } from '../simulation/types';
import type { MoistureLayerId } from './soilMoisturePresentation';

/** Inherent soil appearance only. No capacities, rates or hydrological rules. */
export interface SoilAppearanceState { soilType: SoilType; surfaceCrackSeverity: number }
interface SoilVisualPreset {
  dryColours: Record<MoistureLayerId, string>;
  wetColours: Record<MoistureLayerId, string>;
  grainFrequency: number; grainStrength: number; bumpStrength: number;
  wetGrainStrength?: number; wetBumpStrength?: number;
  dryRoughness: number; wetRoughness: number; supportsCracking: boolean;
}
export const SOIL_VISUAL_PRESETS: Record<SoilType, SoilVisualPreset> = {
  sandy: {
    dryColours: { topsoil: '#9f8b77', rootZone: '#9b9184', deepSoil: '#898176' },
    wetColours: { topsoil: '#715a45', rootZone: '#6c6252', deepSoil: '#5d574d' },
    // Fixed sandy-loam grain; only its prominence changes with layer moisture.
    grainFrequency: 9.5, grainStrength: .36, wetGrainStrength: .20,
    bumpStrength: .38, wetBumpStrength: .22,
    dryRoughness: 1, wetRoughness: .91, supportsCracking: false,
  },
  clay: {
    dryColours: { topsoil: '#897361', rootZone: '#8c7d6e', deepSoil: '#867c73' },
    wetColours: { topsoil: '#58483d', rootZone: '#605045', deepSoil: '#574d45' },
    grainFrequency: 21, grainStrength: .065, bumpStrength: .07,
    dryRoughness: .97, wetRoughness: .90, supportsCracking: true,
  },
}; // Provisional agricultural earth colours/detail, not scientific soil classes.
export const SOIL_APPEARANCE_PREVIEW: SoilAppearanceState = { soilType: 'clay', surfaceCrackSeverity: 0 };
export const SOIL_CRACK_DISPLAY = {
  resolution: 1024, seed: 0x6c1a7, primaryCellArea: 16, secondaryCellArea: 3.0,
  tone: [.54, .47, .40], strength: .66, reliefDepth: .024,
} as const; // Fixed scene-space fissure widths; never physical fracture mechanics.
export function validateSoilAppearance(state: SoilAppearanceState) {
  if (!Object.hasOwn(SOIL_VISUAL_PRESETS, state.soilType)) throw new RangeError('Soil type must be sandy or clay.');
  if (!Number.isFinite(state.surfaceCrackSeverity) || state.surfaceCrackSeverity < 0 || state.surfaceCrackSeverity > 1)
    throw new RangeError('Surface crack severity must be a finite supplied value from 0 to 1.');
}
