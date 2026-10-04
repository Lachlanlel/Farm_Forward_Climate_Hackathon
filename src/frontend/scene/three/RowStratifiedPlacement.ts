import { MAX_CROP_UNITS, WHEAT_PLACEMENT } from './visualTokens';
import type { VisualFootprint } from './visualAdapter';
import type { WheatPlantingState } from '../simulation/types';

// A representative visual spacing, not a calibrated sowing prescription.
export const WIDER_ROW_SPACING_MULTIPLIER = 2.4;

// Small seeded PRNG. Each row/slot gets its own stream, so area changes do not
// change the cosmetic identity of matching row/slot indices.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CropSlot {
  row: number; column: number; x: number; z: number;
  template: number; yaw: number; height: number; width: number; front: boolean;
}

export function sampleCropRows(footprint: VisualFootprint, seed: number = WHEAT_PLACEMENT.seed,
  planting: WheatPlantingState = { widerRows: false }) {
  const s = WHEAT_PLACEMENT, width = footprint.width - s.edgeInset * 2, depth = footprint.depth - s.edgeInset * 2;
  const rowSpacing = s.rowSpacing * (planting.widerRows ? WIDER_ROW_SPACING_MULTIPLIER : 1);
  let rows = Math.ceil(depth / rowSpacing), columns = Math.ceil(width / s.slotSpacing);
  // Uniformly enlarge cells only if future settings exceed the safety guard.
  while (rows * columns > MAX_CROP_UNITS) {
    if (rows / depth > columns / width) rows--; else columns--;
  }
  const dx = width / columns, dz = depth / rows, slots: CropSlot[] = [];
  for (let row = 0; row < rows; row++) {
    const rowRandom = seededRandom(seed ^ Math.imul(row + 1, 0x9e3779b9));
    const order = [0, 1, 2];
    for (let i = 2; i > 0; i--) { const j = Math.floor(rowRandom() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const offset = (rowRandom() - .5) * .12;
    for (let column = 0; column < columns; column++) {
      const random = seededRandom(seed ^ Math.imul(row * 4096 + column + 1, 0x85ebca6b));
      const x = -width / 2 + (column + .5 + offset + (random() - .5) * s.jitterX) * dx;
      const distance = (row + .5 + (random() - .5) * s.jitterZ) * dz;
      // Exactly one crop unit in every stratum. No rejection, centre weighting,
      // density lottery or random omissions that leave unplanted holes.
      slots.push({ row, column, x, z: depth / 2 - distance, template: order[column % 3],
        yaw: .35 + (random() - .5) * s.rotationSpread,
        height: 1 + (random() + random() - 1) * s.heightSpread / 2,
        width: 1 + (random() + random() - 1) * s.widthSpread / 2,
        front: distance < s.frontInspectionDepth });
    }
  }
  return { slots, rows, columns, dx, dz, usableWidth: width, usableDepth: depth, seed };
}
