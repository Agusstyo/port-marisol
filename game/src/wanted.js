// The wanted system: crimes add heat, heat becomes stars, stars decide how many Marisol PD
// cars hunt the player. Heat cools when the player breaks line of sight and stays out of
// trouble — faster inside a mission hideout. If police pin a slow or on-foot player, the
// bust meter fills; a full meter is a bust: a fine, the heat cleared, and a walk out of the
// police station.

import { WORLD } from './city.js';
import { createCar } from './vehicles.js';

const CRIME_POINTS = {
  theft: 1.0, // stealing a car: straight to one star
  crash: 0.35, // hitting another car
  pedHit: 1.2, // hitting a pedestrian
  shot: 0.8, // firing a weapon in public
  pedShot: 1.4, // shooting a pedestrian
  copShot: 1.8, // shooting at police or their car
  ram: 0.5, // ramming a police car
};

export const Wanted = {
  heat: 0,
  bustMeter: 0,
  lastCrimeAt: -100,
  lastSeenAt: -100,
  hideout: null, // { x, z, r } while a mission hideout is active

  level() {
    if (this.heat <= 0.01) return 0;
    return Math.min(5, Math.ceil(this.heat));
  },

  addCrime(kind, time) {
    const points = CRIME_POINTS[kind] || 0.3;
    this.heat = Math.min(5.6, this.heat + points);
    this.lastCrimeAt = time;
  },

  setHeat(value, time) {
    this.heat = Math.max(0, Math.min(5.6, value));
    this.lastCrimeAt = time;
  },

  clear() {
    this.heat = 0;
    this.bustMeter = 0;
  },

  policeTargetCount() {
    return [0, 1, 2, 3, 4, 6][this.level()];
  },

  // Call every frame. policeNear: any police car within 34 m. Returns nothing; read
  // level() and bustMeter afterwards.
  update(dt, time, policeNear, playerPos) {
    if (policeNear) this.lastSeenAt = time;
    const sinceCrime = time - this.lastCrimeAt;
    const sinceSeen = time - this.lastSeenAt;
    if (this.heat > 0 && sinceCrime > 7 && sinceSeen > 4) {
      let rate = 0.055;
      if (this.hideout) {
        const dx = playerPos.x - this.hideout.x;
        const dz = playerPos.z - this.hideout.z;
        if (dx * dx + dz * dz < this.hideout.r * this.hideout.r) rate = 0.5;
      }
      this.heat = Math.max(0, this.heat - rate * dt);
    }
    if (this.level() === 0) this.bustMeter = Math.max(0, this.bustMeter - dt * 0.5);
  },

  // The bust: police close + player slow (or on foot) = the meter climbs.
  // Returns 'busted' once, when the meter fills.
  updateBust(dt, playerPos, playerSpeed, onFoot, policeCars) {
    if (this.level() === 0) {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 0.6);
      return null;
    }
    let nearest = Infinity;
    for (const cop of policeCars) {
      if (cop.dead) continue;
      const dx = cop.x - playerPos.x;
      const dz = cop.z - playerPos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < nearest) nearest = d;
    }
    const pinned = (onFoot && nearest < 6.5) || (!onFoot && nearest < 7.5 && playerSpeed < 2.2);
    if (pinned) {
      this.bustMeter += dt / 2.4;
      if (this.bustMeter >= 1) {
        this.bustMeter = 0;
        return 'busted';
      }
    } else {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 0.45);
    }
    return null;
  },

  // Keep the police fleet at the size the stars demand: spawn on streets a few blocks
  // away, retire cars that fall far behind when the heat is off.
  maintainPolice(scene, rng, cars, playerPos) {
    const target = this.policeTargetCount();
    const active = cars.filter((c) => c.kind === 'police' && !c.dead);
    if (active.length < target) {
      const angle = rng() * Math.PI * 2;
      const dist = 78 + rng() * 30;
      let x = playerPos.x + Math.sin(angle) * dist;
      let z = playerPos.z + Math.cos(angle) * dist;
      // snap to the nearest street so they arrive by road
      if (rng() < 0.5) x = nearestRoad(x);
      else z = nearestRoad(z);
      x = Math.max(-244, Math.min(244, x));
      z = Math.max(-244, Math.min(244, z));
      const heading = Math.atan2(playerPos.x - x, playerPos.z - z);
      cars.push(createCar(scene, rng, x, z, heading, 'police', 0xf2f4f6));
    } else if (active.length > target) {
      // retire the farthest one when nobody is watching it
      let far = null;
      let farD = 0;
      for (const cop of active) {
        const dx = cop.x - playerPos.x;
        const dz = cop.z - playerPos.z;
        const d = dx * dx + dz * dz;
        if (d > farD) { farD = d; far = cop; }
      }
      if (far && farD > 120 * 120) {
        far.dead = true;
        scene.remove(far.mesh);
        cars.splice(cars.indexOf(far), 1);
      }
    }
  },
};

function nearestRoad(value) {
  let best = WORLD.roads[0];
  for (const r of WORLD.roads) if (Math.abs(r - value) < Math.abs(best - value)) best = r;
  return best;
}
