import * as THREE from 'three';
import { loadModel, addInstancedModel, addUntintedInstancedModel, updateDistanceCulledInstances } from './modelLoader.js';
import { PlacementValidator } from './placementValidator.js';
import { terrainHeightAt } from './terrain.js';
import { createMilestone1C, getMilestone1CClearings } from './milestone1c.js';
import { MAP_SCALE, TREE_KEEP_RATIO } from '../../shared/constants.js';

const HIDER_MODELS = {
  hiderBushes: 'plant_bushDetailed.glb',
  hiderStumps: 'stump_squareDetailed.glb',
  hiderBoulders: 'rock_smallTopB.glb',
};

const ZONE_CONFIG = {
  A: {
    treeCount: 250,
    groveCount: 180,
    rowCount: 35,
    treeModels: ['tree_pineTallC.glb', 'tree_pineTallD.glb', 'tree_pineTallC_detailed.glb', 'tree_pineRoundB.glb'],
    treeTint: '#597d8b',
    treeRadius: 1.05,
  },
  B: {
    treeCount: 150,
    groveCount: 115,
    rowCount: 25,
    treeModels: ['tree_plateau.glb', 'tree_plateau_dark.glb', 'tree_plateau_fall.glb'],
    treeTint: '#817548',
    treeRadius: 1.1,
  },
  C: {
    treeCount: 25,
    groveCount: 20,
    rowCount: 5,
    treeModels: ['tree_pineRoundA.glb', 'tree_pineTallD.glb', 'tree_plateau_dark.glb'],
    treeTint: '#64867f',
    treeRadius: 1.0,
  },
};

const HIDER_COUNTS = { A: 20, B: 20, C: 18 };
const HIDER_STUMP_COUNTS = { A: 27, B: 27, C: 24 };
const HIDER_SCALE = { min: 0.9, max: 1.1 };
const OBJECT_TINT = {
  hiderBushes: '#64836f',
  hiderStumps: '#648177',
  hiderBoulders: '#718b89',
  rocks: '#7b9290',
  logs: '#647a73',
  deadTrunks: '#657b77',
};

function hashSeed(seed, value) {
  return [...value].reduce((result, character) => (Math.imul(result, 31) + character.charCodeAt(0)) >>> 0, seed >>> 0);
}

function randomFor(seed, label) {
  let state = hashSeed(seed, label) || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function chooseGroupSize(random, remaining, range) {
  const [min, max] = range;
  if (remaining <= max) return remaining;
  let size = randomInt(random, min, max);
  const remainder = remaining - size;
  if (remainder > 0 && remainder < min) size -= min - remainder;
  return Math.max(min, size);
}

function objectHeight(model) {
  return loadModel(model).then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()).y;
  });
}

function initializeReport(map) {
  return Object.fromEntries(map.zones.map((zone) => [zone.id, {}]));
}

function recordResult(report, zone, type, accepted) {
  report[zone][type] ||= { placed: 0, rejected: 0 };
  report[zone][type][accepted ? 'placed' : 'rejected'] += 1;
}

function reservePlacement({ validator, report, zone, type, x, z, footprintRadius, collisionRadius = 0, ...data }) {
  const clearOf1C = (px, pz) => type === 'reeds' || !validator.milestone1CClearings?.some((area) => Math.hypot(px - area.x, pz - area.z) < area.radius + footprintRadius);
  let px = x; let pz = z; let failure = clearOf1C(px, pz) ? validator.rejectReason(px, pz, footprintRadius, zone) : 'milestone1cClearance';
  if (failure && type !== 'trees') {
    for (let radius = 0.5; failure && radius <= 8; radius += 0.5) {
      for (let spoke = 0; spoke < 32 && failure; spoke += 1) {
        const angle = spoke * Math.PI * 2 / 32;
        const nx = x + Math.cos(angle) * radius; const nz = z + Math.sin(angle) * radius;
        if (!clearOf1C(nx, nz)) continue;
        const nextFailure = validator.rejectReason(nx, nz, footprintRadius, zone);
        if (!nextFailure) { px = nx; pz = nz; failure = null; }
      }
    }
  }
  if (failure) {
    recordResult(report, zone.id, type, false);
    return null;
  }
  const moved = Math.hypot(px - x, pz - z) > 0.001;
  const object = { zone: zone.id, type, x: px, z: pz, footprintRadius, collisionRadius, ...data, ...(moved ? { nudgedFrom: { x, z }, nudgedDistance: Math.hypot(px - x, pz - z) } : {}) };
  validator.reserve(object);
  recordResult(report, zone.id, type, true);
  if (moved) (validator.nudgedPlacements ||= []).push({ type, zone: zone.id, from: { x, z }, to: { x: px, z: pz }, distance: object.nudgedDistance });
  return object;
}

function thinTrees(objects, map) {
  const candidates = objects.filter((object) => object.type === 'trees');
  const byZoneAndType = (rows) => Object.fromEntries(map.zones.map((zone) => [zone.id, Object.fromEntries(
    [...new Set(rows.filter((item) => item.zone === zone.id).map((item) => item.model))].sort().map((model) => [model, rows.filter((item) => item.zone === zone.id && item.model === model).length]),
  )]));
  const before = byZoneAndType(candidates);
  const landmarks = [
    { zone: 'A', x: s(18), z: s(94) }, { zone: 'A', x: s(14), z: s(20) }, { zone: 'A', x: s(71), z: s(105) }, { zone: 'A', x: s(15), z: s(108) },
    { zone: 'B', x: s(101), z: s(103) }, { zone: 'B', x: s(147), z: s(21) }, { zone: 'B', x: s(116), z: s(102) }, { zone: 'B', x: s(138), z: s(29) },
    { zone: 'C', x: s(207), z: s(92) }, { zone: 'C', x: s(224), z: s(15) },
  ];
  const protectedTrees = new Set(candidates.filter((item) => item.landmark === 'ancient-pine'));
  for (const point of landmarks) {
    const nearest = candidates.filter((item) => item.zone === point.zone).sort((a, b) => Math.hypot(a.x - point.x, a.z - point.z) - Math.hypot(b.x - point.x, b.z - point.z))[0];
    if (nearest) protectedTrees.add(nearest);
  }
  const kept = new Set(protectedTrees);
  for (const zone of map.zones) {
    const models = [...new Set(candidates.filter((item) => item.zone === zone.id).map((item) => item.model))];
    for (const model of models) {
      const group = candidates.filter((item) => item.zone === zone.id && item.model === model);
      const pinned = group.filter((item) => protectedTrees.has(item));
      const target = Math.max(pinned.length, Math.round(group.length * TREE_KEEP_RATIO));
      const selected = [...pinned];
      const pending = group.filter((item) => !protectedTrees.has(item));
      while (selected.length < target && pending.length) {
        let bestIndex = 0; let bestDistance = -1;
        for (let i = 0; i < pending.length; i += 1) {
          const item = pending[i];
          const nearest = selected.length ? Math.min(...selected.map((other) => (item.x - other.x) ** 2 + (item.z - other.z) ** 2)) : Infinity;
          if (nearest > bestDistance) { bestDistance = nearest; bestIndex = i; }
        }
        selected.push(pending.splice(bestIndex, 1)[0]);
      }
      selected.forEach((item) => kept.add(item));
      group.forEach((item) => { if (!selected.includes(item)) kept.delete(item); });
    }
  }
  const afterRows = candidates.filter((item) => kept.has(item));
  const after = byZoneAndType(afterRows);
  const removed = candidates.length - afterRows.length;
  const index = new Set(afterRows);
  return { objects: objects.filter((item) => item.type !== 'trees' || index.has(item)), report: { before, after, removed, keepRatio: candidates.length ? Number((afterRows.length / candidates.length).toFixed(4)) : 1 } };
}

const s = (value) => value * MAP_SCALE;

function generateGroups({ validator, report, zone, type, target, models, random, getObject, anchor, centerFactory, groupRange = [3, 6], spread = [0.5, 4.0], maxAttempts = 50 }) {
  const map = validator.map;
  const scaledSpread = spread.map((distance) => distance * MAP_SCALE);
  const placed = [];
  let attempts = 0;
  let anchorDone = false;
  while (placed.length < target && attempts < target * maxAttempts) {
    const remaining = target - placed.length;
    const groupSize = chooseGroupSize(random, remaining, groupRange);
    let center;
    if (anchor && !anchorDone) {
      center = anchor(random);
      anchorDone = true;
    } else if (centerFactory) {
      center = centerFactory(random);
    } else {
      center = {
        x: zone.minX + 4 * MAP_SCALE + random() * (zone.maxX - zone.minX - 8 * MAP_SCALE),
        z: map.bounds.minY + 4 * MAP_SCALE + random() * (map.bounds.maxY - map.bounds.minY - 8 * MAP_SCALE),
      };
    }
    let localPlaced = 0;
    for (let index = 0; index < groupSize && placed.length < target; index += 1) {
      attempts += 1;
      const angle = random() * Math.PI * 2;
      const distance = index === 0 ? random() * scaledSpread[1] : scaledSpread[0] + random() * (scaledSpread[1] - scaledSpread[0]);
      const candidate = getObject(random, center.x + Math.cos(angle) * distance, center.z + Math.sin(angle) * distance, models);
      const accepted = reservePlacement({ validator, report, zone, type, ...candidate });
      if (accepted) {
        placed.push(accepted);
        localPlaced += 1;
      }
    }
    // A candidate group that lands on a route or river is retried from a new center.
    if (localPlaced === 0 && attempts > target * maxAttempts * 0.75) break;
  }
  return placed;
}

function placeTreeRows({ validator, report, map, zone, config, random, models, treeData }) {
  const paths = validator.paths;
  const placed = [];
  let rejected = 0;
  let eligible = paths.flatMap((line) => line.slice(1).map((b, i) => [line[i], b]))
    .filter(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) > 8);
  eligible = eligible.sort(() => random() - 0.5);
  let attempts = 0;
  for (const [a, b] of eligible) {
    if (placed.length >= config.rowCount) break;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const t = 0.22 + random() * 0.56;
    const side = random() < 0.5 ? -1 : 1;
    const x = THREE.MathUtils.lerp(a.x, b.x, t);
    const z = THREE.MathUtils.lerp(a.y, b.y, t);
    const nx = -(b.y - a.y) / length;
    const nz = (b.x - a.x) / length;
    const offset = map.paths.width * 0.5 + 1.5 + 2.2 * MAP_SCALE + random() * 2.0 * MAP_SCALE;
    const object = treeData(random, x + nx * offset * side, z + nz * offset * side, models);
    const accepted = reservePlacement({ validator, report, zone, type: 'trees', ...object });
    attempts += 1;
    if (accepted) placed.push(accepted);
    else rejected += 1;
  }
  while (placed.length < config.rowCount && attempts < config.rowCount * 10) {
    const object = treeData(random, zone.minX + 3 * MAP_SCALE + random() * (zone.maxX - zone.minX - 6 * MAP_SCALE), map.bounds.minY + 5 * MAP_SCALE + random() * (map.bounds.maxY - map.bounds.minY - 10 * MAP_SCALE), models);
    const accepted = reservePlacement({ validator, report, zone, type: 'trees', ...object });
    attempts += 1;
    if (accepted) placed.push(accepted);
    else rejected += 1;
  }
  return { placed, rejected };
}

function makeSoftEllipseShadows(objects, scene, map) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      void main(){
        vec2 p=(vUv-0.5)*2.0;
        float r=dot(p,p);
        float alpha=exp(-r*3.1)*0.58*(1.0-smoothstep(0.78,1.0,r));
        if(alpha<0.006) discard;
        gl_FragColor=vec4(0.012,0.045,0.042,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const shadows = new THREE.InstancedMesh(geometry, material, objects.length);
  shadows.name = 'environment-soft-ellipse-shadows';
  const dummy = new THREE.Object3D();
  objects.forEach((object, index) => {
    dummy.position.set(object.x, terrainHeightAt(object.x, object.z, map) + 0.018 + index * 0.000001, object.z);
    dummy.rotation.y = object.rotation;
    dummy.scale.set(object.shadowWidth, object.shadowDepth, 1);
    dummy.updateMatrix();
    shadows.setMatrixAt(index, dummy.matrix);
  });
  shadows.instanceMatrix.needsUpdate = true;
  scene.add(shadows);
  return shadows;
}

function setHighlight(material, enabled) {
  for (const item of Array.isArray(material) ? material : [material]) {
    if (!item?.emissive) continue;
    item.emissive.set(enabled ? '#44f0bd' : `#${item.userData.hiderOriginalEmissive || '000000'}`);
    item.emissiveIntensity = enabled ? 0.75 : (item.userData.hiderOriginalIntensity || 0);
  }
}

function createReedBeds(map, river, scene, validator, report) {
  const reeds = [];
  const random = randomFor(map.seed, 'reed-beds');
  const samples = river.centerline;
  for (let index = 30; index < samples.length - 30; index += 38) {
    const point = samples[index];
    if (map.river.crossings.some((crossing) => Math.hypot(crossing.x - point.x, crossing.y - point.z) < 10)) continue;
    const tangent = river.tangentAt(point.x, point.z);
    const length = Math.hypot(tangent.x, tangent.z) || 1;
    const tx = tangent.x / length;
    const tz = tangent.z / length;
    const nx = -tz;
    const nz = tx;
    const edge = river.bankWidthAt(point.x, point.z) * 0.5 + 2.35;
    for (const side of [-1, 1]) {
      for (let blade = 0; blade < 7; blade += 1) {
        const along = (random() - 0.5) * 2.0;
        const across = side * edge + (random() - 0.5) * 0.7;
        const x = point.x + tx * along + nx * across;
        const z = point.z + tz * along + nz * across;
        const zone = map.zones.find((item) => x >= item.minX && x <= item.maxX);
        if (!zone) continue;
        const accepted = reservePlacement({ validator, report, zone, type: 'reeds', x, z, footprintRadius: 0.08 });
        if (accepted) reeds.push({ ...accepted, height: 0.55 + random() * 0.3, groundY: terrainHeightAt(x, z, map), phase: random() * Math.PI * 2, yaw: random() * Math.PI * 2 });
      }
    }
  }
  const stemGeometry = new THREE.CylinderGeometry(0.025, 0.048, 1, 5, 1);
  const headGeometry = new THREE.CapsuleGeometry(0.042, 0.11, 2, 5);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#365e54', roughness: 1 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: '#5b8270', roughness: 1 });
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, reeds.length);
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, reeds.length);
  stems.name = 'grouped-river-reed-bed-stems';
  heads.name = 'grouped-river-reed-bed-heads';
  stems.frustumCulled = false;
  heads.frustumCulled = false;
  scene.add(stems, heads);
  const dummy = new THREE.Object3D();
  const update = (time) => {
    reeds.forEach((reed, index) => {
      const sway = Math.sin(time * 1.05 + reed.phase) * 0.12;
      dummy.position.set(reed.x, reed.groundY + reed.height * 0.5, reed.z);
      dummy.rotation.set(0, reed.yaw, sway);
      dummy.scale.set(1, reed.height, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(index, dummy.matrix);
      dummy.position.set(reed.x + Math.sin(sway) * 0.06, reed.groundY + reed.height * 0.92, reed.z);
      dummy.rotation.set(0, reed.yaw, sway * 0.7);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      heads.setMatrixAt(index, dummy.matrix);
    });
    stems.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { count: reeds.length, update };
}

function distanceToPaths(x, z, lines) {
  let nearest = Infinity;
  for (const line of lines) for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1]; const b = line[i];
    const dx = b.x - a.x; const dz = b.y - a.y;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    nearest = Math.min(nearest, Math.hypot(x - a.x - dx * t, z - a.y - dz * t));
  }
  return nearest;
}

function createGroundPlants(map, scene, features, validator, clearings = []) {
  const random = randomFor(map.seed, 'ground-plants');
  const grass = [];
  const ferns = [];
  const leaves = [];
  const featureBases = features.map(({ x, z }) => ({ x, z }));
  const maxAttempts = 18000;
  const grassTarget = Math.round(3200 * MAP_SCALE * MAP_SCALE);
  for (let attempt = 0; attempt < maxAttempts && grass.length < grassTarget; attempt += 1) {
    const x = map.bounds.minX + 2 * MAP_SCALE + random() * (map.bounds.maxX - map.bounds.minX - 4 * MAP_SCALE);
    const z = map.bounds.minY + 2 * MAP_SCALE + random() * (map.bounds.maxY - map.bounds.minY - 4 * MAP_SCALE);
    if (distanceToPaths(x, z, validator.paths) < map.paths.width * 0.5 + 1.5) continue;
    if (distanceToRiverBankFast(x, z, map) < 1.5) continue;
    if (clearings.some((area) => Math.hypot(x - area.x, z - area.z) < area.radius)) continue;
    if (Math.hypot(x - 207 * MAP_SCALE, z - 87 * MAP_SCALE) < 22 * MAP_SCALE) continue;
    const nearBank = Math.min(1, Math.max(0, (8 - distanceToRiverBankFast(x, z, map)) / 6));
    let nearFeature = false;
    for (let i = 0; i < featureBases.length; i += 1) if (Math.hypot(x - featureBases[i].x, z - featureBases[i].z) < 2.6) { nearFeature = true; break; }
    if (random() > (nearBank > 0 ? 0.78 + nearBank * 0.18 : 0.72) && !nearFeature) continue;
    grass.push({ x, z, height: 0.22 + random() * 0.52, width: 0.65 + random() * 0.45, yaw: random() * Math.PI * 2, tint: 0.83 + random() * 0.36 });
    if (random() < 0.075) ferns.push({ x: x + (random() - 0.5) * 0.7, z: z + (random() - 0.5) * 0.7, scale: 0.55 + random() * 0.8, yaw: random() * Math.PI * 2, tint: 0.8 + random() * 0.35 });
    if (random() < 0.18) leaves.push({ x: x + (random() - 0.5) * 1.1, z: z + (random() - 0.5) * 1.1, scale: 0.25 + random() * 0.5, yaw: random() * Math.PI * 2, tint: random() });
  }

  const bladeGeometry = new THREE.BufferGeometry();
  bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.32, 0, 0, 0, 1, 0, 0.32, 0, 0,
    0, 0, -0.32, 0, 0.78, 0, 0, 0, 0.32,
    -0.23, 0, -0.22, 0.04, 0.66, 0, 0.23, 0, 0.22,
  ], 3));
  bladeGeometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]); bladeGeometry.computeVertexNormals();
  const grassMesh = new THREE.InstancedMesh(bladeGeometry, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.94 }), grass.length);
  grassMesh.name = 'instanced-grass-tufts'; grassMesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  grass.forEach((item, index) => {
    const h = item.height;
    dummy.position.set(item.x, terrainHeightAt(item.x, item.z, map), item.z);
    dummy.rotation.y = item.yaw; dummy.scale.set(item.width, h, item.width); dummy.updateMatrix(); grassMesh.setMatrixAt(index, dummy.matrix);
    color.setHSL(0.29 + random() * 0.08, 0.28 + random() * 0.2, 0.25 + random() * 0.18).multiplyScalar(item.tint);
    grassMesh.setColorAt(index, color);
  });
  grassMesh.instanceMatrix.needsUpdate = true; if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true; scene.add(grassMesh);

  const fernGeometry = new THREE.BufferGeometry();
  const fernPositions = []; const fernIndices = [];
  for (let blade = 0; blade < 7; blade += 1) {
    const angle = blade / 7 * Math.PI * 2; const x = Math.cos(angle) * 0.48; const z = Math.sin(angle) * 0.48;
    const start = fernPositions.length / 3;
    fernPositions.push(0, 0, 0, x * 0.55, 0.48, z * 0.55, x, 0.08, z);
    fernIndices.push(start, start + 1, start + 2);
  }
  fernGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fernPositions, 3)); fernGeometry.setIndex(fernIndices);
  fernGeometry.computeVertexNormals();
  const fernMesh = new THREE.InstancedMesh(fernGeometry, new THREE.MeshStandardMaterial({ color: '#47714b', side: THREE.DoubleSide, roughness: 1 }), ferns.length);
  fernMesh.name = 'instanced-ferns'; fernMesh.frustumCulled = false;
  ferns.forEach((item, index) => { dummy.position.set(item.x, terrainHeightAt(item.x, item.z, map), item.z); dummy.rotation.y = item.yaw; dummy.scale.setScalar(item.scale); dummy.updateMatrix(); fernMesh.setMatrixAt(index, dummy.matrix); });
  fernMesh.instanceMatrix.needsUpdate = true; scene.add(fernMesh);

  const leafShape = new THREE.Shape();
  leafShape.moveTo(-0.5, 0); leafShape.quadraticCurveTo(0, 0.42, 0.5, 0); leafShape.quadraticCurveTo(0, -0.36, -0.5, 0);
  const leafGeometry = new THREE.ShapeGeometry(leafShape, 5); leafGeometry.rotateX(-Math.PI / 2);
  const leafMesh = new THREE.InstancedMesh(leafGeometry, new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 1 }), leaves.length);
  leafMesh.name = 'instanced-fallen-leaves'; leafMesh.frustumCulled = false;
  leaves.forEach((item, index) => { dummy.position.set(item.x, terrainHeightAt(item.x, item.z, map) + 0.02, item.z); dummy.rotation.y = item.yaw; dummy.scale.set(item.scale * 1.4, 1, item.scale); dummy.updateMatrix(); leafMesh.setMatrixAt(index, dummy.matrix); color.set(item.tint < 0.5 ? '#777447' : '#536746'); leafMesh.setColorAt(index, color); });
  leafMesh.instanceMatrix.needsUpdate = true; if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true; scene.add(leafMesh);
  return {
    count: grass.length,
    fernCount: ferns.length,
    fallenLeafCount: leaves.length,
    setQuality(level) {
      const ratio = level === 'high' ? 1 : level === 'medium' ? 0.8 : 0.5;
      grassMesh.count = Math.floor(grass.length * ratio);
      fernMesh.count = Math.floor(ferns.length * ratio);
      leafMesh.count = Math.floor(leaves.length * ratio);
    },
  };
}

function distanceToRiverBankFast(x, z, map) {
  let best = Infinity;
  const points = map.river.centerline;
  for (let i = 1; i < points.length; i += 1) {
    const a = { x: points[i - 1][0], y: points[i - 1][1] }; const b = { x: points[i][0], y: points[i][1] };
    const dx = b.x - a.x; const dz = b.y - a.y;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.y - dz * t));
  }
  const halfBank = Math.max(...map.river.widthKeys.map((entry) => entry[1])) * (map.river.bankScale ?? 1.72) * 0.5;
  return Math.max(0, best - halfBank);
}

async function createCropFields(map, scene, heights, scaleInfo, validator, report) {
  if (!map.zones.some((zone) => zone.id === 'C')) return { fields: 0, rows: 0, plants: 0 };
  const cabinCrop = (name) => `/cabin%20models/${name}`;
  const fieldStarts = [
    { id: 'C-wheat', zone: 'C', x: 94 / MAP_SCALE, z: 56 / MAP_SCALE, crops: [cabinCrop('crops_wheatStageA.glb'), cabinCrop('crops_wheatStageB.glb')], rowCount: 12, plantsPerRow: 12, rowLength: 10 },
    { id: 'C-roots', zone: 'C', x: 100.8 / MAP_SCALE, z: 56 / MAP_SCALE, crops: [cabinCrop('crop_carrot.glb'), cabinCrop('crop_turnip.glb')], rowCount: 12, plantsPerRow: 12, rowLength: 10 },
    { id: 'C-melons', zone: 'C', x: 94 / MAP_SCALE, z: 63.5 / MAP_SCALE, crops: [cabinCrop('crop_melon.glb'), cabinCrop('crop_pumpkin.glb')], rowCount: 12, plantsPerRow: 12, rowLength: 10 },
    { id: 'C-leaves', zone: 'C', x: 100.8 / MAP_SCALE, z: 63.5 / MAP_SCALE, crops: [cabinCrop('crops_leafsStageA.glb'), cabinCrop('crops_leafsStageB.glb')], rowCount: 12, plantsPerRow: 12, rowLength: 10 },
    { id: 'B-river-small', zone: 'B', x: 88 / MAP_SCALE - 3.25, z: 58 / MAP_SCALE, crops: [cabinCrop('crops_leafsStageA.glb'), cabinCrop('crops_leafsStageB.glb')], rowCount: 6, plantsPerRow: 8, rowLength: 6.5 },
  ].map((field) => ({ ...field, x: field.x * MAP_SCALE, z: field.z * MAP_SCALE, rowLength: field.rowLength * MAP_SCALE }));
  const rowPlacements = []; const rowEnds = []; const rowCorners = []; const soilSingles = [];
  const plantsByModel = new Map(); const perField = [];
  const random = randomFor(map.seed, 'crop-field-rows');
  for (const field of fieldStarts) {
    let plantCount = 0;
    const rowSpacing = (field.rowCount === 12 ? 0.64 : 0.68) * MAP_SCALE;
    for (let row = 0; row < field.rowCount; row += 1) {
      const z = field.z - ((field.rowCount - 1) * rowSpacing) / 2 + row * rowSpacing;
      const rowCenterX = field.x + field.rowLength * 0.5;
      const rowZone = map.zones.find((zone) => zone.id === field.zone);
      const rowFailure = validator.rejectLandscapeClearance(rowCenterX, z, field.rowLength * 0.5 + 0.5, rowZone);
      recordResult(report, field.zone, 'cropRows', !rowFailure);
      if (!rowFailure) {
        rowPlacements.push({ x: rowCenterX, y: z, height: terrainHeightAt(rowCenterX, z, map) + 0.018, rotation: 0, scale: [field.rowLength, 1, 1] });
        rowEnds.push({ x: field.x, y: z, height: terrainHeightAt(field.x, z, map) + 0.02, rotation: Math.PI / 2, scale: 0.72 }, { x: field.x + field.rowLength, y: z, height: terrainHeightAt(field.x + field.rowLength, z, map) + 0.02, rotation: -Math.PI / 2, scale: 0.72 });
        if (row % 3 === 0) soilSingles.push({ x: rowCenterX, y: z, height: terrainHeightAt(rowCenterX, z, map) + 0.018, rotation: 0, scale: 0.7 });
      }
      for (let crop = 0; crop < field.plantsPerRow; crop += 1) {
        const x = field.x + (field.rowLength - (field.plantsPerRow - 1) * 0.82 * MAP_SCALE) * 0.5 + crop * 0.82 * MAP_SCALE;
        const cropZone = map.zones.find((zone) => zone.id === field.zone);
        const cropModel = field.crops[(row + crop) % field.crops.length];
        const cropScale = (0.88 / Math.max(0.01, heights[cropModel])) * (0.94 + random() * 0.12);
        const footprintRadius = Math.max(0.18, (scaleInfo[cropModel]?.width || 0.55) * cropScale * 0.42);
        const cropFailure = validator.rejectLandscapeClearance(x, z, footprintRadius + 0.5, cropZone);
        recordResult(report, field.zone, 'crops', !cropFailure);
        if (cropFailure) continue;
        if (!plantsByModel.has(cropModel)) plantsByModel.set(cropModel, []);
        plantsByModel.get(cropModel).push({ x, y: z, height: terrainHeightAt(x, z, map) + 0.04, rotation: (random() - 0.5) * 0.16, scale: cropScale });
        plantCount += 1;
      }
    }
    perField.push({ id: field.id, zone: field.zone, rows: field.rowCount, plants: plantCount });
  }
  for (const field of fieldStarts.filter((item) => item.zone === 'C')) {
    const halfX = 5.7 * MAP_SCALE; const halfZ = 4.4 * MAP_SCALE;
    for (const [x, z, rotation] of [[field.x - halfX, field.z - halfZ, 0], [field.x + halfX, field.z - halfZ, Math.PI / 2], [field.x + halfX, field.z + halfZ, Math.PI], [field.x - halfX, field.z + halfZ, -Math.PI / 2]]) rowCorners.push({ x, y: z, height: terrainHeightAt(x, z, map) + 0.02, rotation, scale: 0.8 });
  }
  await Promise.all([
    addInstancedModel('crops_dirtRow.glb', rowPlacements, scene, { tintStrength: 0.1, tintColor: '#755b3d', receiveShadow: false }),
    addUntintedInstancedModel(cabinCrop('crops_dirtRowEnd.glb'), rowEnds, scene, { receiveShadow: false }),
    addUntintedInstancedModel(cabinCrop('crops_dirtRowCorner.glb'), rowCorners, scene, { receiveShadow: false }),
    addUntintedInstancedModel(cabinCrop('crops_dirtSingle.glb'), soilSingles, scene, { receiveShadow: false }),
    ...[...plantsByModel.entries()].map(([model, placements]) => addUntintedInstancedModel(model, placements, scene, { receiveShadow: false })),
  ]);
  const reportData = { fields: fieldStarts.length, rows: rowPlacements.length, plants: [...plantsByModel.values()].reduce((sum, rows) => sum + rows.length, 0), perField };
  console.info('[placement-report] crop fields', reportData);
  return reportData;
}

export async function createEnvironment(map, river, scene) {
  const validator = new PlacementValidator(map);
  const report = initializeReport(map);
  let objects = [];
  const clearings = getMilestone1CClearings();
  validator.milestone1CClearings = clearings;
  const scaleInfo = {};
  const modelNames = new Set([
    ...Object.values(ZONE_CONFIG).flatMap((config) => config.treeModels),
    ...Object.values(HIDER_MODELS),
    'rock_smallH.glb', 'rock_smallI.glb', 'stone_tallC.glb',
    'tree-log.glb', 'tree-log-small.glb', 'tree-trunk.glb',
    'crops_dirtRow.glb',
    ...['crops_wheatStageA.glb', 'crops_wheatStageB.glb', 'crops_leafsStageA.glb', 'crops_leafsStageB.glb', 'crop_carrot.glb', 'crop_turnip.glb', 'crop_melon.glb', 'crop_pumpkin.glb', 'crops_dirtRowEnd.glb', 'crops_dirtRowCorner.glb', 'crops_dirtSingle.glb'].map((name) => `/cabin%20models/${name}`),
  ]);
  const heights = Object.fromEntries(await Promise.all([...modelNames].map(async (model) => [model, await objectHeight(model)])));
  for (const model of modelNames) {
    const gltf = await loadModel(model);
    gltf.scene.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
    scaleInfo[model] = { size, width: Math.max(size.x, size.z) };
  }

  const canopyFadeState = { playerPosition: new THREE.Vector3(map.spawn.x, 0, map.spawn.y) };
  const treeGroupsByZone = {};
  for (const zone of map.zones) {
    const config = ZONE_CONFIG[zone.id];
    const random = randomFor(map.seed, `trees-${zone.id}`);
    const treeData = (rng, x, z, models) => {
      const broadleaf = models.find((name) => name.startsWith('tree_plateau'));
      const conifers = models.filter((name) => !name.startsWith('tree_plateau'));
      const model = zone.id === 'C' && broadleaf
        ? (rng() < 0.12 ? broadleaf : conifers[randomInt(rng, 0, conifers.length - 1)])
        : models[randomInt(rng, 0, models.length - 1)];
      const variation = 0.9 + rng() * 0.3;
      const normalization = 5 / heights[model];
      const footprintRadius = (zone.id === 'B' ? 0.34 : 0.31) * variation;
      return {
        x, z, model, scale: normalization * variation, variation,
        rotation: rng() * Math.PI * 2,
        footprintRadius,
        collisionRadius: (zone.id === 'B' ? 0.34 : 0.31) * variation,
        height: 0.05 * normalization * variation + 0.025,
        shadowWidth: Math.max(2.0, footprintRadius * 2.9),
        shadowDepth: Math.max(1.55, footprintRadius * 2.35),
      };
    };
    const zoneTrees = [];
    if (zone.id === 'A') {
      const ancient = { ...treeData(random, 18 * MAP_SCALE, 94 * MAP_SCALE, ['tree_pineTallC_detailed.glb']), landmark: 'ancient-pine' };
      const anchor = reservePlacement({ validator, report, zone, type: 'trees', ...ancient });
      if (anchor) zoneTrees.push(anchor);
    }
    const groves = generateGroups({
      validator, report, zone, type: 'trees', target: config.groveCount, models: config.treeModels, random,
      getObject: treeData, groupRange: zone.id === 'C' ? [3, 5] : [4, 9], spread: [0.8, 4.6],
      centerFactory: zone.id === 'C' ? (rng) => ({ x: rng() < 0.5 ? zone.minX + 4 * MAP_SCALE + rng() * 15 * MAP_SCALE : zone.maxX - 4 * MAP_SCALE - rng() * 15 * MAP_SCALE, z: map.bounds.minY + 5 * MAP_SCALE + rng() * (map.bounds.maxY - map.bounds.minY - 10 * MAP_SCALE) }) : null,
    });
    zoneTrees.push(...groves);
    const rows = placeTreeRows({ validator, report, map, zone, config, random, models: config.treeModels, treeData });
    zoneTrees.push(...rows.placed);
    while (zoneTrees.length < config.treeCount) {
      const fillerX = zone.id === 'C'
        ? (random() < 0.5 ? zone.minX + 4 * MAP_SCALE + random() * 15 * MAP_SCALE : zone.maxX - 4 * MAP_SCALE - random() * 15 * MAP_SCALE)
        : zone.minX + 3 * MAP_SCALE + random() * (zone.maxX - zone.minX - 6 * MAP_SCALE);
      const filler = treeData(random, fillerX, map.bounds.minY + 5 * MAP_SCALE + random() * (map.bounds.maxY - map.bounds.minY - 10 * MAP_SCALE), config.treeModels);
      const accepted = reservePlacement({ validator, report, zone, type: 'trees', ...filler });
      if (accepted) zoneTrees.push(accepted);
      else if ((report[zone.id].trees?.rejected || 0) > config.treeCount * 22) break;
    }
    treeGroupsByZone[zone.id] = { models: config.treeModels, tint: config.treeTint };
    objects.push(...zoneTrees);
  }

  // Thin the already validated tree set before placing solid decoys and props so
  // those objects do not reserve space behind trees that have been removed.
  const treeThinning = thinTrees(objects, map);
  objects = treeThinning.objects;
  validator.occupied = [...objects];
  for (const zone of map.zones) {
    const beforeCount = Object.values(treeThinning.report.before[zone.id]).reduce((sum, count) => sum + count, 0);
    const afterCount = Object.values(treeThinning.report.after[zone.id]).reduce((sum, count) => sum + count, 0);
    const removed = beforeCount - afterCount;
    if (removed) { report[zone.id].trees ||= { placed: 0, rejected: 0 }; report[zone.id].trees.placed -= removed; report[zone.id].trees.rejected += removed; }
  }

  const boulderAnchor = (random) => ({
    x: 138 * MAP_SCALE + Math.cos(random() * Math.PI * 2) * 5.4 * MAP_SCALE,
    z: 29 * MAP_SCALE + Math.sin(random() * Math.PI * 2) * 5.4 * MAP_SCALE,
  });
  const typeConfigs = [
    {
      type: 'hiderBoulders', model: HIDER_MODELS.hiderBoulders, targets: HIDER_COUNTS,
      baseScale: 2.5, footprintRadius: 0.86, collisionRadius: 0.8, shadowWidth: 2.9, shadowDepth: 2.35,
      anchor: (zone) => zone.id === 'B' ? boulderAnchor : null,
    },
    {
      type: 'hiderBushes', model: HIDER_MODELS.hiderBushes, targets: HIDER_COUNTS,
      baseScale: 0.8 / heights[HIDER_MODELS.hiderBushes], footprintRadius: 0.48, collisionRadius: 0,
      shadowWidth: 1.6, shadowDepth: 1.4,
    },
    {
      type: 'hiderStumps', model: HIDER_MODELS.hiderStumps, targets: HIDER_STUMP_COUNTS,
      baseScale: 0.55 / heights[HIDER_MODELS.hiderStumps], footprintRadius: 0.42, collisionRadius: 0,
      shadowWidth: 1.35, shadowDepth: 1.2,
    },
  ];
  const hiderObjects = [];
  for (const config of typeConfigs) {
    for (const zone of map.zones) {
      const random = randomFor(map.seed, `${config.type}-${zone.id}`);
      const target = config.targets[zone.id];
      const modelNamesForType = [config.model];
      const anchor = config.anchor?.(zone);
      const placed = generateGroups({
        validator, report, zone, type: config.type, target, models: modelNamesForType, random,
        anchor: anchor ? (rng) => anchor(rng) : null,
        getObject: (rng, x, z, models) => {
          const variation = HIDER_SCALE.min + rng() * (HIDER_SCALE.max - HIDER_SCALE.min);
          const scale = config.baseScale * variation;
          return {
            x, z, model: models[0], scale, variation, rotation: rng() * Math.PI * 2,
            footprintRadius: config.footprintRadius * variation,
            collisionRadius: config.collisionRadius * variation,
            height: config.type === 'hiderBoulders' ? 0.06 : 0.05 * scale + 0.02,
            shadowWidth: config.shadowWidth * variation,
            shadowDepth: config.shadowDepth * variation,
          };
        },
      });
      hiderObjects.push(...placed);
      objects.push(...placed);
    }
  }

  const rockModels = ['rock_smallH.glb', 'rock_smallI.glb', 'stone_tallC.glb'];
  for (const zone of map.zones) {
    const target = zone.id === 'A' ? 27 : zone.id === 'B' ? 33 : 12;
    const random = randomFor(map.seed, `rocks-${zone.id}`);
    const placed = generateGroups({
      validator, report, zone, type: 'rocks', target, models: rockModels, random, groupRange: [3, 6], spread: [1.0, 4.0],
      getObject: (rng, x, z, models) => {
        const model = models[randomInt(rng, 0, models.length - 1)];
        const variation = 0.9 + rng() * 0.3;
        const scale = model.startsWith('stone_tall') ? 0.9 * variation : 1.6 * variation;
        const footprintRadius = Math.max(0.4, scaleInfo[model].width * scale * 0.55);
        return {
          x, z, model, scale, variation, rotation: rng() * Math.PI * 2, footprintRadius,
          collisionRadius: Math.max(0.34, scaleInfo[model].width * scale * 0.4), height: 0.03,
          shadowWidth: footprintRadius * 2.7, shadowDepth: footprintRadius * 2.25,
        };
      },
    });
    objects.push(...placed);
  }

  const zoneB = map.zones.find((zone) => zone.id === 'B');
  const logRandom = randomFor(map.seed, 'logs-B');
  const logs = generateGroups({
    validator, report, zone: zoneB, type: 'logs', target: 18,
    models: ['tree-log-small.glb', 'tree-log.glb'], random: logRandom, groupRange: [3, 6], spread: [0.5, 2.6],
    anchor: () => ({ x: 110 * MAP_SCALE, z: 104 * MAP_SCALE }),
    getObject: (rng, x, z, models) => {
      const model = models[randomInt(rng, 0, models.length - 1)];
      const variation = 0.9 + rng() * 0.3;
      const scale = 1.1 * variation;
      return { x, z, model, scale, variation, rotation: rng() * Math.PI * 2, footprintRadius: 0.7 * variation, collisionRadius: 0, height: 0.02, shadowWidth: 1.7 * variation, shadowDepth: 1.15 * variation };
    },
  });
  objects.push(...logs);

  const trunks = generateGroups({
    validator, report, zone: zoneB, type: 'deadTrunks', target: 6, models: ['tree-trunk.glb'],
    random: randomFor(map.seed, 'dead-trunks-B'), groupRange: [3, 6], spread: [1.2, 3.8],
    anchor: () => ({ x: 126 * MAP_SCALE, z: 97 * MAP_SCALE }),
    getObject: (rng, x, z, models) => {
      const variation = 0.9 + rng() * 0.3;
      const heightScale = 2.5 / heights[models[0]] * variation;
      const widthScale = 2.8 * variation;
      return { x, z, model: models[0], scale: [widthScale, heightScale, widthScale], variation, rotation: rng() * Math.PI * 2, footprintRadius: 0.65 * variation, collisionRadius: 0.34 * variation, height: 0, shadowWidth: 1.7 * variation, shadowDepth: 1.4 * variation };
    },
  });
  objects.push(...trunks);

  // Clear only the under-tent/cabin/crop ground before the final validator pass.
  // Fixed landmark centers are kept clear during later prop validation and grass placement.
  let clearedFor1C = 0;
  const clearedFor1CByZoneAndType = initializeReport(map);
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    const object = objects[i];
    if (!clearings.some((area) => Math.hypot(object.x - area.x, object.z - area.z) < area.radius + object.footprintRadius)) continue;
    objects.splice(i, 1); clearedFor1C += 1;
    const row = report[object.zone][object.type];
    if (row) { row.placed -= 1; row.rejected += 1; }
    recordResult(clearedFor1CByZoneAndType, object.zone, object.type, false);
  }

  // Re-run the landscape validator on final generated models before instancing.
  const finalValidator = new PlacementValidator(map);
  let removedOnValidation = 0;
  const validatedObjects = [];
  for (const object of objects) {
    const failure = finalValidator.rejectReason(object.x, object.z, object.footprintRadius, map.zones.find((zone) => zone.id === object.zone));
    if (failure) {
      removedOnValidation += 1;
      const row = report[object.zone][object.type];
      row.placed -= 1;
      row.rejected += 1;
      continue;
    }
    finalValidator.reserve(object);
    validatedObjects.push(object);
  }
  objects.length = 0;
  objects.push(...validatedObjects);

  const reedBeds = createReedBeds(map, river, scene, validator, report);

  const renderEntries = new Map();
  for (const object of objects) {
    const renderKey = object.type === 'trees' ? `${object.model}::${object.zone}` : object.model;
    if (!renderEntries.has(renderKey)) renderEntries.set(renderKey, []);
    renderEntries.get(renderKey).push(object);
  }

  const hiderMeshGroups = [];
  await Promise.all([...renderEntries.entries()].map(async ([renderKey, placements]) => {
    const model = renderKey.split('::')[0];
    const isTree = placements[0].type === 'trees';
    const zoneTint = isTree ? treeGroupsByZone[placements[0].zone].tint : OBJECT_TINT[placements[0].type];
    const isWoodPile = ['logs', 'deadTrunks'].includes(placements[0].type);
    const instances = await addInstancedModel(model, placements.map((item) => ({
      x: item.x,
      y: item.z,
      height: terrainHeightAt(item.x, item.z, map) + item.height,
      rotation: item.rotation,
      scale: item.scale,
    })), scene, {
      tintStrength: isTree ? 0.72 : isWoodPile ? 0.9 : 0.64,
      tintColor: isWoodPile ? '#4f766d' : zoneTint,
      emissiveIntensity: isWoodPile ? 0.08 : 0.24,
      receiveShadow: false,
      fadeCanopyState: isTree ? canopyFadeState : null,
      materialTint: isTree && placements[0].zone !== 'A' && model.startsWith('tree_plateau')
        ? (materialName, objectName) => /trunk|bark|wood/i.test(`${materialName} ${objectName}`)
          ? '#725b40'
          : /leaf|canopy|foliage/i.test(`${materialName} ${objectName}`)
            ? (model.includes('_fall') ? '#a4864a' : model.includes('_dark') ? '#8d8045' : '#9a8748')
            : null
        : null,
    });
    for (const mesh of instances) {
      mesh.userData.environmentModel = model;
      mesh.userData.objectType = placements[0].type;
      if (placements[0].type.startsWith('hider')) hiderMeshGroups.push(mesh);
      if (placements[0].type === 'trees') mesh.userData.zone = placements[0].zone;
    }
  }));
  const groundPlants = createGroundPlants(map, scene, objects.filter((object) => ['trees', 'rocks', 'hiderBoulders'].includes(object.type)), validator, clearings);
  const cropFields = await createCropFields(map, scene, heights, scaleInfo, validator, report);
  makeSoftEllipseShadows(objects, scene, map);

  const milestone1C = await createMilestone1C(map, river, scene);

  const colliders = [...objects.filter((object) => object.collisionRadius > 0).map((object) => ({
    x: object.x, z: object.z, radius: object.collisionRadius, type: object.type,
  })), ...milestone1C.colliders];
  const rejected = Object.values(report).reduce((sum, zoneReport) => sum + Object.values(zoneReport).reduce((count, row) => count + row.rejected, 0), 0);
  const placed = objects.length + reedBeds.count;
  const treesByZone = Object.fromEntries(map.zones.map((zone) => [zone.id, report[zone.id].trees?.placed || 0]));
  const hiderCountsByZone = Object.fromEntries(map.zones.map((zone) => [zone.id, Object.fromEntries(['hiderStumps', 'hiderBoulders', 'hiderBushes'].map((type) => [type, report[zone.id][type]?.placed || 0]))]));
  treeThinning.report.afterValidation = Object.fromEntries(map.zones.map((zone) => [zone.id, objects.filter((item) => item.type === 'trees' && item.zone === zone.id).reduce((counts, item) => { counts[item.model] = (counts[item.model] || 0) + 1; return counts; }, {})]));
  const placementReport = { placed, rejected, removedOnValidation, clearedFor1C, clearedFor1CByZoneAndType, nudgedObjects: validator.nudgedPlacements || [], nudgedObjectCount: validator.nudgedPlacements?.length || 0, byZone: report, treesByZone, treeThinning: treeThinning.report, hiderCountsByZone, colliders: colliders.length, grassPlants: { tufts: groundPlants.count, ferns: groundPlants.fernCount, fallenLeaves: groundPlants.fallenLeafCount }, grassTufts: groundPlants.count, cropFields, milestone1C: milestone1C.report };
  console.info('[placement-report] environment', placementReport);
  if (import.meta.env.DEV) {
    window.__environmentPlacementReport = placementReport;
    window.__environmentObjectPositions = objects.map(({ type, model, zone, x, z, footprintRadius, scale, rotation }) => ({ type, model, zone, x, z, footprintRadius, scale, rotation }));
    window.__environmentColliders = colliders;
  }

  let highlighted = false;
  function toggleHiderHighlights() {
    if (!import.meta.env.DEV) return false;
    highlighted = !highlighted;
    for (const mesh of hiderMeshGroups) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material.emissive && !material.userData.hiderOriginalEmissive) {
          material.userData.hiderOriginalEmissive = material.emissive.getHexString();
          material.userData.hiderOriginalIntensity = material.emissiveIntensity;
        }
      }
      setHighlight(mesh.material, highlighted);
    }
    return highlighted;
  }

  function update(playerPosition, time = 0) {
    canopyFadeState.playerPosition.copy(playerPosition);
    updateDistanceCulledInstances(playerPosition);
    reedBeds.update(time);
    milestone1C.update(time);
  }

  return { colliders, update, toggleHiderHighlights, placementReport, reedCount: reedBeds.count, setQuality(level) { groundPlants.setQuality(level); milestone1C.setQuality(level); } };
}
