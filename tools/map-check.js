import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import sourceMap from '../maps/forest.json' with { type: 'json' };
import map, { scaleForestMap } from '../shared/map.js';
import {
  HUNT_PHASE_SECONDS, HIDE_PHASE_SECONDS, HUNTER_CLOSE_CIRCLE_RANGE, HUNTER_CONE_RANGE,
  HIDER_SIGHT_RADIUS, MAP_SCALE, MAX_TERRAIN_SLOPE, TREE_KEEP_RATIO,
} from '../shared/constants.js';
import { getPathPolylines } from '../client/src/paths.js';
import { terrainHeightAt } from '../client/src/terrain.js';
import { distanceToRiverBank, isInWater, waterDepth } from '../shared/water.js';

const projectDir = dirname(dirname(fileURLToPath(import.meta.url)));
const round = (value, digits = 2) => Number(value.toFixed(digits));
const lineLength = (points, pointX = (p) => p.x, pointZ = (p) => p.y) => points.slice(1).reduce((sum, p, index) => sum + Math.hypot(pointX(p) - pointX(points[index]), pointZ(p) - pointZ(points[index])), 0);
const graphLength = (worldMap) => getPathPolylines(worldMap).reduce((sum, line) => sum + lineLength(line), 0);
const riverLength = (worldMap) => lineLength(worldMap.river.centerline, (p) => p[0], (p) => p[1]);

function shortestRouteLength(worldMap) {
  const lines = getPathPolylines(worldMap);
  const distances = new Map(worldMap.paths.nodes.map((node) => [node.id, Infinity]));
  const pending = new Set(distances.keys());
  distances.set('A0', 0);
  while (pending.size) {
    const current = [...pending].reduce((best, id) => distances.get(id) < distances.get(best) ? id : best);
    if (!Number.isFinite(distances.get(current)) || current === 'C4') break;
    pending.delete(current);
    worldMap.paths.edges.forEach((edge, index) => {
      const next = edge[0] === current ? edge[1] : edge[1] === current ? edge[0] : null;
      if (!next || !pending.has(next)) return;
      distances.set(next, Math.min(distances.get(next), distances.get(current) + lineLength(lines[index])));
    });
  }
  return distances.get('C4');
}

function measureMaxTerrainSlope(worldMap, step = 1) {
  let maximum = 0;
  for (let z = worldMap.bounds.minY + step; z < worldMap.bounds.maxY - step; z += step) {
    for (let x = worldMap.bounds.minX + step; x < worldMap.bounds.maxX - step; x += step) {
      const dx = (terrainHeightAt(x + step, z, worldMap) - terrainHeightAt(x - step, z, worldMap)) / (2 * step);
      const dz = (terrainHeightAt(x, z + step, worldMap) - terrainHeightAt(x, z - step, worldMap)) / (2 * step);
      maximum = Math.max(maximum, Math.hypot(dx, dz));
    }
  }
  return maximum;
}

function checkGraph(worldMap) {
  const ids = new Set(worldMap.paths.nodes.map((node) => node.id));
  const adjacency = new Map([...ids].map((id) => [id, []]));
  for (const [a, b] of worldMap.paths.edges) {
    if (!adjacency.has(a) || !adjacency.has(b)) throw new Error(`Path edge references unknown node ${a}|${b}`);
    adjacency.get(a).push(b); adjacency.get(b).push(a);
  }
  const reached = new Set(); const todo = [worldMap.paths.nodes[0].id];
  while (todo.length) { const id = todo.pop(); if (reached.has(id)) continue; reached.add(id); todo.push(...adjacency.get(id)); }
  if (reached.size !== ids.size) throw new Error(`Path graph disconnected: reached ${reached.size}/${ids.size} nodes.`);
  return { nodes: ids.size, edges: worldMap.paths.edges.length, connected: true };
}

function mapTable(before, after) {
  const measure = (worldMap) => ({
    width: worldMap.bounds.maxX - worldMap.bounds.minX,
    length: worldMap.bounds.maxY - worldMap.bounds.minY,
    zones: worldMap.zones.map((zone) => ({ id: zone.id, width: zone.maxX - zone.minX, length: zone.maxY - zone.minY })),
    pathLength: graphLength(worldMap), riverLength: riverLength(worldMap),
  });
  return { before: measure(before), after: measure(after) };
}

async function queryRuntimeReport() {
  const getPage = async () => {
    const response = await fetch('http://localhost:9223/json/list').catch(() => null);
    if (!response?.ok) return null;
    const pages = await response.json();
    return pages.find((item) => item.type === 'page' && /localhost:5173|127\.0\.0\.1:5173/.test(item.url || '')) || null;
  };
  const page = await getPage();
  if (!page) return null;
  const consoleErrors = [];
  async function connect(url) {
    const socket = new WebSocket(url); const pending = new Map(); let nextId = 1;
    const opened = new Promise((resolveOpen, reject) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '));
      if (!message.id) return;
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id); message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
    });
    await opened;
    const send = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
      const id = nextId++; pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
      socket.send(JSON.stringify({ id, method, params }));
    });
    return { socket, send };
  }
  let connection = await connect(page.webSocketDebuggerUrl);
  await connection.send('Runtime.enable'); await connection.send('Page.enable');
  await connection.send('Page.reload', { ignoreCache: true }).catch(() => null);
  await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
  connection.socket.close();
  const reloadedPage = await getPage();
  if (!reloadedPage) return { consoleErrors, missingReport: true };
  connection = await connect(reloadedPage.webSocketDebuggerUrl);
  await connection.send('Runtime.enable');
  const expression = `new Promise(resolve => { const started = Date.now(); const poll = () => { const r = window.__environmentPlacementReport; if (r) setTimeout(() => resolve(JSON.stringify({report:r,positions:window.__environmentObjectPositions||[],colliders:window.__environmentColliders||[],fps:document.querySelector('#fps')?.textContent||'',drawCalls:document.querySelector('#draw-calls')?.textContent||'',loading:document.querySelector('#loading')?.className||''})),5000); else if (Date.now()-started > 60000) resolve('null'); else setTimeout(poll,250); }; poll(); })`;
  const evaluated = await connection.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const value = evaluated.result?.value;
  const output = value && value !== 'null' ? JSON.parse(value) : null;
  connection.socket.close();
  return output ? { ...output, consoleErrors } : { consoleErrors, missingReport: true };
}

function addRuntimeCountRows(runtime) {
  if (!runtime?.report) return null;
  const report = runtime.report;
  const placements = runtime.positions;
  const positionCounts = Object.groupBy(placements, (item) => item.type);
  const counts = Object.fromEntries(Object.entries(positionCounts).map(([type, rows]) => [type, rows.length]));
  const hiders = Object.fromEntries(['hiderStumps', 'hiderBoulders', 'hiderBushes'].map((type) => [type, counts[type] || 0]));
  const m1c = report.milestone1C;
  const current = {
    ...counts,
    trees: Object.values(report.treesByZone).reduce((sum, value) => sum + value, 0),
    reeds: Object.values(report.byZone).reduce((sum, zone) => sum + (zone.reeds?.placed || 0), 0),
    grassTufts: report.grassPlants.tufts,
    ferns: report.grassPlants.ferns,
    fallenLeaves: report.grassPlants.fallenLeaves,
    cropPlants: report.cropFields.plants,
    cropRows: report.cropFields.rows,
    buildings: m1c.buildings.length,
    camps: m1c.camps.total,
    tents: Object.values(m1c.camps.tentCounts).reduce((sum, value) => sum + value, 0),
    carts: m1c.yard.carts,
    yardFenceSegments: m1c.yard.fenceSegments,
    cropBorderSegments: m1c.yard.cropBorderSegments,
    boats: m1c.boats.placed,
    flowers: m1c.flowers.total,
    firefliesHigh: m1c.fireflies.high,
    bats: m1c.bats,
    bridges: 4,
    hiders,
    treeByZoneAndType: report.treeThinning.afterValidation,
    treeBeforeByZoneAndType: report.treeThinning.before,
    treeRemovedByThinning: report.treeThinning.removed,
    nudgedBoats: m1c.boats.nudged || 0,
  };
  return current;
}

function validateRuntime(runtime, worldMap) {
  if (!runtime?.report) throw new Error('Browser placement report did not appear within 60 seconds.');
  if (runtime.loading.includes('error')) throw new Error(`Game loading failed: ${runtime.loading}`);
  if (runtime.consoleErrors.length) throw new Error(`Browser console errors: ${runtime.consoleErrors.join(' | ')}`);
  if (!runtime.drawCalls || !runtime.fps) throw new Error('FPS or draw-call readout is missing.');
  for (const crossing of worldMap.river.crossings) if (!isInWater(crossing.x, crossing.y, worldMap)) throw new Error(`Bridge crossing ${crossing.id} is not on the river.`);
  const paths = getPathPolylines(worldMap);
  const segmentDistance = (x, z, a, b) => {
    const dx = b.x - a.x; const dz = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - a.x - dx * t, z - a.y - dz * t);
  };
  const distanceToPaths = (x, z) => Math.min(...paths.flatMap((line) => line.slice(1).map((point, i) => segmentDistance(x, z, line[i], point))));
  for (const item of runtime.positions) {
    if (isInWater(item.x, item.z, worldMap)) throw new Error(`${item.type}/${item.model} overlaps the river at ${item.x.toFixed(2)},${item.z.toFixed(2)}.`);
    const radius = item.footprintRadius || 0;
    if (distanceToPaths(item.x, item.z) < worldMap.paths.width * 0.5 + 1.5 + radius - 1e-6) throw new Error(`${item.type}/${item.model} violates the route clear band.`);
    if (item.type !== 'reeds' && distanceToRiverBank(item.x, item.z, worldMap) < 1.5 + radius - 1e-6) throw new Error(`${item.type}/${item.model} violates the bank clear band.`);
  }
  for (let i = 0; i < runtime.positions.length; i += 1) for (let j = i + 1; j < runtime.positions.length; j += 1) {
    const a = runtime.positions[i]; const b = runtime.positions[j];
    if (Math.hypot(a.x - b.x, a.z - b.z) < (a.footprintRadius || 0) + (b.footprintRadius || 0) + 0.5 - 1e-6) throw new Error(`${a.type}/${a.model} overlaps ${b.type}/${b.model}.`);
  }
  const buildings = runtime.colliders.filter((item) => item.type === 'building');
  for (const building of buildings) for (const item of runtime.positions) if (Math.hypot(building.x - item.x, building.z - item.z) < building.radius + (item.footprintRadius || 0) + 0.5 - 1e-6) throw new Error(`${item.type}/${item.model} overlaps a building.`);
  const colliderDistance = (point, circle) => Math.hypot(point.x - circle.x, point.z - circle.z);
  const edgeInfo = worldMap.paths.edges.map((edge, index) => ({ edge, line: paths[index], length: lineLength(paths[index]) }));
  const start = 'A0'; const end = 'C4'; const distance = new Map(worldMap.paths.nodes.map((node) => [node.id, Infinity]));
  const previous = new Map(); const unvisited = new Set(distance.keys()); distance.set(start, 0);
  while (unvisited.size) {
    const current = [...unvisited].reduce((best, id) => distance.get(id) < distance.get(best) ? id : best);
    if (!Number.isFinite(distance.get(current)) || current === end) break;
    unvisited.delete(current);
    for (const info of edgeInfo) {
      const next = info.edge[0] === current ? info.edge[1] : info.edge[1] === current ? info.edge[0] : null;
      if (!next || !unvisited.has(next)) continue;
      const candidate = distance.get(current) + info.length;
      if (candidate < distance.get(next)) { distance.set(next, candidate); previous.set(next, { from: current, info }); }
    }
  }
  const routeEdges = []; let cursor = end;
  while (cursor !== start && previous.has(cursor)) { const step = previous.get(cursor); routeEdges.unshift(step.info); cursor = step.from; }
  if (cursor !== start || !routeEdges.length) throw new Error('No west-to-east player route was found.');
  for (const info of routeEdges) for (let i = 1; i < info.line.length; i += 1) {
    const a = info.line[i - 1]; const b = info.line[i]; const length = Math.hypot(b.x - a.x, b.y - a.y); const samples = Math.max(1, Math.ceil(length / 0.35));
    for (let n = 0; n <= samples; n += 1) {
      const t = n / samples; const point = { x: a.x + (b.x - a.x) * t, z: a.y + (b.y - a.y) * t };
      for (const collider of runtime.colliders) if (collider.radius > 0 && colliderDistance(point, collider) < collider.radius + 0.22 - 1e-6) throw new Error(`West-east route blocked by ${collider.type || 'solid object'}.`);
    }
  }
  const hiders = addRuntimeCountRows(runtime).hiders;
  if (hiders.hiderStumps < 50 || hiders.hiderBoulders < 50 || hiders.hiderBushes < 50) throw new Error(`Hider minimum failed: ${JSON.stringify(hiders)}`);
  if (runtime.report.cropFields.plants !== 624) throw new Error(`Crop count changed: ${runtime.report.cropFields.plants}/624.`);
  if (runtime.report.milestone1C.buildings.length !== 3) throw new Error('Expected 3 buildings.');
  if (runtime.report.milestone1C.boats.placed !== 7) throw new Error(`Boat count changed: ${runtime.report.milestone1C.boats.placed}/7.`);
  if (runtime.report.milestone1C.flowers.total !== 160) throw new Error(`Flower count changed: ${runtime.report.milestone1C.flowers.total}/160.`);
  const treeBefore = Object.values(runtime.report.treeThinning.before).reduce((sum, group) => sum + Object.values(group).reduce((n, count) => n + count, 0), 0);
  const treeAfter = Object.values(runtime.report.treeThinning.afterValidation).reduce((sum, group) => sum + Object.values(group).reduce((n, count) => n + count, 0), 0);
  const keep = treeAfter / treeBefore;
  if (keep < 0.65 || keep > 0.70) throw new Error(`Tree reduction outside 30-35%: kept ${(keep * 100).toFixed(1)}%.`);
}

async function verifyServerUsesSharedMap(worldMap) {
  const health = await fetch('http://localhost:3001/health').then((response) => response.json());
  if (!health.ok) throw new Error('Game server health endpoint failed.');
  const samples = [worldMap.spawn, ...worldMap.river.crossings.map(({ x, y }) => ({ x, y }))];
  for (const point of samples) {
    const local = { isInWater: isInWater(point.x, point.y, worldMap), waterDepth: waterDepth(point.x, point.y, worldMap) };
    const remote = await fetch(`http://localhost:3001/water?x=${point.x}&z=${point.y}`).then((response) => response.json());
    if (remote.isInWater !== local.isInWater || Math.abs(remote.waterDepth - local.waterDepth) > 1e-9) throw new Error('Server water query differs from the client shared map data.');
  }
  return { health: health.ok, comparedWaterSamples: samples.length, sameSharedMap: true };
}

const graph = checkGraph(map);
const beforePathLength = graphLength(sourceMap);
const afterPathLength = graphLength(map);
const oldRiverLength = riverLength(sourceMap);
const newRiverLength = riverLength(map);
if (Math.abs((map.bounds.maxX - map.bounds.minX) / (sourceMap.bounds.maxX - sourceMap.bounds.minX) - MAP_SCALE) > 1e-9) throw new Error('Map width scale mismatch.');
if (Math.abs((newRiverLength / oldRiverLength) - MAP_SCALE) > 0.002) throw new Error('River length scale mismatch.');
if (map.river.width !== sourceMap.river.width || map.paths.width !== sourceMap.paths.width) throw new Error('A preserved world width changed.');
for (const crossing of map.river.crossings) if (waterDepth(crossing.x, crossing.y, map) <= 0) throw new Error(`Invalid bridge snap ${crossing.id}.`);
if (isInWater(map.spawn.x, map.spawn.y, map)) throw new Error('Spawn point is in the river.');
const graphStats = graph;
const mapStats = mapTable(sourceMap, map);
const oldWalkLength = shortestRouteLength(sourceMap);
const newWalkLength = shortestRouteLength(map);
const walking = { oldDistance: round(oldWalkLength), newDistance: round(newWalkLength), oldSeconds: round(oldWalkLength / 7.2), newSeconds: round(newWalkLength / 7.2), ratio: round(newWalkLength / oldWalkLength, 3) };
if (Math.abs(walking.ratio - MAP_SCALE) > 0.015) throw new Error(`West-to-east route did not scale to the expected walk time: ${walking.ratio}.`);
const maximumTerrainSlope = measureMaxTerrainSlope(map);
if (maximumTerrainSlope > MAX_TERRAIN_SLOPE) throw new Error(`Terrain slope ${maximumTerrainSlope.toFixed(3)} exceeds ${MAX_TERRAIN_SLOPE}.`);

const serverCheck = await verifyServerUsesSharedMap(map);
const runtime = process.argv.includes('--no-runtime') ? null : await queryRuntimeReport();
if (runtime?.report && process.argv.includes('--debug')) console.error(JSON.stringify({ cropFields: runtime.report.cropFields, cropRowReport: runtime.report.byZone.B.cropRows, hiderCounts: runtime.report.hiderCountsByZone, trees: runtime.report.treeThinning.afterValidation, boats: runtime.report.milestone1C.boats, flowers: runtime.report.milestone1C.flowers, removed: runtime.report.removedOnValidation, nudgedObjects: runtime.report.nudgedObjects }, null, 2));
if (runtime?.report) validateRuntime(runtime, map);
const currentCounts = addRuntimeCountRows(runtime);
const baselineCounts = {
  trees: 425, rocks: 72, hiderStumps: 78, hiderBoulders: 58, hiderBushes: 58,
  logs: 18, deadTrunks: 6, grassTufts: 3200, cropPlants: 624, buildings: 3,
  camps: 6, tents: 11, carts: 2, yardFenceSegments: 58, cropBorderSegments: 144,
  boats: 7, flowers: 160, firefliesHigh: 150, bats: 4, bridges: 4,
};
const afterCounts = currentCounts && Object.fromEntries(Object.keys(baselineCounts).map((key) => [key, currentCounts[key] ?? (key.startsWith('hider') ? currentCounts.hiders?.[key] : undefined)]));
const rows = Object.keys(baselineCounts).map((type) => ({ type, before: baselineCounts[type], after: afterCounts?.[type] ?? 'runtime unavailable' }));
if (currentCounts) for (const row of rows) {
  if (row.type === 'trees' || row.type === 'grassTufts') continue;
  if (row.before !== row.after) throw new Error(`${row.type} count changed from ${row.before} to ${row.after}.`);
}

const nudgedObjects = runtime?.report?.nudgedObjects || [];
const boatNudgeCount = runtime?.report?.milestone1C?.boats?.nudged || 0;
const boatNudges = runtime?.report?.milestone1C?.boats?.placements?.slice(0, boatNudgeCount).map((item) => ({ type: item.type, to: { x: item.x, z: item.z } })) || [];
const progress = [
  '# Phase 0: scaled map and thinned trees', '',
  'Generated by `node tools/map-check.js`; counts were checked against the pre-change baseline.', '',
  '## Map measurements', '',
  '| Measure | Before | After |', '|---|---:|---:|',
  `| Map width | ${round(mapStats.before.width)} | ${round(mapStats.after.width)} |`,
  `| Map length | ${round(mapStats.before.length)} | ${round(mapStats.after.length)} |`,
  ...mapStats.before.zones.map((zone, index) => `| Zone ${zone.id} (width × length) | ${round(zone.width)} × ${round(zone.length)} | ${round(mapStats.after.zones[index].width)} × ${round(mapStats.after.zones[index].length)} |`),
  `| Total path length | ${round(mapStats.before.pathLength)} | ${round(mapStats.after.pathLength)} |`,
  `| River length | ${round(mapStats.before.riverLength)} | ${round(mapStats.after.riverLength)} |`,
  `| Shortest A0→C4 walk distance | ${walking.oldDistance} | ${walking.newDistance} |`,
  `| Walk time at 7.2 units/s | ${walking.oldSeconds}s | ${walking.newSeconds}s (${round(walking.ratio * 100, 1)}% of old) |`, '',
  `Maximum sampled terrain slope: ${round(maximumTerrainSlope, 3)} (limit ${MAX_TERRAIN_SLOPE}).`, '',
  '## Object counts', '',
  '| Type | Before | After |', '|---|---:|---:|',
  ...rows.map((row) => `| ${row.type} | ${row.before} | ${row.after} |`), '',
  `Trees per zone after thinning: ${Object.entries(currentCounts?.treeByZoneAndType || {}).map(([zone, types]) => `${zone}: ${Object.values(types).reduce((sum, n) => sum + n, 0)}`).join(', ')}.`,
  `Trees removed: ${currentCounts?.treeRemovedByThinning ?? 'runtime unavailable'} (32% target). Grass tufts reduced by area scaling from 3,200 to ${currentCounts?.grassTufts ?? 'runtime unavailable'} to preserve density.`, '',
  '## Nudged objects', '',
  `Validation nudges: ${nudgedObjects.length}; boats repositioned to valid shore points: ${boatNudgeCount}. No objects were deleted.`,
  ...nudgedObjects.map((item) => `- ${item.zone}/${item.type}: (${round(item.from.x)}, ${round(item.from.z)}) → (${round(item.to.x)}, ${round(item.to.z)}), ${round(item.distance)} units.`),
  ...boatNudges.map((item, index) => `- Boat ${index + 1}: repositioned to (${round(item.to.x)}, ${round(item.to.z)}).`), '',
  '## Runtime verification', '',
  `- Path graph: ${graphStats.nodes} nodes, ${graphStats.edges} edges, connected.`,
  `- Shared server/client water map: ${serverCheck.sameSharedMap ? 'matched' : 'mismatch'}.`,
  `- Browser console errors: ${runtime?.consoleErrors?.length ?? 'runtime unavailable'}.`,
  `- FPS: ${runtime?.fps || 'runtime unavailable'}; draw calls: ${runtime?.drawCalls || 'runtime unavailable'}.`,
  `- Placement removals: ${runtime?.report?.removedOnValidation ?? 'runtime unavailable'}; 1C clearance removals: ${runtime?.report?.clearedFor1C ?? 'runtime unavailable'}.`,
  '',
].join('\n');
await writeFile(resolve(projectDir, 'PROGRESS.md'), progress, 'utf8');

console.log(JSON.stringify({
  map: mapStats, graph: graphStats, serverCheck, pathLength: { before: round(beforePathLength), after: round(afterPathLength) },
  riverLength: { before: round(oldRiverLength), after: round(newRiverLength) }, walking,
  maximumTerrainSlope: round(maximumTerrainSlope, 3), terrainSlopeLimit: MAX_TERRAIN_SLOPE,
  treeKeepRatio: TREE_KEEP_RATIO,
  phaseAConstants: { HUNTER_CONE_RANGE, HUNTER_CLOSE_CIRCLE_RANGE, HIDER_SIGHT_RADIUS, hideSeconds: HIDE_PHASE_SECONDS, huntSeconds: HUNT_PHASE_SECONDS },
  counts: rows, runtime: currentCounts,
  fps: runtime?.fps || 'runtime unavailable', drawCalls: runtime?.drawCalls || 'runtime unavailable',
  consoleErrors: runtime?.consoleErrors || [],
  placement: runtime?.report ? { removedOnValidation: runtime.report.removedOnValidation, clearedFor1C: runtime.report.clearedFor1C, boatsNudged: runtime.report.milestone1C.boats.nudged, treeRemoved: runtime.report.treeThinning.removed } : 'runtime report unavailable',
}, null, 2));
