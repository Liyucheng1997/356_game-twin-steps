import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { Audio } from '../core/Audio.js';
import { Particles } from '../core/Particles.js';
import { Character } from '../entities/Character.js';
import { NailSystem } from '../entities/Nails.js';
import { Lever } from '../entities/Entities.js';
import { Level } from '../level/Level.js';
import { Environment } from '../level/Environment.js';
import { CameraRig } from './CameraRig.js';
import { Hud } from '../ui/Hud.js';

export class Game {
  constructor(canvas, physics) {
    this.canvas = canvas;
    this.physics = physics;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    this.scene = new THREE.Scene();

    this.time = 0;
    this.playTime = 0;
    this.collected = 0;
    this.state = 'title';
    this.split = true;
    this.aimHot = false;

    this.input = new Input(canvas);
    this.audio = new Audio();
    this.particles = new Particles(this.scene);
    this.level = new Level(this);
    this.env = new Environment(this);
    this.nails = new NailSystem(this);
    this.level.build();

    const s = this.spawn;
    this.may = new Character(this, 'may', s.may, s.yaw);
    this.cody = new Character(this, 'cody', s.cody, s.yaw);
    this.characters = [this.may, this.cody];
    this.rigs = new Map([[this.may, new CameraRig(this, this.may)], [this.cody, new CameraRig(this, this.cody)]]);
    this.active = this.may;
    this.hud = new Hud(this);
    this.hud.layout(this.split, 'may');

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this.lastT = performance.now();
    renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------ helpers
  other(ch) { return ch === this.may ? this.cody : this.may; }
  rigOf(ch) { return this.rigs.get(ch); }
  interactables() { return this.level.entities.filter((e) => e.canInteract); }
  leverPulled() { return this.level.entities.some((e) => e instanceof Lever && e.pulled); }

  start() {
    this.audio.init();
    this.audio.startMusic();
    this.state = 'playing';
    this.hud.show();
    this.input.requestLock();
    this.hud.say([
      ['may', '小柯……我们怎么变成玩偶了？！'],
      ['cody', '这是咱家的工具棚？我们缩小了！'],
      ['book', '嗨嗨～我是爱情魔法书！想变回去？那就一起来找我吧～'],
      ['may', '……那本书刚才是不是说话了？'],
    ]);
  }

  pause() {
    this.state = 'paused';
    document.getElementById('pause').classList.remove('hidden');
  }

  resume() {
    document.getElementById('pause').classList.add('hidden');
    this.state = 'playing';
    this.input.requestLock();
    this.lastT = performance.now();
  }

  switchActive() {
    this.active = this.other(this.active);
    this.audio.play('switch');
    this.hud.layout(this.split, this.active.kind);
    this.particles.sparkle(this.active.pos.clone().add(new THREE.Vector3(0, 1, 0)), 10, this.active.isMay ? 0xff9d8f : 0x9fdcff, 2.5);
  }

  // ------------------------------------------------------------ gameplay events
  interact(ch) {
    let best = null;
    for (const it of this.interactables()) if (it.canInteract(ch)) { best = it; break; }
    if (best) best.interact(ch);
  }

  hammerHit(may) {
    const p = may.pos.clone().addScaledVector(may.facing, 1.0);
    let hit = false;
    for (const h of this.level.hammerables) {
      if (h.hitTest(p, 1.0)) { h.onHammer(may); hit = true; }
    }
    const impact = p.clone().add(new THREE.Vector3(0, -0.4, 0));
    if (hit) {
      this.audio.play('hammer');
      this.particles.sparkle(impact, 14, 0xfff2a8, 5);
      this.rigOf(may).shake(0.25);
    } else if (may.grounded) {
      this.audio.play('land');
      this.particles.dust(impact.setY(may.pos.y - 0.7), 5, 2);
    }
  }

  onGroundPound(ch) {
    this.audio.play('pound');
    this.particles.ring(ch.feet, 20, 8);
    this.rigOf(ch).shake(0.5);
    const owner = ch.groundOwner || (() => {
      const hit = this.physics.raycast(ch.pos, new THREE.Vector3(0, -1, 0), 1.2, ch.collider);
      return hit && hit.owner;
    })();
    if (owner && owner.entity && owner.entity.onPound) owner.entity.onPound(ch);
    if (owner && owner.smash) owner.smash();
    for (const e of this.level.enemies) {
      if (e.alive && e.pos.distanceTo(ch.feet) < 2.4) e.kill();
    }
  }

  onLaunched(ch) {
    this.audio.play('jump2');
    this.rigOf(ch).shake(0.3);
  }

  onCollect() {
    this.collected += 1;
  }

  win() {
    this.state = 'won';
    this.audio.play('victory');
    this.hud.say([['book', '看到了吗？只要两个人一起努力，就没有过不去的坎！']]);
    for (const c of this.characters) this.particles.sparkle(c.pos, 30, 0xffd34d, 6);
    setTimeout(() => {
      document.exitPointerLock?.();
      const t = Math.floor(this.playTime);
      const deaths = this.may.deaths + this.cody.deaths;
      document.getElementById('end-stats').innerHTML =
        `用时 <b>${Math.floor(t / 60)} 分 ${t % 60} 秒</b><br>` +
        `收集爱心碎片 <b>${this.collected} / ${this.level.collectibles.length}</b><br>` +
        `倒下次数 <b>${deaths}</b>`;
      document.getElementById('end').classList.remove('hidden');
    }, 3200);
  }

  // ------------------------------------------------------------ loop
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.width = w; this.height = h;
  }

  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.lastT) / 1000, 1 / 30);
    this.lastT = now;
    const playing = this.state === 'playing' || this.state === 'won';
    if (this.state !== 'paused' && this.state !== 'title') this.update(dt, playing);
    else if (this.state === 'title') this.updateTitle(dt);
    this.render();
    this.input.endFrame();
  }

  updateTitle(dt) {
    this.time += dt;
    // slow orbit around the start area
    for (const [ch, rig] of this.rigs) {
      rig.yaw += dt * 0.08;
      rig.update(dt, null);
      ch.animate(dt, false);
    }
    this.env.update(dt, this.may.pos);
    this.particles.update(dt);
  }

  update(dt, playing) {
    const input = this.input;
    this.time += dt;
    if (this.state === 'playing') this.playTime += dt;

    if (input.wasPressed('Tab')) this.switchActive();
    if (input.wasPressed('KeyV')) { this.split = !this.split; this.hud.layout(this.split, this.active.kind); }
    if (input.wasPressed('KeyM')) this.hud.toast(this.audio.toggleMute() ? '已静音' : '声音开启');
    if (input.wasPressed('Escape') && !input.locked && this.state === 'playing') { this.pause(); return; }

    this.level.update(dt);
    this.physics.step(dt);
    const controlling = this.state === 'playing';
    for (const ch of this.characters) {
      ch.update(dt, controlling && ch === this.active ? input : null, this.rigOf(ch).yaw);
    }
    this.nails.update(dt);

    for (const [ch, rig] of this.rigs) rig.update(dt, controlling && ch === this.active ? input : null);

    // crosshair feedback: is Cody aiming at something nailable?
    if (this.cody.aiming) {
      const cam = this.rigOf(this.cody).camera;
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      const hit = this.physics.raycast(cam.position, dir, 120, undefined, this.nails.excludeChars);
      this.aimHot = !!(hit && hit.owner && hit.owner.nailable);
    }

    // shadows follow the action
    const a = this.active.pos, b = this.other(this.active).pos;
    const focus = this.split && a.distanceTo(b) < 40 ? a.clone().add(b).multiplyScalar(0.5) : a;
    this.env.update(dt, focus);
    this.particles.update(dt);
    this.hud.update(dt);
  }

  render() {
    const r = this.renderer;
    const w = this.width, h = this.height;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    if (this.split) {
      const half = Math.floor(w / 2);
      r.setScissorTest(true);
      const views = [[this.may, 0, half], [this.cody, half, w - half]];
      for (const [ch, x, vw] of views) {
        const cam = this.rigOf(ch).camera;
        if (cam.aspect !== vw / h) { cam.aspect = vw / h; cam.updateProjectionMatrix(); }
        r.setViewport(x, 0, vw, h);
        r.setScissor(x, 0, vw, h);
        r.render(this.scene, cam);
      }
      r.setScissorTest(false);
    } else {
      const cam = this.rigOf(this.active).camera;
      if (cam.aspect !== w / h) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
      r.setViewport(0, 0, w, h);
      r.render(this.scene, cam);
    }
  }

  respawnActive() {
    this.active.die();
  }
}
