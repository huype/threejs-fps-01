// SUNDERLINE — boot and the one loop. A fixed 60 Hz simulation feeds a render
// at the display's rate; the two never share code. ?shot=menu|combat|site|
// roundend with &seed=N stages a deterministic frame for a capture, renders
// it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createState, resetRoundState } from './state.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenade.js';
import { createBomb } from './bomb.js';
import { createEconomy, ECONOMY } from './economy.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(shot ? seed : (Date.now() % 2147483647));

const state = createState();
const audio = createAudio();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene, camera);
const player = createPlayer(world.colliders);

// Player hitboxes the bots raycast against (invisible, never rendered).
// Declared before the bots, because botHooks() hands them to createBots().
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
const bodyHit = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.1, 0.5), hitMat);
const headHit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), hitMat);
bodyHit.userData.part = 'body';
headHit.userData.part = 'head';
scene.add(bodyHit, headHit);
const playerHitMeshes = [bodyHit, headHit];

const weapons = createWeapons();
const economy = createEconomy(state, weapons);
const bomb = createBomb(scene, state, bombHooks());
const grenades = createGrenades(scene, world, state, grenadeHooks());
const bots = createBots(scene, world, state, random, botHooks());
const hud = createHud({ onPlay, onBuy, onDeploy });
const input = createInput(renderer.domElement, onLockChange);

// --- Viewmodel: a low-poly gun built from boxes, parented to the camera. ---
const viewmodel = new THREE.Group();
const vmMat = new THREE.MeshStandardMaterial({ color: 0x565e66, roughness: 0.6, metalness: 0.35 });
const vmAccent = new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.4, metalness: 0.3 });
function vmBox(w, h, d, x, y, z, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || vmMat);
  mesh.position.set(x, y, z);
  viewmodel.add(mesh);
  return mesh;
}
vmBox(0.09, 0.13, 0.5, 0.22, -0.2, -0.45);
const vmBarrel = vmBox(0.05, 0.05, 0.34, 0.22, -0.185, -0.82);
vmBox(0.07, 0.16, 0.1, 0.22, -0.28, -0.5);
vmBox(0.03, 0.05, 0.12, 0.22, -0.13, -0.55, vmAccent);
camera.add(viewmodel);
let vmKick = 0;
let walkCycle = 0;

function setViewmodel(weaponId) {
  // The DMR gets a longer barrel, the SMG a shorter one: the gun in hand
  // always matches the weapon the HUD names.
  const len = weaponId === 'dmr' ? 0.5 : weaponId === 'smg' ? 0.22 : 0.34;
  vmBarrel.scale.z = len / 0.34;
  vmBarrel.position.z = -0.82 - (len - 0.34) / 2;
}

// --- Hooks the subsystems call back into the main loop with. ---
function syncHitboxes() {
  const p = player.body.position;
  bodyHit.position.set(p.x, p.y + 1.0, p.z);
  headHit.position.set(p.x, p.y + (player.body.crouched ? 1.05 : 1.6), p.z);
  bodyHit.rotation.y = player.body.yaw;
  headHit.rotation.y = player.body.yaw;
}

// --- Hooks the subsystems call back into the main loop with. ---
function bombHooks() {
  return {
    onPlanted(site) {
      audio.planted();
      state.money += ECONOMY.plant;
      hud.feed(`Charge planted at Site ${site} · +$${ECONOMY.plant}`, true);
      hud.setBombBanner(`CHARGE PLANTED — SITE ${site}`, 'danger');
    },
    onDefused() {
      endRound('wardens', 'Wardens defused the charge.');
    },
    onExploded() {
      audio.explode();
      const pos = state.bomb.position;
      effects.sparkBurst(new THREE.Vector3(pos.x, 0.6, pos.z), 0xffd9a0, 8);
      hud.setBombBanner('', '');
      endRound('vanguard', 'The charge detonated at the site.');
    },
    onBeep() { audio.plantBeep(); },
  };
}

function grenadeHooks() {
  return {
    onThrow() { audio.click(); },
    onFlash(mesh) { effects.addFlash(mesh); },
    onExplosion(pos) {
      audio.explode();
      effects.sparkBurst(new THREE.Vector3(pos.x, pos.y + 0.3, pos.z), 0xffc46b, 8);
    },
    targets() {
      const out = [];
      if (player.body.alive) out.push({ position: player.body.position, kind: 'player', ref: null });
      for (const bot of bots.list) {
        if (bot.alive) out.push({ position: bot.position, kind: 'bot', ref: bot });
      }
      return out;
    },
    onDamage(target, amount) {
      if (target.kind === 'player') {
        const died = player.damage(amount);
        hud.damageFlash();
        audio.hurt();
        if (died) onPlayerDied('the blast');
      } else {
        const killed = bots.damage(target.ref, amount, 'body');
        if (killed) onBotKilled(target.ref, 'Spark Frag');
        else hud.hitMarker(false);
      }
    },
  };
}

function botHooks() {
  return {
    playerHitMeshes,
    onPlayerDamage(amount, bot) {
      if (!player.body.alive) return;
      const died = player.damage(amount);
      hud.damageFlash();
      audio.hurt();
      if (died) onPlayerDied(`Warden ${bot.name}`);
    },
    onTracer(from, to, color) { effects.tracer(from, to, color); },
    onEnemyShot() { audio.enemyShot(); },
  };
}

// --- Round flow ---
function startMatch() {
  state.score.vanguard = 0;
  state.score.wardens = 0;
  state.round = 1;
  state.matchWinner = null;
  state.money = ECONOMY.startMoney;
  weapons.refillAll();
  weapons.owned.primary = 'rifle';
  weapons.current = 'rifle';
  setViewmodel('rifle');
  startBuy();
}

function startBuy() {
  resetRoundState(state);
  state.phase = 'buy';
  state.phaseTimer = 20;
  player.reset(SPAWNS.vanguard);
  player.body.hp = 100;
  player.body.alive = true;
  weapons.refillAll();
  weapons.owned.grenades = 0;
  grenades.clear();
  bomb.reset();
  bots.spawnAll();
  hud.showBuy(state.money, weapons.owned, weapons.current);
  hud.setBombBanner('', '');
  hud.setPlantProgress(0);
  input.releaseLock();
  syncCamera();
}

function startRound() {
  resetRoundState(state);
  state.phase = 'live';
  state.roundTimer = 100;
  bots.spawnAll();
  grenades.clear();
  bomb.reset();
  player.reset(SPAWNS.vanguard);
  weapons.refillAll();
  hud.hideOverlay();
  hud.setBombBanner('', '');
  hud.setPlantProgress(0);
  input.requestLock();
  syncCamera();
}

function endRound(winner, reason) {
  if (state.phase !== 'live') return;
  state.phase = 'over';
  state.phaseTimer = 6;
  state.roundResult = { winner, reason };
  state.score[winner] += 1;
  economy.awardRound(winner, state.bomb.state === 'planted' || state.bomb.state === 'exploded');
  hud.showRoundEnd(state.roundResult, state.stats);
  if (winner === 'vanguard') audio.roundWin(); else audio.roundLose();
  input.releaseLock();
}

function nextRound() {
  if (state.score.vanguard >= state.roundsToWin || state.score.wardens >= state.roundsToWin) {
    state.phase = 'match';
    state.matchWinner = state.score.vanguard >= state.roundsToWin ? 'vanguard' : 'wardens';
    hud.showMatch(state.matchWinner);
    input.releaseLock();
    return;
  }
  state.round += 1;
  startBuy();
}

function onPlayerDied(by) {
  state.flags.playerDead = true;
  hud.feed(`${by} ▸ You`, false);
  if (state.bomb.state !== 'planted' && state.bomb.state !== 'planting') {
    endRound('wardens', 'Vanguard eliminated — Wardens hold the foundry.');
  }
}

function onBotKilled(bot, weaponName) {
  state.stats.kills += 1;
  state.killsThisRound += 1;
  economy.awardKill();
  hud.feed(`You ▸ Warden ${bot.name} · ${weaponName} · +$${ECONOMY.kill}`, true);
  audio.kill();
  if (bots.aliveCount() === 0 && state.bomb.state !== 'planted') {
    endRound('vanguard', 'All Wardens eliminated.');
  }
}

// --- Shooting: raycast from the camera, headshots pay triple. ---
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _right = new THREE.Vector3();
const raycaster = new THREE.Raycaster();

function shoot() {
  const def = weapons.def();
  if (!weapons.takeRound(true)) {
    if (weapons.state().mag === 0) audio.dryFire();
    return;
  }
  camera.getWorldDirection(_dir);
  const spread = weapons.spread(player.groundSpeed(), !player.body.onGround, player.body.crouched);
  _dir.x += (random() * 2 - 1) * spread;
  _dir.y += (random() * 2 - 1) * spread;
  _dir.z += (random() * 2 - 1) * spread;
  _dir.normalize();
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _muzzle.copy(camera.position).addScaledVector(_dir, 0.6).addScaledVector(_right, 0.22);
  _muzzle.y -= 0.16;
  raycaster.set(camera.position, _dir);
  raycaster.far = def.range;
  scene.updateMatrixWorld(true); // bots teleport between renders; raycast the current poses
  const targets = world.shootables.concat(bots.hitMeshes());
  const hit = raycaster.intersectObjects(targets, false)[0];
  const end = hit ? hit.point : _dir.clone().multiplyScalar(def.range).add(camera.position);
  effects.tracer(_muzzle, end, def.tracer);
  effects.muzzleFlash();
  vmKick = 0.09;
  player.recoil(def.recoilPitch + random() * 0.004, (random() * 2 - 1) * def.recoilYaw);
  audio.shot(def.kind);
  state.heard.push({ kind: 'shot', x: player.body.position.x, z: player.body.position.z, radius: 26 });
  if (state.heard.length > 64) state.heard.splice(0, state.heard.length - 64);
  state.stats.shots += 1;
  if (!hit) return;
  if (hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const head = hit.object.userData.part === 'head';
    const amount = Math.round(def.damage * (head ? def.headMult : 1));
    state.stats.hits += 1;
    state.stats.damage += amount;
    if (head) state.stats.headshots += 1;
    effects.sparkBurst(hit.point, 0xc23b2e, 6);
    audio.hit();
    const killed = bots.damage(bot, amount, head ? 'head' : 'body');
    hud.hitMarker(killed);
    if (killed) onBotKilled(bot, def.name);
  } else {
    effects.sparkBurst(hit.point, 0x8b939c, 4);
  }
}

// --- Input edges, handled once per fixed step. ---
function handleEdges(pressed) {
  if (state.phase === 'buy' && pressed.has('Enter')) { startRound(); return; }
  if (state.phase !== 'live') return;
  if (pressed.has('KeyR')) {
    if (weapons.reload()) audio.reload();
  }
  if (pressed.has('Digit1') && weapons.switchTo(weapons.owned.primary)) { setViewmodel(weapons.current); audio.click(); }
  if (pressed.has('Digit2') && weapons.switchTo('pistol')) { setViewmodel('pistol'); audio.click(); }
  if (pressed.has('KeyG') && weapons.owned.grenades > 0) {
    weapons.owned.grenades -= 1;
    camera.getWorldDirection(_dir);
    const from = camera.position.clone().addScaledVector(_dir, 0.5);
    from.y -= 0.1;
    grenades.throwGrenade(from, _dir);
  }
}

// --- One fixed simulation step. ---
let elapsed = 0;
function step(dt) {
  elapsed += dt;
  const pressed = input.takePressed();
  handleEdges(pressed);
  if (!input.firing) weapons.releaseTrigger();

  if (state.phase === 'buy') {
    state.phaseTimer -= dt;
    if (state.phaseTimer <= 0) startRound();
  } else if (state.phase === 'live') {
    state.roundTimer -= dt;
    if (state.roundTimer <= 0 && state.bomb.state !== 'planted') {
      endRound('wardens', 'Time expired — Wardens hold the foundry.');
    }
    player.step(dt, input.keys, weapons.current === 'dmr' ? 0.85 : 1);
    if (input.firing && weapons.ready()) shoot();
    weapons.step(dt);
    const defusingBot = bots.list.find((b) => b.alive && b.defusing) || null;
    bomb.step({
      playerPos: player.body.position,
      planting: input.keys.has('KeyE'),
      playerAlive: player.body.alive,
      defusingBot,
      dt,
      elapsed,
    });
    bots.step(dt, player.body, elapsed);
    syncHitboxes();
  } else if (state.phase === 'over') {
    state.phaseTimer -= dt;
    weapons.step(dt);
    if (state.phaseTimer <= 0) nextRound();
  }
  grenades.step(dt);
  effects.step(dt);
  hud.step(dt);
}

function syncCamera() {
  const body = player.body;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + body.recoilPitch, body.yaw + body.recoilYaw, 0, 'YXZ');
  // Viewmodel bob and recoil kick.
  const speed = player.groundSpeed();
  if (speed > 0.5 && body.onGround) walkCycle += 0.12 * speed * 0.016;
  vmKick = Math.max(0, vmKick - 0.016 * 2.2);
  viewmodel.position.set(
    Math.sin(walkCycle) * 0.008 * Math.min(1, speed / 5),
    Math.abs(Math.cos(walkCycle)) * 0.01 * Math.min(1, speed / 5),
    vmKick,
  );
}

// --- Frame loop: fixed steps, then one render. ---
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }
  const look = input.takeLook();
  if (state.phase === 'live' && input.locked) player.look(look.x, look.y);
  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;
  syncCamera();
  syncHitboxes();
  syncHud();
  renderer.render(scene, camera);
}

function syncHud() {
  const w = weapons.def();
  const s = weapons.state();
  hud.setHealth(player.body.hp);
  hud.setAmmo(s.mag, s.reserve, w.name.toUpperCase(), weapons.owned.grenades, s.reloading > 0);
  if (state.phase === 'live') hud.setTimer(state.roundTimer, 'live');
  else if (state.phase === 'buy') hud.setTimer(state.phaseTimer, 'buy');
  else if (state.phase === 'over') hud.setTimer(state.phaseTimer, 'over');
  else hud.setTimer(100, 'menu');
  hud.setScore(state.score.vanguard, state.score.wardens, state.round, state.money);
  hud.setCrosshair(weapons.spread(player.groundSpeed(), !player.body.onGround, player.body.crouched));
  if (state.phase === 'live') {
    if (state.bomb.state === 'planted') {
      hud.setBombBanner(`CHARGE PLANTED — SITE ${state.bomb.site} · ${Math.ceil(state.bomb.fuse)}s`, 'danger');
    } else if (state.flags.defusing) {
      hud.setBombBanner('WARDEN DEFUSING THE CHARGE!', 'danger');
    } else if (state.bomb.state === 'planting') {
      hud.setBombBanner('PLANTING THE CHARGE…', '');
    } else if (bomb.siteAt(player.body.position.x, player.body.position.z)) {
      const site = bomb.siteAt(player.body.position.x, player.body.position.z);
      hud.setBombBanner(`HOLD E TO PLANT AT SITE ${site.id} — ${site.name.toUpperCase()}`, '');
    } else {
      hud.setBombBanner('', '');
    }
    hud.setPlantProgress(state.bomb.state === 'planting' ? state.bomb.plantProgress : 0);
  }
}

// --- Overlay buttons and pointer lock. ---
function onPlay() {
  audio.unlock();
  if (shot) return;
  if (state.phase === 'menu') { startMatch(); return; }
  if (state.phase === 'match') { startMatch(); return; }
  if (state.phase === 'over') { nextRound(); return; }
  input.requestLock();
}

function onBuy(id) {
  if (state.phase !== 'buy') return;
  const result = economy.buy(id);
  if (result === 'ok') {
    audio.buy();
    setViewmodel(weapons.current);
    hud.showBuy(state.money, weapons.owned, weapons.current);
  } else {
    audio.deny();
  }
}

function onDeploy() {
  if (state.phase === 'buy') startRound();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    if (state.phase === 'live') hud.hideOverlay();
  } else if (state.phase === 'live') {
    hud.showPaused();
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Deterministic screenshot staging. ---
function aimAt(point) {
  const body = player.body;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncHitboxes();
    syncHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  startMatch();
  startRound();
  const body = player.body;
  if (name === 'menu') {
    state.phase = 'menu';
    body.position.set(0, 0, 15);
    body.yaw = 0;
    body.pitch = 0;
    settle(10);
    aimAt(new THREE.Vector3(0, 2, -8));
    hud.showMenu();
  } else if (name === 'combat') {
    body.position.set(-1, 0, 8);
    settle(15);
    // Stage two Wardens close ahead in the mid hall, mid-fight.
    const b0 = bots.list[0];
    const b1 = bots.list[1];
    b0.position.set(-2, 0, 3);
    b0.mode = 'combat';
    b0.lastSeen = { x: body.position.x, y: 1.3, z: body.position.z, t: 0 };
    b1.position.set(2.5, 0, 1);
    b1.mode = 'combat';
    b1.lastSeen = { x: body.position.x, y: 1.3, z: body.position.z, t: 0 };
    bots.list[2].position.set(-14, 0, 2);
    bots.list[3].position.set(14, 0, 0);
    for (const b of bots.list) { b.mesh.position.copy(b.position); }
    aimAt(new THREE.Vector3(-2, 1.4, 3));
    shoot();
    settle(6);
    aimAt(new THREE.Vector3(-2, 1.4, 3));
    shoot();
    settle(4);
  } else if (name === 'site') {
    body.position.set(-10, 0, -6);
    settle(10);
    // Plant the charge at Site A and let the Wardens converge on it.
    state.bomb.state = 'planted';
    state.bomb.site = 'A';
    state.bomb.fuse = 30;
    state.bomb.position.x = -16;
    state.bomb.position.y = 0.15;
    state.bomb.position.z = -12;
    const site = SITES[0];
    for (const b of bots.list) {
      b.mode = 'investigate';
      b.target = { x: site.x + (random() * 4 - 2), z: site.z + (random() * 4 - 2) };
    }
    settle(50);
    aimAt(new THREE.Vector3(-16, 1.2, -12));
  } else if (name === 'roundend') {
    // Win the round for real: shoot the nearest Warden down, then clear
    // the rest, so the stats panel shows genuine shots and hits.
    body.position.set(0, 0, 6);
    body.yaw = 0;
    const b0 = bots.list[0];
    b0.position.set(-2, 0, 2);
    b0.mesh.position.copy(b0.position);
    settle(5);
    // Re-aim at the Warden's live position before each shot: it strafes
    // once it spots the player, so a fixed aim point misses.
    for (let i = 0; i < 5; i += 1) {
      aimAt(new THREE.Vector3(b0.position.x, 1.4, b0.position.z));
      shoot();
      settle(7);
      if (!b0.alive) break;
    }
    for (const b of bots.list) if (b.alive) bots.damage(b, 1000, 'body');
    endRound('vanguard', 'All Wardens eliminated.');
    hud.showRoundEnd(state.roundResult, state.stats);
    settle(5);
    aimAt(new THREE.Vector3(0, 2, -8));
  }
  syncHud();
  hud.step(10); // clear any hitmarker / damage flash left by the staging
  player.body.hp = 100; // staged frame: full integrity, the fight already happened
  paintTwiceThenReady();
}

// --- Scripted playtest handle: state snapshot + direct control. ---
window.__fps = {
  snapshot() {
    return {
      phase: state.phase,
      round: state.round,
      score: { ...state.score },
      money: state.money,
      timer: state.phase === 'live' ? state.roundTimer : state.phaseTimer,
      hp: player.body.hp,
      alive: player.body.alive,
      playerPos: { x: player.body.position.x, z: player.body.position.z },
      weapon: weapons.current,
      mag: weapons.state().mag,
      reserve: weapons.state().reserve,
      grenades: weapons.owned.grenades,
      bots: bots.list.map((b) => ({
        name: b.name, hp: b.hp, alive: b.alive, mode: b.mode,
        x: +b.position.x.toFixed(2), z: +b.position.z.toFixed(2),
      })),
      bomb: { ...state.bomb },
      stats: { ...state.stats },
      heard: state.heard.length,
    };
  },
  step(n) { for (let i = 0; i < (n || 1); i += 1) step(FIXED_STEP); },
  startMatch, startRound, nextRound,
  buy(id) { return economy.buy(id); },
  deploy() { if (state.phase === 'buy') startRound(); },
  aimAt(x, y, z) { aimAt(new THREE.Vector3(x, y, z)); },
  teleport(x, z) { player.body.position.set(x, 0, z); player.body.velocity.set(0, 0, 0); },
  setYaw(yaw, pitch) { player.body.yaw = yaw; player.body.pitch = pitch || 0; },
  fire() { shoot(); },
  reload() { return weapons.reload(); },
  switchTo(id) { const ok = weapons.switchTo(id); if (ok) setViewmodel(id); return ok; },
  throwGrenade() {
    if (weapons.owned.grenades <= 0) return false;
    weapons.owned.grenades -= 1;
    camera.getWorldDirection(_dir);
    const from = camera.position.clone().addScaledVector(_dir, 0.5);
    grenades.throwGrenade(from, _dir);
    return true;
  },
  // Diagnostic: run the shot raycast without consuming ammo and report
  // what it would hit (camera direction, hit part/bot, distance).
  probeShot() {
    camera.getWorldDirection(_dir);
    raycaster.set(camera.position, _dir);
    raycaster.far = weapons.def().range;
    scene.updateMatrixWorld(true); // same staleness rule as shoot()
    const targets = world.shootables.concat(bots.hitMeshes());
    const hit = raycaster.intersectObjects(targets, false)[0];
    return {
      camPos: { x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2) },
      camDir: { x: +_dir.x.toFixed(3), y: +_dir.y.toFixed(3), z: +_dir.z.toFixed(3) },
      yaw: +player.body.yaw.toFixed(3),
      pitch: +player.body.pitch.toFixed(3),
      hit: hit ? { part: hit.object.userData.part || 'wall', bot: hit.object.userData.bot ? hit.object.userData.bot.name : null, dist: +hit.distance.toFixed(2) } : null,
    };
  },
  plantNow() {
    const site = bomb.siteAt(player.body.position.x, player.body.position.z);
    if (!site) return false;
    state.bomb.state = 'planted';
    state.bomb.site = site.id;
    state.bomb.fuse = 35;
    state.bomb.position.x = player.body.position.x;
    state.bomb.position.y = 0.15;
    state.bomb.position.z = player.body.position.z;
    bombHooks().onPlanted(site.id);
    return true;
  },
  damagePlayer(n) { return player.damage(n); },
  damageBot(i, n, part) { return bots.damage(bots.list[i], n, part || 'body'); },
  killBot(i) { const b = bots.list[i]; const k = bots.damage(b, 1000, 'body'); if (k) onBotKilled(b, 'debug'); return k; },
  setMoney(n) { state.money = n; },
  setBotPos(i, x, z) { const b = bots.list[i]; b.position.set(x, 0, z); b.mesh.position.copy(b.position); },
  setBotMode(i, mode) { bots.list[i].mode = mode; },
  press(code) { input.pressed.add(code); input.keys.add(code); },
  release(code) { input.keys.delete(code); },
  state,
  player: player.body,
  bots: bots.list,
  weapons,
};

syncCamera();
if (shot) runShot(shot);
else {
  hud.showMenu();
  requestAnimationFrame(frame);
}
