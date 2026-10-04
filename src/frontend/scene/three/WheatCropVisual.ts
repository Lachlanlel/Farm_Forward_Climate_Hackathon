import * as THREE from 'three';
import profiles from '../tools/blender/wheat_profiles.json';
import type { WheatVariant } from './wheatAsset';
import { CROP_DISPLAY, type CropPresentationState } from './cropPresentation';

/** Add non-destructive plant-local metadata. Positions, normals, masks and GLBs
 * are retained. Closed leaf components are welded by position for attachment
 * assignment, since flat-shaded exports duplicate vertices at facet edges. */
export function prepareCropGeometry(geometry: THREE.BufferGeometry, variant: WheatVariant, placeholder = false) {
  if (geometry.hasAttribute('cropRest')) return;
  const position = geometry.getAttribute('position'), part = geometry.getAttribute('_part_id');
  const profile = profiles[variant];
  const centre = (height: number) => {
    const t = height / profile.stemHeight;
    return new THREE.Vector3(profile.curve[0] * t * t + profile.counterCurve[0] * Math.sin(Math.PI * t), height,
      -profile.curve[1] * t * t - profile.counterCurve[1] * Math.sin(Math.PI * t));
  };
  const candidates = placeholder ? [new THREE.Vector3(.00, .24, 0), new THREE.Vector3(0, .40, 0)] : profile.leaves.map(leaf => centre(leaf[0]));
  const headBase = placeholder ? new THREE.Vector3(0, .78, 0) : centre(profile.stemHeight);
  const parents = Array.from({ length: position.count }, (_, i) => i), weld = new Map<string, number>();
  const find = (i: number): number => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  const join = (a: number, b: number) => { parents[find(b)] = find(a); };
  for (let i = 0; i < position.count; i++) if (part.getX(i) === 1) {
    const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
    const previous = weld.get(key); if (previous !== undefined) join(i, previous); else weld.set(key, i);
  }
  const indices = geometry.index;
  for (let i = 0; i < (indices?.count ?? position.count); i += 3) {
    const a = indices?.getX(i) ?? i, b = indices?.getX(i + 1) ?? i + 1, c = indices?.getX(i + 2) ?? i + 2;
    if (part.getX(a) === 1 && part.getX(b) === 1 && part.getX(c) === 1) { join(a, b); join(a, c); }
  }
  const components = new Map<number, number[]>();
  for (let i = 0; i < position.count; i++) if (part.getX(i) === 1) {
    const id = find(i); if (!components.has(id)) components.set(id, []); components.get(id)!.push(i);
  }
  const leafBases = new Map<number, { base: THREE.Vector3; length: number }>();
  const point = new THREE.Vector3();
  for (const [id, vertices] of components) {
    const scores = candidates.map(candidate => Math.min(...vertices.map(i => point.fromBufferAttribute(position, i).distanceToSquared(candidate))));
    const selected = scores.indexOf(Math.min(...scores)), base = candidates[selected];
    const length = Math.max(...vertices.map(i => point.fromBufferAttribute(position, i).distanceTo(base)));
    leafBases.set(id, { base, length });
  }
  const rest = new Float32Array(position.count * 3), attach = new Float32Array(position.count * 4);
  const basisX = new Float32Array(position.count * 3), basisY = new Float32Array(position.count * 3), basisZ = new Float32Array(position.count * 3);
  const localState = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i); rest.set(point.toArray(), i * 3);
    const leaf = part.getX(i) === 1 ? leafBases.get(find(i)) : undefined;
    const anchor = leaf?.base ?? headBase;
    attach.set([...anchor.toArray(), leaf ? Math.min(1, point.distanceTo(anchor) / leaf.length) : 0], i * 4);
    basisX[i * 3] = 1; basisY[i * 3 + 1] = 1; basisZ[i * 3 + 2] = 1;
    localState[i * 3 + 1] = 1;
  }
  geometry.setAttribute('cropRest', new THREE.BufferAttribute(rest, 3));
  geometry.setAttribute('cropAttach', new THREE.BufferAttribute(attach, 4));
  geometry.setAttribute('cropBasisX', new THREE.BufferAttribute(basisX, 3));
  geometry.setAttribute('cropBasisY', new THREE.BufferAttribute(basisY, 3));
  geometry.setAttribute('cropBasisZ', new THREE.BufferAttribute(basisZ, 3));
  geometry.setAttribute('cropPlantState', new THREE.BufferAttribute(localState, 3));
  geometry.userData.cropLeafComponents = components.size;
  geometry.computeBoundingSphere(); geometry.boundingSphere!.radius += .16;
}

const cropVertex = /* glsl */`
uniform float uCropDevelopment;
uniform float uCropStress;
attribute float _part_id;
attribute vec3 cropRest;
attribute vec4 cropAttach;
attribute vec3 cropBasisX;
attribute vec3 cropBasisY;
attribute vec3 cropBasisZ;
attribute vec3 cropPlantState;
attribute vec3 cropInstanceState;
float cropEffectiveStress() { return clamp(uCropStress * cropInstanceState.y * cropPlantState.y, 0.0, 1.0); }
float cropEffectiveDevelopment() { return clamp(uCropDevelopment + (cropInstanceState.x + cropPlantState.x) * 4.0 * uCropDevelopment * (1.0 - uCropDevelopment), 0.0, 1.0); }
vec3 cropDeform() {
  float development = cropEffectiveDevelopment();
  float stress = cropEffectiveStress();
  // Exact approved asset/rest geometry remains available at development 1.
  if (development >= 1.0 && stress <= 0.0) return position;
  float extension = mix(${CROP_DISPLAY.minimumStemExtension.toFixed(2)}, 1.0, smoothstep(0.0, 1.0, development));
  float head = smoothstep(${CROP_DISPLAY.headStart.toFixed(2)}, ${CROP_DISPLAY.headFull.toFixed(2)}, development);
  float wilt = smoothstep(${CROP_DISPLAY.wiltStart.toFixed(2)}, 1.0, stress);
  float base = ${CROP_DISPLAY.plantedBaseHeight.toFixed(2)};
  vec3 local = cropRest;
  local.y = min(cropRest.y, base) + max(0.0, cropRest.y - base) * extension;
  if (_part_id > .5 && _part_id < 1.5) {
    vec3 blade = cropRest - cropAttach.xyz;
    float attachment = min(cropAttach.y, base) + max(0.0, cropAttach.y - base) * extension;
    local.xz = cropAttach.xz + blade.xz * mix(.64, 1.0, development) * (1.0 - ${CROP_DISPLAY.canopyContraction.toFixed(2)} * wilt);
    local.y = attachment + blade.y * mix(.82, 1.0, development) + .10 * (1.0 - development) * cropAttach.w;
    local.y -= ${CROP_DISPLAY.leafDroop.toFixed(2)} * wilt * cropAttach.w * cropAttach.w;
    local.y = max(.015, local.y);
  } else if (_part_id > 1.5) {
    vec3 ear = (cropRest - cropAttach.xyz) * head;
    local = vec3(cropAttach.x, base + (cropAttach.y - base) * extension, cropAttach.z) + ear;
    local.x += .18 * wilt * ear.y;
  }
  float bendHeight = _part_id > 1.5 ? cropAttach.y + (cropRest.y - cropAttach.y) * head : cropRest.y;
  float planted = smoothstep(base, 1.0, bendHeight);
  float angle = cropInstanceState.z + cropPlantState.z;
  local.xz += vec2(cos(angle), sin(angle)) * ${CROP_DISPLAY.stemBend.toFixed(3)} * wilt * planted * planted;
  return position + mat3(cropBasisX, cropBasisY, cropBasisZ) * (local - cropRest);
}
`;
const cropFragment = /* glsl */`
uniform float uCropStress;
uniform vec3 uCropColors[5];
vec3 cropStressColor(float stress) {
  vec3 color = mix(uCropColors[0], uCropColors[1], smoothstep(${CROP_DISPLAY.stressStops[0].toFixed(2)}, ${CROP_DISPLAY.stressStops[1].toFixed(2)}, stress));
  color = mix(color, uCropColors[2], smoothstep(${CROP_DISPLAY.stressStops[1].toFixed(2)}, ${CROP_DISPLAY.stressStops[2].toFixed(2)}, stress));
  color = mix(color, uCropColors[3], smoothstep(${CROP_DISPLAY.stressStops[2].toFixed(2)}, ${CROP_DISPLAY.stressStops[3].toFixed(2)}, stress));
  return mix(color, uCropColors[4], smoothstep(${CROP_DISPLAY.stressStops[3].toFixed(2)}, ${CROP_DISPLAY.stressStops[4].toFixed(2)}, stress));
}
`;

/** One parameterised crop material + matching shadow deformation, across all
 * nine batches. Uniform updates only; no per-frame geometry rebuilding. */
export class WheatCropVisual {
  readonly material: THREE.MeshStandardMaterial;
  readonly depthMaterial: THREE.MeshDepthMaterial;
  readonly uniforms = { uCropDevelopment: { value: 1 }, uCropStress: { value: 0 },
    uCropColors: { value: CROP_DISPLAY.stressColors.map(color => new THREE.Color(color)) } };
  constructor(source: THREE.MeshStandardMaterial) {
    this.material = source.clone();
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    for (const [material, depth] of [[this.material, false], [this.depthMaterial, true]] as const) {
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, this.uniforms);
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + cropVertex)
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = cropDeform();');
        if (!depth) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + cropFragment)
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = cropStressColor(uCropStress);');
      };
      material.customProgramCacheKey = () => `wheat-crop-state-${CROP_DISPLAY.version}-${depth ? 'depth' : 'color'}`;
    }
  }
  setState(state: CropPresentationState) {
    this.uniforms.uCropDevelopment.value = state.cropDevelopment; this.uniforms.uCropStress.value = state.cropStress;
  }
  disposeShadow() { this.depthMaterial.dispose(); }
}
