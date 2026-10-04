import * as THREE from 'three';
import type { VisualFootprint } from './visualAdapter';
import { ROOT_DISPLAY, SOIL_DISPLAY_DEPTH } from './visualTokens';

export type RootFace = 'front' | 'right' | 'left';
export interface RootSectionFace {
  id: RootFace;
  normal: THREE.Vector3;
  coordinate: number;
  span: { min:number; max:number };
  clips: THREE.Plane[];
  inwardDistance(point: THREE.Vector3): number;
}

/** Root-only sampling and rendering bounds. Never used to change soil geometry. */
export function rootInspection(footprint: VisualFootprint) {
  const half = new THREE.Vector2(footprint.width / 2, footprint.depth / 2);
  // Full chamfer-to-chamfer side extent. Never truncate it near the front.
  return { half, sideEnd: -half.y+.22+ROOT_DISPLAY.edgeInset, depth: ROOT_DISPLAY.sectionDepth };
}

export function soilPlanes(footprint: VisualFootprint): THREE.Plane[] {
  const { half: h } = rootInspection(footprint);
  const p = (x: number, y: number, z: number, c: number) => new THREE.Plane(new THREE.Vector3(x,y,z), c);
  return [p(0,-1,0,0), p(0,1,0,SOIL_DISPLAY_DEPTH),
    p(1,0,0,h.x), p(-1,0,0,h.x), p(0,0,1,h.y), p(0,0,-1,h.y),
    ...[-1,1].flatMap(x => [-1,1].map(z => p(x,0,z,h.x+h.y-.22)))];
}

export function sectionFaces(footprint: VisualFootprint): RootSectionFace[] {
  const { half: h, sideEnd } = rootInspection(footprint);
  const margin = .22 + ROOT_DISPLAY.edgeInset;
  const vertical = [new THREE.Plane(new THREE.Vector3(0,-1,0), 0),
    new THREE.Plane(new THREE.Vector3(0,1,0), SOIL_DISPLAY_DEPTH-ROOT_DISPLAY.edgeInset)];
  return (['front','right','left'] as const).map(id => {
    const front = id==='front', sign = id==='left' ? -1 : 1;
    const normal = front ? new THREE.Vector3(0,0,1) : new THREE.Vector3(sign,0,0);
    const coordinate = front ? h.y : h.x;
    const span = front ? {min:-h.x+margin,max:h.x-margin} : {min:sideEnd,max:h.y-margin};
    const inwardDistance = (point: THREE.Vector3) => coordinate-normal.dot(point);
    const clips = front
      ? [new THREE.Plane(new THREE.Vector3(1,0,0), -span.min), new THREE.Plane(new THREE.Vector3(-1,0,0), span.max)]
      : [new THREE.Plane(new THREE.Vector3(0,0,1), -span.min), new THREE.Plane(new THREE.Vector3(0,0,-1), span.max)];
    return {id, normal, coordinate, span, clips:[...vertical,...clips], inwardDistance};
  });
}
