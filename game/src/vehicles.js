// Vehicles: the car factory (every car in Port Marisol is boxes and cylinders in a paint
// colour, police cars get a light bar), arcade driving physics for the player, lane-following
// traffic AI that cruises the grid and brakes for the car ahead, and police AI that hunts the
// player. Cars are plain objects { mesh, x, z, heading, speed, kind, damage, ... } kept in one
// list the rest of the game reads.

import * as THREE from '../vendor/three.min.js';
import { WORLD, collideCircle } from './city.js';
import { angleDelta, clamp } from './random.js';

export const CAR_COLORS = [0xe63946, 0xf4a261, 0x2a9d8f, 0x457b9d, 0xffd166, 0x9b5de5, 0xf1fa8c, 0xe0e1dd, 0x118ab2, 0xef476f];

const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1e });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x20303c });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb8c4cc });

export function makeCarMesh(paint, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhongMaterial({ color: paint, shininess: 60, specular: 0x666666 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.55, 4.3), bodyMat);
  body.position.y = 0.58;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.52, 2.1), isPolice ? new THREE.MeshLambertMaterial({ color: 0x14202b }) : glassMat);
  cabin.position.set(0, 1.08, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.7), bodyMat);
  nose.position.set(0, 0.48, 2.2);
  group.add(nose);
  for (const [wx, wz] of [[-0.85, 1.45], [0.85, 1.45], [-0.85, -1.45], [0.85, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.37, wz);
    group.add(wheel);
  }
  const lightGeo = new THREE.BoxGeometry(0.34, 0.12, 0.06);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  for (const s of [-0.6, 0.6]) {
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(s, 0.62, 2.56);
    group.add(head);
    const tail = new THREE.Mesh(lightGeo, tailMat);
    tail.position.set(s, 0.66, -2.16);
    group.add(tail);
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.15), chromeMat);
  bumper.position.set(0, 0.32, -2.2);
  group.add(bumper);
  let lightMats = null;
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), new THREE.MeshLambertMaterial({ color: 0x11151a }));
    bar.position.set(0, 1.42, -0.25);
    group.add(bar);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    const blueMat = new THREE.MeshBasicMaterial({ color: 0x2266ff });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), redMat);
    red.position.set(-0.3, 1.44, -0.25);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.42), blueMat);
    blue.position.set(0.3, 1.44, -0.25);
    group.add(blue);
    lightMats = { redMat, blueMat };
  }
  return { group, lightMats };
}

export function createCar(scene, rng, x, z, heading, kind, paint) {
  const isPolice = kind === 'police';
  const { group, lightMats } = makeCarMesh(isPolice ? 0xf2f4f6 : paint, isPolice);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  const car = {
    mesh: group, lightMats, x, z, heading, speed: 0, kind,
    damage: 0, stolen: false, missionCar: false, dead: false,
    axis: Math.abs(Math.sin(heading)) > 0.7 ? 'x' : 'z',
    dir: 1, cruise: 11 + rng() * 5, brake: 0, stuckTime: 0, reverseTime: 0,
  };
  if (car.axis === 'x') car.dir = Math.sin(heading) > 0 ? 1 : -1;
  else car.dir = Math.cos(heading) > 0 ? 1 : -1;
  return car;
}

// The lane centre coordinate for a car travelling on `axis` in direction `dir`:
// right-hand traffic, 4 metres from the road centreline.
export function laneCoordinate(axis, dir, roadCoord) {
  if (axis === 'x') return roadCoord + (dir > 0 ? 4 : -4);
  return roadCoord + (dir > 0 ? -4 : 4);
}

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? 0 : Math.PI;
}

function nearestRoadCoord(value) {
  let best = WORLD.roads[0];
  for (const r of WORLD.roads) if (Math.abs(r - value) < Math.abs(best - value)) best = r;
  return best;
}

export function syncCarMesh(car) {
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

// Is there a car roughly `gap` metres ahead of `car` in its own lane?
function carAhead(car, cars, gap) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * fx + dz * fz;
    if (ahead > 0 && ahead < gap) {
      const side = Math.abs(dx * fz - dz * fx);
      if (side < 2.2) return other;
    }
  }
  return null;
}

// Traffic: cruise the current street, slow for the car ahead, and at each junction either
// carry on or turn onto the crossing street. Turns are taken by steering toward the new
// lane, so cars sweep around corners instead of snapping.
export function updateTrafficCar(car, cars, colliders, rng, dt) {
  if (car.dead) return;
  const roadCoord = car.axis === 'x' ? nearestRoadCoord(car.z) : nearestRoadCoord(car.x);
  const lane = laneCoordinate(car.axis, car.dir, roadCoord);
  const along = car.axis === 'x' ? car.x : car.z;
  const crossRoad = nearestRoadCoord(along);
  const distToJunction = Math.abs(crossRoad - along);

  // choose a turn as the junction approaches
  if (distToJunction < 6 && !car.turnDecided) {
    car.turnDecided = true;
    const roll = rng();
    if (roll < 0.42 && Math.abs(crossRoad) < 240) {
      car.turning = { axis: car.axis === 'x' ? 'z' : 'x', dir: rng() < 0.5 ? 1 : -1, at: crossRoad };
    }
  }
  if (distToJunction > 14) car.turnDecided = false;

  let desired = headingFor(car.axis, car.dir);
  let targetLanePos = car.axis === 'x' ? car.z : car.x;
  if (car.turning) {
    const t = car.turning;
    const junctionAlong = t.at;
    const passed = t.axis === 'z' ? (car.axis === 'x' && Math.abs(car.x - junctionAlong) < 3) : Math.abs(car.z - junctionAlong) < 3;
    if (passed || distToJunction < 2.5) {
      car.axis = t.axis;
      car.dir = t.dir;
      car.turning = null;
      desired = headingFor(car.axis, car.dir);
    } else {
      desired = headingFor(t.axis, t.dir);
    }
  }
  targetLanePos = lane;

  const blocker = carAhead(car, cars, 9);
  let targetSpeed = car.cruise;
  if (blocker) targetSpeed = Math.min(targetSpeed, blocker.speed * 0.92);
  if (car.turning) targetSpeed = Math.min(targetSpeed, 7);
  car.speed += clamp(targetSpeed - car.speed, -14 * dt, 6 * dt);

  const turn = clamp(angleDelta(car.heading, desired), -1.9 * dt, 1.9 * dt);
  car.heading += turn;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  // ease back onto the lane centreline
  const laneError = targetLanePos - (car.axis === 'x' ? car.z : car.x);
  if (!car.turning) {
    if (car.axis === 'x') car.z += clamp(laneError, -3 * dt, 3 * dt);
    else car.x += clamp(laneError, -3 * dt, 3 * dt);
  }
  const pos = { x: car.x, z: car.z };
  if (collideCircle(colliders, pos, 1.6)) {
    car.x = pos.x;
    car.z = pos.z;
    car.speed = Math.min(car.speed, 2);
  }
  // the district loops: a car that runs off one end of its street comes back at the other
  if (car.axis === 'x') {
    if (car.x > 254) car.x = -254;
    else if (car.x < -254) car.x = 254;
  } else {
    if (car.z > 254) car.z = -254;
    else if (car.z < -254) car.z = 254;
  }
  syncCarMesh(car);
}

// Police: aim at a point just behind the player's position, drive hard, and try to stay on
// the player. If boxed in by a building for a while, back up and come again.
export function updatePoliceCar(car, target, cars, colliders, dt, time) {
  if (car.dead) return;
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const aimX = target.x - Math.sin(target.heading || 0) * 3;
  const aimZ = target.z - Math.cos(target.heading || 0) * 3;
  const desired = Math.atan2(aimX - car.x, aimZ - car.z);
  const delta = angleDelta(car.heading, desired);

  let targetSpeed = 33;
  if (dist < 7) targetSpeed = Math.max(6, (target.speed || 0) + 2);
  if (Math.abs(delta) > 2.4) targetSpeed = -8; // badly misaligned: reverse out
  if (car.reverseTime > 0) {
    car.reverseTime -= dt;
    targetSpeed = -10;
  }
  car.speed += clamp(targetSpeed - car.speed, -22 * dt, 11 * dt);
  const steerAuthority = clamp(car.speed / 9, -1.4, 1.4);
  car.heading += clamp(delta, -1, 1) * 1.75 * dt * (steerAuthority === 0 ? 1 : Math.sign(steerAuthority)) * Math.min(1, Math.abs(steerAuthority) + 0.35);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const pos = { x: car.x, z: car.z };
  if (collideCircle(colliders, pos, 1.6)) {
    car.x = pos.x;
    car.z = pos.z;
    if (Math.abs(car.speed) > 6 && car.reverseTime <= 0) car.reverseTime = 0.55;
    car.speed *= 0.4;
  }
  const blocker = carAhead(car, cars, 5.5);
  if (blocker && blocker.kind !== 'player') car.speed = Math.min(car.speed, blocker.speed + 1);
  // light bar strobes
  if (car.lightMats) {
    const phase = Math.floor(time * 6) % 2;
    car.lightMats.redMat.color.setHex(phase ? 0xff2222 : 0x661111);
    car.lightMats.blueMat.color.setHex(phase ? 0x112266 : 0x2266ff);
  }
  syncCarMesh(car);
}

// The player's driving: arcade physics — strong engine, grippy steering that loosens with
// the handbrake, and honest collisions. Returns impact events for sound/damage/wanted.
export function updatePlayerDriving(car, input, colliders, dt, events) {
  const accel = car.damage > 85 ? 9 : 15;
  if (input.forward) car.speed += accel * dt;
  else if (input.back) car.speed -= (car.speed > 0.5 ? 20 : 8) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 3.2 * dt);
  const drag = 0.35 + (input.handbrake ? 0.9 : 0);
  car.speed -= car.speed * drag * dt * 0.28;
  const topSpeed = car.damage > 85 ? 19 : 33;
  car.speed = clamp(car.speed, -11, topSpeed);

  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  const speedFactor = clamp(Math.abs(car.speed) / 7, 0, 1);
  const grip = input.handbrake ? 1.9 : 1.15;
  if (car.speed !== 0) {
    car.heading += steerInput * grip * speedFactor * dt * Math.sign(car.speed) * 0.9;
  }
  const prevX = car.x;
  const prevZ = car.z;
  const prevSpeed = car.speed;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const pos = { x: car.x, z: car.z };
  if (collideCircle(colliders, pos, 1.7)) {
    car.x = pos.x;
    car.z = pos.z;
    const impact = Math.abs(prevSpeed) * 0.8;
    if (impact > 3.5) events.push({ type: 'building-hit', impact });
    car.speed *= 0.25;
    car.damage = Math.min(100, car.damage + impact * 0.7);
  }
  void prevX;
  void prevZ;
  syncCarMesh(car);
  return Math.abs(car.speed);
}

// Soft car-to-car pushes: overlapping cars separate, and the moving one takes the blame
// (and the damage). Returns a list of hits { other, impact } for the caller to judge.
export function resolveCarCollisions(mover, cars, events) {
  for (const other of cars) {
    if (other === mover || other.dead) continue;
    const dx = mover.x - other.x;
    const dz = mover.z - other.z;
    const d2 = dx * dx + dz * dz;
    const minDist = 3.4;
    if (d2 < minDist * minDist && d2 > 0.001) {
      const d = Math.sqrt(d2);
      const push = (minDist - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      mover.x += nx * push;
      mover.z += nz * push;
      if (other.kind !== 'player') {
        other.x -= nx * push;
        other.z -= nz * push;
        syncCarMesh(other);
      }
      const impact = Math.abs(mover.speed);
      if (impact > 2.5) {
        events.push({ type: 'car-hit', other, impact });
        other.damage = Math.min(100, other.damage + impact * 1.6);
        mover.damage = Math.min(100, mover.damage + impact * 0.8);
        mover.speed *= 0.45;
      } else {
        mover.speed *= 0.8;
      }
    }
  }
}
