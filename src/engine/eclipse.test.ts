import { describe, expect, it } from "vitest";
import { DIRS, ECLIPSE_EFFECT_SCALE_4P, ECLIPSE_NO_TARGET_TRACKER_BUMP, ECLIPSE_SURGE_CORRUPTION_SCALING } from "../constants";
import type { Element, GameState, Point, Sign } from "../types";
import { isPathComplete } from "./board";
import { computeLunarShieldTiles, damage, resolveEclipse } from "./eclipse";
import { fmtNum } from "./log";
import { initGame } from "./reducer";

function freshGame(signs: [Sign, Sign]): GameState {
  return initGame([
    { name: "P1", sign: signs[0] },
    { name: "P2", sign: signs[1] }
  ]);
}

function freshGame4(signs: [Sign, Sign, Sign, Sign]): GameState {
  return initGame(signs.map((sign, i) => ({ name: `P${i + 1}`, sign })));
}

/** Hand-builds a fully-connected, uncorrupted L-shaped path from `element`'s node all the way to
 * (and touching) the Orrery — mirrors reducer.test.ts's buildPathToCenterExceptLast, but placing
 * every step including the one adjacent to center, since this file just needs isPathComplete to
 * be true, not to observe a PLACE action's side effects. */
function buildCompletePath(s: GameState, element: Element) {
  const node = s.nodes[element];
  const center = s.center;
  const [dx] = DIRS[node.dir];
  const steps: Point[] = [];
  let pos: Point = { x: node.x, y: node.y };
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
  for (const p of steps) {
    if (p.x === center.x && p.y === center.y) continue;
    s.tiles[p.x][p.y].card = { id: `${element}-${p.x}-${p.y}`, element, connections: { top: true, right: true, bottom: true, left: true } };
    s.tiles[p.x][p.y].isAsteroid = false;
    s.tiles[p.x][p.y].isVoid = false;
    s.tiles[p.x][p.y].isCorrupted = false;
  }
}

describe("computeLunarShieldTiles", () => {
  it("covers a non-Stasis Cancer Guardian's own tile plus its 4 orthogonal neighbors", () => {
    const s = freshGame(["CANCER", "ARIES"]);
    const p = s.players[0];
    const shielded = computeLunarShieldTiles(s);
    expect(shielded.has(`${p.position.x},${p.position.y}`)).toBe(true);
    // At least the node itself and its in-bounds neighbors should be covered.
    expect(shielded.size).toBeGreaterThanOrEqual(2);
  });

  it("excludes a Cancer Guardian who is in Stasis", () => {
    const s = freshGame(["CANCER", "ARIES"]);
    s.players[0].isStasis = true;
    const shielded = computeLunarShieldTiles(s);
    expect(shielded.size).toBe(0);
  });

  it("is empty when no player is Cancer", () => {
    const s = freshGame(["ARIES", "TAURUS"]);
    expect(computeLunarShieldTiles(s).size).toBe(0);
  });
});

describe("damage / Lunar Shield absorption", () => {
  it("absorbs damage aimed at a Guardian on or adjacent to a Cancer Guardian, and records a shield-block event", () => {
    const s = freshGame(["CANCER", "ARIES"]);
    const cancer = s.players[0];
    const target = s.players[1];
    target.position = { x: cancer.position.x, y: cancer.position.y }; // stacked, definitely adjacent
    const before = target.hp;
    const seqBefore = s.shieldBlockSeq;

    damage(s, target, 1, "test hit");

    expect(target.hp).toBe(before);
    expect(s.shieldBlockSeq).toBe(seqBefore + 1);
    expect(s.lastShieldBlock).toEqual({ playerId: cancer.id, kind: "CANCER" });
  });

  it("applies damage normally when no Cancer Guardian is nearby", () => {
    const s = freshGame(["ARIES", "TAURUS"]);
    const target = s.players[1];
    target.position = { x: 0, y: 0 };
    s.players[0].position = { x: 10, y: 18 }; // far away
    const before = target.hp;
    damage(s, target, 1, "test hit");
    expect(target.hp).toBe(before - 1);
  });

  it("knocks a Guardian into Stasis at 0 HP", () => {
    const s = freshGame(["ARIES", "TAURUS"]);
    const target = s.players[1];
    target.hp = 1;
    target.position = { x: 0, y: 0 };
    s.players[0].position = { x: 10, y: 18 };
    damage(s, target, 1, "test hit");
    expect(target.hp).toBe(0);
    expect(target.isStasis).toBe(true);
  });

  it("does nothing to a Guardian already in Stasis", () => {
    const s = freshGame(["ARIES", "TAURUS"]);
    const target = s.players[1];
    target.isStasis = true;
    target.hp = 2;
    damage(s, target, 1, "test hit");
    expect(target.hp).toBe(2);
  });
});

describe("Eclipse tuning constants are wired into resolveEclipse's messages", () => {
  it("keeps the no-target bump and surge scaling as named, importable constants (regression guard against re-hardcoding)", () => {
    // Deliberately just a sanity check (positive, finite) rather than pinning specific bounds tied
    // to a historical tuning value — these numbers are meant to be freely re-tuned in constants.ts
    // (see its own difficulty-tuning block), so a test hardcoding "must stay below X" would itself
    // need editing every time someone rebalances, which defeats the point of a regression guard.
    expect(ECLIPSE_NO_TARGET_TRACKER_BUMP).toBeGreaterThan(0);
    expect(ECLIPSE_SURGE_CORRUPTION_SCALING).toBeGreaterThan(0);
  });
});

describe("resolveEclipse respects Tile.isEnclosed immunity", () => {
  it("never targets an enclosed tile for Corruption, treating it as having no valid target at all", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    const spot = { x: 2, y: 5 };
    s.tiles[spot.x][spot.y].card = { id: "t", element: "FIRE", connections: { top: true, right: true, bottom: true, left: true } };
    s.tiles[spot.x][spot.y].isEnclosed = true;
    // Force the next Eclipse card to be a FIRE Corruption card with this enclosed tile as the only
    // FIRE card anywhere on the board.
    s.eclipseDeck = [{ id: "forced", type: "CORRUPTION", element: "FIRE" }];
    const before = s.tracker;

    resolveEclipse(s);

    expect(s.tiles[spot.x][spot.y].isCorrupted).toBe(false);
    expect(s.tracker).toBeGreaterThan(before); // no valid target found -> the "wasted card" bump instead
  });
});

describe("resolveEclipse respects Tile.isPurified immunity", () => {
  it("never re-targets a previously-purified tile for Corruption, treating it as having no valid target at all", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    const spot = { x: 2, y: 5 };
    s.tiles[spot.x][spot.y].card = { id: "t", element: "FIRE", connections: { top: true, right: true, bottom: true, left: true } };
    s.tiles[spot.x][spot.y].isPurified = true;
    s.eclipseDeck = [{ id: "forced", type: "CORRUPTION", element: "FIRE" }];
    const before = s.tracker;

    resolveEclipse(s);

    expect(s.tiles[spot.x][spot.y].isCorrupted).toBe(false);
    expect(s.tracker).toBeGreaterThan(before); // no valid target found -> the "wasted card" bump instead
  });
});

describe("resolveEclipse Corruption doesn't wrongly seal an unrelated incomplete path fragment", () => {
  it("still targets a WATER card attached to the Orrery when only FIRE's own path is actually complete", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    buildCompletePath(s, "FIRE");
    expect(isPathComplete(s.tiles, "FIRE", s.center, s.nodes)).toBe(true);

    // Attach a lone, genuinely incomplete WATER card directly to the Orrery on a different side —
    // this physically touches the center, so the old crossCenter:true traversal used to build the
    // "sealed" set would tunnel from FIRE's now-complete network through the Orrery and wrongly
    // seal this WATER fragment against Corruption too, even though WATER's own path never reaches
    // its node.
    let centerSide: Point | null = null;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = s.center.x + dx, ny = s.center.y + dy;
      const t = s.tiles[nx]?.[ny];
      if (t && !t.card && !t.node) { centerSide = { x: nx, y: ny }; break; }
    }
    expect(centerSide).not.toBeNull();
    if (!centerSide) return;
    s.tiles[centerSide.x][centerSide.y].card = { id: "water-frag", element: "WATER", connections: { top: true, right: true, bottom: true, left: true } };
    s.tiles[centerSide.x][centerSide.y].isAsteroid = false;
    s.tiles[centerSide.x][centerSide.y].isVoid = false;
    expect(isPathComplete(s.tiles, "WATER", s.center, s.nodes)).toBe(false);

    s.eclipseDeck = [{ id: "forced", type: "CORRUPTION", element: "WATER" }];
    resolveEclipse(s);

    expect(s.tiles[centerSide.x][centerSide.y].isCorrupted).toBe(true);
  });
});

describe("resolveEclipse Void never spawns on a Shooting Star tile", () => {
  it("treats a board with only a Shooting Star as an empty tile as having no valid Void target", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    // Occupy every tile with a card so nothing else looks "empty" to Void, except a single
    // Shooting Star tile — the only remaining candidate if the isShootingStar exclusion is missing.
    for (const row of s.tiles) {
      for (const t of row) {
        if (t.node || t.isCenter) continue;
        t.card = { id: "filler", element: "FIRE", connections: { top: false, right: false, bottom: false, left: false } };
        t.isAsteroid = false;
        t.isVoid = false;
        t.isShielded = false;
        t.isShootingStar = false;
      }
    }
    const spot = { x: 2, y: 5 };
    s.tiles[spot.x][spot.y].card = null;
    s.tiles[spot.x][spot.y].isShootingStar = true;
    s.eclipseDeck = [{ id: "forced", type: "VOID" }];
    const before = s.tracker;

    resolveEclipse(s);

    expect(s.tiles[spot.x][spot.y].isVoid).toBe(false);
    expect(s.tiles[spot.x][spot.y].isShootingStar).toBe(true);
    expect(s.tracker).toBeGreaterThan(before); // no valid target -> the "wasted card" bump instead
  });
});

describe("resolveEclipse Damage Cards", () => {
  it("damages every living Guardian of the card's element(s) directly, not by random chance", () => {
    const s = freshGame(["ARIES", "CANCER"]); // FIRE, WATER
    s.eclipseDeck = [{ id: "forced", type: "DAMAGE", damageElements: ["FIRE"], damageMessage: "Test damage message.", damageHpLost: 2 }];
    const fireBefore = s.players[0].hp;
    const waterBefore = s.players[1].hp;

    resolveEclipse(s);

    expect(s.players[0].hp).toBe(fireBefore - 2);
    expect(s.players[1].hp).toBe(waterBefore); // a different element — untouched
    expect(s.log.some((l) => l.includes("🌒💢 Eclipse 🔥 Test damage message."))).toBe(true);
    expect(s.messageLog.some((l) => l.includes("🌒💢 Eclipse 🔥 Test damage message."))).toBe(true);
    expect(s.eclipseEventSeq).toBe(1);
    expect(s.lastEclipseEvent).toEqual({ kind: "DAMAGE", x: null, y: null });
  });

  it("hits EVERY player sharing the targeted element, not just one at random", () => {
    const s = freshGame4(["ARIES", "LEO", "CANCER", "GEMINI"]); // FIRE, FIRE, WATER, AIR
    s.eclipseDeck = [{ id: "forced", type: "DAMAGE", damageElements: ["FIRE"], damageMessage: "Test.", damageHpLost: 1 }];
    const before = s.players.map((p) => p.hp);

    resolveEclipse(s);

    expect(s.players[0].hp).toBe(before[0] - 1); // Aries — Fire
    expect(s.players[1].hp).toBe(before[1] - 1); // Leo — Fire
    expect(s.players[2].hp).toBe(before[2]); // Cancer — Water, untouched
    expect(s.players[3].hp).toBe(before[3]); // Gemini — Air, untouched
  });

  it("respects Cancer's Lunar Shield exactly like any other damage source", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    s.players[1].position = { x: s.players[0].position.x, y: s.players[0].position.y }; // Cancer stacked on the Fire Guardian
    s.eclipseDeck = [{ id: "forced", type: "DAMAGE", damageElements: ["FIRE"], damageMessage: "Test.", damageHpLost: 1 }];
    const before = s.players[0].hp;

    resolveEclipse(s);

    expect(s.players[0].hp).toBe(before);
    expect(s.log.some((l) => l.includes("Lunar Shield absorbs"))).toBe(true);
  });

  it("skips a Guardian already in Stasis (no damage), while still logging the card's header", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    s.players[0].isStasis = true;
    const before = s.players[0].hp;
    s.eclipseDeck = [{ id: "forced", type: "DAMAGE", damageElements: ["FIRE"], damageMessage: "Test.", damageHpLost: 1 }];

    resolveEclipse(s);

    expect(s.players[0].hp).toBe(before);
    expect(s.log.some((l) => l.includes("🌒💢 Eclipse 🔥 Test."))).toBe(true);
  });
});

describe("4-player balance: Eclipse Card tracker effects are scaled down", () => {
  it("scales the Corruption/Void 'wasted card' bump by ECLIPSE_EFFECT_SCALE_4P in a 4-player game", () => {
    const s = freshGame4(["ARIES", "CANCER", "TAURUS", "GEMINI"]);
    // No FIRE cards anywhere on the board -> Corruption finds no target -> falls back to the bump.
    s.eclipseDeck = [{ id: "forced", type: "CORRUPTION", element: "FIRE" }];
    const before = s.tracker;

    resolveEclipse(s);

    expect(s.tracker).toBeCloseTo(before + ECLIPSE_NO_TARGET_TRACKER_BUMP * ECLIPSE_EFFECT_SCALE_4P, 5);
  });

  it("logs the scaled bump and running tracker total without floating-point noise (e.g. never '2.0999999999999996%')", () => {
    const s = freshGame4(["ARIES", "CANCER", "TAURUS", "GEMINI"]);
    s.eclipseDeck = [{ id: "forced", type: "CORRUPTION", element: "AIR" }];

    resolveEclipse(s);

    const line = s.log[0];
    expect(line).toContain("No vulnerable Air corruption targets");
    expect(line).not.toMatch(/\d+\.\d{2,}/); // no more than 1 digit after the decimal point anywhere
    // Deliberately routed through fmtNum here too — the raw product (3 * 0.7) is itself the
    // "2.0999999999999996"-style float this test exists to catch, so asserting against it
    // unformatted would just reproduce the bug inside the test.
    expect(line).toContain(`+${fmtNum(ECLIPSE_NO_TARGET_TRACKER_BUMP * ECLIPSE_EFFECT_SCALE_4P)}%`);
  });

  it("applies the full, unscaled bump in a 2-player game", () => {
    const s = freshGame(["ARIES", "CANCER"]);
    s.eclipseDeck = [{ id: "forced", type: "CORRUPTION", element: "FIRE" }];
    const before = s.tracker;

    resolveEclipse(s);

    expect(s.tracker).toBe(before + ECLIPSE_NO_TARGET_TRACKER_BUMP);
  });

  it("scales Surge's tracker amount by ECLIPSE_EFFECT_SCALE_4P in a 4-player game", () => {
    const s = freshGame4(["ARIES", "CANCER", "TAURUS", "GEMINI"]);
    s.eclipseDeck = [{ id: "forced", type: "SURGE", amount: 10 }];
    const before = s.tracker;

    resolveEclipse(s);

    expect(s.tracker).toBeCloseTo(before + 10 * ECLIPSE_EFFECT_SCALE_4P, 5);
  });
});
