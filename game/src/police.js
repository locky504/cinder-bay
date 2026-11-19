// Cinder Bay — the wanted system and the police who answer it. Stars rise
// with crimes (stealing, shooting, hitting pedestrians) and fall when the
// player stays out of sight. Police cars chase and ram; on foot, officers
// close in. At 5 stars the whole harbour precinct is after Mara.
import * as THREE from 'three';
import { G } from './state.js';
import { spawnCar } from './vehicles.js';
import { makePedMesh } from './pedestrians.js';
import { sirenStart, sirenStop } from './audio.js';
import { resolveCircle } from './city.js';

let spawnCd = 0;
let flashT = 0;

function playerPos() {
  if (G.player.car) return G.player.car.group.position;
  return { x: G.player.pos.x, z: G.player.pos.z };
}

function spawnCopCar() {
  const pp = playerPos();
  const ang = Math.random() * Math.PI * 2;
  const x = Math.max(-195, Math.min(195, pp.x + Math.sin(ang) * 90));
  const z = Math.max(-195, Math.min(195, pp.z + Math.cos(ang) * 90));
  const car = spawnCar(x, z, 0, { isPolice: true, maxSpeed: 40, occupied: true });
  G.cops.push({ kind: 'car', car, touchCd: 0, officer: null });
}

function spawnOfficer() {
  const pp = playerPos();
  const ang = Math.random() * Math.PI * 2;
  const group = makePedMesh(0x1a2f6e);
  group.position.set(pp.x + Math.sin(ang) * 26, 0, pp.z + Math.cos(ang) * 26);
  // police cap
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.1, 0.36),
    new THREE.MeshBasicMaterial({ color: 0x2244aa })
  );
  cap.position.y = 1.72;
  group.add(cap);
  G.scene.add(group);
  G.cops.push({ kind: 'officer', group, touchCd: 0, car: null });
}

function removeCop(cop) {
  const i = G.cops.indexOf(cop);
  if (i >= 0) G.cops.splice(i, 1);
  if (cop.car) {
    cop.car.dead = true;
    G.scene.remove(cop.car.group);
    const ci = G.cars.indexOf(cop.car);
    if (ci >= 0) G.cars.splice(ci, 1);
  }
  if (cop.group) G.scene.remove(cop.group);
}

export function addWanted(n, reason) {
  G.wanted = Math.max(0, Math.min(5, G.wanted + n));
  G.wantedTimer = 0;
  if (reason) { G.message = reason; G.messageTimer = 2.5; }
}

export function clearPolice() {
  for (const cop of [...G.cops]) removeCop(cop);
}

export function updatePolice(dt) {
  spawnCd = Math.max(0, spawnCd - dt);
  const wanted = G.wanted;
  // siren follows the heat
  if (wanted > 0) sirenStart(); else sirenStop();

  // decay: no cop close for a while -> one star drops
  if (wanted > 0) {
    const pp = playerPos();
    let nearest = 1e9;
    for (const cop of G.cops) {
      const cp = cop.car ? cop.car.group.position : cop.group.position;
      nearest = Math.min(nearest, Math.hypot(cp.x - pp.x, cp.z - pp.z));
    }
    if (G.cops.length === 0 || nearest > 45) {
      G.wantedTimer += dt;
    } else {
      // cops close by: the heat does not cool, but a hideout bonus banked
      // by the missions system is drained, never wiped outright
      G.wantedTimer = Math.max(0, G.wantedTimer - dt * 2);
    }
    // a banked timer always spends down a star once it is big enough,
    // even with cops still on the player's tail (the hideout case)
    if (G.wantedTimer > 6) {
      G.wanted = Math.max(0, G.wanted - 1);
      G.wantedTimer = 0;
      G.message = G.wanted === 0 ? 'You lost them. The rain covers your tracks.' : 'Heat cooling off…';
      G.messageTimer = 2.5;
    }
  }

  // keep the right number of units on the street
  const wantCars = wanted > 0 ? Math.min(wanted, 3) : 0;
  const wantOfficers = wanted >= 2 && G.player.onFoot ? Math.min(2, wanted - 1) : 0;
  const carsNow = G.cops.filter((c) => c.kind === 'car').length;
  const offNow = G.cops.filter((c) => c.kind === 'officer').length;
  if (carsNow < wantCars && spawnCd <= 0) { spawnCopCar(); spawnCd = 1.2; }
  if (offNow < wantOfficers && spawnCd <= 0) { spawnOfficer(); spawnCd = 1.2; }
  if (wanted === 0) {
    for (const cop of [...G.cops]) removeCop(cop);
  }

  // lightbar flash
  flashT += dt;
  const flashRed = Math.floor(flashT * 2.5) % 2 === 0;
  for (const cop of G.cops) {
    if (cop.car) {
      const bar = cop.car.group.getObjectByName('lightbar');
      if (bar) bar.material.color.setHex(flashRed ? 0xff2222 : 0x2244ff);
    }
  }

  // chase behaviour
  const pp = playerPos();
  for (const cop of [...G.cops]) {
    cop.touchCd = Math.max(0, cop.touchCd - dt);
    const cp = cop.car ? cop.car.group.position : cop.group.position;
    // a unit that falls far behind loses the trail and pulls off
    if (Math.hypot(cp.x - pp.x, cp.z - pp.z) > 170) { removeCop(cop); continue; }
    if (cop.kind === 'car') {
      const car = cop.car;
      const dx = pp.x - car.group.position.x;
      const dz = pp.z - car.group.position.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let d = desired - car.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      car.heading += Math.max(-2.6 * dt, Math.min(2.6 * dt, d));
      const targetSpeed = dist > 8 ? car.maxSpeed : 18;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const nx = car.group.position.x + fx * car.speed * dt;
      const nz = car.group.position.z + fz * car.speed * dt;
      const r = resolveCircle(nx, nz, 2.3);
      car.group.position.x = r.x; car.group.position.z = r.z;
      car.group.rotation.y = car.heading;
      // ram the player
      if (dist < 3.4 && cop.touchCd <= 0) {
        cop.touchCd = 0.9;
        G.player.health -= 6;
        G.damageFlash = 1;
        if (G.player.car) {
          G.player.car.speed *= 0.55;
          // shove the player car sideways a touch
          G.player.car.group.position.x += fx * 1.2;
          G.player.car.group.position.z += fz * 1.2;
        }
        G.message = 'Police rammed you!';
        G.messageTimer = 1.5;
      }
    } else {
      // officer on foot
      const gp = cop.group.position;
      const dx = pp.x - gp.x, dz = pp.z - gp.z;
      const dist = Math.hypot(dx, dz);
      const heading = Math.atan2(dx, dz);
      cop.group.rotation.y = heading;
      const spd = 7.2;
      const nx = gp.x + Math.sin(heading) * spd * dt;
      const nz = gp.z + Math.cos(heading) * spd * dt;
      const r = resolveCircle(nx, nz, 0.5);
      gp.x = r.x; gp.z = r.z;
      if (dist < 1.7) {
        G.player.health -= 14 * dt;
        G.damageFlash = 1;
        G.bustedTimer += dt;
      } else {
        G.bustedTimer = Math.max(0, G.bustedTimer - dt * 2);
      }
    }
  }
}
