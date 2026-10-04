import * as THREE from 'three';
import type { RootAsset } from './rootAsset';
import type { WheatRootAnchor } from './WheatField';
import type { VisualFootprint } from './visualAdapter';
import { ROOT_DISPLAY, WHEAT_PLACEMENT } from './visualTokens';
import { rootInspection, soilPlanes } from './rootInspection';
import { createRootSectionMask } from './rootSectionMask';
import { buildRootSectionBatches, type RootSectionBatch } from './rootSections';
import { createRootPopulation } from './rootPopulation';
import { resolveRootPresentation, type RootPresentationState } from './rootPresentation';

/** Render cached section tubes only. Full volumetric sources remain independent
 * asset data; opaque soil is neither changed nor made transparent. */
export class RootSystems extends THREE.Group {
  readonly meshes: THREE.Mesh[]=[];
  readonly masks: THREE.Mesh[]=[];
  readonly sections: RootSectionBatch[];
  constructor(footprint:VisualFootprint, candidates:WheatRootAnchor[], private asset:RootAsset, state:RootPresentationState){
    super();this.name='RootSystems';
    const inspection=rootInspection(footprint),start=performance.now();
    const population=createRootPopulation(footprint,candidates,asset.segments);
    const placements=population.placements;
    this.sections=buildRootSectionBatches(population.sections);
    let triangles=0;
    this.sections.forEach((section,index)=>{
      const ref=index+1,mask=createRootSectionMask(section.face,ref);
      this.masks.push(mask);this.add(mask);
      const material=asset.material.clone();
      material.onBeforeCompile=asset.material.onBeforeCompile;
      material.customProgramCacheKey=asset.material.customProgramCacheKey;
      material.clippingPlanes=[...section.face.clips,...soilPlanes(footprint)];
      material.depthTest=false;material.depthWrite=false;
      material.stencilWrite=true;material.stencilWriteMask=0;
      material.stencilRef=ref;material.stencilFunc=THREE.EqualStencilFunc;
      const mesh=new THREE.Mesh(section.geometry,material);
      mesh.name=`RootSection_${section.face.id}`;mesh.renderOrder=2;
      mesh.castShadow=false;mesh.receiveShadow=false;
      triangles+=section.geometry.index!.count/3;this.meshes.push(mesh);this.add(mesh);
    });
    Object.assign(this.userData,{count:placements.length,visibleSystemCount:new Set(this.sections.flatMap(s=>s.pieces.map(p=>p.system))).size,
      population:population.diagnostics,buildMs:performance.now()-start,assetScale:1,source:'roots_wheat.glb',
      drawCalls:this.meshes.length+this.masks.length,rootDrawCalls:this.meshes.length,maskDrawCalls:this.masks.length,
      triangles,seed:WHEAT_PLACEMENT.seed,extractionRuns:1,rendering:'depth-tested face stencil; original 3D section tubes',
      inspection:{depth:inspection.depth,placementDepth:ROOT_DISPLAY.inspectionDepth,
        sideEnd:inspection.sideEnd,half:inspection.half.toArray(),faceOffset:0,relief:'original source depth'},
      sections:this.sections.map(s=>({face:s.face.id,pieces:s.pieces.length,quality:s.quality,
        systems:[...new Set(s.pieces.map(p=>p.system))],triangles:s.geometry.index!.count/3})),
      anchors:placements.map(({anchor:a,structure,yaw,face,stratum,accepted})=>({x:a.position.x,y:0,z:a.position.z,
        wheatVariant:a.variant,slot:a.slot,plant:a.plant,structure,yaw,face,stratum,accepted}))});
    this.setPresentation(state);
  }
  setPresentation(state:RootPresentationState){
    const presentation=resolveRootPresentation(state);
    this.asset.reveal.value=presentation.reveal;
    this.asset.senescence.value=presentation.condition.rootSenescence;
    this.meshes.forEach(mesh=>{mesh.visible=presentation.reveal>0;});
    this.masks.forEach(mesh=>{mesh.visible=presentation.reveal>0;});
    this.userData.presentation=presentation;
  }
}
