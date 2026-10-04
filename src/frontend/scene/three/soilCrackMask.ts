import * as THREE from 'three';
import type { VisualFootprint } from './visualAdapter';
import { SOIL_CRACK_DISPLAY } from './soilVisualPresets';

type Point = [number, number];
type Triangle = { ids: [number, number, number]; x: number; z: number; radius2: number };
type Fracture = { points: Point[]; order: number; onset: number; travel: number; origin: number; width: number };
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mix = (a: Point, b: Point, t: number): Point => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
const area = (p: Point[]) => Math.abs(p.reduce((s, a, i) => {
  const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1];
}, 0)) / 2;
const contains = (polygon: Point[], p: Point) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};

/** One cached local plate graph. NOT an equal-distance Voronoi diagram:
 * triangle junctions sit at unequal barycentric positions, and boundaries
 * bend through shared edge anchors. Local secondary/fine branches subdivide
 * every region. R=distance support, G=local growth rank, B=relief hierarchy.
 * No severity-time topology changes, crack meshes or fracture physics. */
export function createSoilCrackMask(footprint: VisualFootprint): THREE.DataTexture {
  const size = SOIL_CRACK_DISPLAY.resolution, data = new Uint8Array(size * size * 4);
  const halfX = footprint.width / 2 - .08, halfZ = footprint.depth / 2 - .08;
  let seed = SOIL_CRACK_DISPLAY.seed as number;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const hash = (x: number, z: number) => {
    let v = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ SOIL_CRACK_DISPLAY.seed;
    v = Math.imul(v ^ v >>> 13, 1274126177); return ((v ^ v >>> 16) >>> 0) / 4294967296;
  };
  const noise = (x: number, z: number) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    return (hash(ix, iz) * (1 - fx) + hash(ix + 1, iz) * fx) * (1 - fz)
      + (hash(ix, iz + 1) * (1 - fx) + hash(ix + 1, iz + 1) * fx) * fz;
  };
  const warp = ([x, z]: Point): Point => [
    x + .24 * (noise(x * 1.1, z * 1.1) - .5),
    z + .24 * (noise(x * 1.1 + 13, z * 1.1 + 7) - .5),
  ];
  const fractures: Fracture[] = [];
  const add = (points: Point[], order: number) => fractures.push({ points, order,
    onset: [.10, .25, .57][order] + random() * [.16, .18, .15][order],
    travel: [.30, .31, .18][order], origin: .25 + random() * .50,
    width: [.052, .030, .015][order] * (.82 + random() * .34) });

  // Stratification prevents bald centre/edge/corner regions. Unequal jitter,
  // point spacing and triangle connectivity remove a visible row/tile pattern.
  const countX = Math.max(2, Math.round(halfX * 2 / Math.sqrt(SOIL_CRACK_DISPLAY.primaryCellArea)));
  const countZ = Math.max(2, Math.round(halfZ * 2 / Math.sqrt(SOIL_CRACK_DISPLAY.primaryCellArea)));
  const stepX = halfX * 2 / countX, stepZ = halfZ * 2 / countZ, points: Point[] = [];
  for (let z = 0; z < countZ; z++) for (let x = 0; x < countX; x++)
    points.push([-halfX + (x + .5 + (random() - .5) * .70) * stepX,
      -halfZ + (z + .5 + (random() - .5) * .70) * stepZ]);
  // Outside guard sites let the same local network reach the displayed edges.
  // They are construction points, never visual objects or a perimeter outline.
  for (let x = 0; x <= countX; x++) for (const sign of [-1, 1])
    points.push([-halfX + (x + (random() - .5) * .6) * stepX, sign * (halfZ + stepZ * .75)]);
  for (let z = 0; z <= countZ; z++) for (const sign of [-1, 1])
    points.push([sign * (halfX + stepX * .75), -halfZ + (z + (random() - .5) * .6) * stepZ]);
  const siteCount = points.length, span = Math.max(footprint.width, footprint.depth) * 8;
  points.push([-span, -span], [span, -span], [0, span]);
  const triangle = (a: number, b: number, c: number): Triangle | null => {
    const [ax, az] = points[a], [bx, bz] = points[b], [cx, cz] = points[c];
    const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
    if (Math.abs(d) < 1e-10) return null;
    const aa = ax * ax + az * az, bb = bx * bx + bz * bz, cc = cx * cx + cz * cz;
    const x = (aa * (bz - cz) + bb * (cz - az) + cc * (az - bz)) / d;
    const z = (aa * (cx - bx) + bb * (ax - cx) + cc * (bx - ax)) / d;
    return { ids: [a, b, c], x, z, radius2: (x - ax) ** 2 + (z - az) ** 2 };
  };
  let triangles = [triangle(siteCount, siteCount + 1, siteCount + 2)!];
  const edgeKey = (a: number, b: number) => a < b ? a + ':' + b : b + ':' + a;
  for (let i = 0; i < siteCount; i++) {
    const p = points[i], bad = triangles.filter(t => (p[0] - t.x) ** 2 + (p[1] - t.z) ** 2 <= t.radius2 + 1e-8);
    const perimeter = new Map<string, { a: number; b: number; count: number }>();
    for (const t of bad) for (let e = 0; e < 3; e++) {
      const a = t.ids[e], b = t.ids[(e + 1) % 3], key = edgeKey(a, b), previous = perimeter.get(key);
      if (previous) previous.count++; else perimeter.set(key, { a, b, count: 1 });
    }
    const removed = new Set(bad); triangles = triangles.filter(t => !removed.has(t));
    for (const edge of perimeter.values()) if (edge.count === 1) {
      const next = triangle(edge.a, edge.b, i); if (next) triangles.push(next);
    }
  }
  // Keep exterior construction triangles while closing guard-site cells.
  // Discarding them left open corner sectors; their geometry lies outside the
  // guard-site hull and never becomes a cross-paddock surface boundary.
  const junctions: Point[] = triangles.map(t => {
    const weights = t.ids.map(() => .25 + random() * .50), sum = weights.reduce((a, b) => a + b, 0);
    return t.ids.reduce<Point>((p, id, i) => [p[0] + points[id][0] * weights[i] / sum, p[1] + points[id][1] * weights[i] / sum], [0, 0]);
  });
  const edges = new Map<string, { a: number; b: number; anchor: Point; triangles: number[] }>();
  triangles.forEach((t, i) => {
    for (let e = 0; e < 3; e++) {
      const a = t.ids[e], b = t.ids[(e + 1) % 3], key = edgeKey(a, b);
      const previous = edges.get(key);
      if (previous) previous.triangles.push(i);
      else edges.set(key, { a, b, anchor: mix(points[a], points[b], .35 + random() * .30), triangles: [i] });
    }
  });
  for (const edge of edges.values()) if (edge.triangles.length === 2)
    add([junctions[edge.triangles[0]], edge.anchor, junctions[edge.triangles[1]]], random() < .38 ? 0 : 1);

  const clip = (polygon: Point[]) => {
    let clipped = polygon;
    for (const [axis, sign, limit] of [[0, 1, halfX], [0, -1, halfX], [1, 1, halfZ], [1, -1, halfZ]]) {
      const next: Point[] = [];
      for (let i = 0; i < clipped.length; i++) {
        const a = clipped[i], b = clipped[(i + 1) % clipped.length];
        const da = limit - a[axis] * sign, db = limit - b[axis] * sign;
        if (da >= 0) next.push(a);
        if ((da >= 0) !== (db >= 0)) next.push(mix(a, b, da / (da - db)));
      }
      clipped = next;
    }
    return clipped;
  };
  const coarse: { polygon: Point[]; site: Point }[] = [];
  for (let id = 0; id < siteCount; id++) {
    const vertices: Point[] = [];
    triangles.forEach((t, i) => { if (t.ids.includes(id)) vertices.push(junctions[i]); });
    for (const edge of edges.values()) if (edge.a === id || edge.b === id) vertices.push(edge.anchor);
    vertices.sort((a, b) => Math.atan2(a[1] - points[id][1], a[0] - points[id][0]) - Math.atan2(b[1] - points[id][1], b[0] - points[id][0]));
    const polygon = clip(vertices);
    if (polygon.length >= 3 && area(polygon) > .06) coarse.push({ polygon, site: points[id] });
  }
  const starCentre = (polygon: Point[], preferred?: Point): Point | null => {
    const average = polygon.reduce<Point>((p, q) => [p[0] + q[0] / polygon.length, p[1] + q[1] / polygon.length], [0, 0]);
    const signedArea = polygon.reduce((s, a, i) => { const b = polygon[(i + 1) % polygon.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0);
    const orientation = Math.sign(signedArea), xs = polygon.map(p => p[0]), zs = polygon.map(p => p[1]);
    let kernel: Point[] = [[Math.min(...xs), Math.min(...zs)], [Math.max(...xs), Math.min(...zs)],
      [Math.max(...xs), Math.max(...zs)], [Math.min(...xs), Math.max(...zs)]];
    // The visibility kernel supplies an interior branching point even for
    // narrow clipped boundary cells where a vertex-average falls outside.
    polygon.forEach((a, edge) => {
      const b = polygon[(edge + 1) % polygon.length], next: Point[] = [];
      const side = (p: Point) => orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
      kernel.forEach((p, i) => {
        const q = kernel[(i + 1) % kernel.length], dp = side(p), dq = side(q);
        if (dp >= 0) next.push(p);
        if ((dp >= 0) !== (dq >= 0)) next.push(mix(p, q, dp / (dp - dq)));
      }); kernel = next;
    });
    const kernelCentre = kernel.length ? kernel.reduce<Point>((p, q) => [p[0] + q[0] / kernel.length, p[1] + q[1] / kernel.length], [0, 0]) : null;
    const candidates = [...(preferred ? [preferred] : []), average,
      ...(kernelCentre ? [kernelCentre] : []),
      ...polygon.map(p => mix(p, average, .6)), ...polygon.map(p => mix(p, average, .85))];
    return candidates.find(p => contains(polygon, p) && polygon.every(v =>
      [.15, .35, .55, .75, .95].every(t => contains(polygon, mix(p, v, t))))) ?? null;
  };
  const subdivide = (polygon: Point[], order: number, preferred?: Point): Point[][] => {
    const centre = starCentre(polygon, preferred);
    if (!centre) return [polygon];
    const cumulative = [0];
    polygon.forEach((p, i) => cumulative.push(cumulative[i] + distance(p, polygon[(i + 1) % polygon.length])));
    const length = cumulative[cumulative.length - 1], arms = order === 1 ? 3 : 2;
    const start = random(), anchors = Array.from({ length: arms }, (_, i) => ((start + (i + (random() - .5) * .28) / arms) % 1 + 1) % 1).sort((a, b) => a - b);
    const paths = anchors.map(fraction => {
      const s = fraction * length, edge = cumulative.findIndex((n, i) => i < polygon.length && cumulative[i + 1] >= s);
      const anchor = mix(polygon[edge], polygon[(edge + 1) % polygon.length], (s - cumulative[edge]) / (cumulative[edge + 1] - cumulative[edge]));
      const mid = mix(centre, anchor, .45 + random() * .15), dx = anchor[0] - centre[0], dz = anchor[1] - centre[1];
      const kink = (random() - .5) * .18, bent: Point = [mid[0] - dz * kink, mid[1] + dx * kink];
      const middle = contains(polygon, bent) ? bent : mid;
      const path = [centre, middle, anchor]; add(path, order);
      return { s, edge, path };
    });
    return paths.map((a, i) => {
      const b = paths[(i + 1) % paths.length], vertices: Point[] = [...a.path];
      const end = b.s > a.s ? b.s : b.s + length;
      const between = polygon.map((p, index) => ({ p, s: cumulative[index] > a.s ? cumulative[index] : cumulative[index] + length }))
        .filter(v => v.s < end).sort((a, b) => a.s - b.s);
      vertices.push(...between.map(v => v.p));
      vertices.push(b.path[2], b.path[1]);
      return vertices;
    });
  };
  // Every substantial plate receives secondary connections. Fine branches are
  // mandatory in the remaining largest cells, probabilistic only in small ones.
  const secondary = coarse.flatMap(c => area(c.polygon) > SOIL_CRACK_DISPLAY.secondaryCellArea
    ? subdivide(c.polygon, 1, c.site) : [c.polygon]);
  const plates = secondary.flatMap(p => {
    const corner = p.some(q => Math.abs(Math.abs(q[0]) - halfX) < .10 && Math.abs(Math.abs(q[1]) - halfZ) < .10);
    return area(p) > 4.8 || (corner && area(p) > 1.2) || (area(p) > 2.0 && random() < .34) ? subdivide(p, 2) : [p];
  });

  const minX = Math.ceil((.5 - halfX / footprint.width) * size), maxX = size - 1 - minX;
  const minZ = Math.ceil((.5 - halfZ / footprint.depth) * size), maxZ = size - 1 - minZ;
  const raster = (a: Point, b: Point, width: number, rankA: number, rankB: number, hierarchy: number) => {
    const ax = (a[0] / footprint.width + .5) * size, az = (a[1] / footprint.depth + .5) * size;
    const bx = (b[0] / footprint.width + .5) * size, bz = (b[1] / footprint.depth + .5) * size;
    const dx = bx - ax, dz = bz - az, length2 = dx * dx + dz * dz;
    if (length2 < 1e-10) return;
    const rx = width * size / footprint.width, rz = width * size / footprint.depth;
    for (let y = Math.max(minZ, Math.floor(Math.min(az, bz) - rz)); y <= Math.min(maxZ, Math.ceil(Math.max(az, bz) + rz)); y++)
      for (let x = Math.max(minX, Math.floor(Math.min(ax, bx) - rx)); x <= Math.min(maxX, Math.ceil(Math.max(ax, bx) + rx)); x++) {
        const t = Math.max(0, Math.min(1, ((x + .5 - ax) * dx + (y + .5 - az) * dz) / length2));
        const d = Math.hypot((x + .5 - ax - t * dx) / rx, (y + .5 - az - t * dz) / rz);
        const value = Math.round(255 * Math.max(0, 1 - d)), i = (y * size + x) * 4;
        if (value > data[i]) {
          data[i] = value; data[i + 1] = Math.round(255 * (rankA + t * (rankB - rankA)));
          data[i + 2] = Math.round(255 * hierarchy); data[i + 3] = 255;
        }
      }
  };
  const allNodes = fractures.flatMap(f => f.points);
  for (const f of fractures) {
    const lengths = [0]; for (let i = 1; i < f.points.length; i++) lengths.push(lengths[i - 1] + distance(f.points[i - 1], f.points[i]));
    const total = lengths[lengths.length - 1];
    for (let edge = 1; edge < f.points.length; edge++) {
      const a = f.points[edge - 1], b = f.points[edge], dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
      if (length2 < 1e-10) continue;
      const steps = Math.ceil(Math.sqrt(length2) / .17), breaks = Array.from({ length: steps + 1 }, (_, i) => i / steps);
      for (const p of allNodes) {
        const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length2;
        if (t > 0 && t < 1 && Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) < 1e-7) breaks.push(t);
      }
      breaks.sort((a, b) => a - b);
      const rank = (t: number) => {
        const along = (lengths[edge - 1] + t * Math.sqrt(length2)) / total, p = mix(a, b, t);
        return Math.min(.91, f.onset + f.travel * Math.abs(along - f.origin) / Math.max(f.origin, 1 - f.origin) + .025 * noise(p[0], p[1]));
      };
      for (let i = 1; i < breaks.length; i++) {
        const p = mix(a, b, (breaks[i - 1] + breaks[i]) / 2), wa = warp(mix(a, b, breaks[i - 1])), wb = warp(mix(a, b, breaks[i]));
        const width = f.width * (.68 + .32 * noise(p[0] * 1.6 + 5, p[1] * 1.6 + 11));
        raster(wa, wb, width, rank(breaks[i - 1]), rank(breaks[i]), [1, .63, .32][f.order]);
      }
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'ClayLocalPlateDistanceGrowthRelief';
  texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.userData = { primaryBoundaries: fractures.filter(f => f.order === 0).length, secondaryBoundaries: fractures.filter(f => f.order === 1).length,
    fineBoundaries: fractures.filter(f => f.order === 2).length, coarsePlates: coarse.length, plateCount: plates.length,
    partitionArea: coarse.reduce((sum, c) => sum + area(c.polygon), 0), surfaceArea: halfX * halfZ * 4,
    plateAreaRange: [Math.min(...plates.map(area)), Math.max(...plates.map(area))] };
  texture.needsUpdate = true;
  return texture;
}
