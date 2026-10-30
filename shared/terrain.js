import { MAP_SCALE } from './constants.js';
import { getSharedPathLines } from './pathLines.js';
const pathLinesByMap = new WeakMap();

function hash(ix, iz) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z) {
  const ix = Math.floor(x); const iz = Math.floor(z);
  const fx = x - ix; const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx); const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * sx;
  const b = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * sx;
  return (a + (b - a) * sz) * 2 - 1;
}

function smoothstep(edge0, edge1, value) {
  const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0 || 1)));
  return x * x * (3 - 2 * x);
}

function segmentDistance(x, z, a, b) {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

function flattenWeight(x, z, map, pathLines) {
  let weight = 0;
  for (const line of pathLines) for (let i = 1; i < line.length; i += 1) {
    const distance = segmentDistance(x, z, line[i - 1], line[i]);
    weight = Math.max(weight, 1 - smoothstep(map.paths.width * 0.5 + 0.25, map.paths.width * 0.5 + 5.0, distance));
  }
  const riverLine = map.river.centerline.map(([rx, rz]) => ({ x: rx, z: rz }));
  const first = riverLine[0]; const firstNext = riverLine[1];
  const last = riverLine.at(-1); const lastPrevious = riverLine.at(-2);
  const riverExtension = 42 * MAP_SCALE;
  const extend = (a, b) => {
    const length = Math.hypot(a.x - b.x, a.z - b.z) || 1;
    return { x: a.x + (a.x - b.x) / length * riverExtension, z: a.z + (a.z - b.z) / length * riverExtension };
  };
  riverLine.unshift(extend(first, firstNext)); riverLine.push(extend(last, lastPrevious));
  const riverWidth = Math.max(...map.river.widthKeys.map((entry) => entry[1])) * (map.river.bankScale ?? 1.72) * 0.5;
  for (let i = 1; i < riverLine.length; i += 1) {
    const distance = segmentDistance(x, z, riverLine[i - 1], riverLine[i]);
    weight = Math.max(weight, 1 - smoothstep(riverWidth, riverWidth + 5, distance));
  }
  for (const [cx, cz, radius, blend] of [
    [207 * MAP_SCALE, 92 * MAP_SCALE + 4, 13, 16], [14 * MAP_SCALE, 20 * MAP_SCALE, 4.5, 7], [71 * MAP_SCALE, 105 * MAP_SCALE, 4.5, 7], [15 * MAP_SCALE, 108 * MAP_SCALE, 4.5, 7],
    [101 * MAP_SCALE, 103 * MAP_SCALE, 4.5, 7], [147 * MAP_SCALE, 21 * MAP_SCALE, 4.5, 7], [224 * MAP_SCALE, 15 * MAP_SCALE, 5.5, 8],
  ]) weight = Math.max(weight, 1 - smoothstep(radius, blend, Math.hypot(x - cx, z - cz)));
  for (const cx of [96.875, 103.675]) for (const cz of [56, 63.5]) {
    const d = Math.hypot((x - cx) / 3.9, (z - cz) / 2.9);
    weight = Math.max(weight, 1 - smoothstep(0.82, 1.25, d));
  }
  const marsh = Math.hypot((x - 144.25 * MAP_SCALE) / 3.4, (z - 98 * MAP_SCALE) / 2.6);
  return Math.max(weight, 1 - smoothstep(0.82, 1.25, marsh));
}

export function terrainHeightAt(x, z, map) {
  const zoneC = smoothstep(map.zones[2].minX + 4, map.zones[2].minX + 35, x);
  const broad = valueNoise(x / MAP_SCALE * 0.022, z / MAP_SCALE * 0.022) * 0.30;
  const detail = valueNoise(x / MAP_SCALE * 0.065 + 17, z / MAP_SCALE * 0.065 - 9) * 0.20;
  let pathLines = pathLinesByMap.get(map);
  if (!pathLines) { pathLines = getSharedPathLines(map); pathLinesByMap.set(map, pathLines); }
  return (broad + detail) * (1 - zoneC * 0.82) * (1 - flattenWeight(x, z, map, pathLines));
}
