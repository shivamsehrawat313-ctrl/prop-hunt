import * as THREE from 'three';
import { bridgeAt, waterDepth } from '../../shared/water.js';
import { movePlayer } from '../../shared/movement.js';
import { CAMERA_DISTANCE, CAMERA_REFERENCE_HEIGHT, CAMERA_TILT_DEGREES, PLAYER_MAX_SPEED, PLAYER_POSITION_CORRECTION_THRESHOLD } from '../../shared/constants.js';
import { terrainHeightAt } from './terrain.js';

const KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

export class PlayerControls {
  constructor({ player, camera, map, waterEffects, onZoneChange, colliders = [] }) {
    this.player = player;
    this.camera = camera;
    this.map = map;
    this.waterEffects = waterEffects;
    this.onZoneChange = onZoneChange;
    this.colliders = colliders;
    this.keys = new Set();
    this.position = new THREE.Vector3(map.spawn.x, 0, map.spawn.y);
    this.speed = PLAYER_MAX_SPEED;
    this.enabled = false;
    this.onInput = null;
    this.predictionHistory = [];
    this.cameraTiltRadians = THREE.MathUtils.degToRad(CAMERA_TILT_DEGREES);
    this.zoneId = 'A';
    this.boundDown = (event) => {
      const key = event.key.toLowerCase();
      if (KEYS.has(key)) { event.preventDefault(); this.keys.add(key); }
    };
    this.boundUp = (event) => this.keys.delete(event.key.toLowerCase());
    window.addEventListener('keydown', this.boundDown);
    window.addEventListener('keyup', this.boundUp);
  }

  update(delta) {
    const frameEnd = Date.now();
    const frameStart = frameEnd - Math.max(0, delta) * 1000;
    const dx = this.enabled ? (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) : 0;
    const dz = this.enabled ? (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) : 0;
    const length = Math.hypot(dx, dz);
    if (length > 0) {
      const moved = movePlayer(this.position, { x: dx, z: dz }, delta, { map: this.map, colliders: this.colliders, speed: this.speed });
      this.position.x = moved.x; this.position.z = moved.z;
      this.player.rotation.y = Math.atan2(-dx, -dz);
    }
    this.predictionHistory.push({ start: frameStart, end: frameEnd, delta, dx, dz });
    const oldestFrame = frameEnd - 1000;
    while (this.predictionHistory.length > 1 && this.predictionHistory[1].end < oldestFrame) this.predictionHistory.shift();
    this.onInput?.({ x: dx, z: dz });
    this.position.y = terrainHeightAt(this.position.x, this.position.z, this.map);
    const depth = waterDepth(this.position.x, this.position.z, this.map);
    this.waterEffects.update(this.position, depth, Boolean(bridgeAt(this.position.x, this.position.z, this.map)), length > 0, delta);
    this.player.position.x = this.position.x;
    this.player.position.y = this.position.y;
    this.player.position.z = this.position.z;
    const frameScale = Math.max(0.25, window.innerHeight / CAMERA_REFERENCE_HEIGHT);
    const cameraDistance = CAMERA_DISTANCE * frameScale;
    this.camera.position.set(
      this.position.x,
      this.position.y + Math.cos(this.cameraTiltRadians) * cameraDistance,
      this.position.z + Math.sin(this.cameraTiltRadians) * cameraDistance,
    );
    this.camera.lookAt(this.position.x, this.position.y, this.position.z);
    const zone = this.map.zones.find((item) => this.position.x >= item.minX && this.position.x <= item.maxX)?.id || 'C';
    if (zone !== this.zoneId) {
      this.zoneId = zone;
      this.onZoneChange(this.map.zones.find((item) => item.id === zone)?.name || 'FOREST');
    }
  }

  reconcile(x, z, serverTime = Date.now()) {
    // Snapshots describe the server's position at serverTime, not at arrival
    // time. Reapply local inputs since that instant instead of easing toward a
    // stale point (which visibly pulls the local player backwards at higher RTT).
    let position = { x, z };
    const replayFrom = Number(serverTime);
    if (Number.isFinite(replayFrom)) {
      for (const frame of this.predictionHistory) {
        const replayStart = Math.max(frame.start, replayFrom);
        const replayMs = frame.end - replayStart;
        if (replayMs <= 0 || frame.end <= replayFrom) continue;
        const replayDelta = Math.min(frame.delta, replayMs / 1000);
        position = movePlayer(position, { x: frame.dx, z: frame.dz }, replayDelta, {
          map: this.map, colliders: this.colliders, speed: this.speed,
        });
      }
    }
    const error = Math.hypot(position.x - this.position.x, position.z - this.position.z);
    if (error > PLAYER_POSITION_CORRECTION_THRESHOLD * 4) {
      this.position.x = position.x;
      this.position.z = position.z;
    } else {
      this.position.x += (position.x - this.position.x) * 0.35;
      this.position.z += (position.z - this.position.z) * 0.35;
    }
  }

  resetPredictionHistory() {
    this.predictionHistory.length = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this.boundDown);
    window.removeEventListener('keyup', this.boundUp);
  }
}
