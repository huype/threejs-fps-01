// The Spark frag grenade: a thrown sphere with gravity, wall bounces and a
// fused explosion. Damage falls off with distance and needs line of sight,
// so a crate between you and the blast genuinely saves you.
import * as THREE from 'three';
import { GRENADE } from './weapons.js';
import { losClear } from './world.js';

const FUSE = 1.6;
const GRAVITY = 14;

export function createGrenades(scene, world, state, hooks) {
  const list = [];
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8b13c, roughness: 0.4, metalness: 0.6 });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });

  function throwGrenade(from, dir) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from);
    scene.add(mesh);
    const vel = dir.clone().multiplyScalar(13);
    vel.y += 3.5;
    list.push({ mesh, velocity: vel, fuse: FUSE });
    hooks.onThrow();
  }

  function explode(g) {
    const pos = g.mesh.position;
    scene.remove(g.mesh);
    // Flash sphere, briefly.
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), flashMat.clone());
    flash.position.copy(pos);
    scene.add(flash);
    hooks.onFlash(flash);
    hooks.onExplosion(pos);
    const radius = GRENADE.radius;
    const targets = hooks.targets();
    for (const target of targets) {
      const dx = target.position.x - pos.x;
      const dy = target.position.y + 1.1 - pos.y;
      const dz = target.position.z - pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius) continue;
      const clear = losClear(world.shootables, { x: pos.x, y: pos.y, z: pos.z },
        { x: target.position.x, y: target.position.y + 1.1, z: target.position.z });
      if (!clear) continue;
      const amount = Math.round(GRENADE.damage * (1 - dist / radius * 0.75));
      hooks.onDamage(target, amount);
    }
    state.heard.push({ kind: 'explosion', x: pos.x, z: pos.z, radius: 40 });
  }

  function step(dt) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const g = list[i];
      g.fuse -= dt;
      g.velocity.y -= GRAVITY * dt;
      g.mesh.position.addScaledVector(g.velocity, dt);
      // Floor bounce.
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        g.velocity.y = Math.abs(g.velocity.y) * 0.45;
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
      }
      // Wall bounce: clamp inside the arena and damp the component.
      const p = g.mesh.position;
      if (p.x < -21.8) { p.x = -21.8; g.velocity.x = Math.abs(g.velocity.x) * 0.5; }
      if (p.x > 21.8) { p.x = 21.8; g.velocity.x = -Math.abs(g.velocity.x) * 0.5; }
      if (p.z < -17.8) { p.z = -17.8; g.velocity.z = Math.abs(g.velocity.z) * 0.5; }
      if (p.z > 17.8) { p.z = 17.8; g.velocity.z = -Math.abs(g.velocity.z) * 0.5; }
      // Crate and wall bounce: push out of any collider on the x/z plane.
      for (const c of world.colliders) {
        if (p.y > c.max.y || p.y < c.min.y) continue;
        if (p.x > c.min.x - 0.09 && p.x < c.max.x + 0.09 && p.z > c.min.z - 0.09 && p.z < c.max.z + 0.09) {
          const dxl = p.x - (c.min.x - 0.09);
          const dxr = (c.max.x + 0.09) - p.x;
          const dzl = p.z - (c.min.z - 0.09);
          const dzr = (c.max.z + 0.09) - p.z;
          const min = Math.min(dxl, dxr, dzl, dzr);
          if (min === dxl) { p.x = c.min.x - 0.09; g.velocity.x = -Math.abs(g.velocity.x) * 0.5; }
          else if (min === dxr) { p.x = c.max.x + 0.09; g.velocity.x = Math.abs(g.velocity.x) * 0.5; }
          else if (min === dzl) { p.z = c.min.z - 0.09; g.velocity.z = -Math.abs(g.velocity.z) * 0.5; }
          else { p.z = c.max.z + 0.09; g.velocity.z = Math.abs(g.velocity.z) * 0.5; }
        }
      }
      if (g.fuse <= 0) {
        explode(g);
        list.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const g of list) scene.remove(g.mesh);
    list.length = 0;
  }

  return { list, throwGrenade, step, clear };
}
