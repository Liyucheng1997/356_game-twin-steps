import * as THREE from 'three';
import { Character } from '../entities/Character.js';

const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));

// Third-person orbit camera with wall collision, aim mode and screen shake.
export class CameraRig {
  constructor(game, character) {
    this.game = game;
    this.char = character;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.yaw = character.yaw + Math.PI;
    this.pitch = 0.32;
    this.dist = 7.5;
    this.curDist = 7.5;
    this.aimK = 0;
    this.target = character.pos.clone();
    this.shakeAmt = 0;
    this.notChars = (c) => !(game.physics.ownerOf(c) instanceof Character);
    this.snap(character);
  }

  snap(ch) {
    this.target.copy(ch.pos);
    this.yaw = ch.yaw + Math.PI;
  }

  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  update(dt, input) {
    const ch = this.char;
    if (input) {
      const sens = 0.0024;
      this.yaw -= input.mouseDX * sens;
      this.pitch += input.mouseDY * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.55, 1.25);
    }
    this.aimK = damp(this.aimK, ch.aiming ? 1 : 0, 12, dt);

    // follow target: snappy horizontally, softer vertically while airborne
    const want = ch.pos;
    this.target.x = damp(this.target.x, want.x, 14, dt);
    this.target.z = damp(this.target.z, want.z, 14, dt);
    this.target.y = damp(this.target.y, want.y, ch.grounded || ch.mode === 'swing' ? 9 : 5, dt);
    if (Math.abs(this.target.y - want.y) > 4) this.target.y = want.y - Math.sign(want.y - this.target.y) * 4;

    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pivot = this.target.clone().add(new THREE.Vector3(0, 1.0 + this.aimK * 0.25, 0)).addScaledVector(right, this.aimK * 0.9);
    const dir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    const wantDist = THREE.MathUtils.lerp(this.dist, 3.0, this.aimK);
    let maxDist = wantDist;
    const hit = this.game.physics.raycast(pivot, dir, wantDist + 0.4, undefined, this.notChars);
    if (hit) maxDist = Math.max(0.8, hit.distance - 0.4);
    // pull in fast, ease out slowly
    this.curDist = maxDist < this.curDist ? maxDist : damp(this.curDist, maxDist, 4, dt);

    const cam = this.camera;
    cam.position.copy(pivot).addScaledVector(dir, this.curDist);
    cam.lookAt(pivot);
    if (this.shakeAmt > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt = damp(this.shakeAmt, 0, 8, dt);
    }
    const fov = THREE.MathUtils.lerp(62, 46, this.aimK) + (ch.dashTimer > 0 ? 4 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 10, dt); cam.updateProjectionMatrix(); }
  }
}
