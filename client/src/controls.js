import * as THREE from 'three';
import { DEEP_CHANNEL_THRESHOLD, DEEP_WATER_SPEED_FACTOR, LAND_MOVE_SPEED, SHALLOW_WATER_SPEED_FACTOR, bridgeAt, waterDepth } from '../../shared/water.js';
import { CAMERA_DISTANCE, CAMERA_REFERENCE_HEIGHT, CAMERA_TILT_DEGREES } from '../../shared/constants.js';
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
    this.speed = LAND_MOVE_SPEED;
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
    const dx = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    const dz = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
    const length = Math.hypot(dx, dz);
    if (length > 0) {
      const bridge = bridgeAt(this.position.x, this.position.z, this.map);
      const depth = waterDepth(this.position.x, this.position.z, this.map);
      const speedFactor = bridge ? 1 : depth === 0 ? 1 : depth >= DEEP_CHANNEL_THRESHOLD ? DEEP_WATER_SPEED_FACTOR : SHALLOW_WATER_SPEED_FACTOR;
      const stepX = (dx / length) * this.speed * speedFactor * delta;
      const stepZ = (dz / length) * this.speed * speedFactor * delta;
      const nextX = THREE.MathUtils.clamp(this.position.x + stepX, 1, 239);
      const nextZ = THREE.MathUtils.clamp(this.position.z + stepZ, 1, 119);
      if (this.canOccupy(nextX, this.position.z)) this.position.x = nextX;
      if (this.canOccupy(this.position.x, nextZ)) this.position.z = nextZ;
      this.player.rotation.y = Math.atan2(-dx, -dz);
    }
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

  canOccupy(x, z) {
    const playerRadius = 0.22;
    return !this.colliders.some((circle) => Math.hypot(x - circle.x, z - circle.z) < playerRadius + circle.radius);
  }

  dispose() {
    window.removeEventListener('keydown', this.boundDown);
    window.removeEventListener('keyup', this.boundUp);
  }
}
