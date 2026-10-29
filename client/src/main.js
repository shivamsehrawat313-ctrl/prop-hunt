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
  HIDER_SIGHT_RADIUS,
  HUNTER_CLOSE_CIRCLE_RANGE,
  HUNTER_CONE_RANGE,
  HUNTER_VIEW_CONE_DEGREES,
  DISGUISE_TINT_STRENGTH,
  HIDER_DISGUISE_SPEED_FACTOR,
  HEARTBEAT_INTERVALS_MS,
  HEARTBEAT_PEAK_VOLUME,
  PLAYER_HEIGHT_UNITS,
  REMOTE_INTERPOLATION_FACTOR,
  SERVER_POSITION_SNAP_THRESHOLD,
  VISION_CANVAS_MAX_DPR,
  VISION_FOG_BLUR_PX,
  VISION_FOG_DRAW_INTERVAL_MS,
  VISION_FOG_FEATHER_FRACTION,
  VISION_FOG_MIN_FEATHER_PX,
  VISION_FOG_MIN_SCREEN_RADIUS_PX,
  VISION_FOG_OPACITY,
  VISION_FOG_REVEAL_RADIUS_UNITS,
} from '../../shared/constants.js';
import './style.css';
import { MultiplayerClient } from './multiplayer.js';
import { loadModel } from './modelLoader.js';
import { WORLD_COLLIDERS } from '../../shared/world.js';

const canvas = document.querySelector('#scene');
const visionCanvas = document.querySelector('#vision-fog');
const visionContext = visionCanvas.getContext('2d');
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
let myRole = null;
let lastVisionDraw = 0;
let visionCanvasSize = { width: 0, height: 0, pixelRatio: 0 };
let heartbeatTimer = null;
let heartbeatLevel = 0;
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
    const shimmer = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.018, 4, 24), new THREE.MeshBasicMaterial({ color: '#b9fff0', transparent: true, opacity: 0.82, depthWrite: false }));
    shimmer.rotation.x = -Math.PI / 2; shimmer.position.y = 0.06; shimmer.visible = false; group.add(shimmer);
    scene.add(group); view = { group, target: new THREE.Vector3(snapshot.x, 0, snapshot.z), modelType: null, loading: false, shimmer };
    playerViews.set(snapshot.id, view);
  }
  view.target.set(snapshot.x, 0, snapshot.z);
  view.shimmer.visible = Boolean(snapshot.shimmer);
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
        const grade = (material) => { const copy = material.clone(); if (copy.color) copy.color.lerp(tint, DISGUISE_TINT_STRENGTH); if (copy.emissive) { copy.emissive.lerp(tint, 0.28); copy.emissiveIntensity = 0.24; } copy.roughness = Math.max(copy.roughness ?? 0.8, 0.94); return copy; };
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
  myRole = me?.role || null;
  const visibleIds = new Set();
  if (['hide', 'hunt'].includes(room.phase)) resize();
  if (controls && me) {
    controls.speedFactor = room.phase === 'hide' && me.role === 'hunter' ? 0 : me.role === 'hider' && me.disguise ? HIDER_DISGUISE_SPEED_FACTOR : 1;
    for (const other of room.players) { visibleIds.add(other.id); setPlayerView(other, other.id === me.id); }
    for (const [index, disguise] of (room.disguises || []).entries()) {
      const id = `masked-${disguise.id || index}`; visibleIds.add(id);
      setPlayerView({ id, role: 'hider', x: disguise.x, z: disguise.z, locked: true, disguise: disguise.type, disguiseScale: disguise.scale, disguiseRotation: disguise.rotation, shimmer: disguise.shimmer, alive: true, caught: false }, false);
    }
    for (const [id, view] of playerViews) if (id !== me.id && !visibleIds.has(id)) { scene.remove(view.group); playerViews.delete(id); }
    const danger = document.querySelector('#danger-pulse');
    danger.dataset.level = String(me.role === 'hider' ? room.dangerLevel || 0 : 0);
    setHeartbeat(me.role === 'hider' ? room.dangerLevel || 0 : 0);
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
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, VISION_CANVAS_MAX_DPR);
  if (width === visionCanvasSize.width && height === visionCanvasSize.height && pixelRatio === visionCanvasSize.pixelRatio) return;
  visionCanvasSize = { width, height, pixelRatio };
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.zoom = CAMERA_ZOOM;
  camera.updateProjectionMatrix();
  visionCanvas.width = Math.round(width * pixelRatio); visionCanvas.height = Math.round(height * pixelRatio);
  visionContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
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
  setHeartbeat(heartbeatLevel);
}

function heartbeatThump(delaySeconds, frequency, peak) {
  if (!audioContext || audioContext.state !== 'running') return;
  const start = audioContext.currentTime + delaySeconds;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.001, start); gain.gain.linearRampToValueAtTime(peak, start + 0.025); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
  oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + 0.19);
}

function setHeartbeat(level) {
  const nextLevel = Math.max(0, Math.min(3, Math.floor(level || 0)));
  if (nextLevel === heartbeatLevel && (nextLevel === 0 || heartbeatTimer)) return;
  heartbeatLevel = nextLevel;
  clearInterval(heartbeatTimer); heartbeatTimer = null;
  if (heartbeatLevel === 0 || !audioContext || audioContext.state !== 'running') return;
  const interval = HEARTBEAT_INTERVALS_MS[heartbeatLevel];
  const beat = () => { heartbeatThump(0, 58, HEARTBEAT_PEAK_VOLUME * heartbeatLevel / 3); heartbeatThump(0.16, 48, HEARTBEAT_PEAK_VOLUME * heartbeatLevel / 3); };
  beat(); heartbeatTimer = setInterval(beat, interval);
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
  if (now - lastVisionDraw >= VISION_FOG_DRAW_INTERVAL_MS) { drawVisionFog(); lastVisionDraw = now; }
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

function worldToScreen(x, y, z) {
  const point = new THREE.Vector3(x, y, z).project(camera);
  return { x: (point.x * 0.5 + 0.5) * visionCanvas.clientWidth, y: (-point.y * 0.5 + 0.5) * visionCanvas.clientHeight };
}

function clearVisionDisc(ctx, x, y, radius) {
  const feather = Math.max(VISION_FOG_MIN_FEATHER_PX, radius * VISION_FOG_FEATHER_FRACTION);
  const gradient = ctx.createRadialGradient(x, y, Math.max(0, radius - feather), x, y, radius + feather);
  gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(0.76, 'rgba(255,255,255,0.96)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius + feather, 0, Math.PI * 2); ctx.fill();
}

function drawVisionFog() {
  const ctx = visionContext;
  const width = visionCanvas.clientWidth; const height = visionCanvas.clientHeight;
  ctx.clearRect(0, 0, width, height);
  if (!controls || !['hider', 'hunter'].includes(myRole) || !multiplayer.room || !['hide', 'hunt'].includes(multiplayer.room.phase)) return;
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(4, 14, 17, ${VISION_FOG_OPACITY})`; ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-out'; ctx.filter = quality === 'low' ? 'none' : `blur(${VISION_FOG_BLUR_PX}px)`;
  const center = worldToScreen(controls.position.x, controls.position.y + 0.1, controls.position.z);
  const xEdge = worldToScreen(controls.position.x + 1, controls.position.y + 0.1, controls.position.z);
  const zEdge = worldToScreen(controls.position.x, controls.position.y + 0.1, controls.position.z + 1);
  const pixelsPerUnit = (Math.hypot(xEdge.x - center.x, xEdge.y - center.y) + Math.hypot(zEdge.x - center.x, zEdge.y - center.y)) * 0.5;
  const eraseCircle = (wx, wz, units) => { const point = worldToScreen(wx, terrainHeightAt(wx, wz, map) + 0.1, wz); clearVisionDisc(ctx, point.x, point.y, Math.max(VISION_FOG_MIN_SCREEN_RADIUS_PX, units * pixelsPerUnit)); };
  if (myRole === 'hider') {
    eraseCircle(controls.position.x, controls.position.z, HIDER_SIGHT_RADIUS);
    if (multiplayer.room.hunterPosition) eraseCircle(multiplayer.room.hunterPosition.x, multiplayer.room.hunterPosition.z, VISION_FOG_REVEAL_RADIUS_UNITS);
  } else {
    eraseCircle(controls.position.x, controls.position.z, HUNTER_CLOSE_CIRCLE_RANGE);
    const aim = multiplayer.input?.aim || { x: 0, z: 1 };
    const length = Math.hypot(aim.x, aim.z) || 1;
    const end = worldToScreen(controls.position.x + aim.x / length * HUNTER_CONE_RANGE, controls.position.y + 0.1, controls.position.z + aim.z / length * HUNTER_CONE_RANGE);
    const r = Math.max(VISION_FOG_MIN_SCREEN_RADIUS_PX, Math.hypot(end.x - center.x, end.y - center.y));
    const angle = Math.atan2(end.y - center.y, end.x - center.x);
    const halfAngle = Math.PI * HUNTER_VIEW_CONE_DEGREES / 360;
    ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.arc(center.x, center.y, r, angle - halfAngle, angle + halfAngle); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.fill();
  }
  ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
}

requestAnimationFrame(animate);
prepareScene();

window.addEventListener('beforeunload', () => {
  controls?.dispose();
  audioContext?.close();
});
