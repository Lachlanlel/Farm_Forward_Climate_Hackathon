import { ROOT_DISPLAY, SOIL_DISPLAY_DEPTH, SOIL_LAYERS } from './visualTokens';
import { resolveRootCondition, type RootConditionState } from './rootCondition';

export type SoilLayerId = typeof SOIL_LAYERS[number]['id'];
/** Renderer input only. A future model adapter supplies normalised development
 * and access; this module invents no depth in metres, biology or weekly curve. */
export interface RootPresentationState extends Partial<RootConditionState> {
  rootReveal: number;
  // Optional adapter-supplied developed depth, normalised to display depth.
  // No unvalidated metre conversion or week thresholds here.
  developedDepth?: number;
  layerAccess: Record<SoilLayerId, boolean | number>; // explicit accessible fraction, 0..1
}
export const ROOT_PREVIEW: RootPresentationState = {
  rootReveal: 1, rootSenescence: 0, layerAccess: { topsoil: true, rootZone: true, deepSoil: true },
}; // Explicit all-layer asset preview, not a claim of model root access.
export const ROOT_DISPLAY_DEPTH = SOIL_DISPLAY_DEPTH * ROOT_DISPLAY.profileFraction;

export function resolveRootPresentation(state: RootPresentationState) {
  const condition = resolveRootCondition(state.rootSenescence);
  if (!Number.isFinite(state.rootReveal) || state.rootReveal < 0 || state.rootReveal > 1)
    throw new RangeError('Root reveal must be a finite display-test value from 0 to 1.');
  let accessibleDepth = 0;
  const developedDepth = state.developedDepth ?? 1;
  if (!Number.isFinite(developedDepth) || developedDepth < 0 || developedDepth > 1)
    throw new RangeError('Developed root depth must be normalised from 0 to 1.');
  for (const layer of SOIL_LAYERS) {
    const access = state.layerAccess[layer.id];
    if (typeof access !== 'boolean' && (typeof access !== 'number' || !Number.isFinite(access) || access < 0 || access > 1))
      throw new TypeError('Explicit boolean or 0..1 root layer access is required.');
  }
  // Access is contiguous from the crown: never jump through a forbidden layer.
  for (const layer of SOIL_LAYERS) {
    const access = state.layerAccess[layer.id];
    const fraction = typeof access === 'boolean' ? Number(access) : access;
    accessibleDepth += layer.thickness * fraction;
    if (fraction < 1) break;
  }
  const reveal = Math.min(state.rootReveal, developedDepth, accessibleDepth / ROOT_DISPLAY_DEPTH);
  return { requestedReveal: state.rootReveal, reveal, displayDepth: reveal * ROOT_DISPLAY_DEPTH,
    accessibleDepth, developedDepth, layerAccess: { ...state.layerAccess }, condition };
}
