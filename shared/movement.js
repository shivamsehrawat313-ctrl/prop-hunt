import mapDefault from './map.js';
import { GAME_MAX_DELTA_SECONDS, PLAYER_COLLISION_RADIUS, PLAYER_MAX_SPEED } from './constants.js';
import { wadingSpeedFactor } from './water.js';
import { isPositionClear } from './world.js';
import { terrainHeightAt } from './terrain.js';

export function movePlayer(position, input, deltaSeconds, { map = mapDefault, colliders, speed = PLAYER_MAX_SPEED, speedFactor = 1, playerRadius = PLAYER_COLLISION_RADIUS } = {}) {
  const dx = Math.max(-1, Math.min(1, Number(input?.x) || 0));
  const dz = Math.max(-1, Math.min(1, Number(input?.z) || 0));
  const length = Math.hypot(dx, dz);
  if (!length || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return { x: position.x, z: position.z, moved: false };
  const dt = Math.min(deltaSeconds, GAME_MAX_DELTA_SECONDS);
  const factor = speedFactor * wadingSpeedFactor(position.x, position.z, map);
  const distance = speed * factor * dt;
  const travelX = dx / length * distance; const travelZ = dz / length * distance;
  const steps = Math.max(1, Math.ceil(Math.hypot(travelX, travelZ) / 0.12));
  const stepX = travelX / steps; const stepZ = travelZ / steps;
  let x = position.x; let z = position.z;
  for (let i = 0; i < steps; i += 1) {
    if (isPositionClear(x + stepX, z, { map, colliders, playerRadius })) x += stepX;
    if (isPositionClear(x, z + stepZ, { map, colliders, playerRadius })) z += stepZ;
  }
  return { x, z, y: terrainHeightAt(x, z, map), moved: Math.hypot(x - position.x, z - position.z) > 1e-4 };
}
