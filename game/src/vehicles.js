// Cinder Bay — vehicles. Builds car meshes, arcade driving physics, the
// traffic AI that loops the road grid, and entering / exiting / stealing cars.
// A car is a THREE group facing +Z; heading 0 means +Z, forward = (sin h, cos h).
import * as THREE from 'three';
import { G, CITY } from './state.js';
import { mulberry32, pick, range } from './rng.js';
import { resolveCircle, randomRoadPoint } from './city.js';
import { engineStart, engineSet, engineStop, sfxCrash } from './audio.js';

let nextCarId = 1;
const CAR_COLORS = [0x8a2f2f, 0x2f5e8a, 0x3e7a4a, 0x8a7a2f, 0x5a5a62, 0x7a3e6e, 0xb0b6c0, 0x2a2a30, 0xc76b2a, 0x3a6e6e];

export function makeCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.65, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x10131c })
  );
  cabin.position.set(0, 1.3, -0.25);
  group.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0c });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    group.add(w);
  }
  // headlights + taillights
  const hl = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const s of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), hl);
    h.position.set(s, 0.7, 2.22);
    group.add(h);
  }
  const tl = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const s of [-0.7, 0.7]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), tl);
    t.position.set(s, 0.7, -2.22);
    group.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff })
    );
    bar.position.set(0, 1.72, -0.25);
    bar.name = 'lightbar';
    group.add(bar);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.12, 0.3, 4.42),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    stripe.position.y = 0.62;
    group.add(stripe);
  }
  return group;
}

export function spawnCar(x, z, heading, opts = {}) {
  const color = opts.color ?? pick(mulberry32(nextCarId * 7919 + G.seed), CAR_COLORS);
  const group = makeCarMesh(color, !!opts.isPolice);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  G.scene.add(group);
  const car = {
    id: nextCarId++, group, color,
    heading, speed: 0,
    maxSpeed: opts.maxSpeed ?? (opts.isPolice ? 44 : range(mulberry32(nextCarId * 31), 30, 40)),
    accel: opts.accel ?? 15,
    occupied: !!opts.occupied, isPolice: !!opts.isPolice,
    parked: !!opts.parked, isTarget: !!opts.isTarget,
    route: opts.route || null, wp: 0, aiSpeed: 11 + Math.random() * 4,
    dead: false, brakeLight: false,
  };
  G.cars.push(car);
  return car;
}

function rectLoop(rng, cx, cz, hw, hd) {
  return [
    { x: cx - hw, z: cz - hd }, { x: cx + hw, z: cz - hd },
    { x: cx + hw, z: cz + hd }, { x: cx - hw, z: cz + hd },
  ];
}

export function spawnTraffic(n) {
  const rng = mulberry32(G.seed + 101);
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(rng);
    const loop = rectLoop(rng, p.x, p.z, 60, 60);
    const car = spawnCar(p.x, p.z, rng() * Math.PI * 2, { occupied: true, route: loop });
    car.wp = 0;
    G.traffic.push(car);
  }
}

export function spawnParked(n) {
  const rng = mulberry32(G.seed + 202);
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(rng);
    // park along the road edge
    const alongRoad = rng() < 0.5;
    const x = alongRoad ? p.x + (rng() < 0.5 ? 5.4 : -5.4) : p.x;
    const z = alongRoad ? p.z : p.z + (rng() < 0.5 ? 5.4 : -5.4);
    const heading = alongRoad ? (Math.abs(p.x % 120) < 1 ? 0 : Math.PI / 2) : 0;
    spawnCar(x, z, rng() < 0.5 ? 0 : Math.PI, { parked: true, occupied: false });
  }
}

function turnToward(car, targetHeading, dt, rate) {
  let d = targetHeading - car.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  car.heading += step;
}

function moveCar(car, dt) {
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const nx = car.group.position.x + fx * car.speed * dt;
  const nz = car.group.position.z + fz * car.speed * dt;
  const r = resolveCircle(nx, nz, 2.3);
  if (r.hit && Math.abs(car.speed) > 9) {
    sfxCrash();
    G.stats.crashes++;
    car.speed *= -0.25;
  } else if (r.hit) {
    car.speed *= 0.5;
  }
  car.group.position.x = r.x;
  car.group.position.z = r.z;
  car.group.rotation.y = car.heading;
}

export function updatePlayerCar(dt) {
  const car = G.player.car;
  if (!car) return;
  const k = G.keys;
  const forward = (k.up ? 1 : 0) - (k.down ? 0.7 : 0);
  const steer = (k.left ? 1 : 0) - (k.right ? 1 : 0);
  if (forward > 0) car.speed += car.accel * dt;
  else if (forward < 0) car.speed -= car.accel * 0.8 * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
  if (k.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  car.speed = Math.max(-13, Math.min(car.maxSpeed, car.speed));
  const steerRate = 1.9 * Math.min(1, Math.abs(car.speed) / 9);
  car.heading += steer * steerRate * dt * Math.sign(car.speed || 1) * (car.speed >= 0 ? 1 : -1);
  moveCar(car, dt);
  engineSet(Math.abs(car.speed) / car.maxSpeed);
  // camera follows behind the car unless the player recently dragged it
  if (G.dragYaw < 0.01) {
    let d = car.heading + Math.PI - G.camYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    G.camYaw += d * Math.min(1, dt * 1.4);
  }
  G.dragYaw = Math.max(0, G.dragYaw - dt);
}

export function updateTraffic(dt) {
  const p = G.player;
  for (const car of G.traffic) {
    if (car.dead) continue;
    if (car === p.car) continue;
    const target = car.route[car.wp];
    const dx = target.x - car.group.position.x;
    const dz = target.z - car.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5) { car.wp = (car.wp + 1) % car.route.length; continue; }
    const desired = Math.atan2(dx, dz);
    turnToward(car, desired, dt, 2.4);
    // slow down for the player's car ahead
    let want = car.aiSpeed;
    if (p.car) {
      const pc = p.car.group.position;
      const ddx = pc.x - car.group.position.x, ddz = pc.z - car.group.position.z;
      const ahead = ddx * Math.sin(car.heading) + ddz * Math.cos(car.heading);
      const dd = Math.hypot(ddx, ddz);
      if (ahead > 0 && dd < 10) want = 0;
    }
    car.speed += (want - car.speed) * Math.min(1, dt * 1.5);
    moveCar(car, dt);
  }
  // car-car shoves (player car vs traffic)
  if (p.car) {
    for (const car of G.traffic) {
      if (car === p.car || car.dead) continue;
      const dx = car.group.position.x - p.car.group.position.x;
      const dz = car.group.position.z - p.car.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 4.6 && d > 0.01) {
        const push = (4.6 - d) / 2;
        const nx = dx / d, nz = dz / d;
        car.group.position.x += nx * push;
        car.group.position.z += nz * push;
        p.car.group.position.x -= nx * push;
        p.car.group.position.z -= nz * push;
        car.speed *= 0.6;
        if (Math.abs(p.car.speed) > 8) { sfxCrash(); G.stats.crashes++; p.car.speed *= 0.7; }
      }
    }
  }
}

export function nearestCar(maxDist) {
  const p = G.player.pos;
  let best = null, bd = maxDist;
  for (const car of G.cars) {
    if (car.dead || car.isPolice) continue;
    const d = Math.hypot(car.group.position.x - p.x, car.group.position.z - p.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}

export function enterCar(car, stolen) {
  G.player.car = car;
  G.player.onFoot = false;
  car.parked = false;
  if (car.route) { // traffic car: remove from AI control
    const i = G.traffic.indexOf(car);
    if (i >= 0) G.traffic.splice(i, 1);
    car.route = null;
  }
  if (stolen) {
    G.stats.carsStolen++;
    G.wanted = Math.min(5, G.wanted + 1);
    G.wantedTimer = 0;
  }
  engineStart();
  return car;
}

export function exitCar() {
  const car = G.player.car;
  if (!car) return;
  const side = car.group.position;
  const px = side.x + Math.cos(car.heading) * 3.2;
  const pz = side.z - Math.sin(car.heading) * 3.2;
  const r = resolveCircle(px, pz, 0.7);
  G.player.pos.x = r.x; G.player.pos.z = r.z;
  G.player.heading = car.heading;
  G.player.onFoot = true;
  G.player.car = null;
  car.speed = 0;
  engineStop();
}
