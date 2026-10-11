import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { floorTexture, woodTexture, beamTexture, metalTexture } from '../gfx/Textures.js';

// The giant shed around the play space: lighting, walls, window light shafts and floating dust.
export class Environment {
  constructor(game) {
    const { scene, renderer } = game;
    this.game = game;
    scene.background = new THREE.Color(0x3b2717);
    scene.fog = new THREE.Fog(0x47301e, 80, 360);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;

    scene.add(new THREE.HemisphereLight(0xfff1dc, 0x5a3a22, 1.25));
    const sun = new THREE.DirectionalLight(0xffd6a0, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.sun = sun;
    this.sunOffset = new THREE.Vector3(55, 80, 30);
    const fill = new THREE.DirectionalLight(0xa9c8ff, 0.55);
    fill.position.set(-60, 30, -40);
    scene.add(fill);

    // ----- shed room -----
    const FLOOR_Y = -40;
    const ftex = floorTexture();
    ftex.repeat.set(14, 14);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, FLOOR_Y, -90);
    floor.receiveShadow = true;
    scene.add(floor);

    const wtex = woodTexture({ base: '#8b5e3a', dark: '#4a2e18', planks: 8, seed: 31 });
    wtex.repeat.set(6, 3);
    const wallMat = new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.9 });
    const W = 240, H = 200;
    const mkWall = (w, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat);
      m.position.set(x, FLOOR_Y + H / 2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    mkWall(W * 2, 0, -320, 0); // back
    mkWall(W * 2, 0, 140, Math.PI); // front
    mkWall(460, -W / 2 - 20, -90, Math.PI / 2); // left
    const right = mkWall(460, W / 2 + 20, -90, -Math.PI / 2);
    right.material = wallMat;

    // window on the right wall — glowing panes + crossbars
    const winGroup = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshBasicMaterial({ color: 0xfff1c8, toneMapped: false }));
    winGroup.add(pane);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x3a2412 });
    for (let i = -1; i <= 1; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(3, 60, 2), barMat); v.position.x = i * 30; winGroup.add(v);
    }
    const hbar = new THREE.Mesh(new THREE.BoxGeometry(90, 3, 2), barMat);
    winGroup.add(hbar);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(96, 66, 1), barMat);
    frame.position.z = -1.2;
    winGroup.add(frame);
    winGroup.position.set(W / 2 + 19, 45, -70);
    winGroup.rotation.y = -Math.PI / 2;
    scene.add(winGroup);

    // light shafts from the window
    const btex = beamTexture();
    const beamMat = new THREE.MeshBasicMaterial({ map: btex, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(26 + Math.random() * 14, 230), beamMat);
      b.position.set(40, 10, -30 - i * 18 + (Math.random() - 0.5) * 8);
      b.rotation.set(0, Math.PI / 2 + 0.25, 0.95);
      b.rotateY(0.0);
      scene.add(b);
    }

    // ----- giant background props (no colliders) -----
    const paint = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2 });
    const metal = new THREE.MeshStandardMaterial({ map: metalTexture(), metalness: 0.7, roughness: 0.35 });
    const add = (m, shadow = true) => { m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };

    // shelf along the left wall with paint cans
    const shelfMat = new THREE.MeshStandardMaterial({ map: woodTexture({ base: '#b07a48', planks: 2, seed: 9 }), roughness: 0.8 });
    for (let s = 0; s < 3; s++) {
      const y = FLOOR_Y + 30 + s * 40;
      add(new THREE.Mesh(new THREE.BoxGeometry(30, 3, 300), shelfMat)).position.set(-W / 2 + 0, y, -100);
      const colors = [0xd9473b, 0x3c8fc7, 0xf2c230, 0x5cb85c, 0xe58a3a, 0x8a5ac7];
      for (let i = 0; i < 9; i++) {
        const r = 6 + Math.random() * 3;
        const h = 12 + Math.random() * 10;
        const can = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), paint(colors[(i + s) % colors.length])));
        can.position.set(-W / 2 + 2 + Math.random() * 4, y + 1.5 + h / 2, 20 - i * 32 + Math.random() * 8);
        const lid = add(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.3, r + 0.3, 1, 28), metal));
        lid.position.set(can.position.x, y + 1.5 + h + 0.5, can.position.z);
      }
    }

    // a garden hose coil on the floor
    const hose = add(new THREE.Mesh(new THREE.TorusGeometry(18, 2.2, 14, 60), paint(0x3fa34d)));
    hose.rotation.x = -Math.PI / 2;
    hose.position.set(60, FLOOR_Y + 2.2, -40);
    const hose2 = add(new THREE.Mesh(new THREE.TorusGeometry(14, 2.2, 14, 60), paint(0x3fa34d)));
    hose2.rotation.x = -Math.PI / 2;
    hose2.position.set(60, FLOOR_Y + 6.2, -40);

    // a huge flower pot with a sad plant
    const pot = add(new THREE.Mesh(new THREE.CylinderGeometry(22, 16, 40, 32), paint(0xc2643a)));
    pot.position.set(-70, FLOOR_Y + 20, -250);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8f3a, roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const leaf = add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 10), leafMat));
      leaf.scale.set(0.5, 2.2, 0.15);
      leaf.position.set(-70 + Math.cos(i) * 8, FLOOR_Y + 55 + Math.random() * 10, -250 + Math.sin(i) * 8);
      leaf.rotation.set(Math.sin(i) * 0.6, i, Math.cos(i) * 0.6);
    }

    // tools hanging on the back wall (saw, wrench)
    const saw = add(new THREE.Mesh(new THREE.BoxGeometry(70, 18, 1), metal), false);
    saw.position.set(-20, 70, -318);
    saw.rotation.z = 0.12;
    const sawHandle = add(new THREE.Mesh(new THREE.BoxGeometry(18, 20, 4), paint(0x8a3b1e)), false);
    sawHandle.position.set(24, 74, -317);
    const wrench = add(new THREE.Mesh(new THREE.BoxGeometry(8, 60, 2), metal), false);
    wrench.position.set(60, 60, -318);
    wrench.rotation.z = -0.3;
    const wrenchHead = add(new THREE.Mesh(new THREE.TorusGeometry(8, 3, 8, 20, Math.PI * 1.4), metal), false);
    wrenchHead.position.set(69, 89, -317);

    // ----- floating dust motes -----
    const N = 900;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = -15 + Math.random() * 50;
      pos[i * 3 + 2] = 20 - Math.random() * 240;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const g = dot.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,245,220,1)');
    grd.addColorStop(1, 'rgba(255,245,220,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    const dtex = new THREE.CanvasTexture(dot);
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: dtex, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0d0 }));
    this.motes.frustumCulled = false;
    scene.add(this.motes);
    this.FLOOR_Y = FLOOR_Y;
  }

  update(dt, focus) {
    // keep the shadow frustum centred on the action, snapped to texels to avoid shimmering
    const texel = 76 / 2048;
    const fx = Math.round(focus.x / texel) * texel;
    const fy = Math.round(focus.y / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, fy, fz);
    this.sun.position.set(fx, fy, fz).add(this.sunOffset);
    this.sun.target.updateMatrixWorld();

    const p = this.motes.geometry.attributes.position;
    const t = this.game.time;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.25;
      if (y > 35) y = -15;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.15);
    }
    p.needsUpdate = true;
  }
}
