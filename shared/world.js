import colliders from './worldColliders.json' with { type: 'json' };
import { DECOY_ENTITIES } from './decoys.js';

export const WORLD_COLLIDERS = colliders;
const opaqueTypes = new Set(['trees', 'hiderBoulders', 'rocks', 'deadTrunks', 'building', 'yardprops', 'logs', 'fences']);
export const WORLD_VISION_BLOCKERS = [
  ...colliders.filter((item) => opaqueTypes.has(item.type)).map((item) => ({ ...item, radius: item.radius * (item.type === 'trees' ? 1.45 : 1.2) })),
  ...DECOY_ENTITIES.filter((item) => ['bush', 'stump', 'boulder'].includes(item.type)).map((item) => ({ x: item.x, z: item.z, radius: item.type === 'boulder' ? 0.85 * item.scale : item.type === 'bush' ? 0.7 * item.scale : 0.46 * item.scale, type: `hider-${item.type}` })),
];
