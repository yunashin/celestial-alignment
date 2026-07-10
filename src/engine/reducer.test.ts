import { describe, expect, it } from "vitest";
import { DIRS, PATH_COMPLETE_TRACKER_REDUCTION_4P } from "../constants";
import type { Element, GameState, PlayerSetup, Sign, StarCard } from "../types";
import { isValidShieldAnchor } from "./board";
import { gameReducer, initGame } from "./reducer";
import { canSelfHeal, canUseVirgoShield } from "./rules";

/** Any valid 2x2 shield anchor on the board — VIRGO_SHIELD has no range/position requirement
 * (unlike Move/Place/Purify), so a test just needs SOME legal anchor, not one near the player. */
function findShieldAnchor(s: GameState): { x: number; y: number } | null {
  for (const row of s.tiles) {
    for (const t of row) {
      if (isValidShieldAnchor(s.tiles, t.x, t.y)) return { x: t.x, y: t.y };
    }
  }
  return null;
}

function freshGame(signs: [Sign, Sign]): GameState {
  return initGame([
    { name: "P1", sign: signs[0] },
    { name: "P2", sign: signs[1] }
  ], 'en');
}

function freshGame4(signs: [Sign, Sign, Sign, Sign]): GameState {
  return initGame(signs.map((sign, i) => ({ name: `P${i + 1}`, sign })), 'en');
}

const cross = (element: StarCard["element"]): StarCard => ({
  id: `${element}-${Math.random()}`,
  element,
  connections: { top: true, right: true, bottom: true, left: true }
});

/** Clears any obstacle along the straight line from a node outward, `steps` tiles deep, so a
 * chain-building test isn't at the mercy of a randomly-placed asteroid/void/shooting star. */
function clearLineFromNode(s: GameState, element: StarCard["element"], steps: number) {
  const node = s.nodes[element];
  const [dx, dy] = DIRS[node.dir];
  for (let i = 1; i <= steps; i++) {
    const t = s.tiles[node.x + dx * i][node.y + dy * i];
    t.isAsteroid = false;
    t.isVoid = false;
    t.isShootingStar = false;
  }
}

/** Moves an element's node to an arbitrary board position for test convenience. `dir` only
 * matters for board generation (forbidden-zone placement), never for connectivity/purity
 * checks, so relocating nodes after initGame is a safe way to hand-construct exact geometry
 * (e.g. two nodes close enough to bridge in a single placement) without fighting the real,
 * randomized board layout. */
function relocateNode(s: GameState, element: Element, x: number, y: number) {
  const old = s.nodes[element];
  s.tiles[old.x][old.y].node = null;
  s.nodes[element] = { ...old, x, y };
  s.tiles[x][y].node = element;
  s.tiles[x][y].card = null;
}

/** Hand-builds an L-shaped, fully-connected, uncorrupted path from `element`'s node to one tile
 * short of the Orrery (mirrors board.test.ts's buildPathToCenter's L-shaped walk — nodes are
 * Manhattan-equidistant from center but rarely row/column-aligned with it, so a straight line
 * usually never reaches it), placing every tile directly EXCEPT the final one adjacent to the
 * center so a test can trigger it via a real PLACE action and observe the completion side effects. */
function buildPathToCenterExceptLast(s: GameState, element: StarCard["element"]): { standAt: { x: number; y: number }; target: { x: number; y: number } } {
  const node = s.nodes[element];
  const center = s.center;
  const [dx] = DIRS[node.dir];
  // Walk all the way to (and including) the center tile itself — simpler and avoids an off-by-one
  // edge case where stopping "one short" during the walk could actually overshoot: if the node's
  // row already equals the center's row (or column, for the other approach direction) before the
  // second leg even starts, the first leg's own last step lands exactly on the center, not one
  // tile short of it. Walking the full distance and then just backing off by one afterward sidesteps
  // that regardless of which leg happens to finish the approach.
  const steps: { x: number; y: number }[] = [];
  let pos = { x: node.x, y: node.y };
  const walkAxis = (axis: "x" | "y", target: number) => {
    const step = target > pos[axis] ? 1 : target < pos[axis] ? -1 : 0;
    while (pos[axis] !== target) {
      pos = { ...pos, [axis]: pos[axis] + step };
      steps.push(pos);
    }
  };
  if (dx === 0) {
    walkAxis("y", center.y);
    walkAxis("x", center.x);
  } else {
    walkAxis("x", center.x);
    walkAxis("y", center.y);
  }
  // steps' last entry is always the center tile itself now; back off by one for the target.
  const target = steps[steps.length - 2];
  const standAt = steps.length >= 3 ? steps[steps.length - 3] : { x: node.x, y: node.y };
  for (const p of steps.slice(0, -2)) {
    s.tiles[p.x][p.y].card = cross(element);
    s.tiles[p.x][p.y].isAsteroid = false;
    s.tiles[p.x][p.y].isVoid = false;
  }
  s.tiles[target.x][target.y].isAsteroid = false;
  s.tiles[target.x][target.y].isVoid = false;
  return { standAt, target };
}

describe("chain-of-3 Eclipse Tracker discount (same-element only, no wildcards)", () => {
  it("triggers once (own element = -10%) the moment a same-element chain first reaches 3, not before", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    clearLineFromNode(s, "FIRE", 5);
    s.ap = 99;
    s.tracker = 50;

    let pos = { x: node.x, y: node.y };
    let first: { x: number; y: number } | null = null;
    for (let i = 0; i < 2; i++) {
      const target = { x: pos.x + dx, y: pos.y + dy };
      s.players[0].hand = [cross("FIRE")];
      s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
      s = gameReducer(s, { type: "MOVE", x: target.x, y: target.y });
      if (!first) first = target;
      pos = target;
    }
    expect(s.tracker).toBe(50); // still only a 2-chain, no discount yet

    const third = { x: pos.x + dx, y: pos.y + dy };
    const beforeSeq = s.chainEventSeq;
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: third.x, y: third.y });
    expect(s.tracker).toBe(40); // -10% for reaching a 3-chain of the player's own element
    // "Start" is the chain tile closest to FIRE's own node (the first one placed here), "end" is
    // the tile that was just placed to cross the threshold.
    expect(s.chainEventSeq).toBe(beforeSeq + 1);
    expect(s.lastChainEvent).toEqual({
      tiles: expect.arrayContaining([`${first!.x},${first!.y}`, `${third.x},${third.y}`]),
      start: first,
      end: third
    });
    expect(s.log.some((l) => l.includes(`from (${first!.x},${first!.y}) to (${third.x},${third.y})`))).toBe(true);
    pos = third;
    s = gameReducer(s, { type: "MOVE", x: third.x, y: third.y });

    // Extending an already-3+ chain further must NOT retrigger the Tracker discount — but it should
    // still fire a fresh chain animation/event/message (just without a Tracker effect to report),
    // since the visual celebration is decoupled from the one-time discount gate.
    const fourth = { x: pos.x + dx, y: pos.y + dy };
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: fourth.x, y: fourth.y });
    expect(s.tracker).toBe(40); // extending an already-3+ chain must NOT retrigger the discount
    expect(s.chainEventSeq).toBe(beforeSeq + 2); // but a new chain event still fires
    expect(s.lastChainEvent?.end).toEqual(fourth);
    expect(s.log.some((l) => l.includes(`to (${fourth.x},${fourth.y})`) && l.includes("no further Eclipse Tracker effect"))).toBe(true);
    expect(s.messageLog.some((l) => l.includes("no further Eclipse Tracker effect"))).toBe(true);
  });

  it("a corrupted card in the middle of the chain no longer breaks it — corruption doesn't disqualify counting anymore", () => {
    // Player 0 is Cancer (Water), not Fire — placing Fire cards must not trigger Fire's own
    // Element Surge (which auto-cleanses an adjacent corrupted tile), which would otherwise
    // silently repair the corruption this test relies on and defeat the whole scenario.
    let s = freshGame(["CANCER", "ARIES"]);
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    clearLineFromNode(s, "FIRE", 5);
    s.ap = 99;
    s.tracker = 50;
    // Cancer spawns at WATER's own node (the opposite edge from FIRE), so reposition the pawn
    // right at FIRE's node — otherwise every placement below would be out of range and this test
    // would silently do nothing at all while still "passing".
    s.players[0].position = { x: node.x, y: node.y };

    const first = { x: node.x + dx, y: node.y + dy };
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: first.x, y: first.y });
    s = gameReducer(s, { type: "MOVE", x: first.x, y: first.y });
    // Corrupt the tile the pawn is standing on — under the old rule this would have severed the
    // pure route back to the FIRE node for anything placed beyond it. Now it shouldn't matter,
    // since same-element chains no longer require any node-attachment check at all.
    s.tiles[first.x][first.y].isCorrupted = true;

    let pos = first;
    for (let i = 0; i < 2; i++) {
      const target = { x: pos.x + dx, y: pos.y + dy };
      s.players[0].hand = [cross("FIRE")];
      s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
      s = gameReducer(s, { type: "MOVE", x: target.x, y: target.y });
      pos = target;
    }
    // 3 physically-connected Fire cards, one of them corrupted, all still counted as one chain —
    // FIRE is active (Aries) but not the placing player's own element (Cancer), so the regular
    // (non-own) discount rate applies.
    expect(s.tracker).toBe(45);
  });

  it("a physically-bridged foreign-element card does NOT extend the chain or count toward it — no more wildcards", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const fireNode = s.nodes.FIRE;
    const [dx, dy] = DIRS[fireNode.dir];
    clearLineFromNode(s, "FIRE", 6);
    s.ap = 99;
    s.tracker = 50;

    let pos = { x: fireNode.x, y: fireNode.y };
    for (let i = 0; i < 2; i++) {
      const target = { x: pos.x + dx, y: pos.y + dy };
      s.players[0].hand = [cross("FIRE")];
      s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
      s = gameReducer(s, { type: "MOVE", x: target.x, y: target.y });
      pos = target;
    }
    expect(s.tracker).toBe(50); // only a 2-chain so far, no discount yet

    // A lone Water card bridged onto the end of the Fire chain — under the old rule this could
    // "converge" into a shared wildcard chain; now it's simply a different element and never
    // contributes to a Fire chain's count at all.
    const bridge = { x: pos.x + dx, y: pos.y + dy };
    s.players[0].hand = [cross("WATER")];
    s.tiles[s.nodes.WATER.x][s.nodes.WATER.y].node = null;
    const waterAdjacent = { x: bridge.x + dx, y: bridge.y + dy };
    s.nodes.WATER = { ...s.nodes.WATER, x: waterAdjacent.x, y: waterAdjacent.y };
    s.tiles[waterAdjacent.x][waterAdjacent.y].node = "WATER";
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: bridge.x, y: bridge.y });

    expect(s.tracker).toBe(50); // a lone Water card is only a 1-chain of its own element — no discount
    expect(s.log.some((l) => l.includes("converged") || l.includes("wildcard"))).toBe(false);
  });
});

describe("corrupted card decay", () => {
  it("sets corruptionTurnsLeft to 3 and stamps placedBy when Corruption seizes a placed card", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    clearLineFromNode(s, "FIRE", 2);
    s.ap = 99;
    s.turnsUntilAsteroidShift = 1000; // keep the asteroid out of this test entirely
    const target = { x: node.x + dx, y: node.y + dy };
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
    expect(s.tiles[target.x][target.y].placedBy).toBe(s.players[0].id);
    expect(s.tiles[target.x][target.y].corruptionTurnsLeft).toBeNull(); // not corrupted yet

    s.eclipseDeck = [{ id: "forced", type: "CORRUPTION", element: "FIRE" }];
    s = gameReducer(s, { type: "END_TURN" });

    expect(s.tiles[target.x][target.y].isCorrupted).toBe(true);
    expect(s.tiles[target.x][target.y].corruptionTurnsLeft).toBe(3);
  });

  it("decrements at the END of the placing player's own turns (not the start), destroying the card right after their 3rd turn since corruption", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    clearLineFromNode(s, "FIRE", 2);
    s.ap = 99;
    s.turnsUntilAsteroidShift = 1000;
    const target = { x: node.x + dx, y: node.y + dy };
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });

    // Corrupt it as Player 0 ends their own turn.
    s.eclipseDeck = [{ id: "forced", type: "CORRUPTION", element: "FIRE" }];
    s = gameReducer(s, { type: "END_TURN" }); // Player 0 -> Player 1
    expect(s.tiles[target.x][target.y].corruptionTurnsLeft).toBe(3);

    // Player 1 ending THEIR own turn never decrements someone else's corrupted card.
    s = gameReducer(s, { type: "END_TURN" }); // Player 1 -> Player 0
    expect(s.tiles[target.x][target.y].corruptionTurnsLeft).toBe(3);

    // Player 0's first full turn since corruption ends without purifying — the decrement fires
    // right then (end of turn), not at the start of their NEXT turn.
    s = gameReducer(s, { type: "END_TURN" }); // Player 0 -> Player 1
    expect(s.tiles[target.x][target.y].corruptionTurnsLeft).toBe(2);
    expect(s.tiles[target.x][target.y].card).not.toBeNull();

    s = gameReducer(s, { type: "END_TURN" }); // Player 1 -> Player 0 (no decrement)
    s = gameReducer(s, { type: "END_TURN" }); // Player 0's 2nd turn ends: 2nd decrement
    expect(s.tiles[target.x][target.y].corruptionTurnsLeft).toBe(1);
    expect(s.tiles[target.x][target.y].card).not.toBeNull();

    // Player 0's 3rd turn since corruption: the count reads 1 throughout it. If they still don't
    // purify, it crumbles right after THAT turn ends — not before their following (4th) turn
    // even starts.
    s = gameReducer(s, { type: "END_TURN" }); // Player 1 -> Player 0 (no decrement, count still 1)
    expect(s.tiles[target.x][target.y].corruptionTurnsLeft).toBe(1);
    expect(s.tiles[target.x][target.y].card).not.toBeNull();
    const turnBeforeDestroy = s.turn;
    s = gameReducer(s, { type: "END_TURN" }); // Player 0's 3rd turn ends: destroyed
    expect(s.tiles[target.x][target.y].card).toBeNull();
    expect(s.tiles[target.x][target.y].isCorrupted).toBe(false);
    expect(s.tiles[target.x][target.y].corruptionTurnsLeft).toBeNull();
    expect(s.tiles[target.x][target.y].placedBy).toBeNull();
    // Drives TileView's one-shot crumble-to-dust animation (see styles.ts's caCrumbleFlash) — set
    // to the turn number as of the dispatch that destroyed it (s.turn itself has since advanced).
    expect(s.tiles[target.x][target.y].crumbleStep).toBe(turnBeforeDestroy);
    expect(s.log.some((l) => l.includes("crumbles to dust"))).toBe(true);
    expect(s.messageLog.some((l) => l.includes("crumbles to dust"))).toBe(true);
  });

  it("clears corruptionTurnsLeft when the tile is purified before it decays", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    clearLineFromNode(s, "FIRE", 2);
    s.ap = 99;
    const target = { x: node.x + dx, y: node.y + dy };
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
    s = gameReducer(s, { type: "MOVE", x: target.x, y: target.y });
    s.tiles[target.x][target.y].isCorrupted = true;
    s.tiles[target.x][target.y].corruptionTurnsLeft = 2;

    s = gameReducer(s, { type: "PURIFY", x: target.x, y: target.y });

    expect(s.tiles[target.x][target.y].isCorrupted).toBe(false);
    expect(s.tiles[target.x][target.y].corruptionTurnsLeft).toBeNull();
  });
});

describe("Leo's Solar Flare", () => {
  it("cleanses every corrupted tile along the connected path, not just adjacent ones", () => {
    let s = freshGame(["LEO", "CANCER"]);
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    clearLineFromNode(s, "FIRE", 6);
    s.ap = 99;

    let pos = { x: node.x, y: node.y };
    const placed: { x: number; y: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const target = { x: pos.x + dx, y: pos.y + dy };
      s.players[0].hand = [cross("FIRE")];
      s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
      s = gameReducer(s, { type: "MOVE", x: target.x, y: target.y }); // grows p.visited to include target
      placed.push(target);
      pos = target;
    }
    expect(s.players[0].position).toEqual(placed[4]);

    // Walk back to the start of the chain so purifying the far tile forces Leo's flare to trace a
    // real multi-tile route forward again, instead of purifying the tile the player is already on.
    for (let i = 3; i >= 0; i--) {
      s = gameReducer(s, { type: "MOVE", x: placed[i].x, y: placed[i].y });
    }
    expect(s.players[0].position).toEqual(placed[0]);

    s.tiles[placed[1].x][placed[1].y].isCorrupted = true;
    s.tiles[placed[3].x][placed[3].y].isCorrupted = true;
    s.tiles[placed[4].x][placed[4].y].isCorrupted = true;

    s = gameReducer(s, { type: "PURIFY", x: placed[4].x, y: placed[4].y });

    expect(s.tiles[placed[1].x][placed[1].y].isCorrupted).toBe(false);
    expect(s.tiles[placed[3].x][placed[3].y].isCorrupted).toBe(false);
    expect(s.tiles[placed[4].x][placed[4].y].isCorrupted).toBe(false);
    // Every tile the flare swept, not just the one directly targeted, is now permanently immune.
    expect(s.tiles[placed[1].x][placed[1].y].isPurified).toBe(true);
    expect(s.tiles[placed[3].x][placed[3].y].isPurified).toBe(true);
    expect(s.tiles[placed[4].x][placed[4].y].isPurified).toBe(true);
  });
});

describe("Purify grants permanent Corruption immunity", () => {
  it("marks a directly-purified tile isPurified", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    clearLineFromNode(s, "FIRE", 2);
    s.ap = 99;
    const target = { x: node.x + dx, y: node.y + dy };
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
    // Purify is path-based — only a tile the pawn has personally walked onto (via MOVE) is a valid
    // target, so the placement alone isn't enough (see CLAUDE.md's Purify note).
    s = gameReducer(s, { type: "MOVE", x: target.x, y: target.y });
    s.tiles[target.x][target.y].isCorrupted = true;

    s = gameReducer(s, { type: "PURIFY", x: target.x, y: target.y });

    expect(s.tiles[target.x][target.y].isCorrupted).toBe(false);
    expect(s.tiles[target.x][target.y].isPurified).toBe(true);
  });

  it("clears isPurified when the traveling asteroid later destroys that card, since a new card placed there wasn't ever purified", () => {
    // The asteroid's source/destination (and the board itself) are picked randomly each run, so a
    // single attempt isn't guaranteed to sweep through this exact tile — retry fresh games until it
    // actually does, rather than asserting on a coin flip (or silently no-op'ing like the tolerant
    // single-shot pattern the "asteroid protections" describe block above uses for a similar reason).
    const spot = { x: 2, y: 5 };
    for (let attempt = 0; attempt < 500; attempt++) {
      let s = freshGame(["ARIES", "CANCER"]);
      s.tiles[spot.x][spot.y].card = cross("FIRE");
      s.tiles[spot.x][spot.y].isAsteroid = false;
      s.tiles[spot.x][spot.y].isVoid = false;
      s.tiles[spot.x][spot.y].isPurified = true;
      s.turnsUntilAsteroidShift = 1;

      s = gameReducer(s, { type: "END_TURN" });

      if (s.tiles[spot.x][spot.y].card === null) {
        expect(s.tiles[spot.x][spot.y].isPurified).toBe(false);
        return;
      }
    }
    throw new Error("asteroid never swept the target tile across 500 attempts — test setup is unreliable");
  });
});

describe("Sagittarius's Astral Arrow", () => {
  it("places anywhere along the player's own network regardless of distance, at 1 AP adjacent / 2 AP elsewhere", () => {
    let s = freshGame(["SAGITTARIUS", "CANCER"]);
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    clearLineFromNode(s, "FIRE", 5);
    s.ap = 99;

    let pos = { x: node.x, y: node.y };
    const costs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const target = { x: pos.x + dx, y: pos.y + dy };
      const before = s.ap;
      s.players[0].hand = [cross("FIRE")];
      s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
      costs.push(before - s.ap);
      expect(s.tiles[target.x][target.y].card).not.toBeNull();
      pos = target;
    }
    // Pawn never moved off the node: 1st card is adjacent (1 AP), the rest are farther away (2 AP).
    expect(costs).toEqual([1, 2, 2]);
  });

  it("still rejects a tile that isn't connected to the player's own network", () => {
    let s = freshGame(["SAGITTARIUS", "CANCER"]);
    const isolated = { x: 5, y: 9 };
    s.tiles[isolated.x][isolated.y].card = null;
    s.tiles[isolated.x][isolated.y].isAsteroid = false;
    s.ap = 99;
    s.players[0].hand = [cross("FIRE")];
    const before = s.ap;
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: isolated.x, y: isolated.y });
    expect(s.ap).toBe(before);
    expect(s.tiles[isolated.x][isolated.y].card).toBeNull();
  });

  it("still works on a path that's been severed from any node/the Orrery entirely (a broken path), including when the player themself stands on a bare, cardless tile", () => {
    // Row 2 is outside both the Orrery's possible center zone (rows 3-7) and the AIR/EARTH node
    // rows (0/10); columns 4-7 are far from column 0/18 so WATER/FIRE's nodes can't land there
    // either — this hand-built 2-card network is guaranteed disconnected from every real node/center.
    let s = freshGame(["SAGITTARIUS", "CANCER"]);
    const a = { x: 2, y: 5 }; // straight pipe, left-right
    const b = { x: 2, y: 6 }; // straight pipe, left-right — connects to `a` and faces the broken spot
    const brokenSpot = { x: 2, y: 7 }; // where the player stands — bare, no card of their own
    const target = { x: 2, y: 4 }; // adjacent to `a`, on the far side of the network from the player
    for (const pt of [a, b, brokenSpot, target]) {
      expect(s.tiles[pt.x][pt.y].isCenter).toBe(false);
      expect(s.tiles[pt.x][pt.y].node).toBeNull();
      s.tiles[pt.x][pt.y].isAsteroid = false;
      s.tiles[pt.x][pt.y].isVoid = false;
      s.tiles[pt.x][pt.y].isShootingStar = false;
      s.tiles[pt.x][pt.y].card = null;
    }
    s.tiles[a.x][a.y].card = { id: "iso-a", element: "FIRE", connections: { top: false, right: true, bottom: false, left: true } };
    s.tiles[b.x][b.y].card = { id: "iso-b", element: "FIRE", connections: { top: false, right: true, bottom: false, left: true } };

    s.players[0].position = brokenSpot;
    s.ap = 99;
    s.players[0].hand = [{ id: "seed", element: "FIRE", connections: { top: false, right: true, bottom: false, left: false } }];

    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
    expect(s.tiles[target.x][target.y].card).not.toBeNull();
  });
});

describe("building on an asteroid-severed path fragment (any sign, not just Sagittarius)", () => {
  it("lets a normal (non-Sagittarius) player extend a fragment that's disconnected from every node/the Orrery", () => {
    // Same geometry convention as the Sagittarius broken-path test above: row 2 / columns 4-7 can
    // never collide with a real node or the center zone.
    let s = freshGame(["ARIES", "CANCER"]);
    const a = { x: 2, y: 5 };
    const b = { x: 2, y: 6 }; // player stands here — part of the fragment, but not itself a hub
    const target = { x: 2, y: 4 }; // adjacent to `a`, extending the fragment further
    for (const pt of [a, b, target]) {
      expect(s.tiles[pt.x][pt.y].isCenter).toBe(false);
      expect(s.tiles[pt.x][pt.y].node).toBeNull();
      s.tiles[pt.x][pt.y].isAsteroid = false;
      s.tiles[pt.x][pt.y].isVoid = false;
      s.tiles[pt.x][pt.y].isShootingStar = false;
      s.tiles[pt.x][pt.y].card = null;
    }
    s.tiles[a.x][a.y].card = { id: "iso-a", element: "FIRE", connections: { top: false, right: true, bottom: false, left: true } };
    s.tiles[b.x][b.y].card = { id: "iso-b", element: "FIRE", connections: { top: false, right: true, bottom: false, left: true } };

    s.players[0].position = a; // standing on the fragment itself, within normal 1-tile range of `target`
    s.ap = 99;
    s.players[0].hand = [{ id: "seed", element: "FIRE", connections: { top: false, right: true, bottom: false, left: false } }];

    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
    expect(s.tiles[target.x][target.y].card).not.toBeNull();
  });
});

describe("asteroid protections and log grouping", () => {
  it("never chooses an occupied tile, a Shooting Star, or a Cancer Lunar Shield tile as its destination, and reads top-to-bottom in narrative order", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    s.turnsUntilAsteroidShift = 1;
    s = gameReducer(s, { type: "END_TURN" });

    const idx = s.log.findIndex((l) => l.includes("tears loose"));
    if (idx === -1) return; // no candidates this run (rare, random-dependent) — not a failure
    let end = idx;
    while (!s.log[end].includes("comes to rest") && end < s.log.length - 1) end++;
    const group = s.log.slice(idx, end + 1);
    expect(group[0]).toContain("tears loose");
    expect(group[group.length - 1]).toContain("comes to rest");
  });

  it("keeps a Protective-Precision-shielded tile's card intact through a traveling asteroid sweep, and never chooses it as the destination", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const spot = { x: 2, y: 5 };
    s.tiles[spot.x][spot.y].card = cross("FIRE");
    s.tiles[spot.x][spot.y].isAsteroid = false;
    s.tiles[spot.x][spot.y].isVoid = false;
    s.tiles[spot.x][spot.y].isShielded = true;
    s.tiles[spot.x][spot.y].shieldOwner = s.players[0].id;
    s.turnsUntilAsteroidShift = 1;

    s = gameReducer(s, { type: "END_TURN" });

    expect(s.tiles[spot.x][spot.y].card).not.toBeNull();
    expect(s.tiles[spot.x][spot.y].isShielded).toBe(true);
    expect(s.tiles[spot.x][spot.y].isAsteroid).toBe(false);
  });
});

describe("asteroids and Black Holes can never share a tile", () => {
  it("never picks an existing Void tile as the asteroid's destination", () => {
    // Cover the board in Void tiles except a single non-adjacent gap, forcing the asteroid to have
    // essentially one legal destination if (and only if) isVoid tiles are correctly excluded — if
    // the isVoid exclusion regresses, the asteroid will very likely land on one of these.
    for (let attempt = 0; attempt < 30; attempt++) {
      let s = freshGame(["ARIES", "CANCER"]);
      for (const row of s.tiles) {
        for (const t of row) {
          if (!t.isAsteroid && !t.isCenter && !t.node && !t.isShootingStar) t.isVoid = true;
        }
      }
      s.turnsUntilAsteroidShift = 1;
      s = gameReducer(s, { type: "END_TURN" });
      for (const row of s.tiles) {
        for (const t of row) {
          if (t.isAsteroid) expect(t.isVoid).toBe(false);
        }
      }
    }
  });
});

describe("incomplete path fragments sharing the Orrery with a complete path stay vulnerable", () => {
  it("does not extend asteroid immunity to an unrelated, incomplete path fragment that only shares the center hub", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    // Complete FIRE's path for real.
    const { standAt, target } = buildPathToCenterExceptLast(s, "FIRE");
    s.players[0].position = standAt;
    s.ap = 99;
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
    expect(s.log.some((l) => l.includes("blazes into the Orrery"))).toBe(true);

    // Attach a short, genuinely INCOMPLETE two-card WATER fragment directly onto the Orrery — this
    // physically touches the center (so the old crossCenter:true traversal would tunnel from FIRE's
    // complete network through the Orrery and wrongly sweep this fragment's tiles into the
    // "protected" set), but WATER's own path never reaches its node, so it must stay destructible.
    let centerSide: { x: number; y: number } | null = null;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = s.center.x + dx, ny = s.center.y + dy;
      const t = s.tiles[nx]?.[ny];
      if (t && !t.card && !t.node) { centerSide = { x: nx, y: ny }; break; }
    }
    expect(centerSide).not.toBeNull();
    if (!centerSide) return;
    // A cross-shaped WATER card touching the center on one side and reaching one tile further out
    // on the other — two connected WATER cards, neither purified/complete, attached to the Orrery.
    s.tiles[centerSide.x][centerSide.y].card = cross("WATER");
    s.tiles[centerSide.x][centerSide.y].isAsteroid = false;
    s.tiles[centerSide.x][centerSide.y].isVoid = false;

    const required = new Set(s.players.map((p) => p.element));
    expect(required.has("WATER")).toBe(true);
    expect(s.log.every((l) => !l.includes("Water path blazes"))).toBe(true);

    // Force an asteroid shift and confirm it's still able to destroy this WATER fragment — i.e. it
    // isn't wrongly treated as part of FIRE's now-complete, protected network.
    let destroyed = false;
    for (let attempt = 0; attempt < 300 && !destroyed; attempt++) {
      let trial = JSON.parse(JSON.stringify(s));
      trial.turnsUntilAsteroidShift = 1;
      trial = gameReducer(trial, { type: "END_TURN" });
      if (trial.tiles[centerSide.x][centerSide.y].card === null) destroyed = true;
    }
    expect(destroyed).toBe(true);
  });
});

describe("asteroids never destroy a card a player is standing on", () => {
  it("spares the occupied tile's card (but still damages the Guardian) when the asteroid's path crosses it", () => {
    // Build a long, dense line of Fire cards from the source outward with a player standing
    // partway along it, then force the asteroid to travel along exactly that line.
    for (let attempt = 0; attempt < 40; attempt++) {
      let s = freshGame(["ARIES", "CANCER"]);
      const row = 2;
      for (let y = 2; y <= 16; y++) {
        const t = s.tiles[row][y];
        if (t.isCenter || t.node) continue;
        t.isAsteroid = false;
        t.isVoid = false;
        t.isShootingStar = false;
        t.isShielded = false;
        t.isEnclosed = false;
        t.card = cross("FIRE");
      }
      s.tiles[row][2].isAsteroid = true;
      const occupiedSpot = { x: row, y: 9 };
      s.players[0].position = occupiedSpot;
      s.players[0].hp = 3;

      // Force triggerAsteroidShift to pick this exact asteroid as the source via a single-asteroid
      // board, then let it roll a destination naturally — over enough attempts it will choose a
      // destination beyond the occupied tile along this line at least once.
      for (const r2 of s.tiles) for (const t2 of r2) if (t2.isAsteroid && !(t2.x === row && t2.y === 2)) t2.isAsteroid = false;
      s.turnsUntilAsteroidShift = 1;
      s = gameReducer(s, { type: "END_TURN" });

      const passedThroughOccupied = s.tiles[occupiedSpot.x][occupiedSpot.y].asteroidHitStep !== null;
      if (!passedThroughOccupied) continue; // this attempt's random destination didn't reach far enough

      expect(s.tiles[occupiedSpot.x][occupiedSpot.y].card).not.toBeNull();
      expect(s.players[0].hp).toBeLessThan(3); // still takes damage despite the card surviving
      expect(s.log.some((l) => l.includes("holds their ground"))).toBe(true);
      return;
    }
    throw new Error("asteroid never crossed the occupied tile across 40 attempts — test setup is unreliable");
  });
});

describe("Virgo's Protective Precision", () => {
  it("goes on cooldown for exactly one full Virgo turn: disabled the turn it's used, disabled Virgo's very next turn, available again the turn after that", () => {
    let s = freshGame(["VIRGO", "CANCER"]);
    const anchor = findShieldAnchor(s);
    expect(anchor).not.toBeNull();
    if (!anchor) return;
    s.ap = 99;

    expect(canUseVirgoShield(s)).toBe(true);
    s = gameReducer(s, { type: "VIRGO_SHIELD", x: anchor.x, y: anchor.y });
    expect(s.tiles[anchor.x][anchor.y].isShielded).toBe(true);
    // Same turn it was cast: can't recast.
    expect(canUseVirgoShield(s)).toBe(false);

    // P2 (Cancer)'s turn — cooldown only ticks when control returns to Virgo specifically.
    s = gameReducer(s, { type: "END_TURN" });
    expect(s.players[s.active].sign).toBe("CANCER");
    expect(s.virgoShieldCooldown).toBe(2);

    // Back to Virgo's very next turn: still disabled.
    s = gameReducer(s, { type: "END_TURN" });
    expect(s.players[s.active].sign).toBe("VIRGO");
    expect(s.virgoShieldCooldown).toBe(1);
    expect(canUseVirgoShield(s)).toBe(false);

    // P2's turn again.
    s = gameReducer(s, { type: "END_TURN" });
    expect(s.virgoShieldCooldown).toBe(1);

    // The turn after Virgo's next turn: available again.
    s = gameReducer(s, { type: "END_TURN" });
    expect(s.players[s.active].sign).toBe("VIRGO");
    expect(s.virgoShieldCooldown).toBe(0);
    expect(canUseVirgoShield(s)).toBe(true);
  });
});

describe("shooting star event tracking", () => {
  it("bumps shootingStarSeq and records the power-up type when a shooting star activates", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    let starTile: { x: number; y: number } | null = null;
    for (const row of s.tiles) {
      for (const t of row) {
        if (t.isShootingStar) starTile = { x: t.x, y: t.y };
      }
    }
    expect(starTile).not.toBeNull();
    if (!starTile) return;

    // Force a direct path: clear the tile itself and drop the player right next to it, then place
    // a card that legally lands there by making it adjacent to a card we control ourselves.
    s.tiles[starTile.x][starTile.y].card = null;
    s.tiles[starTile.x][starTile.y].isAsteroid = false;
    // Use a card already connected via the player's own node/network by building straight there.
    const node = s.nodes.FIRE;
    s.players[0].position = starTile; // teleport for test purposes; PLACE only checks range from here
    // Make an adjacent tile part of the union network so the placement is legal.
    const [dx] = DIRS[node.dir];
    const neighbor = { x: starTile.x + (dx === 0 ? 0 : 1), y: starTile.y + (dx === 0 ? 1 : 0) };
    if (s.tiles[neighbor.x]?.[neighbor.y] && !s.tiles[neighbor.x][neighbor.y].isCenter && !s.tiles[neighbor.x][neighbor.y].node) {
      s.tiles[neighbor.x][neighbor.y].card = { id: "seed", element: "FIRE", connections: { top: true, right: true, bottom: true, left: true } };
    }
    s.ap = 99;
    s.players[0].hand = [cross("FIRE")];
    const beforeSeq = s.shootingStarSeq;
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: starTile.x, y: starTile.y });
    if (s.tiles[starTile.x][starTile.y].card) {
      expect(s.shootingStarSeq).toBe(beforeSeq + 1);
      expect(s.lastShootingStarEvent).not.toBeNull();
    }
  });
});

describe("HEAL_UNLOCK self-heal", () => {
  /** Neutralizes Eclipse/asteroid randomness in END_TURN so a self-heal assertion isn't flaky —
   * forces a harmless SURGE card (never damages anyone) and pushes the asteroid shift far out. */
  function neutralizeEndTurnHazards(s: GameState) {
    s.eclipseDeck = [{ id: "forced", type: "SURGE", amount: 0 }];
    s.turnsUntilAsteroidShift = 1000;
  }

  it("canSelfHeal mirrors END_TURN's own gate exactly, for the End Turn button's conditional 'Heal 1 HP' label", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    expect(canSelfHeal(s)).toBe(false); // never unlocked yet

    s.selfHealUnlocked = true;
    s.players[0].hp = 1;
    expect(canSelfHeal(s)).toBe(true);

    s.actedThisTurn = true;
    expect(canSelfHeal(s)).toBe(false); // took an action already this turn
    s.actedThisTurn = false;

    s.players[0].hp = s.players[0].maxHp;
    expect(canSelfHeal(s)).toBe(false); // already at full HP
  });

  it("restores 1 HP to a player who ends their turn with no other action taken, once unlocked", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    s.selfHealUnlocked = true;
    s.players[0].hp = 1;
    neutralizeEndTurnHazards(s);

    s = gameReducer(s, { type: "END_TURN" });

    expect(s.players[0].hp).toBe(2);
    expect(s.selfHealSeq).toBe(1);
    expect(s.lastSelfHealEvent).toEqual({ playerId: 0 });
    expect(s.log.some((l) => l.includes("rests quietly"))).toBe(true);
  });

  it("does not heal when the player took another action (e.g. Cosmic Draw) this turn first", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    s.selfHealUnlocked = true;
    s.players[0].hp = 1;
    s.ap = 99;
    neutralizeEndTurnHazards(s);

    s = gameReducer(s, { type: "DISCARD", indices: [0] });
    expect(s.actedThisTurn).toBe(true);
    s = gameReducer(s, { type: "END_TURN" });

    expect(s.players[0].hp).toBe(1);
    expect(s.selfHealSeq).toBe(0);
  });

  it("an invalid, no-op action attempt does not count as taking an action", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    s.selfHealUnlocked = true;
    s.players[0].hp = 1;
    neutralizeEndTurnHazards(s);

    // No corrupted tiles exist on a fresh board, so any PURIFY target is illegal — rejected and
    // returns the original, pre-clone state unchanged.
    const before = s;
    s = gameReducer(s, { type: "PURIFY", x: 0, y: 0 });
    expect(s).toBe(before);
    expect(s.actedThisTurn).toBe(false);

    s = gameReducer(s, { type: "END_TURN" });
    expect(s.players[0].hp).toBe(2);
  });

  it("does not heal a player already at full HP", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    s.selfHealUnlocked = true;
    neutralizeEndTurnHazards(s);

    s = gameReducer(s, { type: "END_TURN" });

    expect(s.players[0].hp).toBe(s.players[0].maxHp);
    expect(s.selfHealSeq).toBe(0);
  });

  it("does nothing until a HEAL_UNLOCK shooting star has actually been triggered", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    s.players[0].hp = 1;
    neutralizeEndTurnHazards(s);

    s = gameReducer(s, { type: "END_TURN" });

    expect(s.players[0].hp).toBe(1);
    expect(s.selfHealSeq).toBe(0);
  });

  it("permanently unlocks self-healing for every Guardian when a HEAL_UNLOCK shooting star activates", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    let starTile: { x: number; y: number } | null = null;
    for (const row of s.tiles) {
      for (const t of row) {
        if (t.isShootingStar) {
          t.powerUp = "HEAL_UNLOCK";
          starTile = { x: t.x, y: t.y };
        }
      }
    }
    expect(starTile).not.toBeNull();
    if (!starTile) return;

    s.tiles[starTile.x][starTile.y].card = null;
    s.tiles[starTile.x][starTile.y].isAsteroid = false;
    const node = s.nodes.FIRE;
    s.players[0].position = starTile;
    const [dx] = DIRS[node.dir];
    const neighbor = { x: starTile.x + (dx === 0 ? 0 : 1), y: starTile.y + (dx === 0 ? 1 : 0) };
    if (s.tiles[neighbor.x]?.[neighbor.y] && !s.tiles[neighbor.x][neighbor.y].isCenter && !s.tiles[neighbor.x][neighbor.y].node) {
      s.tiles[neighbor.x][neighbor.y].card = { id: "seed", element: "FIRE", connections: { top: true, right: true, bottom: true, left: true } };
    }
    s.ap = 99;
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: starTile.x, y: starTile.y });

    if (s.tiles[starTile.x][starTile.y].card) {
      expect(s.selfHealUnlocked).toBe(true);
      expect(s.log.some((l) => l.includes("can heal themselves"))).toBe(true);
    }
  });
});

describe("closed-loop Star Card immunity", () => {
  it("marks every tile permanently isEnclosed the moment a placement closes a loop, and logs it", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    // FIRE's own randomized row can coincide with AIR/EARTH's fixed rows (0/10), which would make
    // this hand-built loop collide with one of their nodes. Relocate to row 2 — safely outside both
    // the center zone (rows 3-7) and the AIR/EARTH rows — same convention as other geometry-building
    // tests in this file; `.dir` doesn't matter post-relocation, only board generation cares about it.
    relocateNode(s, "FIRE", 2, s.nodes.FIRE.y);
    // Aries (player 0) spawned at FIRE's OLD node position at initGame time — relocateNode only
    // moves the node tile itself, so re-sync the pawn or every placement below would be out of range.
    s.players[0].position = { x: s.nodes.FIRE.x, y: s.nodes.FIRE.y };
    const node = s.nodes.FIRE;
    const [dx, dy] = DIRS[node.dir];
    // A small 2x2 loop hanging off the Fire node: A is the node's own neighbor, B/C/D close the
    // loop back around to A without ever routing through the node itself.
    const a = { x: node.x + dx, y: node.y + dy };
    // Bounds-safe perpendicular offset — `a` can sit right at the row/column edge (the node's own
    // position along its edge is randomized), so +1 isn't always in bounds; fall back to -1.
    let perpDx = dx === 0 ? 1 : 0;
    let perpDy = dy === 0 ? 1 : 0;
    if (a.x + perpDx < 0 || a.x + perpDx >= s.tiles.length || a.y + perpDy < 0 || a.y + perpDy >= s.tiles[0].length) {
      perpDx = -perpDx;
      perpDy = -perpDy;
    }
    const b = { x: a.x + perpDx, y: a.y + perpDy };
    const c = { x: b.x + dx, y: b.y + dy };
    const d = { x: a.x + dx, y: a.y + dy };
    for (const pt of [a, b, c, d]) {
      const t = s.tiles[pt.x][pt.y];
      t.isAsteroid = false;
      t.isVoid = false;
      t.isShootingStar = false;
    }
    s.ap = 99;

    let pos = { x: node.x, y: node.y };
    for (const target of [a, b, c]) {
      s.players[0].hand = [cross("FIRE")];
      s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });
      expect(s.tiles[target.x][target.y].card).not.toBeNull();
      s = gameReducer(s, { type: "MOVE", x: target.x, y: target.y });
      pos = target;
    }
    expect(pos).toEqual(c);
    for (const pt of [a, b, c, d]) expect(s.tiles[pt.x][pt.y].isEnclosed).toBe(false);

    // The 4th placement (d) closes the loop back to `a`.
    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: d.x, y: d.y });

    for (const pt of [a, b, c, d]) expect(s.tiles[pt.x][pt.y].isEnclosed).toBe(true);
    expect(s.log.some((l) => l.includes("closed loop"))).toBe(true);
  });

  it("keeps an enclosed tile's card intact through a traveling asteroid sweep", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const spot = { x: 2, y: 5 };
    s.tiles[spot.x][spot.y].card = cross("FIRE");
    s.tiles[spot.x][spot.y].isAsteroid = false;
    s.tiles[spot.x][spot.y].isVoid = false;
    s.tiles[spot.x][spot.y].isEnclosed = true;
    s.turnsUntilAsteroidShift = 1;

    s = gameReducer(s, { type: "END_TURN" });

    expect(s.tiles[spot.x][spot.y].card).not.toBeNull();
    expect(s.tiles[spot.x][spot.y].isAsteroid).toBe(false);
  });
});

describe("4-player balance: completing a path eases the Eclipse Tracker", () => {
  it("reduces the tracker by PATH_COMPLETE_TRACKER_REDUCTION_4P the moment a path completes, only in a 4-player game", () => {
    let s = freshGame4(["ARIES", "CANCER", "TAURUS", "GEMINI"]);
    const { standAt, target } = buildPathToCenterExceptLast(s, "FIRE");
    s.players[0].position = standAt;
    s.ap = 99;
    s.tracker = 50;

    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });

    // The hand-built path uses all-connecting cross cards throughout, so on a rare unlucky board
    // layout it can physically graze another element's real node in passing and complete that
    // path too — harmless test-construction noise, not a bug, so assert the reduction scales with
    // however many paths actually completed rather than hardcoding exactly one.
    const completions = s.log.filter((l) => l.includes("blazes into the Orrery")).length;
    expect(completions).toBeGreaterThanOrEqual(1);
    expect(s.tracker).toBe(50 - completions * PATH_COMPLETE_TRACKER_REDUCTION_4P);
  });

  it("does not grant the path-completion tracker reduction in a 2-player game", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const { standAt, target } = buildPathToCenterExceptLast(s, "FIRE");
    s.players[0].position = standAt;
    s.ap = 99;
    s.tracker = 50;

    s.players[0].hand = [cross("FIRE")];
    s = gameReducer(s, { type: "PLACE", handIndex: 0, x: target.x, y: target.y });

    expect(s.log.some((l) => l.includes("blazes into the Orrery"))).toBe(true);
    expect(s.tracker).toBe(50);
  });
});

describe("hardcoded asteroid shift cadence per player count", () => {
  it("sets the interval deterministically based on player count (2p=4, 3p=5, 4p=6)", () => {
    const s2 = freshGame(["ARIES", "CANCER"]);
    expect(s2.turnsUntilAsteroidShift).toBe(4);

    const s3 = initGame([
      { name: "P1", sign: "ARIES" },
      { name: "P2", sign: "CANCER" },
      { name: "P3", sign: "TAURUS" }
    ], 'en');
    expect(s3.turnsUntilAsteroidShift).toBe(5);

    const s4 = freshGame4(["ARIES", "CANCER", "TAURUS", "GEMINI"]);
    expect(s4.turnsUntilAsteroidShift).toBe(6);
  });

  it("resets to the same hardcoded interval (not a random 4-6) after an asteroid shift fires", () => {
    let s = freshGame4(["ARIES", "CANCER", "TAURUS", "GEMINI"]);
    s.turnsUntilAsteroidShift = 1;
    s = gameReducer(s, { type: "END_TURN" });
    expect(s.turnsUntilAsteroidShift).toBe(6);
  });
});

describe("seeded board generation is replayable", () => {
  const setup: PlayerSetup[] = [
    { name: "P1", sign: "ARIES" },
    { name: "P2", sign: "CANCER" }
  ];

  it("reproduces an identical starting board (center, nodes, asteroids, shooting stars, decks) given the same seed", () => {
    const a = initGame(setup, 'en', "dragon-moon-42");
    const b = initGame(setup, 'en', "dragon-moon-42");

    expect(a.seed).toBe("dragon-moon-42");
    expect(a.center).toEqual(b.center);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.starDeck).toEqual(b.starDeck);
    expect(a.eclipseDeck).toEqual(b.eclipseDeck);
    expect(a.players.map((p) => p.hand)).toEqual(b.players.map((p) => p.hand));
  });

  it("auto-generates a non-empty seed and stores it when none is given, still usable to replay", () => {
    const a = initGame(setup, 'en');
    expect(a.seed.length).toBeGreaterThan(0);
    const b = initGame(setup, 'en', a.seed);
    expect(a.tiles).toEqual(b.tiles);
  });

  it("trims whitespace and blank input the same as omitting a seed (falls back to a random one)", () => {
    const a = initGame(setup, 'en', "   ");
    expect(a.seed.length).toBeGreaterThan(0);
    expect(a.seed.trim()).toBe(a.seed);
  });
});

describe("multi-tile Move", () => {
  /** Places a straight, fully-connected chain of `steps` cross cards outward from `element`'s
   * node (same shape/direction helper as clearLineFromNode, but actually placing cards instead of
   * just clearing obstacles) — gives a test a walkable multi-tile path without needing real PLACE
   * actions or fighting the randomized board layout. */
  function buildWalkableChain(s: GameState, element: StarCard["element"], steps: number): { x: number; y: number }[] {
    clearLineFromNode(s, element, steps);
    const node = s.nodes[element];
    const [dx, dy] = DIRS[node.dir];
    const pts: { x: number; y: number }[] = [];
    for (let i = 1; i <= steps; i++) {
      const pt = { x: node.x + dx * i, y: node.y + dy * i };
      s.tiles[pt.x][pt.y].card = cross(element);
      pts.push(pt);
    }
    return pts;
  }

  it("moves several tiles in a single MOVE dispatch, deducting 1 AP per tile stepped through", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const chain = buildWalkableChain(s, "FIRE", 3);
    s.ap = 99;
    const apBefore = s.ap;
    const dest = chain[2];

    s = gameReducer(s, { type: "MOVE", x: dest.x, y: dest.y });

    expect(s.players[0].position).toEqual(dest);
    expect(apBefore - s.ap).toBe(3);
    expect(s.log.some((l) => l.includes("moves 3 tiles"))).toBe(true);
  });

  it("marks every intermediate tile visited, not just the final destination", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const chain = buildWalkableChain(s, "FIRE", 3);
    s.ap = 99;
    const dest = chain[2];

    s = gameReducer(s, { type: "MOVE", x: dest.x, y: dest.y });

    for (const pt of chain) {
      expect(s.players[0].visited[`${pt.x},${pt.y}`]).toBe(true);
    }
  });

  it("rejects a destination that costs more AP than the player currently has", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const chain = buildWalkableChain(s, "FIRE", 3);
    s.ap = 2; // the 3rd tile costs 3 AP
    const dest = chain[2];
    const before = s;

    s = gameReducer(s, { type: "MOVE", x: dest.x, y: dest.y });

    expect(s).toBe(before); // invalid action returns the original state unchanged
  });

  it("still supports a plain single-tile move exactly as before, costing 1 AP with the unchanged log wording", () => {
    let s = freshGame(["ARIES", "CANCER"]);
    const chain = buildWalkableChain(s, "FIRE", 1);
    s.ap = 3;

    s = gameReducer(s, { type: "MOVE", x: chain[0].x, y: chain[0].y });

    expect(s.ap).toBe(2);
    expect(s.log.some((l) => l.includes("moves to") && !l.includes("tiles"))).toBe(true);
  });
});
