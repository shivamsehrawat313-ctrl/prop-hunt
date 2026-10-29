import * as THREE from 'three';
import map from '../../shared/map.js';
import { palette } from './palette.js';
import { createTerrain } from './terrain.js';
import { createRiver } from './river.js';
import { createPaths } from './paths.js';
import { createEnvironment } from './environment.js';
import { createLighting, makeSoftShadow } from './lighting.js';
import { PlayerControls } from './controls.js';
import { WaterEffects } from './waterEffects.js';
import { MiniMap } from './minimap.js';
import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  CAMERA_ZOOM,
  CATCH_SCREEN_SHAKE_MS,
  DISGUISE_TINT_STRENGTH,
  HIDER_DISGUISE_SPEED_FACTOR,
  PLAYER_HEIGHT_UNITS,
  REMOTE_INTERPOLATION_FACTOR,
  SERVER_POSITION_SNAP_THRESHOLD,
} from '../../shared/constants.js';
import './style.css';
import { MultiplayerClient } from './multiplayer.js';
import { loadModel } from './modelLoader.js';
import { WORLD_COLLIDERS } from '../../shared/world.js';

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const toast = document.querySelector('#toast');
const zoneLabel = document.querySelector('#zone-label');
const fpsReadout = document.querySelector('#fps');
const drawCallsReadout = document.querySelector('#draw-calls');
const qualityLabel = document.querySelector('#quality-label');
const worldScaleReadout = document.querySelector('#world-scale');
document.querySelector('#lobby-video').addEventListener('error', () => document.body.classList.add('lobby-video-failed'));
if (import.meta.env.PROD) document.querySelector('.debug-panel').hidden = true;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA_FIELD_OF_VIEW_DEGREES, 1, 0.1, 400);
camera.zoom = CAMERA_ZOOM;
camera.updateProjectionMatrix();
const miniMap = new MiniMap(document.querySelector('#minimap'), map);
createLighting(scene, map);
scene.add(createTerrain(map));
const river = createRiver(map, scene);
const playerShadow = makeSoftShadow(scene);
const waterEffects = new WaterEffects(scene);
const player = new THREE.Group();
player.name = 'local-player';
const playerRim = new THREE.PointLight(new THREE.Color('#80f5de'), 0.65, 5.5, 2);
playerRim.position.set(0, 1.2, 0);
player.add(playerRim);
scene.add(player);

let controls;
let audioContext;
let multiplayer;
const playerViews = new Map();
const disguiseModels = { stump: 'stump_squareDetailed.glb', boulder: 'rock_smallTopB.glb', bush: 'plant_bushDetailed.glb' };
const disguiseTints = { stump: '#648177', boulder: '#718b89', bush: '#64836f' };
let quality = 'high';
let environment;
let frameCount = 0;
let fpsAt = performance.now();
let toastTimer;
const clock = new THREE.Clock();

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

async function setPlayerView(snapshot, local = false) {
  if (!snapshot?.id) return;
  let view = playerViews.get(snapshot.id);
  if (!view) {
    const group = new THREE.Group(); group.name = `player-${snapshot.id}`;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: snapshot.role === 'hunter' ? '#b6ead6' : '#91cdbb', roughness: 0.9, flatShading: true });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 3, 6), bodyMaterial); body.position.y = 0.31; group.add(body);
    const hood = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), bodyMaterial); hood.position.y = 0.65; group.add(hood);
    scene.add(group); view = { group, target: new THREE.Vector3(snapshot.x, 0, snapshot.z), modelType: null, loading: false };
    playerViews.set(snapshot.id, view);
  }
  view.target.set(snapshot.x, 0, snapshot.z);
  view.group.rotation.y = snapshot.locked ? (snapshot.disguiseRotation || 0) : Math.atan2(-snapshot.aim?.x || 0, -snapshot.aim?.z || 1);
  const desiredModel = snapshot.locked && snapshot.disguise ? snapshot.disguise : null;
  view.group.visible = !snapshot.caught;
  if (desiredModel && desiredModel !== view.modelType && !view.loading) {
    view.loading = true;
    try {
      const gltf = await loadModel(disguiseModels[desiredModel]);
      const clone = gltf.scene.clone(true);
      clone.traverse((object) => {
        if (!object.isMesh) return;
        const tint = new THREE.Color(disguiseTints[desiredModel]);
        const grade = (material) => { const copy = material.clone(); if (copy.color) copy.color.lerp(tint, DISGUISE_TINT_STRENGTH); return copy; };
        object.material = Array.isArray(object.material) ? object.material.map(grade) : grade(object.material);
        object.castShadow = false; object.receiveShadow = false;
      });
      for (const child of [...view.group.children]) if (child.userData.disguiseVisual) view.group.remove(child);
      clone.userData.disguiseVisual = true; clone.scale.setScalar(snapshot.disguiseScale || 1); view.group.add(clone); view.modelType = desiredModel;
    } catch (error) { console.warn('Could not load disguise model', error); }
    finally { view.loading = false; }
  } else if (!desiredModel && view.modelType) {
    for (const child of [...view.group.children]) if (child.userData.disguiseVisual) view.group.remove(child);
    view.modelType = null;
  }
  if (local && controls) {
    const error = Math.hypot(snapshot.x - controls.position.x, snapshot.z - controls.position.z);
    if (error > SERVER_POSITION_SNAP_THRESHOLD) { controls.position.x = snapshot.x; controls.position.z = snapshot.z; }
    player.visible = !(snapshot.locked && snapshot.disguise);
    view.group.visible = Boolean(snapshot.locked && snapshot.disguise) && !snapshot.caught;
    view.group.position.set(snapshot.x, terrainHeightAt(snapshot.x, snapshot.z, map), snapshot.z);
  }
}

function applyRoomState(room, me) {
  if (controls && me) {
    controls.speedFactor = room.phase === 'hide' && me.role === 'hunter' ? 0 : me.role === 'hider' && me.disguise ? HIDER_DISGUISE_SPEED_FACTOR : 1;
    for (const other of room.players) setPlayerView(other, other.id === me.id);
  }
  if (import.meta.env.DEV) window.__multiplayerState = room;
}

function handleGameEvent(type, event) {
  if (type === 'strike') {
    if (event.hit) { document.querySelector('#game-shell').classList.add('game-shake'); setTimeout(() => document.querySelector('#game-shell').classList.remove('game-shake'), CATCH_SCREEN_SHAKE_MS); showToast('Hider caught'); }
    else showToast('Wasted strike');
  }
}

multiplayer = new MultiplayerClient({
  onState: applyRoomState,
  onEvent: handleGameEvent,
  unlockAudio: () => unlockAudio(),
});

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.zoom = CAMERA_ZOOM;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function createHunterFigure() {
  const colors = {
    cloak: new THREE.MeshStandardMaterial({ color: '#294b53', roughness: 0.94, flatShading: true }),
    hood: new THREE.MeshStandardMaterial({ color: '#1b383f', roughness: 1, flatShading: true }),
    trousers: new THREE.MeshStandardMaterial({ color: '#203a40', roughness: 1, flatShading: true }),
    boots: new THREE.MeshStandardMaterial({ color: '#34463e', roughness: 1, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: '#a8eedc', emissive: '#397e75', emissiveIntensity: 0.28, roughness: 0.7, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: '#bbd2c4', roughness: 0.88, flatShading: true }),
    face: new THREE.MeshStandardMaterial({ color: '#172a2a', roughness: 1, flatShading: true }),
  };
  const add = (geometry, material, x, y, z, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    player.add(mesh);
    return mesh;
  };

  // Low-poly hood, face, and cloak silhouette scaled to one world unit.
  add(new THREE.CylinderGeometry(0.12, 0.19, 0.39, 6, 1), colors.cloak, 0, 0.48, 0);
  add(new THREE.BoxGeometry(0.31, 0.045, 0.22), colors.trousers, 0, 0.31, 0);
  add(new THREE.CylinderGeometry(0.067, 0.075, 0.25, 5, 1), colors.trousers, -0.082, 0.18, 0);
  add(new THREE.CylinderGeometry(0.067, 0.075, 0.25, 5, 1), colors.trousers, 0.082, 0.18, 0);
  add(new THREE.BoxGeometry(0.13, 0.105, 0.21), colors.boots, -0.082, 0.072, -0.025);
  add(new THREE.BoxGeometry(0.13, 0.105, 0.21), colors.boots, 0.082, 0.072, -0.025);
  add(new THREE.CylinderGeometry(0.05, 0.065, 0.31, 5, 1), colors.cloak, -0.205, 0.47, 0, [0, 0, -0.13]);
  add(new THREE.CylinderGeometry(0.05, 0.065, 0.31, 5, 1), colors.cloak, 0.205, 0.47, 0, [0, 0, 0.13]);
  add(new THREE.DodecahedronGeometry(0.128, 0), colors.hood, 0, 0.78, 0.005);
  add(new THREE.ConeGeometry(0.12, 0.18, 6, 1), colors.hood, 0, 0.88, 0.025);
  add(new THREE.SphereGeometry(0.071, 6, 5), colors.skin, 0, 0.78, -0.086);
  add(new THREE.SphereGeometry(0.012, 5, 4), colors.face, -0.025, 0.795, -0.148);
  add(new THREE.SphereGeometry(0.012, 5, 4), colors.face, 0.025, 0.795, -0.148);
  const scarf = add(new THREE.TorusGeometry(0.105, 0.022, 4, 8), colors.accent, 0, 0.655, 0, [Math.PI / 2, 0, 0]);
  scarf.scale.set(1, 0.78, 1);
  add(new THREE.OctahedronGeometry(0.043, 0), colors.accent, 0.065, 0.49, -0.115);
  player.scale.setScalar(PLAYER_HEIGHT_UNITS / 0.95);
  player.userData.worldHeight = PLAYER_HEIGHT_UNITS;
}

async function prepareScene() {
  try {
    createHunterFigure();
    const [, pathStats, environmentState] = await Promise.all([
      river.ready,
      createPaths(map, river, scene),
      createEnvironment(map, river, scene),
    ]);
    environment = environmentState;
    environment.setQuality(quality);
    if (!pathStats) throw new Error('Path geometry did not initialize.');
    const bridgeLengths = pathStats.bridges.map((bridge) => bridge.span);
    const bridgeAverage = bridgeLengths.reduce((sum, value) => sum + value, 0) / Math.max(1, bridgeLengths.length);
    const riverWidths = map.river.widthKeys.map(([, width]) => width);
    worldScaleReadout.textContent = `PLAYER ${PLAYER_HEIGHT_UNITS.toFixed(1)}u | BRIDGE ${bridgeAverage.toFixed(1)}u | RIVER ${Math.min(...riverWidths).toFixed(1)}-${Math.max(...riverWidths).toFixed(1)}u | DIRT PATH ${map.paths.width.toFixed(1)}u`;
    controls = new PlayerControls({
      player,
      camera,
      map,
      waterEffects,
      colliders: WORLD_COLLIDERS,
      onZoneChange: (name) => {
        zoneLabel.textContent = name.toUpperCase();
        showToast(`Entered ${name}`);
      },
    });
    controls.onInput = (input) => multiplayer.setInput(input);
    controls.update(0);
    miniMap.draw({ x: map.spawn.x, y: map.spawn.y });
    if (import.meta.env.DEV) {
      window.__setPlayerPosition = (x, z) => {
        controls.position.set(x, 0, z);
        controls.update(0);
        miniMap.draw({ x, y: z });
      };
    }
    loading.classList.add('hidden');
    showToast('Milestone 1C - cabin yard, camps and forest life ready');
  } catch (error) {
    console.error(error);
    loading.innerHTML = '<b>Could not load the forest assets.</b><small>Check that client/public/models is present.</small>';
    if (import.meta.env.DEV) loading.querySelector('small').textContent = String(error?.message || error);
    loading.classList.add('error');
  }
}

function setQuality(next) {
  quality = next;
  const ratio = next === 'high' ? Math.min(window.devicePixelRatio || 1, 1.6) : next === 'medium' ? Math.min(window.devicePixelRatio || 1, 1.15) : 0.85;
  renderer.setPixelRatio(ratio);
  renderer.shadowMap.enabled = next === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  environment?.setQuality(next);
  qualityLabel.textContent = next.toUpperCase();
  document.querySelectorAll('[data-quality]').forEach((button) => button.classList.toggle('active', button.dataset.quality === next));
}

window.addEventListener('keydown', (event) => {
  if (import.meta.env.DEV && event.key.toLowerCase() === 'h' && !event.repeat && environment) {
    const highlighted = environment.toggleHiderHighlights();
    showToast(highlighted ? 'Hider props highlighted' : 'Hider prop highlight off');
  }
});

document.querySelectorAll('[data-quality]').forEach((button) => button.addEventListener('click', () => setQuality(button.dataset.quality)));
document.querySelector('#audio-unlock').addEventListener('click', async (event) => {
  await unlockAudio();
  event.currentTarget.textContent = 'AUDIO READY';
  event.currentTarget.classList.add('unlocked');
});

async function unlockAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext ||= new AudioContextClass();
  if (audioContext.state !== 'running') await audioContext.resume();
}

const aimRaycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPointer = new THREE.Vector2();
canvas.addEventListener('pointermove', (event) => {
  if (!controls) return;
  aimPointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  aimRaycaster.setFromCamera(aimPointer, camera);
  const point = aimRaycaster.ray.intersectPlane(aimPlane, new THREE.Vector3());
  if (point) { const dx = point.x - player.position.x; const dz = point.z - player.position.z; const length = Math.hypot(dx, dz) || 1; multiplayer.setAim({ x: dx / length, z: dz / length }); }
});
canvas.addEventListener('pointerdown', (event) => { if (event.button === 0 && multiplayer.room?.phase === 'hunt') multiplayer.strike(); });
window.addEventListener('keydown', (event) => { if (event.code === 'Space' && multiplayer.room?.phase === 'hunt') { event.preventDefault(); multiplayer.strike(); } });
setQuality('high');

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, clock.getDelta());
  if (controls) {
    controls.update(delta);
    playerShadow.position.x = player.position.x;
    playerShadow.position.y = player.position.y + 0.025;
    playerShadow.position.z = player.position.z;
    miniMap.draw({ x: player.position.x, y: player.position.z });
  }
  for (const view of playerViews.values()) {
    view.group.position.lerp(view.target, REMOTE_INTERPOLATION_FACTOR);
    view.group.position.y = terrainHeightAt(view.group.position.x, view.group.position.z, map);
  }
  environment?.update(player.position, now / 1000);
  river.update(now / 1000);
  renderer.render(scene, camera);
  frameCount += 1;
  if (now - fpsAt >= 700) {
    fpsReadout.textContent = Math.round((frameCount * 1000) / (now - fpsAt));
    drawCallsReadout.textContent = renderer.info.render.calls;
    frameCount = 0;
    fpsAt = now;
  }
}

requestAnimationFrame(animate);
prepareScene();

window.addEventListener('beforeunload', () => {
  controls?.dispose();
  audioContext?.close();
});
