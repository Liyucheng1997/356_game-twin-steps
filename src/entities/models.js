import * as THREE from 'three';
import { woodTexture } from '../gfx/Textures.js';

// Procedural chibi dolls. Cody is made of clay, May is a wooden doll with a hammer.
// Local space: feet at y=0, facing +Z.

const capsule = (r, len, mat) => {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat);
  m.castShadow = true;
  return m;
};
const sphere = (r, mat, ws = 20, hs = 14) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
  m.castShadow = true;
  return m;
};

export function buildHammer(metal, handleMat, scale = 1) {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.75, 10), handleMat);
  handle.position.y = 0.375;
  handle.castShadow = true;
  g.add(handle);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.17, 0.17), metal);
  head.position.y = 0.78;
  head.castShadow = true;
  g.add(head);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 14), metal);
  face.rotation.z = Math.PI / 2;
  face.position.set(0.24, 0.78, 0);
  g.add(face);
  const claw = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 4), metal);
  claw.rotation.z = Math.PI / 2;
  claw.position.set(-0.3, 0.8, 0);
  g.add(claw);
  g.scale.setScalar(scale);
  return g;
}

export function buildNailMesh(mat) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.95, 8), mat);
  shaft.rotation.x = Math.PI / 2;
  shaft.castShadow = true;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.2, 8), mat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.57;
  g.add(tip);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16), mat);
  head.rotation.x = Math.PI / 2;
  head.position.z = -0.48;
  head.castShadow = true;
  g.add(head);
  return g;
}

export function buildDoll(kind) {
  const isMay = kind === 'may';
  const skinMat = isMay
    ? new THREE.MeshStandardMaterial({ map: woodTexture({ base: '#d9a066', dark: '#b07a45', planks: 1, seed: 5, size: 256 }), roughness: 0.55 })
    : new THREE.MeshStandardMaterial({ color: 0xd99a6c, roughness: 0.95 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: isMay ? 0xd9473b : 0x3c8fc7, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: isMay ? 0x2f3d5c : 0x5c4a3a, roughness: 0.85 });
  const hairMat = new THREE.MeshStandardMaterial({ color: isMay ? 0x2b1a12 : 0x6b3f1f, roughness: 0.7 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: isMay ? 0xf2efe6 : 0x3a2a20, roughness: 0.6 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x8c5a2e, roughness: 0.5 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.2 });
  const blushMat = new THREE.MeshStandardMaterial({ color: 0xff8f8f, roughness: 1, transparent: true, opacity: 0.55 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.85, roughness: 0.3 });
  const handleMat = new THREE.MeshStandardMaterial({ color: isMay ? 0xe0533f : 0x6b4428, roughness: 0.6 });

  const root = new THREE.Group();
  const tilt = new THREE.Group(); // pivot at body center, used for flips / leaning
  tilt.position.y = 0.75;
  root.add(tilt);
  const rig = new THREE.Group();
  rig.position.y = -0.75;
  tilt.add(rig);

  // Legs (pivot at hip)
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(0.13 * side, 0.44, 0);
    const leg = capsule(0.095, 0.24, pantsMat);
    leg.position.y = -0.2;
    hip.add(leg);
    const shoe = sphere(0.13, shoeMat);
    shoe.scale.set(0.9, 0.6, 1.3);
    shoe.position.set(0, -0.38, 0.05);
    hip.add(shoe);
    rig.add(hip);
    return hip;
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  // Torso
  const torso = capsule(0.25, 0.2, shirtMat);
  torso.position.y = 0.72;
  torso.scale.set(1, 1, 0.85);
  rig.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.08, 20), pantsMat);
  belt.position.y = 0.52;
  belt.scale.z = 0.85;
  rig.add(belt);
  if (!isMay) {
    // Cody's sweater stripe
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.07, 20), new THREE.MeshStandardMaterial({ color: 0xf2d25c, roughness: 0.8 }));
    stripe.position.y = 0.76;
    stripe.scale.z = 0.86;
    rig.add(stripe);
  }

  // Arms (pivot at shoulder)
  const mkArm = (side) => {
    const sh = new THREE.Group();
    sh.position.set(0.3 * side, 0.88, 0);
    if (isMay) { const j = sphere(0.08, jointMat, 10, 8); sh.add(j); }
    const arm = capsule(0.075, 0.24, shirtMat);
    arm.position.y = -0.18;
    sh.add(arm);
    const hand = sphere(0.085, skinMat, 12, 10);
    hand.position.y = -0.37;
    sh.add(hand);
    sh.rotation.z = 0.15 * side;
    rig.add(sh);
    return sh;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);

  // Head
  const head = new THREE.Group();
  head.position.y = 1.18;
  rig.add(head);
  const skull = sphere(0.34, skinMat, 28, 20);
  skull.scale.set(1, 0.95, 0.95);
  head.add(skull);
  const mkEye = (side) => {
    const e = sphere(0.075, eyeWhite, 14, 10);
    e.scale.set(0.85, 1.1, 0.5);
    e.position.set(0.12 * side, 0.03, 0.29);
    const p = sphere(0.045, pupilMat, 12, 8);
    p.position.set(0, -0.005, 0.05);
    e.add(p);
    const shine = sphere(0.014, eyeWhite, 6, 4);
    shine.position.set(0.02, 0.025, 0.09);
    e.add(shine);
    head.add(e);
    return e;
  };
  const eyeL = mkEye(1);
  const eyeR = mkEye(-1);
  [-1, 1].forEach((s) => {
    const b = sphere(0.05, blushMat, 10, 6);
    b.scale.set(1.2, 0.6, 0.3);
    b.position.set(0.2 * s, -0.08, 0.27);
    head.add(b);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12, Math.PI), pupilMat);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.1, 0.31);
  head.add(mouth);
  const nose = sphere(0.035, skinMat, 8, 6);
  nose.position.set(0, -0.03, 0.33);
  head.add(nose);

  // Hair
  if (isMay) {
    const cap = sphere(0.355, hairMat, 24, 16);
    cap.scale.set(1.02, 0.85, 1.0);
    cap.position.set(0, 0.08, -0.04);
    head.add(cap);
    const bangs = sphere(0.2, hairMat, 14, 10);
    bangs.scale.set(1.6, 0.45, 0.6);
    bangs.position.set(0.04, 0.2, 0.2);
    bangs.rotation.z = -0.15;
    head.add(bangs);
    const bun = sphere(0.15, hairMat, 16, 12);
    bun.position.set(0, 0.32, -0.2);
    head.add(bun);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), new THREE.MeshStandardMaterial({ color: 0xf2c94c }));
    tie.position.set(0, 0.27, -0.16);
    tie.rotation.x = 1.1;
    head.add(tie);
  } else {
    const cap = sphere(0.355, hairMat, 24, 16);
    cap.scale.set(1.03, 0.75, 1.0);
    cap.position.set(0, 0.11, -0.05);
    head.add(cap);
    for (let i = 0; i < 5; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 8), hairMat);
      tuft.position.set(-0.16 + i * 0.08, 0.33, 0.12 - Math.abs(i - 2) * 0.03);
      tuft.rotation.set(0.6, 0, (i - 2) * 0.3);
      tuft.castShadow = true;
      head.add(tuft);
    }
    const glassesMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4 });
    [-1, 1].forEach((s) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 6, 18), glassesMat);
      ring.position.set(0.12 * s, 0.03, 0.315);
      head.add(ring);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.015), glassesMat);
    bridge.position.set(0, 0.05, 0.33);
    head.add(bridge);
  }

  // Ability props
  let hammerBack = null;
  let hammerHand = null;
  const quiver = [];
  if (isMay) {
    hammerBack = buildHammer(metal, handleMat, 0.9);
    hammerBack.position.set(-0.1, 0.35, -0.28);
    hammerBack.rotation.set(0, 0, 0.5);
    rig.add(hammerBack);
    hammerHand = buildHammer(metal, handleMat, 0.95);
    hammerHand.position.set(0, -0.4, 0.05);
    hammerHand.rotation.x = Math.PI / 2;
    hammerHand.visible = false;
    armR.add(hammerHand);
  } else {
    const pouch = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x7a4b2a, roughness: 0.9 }));
    pouch.position.set(0, 0.78, -0.27);
    pouch.rotation.z = -0.4;
    pouch.castShadow = true;
    rig.add(pouch);
    for (let i = 0; i < 3; i++) {
      const n = buildNailMesh(metal);
      n.scale.setScalar(0.45);
      n.rotation.x = -Math.PI / 2;
      n.rotation.y = -0.4;
      n.position.set(-0.05 + i * 0.06, 1.0 + i * 0.02, -0.3);
      rig.add(n);
      quiver.push(n);
    }
  }

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return {
    root, tilt, rig, legL, legR, armL, armR, head, torso, eyeL, eyeR, mouth,
    hammerBack, hammerHand, quiver, materials: { skinMat, shirtMat }, metal,
  };
}
