// Effects: one recycled particle pool (a single THREE.Points buffer) that every system
// borrows — impact sparks, dust, exhaust and damage smoke, muzzle flashes, confetti when a
// mission pays out. No textures, no files: round points tinted per burst.

import * as THREE from '../vendor/three.min.js';

const MAX_PARTICLES = 900;

export class Effects {
  constructor(scene) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.velocities = new Float32Array(MAX_PARTICLES * 3);
    this.lives = new Float32Array(MAX_PARTICLES);
    this.maxLives = new Float32Array(MAX_PARTICLES);
    this.gravity = new Float32Array(MAX_PARTICLES);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES; i++) this.positions[i * 3 + 1] = -50;
    scene.add(this.points);
    const color = new THREE.Color();
    this.tmpColor = color;
  }

  burst(x, y, z, { count = 12, color = 0xffcc66, speed = 5, up = 3, life = 0.5, gravity = -6 } = {}) {
    this.tmpColor.setHex(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      this.velocities[i * 3] = Math.sin(a) * s;
      this.velocities[i * 3 + 1] = up * (0.4 + Math.random());
      this.velocities[i * 3 + 2] = Math.cos(a) * s;
      const jitter = 0.75 + Math.random() * 0.4;
      this.colors[i * 3] = this.tmpColor.r * jitter;
      this.colors[i * 3 + 1] = this.tmpColor.g * jitter;
      this.colors[i * 3 + 2] = this.tmpColor.b * jitter;
      this.lives[i] = this.maxLives[i] = life * (0.6 + Math.random() * 0.7);
      this.gravity[i] = gravity;
    }
  }

  sparks(x, y, z) {
    this.burst(x, y, z, { count: 14, color: 0xffb347, speed: 7, up: 2.5, life: 0.4, gravity: -9 });
  }

  smoke(x, y, z, dark = false) {
    this.burst(x, y, z, { count: 3, color: dark ? 0x333333 : 0xbbbbbb, speed: 0.8, up: 2.2, life: 1.1, gravity: 1.5 });
  }

  muzzle(x, y, z) {
    this.burst(x, y, z, { count: 5, color: 0xffe27a, speed: 2.5, up: 0.4, life: 0.12, gravity: 0 });
  }

  confetti(x, y, z) {
    for (const color of [0xffd166, 0x06d6a0, 0xef476f, 0x118ab2]) {
      this.burst(x, y, z, { count: 9, color, speed: 4, up: 6, life: 0.9, gravity: -5 });
    }
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.lives[i] <= 0) continue;
      this.lives[i] -= dt;
      if (this.lives[i] <= 0) {
        this.positions[i * 3 + 1] = -50;
        continue;
      }
      this.velocities[i * 3 + 1] += this.gravity[i] * dt;
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
      if (this.positions[i * 3 + 1] < 0.05) this.positions[i * 3 + 1] = 0.05;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
