import { FARM_FORWARD_MODEL_V1 } from './farm-forward-model-v1.js';
export { projectedCondition } from '../../shared/projected-condition.js';
const MODEL = FARM_FORWARD_MODEL_V1;

const clamp = value => Math.min(100, Math.max(0, value));
const indexKeys = ['rainfallIndex', 'soilWaterIndex', 'plantGrowthIndex'];
export function projectScenario(input) {
  const { baselineCDI, droughtIntensity, soilType, waterSupply, adaptations = {} } = input || {};
  if (!baselineCDI?.official || indexKeys.some(key => !Number.isFinite(baselineCDI[key]) || baselineCDI[key] < 0 || baselineCDI[key] > 100)) throw new TypeError('Complete official NSW CDI baseline required.');
  const severity = MODEL.drought[droughtIntensity];
  const soil = MODEL.soil[soilType];
  const water = MODEL.waterSupply[waterSupply === 'rain-fed' ? 'rainfed' : waterSupply];
  if (!severity || !soil || !water || typeof adaptations.stubbleRetention !== 'boolean' || typeof adaptations.widerRows !== 'boolean') throw new TypeError('Valid drought, soil, water and adaptation selections required.');
  const B_RI = baselineCDI.rainfallIndex, B_SWI = baselineCDI.soilWaterIndex, B_PGI = baselineCDI.plantGrowthIndex;
  const riLoss = Math.max(B_RI - severity.rainfallTarget, B_RI * severity.minimumDecline);
  const swiLoss = Math.max(B_SWI - severity.soilWaterTarget, B_SWI * severity.minimumDecline);
  const irrigationProtection = water.soilWaterProtection;
  const stubbleProtection = adaptations.stubbleRetention ? MODEL.adaptations.stubbleRetention.soilWaterProtection : 0;
  const protectedFraction = 1 - (1 - irrigationProtection) * (1 - stubbleProtection);
  const rainfallIndex = clamp(B_RI - riLoss);
  const soilWaterIndex = clamp(B_SWI - swiLoss * soil.waterLossMultiplier * (1 - protectedFraction));
  const stressSignal = MODEL.projection.soilWeightInPlantStress * soilWaterIndex + MODEL.projection.rainfallWeightInPlantStress * rainfallIndex;
  const plantGrowthIndex = clamp(B_PGI + severity.plantResponse * (stressSignal - B_PGI));
  return Object.freeze({ modelVersion: MODEL.version, durationDays: MODEL.durationDays, playbackDurationSeconds: MODEL.playbackDurationSeconds,
    baseline: Object.freeze({ rainfallIndex: B_RI, soilWaterIndex: B_SWI, plantGrowthIndex: B_PGI }),
    projectedEnd: Object.freeze({ rainfallIndex, soilWaterIndex, plantGrowthIndex }),
    scenario: Object.freeze({ droughtIntensity, soilType, waterSupply: waterSupply === 'rain-fed' ? 'rainfed' : waterSupply,
      adaptations: Object.freeze({ stubbleRetention: adaptations.stubbleRetention, widerRows: adaptations.widerRows }) }) });
}

export function sampleProjection(projection, simulationDay) {
  if (!Number.isFinite(simulationDay)) throw new TypeError('Simulation day must be finite.');
  const progress = Math.min(1, Math.max(0, simulationDay / MODEL.durationDays));
  const smoothProgress = progress * progress * (3 - 2 * progress);
  const values = Object.fromEntries(indexKeys.map(key => [key, clamp(projection.baseline[key] + (projection.projectedEnd[key] - projection.baseline[key]) * smoothProgress)]));
  return { simulationDay: progress * MODEL.durationDays, ...values };
}
