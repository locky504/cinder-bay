// Cinder Bay — shared game state. One plain object every system reads and
// writes, so the modules below stay decoupled: no module owns the world.
export const SAVE_KEY = 'cinderbay-save-v1';

export const DISTRICTS = {
  dockside: { name: 'Dockside', cn: '码头区', z0: -215, z1: -70, tint: '#2e4a5e' },
  oldtown: { name: 'Old Town', cn: '老城区', z0: -70, z1: 70, tint: '#5e4a2e' },
  uptown: { name: 'Uptown', cn: '上城区', z0: 70, z1: 215, tint: '#3a2e5e' },
};

export const CITY = { half: 210, roadStep: 60, roads: [-180, -120, -60, 0, 60, 120, 180] };

export function createGameState() {
  return {
    mode: 'menu', // menu | playing | paused | dead | complete
    time: 0,
    seed: 7,
    // player
    player: {
      pos: { x: -180, y: 0, z: -150 },
      heading: 0, // radians, facing direction on foot
      health: 100, maxHealth: 100,
      onFoot: true, car: null, walkSpeed: 0, moving: false,
    },
    money: 0,
    wanted: 0,
    wantedTimer: 0,
    unlocked: { dockside: true, oldtown: false, uptown: false },
    missionIndex: 0, // next story mission to play
    missionsDone: 0,
    sideJobsDone: 0,
    stats: { shotsFired: 0, shotsHit: 0, carsStolen: 0, kills: 0, crashes: 0 },
    // world objects (filled by city / vehicles / pedestrians / police)
    scene: null, camera: null, renderer: null,
    colliders: [], // {x0,z0,x1,z1}
    cars: [],      // every drivable car {id, group, pos, heading, speed, color, occupied, isPolice, parked, maxSpeed, target}
    traffic: [],   // subset of cars driven by AI {car, route, wp, speed, wait}
    peds: [],      // {group, pos, heading, speed, state, flee}
    cops: [],      // {kind:'car'|'officer', car?, group, pos, heading, speed, touchCd}
    enemies: [],   // {group, pos, heading, health, shootCd, bar}
    markers: { objective: null, side: [] },
    rain: null,
    keys: {},
    camYaw: 0, camPitch: 0.32, camDist: 10,
    dragYaw: 0,
    mouseDown: false, lastMouseX: 0, lastMouseY: 0,
    shooting: false, shootCd: 0,
    muted: false,
    message: '',
    messageTimer: 0,
    prompt: '', // contextual prompt, e.g. "按 E 上车"
    // mission runtime (owned by missions.js)
    mission: null, // {def, stage, timer, targetCar, spawned, killsLeft}
    nextMission: null, // {index, x, z} — gold marker for the next story job
    sideJob: null, // active side job {kind, stage, ...}
    shotMode: null,
    lightning: 0,
    bustedTimer: 0,
    deathCause: '',
  };
}

export const G = createGameState();

export function districtAt(z) {
  if (z < DISTRICTS.dockside.z1) return 'dockside';
  if (z < DISTRICTS.oldtown.z1) return 'oldtown';
  return 'uptown';
}

export function districtUnlocked(G, key) {
  return !!G.unlocked[key];
}
