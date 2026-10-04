import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { VisualFootprint } from './visualAdapter';
import type { WaterSourceState } from '../simulation/types';
import { WATER_SOURCE_PREVIEW, validateWaterSources } from './waterSourcePresentation';

/** Display constants, independent of rainfall amount and model water input. */
export const WATER_SOURCE_DISPLAY = {
  rainStreakWidthPixels: 2.025, // 20% thicker for legibility; fixed at every rain rate.
  rainColour: '#678ba3', // Clearer muted blue against the pale background.
  rainOpacityMultiplier: 1.08, // Contrast only; never changes particle activity.
  sprayStreakWidthPixels: 2.2,
  targetVisualBoomSpacing: 5,
  maxRepresentativeBooms: 4,
  rearMargin: 3.25, // Keeps raised rear hardware inside the existing Reset framing.
  frontCutawayMargin: 2,
  maximumBoomSpan: 14,
} as const;

/** Consume representative dimensions only; actualAreaHa is deliberately unused.
 * Front is +Z. Cell-centred placement leaves extra room beside the cutaway. */
export function irrigationLayout(footprint: Pick<VisualFootprint, 'width' | 'depth'>) {
  const usableStart = -footprint.depth / 2 + WATER_SOURCE_DISPLAY.rearMargin;
  const usableEnd = footprint.depth / 2 - WATER_SOURCE_DISPLAY.frontCutawayMargin;
  const usableDepth = usableEnd - usableStart;
  const boomCount = THREE.MathUtils.clamp(
    Math.ceil(usableDepth / WATER_SOURCE_DISPLAY.targetVisualBoomSpacing),
    1, WATER_SOURCE_DISPLAY.maxRepresentativeBooms,
  );
  const positionsZ = Array.from({ length: boomCount }, (_, i) =>
    THREE.MathUtils.lerp(usableStart, usableEnd, (i + .5) / boomCount));
  // Fit smaller paddocks via repeated bays, then cap the individual span.
  // Towers/wheels/pipe/nozzle sizes are never scaled with field dimensions.
  const span = Math.min(footprint.width * .78, WATER_SOURCE_DISPLAY.maximumBoomSpan);
  return { boomCount, positionsZ, span, usableStart, usableEnd, usableDepth,
    targetVisualBoomSpacing: WATER_SOURCE_DISPLAY.targetVisualBoomSpacing,
    maxRepresentativeBooms: WATER_SOURCE_DISPLAY.maxRepresentativeBooms };
}

function random(seed: number) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

/** One recycled GPU batch. Source geometry and seed never change with rate,
 * soil, crop or camera. Soft thin ribbons support standard one-pixel streaks
 * without driver-dependent Line width. No drop allocates a scene object. */
class SourceParticles extends THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> {
  constructor(readonly kind: 'rain' | 'spray', footprint: VisualFootprint, emitters: readonly THREE.Vector3[] = []) {
    const count = kind === 'rain' ? Math.min(1600, Math.max(240, Math.round(footprint.width * footprint.depth * 5.4))) : emitters.length * 60;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,0,0, 1,1,0, 0,0,0, 1,1,0, 0,1,0], 3));
    const origin = new Float32Array(count * 3), spread = new Float32Array(count * 3), meta = new Float32Array(count * 4);
    const rnd = random(kind === 'rain' ? 0x7261696e : 0x73707279), columns = Math.ceil(Math.sqrt(count * footprint.width / footprint.depth));
    const rows = Math.ceil(count / columns);
    for (let i = 0; i < count; i++) {
      const x = kind === 'rain' ? ((i % columns + .12 + rnd() * .76) / columns - .5) * (footprint.width - .55) : emitters[i % emitters.length].x;
      const z = kind === 'rain' ? ((Math.floor(i / columns) + .12 + rnd() * .76) / rows - .5) * (footprint.depth - .55) : emitters[i % emitters.length].z;
      origin.set([x, kind === 'rain' ? 3.8 + rnd() * .65 : emitters[i % emitters.length].y, z], i * 3);
      const angle = rnd() * Math.PI * 2, radius = kind === 'rain' ? .055 + rnd() * .06 : .24 + Math.sqrt(rnd()) * .55;
      spread.set([Math.cos(angle) * radius, .035, Math.sin(angle) * radius], i * 3);
      meta.set([rnd(), rnd(), .78 + rnd() * .42, kind === 'rain' ? .20 + rnd() * .15 : .17 + rnd() * .10], i * 4);
    }
    geometry.setAttribute('sourceOrigin', new THREE.InstancedBufferAttribute(origin, 3));
    geometry.setAttribute('sourceSpread', new THREE.InstancedBufferAttribute(spread, 3));
    geometry.setAttribute('sourceMeta', new THREE.InstancedBufferAttribute(meta, 4));
    geometry.instanceCount = count;
    const material = new THREE.ShaderMaterial({ transparent: true, depthTest: true, depthWrite: false,
      uniforms: { sourceTime: { value: 0 }, sourceRate: { value: 0 }, sourceKind: { value: kind === 'rain' ? 0 : 1 },
        sourceStreakWidth: { value: kind === 'rain' ? WATER_SOURCE_DISPLAY.rainStreakWidthPixels : WATER_SOURCE_DISPLAY.sprayStreakWidthPixels },
        sourceViewport: { value: new THREE.Vector2(1,1) }, sourceColour: { value: new THREE.Color(kind === 'rain' ? WATER_SOURCE_DISPLAY.rainColour : '#688c9d') } },
      vertexShader: `
        attribute vec3 sourceOrigin; attribute vec3 sourceSpread; attribute vec4 sourceMeta;
        uniform float sourceTime, sourceRate, sourceKind, sourceStreakWidth; uniform vec2 sourceViewport;
        varying vec2 sourceUV; varying float sourceAlpha;
        void main(){
          sourceUV=position.xy;
          // Continuous per-particle activity avoids count-threshold popping.
          float activity=smoothstep(sourceMeta.y-.045,sourceMeta.y+.045,sourceRate);
          activity*=smoothstep(0.0,.06,sourceRate);
          float speed=mix(3.7,2.15,sourceKind)*sourceMeta.z;
          float height=sourceOrigin.y-sourceSpread.y;
          float phase=fract(sourceTime*speed/height+sourceMeta.x);
          float tail=min(1.0,phase+sourceMeta.w/height);
          float spreadPower=mix(1.0,1.28,sourceKind);
          vec3 start=sourceOrigin+vec3(sourceSpread.x*pow(phase,spreadPower),-height*phase,sourceSpread.z*pow(phase,spreadPower));
          vec3 end=sourceOrigin+vec3(sourceSpread.x*pow(tail,spreadPower),-height*tail,sourceSpread.z*pow(tail,spreadPower));
          vec4 a=projectionMatrix*modelViewMatrix*vec4(start,1.0);
          vec4 b=projectionMatrix*modelViewMatrix*vec4(end,1.0);
          vec2 delta=(b.xy/b.w-a.xy/a.w)*sourceViewport;
          vec2 side=normalize(vec2(delta.y,-delta.x)+vec2(.000001));
          vec4 clip=mix(a,b,position.y);
          clip.xy+=side*(position.x-.5)*sourceStreakWidth*2.0/sourceViewport*clip.w;
          gl_Position=clip;
          sourceAlpha=${kind === 'rain' ? `${WATER_SOURCE_DISPLAY.rainOpacityMultiplier}*` : ''}activity*(mix(.39,.48,sourceKind)+mix(.24,.28,sourceKind)*sourceRate)*smoothstep(0.0,.035,phase)*(1.0-smoothstep(.96,1.0,phase));
        }`,
      fragmentShader: `
        uniform vec3 sourceColour; varying vec2 sourceUV; varying float sourceAlpha;
        void main(){
          float edge=1.0-smoothstep(.18,.5,abs(sourceUV.x-.5));
          float tip=smoothstep(0.0,.12,sourceUV.y)*(1.0-smoothstep(.8,1.0,sourceUV.y));
          float alpha=sourceAlpha*edge*tip;
          if(alpha<.002)discard;
          gl_FragColor=vec4(sourceColour,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    super(geometry, material);
    this.name = kind === 'rain' ? 'RainSystem' : 'IrrigationSpray';
    this.frustumCulled = false; this.renderOrder = 4; this.visible = false;
    this.userData = { maximumParticles: count, seed: kind === 'rain' ? '0x7261696e' : '0x73707279',
      streakWidthPixels: material.uniforms.sourceStreakWidth.value, aboveSurfaceOnly: true };
  }
  update(time: number, rate: number, width: number, height: number) {
    this.visible = rate > 0;
    this.material.uniforms.sourceTime.value = time;
    this.material.uniforms.sourceRate.value = rate;
    this.material.uniforms.sourceViewport.value.set(width, height);
  }
}

/** One shared boom template, instanced at each stationary depth position.
 * Fixed cross-sections/wheels/heights; bounded repeated bays and outlets,
 * never uniformly scale hardware by numerical hectares. */
function createLateralBoom(footprint: VisualFootprint) {
  const group = new THREE.Group(); group.name = 'LateralMoveIrrigator';
  const metal: THREE.BufferGeometry[] = [], rubber: THREE.BufferGeometry[] = [];
  const layout = irrigationLayout(footprint);
  const { span, positionsZ, boomCount } = layout, z = 0, height = 2.3;
  const towers = span < 16 ? 2 : span < 23 ? 3 : 4;
  const pipe = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    const difference = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius, radius, difference.length(), 6, 1);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), difference.normalize()));
    geometry.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2); metal.push(geometry);
  };
  const point = (x: number, y: number, dz = 0) => new THREE.Vector3(x,y,z+dz);
  pipe(point(-span/2,height),point(span/2,height),.044);
  pipe(point(-span/2,height+.25),point(span/2,height+.25),.023);
  const bays = Math.ceil(span/2.2);
  for (let i=0;i<bays;i++) {
    const a=-span/2+i*span/bays,b=a+span/bays;
    pipe(point(a,height),point((a+b)/2,height+.25),.019);
    pipe(point((a+b)/2,height+.25),point(b,height),.019);
  }
  for (let i=0;i<towers;i++) {
    const x=-span*.43+i*span*.86/(towers-1);
    for (const side of [-1,1]) {
      pipe(point(x,.22,side*.57),point(x,height),.036);
      const wheel=new THREE.CylinderGeometry(.22,.22,.14,10,1);
      wheel.rotateX(Math.PI/2); wheel.translate(x,.22,z+side*.64); rubber.push(wheel);
    }
    pipe(point(x,.23,-.6),point(x,.23,.6),.032);
  }
  const outlets = Math.max(5, Math.min(18, Math.ceil(span/1.45))), emitters: THREE.Vector3[] = [];
  for (let i=0;i<outlets;i++) {
    const x=-span*.46+i*span*.92/(outlets-1), bottom=1.86;
    pipe(point(x,height),point(x,bottom+.05),.012);
    const nozzle=new THREE.CylinderGeometry(.033,.046,.05,6); nozzle.translate(x,bottom+.025,z); metal.push(nozzle);
    for (let boomIndex = 0; boomIndex < boomCount; boomIndex++) {
      const emitter = new THREE.Object3D();
      emitter.name = `anchor_boom_${String(boomIndex+1).padStart(2,'0')}_sprinkler_${String(i+1).padStart(2,'0')}`;
      emitter.position.set(x, bottom, positionsZ[boomIndex]);
      group.add(emitter); emitters.push(emitter.position.clone());
    }
  }
  for (const [parts,colour,name] of [[metal,'#7f8984','IrrigationFrame'],[rubber,'#4b514b','IrrigationWheels']] as const) {
    const geometry=mergeGeometries(parts); parts.forEach(p=>p.dispose());
    const material=new THREE.MeshStandardMaterial({color:colour,roughness:.91,metalness:name==='IrrigationFrame'?.12:0,flatShading:true});
    const mesh=new THREE.InstancedMesh(geometry,material,boomCount);
    positionsZ.forEach((positionZ, i) => mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0,0,positionZ)));
    mesh.instanceMatrix.needsUpdate=true;
    mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  group.userData={type:'representative parallel lateral-move booms',...layout,height,
    towersPerBoom:towers,outletsPerBoom:outlets,totalTowers:towers*boomCount,totalOutlets:emitters.length,
    movement:'static',hardwareDrawCalls:2,
    physicalScale:'fixed height, wheel and pipe diameters; repeated bays, capped individual span; no uniform scaling',
    waterAccounting:'one supplied paddock irrigation activity; count/outlets/particles never calculate water quantity'};
  return {group,emitters};
}

/** Explanatory input visuals only. No references to moisture, roots, cracks,
 * crops or hydrology. Numerical water accounting cannot occur here. */
export class WaterSources extends THREE.Group {
  readonly rain: SourceParticles;
  readonly spray: SourceParticles;
  readonly hardware: THREE.Group;
  private state: WaterSourceState = { ...WATER_SOURCE_PREVIEW };
  constructor(footprint: VisualFootprint) {
    super(); this.name='WaterSources';
    const boom=createLateralBoom(footprint);
    this.hardware=boom.group; this.hardware.visible=false;
    this.rain=new SourceParticles('rain',footprint);
    this.spray=new SourceParticles('spray',footprint,boom.emitters);
    this.add(this.hardware,this.rain,this.spray);
  }
  setState(state: WaterSourceState) {
    validateWaterSources(state);this.state={...state};this.hardware.visible=state.waterSystem==='irrigated';
  }
  update(time: number, width: number, height: number) {
    this.rain.update(time,this.state.rainfallRate,width,height);
    this.spray.update(time,this.state.waterSystem==='irrigated'?this.state.irrigationRate:0,width,height);
    this.userData={state:{...this.state},effectiveIrrigationRate:this.state.waterSystem==='irrigated'?this.state.irrigationRate:0,
      rainVisible:this.rain.visible,sprayVisible:this.spray.visible,hardwareVisible:this.hardware.visible,
      timeSeconds:time,rain:this.rain.userData,spray:this.spray.userData,hardware:this.hardware.userData,
      authority:'supplied source activity only; no water amount, moisture mutation, crack or stress inference'};
  }
  dispose(){
    this.traverse(object=>{if(object instanceof THREE.Mesh){
      if(object instanceof THREE.InstancedMesh)object.dispose();
      object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(m=>m.dispose());
    }});
  }
}
