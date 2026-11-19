// Cinder Bay — Rain City Run. Bootstraps the renderer, the city, the player,
// traffic, pedestrians and police, then runs the frame loop: input, driving,
// wanted, missions, combat and the HUD. Shot presets (?shot=chase|street|
// shootout|drive) drop the player straight into a staged scene for screenshots
// and playtests; window.CINDER exposes the live state for automated testing.
import * as THREE from 'three';
import { G } from './state.js';
import { buildCity, updateRain, pulseObjectiveMarker } from './city.js';
import { createPlayerMesh, updatePlayer, syncPlayerMeshToCar } from './player.js';
import {
  spawnTraffic, spawnParked, spawnCar, updatePlayerCar, updateTraffic,
  nearestCar, enterCar, exitCar,
} from './vehicles.js';
import { spawnPeds, updatePeds } from './pedestrians.js';
import { updatePolice, addWanted, clearPolice } from './police.js';
import { playerShoot, updateEnemies, clearEnemies } from './combat.js';
import { startMission, updateMissions, startSideJob, restartMission, sideJobStandNear, jumpToStage, armNextMission, MISSIONS } from './missions.js';
import { initHud, updateHud, showMenu, refreshStartMenu } from './hud.js';
import { initInput } from './input.js';
import { initAudio, setMuted, sfxClick, engineStop, sirenStop } from './audio.js';
import { saveGame, loadSave, applySave, clearSave, hasSave } from './save.js';

const params = new URLSearchParams(location.search);
G.seed = Number(params.get('seed') || 7);
G.shotMode = params.get('shot') || null;

let renderer, scene, camera, clock;
let shooting = false;
let deathHandled = false;
let completeShown = false;

function setupThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  document.getElementById('game-container').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 800);
  camera.position.set(-140, 12, -130);
  G.scene = scene; G.camera = camera; G.renderer = renderer;
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function buildWorld() {
  buildCity(scene);
  createPlayerMesh(scene);
  spawnTraffic(14);
  spawnParked(10);
  spawnPeds(22);
}

function updateCamera(dt) {
  const p = G.player;
  const tx = p.car ? p.car.group.position.x : p.pos.x;
  const tz = p.car ? p.car.group.position.z : p.pos.z;
  const dist = p.car ? 12.5 : 9.5;
  const pitch = p.car ? 0.30 : G.camPitch;
  const cx = tx - Math.sin(G.camYaw) * Math.cos(pitch) * dist;
  const cz = tz - Math.cos(G.camYaw) * Math.cos(pitch) * dist;
  const cy = 2.2 + Math.sin(pitch) * dist;
  const k = Math.min(1, dt * 7);
  camera.position.x += (cx - camera.position.x) * k;
  camera.position.y += (cy - camera.position.y) * k;
  camera.position.z += (cz - camera.position.z) * k;
  camera.lookAt(tx, 2.0, tz);
}

// ---- interactions -------------------------------------------------------
function tryInteract(forceSteal) {
  const p = G.player;
  if (p.onFoot) {
    const stand = sideJobStandNear();
    if (stand) {
      if (startSideJob(stand)) { sfxClick(); return; }
    }
    const car = nearestCar(4.5);
    if (car) {
      const stolen = forceSteal || car.occupied || car.isTarget;
      enterCar(car, stolen);
      if (stolen) {
        G.message = car.isTarget ? 'You stole the coupe! The heat is on.' : 'You jacked the car! The heat is on.';
        G.messageTimer = 3;
      }
      syncPlayerMeshToCar();
      return;
    }
  } else {
    exitCar();
    syncPlayerMeshToCar();
  }
}

function onPress(action) {
  if (action === 'mute') { setMuted(!G.muted); return; }
  if (action === 'pause') {
    if (G.mode === 'playing') pauseGame();
    else if (G.mode === 'paused') resumeGame();
    return;
  }
  if (G.mode !== 'playing') return;
  initAudio();
  if (action === 'interact') tryInteract(false);
  if (action === 'steal') tryInteract(true);
  if (action === 'restart') { restartMission(); G.message = 'Mission restarted.'; G.messageTimer = 2; }
}

function pauseGame() {
  G.mode = 'paused';
  showMenu('menu-pause');
}
function resumeGame() {
  G.mode = 'playing';
  showMenu(null);
  document.getElementById('hud').classList.remove('hidden');
}

function resetRun() {
  clearSave();
  G.money = 0; G.missionIndex = 0; G.missionsDone = 0; G.sideJobsDone = 0;
  G.unlocked = { dockside: true, oldtown: false, uptown: false };
  G.player.health = 100; G.wanted = 0; G.wantedTimer = 0; G.bustedTimer = 0;
  G.stats = { shotsFired: 0, shotsHit: 0, carsStolen: 0, kills: 0, crashes: 0 };
  G.player.pos.x = -180; G.player.pos.z = -150; G.player.heading = 0;
  if (G.player.car) exitCar();
  G.player.onFoot = true;
  syncPlayerMeshToCar();
  clearEnemies(); clearPolice();
  G.mission = null; G.sideJob = null;
  deathHandled = false;
  completeShown = false;
}

function startPlaying() {
  initAudio();
  G.mode = 'playing';
  showMenu(null);
  document.getElementById('hud').classList.remove('hidden');
  if (!G.mission && G.missionIndex < MISSIONS.length) {
    // First night: drop straight into the first fare. Resuming later, the
    // next job waits at its gold marker instead.
    if (G.missionIndex === 0) startMission(0);
    else armNextMission();
  }
}

function handleDeath() {
  if (deathHandled) return;
  deathHandled = true;
  G.deathCause = G.bustedTimer > 1.2
    ? 'The harbour police cuffed Mara in the rain.'
    : 'Mara went down in the rain.';
  G.mode = 'dead';
  engineStop(); sirenStop();
  saveGame('death');
  showMenu('menu-dead');
}

function respawn() {
  // harbour hospital, patched up, lighter wallet, clean slate
  G.player.health = 100;
  G.player.pos.x = -60; G.player.pos.z = 60;
  if (G.player.car) { exitCar(); }
  G.player.onFoot = true;
  syncPlayerMeshToCar();
  G.wanted = 0; G.wantedTimer = 0; G.bustedTimer = 0;
  clearPolice();
  G.money = Math.max(0, G.money - 100);
  deathHandled = false;
  G.mode = 'playing';
  showMenu(null);
  document.getElementById('hud').classList.remove('hidden');
  G.message = 'Patched up at the harbour hospital. -$100. The job still waits.';
  G.messageTimer = 4;
}

// ---- shot presets (screenshots / playtests) ------------------------------
function applyShot(mode) {
  startPlaying();
  if (mode === 'chase') {
    const car = spawnCar(0, 120, Math.PI, { color: 0xc22a2a, maxSpeed: 48 });
    G.player.pos.x = 0; G.player.pos.z = 118;
    syncPlayerMeshToCar();
    enterCar(car, false);
    syncPlayerMeshToCar();
    startMission(4);
    addWanted(3, 'Three stars — the precinct is on your tail!');
    G.camYaw = Math.PI;
  } else if (mode === 'street') {
    G.player.pos.x = 0; G.player.pos.z = 0;
    G.player.heading = Math.PI;
    syncPlayerMeshToCar();
    startMission(2);
    G.camYaw = Math.PI * 0.9;
  } else if (mode === 'shootout') {
    // stand on the open pier road with a clear sightline to the enforcers
    G.player.pos.x = -120; G.player.pos.z = -170;
    G.player.heading = Math.PI;
    syncPlayerMeshToCar();
    startMission(3);
    gotoStage(1);
    addWanted(2, 'Gunfire on Pier 9 — two stars!');
    G.camYaw = Math.atan2(-140 - -120, -190 - -170);
    G.camPitch = 0.3;
  } else if (mode === 'drive') {
    const car = spawnCar(-60, -120, 0, { color: 0x2f5e8a, maxSpeed: 40 });
    G.player.pos.x = -60; G.player.pos.z = -118;
    enterCar(car, false);
    syncPlayerMeshToCar();
    startMission(0);
    gotoStage(2);
    G.camYaw = Math.PI;
  }
  window.__shotReady = true;
}

function gotoStage(idx) {
  jumpToStage(idx);
}

// ---- frame loop ----------------------------------------------------------
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  if (G.mode === 'playing') {
    G.time += dt;
    G.shootCd = Math.max(0, G.shootCd - dt);
    if (shooting) playerShoot();
    updatePlayer(dt);
    updatePlayerCar(dt);
    updateTraffic(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateEnemies(dt);
    updateMissions(dt);
    updateRain(dt, G.player.car ? G.player.car.group.position : G.player.pos);
    pulseObjectiveMarker(G.time);
    updateCamera(dt);
    updateHud(dt);
    if (G.player.health <= 0) handleDeath();
  }
  if (G.mode === 'complete' && !completeShown) {
    completeShown = true;
    engineStop(); sirenStop();
    showMenu('menu-complete');
  }
  renderer.render(scene, camera);
}

// ---- debug / test hooks ---------------------------------------------------
window.CINDER = {
  G, MISSIONS,
  state() {
    return {
      mode: G.mode,
      money: G.money,
      wanted: G.wanted,
      health: Math.round(G.player.health),
      missionIndex: G.missionIndex,
      missionsDone: G.missionsDone,
      sideJobsDone: G.sideJobsDone,
      onFoot: G.player.onFoot,
      pos: { x: Math.round(G.player.pos.x), z: Math.round(G.player.pos.z) },
      carSpeed: G.player.car ? Math.round(G.player.car.speed * 3.6) : 0,
      cops: G.cops.length,
      traffic: G.traffic.length,
      peds: G.peds.length,
      enemies: G.enemies.filter((e) => !e.dead).length,
      objective: document.getElementById('objective')?.textContent || '',
      cars: G.cars.length,
    };
  },
  start: startPlaying,
  startMission,
  jumpToStage,
  setWanted(n) { G.wanted = n; G.wantedTimer = 0; },
  teleport(x, z) {
    if (G.player.car) { G.player.car.group.position.x = x; G.player.car.group.position.z = z; }
    G.player.pos.x = x; G.player.pos.z = z;
    syncPlayerMeshToCar();
  },
  giveCar(color) {
    // debug helper: drop a car on the nearest road beside the player
    const roads = [-180, -120, -60, 0, 60, 120, 180];
    const near = (v) => roads.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
    let x = G.player.pos.x + 3, z = G.player.pos.z;
    if (Math.abs(x - near(x)) < Math.abs(z - near(z))) x = near(x); else z = near(z);
    const car = spawnCar(x, z, 0, { color: color || 0x2f5e8a, maxSpeed: 44 });
    return car.id;
  },
  enterNearest() { tryInteract(false); },
  stealNearest() { tryInteract(true); },
  shoot() { playerShoot(); },
  save: () => saveGame('manual'),
  hasSave,
};

// ---- boot ------------------------------------------------------------------
setupThree();
buildWorld();
clock = new THREE.Clock();
initInput(renderer.domElement, {
  onPress,
  onMute: () => setMuted(!G.muted),
  onShootStart: () => { shooting = true; if (G.mode === 'playing') { initAudio(); playerShoot(); } },
  onShootEnd: () => { shooting = false; },
});
initHud({
  onNewGame: () => { resetRun(); startPlaying(); },
  onContinue: () => {
    const d = loadSave();
    if (d) applySave(d);
    syncPlayerMeshToCar();
    startPlaying();
  },
  onResume: resumeGame,
  onRestart: () => { restartMission(); resumeGame(); },
  onQuitToMenu: () => { saveGame('quit'); location.href = location.pathname; },
  onRespawn: respawn,
  onContinueFreeRoam: () => { G.mode = 'playing'; showMenu(null); document.getElementById('hud').classList.remove('hidden'); },
});
document.addEventListener('pointerdown', () => initAudio(), { once: true });
document.addEventListener('keydown', () => initAudio(), { once: true });
refreshStartMenu();
showMenu('menu-start');
window.__gameReady = true;
frame();
if (G.shotMode) {
  // let the first frames render, then stage the shot
  setTimeout(() => applyShot(G.shotMode), 600);
}
