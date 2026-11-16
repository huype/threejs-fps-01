// The charge objective: plant at Site A or B, defend the fuse, defuse.
// Planting takes 3 s holding E inside a site; a planted charge fuses for 35 s
// and then detonates. A Warden standing at the charge defuses in 5 s. The
// round ends on detonation, defusal, elimination or the timer running out —
// main.js owns the round end, this module owns the charge state machine.
import * as THREE from 'three';
import { SITES } from './world.js';

const PLANT_TIME = 3;
const DEFUSE_TIME = 5;
const FUSE_TIME = 35;

export function createBomb(scene, state, hooks) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.45, 0.3, 0.3);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xd8b13c, roughness: 0.4, metalness: 0.5,
    emissive: 0xc23b2e, emissiveIntensity: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);
  const light = new THREE.PointLight(0xc23b2e, 0, 8, 1.8);
  light.position.y = 0.5;
  group.add(light);
  group.visible = false;
  scene.add(group);
  let beepTimer = 0;

  function siteAt(x, z) {
    for (const site of SITES) {
      if (Math.hypot(site.x - x, site.z - z) <= site.radius) return site;
    }
    return null;
  }

  // Called every fixed step while the round is live.
  // ctx: { playerPos, planting (E held), playerAlive, defusingBot (or null), dt }
  function step(ctx) {
    const bomb = state.bomb;
    if (bomb.state === 'carried') {
      if (!ctx.playerAlive) return;
      const site = siteAt(ctx.playerPos.x, ctx.playerPos.z);
      if (site && ctx.planting) {
        bomb.state = 'planting';
        bomb.site = site.id;
        bomb.plantProgress = 0;
        state.flags.planting = true;
      }
      return;
    }
    if (bomb.state === 'planting') {
      const site = SITES.find((s) => s.id === bomb.site);
      const inside = site && Math.hypot(site.x - ctx.playerPos.x, site.z - ctx.playerPos.z) <= site.radius;
      if (!ctx.playerAlive || !ctx.planting || !inside) {
        bomb.state = 'carried';
        bomb.site = null;
        bomb.plantProgress = 0;
        state.flags.planting = false;
        return;
      }
      bomb.plantProgress += ctx.dt / PLANT_TIME;
      if (bomb.plantProgress >= 1) {
        bomb.state = 'planted';
        bomb.fuse = FUSE_TIME;
        bomb.position.x = ctx.playerPos.x;
        bomb.position.y = 0.15;
        bomb.position.z = ctx.playerPos.z;
        state.flags.planting = false;
        group.position.set(bomb.position.x, bomb.position.y, bomb.position.z);
        group.visible = true;
        mat.emissiveIntensity = 0.9;
        light.intensity = 6;
        hooks.onPlanted(bomb.site);
      }
      return;
    }
    if (bomb.state === 'planted') {
      bomb.fuse -= ctx.dt;
      // Beep faster as the fuse runs down.
      beepTimer -= ctx.dt;
      if (beepTimer <= 0) {
        beepTimer = Math.max(0.25, bomb.fuse / FUSE_TIME * 1.0);
        hooks.onBeep();
      }
      light.intensity = 4 + Math.sin(ctx.elapsed * 10) * 2;
      if (ctx.defusingBot) {
        bomb.defuseProgress += ctx.dt / DEFUSE_TIME;
        state.flags.defusing = true;
        if (bomb.defuseProgress >= 1) {
          bomb.state = 'defused';
          group.visible = false;
          light.intensity = 0;
          mat.emissiveIntensity = 0;
          state.flags.defusing = false;
          hooks.onDefused();
        }
      } else {
        state.flags.defusing = false;
      }
      if (bomb.state === 'planted' && bomb.fuse <= 0) {
        bomb.state = 'exploded';
        group.visible = false;
        light.intensity = 0;
        hooks.onExploded(bomb.position);
      }
    }
  }

  function reset() {
    const bomb = state.bomb;
    bomb.state = 'carried';
    bomb.site = null;
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    bomb.fuse = 0;
    group.visible = false;
    light.intensity = 0;
    mat.emissiveIntensity = 0;
    beepTimer = 0;
  }

  return { group, siteAt, step, reset };
}
