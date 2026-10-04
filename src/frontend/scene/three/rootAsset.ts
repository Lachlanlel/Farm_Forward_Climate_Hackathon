import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ROOT_DISPLAY } from './visualTokens';
import { ROOT_DISPLAY_DEPTH } from './rootPresentation';
import { ROOT_CONDITION_DISPLAY } from './rootCondition';

export type RootAssetStatus = 'loading' | 'ready' | 'unavailable';
export interface RootSegment {
  a: THREE.Vector3; b: THREE.Vector3; ra: number; rb: number; branch: number; order: number;
}
export interface RootAsset {
  geometries: THREE.BufferGeometry[];
  segments: RootSegment[][];
  material: THREE.MeshStandardMaterial;
  reveal: {value:number};
  senescence: {value:number};
  dispose(): void;
}
declare global { interface Window { __ROOTS_WHEAT_GLB__?: string } }

export async function loadRootAsset(): Promise<RootAsset> {
  const loader = new GLTFLoader(), embedded = window.__ROOTS_WHEAT_GLB__;
  const gltf = embedded
    ? await loader.parseAsync(Uint8Array.from(atob(embedded), c=>c.charCodeAt(0)).buffer, '')
    : await loader.loadAsync(new URL('assets/roots/roots_wheat.glb', document.baseURI).href);
  const geometries: THREE.BufferGeometry[] = [], segments: RootSegment[][] = [];
  let material: THREE.MeshStandardMaterial | undefined;
  try {
    const meshes: THREE.Mesh[] = [];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
    meshes.sort((a,b)=>a.name.localeCompare(b.name));
    if(meshes.length!==ROOT_DISPLAY.structureCount || gltf.animations.length)throw new Error('Unexpected static structure count in root family.');
    for(const mesh of meshes){
      if(!(mesh.material instanceof THREE.MeshStandardMaterial))throw new Error('Expected a minimal standard root material.');
      const geometry=mesh.geometry.clone();geometries.push(geometry);
      geometry.applyMatrix4(mesh.matrixWorld);geometry.computeBoundingBox();
      const box=geometry.boundingBox!;
      if(!geometry.getAttribute('_root_depth') || !geometry.getAttribute('_root_branch') || !geometry.getAttribute('_root_order') ||
        Math.abs(box.max.y)>.001 || -box.min.y>ROOT_DISPLAY_DEPTH+.025 || -box.min.y<1.4 ||
        box.max.x-box.min.x<.6 || box.max.z-box.min.z<.6)
        throw new Error('Root sources require crown origins, real 3D spread and reveal masks.');
      const records=mesh.userData.root_segments;
      if(mesh.userData.root_segment_stride!==10 || !Array.isArray(records) || !records.length || records.length%10 ||
        !records.every(Number.isFinite))throw new Error('Root source is missing centreline/radius section records. Regenerate the GLB.');
      const source: RootSegment[]=[];
      for(let i=0;i<records.length;i+=10){
        const [ax,ay,az,bx,by,bz,ra,rb,branch,order]=records.slice(i,i+10);
        const a=new THREE.Vector3(ax,ay,az),b=new THREE.Vector3(bx,by,bz);
        if(ra<=0 || rb<=0 || ra>.028 || rb>.028 || !Number.isInteger(branch) || branch<0 ||
          !Number.isInteger(order) || order<0 || order>2 || a.distanceToSquared(b)<1e-10 ||
          a.y>.001 || b.y>.001 || Math.min(a.y,b.y)<-ROOT_DISPLAY_DEPTH)
          throw new Error('Invalid root segment metadata.');
        source.push({a,b,ra,rb,branch,order});
      }
      // Segment extras are runtime axes; the author must apply transforms.
      if(!mesh.matrixWorld.equals(new THREE.Matrix4()))throw new Error('Root section records require applied identity transforms.');
      segments.push(source);
    }
    material=(meshes[0].material as THREE.MeshStandardMaterial).clone();
    material.color.set(ROOT_CONDITION_DISPLAY.healthyColour);material.roughness=1;material.metalness=0;
    material.flatShading=true;material.side=THREE.FrontSide;
    material.depthTest=true;material.depthWrite=true;
    // Blended fine laterals share the existing stencil section passes. Principal
    // roots keep alpha 1; healthy zero follows the original material exactly.
    material.transparent=true;
    const reveal={value:1},senescence={value:0};
    const condition=ROOT_CONDITION_DISPLAY;
    const senescentColour={value:new THREE.Color(condition.senescentColour)};
    material.onBeforeCompile=shader=>{
      shader.uniforms.rootReveal=reveal;
      shader.uniforms.rootSenescence=senescence;
      shader.uniforms.rootSenescentColour=senescentColour;
      shader.vertexShader='attribute float _root_depth; attribute float _root_order; varying float vRootDepth; varying float vRootOrder;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRootDepth = _root_depth; vRootOrder = _root_order;');
      shader.fragmentShader='uniform float rootReveal; uniform float rootSenescence; uniform vec3 rootSenescentColour; varying float vRootDepth; varying float vRootOrder;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif (rootReveal <= 0.0 || vRootDepth > rootReveal) discard;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if (rootSenescence > 0.0) {
          float ageing = smoothstep(${condition.colourStart}, ${condition.colourFull.toFixed(2)}, rootSenescence);
          diffuseColor.rgb = mix(diffuseColor.rgb, rootSenescentColour, ageing);
          float fineLoss = smoothstep(${condition.fadeStart}, ${condition.fadeFull.toFixed(1)}, rootSenescence);
          float retained = vRootOrder > 1.5 ? ${condition.fineOpacityFloor} : (vRootOrder > 0.5 ? ${condition.secondaryOpacityFloor} : 1.0);
          diffuseColor.a *= 1.0 - (1.0 - retained) * fineLoss;
        }`);
    };
    material.customProgramCacheKey=()=> 'roots-wheat-fibrous-section-condition-v6';
    const result: RootAsset = {geometries,segments,material,reveal,senescence,
      dispose(){this.geometries.forEach(g=>g.dispose());this.material.dispose();}};
    return result;
  }catch(error){geometries.forEach(g=>g.dispose());material?.dispose();throw error;}
  finally{gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){
    o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());
  }});}
}
