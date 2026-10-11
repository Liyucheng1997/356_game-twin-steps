import * as THREE from 'three';

// Procedural canvas textures so the project needs no external assets.
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeatX = 1, repeatY = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rand(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function woodTexture({ base = '#c8894f', dark = '#8a5228', planks = 4, seed = 7, size = 512 } = {}) {
  const [c, g] = canvas(size, size);
  const r = rand(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const ph = size / planks;
  for (let p = 0; p < planks; p++) {
    const y0 = p * ph;
    // plank tint variation
    g.fillStyle = `rgba(${r() > 0.5 ? '255,220,170' : '90,50,20'},${0.06 + r() * 0.1})`;
    g.fillRect(0, y0, size, ph);
    // grain lines
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(80,40,15,${0.08 + r() * 0.18})`;
      g.lineWidth = 0.6 + r() * 1.8;
      g.beginPath();
      const yy = y0 + r() * ph;
      const amp = 1 + r() * 4;
      const fr = 0.005 + r() * 0.02;
      const off = r() * 100;
      for (let x = 0; x <= size; x += 8) {
        const y = yy + Math.sin(x * fr + off) * amp;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    // knots
    if (r() > 0.4) {
      const kx = r() * size, ky = y0 + ph * (0.3 + r() * 0.4);
      for (let k = 6; k > 0; k--) {
        g.strokeStyle = `rgba(70,35,10,${0.12 + 0.05 * k})`;
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(kx, ky, k * 4, k * 1.8, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // seam
    g.fillStyle = dark;
    g.globalAlpha = 0.7;
    g.fillRect(0, y0, size, 3);
    g.globalAlpha = 1;
    // nail heads at plank ends
    g.fillStyle = 'rgba(60,60,70,0.7)';
    [18, size - 18].forEach((x) => { g.beginPath(); g.arc(x, y0 + ph * 0.5, 4, 0, Math.PI * 2); g.fill(); });
  }
  return finish(c);
}

export function cardboardTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c99b62';
  g.fillRect(0, 0, 256, 256);
  const r = rand(3);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,235,200' : '110,70,30'},${r() * 0.08})`;
    g.fillRect(r() * 256, r() * 256, 2 + r() * 4, 1 + r() * 2);
  }
  g.strokeStyle = 'rgba(120,80,40,0.25)';
  for (let y = 0; y < 256; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.fillStyle = 'rgba(200,160,90,0.6)';
  g.fillRect(0, 110, 256, 36); // tape strip
  return finish(c);
}

export function rulerTexture() {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#3a2a10';
  for (let i = 0; i <= 100; i++) {
    const x = 10 + i * 10;
    const h = i % 10 === 0 ? 46 : i % 5 === 0 ? 32 : 20;
    g.fillRect(x, 0, 2, h);
    g.fillRect(x, 128 - h, 2, h);
    if (i % 10 === 0) { g.font = 'bold 22px sans-serif'; g.fillText(String(i / 10), x + 4, 74); }
  }
  return finish(c, 1, 1);
}

export function bookTexture(color, title) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 256; i += 4) g.fillRect(0, i, 256, 1);
  g.strokeStyle = '#f1d27a';
  g.lineWidth = 6;
  g.strokeRect(20, 20, 216, 216);
  g.fillStyle = '#f1d27a';
  g.font = 'bold 30px serif';
  g.textAlign = 'center';
  g.fillText(title, 128, 138);
  return finish(c);
}

export function floorTexture() {
  return woodTexture({ base: '#7a4f2e', dark: '#3b2414', planks: 6, seed: 19 });
}

export function metalTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#9aa3ab';
  g.fillRect(0, 0, 256, 256);
  const r = rand(11);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.12})`;
    g.fillRect(0, r() * 256, 256, 1);
    g.fillStyle = `rgba(0,0,0,${r() * 0.1})`;
    g.fillRect(0, r() * 256, 256, 1);
  }
  return finish(c);
}

export function checkerTexture(a = '#e94f4f', b = '#fff0d8', n = 8) {
  const [c, g] = canvas(256, 256);
  const s = 256 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? a : b;
    g.fillRect(x * s, y * s, s, s);
  }
  return finish(c);
}

export function radialGlowTexture() {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,240,200,0.6)');
  grd.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function beamTexture() {
  const [c, g] = canvas(64, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,240,200,0.55)');
  grd.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)');
  h.addColorStop(0.5, 'rgba(0,0,0,0)');
  h.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
