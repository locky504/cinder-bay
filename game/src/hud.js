// Cinder Bay — the HUD: wanted stars, health, cash, objective line, the
// circular minimap, speed, contextual prompts, toasts and every menu.
// All DOM lives in index.html; this module only reads state and paints it.
import { G, DISTRICTS } from './state.js';
import { MISSIONS, SIDE_JOBS, currentObjectiveText, sideJobStandNear } from './missions.js';
import { nearestCar } from './vehicles.js';
import { hasSave } from './save.js';

let el = {};
let minimap = null, mctx = null;
let lastStars = -1;

export function initHud(callbacks) {
  const ids = ['hud', 'stars', 'healthFill', 'healthText', 'cash', 'objective',
    'speed', 'district', 'toast', 'prompt', 'crosshair', 'damage', 'menu-start',
    'menu-pause', 'menu-dead', 'menu-complete', 'btn-new', 'btn-continue',
    'btn-resume', 'btn-restart', 'btn-quit', 'btn-dead', 'btn-again',
    'btn-complete', 'save-info', 'final-stats', 'dead-cause', 'mission-title'];
  for (const id of ids) el[id] = document.getElementById(id);
  minimap = document.getElementById('minimap');
  mctx = minimap.getContext('2d');

  el['btn-new'].addEventListener('click', () => callbacks.onNewGame());
  el['btn-continue'].addEventListener('click', () => callbacks.onContinue());
  el['btn-resume'].addEventListener('click', () => callbacks.onResume());
  el['btn-restart'].addEventListener('click', () => callbacks.onRestart());
  el['btn-quit'].addEventListener('click', () => callbacks.onQuitToMenu());
  el['btn-dead'].addEventListener('click', () => callbacks.onRespawn());
  el['btn-again'].addEventListener('click', () => callbacks.onNewGame());
  el['btn-complete'].addEventListener('click', () => callbacks.onContinueFreeRoam());
  refreshStartMenu();
}

export function refreshStartMenu() {
  const save = hasSave();
  el['btn-continue'].style.display = save ? '' : 'none';
  if (save) {
    try {
      const d = JSON.parse(localStorage.getItem('cinderbay-save-v1'));
      el['save-info'].textContent =
        `Save: $${d.money} · mission ${Math.min(d.missionIndex + 1, 6)}/6 · ${new Date(d.savedAt).toLocaleString()}`;
    } catch (e) { el['save-info'].textContent = ''; }
  } else {
    el['save-info'].textContent = 'No save yet — start a new night in Cinder Bay.';
  }
}

export function showMenu(name) {
  for (const m of ['menu-start', 'menu-pause', 'menu-dead', 'menu-complete']) {
    el[m].classList.toggle('hidden', m !== name);
  }
  el.hud.classList.toggle('hidden', name === 'menu-start');
  el.crosshair.classList.toggle('hidden', true);
  if (name === 'menu-dead') {
    el['dead-cause'].textContent = G.deathCause || 'Mara went down in the rain.';
  }
  if (name === 'menu-complete') {
    el['final-stats'].textContent =
      `Missions ${G.missionsDone}/6 · Side jobs ${G.sideJobsDone} · Cars stolen ${G.stats.carsStolen} · ` +
      `Kills ${G.stats.kills} · Cash $${G.money}`;
  }
}

export function updateHud(dt) {
  if (G.mode !== 'playing') return;
  // stars
  if (G.wanted !== lastStars) {
    lastStars = G.wanted;
    el.stars.textContent = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
    el.stars.classList.toggle('hot', G.wanted > 0);
  }
  el.healthFill.style.width = `${Math.max(0, G.player.health)}%`;
  el.healthFill.classList.toggle('low', G.player.health < 30);
  el.healthText.textContent = `${Math.ceil(Math.max(0, G.player.health))}`;
  el.cash.textContent = `$${G.money}`;
  el.objective.textContent = currentObjectiveText();
  const spd = G.player.car ? Math.abs(G.player.car.speed) * 3.6 : G.player.walkSpeed * 3.6;
  el.speed.textContent = G.player.car ? `${Math.round(spd)} km/h` : '';
  const z = G.player.car ? G.player.car.group.position.z : G.player.pos.z;
  const d = z < -70 ? 'dockside' : z < 70 ? 'oldtown' : 'uptown';
  el.district.textContent = `${DISTRICTS[d].name} · ${DISTRICTS[d].cn}`;
  // toast / message
  if (G.messageTimer > 0) {
    G.messageTimer -= dt;
    el.toast.textContent = G.message;
    el.toast.classList.remove('hidden');
  } else {
    el.toast.classList.add('hidden');
  }
  // contextual prompt
  let prompt = '';
  if (G.player.onFoot) {
    const stand = sideJobStandNear();
    if (stand) prompt = `Press E — take the ${SIDE_JOBS[stand].name} job`;
    else {
      const car = nearestCar(4.5);
      if (car) prompt = car.isTarget ? 'Press E — steal this car' : (car.occupied ? 'Press E — jack this car' : 'Press E — get in the car');
    }
  } else {
    prompt = 'Press E — get out   ·   Space — brake';
  }
  if (prompt !== G.prompt) {
    G.prompt = prompt;
    el.prompt.textContent = prompt;
    el.prompt.classList.toggle('hidden', !prompt);
  }
  // crosshair on foot
  el.crosshair.classList.toggle('hidden', !G.player.onFoot);
  // damage flash
  if (G.damageFlash > 0) {
    G.damageFlash = Math.max(0, G.damageFlash - dt * 2.2);
    el.damage.style.opacity = String(G.damageFlash * 0.55);
  }
  drawMinimap();
}

function drawMinimap() {
  const S = 190, c = mctx;
  const scale = S / 460;
  const px = G.player.car ? G.player.car.group.position.x : G.player.pos.x;
  const pz = G.player.car ? G.player.car.group.position.z : G.player.pos.z;
  const toMap = (x, z) => [S / 2 + (x - px) * scale, S / 2 + (z - pz) * scale];
  c.clearRect(0, 0, S, S);
  // clip circle
  c.save();
  c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.clip();
  c.fillStyle = '#10131a';
  c.fillRect(0, 0, S, S);
  // district bands
  const bands = [['#1c2733', -215, -70], ['#26221a', -70, 70], ['#221d33', 70, 215]];
  for (const [col, z0, z1] of bands) {
    const [, y0] = toMap(0, z0);
    const [, y1] = toMap(0, z1);
    c.fillStyle = col;
    c.fillRect(0, y0, S, y1 - y0);
  }
  // water
  const [, wy] = toMap(0, -215);
  c.fillStyle = '#0d2436';
  c.fillRect(0, 0, S, wy);
  // roads
  c.strokeStyle = '#3a3d46';
  c.lineWidth = 5;
  for (const r of [-180, -120, -60, 0, 60, 120, 180]) {
    const [x0] = toMap(r, 0); const [, y0] = toMap(0, r);
    c.beginPath(); c.moveTo(x0, -10); c.lineTo(x0, S + 10); c.stroke();
    c.beginPath(); c.moveTo(-10, y0); c.lineTo(S + 10, y0); c.stroke();
  }
  // side-job stands
  if (!G.mission && !G.sideJob && G.missionIndex >= 1) {
    for (const kind of Object.keys(SIDE_JOBS)) {
      const s = SIDE_JOBS[kind].stand;
      const [sx, sy] = toMap(s.x, s.z);
      c.fillStyle = '#37e0ff';
      c.beginPath(); c.arc(sx, sy, 4, 0, Math.PI * 2); c.fill();
    }
  }
  // objective marker
  const m = G.mission || G.sideJob;
  if (m) {
    const s = m.stage;
    let tx = s.x, tz = s.z;
    if (s.type === 'checkpoints') { tx = s.points[s.pointIdx].x; tz = s.points[s.pointIdx].z; }
    const [mx, my] = toMap(tx, tz);
    c.fillStyle = G.sideJob ? '#37e0ff' : '#ffd24a';
    c.beginPath(); c.arc(mx, my, 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(mx, my, 8, 0, Math.PI * 2); c.stroke();
  }
  // traffic (white), cops (red), enemies (orange)
  const dot = (x, z, col, r = 2.5) => {
    const [dx, dy] = toMap(x, z);
    c.fillStyle = col;
    c.beginPath(); c.arc(dx, dy, r, 0, Math.PI * 2); c.fill();
  };
  for (const car of G.traffic) dot(car.group.position.x, car.group.position.z, '#cfd6e4', 2.5);
  for (const cop of G.cops) {
    const cp = cop.car ? cop.car.group.position : cop.group.position;
    dot(cp.x, cp.z, '#ff4444', 3.5);
  }
  for (const e of G.enemies) if (!e.dead) dot(e.group.position.x, e.group.position.z, '#ff8c2a', 3);
  // player arrow (centre)
  c.save();
  c.translate(S / 2, S / 2);
  const heading = G.player.car ? G.player.car.heading : G.player.heading;
  c.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) * 0 + heading);
  c.fillStyle = '#fff';
  c.beginPath(); c.moveTo(0, -8); c.lineTo(5.5, 6); c.lineTo(-5.5, 6); c.closePath(); c.fill();
  c.restore();
  // north tick
  c.fillStyle = '#fff';
  c.font = 'bold 11px Arial';
  c.textAlign = 'center';
  c.fillText('N', S / 2, 14);
  c.restore();
  // ring
  c.strokeStyle = 'rgba(255,255,255,0.65)';
  c.lineWidth = 2;
  c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); c.stroke();
}
