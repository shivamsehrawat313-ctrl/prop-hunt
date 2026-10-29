import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gradeModelMaterial } from './palette.js';
import { AUDIO_MODEL_PROGRESS_EXPECTED_COUNT } from '../../shared/constants.js';

const gltfLoader = new GLTFLoader();
const modelCache = new Map();
const distanceCulledMeshes = new Set();
const INSTANCE_VIEW_DISTANCE = 48;
const INSTANCE_VIEW_DISTANCE_SQ = INSTANCE_VIEW_DISTANCE * INSTANCE_VIEW_DISTANCE;
let modelProgressHandler = null;
const modelProgress = new Map();

function reportModelProgress(fileName) {
  if (!modelProgressHandler) return;
  const completed = [...modelProgress.values()].filter((value) => value >= 1).length;
  const weighted = [...modelProgress.values()].reduce((sum, value) => sum + value, 0);
  const percent = Math.min(96, 4 + Math.round((weighted / AUDIO_MODEL_PROGRESS_EXPECTED_COUNT) * 92));
  modelProgressHandler({ completed, expected: AUDIO_MODEL_PROGRESS_EXPECTED_COUNT, percent, fileName });
}

export function setModelLoadProgressHandler(handler) {
  modelProgressHandler = handler;
  if (handler) reportModelProgress('Preparing models');
}

function trackForDistanceCulling(instances, matrices) {
  instances.userData.distanceCullMatrices = matrices;
  instances.userData.distanceCullLastX = Number.NaN;
  instances.userData.distanceCullLastZ = Number.NaN;
  distanceCulledMeshes.add(instances);
}

export function updateDistanceCulledInstances(playerPosition) {
  for (const instances of distanceCulledMeshes) {
    const dx = playerPosition.x - instances.userData.distanceCullLastX;
    const dz = playerPosition.z - instances.userData.distanceCullLastZ;
    if (dx * dx + dz * dz < 4) continue;
    instances.userData.distanceCullLastX = playerPosition.x;
    instances.userData.distanceCullLastZ = playerPosition.z;
    const visible = instances.userData.distanceCullMatrices
      .map((matrix) => {
        const x = matrix.elements[12];
        const z = matrix.elements[14];
        const ox = x - playerPosition.x;
        const oz = z - playerPosition.z;
        return { matrix, distanceSq: ox * ox + oz * oz };
      })
      .filter((item) => item.distanceSq <= INSTANCE_VIEW_DISTANCE_SQ)
      .sort((a, b) => a.distanceSq - b.distanceSq);
    for (let index = 0; index < visible.length; index += 1) instances.setMatrixAt(index, visible[index].matrix);
    instances.count = visible.length;
    instances.instanceMatrix.needsUpdate = true;
  }
}

export async function loadModel(fileName) {
  if (!modelCache.has(fileName)) {
    const url = fileName.startsWith('/') ? fileName : `/models/${fileName}`;
    modelProgress.set(fileName, 0); reportModelProgress(fileName);
    const request = gltfLoader.loadAsync(url, (event) => {
      if (event.lengthComputable && event.total > 0) { modelProgress.set(fileName, Math.min(0.95, event.loaded / event.total)); reportModelProgress(fileName); }
    }).then((gltf) => { modelProgress.set(fileName, 1); reportModelProgress(fileName); return gltf; })
      .catch((error) => { modelProgress.set(fileName, 1); reportModelProgress(fileName); throw error; });
    modelCache.set(fileName, request);
  }
  return modelCache.get(fileName);
}

function cloneGradedMaterial(material, tintStrength = 0.35, tintColor = null, emissiveIntensity = 0.24, overrideColor = null) {
  if (Array.isArray(material)) return material.map((item) => cloneGradedMaterial(item, tintStrength, tintColor, emissiveIntensity, overrideColor));
  const clone = material.clone();
  if (overrideColor && clone.color) {
    clone.color.set(overrideColor);
    clone.roughness = Math.max(clone.roughness ?? 0.8, 0.94);
    clone.needsUpdate = true;
    return clone;
  }
  if (tintColor && clone.color) {
    const tint = new THREE.Color(tintColor);
    clone.color.lerp(tint, tintStrength);
    if (clone.emissive) {
      clone.emissive.lerp(tint, 0.28);
      clone.emissiveIntensity = emissiveIntensity;
    }
    clone.roughness = Math.max(clone.roughness ?? 0.8, 0.94);
    clone.needsUpdate = true;
    return clone;
  }
  return gradeModelMaterial(clone, tintStrength);
}

function configureCanopyFade(material, fadeState) {
  if (!fadeState || !/(leaf|canopy|foliage)/i.test(material.name || '')) return;
  const previousCompile = material.onBeforeCompile;
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = true;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.call(material, shader, renderer);
    shader.uniforms.uCanopyFadePlayer = { value: fadeState.playerPosition };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uCanopyFadePlayer;\nvarying float vCanopyPlayerDistance;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec3 canopyWorldPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\nvCanopyPlayerDistance = distance(canopyWorldPosition, uCanopyFadePlayer);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCanopyPlayerDistance;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= mix(0.3, 1.0, smoothstep(1.0, 6.0, vCanopyPlayerDistance));');
  };
  material.customProgramCacheKey = () => `${material.name}-canopy-player-fade-v1`;
}

export async function addInstancedModel(fileName, placements, scene, { tintStrength = 0.35, tintColor = null, emissiveIntensity = 0.24, castShadow = false, receiveShadow = true, fadeCanopyState = null, materialTint = null } = {}) {
  if (placements.length === 0) return [];
  const gltf = await loadModel(fileName);
  gltf.scene.updateMatrixWorld(true);
  const sources = [];
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const override = materialTint?.(object.material?.name || '', object.name || '');
    const material = cloneGradedMaterial(object.material, tintStrength, tintColor, emissiveIntensity, override);
    for (const item of Array.isArray(material) ? material : [material]) configureCanopyFade(item, fadeCanopyState);
    sources.push({ geometry: object.geometry, material, world: object.matrixWorld.clone() });
  });
  const groups = [];
  for (const source of sources) {
    const instances = new THREE.InstancedMesh(source.geometry, source.material, placements.length);
    const cullMatrices = [];
    instances.castShadow = castShadow;
    instances.receiveShadow = receiveShadow;
    const base = new THREE.Matrix4();
    const localScale = new THREE.Vector3();
    const localRotation = new THREE.Quaternion();
    const localPosition = new THREE.Vector3();
    source.world.decompose(localPosition, localRotation, localScale);
    for (let i = 0; i < placements.length; i += 1) {
      const item = placements[i];
      const scale = typeof item.scale === 'number' ? new THREE.Vector3(item.scale, item.scale, item.scale) : new THREE.Vector3(...(item.scale || [1, 1, 1]));
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, item.rotation || 0, 0));
      const position = new THREE.Vector3(item.x, item.height ?? 0.08, item.y);
      base.compose(position, rotation, scale).multiply(source.world);
      instances.setMatrixAt(i, base);
      cullMatrices.push(base.clone());
    }
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
    scene.add(instances);
    trackForDistanceCulling(instances, cullMatrices);
    groups.push(instances);
  }
  return groups;
}

// Keeps the supplied material color, texture, and roughness unchanged.
export async function addUntintedInstancedModel(fileName, placements, scene, { castShadow = false, receiveShadow = true } = {}) {
  if (placements.length === 0) return [];
  const gltf = await loadModel(fileName);
  gltf.scene.updateMatrixWorld(true);
  const groups = [];
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const materials = sourceMaterials.map((material) => material.clone());
    const instances = new THREE.InstancedMesh(object.geometry, Array.isArray(object.material) ? materials : materials[0], placements.length);
    const cullMatrices = [];
    instances.castShadow = castShadow;
    instances.receiveShadow = receiveShadow;
    const sourceWorld = object.matrixWorld.clone();
    const base = new THREE.Matrix4();
    for (let i = 0; i < placements.length; i += 1) {
      const item = placements[i];
      const scale = typeof item.scale === 'number' ? new THREE.Vector3(item.scale, item.scale, item.scale) : new THREE.Vector3(...(item.scale || [1, 1, 1]));
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, item.rotation || 0, 0));
      const position = new THREE.Vector3(item.x, item.height ?? 0.08, item.y);
      base.compose(position, rotation, scale).multiply(sourceWorld);
      instances.setMatrixAt(i, base);
      cullMatrices.push(base.clone());
    }
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
    scene.add(instances);
    trackForDistanceCulling(instances, cullMatrices);
    groups.push(instances);
  });
  return groups;
}

export async function addPlayerModel(fileName, scene) {
  const gltf = await loadModel(fileName);
  const player = gltf.scene.clone(true);
  player.traverse((object) => {
    if (object.isMesh) {
      object.material = cloneGradedMaterial(object.material, 0.62);
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  player.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(player);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = 1 / Math.max(0.001, size.y);
  player.scale.setScalar(scale);
  player.position.y = 0.04 - bounds.min.y * scale;
  player.userData.worldHeight = size.y * scale;
  scene.add(player);
  return player;
}
