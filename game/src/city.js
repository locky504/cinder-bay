// Cinder Bay — the rainy industrial port city. Builds the ground (one painted
// canvas texture: roads, lane dashes, sidewalks, district tints), the
// buildings of three districts, the docks and harbour water, containers,
// street lamps, neon signs and the rain. Also owns collision: every building
// registers an AABB the player and cars resolve against.
import * as THREE from 'three';
import { G, CITY, DISTRICTS } from './state.js';
import { mulberry32, pick, range, rangeInt } from './rng.js';

let rainPoints = null, rainVel = null, rainGeo = null;
let objectiveBeacon = null, objectiveRing = null;
const ROADS = CITY.roads;
const HALF = CITY.half;

function groundTexture(rng) {
  const S = 1024, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  const w2p = (v) => ((v + HALF) / (HALF * 2)) * S;
  g.fillStyle = '#15171d'; g.fillRect(0, 0, S, S);
  // district tints
  const tints = [['dockside', '#1c2733'], ['oldtown', '#26221a'], ['uptown', '#221d33']];
  for (const [key, col] of tints) {
    const d = DISTRICTS[key];
    g.fillStyle = col;
    g.fillRect(0, w2p(d.z0), S, w2p(d.z1) - w2p(d.z0));
  }
  // blocks (sidewalk slabs)
  g.fillStyle = '#23262e';
  for (let i = 0; i < ROADS.length - 1; i++) {
    for (let j = 0; j < ROADS.length - 1; j++) {
      const x0 = ROADS[i] + 8, x1 = ROADS[i + 1] - 8;
      const z0 = ROADS[j] + 8, z1 = ROADS[j + 1] - 8;
      g.fillRect(w2p(x0), w2p(z0), w2p(x1) - w2p(x0), w2p(z1) - w2p(z0));
    }
  }
  // roads
  g.fillStyle = '#0e0f13';
  for (const r of ROADS) {
    g.fillRect(0, w2p(r - 7), S, w2p(r + 7) - w2p(r - 7));
    g.fillRect(w2p(r - 7), 0, w2p(r + 7) - w2p(r - 7), S);
  }
  // lane dashes
  g.fillStyle = '#8a7f4d';
  for (const r of ROADS) {
    for (let v = -HALF; v < HALF; v += 16) {
      g.fillRect(w2p(v), w2p(r) - 1.5, w2p(v + 7) - w2p(v), 3);
      g.fillRect(w2p(r) - 1.5, w2p(v), 3, w2p(v + 7) - w2p(v));
    }
  }
  // crosswalks at intersections
  g.fillStyle = '#3a3d46';
  for (const rx of ROADS) for (const rz of ROADS) {
    for (let k = -3; k <= 3; k++) {
      g.fillRect(w2p(rx + k * 3.4) - 2, w2p(rz - 7), 4, 5);
      g.fillRect(w2p(rx + k * 3.4) - 2, w2p(rz + 7) - 5, 4, 5);
    }
  }
  // wet sheen blotches
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(90,110,140,${0.03 + rng() * 0.05})`;
    const x = rng() * S, z = rng() * S, r = 6 + rng() * 26;
    g.beginPath(); g.ellipse(x, z, r, r * 0.6, rng() * 3, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function windowTexture(rng, base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 14) {
      const on = rng() < 0.55;
      g.fillStyle = on ? pick(rng, ['#ffd27a', '#9fd8ff', '#ff9a5c', lit]) : '#0a0c12';
      g.fillRect(x, y, 9, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function neonTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b10'; g.fillRect(0, 0, 256, 64);
  g.font = 'bold 34px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 14;
  g.fillStyle = color; g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene) {
  const rng = mulberry32(G.seed);
  G.colliders = [];

  const hemi = new THREE.HemisphereLight(0x8fa3c7, 0x1a1410, 0.55);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xaac4ff, 0.7);
  moon.position.set(120, 180, 60);
  scene.add(moon);
  scene.fog = new THREE.Fog(0x0b0e18, 60, 340);
  scene.background = new THREE.Color(0x0b0e18);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture(rng) })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // harbour water south of the city + dock piers
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 90),
    new THREE.MeshLambertMaterial({ color: 0x0d2436, transparent: true, opacity: 0.92 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.4, -HALF - 42);
  scene.add(water);
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x3a3128 });
  for (const px of [-140, -40, 60, 150]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 46), pierMat);
    pier.position.set(px, 0.4, -HALF - 18);
    scene.add(pier);
  }

  // buildings
  const winTexs = [
    windowTexture(mulberry32(11), '#232a38', '#ffd27a'),
    windowTexture(mulberry32(23), '#2a2320', '#9fd8ff'),
    windowTexture(mulberry32(37), '#1f2630', '#ff9a5c'),
  ];
  const neons = [
    ['DOCKS', '#37e0ff'], ['RAMEN', '#ff5c8a'], ['HOTEL', '#ffd27a'],
    ['GARAGE', '#7dff9a'], ['BAR', '#c77dff'], ['FERRY', '#37e0ff'],
    ['NOODLE', '#ff9a5c'], ['MOTEL', '#ffd27a'],
  ];
  let neonIdx = 0;
  const blockCenters = [-150, -90, -30, 30, 90, 150];
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const district = bz < -70 ? 'dockside' : bz < 70 ? 'oldtown' : 'uptown';
      const isDockRow = bz === -150;
      const count = isDockRow ? 1 : (rng() < 0.6 ? 2 : 1);
      for (let k = 0; k < count; k++) {
        const w = isDockRow ? range(rng, 30, 40) : range(rng, 14, 26);
        const d = isDockRow ? range(rng, 16, 22) : range(rng, 14, 24);
        const h = isDockRow ? range(rng, 8, 14)
          : district === 'uptown' ? range(rng, 26, 62)
          : district === 'oldtown' ? range(rng, 12, 26) : range(rng, 10, 20);
        const ox = count === 2 ? (k === 0 ? -11 : 11) : 0;
        const oz = count === 2 ? (k === 0 ? -9 : 9) : 0;
        const x = bx + ox, z = bz + oz;
        const mat = new THREE.MeshLambertMaterial({
          map: pick(rng, winTexs),
          color: new THREE.Color().setHSL(0.6 + rng() * 0.08, 0.18, 0.5 + rng() * 0.2),
        });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(x, h / 2, z);
        scene.add(b);
        G.colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
        // rooftop rim light
        const rim = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4),
          new THREE.MeshBasicMaterial({ color: district === 'uptown' ? 0x4a6a9a : 0x3a4a5e })
        );
        rim.position.set(x, h + 0.2, z);
        scene.add(rim);
        // occasional neon sign facing the nearest road
        if (rng() < 0.45 && neonIdx < neons.length * 3) {
          const [txt, col] = neons[neonIdx % neons.length]; neonIdx++;
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(13, 3.2),
            new THREE.MeshBasicMaterial({ map: neonTexture(txt, col), transparent: true })
          );
          sign.position.set(x, Math.min(h - 2, 10), z + d / 2 + 0.15);
          scene.add(sign);
        }
      }
    }
  }

  // shipping containers at the docks
  const contColors = [0xb3542e, 0x2e7db3, 0x4a8a3e, 0xb39a2e, 0x7a3eb3];
  for (let i = 0; i < 26; i++) {
    const x = range(rng, -185, 185), z = range(rng, -205, -175);
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(12, 2.6, 2.6),
      new THREE.MeshLambertMaterial({ color: pick(rng, contColors) })
    );
    c.position.set(x, 1.3 + (rng() < 0.25 ? 2.6 : 0), z);
    c.rotation.y = rng() < 0.5 ? 0 : Math.PI / 2;
    scene.add(c);
    G.colliders.push({ x0: x - 6, x1: x + 6, z0: z - 1.6, z1: z + 1.6 });
  }
  // crates scattered in dockside alleys
  for (let i = 0; i < 18; i++) {
    const x = range(rng, -185, 185), z = range(rng, -200, -80);
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 2.2, 2.2),
      new THREE.MeshLambertMaterial({ color: 0x6a5a38 })
    );
    c.position.set(x, 1.1, z);
    scene.add(c);
  }

  // street lamps at intersections
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const rx of ROADS) for (const rz of ROADS) {
    if (rng() < 0.5) continue;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7, 6), poleMat);
    pole.position.set(rx + 8.5, 3.5, rz + 8.5);
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), lampMat);
    head.position.set(rx + 8.5, 7.1, rz + 8.5);
    scene.add(head);
  }
  // a few real lights so cars and characters read at night
  for (const [lx, lz] of [[-60, -120], [60, 0], [0, 120], [-120, 60]]) {
    const pl = new THREE.PointLight(0xffd9a0, 60, 55, 1.6);
    pl.position.set(lx, 9, lz);
    scene.add(pl);
  }

  // objective beacon (hidden until a mission sets it)
  objectiveBeacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  objectiveBeacon.position.y = 30;
  objectiveBeacon.visible = false;
  scene.add(objectiveBeacon);
  objectiveRing = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  objectiveRing.rotation.x = -Math.PI / 2;
  objectiveRing.position.y = 0.15;
  objectiveRing.visible = false;
  scene.add(objectiveRing);

  buildRain(scene);
}

function buildRain(scene) {
  const N = 1400;
  const pos = new Float32Array(N * 3);
  rainVel = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 140;
    pos[i * 3 + 1] = Math.random() * 45;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 140;
    rainVel[i] = 28 + Math.random() * 18;
  }
  rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0x9fb6d8, size: 0.35, transparent: true, opacity: 0.55 });
  rainPoints = new THREE.Points(rainGeo, mat);
  rainPoints.frustumCulled = false;
  scene.add(rainPoints);
}

export function updateRain(dt, focus) {
  if (!rainPoints) return;
  const pos = rainGeo.attributes.position.array;
  const N = rainVel.length;
  for (let i = 0; i < N; i++) {
    pos[i * 3 + 1] -= rainVel[i] * dt;
    pos[i * 3] += dt * 3; // wind slant
    if (pos[i * 3 + 1] < 0) {
      pos[i * 3 + 1] = 38 + Math.random() * 8;
      pos[i * 3] = focus.x + (Math.random() - 0.5) * 140;
      pos[i * 3 + 2] = focus.z + (Math.random() - 0.5) * 140;
    }
  }
  rainGeo.attributes.position.needsUpdate = true;
  rainPoints.position.x = 0; rainPoints.position.z = 0;
}

export function setObjectiveMarker(x, z, color = 0xffd24a) {
  if (!objectiveBeacon) return;
  objectiveBeacon.visible = true; objectiveRing.visible = true;
  objectiveBeacon.position.x = x; objectiveBeacon.position.z = z;
  objectiveRing.position.x = x; objectiveRing.position.z = z;
  objectiveBeacon.material.color.setHex(color);
  objectiveRing.material.color.setHex(color);
}
export function clearObjectiveMarker() {
  if (!objectiveBeacon) return;
  objectiveBeacon.visible = false; objectiveRing.visible = false;
}
export function pulseObjectiveMarker(t) {
  if (objectiveRing && objectiveRing.visible) {
    const s = 1 + Math.sin(t * 4) * 0.18;
    objectiveRing.scale.set(s, s, 1);
  }
}

// Circle (player / car) vs building AABBs + world bounds. Returns corrected pos.
export function resolveCircle(x, z, r) {
  let hit = false;
  for (const c of G.colliders) {
    const cx = Math.max(c.x0, Math.min(x, c.x1));
    const cz = Math.max(c.z0, Math.min(z, c.z1));
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = x - c.x0, pr = c.x1 - x, pt = z - c.z0, pb = c.z1 - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.x0 - r; else if (m === pr) x = c.x1 + r;
        else if (m === pt) z = c.z0 - r; else z = c.z1 + r;
      }
    }
  }
  const B = HALF - 2;
  if (x < -B) { x = -B; hit = true; }
  if (x > B) { x = B; hit = true; }
  if (z < -B) { z = -B; hit = true; }
  if (z > B) { z = B; hit = true; }
  return { x, z, hit };
}

export function isOnRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < 7.5 || Math.abs(z - r) < 7.5) return true;
  }
  return false;
}

export function randomRoadPoint(rng) {
  const r = pick(rng, ROADS);
  const along = range(rng, -180, 180);
  return rng() < 0.5 ? { x: r, z: along } : { x: along, z: r };
}
