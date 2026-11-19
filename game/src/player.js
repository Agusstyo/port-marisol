// Rio Calloway on foot: a third-person character who walks and runs anywhere in the city,
// turns toward his movement, swings his limbs as he goes, and is followed by a mouse-orbit
// camera that eases behind him and slides along walls instead of clipping through them.

import * as THREE from '../vendor/three.min.js';
import { collideCircle } from './city.js';
import { angleDelta, clamp } from './random.js';
import { animatePerson, makePerson } from './pedestrians.js';

export function createPlayer(scene, rng, spawn) {
  const { group, limbs } = makePerson(rng, { shirt: 0x0e7c86, pants: 0x2b2d42, cap: true });
  group.position.set(spawn.x, 0, spawn.z);
  scene.add(group);
  return {
    mesh: group, limbs,
    x: spawn.x, z: spawn.z, heading: spawn.heading || 0,
    speed: 0, walkPhase: 0, radius: 0.5,
  };
}

export function teleportPlayer(player, x, z, heading) {
  player.x = x;
  player.z = z;
  if (heading !== undefined) player.heading = heading;
  player.speed = 0;
  syncPlayerMesh(player);
}

export function syncPlayerMesh(player) {
  player.mesh.position.set(player.x, 0, player.z);
  player.mesh.rotation.y = player.heading;
}

// input: { forward, back, left, right, run } in camera space; cameraYaw is where the camera
// looks from. Movement is camera-relative, the way a third-person game should feel.
export function updatePlayerOnFoot(player, input, cameraYaw, colliders, dt) {
  let mx = 0;
  let mz = 0;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  if (input.forward) { mx += sin; mz += cos; }
  if (input.back) { mx -= sin; mz -= cos; }
  if (input.left) { mx += cos; mz -= sin; }
  if (input.right) { mx -= cos; mz += sin; }
  const moving = mx !== 0 || mz !== 0;
  const targetSpeed = moving ? (input.run ? 6.4 : 3.1) : 0;
  if (moving) {
    const len = Math.sqrt(mx * mx + mz * mz);
    mx /= len;
    mz /= len;
    const desired = Math.atan2(mx, mz);
    player.heading += clamp(angleDelta(player.heading, desired), -10 * dt, 10 * dt);
  }
  player.speed += clamp(targetSpeed - player.speed, -18 * dt, 12 * dt);
  if (player.speed > 0.05) {
    player.x += Math.sin(player.heading) * player.speed * dt;
    player.z += Math.cos(player.heading) * player.speed * dt;
    const pos = { x: player.x, z: player.z };
    collideCircle(colliders, pos, player.radius);
    player.x = pos.x;
    player.z = pos.z;
  }
  player.walkPhase += dt * (3 + player.speed * 2.2);
  animatePerson(player, player.speed > 0.2 ? player.walkPhase : 0, input.run ? 1 : 0);
  syncPlayerMesh(player);
}

// A smoothed orbit camera. `focus` is the point it watches (Rio, or his car); yaw/pitch are
// driven by the mouse in main.js; the camera eases toward its berth and is pushed out of
// buildings so the view never goes inside a tower.
export function updateOrbitCamera(camera, focus, yaw, pitch, distance, colliders, dt, snap) {
  const cx = focus.x - Math.sin(yaw) * Math.cos(pitch) * distance;
  const cz = focus.z - Math.cos(yaw) * Math.cos(pitch) * distance;
  const cy = focus.y + 1.6 + Math.sin(pitch) * distance;
  const pos = { x: cx, z: cz };
  collideCircle(colliders, pos, 0.5);
  const k = snap ? 1 : 1 - Math.pow(0.0001, dt);
  camera.position.x += (pos.x - camera.position.x) * k;
  camera.position.z += (pos.z - camera.position.z) * k;
  camera.position.y += (Math.max(0.7, cy) - camera.position.y) * k;
  camera.lookAt(focus.x, focus.y + 1.5, focus.z);
}

// The slow cinematic orbit used behind the title screen.
export function titleCameraPose(camera, time) {
  const r = 95;
  const a = time * 0.05;
  camera.position.set(Math.sin(a) * r, 34 + Math.sin(time * 0.13) * 5, 130 + Math.cos(a) * 40);
  camera.lookAt(0, 8, -30);
}
