// @ts-check
/** @typedef {import('./results-types.js').CompletedRun} CompletedRun */
/** @typedef {import('./results-types.js').ResultsResponse} ResultsResponse */
export const RESULTS_CONTRACT_VERSION = '1';

export class ResultsError extends Error {
  /** @param {string} code @param {string} message @param {number} [status] */
  constructor(code, message, status = 400) { super(message); this.name = 'ResultsError'; this.code = code; this.status = status; }
}
/** @param {unknown} value @param {string} name @param {number} [min] @param {number} [max] @returns {number} */
export function finiteResultNumber(value, name, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new ResultsError('invalid-results-input', `${name} must be a finite number between ${min} and ${max}.`);
  return value;
}
/** @param {unknown} value @returns {asserts value is import('./results-types.js').Adaptations} */
export function validateAdaptations(value) {
  const v = /** @type {any} */ (value);
  if (!v || typeof v.stubbleRetention !== 'boolean' || typeof v.widerRows !== 'boolean')
    throw new ResultsError('invalid-adaptations', 'Valid stubble and wider-row selections are required.');
}
/** Validate storage/JSON as untrusted input. Server additionally reproduces every index.
 * @param {unknown} value @returns {asserts value is CompletedRun} */
export function validateCompletedRun(value) {
  const v = /** @type {any} */ (value);
  if (!v || typeof v !== 'object') throw new ResultsError('missing-completed-run', 'Complete a simulation before viewing Results.');
  if (v.contractVersion !== RESULTS_CONTRACT_VERSION) throw new ResultsError('incompatible-run', 'This saved run uses an incompatible Results contract. Run the simulation again.', 409);
  if (v.completedDay !== 84) throw new ResultsError('incomplete-run', 'This simulation has not reached Week 12.');
  finiteResultNumber(v.farmAreaHa, 'Farm hectares', 1, 10000);
  for (const name of ['simulationModelVersion', 'resultsModelVersion', 'assumptionsVersion', 'configurationIdentity'])
    if (typeof v[name] !== 'string' || !v[name]) throw new ResultsError('incompatible-run', 'The saved run is missing model/assumption identity.', 409);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.simulationStartDate)) throw new ResultsError('invalid-run-date', 'The run date is invalid.');
  finiteResultNumber(v.location?.latitude, 'Latitude', -37.7, -28.1);
  finiteResultNumber(v.location?.longitude, 'Longitude', 140.9, 153.7);
  if (!['moderate', 'severe', 'extreme'].includes(v.scenario?.droughtIntensity) || !['clay', 'sandy'].includes(v.scenario?.soilType) || !['rainfed', 'irrigated'].includes(v.scenario?.waterSupply))
    throw new ResultsError('invalid-run-scenario', 'The saved soil, water or severity selection is invalid.');
  validateAdaptations(v.scenario.adaptations);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.baselineIdentity?.snapshotDate) || typeof v.baselineIdentity.spatialAreaId !== 'string' || !v.baselineIdentity.spatialAreaId || !v.baselineIdentity.sourceChecksums || typeof v.baselineIdentity.sourceChecksums !== 'object' || !Object.keys(v.baselineIdentity.sourceChecksums).length || Object.values(v.baselineIdentity.sourceChecksums).some(n => typeof n !== 'string' || !/^[a-f0-9]{64}$/.test(n)))
    throw new ResultsError('missing-baseline-identity', 'The saved run is missing its official CDI snapshot identity.');
  for (const group of ['officialStartingIndices', 'projectedEnd'])
    for (const key of ['rainfallIndex', 'soilWaterIndex', 'plantGrowthIndex']) finiteResultNumber(v[group]?.[key], `${group}.${key}`, 0, 100);
}
/** Validate API output before rendering; never substitute fixtures on failure.
 * @param {unknown} value @returns {asserts value is ResultsResponse} */
export function validateResultsResponse(value) {
  const v = /** @type {any} */ (value);
  if (v?.status !== 'ready' || v.contractVersion !== RESULTS_CONTRACT_VERSION) throw new ResultsError('invalid-results-response', 'Results returned an incompatible response.');
  validateCompletedRun(v.run);
  if (!v.baselineCDI?.official || !Array.isArray(v.comparisons) || v.comparisons.length !== 3 || !Array.isArray(v.sources) || !Array.isArray(v.warnings)) throw new ResultsError('invalid-results-response', 'Results returned incomplete data.');
  if (v.comparisons.map(/** @param {any} c */ c => c.id).join(',') !== 'stubble,wider,combined') throw new ResultsError('invalid-results-response', 'Results comparisons are incomplete.');
  for (const m of [v.finalMetrics, ...v.comparisons.map(/** @param {any} c */ c => c.metrics)]) {
    if (!m || !['available', 'unavailable', 'not-applicable', 'research-informed-scenario-assumption'].includes(m.costStatus) || !Array.isArray(m.missingCostStrategies) || !Array.isArray(m.costBasis)) throw new ResultsError('invalid-results-response', 'Results metrics are incomplete.');
    if (m.costStatus === 'research-informed-scenario-assumption' && !m.costBasis.length) throw new ResultsError('invalid-results-response', 'Implementation cost requires basis metadata.');
    for (const basis of m.costBasis) {
      if (!basis || !['stubble-retention', 'wider-rows'].includes(basis.strategyId) || basis.status !== 'research-informed-scenario-assumption' || typeof basis.basis !== 'string' || !basis.basis || typeof basis.sourceUrl !== 'string' || !basis.sourceUrl)
        throw new ResultsError('invalid-results-response', 'Implementation cost basis metadata is incomplete.');
      finiteResultNumber(basis.valueAudPerHa, 'Implementation cost allowance per hectare', 0);
    }
    for (const name of ['normalYieldTPerHa', 'droughtBaselineYieldTPerHa', 'referenceYieldTPerHa', 'finalYieldTPerHa', 'wideRowMultiplier', 'farmAreaHa', 'normalProductionT', 'droughtBaselineProductionT', 'finalProductionT', 'cropSavedT', 'yieldLossPercent', 'revenueAfterDroughtAud', 'grossValueProtectedAud']) finiteResultNumber(m[name], name);
    for (const name of ['strategyCostAud', 'netBenefitAud']) {
      if (m.costStatus === 'unavailable' ? m[name] !== null : typeof m[name] !== 'number') throw new ResultsError('invalid-results-response', 'Unavailable implementation cost must not produce a net benefit.');
      if (m[name] !== null) finiteResultNumber(m[name], name);
    }
  }
  finiteResultNumber(v.assumptions?.normalYieldTPerHa, 'Reference yield', Number.MIN_VALUE);
  finiteResultNumber(v.assumptions?.wheatPriceAudPerTonne, 'Wheat price', Number.MIN_VALUE);
}
