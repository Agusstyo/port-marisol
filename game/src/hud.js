// The HUD: health and cash, the wanted stars, the objective card with its distance, the
// speedometer, prompts, toasts, the bust meter, the dialogue box — and the minimap, a small
// canvas map of the whole district with the streets, the sea, the player, the police and
// the objective on it. Everything the player reads lives here; the game logic only calls
// these functions.

import { LANDMARKS, WORLD } from './city.js';

const el = (id) => document.getElementById(id);

export const Hud = {
  els: {},
  toastTimer: null,

  init() {
    this.els = {
      hud: el('hud'), healthFill: el('health-fill'), cash: el('cash-value'),
      stars: el('wanted-stars'), objectiveCard: el('objective-card'),
      objectiveTitle: el('objective-title'), objectiveText: el('objective-text'),
      objectiveDist: el('objective-dist'), speedCard: el('speed-card'),
      speedValue: el('speed-value'), prompt: el('prompt'), crosshair: el('crosshair'),
      bustTrack: el('bust-track'), bustFill: el('bust-fill'), toast: el('toast'),
      vignette: el('vignette'), dialogue: el('dialogue'),
      dialogueSpeaker: el('dialogue-speaker'), dialogueText: el('dialogue-text'),
      minimap: el('minimap').getContext('2d'),
    };
  },

  showHud(visible) {
    this.els.hud.classList.toggle('visible', visible);
  },

  setHealth(health) {
    this.els.healthFill.style.width = `${Math.max(0, Math.min(100, health))}%`;
    this.els.healthFill.classList.toggle('low', health < 30);
  },

  setCash(cash) {
    this.els.cash.textContent = String(Math.floor(cash));
  },

  setWanted(level, time) {
    let html = '';
    for (let i = 0; i < 5; i++) {
      const lit = i < level;
      const flash = level >= 4 && lit && Math.floor(time * 3) % 2 === 0;
      html += `<span class="${lit ? 'lit' : ''}" style="${flash ? 'opacity:0.35' : ''}">★</span>`;
    }
    if (this.els.stars.innerHTML !== html) this.els.stars.innerHTML = html;
  },

  setObjective(title, text, distText) {
    if (!title) {
      this.els.objectiveCard.classList.remove('visible');
      return;
    }
    this.els.objectiveCard.classList.add('visible');
    this.els.objectiveTitle.textContent = title;
    this.els.objectiveText.textContent = text;
    this.els.objectiveDist.textContent = distText || '';
  },

  setSpeed(kmh) {
    if (kmh === null) {
      this.els.speedCard.classList.remove('visible');
      return;
    }
    this.els.speedCard.classList.add('visible');
    this.els.speedValue.textContent = String(Math.round(kmh));
  },

  showPrompt(html) {
    if (!html) {
      this.els.prompt.classList.remove('visible');
      return;
    }
    this.els.prompt.innerHTML = html;
    this.els.prompt.classList.add('visible');
  },

  setCrosshair(visible) {
    this.els.crosshair.classList.toggle('visible', visible);
  },

  setBust(meter) {
    this.els.bustTrack.classList.toggle('visible', meter > 0.03);
    this.els.bustFill.style.width = `${Math.min(100, meter * 100)}%`;
  },

  hurtFlash() {
    this.els.vignette.classList.add('hurt');
    setTimeout(() => this.els.vignette.classList.remove('hurt'), 220);
  },

  toast(big, sub, ms = 2600) {
    const toast = this.els.toast;
    toast.querySelector('.big').textContent = big;
    toast.querySelector('.sub').textContent = sub || '';
    toast.classList.add('visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove('visible'), ms);
  },

  showDialogue(speaker, text) {
    this.els.dialogueSpeaker.textContent = speaker;
    this.els.dialogueText.textContent = text;
    this.els.dialogue.classList.add('visible');
  },

  hideDialogue() {
    this.els.dialogue.classList.remove('visible');
  },

  showScreen(id) {
    for (const screen of document.querySelectorAll('.screen')) screen.classList.remove('visible');
    if (id) el(id).classList.add('visible');
  },
};

// --- the minimap: the whole district on a 190 px canvas, north up ---
const MAP_SIZE = 190;
const MAP_SCALE = MAP_SIZE / 620; // the world spans about 620 m including the sea

function worldToMap(x, z) {
  return {
    x: (x + 280) * MAP_SCALE,
    y: (z + 250) * MAP_SCALE,
  };
}

export function drawMinimap(ctx2d, view) {
  const c = ctx2d;
  c.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  c.fillStyle = '#274b5c';
  c.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  // the sea along the bottom
  const seaTop = worldToMap(0, WORLD.beachZ + 30).y;
  c.fillStyle = '#1590a5';
  c.fillRect(0, seaTop, MAP_SIZE, MAP_SIZE - seaTop);
  c.fillStyle = '#e8d5a3';
  c.fillRect(0, worldToMap(0, WORLD.beachZ).y, MAP_SIZE, seaTop - worldToMap(0, WORLD.beachZ).y);
  // blocks
  c.fillStyle = '#3d6a52';
  for (const bx of WORLD.blockCenters) {
    for (const bz of WORLD.blockCenters) {
      const p = worldToMap(bx - 27, bz - 27);
      c.fillRect(p.x, p.y, 54 * MAP_SCALE, 54 * MAP_SCALE);
    }
  }
  // streets
  c.strokeStyle = '#12181d';
  c.lineWidth = Math.max(2, WORLD.roadHalf * 2 * MAP_SCALE);
  for (const r of WORLD.roads) {
    const v = worldToMap(r, -250);
    c.beginPath();
    c.moveTo(v.x, 0);
    c.lineTo(v.x, MAP_SIZE);
    c.stroke();
    const h = worldToMap(-280, r);
    c.beginPath();
    c.moveTo(0, h.y);
    c.lineTo(MAP_SIZE, h.y);
    c.stroke();
  }
  // landmarks
  const dots = [
    [LANDMARKS.ferreira, '#ffb347'],
    [LANDMARKS.police, '#7fb5d5'],
    [LANDMARKS.hospital, '#ff8fa3'],
    [LANDMARKS.marina, '#a8e063'],
  ];
  for (const [spot, color] of dots) {
    const p = worldToMap(spot.x, spot.z);
    c.fillStyle = color;
    c.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  // traffic
  c.fillStyle = 'rgba(230, 230, 230, 0.75)';
  for (const car of view.traffic) {
    const p = worldToMap(car.x, car.z);
    c.fillRect(p.x - 1, p.y - 1, 2, 2);
  }
  // police
  for (const cop of view.police) {
    const p = worldToMap(cop.x, cop.z);
    c.fillStyle = Math.floor(view.time * 3) % 2 ? '#ff4444' : '#4488ff';
    c.beginPath();
    c.arc(p.x, p.y, 3, 0, Math.PI * 2);
    c.fill();
  }
  // the objective: a pulsing gold ring
  if (view.objective) {
    const p = worldToMap(view.objective.x, view.objective.z);
    c.strokeStyle = '#ffd23f';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(p.x, p.y, 5 + Math.sin(view.time * 5) * 1.5, 0, Math.PI * 2);
    c.stroke();
  }
  // the player: a white arrow pointing the way they face
  const p = worldToMap(view.player.x, view.player.z);
  c.save();
  c.translate(p.x, p.y);
  c.rotate(Math.PI - view.player.heading);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(0, -6);
  c.lineTo(4, 5);
  c.lineTo(0, 2.5);
  c.lineTo(-4, 5);
  c.closePath();
  c.fill();
  c.restore();
}
