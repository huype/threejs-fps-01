// SUNDERLINE — palette and team identity.
// One chosen palette for the whole game: a dusk-lit foundry. Amber is the Vanguard
// (attacker) accent, teal the Warden (defender) accent, hazard yellow marks the two
// charge sites. Every material and HUD colour below comes from these six entries.
export const PALETTE = {
  canvas: 0x171c22, // sky / fog / page background
  surface: 0x232a31, // wall faces
  floor: 0x33383e, // foundry floor
  hairline: 0x454b52, // crates, trim, dark metal
  ink: 0xe9e4d6, // warm off-white: light, text, tracers
  muted: 0x8b939c, // cool grey: secondary text, fill light
  accent: 0xe8a33d, // Vanguard amber
  warden: 0x3fa7a0, // Warden teal
  hazard: 0xd8b13c, // site markings
  danger: 0xc23b2e, // damage, explosion, round loss
};

// Team names and colours, used by the HUD, the buy menu and the bot meshes.
export const TEAMS = {
  vanguard: { name: 'Vanguard', color: PALETTE.accent, css: '#e8a33d' },
  wardens: { name: 'Wardens', color: PALETTE.warden, css: '#3fa7a0' },
};

// Weapon slot colours for the HUD ammo readout.
export const SLOT_COLORS = { primary: '#e8a33d', sidearm: '#e9e4d6', grenade: '#d8b13c' };
