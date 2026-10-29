import { distanceToRiverBank, isInWater, riverWidthAt } from '../../shared/water.js';
import { getPathPolylines } from './paths.js';

function segmentDistance(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - (a.x + dx * t), z - (a.y + dz * t));
}

export class PlacementValidator {
  constructor(map) {
    this.map = map;
    this.paths = getPathPolylines(map);
    this.occupied = [];
  }

  rejectReason(x, z, radius, zone) {
    const clearanceFailure = this.rejectLandscapeClearance(x, z, radius, zone);
    if (clearanceFailure) return clearanceFailure;
    for (const other of this.occupied) {
      if (Math.hypot(x - other.x, z - other.z) < radius + other.footprintRadius + 0.18) return 'overlap';
    }
    return null;
  }

  rejectLandscapeClearance(x, z, radius, zone) {
    const bounds = this.map.bounds;
    const minX = Math.max(bounds.minX, zone.minX);
    const maxX = Math.min(bounds.maxX, zone.maxX);
    if (x < minX + radius + 1 || x > maxX - radius - 1 || z < bounds.minY + radius + 1 || z > bounds.maxY - radius - 1) return 'bounds';
    if (isInWater(x, z, this.map)) return 'water';
    if (distanceToRiverBank(x, z, this.map) < 1.5 + radius) return 'riverClearance';

    const pathClearance = this.map.paths.width * 0.5 + 1.5 + radius;
    for (const line of this.paths) {
      for (let i = 1; i < line.length; i += 1) {
        if (segmentDistance(x, z, line[i - 1], line[i]) < pathClearance) return 'pathClearance';
      }
    }

    const bridgeConfig = this.map.river.bridgeConfig;
    for (const crossing of this.map.river.crossings) {
      const tangent = this.riverTangentAt(crossing.x, crossing.y);
      const length = Math.hypot(tangent.x, tangent.z) || 1;
      const along = Math.abs((x - crossing.x) * (tangent.z / length) - (z - crossing.y) * (tangent.x / length));
      const across = Math.abs((x - crossing.x) * (tangent.x / length) + (z - crossing.y) * (tangent.z / length));
      const bridgeSpan = riverWidthAt(crossing.x, crossing.y, this.map) + bridgeConfig.bankMargin * 2;
      if (along < bridgeSpan * 0.5 + 1.5 + radius && across < bridgeConfig.deckWidth * 0.5 + 1.5 + radius) return 'bridgeClearance';
    }

    return null;
  }

  reserve(item) {
    this.occupied.push(item);
  }

  riverTangentAt(x, z) {
    const points = this.map.river.centerline;
    let best = Infinity;
    let index = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]; const b = points[i + 1];
      const distance = segmentDistance(x, z, { x: a[0], y: a[1] }, { x: b[0], y: b[1] });
      if (distance < best) { best = distance; index = i; }
    }
    const a = points[index]; const b = points[index + 1];
    return { x: b[0] - a[0], z: b[1] - a[1] };
  }
}
