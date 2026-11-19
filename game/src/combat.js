// Combat: Rio's pistol. A click fires a hitscan shot from the camera through the crosshair;
// the nearest thing it can hit — a pedestrian, a car, or a building — takes it, with sparks,
// a bang, frightened bystanders and the wanted heat to match. At three stars and up the
// police shoot back: slow, telegraphed fire that chips health and gives the player a reason
// to run instead of fight.

import * as THREE from '../vendor/three.min.js';
import { knockDownPedestrian, scarePedestrian } from './pedestrians.js';

const SHOT_RANGE = 110;

function raySphere(origin, dir, cx, cy, cz, r) {
  const ox = cx - origin.x;
  const oy = cy - origin.y;
  const oz = cz - origin.z;
  const t = ox * dir.x + oy * dir.y + oz * dir.z;
  if (t < 0) return -1;
  const px = origin.x + dir.x * t - cx;
  const py = origin.y + dir.y * t - cy;
  const pz = origin.z + dir.z * t - cz;
  const d2 = px * px + py * py + pz * pz;
  return d2 <= r * r ? t : -1;
}

function rayBuilding(origin, dir, colliders) {
  // slab test against every building box (boxes run from y 0 to a tall height)
  let best = Infinity;
  for (const c of colliders) {
    let tmin = 0;
    let tmax = SHOT_RANGE;
    for (const axis of ['x', 'z']) {
      const o = axis === 'x' ? origin.x : origin.z;
      const d = axis === 'x' ? dir.x : dir.z;
      const lo = axis === 'x' ? c.minX : c.minZ;
      const hi = axis === 'x' ? c.maxX : c.maxZ;
      if (Math.abs(d) < 1e-6) {
        if (o < lo || o > hi) { tmin = Infinity; break; }
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { tmin = Infinity; break; }
      }
    }
    if (tmin < best && tmin > 0) best = tmin;
  }
  return best === Infinity ? -1 : best;
}

export class Combat {
  constructor(effects, sound) {
    this.effects = effects;
    this.sound = sound;
    this.cooldown = 0;
    this.policeFireTimer = 2;
  }

  // Fire once. ctx carries the world: camera, from (muzzle origin), peds, cars, colliders,
  // and the crime callback. Returns what was hit: 'ped' | 'car' | 'police' | 'building' | null.
  shoot(ctx, time) {
    if (this.cooldown > 0) return null;
    this.cooldown = 0.24;
    const dir = new THREE.Vector3();
    ctx.camera.getWorldDirection(dir);
    const origin = ctx.camera.position.clone();
    this.sound.shot();
    const muzzle = ctx.from;
    this.effects.muzzle(muzzle.x, (muzzle.y || 0) + 1.35, muzzle.z);

    let bestT = SHOT_RANGE;
    let hit = null;
    let hitRef = null;
    const buildingT = rayBuilding(origin, dir, ctx.colliders);
    if (buildingT > 0) bestT = buildingT;
    for (const ped of ctx.peds) {
      if (ped.state === 'down') continue;
      const t = raySphere(origin, dir, ped.x, 1.05, ped.z, 0.62);
      if (t > 0 && t < bestT) { bestT = t; hit = 'ped'; hitRef = ped; }
    }
    for (const car of ctx.cars) {
      if (car.dead) continue;
      const t = raySphere(origin, dir, car.x, 0.75, car.z, 2.3);
      if (t > 0 && t < bestT) { bestT = t; hit = car.kind === 'police' ? 'police' : 'car'; hitRef = car; }
    }
    const impact = origin.clone().add(dir.clone().multiplyScalar(Math.min(bestT, SHOT_RANGE)));
    if (hit === 'ped') {
      if (knockDownPedestrian(hitRef)) ctx.onCrime('pedShot', time);
      this.effects.burst(impact.x, impact.y, impact.z, { count: 8, color: 0xd64545, speed: 2.5, up: 1.5, life: 0.4 });
    } else if (hit === 'car' || hit === 'police') {
      hitRef.damage = Math.min(100, hitRef.damage + 22);
      this.effects.sparks(impact.x, impact.y, impact.z);
      ctx.onCrime(hit === 'police' ? 'copShot' : 'shot', time);
    } else if (buildingT > 0) {
      hit = 'building';
      this.effects.sparks(impact.x, impact.y, impact.z);
    } else {
      ctx.onCrime('shot', time);
    }
    // gunfire panics everyone nearby, hit or not
    for (const ped of ctx.peds) {
      const dx = ped.x - ctx.from.x;
      const dz = ped.z - ctx.from.z;
      if (dx * dx + dz * dz < 26 * 26) scarePedestrian(ped, ctx.from.x, ctx.from.z, 3.5);
    }
    return hit;
  }

  // Police return fire at high heat: one shot every couple of seconds from the nearest
  // cruiser, mostly a warning — some of them land. Returns damage dealt this frame.
  updatePoliceFire(dt, level, playerPos, onFoot, policeCars, playerCarPos) {
    if (level < 3) {
      this.policeFireTimer = 2;
      return 0;
    }
    this.policeFireTimer -= dt;
    if (this.policeFireTimer > 0) return 0;
    this.policeFireTimer = 1.6 + Math.random() * 1.2;
    let nearest = null;
    let nearestD = Infinity;
    for (const cop of policeCars) {
      if (cop.dead) continue;
      const dx = cop.x - playerPos.x;
      const dz = cop.z - playerPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearestD) { nearestD = d; nearest = cop; }
    }
    if (!nearest || nearestD > 30) return 0;
    this.sound.shot();
    const target = onFoot ? playerPos : playerCarPos;
    this.effects.muzzle(nearest.x, 1.2, nearest.z);
    if (Math.random() < 0.45) {
      this.effects.sparks(target.x, 1.1, target.z);
      return onFoot ? 7 : 3; // a hit: health in the open, mostly paintwork in a car
    }
    this.effects.burst(target.x + 1.5, 0.4, target.z + 1, { count: 4, color: 0xcccccc, speed: 2, up: 1.5, life: 0.3 });
    return 0;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }
}
