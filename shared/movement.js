import mapDefault from './map.js';
import { LAND_MOVE_SPEED, MAP_PLAYER_EDGE_MARGIN, MOVEMENT_SUBSTEP_DISTANCE, PLAYER_COLLISION_RADIUS, SHARED_MOVE_SUBSTEPS } from './constants.js';
import { wadingSpeedFactor } from './water.js';

export function isPositionClear(x, z, colliders = [], playerRadius = PLAYER_COLLISION_RADIUS, map = mapDefault) {
  if (x < map.bounds.minX + MAP_PLAYER_EDGE_MARGIN || x > map.bounds.maxX - MAP_PLAYER_EDGE_MARGIN || z < map.bounds.minY + MAP_PLAYER_EDGE_MARGIN || z > map.bounds.maxY - MAP_PLAYER_EDGE_MARGIN) return false;
  return !colliders.some((collider) => Math.hypot(x - collider.x, z - collider.z) < playerRadius + collider.radius);
}

export function movePlayer(position, input, deltaSeconds, {
  map = mapDefault,
  colliders = [],
  speed = LAND_MOVE_SPEED,
  speedFactor = 1,
  playerRadius = PLAYER_COLLISION_RADIUS,
} = {}) {
  const dx = Math.max(-1, Math.min(1, Number(input?.x) || 0));
  const dz = Math.max(-1, Math.min(1, Number(input?.z) || 0));
  const length = Math.hypot(dx, dz);
  if (!length || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return { x: position.x, z: position.z, moved: false };
  const dt = Math.min(deltaSeconds, 0.25);
  const factor = speedFactor * wadingSpeedFactor(position.x, position.z, map);
  const travelX = dx / length * speed * factor * dt;
  const travelZ = dz / length * speed * factor * dt;
  const substeps = Math.max(1, Math.ceil(Math.hypot(travelX, travelZ) / MOVEMENT_SUBSTEP_DISTANCE), SHARED_MOVE_SUBSTEPS);
  const stepX = travelX / substeps;
  const stepZ = travelZ / substeps;
  let x = position.x;
  let z = position.z;
  for (let index = 0; index < substeps; index += 1) {
    const nextX = x + stepX;
    if (isPositionClear(nextX, z, colliders, playerRadius, map)) x = nextX;
    const nextZ = z + stepZ;
    if (isPositionClear(x, nextZ, colliders, playerRadius, map)) z = nextZ;
  }
  return { x, z, moved: Math.hypot(x - position.x, z - position.z) > 0.0001 };
}
