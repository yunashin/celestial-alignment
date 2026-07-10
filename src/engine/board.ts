import {
  ASTEROID_COUNT,
  CENTER_ZONE_HEIGHT,
  CENTER_ZONE_WIDTH,
  DAMAGE_CARDS,
  DIRS,
  DIR_KEYS,
  ECLIPSE_CORRUPTION_PER_ELEMENT,
  ECLIPSE_DAMAGE_CARD_COUNT,
  ECLIPSE_SURGE_AMOUNTS,
  ECLIPSE_VOID_COUNT,
  ELEMENTS,
  ELEMENT_META,
  HEIGHT,
  MIN_NODE_SEPARATION,
  NODE_EDGE,
  OPP,
  ORRERY_WHITE,
  SHAPE_CORNER,
  SHAPE_CROSS,
  SHAPE_STRAIGHT_H,
  SHAPE_STRAIGHT_V,
  SHAPE_TEE,
  SHOOTING_STAR_CENTER_MARGIN,
  SHOOTING_STAR_COUNT,
  SHOOTING_STAR_MIN_SPACING,
  SHOOTING_STAR_NODE_MARGIN,
  SHOOTING_STAR_NODE_PATH_MAX,
  SHOOTING_STAR_NODE_PATH_MIN,
  SHOOTING_STAR_POWER_UP_PRIORITY,
  WIDTH
} from "../constants";
import type { Connections, Element, EclipseCard, NodeInfo, Point, PowerUp, StarCard, Tile } from "../types";
import { lerpColor, averageColors } from "../utils/colors";
import type { Rng } from "../utils/rng";

type NodeMap = Record<Element, NodeInfo>;

export const key = (x: number, y: number) => `${x},${y}`;
export const inBounds = (x: number, y: number) => x >= 0 && x < HEIGHT && y >= 0 && y < WIDTH;
export const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** `rng` defaults to Math.random so every call site that doesn't care about reproducibility (e.g.
 * gameplay-time reshuffles when a deck's discard pile gets recycled) is unaffected — only the
 * INITIAL board/deck setup in initGame threads a seeded `rng` through, so a seed reproduces the
 * starting board without needing every subsequent in-game random event to be deterministic too. */
export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export function rotateCW(c: Connections): Connections {
  return { top: c.left, right: c.top, bottom: c.right, left: c.bottom };
}

export function rotateN(c: Connections, n: number): Connections {
  let r = c;
  for (let i = 0; i < n; i++) r = rotateCW(r);
  return r;
}

export function buildStarDeck(rng: Rng = Math.random): StarCard[] {
  const deck: StarCard[] = [];
  let id = 0;
  for (const el of ELEMENTS) {
    const push = (conn: Connections) => deck.push({ id: `star-${id++}`, element: el, connections: conn });
    push(SHAPE_STRAIGHT_H);
    push(SHAPE_STRAIGHT_H);
    push(SHAPE_STRAIGHT_H);
    push(SHAPE_STRAIGHT_V);
    push(SHAPE_STRAIGHT_V);
    for (let i = 0; i < 5; i++) push(rotateN(SHAPE_CORNER, Math.floor(rng() * 4)));
    for (let i = 0; i < 5; i++) push(rotateN(SHAPE_TEE, Math.floor(rng() * 4)));
    for (let i = 0; i < 5; i++) push(SHAPE_CROSS);
  }
  return shuffle(deck, rng);
}

/** `activeElements` defaults to every element (ad-hoc callers, mainly tests) — see initGame, which
 * always passes the actual elements in play so DAMAGE cards targeting an inactive element (in a 2-3
 * player game) never get sampled into the deck at all. */
export function buildEclipseDeck(rng: Rng = Math.random, activeElements: Element[] = ELEMENTS, playersLength = 4): EclipseCard[] {
  const deck: EclipseCard[] = [];
  let id = 0;
  for (const el of ELEMENTS) {
    for (let i = 0; i < ECLIPSE_CORRUPTION_PER_ELEMENT; i++) deck.push({ id: `ecl-${id++}`, type: "CORRUPTION", element: el });
  }
  for (let i = 0; i < ECLIPSE_VOID_COUNT; i++) deck.push({ id: `ecl-${id++}`, type: "VOID" });
  for (const amount of ECLIPSE_SURGE_AMOUNTS[playersLength]) deck.push({ id: `ecl-${id++}`, type: "SURGE", amount });

  // Sampled WITH replacement (not shuffle+slice) since ECLIPSE_DAMAGE_CARD_COUNT can exceed the
  // eligible pool size (e.g. a 2-player game only has 2 elements active, but the count is still 4)
  // — duplicate cards in the deck are fine, same as any other card type here.
  const eligibleDamageCards = DAMAGE_CARDS.filter((c) => c.elements.some((el) => activeElements.includes(el)));
  for (let i = 0; i < ECLIPSE_DAMAGE_CARD_COUNT; i++) {
    const meta = eligibleDamageCards[Math.floor(rng() * eligibleDamageCards.length)];
    deck.push({ id: `ecl-${id++}`, type: "DAMAGE", damageElements: meta.elements, damageMessage: meta.messageKey, damageHpLost: meta.hpLost });
  }
  return shuffle(deck, rng);
}

/** `crossCenter` (default true) controls whether the traversal, upon reaching the Orrery, keeps
 * exploring back out its OTHER sides into whatever's connected there — which is what lets two
 * different elements' paths share tiles near the center at all (see the class-level note on this
 * being load-bearing for Corruption/Surge scaling and win-glow convergence). Pass `false` for a
 * traversal that treats the Orrery as a dead end instead — used by isPathComplete's purity check,
 * so one element's own complete, pure path isn't wrongly failed by corruption that only shares a
 * network with it via crossing through the Orrery into an unrelated element's branch. */
export function computeNetwork(tiles: Tile[][], element: Element, center: Point, nodes: NodeMap, crossCenter = true): Set<string> {
  const net = new Set<string>();
  const node = nodes[element];
  const stack: [number, number][] = [];
  let centerVisited = false;
  const tryLink = (nx: number, ny: number, facing: keyof Connections) => {
    if (!inBounds(nx, ny) || net.has(key(nx, ny))) return;
    const nt = tiles[nx][ny];
    // Corruption no longer blocks connectivity — a path can be built through/past a corrupted
    // card. It just can't count as a *complete, winning* path while any corruption remains in it
    // (see isPathComplete's separate purity check below).
    if (nt.card && nt.card.connections[facing]) {
      net.add(key(nx, ny));
      stack.push([nx, ny]);
    }
  };
  const enterCenter = () => {
    if (centerVisited || !crossCenter) return;
    centerVisited = true;
    for (const d of DIR_KEYS) {
      const [dx, dy] = DIRS[d];
      tryLink(center.x + dx, center.y + dy, OPP[d]);
    }
  };
  // A node can be entered from any of its (up to 3) in-bounds sides, not just the one facing the
  // Orrery — mirrors how enterCenter() below tries all 4 sides of the center.
  for (const d of DIR_KEYS) {
    const [dx, dy] = DIRS[d];
    tryLink(node.x + dx, node.y + dy, OPP[d]);
  }
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const card = tiles[x][y].card!;
    for (const d of DIR_KEYS) {
      if (!card.connections[d]) continue;
      const [dx, dy] = DIRS[d];
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (tiles[nx][ny].isCenter) {
        enterCenter();
        continue;
      }
      tryLink(nx, ny, OPP[d]);
    }
  }
  return net;
}

export function computeCenterNetwork(tiles: Tile[][], center: Point): Set<string> {
  const net = new Set<string>();
  const stack: [number, number][] = [];
  const tryLink = (nx: number, ny: number, facing: keyof Connections) => {
    if (!inBounds(nx, ny) || net.has(key(nx, ny))) return;
    const nt = tiles[nx][ny];
    // Corruption no longer blocks connectivity — a path can be built through/past a corrupted
    // card. It just can't count as a *complete, winning* path while any corruption remains in it
    // (see isPathComplete's separate purity check below).
    if (nt.card && nt.card.connections[facing]) {
      net.add(key(nx, ny));
      stack.push([nx, ny]);
    }
  };
  for (const d of DIR_KEYS) {
    const [dx, dy] = DIRS[d];
    tryLink(center.x + dx, center.y + dy, OPP[d]);
  }
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const card = tiles[x][y].card!;
    for (const d of DIR_KEYS) {
      if (!card.connections[d]) continue;
      const [dx, dy] = DIRS[d];
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny) || tiles[nx][ny].isCenter) continue;
      tryLink(nx, ny, OPP[d]);
    }
  }
  return net;
}

export function computeUnionNetwork(tiles: Tile[][], center: Point, nodes: NodeMap): Set<string> {
  const union = new Set<string>();
  for (const el of ELEMENTS) computeNetwork(tiles, el, center, nodes).forEach((k) => union.add(k));
  computeCenterNetwork(tiles, center).forEach((k) => union.add(k));
  return union;
}

/** A path counts as complete only if it both reaches the Orrery AND is entirely uncorrupted —
 * connectivity itself (computeNetwork) tolerates corrupted cards so play can continue past them,
 * but a corrupted tile anywhere in the network keeps that element's path from winning. Uses the
 * `crossCenter: false` variant of computeNetwork so the purity scan doesn't tunnel through the
 * Orrery into a different element's branch — the tile adjacent to center that actually establishes
 * "reaches center" is always found via the normal outward walk from this element's own node
 * regardless, so restricting the traversal here only removes tiles reached by crossing THROUGH
 * center, never the ones needed to prove this element's own path is complete. Without this, one
 * element's genuinely complete, pure path could be wrongly reported incomplete just because
 * corruption elsewhere shares a network with it only via that Orrery crossing. */
export function isPathComplete(tiles: Tile[][], element: Element, center: Point, nodes: NodeMap): boolean {
  const net = computeNetwork(tiles, element, center, nodes, false);
  let reachesCenter = false;
  for (const d of DIR_KEYS) {
    const [dx, dy] = DIRS[d];
    const x = center.x + dx, y = center.y + dy;
    if (!inBounds(x, y)) continue;
    const t = tiles[x][y];
    if (t.card && net.has(key(x, y)) && t.card.connections[OPP[d]]) {
      reachesCenter = true;
      break;
    }
  }
  if (!reachesCenter) return false;
  for (const k of net) {
    const [x, y] = k.split(",").map(Number);
    if (tiles[x][y].isCorrupted) return false;
  }
  return true;
}

/** True if every pair of edge nodes is at least MIN_NODE_SEPARATION tiles apart. AIR/EARTH
 * (opposite rows) and WATER/FIRE (opposite columns) are always far apart structurally, but
 * adjacent-edge pairs — e.g. AIR/WATER, which share the (0,0) corner — can otherwise land right on
 * top of each other or uncomfortably close, since each edge's position is picked independently. */
function nodesWellSeparated(nodes: NodeMap): boolean {
  for (let i = 0; i < ELEMENTS.length; i++) {
    for (let j = i + 1; j < ELEMENTS.length; j++) {
      if (manhattan(nodes[ELEMENTS[i]], nodes[ELEMENTS[j]]) < MIN_NODE_SEPARATION) return false;
    }
  }
  return true;
}

/** Which of the 4 board quadrants (x, y) falls in relative to the Orrery — used both to guarantee
 * every ACTIVE player spawns in a distinct quadrant (see nodesInDistinctQuadrants/pickCenterAndNodes
 * below) and to spread shooting stars across distinct sides of the board / scope the node-path-length
 * rule to each quadrant's own player, further down this file. */
function quadrantOf(x: number, y: number, center: Point): number {
  return (x < center.x ? 0 : 1) * 2 + (y < center.y ? 0 : 1);
}

/** True if every ACTIVE element's node falls in a pairwise-distinct board quadrant relative to
 * `center` — two elements on ADJACENT edges (e.g. AIR/WATER, which share the (0,0) corner) can
 * otherwise land in the same quadrant purely by chance even while satisfying MIN_NODE_SEPARATION,
 * which would let two ACTUAL Guardians spawn on merely a different edge rather than a genuinely
 * different side of the board. Only elements actually in play are checked — an inactive element's
 * node is free to share a quadrant with anyone, since no Guardian ever spawns there. */
function nodesInDistinctQuadrants(nodes: NodeMap, center: Point, activeElements: Element[]): boolean {
  const quadrants = new Set(activeElements.map((el) => quadrantOf(nodes[el].x, nodes[el].y, center)));
  return quadrants.size === activeElements.length;
}

/** Picks a random Orrery position within the center zone, then 4 node positions on the 4 edges
 * that are all the same Manhattan distance from it (clamped to stay in bounds in rare edge cases).
 * Re-rolls (bounded) until all 4 nodes are on distinct tiles at least MIN_NODE_SEPARATION apart AND
 * every active player's node falls in its own distinct quadrant — see nodesWellSeparated /
 * nodesInDistinctQuadrants. */
function pickCenterAndNodes(rng: Rng, activeElements: Element[]): { center: Point; nodes: NodeMap } {
  let result = pickCenterAndNodesOnce(rng);
  for (
    let attempt = 0;
    attempt < 200 && (!nodesWellSeparated(result.nodes) || !nodesInDistinctQuadrants(result.nodes, result.center, activeElements));
    attempt++
  ) {
    result = pickCenterAndNodesOnce(rng);
  }
  return result;
}

function pickCenterAndNodesOnce(rng: Rng): { center: Point; nodes: NodeMap } {
  const midRow = (HEIGHT - 1) / 2;
  const midCol = (WIDTH - 1) / 2;
  const halfZoneRows = Math.floor((CENTER_ZONE_HEIGHT - 1) / 2);
  const halfZoneCols = Math.floor((CENTER_ZONE_WIDTH - 1) / 2);
  const cx = midRow - halfZoneRows + Math.floor(rng() * CENTER_ZONE_HEIGHT);
  const cy = midCol - halfZoneCols + Math.floor(rng() * CENTER_ZONE_WIDTH);
  const center = { x: cx, y: cy };

  const D = Math.max(cx, HEIGHT - 1 - cx, cy, WIDTH - 1 - cy);
  // On a very non-square board, the ideal lateral offset can overshoot the shorter axis (e.g. an
  // Orrery near a corner needs a huge lateral reach for the left/right nodes, but rows are short).
  // Clamp to the largest offset that's still in bounds so every node lands somewhere valid — most
  // boards hit exact equidistance, and only extreme Orrery positions fall slightly short on one side.
  const pickAlong = (axisCenter: number, perp: number, axisMax: number): number => {
    const idealLateral = D - perp;
    const maxLateral = Math.max(axisCenter, axisMax - axisCenter);
    const lateral = Math.max(0, Math.min(idealLateral, maxLateral));
    const candidates = [axisCenter + lateral, axisCenter - lateral].filter((v) => v >= 0 && v <= axisMax);
    return candidates[Math.floor(rng() * candidates.length)];
  };

  const nodes: NodeMap = {
    AIR: { x: 0, y: pickAlong(cy, cx, WIDTH - 1), dir: NODE_EDGE.AIR },
    EARTH: { x: HEIGHT - 1, y: pickAlong(cy, HEIGHT - 1 - cx, WIDTH - 1), dir: NODE_EDGE.EARTH },
    WATER: { x: pickAlong(cx, cy, HEIGHT - 1), y: 0, dir: NODE_EDGE.WATER },
    FIRE: { x: pickAlong(cx, WIDTH - 1 - cy, HEIGHT - 1), y: WIDTH - 1, dir: NODE_EDGE.FIRE }
  };

  return { center, nodes };
}

/** `rng` defaults to Math.random so ad-hoc callers (tests, mainly) don't need to pass one — real
 * games always thread the seeded rng in from initGame so the whole starting board is reproducible.
 * `activeElements` defaults to every element (i.e. "no player-count-aware prioritization") for the
 * same ad-hoc-caller convenience — see assignShootingStarPowerUps' own doc comment. */
export function makeBoard(rng: Rng = Math.random, activeElements: Element[] = ELEMENTS): { tiles: Tile[][]; center: Point; nodes: NodeMap } {
  const { center, nodes } = pickCenterAndNodes(rng, activeElements);
  const tiles: Tile[][] = [];
  for (let x = 0; x < HEIGHT; x++) {
    const row: Tile[] = [];
    for (let y = 0; y < WIDTH; y++) {
      row.push({
        x, y, card: null, isCorrupted: false, isLocked: false, isAsteroid: false,
        isVoid: false, node: null, isCenter: false, isShielded: false, shieldOwner: null,
        isShootingStar: false, powerUp: null, powerUpFlash: false, asteroidHitStep: null, explosionStep: null,
        isEnclosed: false, isPurified: false, placedBy: null, corruptionTurnsLeft: null, crumbleStep: null
      });
    }
    tiles.push(row);
  }
  tiles[center.x][center.y].isCenter = true;
  for (const el of ELEMENTS) tiles[nodes[el].x][nodes[el].y].node = el;

  const forbidden = new Set<string>([key(center.x, center.y)]);
  for (const el of ELEMENTS) {
    const n = nodes[el];
    forbidden.add(key(n.x, n.y));
    const [dx, dy] = DIRS[n.dir];
    forbidden.add(key(n.x + dx, n.y + dy));
  }
  for (const d of DIR_KEYS) {
    const [dx, dy] = DIRS[d];
    const nx = center.x + dx, ny = center.y + dy;
    if (inBounds(nx, ny)) forbidden.add(key(nx, ny));
  }

  const eligible: [number, number][] = [];
  for (let x = 0; x < HEIGHT; x++) {
    for (let y = 0; y < WIDTH; y++) {
      if (!forbidden.has(key(x, y))) eligible.push([x, y]);
    }
  }
  for (const [ax, ay] of shuffle(eligible, rng).slice(0, ASTEROID_COUNT)) tiles[ax][ay].isAsteroid = true;
  placeShootingStars(tiles, center, nodes, activeElements, rng);
  return { tiles, center, nodes };
}

/** Scatters shooting-star power-up tiles away from the central cross where nodes/paths concentrate,
 * one per board quadrant (relative to the Orrery) — SHOOTING_STAR_COUNT now equals the 4 quadrants,
 * so every quadrant always gets exactly one star (unlike the old 3-star/4-quadrant design, which
 * deliberately left one quadrant empty). Two extra constraints beyond spacing/center-margin:
 *  - SHOOTING_STAR_NODE_MARGIN: no star may spawn within that many tiles of ANY element node.
 *  - SHOOTING_STAR_NODE_PATH_MIN/MAX: for whichever node(s) fall in a given quadrant, the detour
 *    distance node -> star -> Orrery (Manhattan) must land in that range.
 * Per-quadrant selection tries progressively weaker constraint combinations (path-length+spacing,
 * then spacing alone, then path-length alone, then any candidate in the quadrant) before falling
 * back to ignoring the quadrant assignment entirely — this can never fail to place all
 * SHOOTING_STAR_COUNT stars, it just relaxes the softer constraints on an unlucky board layout. */
function placeShootingStars(tiles: Tile[][], center: Point, nodes: NodeMap, activeElements: Element[], rng: Rng) {
  const candidates: [number, number][] = [];
  for (let x = 0; x < HEIGHT; x++) {
    for (let y = 0; y < WIDTH; y++) {
      const t = tiles[x][y];
      if (t.isAsteroid || t.node || t.isCenter) continue;
      if (Math.abs(x - center.x) < SHOOTING_STAR_CENTER_MARGIN || Math.abs(y - center.y) < SHOOTING_STAR_CENTER_MARGIN) continue;
      if (ELEMENTS.some((el) => manhattan(nodes[el], { x, y }) <= SHOOTING_STAR_NODE_MARGIN)) continue;
      candidates.push([x, y]);
    }
  }
  const byQuadrant: [number, number][][] = [[], [], [], []];
  for (const c of candidates) byQuadrant[quadrantOf(c[0], c[1], center)].push(c);

  // Which ACTIVE element's node, if any, falls into each quadrant — used both for the path-length
  // filter below and for assignShootingStarPowerUps afterward. Deliberately scoped to activeElements,
  // not every element: the path-length rule is about an actual player's own route to the Orrery, so
  // an inactive element's node sharing a quadrant with an active one shouldn't affect it, and
  // pickCenterAndNodes already guarantees at most one ACTIVE element ever shares a quadrant (see
  // nodesInDistinctQuadrants) — so this can never let two players' rules be "fulfilled" by the same
  // shooting star.
  const nodesByQuadrant: Element[][] = [[], [], [], []];
  for (const el of activeElements) nodesByQuadrant[quadrantOf(nodes[el].x, nodes[el].y, center)].push(el);

  const pathOk = (q: number, [cx, cy]: [number, number]) =>
    nodesByQuadrant[q].every((el) => {
      const d = manhattan(nodes[el], { x: cx, y: cy }) + manhattan({ x: cx, y: cy }, center);
      return d >= SHOOTING_STAR_NODE_PATH_MIN && d <= SHOOTING_STAR_NODE_PATH_MAX;
    });
  const spacingOk = (chosen: [number, number][], [cx, cy]: [number, number]) =>
    chosen.every(([px, py]) => manhattan({ x: px, y: py }, { x: cx, y: cy }) >= SHOOTING_STAR_MIN_SPACING);

  const chosen: [number, number][] = [];
  for (const q of shuffle([0, 1, 2, 3], rng)) {
    if (chosen.length >= SHOOTING_STAR_COUNT) break;
    const pool = shuffle(byQuadrant[q], rng);
    const pick =
      pool.find((c) => pathOk(q, c) && spacingOk(chosen, c)) ??
      pool.find((c) => spacingOk(chosen, c)) ??
      pool.find((c) => pathOk(q, c)) ??
      pool[0];
    if (pick) chosen.push(pick);
  }

  // Fallback for the rare case a quadrant has no eligible tile left at all — fill remaining slots
  // from any candidate, still preferring spacing, then any candidate at all. Node-margin/center-
  // margin are the only constraints that always hold regardless, since they're baked into
  // `candidates` itself rather than being tried-then-relaxed like path-length/spacing/quadrant are.
  const shuffled = shuffle(candidates, rng);
  for (const [cx, cy] of shuffled) {
    if (chosen.length >= SHOOTING_STAR_COUNT) break;
    if (chosen.some(([px, py]) => px === cx && py === cy)) continue;
    if (spacingOk(chosen, [cx, cy])) chosen.push([cx, cy]);
  }
  for (const [cx, cy] of shuffled) {
    if (chosen.length >= SHOOTING_STAR_COUNT) break;
    if (!chosen.some(([px, py]) => px === cx && py === cy)) chosen.push([cx, cy]);
  }

  const powerUps = assignShootingStarPowerUps(chosen, center, nodes, activeElements, rng);
  chosen.forEach(([x, y], i) => {
    tiles[x][y].isShootingStar = true;
    tiles[x][y].powerUp = powerUps[i];
  });
}

/** Assigns each chosen shooting star's power-up type, one per `chosen` entry (same order). In a 2-3
 * player game, the power-ups in SHOOTING_STAR_POWER_UP_PRIORITY order are preferentially placed into
 * whichever quadrants contain an ACTIVE player's own element node — so a Guardian is more likely to
 * find a beneficial power-up in their own corner of the board rather than one wasted on a quadrant
 * nobody's element is anywhere near. Reorder SHOOTING_STAR_POWER_UP_PRIORITY in constants.ts to
 * change which power-ups get this treatment, and in what order. A 4-player game always uses every
 * element (no "off" quadrant to avoid), so it skips prioritization and shuffles all 4 types freely —
 * `activeElements` defaults to every element for the same reason when a caller doesn't care (tests). */
export function assignShootingStarPowerUps(chosen: [number, number][], center: Point, nodes: NodeMap, activeElements: Element[], rng: Rng): PowerUp[] {
  const allTypes: PowerUp[] = ["TRACKER_DOWN", "BONUS_AP", "BONUS_HAND", "HEAL_UNLOCK"];
  if (activeElements.length >= ELEMENTS.length) return shuffle(allTypes, rng);

  const activeQuadrants = new Set(activeElements.map((el) => quadrantOf(nodes[el].x, nodes[el].y, center)));
  const chosenQuadrants = chosen.map(([x, y]) => quadrantOf(x, y, center));
  const assignment: (PowerUp | null)[] = chosen.map(() => null);

  const priorityQueue = [...SHOOTING_STAR_POWER_UP_PRIORITY];
  const activeIndices = shuffle(
    chosen.map((_, i) => i).filter((i) => activeQuadrants.has(chosenQuadrants[i])),
    rng
  );
  const used: PowerUp[] = [];
  for (const i of activeIndices) {
    if (!priorityQueue.length) break;
    const type = priorityQueue.shift()!;
    assignment[i] = type;
    used.push(type);
  }

  const leftover = shuffle(allTypes.filter((t) => !used.includes(t)), rng);
  let li = 0;
  for (let i = 0; i < assignment.length; i++) {
    if (assignment[i] === null) assignment[i] = leftover[li++];
  }
  return assignment as PowerUp[];
}

const SHIELD_OFFSETS: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

/** A 2x2 Virgo shield anchored at (x,y) is valid if all 4 tiles are in bounds and none is the center, a node, an asteroid, a void, or already shielded. */
export function isValidShieldAnchor(tiles: Tile[][], x: number, y: number): boolean {
  return SHIELD_OFFSETS.every(([dx, dy]) => {
    const nx = x + dx, ny = y + dy;
    if (!inBounds(nx, ny)) return false;
    const t = tiles[nx][ny];
    return !t.isCenter && !t.node && !t.isAsteroid && !t.isVoid && !t.isShielded;
  });
}

export function shieldTiles(x: number, y: number): Point[] {
  return SHIELD_OFFSETS.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

/** Grid points on the straight line from `from` to `to` (Bresenham), excluding `from` itself. */
export function lineTiles(from: Point, to: Point): Point[] {
  const pts: Point[] = [];
  let x0 = from.x, y0 = from.y;
  const dx = Math.abs(to.x - x0), dy = -Math.abs(to.y - y0);
  const sx = x0 < to.x ? 1 : -1, sy = y0 < to.y ? 1 : -1;
  let err = dx + dy;
  while (true) {
    if (x0 !== from.x || y0 !== from.y) pts.push({ x: x0, y: y0 });
    if (x0 === to.x && y0 === to.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pts;
}

/** All points reachable from `from` via Star Card connectors — a node or the center Orrery acts
 * as an always-open hub, same as computeNetwork's enterCenter/node-entry logic. This is "the path
 * the player is currently standing on": the connected component containing their tile, which may
 * be a subset of the full board network if their path hasn't converged with anyone else's yet.
 * Used by Sagittarius's Astral Arrow (place anywhere along your own path). Corruption is NOT a
 * barrier here (matches tracePathBetween below) — you can still build along a corrupted stretch. */
export function reachableFrom(tiles: Tile[][], from: Point): Set<string> {
  const visited = new Set<string>([key(from.x, from.y)]);
  const queue: Point[] = [from];
  let head = 0;
  const isHub = (t: Tile) => t.isCenter || t.node !== null;
  while (head < queue.length) {
    const cur = queue[head++];
    const t = tiles[cur.x][cur.y];
    // A bare (cardless) tile can only ever be `cur` here as the starting position itself — every
    // OTHER tile only ever enters the queue via the isHub/matching-connector check below, so this
    // never wrongly opens up a genuine mid-path gap. It exists so a player standing on a broken,
    // cardless spot (e.g. their card was destroyed by an asteroid) can still reach neighboring
    // cards whose own connectors face them, instead of being stuck unable to expand in any
    // direction just because they personally have no card of their own to route through.
    const open = isHub(t) || !t.card;
    for (const d of DIR_KEYS) {
      if (!open && !(t.card && t.card.connections[d])) continue;
      const [dx, dy] = DIRS[d];
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;
      const nt = tiles[nx][ny];
      if (isHub(nt) || (nt.card && nt.card.connections[OPP[d]])) {
        visited.add(nk);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return visited;
}

/** BFS shortest route (inclusive of both endpoints) between two points, following Star Card
 * connectors — a node or the center Orrery acts as a hub that connects on every in-bounds side,
 * same as computeNetwork's enterCenter/node-entry logic. Unlike computeNetwork, corruption is
 * NOT a barrier here: Leo's Solar Flare needs to trace a route through scorched ground to reach
 * whatever corrupted card lies beyond it. */
export function tracePathBetween(tiles: Tile[][], from: Point, to: Point): Point[] {
  const targetKey = key(to.x, to.y);
  const parent = new Map<string, string | null>();
  parent.set(key(from.x, from.y), null);
  const queue: Point[] = [from];
  let head = 0;
  const isHub = (t: Tile) => t.isCenter || t.node !== null;

  while (head < queue.length) {
    const cur = queue[head++];
    const curKey = key(cur.x, cur.y);
    if (curKey === targetKey) break;
    const t = tiles[cur.x][cur.y];
    // Same bare-starting-tile allowance as reachableFrom above — see its comment.
    const open = isHub(t) || !t.card;
    for (const d of DIR_KEYS) {
      if (!open && !(t.card && t.card.connections[d])) continue;
      const [dx, dy] = DIRS[d];
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (parent.has(nk)) continue;
      const nt = tiles[nx][ny];
      if (isHub(nt) || (nt.card && nt.card.connections[OPP[d]])) {
        parent.set(nk, curKey);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  if (!parent.has(targetKey)) return [];
  const path: Point[] = [];
  let cur: string | null = targetKey;
  while (cur !== null) {
    const [x, y] = cur.split(",").map(Number);
    path.unshift({ x, y });
    cur = parent.get(cur) ?? null;
  }
  return path;
}

/** Connected group of Star Cards touching (x,y) via matching connectors, restricted to a SINGLE
 * `element` — used for the chain-of-3 Eclipse Tracker discount. Returns an empty set if (x,y)
 * itself doesn't hold a card of that element, since there's no same-element chain to speak of
 * starting there. Like computeNetwork, this tolerates corruption: a corrupted card still has its
 * physical connector shape, so it doesn't sever an otherwise-continuous chain. Deliberately does
 * NOT check node-attachment/connectivity-to-center at all — unlike the old wildcard-chain design,
 * a same-element run counts purely by physical adjacency, nothing more. */
export function computeSameElementChainGroup(tiles: Tile[][], element: Element, x: number, y: number): Set<string> {
  const visited = new Set<string>();
  const start = tiles[x][y];
  if (!start.card || start.card.element !== element) return visited;
  visited.add(key(x, y));
  const stack: [number, number][] = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const card = tiles[cx][cy].card!;
    for (const d of DIR_KEYS) {
      if (!card.connections[d]) continue;
      const [dx, dy] = DIRS[d];
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (visited.has(nk)) continue;
      const nt = tiles[nx][ny];
      if (nt.card && nt.card.element === element && nt.card.connections[OPP[d]]) {
        visited.add(nk);
        stack.push([nx, ny]);
      }
    }
  }
  return visited;
}

/** Tiles that help form a fully closed loop in the Star Card connector graph — a rectangle is the
 * simplest case, but any shape that encloses an area counts, and corruption doesn't matter (a
 * corrupted card still has its physical connector shape, so it can still complete or belong to a
 * loop). Detected via Tarjan's bridge-finding over the undirected graph of card-to-card connector
 * links (any element, node/center hubs NOT included as graph vertices — this is specifically about
 * Star Cards enclosing a shape, not routing through hubs): an edge that ISN'T a bridge lies on some
 * cycle, and the union of such edges' endpoints is exactly the set of "enclosed" tiles. Once a tile
 * is enclosed it's meant to stay that way permanently (see reducer.ts's PLACE case, which only ever
 * sets `Tile.isEnclosed`, never clears it) — this function itself is just the current-board query,
 * called fresh after every placement. */
export function findEnclosedTiles(tiles: Tile[][]): Set<string> {
  const adj = new Map<string, string[]>();
  for (let x = 0; x < HEIGHT; x++) {
    for (let y = 0; y < WIDTH; y++) {
      const t = tiles[x][y];
      if (!t.card) continue;
      for (const d of DIR_KEYS) {
        if (!t.card.connections[d]) continue;
        const [dx, dy] = DIRS[d];
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const nt = tiles[nx][ny];
        if (nt.card && nt.card.connections[OPP[d]]) {
          const a = key(x, y), b = key(nx, ny);
          if (!adj.has(a)) adj.set(a, []);
          adj.get(a)!.push(b);
        }
      }
    }
  }

  const enclosed = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  let timer = 0;

  for (const start of adj.keys()) {
    if (disc.has(start)) continue;
    // Iterative DFS (each frame tracks the node, its parent, and how far we've iterated through
    // its neighbor list) — avoids recursion-depth concerns on a long, snaking chain of cards.
    const stack: { node: string; parent: string | null; idx: number }[] = [{ node: start, parent: null, idx: 0 }];
    disc.set(start, timer);
    low.set(start, timer);
    timer++;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbors = adj.get(frame.node) ?? [];
      if (frame.idx < neighbors.length) {
        const next = neighbors[frame.idx];
        frame.idx++;
        if (next === frame.parent) continue; // the single edge back to the parent, not a cycle
        if (!disc.has(next)) {
          disc.set(next, timer);
          low.set(next, timer);
          timer++;
          stack.push({ node: next, parent: frame.node, idx: 0 });
        } else {
          low.set(frame.node, Math.min(low.get(frame.node)!, disc.get(next)!));
        }
      } else {
        stack.pop();
        if (stack.length) {
          const parentFrame = stack[stack.length - 1];
          low.set(parentFrame.node, Math.min(low.get(parentFrame.node)!, low.get(frame.node)!));
          // Tarjan's bridge condition: this tree edge is a bridge (NOT on any cycle) iff
          // low[frame] > disc[parent]. If it's not a bridge, both endpoints lie on a cycle.
          if (low.get(frame.node)! <= disc.get(parentFrame.node)!) {
            enclosed.add(frame.node);
            enclosed.add(parentFrame.node);
          }
        }
      }
    }
  }
  return enclosed;
}

interface GlowContribution {
  color: string;
  t: number;
}

export interface GlowInfo {
  color: string;
  t: number;
  gradient?: string;
}

/** BFS depth per tile along a completed element path, from the edge node out to the Orrery. */
function elementPathDepths(tiles: Tile[][], element: Element, nodes: NodeMap): Map<string, number> {
  const node = nodes[element];
  const depths = new Map<string, number>();
  const queue: [number, number, number][] = [];
  // Seed depth 0 from any in-bounds side of the node, not just the one facing the Orrery.
  for (const d of DIR_KEYS) {
    const [dx, dy] = DIRS[d];
    const startX = node.x + dx, startY = node.y + dy;
    if (!inBounds(startX, startY)) continue;
    const startKey = key(startX, startY);
    if (depths.has(startKey)) continue;
    const t = tiles[startX][startY];
    if (t.card && !t.isCorrupted && t.card.connections[OPP[d]]) {
      depths.set(startKey, 0);
      queue.push([startX, startY, 0]);
    }
  }
  let head = 0;
  let reachesCenter = false;
  while (head < queue.length) {
    const [x, y, d] = queue[head++];
    const card = tiles[x][y].card!;
    for (const dir of DIR_KEYS) {
      if (!card.connections[dir]) continue;
      const [dx, dy] = DIRS[dir];
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (tiles[nx][ny].isCenter) {
        reachesCenter = true;
        continue;
      }
      const k = key(nx, ny);
      if (depths.has(k)) continue;
      const nt = tiles[nx][ny];
      if (nt.card && !nt.isCorrupted && nt.card.connections[OPP[dir]]) {
        depths.set(k, d + 1);
        queue.push([nx, ny, d + 1]);
      }
    }
  }
  if (!reachesCenter) return new Map();
  return depths;
}

/**
 * Per-tile glow info for a won game: each completed element path fades from its color to
 * Orrery white as it nears the center, with a `t` progress value (0 at the edge node, 1 at
 * the Orrery) used to stagger a reveal animation. Tiles where multiple paths converge before
 * reaching the Orrery get a blended gradient of the contributing colors instead of a flat mix.
 */
export function computeWinGlow(tiles: Tile[][], elements: Element[], center: Point, nodes: NodeMap): Map<string, GlowInfo> {
  const contributions = new Map<string, GlowContribution[]>();
  const add = (k: string, color: string, t: number) => {
    const list = contributions.get(k) ?? [];
    list.push({ color, t });
    contributions.set(k, list);
  };

  const completed = elements.filter((el) => isPathComplete(tiles, el, center, nodes));
  for (const el of completed) {
    const depths = elementPathDepths(tiles, el, nodes);
    if (depths.size === 0) continue;
    const maxDepth = Math.max(...depths.values());
    const elColor = ELEMENT_META[el].color;
    for (const [k, d] of depths) {
      const t = maxDepth === 0 ? 1 : d / maxDepth;
      add(k, lerpColor(elColor, ORRERY_WHITE, t), t);
    }
    add(`node:${el}`, elColor, 0);
  }

  const glow = new Map<string, GlowInfo>();
  for (const [k, list] of contributions) {
    const color = averageColors(list.map((c) => c.color));
    const t = list.reduce((sum, c) => sum + c.t, 0) / list.length;
    const gradient = list.length > 1 ? `linear-gradient(135deg, ${list.map((c) => c.color).join(", ")})` : undefined;
    glow.set(k, { color, t, gradient });
  }

  if (glow.size > 0) {
    const rawColors = completed.map((el) => ELEMENT_META[el].color);
    const gradient = rawColors.length > 1 ? `linear-gradient(135deg, ${[...rawColors, ORRERY_WHITE].join(", ")})` : undefined;
    glow.set("center", { color: ORRERY_WHITE, t: 1, gradient });
  }
  return glow;
}
