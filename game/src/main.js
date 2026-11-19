// Port Marisol — main entry. Wires the city, Rio, the cars, the crowd, the police, the
// missions and the HUD into one game: title screen, free roam, driving and stealing,
// wanted chases, busts and hospital trips, Sol's story, saving. Everything runs from this
// loop; the other modules each own one system.

import * as THREE from '../vendor/three.min.js';
import { LANDMARKS, WORLD, buildCity, collideCircle, parkedCarSpots } from './city.js';
import { clamp, distance2d, makeRng, pick } from './random.js';
import { GameState, resetRun } from './state.js';
import { createPlayer, syncPlayerMesh, teleportPlayer, titleCameraPose, updateOrbitCamera, updatePlayerOnFoot } from './player.js';
import { CAR_COLORS, createCar, resolveCarCollisions, syncCarMesh, updatePlayerDriving, updatePoliceCar, updateTrafficCar } from './vehicles.js';
import { createPedestrian, knockDownPedestrian, scarePedestrian, updatePedestrian } from './pedestrians.js';
import { Wanted } from './wanted.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { SoundEngine } from './audio.js';
import { Hud, drawMinimap } from './hud.js';
import { clearSave, hasSave, loadGame, saveGame } from './save.js';
import { parseShotRequest, setupShotScene } from './shots.js';

// ---------- setup ----------
const shotRequest = parseShotRequest();
const seed = shotRequest ? shotRequest.seed : 7;
const rng = makeRng(seed * 104729 + 5);

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 30, 120);

const { colliders, clouds } = buildCity(scene, seed);
const effects = new Effects(scene);
const sound = new SoundEngine();
const combat = new Combat(effects, sound);
Hud.init();

const player = createPlayer(scene, rng, LANDMARKS.spawn);
GameState.player = player;
const missions = new Missions(scene, rng);

// ---------- cars: traffic, parked, and the police pool ----------
const cars = [];
const trafficRng = makeRng(seed * 31 + 3);
for (let i = 0; i < 15; i++) {
  const roadX = pick(trafficRng, WORLD.roads);
  const roadZ = pick(trafficRng, WORLD.roads);
  const alongX = trafficRng() < 0.5;
  const laneSign = trafficRng() < 0.5 ? 4 : -4;
  let x;
  let z;
  let heading;
  if (alongX) {
    // east-west street: the lane decides the direction (right-hand traffic)
    x = -220 + trafficRng() * 440;
    z = roadZ + laneSign;
    heading = laneSign > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    x = roadX + laneSign;
    z = -220 + trafficRng() * 440;
    heading = laneSign < 0 ? 0 : Math.PI;
  }
  cars.push(createCar(scene, trafficRng, x, z, heading, 'traffic', pick(trafficRng, CAR_COLORS)));
}
for (const spot of parkedCarSpots(makeRng(seed * 17 + 9))) {
  cars.push(createCar(scene, rng, spot.x, spot.z, spot.heading, 'parked', pick(rng, CAR_COLORS)));
}

// ---------- pedestrians ----------
const peds = [];
for (let i = 0; i < 26; i++) peds.push(createPedestrian(scene, rng));

// ---------- input ----------
const input = { forward: false, back: false, left: false, right: false, run: false };
const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'run', ShiftRight: 'run',
};
let camYaw = Math.PI;
let camPitch = 0.32;
let pointerLocked = false;
let autosaveTimer = 0;
let lastDamageAt = -100;

window.addEventListener('keydown', (e) => {
  const name = KEYMAP[e.code];
  if (name) {
    input[name] = true;
    e.preventDefault();
  }
  if (e.repeat) return;
  sound.ensure();
  if (e.code === 'KeyM') {
    GameState.muted = !GameState.muted;
    sound.setMuted(GameState.muted);
  }
  if (GameState.mode === 'play') {
    if (e.code === 'KeyE') interact();
    if (e.code === 'KeyF') toggleCar();
    if (e.code === 'KeyP' || e.code === 'Escape') openPause();
  } else if (GameState.mode === 'dialogue') {
    if (e.code === 'KeyE' || e.code === 'Space') advanceDialogue();
  } else if (GameState.mode === 'pause') {
    if (e.code === 'KeyP' || e.code === 'Escape') closePause();
  }
});
window.addEventListener('keyup', (e) => {
  const name = KEYMAP[e.code];
  if (name) input[name] = false;
});
canvas.addEventListener('click', () => {
  sound.ensure();
  if (GameState.mode === 'dialogue') {
    advanceDialogue();
    return;
  }
  if (GameState.mode !== 'play') return;
  if (!pointerLocked) {
    canvas.requestPointerLock();
    return;
  }
  if (!GameState.currentCar) {
    const hit = combat.shoot({
      camera, from: player, peds, cars, colliders,
      onCrime: (kind, t) => Wanted.addCrime(kind, t),
    }, GameState.time);
    void hit;
  }
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
});
window.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  if (GameState.mode !== 'play' && GameState.mode !== 'dialogue') return;
  camYaw -= e.movementX * 0.0026;
  camPitch = clamp(camPitch + e.movementY * 0.0021, -0.08, 1.15);
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- the mission context: what missions.js is allowed to touch ----------
const missionCtx = {
  player,
  get currentCar() { return GameState.currentCar; },
  at(x, z, r) {
    const p = GameState.currentCar || player;
    return distance2d(p.x, p.z, x, z) < r;
  },
  spawnCar(x, z, heading, kind, paint) {
    const car = createCar(scene, rng, x, z, heading, kind, paint);
    cars.push(car);
    return car;
  },
  chime() { sound.chime(); },
  setWanted(n) { Wanted.setHeat(n, GameState.time); },
  setHideout(h) { Wanted.hideout = h; },
  wantedLevel() { return Wanted.level(); },
  applyHeatFloor(f) { if (Wanted.heat < f) Wanted.heat = f; },
};

// ---------- flow ----------
function refreshContinueButton() {
  document.getElementById('btn-continue').disabled = !hasSave();
}

function startPlay(fromSave) {
  Hud.showScreen(null);
  Hud.showHud(true);
  GameState.mode = 'play';
  sound.ensure();
  sound.startMusic();
  camYaw = player.heading + Math.PI;
  if (!fromSave) saveGame(GameState, player);
}

function startNewGame() {
  clearSave();
  resetRun();
  Wanted.clear();
  Wanted.hideout = null;
  if (GameState.currentCar) exitCar(true);
  for (let i = cars.length - 1; i >= 0; i--) {
    if (cars[i].missionCar) {
      scene.remove(cars[i].mesh);
      cars.splice(i, 1);
    }
  }
  teleportPlayer(player, LANDMARKS.spawn.x, LANDMARKS.spawn.z, LANDMARKS.spawn.heading);
  GameState.health = 100;
  startPlay(false);
  Hud.toast('PORT MARISOL', 'See Sol at Ferreira Motors — the gold marker is on your map');
}

function continueGame() {
  const data = loadGame();
  if (!data) return;
  resetRun();
  GameState.cash = data.cash;
  GameState.health = data.health;
  GameState.missionIndex = data.missionIndex;
  GameState.storyDone = data.storyDone;
  GameState.oddJobsDone = data.oddJobsDone;
  GameState.stats = data.stats;
  Wanted.clear();
  teleportPlayer(player, data.player.x, data.player.z, data.player.heading);
  startPlay(true);
  Hud.toast('WELCOME BACK', 'Your Marisol career, right where you left it');
}

function openPause() {
  GameState.mode = 'pause';
  document.getElementById('pause-stats').textContent =
    `Cash $${Math.floor(GameState.cash)} · Missions done ${GameState.stats.missionsDone} · Cars stolen ${GameState.stats.carsStolen} · Top speed ${Math.round(GameState.stats.topSpeed * 3.6)} km/h`;
  Hud.showScreen('pause-screen');
  if (document.pointerLockElement) document.exitPointerLock();
}

function closePause() {
  Hud.showScreen(null);
  GameState.mode = 'play';
}

function onBusted() {
  const level = Wanted.level();
  const fine = Math.min(GameState.cash, 60 + level * 45);
  GameState.cash -= fine;
  GameState.stats.busts++;
  const failed = missions.failActive('Busted');
  void failed;
  Wanted.clear();
  Wanted.hideout = null;
  if (GameState.currentCar) exitCar(true);
  GameState.health = Math.max(GameState.health, 55);
  teleportPlayer(player, LANDMARKS.police.x, LANDMARKS.police.z + 24, 0);
  document.getElementById('busted-detail').textContent =
    `The Marisol PD impound your pride and fine you $${fine}. You walk out of the station on foot.`;
  GameState.mode = 'busted';
  Hud.showScreen('busted-screen');
  sound.bustedSting();
  sound.stopEngine();
  sound.stopSiren();
  if (document.pointerLockElement) document.exitPointerLock();
  saveGame(GameState, player);
}

function onWasted() {
  const fee = Math.min(GameState.cash, 120);
  GameState.cash -= fee;
  GameState.stats.wasted++;
  missions.failActive('Wasted');
  Wanted.clear();
  Wanted.hideout = null;
  if (GameState.currentCar) exitCar(true);
  GameState.health = 100;
  teleportPlayer(player, LANDMARKS.hospital.x, LANDMARKS.hospital.z + 24, 0);
  document.getElementById('wasted-detail').textContent =
    `St. Marisol patches you up and bills you $${fee}. Whatever you were doing, it is over.`;
  GameState.mode = 'wasted';
  Hud.showScreen('wasted-screen');
  sound.fail();
  sound.stopEngine();
  sound.stopSiren();
  if (document.pointerLockElement) document.exitPointerLock();
  saveGame(GameState, player);
}

// ---------- cars: getting in, getting out ----------
function nearestEnterableCar() {
  let best = null;
  let bestD = 3.6;
  for (const car of cars) {
    if (car.dead || car.kind === 'police') continue;
    const d = distance2d(player.x, player.z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function enterCar(car) {
  if (!car.enteredOnce) {
    car.enteredOnce = true;
    if (car.kind === 'parked' || car.kind === 'traffic') {
      GameState.stats.carsStolen++;
      Wanted.addCrime('theft', GameState.time);
      for (const ped of peds) {
        if (distance2d(ped.x, ped.z, car.x, car.z) < 14) scarePedestrian(ped, car.x, car.z, 2.5);
      }
    }
  }
  if (car.kind === 'traffic') car.kind = 'parked'; // its driver has opinions, but the car is Rio's now
  GameState.currentCar = car;
  player.mesh.visible = false;
  sound.ensure();
  sound.startEngine();
}

function exitCar(silent = false) {
  const car = GameState.currentCar;
  if (!car) return;
  GameState.currentCar = null;
  const sideX = Math.cos(car.heading);
  const sideZ = -Math.sin(car.heading);
  player.x = car.x + sideX * 2.3;
  player.z = car.z + sideZ * 2.3;
  const pos = { x: player.x, z: player.z };
  collideCircle(colliders, pos, player.radius);
  player.x = pos.x;
  player.z = pos.z;
  player.heading = car.heading;
  player.mesh.visible = true;
  syncPlayerMesh(player);
  if (!silent) sound.stopEngine();
}

function toggleCar() {
  if (GameState.currentCar) {
    if (Math.abs(GameState.currentCar.speed) < 14) exitCar();
    return;
  }
  const car = nearestEnterableCar();
  if (car) enterCar(car);
}

// ---------- talking to Sol ----------
function interact() {
  const d = distance2d(player.x, player.z, LANDMARKS.solSpot.x, LANDMARKS.solSpot.z);
  if (d < 4.5 && missions.canOffer(GameState) && !GameState.currentCar) {
    const first = missions.beginTalk(GameState, missionCtx);
    GameState.mode = 'dialogue';
    Hud.showDialogue(first.speaker, first.text);
    sound.click();
  }
}

function advanceDialogue() {
  const next = missions.dialogueAdvance(GameState, missionCtx);
  if (!next) {
    Hud.hideDialogue();
    GameState.mode = 'play';
    return;
  }
  if (next.started) {
    Hud.hideDialogue();
    GameState.mode = 'play';
    Hud.toast('NEW MISSION', next.missionName);
    sound.success();
    saveGame(GameState, player);
    return;
  }
  Hud.showDialogue(next.speaker, next.text);
  sound.click();
}

// ---------- buttons ----------
document.getElementById('btn-new-game').addEventListener('click', () => { sound.ensure(); sound.click(); startNewGame(); });
document.getElementById('btn-continue').addEventListener('click', () => { sound.ensure(); sound.click(); continueGame(); });
document.getElementById('btn-how-to').addEventListener('click', () => { sound.click(); Hud.showScreen('howto-screen'); GameState.mode = 'howto'; });
document.getElementById('btn-howto-back').addEventListener('click', () => { sound.click(); Hud.showScreen('title-screen'); GameState.mode = 'title'; });
document.getElementById('btn-resume').addEventListener('click', () => { sound.click(); closePause(); });
document.getElementById('btn-save-quit').addEventListener('click', () => {
  sound.click();
  saveGame(GameState, player);
  GameState.mode = 'title';
  Hud.showHud(false);
  Hud.showScreen('title-screen');
  refreshContinueButton();
});
document.getElementById('btn-busted-ok').addEventListener('click', () => { sound.click(); Hud.showScreen(null); GameState.mode = 'play'; });
document.getElementById('btn-wasted-ok').addEventListener('click', () => { sound.click(); Hud.showScreen(null); GameState.mode = 'play'; });
refreshContinueButton();

// ---------- damage and consequences ----------
function damagePlayer(amount) {
  if (amount <= 0 || GameState.mode !== 'play') return;
  GameState.health -= amount;
  lastDamageAt = GameState.time;
  Hud.hurtFlash();
  if (GameState.health <= 0) {
    GameState.health = 0;
    onWasted();
  }
}

// ---------- the frame ----------
const clock = new THREE.Clock();
let policeTimer = 0;
let frameCount = 0;

function focusPoint() {
  const car = GameState.currentCar;
  if (car) return { x: car.x, y: 0.8, z: car.z, heading: car.heading, speed: car.speed };
  return { x: player.x, y: 0.9, z: player.z, heading: player.heading, speed: player.speed };
}

function updateWorld(dt) {
  const time = GameState.time;
  const focus = focusPoint();
  const driving = !!GameState.currentCar;

  if (!driving && GameState.mode === 'play') {
    updatePlayerOnFoot(player, input, camYaw, colliders, dt);
  }
  if (driving && GameState.mode === 'play') {
    const events = [];
    updatePlayerDriving(GameState.currentCar, {
      forward: input.forward, back: input.back,
      left: input.left, right: input.right, handbrake: input.run,
    }, colliders, dt, events);
    resolveCarCollisions(GameState.currentCar, cars, events);
    for (const ev of events) {
      if (ev.type === 'building-hit') {
        sound.thud(Math.min(1, ev.impact / 10));
        effects.sparks(GameState.currentCar.x, 0.8, GameState.currentCar.z);
        damagePlayer(ev.impact * 0.35);
      } else if (ev.type === 'car-hit') {
        sound.thud(Math.min(1, ev.impact / 9));
        effects.sparks(ev.other.x, 0.8, ev.other.z);
        Wanted.addCrime(ev.other.kind === 'police' ? 'ram' : 'crash', time);
      }
    }
    const kmh = Math.abs(GameState.currentCar.speed) * 3.6;
    if (kmh > GameState.stats.topSpeed * 3.6) GameState.stats.topSpeed = GameState.currentCar.speed;
    sound.setEngine(Math.abs(GameState.currentCar.speed) / 33, true);
  }

  // traffic and police
  for (const car of cars) {
    if (car === GameState.currentCar || car.dead) continue;
    if (car.kind === 'traffic') updateTrafficCar(car, cars, colliders, rng, dt);
    else if (car.kind === 'police') updatePoliceCar(car, focus, cars, colliders, dt, time);
    if (car.damage > 55 && Math.random() < dt * 2) effects.smoke(car.x, 1.1, car.z, car.damage > 80);
  }
  if (GameState.currentCar && GameState.currentCar.damage > 55 && Math.random() < dt * 2) {
    effects.smoke(GameState.currentCar.x, 1.1, GameState.currentCar.z, GameState.currentCar.damage > 80);
  }

  // pedestrians, and what happens when cars meet them
  for (const ped of peds) {
    updatePedestrian(ped, colliders, dt, rng);
    if (ped.state === 'down') continue;
    for (const car of cars) {
      if (car.dead || Math.abs(car.speed) < 3.5) continue;
      if (distance2d(ped.x, ped.z, car.x, car.z) < 2.1) {
        if (knockDownPedestrian(ped)) {
          sound.thud(0.7);
          if (car === GameState.currentCar) {
            Wanted.addCrime('pedHit', time);
            effects.burst(ped.x, 0.8, ped.z, { count: 8, color: 0xd64545, speed: 2.5, up: 1.5, life: 0.4 });
          }
        }
        break;
      }
    }
    // crowds scatter from a fast-approaching player car
    if (GameState.currentCar && Math.abs(GameState.currentCar.speed) > 11) {
      if (distance2d(ped.x, ped.z, GameState.currentCar.x, GameState.currentCar.z) < 7) {
        scarePedestrian(ped, GameState.currentCar.x, GameState.currentCar.z, 2);
      }
    }
  }

  // wanted, police presence, the bust, return fire
  policeTimer -= dt;
  if (policeTimer <= 0) {
    policeTimer = 0.5;
    Wanted.maintainPolice(scene, rng, cars, focus);
  }
  const policeCars = cars.filter((c) => c.kind === 'police' && !c.dead);
  const policeNear = policeCars.some((c) => distance2d(c.x, c.z, focus.x, focus.z) < 34);
  Wanted.update(dt, time, policeNear, focus);
  if (GameState.mode === 'play') {
    const bust = Wanted.updateBust(dt, focus, Math.abs(focus.speed), !driving, policeCars);
    if (bust === 'busted') {
      onBusted();
      return;
    }
    const shotDamage = combat.updatePoliceFire(dt, Wanted.level(), focus, !driving, policeCars, focus);
    if (shotDamage > 0) damagePlayer(shotDamage);
  }
  combat.update(dt);

  // siren volume follows the nearest cruiser
  if (policeCars.length) {
    sound.startSiren();
    let nearest = Infinity;
    for (const c of policeCars) nearest = Math.min(nearest, distance2d(c.x, c.z, focus.x, focus.z));
    sound.setSiren(clamp(1 - nearest / 70, 0, 1), time);
  } else {
    sound.stopSiren();
  }

  // missions
  if (GameState.mode === 'play' || GameState.mode === 'dialogue') {
    const ev = missions.update(dt, missionCtx, time);
    if (ev && ev.type === 'complete') {
      GameState.cash += ev.def.reward;
      GameState.stats.missionsDone++;
      if (ev.def.isStory) {
        GameState.missionIndex++;
        if (GameState.missionIndex >= 5) GameState.storyDone = true;
      } else {
        GameState.oddJobsDone++;
      }
      Hud.toast('MISSION COMPLETE', `${ev.def.name} · +$${ev.def.reward}`);
      sound.success();
      effects.confetti(focus.x, 2, focus.z);
      saveGame(GameState, player);
    } else if (ev && ev.type === 'fail') {
      Hud.toast('MISSION FAILED', `${ev.def.name} — ${ev.reason}. See Sol to try again`);
      sound.fail();
    }
  }

  // health drifts back when Rio stays out of trouble
  if (GameState.health > 0 && GameState.health < 100 && time - lastDamageAt > 6) {
    GameState.health = Math.min(100, GameState.health + 2.4 * dt);
  }

  effects.update(dt);
  clouds.position.x = Math.sin(time * 0.01) * 12;
}

function refreshHud() {
  const time = GameState.time;
  const focus = focusPoint();
  Hud.setHealth(GameState.health);
  Hud.setCash(GameState.cash);
  Hud.setWanted(Wanted.level(), time);
  Hud.setSpeed(GameState.currentCar ? Math.abs(GameState.currentCar.speed) * 3.6 : null);
  Hud.setBust(Wanted.bustMeter);
  Hud.setCrosshair(!GameState.currentCar && GameState.mode === 'play');

  const info = missions.objectiveInfo();
  let objectiveForMap = null;
  if (info && info.marker) {
    const d = Math.round(distance2d(focus.x, focus.z, info.marker.x, info.marker.z));
    let distText = `${d} m`;
    if (missions.timeLeft() > 0) distText += ` · ⏱ ${Math.ceil(missions.timeLeft())}s`;
    Hud.setObjective(info.title, info.text, distText);
    objectiveForMap = info.marker;
  } else if (missions.canOffer(GameState)) {
    const d = Math.round(distance2d(focus.x, focus.z, LANDMARKS.solSpot.x, LANDMARKS.solSpot.z));
    Hud.setObjective('FREE ROAM', 'See Sol at Ferreira Motors for work', `${d} m`);
    objectiveForMap = LANDMARKS.solSpot;
  } else {
    Hud.setObjective(null);
  }
  GameState.objective = objectiveForMap;

  // contextual prompt
  let prompt = null;
  if (GameState.mode === 'play') {
    if (GameState.currentCar) {
      if (Math.abs(GameState.currentCar.speed) < 2) prompt = '<span class="key">F</span>Exit car';
    } else if (distance2d(player.x, player.z, LANDMARKS.solSpot.x, LANDMARKS.solSpot.z) < 4.5 && missions.canOffer(GameState)) {
      prompt = '<span class="key">E</span>Talk to Sol Ferreira';
    } else if (nearestEnterableCar()) {
      prompt = '<span class="key">F</span>Enter car';
    }
  }
  Hud.showPrompt(prompt);

  drawMinimap(Hud.els.minimap, {
    player: focus,
    traffic: cars.filter((c) => c.kind === 'traffic' || c.kind === 'parked'),
    police: cars.filter((c) => c.kind === 'police' && !c.dead),
    objective: objectiveForMap,
    time,
  });
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  GameState.time += dt;
  frameCount++;
  const mode = GameState.mode;
  if (mode === 'play' || mode === 'dialogue') {
    updateWorld(dt);
    const focus = focusPoint();
    updateOrbitCamera(camera, focus, camYaw, camPitch, GameState.currentCar ? 10.5 : 7, colliders, dt, false);
    refreshHud();
  } else if (mode === 'title' || mode === 'howto') {
    // the city stays alive behind the menus
    for (const car of cars) if (car.kind === 'traffic') updateTrafficCar(car, cars, colliders, rng, dt);
    for (const ped of peds) updatePedestrian(ped, colliders, dt, rng);
    effects.update(dt);
    titleCameraPose(camera, GameState.time);
  }
  renderer.render(scene, camera);
  if (shotRequest && !window.__shotReady && GameState.time > 2.4) window.__shotReady = true;
}

// ---------- screenshot staging (see shots.js) ----------
const shotApi = {
  state: GameState,
  wanted: Wanted,
  startPlay() { startPlay(false); },
  teleportPlayer(x, z, heading) { teleportPlayer(player, x, z, heading); },
  setCam(yaw, pitch) { camYaw = yaw; camPitch = pitch; },
  setCash(n) { GameState.cash = n; },
  setHealth(n) { GameState.health = n; },
  beginDialogue() {
    // staged scenes open Sol's conversation directly (the walk-up E press is for players)
    const first = missions.beginTalk(GameState, missionCtx);
    GameState.mode = 'dialogue';
    Hud.showDialogue(first.speaker, first.text);
  },
  beginStoryMission(index) {
    GameState.missionIndex = index;
    missions.beginTalk(GameState, missionCtx);
    let guard = 0;
    while (missions.dialogue && guard++ < 12) missions.dialogueAdvance(GameState, missionCtx);
    const missionCar = cars.find((c) => c.missionCar && !c.enteredOnce);
    return missionCar || null;
  },
  putPlayerInCar(car, pose) {
    if (!car) return;
    car.x = pose.x;
    car.z = pose.z;
    car.heading = pose.heading;
    car.speed = pose.speed || 0;
    syncCarMesh(car);
    enterCar(car);
    // entering cold counts as a theft in the real game; a staged scene is not a crime
    Wanted.clear();
  },
  spawnPoliceAt(x, z, heading) {
    const car = createCar(scene, rng, x, z, heading, 'police', 0xf2f4f6);
    cars.push(car);
    return car;
  },
};

// ---------- boot ----------
Hud.showScreen('title-screen');
if (shotRequest) {
  setupShotScene(shotRequest, shotApi);
  if (shotRequest.shot !== 'title') Hud.showScreen(null);
}
animate();

// A small handle for automated play-testing (and curious players in devtools): the live
// state, the cast, and a teleport. It changes nothing about the game itself.
window.__marisol = {
  state: GameState,
  player,
  cars,
  peds,
  wanted: Wanted,
  missions,
  renderer,
  teleport: (x, z, heading) => teleportPlayer(player, x, z, heading),
  enterNearest: () => {
    const car = nearestEnterableCar();
    if (car) enterCar(car);
    return !!car;
  },
};
