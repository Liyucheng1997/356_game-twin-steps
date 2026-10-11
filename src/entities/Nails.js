import * as THREE from 'three';
import { buildNailMesh } from './models.js';
import { Character } from './Character.js';

const Z = new THREE.Vector3(0, 0, 1);
const HEAD_LOCAL = new THREE.Vector3(0, 0, -0.48);
const SPEED = 60;

class Nail {
  constructor(scene) {
    this.mat = new THREE.MeshStandardMaterial({ color: 0xc9d1d9, metalness: 0.9, roughness: 0.25, emissive: 0x000000 });
    this.mesh = buildNailMesh(this.mat);
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.state = 'held'; // held | flying | stuck | falling | returning
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.owner = null;
    this.timer = 0;
    this.traveled = 0;
  }

  anchorWorld(out = new THREE.Vector3()) {
    this.mesh.updateWorldMatrix(true, false);
    return this.mesh.localToWorld(out.copy(HEAD_LOCAL));
  }
}

// Cody's three throwable nails.
export class NailSystem {
  constructor(game) {
    this.game = game;
    this.nails = [0, 1, 2].map(() => new Nail(game.scene));
    this.excludeChars = (c) => !(game.physics.ownerOf(c) instanceof Character);
  }

  heldCount() { return this.nails.filter((n) => n.state === 'held').length; }

  throw(cody) {
    const n = this.nails.find((x) => x.state === 'held');
    if (!n) { this.game.audio.play('click'); return false; }
    const cam = this.game.rigOf(cody).camera;
    const camDir = new THREE.Vector3();
    cam.getWorldDirection(camDir);
    const hit = this.game.physics.raycast(cam.position, camDir, 120, undefined, this.excludeChars);
    const target = hit ? hit.point : cam.position.clone().addScaledVector(camDir, 120);
    const origin = cody.handWorld();
    origin.y += 0.25;
    n.pos.copy(origin);
    n.dir.subVectors(target, origin).normalize();
    n.state = 'flying';
    n.traveled = 0;
    this.game.scene.attach(n.mesh);
    n.mesh.visible = true;
    n.mesh.position.copy(n.pos);
    n.mesh.quaternion.setFromUnitVectors(Z, n.dir);
    this.game.audio.play('nailThrow');
    return true;
  }

  recall() {
    let any = false;
    for (const n of this.nails) {
      if (n.state === 'held') continue;
      any = true;
      if (n.state === 'stuck') {
        const owner = n.owner;
        n.owner = null;
        n.mat.emissive.setHex(0x000000);
        this.game.scene.attach(n.mesh);
        n.pos.copy(n.mesh.position);
        owner?.entity?.onNailRemoved?.(n);
      }
      n.state = 'returning';
    }
    if (any) this.game.audio.play('recall');
  }

  findAnchor(pos) {
    let best = null;
    let bestD = 7.5;
    for (const n of this.nails) {
      if (n.state !== 'stuck') continue;
      const p = n.anchorWorld();
      if (p.y < pos.y - 0.5) continue;
      const d = p.distanceTo(pos);
      if (d < bestD) { bestD = d; best = { nail: n, point: p }; }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    const cody = g.cody;
    for (const n of this.nails) {
      switch (n.state) {
        case 'flying': {
          const step = SPEED * dt;
          const hit = g.physics.raycast(n.pos, n.dir, step, undefined, this.excludeChars);
          if (hit) {
            const enemy = g.level.enemyAt(hit.point, 0.1);
            if (hit.owner && hit.owner.nailable) {
              n.state = 'stuck';
              n.owner = hit.owner;
              n.mesh.position.copy(hit.point).addScaledVector(n.dir, 0.1);
              n.mesh.quaternion.setFromUnitVectors(Z, n.dir);
              hit.owner.group.attach(n.mesh);
              n.mat.emissive.setHex(0x8a6a10);
              g.audio.play('nailHit');
              g.particles.sparkle(hit.point, 10, 0xffe9a8, 3);
              g.particles.dust(hit.point, 4, 1.5, 0xc89a62);
              hit.owner.entity?.onNail?.(n);
            } else {
              this.bounce(n, hit.normal);
              if (enemy) enemy.stun();
            }
            break;
          }
          // enemies are not physical; check them directly
          const enemy = g.level.enemyAt(n.pos, 0.7);
          if (enemy) { enemy.stun(); this.bounce(n, n.dir.clone().negate()); break; }
          n.pos.addScaledVector(n.dir, step);
          n.traveled += step;
          n.mesh.position.copy(n.pos);
          if (Math.random() < 0.6) g.particles.trail(n.pos, 0xe8f4ff, 0.06);
          if (n.traveled > 110) n.state = 'returning';
          break;
        }
        case 'falling':
          n.vel.y -= 30 * dt;
          n.pos.addScaledVector(n.vel, dt);
          n.mesh.position.copy(n.pos);
          n.mesh.rotation.x += dt * 14;
          n.timer -= dt;
          if (n.timer <= 0) n.state = 'returning';
          break;
        case 'returning': {
          const target = cody.handWorld();
          const d = target.sub(n.pos);
          const dist = d.length();
          const step = 45 * dt;
          if (dist < step + 0.3) {
            n.state = 'held';
            n.mesh.visible = false;
            break;
          }
          d.divideScalar(dist);
          n.pos.addScaledVector(d, step);
          n.mesh.position.copy(n.pos);
          n.mesh.quaternion.setFromUnitVectors(Z, d.negate());
          if (Math.random() < 0.5) g.particles.trail(n.pos, 0xbfe6ff, 0.05);
          break;
        }
        case 'stuck': {
          // gentle glow pulse so May can spot anchors
          const pulse = 0.5 + 0.5 * Math.sin(g.time * 5);
          n.mat.emissive.setRGB(0.5 * pulse + 0.2, 0.38 * pulse + 0.15, 0.05);
          break;
        }
        default: break;
      }
    }
  }

  bounce(n, normal) {
    n.state = 'falling';
    n.timer = 0.6;
    const r = n.dir.clone().reflect(normal.clone().normalize());
    n.vel.copy(r).multiplyScalar(7).add(new THREE.Vector3(0, 5, 0));
    this.game.audio.play('nailBounce');
    this.game.particles.sparkle(n.pos, 6, 0xffffff, 3);
  }
}
