import { DEFAULT_HAND_SIZE, DIRS, DIR_KEYS, HEIGHT, OPP, WIDTH } from "../constants";
import { t } from "../i18n";
import type { Connections, GameState, Player, StarCard } from "../types";
import { computeUnionNetwork, inBounds, key, manhattan, reachableFrom, rotateN } from "./board";

export const handSize = (s: GameState, p: Player) => (p.sign === "GEMINI" ? DEFAULT_HAND_SIZE + 1 : DEFAULT_HAND_SIZE) + s.handSizeBonus;

/**
 * `forcedRotation` (0-3 quarter-turns) lets Aquarius manually pick an orientation instead of the
 * default auto-try-every-rotation behavior — see GameScreen's rotate control. When omitted, Aquarius
 * still auto-picks the first rotation that connects, same as every other sign's fixed orientation.
 */
export function validPlacement(s: GameState, player: Player, card: StarCard, x: number, y: number, forcedRotation?: number): Connections | null {
  const t = s.tiles[x][y];
  if (t.card || t.isAsteroid || t.isVoid || t.node || t.isCenter) return null;
  // The player's own currently-reachable network — used both for Sagittarius's "is this near my
  // own path" range check AND (below, for EVERYONE) as an extra acceptable network for the
  // connector check itself. A fragment that's been severed from every node/the Orrery (e.g. an
  // asteroid cut a path in two) isn't a member of `union` (which is only built from node- and
  // center-rooted networks), but any player standing on such a fragment should still be able to
  // build onto it — being physically stranded on an island shouldn't make it permanently unbuildable.
  const reachable = reachableFrom(s.tiles, player.position);
  if (player.sign === "SAGITTARIUS") {
    const nearOwnPath = DIR_KEYS.some((d) => {
      const [dx, dy] = DIRS[d];
      return reachable.has(key(x - dx, y - dy));
    });
    if (!nearOwnPath) return null;
  } else if (manhattan(player.position, { x, y }) > 1) {
    return null;
  }
  const union = computeUnionNetwork(s.tiles, s.center, s.nodes);
  const check = (conn: Connections) => {
    for (const d of DIR_KEYS) {
      if (!conn[d]) continue;
      const [dx, dy] = DIRS[d];
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const nt = s.tiles[nx][ny];
      if (nt.isCenter) return true;
      // Any of a node's (up to 3) in-bounds sides can anchor a card, not just the one facing the
      // Orrery — see computeNetwork/elementPathDepths in board.ts, which enter from every valid side too.
      if (nt.node) return true;
      if (nt.card && nt.card.connections[OPP[d]] && (union.has(key(nx, ny)) || reachable.has(key(nx, ny)))) return true;
    }
    return false;
  };
  if (player.sign === "AQUARIUS" && forcedRotation !== undefined) {
    const c = rotateN(card.connections, forcedRotation);
    return check(c) ? c : null;
  }
  if (check(card.connections)) return card.connections;
  if (player.sign === "AQUARIUS") {
    let c = card.connections;
    for (let i = 0; i < 3; i++) {
      c = rotateN(c, 1);
      if (check(c)) return c;
    }
  }
  return null;
}

export function placementCost(player: Player, x: number, y: number): number {
  return manhattan(player.position, { x, y }) > 1 ? 2 : 1;
}

/** A tile acts as an always-open hub for movement (any in-bounds side) if it's a node or the
 * Orrery — same treatment reachableFrom/tracePathBetween give hubs when tracing connectivity. */
const isMoveHub = (t: { isCenter: boolean; node: unknown }) => t.isCenter || t.node !== null;

export interface MoveReach {
  // AP cost to walk here — 1 per tile stepped through, same as a single Move always cost before;
  // a destination several tiles away simply sums to more.
  cost: number;
  // The tile key that precedes this one on the (BFS-shortest, thus cheapest) path from the
  // player's current position — lets the reducer walk the whole path back to mark every
  // INTERMEDIATE tile visited too, not just the final destination, since a compressed multi-tile
  // move is mechanically still several individual moves compressed into one click.
  parent: string | null;
}

/** BFS from the player's current tile along the same connector-matching movement rule a single
 * Move always used (hubs/bare tiles are open in every direction; an actual Star Card only in
 * whichever directions its own connectors face) — generalized to multiple hops so a player with
 * enough AP can move several tiles in one click instead of re-arming Move after every single
 * step. Every tile reachable within the player's current AP budget maps to how much of that AP
 * it costs to walk there and which tile precedes it on the path. Never explores past `s.ap`. */
export function getValidMoves(s: GameState): Map<string, MoveReach> {
  const result = new Map<string, MoveReach>();
  const p = s.players[s.active];
  if (s.ap < 1) return result;
  const startKey = key(p.position.x, p.position.y);
  const seen = new Set<string>([startKey]);
  const queue: { x: number; y: number; cost: number }[] = [{ x: p.position.x, y: p.position.y, cost: 0 }];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.cost >= s.ap) continue; // no AP left to take another step from here
    const curKey = key(cur.x, cur.y);
    const t = s.tiles[cur.x][cur.y];
    // A player can step off a hub or a bare (cardless) tile in any direction — matching
    // reachableFrom's treatment of a broken, cardless spot — but off an actual Star Card only in
    // directions that card's own connectors face; you can't cut across two physically-touching
    // but unconnected cards just because they happen to share an edge.
    const open = isMoveHub(t) || !t.card;
    for (const d of DIR_KEYS) {
      if (!open && !(t.card && t.card.connections[d])) continue;
      const [dx, dy] = DIRS[d];
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const nt = s.tiles[nx][ny];
      if (nt.isAsteroid || nt.isVoid) continue;
      const nk = key(nx, ny);
      if (seen.has(nk)) continue;
      if (isMoveHub(nt) || (nt.card && nt.card.connections[OPP[d]])) {
        seen.add(nk);
        const cost = cur.cost + 1;
        result.set(nk, { cost, parent: curKey });
        queue.push({ x: nx, y: ny, cost });
      }
    }
  }
  return result;
}

export function getValidPlacements(s: GameState, handIndex: number, forcedRotation?: number): Set<string> {
  const res = new Set<string>();
  const p = s.players[s.active];
  const card = p.hand[handIndex];
  if (!card) return res;
  for (let x = 0; x < HEIGHT; x++) {
    for (let y = 0; y < WIDTH; y++) {
      if (validPlacement(s, p, card, x, y, forcedRotation)) res.add(key(x, y));
    }
  }
  return res;
}

/** getValidPlacements narrowed to tiles the player can actually afford right now. Only matters for
 * Sagittarius in practice — every other sign is range-capped to manhattan <= 1, which always costs
 * 1 AP, but Sagittarius can target tiles 2 AP away, and shouldn't see those highlighted as
 * selectable once they're down to 1 AP. */
export function getAffordablePlacements(s: GameState, handIndex: number, forcedRotation?: number): Set<string> {
  const res = new Set<string>();
  const p = s.players[s.active];
  for (const k of getValidPlacements(s, handIndex, forcedRotation)) {
    const [x, y] = k.split(",").map(Number);
    if (s.ap >= placementCost(p, x, y)) res.add(k);
  }
  return res;
}

export function getValidPurifyTargets(s: GameState): Set<string> {
  const res = new Set<string>();
  const p = s.players[s.active];
  for (const k of Object.keys(p.visited)) {
    const [x, y] = k.split(",").map(Number);
    if (s.tiles[x]?.[y]?.isCorrupted) res.add(k);
  }
  return res;
}

export function purifyCost(s: GameState, x: number, y: number): number {
  const p = s.players[s.active];
  if (p.sign === "TAURUS" && !s.taurusPurifyUsed) return 0;
  return 1;
}

export function canPurify(s: GameState): boolean {
  const targets = getValidPurifyTargets(s);
  for (const k of targets) {
    const [x, y] = k.split(",").map(Number);
    if (s.ap >= purifyCost(s, x, y)) return true;
  }
  return false;
}

/** getValidPurifyTargets narrowed to tiles the player can actually afford right now — e.g. with
 * only 1 AP left, a target that costs 2 AP (anywhere but the player's own tile) shouldn't be
 * selectable even though it's a legitimate target in principle. */
export function getAffordablePurifyTargets(s: GameState): Set<string> {
  const res = new Set<string>();
  for (const k of getValidPurifyTargets(s)) {
    const [x, y] = k.split(",").map(Number);
    if (s.ap >= purifyCost(s, x, y)) res.add(k);
  }
  return res;
}

/** Explains why the Purify button is disabled right now, or null if it isn't. Mirrors canPurify's
 * own logic exactly (same targets/cost functions) so the message can never drift out of sync with
 * what actually gates the button. */
export function purifyDisabledReason(s: GameState): string | null {
  if (canPurify(s)) return null;
  const targets = getValidPurifyTargets(s);
  if (targets.size === 0) {
    return t("rules.noCorruptedVisited");
  }
  let minCost = Infinity;
  for (const k of targets) {
    const [x, y] = k.split(",").map(Number);
    minCost = Math.min(minCost, purifyCost(s, x, y));
  }
  return t("rules.purifyTooCostly", { cost: minCost, ap: s.ap });
}

/** How many total END_TURN dispatches — i.e. counting EVERY player's turns, not just the corrupted
 * card's own placer's — remain before it crumbles from decay, starting the count from right now
 * (the currently active player's in-progress turn counts as the first). Purely a UI-facing
 * estimate for the on-tile countdown/tooltip: mirrors END_TURN's own rotation (including skipping
 * Stasis players) without mutating anything. `player.id` always equals that player's index in
 * `s.players` (assigned that way in initGame and never reordered), so `s.active` doubles as a
 * valid starting index here. If the placer is stuck in Stasis indefinitely, decay can never tick
 * for them — returns null (displayed as "?") rather than looping forever. */
export function totalTurnsUntilCorruptionDecay(s: GameState, placedBy: number, corruptionTurnsLeft: number): number | null {
  if (s.players.every((pl) => pl.isStasis)) return null;
  let remaining = corruptionTurnsLeft;
  let activeIdx = s.active;
  const cap = (corruptionTurnsLeft + 1) * s.players.length + 8;
  for (let count = 1; count <= cap; count++) {
    if (s.players[activeIdx].id === placedBy) {
      remaining -= 1;
      if (remaining <= 0) return count;
    }
    for (let i = 1; i <= s.players.length; i++) {
      const c = (activeIdx + i) % s.players.length;
      if (!s.players[c].isStasis) {
        activeIdx = c;
        break;
      }
    }
  }
  return null;
}

export function canUseVirgoShield(s: GameState): boolean {
  const p = s.players[s.active];
  return p.sign === "VIRGO" && s.virgoShieldCooldown === 0 && s.ap >= 1;
}

export function canScorpioHeal(s: GameState): boolean {
  const p = s.players[s.active];
  return p.sign === "SCORPIO" && !s.scorpioUsed && p.hand.length > 0 && s.players.some((q) => !q.isStasis && q.hp < q.maxHp);
}

export function canConvertHandEarth(s: GameState): boolean {
  const p = s.players[s.active];
  return p.sign === "CAPRICORN" && s.ap >= 1 && p.hand.some((c) => c.element !== "EARTH");
}

/** Mirrors END_TURN's own HEAL_UNLOCK self-heal gate exactly (see reducer.ts) so the UI can predict
 * whether ending the turn right now would trigger the free 1 HP rest: the shooting star must have
 * been triggered, the active player must not have taken any other action yet this turn, and they
 * must be below full HP. Doesn't depend on AP — the heal happens as part of ending the turn, not as
 * a separate spendable action. */
export function canSelfHeal(s: GameState): boolean {
  const p = s.players[s.active];
  return s.selfHealUnlocked && !s.actedThisTurn && p.hp < p.maxHp;
}

/** Whether the active player can take any meaningful action other than ending their turn. */
export function hasAnyAction(s: GameState): boolean {
  if (s.ap <= 0) return false;
  const p = s.players[s.active];
  if (getValidMoves(s).size > 0) return true;
  for (let i = 0; i < p.hand.length; i++) {
    for (const k of getValidPlacements(s, i)) {
      const [x, y] = k.split(",").map(Number);
      if (s.ap >= placementCost(p, x, y)) return true;
    }
  }
  if (canPurify(s)) return true;
  if (canUseVirgoShield(s)) return true;
  if (canScorpioHeal(s)) return true;
  if (canConvertHandEarth(s)) return true;
  const discardCost = p.sign === "LIBRA" && !s.libraUsed ? 0 : 1;
  if (p.hand.length > 0 && s.ap >= discardCost) return true;
  return false;
}
