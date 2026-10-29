import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInstancedModel, loadModel } from './modelLoader.js';
import { distanceToRiverBank, isInWater, riverWidthAt } from '../../shared/water.js';
import { terrainHeightAt } from './terrain.js';
import { MAP_SCALE } from '../../shared/constants.js';

function nodeMap(paths) {
  return new Map(paths.nodes.map((node) => [node.id, node]));
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function routePoints(map, from, to, nodes) {
  const route = map.paths.edgeRoutes?.[`${from}|${to}`] || map.paths.edgeRoutes?.[`${to}|${from}`];
  const start = nodes.get(from); const end = nodes.get(to);
  const sampleCurve = (points) => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point.x, 0, point.y)), false, 'centripetal');
    const samples = Math.max(8, points.length * 6);
    return curve.getPoints(samples).map((point) => ({ x: point.x, y: point.z }));
  };
  if (route) return sampleCurve(route.map(([x, y]) => ({ x, y })));

  const crossingIds = new Set(map.river.crossings.map((crossing) => crossing.id));
  if (crossingIds.has(from) || crossingIds.has(to)) return [start, end];

  const dx = end.x - start.x; const dz = end.y - start.y;
  const length = Math.hypot(dx, dz);
  if (length < 7 * MAP_SCALE) return [start, end];
  const normalX = -dz / length; const normalZ = dx / length;
  const hash = [...`${from}|${to}`].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 17);
  const bend = (0.8 + (hash % 6) * 0.18) * MAP_SCALE;
  const midpoint = { x: (start.x + end.x) * 0.5, y: (start.y + end.y) * 0.5 };
  const controlsFor = (sign) => [
    start,
    { x: start.x + dx * 0.25, y: start.y + dz * 0.25 },
    { x: midpoint.x + normalX * bend * sign, y: midpoint.y + normalZ * bend * sign },
    { x: start.x + dx * 0.75, y: start.y + dz * 0.75 },
    end,
  ];
  const isClear = (points) => {
    for (let segment = 1; segment < points.length; segment += 1) {
      const a = points[segment - 1]; const b = points[segment];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const checks = Math.max(1, Math.ceil(distance / 0.8));
      for (let step = 0; step <= checks; step += 1) {
        const t = step / checks;
        const x = THREE.MathUtils.lerp(a.x, b.x, t);
        const z = THREE.MathUtils.lerp(a.y, b.y, t);
        if (isInWater(x, z, map) || distanceToRiverBank(x, z, map) <= map.paths.waterClearance) return false;
      }
    }
    return true;
  };
  const first = sampleCurve(controlsFor(hash & 1 ? 1 : -1));
  if (isClear(first)) return first;
  const alternate = sampleCurve(controlsFor(hash & 1 ? -1 : 1));
  return isClear(alternate) ? alternate : [start, end];
}

export function getPathPolylines(map) {
  const nodes = nodeMap(map.paths);
  return map.paths.edges.map(([from, to]) => routePoints(map, from, to, nodes));
}

function bridgeDeckAt(x, z, crossing, river, map) {
  const tangent = river.tangentAt(crossing.x, crossing.y);
  const len = Math.hypot(tangent.x, tangent.z) || 1;
  const along = Math.abs((x - crossing.x) * (tangent.z / len) - (z - crossing.y) * (tangent.x / len));
  const across = Math.abs((x - crossing.x) * (tangent.x / len) + (z - crossing.y) * (tangent.z / len));
  const span = riverWidthAt(crossing.x, crossing.y, map) + map.river.bridgeConfig.bankMargin * 2;
  return along < span * 0.5 + 0.2 && across < map.river.bridgeConfig.deckWidth * 0.5 + 0.25;
}

function pathRibbon(points, map, river) {
  const half = map.paths.width * 0.5;
  const lateral = [-0.64, -0.55, -0.44, -0.34, 0.34, 0.44, 0.55, 0.64];
  const positions = []; const uvs = []; const indices = [];
  const samples = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]; const b = points[i];
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.6));
    for (let j = 0; j < count; j += 1) samples.push({ x: THREE.MathUtils.lerp(a.x, b.x, j / count), z: THREE.MathUtils.lerp(a.y, b.y, j / count) });
  }
  samples.push({ x: points.at(-1).x, z: points.at(-1).y });
  const kept = samples.filter((p) => !map.river.crossings.some((crossing) => bridgeDeckAt(p.x, p.z, crossing, river, map)));
  const strips = [];
  let strip = [];
  for (const p of kept) {
    if (isInWater(p.x, p.z, map) || distanceToRiverBank(p.x, p.z, map) < 0.4) {
      if (strip.length > 1) strips.push(strip);
      strip = [];
    } else strip.push(p);
  }
  if (strip.length > 1) strips.push(strip);

  for (const run of strips) {
    const base = positions.length / 3;
    const nodeDegree = new Map();
    for (const [from, to] of map.paths.edges) { nodeDegree.set(from, (nodeDegree.get(from) || 0) + 1); nodeDegree.set(to, (nodeDegree.get(to) || 0) + 1); }
    const getEndKind = (point) => {
      const nearbyCrossing = map.river.crossings.find((crossing) => {
        const tangent = river.tangentAt(crossing.x, crossing.y); const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
        const acrossRiver = Math.abs((point.x - crossing.x) * (tangent.z / tangentLength) - (point.z - crossing.y) * (tangent.x / tangentLength));
        const alongRiver = Math.abs((point.x - crossing.x) * (tangent.x / tangentLength) + (point.z - crossing.y) * (tangent.z / tangentLength));
        const span = riverWidthAt(crossing.x, crossing.y, map) + map.river.bridgeConfig.bankMargin * 2;
        return Math.abs(acrossRiver - span * 0.5) < 1.0 && alongRiver < map.river.bridgeConfig.deckWidth * 0.5 + 0.6;
      });
      if (nearbyCrossing) return 'bridge';
      const node = map.paths.nodes.find((candidate) => Math.hypot(point.x - candidate.x, point.z - candidate.y) < 0.8);
      if (node && (nodeDegree.get(node.id) || 0) <= 1) return 'deadEnd';
      if (distanceToRiverBank(point.x, point.z, map) < 0.8) return 'ford';
      return 'junction';
    };
    const startKind = getEndKind(run[0]); const endKind = getEndKind(run.at(-1));
    for (let i = 0; i < run.length; i += 1) {
      const before = run[Math.max(0, i - 1)]; const after = run[Math.min(run.length - 1, i + 1)];
      const dx = after.x - before.x; const dz = after.z - before.z; const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len; const nz = dx / len;
      for (let lane = 0; lane < lateral.length; lane += 1) {
        const startFactor = startKind === 'bridge' ? (i < 4 ? 1.12 - 0.12 * (i / 3) : 1) : ['deadEnd', 'ford'].includes(startKind) ? THREE.MathUtils.smoothstep(i, 0, 5) : 1;
        const endDistance = run.length - 1 - i;
        const endFactor = endKind === 'bridge' ? (endDistance < 4 ? 1.12 - 0.12 * (endDistance / 3) : 1) : ['deadEnd', 'ford'].includes(endKind) ? THREE.MathUtils.smoothstep(endDistance, 0, 5) : 1;
        const offset = lateral[lane] * half * Math.min(startFactor, endFactor);
        const x = run[i].x + nx * offset; const z = run[i].z + nz * offset;
        positions.push(x, terrainHeightAt(x, z, map) + 0.012, z);
        uvs.push(i * 0.32, lane / (lateral.length - 1));
        if (i < run.length - 1 && lane < lateral.length - 1) {
          const a = base + i * lateral.length + lane; const b = a + lateral.length;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function addPathPebbles(lines, map, scene) {
  const geometry = new THREE.IcosahedronGeometry(0.12, 0);
  const material = new THREE.MeshStandardMaterial({ color: '#6f7562', roughness: 1 });
  const placements = [];
  const rand = createRandom(map.seed ^ 0x41a92);
  for (const line of lines) for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]; const b = line[i]; const dx = b.x - a.x; const dz = b.y - a.y; const len = Math.hypot(dx, dz) || 1;
    const count = Math.floor(len / (2.6 * MAP_SCALE));
    for (let j = 0; j < count; j += 1) {
      if (rand() > 0.33) continue;
      const t = (j + rand()) / count; const side = rand() < 0.5 ? -1 : 1; const offset = side * (map.paths.width * 0.5 + 0.18 + rand() * 0.28);
      const x = THREE.MathUtils.lerp(a.x, b.x, t) - dz / len * offset;
      const z = THREE.MathUtils.lerp(a.y, b.y, t) + dx / len * offset;
      if (isInWater(x, z, map) || distanceToRiverBank(x, z, map) < 0.6) continue;
      placements.push({ x, z, scale: 0.45 + rand() * 0.75, rotation: rand() * 6.28 });
    }
  }
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const dummy = new THREE.Object3D();
  placements.forEach((p, i) => { dummy.position.set(p.x, terrainHeightAt(p.x, p.z, map) + 0.03, p.z); dummy.scale.setScalar(p.scale); dummy.rotation.y = p.rotation; dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
  mesh.instanceMatrix.needsUpdate = true; scene.add(mesh);
}

function addWornJunctions(map, scene) {
  const degree = new Map();
  for (const [from, to] of map.paths.edges) {
    degree.set(from, (degree.get(from) || 0) + 1); degree.set(to, (degree.get(to) || 0) + 1);
  }
  const nodes = map.paths.nodes.filter((node) => (degree.get(node.id) || 0) >= 3);
  const geometry = new THREE.CircleGeometry(1.65, 24); geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({ color: '#896f4d', roughness: 1, side: THREE.DoubleSide, depthTest: true, depthWrite: true });
  const patches = new THREE.InstancedMesh(geometry, material, nodes.length);
  patches.name = 'worn-packed-dirt-junctions';
  const dummy = new THREE.Object3D();
  nodes.forEach((node, index) => {
    dummy.position.set(node.x, terrainHeightAt(node.x, node.y, map) + 0.018, node.y);
    dummy.scale.set(1, 1, 0.78); dummy.rotation.y = (index * 1.27) % Math.PI;
    dummy.updateMatrix(); patches.setMatrixAt(index, dummy.matrix);
  });
  patches.instanceMatrix.needsUpdate = true; scene.add(patches);
}

function bridgeRotation(river, crossing) {
  const tangent = river.tangentAt(crossing.x, crossing.y);
  const length = Math.hypot(tangent.x, tangent.z) || 1;
  const normalX = tangent.z / length;
  const normalZ = -tangent.x / length;
  return Math.atan2(-normalZ, normalX);
}

async function addBridges(map, river, scene) {
  const config = map.river.bridgeConfig;
  const placements = [];
  for (const crossing of map.river.crossings) {
    const modelPath = crossing.bridgeModelPath || config.modelPath;
    if (!modelPath) throw new Error(`Bridge model is not configured for crossing ${crossing.id}.`);
    const source = await loadModel(modelPath);
    source.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source.scene);
    const dimensions = bounds.getSize(new THREE.Vector3());
    const span = (river.waterWidthAt?.(crossing.x, crossing.y) ?? riverWidthAt(crossing.x, crossing.y, map)) + config.bankMargin * 2;
    const scaleY = config.modelHeightScale;
    const placement = {
      x: crossing.x,
      y: crossing.y,
      height: config.groundClearance - bounds.min.y * scaleY,
      rotation: bridgeRotation(river, crossing),
      scale: [span / dimensions.x, scaleY, config.deckWidth / dimensions.z],
    };
    placements.push({ modelPath, placement, crossing, span });
  }

  await Promise.all(placements.map(({ modelPath, placement }) => addInstancedModel(
    modelPath,
    [placement],
    scene,
    { tintStrength: 0.72, tintColor: '#77978e' },
  )));

  return placements.map(({ crossing, span }) => ({ id: crossing.id, span: Number(span.toFixed(2)) }));
}

export async function createPaths(map, river, scene) {
  const lines = getPathPolylines(map);
  const pathGeometries = lines.map((points) => pathRibbon(points, map, river)).filter((geometry) => geometry.index?.count);
  if (pathGeometries.length) {
    const material = new THREE.MeshStandardMaterial({ color: '#947858', roughness: 1, alphaTest: 0.06, side: THREE.DoubleSide, depthTest: true, depthWrite: true });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vPathUv;');
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPathUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPathUv = uv;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float edge = min(vPathUv.y, 1.0 - vPathUv.y);
        float edgeMask = smoothstep(0.0, 0.15, edge);
        float grain = sin(vPathUv.x * 19.0 + sin(vPathUv.x * 2.7) * 2.0) * sin(vPathUv.y * 61.0);
        float rut = (1.0 - smoothstep(0.0, 0.018, abs(vPathUv.y - 0.35))) + (1.0 - smoothstep(0.0, 0.018, abs(vPathUv.y - 0.65)));
        float footprints = smoothstep(0.94, 0.99, sin(vPathUv.x * 7.3 + sin(vPathUv.y * 31.0)));
        diffuseColor.rgb *= 0.94 + grain * 0.035 - rut * 0.09 - footprints * 0.025;
        diffuseColor.a *= edgeMask * (0.88 + grain * 0.08);`);
    };
    const dirt = new THREE.Mesh(mergeGeometries(pathGeometries, false), material);
    dirt.name = 'packed-dirt-path-network'; dirt.receiveShadow = true; scene.add(dirt);
  }
  addPathPebbles(lines, map, scene);
  addWornJunctions(map, scene);
  const bridges = await addBridges(map, river, scene);
  const placementReport = {
    style: 'packed-dirt',
    pathStones: 0,
    bridges,
  };
  console.info('[placement-report] paths', placementReport);
  return placementReport;
}
