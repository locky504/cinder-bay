// Cinder Bay — Mara Quinn on foot: third-person walking / running, a simple
// articulated character mesh, and the district gates that keep locked parts
// of the city closed until the story opens them.
import * as THREE from 'three';
import { G, DISTRICTS } from './state.js';
import { resolveCircle } from './city.js';

let mesh = null, legL = null, legR = null, armL = null, armR = null, walkPhase = 0;

export function createPlayerMesh(scene) {
  mesh = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f7a6e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a583 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e26 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), jacket);
  torso.position.y = 1.05;
  mesh.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin);
  head.position.y = 1.62;
  mesh.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.38), dark);
  hair.position.y = 1.82;
  mesh.add(hair);
  legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), dark);
  legL.position.set(-0.17, 0.35, 0);
  mesh.add(legL);
  legR = legL.clone();
  legR.position.x = 0.17;
  mesh.add(legR);
  armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), jacket);
  armL.position.set(-0.42, 1.05, 0);
  mesh.add(armL);
  armR = armL.clone();
  armR.position.x = 0.42;
  mesh.add(armR);
  mesh.position.set(G.player.pos.x, 0, G.player.pos.z);
  scene.add(mesh);
  return mesh;
}

export function playerMesh() { return mesh; }

let gateToastCd = 0;

export function updatePlayer(dt) {
  const p = G.player;
  if (!p.onFoot || !mesh) return;
  gateToastCd = Math.max(0, gateToastCd - dt);
  const k = G.keys;
  // movement relative to camera yaw
  let mx = 0, mz = 0;
  if (k.up) { mx += Math.sin(G.camYaw); mz += Math.cos(G.camYaw); }
  if (k.down) { mx -= Math.sin(G.camYaw); mz -= Math.cos(G.camYaw); }
  if (k.left) { mx -= Math.cos(G.camYaw); mz += Math.sin(G.camYaw); }
  if (k.right) { mx += Math.cos(G.camYaw); mz -= Math.sin(G.camYaw); }
  const len = Math.hypot(mx, mz);
  p.moving = len > 0;
  const spd = k.run ? 9.5 : 5.8; // walk 5.8, run 9.5
  if (len > 0) {
    mx /= len; mz /= len;
    p.heading = Math.atan2(mx, mz);
    let nx = p.pos.x + mx * spd * dt;
    let nz = p.pos.z + mz * spd * dt;
    // district gates: locked districts push back
    const from = p.pos.z < -70 ? 'dockside' : p.pos.z < 70 ? 'oldtown' : 'uptown';
    const to = nz < -70 ? 'dockside' : nz < 70 ? 'oldtown' : 'uptown';
    if (to !== from && !G.unlocked[to]) {
      nz = p.pos.z; // stay out
      if (gateToastCd <= 0) {
        gateToastCd = 3;
        G.message = `${DISTRICTS[to].name} is still locked — finish the story to open it.`;
        G.messageTimer = 3;
      }
    }
    const r = resolveCircle(nx, nz, 0.65);
    p.pos.x = r.x; p.pos.z = r.z;
    p.walkSpeed = spd;
    walkPhase += dt * spd * 1.6;
  } else {
    p.walkSpeed = 0;
  }
  mesh.position.set(p.pos.x, 0, p.pos.z);
  mesh.rotation.y = p.heading;
  const swing = p.moving ? Math.sin(walkPhase) * 0.55 : 0;
  legL.rotation.x = swing; legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.7; armR.rotation.x = swing * 0.7;
}

export function syncPlayerMeshToCar() {
  if (!mesh) return;
  if (G.player.car) {
    mesh.visible = false;
  } else {
    mesh.visible = true;
    mesh.position.set(G.player.pos.x, 0, G.player.pos.z);
  }
}
