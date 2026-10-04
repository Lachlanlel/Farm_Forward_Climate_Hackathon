import * as THREE from 'three';
import type { VisualFootprint } from './visualAdapter';
import { SOIL_LAYERS, WHEAT_PLACEMENT } from './visualTokens';
import { MAX_MOISTURE_FRONTS, MOISTURE_DISPLAY, MOISTURE_TRANSPORT_DISPLAY, moistureAppearance, type MoistureTransition } from './soilMoisturePresentation';
import { SOIL_APPEARANCE_PREVIEW, SOIL_VISUAL_PRESETS, SOIL_CRACK_DISPLAY, validateSoilAppearance, type SoilAppearanceState } from './soilVisualPresets';
import { createSoilCrackMask } from './soilCrackMask';

// A schematic 3D pore-storage field sampled on exposed soil faces. Adjacent
// front/side faces sample the SAME coordinates; no floating panels or liquids.
const fieldShader = /* glsl */`
varying vec3 vMoisturePosition;
varying vec3 vMoistureNormal;
uniform vec2 uMoistureHalf;
uniform vec3 uMoistureSeed;
uniform vec3 uMoistureOffset;
uniform vec3 uMoistureTone;
uniform vec3 uMoistureTransportColor;
uniform float uMoistureOpacity;
uniform float uMoistureThreshold;
uniform float uMoistureMorph;
uniform vec4 uMoistureTransport;
uniform vec2 uMoistureExchange; // explicit upward transfer / bottom loss
uniform vec2 uMoistureLayerDepth;
uniform float uMoistureAccessibleFraction;
uniform vec4 uMoistureFronts[${MAX_MOISTURE_FRONTS}];
uniform float uMoistureFrontKinds[${MAX_MOISTURE_FRONTS}];
uniform vec2 uMoistureFrontFloors[${MAX_MOISTURE_FRONTS}];
uniform float uMoistureFrontActivity[${MAX_MOISTURE_FRONTS}];
uniform float uSoilGrainStrength;
uniform float uSoilGrainFrequency;
uniform float uSoilBumpStrength;
uniform sampler2D uSoilCrackMask;
uniform float uSoilCrackSeverity;
uniform vec3 uSoilCrackTone;
float moistureHash(vec3 p) {
  p = fract(p * vec3(.1031, .1030, .0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float moistureNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(moistureHash(i), moistureHash(i + vec3(1,0,0)), f.x),
                 mix(moistureHash(i + vec3(0,1,0)), moistureHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(moistureHash(i + vec3(0,0,1)), moistureHash(i + vec3(1,0,1)), f.x),
                 mix(moistureHash(i + vec3(0,1,1)), moistureHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// Closed, irregular regions of the same two-scale pore field. A soft threshold
// leaves soil gaps between pockets; no circular sprites, paths or water store.
float moisturePocket(vec3 q, float threshold) {
  // Intersect two irregular soft supports to break up long connected regions.
  // No radial distance, circular billboards, cell-centre stamps or periodic
  // spacing. All topology is continuous deterministic noise in shared 3D space.
  float value = .67 * moistureNoise(q) + .33 * moistureNoise(q * 2.13 + vec3(7.1, 2.3, 4.8));
  float separation = smoothstep(.30, .64, moistureNoise(q * 1.65 + vec3(13.4, 5.7, 18.2)));
  return separation * smoothstep(threshold - .11, threshold + .11, value);
}
`;
const fieldFragment = /* glsl */`
// Earth grain topology/frequency stay fixed; Sandy's uniform strengths respond
// to authoritative layer moisture. No texture image or extra soil surface.
float soilGrain = moistureNoise(vMoisturePosition * uSoilGrainFrequency + uMoistureSeed + vec3(19.2, 6.4, 13.7)) - .5;
diffuseColor.rgb *= 1.0 + uSoilGrainStrength * soilGrain;
// Make the existing evaporation cue readable from above as a slight, patchy
// lightening of the SAME earth. No extra layer/particles, drought-state colour,
// moisture subtraction or crack trigger. Wetting/retention and endpoints have
// zero surfaceDrying, so this accent clears exactly with the master timeline.
float dryingTopFace = smoothstep(.75, .98, vMoistureNormal.y) *
                     (1.0 - smoothstep(.002, .012, abs(vMoisturePosition.y)));
float dryingPatch = .65 + .35 * moistureNoise(vMoisturePosition * .85 + uMoistureSeed);
diffuseColor.rgb *= 1.0 + ${MOISTURE_TRANSPORT_DISPLAY.surfaceLightening.toFixed(2)} *
                         uMoistureTransport.y * dryingTopFace * dryingPatch;
float soilCrackHeight = 0.0;
// Supplied severity grows/widens one cached hierarchy of irregular plates.
// Only their lips/interiors receive relief/occlusion; no geometry excavation.
if (uSoilCrackSeverity > 0.0 && vMoistureNormal.y > .5 && abs(vMoisturePosition.y) < .008) {
  vec2 uv = vMoisturePosition.xz / (uMoistureHalf * 2.0) + .5;
  vec3 fissure = texture2D(uSoilCrackMask, uv).rgb;
  float width = .18 + .82 * pow(smoothstep(.10, .95, uSoilCrackSeverity), .70);
  float feather = max(.085, .65 * fwidth(fissure.r));
  float line = smoothstep(0.0, .10, fissure.r) * smoothstep(1.0 - width - feather, 1.0 - width + feather, fissure.r);
  float grown = smoothstep(fissure.g - .065, fissure.g + .075, uSoilCrackSeverity);
  float cracks = line * grown * smoothstep(0.0, .30, uSoilCrackSeverity);
  float interior = pow(line, 1.35) * grown * smoothstep(0.0, .30, uSoilCrackSeverity);
  diffuseColor.rgb *= mix(vec3(1.0), uSoilCrackTone, interior * ${SOIL_CRACK_DISPLAY.strength.toFixed(2)});
  soilCrackHeight = -${SOIL_CRACK_DISPLAY.reliefDepth.toFixed(3)} * cracks * (.35 + .65 * fissure.r) * fissure.b * (.4 + .6 * uSoilCrackSeverity);
}
// Top/bottom and the far/back face carry earth wetness only. Useful exposed
// vertical faces, including their small corner facets, carry internal fields.
// Add the overlapping face weights at the chamfer. Taking only their maximum
// weakened both halfway around the corner and left an artificial pale seam.
float moistureFace = (1.0 - abs(normalize(vMoistureNormal).y)) * min(1.0,
  smoothstep(uMoistureHalf.y - .24, uMoistureHalf.y - .02, vMoisturePosition.z) +
  smoothstep(uMoistureHalf.x - .24, uMoistureHalf.x - .02, abs(vMoisturePosition.x)));
if (moistureFace > .001 && uMoistureOpacity > .00001) {
  vec3 p = (vMoisturePosition + uMoistureOffset) * vec3(1.0, 1.05, 1.0) * ${MOISTURE_DISPLAY.spatialFrequency.toFixed(2)} + uMoistureSeed;
  // A fixed continuous domain warp breaks up rounded lattice stains into
  // asymmetric merging regions. Neither shape nor seed depends on amount.
  p += uMoistureMorph * vec3(.36, -.22, .28);
  float warpA = moistureNoise(p * .67 + vec3(4.1, 9.2, 1.8)) - .5;
  float warpB = moistureNoise(p * .67 + vec3(12.7, 2.8, 8.4)) - .5;
  p += .85 * vec3(warpA, warpB, .5 * (warpA + warpB));
  float field = .67 * moistureNoise(p) + .33 * moistureNoise(p * 2.13 + vec3(7.1, 2.3, 4.8));
  if (dot(uMoistureTransport, uMoistureTransport) > .000001) {
    float localDepth = clamp((-vMoisturePosition.y - uMoistureLayerDepth.x) / uMoistureLayerDepth.y, 0.0, 1.0);
    float accessible = 1.0 - smoothstep(uMoistureAccessibleFraction - .04,
                                       uMoistureAccessibleFraction + .04, localDepth);
    field -= .09 * uMoistureTransport.w * accessible;
  }
  float mask = smoothstep(uMoistureThreshold - ${MOISTURE_DISPLAY.boundarySoftness.toFixed(2)},
                          uMoistureThreshold + ${MOISTURE_DISPLAY.boundarySoftness.toFixed(2)}, field);
  // Bounds/phase qualify a process, but never draw a moving horizontal tip.
  // Disconnected porous regions explain it within the SAME integrated field.
  float profileDepth = clamp(-vMoisturePosition.y / ${SOIL_LAYERS.reduce((depth, layer) => depth + layer.thickness, 0).toFixed(3)}, 0.0, 1.0);
  float contourBoost = 0.0, contourRecession = 0.0;
  float pocketContrast = 0.0, excessRemoval = 0.0, surfaceLossAccent = 0.0;
  for (int i = 0; i < ${MAX_MOISTURE_FRONTS}; i++) {
    vec4 front = uMoistureFronts[i];
    if (front.w <= .00001) continue;
    float signedKind = uMoistureFrontKinds[i];
    float kind = abs(signedKind);
    float eligibility = kind < 1.5 ? uMoistureTransport.z :
                        kind < 2.5 ? (signedKind < 0.0 ? uMoistureExchange.x : uMoistureTransport.x) :
                        kind < 3.5 ? uMoistureTransport.y : uMoistureExchange.y;
    float strength = front.w * min(1.0, 35.0 * eligibility);
    if (strength <= .00001) continue;
    float bend = moistureNoise(vec3(vMoisturePosition.x * .57, profileDepth * 4.1,
                                    vMoisturePosition.z * .57) + uMoistureSeed) - .5;
    float localDepth = clamp((profileDepth - front.x) / (front.y - front.x), 0.0, 1.0);
    // Explicit relative flux activity changes explanatory travel only. Stored
    // amount, topology and endpoint are still sampled from the same progress.
    float travelPhase = front.z * (.75 + .25 * uMoistureFrontActivity[i]);
    float inside = smoothstep(front.x - .035, front.x + .055, profileDepth) *
                   (1.0 - smoothstep(front.y - .055, front.y + .035, profileDepth));
    if (kind < 1.5) {
      // New input: several softly separated pockets enter near the surface.
      // Their 3D coordinates translate DOWN; staggered broad arrival timing
      // admits them to deeper receivers without drawing a shared crest/line.
      vec3 q = vec3(vMoisturePosition.x * 1.05,
        (profileDepth - travelPhase * (front.y - front.x) * (.92 + .12 * bend)) * 6.6,
        vMoisturePosition.z * 1.05) + uMoistureSeed;
      q += vec3(.42, .20, -.35) * bend;
      float pockets = moisturePocket(q, .57);
      float entry = localDepth * .74 + .12 * bend;
      float admitted = smoothstep(entry - .06, entry + .22, front.z);
      float shape = pockets * admitted * inside * strength;
      contourBoost = max(contourBoost, .15 * shape);
      pocketContrast = max(pocketContrast, .69 * shape);
    } else if (kind < 2.5) {
      // Existing storage: modest lateral shift, spreading and a much smaller
      // supplied up/down bias across the INTERNAL region. No surface-entry path and
      // no marching release/tip plane. Original pore contours locally recede
      // as their shifted neighbours strengthen; phase never reseeds the field.
      float direction = signedKind < 0.0 ? -1.0 : 1.0;
      vec3 q = p * 1.08 + travelPhase * vec3(.72 * (.45 + bend), direction * (1.00 + .20 * bend), .54 * (bend - .25));
      q += .16 * sin(3.14159265 * front.z) * vec3(bend, -.4 * bend, .6 * bend);
      float pockets = moisturePocket(q, .59 - .035 * sin(3.14159265 * front.z));
      float original = smoothstep(.45, .67, field);
      float shape = pockets * inside * strength;
      contourBoost = max(contourBoost, .12 * shape);
      contourRecession = max(contourRecession, .18 * max(0.0, original - pockets) * inside * strength);
      pocketContrast = max(pocketContrast, .52 * shape);
    } else {
      // Atmospheric loss and drying progression are different directions.
      // Near-surface contours retreat UP slightly as their lower edges erode.
      // Deeper loss only shrinks/delays; upward supply needs an explicit route.
      // Supplied bottom drainage instead removes existing contours bottom-first.
      float lossDepth = kind > 3.5 ? 1.0 - localDepth : localDepth;
      float onset = .46 * lossDepth + .18 * bend - .03;
      float loss = smoothstep(onset, onset + .38, front.z);
      float surfaceRetreat = kind > 3.5 ? -smoothstep(.72, 1.0, profileDepth) :
        1.0 - smoothstep(0.0, .30, profileDepth);
      float retreatStrength = kind < 3.5 ? ${MOISTURE_TRANSPORT_DISPLAY.dryingRetreat.toFixed(2)} : .34;
      vec3 retreat = p - vec3(0.0, retreatStrength * front.z * surfaceRetreat * (.85 + .30 * bend), 0.0);
      float retreatField = .67 * moistureNoise(retreat) + .33 * moistureNoise(retreat * 2.13 + vec3(7.1, 2.3, 4.8));
      // The stored field erodes; separate temporary upper contours below can
      // actually advance toward the surface instead of only intersect/fading.
      float erosionStrength = kind < 3.5 ? ${MOISTURE_TRANSPORT_DISPLAY.dryingErosion.toFixed(2)} : .30;
      float erodedField = min(field, retreatField) - erosionStrength * loss;
      float shrunkMask = smoothstep(uMoistureThreshold - ${MOISTURE_DISPLAY.boundarySoftness.toFixed(2)},
                                    uMoistureThreshold + ${MOISTURE_DISPLAY.boundarySoftness.toFixed(2)}, erodedField);
      vec2 floorAppearance = uMoistureFrontFloors[i];
      float destinationMask = smoothstep(floorAppearance.x - ${MOISTURE_DISPLAY.boundarySoftness.toFixed(2)},
                                         floorAppearance.x + ${MOISTURE_DISPLAY.boundarySoftness.toFixed(2)}, field);
      // Remove only stored-field excess above the frozen destination floor.
      float remaining = max(shrunkMask * uMoistureOpacity, destinationMask * floorAppearance.y);
      excessRemoval = max(excessRemoval, inside * strength * max(0.0, mask * uMoistureOpacity - remaining));
      if (kind < 3.5) {
        // Local surface-loss events: two staggered samples of the same seeded
        // pore topology move UP, elongate, contract and disappear just beneath
        // y=0. They are explanation masks, never another water store or physics.
        // Deeper loss has no direct atmospheric cue; supplied upward transfer
        // remains a separate internal process. Roots render later, unchanged.
        float topEnd = ${(SOIL_LAYERS[0].thickness / SOIL_LAYERS.reduce((depth, layer) => depth + layer.thickness, 0)).toFixed(5)};
        float nearSurface = 1.0 - smoothstep(topEnd * .85, topEnd * 1.03, profileDepth);
        float surfaceExit = smoothstep(0.0, .018, profileDepth);
        for (int event = 0; event < 2; event++) {
          float family = float(event);
          float stagger = moistureNoise(vec3(vMoisturePosition.x * .76, 2.1 + family * 6.7,
                                             vMoisturePosition.z * .76) + uMoistureSeed);
          float phase = clamp((front.z - .10 * family - .16 * stagger) / (.72 - .08 * family), 0.0, 1.0);
          float envelope = smoothstep(0.0, .12, phase) * (1.0 - smoothstep(.64, 1.0, phase));
          float travel = .90 * phase * (.75 + .25 * uMoistureFrontActivity[i]) * (.80 + .35 * stagger);
          vec3 q = (vMoisturePosition - vec3(.07 * phase * bend, travel, -.06 * phase * bend)) *
                   vec3(1.15, mix(2.6, 1.8, phase), 1.15) + uMoistureSeed + vec3(0.0, family * 3.1, 0.0);
          q += .45 * vec3(warpA, warpB, .5 * (warpA + warpB));
          float pockets = moisturePocket(q, .54 + .13 * phase);
          float sourceDepth = profileDepth + travel / ${SOIL_LAYERS.reduce((depth, layer) => depth + layer.thickness, 0).toFixed(3)};
          float source = 1.0 - smoothstep(topEnd * (.72 + .20 * bend), topEnd * (1.22 + .20 * bend), sourceDepth);
          float localSupport = smoothstep(.48, .70, stagger);
          float moving = pockets * localSupport * envelope * source * nearSurface * surfaceExit * strength;
          surfaceLossAccent = max(surfaceLossAccent, .55 * moving);
        }
      }
    }
  }
  // Pockets modulate local pore contours and blend into the same earth tone.
  if (contourBoost > 0.0 || contourRecession > 0.0)
    mask = smoothstep(uMoistureThreshold - ${MOISTURE_DISPLAY.boundarySoftness.toFixed(2)},
                      uMoistureThreshold + ${MOISTURE_DISPLAY.boundarySoftness.toFixed(2)}, field + contourBoost - contourRecession);
  float transientContrast = sqrt(uMoistureOpacity) * pocketContrast;
  float fieldAlpha = min(.90, max(0.0, mask * uMoistureOpacity + transientContrast - excessRemoval) +
                                  sqrt(uMoistureOpacity) * surfaceLossAccent);
  // Do NOT clear a horizontal strip at every layer edge: even a variable inset
  // did so at edgeDistance=0, creating bright water-table-like lines. Opaque
  // soil geometry bounds the field; contours themselves are feathered above.
  // A shared 3D seed continues topology across layers and front/side corners;
  // each material still applies its OWN authoritative amount and earth hue.
  diffuseColor.rgb *= mix(vec3(1.0), uMoistureTone, fieldAlpha * moistureFace);
  // Only the existing MOVING pocket masks receive a modest dusty blue-grey
  // tint. Same paths/shape/phase, no new coverage, stored colour or glow. Loss
  // events rise/shrink with their existing surface mask; colour clears with it.
  float transportTint = min(1.0, transientContrast + sqrt(uMoistureOpacity) * surfaceLossAccent) *
                        ${MOISTURE_TRANSPORT_DISPLAY.tintStrength.toFixed(2)} * moistureFace;
  if (transportTint > 0.0)
    diffuseColor.rgb = mix(diffuseColor.rgb, uMoistureTransportColor, transportTint);
}
`;

/** Augments the three existing opaque soil materials. Field translucency is
 * composited into their albedo BEFORE lighting, so roots keep their unchanged
 * later stencil pass and cannot be tinted by a transparent overlay. No meshes,
 * textures, geometry edits, scientific calculations or root-access dependency. */
export class SoilMoisture {
  private layers;
  private crackMask: THREE.DataTexture;
  private appearance: SoilAppearanceState;
  private reducedMotion = false;
  constructor(soil: THREE.Group, footprint: VisualFootprint, private transition: MoistureTransition,
    appearance: SoilAppearanceState = SOIL_APPEARANCE_PREVIEW) {
    validateSoilAppearance(appearance);
    this.appearance = { ...appearance };
    this.crackMask = createSoilCrackMask(footprint);
    let topDepth = 0;
    this.layers = SOIL_LAYERS.map(layer => {
      const mesh = soil.getObjectByName(layer.name) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
      const material = mesh.material;
      const preset = SOIL_VISUAL_PRESETS[this.appearance.soilType];
      const dry = new THREE.Color(preset.dryColours[layer.id]), wet = new THREE.Color(preset.wetColours[layer.id]);
      const seed = (WHEAT_PLACEMENT.seed % 997) / 97;
      const uniforms = {
        uMoistureHalf: { value: new THREE.Vector2(footprint.width / 2, footprint.depth / 2) },
        uMoistureSeed: { value: new THREE.Vector3(seed, 4.2, 2.9) },
        uMoistureOffset: { value: new THREE.Vector3() }, uMoistureMorph: { value: 0 },
        uMoistureTransport: { value: new THREE.Vector4() },
        uMoistureExchange: { value: new THREE.Vector2() },
        uMoistureLayerDepth: { value: new THREE.Vector2(topDepth, layer.thickness) },
        uMoistureAccessibleFraction: { value: 0 },
        uMoistureFronts: { value: Array.from({ length: MAX_MOISTURE_FRONTS }, () => new THREE.Vector4()) },
        uMoistureFrontKinds: { value: new Float32Array(MAX_MOISTURE_FRONTS) },
        uMoistureFrontFloors: { value: Array.from({ length: MAX_MOISTURE_FRONTS }, () => new THREE.Vector2()) },
        uMoistureFrontActivity: { value: new Float32Array(MAX_MOISTURE_FRONTS).fill(1) },
        uMoistureTone: { value: new THREE.Vector3(...MOISTURE_DISPLAY.fieldTone) },
        uMoistureTransportColor: { value: new THREE.Color(MOISTURE_TRANSPORT_DISPLAY.color) },
        uMoistureOpacity: { value: 0 }, uMoistureThreshold: { value: 0 },
        uSoilGrainStrength: { value: preset.grainStrength },
        uSoilGrainFrequency: { value: preset.grainFrequency },
        uSoilBumpStrength: { value: preset.bumpStrength },
        uSoilCrackMask: { value: this.crackMask },
        uSoilCrackSeverity: { value: 0 },
        uSoilCrackTone: { value: new THREE.Vector3(...SOIL_CRACK_DISPLAY.tone) },
      };
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader.replace('#include <common>',
          '#include <common>\nvarying vec3 vMoisturePosition;\nvarying vec3 vMoistureNormal;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoisturePosition = position;\nvMoistureNormal = normal;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + fieldShader)
          .replace('#include <color_fragment>', '#include <color_fragment>\n' + fieldFragment)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(normal - uSoilBumpStrength * vec3(dFdx(soilGrain), dFdy(soilGrain), 0.0));
if (uSoilCrackSeverity > 0.0 && vMoistureNormal.y > .5 && abs(vMoisturePosition.y) < .008) {
  vec3 sigmaX = dFdx(-vViewPosition), sigmaY = dFdy(-vViewPosition);
  vec3 r1 = cross(sigmaY, normal), r2 = cross(normal, sigmaX);
  float determinant = dot(sigmaX, r1);
  vec3 gradient = sign(determinant) * (dFdx(soilCrackHeight) * r1 + dFdy(soilCrackHeight) * r2);
  normal = normalize(abs(determinant) * normal - gradient);
}`);
      };
      material.customProgramCacheKey = () => 'soil-moisture-surface-drying-4';
      material.needsUpdate = true;
      topDepth += layer.thickness;
      return { id: layer.id, material, dry, wet, uniforms };
    });
    this.update();
  }
  update() {
    const preset = SOIL_VISUAL_PRESETS[this.appearance.soilType];
    for (const { id, material, dry, wet, uniforms } of this.layers) {
      // One sampled layer amount drives BOTH cues. Transient shape hints carry
      // no quantity and return to the canonical stored field at completion.
      const appearance = moistureAppearance(this.transition.displayed[id]);
      material.color.copy(dry).lerp(wet, appearance.wetness);
      material.roughness = preset.dryRoughness + (preset.wetRoughness - preset.dryRoughness) * appearance.wetness;
      uniforms.uSoilGrainStrength.value = preset.grainStrength +
        ((preset.wetGrainStrength ?? preset.grainStrength) - preset.grainStrength) * appearance.wetness;
      uniforms.uSoilBumpStrength.value = preset.bumpStrength +
        ((preset.wetBumpStrength ?? preset.bumpStrength) - preset.bumpStrength) * appearance.wetness;
      uniforms.uSoilCrackSeverity.value = id === 'topsoil' && preset.supportsCracking ? this.appearance.surfaceCrackSeverity : 0;
      uniforms.uMoistureOpacity.value = appearance.opacity;
      uniforms.uMoistureThreshold.value = appearance.threshold;
      uniforms.uMoistureOffset.value.fromArray(this.reducedMotion ? [0, 0, 0] : this.transition.motion[id].offset);
      uniforms.uMoistureMorph.value = this.reducedMotion ? 0 : this.transition.motion[id].morph;
      const cue = this.transition.cues[id];
      uniforms.uMoistureTransport.value.set(cue.downward, cue.surfaceDrying, cue.infiltration, cue.uptake);
      uniforms.uMoistureExchange.value.set(cue.upward, cue.drainage);
      uniforms.uMoistureAccessibleFraction.value = cue.accessibleFraction;
      for (let i = 0; i < MAX_MOISTURE_FRONTS; i++) {
        const front = this.reducedMotion ? undefined : this.transition.fronts[i];
        if (front) {
          uniforms.uMoistureFronts.value[i].set(front.from, front.to, front.phase, front.weight);
          uniforms.uMoistureFrontActivity.value[i] = front.activity;
          uniforms.uMoistureFrontKinds.value[i] = front.kind === 'wetting' ? 1 : front.kind === 'transfer' ?
            (front.direction === 'up' ? -2 : 2) : front.kind === 'drying' ? 3 : 4;
          const floor = front.destinationFloor?.[id];
          uniforms.uMoistureFrontFloors.value[i].set(floor?.threshold ?? 0, floor?.opacity ?? 0);
        } else {
          uniforms.uMoistureFronts.value[i].set(0, 0, 0, 0); uniforms.uMoistureFrontKinds.value[i] = 0;
          uniforms.uMoistureFrontActivity.value[i] = 1;
          uniforms.uMoistureFrontFloors.value[i].set(0, 0);
        }
      }
    }
  }
  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    this.update();
  }
  setAppearance(state: SoilAppearanceState) {
    validateSoilAppearance(state);
    this.appearance = { ...state };
    const preset = SOIL_VISUAL_PRESETS[state.soilType];
    for (const { id, dry, wet, uniforms } of this.layers) {
      dry.set(preset.dryColours[id]); wet.set(preset.wetColours[id]);
      uniforms.uSoilGrainFrequency.value = preset.grainFrequency;
    }
    this.update();
  }
  dispose() { this.crackMask.dispose(); }
  /** Shader capability/quality fallback keeps earth wetness and numeric state.
   * Existing geometry and later root passes are untouched. */
  disableFields() {
    for (const { material } of this.layers) {
      material.onBeforeCompile = () => {};
      material.customProgramCacheKey = () => 'soil-moisture-material-only-1';
      material.needsUpdate = true;
    }
  }
}
