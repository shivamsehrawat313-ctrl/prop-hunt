import * as THREE from 'three';
import { LAND_MOVE_SPEED, bridgeAt, waterDepth } from '../../shared/water.js';
import { movePlayer } from '../../shared/movement.js';
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
    this.virtualDirection = { x: 0, z: 0 };
    this.position = new THREE.Vector3(map.spawn.x, 0, map.spawn.y);
    this.speed = LAND_MOVE_SPEED;
    this.speedFactor = 1;
    this.onInput = null;
    this.cameraTiltRadians = THREE.MathUtils.degToRad(CAMERA_TILT_DEGREES);
    this.zoneId = 'A';
    this.boundDown = (event) => {
      const key = event.key.toLowerCase();
      if (KEYS.has(key)) { event.preventDefault(); this.keys.add(key); }
    };
    this.boundUp = (event) => this.keys.delete(event.key.toLowerCase());
    this.stick = document.querySelector('#move-stick');
    this.stickKnob = document.querySelector('#move-stick-knob');
    this.stickPointerId = null;
    this.stickCenter = null;
    this.stickRadius = 42;
    this.boundStickDown = (event) => {
      event.preventDefault();
      this.stickPointerId = event.pointerId;
      const rect = this.stick.getBoundingClientRect();
      this.stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.stick.setPointerCapture(event.pointerId);
      this.#updateStick(event);
    };
    this.boundStickMove = (event) => { if (event.pointerId === this.stickPointerId) { event.preventDefault(); this.#updateStick(event); } };
    this.boundStickUp = (event) => {
      if (event.pointerId !== this.stickPointerId) return;
      this.stickPointerId = null;
      this.virtualDirection = { x: 0, z: 0 };
      this.stickKnob.style.transform = 'translate(0px, 0px)';
    };
    this.stick?.addEventListener('pointerdown', this.boundStickDown);
    this.stick?.addEventListener('pointermove', this.boundStickMove);
    this.stick?.addEventListener('pointerup', this.boundStickUp);
    this.stick?.addEventListener('pointercancel', this.boundStickUp);
    window.addEventListener('keydown', this.boundDown);
    window.addEventListener('keyup', this.boundUp);
  }

  update(delta) {
    const keyX = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    const keyZ = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
    const dx = this.stickPointerId !== null ? this.virtualDirection.x : keyX;
    const dz = this.stickPointerId !== null ? this.virtualDirection.z : keyZ;
    const length = Math.hypot(dx, dz);
    if (length > 0) {
      const moved = movePlayer(this.position, { x: dx, z: dz }, delta, { map: this.map, colliders: this.colliders, speed: this.speed, speedFactor: this.speedFactor });
      this.position.x = moved.x;
      this.position.z = moved.z;
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

  #updateStick(event) {
    const ox = event.clientX - this.stickCenter.x;
    const oy = event.clientY - this.stickCenter.y;
    const length = Math.hypot(ox, oy);
    const clamped = Math.min(this.stickRadius, length);
    const nx = length ? ox / length : 0;
    const ny = length ? oy / length : 0;
    this.stickKnob.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
    this.virtualDirection = length < 12 ? { x: 0, z: 0 } : { x: nx, z: ny };
  }

  dispose() {
    window.removeEventListener('keydown', this.boundDown);
    window.removeEventListener('keyup', this.boundUp);
    this.stick?.removeEventListener('pointerdown', this.boundStickDown);
    this.stick?.removeEventListener('pointermove', this.boundStickMove);
    this.stick?.removeEventListener('pointerup', this.boundStickUp);
    this.stick?.removeEventListener('pointercancel', this.boundStickUp);
  }
}
