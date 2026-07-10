import { describe, expect, it } from "vitest";
import { DAMAGE_CARDS, DIRS, DIR_KEYS, ECLIPSE_DAMAGE_CARD_COUNT, HEIGHT, SHAPE_CROSS, SHAPE_STRAIGHT_H, SHOOTING_STAR_POWER_UP_PRIORITY, WIDTH } from "../constants";
import type { Element, GameState, NodeInfo, Point, PowerUp, StarCard, Tile } from "../types";
import {
  assignShootingStarPowerUps,
  buildEclipseDeck,
  computeNetwork,
  computeSameElementChainGroup,
  findEnclosedTiles,
  inBounds,
  isPathComplete,
  key,
  makeBoard,
  manhattan,
  reachableFrom,
  rotateN,
  tracePathBetween
} from "./board";

function cross(element: Element, id = `${element}-${Math.random()}`): StarCard {
  return { id, element, connections: { ...SHAPE_CROSS } };
}

/** A minimal, fully-controllable board: empty tiles everywhere, no asteroids/voids, with a real
 * node+center layout from makeBoard so every helper under test sees realistic geometry. */
function emptyBoard() {
  const { tiles, center, nodes } = makeBoard();
  for (const row of tiles) {
    for (const t of row) {
      t.card = null;
      t.isAsteroid = false;
      t.isVoid = false;
      t.isCorrupted = false;
      t.isShootingStar = false;
    }
  }
  return { tiles, center, nodes };
}

/** Places a straight chain of cross-shaped cards of `element` from its own node, `steps` tiles
 * deep, clearing any obstacles along the line first. Returns the list of placed tile coordinates. */
function buildChainFromNode(tiles: Tile[][], nodes: GameState["nodes"], element: Element, steps: number) {
  const node = nodes[element];
  const [dx, dy] = DIRS[node.dir];
  const placed: { x: number; y: number }[] = [];
  let pos = { x: node.x, y: node.y };
  for (let i = 0; i < steps; i++) {
    pos = { x: pos.x + dx, y: pos.y + dy };
    tiles[pos.x][pos.y].card = cross(element);
    placed.push(pos);
  }
  return placed;
}

/** A bounds-safe perpendicular offset from `pt` — used to branch a test chain off to the side.
 * `along` is the primary direction the chain already runs in ("x" if the node approaches
 * vertically and thus its row varies, "y" if horizontally and its column varies), so the branch
 * needs the OTHER axis; picks whichever of +1/-1 stays on the board. */
function safePerp(pt: Point, along: "x" | "y"): Point {
  if (along === "x") {
    return pt.y + 1 < WIDTH ? { x: 0, y: 1 } : { x: 0, y: -1 };
  }
  return pt.x + 1 < HEIGHT ? { x: 1, y: 0 } : { x: -1, y: 0 };
}

/** Builds an L-shaped (not necessarily straight) chain of cross-shaped cards from `element`'s
 * node all the way to a tile directly adjacent to the Orrery — real games' nodes are equidistant
 * from the center but very rarely row/column-aligned with it, so a single-direction straight
 * line (see buildChainFromNode) usually never actually reaches it. */
function buildPathToCenter(tiles: Tile[][], center: Point, nodes: GameState["nodes"], element: Element): Point[] {
  const node = nodes[element];
  const [dx] = DIRS[node.dir];
  const placed: Point[] = [];
  let pos: Point = { x: node.x, y: node.y };
  const place = (p: Point) => {
    tiles[p.x][p.y].card = cross(element);
    placed.push(p);
  };
  if (dx === 0) {
    // Horizontal approach (FIRE/WATER): first slide along the node's own row to center's column...
    const stepY = center.y > pos.y ? 1 : -1;
    while (pos.y !== center.y) {
      pos = { x: pos.x, y: pos.y + stepY };
      place(pos);
    }
    // ...then close the remaining vertical gap, stopping one tile short so the last card lands
    // ADJACENT to the Orrery rather than on top of it.
    const stepX = center.x > pos.x ? 1 : -1;
    const steps = Math.abs(center.x - pos.x) - 1;
    for (let i = 0; i < steps; i++) {
      pos = { x: pos.x + stepX, y: pos.y };
      place(pos);
    }
  } else {
    const stepX = center.x > pos.x ? 1 : -1;
    while (pos.x !== center.x) {
      pos = { x: pos.x + stepX, y: pos.y };
      place(pos);
    }
    const stepY = center.y > pos.y ? 1 : -1;
    const steps = Math.abs(center.y - pos.y) - 1;
    for (let i = 0; i < steps; i++) {
      pos = { x: pos.x, y: pos.y + stepY };
      place(pos);
    }
  }
  return placed;
}

describe("key/inBounds/manhattan", () => {
  it("keys and parses coordinates consistently", () => {
    expect(key(3, 5)).toBe("3,5");
  });

  it("computes Manhattan distance", () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
  });

  it("respects board bounds", () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(-1, 0)).toBe(false);
  });
});

describe("rotateN", () => {
  it("is a no-op after 4 quarter-turns", () => {
    const c = { top: true, right: false, bottom: true, left: false };
    expect(rotateN(c, 4)).toEqual(c);
  });

  it("rotates a straight-horizontal into straight-vertical after one turn", () => {
    const rotated = rotateN(SHAPE_STRAIGHT_H, 1);
    expect(rotated).toEqual({ top: true, right: false, bottom: true, left: false });
  });
});

describe("makeBoard node equidistance", () => {
  it("places all 4 nodes the same Manhattan distance from the Orrery in the common case, and never off by more than 1", () => {
    // Statistical check across many random boards — pickCenterAndNodes only clamps in rare,
    // very-off-center cases (see its own comment), so allow a small tolerance rather than exact
    // equality, but catch any regression that makes it wildly inaccurate.
    let offBy1Count = 0;
    const trials = 40;
    for (let i = 0; i < trials; i++) {
      const { center, nodes } = makeBoard();
      const distances = Object.values(nodes).map((n) => manhattan(center, n));
      const max = Math.max(...distances);
      const min = Math.min(...distances);
      expect(max - min).toBeLessThanOrEqual(1);
      if (max !== min) offBy1Count++;
    }
    expect(offBy1Count).toBeLessThan(trials);
  });

  it("keeps every node in bounds and on its assigned edge", () => {
    const { nodes } = makeBoard();
    expect(nodes.AIR.x).toBe(0);
    expect(nodes.EARTH.x).toBe(10);
    expect(nodes.WATER.y).toBe(0);
    expect(nodes.FIRE.y).toBe(18);
  });

  it("keeps every pair of nodes on distinct tiles at least MIN_NODE_SEPARATION apart, across many random boards", () => {
    const trials = 60;
    for (let i = 0; i < trials; i++) {
      const { nodes } = makeBoard();
      const els = Object.keys(nodes) as (keyof typeof nodes)[];
      for (let a = 0; a < els.length; a++) {
        for (let b = a + 1; b < els.length; b++) {
          expect(manhattan(nodes[els[a]], nodes[els[b]])).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });
});

describe("makeBoard guarantees every active player's node in a distinct quadrant", () => {
  const quadrantOf = (p: Point, center: Point) => (p.x < center.x ? 0 : 1) * 2 + (p.y < center.y ? 0 : 1);

  it("keeps all 4 element nodes in 4 mutually distinct quadrants when every element is active (the default)", () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const { center, nodes } = makeBoard();
      const quadrants = new Set((Object.keys(nodes) as Element[]).map((el) => quadrantOf(nodes[el], center)));
      expect(quadrants.size).toBe(4);
    }
  });

  it("keeps a 2-player game's active elements in 2 distinct quadrants, even on adjacent edges that could otherwise coincide", () => {
    // AIR/WATER share the (0,0)-ish corner — the pair most likely to collide by chance.
    for (let attempt = 0; attempt < 60; attempt++) {
      const { center, nodes } = makeBoard(Math.random, ["AIR", "WATER"]);
      expect(quadrantOf(nodes.AIR, center)).not.toBe(quadrantOf(nodes.WATER, center));
    }
  });

  it("keeps a 3-player game's active elements in 3 distinct quadrants", () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      const { center, nodes } = makeBoard(Math.random, ["FIRE", "WATER", "EARTH"]);
      const quadrants = new Set((["FIRE", "WATER", "EARTH"] as Element[]).map((el) => quadrantOf(nodes[el], center)));
      expect(quadrants.size).toBe(3);
    }
  });

  it("does not require an INACTIVE element's node to be in its own distinct quadrant", () => {
    // A 2-player game only constrains FIRE/WATER — AIR/EARTH are free to land anywhere, including
    // sharing a quadrant with each other or with an active element. Just confirm board generation
    // still succeeds without ever throwing/hanging across many trials; a real overlap will show up
    // in practice most of the time given how often quadrants coincide unconstrained (see the
    // shooting-star sim notes elsewhere), so this is really a smoke test for the scoped guarantee.
    for (let attempt = 0; attempt < 30; attempt++) {
      expect(() => makeBoard(Math.random, ["FIRE", "WATER"])).not.toThrow();
    }
  });
});

describe("computeNetwork tolerates corruption", () => {
  it("keeps tracing connectivity through a corrupted card", () => {
    const { tiles, center, nodes } = emptyBoard();
    const placed = buildChainFromNode(tiles, nodes, "FIRE", 4);
    tiles[placed[1].x][placed[1].y].isCorrupted = true;

    const net = computeNetwork(tiles, "FIRE", center, nodes);
    for (const pt of placed) expect(net.has(key(pt.x, pt.y))).toBe(true);
  });
});

describe("isPathComplete", () => {
  it("is true for a fully connected, uncorrupted path reaching the Orrery", () => {
    const { tiles, center, nodes } = emptyBoard();
    buildPathToCenter(tiles, center, nodes, "FIRE");
    expect(isPathComplete(tiles, "FIRE", center, nodes)).toBe(true);
  });

  it("is false once any tile in the reaching network is corrupted, even though connectivity survives", () => {
    const { tiles, center, nodes } = emptyBoard();
    const placed = buildPathToCenter(tiles, center, nodes, "FIRE");
    tiles[placed[Math.floor(placed.length / 2)].x][placed[Math.floor(placed.length / 2)].y].isCorrupted = true;
    expect(isPathComplete(tiles, "FIRE", center, nodes)).toBe(false);
  });

  it("stays true for one element even when a DIFFERENT element's own branch — only sharing a network via crossing through the Orrery — is corrupted", () => {
    const { tiles, center, nodes } = emptyBoard();
    buildPathToCenter(tiles, center, nodes, "FIRE");
    const waterPlaced = buildPathToCenter(tiles, center, nodes, "WATER");
    // Corrupt a tile purely on WATER's own approach — physically nowhere near FIRE's path, the two
    // only ever meet by tunneling through the Orrery.
    const mid = waterPlaced[Math.floor(waterPlaced.length / 2)];
    tiles[mid.x][mid.y].isCorrupted = true;

    expect(isPathComplete(tiles, "FIRE", center, nodes)).toBe(true);
    expect(isPathComplete(tiles, "WATER", center, nodes)).toBe(false); // WATER's own path is still correctly impure
  });

  it("a path severed from its own node (an asteroid-style gap) is never complete just because the surviving center-side fragment is pure and a different element's path legitimately reaches the Orrery", () => {
    const { tiles, center, nodes } = emptyBoard();
    buildPathToCenter(tiles, center, nodes, "FIRE"); // genuinely complete and pure
    const waterPlaced = buildPathToCenter(tiles, center, nodes, "WATER");
    // Blow out one card in the middle of WATER's own path, splitting it into a node-side fragment
    // and a center-side fragment. The center-side fragment is still pure and still physically
    // touches the Orrery, but WATER's node can no longer reach it through any connector chain.
    const sevIdx = Math.floor(waterPlaced.length / 2);
    tiles[waterPlaced[sevIdx].x][waterPlaced[sevIdx].y].card = null;

    expect(isPathComplete(tiles, "FIRE", center, nodes)).toBe(true);
    expect(isPathComplete(tiles, "WATER", center, nodes)).toBe(false);
  });
});

describe("computeSameElementChainGroup", () => {
  it("reports every tile in a pure same-element run", () => {
    const { tiles, nodes } = emptyBoard();
    const placed = buildChainFromNode(tiles, nodes, "FIRE", 3);
    const group = computeSameElementChainGroup(tiles, "FIRE", placed[0].x, placed[0].y);
    expect(group.size).toBe(3);
    for (const pt of placed) expect(group.has(key(pt.x, pt.y))).toBe(true);
  });

  it("does NOT cross into a physically-bridged foreign-element card — no more wildcard counting", () => {
    const { tiles, nodes } = emptyBoard();
    const placed = buildChainFromNode(tiles, nodes, "FIRE", 3);
    const [dx] = DIRS[nodes.FIRE.dir];
    const perp = safePerp(placed[1], dx !== 0 ? "x" : "y");
    const bridgeSpot = { x: placed[1].x + perp.x, y: placed[1].y + perp.y };
    tiles[bridgeSpot.x][bridgeSpot.y].card = cross("WATER");

    const group = computeSameElementChainGroup(tiles, "FIRE", placed[0].x, placed[0].y);
    expect(group.size).toBe(3); // still just the 3 Fire cards, the Water card is excluded
    expect(group.has(key(bridgeSpot.x, bridgeSpot.y))).toBe(false);
  });

  it("does not break the physical chain at a corrupted same-element card — it stays one continuous group", () => {
    const { tiles, nodes } = emptyBoard();
    const placed = buildChainFromNode(tiles, nodes, "FIRE", 4);
    tiles[placed[1].x][placed[1].y].isCorrupted = true;

    const group = computeSameElementChainGroup(tiles, "FIRE", placed[0].x, placed[0].y);
    expect(group.size).toBe(4);
    for (const pt of placed) expect(group.has(key(pt.x, pt.y))).toBe(true);
  });

  it("returns an empty set when the starting tile isn't the requested element", () => {
    const { tiles, nodes } = emptyBoard();
    const placed = buildChainFromNode(tiles, nodes, "FIRE", 2);
    const group = computeSameElementChainGroup(tiles, "WATER", placed[0].x, placed[0].y);
    expect(group.size).toBe(0);
  });
});

describe("findEnclosedTiles", () => {
  // These tests set Tile.card directly rather than going through PLACE/validPlacement, so a rare
  // collision with the real board's randomized Orrery/node tiles at these coordinates is harmless
  // — findEnclosedTiles only looks at Tile.card, never isCenter/node.
  it("marks all 4 tiles of a closed rectangle loop as enclosed", () => {
    const { tiles } = emptyBoard();
    const corners: Point[] = [{ x: 1, y: 5 }, { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 2, y: 5 }];
    for (const pt of corners) tiles[pt.x][pt.y].card = cross("FIRE");

    const enclosed = findEnclosedTiles(tiles);
    for (const pt of corners) expect(enclosed.has(key(pt.x, pt.y))).toBe(true);
    expect(enclosed.size).toBe(4);
  });

  it("marks nothing enclosed for a plain straight chain — no cycle exists", () => {
    const { tiles } = emptyBoard();
    for (let y = 5; y <= 7; y++) tiles[1][y].card = { id: `s-${y}`, element: "FIRE", connections: { ...SHAPE_STRAIGHT_H } };

    expect(findEnclosedTiles(tiles).size).toBe(0);
  });

  it("only marks the loop tiles, not a dangling tail sticking off it (a lollipop shape)", () => {
    const { tiles } = emptyBoard();
    const corners: Point[] = [{ x: 1, y: 5 }, { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 2, y: 5 }];
    for (const pt of corners) tiles[pt.x][pt.y].card = cross("FIRE");
    const tailSpot = { x: 3, y: 5 }; // hangs off the bottom-left corner of the loop
    tiles[tailSpot.x][tailSpot.y].card = cross("FIRE");

    const enclosed = findEnclosedTiles(tiles);
    for (const pt of corners) expect(enclosed.has(key(pt.x, pt.y))).toBe(true);
    expect(enclosed.has(key(tailSpot.x, tailSpot.y))).toBe(false);
    expect(enclosed.size).toBe(4);
  });

  it("marks every tile across two loops sharing one common tile (a figure-8)", () => {
    const { tiles } = emptyBoard();
    const loopA: Point[] = [{ x: 1, y: 5 }, { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 2, y: 5 }];
    // Second loop shares only the single corner (2,5) with the first, extending further down-left.
    const loopBUnique: Point[] = [{ x: 2, y: 4 }, { x: 3, y: 4 }, { x: 3, y: 5 }];
    for (const pt of [...loopA, ...loopBUnique]) tiles[pt.x][pt.y].card = cross("FIRE");

    const enclosed = findEnclosedTiles(tiles);
    for (const pt of [...loopA, ...loopBUnique]) expect(enclosed.has(key(pt.x, pt.y))).toBe(true);
    expect(enclosed.size).toBe(7); // 4 in loopA + 3 new in loopB (the shared corner isn't double-counted)
  });
});

describe("reachableFrom / tracePathBetween", () => {
  it("reachableFrom includes the node itself and every purely connected card", () => {
    const { tiles, nodes } = emptyBoard();
    const placed = buildChainFromNode(tiles, nodes, "WATER", 3);
    const reach = reachableFrom(tiles, { x: nodes.WATER.x, y: nodes.WATER.y });
    expect(reach.has(key(nodes.WATER.x, nodes.WATER.y))).toBe(true);
    for (const pt of placed) expect(reach.has(key(pt.x, pt.y))).toBe(true);
  });

  it("tracePathBetween finds a route through a corrupted tile (Leo's Solar Flare needs this)", () => {
    const { tiles, nodes } = emptyBoard();
    const placed = buildChainFromNode(tiles, nodes, "FIRE", 4);
    tiles[placed[1].x][placed[1].y].isCorrupted = true;

    const route = tracePathBetween(tiles, { x: nodes.FIRE.x, y: nodes.FIRE.y }, placed[3]);
    expect(route.length).toBeGreaterThan(0);
    expect(route[route.length - 1]).toEqual(placed[3]);
    expect(route.some((pt) => pt.x === placed[1].x && pt.y === placed[1].y)).toBe(true);
  });

  it("tracePathBetween returns empty when there's genuinely no connector route", () => {
    const { tiles, nodes } = emptyBoard();
    const isolated = { x: 5, y: 9 };
    tiles[isolated.x][isolated.y].card = cross("FIRE");
    const route = tracePathBetween(tiles, { x: nodes.FIRE.x, y: nodes.FIRE.y }, isolated);
    expect(route).toEqual([]);
  });
});

describe("shooting star placement spreads across distinct board quadrants", () => {
  it("places exactly one of the 4 shooting stars in each of the 4 quadrants relative to the Orrery", () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { tiles, center } = makeBoard();
      const stars: Point[] = [];
      for (const row of tiles) for (const t of row) if (t.isShootingStar) stars.push({ x: t.x, y: t.y });
      expect(stars.length).toBe(4);

      const quadrantOf = (p: Point) => (p.x < center.x ? 0 : 1) * 2 + (p.y < center.y ? 0 : 1);
      const quadrants = new Set(stars.map(quadrantOf));
      // 4 stars and 4 quadrants — every quadrant gets exactly one, with nothing left over.
      expect(quadrants.size).toBe(4);
    }
  });

  it("keeps every shooting star more than SHOOTING_STAR_NODE_MARGIN tiles from every element node", () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { tiles, nodes } = makeBoard();
      for (const row of tiles) {
        for (const t of row) {
          if (!t.isShootingStar) continue;
          for (const el of Object.keys(nodes) as (keyof typeof nodes)[]) {
            expect(manhattan(nodes[el], t)).toBeGreaterThan(2);
          }
        }
      }
    }
  });

  it("keeps the node -> star -> Orrery detour within [12,15] tiles for the large majority of quadrants holding exactly one node", () => {
    // Best-effort constraint with a graceful fallback for unlucky board layouts (two nodes sharing
    // a quadrant with conflicting needs, etc.) — see placeShootingStars' own comment — so this
    // asserts a strong majority, not literal 100%, across many random boards.
    const quadrantOf = (p: Point, center: Point) => (p.x < center.x ? 0 : 1) * 2 + (p.y < center.y ? 0 : 1);
    let checked = 0;
    let ok = 0;
    for (let attempt = 0; attempt < 300; attempt++) {
      const { tiles, center, nodes } = makeBoard();
      const nodesByQuadrant: Record<number, Element[]> = { 0: [], 1: [], 2: [], 3: [] };
      for (const el of Object.keys(nodes) as Element[]) nodesByQuadrant[quadrantOf(nodes[el], center)].push(el);
      const starsByQuadrant: Record<number, Point> = {};
      for (const row of tiles) for (const t of row) if (t.isShootingStar) starsByQuadrant[quadrantOf(t, center)] = t;
      for (let q = 0; q < 4; q++) {
        if (nodesByQuadrant[q].length !== 1) continue; // only the unambiguous single-node case
        const star = starsByQuadrant[q];
        if (!star) continue;
        const el = nodesByQuadrant[q][0];
        const d = manhattan(nodes[el], star) + manhattan(star, center);
        checked++;
        if (d >= 12 && d <= 15) ok++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(ok / checked).toBeGreaterThan(0.7);
  });
});

describe("assignShootingStarPowerUps", () => {
  // Synthetic geometry: one star per quadrant relative to a fixed center, coordinates chosen purely
  // so quadrantOf(point, center) lands where the test expects — the actual board dimensions/margins
  // don't matter here since this function only ever reads coordinates relative to `center`.
  const center: Point = { x: 5, y: 9 };
  const chosen: [number, number][] = [
    [2, 5], // quadrant 0: x < center.x, y < center.y
    [2, 12], // quadrant 1: x < center.x, y >= center.y
    [8, 5], // quadrant 2: x >= center.x, y < center.y
    [8, 12] // quadrant 3: x >= center.x, y >= center.y
  ];
  const node = (x: number, y: number): NodeInfo => ({ x, y, dir: "top" });

  it("prioritizes the configured order into distinct active-player quadrants, leaving the rest for other quadrants", () => {
    const nodes = {
      FIRE: node(2, 4), // quadrant 0
      WATER: node(2, 13), // quadrant 1
      EARTH: node(8, 4), // quadrant 2 — not active in this game
      AIR: node(8, 13) // quadrant 3 — not active in this game
    } as Record<Element, NodeInfo>;

    const result = assignShootingStarPowerUps(chosen, center, nodes, ["FIRE", "WATER"], Math.random);

    const [p1, p2] = SHOOTING_STAR_POWER_UP_PRIORITY;
    // The two active quadrants (0, 1) together hold exactly the first two priority types — which
    // physical star gets which is randomized, so compare as a set.
    expect(new Set([result[0], result[1]])).toEqual(new Set([p1, p2]));
    // The two inactive quadrants (2, 3) get whatever power-ups are left over.
    const leftover = (["TRACKER_DOWN", "BONUS_AP", "BONUS_HAND", "HEAL_UNLOCK"] as PowerUp[]).filter((t) => t !== p1 && t !== p2);
    expect(new Set([result[2], result[3]])).toEqual(new Set(leftover));
  });

  it("only guarantees as many priority items as there are distinct active quadrants (two active elements sharing one quadrant)", () => {
    const nodes = {
      FIRE: node(2, 4), // quadrant 0
      WATER: node(2, 4), // same quadrant 0 — both active elements share it
      EARTH: node(8, 4), // quadrant 2 — not active
      AIR: node(8, 13) // quadrant 3 — not active
    } as Record<Element, NodeInfo>;

    const result = assignShootingStarPowerUps(chosen, center, nodes, ["FIRE", "WATER"], Math.random);

    const [p1] = SHOOTING_STAR_POWER_UP_PRIORITY;
    expect(result[0]).toBe(p1); // only one distinct active quadrant -> only the first priority item lands there
    const rest = (["TRACKER_DOWN", "BONUS_AP", "BONUS_HAND", "HEAL_UNLOCK"] as PowerUp[]).filter((t) => t !== p1);
    expect(new Set(result.slice(1))).toEqual(new Set(rest));
  });

  it("skips prioritization entirely once every element is active (4-player game) and freely shuffles all 4 types", () => {
    const nodes = {
      FIRE: node(2, 4),
      WATER: node(2, 13),
      EARTH: node(8, 4),
      AIR: node(8, 13)
    } as Record<Element, NodeInfo>;

    const result = assignShootingStarPowerUps(chosen, center, nodes, ["FIRE", "WATER", "EARTH", "AIR"], Math.random);
    expect(new Set(result)).toEqual(new Set<PowerUp>(["TRACKER_DOWN", "BONUS_AP", "BONUS_HAND", "HEAL_UNLOCK"]));
  });
});

describe("buildEclipseDeck Damage Cards", () => {
  it("adds exactly ECLIPSE_DAMAGE_CARD_COUNT DAMAGE cards to the deck", () => {
    const deck = buildEclipseDeck();
    expect(deck.filter((c) => c.type === "DAMAGE").length).toBe(ECLIPSE_DAMAGE_CARD_COUNT);
  });

  it("copies messageKey/elements/hpLost from DAMAGE_CARDS onto each generated card", () => {
    const deck = buildEclipseDeck();
    for (const c of deck.filter((c) => c.type === "DAMAGE")) {
      const meta = DAMAGE_CARDS.find((m) => m.messageKey === c.damageMessage);
      expect(meta).toBeDefined();
      expect(c.damageElements).toEqual(meta!.elements);
      expect(c.damageHpLost).toBe(meta!.hpLost);
    }
  });

  it("only samples DAMAGE cards whose element(s) overlap the active players' elements, in a 2-3 player game", () => {
    // A card whose `elements` list spans every element (e.g. an "everyone" flavor card) is
    // legitimately eligible for ANY active-element set — it overlaps by definition — so the real
    // invariant to check is "at least one listed element is active" (matching buildEclipseDeck's
    // own eligibility filter), not "every listed element is active."
    for (let attempt = 0; attempt < 30; attempt++) {
      const deck = buildEclipseDeck(Math.random, ["FIRE", "WATER"]);
      for (const c of deck.filter((c) => c.type === "DAMAGE")) {
        expect(c.damageElements!.some((el) => el === "FIRE" || el === "WATER")).toBe(true);
      }
    }
  });

  it("still fills the full count even when only one element is active (sampling WITH replacement)", () => {
    const deck = buildEclipseDeck(Math.random, ["FIRE"]);
    const damageCards = deck.filter((c) => c.type === "DAMAGE");
    expect(damageCards.length).toBe(ECLIPSE_DAMAGE_CARD_COUNT);
    for (const c of damageCards) expect(c.damageElements!.includes("FIRE")).toBe(true);
  });
});
