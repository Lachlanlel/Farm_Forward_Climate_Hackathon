import { deepFreeze } from '../../shared/baseline-contract.js';

// Context snapshot for setup and the v1 scenario. The official baseline stays immutable.
export function createSimulationContext(baseline, farm, settings) {
  return deepFreeze({
    baseline,
    settings: {
      droughtIntensity: settings.droughtIntensity,
      farm: { paddockSizeHa: farm.paddockSizeHa, soilType: farm.soilType, waterSupply: farm.waterSupply },
      adaptations: { stubbleRetention: settings.selectedStrategies.includes('stubble-retention'), widerRows: settings.selectedStrategies.includes('wider-rows') }
    },
    timeline: [
      { week: 0, type: 'official-baseline' },
      ...[4, 8, 12].map(week => ({ week, type: 'farm-forward-projection', rainfallStress: null, plantAvailableWater: null, soilWaterStress: null, cropStress: null, plantGrowthRelative: null, yieldPotential: null }))
    ]
  });
}
