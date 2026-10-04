// Farm Forward's interpretive labels, never official future NSW CDI phases.
// Shared so fractional playback labels describe the same displayed scores.
export function projectedCondition(frame) {
  const values = [frame.rainfallIndex, frame.soilWaterIndex, frame.plantGrowthIndex];
  if (values.every(value => value < 5)) return 'Intense Drought-like';
  if (values.some(value => value < 5)) return 'Drought-like';
  if (values.some(value => value < 30)) return 'Drought Affected-like';
  if (values.every(value => value > 50)) return 'Non-Drought-like';
  return 'Recovery-like';
}
