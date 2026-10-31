import { writeFile } from 'node:fs/promises';
import map from '../shared/map.js';
import { PROP_TYPES } from '../shared/propTypes.js';
import { PROP_DECOY_EDGE_CLEARANCE, PROP_DECOY_FOOTPRINT_RADIUS, PROP_DECOY_PLACEMENT_ATTEMPTS, PROP_DECOY_SCALE_MIN, PROP_DECOY_SCALE_MAX, PROP_DECOY_SEED, PROP_DECOYS_PER_TYPE } from '../shared/constants.js';
import { WORLD_COLLIDERS } from '../shared/world.js';
import { PlacementValidator } from '../client/src/placementValidator.js';

let state = PROP_DECOY_SEED;
const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
const validator = new PlacementValidator(map);
validator.occupied = WORLD_COLLIDERS.map((item) => ({ x: item.x, z: item.z, footprintRadius: item.radius || 0.5 }));
const result = [];
for (const prop of PROP_TYPES) for (const zone of map.zones) {
  const target = Math.floor(PROP_DECOYS_PER_TYPE / map.zones.length);
  let count = 0;
  for (let attempt = 0; attempt < target * PROP_DECOY_PLACEMENT_ATTEMPTS && count < target; attempt += 1) {
    const spanX = Math.max(0.1, zone.maxX - zone.minX - PROP_DECOY_EDGE_CLEARANCE * 2);
    const spanZ = Math.max(0.1, map.bounds.maxY - map.bounds.minY - PROP_DECOY_EDGE_CLEARANCE * 2);
    const x = zone.minX + PROP_DECOY_EDGE_CLEARANCE + random() * spanX;
    const z = map.bounds.minY + PROP_DECOY_EDGE_CLEARANCE + random() * spanZ;
    const item = { type: prop.id, model: prop.model, zone: zone.id, x, z, rotation: random() * Math.PI * 2, scale: PROP_DECOY_SCALE_MIN + random() * (PROP_DECOY_SCALE_MAX - PROP_DECOY_SCALE_MIN), footprintRadius: PROP_DECOY_FOOTPRINT_RADIUS };
    if (validator.rejectReason(x, z, item.footprintRadius, zone)) continue;
    validator.reserve(item); result.push(item); count += 1;
  }
  if (count < target) throw new Error(`Could only place ${count}/${target} ${prop.id} decoys in zone ${zone.id}`);
}
await writeFile(new URL('../shared/propDecoys.json', import.meta.url), `${JSON.stringify(result)}\n`);
console.info(`Wrote ${result.length} validated prop decoys`, Object.fromEntries(PROP_TYPES.map((prop) => [prop.id, result.filter((item) => item.type === prop.id).length])));
