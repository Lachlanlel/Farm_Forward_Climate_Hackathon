/** Visual-only response to decline from the official starting baseline.
 * These weights are presentation choices, not agronomic coefficients.
 * No adaptation/scenario branches and no model values are written here.
 */
interface ConditionScores { soilWaterIndex: number; plantGrowthIndex: number }
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function conditionPresentation(current: ConditionScores, baseline: ConditionScores) {
  // A zero starting score cannot decline further; avoid 0/0 and preserve Day 0.
  const ratio = (value: number, start: number) => start > 0 ? clamp(value / start) : 1;
  const rootCondition = .7 * ratio(current.soilWaterIndex, baseline.soilWaterIndex)
    + .3 * ratio(current.plantGrowthIndex, baseline.plantGrowthIndex);
  return {
    rootStress: clamp(1 - rootCondition),
    plantStress: clamp((baseline.plantGrowthIndex - current.plantGrowthIndex) / Math.max(baseline.plantGrowthIndex, 1))
  };
}
