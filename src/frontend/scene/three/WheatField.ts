import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VisualFootprint } from './visualAdapter';
import { ASSET_TO_SCENE_SCALE, WHEAT_PLACEMENT, tokens } from './visualTokens';
import type { WheatFamily, WheatVariant } from './wheatAsset';
import { createCropClumpGeometry, createDistantWheatGeometry, CROP_TEMPLATES, TEMPLATE_MATRICES, VARIANTS, plantCropMetadata } from './WheatClumps';
import { sampleCropRows, seededRandom } from './RowStratifiedPlacement';
import { prepareCropGeometry, WheatCropVisual } from './WheatCropVisual';
import type { CropPresentationState } from './cropPresentation';
import type { WheatPlantingState } from '../simulation/types';

/** Primitive stem, two narrow leaves and one angular head: disposable placeholder.
 * Origin at ground contact, +Y up, forward +Z. Rest height = 1 scene unit.
 * Static illustration: neither a growth stage nor a crop-health model fixture.
 */
export function createPlaceholderWheatGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.013, 0.02, 0.78, 4, 1);
  stem.translate(0, 0.39, 0);
  const leafA = new THREE.BoxGeometry(0.035, 0.34, 0.015);
  leafA.rotateZ(-0.6);
  leafA.translate(0.09, 0.4, 0);
  const leafB = new THREE.BoxGeometry(0.035, 0.27, 0.015);
  leafB.rotateZ(0.6);
  leafB.translate(-0.07, 0.54, 0);
  const head = new THREE.OctahedronGeometry(1, 0);
  head.scale(0.065, 0.18, 0.04);
  head.translate(0, 0.82, 0);
  const parts = [stem, leafA, leafB, head].map((part, index) => {
    const geometry = part.index ? part.toNonIndexed() : part;
    geometry.setAttribute('_part_id', new THREE.BufferAttribute(new Float32Array(geometry.getAttribute('position').count).fill(index === 0 ? 0 : index === 3 ? 2 : 1), 1));
    return geometry;
  });
  const merged = mergeGeometries(parts)!;
  new Set([stem, leafA, leafB, head, ...parts]).forEach(part => part.dispose());
  prepareCropGeometry(merged, 'A', true);
  return merged;
}

type CropUnit = { template: number; front: boolean; position: THREE.Vector3; matrix: THREE.Matrix4; plants: THREE.Matrix4[]; level: number; cropMetadata: [number, number, number] };
export type WheatRootAnchor = { position: THREE.Vector3; variant: WheatVariant; slot: number; plant: number };

export class WheatField extends THREE.Group {
  private units: CropUnit[] = [];
  private individual: Record<WheatVariant, THREE.InstancedMesh>;
  private middle: THREE.InstancedMesh[];
  private distant: THREE.InstancedMesh[];
  private cropVisual: WheatCropVisual;

  constructor(footprint: VisualFootprint, asset?: WheatFamily, planting: WheatPlantingState = { widerRows: false }) {
    super(); this.name = 'WheatField';
    const sampled = sampleCropRows(footprint, WHEAT_PLACEMENT.seed, planting), templateCounts = [0, 0, 0], variantCounts = { A: 0, B: 0, C: 0 };
    const transform = new THREE.Object3D();
    sampled.slots.forEach(slot => {
      const random = seededRandom(sampled.seed ^ Math.imul(slot.row * 4096 + slot.column + 137, 0x165667b1));
      transform.position.set(slot.x, 0, slot.z); transform.rotation.set(0, slot.yaw, 0);
      transform.scale.set(slot.width * ASSET_TO_SCENE_SCALE, slot.height * ASSET_TO_SCENE_SCALE, slot.width * ASSET_TO_SCENE_SCALE);
      transform.updateMatrix(); const matrix = transform.matrix.clone();
      this.units.push({ template: slot.template, front: slot.front, position: new THREE.Vector3(slot.x, .45, slot.z), matrix,
        plants: TEMPLATE_MATRICES[slot.template].map(local => new THREE.Matrix4().multiplyMatrices(matrix, local)), level: slot.front ? 0 : 2,
        cropMetadata: [(random() - .5) * .032, .95 + random() * .10, (random() - .5) * 1.2] });
      templateCounts[slot.template]++;
      CROP_TEMPLATES[slot.template].forEach(part => variantCounts[part.variant]++);
    });
    const baseMaterial = asset?.material ?? new THREE.MeshStandardMaterial({ color: tokens.crop.placeholder, ...tokens.material, flatShading: true });
    this.cropVisual = new WheatCropVisual(baseMaterial);
    if (!asset) baseMaterial.dispose();
    const material = this.cropVisual.material;
    const placeholder = asset ? undefined : createPlaceholderWheatGeometry();
    const sources = asset?.geometries ?? { A: placeholder!, B: placeholder!, C: placeholder! };
    const addMesh = (name: string, geometry: THREE.BufferGeometry, capacity: number) => {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity); mesh.name = name; mesh.count = 0;
      geometry.setAttribute('cropInstanceState', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
      mesh.customDepthMaterial = this.cropVisual.depthMaterial;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = true; mesh.receiveShadow = true; this.add(mesh); return mesh;
    };
    this.individual = {
      A: addMesh('WheatAIndividuals', sources.A.clone(), variantCounts.A),
      B: addMesh('WheatBIndividuals', sources.B.clone(), variantCounts.B),
      C: addMesh('WheatCIndividuals', sources.C.clone(), variantCounts.C),
    };
    this.middle = templateCounts.map((count, template) => addMesh(`WheatMidTrio${template}`, createCropClumpGeometry(sources, template, 3), count));
    const simplified = asset
      ? Object.fromEntries(VARIANTS.map(v => [v, createDistantWheatGeometry(v)])) as Record<WheatVariant, THREE.BufferGeometry>
      : sources;
    this.distant = templateCounts.map((count, template) => addMesh(`WheatFarClump${template}`, createCropClumpGeometry(simplified, template, 4), count));
    if (asset) Object.values(simplified).forEach(g => g.dispose());
    placeholder?.dispose();
    this.userData.assetScale = ASSET_TO_SCENE_SCALE; this.userData.source = asset ? 'wheat_A/B/C.glb' : 'placeholder';
    this.userData.plantCount = this.units.length * 4;
    this.userData.placement = { widerRows: planting.widerRows, rows: sampled.rows, columns: sampled.columns, slotCount: this.units.length, plantsPerSlot: 4,
      seed: sampled.seed, rowPitch: sampled.dz, slotPitch: sampled.dx, edgeInset: WHEAT_PLACEMENT.edgeInset,
      variantCounts, templateCounts, heightRange: [.8836, 1.1183], widthRange: [.965, 1.046],
      density: this.units.length * 4 / (sampled.usableWidth * sampled.usableDepth) };
    this.flushMatrices();
  }

  setCropPresentation(state: CropPresentationState) { this.cropVisual.setState(state); }
  disposePresentation() { this.cropVisual.disposeShadow(); }

  updateForCamera(camera: THREE.PerspectiveCamera, canonical = false) {
    const { nearDistance: near, farDistance: far, lodHysteresis: h } = WHEAT_PLACEMENT;
    let changed = false;
    for (const unit of this.units) {
      const distance = unit.position.distanceTo(camera.position), old = unit.level;
      if (unit.front) unit.level = 0;
      else if (canonical) unit.level = distance < near ? 0 : distance < far ? 1 : 2;
      else if (unit.level === 0 && distance > near + h) unit.level = distance > far + h ? 2 : 1;
      else if (unit.level === 1) { if (distance < near - h) unit.level = 0; else if (distance > far + h) unit.level = 2; }
      else if (unit.level === 2 && distance < far - h) unit.level = distance < near - h ? 0 : 1;
      changed ||= unit.level !== old;
    }
    if (changed) this.flushMatrices();
  }

  /** Read-only access to actual planted crowns, independent of camera/LOD.
   * Root-specific selection belongs to rootPopulation, not crop placement. */
  rootCrownCandidates(): WheatRootAnchor[] {
    return this.units.flatMap((unit, slot) => unit.plants.map((m, plant) => ({
      position: new THREE.Vector3().setFromMatrixPosition(m),
      variant: CROP_TEMPLATES[unit.template][plant].variant, slot, plant,
    })));
  }

  private flushMatrices() {
    this.children.forEach(mesh => { (mesh as THREE.InstancedMesh).count = 0; });
    const levels = [0, 0, 0];
    const push = (mesh: THREE.InstancedMesh, matrix: THREE.Matrix4, metadata: [number, number, number]) => {
      const index = mesh.count++; mesh.setMatrixAt(index, matrix);
      (mesh.geometry.getAttribute('cropInstanceState') as THREE.InstancedBufferAttribute).setXYZ(index, ...metadata);
    };
    for (const unit of this.units) {
      const parts = CROP_TEMPLATES[unit.template]; levels[unit.level]++;
      const individualMetadata = (i: number): [number, number, number] => {
        const local = plantCropMetadata(unit.template, i);
        return [unit.cropMetadata[0] + local[0], unit.cropMetadata[1] * local[1], unit.cropMetadata[2] + local[2]];
      };
      if (unit.level === 0) parts.forEach((part, i) => push(this.individual[part.variant], unit.plants[i], individualMetadata(i)));
      else if (unit.level === 1) { push(this.middle[unit.template], unit.matrix, unit.cropMetadata); push(this.individual[parts[3].variant], unit.plants[3], individualMetadata(3)); }
      else push(this.distant[unit.template], unit.matrix, unit.cropMetadata);
    }
    let instances = 0, triangles = 0, draws = 0;
    this.children.forEach(object => {
      const mesh = object as THREE.InstancedMesh; mesh.visible = mesh.count > 0;
      if (mesh.count) { mesh.instanceMatrix.needsUpdate = true; mesh.geometry.getAttribute('cropInstanceState').needsUpdate = true; mesh.computeBoundingSphere(); instances += mesh.count; draws++;
        triangles += mesh.count * (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3; }
    });
    this.userData.instanceCount = instances;
    this.userData.lod = { nearUnits: levels[0], middleUnits: levels[1], farUnits: levels[2], renderInstances: instances, cropDrawCalls: draws, cropTriangles: triangles,
      representedPlants: this.units.length * 4 };
  }
}

export function createWheatField(footprint: VisualFootprint, asset?: WheatFamily, planting?: WheatPlantingState): WheatField { return new WheatField(footprint, asset, planting); }
