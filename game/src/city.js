// Port Marisol's city: a pastel coastal district on a regular street grid — tower blocks and
// low shops around Ferreira Motors, a police station, a hospital, and a palm promenade that
// ends at the beach and the sea. Everything is procedural (canvas textures, box geometry, a
// few instanced meshes), so the whole city ships as code with no asset files. The module also
// owns the static collision boxes every mover tests against, and the road/sidewalk layout the
// traffic and pedestrian systems drive on.

import * as THREE from '../vendor/three.min.js';
import { makeRng, pick, randRange } from './random.js';

export const WORLD = {
  pitch: 72, // distance between road centrelines
  roadHalf: 8, // half the width of a road
  roads: [-216, -144, -72, 0, 72, 144, 216], // road centrelines on both axes
  blockCenters: [-180, -108, -36, 36, 108, 180],
  extent: 250, // playable ground half-size (x and the north/south land edge)
  promenadeZ: 256, // the palm walk along the south edge
  beachZ: 288, // sand starts here
};

export const LANDMARKS = {
  ferreira: { x: 36, z: -108, label: 'Ferreira Motors' },
  solSpot: { x: 36, z: -84, label: 'Sol Ferreira' },
  police: { x: -108, z: 108, label: 'Marisol PD' },
  hospital: { x: 108, z: 180, label: 'St. Marisol Hospital' },
  marina: { x: 196, z: 252, label: 'Marisol Marina' },
  spawn: { x: 22, z: -80, heading: Math.PI },
};

const PASTEL = [0xf6c177, 0xf2a65a, 0xe8836b, 0x9fd8c9, 0x7fb5d5, 0xf7ead7, 0xe8b4b8, 0xb5c99a, 0xffd9a0, 0x8ecae6];

function makeWindowTexture(rng, base, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 11) {
    for (let x = 5; x < 58; x += 10) {
      const lit = rng() < litRatio;
      ctx.fillStyle = lit ? 'rgba(255, 236, 170, 0.95)' : 'rgba(38, 64, 84, 0.85)';
      ctx.fillRect(x, y, 6, 7);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = fg;
  ctx.font = '900 52px "Avenir Next", Verdana, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addBuilding(scene, colliders, materials, x, z, w, d, h, tint) {
  const side = materials[Math.floor(Math.abs(x * 7 + z * 13 + h)) % materials.length].clone();
  side.color = new THREE.Color(tint);
  const roof = new THREE.MeshLambertMaterial({ color: 0x8a7f72 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side]);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  colliders.push({ minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4, minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4 });
  return mesh;
}

function addLandmark(scene, colliders, spot, w, d, h, color, signText, signBg, signFg) {
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color }),
  );
  body.position.set(spot.x, h / 2, spot.z);
  body.castShadow = true;
  body.receiveShadow = true;
  scene.add(body);
  colliders.push({ minX: spot.x - w / 2 - 0.4, maxX: spot.x + w / 2 + 0.4, minZ: spot.z - d / 2 - 0.4, maxZ: spot.z + d / 2 + 0.4 });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.92, h * 0.3),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(signText, signBg, signFg) }),
  );
  sign.position.set(spot.x, h * 0.78, spot.z + d / 2 + 0.06);
  scene.add(sign);
  const signBack = sign.clone();
  signBack.rotation.y = Math.PI;
  signBack.position.z = spot.z - d / 2 - 0.06;
  scene.add(signBack);
}

export function buildCity(scene, seed) {
  const rng = makeRng(seed * 7919 + 13);
  const colliders = [];

  // --- light and sky: warm late-morning sun over the bay ---
  scene.background = new THREE.Color(0x9fd3e8);
  scene.fog = new THREE.Fog(0xbfe3ea, 190, 620);
  const hemi = new THREE.HemisphereLight(0xcfeaff, 0x8a7a5f, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.9);
  sun.position.set(160, 240, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -300;
  sun.shadow.camera.right = 300;
  sun.shadow.camera.top = 300;
  sun.shadow.camera.bottom = -300;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(randRange(rng, 30, 70), 3, randRange(rng, 12, 22)), cloudMat);
    cloud.position.set(randRange(rng, -420, 420), randRange(rng, 95, 140), randRange(rng, -420, 420));
    clouds.add(cloud);
  }
  scene.add(clouds);

  // --- ground: asphalt everywhere, pale pads for the blocks, sand and sea to the south ---
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 560),
    new THREE.MeshLambertMaterial({ color: 0x4a4f57 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.set(0, 0, 20);
  asphalt.receiveShadow = true;
  scene.add(asphalt);
  const padMat = new THREE.MeshLambertMaterial({ color: 0xcfc4ae });
  for (const bx of WORLD.blockCenters) {
    for (const bz of WORLD.blockCenters) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(54, 54), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(bx, 0.03, bz);
      pad.receiveShadow = true;
      scene.add(pad);
    }
  }
  const promenade = new THREE.Mesh(new THREE.PlaneGeometry(560, 26), new THREE.MeshLambertMaterial({ color: 0xe6d3ac }));
  promenade.rotation.x = -Math.PI / 2;
  promenade.position.set(0, 0.04, WORLD.promenadeZ);
  promenade.receiveShadow = true;
  scene.add(promenade);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(560, 60), new THREE.MeshLambertMaterial({ color: 0xf2dfae }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, WORLD.beachZ + 22);
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 320),
    new THREE.MeshPhongMaterial({ color: 0x1590a5, shininess: 90, specular: 0xbfefff }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, WORLD.beachZ + 190);
  scene.add(sea);

  // --- road markings: dashed centre lines on every street ---
  const dashGeo = new THREE.PlaneGeometry(3.2, 0.35);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5eeda });
  const dashCount = WORLD.roads.length * 2 * 74;
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const m4 = new THREE.Matrix4();
  const rot = new THREE.Quaternion();
  const flat = new THREE.Euler(-Math.PI / 2, 0, 0);
  const flatSide = new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2);
  const one = new THREE.Vector3(1, 1, 1);
  let di = 0;
  for (const r of WORLD.roads) {
    for (let t = -252; t <= 252; t += 7) {
      rot.setFromEuler(flat);
      m4.compose(new THREE.Vector3(t, 0.05, r), rot, one);
      dashes.setMatrixAt(di++, m4);
      rot.setFromEuler(flatSide);
      m4.compose(new THREE.Vector3(r, 0.05, t + 20), rot, one);
      if (di < dashCount) dashes.setMatrixAt(di++, m4);
    }
  }
  dashes.count = di;
  scene.add(dashes);

  // --- buildings: towers and low blocks in pastel, landmarks in their own colours ---
  const windowMats = ['#d9c8a9', '#c4b299', '#b7c9c0', '#cbb7a6'].map((base, i) =>
    new THREE.MeshLambertMaterial({ map: makeWindowTexture(rng, base, 0.28 + i * 0.1) }),
  );
  const special = new Set([
    `${LANDMARKS.ferreira.x},${LANDMARKS.ferreira.z}`,
    `${LANDMARKS.police.x},${LANDMARKS.police.z}`,
    `${LANDMARKS.hospital.x},${LANDMARKS.hospital.z}`,
  ]);
  for (const bx of WORLD.blockCenters) {
    for (const bz of WORLD.blockCenters) {
      if (special.has(`${bx},${bz}`)) continue;
      const style = rng();
      if (style < 0.34) {
        addBuilding(scene, colliders, windowMats, bx, bz, randRange(rng, 26, 34), randRange(rng, 26, 34), randRange(rng, 34, 78), pick(rng, PASTEL));
      } else if (style < 0.72) {
        for (const ox of [-13, 13]) {
          for (const oz of [-13, 13]) {
            addBuilding(scene, colliders, windowMats, bx + ox, bz + oz, randRange(rng, 18, 23), randRange(rng, 18, 23), randRange(rng, 12, 30), pick(rng, PASTEL));
          }
        }
      } else {
        addBuilding(scene, colliders, windowMats, bx - 12, bz, randRange(rng, 20, 24), randRange(rng, 40, 46), randRange(rng, 16, 40), pick(rng, PASTEL));
        addBuilding(scene, colliders, windowMats, bx + 14, bz, randRange(rng, 16, 20), randRange(rng, 40, 46), randRange(rng, 10, 22), pick(rng, PASTEL));
      }
    }
  }
  addLandmark(scene, colliders, LANDMARKS.ferreira, 40, 26, 11, 0xff8c42, 'FERREIRA MOTORS', '#12303c', '#ffb347');
  addLandmark(scene, colliders, LANDMARKS.police, 38, 28, 15, 0x35506b, 'MARISOL PD', '#0d2233', '#ffffff');
  addLandmark(scene, colliders, LANDMARKS.hospital, 40, 28, 17, 0xf4f6f6, 'ST. MARISOL HOSPITAL', '#e63946', '#ffffff');
  addLandmark(scene, colliders, LANDMARKS.marina, 30, 16, 8, 0x2a9d8f, 'MARISOL MARINA', '#0b3540', '#a8e063');

  // --- palms along the promenade and on street corners (instanced) ---
  const palmSpots = [];
  for (let x = -252; x <= 252; x += 21) palmSpots.push({ x: x + randRange(rng, -3, 3), z: WORLD.promenadeZ - 9 });
  for (const bx of WORLD.blockCenters) {
    for (const bz of WORLD.blockCenters) {
      if (rng() < 0.75) palmSpots.push({ x: bx + pick(rng, [-25, 25]), z: bz + pick(rng, [-25, 25]) });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
  const frondGeo = new THREE.ConeGeometry(3.4, 1.6, 7);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, palmSpots.length);
  palmSpots.forEach((p, i) => {
    const tilt = randRange(rng, -0.07, 0.07);
    rot.setFromEuler(new THREE.Euler(tilt, 0, tilt * 2));
    m4.compose(new THREE.Vector3(p.x, 3.2, p.z), rot, one);
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x + tilt * 8, 6.9, p.z), rot, one);
    fronds.setMatrixAt(i, m4);
    colliders.push({ minX: p.x - 0.5, maxX: p.x + 0.5, minZ: p.z - 0.5, maxZ: p.z + 0.5 });
  });
  trunks.castShadow = true;
  scene.add(trunks);
  scene.add(fronds);

  // --- lamp posts at intersections ---
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.09, 6, 5);
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x37474f });
  const lampHeadGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
  const lampPositions = [];
  for (const rx of WORLD.roads) {
    for (const rz of WORLD.roads) {
      lampPositions.push({ x: rx + 10, z: rz + 10 });
      lampPositions.push({ x: rx - 10, z: rz - 10 });
    }
  }
  const lampPoles = new THREE.InstancedMesh(lampGeo, lampMat, lampPositions.length);
  const lampHeads = new THREE.InstancedMesh(lampHeadGeo, lampHeadMat, lampPositions.length);
  lampPositions.forEach((p, i) => {
    rot.identity();
    m4.compose(new THREE.Vector3(p.x, 3, p.z), rot, one);
    lampPoles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(p.x, 6.1, p.z), rot, one);
    lampHeads.setMatrixAt(i, m4);
  });
  scene.add(lampPoles);
  scene.add(lampHeads);

  return { colliders, clouds, sea };
}

// Push a circle (x, z, radius) out of every building box; returns true if it hit anything.
export function collideCircle(colliders, pos, radius) {
  let hit = false;
  for (const c of colliders) {
    const nearX = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nearZ = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nearX;
    const dz = pos.z - nearZ;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nearX + (dx / d) * radius;
        pos.z = nearZ + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const left = pos.x - c.minX;
        const right = c.maxX - pos.x;
        const top = pos.z - c.minZ;
        const bottom = c.maxZ - pos.z;
        const minPen = Math.min(left, right, top, bottom);
        if (minPen === left) pos.x = c.minX - radius;
        else if (minPen === right) pos.x = c.maxX + radius;
        else if (minPen === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  // keep everything on land and inside the district
  pos.x = Math.max(-WORLD.extent - 6, Math.min(WORLD.extent + 6, pos.x));
  pos.z = Math.max(-WORLD.extent - 6, Math.min(WORLD.beachZ + 8, pos.z));
  return hit;
}

export function isOnRoad(x, z) {
  for (const r of WORLD.roads) {
    if (Math.abs(x - r) <= WORLD.roadHalf || Math.abs(z - r) <= WORLD.roadHalf) return true;
  }
  return false;
}

// Where parked cars sit: bays along road edges, heading with the street.
export function parkedCarSpots(rng) {
  const spots = [];
  for (const r of WORLD.roads) {
    for (let t = -200; t <= 200; t += 34) {
      if (rng() < 0.42) spots.push({ x: t + randRange(rng, -3, 3), z: r - 6.4, heading: Math.PI / 2 });
      if (rng() < 0.42) spots.push({ x: r + 6.4, z: t + randRange(rng, -3, 3) + 14, heading: 0 });
    }
  }
  return spots.slice(0, 34);
}
