import * as THREE from 'three';

// Pooled particles drawn with a single InstancedMesh per style. Particles shrink to fade out.
class Pool {
  constructor(scene, geometry, material, max) {
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh);
    this.max = max;
    this.items = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
  }

  spawn(p) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({
      pos: p.pos.clone(), vel: p.vel ? p.vel.clone() : new THREE.Vector3(),
      life: p.life, max: p.life, size: p.size, grav: p.grav ?? 0, drag: p.drag ?? 2,
      color: new THREE.Color(p.color ?? 0xffffff), spin: Math.random() * 6, grow: p.grow ?? 0,
    });
  }

  update(dt) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const p = it[i];
      p.life -= dt;
      if (p.life <= 0) { it.splice(i, 1); continue; }
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      p.spin += dt * 3;
    }
    for (let i = 0; i < it.length; i++) {
      const p = it[i];
      const k = p.life / p.max;
      const sc = p.size * (p.grow ? (1 + (1 - k) * p.grow) * Math.min(1, k * 3) : Math.sqrt(k));
      this.s.setScalar(sc);
      this.q.setFromEuler(this.e.set(p.spin, p.spin * 0.7, 0));
      this.m.compose(p.pos, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, p.color);
    }
    this.mesh.count = it.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    this.puffs = new Pool(scene, new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 400);
    this.sparks = new Pool(scene, new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ toneMapped: false }), 400);
  }

  dust(pos, count = 8, power = 2.5, color = 0xe8d6b8) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * power, Math.random() * 1.2, Math.sin(a) * power);
      this.puffs.spawn({ pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.3, 0.1, Math.sin(a) * 0.3)), vel: v, life: 0.5 + Math.random() * 0.3, size: 0.18 + Math.random() * 0.14, color, drag: 3, grow: 1.2 });
    }
  }

  ring(pos, count = 18, power = 7, color = 0xf0e0c0) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.puffs.spawn({ pos: pos.clone(), vel: new THREE.Vector3(Math.cos(a) * power, 0.6, Math.sin(a) * power), life: 0.55, size: 0.3, color, drag: 4, grow: 1.5 });
    }
  }

  sparkle(pos, count = 12, color = 0xffe066, power = 4) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(power * (0.5 + Math.random()));
      this.sparks.spawn({ pos: pos.clone(), vel: v, life: 0.5 + Math.random() * 0.4, size: 0.08 + Math.random() * 0.08, color, drag: 2.5, grav: 3 });
    }
  }

  trail(pos, color = 0xffffff, size = 0.12) {
    this.sparks.spawn({ pos: pos.clone(), vel: new THREE.Vector3(0, 0.3, 0), life: 0.3, size, color, drag: 1 });
  }

  update(dt) {
    this.puffs.update(dt);
    this.sparks.update(dt);
  }
}
