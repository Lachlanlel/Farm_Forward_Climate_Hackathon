import * as THREE from 'three';
import type { VisualFootprint } from './visualAdapter';
import { seededRandom } from './RowStratifiedPlacement';
import { STUBBLE_PROFILES, createStubbleFallback, type StubbleAsset } from './stubbleAsset';

/** Display settings only, not residue mass or an evaporation coefficient. */
export const STUBBLE_DISPLAY = { seed:0x57bb1e, cellSize:1.05, minimumPerCell:17,
  extraPerCell:7, surfaceOffset:.0015, edgeInset:.045, maximumInstances:9000,
  contactShadowStrength:.12,
  // Shared desaturated dry straw: distinct from the PGI-driven live olive crop.
  // Applied once (not multiplied by a second warm material tint).
  palette:['#918476','#9b8f81','#887b6c','#a09485'] } as const;

/** Narrow soft contact darkening only, projected from each retained stem's
 * actual path. One batch multiplies the existing surface colour, preserving
 * Sandy/Clay hue and wetness. No soil-material or lighting modification. */
function createContactShadows(matrices:THREE.Matrix4[][]):THREE.Mesh {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),direction=new THREE.Vector3(),side=new THREE.Vector3();
  const height=STUBBLE_DISPLAY.surfaceOffset*.4;
  STUBBLE_PROFILES.variants.forEach((profile,variant)=>{
    matrices[variant].forEach(matrix=>{
      for(const line of profile.lines)for(let i=1;i<line.length;i++){
        // The GLB's contact normalisation changes Y only; authored X/Z paths
        // map identically here. Residue and contact shadow share each transform.
        a.set(line[i-1][0],0,-line[i-1][1]).applyMatrix4(matrix);
        b.set(line[i][0],0,-line[i][1]).applyMatrix4(matrix);
        a.y=b.y=height;direction.copy(b).sub(a).normalize();
        side.set(-direction.z,0,direction.x).multiplyScalar(profile.radius*1.75);
        a.addScaledVector(direction,-profile.radius*1.5);b.addScaledVector(direction,profile.radius*1.5);
        const offset=positions.length/3;
        for(const [point,sign]of[[a,-1],[b,-1],[b,1],[a,1]] as const)
          positions.push(point.x+side.x*sign,height,point.z+side.z*sign);
        uvs.push(0,0,1,0,1,1,0,1);indices.push(offset,offset+2,offset+1,offset,offset+3,offset+2);
      }
    });
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();
  const material=new THREE.ShaderMaterial({transparent:true,premultipliedAlpha:true,depthTest:true,depthWrite:false,
    blending:THREE.MultiplyBlending,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    uniforms:{contactStrength:{value:STUBBLE_DISPLAY.contactShadowStrength}},
    vertexShader:`varying vec2 contactUV;
      void main(){contactUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 contactUV;uniform float contactStrength;
      void main(){
        float edge=1.0-smoothstep(.1,.5,abs(contactUV.y-.5));
        float ends=smoothstep(0.0,.15,contactUV.x)*(1.0-smoothstep(.85,1.0,contactUV.x));
        float factor=1.0-contactStrength*edge*ends;
        gl_FragColor=vec4(vec3(factor),1.0);
      }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='StubbleContactShadows';
  mesh.userData={triangles:indices.length/3,maximumDarkening:STUBBLE_DISPLAY.contactShadowStrength,surfaceHeight:height};
  return mesh;
}

/** Previous-crop surface residue. No crop, root, soil, clock or hydrology input. */
export class StubbleLayer extends THREE.Group {
  readonly meshes:THREE.InstancedMesh[]=[];
  readonly contactShadows:THREE.Mesh;
  constructor(footprint:VisualFootprint,asset?:StubbleAsset){
    super();this.name='StubbleLayer';
    const sources=asset?.geometries.map(g=>g.clone())??createStubbleFallback();
    // Fixed dry residue tint: visually secondary to live wheat in every scenario.
    // It never reads PGI, drought severity or the wider-row selection.
    const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,metalness:0,flatShading:true});
    const width=footprint.width,depth=footprint.depth,cols=Math.ceil(width/STUBBLE_DISPLAY.cellSize),rows=Math.ceil(depth/STUBBLE_DISPLAY.cellSize);
    // Apply the safety budget to every cell, never truncate the last farm rows.
    const capPerCell=Math.floor(STUBBLE_DISPLAY.maximumInstances/(rows*cols));
    const matrices:THREE.Matrix4[][]=sources.map(()=>[]),colours:THREE.Color[][]=sources.map(()=>[]);
    const transform=new THREE.Object3D(),point=new THREE.Vector3(),weights=STUBBLE_PROFILES.variants.map(v=>v.weight);
    let requested=0,rejectedBounds=0,count=0,maximumY=0;
    const inside=(x:number,z:number)=>Math.abs(x)<=width/2-STUBBLE_DISPLAY.edgeInset&&
      Math.abs(z)<=depth/2-STUBBLE_DISPLAY.edgeInset&&Math.abs(x)+Math.abs(z)<=width/2+depth/2-.22-STUBBLE_DISPLAY.edgeInset;
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const random=seededRandom(STUBBLE_DISPLAY.seed^Math.imul(row*4096+col+1,0x85ebca6b));
      const target=Math.min(capPerCell,STUBBLE_DISPLAY.minimumPerCell+Math.floor(random()*STUBBLE_DISPLAY.extraPerCell));requested+=target;
      const clusterX=.2+random()*.6,clusterZ=.2+random()*.6,localYaw=random()*Math.PI*2;
      const subCols=Math.ceil(Math.sqrt(target)),subRows=Math.ceil(target/subCols);
      const slots=Array.from({length:subCols*subRows},(_,i)=>i);
      for(let i=slots.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]]}
      let placed=0;
      for(let attempt=0;attempt<target*6&&placed<target&&count<STUBBLE_DISPLAY.maximumInstances;attempt++){
        const roll=random();let variant=0,sum=weights[0];while(variant<weights.length-1&&roll>sum)sum+=weights[++variant];
        // First pass fills shuffled micro-strata. Bounds retries can use the
        // complete cell, so an impossible edge slot cannot leave the cell bald.
        const slot=slots[attempt%slots.length],stratified=attempt<target,clustered=random()<.20;
        let px=stratified?(slot%subCols+.1+random()*.8)/subCols:random();
        let pz=stratified?(Math.floor(slot/subCols)+.1+random()*.8)/subRows:random();
        if(clustered){px=THREE.MathUtils.lerp(px,clusterX,.3);pz=THREE.MathUtils.lerp(pz,clusterZ,.3)}
        transform.position.set(-width/2+(col+px)*width/cols,STUBBLE_DISPLAY.surfaceOffset,-depth/2+(row+pz)*depth/rows);
        transform.rotation.set(0,random()<.35?localYaw+(random()-.5)*1.3:random()*Math.PI*2,0);
        // Same fixed scale distribution at all hectare inputs; never scale the group.
        transform.scale.set(.84+random()*.34,.90+random()*.18,.90+random()*.18);transform.updateMatrix();
        const positions=sources[variant].getAttribute('position');let valid=true,maxY=0;
        for(let i=0;i<positions.count;i++){
          point.fromBufferAttribute(positions,i).applyMatrix4(transform.matrix);
          if(!inside(point.x,point.z)){valid=false;break}maxY=Math.max(maxY,point.y);
        }
        if(!valid){rejectedBounds++;continue}
        matrices[variant].push(transform.matrix.clone());colours[variant].push(new THREE.Color(STUBBLE_DISPLAY.palette[Math.floor(random()*STUBBLE_DISPLAY.palette.length)]));
        maximumY=Math.max(maximumY,maxY);placed++;count++;
      }
    }
    let triangles=0;
    sources.forEach((g,i)=>{
      const mesh=new THREE.InstancedMesh(g,material,matrices[i].length);mesh.name='Stubble_'+STUBBLE_PROFILES.variants[i].id;
      matrices[i].forEach((matrix,j)=>{mesh.setMatrixAt(j,matrix);mesh.setColorAt(j,colours[i][j])});
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
      mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();this.meshes.push(mesh);this.add(mesh);
      triangles+=matrices[i].length*(g.index?.count??g.getAttribute('position').count)/3;
    });
    this.contactShadows=createContactShadows(matrices);this.add(this.contactShadows);
    Object.assign(this.userData,{instanceCount:count,requested,rejectedBounds,seed:STUBBLE_DISPLAY.seed,cells:{rows,cols},
      variants:STUBBLE_PROFILES.variants.map((v,i)=>({id:v.id,count:matrices[i].length,triangles:(sources[i].index?.count??sources[i].getAttribute('position').count)/3})),
      source:asset?'stubble_A.glb':'recipe fallback',drawCalls:this.meshes.length+1,
      residueTriangles:triangles,contactTriangles:this.contactShadows.userData.triangles,
      triangles:triangles+this.contactShadows.userData.triangles,maximumY,surfaceOffset:STUBBLE_DISPLAY.surfaceOffset,
      contactShadowStrength:STUBBLE_DISPLAY.contactShadowStrength,palette:STUBBLE_DISPLAY.palette,
      distribution:'seeded cells with shuffled micro-strata and restrained clustering; independent of crop rows, condition and soil',
      meaning:'retained previous-crop residue; persistent Week 0–12; no decomposition or hydrology'});
  }

  dispose(){
    const materials=new Set<THREE.Material>();
    for(const mesh of [...this.meshes,this.contactShadows]){
      mesh.geometry.dispose();(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>materials.add(m));
      if(mesh instanceof THREE.InstancedMesh)mesh.dispose();
    }
    materials.forEach(m=>m.dispose());
  }
}
