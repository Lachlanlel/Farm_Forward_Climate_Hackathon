import * as THREE from 'three';
import type { RootSectionFace } from './rootInspection';
import { ROOT_DISPLAY, SOIL_DISPLAY_DEPTH } from './visualTokens';

/** Invisible, depth-tested face mask. Does not alter or replace any soil mesh.
 * Only currently exposed soil pixels receive this face's stencil identity. */
export function createRootSectionMask(face:RootSectionFace,ref:number){
  const front=face.id==='front';
  const {min,max}=face.span;
  const material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,
    stencilWrite:true,stencilRef:ref,stencilFunc:THREE.AlwaysStencilFunc,
    stencilZPass:THREE.ReplaceStencilOp,stencilZFail:THREE.KeepStencilOp,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const mask=new THREE.Mesh(new THREE.PlaneGeometry(max-min,SOIL_DISPLAY_DEPTH-ROOT_DISPLAY.edgeInset),material);
  mask.name=`RootSectionMask_${face.id}`;mask.renderOrder=1;
  if(front)mask.position.set((min+max)/2,-(SOIL_DISPLAY_DEPTH-ROOT_DISPLAY.edgeInset)/2,face.coordinate);
  else {
    mask.rotation.y=face.id==='left'?-Math.PI/2:Math.PI/2;
    mask.position.set(face.normal.x*face.coordinate,-(SOIL_DISPLAY_DEPTH-ROOT_DISPLAY.edgeInset)/2,(min+max)/2);
  }
  return mask;
}
