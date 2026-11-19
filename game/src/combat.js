// Cinder Bay — combat. Hitscan pistol fire from the camera centre, enemy
// gunmen with health bars who shoot back, and the muzzle-flash / tracer
// feedback that makes a shootout read on screen.
import * as THREE from 'three';
import { G } from './state.js';
import { mulberry32, range } from './rng.js';
import { sfxShot, sfxHit } from './audio.js';
import { scarePeds } from './pedestrians.js';

const raycaster = new THREE.Raycaster();
const ENEMY_COLOR = 0x7a2a2a;

function makeEnemyMesh() {
  const g = new THREE.Group();
  const coat = new THREE.MeshLambertMaterial({ color: ENEMY_COLOR });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9997a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e26 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.36), coat);
  torso.position.y = 1.05;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), skin);
  head.position.y = 1.6;
  g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.7), dark);
  gun.position.set(0.3, 1.15, 0.4);
  g.add(gun);
  // health bar above the head
  const bg = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.1, 0.02),
    new THREE.MeshBasicMaterial({ color: 0x330000 })
  );
  bg.position.y = 2.05;
  g.add(bg);
  const fg = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.1, 0.03),
    new THREE.MeshBasicMaterial({ color: 0xff3333 })
  );
  fg.position.y = 2.05;
  fg.name = 'hpbar';
  g.add(fg);
  return g;
}

export function spawnEnemies(n, cx, cz, spread = 14) {
  const rng = mulberry32(G.seed + 404 + G.missionIndex * 17);
  const made = [];
  for (let i = 0; i < n; i++) {
    const x = cx + range(rng, -spread, spread);
    const z = cz + range(rng, -spread, spread);
    const group = makeEnemyMesh();
    group.position.set(x, 0, z);
    G.scene.add(group);
    const e = { group, health: 100, shootCd: 1 + rng() * 1.5, dead: false };
    group.userData.enemy = e;
    G.enemies.push(e);
    made.push(e);
  }
  return made;
}

export function clearEnemies() {
  for (const e of G.enemies) G.scene.remove(e.group);
  G.enemies = [];
}

function playerShootOrigin() {
  const cam = G.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  return { origin: cam.position.clone(), dir };
}

export function playerShoot() {
  if (G.shootCd > 0 || !G.player.onFoot || G.mode !== 'playing') return;
  G.shootCd = 0.28;
  G.stats.shotsFired++;
  sfxShot();
  scarePeds(G.player.pos.x, G.player.pos.z, 30);
  // Third-person aim assist: the camera looks down at Mara, so a raw ray out
  // of the lens dives into the ground before it reaches a gunman standing
  // past her. Instead, take the living enemy closest to the camera's forward
  // direction inside a small cone and hit them; the shot reads as aimed
  // through the crosshair.
  const { dir } = playerShootOrigin();
  const chest = new THREE.Vector3(G.player.pos.x, 1.4, G.player.pos.z);
  // Compare directions on the horizontal plane only: the camera looks down
  // at Mara, so its 3D forward tilts below any gunman standing past her and
  // a 3D angle would reject every shot at range.
  const dirH = new THREE.Vector3(dir.x, 0, dir.z).normalize();
  let best = null, bestAngle = 0.2, bestDist = 1e9;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const to = new THREE.Vector3(e.group.position.x, 1.2, e.group.position.z).sub(chest);
    const dist = to.length();
    if (dist > 60) continue;
    const toH = new THREE.Vector3(to.x, 0, to.z).normalize();
    const angle = toH.angleTo(dirH);
    if (angle < bestAngle) { best = e; bestAngle = angle; bestDist = dist; }
  }
  if (best) {
    const target = new THREE.Vector3(best.group.position.x, 1.2, best.group.position.z);
    drawTracer(chest, target);
    damageEnemy(best);
    return;
  }
  // No enemy in the cone: still fire a tracer toward the crosshair point,
  // and check whether a pedestrian was in the way (camera ray only).
  const { origin } = playerShootOrigin();
  raycaster.set(origin, dir);
  raycaster.far = 70;
  const pedTargets = G.peds.map((p) => p.group);
  const hits = raycaster.intersectObjects(pedTargets, true);
  const end = origin.clone().add(dir.clone().multiplyScalar(30));
  drawTracer(chest, end);
  if (hits.length === 0) return;
  const ped = G.peds.find((p) => p.group === hits[0].object || p.group.children.includes(hits[0].object));
  if (ped) {
    scarePeds(ped.group.position.x, ped.group.position.z, 20);
    G.wanted = Math.min(5, G.wanted + 1);
    G.message = 'You shot a civilian! The heat is on.';
    G.messageTimer = 2.5;
  }
}

function drawTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a }));
  G.scene.add(line);
  setTimeout(() => { G.scene.remove(line); geo.dispose(); }, 90);
}

function damageEnemy(enemy) {
  G.stats.shotsHit++;
  sfxHit();
  enemy.health -= 34;
  const bar = enemy.group.getObjectByName('hpbar');
  if (bar) bar.scale.x = Math.max(0.02, enemy.health / 100);
  if (enemy.health <= 0) {
    enemy.dead = true;
    G.stats.kills++;
    G.money += 20;
    enemy.group.rotation.x = -Math.PI / 2;
    enemy.group.position.y = 0.3;
    if (bar) bar.visible = false;
    setTimeout(() => {
      G.scene.remove(enemy.group);
      const i = G.enemies.indexOf(enemy);
      if (i >= 0) G.enemies.splice(i, 1);
    }, 4000);
  }
}

export function updateEnemies(dt) {
  const pp = G.player.car
    ? G.player.car.group.position
    : { x: G.player.pos.x, z: G.player.pos.z };
  for (const e of G.enemies) {
    if (e.dead) continue;
    const gp = e.group.position;
    const dx = pp.x - gp.x, dz = pp.z - gp.z;
    const dist = Math.hypot(dx, dz);
    e.group.rotation.y = Math.atan2(dx, dz);
    e.shootCd -= dt;
    if (dist < 42 && e.shootCd <= 0 && G.player.health > 0) {
      e.shootCd = 1.3 + Math.random() * 0.9;
      // muzzle flash
      const flash = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffcc44 })
      );
      flash.position.set(gp.x + Math.sin(e.group.rotation.y) * 0.8, 1.2, gp.z + Math.cos(e.group.rotation.y) * 0.8);
      G.scene.add(flash);
      setTimeout(() => G.scene.remove(flash), 70);
      if (Math.random() < 0.34) {
        G.player.health -= 8;
        G.damageFlash = 1;
      }
    }
  }
}
