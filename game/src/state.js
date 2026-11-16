// The one central state object. Every module reads or mutates this single object;
// no module keeps its own copy of round, phase, money or the bomb. Plain data only
// (no THREE objects here) so the debug handle can snapshot it as JSON.
export function createState() {
  return {
    // Match flow: 'menu' | 'buy' | 'live' | 'over' | 'match'
    phase: 'menu',
    phaseTimer: 0, // seconds left in the current phase
    round: 1,
    roundsToWin: 7,
    score: { vanguard: 0, wardens: 0 },
    roundResult: null, // { winner: 'vanguard'|'wardens', reason: string }
    matchWinner: null,
    roundTimer: 100, // seconds left in a live round
    money: 800,
    killsThisRound: 0,
    // Bomb / charge objective.
    bomb: {
      state: 'carried', // 'carried' | 'planting' | 'planted' | 'defusing' | 'defused' | 'exploded'
      site: null, // 'A' | 'B'
      plantProgress: 0, // 0..1 while planting
      defuseProgress: 0, // 0..1 while a bot defuses
      fuse: 0, // seconds left once planted
      position: { x: 0, y: 0, z: 0 },
    },
    // Sound events the bots can hear: { kind: 'shot'|'step'|'explosion', x, z, radius }
    heard: [],
    // Kill feed entries: { text, good } newest last, capped by the HUD.
    feed: [],
    // Round statistics for the end-of-round panel.
    stats: { shots: 0, hits: 0, headshots: 0, kills: 0, damage: 0 },
    // Flags the HUD reads each frame.
    flags: {
      planting: false, // player is holding the plant key inside a site
      defusing: false, // a bot is defusing right now
      playerDead: false,
      lowAmmo: false,
    },
  };
}

// Reset the per-round fields when a new round starts. Money, score and round
// number survive; everything a round owns is rebuilt.
export function resetRoundState(state) {
  state.bomb.state = 'carried';
  state.bomb.site = null;
  state.bomb.plantProgress = 0;
  state.bomb.defuseProgress = 0;
  state.bomb.fuse = 0;
  state.roundTimer = 100;
  state.killsThisRound = 0;
  state.roundResult = null;
  state.heard.length = 0;
  state.feed.length = 0;
  state.flags.planting = false;
  state.flags.defusing = false;
  state.flags.playerDead = false;
}
