import * as THREE from 'three';
import type { RootSegment } from './rootAsset';
import { ROOT_DISPLAY } from './visualTokens';
import { ROOT_DISPLAY_DEPTH } from './rootPresentation';
import { sectionFaces, soilPlanes, type RootFace, type RootSectionFace } from './rootInspection';
import type { VisualFootprint } from './visualAdapter';

export interface RootPlacement { position: THREE.Vector3; structure: number; yaw: number }
export interface SectionPiece extends RootSegment {
  system: number; segment: number; face: RootFace; t0: number; t1: number;
}
export interface RootSectionPieces {
  face: RootSectionFace; pieces: SectionPiece[];
  quality: { inputPieces:number; keptComponents:number; rejectedComponents:number; rejectedPieces:number };
}
export interface RootSectionBatch extends RootSectionPieces { geometry: THREE.BufferGeometry }
type Interval = [number, number];
const EPS = 1e-8;

/** Intersect a parameter interval with one linear positive half-space. */
function clip(interval: Interval, start: number, end: number): boolean {
  if(start < 0 && end < 0) return false;
  if(start < 0) interval[0] = Math.max(interval[0], start/(start-end));
  else if(end < 0) interval[1] = Math.min(interval[1], start/(start-end));
  return interval[1]-interval[0] > EPS;
}

/** CPU extraction runs only on source/placement changes. A section piece has
 * exactly one owner, even where the front and side sampling slabs overlap. */
export function extractRootSections(footprint: VisualFootprint, sources: RootSegment[][], placements: RootPlacement[]): RootSectionBatch[] {
  return buildRootSectionBatches(extractRootSectionPieces(footprint,sources,placements));
}

export function extractRootSectionPieces(footprint: VisualFootprint, sources: RootSegment[][], placements: RootPlacement[]): RootSectionPieces[] {
  const faces = sectionFaces(footprint), bounds = soilPlanes(footprint);
  const byFace = new Map<RootFace, SectionPiece[]>(faces.map(face=>[face.id,[]]));
  placements.forEach((placement, system)=>{
    const matrix = new THREE.Matrix4().makeRotationY(placement.yaw).setPosition(placement.position);
    sources[placement.structure].forEach((source, segment)=>{
      const a=source.a.clone().applyMatrix4(matrix), b=source.b.clone().applyMatrix4(matrix);
      const inside: Interval=[0,1];
      if(!bounds.every(plane=>clip(inside,plane.distanceToPoint(a),plane.distanceToPoint(b)))) return;
      const candidates = faces.flatMap(face=>{
        const interval: Interval=[...inside];
        const da=face.inwardDistance(a), db=face.inwardDistance(b);
        // Include tubes that intersect the slab, not just their centrelines.
        if(!clip(interval,da+source.ra,db+source.rb) ||
          !clip(interval,ROOT_DISPLAY.sectionDepth-da+source.ra,ROOT_DISPLAY.sectionDepth-db+source.rb) ||
          !face.clips.every(plane=>clip(interval,plane.distanceToPoint(a)+source.ra,plane.distanceToPoint(b)+source.rb))) return [];
        return [{face,interval,da,db}];
      });
      const cuts=candidates.flatMap(c=>c.interval);
      for(let i=0;i<candidates.length;i++) for(let j=i+1;j<candidates.length;j++){
        const c=candidates[i],d=candidates[j],start=c.da-d.da,end=c.db-d.db;
        if(Math.abs(start-end)>EPS){
          const t=start/(start-end);
          if(t>Math.max(c.interval[0],d.interval[0])+EPS && t<Math.min(c.interval[1],d.interval[1])-EPS) cuts.push(t);
        }
      }
      const sorted=[...new Set(cuts)].sort((x,y)=>x-y);
      for(let i=0;i<sorted.length-1;i++){
        const t0=sorted[i],t1=sorted[i+1],mid=(t0+t1)/2;
        if(t1-t0<=EPS) continue;
        const eligible=candidates.filter(c=>mid>=c.interval[0]-EPS && mid<=c.interval[1]+EPS);
        // Stable front/right/left order breaks exact-distance ties.
        eligible.sort((c,d)=>(c.da+(c.db-c.da)*mid)-(d.da+(d.db-d.da)*mid));
        if(!eligible.length) continue;
        const face=eligible[0].face.id;
        byFace.get(face)!.push({...source,system,segment,face,t0,t1,
          a:a.clone().lerp(b,t0),b:a.clone().lerp(b,t1),
          ra:THREE.MathUtils.lerp(source.ra,source.rb,t0),rb:THREE.MathUtils.lerp(source.ra,source.rb,t1)});
      }
    });
  });
  return faces.map(face=>({face,...filterSectionFragments(byFace.get(face.id)!)}));
}

export function buildRootSectionBatches(sections: RootSectionPieces[]): RootSectionBatch[] {
  return sections.filter(section=>section.pieces.length>0).map(section=>({
    ...section,geometry:sectionTubeGeometry(section.face,section.pieces),
  }));
}

/** Connectivity is measured in the original 3D source, before face projection.
 * Components cannot borrow apparent crossings from unrelated projected fibres. */
export function filterSectionFragments(input: SectionPiece[]) {
  const systems=new Map<number,SectionPiece[]>(),pieces:SectionPiece[]=[];
  input.forEach(p=>{const group=systems.get(p.system)??[];group.push(p);systems.set(p.system,group);});
  let keptComponents=0,rejectedComponents=0;
  const tolerance2=ROOT_DISPLAY.fragmentJoinTolerance**2;
  const pointDistance2=(point:THREE.Vector3,a:THREE.Vector3,b:THREE.Vector3)=>{
    const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
    const t=THREE.MathUtils.clamp(((point.x-a.x)*dx+(point.y-a.y)*dy+(point.z-a.z)*dz)/(dx*dx+dy*dy+dz*dz),0,1);
    return (point.x-a.x-t*dx)**2+(point.y-a.y-t*dy)**2+(point.z-a.z-t*dz)**2;
  };
  for(const group of systems.values()){
    const parents=group.map((_,i)=>i);
    const find=(i:number):number=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
    const join=(i:number,j:number)=>{parents[find(i)]=find(j);};
    for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
      const a=group[i],b=group[j];
      if(a.branch===b.branch){
        if(a.b.distanceToSquared(b.a)<=tolerance2 || b.b.distanceToSquared(a.a)<=tolerance2)join(i,j);
      }else if(a.order===0 && b.order===0){
        if(a.a.distanceToSquared(b.a)<=tolerance2)join(i,j);
      }else if(Math.abs(a.order-b.order)===1){
        const child=a.order>b.order?a:b,parent=a.order>b.order?b:a;
        if(pointDistance2(child.a,parent.a,parent.b)<=tolerance2)join(i,j);
      }
    }
    const components=new Map<number,SectionPiece[]>();
    group.forEach((p,i)=>{const key=find(i),component=components.get(key)??[];component.push(p);components.set(key,component);});
    for(const component of components.values()){
      const length=component.reduce((sum,p)=>sum+p.a.distanceTo(p.b),0);
      const strong=component.filter(p=>p.order===0 && Math.max(p.ra,p.rb)>=.009)
        .reduce((sum,p)=>sum+p.a.distanceTo(p.b),0);
      const secondary=component.filter(p=>p.order===1).reduce((sum,p)=>sum+p.a.distanceTo(p.b),0);
      const branches=new Set(component.map(p=>p.branch)).size;
      if(length>=ROOT_DISPLAY.fragmentMinLength && component.length>=ROOT_DISPLAY.fragmentMinPieces &&
        branches>=2 && (strong>=.45 || secondary>=.65)){
        pieces.push(...component);keptComponents++;
      }else rejectedComponents++;
    }
  }
  return {pieces,quality:{inputPieces:input.length,keptComponents,rejectedComponents,rejectedPieces:input.length-pieces.length}};
}

/** Join extracted paths into four-sided tubes in their original 3D positions.
 * Face stencil masks reveal them without flattening or moving source branches. */
function sectionTubeGeometry(face: RootSectionFace, pieces: SectionPiece[]): THREE.BufferGeometry {
  const paths: {points:THREE.Vector3[]; radii:number[]; branch:number; order:number}[]=[];
  const groups=new Map<string,SectionPiece[]>();
  pieces.forEach(piece=>{
    const key=`${piece.system}:${piece.branch}`;
    const group=groups.get(key)??[]; group.push(piece);groups.set(key,group);
  });
  for(const group of groups.values()){
    group.sort((a,b)=>a.segment-b.segment || a.t0-b.t0);
    let path: typeof paths[number] | undefined, last: THREE.Vector3 | undefined;
    for(const piece of group){
      if(!last || last.distanceToSquared(piece.a)>1e-10){
        path={points:[piece.a.clone()],radii:[piece.ra],branch:piece.branch,order:piece.order};
        paths.push(path);
      }
      path!.points.push(piece.b.clone());path!.radii.push(piece.rb);last=piece.b;
    }
  }
  const positions:number[]=[],indices:number[]=[],depths:number[]=[],branches:number[]=[],orders:number[]=[];
  for(const {points,radii,branch,order} of paths){
    const rings:number[][]=[];
    for(let i=0;i<points.length;i++){
      const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
      const reference=Math.abs(tangent.dot(face.normal))<.9 ? face.normal : new THREE.Vector3(0,1,0);
      const u=tangent.clone().cross(reference).normalize(),v=tangent.clone().cross(u).normalize(),ring:number[]=[];
      for(let j=0;j<4;j++){
        const point=points[i].clone().addScaledVector(u,radii[i]*Math.cos(j*Math.PI/2)).addScaledVector(v,radii[i]*Math.sin(j*Math.PI/2));
        // Crown surface is exact. Face clipping handles remaining side/bottom bounds.
        point.y=Math.min(0,point.y);
        ring.push(positions.length/3);positions.push(...point.toArray());
        depths.push(THREE.MathUtils.clamp(-point.y/ROOT_DISPLAY_DEPTH,0,1));branches.push(branch);orders.push(order);
      }
      rings.push(ring);
    }
    const first=rings[0],last=rings[rings.length-1];
    indices.push(first[0],first[2],first[1],first[0],first[3],first[2]);
    for(let i=1;i<rings.length;i++) for(let j=0;j<4;j++){
      const a=rings[i-1],b=rings[i],k=(j+1)%4;
      indices.push(a[j],a[k],b[j],a[k],b[k],b[j]);
    }
    indices.push(last[0],last[1],last[2],last[0],last[2],last[3]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('_root_depth',new THREE.Float32BufferAttribute(depths,1));
  geometry.setAttribute('_root_branch',new THREE.Float32BufferAttribute(branches,1));
  geometry.setAttribute('_root_order',new THREE.Float32BufferAttribute(orders,1));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}
