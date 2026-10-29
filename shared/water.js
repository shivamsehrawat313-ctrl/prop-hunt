import forest from './map.js';
import { DEEP_CHANNEL_THRESHOLD, DEEP_WATER_SPEED_FACTOR, LAND_MOVE_SPEED, SHALLOW_WATER_SPEED_FACTOR } from './constants.js';

export { DEEP_CHANNEL_THRESHOLD, DEEP_WATER_SPEED_FACTOR, LAND_MOVE_SPEED, SHALLOW_WATER_SPEED_FACTOR };

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function widthAt(keys, t) {
  for (let i = 1; i < keys.length; i += 1) {
    if (t <= keys[i][0]) {
      const [t0, w0] = keys[i - 1];
      const [t1, w1] = keys[i];
      return lerp(w0, w1, Math.max(0, Math.min(1, (t - t0) / (t1 - t0))));
    }
  }
  return keys.at(-1)[1];
}

function closestRiverPosition(x, z, map) {
  const points = map.river.centerline;
  let nearestDistance = Infinity;
  let nearestT = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz || 1;
    const segmentT = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq));
    const distance = Math.hypot(x - (ax + dx * segmentT), z - (az + dz * segmentT));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestT = (i + segmentT) / (points.length - 1);
    }
  }
  return { distance: nearestDistance, t: nearestT };
}

export function riverWidthAt(x, z, map = forest) {
  const closest = closestRiverPosition(x, z, map);
  return widthAt(map.river.widthKeys, closest.t);
}

export function riverBankWidthAt(x, z, map = forest) {
  return riverWidthAt(x, z, map) * (map.river.bankScale ?? 1.72);
}

export function distanceToRiverBank(x, z, map = forest) {
  const closest = closestRiverPosition(x, z, map);
  return Math.max(0, closest.distance - riverBankWidthAt(x, z, map) * 0.5);
}

export function waterDepth(x, z, map = forest) {
  const closest = closestRiverPosition(x, z, map);
  const halfWidth = riverWidthAt(x, z, map) * 0.5;
  if (closest.distance >= halfWidth) return 0;
  return Math.max(0, Math.min(1, 1 - closest.distance / halfWidth));
}

export function isInWater(x, z, map = forest) {
  return waterDepth(x, z, map) > 0;
}

export function bridgeAt(x, z, map = forest) {
  const points = map.river.centerline;
  const config = map.river.bridgeConfig;
  for (const crossing of map.river.crossings) {
    let nearestSegment = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, az] = points[i]; const [bx, bz] = points[i + 1];
      const dx = bx - ax; const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((crossing.x - ax) * dx + (crossing.y - az) * dz) / (dx * dx + dz * dz || 1)));
      const distance = Math.hypot(crossing.x - (ax + dx * t), crossing.y - (az + dz * t));
      if (distance < nearestDistance) { nearestDistance = distance; nearestSegment = i; }
    }
    const [ax, az] = points[nearestSegment]; const [bx, bz] = points[nearestSegment + 1];
    const tangentLength = Math.hypot(bx - ax, bz - az) || 1;
    const tx = (bx - ax) / tangentLength; const tz = (bz - az) / tangentLength;
    const nx = -tz; const nz = tx;
    const rx = x - crossing.x; const rz = z - crossing.y;
    const along = Math.abs(rx * nx + rz * nz);
    const across = Math.abs(rx * tx + rz * tz);
    const span = riverWidthAt(crossing.x, crossing.y, map) + config.bankMargin * 2;
    if (along <= span * 0.5 && across <= config.deckWidth * 0.5) return crossing;
  }
  return null;
}

export function wadingSpeedFactor(x, z, map = forest) {
  if (bridgeAt(x, z, map)) return 1;
  const depth = waterDepth(x, z, map);
  if (depth === 0) return 1;
  return depth >= DEEP_CHANNEL_THRESHOLD ? DEEP_WATER_SPEED_FACTOR : SHALLOW_WATER_SPEED_FACTOR;
}
