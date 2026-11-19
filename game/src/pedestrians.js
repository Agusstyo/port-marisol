// Pedestrians: low-poly people built from boxes with swinging limbs, walking loops around
// the block sidewalks. They mind their business until danger shows up — a speeding car, a
// gunshot, a police chase — then they run. A person who is hit or shot goes down and fades
// back into the crowd a while later across town.

import * as THREE from '../vendor/three.min.js';
import { WORLD, collideCircle } from './city.js';
import { randRange } from './random.js';

const SKIN = [0xf2c79b, 0xc68863, 0x8d5524, 0xffdbac];
const SHIRTS = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0x9b5de5, 0xf4a261, 0xffffff, 0x2a9d8f];
const PANTS = [0x2b2d42, 0x415a77, 0x6c5849, 0x1d3557, 0x595959];

// Builds one person; returns the group plus the limb pivots the walk cycle swings.
// Heights ~1.8 m. `cap` adds a flat cap (the player's look).
export function makePerson(rng, { shirt, pants, skin, cap } = {}) {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin ?? SKIN[Math.floor(rng() * SKIN.length)] });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt ?? SHIRTS[Math.floor(rng() * SHIRTS.length)] });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants ?? PANTS[Math.floor(rng() * PANTS.length)] });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), skinMat);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  if (cap) {
    const capMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.52), new THREE.MeshLambertMaterial({ color: 0xe63946 }));
    capMesh.position.set(0, 1.9, 0.06);
    group.add(capMesh);
  }
  const limbs = {};
  for (const side of [-1, 1]) {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.4, 1.42, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.66, 0.16), shirtMat);
    arm.position.y = -0.3;
    armPivot.add(arm);
    group.add(armPivot);
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.16, 0.78, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.76, 0.2), pantsMat);
    leg.position.y = -0.38;
    legPivot.add(leg);
    group.add(legPivot);
    limbs[side < 0 ? 'armL' : 'armR'] = armPivot;
    limbs[side < 0 ? 'legL' : 'legR'] = legPivot;
  }
  return { group, limbs };
}

export function animatePerson(person, walkPhase, runFactor) {
  const swing = Math.sin(walkPhase) * (0.45 + runFactor * 0.35);
  person.limbs.legL.rotation.x = swing;
  person.limbs.legR.rotation.x = -swing;
  person.limbs.armL.rotation.x = -swing * 0.8;
  person.limbs.armR.rotation.x = swing * 0.8;
}

export function createPedestrian(scene, rng) {
  const { group, limbs } = makePerson(rng);
  const blockX = WORLD.blockCenters[Math.floor(rng() * WORLD.blockCenters.length)];
  const blockZ = WORLD.blockCenters[Math.floor(rng() * WORLD.blockCenters.length)];
  const ped = {
    mesh: group, limbs, x: blockX + randRange(rng, -24, 24), z: blockZ + 24,
    heading: rng() * Math.PI * 2, speed: 0, walkPhase: rng() * 6,
    state: 'walk', // walk | flee | down
    blockX, blockZ, corner: Math.floor(rng() * 4), downTime: 0, fleeTime: 0, panicX: 0, panicZ: 0,
  };
  group.position.set(ped.x, 0, ped.z);
  scene.add(group);
  return ped;
}

// Sidewalk loop: walk the rectangle 24 m out from the block centre, corner to corner.
function nextCornerTarget(ped) {
  const off = 24.5;
  const corners = [
    { x: ped.blockX - off, z: ped.blockZ - off },
    { x: ped.blockX + off, z: ped.blockZ - off },
    { x: ped.blockX + off, z: ped.blockZ + off },
    { x: ped.blockX - off, z: ped.blockZ + off },
  ];
  return corners[ped.corner % 4];
}

export function scarePedestrian(ped, fromX, fromZ, seconds) {
  if (ped.state === 'down') return;
  ped.state = 'flee';
  ped.fleeTime = Math.max(ped.fleeTime, seconds);
  ped.panicX = fromX;
  ped.panicZ = fromZ;
}

export function knockDownPedestrian(ped) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.downTime = 14;
  ped.mesh.rotation.x = -Math.PI / 2;
  ped.mesh.position.y = 0.25;
  return true;
}

export function updatePedestrian(ped, colliders, dt, rng) {
  if (ped.state === 'down') {
    ped.downTime -= dt;
    if (ped.downTime <= 0) {
      // back on their feet, across town
      ped.blockX = WORLD.blockCenters[Math.floor(rng() * WORLD.blockCenters.length)];
      ped.blockZ = WORLD.blockCenters[Math.floor(rng() * WORLD.blockCenters.length)];
      ped.x = ped.blockX + randRange(rng, -20, 20);
      ped.z = ped.blockZ + 20;
      ped.state = 'walk';
      ped.mesh.rotation.x = 0;
      ped.mesh.position.y = 0;
    }
    return;
  }
  let targetSpeed = 1.5;
  let target;
  if (ped.state === 'flee') {
    ped.fleeTime -= dt;
    if (ped.fleeTime <= 0) ped.state = 'walk';
    const away = Math.atan2(ped.x - ped.panicX, ped.z - ped.panicZ);
    target = { x: ped.x + Math.sin(away) * 12, z: ped.z + Math.cos(away) * 12 };
    targetSpeed = 4.6;
  } else {
    target = nextCornerTarget(ped);
    const dx = target.x - ped.x;
    const dz = target.z - ped.z;
    if (dx * dx + dz * dz < 1.2) ped.corner++;
  }
  const desired = Math.atan2(target.x - ped.x, target.z - ped.z);
  let delta = desired - ped.heading;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  ped.heading += Math.max(-3.2 * dt, Math.min(3.2 * dt, delta));
  ped.speed += Math.max(-8 * dt, Math.min(8 * dt, targetSpeed - ped.speed));
  ped.x += Math.sin(ped.heading) * ped.speed * dt;
  ped.z += Math.cos(ped.heading) * ped.speed * dt;
  const pos = { x: ped.x, z: ped.z };
  collideCircle(colliders, pos, 0.45);
  ped.x = pos.x;
  ped.z = pos.z;
  ped.walkPhase += dt * (4 + ped.speed * 2.4);
  animatePerson(ped, ped.walkPhase, ped.speed > 3 ? 1 : 0);
  ped.mesh.position.set(ped.x, 0, ped.z);
  ped.mesh.rotation.y = ped.heading;
}
