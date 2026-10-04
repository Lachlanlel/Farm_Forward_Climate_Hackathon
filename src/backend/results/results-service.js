// @ts-check
import { lookupBaseline } from '../services/cdi-lookup-service.js';
import { projectScenario } from '../simulation/project-scenario.js';
import { FARM_FORWARD_MODEL_V1 } from '../simulation/farm-forward-model-v1.js';
import { RESULTS_ASSUMPTIONS, RESULTS_MODEL_VERSION, RESULTS_SOURCES } from './assumptions.js';
import { referenceYieldFromSwiLoss } from './yield-model.js';
import { calculateResults } from './economics.js';
import { finiteResultNumber, RESULTS_CONTRACT_VERSION, ResultsError, validateCompletedRun, validateResultsResponse } from '../../shared/results-contract.js';
/** @typedef {import('../../shared/results-types.js').OfficialBaseline} OfficialBaseline */
/** @typedef {import('../../shared/results-types.js').Projection} Projection */
/** @typedef {import('../../shared/results-types.js').RunDescriptor} RunDescriptor */
/** @typedef {import('../../shared/results-types.js').ResultsResponse} ResultsResponse */

/** Stable serialization pins values as well as version labels.
 * @param {any} value @returns {string} */
function canonicalResultsJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalResultsJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalResultsJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
/** @type {Promise<string> | undefined} */
let configurationIdentity;
function resultsConfigurationIdentity() {
  return configurationIdentity ??= (async () => {
    const data = new TextEncoder().encode(canonicalResultsJson({ simulation: FARM_FORWARD_MODEL_V1, resultsModel: RESULTS_MODEL_VERSION, assumptions: RESULTS_ASSUMPTIONS }));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), n => n.toString(16).padStart(2, '0')).join('');
  })();
}

/** Server-issued reproducible descriptor; not a claim of server-observed playback.
 * @param {OfficialBaseline} baselineCDI @param {Projection} projection @param {number} farmAreaHa
 * @returns {Promise<RunDescriptor>} */
export async function createRunDescriptor(baselineCDI, projection, farmAreaHa) {
  finiteResultNumber(farmAreaHa, 'Farm hectares', 1, 10000);
  const descriptor = {
    contractVersion: RESULTS_CONTRACT_VERSION,
    simulationModelVersion: projection.modelVersion, resultsModelVersion: RESULTS_MODEL_VERSION,
    assumptionsVersion: RESULTS_ASSUMPTIONS.version, configurationIdentity: await resultsConfigurationIdentity(),
    simulationStartDate: baselineCDI.simulationStartDate, farmAreaHa,
    location: baselineCDI.location, scenario: projection.scenario,
    baselineIdentity: { snapshotDate: baselineCDI.snapshotDate, spatialAreaId: baselineCDI.spatialArea.id,
      sourceChecksums: /** @type {Record<string, string>} */ (baselineCDI.source.checksums) },
    officialStartingIndices: projection.baseline, projectedEnd: projection.projectedEnd
  };
  validateCompletedRun({ ...descriptor, completedDay: 84 });
  return structuredClone(descriptor);
}

/** Server-only config cannot be overridden by the request/localStorage. */
function validateResultsAssumptions() {
  finiteResultNumber(RESULTS_ASSUMPTIONS.normalYieldTPerHa, 'Normal/reference yield assumption', Number.MIN_VALUE);
  finiteResultNumber(RESULTS_ASSUMPTIONS.wheatPriceAudPerTonne, 'Wheat price assumption', Number.MIN_VALUE);
  for (const key of /** @type {const} */ (['moderate', 'severe', 'extreme'])) finiteResultNumber(RESULTS_ASSUMPTIONS.baseDroughtLoss[key], `${key} yield-loss assumption`, 0, 1);
  for (const [key, evidence] of /** @type {const} */ ([['stubbleCostPerHa', 'stubble'], ['widerRowsCostPerHa', 'wider']])) {
    const cost = RESULTS_ASSUMPTIONS.strategyCosts[key];
    if (cost !== null) {
      finiteResultNumber(cost, key === 'stubbleCostPerHa' ? 'Stubble implementation cost per hectare' : 'Wider-row implementation cost per hectare', 0);
      if (!RESULTS_ASSUMPTIONS.costEvidence[evidence]) throw new ResultsError('invalid-cost-assumption', 'Configured implementation cost requires an evidence/context source.', 422);
      const basis = RESULTS_ASSUMPTIONS.costBasis[evidence];
      if (basis.valueAudPerHa !== cost || basis.status !== RESULTS_ASSUMPTIONS.costStatus || !basis.basis || !basis.sourceUrl)
        throw new ResultsError('invalid-cost-assumption', 'Configured implementation cost requires consistent basis metadata.', 422);
    }
  }
}

/** Reproduce from server CDI/scenario; browser indices are compared, never trusted.
 * Reject refreshed snapshots/config rather than silently changing a completed run.
 * @param {{latestOnOrBefore: (date: string) => any}} repository @param {unknown} completedRun
 * @returns {Promise<ResultsResponse>} */
export async function calculateRunResults(repository, completedRun) {
  validateCompletedRun(completedRun);
  const run = completedRun;
  if (run.simulationModelVersion !== FARM_FORWARD_MODEL_V1.version || run.resultsModelVersion !== RESULTS_MODEL_VERSION || run.assumptionsVersion !== RESULTS_ASSUMPTIONS.version || run.configurationIdentity !== await resultsConfigurationIdentity())
    throw new ResultsError('stale-model-or-assumptions', 'The saved run uses different model or Results assumptions. Run the simulation again.', 409);
  validateResultsAssumptions();
  const baselineState = lookupBaseline(repository, { location: run.location, simulationStartDate: run.simulationStartDate });
  if (baselineState.status !== 'ready' || !baselineState.baselineCDI?.official) throw new ResultsError('official-baseline-unavailable', 'The official CDI baseline for this saved run is unavailable. Run the simulation again.', 422);
  const baselineCDI = /** @type {OfficialBaseline} */ (baselineState.baselineCDI);
  const projection = /** @type {Projection} */ (projectScenario({ baselineCDI, ...run.scenario }));
  const expected = await createRunDescriptor(baselineCDI, projection, run.farmAreaHa);
  if (canonicalResultsJson(run.baselineIdentity) !== canonicalResultsJson(expected.baselineIdentity)) throw new ResultsError('stale-cdi-snapshot', 'The official CDI snapshot identity changed. Run the simulation again.', 409);
  if (canonicalResultsJson(run.officialStartingIndices) !== canonicalResultsJson(expected.officialStartingIndices) || canonicalResultsJson(run.projectedEnd) !== canonicalResultsJson(expected.projectedEnd)) throw new ResultsError('run-reproduction-mismatch', 'The saved indices differ from the server-reproduced run. Run the simulation again.', 409);

  const yieldFor = (/** @type {Projection} */ p) => referenceYieldFromSwiLoss(RESULTS_ASSUMPTIONS.normalYieldTPerHa, p.baseline.soilWaterIndex, p.projectedEnd.soilWaterIndex, p.scenario.droughtIntensity, RESULTS_ASSUMPTIONS.baseDroughtLoss);
  // SAME official baseline, soil, water, severity and date, with adaptations off.
  // Irrigation is part of both scenarios, never a second Results yield bonus.
  const droughtProjection = /** @type {Projection} */ (projectScenario({ baselineCDI, ...run.scenario, adaptations: { stubbleRetention: false, widerRows: false } }));
  const droughtYield = yieldFor(droughtProjection).referenceYieldTPerHa;
  const metricsFor = (/** @type {Projection} */ p) => calculateResults({
    farmAreaHa: run.farmAreaHa, normalYieldTPerHa: RESULTS_ASSUMPTIONS.normalYieldTPerHa,
    droughtReferenceYieldTPerHa: droughtYield, adaptedReferenceYieldTPerHa: yieldFor(p).referenceYieldTPerHa,
    wheatPriceAudPerTonne: RESULTS_ASSUMPTIONS.wheatPriceAudPerTonne,
    adaptations: p.scenario.adaptations, strategyCosts: RESULTS_ASSUMPTIONS.strategyCosts,
    costStatus: RESULTS_ASSUMPTIONS.costStatus, costBasis: RESULTS_ASSUMPTIONS.costBasis
  });
  const configurations = /** @type {const} */ ([
    { id: 'stubble', name: 'Stubble retention', description: 'Residue reduces projected SWI loss. The yield calculation uses that SWI change once.', adaptations: { stubbleRetention: true, widerRows: false } },
    { id: 'wider', name: 'Wider Row Spacing', description: '18 cm → 30 cm rows: the calculated reference yield determines whether the research-based adjustment helps or hurts.', adaptations: { stubbleRetention: false, widerRows: true } },
    { id: 'combined', name: 'Combined strategy', description: 'Stubble changes the SWI trajectory; wider rows then adjust the resulting 18 cm reference yield.', adaptations: { stubbleRetention: true, widerRows: true } }
  ]);
  const comparisons = configurations.map(config => ({ ...config, metrics: metricsFor(/** @type {Projection} */ (projectScenario({ baselineCDI, ...run.scenario, adaptations: config.adaptations }))) }));
  const finalMetrics = metricsFor(projection);
  const warnings = ['Yield and economics are provisional educational scenario outputs, not official NSW observations or a calibrated farm forecast.'];
  if (finalMetrics.costStatus === 'unavailable') warnings.push('Implementation cost and incremental net benefit are unavailable.');
  if (finalMetrics.aboveNormalReference || comparisons.some(c => c.metrics.aboveNormalReference)) warnings.push('A research-based row adjustment exceeds the normal reference; the signed yield loss is retained.');
  const yieldDiagnostics = yieldFor(projection);
  if (yieldDiagnostics.bounded) warnings.push('The provisional 18 cm yield was bounded to the normal reference range.');
  const response = {
    status: /** @type {const} */ ('ready'), contractVersion: RESULTS_CONTRACT_VERSION,
    run: { ...expected, completedDay: 84 }, baselineCDI, projection, finalMetrics, comparisons,
    assumptions: structuredClone(RESULTS_ASSUMPTIONS), yieldDiagnostics,
    sources: structuredClone(RESULTS_SOURCES), warnings
  };
  validateResultsResponse(response);
  return response;
}
