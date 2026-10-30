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
    const dx = this.enabled ? (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) : 0;
    const dz = this.enabled ? (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) : 0;
    const length = Math.hypot(dx, dz);
    if (length > 0) {
      const moved = movePlayer(this.position, { x: dx, z: dz }, delta, { map: this.map, colliders: this.colliders, speed: this.speed });
      this.position.x = moved.x; this.position.z = moved.z;
      this.player.rotation.y = Math.atan2(-dx, -dz);
    }
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

  reconcile(x, z) {
    const error = Math.hypot(x - this.position.x, z - this.position.z);
    if (error > PLAYER_POSITION_CORRECTION_THRESHOLD) {
      this.position.x = x; this.position.z = z;
    } else {
      this.position.x += (x - this.position.x) * 0.2;
      this.position.z += (z - this.position.z) * 0.2;
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.boundDown);
    window.removeEventListener('keyup', this.boundUp);
  }
}
