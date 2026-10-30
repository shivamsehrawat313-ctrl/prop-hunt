import map from './map.js';
import colliders from './worldColliders.json' with { type: 'json' };
import { PLAYER_COLLISION_RADIUS, SPAWN_SEARCH_MAX_RADIUS, SPAWN_SEARCH_STEP } from './constants.js';
import { isInWater } from './water.js';

export const WORLD_COLLIDERS = colliders;

export function isPositionClear(x, z, options = {}) {
  const worldMap = options.map || map;
  const obstacles = options.colliders || WORLD_COLLIDERS;
  const radius = options.playerRadius ?? PLAYER_COLLISION_RADIUS;
  if (x < worldMap.bounds.minX + radius || x > worldMap.bounds.maxX - radius || z < worldMap.bounds.minY + radius || z > worldMap.bounds.maxY - radius) return false;
  return !obstacles.some((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) < radius + obstacle.radius);
}

export function chooseSpawnPoints(count, worldMap = map) {
  const result = [];
  const origin = worldMap.spawn;
  const candidates = [{ x: origin.x, z: origin.y }];
  for (let radius = SPAWN_SEARCH_STEP; radius <= SPAWN_SEARCH_MAX_RADIUS; radius += SPAWN_SEARCH_STEP) {
    const spokes = Math.max(8, Math.ceil(Math.PI * 2 * radius / SPAWN_SEARCH_STEP));
    for (let i = 0; i < spokes; i += 1) {
      const angle = i * Math.PI * 2 / spokes;
      candidates.push({ x: origin.x + Math.cos(angle) * radius, z: origin.y + Math.sin(angle) * radius });
    }
  }
  for (const candidate of candidates) {
    if (isInWater(candidate.x, candidate.z, worldMap) || !isPositionClear(candidate.x, candidate.z, { map: worldMap })) continue;
    if (result.some((point) => Math.hypot(point.x - candidate.x, point.z - candidate.z) < PLAYER_COLLISION_RADIUS * 2 + 0.65)) continue;
    result.push(candidate);
    if (result.length >= count) return result;
  }
  throw new Error(`Only ${result.length}/${count} safe spawn points could be found.`);
}
