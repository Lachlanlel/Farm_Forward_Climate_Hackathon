import { projectedCondition } from '../../shared/projected-condition.js';
import { validateCompletedRun } from '../../shared/results-contract.js';

export async function loadProjection({ location, simulationStartDate, droughtIntensity, soilType, waterSupply, adaptations, farmAreaHa }, signal) {
  const response = await fetch('/api/simulation/project', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ location, simulationStartDate, droughtIntensity, soilType, waterSupply, adaptations, farmAreaHa })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || body.reason || 'The simulation is unavailable for this farm.');
  validateCompletedRun({ ...body.runDescriptor, completedDay: 84 });
  return body;
}

// A visual-time sample between backend-produced daily frames. No drought,
// soil-water or crop equations are run in this layer.
export function frameAtDay(samples, day) {
  const at = Math.min(84, Math.max(0, day));
  const lower = samples[Math.floor(at)];
  const upper = samples[Math.min(84, Math.ceil(at))];
  const fraction = at - Math.floor(at);
  const frame = {
    simulationDay: at,
    rainfallIndex: lower.rainfallIndex + (upper.rainfallIndex - lower.rainfallIndex) * fraction,
    soilWaterIndex: lower.soilWaterIndex + (upper.soilWaterIndex - lower.soilWaterIndex) * fraction,
    plantGrowthIndex: lower.plantGrowthIndex + (upper.plantGrowthIndex - lower.plantGrowthIndex) * fraction
  };
  return { ...frame, condition: at === 0 ? lower.condition : projectedCondition(frame) };
}
