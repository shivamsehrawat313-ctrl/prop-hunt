import * as THREE from 'three';
import { palette } from './palette.js';
import { getPathPolylines } from './paths.js';
import {
  GROUND_PATCH_BLEND_WIDTH,
  GROUND_PATCH_COVERAGE,
  GROUND_PATCH_NOISE_LARGE_WEIGHT,
  GROUND_PATCH_NOISE_SCALE_LARGE,
  GROUND_PATCH_NOISE_SCALE_SMALL,
} from '../../shared/constants.js';

function hash(ix, iz) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z) {
  const ix = Math.floor(x); const iz = Math.floor(z);
  const fx = x - ix; const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx); const sz = fz * fz * (3 - 2 * fz);
  const a = THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), sx);
  const b = THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), sx);
  return THREE.MathUtils.lerp(a, b, sz) * 2 - 1;
}

function segmentDistance(x, z, a, b) {
  const dx = b.x - a.x; const dz = b.y - a.y;
  const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - a.x - dx * t, z - a.y - dz * t);
}

function flattenWeight(x, z, map, pathLines) {
  let weight = 0;
  for (const line of pathLines) for (let i = 1; i < line.length; i += 1) {
    const distance = segmentDistance(x, z, line[i - 1], line[i]);
    weight = Math.max(weight, 1 - THREE.MathUtils.smoothstep(distance, map.paths.width * 0.5 + 0.25, map.paths.width * 0.5 + 2.0));
  }
  // Preserve the river elevation and its visual continuation into boundary fog.
  const riverLine = map.river.centerline.map(([rx, rz]) => ({ x: rx, y: rz }));
  const first = riverLine[0]; const firstNext = riverLine[1];
  const last = riverLine.at(-1); const lastPrevious = riverLine.at(-2);
  const head = { x: first.x + (first.x - firstNext.x) / Math.hypot(first.x - firstNext.x, first.y - firstNext.y) * 42, y: first.y + (first.y - firstNext.y) / Math.hypot(first.x - firstNext.x, first.y - firstNext.y) * 42 };
  const tail = { x: last.x + (last.x - lastPrevious.x) / Math.hypot(last.x - lastPrevious.x, last.y - lastPrevious.y) * 42, y: last.y + (last.y - lastPrevious.y) / Math.hypot(last.x - lastPrevious.x, last.y - lastPrevious.y) * 42 };
  riverLine.unshift(head); riverLine.push(tail);
  for (let i = 1; i < riverLine.length; i += 1) {
    const a = riverLine[i - 1];
    const b = riverLine[i];
    const riverWidth = Math.max(...map.river.widthKeys.map((entry) => entry[1])) * (map.river.bankScale ?? 1.72) * 0.5;
    const distance = segmentDistance(x, z, a, b);
    weight = Math.max(weight, 1 - THREE.MathUtils.smoothstep(distance, riverWidth, riverWidth + 3));
  }
  // Keep the three-building village yard and the small tent/camp clearings level for Milestone 1C.
  for (const [cx, cz, radius, blend] of [
    [207, 92, 14, 18], [14, 20, 4.5, 8], [71, 105, 4.5, 8], [15, 108, 4.5, 8],
    [101, 103, 4.5, 8], [147, 21, 4.5, 8], [224, 15, 5.5, 9],
  ]) {
    const d = Math.hypot(x - cx, z - cz);
    weight = Math.max(weight, 1 - THREE.MathUtils.smoothstep(d, radius, blend));
  }
  for (const cx of [170, 184]) for (const cz of [96, 108]) {
    const fieldDistance = Math.hypot((x - cx) / 7.5, (z - cz) / 6.0);
    weight = Math.max(weight, 1 - THREE.MathUtils.smoothstep(fieldDistance, 0.82, 1.25));
  }
  const marshFieldDistance = Math.hypot((x - 144.25) / 4.8, (z - 98) / 4.0);
  weight = Math.max(weight, 1 - THREE.MathUtils.smoothstep(marshFieldDistance, 0.82, 1.25));
  return weight;
}

const pathCache = new WeakMap();
const groundPatchCache = new WeakMap();

function zoneForX(x, map) {
  return map.zones.find((zone) => x >= zone.minX && x <= zone.maxX) || map.zones[0];
}

function patchNoise(x, z) {
  const large = valueNoise(x * GROUND_PATCH_NOISE_SCALE_LARGE + 93, z * GROUND_PATCH_NOISE_SCALE_LARGE - 27);
  const small = valueNoise(x * GROUND_PATCH_NOISE_SCALE_SMALL - 44, z * GROUND_PATCH_NOISE_SCALE_SMALL + 81);
  return large * GROUND_PATCH_NOISE_LARGE_WEIGHT + small * (1 - GROUND_PATCH_NOISE_LARGE_WEIGHT);
}

function getPatchDistribution(zone, map) {
  let zoneCache = groundPatchCache.get(map);
  if (!zoneCache) { zoneCache = new Map(); groundPatchCache.set(map, zoneCache); }
  if (zoneCache.has(zone.id)) return zoneCache.get(zone.id);
  const samples = [];
  const step = 0.9;
  for (let z = map.bounds.minY; z <= map.bounds.maxY; z += step) {
    for (let x = zone.minX; x <= zone.maxX; x += step) samples.push(patchNoise(x, z));
  }
  samples.sort((a, b) => a - b);
  const target = GROUND_PATCH_COVERAGE[zone.id];
  const greenEdge = target.green;
  const oliveEdge = greenEdge + target.olive;
  const freshEdge = oliveEdge + target.freshGreen;
  const quantile = (fraction) => samples[Math.max(0, Math.min(samples.length - 1, Math.floor(fraction * (samples.length - 1))))];
  const distribution = { samples, greenEdge, oliveEdge, freshEdge, greenThreshold: quantile(greenEdge), oliveThreshold: quantile(oliveEdge), freshThreshold: quantile(freshEdge) };
  zoneCache.set(zone.id, distribution);
  return distribution;
}

function patchColors() {
  return {
    green: new THREE.Color('#315e43'),
    olive: new THREE.Color('#66643b'),
    fresh: new THREE.Color('#4b7650'),
    ochre: new THREE.Color('#78613b'),
    dark: new THREE.Color('#193d35'),
  };
}

function groundColorAt(x, z, map) {
  const zone = zoneForX(x, map);
  const distribution = getPatchDistribution(zone, map);
  const colors = patchColors();
  const noise = patchNoise(x, z);
  let color;
  if (noise < distribution.greenThreshold - GROUND_PATCH_BLEND_WIDTH) color = colors.green.clone();
  else if (noise < distribution.greenThreshold + GROUND_PATCH_BLEND_WIDTH) {
    const t = THREE.MathUtils.smoothstep(noise, distribution.greenThreshold - GROUND_PATCH_BLEND_WIDTH, distribution.greenThreshold + GROUND_PATCH_BLEND_WIDTH);
    color = colors.green.clone().lerp(colors.olive, t);
  } else if (noise < distribution.oliveThreshold - GROUND_PATCH_BLEND_WIDTH) color = colors.olive.clone();
  else if (noise < distribution.oliveThreshold + GROUND_PATCH_BLEND_WIDTH) {
    const t = THREE.MathUtils.smoothstep(noise, distribution.oliveThreshold - GROUND_PATCH_BLEND_WIDTH, distribution.oliveThreshold + GROUND_PATCH_BLEND_WIDTH);
    color = colors.olive.clone().lerp(colors.fresh, t);
  } else if (noise < distribution.freshThreshold - GROUND_PATCH_BLEND_WIDTH) color = colors.fresh.clone();
  else if (noise < distribution.freshThreshold + GROUND_PATCH_BLEND_WIDTH) {
    const t = THREE.MathUtils.smoothstep(noise, distribution.freshThreshold - GROUND_PATCH_BLEND_WIDTH, distribution.freshThreshold + GROUND_PATCH_BLEND_WIDTH);
    color = colors.fresh.clone().lerp(colors.ochre, t);
  } else color = colors.ochre.clone();
  const detail = valueNoise(x * GROUND_PATCH_NOISE_SCALE_SMALL + 13, z * GROUND_PATCH_NOISE_SCALE_SMALL - 51);
  if (noise < distribution.greenThreshold) color.lerp(colors.dark, THREE.MathUtils.smoothstep(-detail, 0.52, 0.92) * 0.22);
  return color;
}

export function measureGroundPatchCoverage(map, step = 0.45) {
  const counts = Object.fromEntries(map.zones.map((zone) => [zone.id, { green: 0, olive: 0, freshGreen: 0, ochre: 0, total: 0 }]));
  for (let z = map.bounds.minY + step * 0.5; z < map.bounds.maxY; z += step) {
    for (let x = map.bounds.minX + step * 0.5; x < map.bounds.maxX; x += step) {
      const zone = zoneForX(x, map); const d = getPatchDistribution(zone, map); const value = patchNoise(x, z);
      const bucket = value < d.greenThreshold ? 'green' : value < d.oliveThreshold ? 'olive' : value < d.freshThreshold ? 'freshGreen' : 'ochre';
      counts[zone.id][bucket] += 1; counts[zone.id].total += 1;
    }
  }
  const format = (row) => Object.fromEntries(['green', 'olive', 'freshGreen', 'ochre'].map((key) => [key, Number((row[key] * 100 / row.total).toFixed(1))]));
  const total = Object.values(counts).reduce((sum, row) => sum + row.total, 0);
  const aggregate = Object.fromEntries(['green', 'olive', 'freshGreen', 'ochre'].map((key) => [key, Number((Object.values(counts).reduce((sum, row) => sum + row[key], 0) * 100 / total).toFixed(1))]));
  return { overall: aggregate, byZone: Object.fromEntries(Object.entries(counts).map(([id, row]) => [id, format(row)])), sampleStep: step };
}
export function terrainHeightAt(x, z, map, pathLines = null) {
  pathLines ||= pathCache.get(map) || getPathPolylines(map);
  if (!pathCache.has(map)) pathCache.set(map, pathLines);
  const zoneC = THREE.MathUtils.smoothstep(x, map.zones[2].minX + 4, map.zones[2].minX + 35);
  const broad = valueNoise(x * 0.022, z * 0.022) * 0.30;
  const detail = valueNoise(x * 0.065 + 17, z * 0.065 - 9) * 0.20;
  const undulation = (broad + detail) * (1 - zoneC * 0.82);
  return undulation * (1 - flattenWeight(x, z, map, pathLines));
}

export function createTerrain(map) {
  const { minX, minY, maxX, maxY } = map.bounds;
  const visualPadding = 64;
  const visualMinX = minX - visualPadding; const visualMinZ = minY - visualPadding;
  const visualMaxX = maxX + visualPadding; const visualMaxZ = maxY + visualPadding;
  const divisionsX = Math.ceil((visualMaxX - visualMinX) / 1.4);
  const divisionsZ = Math.ceil((visualMaxZ - visualMinZ) / 1.4);
  const pathLines = getPathPolylines(map);
  const patchCoverage = measureGroundPatchCoverage(map);
  if (import.meta.env.DEV) console.info('[terrain-report] top-down ground coverage (%)', patchCoverage);
  const positions = []; const colors = []; const indices = [];
  const edgeColor = new THREE.Color(palette.tealDeep);
  for (let iz = 0; iz <= divisionsZ; iz += 1) {
    const z = visualMinZ + ((visualMaxZ - visualMinZ) * iz) / divisionsZ;
    for (let ix = 0; ix <= divisionsX; ix += 1) {
      const x = visualMinX + ((visualMaxX - visualMinX) * ix) / divisionsX;
      const height = terrainHeightAt(x, z, map, pathLines);
      positions.push(x, height, z);
      const color = groundColorAt(x, z, map);
      const edgeDistance = Math.min(x - visualMinX, visualMaxX - x, z - visualMinZ, visualMaxZ - z);
      const edgeFade = 1 - THREE.MathUtils.smoothstep(edgeDistance, 0, 28);
      color.lerp(edgeColor, edgeFade);
      colors.push(color.r, color.g, color.b);
      if (ix < divisionsX && iz < divisionsZ) {
        const a = iz * (divisionsX + 1) + ix; const b = a + 1; const c = a + divisionsX + 1; const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, depthTest: true, depthWrite: true }));
  ground.receiveShadow = true; ground.name = 'rolling-noise-terrain';
  ground.userData.terrainHeightAt = (x, z) => terrainHeightAt(x, z, map, pathLines);
  return ground;
}
