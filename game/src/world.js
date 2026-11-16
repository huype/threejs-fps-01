// Kestrel Foundry: the original 3-lane map. 44 x 36 m, open to a dusk sky.
// Vanguard spawn in the south yard; two charge sites in the north — Site A
// "Furnace" in the west, Site B "Crucible" in the east. West lane, mid hall and
// east lane connect them, with door gaps cut where the waypoint graph crosses
// the lane dividers. Every box is a collider and a bullet stop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph the bots patrol and path along. Nodes are {x, z}; neighbours
// are indices into this array. Edges never cross a wall: the lane dividers
// below leave gaps exactly where these edges pass.
export const WAYPOINTS = [
  { x: 0, z: 15, n: [1, 5, 9] }, // 0 Vanguard spawn / yard
  { x: -14, z: 12, n: [0, 2] }, // 1 west approach
  { x: -16, z: 2, n: [1, 3, 10] }, // 2 west mid
  { x: -16, z: -6, n: [2, 4, 12] }, // 3 west site approach
  { x: -16, z: -12, n: [3, 12, 14] }, // 4 Site A
  { x: 14, z: 12, n: [0, 6] }, // 5 east approach
  { x: 16, z: 2, n: [5, 7, 10] }, // 6 east mid
  { x: 16, z: -6, n: [6, 8, 13] }, // 7 east site approach
  { x: 16, z: -12, n: [7, 13, 15] }, // 8 Site B
  { x: 0, z: 8, n: [0, 10] }, // 9 mid south
  { x: 0, z: 0, n: [9, 11, 2, 6] }, // 10 mid centre
  { x: 0, z: -8, n: [10, 12, 13] }, // 11 mid north
  { x: -8, z: -12, n: [11, 3, 4, 14] }, // 12 A connector
  { x: 8, z: -12, n: [11, 7, 8, 15] }, // 13 B connector
  { x: -4, z: -14, n: [4, 12] }, // 14 A back
  { x: 4, z: -14, n: [8, 13] }, // 15 B back
];

export const SITES = [
  { id: 'A', name: 'Furnace', x: -16, z: -12, radius: 4.2 },
  { id: 'B', name: 'Crucible', x: 16, z: -12, radius: 4.2 },
];

export const SPAWNS = {
  vanguard: { x: 0, z: 15, yaw: 0 }, // facing north, down the mid hall
  wardens: [
    { x: -15, z: -15 },
    { x: -10, z: -14 },
    { x: 10, z: -14 },
    { x: 15, z: -15 },
  ],
};

// Hold points the Warden bots defend: two at A, one at B, one roaming mid.
export const HOLD_POINTS = [4, 14, 8, 10];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'hazard' ? 0.5 : 0.92,
      metalness: name === 'hairline' ? 0.35 : 0.04,
    });
  }
  const siteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.hazard),
    roughness: 0.6,
    metalness: 0.1,
    emissive: new THREE.Color(PALETTE.hazard),
    emissiveIntensity: 0.18,
  });
  const beaconMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.hazard),
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
  });

  const colliders = [];
  const shootables = [];
  const siteMeshes = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material] || material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and outer walls (5 m high, open sky above).
  box(44.8, 0.4, 36.8, 0, -0.2, 0, 'floor');
  box(0.4, 5, 36.8, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 36.8, 22.2, 2.5, 0, 'surface');
  box(44.8, 5, 0.4, 0, 2.5, -18.2, 'surface');
  box(44.8, 5, 0.4, 0, 2.5, 18.2, 'surface');

  // Lane dividers at x = -8 and x = +8. Gaps at z in [-14,-10] (site connector),
  // [-1,3] (mid connector) and open south of z = 3 (the yard is shared).
  for (const side of [-1, 1]) {
    const x = side * 8;
    box(0.4, 5, 4, x, 2.5, -16, 'surface'); // z -18..-14
    box(0.4, 5, 9, x, 2.5, -5.5, 'surface'); // z -10..-1
    box(0.4, 5, 15, x, 2.5, 10.5, 'surface'); // z 3..18
  }

  // Foundry hall: two furnace pillars and a gantry beam across mid.
  box(2.2, 4.4, 2.2, -3.4, 2.2, -8, 'hairline');
  box(2.2, 4.4, 2.2, 3.4, 2.2, -8, 'hairline');
  box(11, 0.8, 1.2, 0, 4.6, -8, 'hairline');
  box(1.6, 3.4, 1.6, -3.4, 1.7, 4, 'hairline');
  box(1.6, 3.4, 1.6, 3.4, 1.7, 4, 'hairline');

  // Cover crates: low (shoot over), tall (block sight), stacked pairs.
  const crates = [
    [1.6, 1.1, 1.6, -12, 0.55, 6, 'hairline'],
    [1.6, 1.1, 1.6, -13.5, 0.55, -2, 'hairline'],
    [1.2, 1.1, 2.4, -18, 0.55, -8, 'hairline'],
    [1.6, 2.2, 1.6, -19.5, 1.1, -14, 'hairline'],
    [1.6, 1.1, 1.6, 12, 0.55, 6, 'hairline'],
    [1.6, 1.1, 1.6, 13.5, 0.55, -2, 'hairline'],
    [1.2, 1.1, 2.4, 18, 0.55, -8, 'hairline'],
    [1.6, 2.2, 1.6, 19.5, 1.1, -14, 'hairline'],
    [2.4, 1.1, 1.2, -5, 0.55, 12, 'hairline'],
    [2.4, 1.1, 1.2, 5, 0.55, 12, 'hairline'],
    [1.2, 1.1, 1.2, -1.5, 0.55, -3, 'hairline'],
    [1.2, 1.1, 1.2, 1.5, 0.55, -3, 'hairline'],
    [1.6, 1.1, 1.6, -6, 0.55, -15.5, 'hairline'],
    [1.6, 1.1, 1.6, 6, 0.55, -15.5, 'hairline'],
    // Tall site crates sit at the north edge of each site so the straight
    // waypoint edge into the site stays walkable.
    [1.2, 2.2, 1.2, -12, 1.1, -16.5, 'hairline'],
    [1.2, 2.2, 1.2, 12, 1.1, -16.5, 'hairline'],
  ];
  for (const c of crates) box(c[0], c[1], c[2], c[3], c[4], c[5], c[6]);

  // Site markers: hazard floor plate, a pylon, and a faint light column.
  for (const site of SITES) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, 5.4), siteMat);
    plate.position.set(site.x, 0.04, site.z);
    plate.receiveShadow = true;
    group.add(plate);
    siteMeshes.push(plate);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.0, 0.4), siteMat);
    pylon.position.set(site.x + 2.4, 1.0, site.z + 2.4);
    pylon.castShadow = true;
    group.add(pylon);
    siteMeshes.push(pylon);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 5, 20, 1, true),
      beaconMat,
    );
    beam.position.set(site.x, 2.5, site.z);
    group.add(beam);
    siteMeshes.push(beam);
  }

  // Lighting: warm dusk key from the south-west, cool fill, sky gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(0x9aa7b5), new THREE.Color(PALETTE.canvas), 1.15);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(0xffd9a0), 2.3);
  key.position.set(-14, 18, 12);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(12, 10, -14);
  scene.add(fill);
  // Warm glow over each site so the objective reads at a glance.
  for (const site of SITES) {
    const glow = new THREE.PointLight(new THREE.Color(PALETTE.hazard), 12, 14, 1.6);
    glow.position.set(site.x, 3.2, site.z);
    scene.add(glow);
  }

  return { colliders, shootables, siteMeshes, group };
}

// --- Shared collision and line-of-sight helpers (module-level temps, no
// per-call allocation in the hot loops) ---

const _ray = new THREE.Raycaster();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();

// True when nothing solid stands between a and b. `a` and `b` are {x, y, z}.
export function losClear(shootables, a, b) {
  _from.set(a.x, a.y, a.z);
  _to.set(b.x, b.y, b.z);
  _dir.subVectors(_to, _from);
  const dist = _dir.length();
  if (dist < 0.001) return true;
  _dir.multiplyScalar(1 / dist);
  _ray.set(_from, _dir);
  _ray.far = dist;
  const hit = _ray.intersectObjects(shootables, false)[0];
  return !hit || hit.distance >= dist - 0.05;
}

// Move a circle (radius r, standing height h, feet at pos.y) by vel*dt and
// slide along axis-aligned colliders. pos is a THREE.Vector3 mutated in place.
// Returns a bitmask: 1 hit on x, 2 hit on z (bots use it to pick a new route).
export function moveAndCollide(colliders, pos, radius, height, vel, dt) {
  let hitMask = 0;
  pos.x += vel.x * dt;
  for (const c of colliders) {
    if (pos.y + height <= c.min.y + 0.05 || pos.y + 0.3 >= c.max.y) continue;
    if (pos.z + radius <= c.min.z || pos.z - radius >= c.max.z) continue;
    if (pos.x + radius > c.min.x && pos.x - radius < c.max.x) {
      if (vel.x > 0) pos.x = c.min.x - radius;
      else if (vel.x < 0) pos.x = c.max.x + radius;
      else pos.x += pos.x < (c.min.x + c.max.x) / 2 ? -(pos.x + radius - c.min.x) : (c.max.x - pos.x + radius);
      hitMask |= 1;
    }
  }
  pos.z += vel.z * dt;
  for (const c of colliders) {
    if (pos.y + height <= c.min.y + 0.05 || pos.y + 0.3 >= c.max.y) continue;
    if (pos.x + radius <= c.min.x || pos.x - radius >= c.max.x) continue;
    if (pos.z + radius > c.min.z && pos.z - radius < c.max.z) {
      if (vel.z > 0) pos.z = c.min.z - radius;
      else if (vel.z < 0) pos.z = c.max.z + radius;
      else pos.z += pos.z < (c.min.z + c.max.z) / 2 ? -(pos.z + radius - c.min.z) : (c.max.z - pos.z + radius);
      hitMask |= 2;
    }
  }
  // Clamp inside the outer walls.
  if (pos.x < -21.6 + radius) { pos.x = -21.6 + radius; hitMask |= 1; }
  if (pos.x > 21.6 - radius) { pos.x = 21.6 - radius; hitMask |= 1; }
  if (pos.z < -17.6 + radius) { pos.z = -17.6 + radius; hitMask |= 2; }
  if (pos.z > 17.6 - radius) { pos.z = 17.6 - radius; hitMask |= 2; }
  return hitMask;
}
