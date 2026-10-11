import * as THREE from 'three';
import { woodTexture, cardboardTexture, metalTexture } from '../gfx/Textures.js';
import {
  PressurePlate, Gate, Lever, Elevator, Seesaw, SpinBridge, NailPanel, HammerButton,
  Drawbridge, MovingPlatform, Collectible, Checkpoint, DustMite, Crate, Goal,
} from '../entities/Entities.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Scale box UVs to world units so textures keep a constant density on any box size.
function worldUV(geo, w, h, d, unit) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / unit, (uv.getY(i) * dims[f][1]) / unit);
    }
  }
  uv.needsUpdate = true;
}

export class Level {
  constructor(game) {
    this.game = game;
    this.movers = [];
    this.entities = [];
    this.enemies = [];
    this.interactables = [];
    this.hammerables = [];
    this.zones = [];
    this.collectibles = [];
    this.FLOOR_Y = -40;
  }

  // ---------------------------------------------------------------- helpers
  box(w, h, d, x, y, z, mat, o = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    worldUV(geo, w, h, d, o.unit ?? 6);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (o.rotY) m.rotation.y = o.rotY;
    m.castShadow = o.cast !== false;
    m.receiveShadow = true;
    this.game.scene.add(m);
    if (o.collide !== false) {
      this.game.physics.addBox(V(w, h, d), m.position, o.rotY ? m.quaternion : null, o.owner);
    }
    return m;
  }

  slab(x, top, z, w, d, mat, h = 2, o) { return this.box(w, h, d, x, top - h / 2, z, mat, o); }

  cyl(r, h, x, y, z, mat, o = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg ?? 32), mat);
    m.position.set(x, y, z);
    if (o.axis === 'x') m.rotation.z = Math.PI / 2;
    if (o.axis === 'z') m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    this.game.scene.add(m);
    if (o.collide !== false) this.game.physics.addCylinder(r, h, m.position, o.axis ? m.quaternion : null);
    return m;
  }

  legs(x0, x1, z0, z1, bottomY, mat, size = 1.6) {
    const h = bottomY - this.FLOOR_Y;
    [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(([x, z]) => {
      this.box(size, h, size, x, this.FLOOR_Y + h / 2, z, mat, { collide: false });
    });
  }

  // stack of chunky books; a single collider for the whole stack
  bookStack(x, top, z, w, d, bottom) {
    const colors = [0x3c6fb4, 0xd9473b, 0x4f9a5a, 0xe8a33a, 0x7a4fa8, 0x2f8f8f, 0xc75a8a];
    let y = top;
    let i = Math.floor(Math.abs(x * 7 + z * 3 + top * 11));
    while (y > bottom + 0.05) {
      const h = Math.min(y - bottom, 0.9 + ((i * 37) % 5) * 0.12);
      const rot = (((i * 53) % 7) - 3) * 0.02;
      const jx = (((i * 17) % 5) - 2) * 0.08;
      const cover = this.mats.book[i % this.mats.book.length] || new THREE.MeshStandardMaterial({ color: colors[i % colors.length] });
      const b = this.box(w + 0.15, h, d + 0.15, x + jx, y - h / 2, z, cover, { collide: false, rotY: rot });
      const pages = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h * 0.72, d - 0.2), this.mats.pages);
      pages.position.x = 0.04;
      pages.receiveShadow = true;
      b.add(pages);
      y -= h;
      i++;
    }
    this.game.physics.addBox(V(w, top - bottom, d), V(x, (top + bottom) / 2, z));
  }

  zone(min, max, o) { this.zones.push({ box: new THREE.Box3(min, max), ...o, fired: false }); }

  collectible(x, y, z) {
    const c = new Collectible(this.game, V(x, y, z));
    this.entities.push(c);
    this.collectibles.push(c);
    return c;
  }

  add(e) { this.entities.push(e); return e; }

  // ---------------------------------------------------------------- build
  build() {
    const g = this.game;
    const wood = woodTexture();
    const woodDark = woodTexture({ base: '#9c6a3e', dark: '#5a3418', planks: 3, seed: 21 });
    const logTex = woodTexture({ base: '#b57a45', dark: '#6b3f1c', planks: 2, seed: 41 });
    const mats = {
      bench: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.7 }),
      crate: new THREE.MeshStandardMaterial({ map: woodDark, roughness: 0.75 }),
      leg: new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.8 }),
      cardboard: new THREE.MeshStandardMaterial({ map: cardboardTexture(), roughness: 0.95 }),
      log: new THREE.MeshStandardMaterial({ map: logTex, roughness: 0.7 }),
      gear: new THREE.MeshStandardMaterial({ color: 0xc48a52, roughness: 0.65 }),
      panel: new THREE.MeshStandardMaterial({ map: woodDark, roughness: 0.7 }),
      post: new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.8 }),
      eraser: new THREE.MeshStandardMaterial({ color: 0xf28fa6, roughness: 0.9 }),
      metal: new THREE.MeshStandardMaterial({ map: metalTexture(), metalness: 0.75, roughness: 0.35 }),
      pages: new THREE.MeshStandardMaterial({ color: 0xfbf1da, roughness: 0.95 }),
      book: [0x3c6fb4, 0xd9473b, 0x4f9a5a, 0xe8a33a, 0x7a4fa8, 0x2f8f8f, 0xc75a8a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 })),
      paint: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.15 }),
      elevator: new THREE.MeshStandardMaterial({ color: 0x3c8fc7, roughness: 0.4, metalness: 0.3 }),
      platform: new THREE.MeshStandardMaterial({ color: 0xe2574c, roughness: 0.4, metalness: 0.2 }),
    };
    this.mats = mats;

    // ===================== 0. Workbench (start) =====================
    this.slab(0, 0, -4, 24, 32, mats.bench, 3);
    this.legs(-10.5, 10.5, 10.5, -18.5, -3, mats.leg, 2);
    // vise
    this.box(3, 2.2, 2.5, -9.5, 1.1, 9, mats.metal);
    this.box(1.2, 0.5, 4, -9.5, 2.4, 9, mats.paint(0x2f5f9f));
    // pencil
    const pencil = new THREE.Group();
    const pb = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 9, 6), mats.paint(0xf2c230));
    pb.rotation.z = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0xe8c79a }));
    tip.rotation.z = -Math.PI / 2; tip.position.x = 5.25;
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    lead.rotation.z = -Math.PI / 2; lead.position.x = 5.85;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.6, 16), mats.metal);
    band.rotation.z = Math.PI / 2; band.position.x = -4.8;
    const er = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.9, 16), mats.eraser);
    er.rotation.z = Math.PI / 2; er.position.x = -5.55;
    pencil.add(pb, tip, lead, band, er);
    pencil.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    pencil.position.set(4.5, 0.6, -3);
    pencil.rotation.y = 0.15;
    g.scene.add(pencil);
    g.physics.addCylinder(0.6, 12, pencil.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.15, Math.PI / 2)));
    // tape roll
    this.cyl(2, 1.1, -7, 0.55, 1, mats.paint(0xd8c9a8));
    this.cyl(1.1, 1.14, -7, 0.56, 1, new THREE.MeshStandardMaterial({ color: 0x8a6a48 }), { collide: false });
    // paint can steps
    const can = (r, h, x, z, col, base = 0) => {
      this.cyl(r, h, x, base + h / 2, z, mats.paint(col));
      this.cyl(r + 0.08, 0.15, x, base + h + 0.07, z, mats.metal, { collide: false });
      this.cyl(r + 0.02, h * 0.35, x, base + h * 0.5, z, mats.paint(0xfff3dc), { collide: false });
    };
    can(1.3, 1.5, -3, -10, 0x3c8fc7);
    can(1.3, 3.0, 0.5, -13.5, 0xd9473b);
    // scattered screws
    for (let i = 0; i < 5; i++) {
      const s = this.cyl(0.18, 1.6, -9 + i * 4.3, 0.2, 6 - (i % 2) * 14, mats.metal, { axis: 'x', collide: false, seg: 8 });
      s.rotation.y = i;
    }
    g.spawn = { may: V(-1.5, 0, 8), cody: V(1.5, 0, 8), yaw: Math.PI };

    this.zone(V(-12, -1, 0), V(12, 4, 12), { prompt: '<kbd>WASD</kbd> 移动 · <kbd>鼠标</kbd> 转视角 · <kbd>空格</kbd> 跳跃' });
    this.zone(V(-12, -1, -16), V(12, 6, 0), { prompt: '跳到空中再按一次 <kbd>空格</kbd> 可以二段跳' });
    this.collectible(-7, 2.4, 1);
    this.collectible(0.5, 4.3, -13.5);
    this.collectible(5, 2.2, -3.5);
    this.collectible(-9, 1, -15);

    // ===================== 1. Book hopping =====================
    this.bookStack(0, 0, -26, 8, 6, -8);
    this.bookStack(0, 1.8, -33, 6, 4, -8);
    this.bookStack(0, 3.8, -39, 6, 4, -8);
    this.legs(-2, 2, -26, -39, -8, mats.leg, 1.2);
    this.zone(V(-6, 2, -42), V(6, 9, -36), { prompt: '前方很远！二段跳之后按 <kbd>Shift</kbd> 空中冲刺' });
    this.zone(V(-6, -3, -30), V(6, 6, -20), { prompt: '在空中再按 <kbd>空格</kbd> 二段跳' });
    this.collectible(0, 1.2, -26);
    this.collectible(0, 3.0, -33);
    this.collectible(0, 5.2, -39);
    this.collectible(0, 6.6, -44.5);
    this.collectible(0, 5.6, -48);

    // ===================== 2. Pressure-plate gate =====================
    this.slab(0, 3, -71.5, 20, 41, mats.crate, 3);
    this.legs(-8.5, 8.5, -53, -90, 0, mats.leg, 2);
    this.add(new Checkpoint(g, V(0, 3, -54), Math.PI, '大木箱'));
    const wallZ = -70;
    // wall of stacked cardboard boxes (one invisible collider per section)
    const hidden = { collide: true, cast: false };
    this.box(9.4, 9, 1.5, -6.3, 7.5, wallZ, mats.cardboard, hidden).visible = false;
    this.box(9.4, 9, 1.5, 6.3, 7.5, wallZ, mats.cardboard, hidden).visible = false;
    this.box(3.2, 5.4, 1.5, 0, 9.3, wallZ, mats.cardboard, hidden).visible = false;
    const boxMats = [0xc99b62, 0xb98a55, 0xd8ad74].map((c) => new THREE.MeshStandardMaterial({ map: mats.cardboard.map, color: c, roughness: 0.95 }));
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xe6cf9a, roughness: 0.6 });
    const cbox = (x0, x1, y0, y1, seed) => {
      const w = x1 - x0, h = y1 - y0;
      const b = this.box(w - 0.06, h - 0.06, 1.7, (x0 + x1) / 2, (y0 + y1) / 2, wallZ + (seed % 3 - 1) * 0.06, boxMats[seed % 3], { collide: false, unit: 3, rotY: ((seed % 5) - 2) * 0.008 });
      const tape = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.35, 1.74), tapeMat);
      b.add(tape);
    };
    let sd = 1;
    for (const [x0, x1] of [[-11, -1.6], [1.6, 11]]) {
      const w = x1 - x0;
      const m1 = x0 + w * 0.55, m2 = x0 + w * 0.3;
      cbox(x0, m1, 3, 6.6, sd++); cbox(m1, x1, 3, 6.6, sd++);
      cbox(x0, m2, 6.6, 9.4, sd++); cbox(m2, x1, 6.6, 9.4, sd++);
      cbox(x0, x1, 9.4, 12, sd++);
    }
    cbox(-1.6, 1.6, 6.6, 12, sd++);
    const plate1 = this.add(new PressurePlate(g, V(-5, 3, -64)));
    const plate2 = this.add(new PressurePlate(g, V(5, 3, -76)));
    this.add(new Gate(g, V(0, 4.8, wallZ), V(3.2, 3.6, 0.6), () => plate1.pressed || plate2.pressed, mats.crate));
    this.zone(V(-10, 2, -69), V(10, 8, -56), { prompt: '门只在有人<b>站在压力板上</b>时打开。\n按 <kbd>Tab</kbd> 切换角色：一人踩板，另一人通过！' });
    this.zone(V(-10, 2, -80), V(10, 8, -71), { prompt: '里面也有压力板，踩上去帮同伴开门。' });
    this.zone(V(-10, 2, -69), V(10, 8, -58), { once: true, lines: [['may', '门锁住了……得有人一直踩着那块板子。'], ['cody', '我来踩着，你先过去——过去了可别丢下我。']] });
    this.collectible(-5, 4.6, -64);
    this.collectible(8.5, 4.2, -60);
    this.collectible(5, 4.6, -76);
    this.collectible(-8.5, 4.2, -79);

    // ===================== 3. Seesaw launch =====================
    const seesaw = this.add(new Seesaw(g, V(0, 4.2, -82), 8, 2.4, { eraser: mats.eraser, floorY: 3 }));
    can(1.3, 3.2, 6.8, -82, 0x5cb85c, 3);
    this.slab(0, 11, -96, 20, 16, mats.crate, 2);
    this.box(0.9, 6, 0.9, -9.4, 6, -88.6, mats.post);
    this.box(0.9, 6, 0.9, 9.4, 6, -88.6, mats.post);
    this.legs(-8.5, 8.5, -92, -103, 9, mats.leg, 2);
    const elevator = this.add(new Elevator(g, V(-7, 3, -86.3), 8, mats.elevator));
    this.add(new Lever(g, V(-5, 11, -93), 0, () => {
      elevator.activate();
      g.hud.say([['cody', '电梯动起来了！快上来！']]);
    }));
    this.add(new Checkpoint(g, V(3, 11, -92), Math.PI, '高台'));
    this.zone(V(-10, 2, -88), V(10, 9, -78), { prompt: '一人站在尺子的<b style="color:#7cc4ff">蓝色一端</b>；\n另一人跳到<b style="color:#ff8a7a">红色一端</b>上方，空中按 <kbd>C</kbd> 重踏，把同伴弹上去！' });
    this.zone(V(-10, 2, -88), V(10, 9, -79), { once: true, lines: [['cody', '一把尺子跷跷板……我有个疯狂的主意。'], ['may', '你负责飞，我负责踩。']] });
    this.zone(V(-10, 10, -104), V(10, 15, -88), { prompt: '拉下拉杆，启动电梯接同伴上来', who: 'lever' });
    this.collectible(6.8, 7.6, -82);
    this.collectible(-3, 12.6, -87.4);
    this.collectible(-8, 12.2, -102);
    this.seesaw = seesaw;

    // ===================== 4. Spinning log + gear =====================
    const bridge = this.add(new SpinBridge(g, V(0, 9.7, -112), 16, V(5.5, 14.2, -101.5), { log: mats.log, gear: mats.gear, post: mats.post, floorY: 11 }));
    this.bridge = bridge;
    this.slab(0, 11, -124, 12, 8, mats.crate, 2);
    this.legs(-5, 5, -121, -127, 9, mats.leg, 1.6);
    this.add(new Checkpoint(g, V(-3.5, 11, -122), Math.PI, '对岸'));
    this.zone(V(-10, 10, -104), V(10, 16, -94), {
      prompt: '只有小柯的钉子能卡住齿轮——按 <kbd>Tab</kbd> 切换到小柯',
      codyPrompt: '按住 <kbd>右键</kbd> 瞄准，<kbd>左键</kbd> 把钉子钉进木齿轮，卡住旋转木桥！',
      stopped: '木桥停住了，快过去！',
    });
    this.zone(V(-10, 10, -104), V(10, 16, -92), { once: true, lines: [['cody', '那个齿轮是木头做的……看我把它钉住！']] });
    this.collectible(0, 12.4, -108);
    this.collectible(0, 12.4, -116);
    this.collectible(5.5, 12.4, -98.5);

    // ===================== 5. Swing chasm =====================
    // overhead beam held by two tall poles standing just outside the walkways
    this.box(0.8, 0.8, 34.6, 2, 20.4, -136.2, mats.post);
    this.box(0.9, 60.8, 0.9, 2.6, this.FLOOR_Y + 30.4, -119.3, mats.post, { collide: false });
    this.box(0.9, 9, 0.9, 6.5, 15.5, -153, mats.post);
    this.box(5, 0.8, 0.8, 4.25, 20.4, -153, mats.post);
    this.add(new NailPanel(g, V(2, 16.8, -133), 20, mats));
    this.add(new NailPanel(g, V(2, 16.8, -140.5), 20, mats));
    this.slab(0, 11, -163, 16, 34, mats.crate, 2);
    this.legs(-7, 7, -148, -178, 9, mats.leg, 2);
    const drawbridge = this.add(new Drawbridge(g, V(-4.5, 10.75, -146), 18, 3));
    const button = this.add(new HammerButton(g, V(-1, 11, -149.5), () => {
      drawbridge.lower();
      g.hud.say([['cody', '漂亮！不愧是你。'], ['may', '快过来吧，钉子先生。']]);
    }));
    this.hammerables.push(button);
    this.add(new Checkpoint(g, V(5, 11, -152), Math.PI, '吊桥'));
    this.zone(V(-6, 10, -128), V(6, 16, -119), {
      codyPrompt: '把钉子钉进上方两块木靶（<kbd>R</kbd> 召回钉子）',
      mayPrompt: '起跳后靠近发光的钉子按 <kbd>E</kbd> 用锤子勾住摆荡，\n按 <kbd>空格</kbd> 松手飞出去！',
    });
    this.zone(V(-6, 10, -128), V(6, 16, -119), { once: true, lines: [['may', '我的锤子可以勾住钉子！'], ['cody', '那我负责钉，你负责飞。']] });
    this.collectible(2, 14.6, -136.8);
    this.collectible(-4.5, 12.4, -137);

    // ===================== 6. Dust-mite arena =====================
    const bounds = { minX: -7.2, maxX: 7.2, minZ: -178, maxZ: -155 };
    [V(-4, 11, -160), V(4, 11, -166), V(0, 11, -172)].forEach((p) => {
      const e = this.add(new DustMite(g, p, bounds));
      this.enemies.push(e);
      this.hammerables.push(e);
    });
    const loot = (p) => { const c = this.collectible(p.x, p.y + 0.6, p.z); c.spawnT = 0; };
    [V(-6, 11, -158), V(6, 11, -173)].forEach((p) => {
      const c = this.add(new Crate(g, p, 1.5, mats.crate, loot));
      this.hammerables.push(c);
      this.crates = (this.crates || []).concat(c);
    });
    this.zone(V(-8, 10, -160), V(8, 16, -153), { prompt: '<b>灰尘怪！</b> 踩它、重踏或用锤子敲它；\n小柯的钉子能把它钉晕。木箱可以砸开。' });
    this.zone(V(-8, 10, -162), V(8, 16, -153), { once: true, lines: [['may', '那些毛球看起来不太友好……'], ['cody', '工具棚该打扫了。']] });
    this.collectible(-6.5, 12.2, -176);
    this.collectible(6.5, 12.2, -150);

    // moving platform to the finale
    this.add(new MovingPlatform(g, V(0, 10.7, -181.6), V(0, 10.7, -187.4), 5, mats.platform));
    this.collectible(0, 12.6, -184.5);

    // ===================== 7. Finale =====================
    this.slab(0, 11, -197, 12, 15, mats.crate, 2);
    this.legs(-5, 5, -191, -203, 9, mats.leg, 2);
    this.bookStack(0, 12.4, -193.5, 5, 2.4, 11);
    this.bookStack(0, 13.8, -196.5, 6, 3, 11);
    this.bookStack(0, 15.2, -201, 8, 6, 11);
    this.add(new Goal(g, V(0, 17.2, -202.2), new THREE.Box3(V(-4, 14.5, -204.5), V(4, 20, -197.5))));
    this.zone(V(-6, 10, -205), V(6, 20, -189), { once: true, lines: [['book', '哦呼～你们终于一起来到这里啦！']] });
    this.zone(V(-6, 10, -205), V(6, 20, -189), { prompt: '两个人都要来到魔法书面前！' });
    this.collectible(-4, 12.2, -192);
    this.collectible(4, 12.2, -192);
  }

  // ---------------------------------------------------------------- runtime
  update(dt) {
    for (const m of this.movers) m.beginFrame();
    for (const e of this.entities) e.update(dt);
    // one-shot dialogue zones
    for (const z of this.zones) {
      if (!z.lines || z.fired) continue;
      if (this.game.characters.some((c) => !c.dead && z.box.containsPoint(c.pos))) {
        z.fired = true;
        this.game.hud.say(z.lines);
      }
    }
  }

  enemyAt(p, r) {
    return this.enemies.find((e) => e.alive && e.hitTest(p, r)) || null;
  }

  promptFor(ch) {
    const g = this.game;
    if (ch.dead) return '';
    for (const it of g.interactables()) if (it.canInteract(ch)) return it.prompt;
    if (ch.isMay) {
      if (ch.mode === 'swing') return '<kbd>WASD</kbd> 摆荡 · <kbd>空格</kbd> 松手飞出';
      if (!ch.grounded && g.nails.findAnchor(ch.pos)) return '<kbd>E</kbd> 用锤子勾住钉子！';
      for (const h of this.hammerables) {
        if (h.onPress && !h.pressed && h.cap.position.distanceTo(ch.pos) < 4) return '<kbd>左键</kbd> 挥锤砸按钮！';
      }
    }
    for (const z of this.zones) {
      if (z.lines || !z.box.containsPoint(ch.pos)) continue;
      if (z.who === 'lever') {
        if (g.leverPulled()) continue;
        return z.prompt;
      }
      if (z.stopped && this.bridge.stopped) return z.stopped;
      if (!ch.isMay && z.codyPrompt) return z.codyPrompt;
      if (ch.isMay && z.mayPrompt) return z.mayPrompt;
      if (z.prompt) return z.prompt;
    }
    return '';
  }
}
