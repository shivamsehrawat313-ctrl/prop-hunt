import * as THREE from 'three';
import { palette } from './palette.js';

export class WaterEffects {
  constructor(scene) {
    this.scene = scene;
    this.wasWet = false;
    this.wakeTimer = 0;
    this.ringCursor = 0;
    this.rings = Array.from({ length: 12 }, () => {
      const material = new THREE.MeshBasicMaterial({ color: palette.riverGlow, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.23, 24), material);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.105;
      ring.visible = false;
      scene.add(ring);
      return { mesh: ring, age: 1, life: 1 };
    });
    this.particles = [];
    this.particleCapacity = 36;
    this.particleMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.055, 0),
      new THREE.MeshBasicMaterial({ color: '#9ffff5', transparent: true, opacity: 0.9, depthWrite: false }),
      this.particleCapacity,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    scene.add(this.particleMesh);
    this.dummy = new THREE.Object3D();
  }

  spawnRing(x, z, life = 0.8, initialScale = 0.45) {
    const item = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    item.age = 0;
    item.life = life;
    item.mesh.position.set(x, 0.108, z);
    item.mesh.scale.setScalar(initialScale);
    item.mesh.material.opacity = 0.5;
    item.mesh.visible = true;
  }

  spawnSplash(x, z) {
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2 + Math.random() * 0.25;
      const speed = 0.38 + Math.random() * 0.72;
      this.particles.push({
        x, y: 0.16, z,
        vx: Math.cos(angle) * speed,
        vy: 0.45 + Math.random() * 0.85,
        vz: Math.sin(angle) * speed,
        age: 0,
        life: 0.38 + Math.random() * 0.32,
      });
    }
    if (this.particles.length > this.particleCapacity) this.particles.splice(0, this.particles.length - this.particleCapacity);
  }

  update(position, depth, onBridge, moving, delta) {
    const wet = depth > 0 && !onBridge;
    if (wet && !this.wasWet) {
      this.spawnRing(position.x, position.z, 1.05, 0.4);
      this.spawnSplash(position.x, position.z);
    }
    this.wasWet = wet;
    if (wet && moving) {
      this.wakeTimer += delta;
      if (this.wakeTimer >= 0.16) {
        this.spawnRing(position.x, position.z, 0.7, 0.24);
        this.wakeTimer = 0;
      }
    } else {
      this.wakeTimer = 0;
    }
    for (const item of this.rings) {
      if (!item.mesh.visible) continue;
      item.age += delta;
      const t = Math.min(1, item.age / item.life);
      item.mesh.scale.setScalar(0.4 + t * 1.05);
      item.mesh.material.opacity = Math.max(0, (1 - t) * 0.5);
      if (t >= 1) item.mesh.visible = false;
    }
    const active = [];
    for (const particle of this.particles) {
      particle.age += delta;
      particle.vy -= 2.8 * delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.z += particle.vz * delta;
      if (particle.age < particle.life && particle.y > 0.06) active.push(particle);
    }
    this.particles = active;
    for (let i = 0; i < this.particleCapacity; i += 1) {
      const particle = active[i];
      if (particle) {
        const fade = 1 - particle.age / particle.life;
        this.dummy.position.set(particle.x, particle.y, particle.z);
        this.dummy.scale.setScalar(Math.max(0.01, fade * 0.75));
      } else {
        this.dummy.position.set(0, -20, 0);
        this.dummy.scale.setScalar(0);
      }
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }
}
