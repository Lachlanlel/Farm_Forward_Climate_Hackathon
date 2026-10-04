// @ts-check
import { FARM_FORWARD_MODEL_V1 } from '../simulation/farm-forward-model-v1.js';
import { finiteResultNumber, ResultsError } from '../../shared/results-contract.js';

/** Educational severity-calibrated index-response proxy, not an NSW DPIRD
 * grain-yield product or cardinal interpretation of an SWI percentile.
 * No additional irrigation/stubble multiplier: their effects are already in SWI.
 * @param {number} normalYieldTPerHa @param {number} startingSWI @param {number} endingSWI
 * @param {'moderate' | 'severe' | 'extreme'} droughtIntensity
 * @param {{moderate: number, severe: number, extreme: number}} baseDroughtLoss */
export function referenceYieldFromSwiLoss(normalYieldTPerHa, startingSWI, endingSWI, droughtIntensity, baseDroughtLoss) {
  finiteResultNumber(normalYieldTPerHa, 'Normal/reference yield assumption', Number.MIN_VALUE);
  finiteResultNumber(startingSWI, 'Official starting SWI', 0, 100);
  finiteResultNumber(endingSWI, 'Projected ending SWI', 0, 100);
  const severity = FARM_FORWARD_MODEL_V1.drought[droughtIntensity];
  if (!severity) throw new ResultsError('invalid-severity', 'A valid drought severity is required.');
  const loss = finiteResultNumber(baseDroughtLoss?.[droughtIntensity], 'Severity yield-loss assumption', 0, 1);
  // Exactly the existing model loss BEFORE soil/protection/clamping. Targets
  // are endpoint indices, so startingSWI - target alone is not always the loss.
  const rawSeveritySWILoss = Math.max(startingSWI - severity.soilWaterTarget, startingSWI * severity.minimumDecline);
  if (rawSeveritySWILoss === 0) throw new ResultsError('yield-assumption-unavailable', 'Zero raw severity SWI loss cannot support the provisional yield ratio. A calibrated yield assumption is required.', 422);
  const actualSWILoss = startingSWI - endingSWI;
  const conditionFactor = actualSWILoss / rawSeveritySWILoss;
  const unboundedYield = normalYieldTPerHa * (1 - loss * conditionFactor);
  // Only this educational 18 cm proxy is bounded. Signed strategy performance
  // and the later research-based wide-row output are never clamped to zero gain.
  const referenceYieldTPerHa = Math.max(0, Math.min(normalYieldTPerHa, unboundedYield));
  return { referenceYieldTPerHa, rawSeveritySWILoss, actualSWILoss, conditionFactor, bounded: referenceYieldTPerHa !== unboundedYield };
}

/** @param {number} referenceYieldTPerHa @param {boolean} [widerRows] */
export function wideRowMultiplier(referenceYieldTPerHa, widerRows = true) {
  finiteResultNumber(referenceYieldTPerHa, '18 cm reference yield', 0);
  if (typeof widerRows !== 'boolean') throw new ResultsError('invalid-adaptations', 'The wider-row selection must be boolean.');
  if (!widerRows) return 1;
  const points = FARM_FORWARD_MODEL_V1.adaptations.widerRows.yieldResponse;
  // Hold endpoints outside 1–6 t/ha. The supplied evidence does not justify
  // extrapolating a benefit >3% or a penalty beyond the final .9433 multiplier.
  if (referenceYieldTPerHa <= points[0].yieldTPerHa) return points[0].multiplier;
  if (referenceYieldTPerHa >= points[points.length - 1].yieldTPerHa) return points[points.length - 1].multiplier;
  const upperIndex = points.findIndex(point => point.yieldTPerHa >= referenceYieldTPerHa);
  const lower = points[upperIndex - 1], upper = points[upperIndex];
  return lower.multiplier + (upper.multiplier - lower.multiplier) * (referenceYieldTPerHa - lower.yieldTPerHa) / (upper.yieldTPerHa - lower.yieldTPerHa);
}
/** @param {number} referenceYieldTPerHa @param {boolean} [widerRows] */
export function applyWideRowAdjustment(referenceYieldTPerHa, widerRows = true) {
  return finiteResultNumber(referenceYieldTPerHa * wideRowMultiplier(referenceYieldTPerHa, widerRows), 'Final grain yield', 0);
}
