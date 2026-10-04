import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import profiles from '../tools/blender/wheat_profiles.json';
import type { WheatVariant } from './wheatAsset';
import { prepareCropGeometry } from './WheatCropVisual';
import { seededRandom } from './RowStratifiedPlacement';
import { WHEAT_PLACEMENT } from './visualTokens';

export const VARIANTS: WheatVariant[] = ['A', 'B', 'C'];
export const CROP_TEMPLATES = [0, 1, 2].map(template =>
  [
    { x: -.17, z: .13, yaw: -.32, height: .94, width: 1.01, lean: .018 },
    { x: .14, z: .12, yaw: .29, height: 1.055, width: .99, lean: -.015 },
    { x: -.13, z: -.15, yaw: -.10, height: .99, width: 1.02, lean: -.012 },
    { x: .16, z: -.13, yaw: .49, height: 1.015, width: 1, lean: .015 },
  ].map((part, index) => ({ ...part,
    x: part.x + Math.sin(template * 2.1 + index) * .016,
    z: part.z + Math.cos(template * 1.7 + index) * .015,
    yaw: part.yaw + (template - 1) * .13,
    variant: VARIANTS[(template + index) % 3],
  })));

export const TEMPLATE_MATRICES = CROP_TEMPLATES.map(parts => parts.map(part => {
  const transform = new THREE.Object3D();
  transform.position.set(part.x, 0, part.z);
  transform.rotation.set(part.lean, part.yaw, -part.lean * .6);
  transform.scale.set(part.width, part.height, part.width);
  transform.updateMatrix(); return transform.matrix.clone();
}));

export function plantCropMetadata(template: number, plant: number): [number, number, number] {
  const random = seededRandom(WHEAT_PLACEMENT.seed ^ Math.imul(template * 4 + plant + 71, 0x27d4eb2d));
  return [(random() - .5) * .024, .97 + random() * .06, (random() - .5) * .8];
}

// Recipe-derived closed low-detail cereal, not a grass card or green surface.
// Same stem/leaf/head envelopes, fewer stem sides/leaf sections/grains; no awns.
export function createDistantWheatGeometry(variant: WheatVariant): THREE.BufferGeometry {
  const profile = profiles[variant], components: THREE.BufferGeometry[] = [];
  const runtime = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
  const centre = (z: number) => {
    const t = z / profile.stemHeight;
    return runtime(profile.curve[0] * t * t + profile.counterCurve[0] * Math.sin(Math.PI * t),
      profile.curve[1] * t * t + profile.counterCurve[1] * Math.sin(Math.PI * t), z);
  };
  const add = (geometry: THREE.BufferGeometry, part: number) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    const position = g.getAttribute('position'), bends = new Float32Array(position.count), ids = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const t = THREE.MathUtils.clamp((position.getY(i) - .08) / .92, 0, 1);
      bends[i] = t * t * (3 - 2 * t); ids[i] = part;
    }
    g.setAttribute('_bend_weight', new THREE.BufferAttribute(bends, 1));
    g.setAttribute('_part_id', new THREE.BufferAttribute(ids, 1)); components.push(g);
  };
  const tube = (a: THREE.Vector3, b: THREE.Vector3, bottom: number, top: number, part: number) => {
    const direction = b.clone().sub(a);
    const g = new THREE.CylinderGeometry(top, bottom, direction.length(), 3, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); add(g, part);
  };
  const stemHeights = [0, .25, .58, 1].map(t => t * profile.stemHeight);
  for (let i = 0; i < 3; i++) tube(centre(stemHeights[i]), centre(stemHeights[i + 1]), .0056 - i * .0008, .0048 - i * .0008, 0);
  for (const [z, length, width, yaw, rise, roll] of profile.leaves) {
    const a = THREE.MathUtils.degToRad(yaw), base = centre(z);
    const outward = runtime(Math.sin(a), -Math.cos(a), 0), across = runtime(Math.cos(a), Math.sin(a), 0);
    const blade = (t: number) => {
      const bank = THREE.MathUtils.degToRad(roll + 18 * t), half = width * (t ? 1 : .18) / 2;
      const p = base.clone().addScaledVector(outward, length * t); p.y += rise * Math.sin(t * Math.PI * .72);
      const side = across.clone().multiplyScalar(Math.cos(bank)); side.y += Math.sin(bank);
      const rib = new THREE.Vector3().crossVectors(outward, side).normalize().multiplyScalar(Math.min(.0025, half * .24));
      return [p.clone().addScaledVector(side, -half), p.clone().sub(rib), p.clone().addScaledVector(side, half), p.clone().add(rib)];
    };
    const vertices = [...blade(0), ...blade(.42)], tip = base.clone().addScaledVector(outward, length); tip.y += rise * Math.sin(Math.PI * .72); vertices.push(tip);
    const triangles = [0, 2, 1, 0, 3, 2];
    for (let j = 0; j < 4; j++) { const k = (j + 1) % 4; triangles.push(j, k, k + 4, j, k + 4, j + 4, j + 4, k + 4, 8); }
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(triangles.flatMap(i => vertices[i].toArray()), 3));
    g.computeVertexNormals(); add(g, 1);
  }
  const head = profile.head, base = centre(profile.stemHeight);
  const axis = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(head.tilt[0]), THREE.MathUtils.degToRad(head.tilt[1]), THREE.MathUtils.degToRad(head.yaw), 'XYZ'));
  const point = (x: number, y: number, z: number) => {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(axis); return runtime(p.x, p.y, p.z).add(base);
  };
  tube(point(0, 0, -.01), point(0, 0, head.length * .9), .003, .0015, 2);
  for (let i = 0; i < 5; i++) {
    const side = i % 2 ? -1 : 1;
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(head.grainWidth * (1 - i * .065), head.grainDepth, .017);
    g.applyMatrix4(axis); g.rotateX(-Math.PI / 2);
    const p = point(side * head.sideOffset, 0, .003 + i * head.length * .19); g.translate(p.x, p.y, p.z); add(g, 2);
  }
  const geometry = mergeGeometries(components)!;
  components.forEach(g => g.dispose()); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  prepareCropGeometry(geometry, variant);
  geometry.userData.variant = variant; geometry.userData.detail = 'distant'; return geometry;
}

export function createCropClumpGeometry(sources: Record<WheatVariant, THREE.BufferGeometry>, template: number, count: 3 | 4) {
  const parts = CROP_TEMPLATES[template].slice(0, count).map((part, index) => {
    const source = sources[part.variant], g = source.index ? source.toNonIndexed() : source.clone();
    g.applyMatrix4(TEMPLATE_MATRICES[template][index]);
    // Deform each clump member in its OWN plant frame, not around the slot.
    const basis = new THREE.Matrix3().setFromMatrix4(TEMPLATE_MATRICES[template][index]).elements;
    const metadata = plantCropMetadata(template, index);
    for (let vertex = 0; vertex < g.getAttribute('position').count; vertex++) {
      (g.getAttribute('cropBasisX') as THREE.BufferAttribute).setXYZ(vertex, basis[0], basis[1], basis[2]);
      (g.getAttribute('cropBasisY') as THREE.BufferAttribute).setXYZ(vertex, basis[3], basis[4], basis[5]);
      (g.getAttribute('cropBasisZ') as THREE.BufferAttribute).setXYZ(vertex, basis[6], basis[7], basis[8]);
      (g.getAttribute('cropPlantState') as THREE.BufferAttribute).setXYZ(vertex, ...metadata);
    }
    const crowns = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < crowns.length; i += 3) { crowns[i] = part.x; crowns[i + 2] = part.z; }
    g.setAttribute('_crown', new THREE.BufferAttribute(crowns, 3)); return g;
  });
  const geometry = mergeGeometries(parts)!; parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += .16;
  geometry.userData.plantCount = count; geometry.userData.template = template;
  geometry.userData.crowns = CROP_TEMPLATES[template].slice(0, count).map(p => [p.x, 0, p.z]);
  return geometry;
}
