import * as THREE from 'three';
import map from '../../shared/map.js';
import { createTerrain, terrainHeightAt } from './terrain.js';
import { createRiver } from './river.js';
import { createPaths } from './paths.js';
import { createEnvironment } from './environment.js';
import { createLighting, makeSoftShadow } from './lighting.js';
import { PlayerControls } from './controls.js';
import { MultiplayerClient } from './multiplayer.js';
import { WaterEffects } from './waterEffects.js';
import { MiniMap } from './minimap.js';
import {
  CAMERA_FIELD_OF_VIEW_DEGREES,
  CAMERA_ZOOM,
  PLAYER_HEIGHT_UNITS,
  PLAYER_COLLISION_RADIUS,
  SNAPSHOT_BUFFER_MAX_MS,
  SNAPSHOT_INTERPOLATION_DELAY_MS,
} from '../../shared/constants.js';
import { WORLD_COLLIDERS } from '../../shared/world.js';
import './style.css';

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const toast = document.querySelector('#toast');
const zoneLabel = document.querySelector('#zone-label');
const fpsReadout = document.querySelector('#fps');
const drawCallsReadout = document.querySelector('#draw-calls');
const qualityLabel = document.querySelector('#quality-label');
const worldScaleReadout = document.querySelector('#world-scale');
const networkDebugReadout = document.querySelector('#network-debug');
const debugPanel = document.querySelector('#debug-panel');
const gameShell = document.querySelector('#game-shell');

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
let multiplayer;
let quality = 'high';
let environment;
let sceneReady = false;
let activeRoom = null;
let frameCount = 0;
let fpsAt = performance.now();
let toastTimer;
const clock = new THREE.Clock();
const remotePlayers = new Map();

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

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

function createHunterFigure(figure = player, accentColor = '#a8eedc') {
  const colors = {
    cloak: new THREE.MeshStandardMaterial({ color: '#294b53', roughness: 0.94, flatShading: true }),
    hood: new THREE.MeshStandardMaterial({ color: '#1b383f', roughness: 1, flatShading: true }),
    trousers: new THREE.MeshStandardMaterial({ color: '#203a40', roughness: 1, flatShading: true }),
    boots: new THREE.MeshStandardMaterial({ color: '#34463e', roughness: 1, flatShading: true }),
    accent: new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.18, roughness: 0.7, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: '#bbd2c4', roughness: 0.88, flatShading: true }),
    face: new THREE.MeshStandardMaterial({ color: '#172a2a', roughness: 1, flatShading: true }),
  };
  const add = (geometry, material, x, y, z, rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    figure.add(mesh);
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
  figure.scale.setScalar(PLAYER_HEIGHT_UNITS / 0.95);
  figure.userData.worldHeight = PLAYER_HEIGHT_UNITS;
}

function createNameLabel(text, color) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512; labelCanvas.height = 96;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(5, 24, 26, .78)';
  ctx.beginPath(); ctx.roundRect(10, 8, 492, 80, 22); ctx.fill();
  ctx.strokeStyle = `${color}bb`; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = color; ctx.font = '700 42px Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 49, 460);
  const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.scale.set(2.5, 0.48, 1); sprite.position.y = PLAYER_HEIGHT_UNITS * 1.58;
  return sprite;
}

function ensureRemotePlayer(remote) {
  if (remotePlayers.has(remote.id)) return remotePlayers.get(remote.id);
  const color = remote.color || '#f6ce72';
  const group = new THREE.Group();
  createHunterFigure(group, color);
  const ring = new THREE.Mesh(new THREE.RingGeometry(PLAYER_COLLISION_RADIUS * 1.15, PLAYER_COLLISION_RADIUS * 1.55, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; group.add(ring);
  group.add(createNameLabel(remote.name, color));
  scene.add(group);
  const view = { id: remote.id, group, name: remote.name, color, buffer: [] };
  remotePlayers.set(remote.id, view);
  return view;
}

function applyRoomState(room) {
  activeRoom = room;
  if (controls) controls.enabled = Boolean(sceneReady && room?.phase === 'game');
  if (!room || room.phase !== 'game') {
    for (const view of remotePlayers.values()) scene.remove(view.group);
    remotePlayers.clear();
  }
  if (!room || room.phase !== 'game' || !sceneReady) return;
  const me = room.players.find((item) => item.id === room.playerId);
  if (me && controls) { controls.position.set(me.x, 0, me.z); controls.update(0); }
  resize();
}

function applySnapshot(snapshot) {
  if (!snapshot || snapshot.phase !== 'game' || !activeRoom) return;
  const seen = new Set();
  const serverTime = Number(snapshot.serverTime) || Date.now();
  for (const item of snapshot.players) {
    if (item.id === activeRoom.playerId) { controls?.reconcile(item.x, item.z); continue; }
    seen.add(item.id);
    const view = ensureRemotePlayer({ ...item, color: activeRoom.players.find((player) => player.id === item.id)?.color });
    view.name = item.name;
    view.buffer.push({ time: serverTime, x: item.x, z: item.z, angle: item.angle });
    const cutoff = serverTime - SNAPSHOT_BUFFER_MAX_MS;
    while (view.buffer.length > 2 && view.buffer[1].time < cutoff) view.buffer.shift();
  }
  for (const [id, view] of remotePlayers) if (!seen.has(id)) { scene.remove(view.group); remotePlayers.delete(id); }
}

function updateRemotePlayers() {
  const renderAt = Date.now() - SNAPSHOT_INTERPOLATION_DELAY_MS;
  const minimapPlayers = [];
  for (const view of remotePlayers.values()) {
    const samples = view.buffer;
    if (!samples.length) continue;
    let a = samples[0]; let b = samples.at(-1);
    for (let i = 1; i < samples.length; i += 1) if (samples[i].time >= renderAt) { a = samples[i - 1]; b = samples[i]; break; }
    const t = b.time === a.time ? 1 : THREE.MathUtils.clamp((renderAt - a.time) / (b.time - a.time), 0, 1);
    view.group.position.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
    view.group.position.y = terrainHeightAt(view.group.position.x, view.group.position.z, map);
    view.group.rotation.y = a.angle + (b.angle - a.angle) * t;
    minimapPlayers.push({ x: view.group.position.x, z: view.group.position.z, color: view.color });
  }
  if (controls) miniMap.draw({ x: controls.position.x, y: controls.position.z }, minimapPlayers);
}

async function prepareScene() {
  try {
    createHunterFigure();
    const localRing = new THREE.Mesh(new THREE.RingGeometry(PLAYER_COLLISION_RADIUS * 1.15, PLAYER_COLLISION_RADIUS * 1.65, 24), new THREE.MeshBasicMaterial({ color: '#76ffe1', transparent: true, opacity: 0.96, side: THREE.DoubleSide, depthWrite: false }));
    localRing.rotation.x = -Math.PI / 2; localRing.position.y = 0.035; player.add(localRing);
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
    controls.onInput = (input) => multiplayer?.setInput(input);
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
    sceneReady = true;
    multiplayer?.setWorldReady();
    applyRoomState(multiplayer?.room || null);
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
window.addEventListener('keydown', (event) => {
  if (event.key === 'F3') { event.preventDefault(); debugPanel.hidden = !debugPanel.hidden; }
});
multiplayer = new MultiplayerClient({
  onRoom: applyRoomState,
  onSnapshot: applySnapshot,
  onNetwork: ({ pingMs, snapshotHz }) => { networkDebugReadout.textContent = `PING ${pingMs == null ? '—' : `${pingMs} ms`} · SNAPSHOTS ${snapshotHz || '—'} Hz`; },
  onError: (message) => { if (message) showToast(message); },
});
setQuality('high');

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(0.05, clock.getDelta());
  if (controls) {
    controls.update(delta);
    playerShadow.position.x = player.position.x;
    playerShadow.position.y = player.position.y + 0.025;
    playerShadow.position.z = player.position.z;
  }
  updateRemotePlayers();
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
  multiplayer?.dispose();
});
