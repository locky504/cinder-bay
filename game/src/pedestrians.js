// Cinder Bay — pedestrians. They stroll the sidewalks, turn at intersections,
// and run from gunfire. Hitting one with a car or a bullet raises the heat.
import * as THREE from 'three';
import { G, CITY } from './state.js';
import { mulberry32, pick, range } from './rng.js';
import { resolveCircle } from './city.js';

const COATS = [0x8a6a3a, 0x3a5a8a, 0x6a3a5a, 0x4a4a52, 0x7a2f2f, 0x2f6a5a, 0x9a9a9a];

export function makePedMesh(color) {
  const g = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9997a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e26 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.66, 0.32), coat);
  torso.position.y = 1.0;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skin);
  head.position.y = 1.52;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), dark);
  legL.position.set(-0.15, 0.32, 0);
  legL.name = 'legL';
  g.add(legL);
  const legR = legL.clone(); legR.name = 'legR'; legR.position.x = 0.15;
  g.add(legR);
  return g;
}

export function spawnPeds(n) {
  const rng = mulberry32(G.seed + 303);
  for (let i = 0; i < n; i++) {
    const road = pick(rng, CITY.roads);
    const along = range(rng, -180, 180);
    const side = rng() < 0.5 ? 8.6 : -8.6;
    const horizontal = rng() < 0.5;
    const x = horizontal ? along : road + side;
    const z = horizontal ? road + side : along;
    const group = makePedMesh(pick(rng, COATS));
    group.position.set(x, 0, z);
    G.scene.add(group);
    G.peds.push({
      group, heading: rng() * Math.PI * 2,
      speed: 1.2 + rng() * 0.9,
      state: 'walk', fleeX: 0, fleeZ: 0, phase: rng() * 6,
      horizontal,
    });
  }
}

export function scarePeds(x, z, radius) {
  for (const p of G.peds) {
    const d = Math.hypot(p.group.position.x - x, p.group.position.z - z);
    if (d < radius) {
      p.state = 'flee';
      p.fleeX = x; p.fleeZ = z;
    }
  }
}

export function updatePeds(dt) {
  for (const p of G.peds) {
    p.phase += dt * (p.state === 'flee' ? 14 : 6);
    const legL = p.group.getObjectByName('legL');
    const legR = p.group.getObjectByName('legR');
    if (legL) legL.rotation.x = Math.sin(p.phase) * 0.5;
    if (legR) legR.rotation.x = -Math.sin(p.phase) * 0.5;
    let dirX = Math.sin(p.heading), dirZ = Math.cos(p.heading);
    if (p.state === 'flee') {
      const dx = p.group.position.x - p.fleeX, dz = p.group.position.z - p.fleeZ;
      const d = Math.hypot(dx, dz) || 1;
      dirX = dx / d; dirZ = dz / d;
      p.heading = Math.atan2(dirX, dirZ);
      if (d > 45) p.state = 'walk';
    } else {
      // wander: mostly straight along the sidewalk, sometimes turn at a road
      const onRoadLine = CITY.roads.some((r) => Math.abs(p.group.position.x - r) < 9.5 || Math.abs(p.group.position.z - r) < 9.5);
      if (onRoadLine && Math.random() < dt * 0.12) {
        p.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
    }
    const spd = p.state === 'flee' ? 7.5 : p.speed;
    const nx = p.group.position.x + dirX * spd * dt;
    const nz = p.group.position.z + dirZ * spd * dt;
    const r = resolveCircle(nx, nz, 0.5);
    p.group.position.x = r.x; p.group.position.z = r.z;
    p.group.rotation.y = p.heading;
    // hit by the player's car: knock down + wanted
    const pc = G.player.car;
    if (pc) {
      const d = Math.hypot(p.group.position.x - pc.group.position.x, p.group.position.z - pc.group.position.z);
      if (d < 2.6 && Math.abs(pc.speed) > 3) {
        p.state = 'flee';
        p.fleeX = pc.group.position.x; p.fleeZ = pc.group.position.z;
        if (!p.hitRecently) {
          p.hitRecently = true;
          setTimeout(() => { p.hitRecently = false; }, 4000);
          G.wanted = Math.min(5, G.wanted + 1);
          G.message = 'You hit a pedestrian! The heat is on.';
          G.messageTimer = 3;
        }
      }
    }
  }
}
