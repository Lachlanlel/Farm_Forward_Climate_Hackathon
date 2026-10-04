import * as THREE from 'three';
import type { VisualFootprint } from './visualAdapter';
import type { WheatRootAnchor } from './WheatField';
import type { RootSegment } from './rootAsset';
import { ROOT_DISPLAY, WHEAT_PLACEMENT } from './visualTokens';
import { seededRandom } from './RowStratifiedPlacement';
import { sectionFaces, type RootFace } from './rootInspection';
import { extractRootSectionPieces, type RootPlacement, type RootSectionPieces } from './rootSections';

export interface RootPopulationPlacement extends RootPlacement {
  anchor:WheatRootAnchor; face:RootFace; stratum:number; accepted:boolean;
}

/** Counts use rendered face lengths only. No raw-hectare, camera or model input. */
export function rootPopulationPlan(footprint:VisualFootprint){
  return sectionFaces(footprint).map(face=>{
    const front=face.id==='front';
    // Population, extraction clips and stencil share the same complete span.
    const {min,max}=face.span;
    const length=max-min;
    const target=THREE.MathUtils.clamp(Math.ceil(length/ROOT_DISPLAY.targetSpacing),
      front?ROOT_DISPLAY.minFrontCount:ROOT_DISPLAY.minSideCount,
      front?ROOT_DISPLAY.maxFrontCount:ROOT_DISPLAY.maxSideCount);
    // Keep whole crowns away from chamfer edges; their branches are still clipped.
    const crownMargin=front?ROOT_DISPLAY.crownEdgeMargin:ROOT_DISPLAY.sideCrownEdgeMargin;
    return {face,min,max,length,target,crownMin:min+crownMargin,crownMax:max-crownMargin};
  });
}

/** Exact target strata, small seeded jitter, real planted crowns, and a bounded
 * reserve search after section-quality rejection. Never moves a wheat plant. */
export function createRootPopulation(footprint:VisualFootprint,candidates:WheatRootAnchor[],sources:RootSegment[][]){
  const plan=rootPopulationPlan(footprint),placements:RootPopulationPlacement[]=[];
  const sections:RootSectionPieces[]=plan.map(p=>({face:p.face,pieces:[],
    quality:{inputPieces:0,keptComponents:0,rejectedComponents:0,rejectedPieces:0}}));
  const diagnostics=[];
  for(let faceIndex=0;faceIndex<plan.length;faceIndex++){
    const p=plan[faceIndex],front=p.face.id==='front',pitch=(p.crownMax-p.crownMin)/p.target;
    let accepted=0,attempted=0;
    const tangent=(a:WheatRootAnchor)=>front?a.position.x:a.position.z;
    const faceCandidates=candidates.filter(a=>{
      const inset=p.face.inwardDistance(a.position),along=tangent(a);
      return inset>=.02 && inset<=ROOT_DISPLAY.inspectionDepth && along>=p.crownMin && along<=p.crownMax;
    });
    for(let stratum=0;stratum<p.target;stratum++){
      const random=seededRandom(WHEAT_PLACEMENT.seed ^ Math.imul(faceIndex+1,0x726f6f74) ^ Math.imul(stratum+1,0x9e3779b9));
      const centre=p.crownMin+(stratum+.5+(random()-.5)*ROOT_DISPLAY.stratumJitter)*pitch;
      const inset=.35+random()*.40,structure=Math.floor(random()*sources.length),yaw=random()*Math.PI*2;
      const lower=p.crownMin+stratum*pitch,upper=lower+pitch;
      const available=faceCandidates.filter(a=>tangent(a)>=lower && tangent(a)<=upper &&
        !placements.some(b=>b.anchor.slot===a.slot && b.anchor.plant===a.plant) &&
        !placements.some(b=>b.accepted && b.position.distanceTo(a.position)<ROOT_DISPLAY.minimumSpacing));
      const score=(a:WheatRootAnchor)=>(tangent(a)-centre)**2+1.5*(p.face.inwardDistance(a.position)-inset)**2;
      available.sort((a,b)=>score(a)-score(b) || a.slot-b.slot || a.plant-b.plant);
      for(const anchor of available.slice(0,ROOT_DISPLAY.candidateAttempts)){
        const placement={anchor,position:anchor.position.clone(),face:p.face.id,stratum,structure,yaw,accepted:false};
        const system=placements.length;placements.push(placement);attempted++;
        const extracted=extractRootSectionPieces(footprint,sources,[placement]);
        const own=extracted.find(s=>s.face.id===p.face.id)!;
        // A target counts meaningful visible architecture, never an isolated twig.
        const majors=new Set(own.pieces.filter(piece=>piece.order===0 && Math.max(piece.ra,piece.rb)>=.009).map(piece=>piece.branch));
        if(majors.size<2)continue;
        sections.forEach((s,i)=>{
          const quality=extracted[i].quality;
          Object.keys(s.quality).forEach(key=>{const k=key as keyof typeof quality;s.quality[k]+=quality[k];});
        });
        placement.accepted=true;accepted++;
        extracted.forEach((s,i)=>sections[i].pieces.push(...s.pieces.map(piece=>({...piece,system}))));
        break;
      }
    }
    diagnostics.push({face:p.face.id,span:{min:p.min,max:p.max},length:p.length,target:p.target,sourceCount:attempted,
      visibleCount:accepted,candidateCount:faceCandidates.length,pitch});
  }
  return {placements,sections,diagnostics};
}
