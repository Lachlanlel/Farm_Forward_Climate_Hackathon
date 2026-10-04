/** Shrink/swell art direction, not fracture mechanics or a water-balance model.
 * Targets depend on displayed topsoil only. No particle/activity switches.
 */
export function targetCrackSeverity(soilType: 'clay' | 'sandy', topsoilMoisture: number) {
  if (soilType === 'sandy') return 0;
  const dryness = Math.max(0, Math.min(1, (.50 - topsoilMoisture) / .42));
  return dryness * dryness * (3 - 2 * dryness);
}

export function createCrackPlayback(water: { at(day: number): { moisture: { topsoil: number } } }, soilType: 'clay' | 'sandy') {
  // Bake a damped VISUAL response on the master timeline. Sampling is reversible
  // and independent of frame rate, pause length or how often a slider is moved.
  const step = .25, samples = [0];
  for (let day = step; day <= 84; day += step) {
    const target = targetCrackSeverity(soilType, water.at(day).moisture.topsoil);
    const previous = samples.at(-1)!;
    const responseDays = target < previous ? 1.5 : 3;
    samples.push(previous + (target - previous) * (1 - Math.exp(-step / responseDays)));
  }
  return {
    at(simulationDay: number) {
      const position = Math.max(0, Math.min(84, simulationDay)) / step;
      const left = Math.floor(position), right = Math.min(samples.length - 1, left + 1);
      return samples[left] + (samples[right] - samples[left]) * (position - left);
    }
  };
}
