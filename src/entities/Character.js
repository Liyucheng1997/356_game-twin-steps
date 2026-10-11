import * as THREE from 'three';
import { buildDoll } from './models.js';

const GRAVITY = 32;
const JUMP_V = 11.5;
const JUMP2_V = 10.5;
const RUN_SPEED = 7.5;
const AIM_SPEED = 4;
const DASH_SPEED = 19;
const DASH_TIME = 0.18;
const POUND_SPEED = 42;
const HALF = 0.4;
const RADIUS = 0.35;
export const CENTER = HALF + RADIUS; // body center height above feet

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const angleDamp = (a, b, rate, dt) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-rate * dt));
};

export class Character {
  constructor(game, kind, feetPos, yaw) {
    this.game = game;
    this.kind = kind;
    this.isMay = kind === 'may';
    this.name = this.isMay ? '小梅' : '小柯';
    this.model = buildDoll(kind);
    game.scene.add(this.model.root);

    this.pos = feetPos.clone().add(new THREE.Vector3(0, CENTER, 0));
    this.vel = new THREE.Vector3();
    this.yaw = yaw;
    this.frameDelta = new THREE.Vector3();
    this.collider = game.physics.addCapsule(HALF, RADIUS, this.pos, this);

    const cc = game.physics.world.createCharacterController(0.02);
    cc.setUp({ x: 0, y: 1, z: 0 });
    cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    cc.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    cc.enableAutostep(0.35, 0.15, false);
    cc.enableSnapToGround(0.3);
    cc.setSlideEnabled(true);
    this.cc = cc;

    this.mode = 'normal'; // normal | poundWind | poundFall | poundLand | swing
    this.grounded = false;
    this.groundOwner = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumpsLeft = 1;
    this.airDash = true;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDir = new THREE.Vector3();
    this.modeTimer = 0;
    this.flipT = -1;
    this.squash = 0;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.attackT = 0;
    this.attackHit = false;
    this.throwT = 0;
    this.aiming = false;
    this.launchT = 0;
    this.noControlT = 0;

    this.hp = 3;
    this.invuln = 0;
    this.dead = false;
    this.deadTimer = 0;
    this.deaths = 0;
    this.checkpoint = { pos: feetPos.clone(), yaw };

    this.swing = null; // { nail, length }
    if (this.isMay) {
      // tether drawn between May's hammer and the nail while swinging
      this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), new THREE.MeshStandardMaterial({ color: 0xffe7a0, emissive: 0x806020, emissiveIntensity: 0.6 }));
      this.rope.visible = false;
      game.scene.add(this.rope);
    }
    this.move = new THREE.Vector3();
    this.blinkT = 2 + Math.random() * 3;
  }

  get feet() { return tmp2.copy(this.pos).addScaledVector(UP, -CENTER); }
  get facing() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  handWorld(out = new THREE.Vector3()) {
    this.model.root.updateMatrixWorld(true);
    return this.model.armR.localToWorld(out.set(0, -0.37, 0));
  }

  // Lets a character standing on the partner's head ride along.
  deltaAt() { return this.frameDelta.clone(); }

  setCheckpoint(feetPos, yaw) {
    this.checkpoint = { pos: feetPos.clone(), yaw };
  }

  update(dt, input, camYaw) {
    this.time += dt;
    const start = this.pos.clone();
    if (this.dead) {
      this.deadTimer -= dt;
      if (this.deadTimer <= 0) this.respawn();
      this.frameDelta.set(0, 0, 0);
      return;
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.launchT = Math.max(0, this.launchT - dt);
    this.throwT = Math.max(0, this.throwT - dt);

    // --- Ride moving platforms (teleport by the platform's motion, before collision) ---
    if (this.groundOwner && this.groundOwner.deltaAt && this.mode !== 'swing') {
      const d = this.groundOwner.deltaAt(this.feet.clone());
      if (d && d.lengthSq() > 1e-10) {
        this.pos.add(d);
        this.collider.setTranslation(this.pos);
      }
    }

    // --- Read input ---
    let mx = 0, mz = 0;
    let wantJump = false, jumpHeld = false, wantDash = false, wantPound = false, wantInteract = false, wantAttack = false;
    this.aiming = false;
    if (input) {
      if (input.isDown('KeyW', 'ArrowUp')) mz += 1;
      if (input.isDown('KeyS', 'ArrowDown')) mz -= 1;
      if (input.isDown('KeyD', 'ArrowRight')) mx += 1;
      if (input.isDown('KeyA', 'ArrowLeft')) mx -= 1;
      wantJump = input.wasPressed('Space');
      jumpHeld = input.isDown('Space');
      wantDash = input.wasPressed('ShiftLeft', 'ShiftRight');
      wantPound = input.wasPressed('KeyC');
      wantInteract = input.wasPressed('KeyE');
      wantAttack = input.mousePressed[0] || input.wasPressed('KeyF');
      if (!this.isMay) this.aiming = input.mouseDown[2] || input.isDown('KeyQ');
      if (!this.isMay && input.wasPressed('KeyR')) this.game.nails.recall();
    }
    const fwd = tmp.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
    const right = new THREE.Vector3(Math.cos(camYaw), 0, -Math.sin(camYaw));
    this.move.set(0, 0, 0).addScaledVector(fwd, mz).addScaledVector(right, mx);
    if (this.move.lengthSq() > 1) this.move.normalize();
    if (this.mode === 'poundWind' || this.mode === 'poundFall' || this.mode === 'poundLand') this.move.set(0, 0, 0);

    // --- Abilities ---
    if (wantInteract) {
      if (this.mode === 'swing') this.releaseSwing(false);
      else if (this.isMay && this.tryGrab()) { /* grabbed */ }
      else this.game.interact(this);
    }
    if (wantAttack && this.mode !== 'poundWind' && this.mode !== 'poundFall') {
      if (this.isMay) {
        if (this.attackT <= 0 && this.mode !== 'swing') {
          this.attackT = 0.42;
          this.attackHit = false;
          this.game.audio.play('whoosh');
        }
      } else if (this.game.nails.throw(this)) {
        this.throwT = 0.25;
      }
    }
    if (this.attackT > 0) {
      this.attackT -= dt;
      if (!this.attackHit && this.attackT < 0.26) {
        this.attackHit = true;
        this.game.hammerHit(this);
      }
    }

    if (this.mode === 'swing') {
      this.updateSwing(dt, wantJump);
    } else {
      this.updateNormal(dt, { wantJump, jumpHeld, wantDash, wantPound });
    }

    // --- Collide & move ---
    const desired = this.vel.clone().multiplyScalar(dt);
    if (this.vel.y > 0.1 || this.mode === 'swing' || this.launchT > 0) this.cc.disableSnapToGround();
    else this.cc.enableSnapToGround(0.3);
    this.cc.computeColliderMovement(this.collider, desired);
    const mv = this.cc.computedMovement();
    this.pos.x += mv.x; this.pos.y += mv.y; this.pos.z += mv.z;
    this.collider.setTranslation(this.pos);

    const wasGrounded = this.grounded;
    const impactVy = this.vel.y;
    this.grounded = this.cc.computedGrounded() && this.vel.y <= 0.5 && this.launchT <= 0;

    if (this.mode === 'swing') {
      // a swing that gets blocked loses velocity along the blocked direction
      if (dt > 0) this.vel.set(mv.x / dt, mv.y / dt, mv.z / dt);
      if (this.grounded) this.releaseSwing(false);
    } else {
      if (this.vel.y > 0 && mv.y < desired.y * 0.5 && !this.grounded) this.vel.y = 0; // bonk ceiling
      if (this.grounded) {
        if (!wasGrounded) this.onLand(impactVy);
        if (this.vel.y < 0) this.vel.y = -1;
      }
    }

    // --- What are we standing on? ---
    this.groundOwner = null;
    if (this.grounded) {
      const hit = this.game.physics.raycast(this.pos, DOWN, CENTER + 0.35, this.collider);
      if (hit) this.groundOwner = hit.owner || null;
    }

    if (this.pos.y < -18) this.die();

    // --- Facing ---
    let targetYaw = this.yaw;
    if (this.aiming || this.throwT > 0) targetYaw = camYaw + Math.PI;
    else if (this.mode === 'swing') {
      if (this.vel.x * this.vel.x + this.vel.z * this.vel.z > 1) targetYaw = Math.atan2(this.vel.x, this.vel.z);
    } else if (this.dashTimer > 0) targetYaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    else if (this.move.lengthSq() > 0.01) targetYaw = Math.atan2(this.move.x, this.move.z);
    else if (!input) {
      // idle partner turns toward the player character
      const other = this.game.other(this);
      if (other && other.pos.distanceTo(this.pos) < 12) targetYaw = Math.atan2(other.pos.x - this.pos.x, other.pos.z - this.pos.z);
    }
    this.yaw = angleDamp(this.yaw, targetYaw, this.aiming ? 25 : 14, dt);

    this.frameDelta.subVectors(this.pos, start);
    this.animate(dt, !!input);
  }

  updateNormal(dt, { wantJump, jumpHeld, wantDash, wantPound }) {
    const grounded = this.grounded;
    if (grounded) {
      this.coyote = 0.1;
      this.jumpsLeft = 1;
      this.airDash = true;
    } else this.coyote = Math.max(0, this.coyote - dt);
    if (wantJump) this.jumpBuffer = 0.13;

    if (this.mode === 'normal') {
      if (this.jumpBuffer > 0 && (grounded || this.coyote > 0)) {
        this.vel.y = JUMP_V;
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.grounded = false;
        this.squash = -0.18;
        this.game.audio.play('jump');
        this.game.particles.dust(this.feet, 6, 2);
      } else if (wantJump && !grounded && this.coyote <= 0 && this.jumpsLeft > 0) {
        this.vel.y = JUMP2_V;
        this.jumpsLeft = 0;
        this.jumpBuffer = 0;
        this.flipT = 0;
        this.game.audio.play('jump2');
        this.game.particles.ring(this.feet, 10, 3.5, 0xffffff);
      }

      if (wantDash && this.dashCooldown <= 0 && (grounded || this.airDash)) {
        this.dashTimer = DASH_TIME;
        this.dashCooldown = 0.45;
        if (!grounded) this.airDash = false;
        this.dashDir.copy(this.move.lengthSq() > 0.01 ? this.move : this.facing).setY(0).normalize();
        this.game.audio.play('dash');
        this.game.particles.dust(this.pos, 6, 3, 0xffffff);
      }

      if (wantPound && !grounded && this.launchT <= 0) {
        this.mode = 'poundWind';
        this.modeTimer = 0.22;
        this.dashTimer = 0;
        this.game.audio.play('poundStart');
      }
    }

    if (this.mode === 'poundWind') {
      this.vel.set(0, 0, 0);
      this.modeTimer -= dt;
      if (this.modeTimer <= 0) { this.mode = 'poundFall'; this.vel.y = -POUND_SPEED; }
      return;
    }
    if (this.mode === 'poundFall') {
      this.vel.set(0, -POUND_SPEED, 0);
      return;
    }
    if (this.mode === 'poundLand') {
      this.vel.x = 0; this.vel.z = 0;
      this.vel.y -= GRAVITY * dt;
      this.modeTimer -= dt;
      if (this.modeTimer <= 0) this.mode = 'normal';
      return;
    }

    // horizontal
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.vel.x = this.dashDir.x * DASH_SPEED;
      this.vel.z = this.dashDir.z * DASH_SPEED;
      if (!grounded) this.vel.y = Math.max(this.vel.y, 0.5);
      if (Math.random() < 0.7) this.game.particles.trail(this.pos, this.isMay ? 0xff9d8f : 0x9fdcff, 0.1);
    } else if (this.noControlT > 0) {
      this.noControlT -= dt;
    } else {
      const speed = this.aiming ? AIM_SPEED : RUN_SPEED;
      const tx = this.move.x * speed, tz = this.move.z * speed;
      const hasInput = this.move.lengthSq() > 0.01;
      // keep momentum in the air when there's no input
      const accel = grounded ? 70 : hasInput ? 22 : 5;
      const dx = tx - this.vel.x, dz = tz - this.vel.z;
      const dl = Math.hypot(dx, dz);
      const stepA = accel * dt;
      if (dl <= stepA) { this.vel.x = tx; this.vel.z = tz; }
      else { this.vel.x += (dx / dl) * stepA; this.vel.z += (dz / dl) * stepA; }
    }

    // vertical
    if (!(this.dashTimer > 0 && !grounded)) {
      let g = GRAVITY;
      if (this.vel.y > 0 && !jumpHeld && this.launchT <= 0 && this.flipT < 0) g *= 1.7; // short hop
      this.vel.y = Math.max(this.vel.y - g * dt, -45);
    }
  }

  onLand(impactVy) {
    this.noControlT = 0;
    if (this.mode === 'poundFall') {
      this.mode = 'poundLand';
      this.modeTimer = 0.22;
      this.squash = 0.35;
      this.game.onGroundPound(this);
      return;
    }
    this.flipT = -1;
    if (impactVy < -6) {
      this.squash = Math.min(0.3, -impactVy / 70);
      this.game.audio.play('land');
      this.game.particles.dust(this.feet, impactVy < -15 ? 10 : 5, 2.5);
    }
  }

  // ---------- May: hammer-claw swing on Cody's nails ----------
  tryGrab() {
    if (this.grounded || this.mode !== 'normal') return false;
    const anchor = this.game.nails.findAnchor(this.pos);
    if (!anchor) return false;
    const d = this.pos.distanceTo(anchor.point);
    this.swing = { nail: anchor.nail, length: THREE.MathUtils.clamp(d, 2.6, 4.2) };
    this.mode = 'swing';
    this.dashTimer = 0;
    this.flipT = -1;
    this.game.audio.play('grab');
    this.game.particles.sparkle(anchor.point, 10, 0xfff2a8, 3);
    return true;
  }

  updateSwing(dt, wantJump) {
    const nail = this.swing.nail;
    if (!nail || nail.state !== 'stuck') { this.releaseSwing(false); return; }
    const anchor = nail.anchorWorld();
    // gravity + player pumping
    this.vel.y -= GRAVITY * dt;
    this.vel.addScaledVector(this.move, 16 * dt);
    this.vel.multiplyScalar(1 - 0.15 * dt);
    // reel toward desired length smoothly
    const d = this.pos.clone().addScaledVector(this.vel, dt).sub(anchor);
    const len = d.length() || 1;
    const L = damp(len, this.swing.length, 10, dt);
    const p = anchor.clone().addScaledVector(d, L / len);
    if (dt > 0) this.vel.subVectors(p, this.pos).divideScalar(dt);
    if (wantJump) this.releaseSwing(true);
  }

  releaseSwing(boost) {
    if (this.mode !== 'swing') return;
    this.mode = 'normal';
    this.swing = null;
    if (this.rope) this.rope.visible = false;
    if (boost) {
      this.vel.x *= 1.15; this.vel.z *= 1.15;
      this.vel.y = Math.max(this.vel.y, 0) + 8;
      this.game.audio.play('jump2');
      this.flipT = 0;
    }
    this.jumpsLeft = 1;
    this.airDash = true;
  }

  // ---------- Health ----------
  hurt(fromPos) {
    if (this.invuln > 0 || this.dead) return;
    this.hp -= 1;
    this.invuln = 1.4;
    this.releaseSwing(false);
    this.mode = 'normal';
    const k = this.pos.clone().sub(fromPos).setY(0);
    if (k.lengthSq() < 1e-4) k.copy(this.facing).negate();
    k.normalize().multiplyScalar(9);
    this.vel.set(k.x, 9, k.z);
    this.launchT = 0.1;
    this.noControlT = 0.35;
    this.game.audio.play('hurt');
    this.game.rigOf(this).shake(0.35);
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.deaths += 1;
    this.deadTimer = 1.1;
    this.releaseSwing(false);
    this.mode = 'normal';
    this.model.root.visible = false;
    this.game.particles.sparkle(this.pos, 24, this.isMay ? 0xff8a7a : 0x8fd4ff, 6);
    this.game.particles.dust(this.pos, 10, 3);
    this.game.audio.play('poof');
    if (this.game.active === this) this.game.hud.fadeFlash();
  }

  respawn() {
    this.dead = false;
    this.hp = 3;
    this.invuln = 1.5;
    this.vel.set(0, 0, 0);
    this.mode = 'normal';
    this.pos.copy(this.checkpoint.pos).add(new THREE.Vector3(0, CENTER + 0.05, 0));
    this.collider.setTranslation(this.pos);
    this.yaw = this.checkpoint.yaw;
    this.groundOwner = null;
    this.model.root.visible = true;
    this.game.particles.sparkle(this.pos, 20, 0xffffff, 4);
    this.game.audio.play('respawn');
    this.game.rigOf(this).snap(this);
  }

  // ---------- Procedural animation ----------
  animate(dt, isActive) {
    const m = this.model;
    m.root.position.copy(this.pos).addScaledVector(UP, -CENTER);
    m.root.rotation.y = this.yaw;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const k = Math.min(1, hs / RUN_SPEED);
    const R = 18;

    let legL = 0, legR = 0, armLx = 0, armRx = 0, armLz = 0.15, armRz = -0.15, lean = 0, bob = 0, tiltX = 0;
    if (this.mode === 'swing') {
      armLx = -2.9; armRx = -2.9; armLz = 0.25; armRz = -0.25;
      const anchor = this.swing.nail.anchorWorld();
      const rel = this.pos.clone().sub(anchor);
      const f = this.facing;
      tiltX = -Math.atan2(rel.x * f.x + rel.z * f.z, -rel.y) * 0.9;
      legL = 0.3 + Math.sin(this.time * 4) * 0.2; legR = -0.2 - Math.sin(this.time * 4) * 0.2;
    } else if (this.mode === 'poundWind') {
      legL = -1.4; legR = -1.4; armLx = -1; armRx = -1; armLz = 0.9; armRz = -0.9;
      tiltX = (1 - this.modeTimer / 0.22) * Math.PI * 2;
    } else if (this.mode === 'poundFall') {
      armLz = 2.6; armRz = -2.6; legL = 0.1; legR = -0.1;
    } else if (this.mode === 'poundLand') {
      legL = -0.6; legR = -0.6; armLz = 1.4; armRz = -1.4; bob = -0.12;
    } else if (this.dashTimer > 0) {
      lean = 0.7; armLx = 1.2; armRx = 1.2; legL = 0.6; legR = -0.6;
    } else if (this.grounded) {
      if (hs > 0.3) this.phase += dt * (5 + hs * 1.25);
      const s = Math.sin(this.phase);
      legL = s * 0.95 * k; legR = -s * 0.95 * k;
      armLx = -s * 0.85 * k; armRx = s * 0.85 * k;
      bob = Math.abs(Math.cos(this.phase)) * 0.07 * k + Math.sin(this.time * 2.2) * 0.008;
      lean = 0.14 * k;
    } else {
      const rising = this.vel.y > 0;
      legL = rising ? 0.7 : 0.3; legR = rising ? -0.5 : -0.2;
      armLx = rising ? -0.6 : -0.2; armRx = rising ? -0.6 : -0.2;
      armLz = rising ? 1.3 : 1.7; armRz = rising ? -1.3 : -1.7;
      lean = 0.1;
    }

    if (this.flipT >= 0) {
      this.flipT += dt;
      const p = Math.min(1, this.flipT / 0.42);
      tiltX = (1 - Math.pow(1 - p, 2)) * Math.PI * 2;
      legL = -1.2; legR = -1.2;
      if (p >= 1) this.flipT = -1;
    }

    // Hammer swing (May)
    if (this.isMay) {
      const attacking = this.attackT > 0;
      if (attacking) {
        const p = 1 - this.attackT / 0.42;
        armRx = p < 0.38 ? THREE.MathUtils.lerp(0, -3.0, p / 0.38) : THREE.MathUtils.lerp(-3.0, 0.9, Math.min(1, (p - 0.38) / 0.18));
        armRz = -0.2;
        lean += p > 0.4 ? 0.25 : -0.1;
      }
      const showHand = attacking || this.mode === 'swing';
      m.hammerHand.visible = showHand;
      m.hammerBack.visible = !showHand;
      if (this.mode === 'swing') m.hammerHand.rotation.x = Math.PI; else m.hammerHand.rotation.x = Math.PI / 2;
      this.rope.visible = this.mode === 'swing';
      if (this.rope.visible) {
        m.root.updateMatrixWorld(true);
        const a = m.hammerHand.localToWorld(new THREE.Vector3(0, 0.8, 0));
        const b = this.swing.nail.anchorWorld();
        this.rope.position.copy(a).add(b).multiplyScalar(0.5);
        this.rope.scale.y = a.distanceTo(b);
        this.rope.quaternion.setFromUnitVectors(UP, b.sub(a).normalize());
      }
    } else {
      if (this.aiming) { armRx = -1.55; armRz = -0.05; }
      if (this.throwT > 0) { const p = 1 - this.throwT / 0.25; armRx = THREE.MathUtils.lerp(-2.6, 0.4, Math.min(1, p * 2)); }
      const held = this.game.nails.heldCount();
      m.quiver.forEach((n, i) => { n.visible = i < held; });
    }

    m.legL.rotation.x = damp(m.legL.rotation.x, legL, R, dt);
    m.legR.rotation.x = damp(m.legR.rotation.x, legR, R, dt);
    m.armL.rotation.x = damp(m.armL.rotation.x, armLx, R, dt);
    m.armR.rotation.x = (this.isMay && this.attackT > 0) || this.throwT > 0 ? armRx : damp(m.armR.rotation.x, armRx, R, dt);
    m.armL.rotation.z = damp(m.armL.rotation.z, armLz, R, dt);
    m.armR.rotation.z = damp(m.armR.rotation.z, armRz, R, dt);
    m.rig.position.y = damp(m.rig.position.y, -CENTER + bob, 25, dt);
    if (this.flipT >= 0 || this.mode === 'poundWind') m.tilt.rotation.x = tiltX;
    else m.tilt.rotation.x = angleDamp(m.tilt.rotation.x, tiltX + lean, 14, dt);

    // squash & stretch
    this.squash = damp(this.squash, 0, 9, dt);
    const sq = this.squash;
    m.root.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);

    // head: look at partner when idle, blink
    const other = this.game.other(this);
    let headYaw = 0;
    if (!isActive && other) {
      const a = Math.atan2(other.pos.x - this.pos.x, other.pos.z - this.pos.z) - this.yaw;
      headYaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(a), Math.cos(a)), -0.9, 0.9);
    }
    m.head.rotation.y = damp(m.head.rotation.y, headYaw, 8, dt);
    m.head.rotation.x = damp(m.head.rotation.x, this.aiming ? -0.15 : 0, 8, dt);
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    m.eyeL.scale.y = 1.1 * blink;
    m.eyeR.scale.y = 1.1 * blink;

    m.root.visible = !this.dead && !(this.invuln > 0 && this.invuln < 1.35 && Math.floor(this.time * 16) % 2 === 0);
  }
}
