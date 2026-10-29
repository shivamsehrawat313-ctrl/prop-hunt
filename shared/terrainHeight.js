import forest from './map.js';
import { MAP_SCALE, TERRAIN_CONFIG } from './constants.js';

function hash(ix, iz) {
  let value = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise(x, z) {
  const ix = Math.floor(x); const iz = Math.floor(z); const fx = x - ix; const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx); const sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * sx;
  const b = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * sx;
  return (a + (b - a) * sz) * 2 - 1;
}

function smoothstep(value, low, high) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low || 1)));
  return t * t * (3 - 2 * t);
}

function segmentDistance(x, z, a, b) {
  const dx = b.x - a.x; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

function pathLines(map) {
  const nodes = new Map(map.paths.nodes.map((node) => [node.id, { x: node.x, z: node.y }]));
  return map.paths.edges.map(([from, to]) => {
    const route = map.paths.edgeRoutes?.[`${from}|${to}`] || map.paths.edgeRoutes?.[`${to}|${from}`];
    return route?.length ? route.map(([x, z]) => ({ x, z })) : [nodes.get(from), nodes.get(to)];
  });
}

const flatClearings = [
  { x: 14, z: 20, radius: TERRAIN_CONFIG.campFlatRadius, blend: TERRAIN_CONFIG.campBlendRadius },
  { x: 71, z: 105, radius: TERRAIN_CONFIG.campFlatRadius, blend: TERRAIN_CONFIG.campBlendRadius },
  { x: 15, z: 108, radius: TERRAIN_CONFIG.campFlatRadius, blend: TERRAIN_CONFIG.campBlendRadius },
  { x: 101, z: 103, radius: TERRAIN_CONFIG.campFlatRadius, blend: TERRAIN_CONFIG.campBlendRadius },
  { x: 147, z: 21, radius: TERRAIN_CONFIG.campFlatRadius, blend: TERRAIN_CONFIG.campBlendRadius },
  { x: 224, z: 15, radius: 5.5, blend: 8 },
];

function flattenWeight(x, z, map) {
  let weight = 0;
  for (const line of pathLines(map)) for (let index = 1; index < line.length; index += 1) {
    const distance = segmentDistance(x, z, line[index - 1], line[index]);
    weight = Math.max(weight, 1 - smoothstep(distance, map.paths.width * 0.5 + TERRAIN_CONFIG.pathFlattenStart, map.paths.width * 0.5 + TERRAIN_CONFIG.pathFlattenEnd));
  }
  const river = map.river.centerline.map(([rx, rz]) => ({ x: rx, z: rz }));
  const first = river[0]; const next = river[1]; const last = river.at(-1); const previous = river.at(-2);
  const extend = (a, b) => {
    const length = Math.hypot(a.x - b.x, a.z - b.z) || 1;
    return { x: a.x + (a.x - b.x) / length * TERRAIN_CONFIG.riverExtension * MAP_SCALE, z: a.z + (a.z - b.z) / length * TERRAIN_CONFIG.riverExtension * MAP_SCALE };
  };
  river.unshift(extend(first, next)); river.push(extend(last, previous));
  const riverWidth = Math.max(...map.river.widthKeys.map(([, width]) => width)) * (map.river.bankScale ?? 1.72) * 0.5;
  for (let index = 1; index < river.length; index += 1) {
    const distance = segmentDistance(x, z, river[index - 1], river[index]);
    weight = Math.max(weight, 1 - smoothstep(distance, riverWidth, riverWidth + TERRAIN_CONFIG.riverFlattenEnd));
  }
  for (const clearing of flatClearings) {
    const distance = Math.hypot(x - clearing.x * MAP_SCALE, z - clearing.z * MAP_SCALE);
    weight = Math.max(weight, 1 - smoothstep(distance, clearing.radius, clearing.blend));
  }
  const yardDistance = Math.hypot(x - TERRAIN_CONFIG.yardCenterX * MAP_SCALE, z - (TERRAIN_CONFIG.yardCenterZ * MAP_SCALE + TERRAIN_CONFIG.yardCenterOffsetZ));
  weight = Math.max(weight, 1 - smoothstep(yardDistance, TERRAIN_CONFIG.yardFlatRadius, TERRAIN_CONFIG.yardBlendRadius));
  for (const cx of [96.875, 103.675]) for (const cz of [56, 63.5]) {
    const distance = Math.hypot((x - cx) / TERRAIN_CONFIG.cropFieldRadiusX, (z - cz) / TERRAIN_CONFIG.cropFieldRadiusZ);
    weight = Math.max(weight, 1 - smoothstep(distance, TERRAIN_CONFIG.fieldFlattenStart, TERRAIN_CONFIG.fieldFlattenEnd));
  }
  const marshDistance = Math.hypot((x - TERRAIN_CONFIG.marshFieldCenterX * MAP_SCALE) / TERRAIN_CONFIG.marshFieldRadiusX, (z - TERRAIN_CONFIG.marshFieldCenterZ * MAP_SCALE) / TERRAIN_CONFIG.marshFieldRadiusZ);
  return Math.max(weight, 1 - smoothstep(marshDistance, TERRAIN_CONFIG.fieldFlattenStart, TERRAIN_CONFIG.fieldFlattenEnd));
}

export function terrainHeightAt(x, z, map = forest) {
  const zoneCStart = map.zones[2].minX + TERRAIN_CONFIG.zoneCFlattenStart;
  const zoneCEnd = map.zones[2].minX + TERRAIN_CONFIG.zoneCFlattenEnd;
  const zoneCT = smoothstep(x, zoneCStart, zoneCEnd);
  const broad = valueNoise(x / MAP_SCALE * TERRAIN_CONFIG.broadNoiseFrequency, z / MAP_SCALE * TERRAIN_CONFIG.broadNoiseFrequency) * TERRAIN_CONFIG.broadAmplitude;
  const detail = valueNoise(x / MAP_SCALE * TERRAIN_CONFIG.detailNoiseFrequency + 17, z / MAP_SCALE * TERRAIN_CONFIG.detailNoiseFrequency - 9) * TERRAIN_CONFIG.detailAmplitude;
  const height = (broad + detail) * (1 - zoneCT * TERRAIN_CONFIG.zoneCAmplitudeFactor);
  return height * (1 - flattenWeight(x, z, map));
}
