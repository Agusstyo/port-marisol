// The shared game state: one plain object every system reads and writes, so the modules stay
// decoupled (city builds the world, vehicles move the cars, missions read positions) and the
// save system can snapshot the whole run from a single place.

export const GameState = {
  mode: 'title', // title | howto | play | dialogue | pause | busted | wasted
  time: 0, // seconds since the run started
  cash: 250,
  health: 100,
  missionIndex: 0, // next story mission to offer at Ferreira Motors
  storyDone: false,
  oddJobsDone: 0,
  stats: { carsStolen: 0, missionsDone: 0, topSpeed: 0, busts: 0, wasted: 0 },
  player: null, // the on-foot character controller (player.js)
  currentCar: null, // the car the player is driving, or null on foot
  objective: null, // { kind, x, z, label } the HUD and minimap point at
  muted: false,
};

export function resetRun() {
  GameState.cash = 250;
  GameState.health = 100;
  GameState.missionIndex = 0;
  GameState.storyDone = false;
  GameState.oddJobsDone = 0;
  GameState.stats = { carsStolen: 0, missionsDone: 0, topSpeed: 0, busts: 0, wasted: 0 };
  GameState.currentCar = null;
  GameState.objective = null;
}
