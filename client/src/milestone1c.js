import * as THREE from 'three';
import { addInstancedModel, addUntintedInstancedModel, loadModel } from './modelLoader.js';
import { terrainHeightAt } from './terrain.js';
import { getPathPolylines } from './paths.js';
import { distanceToRiverBank, isInWater } from '../../shared/water.js';

const CAMPS = [
  { id: 'A-hidden-1', zone: 'A', x: 14, z: 20, tents: 2 },
  { id: 'A-hidden-2', zone: 'A', x: 71, z: 105, tents: 1 },
  { id: 'A-hidden-3', zone: 'A', x: 15, z: 108, tents: 2 },
  { id: 'B-hidden-1', zone: 'B', x: 101, z: 103, tents: 2 },
  { id: 'B-hidden-2', zone: 'B', x: 147, z: 21, tents: 1 },
  { id: 'C-clearing', zone: 'C', x: 224, z: 15, tents: 3 },
];
const BOATS = [
  { zone: 'A', x: 55, z: 102, yaw: 0.45 }, { zone: 'A', x: 61, z: 113, yaw: -0.55 },
  { zone: 'B', x: 90, z: 16, yaw: -0.4 }, { zone: 'B', x: 111, z: 39, yaw: 0.6 },
  { zone: 'B', x: 127, z: 91, yaw: -0.5 }, { zone: 'B', x: 143, z: 93, yaw: 0.75 },
  { zone: 'C', x: 170, z: 79, yaw: -0.65 }, { zone: 'C', x: 179, z: 44, yaw: 0.35 },
];
const VILLAGE = { x: 207, z: 92 };
const VILLAGE_BUILDINGS = [
  { id: 'main-house', file: 'building-sample-house-c.glb', preview: 'building-sample-house-c.png', x: 207, z: 92, yaw: 0 },
  { id: 'west-house', file: 'building-sample-house-a.glb', preview: 'building-sample-house-a.png', x: 198, z: 92, yaw: 0.08 },
  { id: 'east-house', file: 'building-sample-house-b.glb', preview: 'building-sample-house-b.png', x: 216, z: 92, yaw: -0.08 },
];
const VILLAGE_WIDTH = 7;
const YARD = { x: 207, z: 92, width: 28, depth: 18 };
const CABIN_MODEL_DIR = '/cabin%20models/';
const cabinModelPath = (file) => `${CABIN_MODEL_DIR}${file}`;
const CROPS = [
  { id: 'C-wheat', x: 170, z: 96, count: 144 }, { id: 'C-corn', x: 184, z: 96, count: 144 },
  { id: 'C-leaves', x: 170, z: 108, count: 144 }, { id: 'C-bamboo', x: 184, z: 108, count: 144 },
  { id: 'B-river-small', x: 141, z: 98, count: 48 },
];

export function getMilestone1CClearings() {
  return [
    ...CAMPS.map(({ x, z, id }) => ({ x, z, radius: id === 'C-clearing' ? 8.8 : 6.3 })),
    { x: VILLAGE.x, z: VILLAGE.z, radius: 16 },
    ...CROPS.map((field) => ({ x: field.x, z: field.z, radius: field.id.startsWith('B-') ? 6 : 7.5 })),
  ];
}

async function placeVillageBuildings(scene, map) {
  const placed = [];
  for (const item of VILLAGE_BUILDINGS) {
    const gltf = await loadModel(cabinModelPath(item.file));
    const model = gltf.scene.clone(true);
    model.updateMatrixWorld(true);
    const sourceBounds = new THREE.Box3().setFromObject(model);
    const size = sourceBounds.getSize(new THREE.Vector3());
    const scale = VILLAGE_WIDTH / Math.max(size.x, size.z);
    const center = sourceBounds.getCenter(new THREE.Vector3());
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -sourceBounds.min.y * scale, -center.z * scale);
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });
    const group = new THREE.Group();
    group.name = `zone-c-village-${item.id}`;
    group.position.set(item.x, terrainHeightAt(item.x, item.z, map), item.z);
    group.rotation.y = item.yaw;
    group.add(model);
    scene.add(group);
    placed.push({ ...item, group, sourceSize: size.toArray(), scale, collisionRadius: Math.hypot(size.x * scale * 0.5, size.z * scale * 0.5) });
  }
  return placed;
}

async function addNormalizedCabinInstances(file, placements, scene, targetWidth, options = {}) {
  const model = await loadModel(cabinModelPath(file));
  model.scene.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model.scene).getSize(new THREE.Vector3());
  const scale = targetWidth / Math.max(size.x, size.z);
  const groups = await addUntintedInstancedModel(cabinModelPath(file), placements.map((item) => ({ ...item, scale: (item.scale ?? 1) * scale })), scene, options);
  return { groups, scale, sourceSize: size.toArray() };
}

async function cabinYard(scene, map) {
  const buildings = await placeVillageBuildings(scene, map);
  const y = terrainHeightAt(YARD.x, YARD.z, map) + 0.025;
  const shadowMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color('#112f2a') }, opacity: { value: 0.32 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec2 vUv; void main(){ float d=length((vUv-0.5)*2.0); float a=(1.0-smoothstep(0.45,1.0,d))*opacity; gl_FragColor=vec4(color,a); }' });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(YARD.x, y, YARD.z); shadow.scale.set(12, 5.5, 1); scene.add(shadow);
  return { buildings, shadow, colliders: [...buildings.map((building) => ({ x: building.x, z: building.z, radius: building.collisionRadius, type: 'building', model: building.file })), { x: YARD.x, z: YARD.z, radius: 0.55, type: 'yard-props' }] };
}

function seedRandom(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
}

function makeCampDirt(scene, map, camps) {
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { color: { value: new THREE.Color('#555642') }, opacity: { value: 0.26 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec2 vUv; void main(){ float d=length((vUv-0.5)*2.0); float n=sin(vUv.x*24.0+sin(vUv.y*18.0))*0.025; float a=(1.0-smoothstep(0.48,0.98,d+n))*opacity; gl_FragColor=vec4(color,a); }' });
  for (const camp of camps) {
    const disk = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    disk.name = `trampled-dirt-${camp.id}`; disk.rotation.x = -Math.PI / 2;
    disk.position.set(camp.x, terrainHeightAt(camp.x, camp.z, map) + 0.018, camp.z);
    disk.scale.set(camp.id === 'C-clearing' ? 8 : 5.5, camp.id === 'C-clearing' ? 6.2 : 4.8, 1); scene.add(disk);
  }
}

function makeCabinConnector(scene, map) {
  const routes = [
    [[198, 88.5], [198, 86.4], [200, 84.4], [204.3, 83]],
    [[207, 88.5], [207, 86.1], [207, 83], [207, 82]],
    [[216, 88.5], [216, 86.4], [214, 84.4], [209.7, 83]],
  ];
  const material = new THREE.MeshStandardMaterial({ color: '#947858', roughness: 1, side: THREE.DoubleSide, depthTest: true, depthWrite: true });
  routes.forEach((route, routeIndex) => {
    const points = route.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const vertices = []; const indices = []; const samples = 18; const halfWidth = routeIndex === 1 ? 1.0 : 0.85;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples; const p = curve.getPoint(t); const tangent = curve.getTangent(t).normalize();
      const nx = -tangent.z; const nz = tangent.x;
      for (const side of [-1, 1]) {
        const x = p.x + nx * halfWidth * side; const z = p.z + nz * halfWidth * side;
        vertices.push(x, terrainHeightAt(x, z, map) + 0.032, z);
      }
      if (i < samples) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const path = new THREE.Mesh(geometry, material); path.name = `packed-dirt-village-connector-${routeIndex + 1}`; path.receiveShadow = true; scene.add(path);
  });
}

function addHollowLogLandmark(scene, map) {
  const group = new THREE.Group(); group.name = 'zone-b-hollow-log-landmark';
  const x = 116; const z = 102; const groundY = terrainHeightAt(x, z, map);
  const bark = new THREE.MeshStandardMaterial({ color: '#665241', roughness: 1, flatShading: true });
  const inner = new THREE.MeshStandardMaterial({ color: '#1e302e', roughness: 1, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.68, 3.0, 7, 1), bark);
  trunk.rotation.x = Math.PI / 2; trunk.position.y = 0.64; trunk.castShadow = true; trunk.receiveShadow = true; group.add(trunk);
  const end = new THREE.Mesh(new THREE.CircleGeometry(0.46, 12), inner);
  end.rotation.y = Math.PI; end.position.set(0, 0.64, -1.49); group.add(end);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.12, 5, 12), bark);
  rim.rotation.y = Math.PI; rim.position.set(0, 0.64, -1.51); rim.castShadow = true; group.add(rim);
  group.position.set(x, groundY, z); scene.add(group);
  return { x, z, radius: 1.25, type: 'hollow-log' };
}

async function buildCamps(scene, map, lights) {
  const random = seedRandom(map.seed ^ 0x1c1c1c);
  const tentsByColor = { red: [], yellow: [] }; const fires = []; const props = []; const tentCounts = {};
  for (const camp of CAMPS) {
    const rng = seedRandom((map.seed + camp.x * 31 + camp.z * 17) >>> 0);
    tentCounts[camp.id] = camp.tents;
    for (let i = 0; i < camp.tents; i += 1) {
      const angle = i / camp.tents * Math.PI * 2;
      const radiusX = camp.id === 'C-clearing' ? 5.5 : 4.2;
      const radiusZ = camp.id === 'C-clearing' ? 4.8 : 4.0;
      const tent = { x: camp.x + Math.cos(angle) * radiusX, y: camp.z + Math.sin(angle) * radiusZ, height: terrainHeightAt(camp.x + Math.cos(angle) * radiusX, camp.z + Math.sin(angle) * radiusZ, map), rotation: angle + Math.PI, scale: 3 * (camp.id === 'C-clearing' ? 0.85 : 0.72 + rng() * 0.13) };
      tentsByColor[(i + CAMPS.indexOf(camp)) % 2 === 0 ? 'red' : 'yellow'].push(tent);
    }
    fires.push({ x: camp.x, y: camp.z, height: terrainHeightAt(camp.x, camp.z, map) + 0.05, rotation: random() * Math.PI * 2, scale: camp.id === 'C-clearing' ? 0.9 : 0.78 });
    for (let i = 0; i < 3; i += 1) props.push({ x: camp.x + (random() - 0.5) * 5.6, y: camp.z + (random() - 0.5) * 5.0, height: terrainHeightAt(camp.x, camp.z, map), rotation: random() * Math.PI * 2, scale: 0.5 + random() * 0.3 });
  }
  makeCampDirt(scene, map, CAMPS);
  const builtCampModels = await Promise.all([
    addInstancedModel('tent_detailedClosed.glb', tentsByColor.red, scene, { tintStrength: 0.95, tintColor: '#b64438', emissiveIntensity: 0.04, castShadow: true }),
    addInstancedModel('tent_detailedClosed.glb', tentsByColor.yellow, scene, { tintStrength: 0.95, tintColor: '#dfba45', emissiveIntensity: 0.04, castShadow: true }),
    addInstancedModel('campfire_stones.glb', fires, scene, { tintStrength: 0.7, tintColor: '#756453', castShadow: false }),
    addInstancedModel('log.glb', props, scene, { tintStrength: 0.7, tintColor: '#596d60' }),
    addInstancedModel('bucket.glb', props.filter((_, i) => i % 3 === 0).map((p) => ({ ...p, x: p.x + 0.8, y: p.y - 0.35 })), scene, { tintStrength: 0.5, tintColor: '#62766b' }),
  ]);
  // The supplied tent albedo is dark; warm emissive fills preserve the requested red/yellow canvas colors at night.
  for (const [groupIndex, glow] of [[0, '#872f28'], [1, '#a77c24']]) for (const instance of builtCampModels[groupIndex]) {
    const materials = Array.isArray(instance.material) ? instance.material : [instance.material];
    for (const material of materials) {
      if (!material?.emissive) continue;
      material.emissive.set(glow);
      material.emissiveIntensity = 0.28;
      material.needsUpdate = true;
    }
  }
  // One low-cost dynamic firelight; other camps use animated emissive sprites.
  const light = new THREE.PointLight('#f29a4d', 2.6, 11, 2);
  light.position.set(CAMPS[5].x, terrainHeightAt(CAMPS[5].x, CAMPS[5].z, map) + 1.1, CAMPS[5].z); scene.add(light); lights.push(light);
  const flame = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshBasicMaterial({ color: '#ffc56f', transparent: true, opacity: 0.92, depthWrite: false }), fires.length);
  const dummy = new THREE.Object3D();
  fires.forEach((f, i) => { dummy.position.set(f.x, f.height + 0.32, f.y); dummy.scale.set(0.9, 1.0, 0.9); dummy.updateMatrix(); flame.setMatrixAt(i, dummy.matrix); });
  flame.name = 'campfire-emissive-glow-sprites'; scene.add(flame);
  const sparkCount = fires.length * 5;
  const sparks = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.045, 0), new THREE.MeshBasicMaterial({ color: '#ffd27b', transparent: true, opacity: 0.86, depthWrite: false }), sparkCount);
  const smoke = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 5, 4), new THREE.MeshBasicMaterial({ color: '#607d78', transparent: true, opacity: 0.17, depthWrite: false }), fires.length * 4);
  sparks.name = 'instanced-campfire-sparks'; smoke.name = 'instanced-campfire-thin-smoke'; scene.add(sparks, smoke);
  const update = (time) => {
    fires.forEach((f, i) => {
      for (let j = 0; j < 5; j += 1) {
        const phase = (time * (0.45 + j * 0.025) + i * 0.31 + j * 0.2) % 1;
        const angle = i * 1.7 + j * 2.4 + time * 0.2;
        dummy.position.set(f.x + Math.cos(angle) * (0.15 + phase * 0.32), f.height + 0.4 + phase * 1.2, f.y + Math.sin(angle) * (0.15 + phase * 0.32));
        dummy.scale.setScalar((1 - phase) * 0.78); dummy.updateMatrix(); sparks.setMatrixAt(i * 5 + j, dummy.matrix);
      }
      for (let j = 0; j < 4; j += 1) {
        const phase = (time * 0.1 + i * 0.21 + j * 0.25) % 1;
        dummy.position.set(f.x + Math.sin(time * 0.28 + i + j) * 0.24, f.height + 0.55 + phase * 1.6, f.y + Math.cos(time * 0.24 + i + j) * 0.24);
        dummy.scale.setScalar(0.2 + phase * 0.75); dummy.updateMatrix(); smoke.setMatrixAt(i * 4 + j, dummy.matrix);
      }
    });
    sparks.instanceMatrix.needsUpdate = true; smoke.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return {
    camps: CAMPS, tentCounts, flame, light, update,
    colliders: [...tentsByColor.red, ...tentsByColor.yellow].map((tent) => ({ x: tent.x, z: tent.y, radius: 4.05, type: 'tent' })).concat(fires.map((fire) => ({ x: fire.x, z: fire.y, radius: 0.42, type: 'campfire' }))),
  };
}

function makeBats(scene, map) {
  const bats = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#172b32', roughness: 1, flatShading: true });
  for (let i = 0; i < 4; i += 1) {
    const bat = new THREE.Group();
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), bodyMat); body.scale.set(0.65, 1.2, 1); bat.add(body);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.16, 3), bodyMat);
      wing.rotation.z = side * Math.PI / 2; wing.rotation.y = side * 0.18; wing.position.x = side * 0.2; wing.scale.y = 0.4; bat.add(wing);
    }
    bat.userData.phase = i * 1.6; scene.add(bat); bats.push(bat);
  }
  const update = (time) => bats.forEach((bat, i) => {
    const center = i < 2 ? { x: 121, z: 75 } : { x: 224, z: 99 };
    const phase = time * 0.22 + bat.userData.phase;
    bat.position.set(center.x + Math.cos(phase) * (i < 2 ? 8 : 5), 3.2 + Math.sin(time * 2.4 + i) * 0.28, center.z + Math.sin(phase) * (i < 2 ? 7 : 4));
    bat.rotation.y = -phase; bat.children.slice(1).forEach((wing, j) => { wing.rotation.x = Math.sin(time * 8 + i + j) * 0.55; });
  });
  return { bats, update };
}

function createGroundMist(scene, map) {
  const geometry = new THREE.PlaneGeometry(1, 1); geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; void main(){ vec2 p=(vUv-0.5)*2.0; float a=exp(-dot(p,p)*3.4)*0.105; gl_FragColor=vec4(0.28,0.67,0.67,a); }',
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 28); mesh.name = 'zone-a-soft-ground-mist'; mesh.frustumCulled = false;
  const random = seedRandom(map.seed ^ 0xb17); const dummy = new THREE.Object3D();
  for (let i = 0; i < 28; i += 1) {
    const x = 5 + random() * 69; const z = 5 + random() * 110;
    dummy.position.set(x, terrainHeightAt(x, z, map) + 0.32 + random() * 0.3, z);
    dummy.rotation.y = random() * Math.PI; dummy.scale.set(6 + random() * 7, 3 + random() * 3, 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  scene.add(mesh);
  return { setQuality(level) { mesh.count = level === 'high' ? 28 : level === 'medium' ? 17 : 9; } };
}

function createFireflies(scene, map) {
  const capacity = 150;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 5, 4), new THREE.MeshBasicMaterial({ color: '#d7ef68', transparent: true, opacity: 0.92, depthWrite: false }), capacity);
  mesh.name = 'instanced-fireflies'; mesh.frustumCulled = false; scene.add(mesh);
  const random = seedRandom(map.seed ^ 0x5aa5); const flies = [];
  for (let i = 0; i < capacity; i += 1) {
    const nearRiver = i < 70; const nearYard = i >= 70 && i < 95; const nearCrop = i >= 95 && i < 120;
    const point = nearRiver ? map.river.centerline[Math.floor(random() * map.river.centerline.length)] : null;
    const cropX = i % 2 ? 185 : 201; const cropZ = i % 3 ? 96 : 108;
    flies.push({ x: nearRiver ? point[0] + (random() - 0.5) * 12 : nearYard ? 219 + random() * 12 : nearCrop ? cropX + (random() - 0.5) * 13 : 8 + random() * 145, z: nearRiver ? point[1] + (random() - 0.5) * 12 : nearYard ? 90 + random() * 18 : nearCrop ? cropZ + (random() - 0.5) * 9 : 5 + random() * 110, y: 0.6 + random() * 2.5, phase: random() * 10, speed: 0.18 + random() * 0.3 });
  }
  const dummy = new THREE.Object3D();
  const update = (time, quality) => {
    const qualityRatio = quality === 'high' ? 1 : quality === 'medium' ? 0.66 : 0.34;
    const count = Math.floor(capacity * qualityRatio); mesh.count = count;
    for (let i = 0; i < count; i += 1) {
      const fly = flies[i]; const t = time * fly.speed + fly.phase;
      dummy.position.set(fly.x + Math.sin(t) * 0.65, fly.y + Math.sin(t * 1.3) * 0.55, fly.z + Math.cos(t * 0.8) * 0.65);
      const pulse = 0.7 + (Math.sin(t * 2) + 1) * 0.25; dummy.scale.setScalar(pulse); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(0, 'high'); return { mesh, update, count: capacity };
}

async function createGlowFlowers(scene, map) {
  const random = seedRandom(map.seed ^ 0x612);
  const models = ['flower_purpleB.glb', 'flower_purpleC.glb', 'flower_redA.glb', 'flower_redB.glb', 'flower_redC.glb', 'flower_yellowA.glb', 'flower_yellowB.glb'];
  const clusters = [
    ...[[194, 86], [220, 86], [194, 98], [220, 98], [200, 100], [214, 100], [191, 94], [191, 107], [170, 115], [184, 115], [230, 28], [233, 66]].map(([x, z]) => ({ zone: 'C', x, z, count: 11 })),
    { zone: 'A', x: 43, z: 32, count: 7 }, { zone: 'A', x: 68, z: 86, count: 7 },
    { zone: 'B', x: 121, z: 24, count: 7 }, { zone: 'B', x: 150, z: 73, count: 7 },
  ];
  const placementsByModel = new Map(models.map((model) => [model, []]));
  const counts = { A: 0, B: 0, C: 0 };
  let index = 0;
  for (const cluster of clusters) for (let i = 0; i < cluster.count; i += 1) {
    const x = cluster.x + (random() - 0.5) * 3.6; const z = cluster.z + (random() - 0.5) * 3.2;
    if (x < 3 || x > 237 || z < 3 || z > 117 || isInWater(x, z, map)) continue;
    const model = models[index % models.length]; index += 1;
    placementsByModel.get(model).push({ x, y: z, height: terrainHeightAt(x, z, map) + 0.012, rotation: random() * Math.PI * 2, scale: 2.0 + random() * 0.5 });
    counts[cluster.zone] += 1;
  }
  await Promise.all([...placementsByModel.entries()].map(([model, placements]) => addUntintedInstancedModel(cabinModelPath(model), placements, scene, { castShadow: false, receiveShadow: false })));
  return { byZone: counts, models: models.length, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}

async function buildCabinYardProps(scene, map) {
  const y = (x, z) => terrainHeightAt(x, z, map);
  const placements = {
    fence: [], gate: [], stone: [], logs: [], stumps: [], buckets: [], boxes: [], benches: [], drying: [],
    fieldFence: [], cart: [],
  };
  const fenceColliders = [];
  const fenceAdd = (array, x, z, yaw = 0, scale = 1.4) => array.push({ x, y: z, height: y(x, z), rotation: yaw, scale });
  const fenceWest = YARD.x - YARD.width / 2; const fenceEast = YARD.x + YARD.width / 2;
  const fenceSouth = YARD.z - YARD.depth / 2; const fenceNorth = YARD.z + YARD.depth / 2;
  // A 28 x 18 ring with a wide south gate facing the main path.
  for (let x = fenceWest; x <= fenceEast; x += 1.5) {
    if (x < 204 || x > 210) { fenceAdd(placements.fence, x, fenceSouth, 0, 1.4); fenceColliders.push({ x, z: fenceSouth, radius: 0.28, type: 'fence' }); }
    fenceAdd(placements.fence, x, fenceNorth, 0, 1.4);
  }
  for (let x = fenceWest; x <= fenceEast; x += 1.5) fenceColliders.push({ x, z: fenceNorth, radius: 0.28, type: 'fence' });
  for (let z = fenceSouth + 1.5; z <= fenceNorth - 1.5; z += 1.5) { fenceAdd(placements.fence, fenceWest, z, Math.PI / 2, 1.4); fenceAdd(placements.fence, fenceEast, z, Math.PI / 2, 1.4); fenceColliders.push({ x: fenceWest, z, radius: 0.28, type: 'fence' }, { x: fenceEast, z, radius: 0.28, type: 'fence' }); }
  fenceAdd(placements.gate, 203.6, fenceSouth, 0, 1.2); fenceAdd(placements.gate, 210.4, fenceSouth, 0, 1.2);
  // Low stone edge around the yard, using muted border stones.
  for (let x = fenceWest; x <= fenceEast; x += 1.5) { if (x < 204 || x > 210) placements.stone.push({ x, y: fenceSouth, height: y(x, fenceSouth), rotation: 0, scale: 0.43 }); placements.stone.push({ x, y: fenceNorth, height: y(x, fenceNorth), rotation: 0, scale: 0.43 }); }
  for (let z = fenceSouth; z <= fenceNorth; z += 1.5) { placements.stone.push({ x: fenceWest, y: z, height: y(fenceWest, z), rotation: 0, scale: 0.43 }); placements.stone.push({ x: fenceEast, y: z, height: y(fenceEast, z), rotation: 0, scale: 0.43 }); }
  for (const [x, z, yaw] of [[203, 99, 0.25], [205, 99.5, -0.2], [207, 99, 1.4]]) placements.logs.push({ x, y: z, height: y(x, z), rotation: yaw, scale: 0.8 });
  for (const [x, z] of [[212, 87], [213.2, 87.2], [214.2, 88]]) placements.stumps.push({ x, y: z, height: y(x, z), rotation: 0.3, scale: 0.95 });
  placements.buckets.push({ x: 204, y: 99, height: y(204, 99), rotation: 0.3, scale: 0.8 });
  placements.boxes.push({ x: 211.5, y: 95, height: y(211.5, 95), rotation: 0.4, scale: 0.8 }, { x: 212.1, y: 95.6, height: y(212.1, 95.6) + 0.5, rotation: 0.4, scale: 0.7 });
  placements.benches.push({ x: 205, y: 98, height: y(205, 98), rotation: Math.PI, scale: 0.85 });
  placements.drying.push({ x: 212, y: 98, height: y(212, 98), rotation: -0.4, scale: 0.8 });
  placements.boxes.push({ x: 194.0, y: 102.5, height: y(194.0, 102.5), rotation: 0.25, scale: 0.8 }, { x: 194.7, y: 103.2, height: y(194.7, 103.2) + 0.5, rotation: 0.25, scale: 0.72 });
  placements.cart.push({ x: 197.0, y: 105.0, height: y(197.0, 105.0) + 0.025, rotation: 0.3, scale: 1 }, { x: 218.0, y: 98.5, height: y(218.0, 98.5) + 0.025, rotation: -0.45, scale: 1 });
  for (const field of CROPS) {
    const halfX = field.id.startsWith('B-') ? 4.2 : 5.7; const halfZ = field.id.startsWith('B-') ? 3.7 : 4.4;
    for (let x = field.x - halfX; x <= field.x + halfX; x += 1.35) { fenceAdd(placements.fieldFence, x, field.z - halfZ, 0, 0.95); fenceAdd(placements.fieldFence, x, field.z + halfZ, 0, 0.95); }
    for (let z = field.z - halfZ + 1.35; z < field.z + halfZ; z += 1.35) { fenceAdd(placements.fieldFence, field.x - halfX, z, Math.PI / 2, 0.95); fenceAdd(placements.fieldFence, field.x + halfX, z, Math.PI / 2, 0.95); }
  }
  const entries = [
    [cabinModelPath('fence_simple.glb'), placements.fence, '#647b70'], [cabinModelPath('fence_gate.glb'), placements.gate, '#687e70'],
    ['stone_smallFlatA.glb', placements.stone, '#77877c'], ['log_stack.glb', placements.logs, '#627767'],
    ['stump_square.glb', placements.stumps, '#5c7469'], ['bucket.glb', placements.buckets, '#78806b'],
    ['box.glb', placements.boxes, '#6f6753'], ['workbench.glb', placements.benches, '#61796f'],
    [cabinModelPath('fence_simpleLow.glb'), placements.fieldFence, '#60786d'],
  ];
  // The models folder has no drying-rack asset; a simple muted wood rack is the allowed primitive fallback.
  const rack = new THREE.Group(); rack.name = 'cabin-yard-drying-rack'; rack.position.set(212, y(212, 98), 98);
  const wood = new THREE.MeshStandardMaterial({ color: '#75654b', roughness: 1 });
  for (const [x, yy, z, w, h, d] of [[0, 0.7, 0, 2.2, 0.08, 0.08], [-0.9, 0.35, 0, 0.08, 0.7, 0.08], [0.9, 0.35, 0, 0.08, 0.7, 0.08], [0, 1.0, 0, 1.8, 0.06, 0.06]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood); m.position.set(x, yy, z); m.castShadow = true; rack.add(m); }
  scene.add(rack);
  await Promise.all([
    ...entries.map(([model, rows, tint]) => addInstancedModel(model, rows, scene, { tintStrength: 0.65, tintColor: tint, castShadow: true, receiveShadow: true })),
    addNormalizedCabinInstances('cart-high.glb', placements.cart.slice(0, 1), scene, 3.0, { castShadow: true }),
    addNormalizedCabinInstances('cart.glb', placements.cart.slice(1), scene, 2.6, { castShadow: true }),
  ]);
  return { yard: YARD, cropBorderSegments: placements.fieldFence.length, yardFenceSegments: placements.fence.length + placements.gate.length, carts: placements.cart.length, colliders: [...fenceColliders, ...placements.gate.map((gate) => ({ x: gate.x, z: gate.y, radius: 0.32, type: 'gate-post' })), { x: 203, z: 99, radius: 0.55, type: 'woodpile' }, { x: 213, z: 87.5, radius: 0.48, type: 'yard-stumps' }, { x: 211.5, z: 95, radius: 0.48, type: 'crates' }, { x: 205, z: 98, radius: 0.6, type: 'bench' }, ...placements.cart.map((cart) => ({ x: cart.x, z: cart.y, radius: 1.8, type: 'cart' }))] };
}

async function buildBoats(scene, map, paths, bridges) {
  const accepted = [];
  const polylines = getPathPolylines(map);
  const pathDistance = (x, z) => {
    let nearest = Infinity;
    for (const line of polylines) for (let i = 1; i < line.length; i += 1) {
      const a = line[i - 1]; const b = line[i]; const dx = b.x - a.x; const dz = b.y - a.y;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      nearest = Math.min(nearest, Math.hypot(x - a.x - dx * t, z - a.y - dz * t));
    }
    return nearest;
  };
  for (const boat of BOATS) {
    if (isInWater(boat.x, boat.z, map)) continue;
    const bankDistance = distanceToRiverBank(boat.x, boat.z, map);
    if (bankDistance < 3.2) continue;
    if (pathDistance(boat.x, boat.z) < 5.2) continue;
    if (bridges.some((bridge) => Math.hypot(boat.x - bridge.x, boat.z - bridge.y) < 8)) continue;
    accepted.push({ x: boat.x, y: boat.z, height: terrainHeightAt(boat.x, boat.z, map) + 0.035, rotation: boat.yaw, scale: 3 });
  }
  await addInstancedModel('canoe.glb', accepted, scene, { tintStrength: 0.9, tintColor: '#c79d68', emissiveIntensity: 0.3, castShadow: true, receiveShadow: true });
  const paddle = accepted.map((boat, i) => ({ ...boat, x: boat.x + 1.0, y: boat.y, height: boat.height + 0.12, rotation: boat.rotation + (i % 2 ? 0.9 : -0.9), scale: 2.2 }));
  await addInstancedModel('canoe_paddle.glb', paddle, scene, { tintStrength: 0.7, tintColor: '#cfaa76', emissiveIntensity: 0.3 });
  return { placed: accepted.length, scale: 3, placements: accepted.map((p, i) => ({ x: p.x, z: p.y, colliderRadius: 1.8, type: 'boat' })), byZone: Object.fromEntries(map.zones.map((zone) => [zone.id, BOATS.filter((boat) => boat.zone === zone.id).filter((boat) => accepted.some((p) => p.x === boat.x && p.y === boat.z)).length])) };
}

export async function createMilestone1C(map, river, scene, { quality = 'high' } = {}) {
  const lights = [];
  const yard = await cabinYard(scene, map);
  const yardProps = await buildCabinYardProps(scene, map);
  makeCabinConnector(scene, map);
  const hollowLogCollider = addHollowLogLandmark(scene, map);
  const camps = await buildCamps(scene, map, lights);
  const flowers = await createGlowFlowers(scene, map);
  const flies = createFireflies(scene, map);
  const mist = createGroundMist(scene, map);
  const bats = makeBats(scene, map);
  const boats = await buildBoats(scene, map, river, map.river.crossings);
  let time = 0;
  function update(nextTime, nextQuality = quality) {
    time = nextTime; quality = nextQuality;
    flies.update(time, quality); bats.update(time);
    const flicker = 0.82 + Math.sin(time * 8.7) * 0.1 + Math.sin(time * 15.2) * 0.05;
    camps.light.intensity = 2.6 * flicker;
    camps.update(time);
  }
  update(0, quality);
  return {
    update, setQuality(next) { quality = next; flies.update(time, quality); mist.setQuality(next); },
    colliders: [...yard.colliders, ...yardProps.colliders, ...camps.colliders, ...boats.placements, hollowLogCollider],
    clearingCenters: getMilestone1CClearings(),
    report: { buildings: yard.buildings.map(({ id, file, preview, x, z, scale, sourceSize, collisionRadius }) => ({ id, file, preview, zone: 'C', x, z, width: VILLAGE_WIDTH, scale, sourceSize, collisionRadius })), yard: { width: YARD.width, depth: YARD.depth, fenceSegments: yardProps.yardFenceSegments, cropBorderSegments: yardProps.cropBorderSegments, carts: yardProps.carts, shortPaths: 3, gatePathNode: '(207,82)' }, hollowLog: { zone: 'B', x: 116, z: 102, collisionRadius: hollowLogCollider.radius }, camps: { total: CAMPS.length, byZone: Object.fromEntries(map.zones.map((zone) => [zone.id, { camps: CAMPS.filter((camp) => camp.zone === zone.id).length, tents: CAMPS.filter((camp) => camp.zone === zone.id).reduce((sum, camp) => sum + camp.tents, 0) }])), hidden: CAMPS.filter((c) => c.zone !== 'C').length, tentCounts: camps.tentCounts, tentModels: 'tent_detailedClosed.glb', campfireModel: 'campfire_stones.glb' }, boats, flowers, fireflies: { high: 150, medium: 99, low: 51 }, bats: bats.bats.length },
  };
}
