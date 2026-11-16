// Warden bots: waypoint patrol, site holds, sight and hearing, burst fire.
// A bot is a small state machine: hold -> patrol -> investigate -> combat,
// and when the charge is planted the nearest bot breaks off to defuse it.
// Bots see with a real raycast (distance, field of view, line of sight) and
// hear gunshots through the state's `heard` events; they shoot with a real
// raycast too, so cover genuinely protects the player.
import * as THREE from 'three';
import { WAYPOINTS, HOLD_POINTS, SITES, SPAWNS, losClear, moveAndCollide } from './world.js';
import { PALETTE } from './palette.js';
import { pick, intIn } from './rng.js';

const NAMES = ['Ash', 'Bram', 'Cinder', 'Dusk'];
const BOT_SPEED = 3.4;
const BOT_RADIUS = 0.38;
const BOT_HEIGHT = 1.75;
const SEE_DIST = 32;
const SEE_HALF_FOV = 1.05; // ~60 degrees each side
const BODY_DAMAGE = 14;
const HEAD_DAMAGE = 34;
const SCAN_EVERY = 0.12;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _end = new THREE.Vector3();
const _ray = new THREE.Raycaster();

function botMaterial(color, emissive) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.75,
    metalness: 0.15,
    emissive: emissive ? new THREE.Color(emissive) : new THREE.Color(0x000000),
    emissiveIntensity: emissive ? 0.7 : 0,
  });
}

export function createBots(scene, world, state, random, hooks) {
  const bots = [];
  const suitMat = botMaterial(0x2e4a48, 0);
  const darkMat = botMaterial(0x232a31, 0);
  const visorMat = botMaterial(0x111111, PALETTE.accent);
  const list = [];

  function buildMesh(bot) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.34), suitMat);
    torso.position.y = 1.12;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), darkMat);
    head.position.y = 1.66;
    head.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.02), visorMat);
    visor.position.set(0, 1.67, 0.16);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.24), darkMat);
    legL.position.set(-0.15, 0.36, 0);
    const legR = legL.clone();
    legR.position.x = 0.15;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.72), darkMat);
    gun.position.set(0.28, 1.25, 0.3);
    group.add(torso, head, visor, legL, legR, gun);
    torso.userData = { bot, part: 'body' };
    head.userData = { bot, part: 'head' };
    visor.userData = { bot, part: 'head' };
    bot.mesh = group;
    bot.parts = { torso, head };
    bot.gun = gun;
    scene.add(group);
    return group;
  }

  function spawnAll() {
    for (const bot of list) scene.remove(bot.mesh);
    list.length = 0;
    for (let i = 0; i < 4; i += 1) {
      const spawn = SPAWNS.wardens[i];
      const bot = {
        id: i,
        name: NAMES[i],
        position: new THREE.Vector3(spawn.x, 0, spawn.z),
        velocity: new THREE.Vector3(),
        yaw: 0,
        hp: 100,
        alive: true,
        mode: 'hold',
        holdPoint: HOLD_POINTS[i],
        waypoint: HOLD_POINTS[i],
        target: null, // {x, z} the bot is walking to
        leg: null, // {x, z} the current leg of its route
        lastSeen: null, // {x, y, z, t}
        reaction: 0,
        burstLeft: 0,
        shotCooldown: 0,
        pauseTimer: 0,
        scanTimer: random() * SCAN_EVERY,
        waitTimer: 0,
        strafeDir: 1,
        strafeTimer: 0,
        stuckTimer: 0,
        stuck: false,
        path: null, // BFS route through the waypoint graph
        pathIndex: 0,
        pathGoal: -1,
        lastPos: new THREE.Vector3(spawn.x, 0, spawn.z),
        heardIndex: 0,
        defusing: false,
      };
      buildMesh(bot);
      bot.mesh.position.copy(bot.position);
      bot.yaw = Math.PI; // face south, towards the Vanguard yard
      list.push(bot);
    }
  }

  function aliveCount() {
    let n = 0;
    for (const bot of list) if (bot.alive) n += 1;
    return n;
  }

  function waypointPos(index) {
    const w = WAYPOINTS[index];
    return { x: w.x, z: w.z };
  }

  function setTarget(bot, x, z) {
    bot.target = { x, z };
  }

  // The leg the bot is walking right now; distinct from bot.target, the
  // mission destination, so routing never overwrites where it is headed.
  function setLeg(bot, x, z) {
    bot.leg = { x, z };
  }

  function pickPatrolTarget(bot) {
    // Base the next leg on where the bot actually is, not on a stale field:
    // BFS routes move the bot between waypoints without updating it.
    const current = nearestWaypoint(bot.position.x, bot.position.z);
    bot.waypoint = current;
    const neighbors = WAYPOINTS[current].n;
    const next = pick(random, neighbors);
    bot.waypoint = next;
    const p = waypointPos(next);
    setLeg(bot, p.x, p.z);
  }

  function nearestWaypoint(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const d = (WAYPOINTS[i].x - x) ** 2 + (WAYPOINTS[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // Breadth-first path through the waypoint graph. The graph's edges are all
  // walkable, so a bot following a path never has to push through a wall or
  // a crate — a straight line to the goal would.
  function findPath(start, goal) {
    if (start === goal) return [goal];
    const prev = new Array(WAYPOINTS.length).fill(-1);
    const queue = [start];
    prev[start] = start;
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const n of WAYPOINTS[cur].n) {
        if (prev[n] !== -1) continue;
        prev[n] = cur;
        if (n === goal) {
          const path = [goal];
          let at = goal;
          while (at !== start) { at = prev[at]; path.unshift(at); }
          return path;
        }
        queue.push(n);
      }
    }
    return [goal];
  }

  // Walk the bot to a waypoint along the graph. Returns true on arrival.
  function gotoWaypoint(bot, goal, dt, speed) {
    if (bot.pathGoal !== goal || !bot.path) {
      bot.path = findPath(nearestWaypoint(bot.position.x, bot.position.z), goal);
      bot.pathIndex = 0;
      bot.pathGoal = goal;
    }
    if (bot.pathIndex >= bot.path.length) return true;
    const node = WAYPOINTS[bot.path[bot.pathIndex]];
    setLeg(bot, node.x, node.z);
    if (walkTo(bot, dt, speed)) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    if (bot.stuck) {
      bot.stuck = false;
      bot.path = null;
      bot.pathGoal = -1;
    }
    return false;
  }

  // Walk towards bot.leg at speed, sliding along walls. Returns true on arrival.
  // Sets bot.stuck when the bot makes no progress for ~0.9 s; the caller
  // decides what to do (a new route, a new patrol leg, ...).
  function walkTo(bot, dt, speed) {
    if (!bot.leg) return true;
    const dx = bot.leg.x - bot.position.x;
    const dz = bot.leg.z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) return true;
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    bot.velocity.set(vx, 0, vz);
    _v1.copy(bot.position);
    moveAndCollide(world.colliders, bot.position, BOT_RADIUS, BOT_HEIGHT, bot.velocity, dt);
    bot.yaw = Math.atan2(-vx, -vz);
    // Stuck against a wall: flag it and let the mode handler re-route.
    if (bot.position.distanceToSquared(_v1) < 0.0004) {
      bot.stuckTimer += dt;
      if (bot.stuckTimer > 0.9) {
        bot.stuckTimer = 0;
        bot.stuck = true;
      }
    } else {
      bot.stuckTimer = 0;
    }
    return false;
  }

  function canSeePlayer(bot, playerPos) {
    _v1.set(bot.position.x, bot.position.y + 1.55, bot.position.z);
    _v2.set(playerPos.x, playerPos.y + 1.35, playerPos.z);
    const dist = _v1.distanceTo(_v2);
    if (dist > SEE_DIST) return false;
    _dir.subVectors(_v2, _v1).normalize();
    const forward = { x: -Math.sin(bot.yaw), y: 0, z: -Math.cos(bot.yaw) };
    const dot = _dir.x * forward.x + _dir.z * forward.z;
    if (dot < Math.cos(SEE_HALF_FOV)) return false;
    return losClear(world.shootables, { x: _v1.x, y: _v1.y, z: _v1.z }, { x: _v2.x, y: _v2.y, z: _v2.z });
  }

  function shootAtPlayer(bot, playerBody, dt) {
    bot.shotCooldown -= dt;
    if (bot.reaction > 0) {
      bot.reaction -= dt;
      return;
    }
    if (bot.burstLeft <= 0) {
      if (bot.pauseTimer > 0) {
        bot.pauseTimer -= dt;
        return;
      }
      bot.burstLeft = 3 + intIn(random, 0, 3);
      bot.pauseTimer = 0;
    }
    if (bot.shotCooldown > 0) return;
    bot.shotCooldown = 0.13;
    bot.burstLeft -= 1;
    if (bot.burstLeft <= 0) bot.pauseTimer = 0.6 + random() * 0.5;

    // Aim at the chest with an error that grows with distance: a bot at 25 m
    // misses often, one at 5 m rarely does.
    const target = _v1.set(
      playerBody.position.x,
      playerBody.position.y + playerBody.eye - 0.25,
      playerBody.position.z,
    );
    const from = _v2.set(bot.position.x, bot.position.y + 1.45, bot.position.z);
    _dir.subVectors(target, from);
    const dist = _dir.length();
    _dir.normalize();
    const err = 0.02 + dist * 0.0035;
    _dir.x += (random() * 2 - 1) * err;
    _dir.y += (random() * 2 - 1) * err;
    _dir.z += (random() * 2 - 1) * err;
    _dir.normalize();
    scene.updateMatrixWorld(true); // the player moves between renders
    _ray.set(from, _dir);
    _ray.far = 80;
    _end.copy(from).addScaledVector(_dir, 40);
    const hits = _ray.intersectObjects(hooks.playerHitMeshes, false);
    const wall = _ray.intersectObjects(world.shootables, false)[0];
    const wallDist = wall ? wall.distance : 80;
    if (hits.length > 0 && hits[0].distance < wallDist) {
      const part = hits[0].object.userData.part || 'body';
      hooks.onPlayerDamage(part === 'head' ? HEAD_DAMAGE : BODY_DAMAGE, bot);
      hooks.onTracer(from, hits[0].point, 0x3fa7a0);
    } else {
      const stop = wall && wall.distance < 40 ? wall.point : _end;
      hooks.onTracer(from, stop, 0x3fa7a0);
    }
    hooks.onEnemyShot(bot.position);
  }

  function step(dt, playerBody, elapsed) {
    for (const bot of list) {
      if (!bot.alive) continue;
      bot.scanTimer -= dt;

      // Hearing: any gunshot or explosion the bot is close enough to hear.
      while (bot.heardIndex < state.heard.length) {
        const event = state.heard[bot.heardIndex];
        bot.heardIndex += 1;
        const d = Math.hypot(event.x - bot.position.x, event.z - bot.position.z);
        if (d < event.radius && bot.mode !== 'combat' && bot.mode !== 'defuse') {
          bot.mode = 'investigate';
          setTarget(bot, event.x, event.z);
          bot.waitTimer = 0;
        }
      }

      // Sight scan, a few times a second.
      if (bot.scanTimer <= 0) {
        bot.scanTimer = SCAN_EVERY;
        if (playerBody.alive && canSeePlayer(bot, playerBody.position)) {
          bot.lastSeen = {
            x: playerBody.position.x,
            y: playerBody.position.y + 1.3,
            z: playerBody.position.z,
            t: elapsed,
          };
          // A bot defusing the charge is committed: pulling it into combat
          // every scan would reset its route and it would never arrive.
          if (bot.mode !== 'combat' && bot.mode !== 'defuse') {
            bot.mode = 'combat';
            bot.reaction = 0.35 + random() * 0.35;
            bot.burstLeft = 0;
            bot.pauseTimer = 0;
          }
        } else if (bot.mode === 'combat' && bot.lastSeen && elapsed - bot.lastSeen.t > 2.5) {
          // Lost the player: go check where they were last seen.
          bot.mode = 'investigate';
          setTarget(bot, bot.lastSeen.x, bot.lastSeen.z);
          bot.waitTimer = 0;
        }
      }

      // The charge is planted: the closest living bot breaks off to defuse —
      // even out of a firefight — and the others converge on the site.
      if (state.bomb.state === 'planted' || state.bomb.state === 'planting') {
        const site = SITES.find((s) => s.id === state.bomb.site) || SITES[0];
        const d = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
        let closest = true;
        for (const other of list) {
          if (other === bot || !other.alive) continue;
          const od = Math.hypot(site.x - other.position.x, site.z - other.position.z);
          if (od < d) { closest = false; break; }
        }
        if (closest && state.bomb.state === 'planted' && bot.mode !== 'defuse') {
          bot.mode = 'defuse';
          bot.path = null;
          bot.pathGoal = -1;
        } else if (bot.mode !== 'defuse' && bot.mode !== 'combat' && bot.mode !== 'investigate') {
          bot.mode = 'investigate';
          setTarget(bot, site.x + (random() * 4 - 2), site.z + (random() * 4 - 2));
          bot.waitTimer = 0;
        }
      }

      switch (bot.mode) {
        case 'combat': {
          bot.defusing = false;
          if (!playerBody.alive) { bot.mode = 'patrol'; pickPatrolTarget(bot); break; }
          // Face the player and strafe a little so they are not a still target.
          bot.strafeTimer -= dt;
          if (bot.strafeTimer <= 0) {
            bot.strafeTimer = 0.8 + random() * 0.8;
            bot.strafeDir = random() < 0.5 ? -1 : 1;
          }
          const dx = playerBody.position.x - bot.position.x;
          const dz = playerBody.position.z - bot.position.z;
          bot.yaw = Math.atan2(-dx, -dz);
          const strafe = bot.strafeDir * 1.1;
          const px = -Math.cos(bot.yaw) * strafe;
          const pz = Math.sin(bot.yaw) * strafe;
          bot.velocity.set(px, 0, pz);
          moveAndCollide(world.colliders, bot.position, BOT_RADIUS, BOT_HEIGHT, bot.velocity, dt);
          shootAtPlayer(bot, playerBody, dt);
          break;
        }
        case 'defuse': {
          const bomb = state.bomb;
          const siteNode = bomb.site === 'A' ? 4 : 8;
          const d = Math.hypot(bomb.position.x - bot.position.x, bomb.position.z - bot.position.z);
          if (d <= 1.6) {
            bot.defusing = true;
            bot.velocity.set(0, 0, 0);
            break;
          }
          bot.defusing = false;
          // Route through the waypoint graph to the site, then the last
          // metres straight at the charge.
          if (gotoWaypoint(bot, siteNode, dt, BOT_SPEED)) {
            setLeg(bot, bomb.position.x, bomb.position.z);
            walkTo(bot, dt, BOT_SPEED);
            if (bot.stuck) {
              bot.stuck = false;
              bot.path = null;
              bot.pathGoal = -1;
            }
          }
          break;
        }
        case 'investigate': {
          bot.defusing = false;
          // Route to the nearest waypoint of the heard/seen spot, then walk
          // the last metres straight at it.
          if (bot.target && gotoWaypoint(bot, nearestWaypoint(bot.target.x, bot.target.z), dt, BOT_SPEED)) {
            setLeg(bot, bot.target.x, bot.target.z);
            if (walkTo(bot, dt, BOT_SPEED) || bot.stuck) {
              bot.stuck = false;
              bot.waitTimer += dt;
              bot.yaw += dt * 1.2; // look around the spot
              if (bot.waitTimer > 2) {
                bot.mode = 'hold';
                bot.waitTimer = 0;
              }
            }
          } else if (!bot.target) {
            bot.mode = 'hold';
          }
          break;
        }
        case 'hold': {
          bot.defusing = false;
          const p = waypointPos(bot.holdPoint);
          const d = Math.hypot(p.x - bot.position.x, p.z - bot.position.z);
          if (d > 0.5) {
            gotoWaypoint(bot, bot.holdPoint, dt, BOT_SPEED);
          } else {
            // Slow scan: sweep the yaw back and forth across the site.
            bot.yaw += Math.sin(elapsed * 0.5 + bot.id * 1.7) * dt * 0.6;
            bot.waitTimer += dt;
            if (bot.waitTimer > 6 + bot.id * 2) {
              bot.waitTimer = 0;
              bot.mode = 'patrol';
              pickPatrolTarget(bot);
            }
          }
          break;
        }
        case 'patrol':
        default: {
          bot.defusing = false;
          if (walkTo(bot, dt, BOT_SPEED)) {
            bot.mode = 'hold';
            bot.waitTimer = 0;
          } else if (bot.stuck) {
            bot.stuck = false;
            pickPatrolTarget(bot);
          }
          break;
        }
      }

      bot.mesh.position.copy(bot.position);
      bot.mesh.rotation.y = bot.yaw;
    }
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    // A hit while defusing breaks the defuse channel.
    if (bot.defusing) {
      bot.defusing = false;
      state.bomb.defuseProgress = 0;
    }
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.defusing = false;
      // Fall over: the mesh lies on its side and sinks slightly.
      bot.mesh.rotation.z = Math.PI / 2;
      bot.mesh.position.y = -0.4;
      return true;
    }
    // Being shot at tells the bot where the shot came from.
    if (bot.mode !== 'combat') {
      bot.mode = 'investigate';
      bot.lastSeen = null;
    }
    return false;
  }

  function hitMeshes() {
    const meshes = [];
    for (const bot of list) {
      if (!bot.alive) continue;
      meshes.push(bot.parts.torso, bot.parts.head);
    }
    return meshes;
  }

  return { list, spawnAll, aliveCount, step, damage, hitMeshes };
}
