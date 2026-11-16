// Visual effects: tracers, muzzle flash, hit sparks and explosion flashes.
// Fixed pools, reused every frame — no object is created in the render loop.
// A tracer is a line whose opacity fades over 90 ms; sparks are short-lived
// point bursts; the muzzle flash is a small light on the camera.
import * as THREE from 'three';

const TRACER_LIFE = 0.09;
const SPARK_LIFE = 0.35;
const POOL_TRACERS = 24;
const POOL_SPARKS = 16;

export function createEffects(scene, camera) {
  const tracers = [];
  for (let i = 0; i < POOL_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    line.visible = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparks = [];
  for (let i = 0; i < POOL_SPARKS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.14, transparent: true, opacity: 0, sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    scene.add(points);
    sparks.push({ points, life: 0, velocities: new Float32Array(24) });
  }
  let sparkIndex = 0;

  const muzzle = new THREE.PointLight(0xffd9a0, 0, 9, 2);
  camera.add(muzzle);
  muzzle.position.set(0.25, -0.18, -0.6);
  let muzzleLife = 0;

  const flashes = []; // explosion flash spheres waiting to fade

  function tracer(from, to, color) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % POOL_TRACERS;
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.85;
    t.line.visible = true;
    t.life = TRACER_LIFE;
  }

  function sparkBurst(at, color, count) {
    const s = sparks[sparkIndex];
    sparkIndex = (sparkIndex + 1) % POOL_SPARKS;
    const pos = s.points.geometry.attributes.position.array;
    for (let i = 0; i < 8; i += 1) {
      const n = i * 3;
      pos[n] = at.x;
      pos[n + 1] = at.y;
      pos[n + 2] = at.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const speed = 2 + Math.random() * 3;
      s.velocities[n] = Math.cos(a) * Math.cos(b) * speed;
      s.velocities[n + 1] = Math.sin(b) * speed;
      s.velocities[n + 2] = Math.sin(a) * Math.cos(b) * speed;
    }
    s.points.geometry.setDrawRange(0, Math.min(count, 8));
    s.points.material.color.setHex(color);
    s.points.material.opacity = 1;
    s.points.visible = true;
    s.life = SPARK_LIFE;
  }

  function muzzleFlash() {
    muzzle.intensity = 14;
    muzzleLife = 0.05;
  }

  function addFlash(mesh) {
    flashes.push({ mesh, life: 0.3 });
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.line.visible = false; continue; }
      t.line.material.opacity = 0.85 * (t.life / TRACER_LIFE);
    }
    for (const s of sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.points.visible = false; continue; }
      const pos = s.points.geometry.attributes.position.array;
      for (let i = 0; i < pos.length; i += 1) pos[i] += s.velocities[i] * dt;
      s.points.geometry.attributes.position.needsUpdate = true;
      s.points.material.opacity = s.life / SPARK_LIFE;
    }
    if (muzzleLife > 0) {
      muzzleLife -= dt;
      if (muzzleLife <= 0) muzzle.intensity = 0;
    }
    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      const f = flashes[i];
      f.life -= dt;
      const scale = 1 + (0.3 - f.life) * 8;
      f.mesh.scale.setScalar(Math.max(0.1, scale));
      f.mesh.material.opacity = Math.max(0, f.life / 0.3) * 0.9;
      if (f.life <= 0) {
        scene.remove(f.mesh);
        f.mesh.material.dispose();
        flashes.splice(i, 1);
      }
    }
  }

  return { tracer, sparkBurst, muzzleFlash, addFlash, step };
}
