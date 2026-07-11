import type { Connections, DamageCardMeta, Dir, Element, PowerUp, Sign } from "./types";
import { hexToRgba } from "./utils/colors";

// ============================================================================
// DIFFICULTY / BALANCE TUNING
// Every constant in this block directly affects how hard, how fast, or how forgiving a game feels.
// They're grouped here (rather than scattered near whichever engine file happens to consume them)
// specifically so you can tweak the whole difficulty curve from one place, run a few games, and
// iterate — nothing here has structural dependencies on the board-shape/visual constants further
// down this file. Deliberately NOT included: individual sign abilities (Scorpio's heal-1, Virgo's
// shield cooldown, Purify/Discard's base AP cost, etc.) — those are per-character balance, not
// overall pacing, and are easy to find inline in SIGNS/reducer.ts if you want to touch them too.
// ============================================================================

// -- Guardian economy: how much HP/AP/hand size a player starts (and stays refilled) with --
export const STARTING_HP = 3;
export const MAX_HP = STARTING_HP;
export const STARTING_AP = 3;
export const DEFAULT_HAND_SIZE = 4;
export const MAX_HAND_SIZE = DEFAULT_HAND_SIZE + 2;

// -- Eclipse Tracker pacing: the deck composition and per-card effect sizes that drive how fast
// the tracker climbs toward the 100% loss condition --
// How many Corruption cards exist PER ELEMENT (so total Corruption cards = this × 4 elements) and
// how many Void (Black Hole) cards exist in the Eclipse deck — raising either makes hazards more frequent.
export const ECLIPSE_CORRUPTION_PER_ELEMENT = 3;
export const ECLIPSE_VOID_COUNT = 6;
// Increases the tracker by this amount when a Corruption card is drawn
export const ECLIPSE_CORRUPTION_TRACKER_BUMP = 3;
// Increases the tracker by this amount when a Black Hole card is drawn
export const ECLIPSE_VOID_TRACKER_BUMP = 3;
// Each Surge card's base tracker-bump amount (before the 4-player scale-down and corruption
// scaling below apply) — one card is dealt per entry, so this also implicitly sets the Surge card
// count (6 here). Add/remove entries to change how many Surge cards are in the deck.
export const
  ECLIPSE_SURGE_AMOUNTS = {
    2: [10, 10, 15, 15, 15, 20, 20, 20, 25],
    3: [10, 10, 10, 15, 15, 15, 20, 20, 20],
    4: [10, 10, 10, 10, 15, 15, 15, 15, 20],
  };
// A Corruption/Void card that finds no legal target is a "wasted" card — it still nudges the
// tracker up so the deck can't stall forever, but softer than a real hit (this number gets added to
// the tracker when no corruption targets are found).
export const ECLIPSE_NO_TARGET_TRACKER_BUMP = 10;
// Eclipse Surge's tracker bump scales with existing corruption on the board (`amount + SCALING *
// corruptedTileCount`) — the higher the value, the more a heavily-corrupted board makes Surge
// cards snowball the tracker.
export const ECLIPSE_SURGE_CORRUPTION_SCALING = 2;
// 4-player games need 4 separate completed paths to win — the same race against the Eclipse
// Tracker otherwise gets meaningfully harder with more players, so 4-player mode gets two specific
// breaks: completing any path knocks a chunk off the tracker, and every Eclipse card's tracker
// effect (Corruption/Void's "wasted card" bump, Surge's amount) is scaled down.
export const PATH_COMPLETE_TRACKER_REDUCTION_4P = 0;
export const ECLIPSE_EFFECT_SCALE_4P = 0.8; // 20% reduction

// How many DAMAGE cards buildEclipseDeck randomly adds to the deck (sampled WITH replacement from
// DAMAGE_CARDS below, so a small pool can still fill a larger count, and duplicates are fine — a
// deck can hold more than one copy of the same card). In a 2-3 player game, cards whose `elements`
// don't overlap any active player's element are filtered out of the sampling pool first, since a
// card that can never find a victim would just be a wasted draw.
export const ECLIPSE_DAMAGE_CARD_COUNT = 5;
// Eclipse cards that directly damage every living Guardian of specific element(s), rather than
// corrupting a card or seizing a tile by chance. `messageKey` points at the card's own flavor line
// in en.yaml/ko.yaml's `damageCards` section (resolved via t() at resolveEclipse time — see
// DamageCardMeta's own doc comment in types.ts for why it's a key, not literal text here) — the
// "🌑 Eclipse:" prefix every log line gets is applied once at the log call site, not baked into
// each card. Freely edit/replace/add entries (and their matching en.yaml/ko.yaml text); nothing
// else needs to change as long as each keeps this shape.
export const DAMAGE_CARDS: DamageCardMeta[] = [
  { messageKey: "damageCards.fire", elements: ["FIRE"], hpLost: 1 },
  { messageKey: "damageCards.water", elements: ["WATER"], hpLost: 1 },
  { messageKey: "damageCards.earth", elements: ["EARTH"], hpLost: 1 },
  { messageKey: "damageCards.air", elements: ["AIR"], hpLost: 1 },
  { messageKey: "damageCards.all", elements: ["FIRE", "WATER", "EARTH", "AIR"], hpLost: 1 }
];

// -- Hazard damage: how much HP a Guardian loses per hit from Corruption, Void (Black Hole) gravity, or the
// traveling asteroid. Raising this makes Stasis (and thus the all-Stasis loss condition) loom
// faster; lowering it makes the board feel safer to wander. --
export const HAZARD_DAMAGE = 1;

// -- Corruption decay: how long a seized card survives before it's destroyed outright --
// How many of its OWN placer's turns a corrupted Star Card survives before it's destroyed outright
// — ticks down only when control returns to whichever player originally placed that specific card
// (see Tile.placedBy/corruptionTurnsLeft and END_TURN's decay sweep in reducer.ts), not on every
// global turn.
export const CORRUPTION_DECAY_TURNS = 3;

// -- Chain discount: reward for connecting several same-element cards in a row --
// A connected run of this many SAME-element Star Cards eases the Eclipse Tracker on the placement
// that first reaches it — double the discount if that element is the placing player's own element.
export const CHAIN_LENGTH_THRESHOLD = 3;
export const CHAIN_TRACKER_DISCOUNT = 2;
export const CHAIN_TRACKER_DISCOUNT_OWN = 4;
export const CHAIN_TRACKER_BONUS_DISCOUNT = 2;

// -- Asteroid cadence: how many hazard tiles start on the board and how often the traveling
// asteroid relocates (lower interval = more frequent, more disruptive shifts) --
export const ASTEROID_COUNT = 14;
// Previously a random 4-6 turn window regardless of player count; hardcoded per player count so
// asteroid pressure scales predictably with game length instead of swinging randomly.
export const ASTEROID_SHIFT_INTERVAL: Record<number, number> = { 2: 4, 3: 5, 4: 6 };

// -- Shooting stars: how many power-up tiles spawn, how far apart, and how strong their payoffs
// are once activated --
// One star per board quadrant (relative to the Orrery) — see engine/board.ts's placeShootingStars.
export const SHOOTING_STAR_COUNT = 4;
export const SHOOTING_STAR_MIN_SPACING = 3;
// Kept away from the central cross of nodes/paths, in tiles, on each axis.
export const SHOOTING_STAR_CENTER_MARGIN = 2;
// No shooting star may spawn within this many tiles (Manhattan) of ANY element node.
export const SHOOTING_STAR_NODE_MARGIN = 2;
// For whichever element node(s) share a shooting star's own quadrant, the detour distance
// node -> star -> Orrery (Manhattan) must fall in this range — a geometric proxy for "a worthwhile
// side-trip," not a razor-thin sliver right next to the direct route and not a wasted trek across
// the whole board either. Falls back to relaxing this constraint (see placeShootingStars) on the
// rare board layout where no eligible tile in a quadrant satisfies it for every node sharing it.
export const SHOOTING_STAR_NODE_PATH_MIN = 12;
export const SHOOTING_STAR_NODE_PATH_MAX = 15;
export const SHOOTING_STAR_TRACKER_DOWN_PCT = 20;
export const SHOOTING_STAR_AP_BONUS = 1;
export const SHOOTING_STAR_HAND_BONUS = 1;
export const SHOOTING_STAR_SELF_HEAL_AMOUNT = 1;
// In a 2-3 player game, shooting stars landing in an ACTIVE player's own quadrant (i.e. the
// quadrant containing that player's element node) preferentially receive these power-up types, in
// this order, before any leftover types (including HEAL_UNLOCK) get shuffled into the remaining
// stars — see assignShootingStarPowerUps in engine/board.ts. Reorder this list to change the
// priority; a 4-player game always uses every element (no "off" quadrant to avoid), so it skips
// this prioritization entirely and shuffles all 4 types freely.
export const SHOOTING_STAR_POWER_UP_PRIORITY: PowerUp[] = ["BONUS_AP", "TRACKER_DOWN", "BONUS_HAND"];

// ============================================================================
// BOARD SHAPE, VISUALS, AND SIGN/CARD CONTENT — structural constants below this line don't affect
// difficulty pacing, just the board's shape/layout and each sign's flavor/visuals.
// ============================================================================

export const WIDTH = 19;
export const HEIGHT = 11;
// The Orrery spawns somewhere within this zone, centered on the board's true center.
export const CENTER_ZONE_WIDTH = 7;
export const CENTER_ZONE_HEIGHT = 5;
// Every pair of edge nodes must be at least this Manhattan distance apart — AIR/EARTH (opposite
// rows) and WATER/FIRE (opposite columns) are always far apart structurally, but adjacent-edge
// pairs (e.g. AIR/WATER, which share the (0,0) corner) can otherwise land uncomfortably close, or
// even on the exact same tile.
export const MIN_NODE_SEPARATION = 4;
export const ELEMENTS: Element[] = ["AIR", "FIRE", "EARTH", "WATER"];

// Single source of truth for each element's color — change a value here and every consumer
// (ELEMENT_META below, card glyphs, node/path glow, chain highlighting, edge labels, etc.) picks
// it up automatically. Water is deliberately pushed toward a more saturated, deeper "true blue"
// (rather than the old #5eb3ff sky-blue) since that read too similarly to Air's own pale
// blue-gray (#e2e8f0) at a glance, especially once either gets lightened/blended (e.g. the win
// glow's lerp toward Orrery white).
export const AIR_COLOR = "#e2e8f0";
export const FIRE_COLOR = "#ff00ff";
export const EARTH_COLOR = "#3dd68c";
export const WATER_COLOR = "#0095ff";

// `soft` (a low-alpha wash used for node/tile backgrounds) is derived from the same hex constant
// as `color` rather than a separately hand-typed rgba string, so the two can never drift apart.
const ELEMENT_SOFT_ALPHA = 0.12;

// Structural/visual metadata only — the translatable `label`/`description` text lives in
// en.yaml/ko.yaml under `elements.<ELEMENT>` instead (see src/i18n/gameText.ts's elementLabel/
// elementDescription helpers), not here, so it can vary by locale.
export const ELEMENT_META: Record<Element, { color: string; soft: string; glyph: string }> = {
  AIR: {
    color: AIR_COLOR,
    soft: hexToRgba(AIR_COLOR, ELEMENT_SOFT_ALPHA),
    glyph: "\u{1F4A8}"
  },
  FIRE: {
    color: FIRE_COLOR,
    soft: hexToRgba(FIRE_COLOR, ELEMENT_SOFT_ALPHA),
    glyph: "\u{1F525}"
  },
  EARTH: {
    color: EARTH_COLOR,
    soft: hexToRgba(EARTH_COLOR, ELEMENT_SOFT_ALPHA),
    glyph: "⛰️"
  },
  WATER: {
    color: WATER_COLOR,
    soft: hexToRgba(WATER_COLOR, ELEMENT_SOFT_ALPHA),
    glyph: "\u{1F4A7}"
  }
};

export const ORRERY_WHITE = "#f1eeff";

export const BODY_FONT_SIZE = '14px';

// Which edge each element's node lives on, and which direction leads back toward the Orrery.
// The exact position along that edge is randomized per game — see engine/board.ts's makeBoard.
export const NODE_EDGE: Record<Element, Dir> = {
  AIR: "bottom", // top edge, facing down into the board
  EARTH: "top", // bottom edge, facing up into the board
  FIRE: "left", // right edge, facing left into the board
  WATER: "right" // left edge, facing right into the board
};

export const DIRS: Record<Dir, [number, number]> = {
  top: [-1, 0],
  right: [0, 1],
  bottom: [1, 0],
  left: [0, -1]
};

export const OPP: Record<Dir, Dir> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left"
};

export const DIR_KEYS: Dir[] = ["top", "right", "bottom", "left"];

// Structural metadata only — the translatable `label`/`ability`/`desc` text lives in
// en.yaml/ko.yaml under `signs.<SIGN>` instead (see src/i18n/gameText.ts's signLabel/signAbility/
// signDesc helpers), not here, so it can vary by locale. `impl` is a dev-facing implementation-
// status marker, never shown to players, so it stays here rather than in the translation files.
export const SIGNS: Record<Sign, { glyph: string; element: Element; impl: "full" | "simplified" | "stub" }> = {
  AQUARIUS: { glyph: "♒", element: "AIR", impl: "full" },
  GEMINI: { glyph: "♊", element: "AIR", impl: "full" },
  LIBRA: { glyph: "♎", element: "AIR", impl: "full" },
  ARIES: { glyph: "♈", element: "FIRE", impl: "full" },
  LEO: { glyph: "♌", element: "FIRE", impl: "full" },
  SAGITTARIUS: { glyph: "♐", element: "FIRE", impl: "full" },
  CAPRICORN: { glyph: "♑", element: "EARTH", impl: "full" },
  TAURUS: { glyph: "♉", element: "EARTH", impl: "full" },
  VIRGO: { glyph: "♍", element: "EARTH", impl: "full" },
  CANCER: { glyph: "♋", element: "WATER", impl: "full" },
  PISCES: { glyph: "♓", element: "WATER", impl: "full" },
  SCORPIO: { glyph: "♏", element: "WATER", impl: "full" }
};

// # of turns that Lunar Shield lasts after Cancer places a Water card on the board
// The turn the Water Card is played counts as 1 turn
// If changing the value, be sure to update "signs.CANCER.desc" in YAML files as well
export const CANCER_SHIELD_TURN_LIMIT = 2;

// SURGE_META and POWER_UP_META (the per-element Surge blurb and per-power-up payoff blurb) have
// moved entirely into en.yaml/ko.yaml (`surge.<ELEMENT>` / `powerUps.<POWERUP>`) — see
// src/i18n/gameText.ts's surgeText/powerUpText helpers, the latter of which also folds in the
// SHOOTING_STAR_*/STARTING_HP numeric constants below via t()'s interpolation params.

export const SHAPE_STRAIGHT_H: Connections = { top: false, right: true, bottom: false, left: true };
export const SHAPE_STRAIGHT_V: Connections = { top: true, right: false, bottom: true, left: false };
export const SHAPE_CORNER: Connections = { top: true, right: true, bottom: false, left: false };
export const SHAPE_TEE: Connections = { top: true, right: true, bottom: false, left: true };
export const SHAPE_CROSS: Connections = { top: true, right: true, bottom: true, left: true };

export const DEFAULT_SIGNS: Sign[] = ["AQUARIUS", "ARIES", "CAPRICORN", "CANCER"];
