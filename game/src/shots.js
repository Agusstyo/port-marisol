// Deterministic screenshot scenes. The game reads ?shot=<name>&seed=<n> from its URL and,
// instead of the title screen, stages a real moment of the game with the real systems — the
// cover is a genuine delivery run, the chase is a genuine three-star pursuit with the real
// police AI about to take over, the fixer scene is Sol's actual opening dialogue. The
// screenshot script waits for window.__shotReady and captures the running game.

export function parseShotRequest() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return null;
  const seed = Number(params.get('seed') || 1) || 1;
  return { shot, seed };
}

export function setupShotScene(request, api) {
  const { shot } = request;
  const { state } = api;
  if (shot === 'title') {
    // the title screen over the orbiting city camera — the game's own front door
    return;
  }
  api.startPlay();
  if (shot === 'fixer') {
    // Rio at Sol's shoulder outside Ferreira Motors, the opening conversation open
    api.teleportPlayer(34, -80.5, 2.62);
    api.setCam(2.62, 0.24);
    api.beginDialogue();
    return;
  }
  if (shot === 'cover') {
    // Mission one, second stage: Rio is driving Sol's sedan down the grand avenue toward
    // the marina with the delivery objective on the HUD, traffic all around
    const missionCar = api.beginStoryMission(0);
    api.putPlayerInCar(missionCar, { x: -4, z: -34, heading: 0, speed: 13 });
    api.setCash(1250);
    api.setCam(0, 0.3);
    return;
  }
  if (shot === 'chase') {
    // Mission four's hot hatchback, three stars, the PD closing in from behind
    const missionCar = api.beginStoryMission(3);
    api.putPlayerInCar(missionCar, { x: 40, z: 76.5, heading: Math.PI / 2, speed: 21 });
    api.setCash(2340);
    api.setHealth(76);
    api.wanted.setHeat(3.4, state.time);
    api.spawnPoliceAt(40 - 17, 69, Math.PI / 2);
    api.spawnPoliceAt(40 - 26, 84, Math.PI / 2);
    api.spawnPoliceAt(40 + 30, 69, Math.PI / 2 + 0.4);
    api.setCam(Math.PI / 2, 0.3);
    return;
  }
  // unknown shot name: fall back to a plain free-roam start
  api.teleportPlayer(state.player.x, state.player.z, Math.PI);
}
