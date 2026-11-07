// Central tuning knobs. Everything gameplay-related that is worth tweaking lives here.
export const CFG = {
  chunkSize: 24,          // metres per terrain chunk
  chunkSegments: 8,       // grid cells per chunk edge (keep low for Quest)
  loadRadius: 2,          // chunks loaded around the player in each direction (indoors, fog hides the rest)
  fogDensity: 0.042,      // exp2 fog, ~60 m visibility
  hillHeight: 5,          // terrain amplitude
  safeRadius: 13,         // radius of the safe zone around the spawn
  monsterKeepOut: 17,     // monsters never come closer than this to spawn
  playerMaxSpeed: 6.5,    // m/s, cap on arm-push velocity
  monsterRoamSpeed: 3.2,
  monsterHuntSpeed: 8.2,  // a little faster than the player: a straight sprint will not save you
  monsterScale: 1.55,     // bigger than the player
  monsterSightRange: 48,
  monsterCatchDist: 1.45,
  baseMonsters: 2,        // monsters = base + players
  gravity: 9.81,
  deathSeconds: 3.4,
  netRate: 15,            // state updates per second
};

export const PLAYER_COLORS = [
  0x9aa0a6, 0x3f3f46, 0xd9c9b2, 0x7c5c3e, 0xc0392b, 0xe67e22, 0xf1c40f, 0x2ecc71,
  0x1abc9c, 0x3498db, 0x9b59b6, 0xff7eb9, 0xffffff, 0x111111, 0x6b8e23, 0x00bcd4,
];
