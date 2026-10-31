import * as THREE from 'three';
import { bridgeAt, waterDepth } from '../../shared/water.js';
import { movePlayer } from '../../shared/movement.js';
import {
  CAMERA_DISTANCE, CAMERA_REFERENCE_HEIGHT, CAMERA_TILT_DEGREES, PLAYER_MAX_SPEED,
  PLAYER_INPUT_MAX_DT_SECONDS, PREDICTION_CORRECTION_MS,
  PREDICTION_ERROR_IGNORE_UNITS, PREDICTION_ERROR_TELEPORT_UNITS,
} from '../../shared/constants.js';
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
    this.previousPosition = this.position.clone();
    this.renderPosition = this.position.clone();
    this.renderCorrection = new THREE.Vector3();
    this.correctionRemainingMs = 0;
    this.predictionAccumulator = 0;
    this.pendingInputs = [];
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
    const step = PLAYER_INPUT_MAX_DT_SECONDS;
    this.predictionAccumulator += Math.max(0, Math.min(delta, step * 4));
    while (this.predictionAccumulator >= step) {
      const dx = this.enabled ? (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) : 0;
      const dz = this.enabled ? (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) : 0;
      const length = Math.hypot(dx, dz);
      this.previousPosition.copy(this.position);
      if (length > 0) {
        const moved = movePlayer(this.position, { x: dx, z: dz }, step, { map: this.map, colliders: this.colliders, speed: this.speed });
        this.position.x = moved.x; this.position.z = moved.z;
        this.player.rotation.y = Math.atan2(-dx, -dz);
      }
      const command = this.onInput?.({ x: dx, z: dz, dt: step });
      if (command) this.pendingInputs.push({ ...command, predictedSpeed: this.speed });
      this.predictionAccumulator -= step;
    }
    const alpha = THREE.MathUtils.clamp(this.predictionAccumulator / step, 0, 1);
    this.renderPosition.copy(this.previousPosition).lerp(this.position, alpha);
    if (this.correctionRemainingMs > 0) {
      const elapsedMs = Math.max(0, delta * 1000);
      const nextRemainingMs = Math.max(0, this.correctionRemainingMs - elapsedMs);
      const ratio = this.correctionRemainingMs > 0 ? nextRemainingMs / this.correctionRemainingMs : 0;
      this.renderCorrection.multiplyScalar(ratio);
      this.correctionRemainingMs = nextRemainingMs;
      if (!nextRemainingMs) this.renderCorrection.set(0, 0, 0);
    }
    this.renderPosition.add(this.renderCorrection);
    this.position.y = terrainHeightAt(this.position.x, this.position.z, this.map);
    this.renderPosition.y = terrainHeightAt(this.renderPosition.x, this.renderPosition.z, this.map);
    const depth = waterDepth(this.renderPosition.x, this.renderPosition.z, this.map);
    const inputLength = this.enabled && (this.keys.has('w') || this.keys.has('a') || this.keys.has('s') || this.keys.has('d') || this.keys.has('arrowup') || this.keys.has('arrowdown') || this.keys.has('arrowleft') || this.keys.has('arrowright'));
    this.waterEffects.update(this.renderPosition, depth, Boolean(bridgeAt(this.renderPosition.x, this.renderPosition.z, this.map)), inputLength, delta);
    this.player.position.copy(this.renderPosition);
    const frameScale = Math.max(0.25, window.innerHeight / CAMERA_REFERENCE_HEIGHT);
    const cameraDistance = CAMERA_DISTANCE * frameScale;
    this.camera.position.set(
      this.renderPosition.x,
      this.renderPosition.y + Math.cos(this.cameraTiltRadians) * cameraDistance,
      this.renderPosition.z + Math.sin(this.cameraTiltRadians) * cameraDistance,
    );
    this.camera.lookAt(this.renderPosition.x, this.renderPosition.y, this.renderPosition.z);
    const zone = this.map.zones.find((item) => this.renderPosition.x >= item.minX && this.renderPosition.x <= item.maxX)?.id || 'C';
    if (zone !== this.zoneId) {
      this.zoneId = zone;
      this.onZoneChange(this.map.zones.find((item) => item.id === zone)?.name || 'FOREST');
    }
  }

  reconcile(x, z, lastProcessedSeq) {
    if (!Number.isSafeInteger(lastProcessedSeq)) return;
    this.pendingInputs = this.pendingInputs.filter((input) => input.seq > lastProcessedSeq);
    let corrected = { x, z };
    for (const input of this.pendingInputs) {
      corrected = movePlayer(corrected, input, input.dt, { map: this.map, colliders: this.colliders, speed: input.predictedSpeed ?? this.speed });
    }
    const errorX = corrected.x - this.position.x;
    const errorZ = corrected.z - this.position.z;
    const error = Math.hypot(errorX, errorZ);
    if (error < PREDICTION_ERROR_IGNORE_UNITS) return;
    const alpha = THREE.MathUtils.clamp(this.predictionAccumulator / PLAYER_INPUT_MAX_DT_SECONDS, 0, 1);
    const visibleX = THREE.MathUtils.lerp(this.previousPosition.x, this.position.x, alpha) + this.renderCorrection.x;
    const visibleZ = THREE.MathUtils.lerp(this.previousPosition.z, this.position.z, alpha) + this.renderCorrection.z;
    this.position.set(corrected.x, terrainHeightAt(corrected.x, corrected.z, this.map), corrected.z);
    this.previousPosition.copy(this.position);
    if (error >= PREDICTION_ERROR_TELEPORT_UNITS) {
      this.renderCorrection.set(0, 0, 0);
      this.correctionRemainingMs = 0;
    } else {
      this.renderCorrection.set(visibleX - corrected.x, 0, visibleZ - corrected.z);
      this.correctionRemainingMs = PREDICTION_CORRECTION_MS;
    }
  }

  resetPrediction() {
    this.previousPosition.copy(this.position);
    this.renderPosition.copy(this.position);
    this.renderCorrection.set(0, 0, 0);
    this.correctionRemainingMs = 0;
    this.predictionAccumulator = 0;
    this.pendingInputs.length = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this.boundDown);
    window.removeEventListener('keyup', this.boundUp);
  }
}
