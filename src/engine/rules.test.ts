import { describe, expect, it } from "vitest";
import { DIRS, DIR_KEYS } from "../constants";
import type { GameState, Sign } from "../types";
import { key } from "./board";
import { initGame } from "./reducer";
import {
  canPurify,
  getAffordablePlacements,
  getAffordablePurifyTargets,
  getValidMoves,
  getValidPlacements,
  getValidPurifyTargets,
  hasAnyAction,
  purifyCost,
  purifyDisabledReason,
  totalTurnsUntilCorruptionDecay,
  validPlacement
} from "./rules";

function freshGame(signs: [Sign, Sign]): GameState {
  return initGame([
    { name: "P1", sign: signs[0] },
    { name: "P2", sign: signs[1] }
  ]);
}

describe("validPlacement — node entry from any side", () => {
  it("accepts a card anchored to any of a node's in-bounds, obstacle-free sides — not just the one facing the Orrery", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    const node = s.nodes.FIRE;
    const p = s.players[0];

    // Only the node's own `.dir` side is guaranteed clear by board generation (see makeBoard's
    // forbidden zone) — the other in-bounds sides could rarely have a pre-placed asteroid, which
    // is expected to correctly reject placement there. So compare accepted-vs-eligible, rather
    // than assuming there are always exactly 3 clear neighbors.
    let eligible = 0;
    let accepted = 0;
    for (const d of DIR_KEYS) {
      const [dx, dy] = DIRS[d];
      const nx = node.x + dx, ny = node.y + dy;
      if (nx < 0 || nx >= 11 || ny < 0 || ny >= 19) continue;
      if (s.tiles[nx][ny].isAsteroid || s.tiles[nx][ny].isVoid) continue;
      eligible++;
      p.position = { x: node.x, y: node.y };
      const card = { id: "t", element: "FIRE" as const, connections: { top: true, right: true, bottom: true, left: true } };
      if (validPlacement(s, p, card, nx, ny)) accepted++;
    }
    expect(eligible).toBeGreaterThanOrEqual(1); // the node's own .dir side is always clear
    expect(accepted).toBe(eligible);
  });
});

describe("purify: canPurify / purifyCost / purifyDisabledReason stay in sync", () => {
  it("is unavailable and explains why when the player hasn't visited any corrupted tile", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    expect(getValidPurifyTargets(s).size).toBe(0);
    expect(canPurify(s)).toBe(false);
    expect(purifyDisabledReason(s)).toMatch(/no corrupted tile/i);
  });

  it("costs a flat 1 AP everywhere — on the player's own tile and elsewhere alike — and is available exactly when affordable", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    const p = s.players[0];
    const here = { x: p.position.x, y: p.position.y };
    const elsewhere = { x: (here.x + 1) % 11, y: here.y };
    s.tiles[here.x][here.y].isCorrupted = true;
    s.tiles[elsewhere.x][elsewhere.y].isCorrupted = true;
    p.visited[`${here.x},${here.y}`] = true;
    p.visited[`${elsewhere.x},${elsewhere.y}`] = true;

    expect(purifyCost(s, here.x, here.y)).toBe(1);
    expect(purifyCost(s, elsewhere.x, elsewhere.y)).toBe(1);

    s.ap = 0;
    expect(canPurify(s)).toBe(false);
    expect(purifyDisabledReason(s)).toMatch(/1 AP/);

    s.ap = 1;
    expect(canPurify(s)).toBe(true);
    expect(purifyDisabledReason(s)).toBeNull();
  });

  it("getAffordablePurifyTargets matches getValidPurifyTargets once the player has any AP at all, since every target is the same 1 AP price", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    const p = s.players[0];
    const here = { x: p.position.x, y: p.position.y };
    const elsewhere = { x: (here.x + 1) % 11, y: here.y };
    s.tiles[here.x][here.y].isCorrupted = true;
    s.tiles[elsewhere.x][elsewhere.y].isCorrupted = true;
    p.visited[`${here.x},${here.y}`] = true;
    p.visited[`${elsewhere.x},${elsewhere.y}`] = true;

    s.ap = 0;
    expect(getAffordablePurifyTargets(s).size).toBe(0);
    expect(getValidPurifyTargets(s).size).toBe(2); // still valid targets in principle, just unaffordable

    s.ap = 1;
    const affordable = getAffordablePurifyTargets(s);
    expect(affordable.has(`${here.x},${here.y}`)).toBe(true);
    expect(affordable.has(`${elsewhere.x},${elsewhere.y}`)).toBe(true);
  });

  it("Taurus's first purify each turn is always free (0 AP), anywhere they've walked", () => {
    const s = freshGame(["TAURUS", "CANCER"]);
    const p = s.players[0];
    const elsewhere = { x: (p.position.x + 2) % 11, y: p.position.y };
    s.tiles[elsewhere.x][elsewhere.y].isCorrupted = true;
    p.visited[`${elsewhere.x},${elsewhere.y}`] = true;
    s.ap = 0;
    expect(purifyCost(s, elsewhere.x, elsewhere.y)).toBe(0);
    expect(canPurify(s)).toBe(true);
  });
});

describe("getAffordablePlacements", () => {
  it("excludes tiles Sagittarius can't currently afford (2 AP tiles once down to 1 AP)", () => {
    const s = freshGame(["SAGITTARIUS", "CANCER"]);
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    const near = { x: node.x + dx, y: node.y + dy };
    const far = { x: near.x + dx, y: near.y + dy };
    for (const pt of [near, far]) {
      s.tiles[pt.x][pt.y].isAsteroid = false;
      s.tiles[pt.x][pt.y].isVoid = false;
    }
    // Seed an existing Fire card adjacent to the node so `far` (2 tiles from the stationary pawn)
    // is a legitimate, if pricier, placement target for Sagittarius's Astral Arrow.
    s.tiles[near.x][near.y].card = { id: "seed", element: "FIRE", connections: { top: true, right: true, bottom: true, left: true } };
    s.players[0].hand = [{ id: "c", element: "FIRE", connections: { top: true, right: true, bottom: true, left: true } }];

    s.ap = 1;
    expect(getValidPlacements(s, 0).has(key(far.x, far.y))).toBe(true); // valid in principle
    expect(getAffordablePlacements(s, 0).has(key(far.x, far.y))).toBe(false); // but costs 2 AP

    s.ap = 2;
    expect(getAffordablePlacements(s, 0).has(key(far.x, far.y))).toBe(true);
  });
});

describe("getValidMoves — requires matching connectors, not just physical adjacency", () => {
  /** Clears obstacle flags on a set of tiles so a randomly-placed asteroid/void doesn't
   * intermittently mask the connector-matching behavior these tests actually check. */
  function clearObstacles(s: GameState, pts: { x: number; y: number }[]) {
    for (const pt of pts) {
      s.tiles[pt.x][pt.y].isAsteroid = false;
      s.tiles[pt.x][pt.y].isVoid = false;
    }
  }

  it("only allows moving where the current card's own connectors face, even onto a physically-touching but unconnected card", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    const p = s.players[0];
    const here = { x: 2, y: 9 }; // row 2 / column 9: outside the center zone (3-7) and AIR/EARTH rows (0/10)
    const left = { x: here.x, y: here.y - 1 };
    const right = { x: here.x, y: here.y + 1 };
    const up = { x: here.x - 1, y: here.y };
    clearObstacles(s, [here, left, right, up]);
    p.position = here;
    s.tiles[here.x][here.y].card = { id: "here", element: "FIRE", connections: { top: false, right: true, bottom: false, left: true } };
    // Left neighbor genuinely connects back (right-facing) — should be movable.
    s.tiles[left.x][left.y].card = { id: "left", element: "FIRE", connections: { top: false, right: true, bottom: false, left: false } };
    // Right neighbor has a card but its connector doesn't face back toward `here` — physically
    // touching, not actually connected, so it must NOT be movable.
    s.tiles[right.x][right.y].card = { id: "right", element: "FIRE", connections: { top: true, right: false, bottom: true, left: false } };
    // Above `here` is a fully-connected cross card — under the old physical-adjacency-only rule
    // this would have been movable, but `here`'s own card has no top connector at all.
    s.tiles[up.x][up.y].card = { id: "up", element: "FIRE", connections: { top: true, right: true, bottom: true, left: true } };

    const moves = getValidMoves(s);
    expect(moves.has(key(left.x, left.y))).toBe(true);
    expect(moves.has(key(right.x, right.y))).toBe(false);
    expect(moves.has(key(up.x, up.y))).toBe(false);
  });

  it("treats a node/the Orrery as an always-open hub — movable in any direction with a matching neighbor", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    const node = s.nodes.FIRE;
    s.players[0].position = { x: node.x, y: node.y };
    const [dx, dy] = DIRS[node.dir];
    const facing = { x: node.x + dx, y: node.y + dy };
    clearObstacles(s, [facing]);
    s.tiles[facing.x][facing.y].card = { id: "facing", element: "FIRE", connections: { top: true, right: true, bottom: true, left: true } };
    expect(getValidMoves(s).has(key(facing.x, facing.y))).toBe(true);
  });

  it("allows stepping off a bare, cardless tile in any direction — matching reachableFrom's broken-path treatment", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    const p = s.players[0];
    const here = { x: 2, y: 9 };
    const up = { x: here.x - 1, y: here.y };
    clearObstacles(s, [here, up]);
    p.position = here;
    s.tiles[here.x][here.y].card = null; // e.g. destroyed by an asteroid
    s.tiles[here.x][here.y].node = null;
    s.tiles[here.x][here.y].isCenter = false;
    s.tiles[up.x][up.y].card = { id: "up", element: "FIRE", connections: { top: false, right: false, bottom: true, left: false } };
    expect(getValidMoves(s).has(key(up.x, up.y))).toBe(true);
  });

  it("reaches multiple tiles away in one move when AP allows, costing 1 AP per tile stepped through", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    const p = s.players[0];
    const here = { x: 2, y: 9 };
    const one = { x: here.x, y: here.y + 1 };
    const two = { x: here.x, y: here.y + 2 };
    clearObstacles(s, [here, one, two]);
    p.position = here;
    s.tiles[here.x][here.y].card = { id: "here", element: "FIRE", connections: { top: false, right: true, bottom: false, left: false } };
    s.tiles[one.x][one.y].card = { id: "one", element: "FIRE", connections: { top: false, right: true, bottom: false, left: true } };
    s.tiles[two.x][two.y].card = { id: "two", element: "FIRE", connections: { top: false, right: false, bottom: false, left: true } };

    s.ap = 3;
    const moves = getValidMoves(s);
    expect(moves.get(key(one.x, one.y))?.cost).toBe(1);
    expect(moves.get(key(two.x, two.y))?.cost).toBe(2);

    // With only 1 AP, the 2-tiles-away destination isn't reachable at all — the BFS can't spend
    // AP it doesn't have, so it never even explores past the 1-AP tile.
    s.ap = 1;
    const limited = getValidMoves(s);
    expect(limited.has(key(one.x, one.y))).toBe(true);
    expect(limited.has(key(two.x, two.y))).toBe(false);
  });
});

describe("totalTurnsUntilCorruptionDecay", () => {
  it("counts the current (in-progress) turn as the first, whether or not it belongs to the placer", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    s.active = 0; // Player 0 (the placer) is currently up
    // 1 turn left for the placer, and it's their turn right now — crumbles at the end of THIS turn.
    expect(totalTurnsUntilCorruptionDecay(s, s.players[0].id, 1)).toBe(1);
  });

  it("counts every player's turns, not just the placer's own, in a 2-player game", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    s.active = 1; // Player 1 (not the placer) is currently up
    // Placer needs 1 more of their own turns: Player 1's current turn (1), then Player 0's turn (2).
    expect(totalTurnsUntilCorruptionDecay(s, s.players[0].id, 1)).toBe(2);
    // Placer needs 2 more of their own turns: P1(1), P0(2), P1(3), P0(4).
    expect(totalTurnsUntilCorruptionDecay(s, s.players[0].id, 2)).toBe(4);
  });

  it("skips Stasis players when simulating the rotation, same as END_TURN's own reassignment", () => {
    const s = initGame([
      { name: "P1", sign: "ARIES" },
      { name: "P2", sign: "CANCER" },
      { name: "P3", sign: "GEMINI" }
    ]);
    s.active = 0;
    s.players[1].isStasis = true; // Player 1 is skipped by the rotation entirely
    // Rotation from Player 0: P0(1, placer's turn), P2(2), P0(3, 2nd placer turn) — Player 1 never
    // counted since they're in Stasis.
    expect(totalTurnsUntilCorruptionDecay(s, s.players[0].id, 2)).toBe(3);
  });

  it("returns null if every player is in Stasis (decay can never resolve)", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    s.players[0].isStasis = true;
    s.players[1].isStasis = true;
    expect(totalTurnsUntilCorruptionDecay(s, s.players[0].id, 1)).toBeNull();
  });
});

describe("hasAnyAction", () => {
  it("is false at 0 AP even with valid moves/placements available", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    s.ap = 0;
    expect(hasAnyAction(s)).toBe(false);
  });

  it("is true when the player can still move", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    s.ap = 3;
    expect(hasAnyAction(s)).toBe(true);
  });
});
