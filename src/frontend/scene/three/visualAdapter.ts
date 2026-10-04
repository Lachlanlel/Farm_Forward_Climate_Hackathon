import type { FarmAreaConfig } from '../simulation/types';
import { PROTOTYPE_AREA_RANGE, VISUAL_FOOTPRINT } from './visualTokens';

export type VisualFootprint = {
  width: number;
  depth: number;
  actualAreaHa: number;
  realSideM: number;
};

export function validateFarmArea(area: number): string | null {
  if (!Number.isFinite(area) || area <= 0) return 'Enter a farm area greater than 0 ha.';
  if (area < PROTOTYPE_AREA_RANGE.min || area > PROTOTYPE_AREA_RANGE.max)
    return 'This prototype accepts 1–10,000 ha. Final input limits are still pending.';
  return null;
}

/** Horizontal compression only. Strictly increasing logarithmic mapping,
 * with presentation factors applied equally across every hectare input.
 * Actual hectares are retained, never overwritten. Vertical depth is separate.
 * No yield/water calculation belongs here. No metre scale bar is meaningful.
 */
export function areaToVisualFootprint({ farmAreaHa }: FarmAreaConfig): VisualFootprint {
  const error = validateFarmArea(farmAreaHa);
  if (error) throw new RangeError(error);
  const { minimumSide, referenceSide, referenceAreaHa, responseAreaHa, horizontalDisplayScale } = VISUAL_FOOTPRINT;
  const side = horizontalDisplayScale * (minimumSide + (referenceSide - minimumSide) *
    Math.log1p(farmAreaHa / responseAreaHa) / Math.log1p(referenceAreaHa / responseAreaHa));
  return { width: side, depth: side, actualAreaHa: farmAreaHa, realSideM: Math.sqrt(farmAreaHa * 10_000) };
}
