// The player body: acceleration-based movement, crouch, jump and AABB
// collision against the map. Position is feet; eye height depends on stance.
// Recoil is applied to pitch/yaw here so the gun and the camera agree.
import * as THREE from 'three';
import { moveAndCollide } from './world.js';

const WALK_SPEED = 5.2;
const CROUCH_SPEED = 3.1;
const ACCEL = 42; // m/s^2 towards the wanted velocity
const FRICTION = 11; // 1/s decay when no input
const GRAVITY = 22;
const JUMP_SPEED = 7.2;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.08;
const RADIUS = 0.38;

export function createPlayer(colliders) {
  const body = {
    position: new THREE.Vector3(0, 0, 15),
    velocity: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: 0,
    eye: EYE_STAND,
    crouched: false,
    onGround: true,
    hp: 100,
    alive: true,
    // Recoil recovery: the pitch kick decays back towards the pre-shot aim.
    recoilPitch: 0,
    recoilYaw: 0,
  };
  // Temporary vectors, allocated once.
  const wish = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  function reset(spawn) {
    body.position.set(spawn.x, 0, spawn.z);
    body.velocity.set(0, 0, 0);
    body.yaw = spawn.yaw ?? Math.PI;
    body.pitch = 0;
    body.eye = EYE_STAND;
    body.crouched = false;
    body.onGround = true;
    body.hp = 100;
    body.alive = true;
    body.recoilPitch = 0;
    body.recoilYaw = 0;
  }

  function look(dx, dy) {
    // 0.0022 rad per pixel: a full sweep of the screen is about a quarter turn.
    body.yaw -= dx * 0.0022;
    body.pitch -= dy * 0.0022;
    const limit = Math.PI / 2 - 0.02;
    if (body.pitch > limit) body.pitch = limit;
    if (body.pitch < -limit) body.pitch = -limit;
  }

  function recoil(pitchKick, yawKick) {
    body.recoilPitch += pitchKick;
    body.recoilYaw += yawKick;
  }

  // One fixed step. `keys` is the input key set; `speedScale` lets weapons
  // slow the player while aiming down the DMR.
  function step(dt, keys, speedScale) {
    if (!body.alive) return;
    const crouchKey = keys.has('ControlLeft') || keys.has('KeyC');
    body.crouched = crouchKey;
    const targetEye = crouchKey ? EYE_CROUCH : EYE_STAND;
    body.eye += (targetEye - body.eye) * Math.min(1, dt * 14);

    forward.set(-Math.sin(body.yaw), 0, -Math.cos(body.yaw));
    right.set(-forward.z, 0, forward.x);
    wish.set(0, 0, 0);
    if (keys.has('KeyW')) wish.add(forward);
    if (keys.has('KeyS')) wish.sub(forward);
    if (keys.has('KeyD')) wish.add(right);
    if (keys.has('KeyA')) wish.sub(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const speed = (crouchKey ? CROUCH_SPEED : WALK_SPEED) * (speedScale || 1);
    const wantX = wish.x * speed;
    const wantZ = wish.z * speed;
    // Accelerate towards the wanted velocity; friction when idle.
    const k = wish.lengthSq() > 0 ? ACCEL * dt : FRICTION * dt;
    body.velocity.x += (wantX - body.velocity.x) * Math.min(1, k);
    body.velocity.z += (wantZ - body.velocity.z) * Math.min(1, k);

    if (keys.has('Space') && body.onGround) {
      body.velocity.y = JUMP_SPEED;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;
    if (body.velocity.y < -30) body.velocity.y = -30;

    const height = body.crouched ? 1.15 : 1.75;
    moveAndCollide(colliders, body.position, RADIUS, height, body.velocity, dt);
    // Vertical: the floor is y = 0; nothing in the map is climbed onto.
    body.position.y += body.velocity.y * dt;
    if (body.position.y <= 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (body.position.y > 0.02) {
      body.onGround = false;
    }

    // Recoil recovers: the kick decays and the aim drifts back.
    body.recoilPitch *= Math.max(0, 1 - dt * 7);
    body.recoilYaw *= Math.max(0, 1 - dt * 7);
  }

  function groundSpeed() {
    return Math.hypot(body.velocity.x, body.velocity.z);
  }

  function damage(amount) {
    if (!body.alive) return false;
    body.hp -= amount;
    if (body.hp <= 0) {
      body.hp = 0;
      body.alive = false;
      return true;
    }
    return false;
  }

  return { body, reset, look, recoil, step, groundSpeed, damage };
}
