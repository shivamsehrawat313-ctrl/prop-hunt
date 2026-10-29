import forestSource from '../maps/forest.json' with { type: 'json' };
import { MAP_SCALE } from './constants.js';

const pointPair = ([x, z]) => [x * MAP_SCALE, z * MAP_SCALE];
const point = ({ x, y, ...rest }) => ({ ...rest, x: x * MAP_SCALE, y: y * MAP_SCALE });

// Map layout coordinates are transformed once here. Widths, gameplay clearances,
// model sizes, heights, and visual materials deliberately remain unchanged.
export function scaleForestMap(source) {
  return {
    ...source,
    bounds: Object.fromEntries(Object.entries(source.bounds).map(([key, value]) => [key, value * MAP_SCALE])),
    zones: source.zones.map((zone) => ({
      ...zone, minX: zone.minX * MAP_SCALE, maxX: zone.maxX * MAP_SCALE,
      minY: zone.minY * MAP_SCALE, maxY: zone.maxY * MAP_SCALE,
    })),
    river: {
      ...source.river,
      centerline: source.river.centerline.map(pointPair),
      crossings: source.river.crossings.map(point),
    },
    paths: {
      ...source.paths,
      nodes: source.paths.nodes.map(point),
      edgeRoutes: Object.fromEntries(Object.entries(source.paths.edgeRoutes || {}).map(([id, route]) => [id, route.map(pointPair)])),
    },
    spawn: { x: source.spawn.x * MAP_SCALE, y: source.spawn.y * MAP_SCALE },
  };
}

export { forestSource };
export default scaleForestMap(forestSource);
