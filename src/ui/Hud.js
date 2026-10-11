const WHO = {
  may: ['小梅', 'who-m'],
  cody: ['小柯', 'who-c'],
  book: ['魔法书', 'who-b'],
};

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('hud');
    this.panes = {
      may: document.getElementById('pane-may'),
      cody: document.getElementById('pane-cody'),
    };
    this.hearts = {
      may: this.panes.may.querySelector('.hearts'),
      cody: this.panes.cody.querySelector('.hearts'),
    };
    this.prompts = {
      may: this.panes.may.querySelector('.prompt'),
      cody: this.panes.cody.querySelector('.prompt'),
    };
    this.nailsEl = this.panes.cody.querySelector('.nails');
    this.crosshair = this.panes.cody.querySelector('.crosshair');
    this.collectEl = document.getElementById('collect');
    this.timerEl = document.getElementById('timer');
    this.subEl = document.getElementById('subtitle');
    this.toastEl = document.getElementById('toast');
    this.fadeEl = document.getElementById('fade');
    this.queue = [];
    this.subT = 0;
    this.cache = {};
  }

  show() { this.el.classList.remove('hidden'); }

  layout(split, activeKind) {
    this.el.classList.toggle('split', split);
    this.el.classList.toggle('single', !split);
    this.el.classList.toggle('active-may', activeKind === 'may');
    this.el.classList.toggle('active-cody', activeKind === 'cody');
  }

  set(key, el, value, prop = 'innerHTML') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  say(lines) {
    for (const l of lines) this.queue.push({ who: l[0], text: l[1], dur: l[2] ?? Math.max(2.4, l[1].length * 0.16) });
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1600);
  }

  fadeFlash() {
    this.fadeEl.classList.add('on');
    setTimeout(() => this.fadeEl.classList.remove('on'), 650);
  }

  update(dt) {
    const g = this.game;
    for (const c of g.characters) {
      const k = c.kind;
      this.set(`h-${k}`, this.hearts[k], '❤'.repeat(Math.max(0, c.hp)) + '<span style="opacity:.25">' + '❤'.repeat(3 - Math.max(0, c.hp)) + '</span>');
      const p = g.level.promptFor(c);
      const visible = c === g.active || g.split;
      const text = visible && (c === g.active || !p.includes('<kbd>')) ? p : '';
      this.set(`p-${k}`, this.prompts[k], text);
      this.prompts[k].classList.toggle('show', !!text);
    }
    const held = g.nails.heldCount();
    this.set('nails', this.nailsEl, '<i class="nail-ico"></i>'.repeat(held) + '<i class="nail-ico off"></i>'.repeat(3 - held));
    this.set('collect', this.collectEl, `💗 ${g.collected} / ${g.level.collectibles.length}`, 'textContent');
    const t = Math.floor(g.playTime);
    this.set('timer', this.timerEl, `⏱ ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, 'textContent');

    const aiming = g.cody.aiming && (g.split || g.active === g.cody);
    this.crosshair.classList.toggle('show', aiming);
    if (aiming) this.crosshair.classList.toggle('hot', g.aimHot);

    // subtitles
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) this.subEl.classList.remove('show');
    } else if (this.queue.length) {
      const l = this.queue.shift();
      const [name, cls] = WHO[l.who];
      this.subEl.innerHTML = `<span class="${cls}">${name}：</span>${l.text}`;
      this.subEl.classList.add('show');
      this.subT = l.dur + 0.35;
    }
  }
}
