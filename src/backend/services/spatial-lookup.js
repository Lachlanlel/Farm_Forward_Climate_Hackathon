function decodeRing(encoded) {
  let offset = 0, x = 0, y = 0;
  const points = [];
  function next() {
    let value = 0, shift = 0, byte;
    do { byte = encoded.charCodeAt(offset++) - 63; value += (byte & 31) * 2 ** shift; shift += 5; } while (byte >= 32);
    return value % 2 ? -(value + 1) / 2 : value / 2;
  }
  while (offset < encoded.length) { x += next(); y += next(); points.push([x / 1e7, y / 1e7]); }
  return points;
}
function segmentDistanceSquared(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
  return (point[0] - a[0] - t * dx) ** 2 + (point[1] - a[1] - t * dy) ** 2;
}
export function findContainingArea(areas, longitude, latitude, tolerance = .0002) {
  const matches = [];
  for (const area of areas) {
    const [west, south, east, north] = area.bbox;
    if (longitude < west - tolerance || longitude > east + tolerance || latitude < south - tolerance || latitude > north + tolerance) continue;
    let inside = false;
    for (const encoded of area.rings) {
      const ring = decodeRing(encoded);
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        // The conservative guard prevents a generalised boundary picking the wrong parish.
        if (segmentDistanceSquared([longitude, latitude], a, b) <= tolerance ** 2) return { area: null, reason: 'location-near-parish-boundary' };
        if ((a[1] > latitude) !== (b[1] > latitude) && longitude < (b[0] - a[0]) * (latitude - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
    }
    if (inside) matches.push(area);
  }
  return matches.length === 1 ? { area: matches[0] } : { area: null, reason: matches.length ? 'ambiguous-spatial-area' : 'no-containing-parish' };
}
