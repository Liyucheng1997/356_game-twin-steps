import { Physics } from './core/Physics.js';
import { Game } from './game/Game.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  const physics = await Physics.create();
  const game = new Game($('game'), physics);
  window.game = game; // handy for debugging from the console
  if (import.meta.env.DEV) installDevHelpers(game);
  $('loading').classList.add('hidden');

  $('start-btn').addEventListener('click', () => {
    $('title').classList.add('hidden');
    game.start();
  });
  $('resume-btn').addEventListener('click', () => game.resume());
  $('restart-btn').addEventListener('click', () => { game.respawnActive(); game.resume(); });
  $('again-btn').addEventListener('click', () => window.location.reload());
}

// Dev-only: step the simulation deterministically from the console, e.g.
//   sim(1, ['KeyW'], ['Space'])  -> hold W for 1s, tap Space on the first frame
function installDevHelpers(game) {
  window.sim = (seconds, keys = [], pressed = [], mouse = {}) => {
    const inp = game.input;
    if (game.state === 'title') game.state = 'playing';
    keys.forEach((k) => inp.down.add(k));
    pressed.forEach((k) => inp.pressed.add(k));
    if (mouse.press !== undefined) inp.mousePressed[mouse.press] = true;
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      if (mouse.hold !== undefined) inp.mouseDown[mouse.hold] = true;
      game.update(1 / 60, true);
      inp.endFrame();
    }
    keys.forEach((k) => inp.down.delete(k));
    if (mouse.hold !== undefined) inp.mouseDown[mouse.hold] = false;
    const a = game.active;
    return { pos: a.pos.toArray().map((v) => +v.toFixed(2)), vy: +a.vel.y.toFixed(2), grounded: a.grounded, mode: a.mode, dead: a.dead };
  };
  window.tp = (ch, x, y, z, camYaw = 0) => {
    ch.pos.set(x, y + 0.77, z);
    ch.collider.setTranslation(ch.pos);
    ch.vel.set(0, 0, 0);
    ch.groundOwner = null;
    game.rigOf(ch).snap(ch);
    game.rigOf(ch).yaw = camYaw;
    ch.yaw = camYaw + Math.PI;
  };
}

boot().catch((err) => {
  console.error(err);
  $('loading').innerHTML = `<div style="color:#ff8a7a">加载失败：${err.message}</div>`;
});
