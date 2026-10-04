// Presentation fixtures only. Replace this source with a backend response later;
// components consume the same snapshot shape and never derive drought values.
export const mockSimulation = Object.freeze({
  scenario: { droughtSeverity: 'severe' },
  simulation: {
    timeStep: null,
    soilMoisture: null,
    wheatHealth: null,
    yieldPotential: null
  },
  strategies: [
    {
      id: 'stubble-retention',
      name: 'Stubble retention',
      description: 'Leave crop residue from the previous harvest on the soil surface.',
      icon: 'stubble'
    },
    {
      id: 'wider-rows',
      name: 'Wider Row Spacing',
      description: 'Increase spacing between wheat rows. This can suit very low-yield conditions and improve stubble handling, but may reduce yield potential in better seasons.',
      icon: 'rows'
    }
  ]
});

export function getMockSimulationSnapshot(savedFarm) {
  return {
    farm: {
      location: savedFarm?.farmLocation ?? null,
      paddockSizeHa: savedFarm?.paddockSizeHa ?? null,
      soilType: savedFarm?.soilType ?? null,
      waterSource: savedFarm?.waterSupply ?? null
    },
    scenario: mockSimulation.scenario,
    simulation: mockSimulation.simulation,
    strategies: mockSimulation.strategies
  };
}
