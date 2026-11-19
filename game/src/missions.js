// Cinder Bay — the story and the side work. Six story missions carry Mara
// from the Dockside garage to the Uptown vault and the final heist, opening
// Old Town and then Uptown as she goes. Taxi fares and courier runs are
// repeatable side jobs you pick up at their stands. Every stage is data:
// a type, a place, and what has to happen there.
import { G } from './state.js';
import { setObjectiveMarker, clearObjectiveMarker } from './city.js';
import { spawnCar } from './vehicles.js';
import { spawnEnemies, clearEnemies } from './combat.js';
import { sfxMission, sfxFail, sfxPickup } from './audio.js';
import { saveGame } from './save.js';
import { clearPolice } from './police.js';

export const MISSIONS = [
  {
    id: 'first-fare', name: 'First Fare', district: 'dockside', reward: 120,
    brief: 'Mara needs rent money. Her old dispatcher Dex has one fare left tonight.',
    stages: [
      { type: 'goto', x: -120, z: -120, r: 6, text: 'Go to your garage on Dockside' },
      { type: 'enterCar', x: -120, z: -120, r: 8, text: 'Get in a car (walk up and press E)' },
      { type: 'driveTo', x: -60, z: -180, r: 7, text: 'Pick up the fare at the north pier road' },
      { type: 'driveTo', x: 0, z: -120, r: 7, text: 'Drop the fare at the ferry terminal' },
    ],
  },
  {
    id: 'hot-wheels', name: 'Hot Wheels', district: 'dockside', reward: 250,
    brief: 'Dex wants a red coupe lifted from the pier car park. No questions, no plates.',
    stages: [
      { type: 'goto', x: -150, z: -60, r: 6, text: 'Meet Dex at the chop shop' },
      { type: 'steal', x: -90, z: -60, r: 8, text: 'Steal the red coupe (press E beside it)' },
      { type: 'deliverCar', x: -150, z: -60, r: 8, text: 'Deliver the coupe to the chop shop' },
    ],
  },
  {
    id: 'old-town-courier', name: 'Old Town Courier', district: 'oldtown', reward: 200,
    brief: 'Old Town opens up. A fixer needs four parcels across the district, fast.',
    stages: [
      {
        type: 'checkpoints', time: 100,
        points: [{ x: 0, z: 0 }, { x: 60, z: 0 }, { x: 60, z: 60 }, { x: -60, z: 60 }],
        text: 'Hit all 4 checkpoints before the timer runs out',
      },
    ],
  },
  {
    id: 'dockyard-shootout', name: 'Dockyard Shootout', district: 'dockside', reward: 300,
    brief: 'The pier crew that stiffed Dex is waiting at Pier 9. Mara brings her pistol.',
    stages: [
      { type: 'goto', x: -140, z: -190, r: 8, text: 'Go to Pier 9 at the docks' },
      { type: 'kill', x: -140, z: -190, r: 30, count: 6, text: 'Get out (E) and take out the dock enforcers' },
    ],
  },
  {
    id: 'uptown-vault', name: 'Uptown Vault', district: 'uptown', reward: 600,
    brief: 'The Meridian Bank keeps a courier case in its lobby. Grab it, then vanish.',
    stages: [
      { type: 'driveTo', x: 120, z: 120, r: 8, text: 'Drive to the Meridian Bank, Uptown' },
      { type: 'grab', x: 120, z: 120, r: 6, text: 'Get out and grab the case inside' },
      { type: 'escape', x: -180, z: -150, r: 9, text: 'Lose the heat and reach the hideout' },
    ],
  },
  {
    id: 'rain-city-heist', name: 'Rain City Heist', district: 'uptown', reward: 1000,
    brief: 'One last job: the exchange at the top of Uptown, then the lighthouse.',
    stages: [
      { type: 'driveTo', x: 60, z: 180, r: 8, text: 'Drive to the exchange, Uptown' },
      { type: 'kill', x: 60, z: 180, r: 30, count: 8, text: 'Get out (E) and clear the exchange guards' },
      { type: 'grab', x: 60, z: 180, r: 6, text: 'Grab the loot' },
      { type: 'escape', x: 180, z: -180, r: 9, text: 'Lose the heat and reach the lighthouse' },
    ],
  },
];

export const SIDE_JOBS = {
  taxi: {
    kind: 'taxi', name: 'Taxi Fare', reward: 80,
    stand: { x: 0, z: -60 },
    brief: 'A fare is waiting at the taxi stand.',
  },
  courier: {
    kind: 'courier', name: 'Courier Run', reward: 60,
    stand: { x: -60, z: -120 },
    brief: 'Parcels are waiting at the courier depot.',
  },
};

function playerPos() {
  if (G.player.car) return G.player.car.group.position;
  return { x: G.player.pos.x, z: G.player.pos.z };
}
function distTo(x, z) {
  const p = playerPos();
  return Math.hypot(p.x - x, p.z - z);
}

function stageTarget(stage) {
  if (stage.type === 'checkpoints') return stage.points[stage.pointIdx || 0];
  return stage;
}

export function currentObjectiveText() {
  if (G.sideJob) {
    const s = G.sideJob.stage;
    if (s.type === 'checkpoints') return `${G.sideJob.def.name}: ${s.text} (${s.pointIdx}/${s.points.length})`;
    return `${G.sideJob.def.name}: ${s.text}`;
  }
  if (G.nextMission && !G.mission) {
    const def = MISSIONS[G.nextMission.index];
    return `Next job: ${def.name} — follow the gold marker. (Taxi / courier stands pay cash too.)`;
  }
  if (!G.mission) return 'Free roam — find a glowing marker, or start the next job.';
  const s = G.mission.stage;
  let extra = '';
  if (s.type === 'kill') {
    const left = G.enemies.filter((e) => !e.dead).length;
    extra = ` (${left} left)`;
  }
  if (s.type === 'checkpoints') {
    extra = ` (${s.pointIdx}/${s.points.length}) — ${Math.ceil(s.timer)}s`;
  }
  return `${G.mission.def.name}: ${s.text}${extra}`;
}

function enterStage() {
  const m = G.mission || G.sideJob;
  if (!m) return;
  const s = m.stage;
  clearEnemies();
  if (s.type === 'steal') {
    m.targetCar = spawnCar(s.x, s.z, 0, { color: 0xc22a2a, maxSpeed: 48, parked: true, isTarget: true });
    m.targetCar.group.position.y = 0;
  }
  if (s.type === 'kill') {
    spawnEnemies(s.count, s.x, s.z, 16);
  }
  if (s.type === 'escape') {
    // the escape always starts at exactly three stars
    G.wanted = 3;
    G.wantedTimer = 0;
    m.hideoutCleared = false;
    G.message = 'The alarm is up — three stars! Lose the cops and reach the hideout.';
    G.messageTimer = 3;
  }
  if (s.type === 'checkpoints') {
    s.pointIdx = 0;
    s.timer = s.time;
  }
  const t = stageTarget(s);
  if (t) setObjectiveMarker(t.x, t.z, G.sideJob ? 0x37e0ff : 0xffd24a);
}

export function startMission(index) {
  if (index >= MISSIONS.length) return false;
  clearEnemies();
  G.sideJob = null;
  G.nextMission = null;
  const def = MISSIONS[index];
  G.mission = { def, stageIdx: 0, stage: def.stages[0], targetCar: null };
  G.missionIndex = index;
  G.message = `${def.name} — ${def.brief}`;
  G.messageTimer = 5;
  enterStage();
  return true;
}

export function startSideJob(kind) {
  if (G.mission || G.sideJob) return false;
  if (G.missionIndex < 1) return false; // finish the first fare first
  const def = SIDE_JOBS[kind];
  const rng = Math.random;
  let stages;
  if (kind === 'taxi') {
    const px = [-120, -60, 0, 60, 120][Math.floor(rng() * 5)];
    const pz = [-180, -120, -60, 0, 60, 120][Math.floor(rng() * 6)];
    const dx = [-120, -60, 0, 60, 120][Math.floor(rng() * 5)];
    const dz = [-180, -120, -60, 0, 60, 120][Math.floor(rng() * 6)];
    stages = [
      { type: 'driveTo', x: px, z: pz, r: 7, text: 'Pick up the passenger' },
      { type: 'driveTo', x: dx, z: dz, r: 7, text: 'Drop the passenger off' },
    ];
  } else {
    const pts = [];
    for (let i = 0; i < 3; i++) {
      pts.push({ x: [-120, -60, 0, 60, 120][Math.floor(rng() * 5)], z: [-180, -120, -60, 0, 60, 120][Math.floor(rng() * 6)] });
    }
    stages = [{ type: 'checkpoints', time: 75, points: pts, text: 'Deliver all 3 parcels in time' }];
  }
  G.sideJob = { def, stageIdx: 0, stage: stages[0], stages, targetCar: null };
  G.message = `${def.name} — ${def.brief}`;
  G.messageTimer = 4;
  enterStage();
  return true;
}

export function advanceStage() {
  const m = G.mission || G.sideJob;
  if (!m) return;
  sfxPickup();
  const stages = m.stages || m.def.stages;
  m.stageIdx++;
  if (m.stageIdx >= stages.length) {
    completeCurrent();
    return;
  }
  m.stage = stages[m.stageIdx];
  enterStage();
}

function completeCurrent() {
  const m = G.mission || G.sideJob;
  if (!m) return;
  const reward = m.def.reward;
  G.money += reward;
  clearObjectiveMarker();
  clearEnemies();
  sfxMission();
  if (G.sideJob) {
    G.sideJobsDone++;
    G.message = `${m.def.name} done! +$${reward}`;
    G.messageTimer = 4;
    G.sideJob = null;
    saveGame('side-job');
    return;
  }
  G.missionsDone++;
  G.message = `${m.def.name} complete! +$${reward}`;
  G.messageTimer = 5;
  const idx = MISSIONS.indexOf(m.def);
  if (m.def.id === 'hot-wheels') {
    G.unlocked.oldtown = true;
    G.message += ' Old Town is open now.';
  }
  if (m.def.id === 'dockyard-shootout') {
    G.unlocked.uptown = true;
    G.message += ' Uptown is open now.';
  }
  G.mission = null;
  G.missionIndex = idx + 1;
  saveGame('mission');
  if (G.missionIndex >= MISSIONS.length) {
    G.mode = 'complete';
    return;
  }
  // The next job waits at a gold marker — walk to it to start, or take a
  // taxi / courier side job first.
  armNextMission();
}

// Mark the next story mission on the map; walking into the marker starts it.
export function armNextMission() {
  if (G.missionIndex >= MISSIONS.length) return;
  const def = MISSIONS[G.missionIndex];
  const s0 = def.stages[0];
  const tx = s0.type === 'checkpoints' ? s0.points[0].x : s0.x;
  const tz = s0.type === 'checkpoints' ? s0.points[0].z : s0.z;
  G.nextMission = { index: G.missionIndex, x: tx, z: tz };
  setObjectiveMarker(tx, tz, 0xffd24a);
  G.message = `Next job: ${def.name} — follow the gold marker.`;
  G.messageTimer = 5;
}

export function restartMission() {
  if (G.mission) {
    const idx = MISSIONS.indexOf(G.mission.def);
    clearEnemies();
    startMission(idx);
  } else if (G.sideJob) {
    const kind = G.sideJob.def.kind;
    G.sideJob = null;
    startSideJob(kind);
  }
}

// Jump the current story mission to a later stage (used by shot presets and
// playtests): re-runs the stage entry logic so its cars / enemies spawn.
export function jumpToStage(idx) {
  const m = G.mission;
  if (!m || idx < 0 || idx >= m.def.stages.length) return;
  m.stageIdx = idx;
  m.stage = m.def.stages[idx];
  enterStage();
}

export function updateMissions(dt) {
  const m = G.mission || G.sideJob;
  if (!m) {
    // next story job: walk into its gold marker to start it
    if (G.nextMission) {
      const p = playerPos();
      if (Math.hypot(p.x - G.nextMission.x, p.z - G.nextMission.z) < 6) {
        const idx = G.nextMission.index;
        G.nextMission = null;
        startMission(idx);
      }
    }
    return;
  }
  const s = m.stage;
  if (s.type === 'checkpoints') {
    s.timer -= dt;
    if (s.timer <= 0) {
      sfxFail();
      G.message = 'Out of time! The job restarts.';
      G.messageTimer = 3;
      restartMission();
      return;
    }
    const t = s.points[s.pointIdx];
    setObjectiveMarker(t.x, t.z, G.sideJob ? 0x37e0ff : 0xffd24a);
    if (distTo(t.x, t.z) < 7) {
      s.pointIdx++;
      sfxPickup();
      if (s.pointIdx >= s.points.length) { advanceStage(); return; }
      const nt = s.points[s.pointIdx];
      setObjectiveMarker(nt.x, nt.z, G.sideJob ? 0x37e0ff : 0xffd24a);
    }
    return;
  }
  if (s.type === 'enterCar') {
    if (!G.player.onFoot) advanceStage();
    return;
  }
  if (s.type === 'steal') {
    if (G.player.car && G.player.car.isTarget) { advanceStage(); return; }
    const t = stageTarget(s);
    if (t) setObjectiveMarker(t.x, t.z, 0xff5c5c);
    return;
  }
  if (s.type === 'deliverCar') {
    const car = m.targetCar;
    if (car && Math.hypot(car.group.position.x - s.x, car.group.position.z - s.z) < s.r) {
      advanceStage();
    }
    return;
  }
  if (s.type === 'kill') {
    if (G.enemies.filter((e) => !e.dead).length === 0) advanceStage();
    return;
  }
  if (s.type === 'escape') {
    const d = distTo(s.x, s.z);
    if (d < s.r) {
      // reaching the hideout shakes the tail: the units on you pull off,
      // and laying low cools the heat fast
      if (!m.hideoutCleared) { m.hideoutCleared = true; clearPolice(); }
      G.wantedTimer += dt * 6;
      if (G.wanted <= 0) { advanceStage(); return; }
    }
    return;
  }
  // goto / driveTo / grab
  if (distTo(s.x, s.z) < s.r) advanceStage();
}

export function sideJobStandNear() {
  if (G.mission || G.sideJob || G.missionIndex < 1) return null;
  for (const kind of Object.keys(SIDE_JOBS)) {
    const stand = SIDE_JOBS[kind].stand;
    if (distTo(stand.x, stand.z) < 6) return kind;
  }
  return null;
}
