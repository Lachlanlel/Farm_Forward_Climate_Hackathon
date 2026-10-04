// Farm Forward educational scenario assumptions; these are not NSW CDI coefficients.
export const FARM_FORWARD_MODEL_V1 = Object.freeze({
  version: '1.0-hackathon', durationDays: 84, playbackDurationSeconds: 24,
  drought: {
    moderate: { rainfallTarget: 20, soilWaterTarget: 25, evapDemandMultiplier: 1.10, plantResponse: .65, minimumDecline: .05 },
    severe: { rainfallTarget: 5, soilWaterTarget: 7.5, evapDemandMultiplier: 1.20, plantResponse: .85, minimumDecline: .10 },
    extreme: { rainfallTarget: 2, soilWaterTarget: 2.5, evapDemandMultiplier: 1.30, plantResponse: .95, minimumDecline: .15 }
  },
  soil: { clay: { waterLossMultiplier: .90 }, sandy: { waterLossMultiplier: 1.10 } },
  waterSupply: { rainfed: { soilWaterProtection: 0 }, irrigated: { soilWaterProtection: .35 } },
  adaptations: {
    stubbleRetention: { rainfallEffect: 0, soilWaterProtection: .15, directImplementationCostPerHa: 0, costStatus: 'placeholder' },
    widerRows: { rainfallEffect: 0, soilWaterProtection: 0, directPGIEffect: 0, referenceRowSpacingCm: 18, scenarioRowSpacingCm: 30, directImplementationCostPerHa: 0, costStatus: 'placeholder', yieldResponse: [
      { yieldTPerHa: 1, multiplier: 1.03 }, { yieldTPerHa: 2, multiplier: .975 }, { yieldTPerHa: 4, multiplier: .9525 }, { yieldTPerHa: 6, multiplier: .9433 }
    ] }
  },
  projection: { soilWeightInPlantStress: .65, rainfallWeightInPlantStress: .35 }
});
