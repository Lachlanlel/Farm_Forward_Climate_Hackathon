import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import recipe from '../tools/blender/stubble_profiles.json';

export const STUBBLE_PROFILES = recipe;
export interface StubbleAsset { geometries: THREE.BufferGeometry[]; dispose(): void }
declare global { interface Window { __STUBBLE_GLB__?: string } }

/** Same authoring recipe as the GLB, used only during loading/failure. */
export function createStubbleFallback(): THREE.BufferGeometry[] {
  return recipe.variants.map(profile => {
    const parts: THREE.BufferGeometry[] = [];
    for (const line of profile.lines) for (let i=1;i<line.length;i++) {
      const convert = (p:number[]) => new THREE.Vector3(p[0],p[2],-p[1]);
      const a=convert(line[i-1]),b=convert(line[i]),delta=b.clone().sub(a);
      const g=new THREE.CylinderGeometry(profile.radius,profile.radius,delta.length(),recipe.sides,1);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
      g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);parts.push(g);
    }
    const geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());geometry.computeBoundingBox();
    geometry.translate(0,-geometry.boundingBox!.min.y,0);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return geometry;
  });
}

export async function loadStubbleAsset(): Promise<StubbleAsset> {
  const loader=new GLTFLoader(),embedded=window.__STUBBLE_GLB__;
  const gltf=embedded ? await loader.parseAsync(Uint8Array.from(atob(embedded),c=>c.charCodeAt(0)).buffer,'')
    : await loader.loadAsync(new URL('assets/stubble/stubble_A.glb',document.baseURI).href);
  const geometries:THREE.BufferGeometry[]=[];
  try {
    gltf.scene.updateMatrixWorld(true);
    const meshes:THREE.Mesh[]=[];gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o)});
    if(meshes.length!==recipe.variants.length||gltf.animations.length)throw Error('Expected six static residue variants');
    for(const profile of recipe.variants){
      const mesh=meshes.find(m=>m.name==='stubble_'+profile.id);
      if(!mesh)throw Error('Missing residue variant '+profile.id);
      const g=mesh.geometry.clone();geometries.push(g);g.applyMatrix4(mesh.matrixWorld);g.computeBoundingBox();g.computeBoundingSphere();
      const b=g.boundingBox!;
      if(Math.abs(b.min.y)>.0001||b.max.y>.19||b.max.x-b.min.x>.60||b.max.z-b.min.z>.60)
        throw Error('Residue origin/axes/scale mismatch');
    }
    return {geometries,dispose(){geometries.forEach(g=>g.dispose())}};
  }catch(error){geometries.forEach(g=>g.dispose());throw error}
  finally{gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose())}})}
}
