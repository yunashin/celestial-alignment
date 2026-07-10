export type Element = "FIRE" | "WATER" | "EARTH" | "AIR";
export type Dir = "top" | "right" | "bottom" | "left";
export type Sign =
  | "ARIES" | "LEO" | "SAGITTARIUS"
  | "CANCER" | "SCORPIO" | "PISCES"
  | "GEMINI" | "LIBRA" | "AQUARIUS"
  | "TAURUS" | "VIRGO" | "CAPRICORN";

export interface Connections {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

export interface StarCard {
  id: string;
  element: Element;
  connections: Connections;
}

export interface EclipseCard {
  id: string;
  type: "CORRUPTION" | "VOID" | "SURGE" | "DAMAGE";
  element?: Element;
  amount?: number;
  // DAMAGE-only fields — see DAMAGE_CARDS in constants.ts, the source these are copied from when
  // buildEclipseDeck adds a DAMAGE card to the deck. `damageMessage` holds an i18n translation KEY
  // (e.g. "damageCards.fire"), NOT resolved flavor text — resolveEclipse (eclipse.ts) calls t() on
  // it at the moment the log message is actually built, so it always reflects whatever locale is
  // active when the card resolves, not whichever was active when the deck was built. It also does
  // NOT include the "🌑 Eclipse:" prefix every log line gets — that's applied once at the log call
  // site, not baked into every card's stored message/key.
  damageElements?: Element[];
  damageMessage?: string;
  damageHpLost?: number;
}

/** The metadata a DAMAGE-type EclipseCard is built from — see DAMAGE_CARDS in constants.ts.
 * `messageKey` is a dot-path into en.yaml/ko.yaml's `damageCards` section (resolved via t() at
 * resolveEclipse time, not here), not literal text. */
export interface DamageCardMeta {
  messageKey: string;
  elements: Element[];
  hpLost: number;
}

export interface Point {
  x: number;
  y: number;
}

export type PowerUp = "TRACKER_DOWN" | "BONUS_AP" | "BONUS_HAND" | "HEAL_UNLOCK";

export interface Tile extends Point {
  card: StarCard | null;
  isCorrupted: boolean;
  isLocked: boolean;
  isAsteroid: boolean;
  isVoid: boolean;
  node: Element | null;
  isCenter: boolean;
  isShielded: boolean;
  shieldOwner: number | null;
  isShootingStar: boolean;
  powerUp: PowerUp | null;
  powerUpFlash: boolean;
  asteroidHitStep: number | null;
  explosionStep: number | null;
  isEnclosed: boolean;
  isPurified: boolean;
  // Who placed the card currently on this tile (if any) — set on every PLACE, regardless of
  // whether the card ever gets corrupted. Needed so a later corruption-decay countdown can tick
  // down specifically on ITS OWN placer's turns, not just any global turn.
  placedBy: number | null;
  // Set the moment Eclipse Corruption seizes this tile's card; decremented only when control
  // returns to `placedBy`'s own turn (see reducer.ts's END_TURN case), and the card is destroyed
  // when it reaches 0. `null` whenever the tile isn't currently corrupted.
  corruptionTurnsLeft: number | null;
  // Set to `s.turn` the instant a corrupted card is destroyed by decay (never cleared afterward,
  // same one-shot-animation-on-value-change pattern as asteroidHitStep/explosionStep — see
  // TileView's crumble overlay). `s.turn` only ever increases, so a later crumble on the same tile
  // (a fresh card placed, corrupted, and left to decay again) always gets a distinct value and
  // replays the animation. `null` whenever this tile has never had a card crumble away.
  crumbleStep: number | null;
}

export interface Player {
  id: number;
  name: string;
  sign: Sign;
  element: Element;
  hp: number;
  maxHp: number;
  position: Point;
  isStasis: boolean;
  hand: StarCard[];
  visited: Record<string, true>;
}

export type UiMode = "move" | "place" | "discard" | "purify" | "virgoShield" | "scorpioHeal" | null;

export interface NodeInfo extends Point {
  dir: Dir;
}

export interface GameState {
  phase: "setup" | "playing" | "won" | "lost";
  seed: string;
  tiles: Tile[][];
  center: Point;
  nodes: Record<Element, NodeInfo>;
  players: Player[];
  active: number;
  ap: number;
  starDeck: StarCard[];
  starDiscard: StarCard[];
  eclipseDeck: EclipseCard[];
  eclipseDiscard: EclipseCard[];
  tracker: number;
  turn: number;
  log: string[];
  messageLog: string[];
  messageSeq: number;
  ariesUsed: boolean;
  libraUsed: boolean;
  taurusPurifyUsed: boolean;
  scorpioUsed: boolean;
  virgoShieldCooldown: number;
  turnsUntilAsteroidShift: number;
  lossReason: string | null;
  lastActedPlayerId: number | null;
  apBonus: number;
  handSizeBonus: number;
  // Once true (set permanently by the HEAL_UNLOCK shooting star, never cleared), every Guardian may
  // restore 1 HP by ending a turn in which they took no other action while below full HP — see
  // reducer.ts's END_TURN case and `actedThisTurn` below.
  selfHealUnlocked: boolean;
  // Whether the active player has dispatched any action (other than END_TURN itself) since their
  // turn started — reset to false the moment a new player becomes active. Drives the HEAL_UNLOCK
  // self-heal check above; a failed/invalid action never sets this because invalid dispatches return
  // the original, pre-clone state (see gameReducer's own doc comment on this pattern).
  actedThisTurn: boolean;
  selfHealSeq: number;
  lastSelfHealEvent: { playerId: number } | null;
  shootingStarSeq: number;
  lastShootingStarEvent: { type: PowerUp; seq: number } | null;
  eclipseEventSeq: number;
  lastEclipseEvent: { kind: "CORRUPTION" | "VOID" | "SURGE" | "DAMAGE"; x: number | null; y: number | null } | null;
  asteroidEventSeq: number;
  lastAsteroidDestroyedTiles: Point[];
  starDeckShuffleSeq: number;
  eclipseDeckShuffleSeq: number;
  shieldBlockSeq: number;
  lastShieldBlock: { playerId: number; kind: "CANCER" | "VIRGO" } | null;
  discardEventSeq: number;
  chainEventSeq: number;
  lastChainEvent: { tiles: string[]; start: Point; end: Point } | null;
  surgeEventSeq: number;
  lastSurgeEvent: { x: number; y: number; element: Element } | null;
}

export interface PlayerSetup {
  name: string;
  sign: Sign;
}

export type GameAction =
  | { type: "START_GAME"; setup: PlayerSetup[]; seed?: string }
  | { type: "RESET" }
  | { type: "MOVE"; x: number; y: number }
  | { type: "PLACE"; handIndex: number; x: number; y: number; rotation?: number }
  | { type: "PURIFY"; x: number; y: number }
  | { type: "VIRGO_SHIELD"; x: number; y: number }
  | { type: "SCORPIO_HEAL"; handIndex: number; targetId: number }
  | { type: "CONVERT_HAND_EARTH" }
  | { type: "DISCARD"; indices: number[] }
  | { type: "END_TURN" };
