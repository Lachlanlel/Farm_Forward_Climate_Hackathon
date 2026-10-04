// @ts-check
import { finiteResultNumber, validateAdaptations, ResultsError } from '../../shared/results-contract.js';
import { applyWideRowAdjustment, wideRowMultiplier } from './yield-model.js';

/** Pure calculation boundary; costs and their bases are supplied by server config.
 * @param {import('../../shared/results-types.js').ResultsInput} input
 * @returns {import('../../shared/results-types.js').Metrics} */
export function calculateResults(input) {
  if (!input) throw new ResultsError('invalid-results-input', 'Results inputs are required.');
  const area = finiteResultNumber(input.farmAreaHa, 'Farm hectares', 1, 10000);
  const normal = finiteResultNumber(input.normalYieldTPerHa, 'Normal/reference yield assumption', Number.MIN_VALUE);
  const drought = finiteResultNumber(input.droughtReferenceYieldTPerHa, 'Drought reference yield', 0);
  const reference = finiteResultNumber(input.adaptedReferenceYieldTPerHa, 'Adapted reference yield', 0);
  const price = finiteResultNumber(input.wheatPriceAudPerTonne, 'Wheat price assumption', Number.MIN_VALUE);
  validateAdaptations(input.adaptations);
  if (!input.strategyCosts) throw new ResultsError('invalid-cost-assumption', 'Implementation cost configuration is required.');
  for (const key of /** @type {const} */ (['stubbleCostPerHa', 'widerRowsCostPerHa'])) {
    const cost = input.strategyCosts[key];
    if (cost !== null) finiteResultNumber(cost, key === 'stubbleCostPerHa' ? 'Stubble implementation cost per hectare' : 'Wider-row implementation cost per hectare', 0);
  }
  const missingCostStrategies = [], selected = [];
  if (input.adaptations.stubbleRetention) selected.push({ id: 'stubble-retention', cost: input.strategyCosts.stubbleCostPerHa });
  if (input.adaptations.widerRows) selected.push({ id: 'wider-rows', cost: input.strategyCosts.widerRowsCostPerHa });
  for (const strategy of selected) if (strategy.cost === null) missingCostStrategies.push(strategy.id);
  const finalYieldTPerHa = applyWideRowAdjustment(reference, input.adaptations.widerRows);
  const normalProductionT = normal * area, droughtBaselineProductionT = drought * area, finalProductionT = finalYieldTPerHa * area;
  // Negative saved crop and losses are meaningful; do not clamp them away.
  const cropSavedT = finalProductionT - droughtBaselineProductionT;
  const grossValueProtectedAud = cropSavedT * price;
  const strategyCostAud = missingCostStrategies.length ? null : selected.reduce((total, strategy) => total + /** @type {number} */ (strategy.cost), 0) * area;
  const result = {
    farmAreaHa: area, normalYieldTPerHa: normal, droughtBaselineYieldTPerHa: drought, referenceYieldTPerHa: reference,
    finalYieldTPerHa, wideRowMultiplier: wideRowMultiplier(reference, input.adaptations.widerRows),
    normalProductionT, droughtBaselineProductionT, finalProductionT, cropSavedT,
    yieldLossPercent: (normal - finalYieldTPerHa) / normal * 100,
    revenueAfterDroughtAud: finalProductionT * price, grossValueProtectedAud, strategyCostAud,
    netBenefitAud: strategyCostAud === null ? null : grossValueProtectedAud - strategyCostAud,
    costStatus: /** @type {import('../../shared/results-types.js').Metrics['costStatus']} */ (missingCostStrategies.length ? 'unavailable' : selected.length ? input.costStatus ?? 'available' : 'not-applicable'),
    costBasis: input.costBasis ? [ ...(input.adaptations.stubbleRetention ? [input.costBasis.stubble] : []), ...(input.adaptations.widerRows ? [input.costBasis.wider] : []) ] : [],
    missingCostStrategies, aboveNormalReference: finalYieldTPerHa > normal
  };
  // Reject overflow/NaN instead of sending JSON null disguised as a valid number.
  for (const [key, value] of Object.entries(result)) if (typeof value === 'number') finiteResultNumber(value, key);
  return result;
}
