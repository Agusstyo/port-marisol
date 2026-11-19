// Saving: the run (cash, story progress, stats, where Rio is standing) in localStorage, so
// closing the tab does not end Rio's career. Saved on every mission turn, every bust or
// hospital trip, and whenever the player asks from the pause menu.

const SAVE_KEY = 'port-marisol-save-v1';

export function saveGame(state, playerPos) {
  try {
    const data = {
      cash: state.cash,
      health: state.health,
      missionIndex: state.missionIndex,
      storyDone: state.storyDone,
      oddJobsDone: state.oddJobsDone,
      stats: state.stats,
      player: { x: playerPos.x, z: playerPos.z, heading: playerPos.heading },
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || !data.player) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* private mode */ }
}
