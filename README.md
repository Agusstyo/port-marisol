[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Agusstyo/port-marisol/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Agusstyo/port-marisol/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

<sub>Entered on [make.fun](https://make.fun/?ref=hh8nsv3m&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

# Port Marisol

An original open-world crime game that runs entirely in a desktop browser from static files.

**Port Marisol** is a sun-soaked coastal city of pastel towers and palm promenades, and you are
**Rio Calloway** — a driver with more nerve than money. Fixer **Sol Ferreira** runs jobs out of
Ferreira Motors: deliveries, a repossession, a harbour time trial, an evasion, and one big
finale. The Marisol PD has opinions about all of it. Everything — the city, characters,
vehicles, names, story, art, sound and music — is original to this game and generated in code;
there are no asset files and nothing is fetched from the network.

## Play it

Serve the `game/` folder with any static file server and open `index.html` in a desktop
browser — or, from this repository:

```
node serve.ts            # http://localhost:8080
```

| Keys | Action |
| --- | --- |
| `W A S D` / arrows | Walk and drive |
| `Shift` | Run / handbrake |
| Mouse (click the game to lock) | Orbit camera |
| `E` | Talk / interact |
| `F` | Enter / exit a car — parked, moving, anyone's |
| Click (pointer locked) | Fire Rio's pistol |
| `P` / `Esc` | Pause · `M` mute |

## What's in the game

- **A complete city district** — a street grid of pastel tower blocks and low shops with
  procedural window textures, a signed garage, police station, hospital and marina, palm
  promenades, lamp posts, a beach and the sea, with building collision throughout.
- **On foot and by car** — a third-person character with a mouse-orbit camera; arcade driving
  with steering, handbrake drifts, damage and smoke; any car can be entered and stolen.
- **Traffic and crowds** — AI cars cruise the grid on right-hand lanes, brake for the car
  ahead and turn at junctions; pedestrians stroll the sidewalks and scatter from danger,
  gunfire and fast cars.
- **A wanted system** — theft, collisions and gunfire raise up to five stars; Marisol PD
  cruisers spawn, chase and ram, and pin a slow driver or a pedestrian Rio for a **bust**
  (fine + a walk out of the station). Break line of sight — or sit in a hideout — to cool off.
  At three stars the police shoot back.
- **Combat and consequences** — a hitscan pistol, health and regeneration, a **wasted**
  outcome that respawns Rio at St. Marisol Hospital minus a fee.
- **A story** — five missions from Sol with full dialogue, gold objective beacons, timers and
  cash rewards, then endless generated odd jobs (deliveries, repossessions, gate runs).
- **A full HUD** — health, cash, wanted stars, speedometer, objective card with distance and
  timer, bust meter, interact prompts, and a live **minimap** with streets, landmarks,
  traffic, police and the objective.
- **Screens and saving** — title screen over a living city, How to Play, pause with run
  stats, busted/wasted screens; cash, story progress and position **save to localStorage**
  automatically and resume with Continue.
- **Synthesized sound** — WebAudio engine note tied to speed, two-tone sirens that follow the
  nearest cruiser, gunshots, impacts, cash chimes, mission stingers and a slow tropical pad
  loop. No audio files.

## How it is built

Plain ES modules under `game/src/`, one system per file, rendered with three.js (vendored,
minified, under `game/vendor/`):

- `city.js` — the procedural city, landmarks, collision boxes, road layout
- `player.js` — Rio's on-foot controller and the orbit/title cameras
- `vehicles.js` — the car factory, player driving, traffic AI, police AI
- `pedestrians.js` — the crowd: sidewalk loops, fleeing, knockdowns
- `wanted.js` — heat, stars, police fleet management, the bust meter
- `missions.js` — Sol, dialogue, the five-mission story chain, odd jobs, objective beacons
- `combat.js` — the pistol, hitscan, police return fire
- `hud.js` — every HUD element and the canvas minimap
- `audio.js` — the whole soundscape, synthesized
- `effects.js` — one recycled particle pool (sparks, smoke, muzzle flashes, confetti)
- `save.js` — the localStorage save format
- `shots.js` — deterministic screenshot scenes (`?shot=cover&seed=1`, etc.)

`main.ts` (Node 22, standard library only) hands the game in: it copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with `buildDossier` from
`vendor/makefun-game.ts`, the kit's library, byte for byte.

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots in `screenshots/` are real captures of the running game, staged through the
`?shot=` URLs listed in `shots.json` — a delivery run for the cover, a three-star chase, Sol's
opening dialogue, and the title screen.

## License

MIT — see `LICENSE`.
