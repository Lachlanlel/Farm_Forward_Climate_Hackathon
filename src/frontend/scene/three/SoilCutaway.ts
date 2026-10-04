import * as THREE from 'three';
import type { VisualFootprint } from './visualAdapter';
import { SOIL_LAYERS, tokens } from './visualTokens';

export function paddockOutline({ width, depth }: VisualFootprint): THREE.Vector2[] {
  const x = width / 2, z = depth / 2, facet = 0.22;
  return [
    [-x + facet, -z], [x - facet, -z], [x, -z + facet], [x, z - facet],
    [x - facet, z], [-x + facet, z], [-x, z - facet], [-x, -z + facet],
  ].map(([a, b]) => new THREE.Vector2(a, b));
}

export function createSoilCutaway(footprint: VisualFootprint): THREE.Group {
  const group = new THREE.Group();
  group.name = 'SoilCutaway';
  const outline = paddockOutline(footprint);
  let top = 0;
  for (const layer of SOIL_LAYERS) {
    const material = new THREE.MeshStandardMaterial({ color: layer.color, ...tokens.material, flatShading: true });
    // One uninterrupted opaque prism per layer. Roots never alter this mesh.
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(outline), {
      depth: layer.thickness, bevelEnabled: false, steps: 1, curveSegments: 1,
    });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, top, 0);
    const mesh = new THREE.Mesh(geometry,material); mesh.name=layer.name; mesh.castShadow=true; mesh.receiveShadow=true;
    group.add(mesh);
    top -= layer.thickness;
  }
  return group;
}

export function createPaddockBoundary(footprint: VisualFootprint): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Paddock';
  // The prism's crisp top edge already establishes the paddock perimeter.
  // The former extra LineLoop at y=.008 read as a dry-topsoil seam. Keep this
  // semantic group for callers without adding a duplicate drawn edge.
  void footprint;
  return group;
}
