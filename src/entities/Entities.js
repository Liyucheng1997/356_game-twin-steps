import * as THREE from 'three';
import { Character } from './Character.js';
import { rulerTexture, radialGlowTexture } from '../gfx/Textures.js';

const IDENT_Q = new THREE.Quaternion();
const damp = (a, b, r, dt) => a + (b - a) * (1 - Math.exp(-r * dt));
const smooth = (t) => t * t * (3 - 2 * t);

const shadowed = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

// A script-driven group of colliders. Characters standing on it are carried along (deltaAt).
export class Mover {
  constructor(game, entity, { nailable = false } = {}) {
    this.game = game;
    this.entity = entity;
    this.nailable = nailable;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.parts = [];
    this.prev = new THREE.Matrix4();
    this.curr = new THREE.Matrix4();
    this.inv = new THREE.Matrix4();
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    game.level.movers.push(this);
  }

  addBox(size, localPos = new THREE.Vector3(), localQuat = IDENT_Q) {
    const c = this.game.physics.addBox(size, new THREE.Vector3(), null, this);
    this.parts.push({ collider: c, local: new THREE.Matrix4().compose(localPos, localQuat, new THREE.Vector3(1, 1, 1)) });
    return c;
  }

  addCylinder(radius, height, localPos = new THREE.Vector3(), localQuat = IDENT_Q) {
    const c = this.game.physics.addCylinder(radius, height, new THREE.Vector3(), null, this);
    this.parts.push({ collider: c, local: new THREE.Matrix4().compose(localPos, localQuat, new THREE.Vector3(1, 1, 1)) });
    return c;
  }

  add(obj) { this.group.add(shadowed(obj)); return obj; }

  setPose(pos, quat) {
    if (pos) this.group.position.copy(pos);
    if (quat) this.group.quaternion.copy(quat);
    this.sync();
  }

  sync() {
    this.group.updateMatrixWorld(true);
    this.curr.copy(this.group.matrixWorld);
    for (const p of this.parts) {
      this._m.multiplyMatrices(this.curr, p.local).decompose(this._p, this._q, this._s);
      this.game.physics.setPose(p.collider, this._p, this._q);
    }
  }

  init() { this.sync(); this.prev.copy(this.curr); }
  beginFrame() { this.prev.copy(this.curr); }

  deltaAt(p) {
    this.inv.copy(this.prev).invert();
    return p.clone().applyMatrix4(this.inv).applyMatrix4(this.curr).sub(p);
  }

  toLocal(p) {
    this.inv.copy(this.curr).invert();
    return p.clone().applyMatrix4(this.inv);
  }
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };

function targetTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#c58a4e';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(90,50,20,${0.1 + Math.random() * 0.15})`;
    g.beginPath(); g.moveTo(0, Math.random() * 256); g.bezierCurveTo(80, Math.random() * 256, 170, Math.random() * 256, 256, Math.random() * 256); g.stroke();
  }
  [[100, '#f4ead2'], [78, '#d84a3a'], [56, '#f4ead2'], [34, '#d84a3a'], [14, '#f2c230']].forEach(([r, col]) => {
    g.fillStyle = col; g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _targetTex = null;
const targetTex = () => (_targetTex ||= targetTexture());

// ------------------------------------------------------------------
export class PressurePlate {
  constructor(game, pos, color = 0x3fa7e0) {
    this.game = game;
    this.pressed = false;
    this.mover = new Mover(game, this);
    const base = mesh(new THREE.CylinderGeometry(1.45, 1.6, 0.25, 28), std(0x6d6a66, { metalness: 0.6, roughness: 0.4 }), 0, 0.12, 0);
    this.mover.add(base);
    this.top = mesh(new THREE.CylinderGeometry(1.2, 1.25, 0.22, 28), std(color, { emissive: color, emissiveIntensity: 0.15 }), 0, 0.3, 0);
    this.mover.add(this.top);
    this.mover.addBox(new THREE.Vector3(2.5, 0.38, 2.5), new THREE.Vector3(0, 0.19, 0));
    this.mover.setPose(pos);
    this.mover.init();
  }

  update(dt) {
    const g = this.game;
    const was = this.pressed;
    this.pressed = g.characters.some((c) => !c.dead && c.groundOwner === this.mover);
    if (this.pressed !== was) g.audio.play('click');
    this.top.position.y = damp(this.top.position.y, this.pressed ? 0.17 : 0.3, 20, dt);
    this.top.material.emissiveIntensity = damp(this.top.material.emissiveIntensity, this.pressed ? 1.2 : 0.15, 10, dt);
  }
}

// ------------------------------------------------------------------
export class Gate {
  constructor(game, pos, size, isOpen, material) {
    this.game = game;
    this.isOpen = isOpen;
    this.closedY = pos.y;
    this.openY = pos.y + size.y + 0.2;
    this.y = pos.y;
    this.open = false;
    this.mover = new Mover(game, this);
    const door = mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
    this.mover.add(door);
    // metal bars for readability
    const barMat = std(0x55606a, { metalness: 0.8, roughness: 0.35 });
    for (let i = -1; i <= 1; i++) this.mover.add(mesh(new THREE.BoxGeometry(0.18, size.y, size.z + 0.12), barMat, i * size.x * 0.32, 0, 0));
    this.mover.add(mesh(new THREE.BoxGeometry(size.x, 0.2, size.z + 0.14), barMat, 0, size.y * 0.3, 0));
    this.mover.addBox(size);
    this.pos = pos.clone();
    this.mover.setPose(pos);
    this.mover.init();
  }

  update(dt) {
    const open = this.isOpen();
    if (open !== this.open) { this.open = open; this.game.audio.play('rumble'); }
    const target = open ? this.openY : this.closedY;
    const step = 7 * dt;
    if (Math.abs(target - this.y) > 0.001) {
      this.y += THREE.MathUtils.clamp(target - this.y, -step, step);
      this.pos.y = this.y;
      this.mover.setPose(this.pos);
    }
  }
}

// ------------------------------------------------------------------
export class Lever {
  constructor(game, pos, yaw, onPull) {
    this.game = game;
    this.pos = pos.clone();
    this.onPull = onPull;
    this.pulled = false;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.group.rotation.y = yaw;
    const base = mesh(new THREE.BoxGeometry(1.2, 0.5, 0.8), std(0x6a4a2c), 0, 0.25, 0);
    this.group.add(base);
    this.pivot = new THREE.Group();
    this.pivot.position.y = 0.5;
    this.pivot.rotation.x = -0.7;
    const stick = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 10), std(0xb8c0c8, { metalness: 0.8, roughness: 0.3 }), 0, 0.65, 0);
    const knob = mesh(new THREE.SphereGeometry(0.2, 16, 12), std(0xe04a3a), 0, 1.35, 0);
    this.pivot.add(stick, knob);
    this.group.add(this.pivot);
    game.scene.add(shadowed(this.group));
    game.physics.addBox(new THREE.Vector3(1.2, 0.5, 0.8), pos.clone().add(new THREE.Vector3(0, 0.25, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)));
    this.knob = knob;
  }

  canInteract(ch) { return !this.pulled && ch.grounded && ch.pos.distanceTo(this.pos) < 2.4; }
  get prompt() { return '<kbd>E</kbd> 拉动拉杆'; }

  interact() {
    this.pulled = true;
    this.game.audio.play('lever');
    this.knob.material.color.setHex(0x4cc35a);
    this.onPull();
  }

  update(dt) {
    this.pivot.rotation.x = damp(this.pivot.rotation.x, this.pulled ? 0.7 : -0.7, 10, dt);
  }
}

// ------------------------------------------------------------------
export class Elevator {
  constructor(game, bottom, height, mat) {
    this.game = game;
    this.bottom = bottom.clone();
    this.height = height;
    this.active = false;
    this.t = 0;
    this.y = 0;
    this.mover = new Mover(game, this);
    const plat = mesh(new THREE.BoxGeometry(3, 0.6, 3), mat);
    this.mover.add(plat);
    this.light = mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff3b2f, emissive: 0xff3b2f, emissiveIntensity: 1.5 }), 0, 0.35, 1.2);
    this.mover.add(this.light);
    // rails
    const railMat = std(0x8f969c, { metalness: 0.8, roughness: 0.3 });
    [-1.7, 1.7].forEach((x) => {
      const r = mesh(new THREE.BoxGeometry(0.25, height + 1.2, 0.25), railMat, bottom.x + x, bottom.y + height / 2 + 0.3, bottom.z - 1.6);
      game.scene.add(r);
    });
    this.mover.addBox(new THREE.Vector3(3, 0.6, 3));
    this.pos = bottom.clone().add(new THREE.Vector3(0, -0.3, 0));
    this.mover.setPose(this.pos);
    this.mover.init();
  }

  activate() {
    this.active = true;
    this.light.material.color.setHex(0x4cff6a);
    this.light.material.emissive.setHex(0x4cff6a);
  }

  update(dt) {
    if (!this.active) return;
    // cycle: wait bottom 1.5s, rise 3s, wait top 2s, descend 3s
    this.t = (this.t + dt) % 9.5;
    const t = this.t;
    let k;
    if (t < 1.5) k = 0;
    else if (t < 4.5) k = smooth((t - 1.5) / 3);
    else if (t < 6.5) k = 1;
    else k = 1 - smooth((t - 6.5) / 3);
    this.pos.y = this.bottom.y - 0.3 + k * this.height;
    this.mover.setPose(this.pos);
  }
}

// ------------------------------------------------------------------
export class Seesaw {
  constructor(game, pivot, length, width, mats) {
    this.game = game;
    this.pivot = pivot.clone();
    this.rest = 0.27;
    this.angle = this.rest;
    this.target = this.rest;
    this.cool = 0;
    this.mover = new Mover(game, this);
    const plank = mesh(new THREE.BoxGeometry(length, 0.3, width), new THREE.MeshStandardMaterial({ map: rulerTexture(), roughness: 0.5 }));
    this.mover.add(plank);
    // arrows hinting where to stand / pound
    const mkPad = (x, color) => this.mover.add(mesh(new THREE.BoxGeometry(1.6, 0.04, width * 0.8), std(color, { emissive: color, emissiveIntensity: 0.25 }), x, 0.17, 0));
    mkPad(-length / 2 + 1, 0x3fa7e0);
    mkPad(length / 2 - 1, 0xe2574c);
    this.mover.addBox(new THREE.Vector3(length, 0.3, width));
    this.halfLen = length / 2;
    // fulcrum: a big pink eraser (static)
    const eraser = mesh(new THREE.BoxGeometry(1.4, pivot.y - mats.floorY - 0.15, width * 0.9), mats.eraser);
    eraser.position.set(pivot.x, (pivot.y - 0.15 + mats.floorY) / 2, pivot.z);
    game.scene.add(eraser);
    game.physics.addBox(new THREE.Vector3(1.4, pivot.y - mats.floorY - 0.15, width * 0.9), eraser.position);
    this.applyPose();
    this.mover.init();
  }

  applyPose() {
    this.mover.setPose(this.pivot, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.angle));
  }

  onPound(ch) {
    const lx = this.mover.toLocal(ch.pos).x;
    if (lx < 0.8 || this.cool > 0) return;
    this.target = -this.rest;
    this.cool = 1.6;
    this.game.audio.play('launch');
    for (const other of this.game.characters) {
      if (other === ch || other.dead || other.groundOwner !== this.mover) continue;
      if (this.mover.toLocal(other.pos).x > -0.8) continue;
      other.pos.y += 0.4;
      other.collider.setTranslation(other.pos);
      other.vel.set(0, 24, -10.5);
      other.launchT = 0.25;
      other.noControlT = 0.75;
      other.grounded = false;
      other.groundOwner = null;
      other.jumpsLeft = 1;
      other.airDash = true;
      other.flipT = 0;
      this.game.particles.ring(other.feet, 16, 6, 0xffffff);
      this.game.onLaunched(other);
    }
  }

  update(dt) {
    if (this.cool > 0) {
      this.cool -= dt;
      if (this.cool <= 0) this.target = this.rest;
    }
    const speed = this.target < this.angle ? 7 : 1.2;
    const d = this.target - this.angle;
    if (Math.abs(d) > 1e-4) {
      this.angle += THREE.MathUtils.clamp(d, -speed * dt, speed * dt);
      this.applyPose();
    }
  }
}

// ------------------------------------------------------------------
// A square log spinning over a gap; jamming the drive gear with a nail stops it flat.
export class SpinBridge {
  constructor(game, center, length, gearPos, mats) {
    this.game = game;
    this.center = center.clone();
    this.angle = 0.6;
    this.speed = 0;
    this.maxSpeed = 1.7;
    this.jams = 0;
    this.stopAt = null;

    this.beam = new Mover(game, this);
    const s = 2.6;
    this.beam.add(mesh(new THREE.BoxGeometry(s, s, length), mats.log));
    const band = std(0x7d858c, { metalness: 0.85, roughness: 0.3 });
    for (let i = 0; i < 5; i++) {
      const z = -length / 2 + 1 + (i * (length - 2)) / 4;
      this.beam.add(mesh(new THREE.BoxGeometry(s + 0.08, s + 0.08, 0.3), band, 0, 0, z));
    }
    this.beam.addBox(new THREE.Vector3(s, s, length));
    // axle stubs (static, decorative)
    [1, -1].forEach((side) => {
      const ax = mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 14), band, center.x, center.y, center.z + side * (length / 2 + 0.3));
      ax.rotation.x = Math.PI / 2;
      game.scene.add(ax);
    });

    this.gear = new Mover(game, this, { nailable: true });
    const R = 2.2;
    const gearMat = mats.gear;
    const disk = mesh(new THREE.CylinderGeometry(R, R, 0.6, 40), [gearMat, new THREE.MeshStandardMaterial({ map: targetTex(), roughness: 0.7 }), gearMat]);
    disk.rotation.x = Math.PI / 2;
    this.gear.add(disk);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const tooth = mesh(new THREE.BoxGeometry(0.55, 0.6, 0.55), gearMat, Math.cos(a) * (R + 0.2), Math.sin(a) * (R + 0.2), 0);
      tooth.rotation.z = a;
      this.gear.add(tooth);
    }
    this.gear.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), band)).rotation.x = Math.PI / 2;
    this.gear.addCylinder(R + 0.3, 0.6, new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    this.gearPos = gearPos.clone();
    // post + drive rod (static)
    const post = mesh(new THREE.BoxGeometry(0.7, gearPos.y - mats.floorY, 0.7), mats.post, gearPos.x, (gearPos.y + mats.floorY) / 2, gearPos.z - 0.7);
    game.scene.add(post);
    game.physics.addBox(new THREE.Vector3(0.7, gearPos.y - mats.floorY, 0.7), post.position);
    const from = gearPos.clone().add(new THREE.Vector3(0, 0, -0.5));
    const to = new THREE.Vector3(center.x, center.y, center.z + length / 2 + 0.6);
    const rodLen = from.distanceTo(to);
    const rod = mesh(new THREE.CylinderGeometry(0.15, 0.15, rodLen, 10), band);
    rod.position.copy(from).add(to).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    game.scene.add(rod);

    this.applyPose();
    this.beam.init();
    this.gear.init();
  }

  onNail() {
    this.jams += 1;
    this.game.audio.play('click');
  }
  onNailRemoved() { this.jams = Math.max(0, this.jams - 1); }

  applyPose() {
    const zAxis = new THREE.Vector3(0, 0, 1);
    this.beam.setPose(this.center, new THREE.Quaternion().setFromAxisAngle(zAxis, this.angle));
    this.gear.setPose(this.gearPos, new THREE.Quaternion().setFromAxisAngle(zAxis, -this.angle * 1.4));
  }

  get stopped() { return this.jams > 0 && this.speed === 0; }

  update(dt) {
    const q = Math.PI / 2;
    if (this.jams > 0) {
      if (this.stopAt === null) this.stopAt = Math.ceil((this.angle + 0.05) / q) * q;
      if (this.speed > 0) {
        const step = Math.max(this.speed, 0.6) * dt;
        if (this.angle + step >= this.stopAt) {
          this.angle = this.stopAt;
          this.speed = 0;
          this.game.audio.play('click');
          this.game.particles.dust(this.gearPos, 6, 2);
        } else this.angle += step;
      }
    } else {
      this.stopAt = null;
      this.speed = Math.min(this.maxSpeed, this.speed + dt * 1.5);
      this.angle += this.speed * dt;
    }
    this.applyPose();
  }
}

// ------------------------------------------------------------------
export class NailPanel {
  constructor(game, pos, ropeTop, mats) {
    this.game = game;
    this.mover = new Mover(game, this, { nailable: true });
    const board = mesh(new THREE.BoxGeometry(2.4, 2.4, 0.6), [mats.panel, mats.panel, mats.panel, mats.panel, new THREE.MeshStandardMaterial({ map: targetTex(), roughness: 0.7 }), mats.panel]);
    this.mover.add(board);
    this.mover.addBox(new THREE.Vector3(2.4, 2.4, 0.6));
    const ropeMat = std(0xb79a6a, { roughness: 1 });
    [-0.9, 0.9].forEach((x) => {
      const h = ropeTop - (pos.y + 1.2);
      this.mover.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), ropeMat, x, 1.2 + h / 2, 0));
    });
    this.mover.setPose(pos);
    this.mover.init();
  }
  update() {}
}

// ------------------------------------------------------------------
export class HammerButton {
  constructor(game, pos, onPress) {
    this.game = game;
    this.pos = pos.clone();
    this.onPress = onPress;
    this.pressed = false;
    const post = mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.0, 18), std(0x4b4f55, { metalness: 0.6, roughness: 0.4 }), pos.x, pos.y + 0.5, pos.z);
    game.scene.add(post);
    game.physics.addCylinder(0.6, 1.0, new THREE.Vector3(pos.x, pos.y + 0.5, pos.z));
    this.cap = mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.35, 24), std(0xe2574c, { emissive: 0xe2574c, emissiveIntensity: 0.4 }), pos.x, pos.y + 1.15, pos.z);
    game.scene.add(this.cap);
    // hammer icon hovering above
    this.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture('🔨'), depthTest: true, transparent: true }));
    this.icon.scale.setScalar(0.9);
    this.icon.position.set(pos.x, pos.y + 2.4, pos.z);
    game.scene.add(this.icon);
  }

  hitTest(p, r) { return p.distanceTo(this.cap.position) < r + 0.8; }

  onHammer(ch) {
    if (this.pressed || !ch.isMay) return;
    this.pressed = true;
    this.cap.material.color.setHex(0x4cc35a);
    this.cap.material.emissive.setHex(0x4cc35a);
    this.icon.visible = false;
    this.game.audio.play('click');
    this.onPress();
  }

  update(dt) {
    this.cap.position.y = damp(this.cap.position.y, this.pos.y + (this.pressed ? 0.95 : 1.15), 20, dt);
    this.icon.position.y = this.pos.y + 2.4 + Math.sin(this.game.time * 3) * 0.12;
  }
}

function iconTexture(emoji) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,245,220,0.92)';
  g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e2574c'; g.lineWidth = 8; g.stroke();
  g.font = '68px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------
export class Drawbridge {
  constructor(game, hinge, length, width) {
    this.game = game;
    this.hinge = hinge.clone();
    this.angle = -Math.PI / 2;
    this.lowering = false;
    this.t = 0;
    this.mover = new Mover(game, this);
    const tex = rulerTexture();
    tex.center.set(0.5, 0.5);
    tex.rotation = Math.PI / 2;
    const plank = mesh(new THREE.BoxGeometry(width, 0.5, length), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    plank.position.z = length / 2;
    this.mover.add(plank);
    this.mover.addBox(new THREE.Vector3(width, 0.5, length), new THREE.Vector3(0, 0, length / 2));
    this.applyPose();
    this.mover.init();
  }
  lower() { if (!this.lowering) { this.lowering = true; this.game.audio.play('rumble'); } }
  applyPose() { this.mover.setPose(this.hinge, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.angle)); }
  update(dt) {
    if (!this.lowering || this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / 1.6);
    // ease-in fall with a little bounce at the end
    const t = this.t;
    const k = t < 0.8 ? (t / 0.8) ** 2 : 1 - Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.05;
    this.angle = -Math.PI / 2 * (1 - k);
    this.applyPose();
    if (this.t >= 1) {
      this.game.audio.play('pound');
      const tip = this.hinge.clone().add(new THREE.Vector3(0, 0.3, 16));
      this.game.particles.dust(tip, 14, 4);
    }
  }
}

// ------------------------------------------------------------------
export class MovingPlatform {
  constructor(game, a, b, period, mat, size = new THREE.Vector3(3, 0.6, 3)) {
    this.game = game;
    this.a = a.clone(); this.b = b.clone();
    this.period = period;
    this.t = 0;
    this.mover = new Mover(game, this);
    this.mover.add(mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat));
    const trim = std(0xf2c230, { roughness: 0.5 });
    this.mover.add(mesh(new THREE.BoxGeometry(size.x + 0.1, 0.12, size.z + 0.1), trim, 0, -size.y / 2 + 0.06, 0));
    this.mover.addBox(size);
    this.pos = a.clone();
    this.mover.setPose(this.pos);
    this.mover.init();
  }
  update(dt) {
    this.t += dt;
    const k = (1 - Math.cos((this.t / this.period) * Math.PI * 2)) / 2;
    this.pos.lerpVectors(this.a, this.b, k);
    this.mover.setPose(this.pos);
  }
}

// ------------------------------------------------------------------
let heartGeo = null;
function getHeartGeo() {
  if (heartGeo) return heartGeo;
  const s = new THREE.Shape();
  s.moveTo(0, -0.35);
  s.bezierCurveTo(-0.15, -0.2, -0.45, 0.0, -0.4, 0.22);
  s.bezierCurveTo(-0.35, 0.42, -0.08, 0.45, 0, 0.25);
  s.bezierCurveTo(0.08, 0.45, 0.35, 0.42, 0.4, 0.22);
  s.bezierCurveTo(0.45, 0.0, 0.15, -0.2, 0, -0.35);
  heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 10 });
  heartGeo.center();
  return heartGeo;
}
let glowTex = null;

export class Collectible {
  constructor(game, pos, delayed = false) {
    this.game = game;
    this.pos = pos.clone();
    this.taken = false;
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    const m = new THREE.Mesh(getHeartGeo(), new THREE.MeshStandardMaterial({ color: 0xff6f91, emissive: 0xff3d6e, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.25 }));
    m.castShadow = true;
    this.heart = m;
    this.group.add(m);
    glowTex ||= radialGlowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb3c6, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.8);
    this.group.add(glow);
    game.scene.add(this.group);
    this.phase = Math.random() * 6;
    this.spawnT = delayed ? 0 : 1;
  }

  update(dt) {
    if (this.taken) return;
    this.phase += dt;
    this.spawnT = Math.min(1, this.spawnT + dt * 2);
    this.group.position.y = this.pos.y + Math.sin(this.phase * 2.2) * 0.15;
    this.heart.rotation.y += dt * 2.2;
    this.group.scale.setScalar(this.spawnT);
    for (const c of this.game.characters) {
      if (c.dead) continue;
      if (c.pos.distanceTo(this.group.position) < 1.25) { this.collect(); break; }
    }
  }

  collect() {
    this.taken = true;
    this.group.visible = false;
    this.game.audio.play('collect');
    this.game.particles.sparkle(this.group.position, 18, 0xff8fb0, 5);
    this.game.onCollect();
  }
}

// ------------------------------------------------------------------
export class Checkpoint {
  constructor(game, pos, yaw, name) {
    this.game = game;
    this.pos = pos.clone();
    this.yaw = yaw;
    this.name = name;
    this.reached = new Set();
    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.group.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8), std(0xd9d2c5, { metalness: 0.5 }), 0, 1.2, 0));
    this.group.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.15, 16), std(0x6d6a66), 0, 0.07, 0));
    this.flagMay = mesh(new THREE.BoxGeometry(0.7, 0.4, 0.04), std(0x9a8f80), 0.38, 2.15, 0);
    this.flagCody = mesh(new THREE.BoxGeometry(0.7, 0.4, 0.04), std(0x9a8f80), 0.38, 1.7, 0);
    this.group.add(this.flagMay, this.flagCody);
    game.scene.add(shadowed(this.group));
  }

  update() {
    for (const c of this.game.characters) {
      if (c.dead || this.reached.has(c)) continue;
      const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z;
      if (dx * dx + dz * dz < 9 && Math.abs(c.pos.y - this.pos.y - 0.75) < 2.5) {
        this.reached.add(c);
        c.setCheckpoint(this.pos, this.yaw);
        (c.isMay ? this.flagMay : this.flagCody).material.color.setHex(c.isMay ? 0xff6f5e : 0x4fb3ef);
        this.game.audio.play('checkpoint');
        this.game.particles.sparkle(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), 14, 0xfff2a8, 3);
        if (c === this.game.active) this.game.hud.toast('检查点');
      }
    }
    const t = this.game.time;
    this.flagMay.rotation.y = Math.sin(t * 3) * 0.2;
    this.flagCody.rotation.y = Math.sin(t * 3 + 1) * 0.2;
  }
}

// ------------------------------------------------------------------
// Dust mites: fuzzy little enemies. Stomp, ground-pound or hammer them; nails stun them.
export class DustMite {
  constructor(game, pos, bounds) {
    this.game = game;
    this.home = pos.clone();
    this.pos = pos.clone();
    this.bounds = bounds; // {minX,maxX,minZ,maxZ}
    this.alive = true;
    this.stunT = 0;
    this.dir = Math.random() * Math.PI * 2;
    this.turnT = 0;
    this.hopT = Math.random();
    this.group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ color: 0x7d7a80, roughness: 1, flatShading: true }));
    body.castShadow = true;
    this.body = body;
    this.group.add(body);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x5a575e, roughness: 1, flatShading: true });
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 5), spikeMat);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 - 0.2, Math.random() - 0.5).normalize();
      if (v.z > 0.6) v.z = -v.z; // keep the face clear
      sp.position.copy(v).multiplyScalar(0.6);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      body.add(sp);
    }
    const white = std(0xffffff), black = std(0x111111);
    [-1, 1].forEach((s) => {
      const e = mesh(new THREE.SphereGeometry(0.16, 12, 8), white, 0.2 * s, 0.12, 0.5);
      e.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), black, 0, 0, 0.11));
      body.add(e);
      const brow = mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), black, 0.2 * s, 0.32, 0.55);
      brow.rotation.z = -0.5 * s;
      body.add(brow);
    });
    // dizzy stars when stunned
    this.stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xffe066, toneMapped: false }));
      st.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.6, 0, Math.sin((i / 3) * Math.PI * 2) * 0.6);
      this.stars.add(st);
    }
    this.stars.position.y = 0.95;
    this.stars.visible = false;
    this.group.add(this.stars);
    this.group.position.copy(pos);
    game.scene.add(this.group);
  }

  stun() {
    if (!this.alive) return;
    this.stunT = 3.5;
    this.game.audio.play('nailHit');
    this.game.particles.sparkle(this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 8, 0xffe066, 3);
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.group.visible = false;
    this.game.audio.play('poof');
    this.game.particles.dust(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 16, 4, 0x9a979c);
    this.game.particles.sparkle(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 10, 0xffffff, 4);
  }

  hitTest(p, r) { return this.alive && p.distanceTo(this.pos.clone().setY(this.pos.y + 0.6)) < r + 0.7; }
  onHammer() { this.kill(); }

  update(dt) {
    if (!this.alive) return;
    const g = this.game;
    const t = g.time;
    this.stars.visible = this.stunT > 0;
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.stars.rotation.y += dt * 5;
      this.body.rotation.z = Math.sin(t * 8) * 0.2;
    } else {
      this.body.rotation.z = 0;
      // chase the closest character nearby, otherwise wander
      let targetC = null, best = 8;
      for (const c of g.characters) {
        if (c.dead) continue;
        const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
        if (d < best && Math.abs(c.pos.y - this.pos.y) < 3) { best = d; targetC = c; }
      }
      let speed = 1.6;
      if (targetC) {
        this.dir = Math.atan2(targetC.pos.x - this.pos.x, targetC.pos.z - this.pos.z);
        speed = 3.6;
      } else {
        this.turnT -= dt;
        if (this.turnT <= 0) { this.dir += (Math.random() - 0.5) * 2.5; this.turnT = 1 + Math.random() * 2; }
      }
      this.pos.x += Math.sin(this.dir) * speed * dt;
      this.pos.z += Math.cos(this.dir) * speed * dt;
      const b = this.bounds;
      if (this.pos.x < b.minX || this.pos.x > b.maxX || this.pos.z < b.minZ || this.pos.z > b.maxZ) {
        this.pos.x = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
        this.pos.z = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
        this.dir += Math.PI;
      }
      this.hopT += dt * (targetC ? 3.2 : 2.2);
    }
    const hop = this.stunT > 0 ? 0 : Math.abs(Math.sin(this.hopT * Math.PI)) * 0.45;
    this.group.position.set(this.pos.x, this.pos.y + 0.6 + hop, this.pos.z);
    this.group.rotation.y = this.dir;
    const sq = 1 + (0.45 - hop) * 0.25;
    this.body.scale.set(sq, 2 - sq, sq);

    // contact with characters
    for (const c of g.characters) {
      if (c.dead) continue;
      const center = this.group.position;
      const dx = c.pos.x - center.x, dz = c.pos.z - center.z;
      const hd = Math.hypot(dx, dz);
      const feetY = c.pos.y - 0.75;
      if (hd < 1.0 && c.vel.y < 0 && feetY > center.y + 0.1 && feetY < center.y + 1.0) {
        // stomp!
        if (c.mode === 'poundFall') { this.kill(); return; }
        c.vel.y = 13;
        c.jumpsLeft = 1;
        c.airDash = true;
        g.audio.play('bounce');
        this.kill();
        return;
      }
      if (this.stunT <= 0 && hd < 0.95 && Math.abs(c.pos.y - center.y) < 1.2) c.hurt(center);
    }
  }
}

// ------------------------------------------------------------------
export class Crate {
  constructor(game, pos, size, mat, onBreak) {
    this.game = game;
    this.pos = pos.clone();
    this.size = size;
    this.onBreak = onBreak;
    this.broken = false;
    this.mesh = mesh(new THREE.BoxGeometry(size, size, size), mat, pos.x, pos.y + size / 2, pos.z);
    const edge = std(0x5b3a1e);
    const e = size / 2;
    [[0, e, e], [0, e, -e], [0, -e, e], [0, -e, -e]].forEach(([x, y, z]) => this.mesh.add(mesh(new THREE.BoxGeometry(size + 0.06, 0.16, 0.16), edge, x, y, z)));
    [[e, 0, e], [-e, 0, e], [e, 0, -e], [-e, 0, -e]].forEach(([x, y, z]) => this.mesh.add(mesh(new THREE.BoxGeometry(0.16, size, 0.16), edge, x, y, z)));
    const diag = mesh(new THREE.BoxGeometry(0.14, size * 1.3, 0.1), edge, 0, 0, e + 0.03);
    diag.rotation.z = Math.PI / 4;
    this.mesh.add(diag);
    game.scene.add(this.mesh);
    this.collider = game.physics.addBox(new THREE.Vector3(size, size, size), this.mesh.position, null, this);
  }

  hitTest(p, r) { return !this.broken && p.distanceTo(this.mesh.position) < r + this.size * 0.7; }
  onHammer() { this.smash(); }

  smash() {
    if (this.broken) return;
    this.broken = true;
    this.mesh.visible = false;
    this.game.physics.remove(this.collider);
    this.game.audio.play('break');
    this.game.particles.dust(this.mesh.position, 14, 4, 0xb0804a);
    for (let i = 0; i < 10; i++) {
      this.game.particles.puffs.spawn({
        pos: this.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * this.size, (Math.random() - 0.5) * this.size, (Math.random() - 0.5) * this.size)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 8, 4 + Math.random() * 5, (Math.random() - 0.5) * 8),
        life: 0.9, size: 0.18, color: 0x9c6b3a, grav: 25, drag: 0.5,
      });
    }
    this.onBreak?.(this.mesh.position.clone());
  }
  update() {}
}

// ------------------------------------------------------------------
// The talking book — the chapter goal.
export class Goal {
  constructor(game, pos, zone) {
    this.game = game;
    this.pos = pos.clone();
    this.zone = zone; // Box3
    this.done = false;
    this.group = new THREE.Group();
    const cover = std(0xb0302c, { roughness: 0.45 });
    const pages = std(0xfff4dc, { roughness: 0.9 });
    const book = new THREE.Group();
    book.add(mesh(new THREE.BoxGeometry(1.9, 2.6, 0.5), cover));
    book.add(mesh(new THREE.BoxGeometry(1.75, 2.45, 0.52), pages, 0.1, 0, 0));
    const gold = std(0xf2c94c, { metalness: 0.8, roughness: 0.3, emissive: 0x6b4a00, emissiveIntensity: 0.5 });
    const heart = new THREE.Mesh(getHeartGeo(), gold);
    heart.position.set(0, -0.55, 0.3);
    heart.scale.setScalar(0.9);
    book.add(heart);
    const white = std(0xffffff), black = std(0x111111);
    [-1, 1].forEach((s) => {
      const e = mesh(new THREE.SphereGeometry(0.22, 16, 12), white, 0.4 * s, 0.45, 0.25);
      e.scale.z = 0.5;
      e.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), black, 0, -0.02, 0.18));
      book.add(e);
      const brow = mesh(new THREE.BoxGeometry(0.34, 0.06, 0.06), black, 0.4 * s, 0.8, 0.27);
      brow.rotation.z = 0.25 * s;
      book.add(brow);
    });
    const mouth = mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 16, Math.PI), black, 0, 0.05, 0.27);
    mouth.rotation.z = Math.PI;
    book.add(mouth);
    this.book = book;
    this.group.add(book);
    glowTex ||= radialGlowTexture();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd38a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(6);
    this.group.add(glow);
    const light = new THREE.PointLight(0xffc38a, 30, 14, 2);
    light.position.set(0, 0.5, 1.5);
    this.group.add(light);
    this.group.position.copy(pos);
    this.group.rotation.y = 0;
    game.scene.add(shadowed(this.group));
  }

  update(dt) {
    const t = this.game.time;
    this.book.position.y = Math.sin(t * 1.8) * 0.2;
    this.book.rotation.y = Math.sin(t * 0.9) * 0.25;
    if (Math.random() < dt * 12) {
      this.game.particles.sparkle(this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 2)), 1, 0xffe9a8, 1);
    }
    if (this.done) return;
    const inside = this.game.characters.filter((c) => !c.dead && this.zone.containsPoint(c.pos));
    if (inside.length === 2) {
      this.done = true;
      this.game.win();
    }
    this.someoneInside = inside.length === 1;
  }
}

export { Character };
