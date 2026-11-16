// The HUD: health, ammo, timer, score, money, kill feed, bomb status and the
// three overlays (menu, buy, round end). All DOM writes go through here so
// main.js never touches an element id. Values are only written when they
// change, so the HUD costs nothing on a quiet frame.
import { catalogue } from './economy.js';

export function createHud(callbacks) {
  const el = {};
  for (const id of [
    'hud', 'crosshair', 'hitmarker', 'health-num', 'health-bar', 'ammo', 'ammo-mag',
    'ammo-reserve', 'ammo-name', 'grenades', 'timer', 'score-v', 'score-w',
    'round-num', 'money', 'feed', 'bomb-banner', 'bomb-text', 'plant-bar',
    'plant-fill', 'damage', 'overlay', 'overlay-title', 'overlay-copy',
    'overlay-extra', 'play', 'buy-panel', 'buy-items', 'buy-money',
    'buy-deploy', 'buy-loadout', 'round-result',
  ]) el[id] = document.getElementById(id);

  const last = { health: -1, mag: -1, reserve: -1, timer: -1, money: -1, sv: -1, sw: -1, round: -1 };
  let hitTimer = 0;
  let damageTimer = 0;

  function setHealth(hp) {
    const v = Math.round(hp);
    if (v === last.health) return;
    last.health = v;
    el['health-num'].textContent = String(v);
    el['health-bar'].style.width = `${v}%`;
    el['health-bar'].style.background = v > 50 ? '#e8a33d' : v > 25 ? '#d8b13c' : '#c23b2e';
  }

  function setAmmo(mag, reserve, name, grenadeCount, reloading) {
    if (mag !== last.mag || reserve !== last.reserve) {
      last.mag = mag;
      last.reserve = reserve;
      el['ammo-mag'].textContent = reloading ? '--' : String(mag);
      el['ammo-reserve'].textContent = `/ ${reserve}`;
      el['ammo-name'].textContent = name;
      el.ammo.classList.toggle('empty', mag === 0);
    }
    el.grenades.textContent = grenadeCount > 0 ? `◈ ${grenadeCount}` : '';
  }

  function setTimer(seconds, phase) {
    const v = Math.max(0, Math.ceil(seconds));
    if (v === last.timer) return;
    last.timer = v;
    const m = Math.floor(v / 60);
    const s = String(v % 60).padStart(2, '0');
    el.timer.textContent = `${m}:${s}`;
    el.timer.classList.toggle('urgent', phase === 'live' && v <= 15);
  }

  function setScore(vanguard, wardens, round, money) {
    if (vanguard !== last.sv || wardens !== last.sw) {
      last.sv = vanguard;
      last.sw = wardens;
      el['score-v'].textContent = String(vanguard);
      el['score-w'].textContent = String(wardens);
    }
    if (round !== last.round) {
      last.round = round;
      el['round-num'].textContent = `ROUND ${round}`;
    }
    if (money !== last.money) {
      last.money = money;
      el.money.textContent = `$${money}`;
      el['buy-money'].textContent = `$${money}`;
    }
  }

  function setCrosshair(spread) {
    // Spread in radians -> pixel gap; clamped so the crosshair stays readable.
    const gap = Math.round(4 + Math.min(26, spread * 900));
    el.crosshair.style.setProperty('--gap', `${gap}px`);
  }

  function hitMarker(kill) {
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('kill', kill);
    hitTimer = kill ? 0.3 : 0.14;
  }

  function damageFlash() {
    el.damage.classList.add('on');
    damageTimer = 0.35;
  }

  function feed(text, good) {
    const div = document.createElement('div');
    div.className = good ? 'feed-good' : 'feed-bad';
    div.textContent = text;
    el.feed.appendChild(div);
    while (el.feed.children.length > 4) el.feed.removeChild(el.feed.firstChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
  }

  function setBombBanner(text, tone) {
    if (text) {
      el['bomb-banner'].hidden = false;
      el['bomb-text'].textContent = text;
      el['bomb-banner'].dataset.tone = tone || '';
    } else {
      el['bomb-banner'].hidden = true;
    }
  }

  function setPlantProgress(progress) {
    if (progress > 0) {
      el['plant-bar'].hidden = false;
      el['plant-fill'].style.width = `${Math.round(progress * 100)}%`;
    } else {
      el['plant-bar'].hidden = true;
    }
  }

  function hideOverlay() {
    el.overlay.hidden = true;
    el['buy-panel'].hidden = true;
  }

  function showMenu() {
    el.overlay.hidden = false;
    el['buy-panel'].hidden = true;
    el['overlay-title'].textContent = 'SUNDERLINE';
    el['overlay-copy'].textContent =
      'Round-based tactical FPS in the Kestrel Foundry. Vanguard attacks: plant the charge at Furnace or Crucible, or eliminate all four Wardens. Earn money, buy better guns between rounds. First to 7 rounds takes the match.';
    el.play.textContent = 'Click to play';
    el['overlay-extra'].textContent = '';
    el['round-result'].textContent = '';
  }

  function showPaused() {
    el.overlay.hidden = false;
    el['buy-panel'].hidden = true;
    el['overlay-title'].textContent = 'Paused';
    el['overlay-copy'].textContent = 'Pointer released. Click to take aim again.';
    el.play.textContent = 'Resume';
    el['overlay-extra'].textContent = '';
  }

  function showRoundEnd(result, stats) {
    el.overlay.hidden = false;
    el['buy-panel'].hidden = true;
    const won = result.winner === 'vanguard';
    el['overlay-title'].textContent = won ? 'Round won' : 'Round lost';
    el['overlay-copy'].textContent = result.reason;
    el.play.textContent = 'Next round';
    el['round-result'].textContent =
      `Shots ${stats.shots} · Hits ${stats.hits} · Kills ${stats.kills} · Damage ${stats.damage}`;
    el['overlay-extra'].textContent = won ? 'Vanguard takes the round.' : 'Wardens hold the foundry.';
  }

  function showMatch(winner) {
    el.overlay.hidden = false;
    el['buy-panel'].hidden = true;
    el['overlay-title'].textContent = winner === 'vanguard' ? 'Vanguard wins the match' : 'Wardens win the match';
    el['overlay-copy'].textContent = 'First to 7 rounds. The foundry resets — same map, same charge, new money.';
    el.play.textContent = 'Play again';
    el['round-result'].textContent = '';
    el['overlay-extra'].textContent = '';
  }

  function showBuy(money, owned, current) {
    el.overlay.hidden = true;
    el['buy-panel'].hidden = false;
    el['buy-money'].textContent = `$${money}`;
    el['buy-loadout'].textContent =
      `Loadout: ${owned.primary.toUpperCase()} + P9 · Grenades: ${owned.grenades} · In hand: ${current.toUpperCase()}`;
    el['buy-items'].innerHTML = '';
    for (const item of catalogue()) {
      const ownedNow = (item.kind === 'primary' && owned.primary === item.id) ||
        (item.kind === 'grenade' && owned.grenades >= 2);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'buy-item';
      button.disabled = ownedNow || money < item.price;
      button.innerHTML = `<b>${item.name}</b><span>${item.desc}</span><i>$${item.price}${ownedNow ? ' · OWNED' : ''}</i>`;
      button.addEventListener('click', () => callbacks.onBuy(item.id));
      el['buy-items'].appendChild(button);
    }
  }

  function step(dt) {
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) el.hitmarker.classList.remove('on', 'kill');
    }
    if (damageTimer > 0) {
      damageTimer -= dt;
      if (damageTimer <= 0) el.damage.classList.remove('on');
    }
  }

  el.play.addEventListener('click', () => callbacks.onPlay());
  el['buy-deploy'].addEventListener('click', () => callbacks.onDeploy());

  return {
    setHealth, setAmmo, setTimer, setScore, setCrosshair, hitMarker,
    damageFlash, feed, setBombBanner, setPlantProgress, hideOverlay,
    showMenu, showPaused, showRoundEnd, showMatch, showBuy, step,
  };
}
