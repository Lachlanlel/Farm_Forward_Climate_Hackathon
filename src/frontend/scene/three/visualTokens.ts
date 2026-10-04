/** PROVISIONAL presentation tokens. Not an approved palette or physical depths.
 * Visual System, sections 5–6. One central place for placeholder styling.
 */
export const tokens = {
  environment: { background: '#f6f5f1', daylight: '#ffffff', groundFill: '#dbd8d0' },
  crop: { placeholder: '#78845b', wheatA: '#6f844c' },
  roots: { base: '#d4bf96' }, // Provisional warm pale tan; opaque, never emissive.
  // Agricultural earth, even when dry: organic warm topsoil, neutral root zone,
  // muted grey-brown deep soil. Values stay close enough for wetness to read.
  soil: { topsoil: '#947b68', rootZone: '#998a7a', deepSoil: '#948a82' },
  soilGrain: { frequency: 3.4, topsoil: .05, rootZone: .04, deepSoil: .03 },
  boundary: '#84735f',
  material: { roughness: 1, metalness: 0 },
  lighting: { hemisphereIntensity: 2.0, directionalIntensity: 2.3 },
} as const;

// Fixed educational depths, in scene units; no geological depth is asserted.
export const SOIL_LAYERS = [
  { id: 'topsoil', name: 'Topsoil', thickness: 0.975, color: tokens.soil.topsoil },
  { id: 'rootZone', name: 'Root Zone', thickness: 1.875, color: tokens.soil.rootZone },
  { id: 'deepSoil', name: 'Deep Soil', thickness: 1.65, color: tokens.soil.deepSoil },
] as const;

export const SOIL_DISPLAY_DEPTH = SOIL_LAYERS.reduce((sum, layer) => sum + layer.thickness, 0);
export const ROOT_DISPLAY = {
  structureCount: 8, profileFraction: 0.96,
  targetSpacing: 2.10, // Representative systems per displayed face length, never raw hectares.
  minimumSpacing: 1.05, crownEdgeMargin: 0.95, stratumJitter: 0.34,
  sideCrownEdgeMargin: 0.35, // Small crown margin; branches retain full face-bound clipping.
  minFrontCount: 3, maxFrontCount: 16, minSideCount: 2, maxSideCount: 12,
  candidateAttempts: 4,
  fragmentMinLength: 0.75, fragmentMinPieces: 5, fragmentJoinTolerance: 0.028,
  inspectionDepth: 1.35, // Crown-placement band; soil is never excavated.
  sectionDepth: 0.90, // Thin source sampling slab, independent of crown placement.
  edgeInset: 0.015, // Face stencils preserve original 3D branch depth; no projection offset.
} as const;
export const ASSET_TO_SCENE_SCALE = 1; // Fixed; 0.90 trial weakened readability. Never multiply by farm area.
export const MAX_CROP_UNITS = 2400; // Safety guard; four represented plants per planted slot.
export const MAX_CROP_DISPLAY_HEIGHT = 1.14; // Variants + cosmetic height variation; no camera interaction change.
// One evenly planted field; density does not depend on front/middle/rear or camera.
export const WHEAT_PLACEMENT = {
  seed: 0x51a7c0de,
  rowSpacing: 0.58,
  slotSpacing: 0.64,
  edgeInset: 0.30,
  jitterX: 0.24,
  jitterZ: 0.20,
  rotationSpread: 0.98,
  heightSpread: 0.12,
  widthSpread: 0.05,
  frontInspectionDepth: 1.25,
  nearDistance: 18,
  farDistance: 29,
  lodHysteresis: 1.2,
} as const;

// Independent horizontal presentation settings, compressed in successive review
// passes. A smooth logarithm avoids flat saturated size bands.
// These hectare anchors tune representation only; they are not model limits.
export const VISUAL_FOOTPRINT = {
  minimumSide: 11.48,
  referenceAreaHa: 500,
  referenceSide: 24 * 2 ** 0.25 * 0.82,
  responseAreaHa: 30,
  horizontalDisplayScale: 0.82 * 0.88, // Additional 12% reduction from the preceding footprint.
} as const;

// Only the prototype control's demonstration range; final product bounds pending.
export const PROTOTYPE_AREA_RANGE = { min: 1, max: 10_000 } as const;
