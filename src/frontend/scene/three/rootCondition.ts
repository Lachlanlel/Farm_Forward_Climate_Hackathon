/** Supplied visual condition of existing roots, independent of root reach.
 * Natural ageing/drought contributions and scientific timing are model-owned. */
export interface RootConditionState { rootSenescence: number }

export const ROOT_CONDITION_DISPLAY = {
  healthyColour: '#dfcfb1',
  colourStart: .08, colourFull: .95, senescentColour: '#b7a184',
  fadeStart: .35, fadeFull: 1, fineOpacityFloor: .65, secondaryOpacityFloor: .95,
} as const;

// Paired VISUAL REVIEW states only; not a crop-stress-to-root model relationship.
export const ROOT_CONDITION_PRESETS = [
  { id: 'A', cropStress: 0, rootSenescence: 0 },
  { id: 'B', cropStress: .50, rootSenescence: .20 },
  { id: 'C', cropStress: .85, rootSenescence: .60 },
  { id: 'D', cropStress: 1, rootSenescence: .85 },
] as const;

const smooth = (x: number, min: number, max: number) => {
  const t = Math.max(0, Math.min(1, (x - min) / (max - min)));
  return t * t * (3 - 2 * t);
};
export function resolveRootCondition(rootSenescence = 0) {
  if (!Number.isFinite(rootSenescence) || rootSenescence < 0 || rootSenescence > 1)
    throw new RangeError('Root senescence must be a finite supplied visual value from 0 to 1.');
  const display = ROOT_CONDITION_DISPLAY;
  const fading = smooth(rootSenescence, display.fadeStart, display.fadeFull);
  return { rootSenescence,
    colourBlend: smooth(rootSenescence, display.colourStart, display.colourFull),
    fineOpacity: 1 - (1 - display.fineOpacityFloor) * fading,
    secondaryOpacity: 1 - (1 - display.secondaryOpacityFloor) * fading,
    principalOpacity: 1 };
}
