// Cinder Bay — save / load. Autosaves to localStorage after every mission,
// side job and on death; Continue on the start screen resumes it.
import { G, SAVE_KEY } from './state.js';

export function saveGame(reason) {
  try {
    const data = {
      v: 1,
      money: G.money,
      missionIndex: G.missionIndex,
      missionsDone: G.missionsDone,
      sideJobsDone: G.sideJobsDone,
      unlocked: G.unlocked,
      health: Math.max(25, Math.round(G.player.health)),
      pos: { x: G.player.pos.x, z: G.player.pos.z },
      stats: G.stats,
      savedAt: Date.now(),
      reason: reason || 'auto',
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    return d;
  } catch (e) { return null; }
}

export function applySave(d) {
  G.money = d.money || 0;
  G.missionIndex = d.missionIndex || 0;
  G.missionsDone = d.missionsDone || 0;
  G.sideJobsDone = d.sideJobsDone || 0;
  G.unlocked = Object.assign({ dockside: true, oldtown: false, uptown: false }, d.unlocked);
  G.player.health = d.health || 100;
  if (d.pos) { G.player.pos.x = d.pos.x; G.player.pos.z = d.pos.z; }
  if (d.stats) G.stats = Object.assign(G.stats, d.stats);
  G.wanted = 0;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
}

export function hasSave() { return !!loadSave(); }
