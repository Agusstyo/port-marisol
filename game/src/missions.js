// Missions: Sol Ferreira, the fixer at Ferreira Motors, is the game's story engine. Talk to
// him (E) and he talks back in the dialogue box, then hands Rio a job: a chain of five story
// missions — a delivery, a theft, a timed harbour run, an evasion, and a two-pickup finale —
// and endless generated odd jobs once the chain is done. Missions are small stage machines:
// each stage has an objective line, a gold beacon in the world, and a check; some carry a
// timer. Busts and hospital trips fail the active job.

import * as THREE from '../vendor/three.min.js';
import { LANDMARKS } from './city.js';
import { animatePerson, makePerson } from './pedestrians.js';
import { randRange } from './random.js';

const FERREIRA = LANDMARKS.ferreira;
const MARINA = LANDMARKS.marina;

function lines(...pairs) {
  return pairs.map(([speaker, text]) => ({ speaker, text }));
}

export const STORY_MISSIONS = [
  {
    id: 'first-wheels',
    name: 'First Wheels',
    reward: 200,
    intro: lines(
      ['SOL FERREIRA', 'Rio Calloway. Heard you can drive. Heard you also owe half of Marisol money.'],
      ['RIO', 'One problem at a time, Sol. You got work or just gossip?'],
      ['SOL FERREIRA', 'Work. My sedan outside — blue one. There is a package in the trunk a friend at the marina is waiting on.'],
      ['SOL FERREIRA', 'Drive it down, hand it over, come back with your pockets heavier. Try not to scratch her.'],
    ),
    build(ctx) {
      const car = ctx.spawnCar(16, -88, Math.PI / 2, 'parked', 0x457b9d);
      car.missionCar = true;
      return [
        { text: "Get in Sol's sedan", marker: () => ({ x: car.x, z: car.z }), radius: 4, check: (c) => c.currentCar === car },
        { text: 'Deliver the package to Marisol Marina', marker: () => ({ x: MARINA.x, z: 238 }), radius: 10, check: (c) => c.currentCar === car && c.at(MARINA.x, 238, 10) },
      ];
    },
  },
  {
    id: 'hot-property',
    name: 'Hot Property',
    reward: 350,
    intro: lines(
      ['SOL FERREIRA', 'See that gold coupe parked up by the west towers? Belongs to a man who stopped paying for it.'],
      ['RIO', 'So I am the bank now.'],
      ['SOL FERREIRA', 'You are the repossession department. Take it, bring it here. If the police notice — that is your department too.'],
    ),
    build(ctx) {
      const car = ctx.spawnCar(-152, 68, 0, 'parked', 0xffd166);
      car.missionCar = true;
      return [
        { text: 'Steal the gold coupe', marker: () => ({ x: car.x, z: car.z }), radius: 4, check: (c) => c.currentCar === car },
        { text: 'Bring the coupe to Ferreira Motors', marker: () => ({ x: FERREIRA.x, z: -88 }), radius: 11, check: (c) => c.currentCar === car && c.at(FERREIRA.x, -88, 11) },
      ];
    },
  },
  {
    id: 'harbor-run',
    name: 'Harbor Run',
    reward: 450,
    intro: lines(
      ['SOL FERREIRA', 'The marina boys run a little time trial when the promenade is quiet. Four gates, one clock.'],
      ['RIO', 'And you bet on me, I suppose.'],
      ['SOL FERREIRA', 'I bet on the car. You just come with it. Any wheels will do — gates are lit gold, follow the beacons.'],
    ),
    build() {
      const gates = [
        { x: -216, z: 216 }, { x: -72, z: 248 }, { x: 108, z: 216 }, { x: 216, z: 120 },
      ];
      let gate = 0;
      return [
        {
          text: () => `Harbor Run — gate ${Math.min(gate + 1, 4)} of 4`,
          marker: () => gates[Math.min(gate, 3)],
          radius: 11,
          timer: 85,
          check: (c) => {
            if (!c.currentCar) return false;
            if (c.at(gates[gate].x, gates[gate].z, 11)) {
              gate++;
              c.chime();
            }
            return gate >= 4;
          },
        },
      ];
    },
  },
  {
    id: 'lose-the-heat',
    name: 'Lose the Heat',
    reward: 550,
    intro: lines(
      ['SOL FERREIRA', 'That hatchback by the door? It is, let us say, borrowed from the police impound. They noticed.'],
      ['RIO', 'You are giving me a car with three stars already on it.'],
      ['SOL FERREIRA', 'I am giving you a car and an address: the old depot yard, south-west blocks. Get there, stay quiet, let the heat die.'],
    ),
    build(ctx) {
      const car = ctx.spawnCar(52, -88, -Math.PI / 2, 'parked', 0xe63946);
      car.missionCar = true;
      const hideout = { x: -36, z: 156, r: 16 };
      return [
        {
          text: 'Get in the borrowed hatchback', marker: () => ({ x: car.x, z: car.z }), radius: 4,
          check: (c) => c.currentCar === car,
          onStart: (c) => c.setWanted(3),
        },
        {
          text: 'Reach the depot-yard hideout', marker: () => hideout, radius: 12,
          check: (c) => c.at(hideout.x, hideout.z, 12),
          onDone: (c) => c.setHideout(hideout),
        },
        {
          text: 'Stay hidden until the heat dies', marker: () => hideout, radius: 999,
          check: (c) => c.wantedLevel() === 0,
          onDone: (c) => c.setHideout(null),
        },
      ];
    },
  },
  {
    id: 'the-marisol-job',
    name: 'The Marisol Job',
    reward: 1200,
    intro: lines(
      ['SOL FERREIRA', 'Big one tonight, Rio. Two friends of mine need a ride to the marina, and half the force will want to say hello.'],
      ['RIO', 'Marta by the promenade, Deacon uptown. Then the marina. I know the route.'],
      ['SOL FERREIRA', 'Pick them up, keep the car in one piece, and do not stop for anybody wearing blue. Twelve hundred. This is the job that makes you.'],
    ),
    build() {
      const stops = [
        { label: 'Pick up Marta at the promenade', x: -120, z: 244 },
        { label: 'Pick up Deacon uptown', x: 62, z: 138 },
        { label: 'Get everyone to Marisol Marina', x: MARINA.x, z: 238 },
      ];
      let stop = 0;
      return [
        {
          text: () => stops[stop].label,
          marker: () => stops[stop],
          radius: 10,
          timer: 170,
          heatFloor: 1.6,
          check: (c) => {
            if (!c.currentCar) return false;
            if (c.at(stops[stop].x, stops[stop].z, 10)) {
              stop++;
              c.chime();
            }
            return stop >= stops.length;
          },
        },
      ];
    },
  },
];

// A generated odd job, once the story is told (or any time Sol has nothing scripted left).
function makeOddJob(rng, ctx) {
  const kind = ['delivery', 'steal', 'race'][Math.floor(rng() * 3)];
  const spots = [
    { x: -180, z: -180 }, { x: 180, z: -36 }, { x: -108, z: 36 }, { x: 108, z: -180 },
    { x: -216, z: 108 }, { x: 216, z: -108 }, { x: 0, z: 216 }, { x: -180, z: 216 },
  ];
  const target = spots[Math.floor(rng() * spots.length)];
  if (kind === 'steal') {
    const car = ctx.spawnCar(target.x + 6, target.z, 0, 'parked', 0x9b5de5);
    car.missionCar = true;
    return {
      id: 'odd-steal', name: 'Odd Job: Repossession', reward: 260,
      intro: lines(['SOL FERREIRA', 'Quick one. A violet sedan across town needs a new home — mine. Bring it back.']),
      stages: [
        { text: 'Steal the violet sedan', marker: () => ({ x: car.x, z: car.z }), radius: 4, check: (c) => c.currentCar === car },
        { text: 'Bring it to Ferreira Motors', marker: () => ({ x: FERREIRA.x, z: -88 }), radius: 11, check: (c) => c.currentCar === car && c.at(FERREIRA.x, -88, 11) },
      ],
    };
  }
  if (kind === 'race') {
    const gates = [target, { x: -target.x * 0.5, z: 108 }, { x: FERREIRA.x, z: -60 }];
    let gate = 0;
    return {
      id: 'odd-race', name: 'Odd Job: Gate Run', reward: 320,
      intro: lines(['SOL FERREIRA', 'Three gates, one clock, any car. The marina boys are betting again.']),
      stages: [
        {
          text: () => `Gate Run — gate ${Math.min(gate + 1, 3)} of 3`,
          marker: () => gates[Math.min(gate, 2)], radius: 11, timer: 80,
          check: (c) => {
            if (!c.currentCar) return false;
            if (c.at(gates[gate].x, gates[gate].z, 11)) { gate++; c.chime(); }
            return gate >= 3;
          },
        },
      ],
    };
  }
  const reward = 180 + Math.floor(randRange(rng, 0, 160));
  return {
    id: 'odd-delivery', name: 'Odd Job: Drop-off', reward,
    intro: lines(['SOL FERREIRA', 'Package run. Take any car, get it across town before the clock runs out.']),
    stages: [
      {
        text: 'Make the drop-off across town', marker: () => target, radius: 10,
        timer: 95,
        check: (c) => !!c.currentCar && c.at(target.x, target.z, 10),
      },
    ],
  };
}

export class Missions {
  constructor(scene, rng) {
    this.rng = rng;
    const { group, limbs } = makePerson(rng, { shirt: 0xff8c42, pants: 0x37474f });
    this.solMesh = group;
    this.solLimbs = limbs;
    this.solMesh.position.set(LANDMARKS.solSpot.x, 0, LANDMARKS.solSpot.z);
    this.solMesh.rotation.y = 0; // faces the street, and Rio
    scene.add(this.solMesh);

    // the objective beacon: a shaft of gold light with a ring at its foot
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 42, 12, 1, true), beaconMat);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.beaconRing = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.22, 8, 28), ringMat);
    this.beaconRing.rotation.x = Math.PI / 2;
    this.beacon.visible = false;
    this.beaconRing.visible = false;
    scene.add(this.beacon);
    scene.add(this.beaconRing);

    this.active = null; // { def, stages, stageIndex, timeLeft }
    this.dialogue = null; // { queue, index, onDone }
    this.pendingDef = null;
  }

  canOffer(state) {
    return !this.active && !this.dialogue;
  }

  offerDef(state, ctx) {
    if (state.missionIndex < STORY_MISSIONS.length) {
      const def = STORY_MISSIONS[state.missionIndex];
      return { ...def, stages: def.build(ctx), isStory: true };
    }
    return makeOddJob(this.rng, ctx);
  }

  // Begin the conversation at Sol's shoulder. Returns the first line to show.
  beginTalk(state, ctx) {
    this.pendingDef = this.offerDef(state, ctx);
    this.dialogue = { queue: this.pendingDef.intro, index: 0, onDone: 'start-mission' };
    return this.dialogue.queue[0];
  }

  dialogueCurrent() {
    if (!this.dialogue) return null;
    return this.dialogue.queue[this.dialogue.index];
  }

  // Advance; returns the next line, or null when the conversation is over (the mission
  // then starts, if that is what the conversation was for).
  dialogueAdvance(state, ctx) {
    if (!this.dialogue) return null;
    this.dialogue.index++;
    if (this.dialogue.index < this.dialogue.queue.length) return this.dialogueCurrent();
    const done = this.dialogue.onDone;
    this.dialogue = null;
    if (done === 'start-mission' && this.pendingDef) {
      this.active = {
        def: this.pendingDef,
        stages: this.pendingDef.stages,
        stageIndex: 0,
        timeLeft: this.pendingDef.stages[0].timer || 0,
      };
      this.pendingDef = null;
      const first = this.active.stages[0];
      if (first.onStart && ctx) first.onStart(ctx);
      return { started: true, missionName: this.active.def.name, firstStage: first };
    }
    return null;
  }

  currentStage() {
    if (!this.active) return null;
    return this.active.stages[this.active.stageIndex];
  }

  objectiveInfo() {
    const stage = this.currentStage();
    if (!stage) return null;
    const text = typeof stage.text === 'function' ? stage.text() : stage.text;
    const marker = typeof stage.marker === 'function' ? stage.marker() : stage.marker;
    return { title: this.active.def.name.toUpperCase(), text, marker };
  }

  // Advance the stage machine. ctx is the mission context main.js builds each frame.
  // Returns an event: { type: 'stage' } | { type: 'complete', def } | { type: 'fail', reason } | null
  update(dt, ctx, time) {
    // Sol idles, turning to face Rio when he is close
    const dx = ctx.player.x - LANDMARKS.solSpot.x;
    const dz = ctx.player.z - LANDMARKS.solSpot.z;
    if (dx * dx + dz * dz < 30 * 30) {
      this.solMesh.rotation.y = Math.atan2(dx, dz);
      animatePerson({ limbs: this.solLimbs }, Math.sin(time * 1.6) * 0.06, 0);
    }
    if (!this.active) {
      this.beacon.visible = false;
      this.beaconRing.visible = false;
      return null;
    }
    const stage = this.currentStage();
    if (!stage) return null;
    if (stage.heatFloor) ctx.applyHeatFloor(stage.heatFloor);
    if (stage.timer) {
      this.active.timeLeft -= dt;
      if (this.active.timeLeft <= 0) {
        const def = this.active.def;
        this.active = null;
        ctx.setHideout(null);
        return { type: 'fail', def, reason: 'Out of time' };
      }
    }
    const info = this.objectiveInfo();
    if (info && info.marker) {
      this.beacon.visible = true;
      this.beaconRing.visible = true;
      this.beacon.position.set(info.marker.x, 21, info.marker.z);
      this.beaconRing.position.set(info.marker.x, 0.4 + Math.sin(time * 3) * 0.15, info.marker.z);
      const s = 1 + Math.sin(time * 3) * 0.12;
      this.beaconRing.scale.set(s, s, s);
    } else {
      this.beacon.visible = false;
      this.beaconRing.visible = false;
    }
    if (stage.check(ctx)) {
      if (stage.onDone) stage.onDone(ctx);
      this.active.stageIndex++;
      const next = this.currentStage();
      if (!next) {
        const def = this.active.def;
        this.active = null;
        ctx.setHideout(null);
        return { type: 'complete', def };
      }
      this.active.timeLeft = next.timer || 0;
      if (next.onStart) next.onStart(ctx);
      return { type: 'stage', def: this.active.def };
    }
    return null;
  }

  // Busts and hospital trips end the job.
  failActive(reason) {
    if (!this.active) return null;
    const def = this.active.def;
    this.active = null;
    return { type: 'fail', def, reason };
  }

  timeLeft() {
    return this.active ? this.active.timeLeft : 0;
  }
}
