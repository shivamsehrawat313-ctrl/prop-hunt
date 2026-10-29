import * as THREE from 'three';
import { addInstancedModel } from './modelLoader.js';
import { palette } from './palette.js';

const mapPoint = ([x, y]) => new THREE.Vector3(x, 0, y);

function widthAt(keys, t) {
  for (let i = 1; i < keys.length; i += 1) {
    if (t <= keys[i][0]) {
      const [t0, w0] = keys[i - 1];
      const [t1, w1] = keys[i];
      const f = THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1);
      return THREE.MathUtils.lerp(w0, w1, f);
    }
  }
  return keys.at(-1)[1];
}

function createRibbon(samples, widths, y, expand = 1) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < samples.length; i += 1) {
    const before = samples[Math.max(0, i - 1)];
    const after = samples[Math.min(samples.length - 1, i + 1)];
    const tangent = new THREE.Vector3(after.x - before.x, 0, after.z - before.z).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const halfWidth = widths[i] * expand * 0.5;
    const left = samples[i].clone().addScaledVector(side, halfWidth);
    const right = samples[i].clone().addScaledVector(side, -halfWidth);
    left.y = y; right.y = y;
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(i / (samples.length - 1), 0, i / (samples.length - 1), 1);
    if (i < samples.length - 1) {
      const a = 2 * i; const b = a + 1; const c = a + 2; const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeScrollingNormalMap() {
  const size = 96;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const du = Math.cos(u * 4 + Math.sin(v * 2)) * 0.34 + Math.cos(u * 9 - v * 3) * 0.13;
      const dv = Math.sin(v * 5 + Math.cos(u * 2)) * 0.26 + Math.cos(v * 11 + u * 2) * 0.1;
      const nx = -du; const ny = -dv; const nz = 1;
      const length = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = Math.round((nx / length * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz / length * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function distanceToSegment(x, z, a, b) {
  const dx = b.x - a.x; const dz = b.y - a.y;
  const lengthSq = dx * dx + dz * dz || 1;
  const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.y) * dz) / lengthSq, 0, 1);
  return Math.hypot(x - (a.x + t * dx), z - (a.y + t * dz));
}

function closeToPath(x, z, map) {
  const nodes = new Map(map.paths.nodes.map((node) => [node.id, node]));
  for (const [from, to] of map.paths.edges) {
    const route = map.paths.edgeRoutes?.[`${from}|${to}`] || map.paths.edgeRoutes?.[`${to}|${from}`];
    const points = route ? route.map(([px, pz]) => ({ x: px, y: pz })) : [nodes.get(from), nodes.get(to)];
    for (let i = 1; i < points.length; i += 1) {
      if (distanceToSegment(x, z, points[i - 1], points[i]) < map.paths.width * 0.5 + map.paths.clearance + 0.6) return true;
    }
  }
  return false;
}

function createWaterPlants(samples, widths, curve, map, scene) {
  const stemGeometry = new THREE.CylinderGeometry(0.035, 0.055, 1, 5, 1);
  const headGeometry = new THREE.CapsuleGeometry(0.055, 0.16, 3, 5);
  const stemMaterial = new THREE.MeshStandardMaterial({ color: '#315d50', roughness: 1 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: '#486960', roughness: 1 });
  const reeds = [];
  for (let i = 22; i < samples.length - 22; i += 12) {
    const crossingNear = map.river.crossings.some((crossing) => Math.hypot(crossing.x - samples[i].x, crossing.y - samples[i].z) < 7);
    if (crossingNear) continue;
    const before = samples[Math.max(0, i - 1)]; const after = samples[Math.min(samples.length - 1, i + 1)];
    const tx = after.x - before.x; const tz = after.z - before.z;
    const length = Math.hypot(tx, tz) || 1;
    const sx = -tz / length; const sz = tx / length;
    const side = i % 2 ? 1 : -1;
    const half = widths[i] * 0.5 + 0.85;
    const x = samples[i].x + sx * half * side;
    const z = samples[i].z + sz * half * side;
    if (x < 2 || x > 238 || z < 2 || z > 118 || closeToPath(x, z, map)) continue;
    reeds.push({ x, z, height: 0.58 + ((i * 17) % 31) / 100, phase: i * 0.73, yaw: (i % 8) * 0.6 });
  }
  const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, Math.max(1, reeds.length));
  const heads = new THREE.InstancedMesh(headGeometry, headMaterial, Math.max(1, reeds.length));
  stems.count = reeds.length;
  heads.count = reeds.length;
  stems.frustumCulled = false; heads.frustumCulled = false;
  scene.add(stems, heads);

  const padShape = new THREE.Shape();
  const radius = 0.42;
  padShape.moveTo(0, 0);
  padShape.lineTo(radius * Math.cos(-0.36), radius * Math.sin(-0.36));
  for (let angle = -0.36; angle <= Math.PI * 2 - 0.36; angle += Math.PI / 12) {
    padShape.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
  }
  padShape.closePath();
  const padGeometry = new THREE.ShapeGeometry(padShape, 10);
  padGeometry.rotateX(-Math.PI / 2);
  const padMaterial = new THREE.MeshStandardMaterial({ color: '#367e69', roughness: 0.86, side: THREE.DoubleSide });
  const pads = new THREE.InstancedMesh(padGeometry, padMaterial, 12);
  pads.frustumCulled = false;
  scene.add(pads);

  const leafShape = new THREE.Shape();
  leafShape.moveTo(-0.26, 0); leafShape.quadraticCurveTo(0, 0.17, 0.29, 0); leafShape.quadraticCurveTo(0, -0.16, -0.26, 0);
  const leafGeometry = new THREE.ShapeGeometry(leafShape, 8);
  leafGeometry.rotateX(-Math.PI / 2);
  const leaves = new THREE.InstancedMesh(leafGeometry, new THREE.MeshStandardMaterial({ color: '#6c9a6b', roughness: 0.9, side: THREE.DoubleSide }), 12);
  leaves.frustumCulled = false;
  scene.add(leaves);

  const dummy = new THREE.Object3D();
  const initialPadT = [];
  const initialPadSide = [];
  for (let i = 0; i < 12; i += 1) {
    let t = 0.08 + i * 0.074;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const point = curve.getPointAt(t);
      if (!map.river.crossings.some((crossing) => Math.hypot(crossing.x - point.x, crossing.y - point.z) < 7)) break;
      t = (t + 0.025) % 0.94;
    }
    initialPadT.push(t);
    initialPadSide.push(i % 2 ? 1 : -1);
  }
  const leafT = Array.from({ length: 12 }, (_, i) => (i / 12 + 0.035) % 1);

  function setPlantMatrices(time) {
    reeds.forEach((reed, i) => {
      const sway = Math.sin(time * 1.1 + reed.phase) * 0.11;
      dummy.position.set(reed.x, reed.height * 0.5, reed.z);
      dummy.rotation.set(0, reed.yaw, sway);
      dummy.scale.set(1, reed.height, 1);
      dummy.updateMatrix(); stems.setMatrixAt(i, dummy.matrix);
      dummy.position.set(reed.x + Math.sin(sway) * 0.08, reed.height * 0.94, reed.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
    });
    stems.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < 12; i += 1) {
      const t = initialPadT[i];
      const point = curve.getPointAt(t);
      const before = curve.getPointAt(Math.max(0, t - 0.002));
      const after = curve.getPointAt(Math.min(1, t + 0.002));
      const side = initialPadSide[i];
      const nx = -(after.z - before.z); const nz = after.x - before.x;
      const nlen = Math.hypot(nx, nz) || 1;
      const depth = widths[Math.min(widths.length - 1, Math.floor(t * (widths.length - 1)))];
      const offset = side * (depth * 0.18 + 0.08);
      const x = point.x + (nx / nlen) * offset;
      const z = point.z + (nz / nlen) * offset;
      dummy.position.set(x, 0.092 + Math.sin(time + i) * 0.016, z);
      dummy.rotation.set(0, time * 0.08 + i * 0.51, 0);
      dummy.scale.setScalar(0.72 + Math.sin(time * 0.7 + i) * 0.035);
      dummy.updateMatrix(); pads.setMatrixAt(i, dummy.matrix);

      const leafPoint = curve.getPointAt((leafT[i] + time * 0.004) % 1);
      const leafBefore = curve.getPointAt(Math.max(0, leafT[i] - 0.002));
      const leafAfter = curve.getPointAt(Math.min(1, leafT[i] + 0.002));
      dummy.position.set(leafPoint.x, 0.105 + Math.sin(time * 0.8 + i) * 0.01, leafPoint.z);
      dummy.rotation.set(0, Math.atan2(-(leafAfter.z - leafBefore.z), leafAfter.x - leafBefore.x) + Math.sin(time + i) * 0.18, 0);
      dummy.scale.setScalar(0.8);
      dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
    }
    pads.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
  }

  setPlantMatrices(0);
  return { update: setPlantMatrices, reeds: reeds.length, pads: 12, leaves: 12 };
}

export function createRiver(map, scene) {
  const controlPoints = map.river.centerline.map(mapPoint);
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'centripetal');
  const count = 480;
  const baseSamples = curve.getPoints(count);
  const baseWidths = baseSamples.map((_, i) => widthAt(map.river.widthKeys, i / count));
  const extensionSteps = 48;
  const extensionLength = 42;
  const startDirection = baseSamples[0].clone().sub(baseSamples[1]).normalize();
  const endDirection = baseSamples.at(-1).clone().sub(baseSamples.at(-2)).normalize();
  const samples = [];
  const widths = [];
  for (let i = extensionSteps; i >= 1; i -= 1) {
    samples.push(baseSamples[0].clone().addScaledVector(startDirection, extensionLength * i / extensionSteps));
    widths.push(baseWidths[0]);
  }
  samples.push(...baseSamples);
  widths.push(...baseWidths);
  for (let i = 1; i <= extensionSteps; i += 1) {
    samples.push(baseSamples.at(-1).clone().addScaledVector(endDirection, extensionLength * i / extensionSteps));
    widths.push(baseWidths.at(-1));
  }

  const bank = new THREE.Mesh(
    createRibbon(samples, widths, 0.025, map.river.bankScale ?? 1.72),
    new THREE.MeshStandardMaterial({ color: palette.riverBank, roughness: 0.96, metalness: 0 }),
  );
  bank.receiveShadow = true;
  bank.name = 'dark-teal-riverbanks';
  scene.add(bank);

  const normalMap = makeScrollingNormalMap();
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNormalMap: { value: normalMap } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uNormalMap;
      varying vec2 vUv;
      void main() {
        vec2 flowUv = vec2(vUv.x * 18.0 - uTime * 0.055, vUv.y * 2.7 + uTime * 0.008);
        vec3 flowNormal = texture2D(uNormalMap, flowUv).xyz * 2.0 - 1.0;
        float flowWave = sin(vUv.x * 67.0 - uTime * 1.1 + cos(vUv.y * 8.0)) * 0.5 + 0.5;
        float highlight = pow(max(0.0, dot(normalize(flowNormal), normalize(vec3(-0.22, 0.72, 0.65)))), 7.0);
        float side = abs(vUv.y - 0.5) * 2.0;
        float shoreFoam = smoothstep(0.78, 0.97, side) * (0.22 + 0.38 * flowWave);
        float movingGlint = pow(max(0.0, sin(vUv.x * 43.0 - uTime * 1.3 + vUv.y * 4.0)), 20.0);
        vec3 edge = vec3(0.018, 0.23, 0.27);
        vec3 center = vec3(0.10, 0.66, 0.66);
        vec3 color = mix(edge, center, (1.0 - smoothstep(0.08, 0.92, side)) * 0.85 + flowWave * 0.12);
        color += vec3(0.20, 0.54, 0.51) * highlight * 0.35;
        color += vec3(0.29, 0.71, 0.65) * movingGlint * 0.42;
        color = mix(color, vec3(0.45, 0.82, 0.75), shoreFoam);
        gl_FragColor = vec4(color, 0.98);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
  });
  const water = new THREE.Mesh(createRibbon(samples, widths, 0.065), waterMaterial);
  water.name = 'flowing-cyan-river';
  scene.add(water);

  const glowMaterial = new THREE.MeshBasicMaterial({ color: palette.riverGlow, transparent: true, opacity: 0.17, side: THREE.DoubleSide, depthTest: true, depthWrite: false });
  const glow = new THREE.Mesh(createRibbon(samples, widths, 0.076, 0.42), glowMaterial);
  glow.name = 'river-center-light-spill';
  scene.add(glow);

  const waterPlants = createWaterPlants(samples, widths, curve, map, scene);
  const foamRings = [];
  const rockPlacements = [];
  for (let i = 24; i < samples.length - 24; i += 38) {
    const crossingNear = map.river.crossings.some((crossing) => Math.hypot(crossing.x - samples[i].x, crossing.y - samples[i].z) < 7);
    if (crossingNear) continue;
    const before = samples[Math.max(0, i - 1)]; const after = samples[Math.min(samples.length - 1, i + 1)];
    const tx = after.x - before.x; const tz = after.z - before.z; const length = Math.hypot(tx, tz) || 1;
    const side = i % 2 ? 1 : -1;
    const outerBank = widths[i] * (map.river.bankScale ?? 1.72) * 0.5;
    const rockOffset = outerBank + 0.5;
    const rockX = samples[i].x + (-tz / length) * rockOffset * side;
    const rockZ = samples[i].z + (tx / length) * rockOffset * side;
    const foamOffset = widths[i] * 0.43;
    const foamX = samples[i].x + (-tz / length) * foamOffset * side;
    const foamZ = samples[i].z + (tx / length) * foamOffset * side;
    const x = rockX;
    const z = rockZ;
    if (x < 2 || x > 238 || z < 2 || z > 118 || closeToPath(x, z, map)) continue;
    rockPlacements.push({ x, y: z, height: 0.025, rotation: i * 0.7, scale: 0.62 + (i % 4) * 0.08 });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.32, 18),
      new THREE.MeshBasicMaterial({ color: '#8bf7e8', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthTest: true, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(foamX, 0.073, foamZ);
    ring.userData.phase = i * 0.63;
    scene.add(ring);
    foamRings.push(ring);
  }
  const ready = rockPlacements.length ? addInstancedModel('rock_smallI.glb', rockPlacements, scene, { tintStrength: 0.58 }) : Promise.resolve([]);

  const centerline = samples.map((point) => ({ x: point.x, z: point.z }));
  function waterWidthAt(x, z) {
    let nearest = Infinity;
    let nearestWidth = widths[0];
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = samples[i]; const b = samples[i + 1];
      const dx = b.x - a.x; const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz || 1;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1);
      const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
      if (distance < nearest) {
        nearest = distance;
        nearestWidth = THREE.MathUtils.lerp(widths[i], widths[i + 1], t);
      }
    }
    return nearestWidth;
  }
  function bankWidthAt(x, z) {
    return waterWidthAt(x, z) * (map.river.bankScale ?? 1.72);
  }
  function bankClearanceAt(x, z) {
    let nearest = Infinity;
    let outerHalfWidth = 0;
    for (let i = 0; i < samples.length - 1; i += 1) {
      const a = samples[i]; const b = samples[i + 1];
      const dx = b.x - a.x; const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz || 1;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSq, 0, 1);
      const distance = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
      if (distance < nearest) {
        nearest = distance;
        outerHalfWidth = THREE.MathUtils.lerp(widths[i], widths[i + 1], t) * (map.river.bankScale ?? 1.72) * 0.5;
      }
    }
    return Math.max(0, nearest - outerHalfWidth);
  }
  return {
    ready,
    crossings: map.river.crossings,
    centerline,
    waterWidthAt,
    bankWidthAt,
    bankClearanceAt,
    tangentAt(x, z) {
      let nearest = 0; let best = Infinity;
      for (let i = 0; i < centerline.length; i += 1) {
        const distance = Math.hypot(centerline[i].x - x, centerline[i].z - z);
        if (distance < best) { best = distance; nearest = i; }
      }
      const before = centerline[Math.max(0, nearest - 2)]; const after = centerline[Math.min(centerline.length - 1, nearest + 2)];
      return { x: after.x - before.x, z: after.z - before.z };
    },
    update(time) {
      waterMaterial.uniforms.uTime.value = time;
      normalMap.offset.x = (time * 0.055) % 1;
      glowMaterial.opacity = 0.14 + Math.sin(time * 1.1) * 0.035;
      waterPlants.update(time);
      foamRings.forEach((ring) => { ring.material.opacity = 0.15 + (Math.sin(time * 1.6 + ring.userData.phase) + 1) * 0.08; });
    },
  };
}
