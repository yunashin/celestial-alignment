import {
  ASTEROID_SHIFT_INTERVAL,
  CHAIN_LENGTH_THRESHOLD,
  CHAIN_TRACKER_DISCOUNT,
  CHAIN_TRACKER_DISCOUNT_OWN,
  DIR_KEYS,
  DIRS,
  ELEMENTS,
  ELEMENT_META,
  HAZARD_DAMAGE,
  HEIGHT,
  MAX_HP,
  PATH_COMPLETE_TRACKER_REDUCTION_4P,
  SHOOTING_STAR_AP_BONUS,
  SHOOTING_STAR_HAND_BONUS,
  SHOOTING_STAR_SELF_HEAL_AMOUNT,
  SHOOTING_STAR_TRACKER_DOWN_PCT,
  SIGNS,
  STARTING_AP,
  STARTING_HP,
  WIDTH,
  CANCER_SHIELD_TURN_LIMIT,
  CHAIN_TRACKER_BONUS_DISCOUNT
} from "../constants";
import type { GameAction, GameState, Player, PlayerSetup, StarCard, Tile } from "../types";
import {
  buildEclipseDeck,
  buildStarDeck,
  computeNetwork,
  computeSameElementChainGroup,
  findEnclosedTiles,
  inBounds,
  isPathComplete,
  isValidShieldAnchor,
  key,
  lineTiles,
  makeBoard,
  manhattan,
  shieldTiles,
  shuffle,
  tracePathBetween
} from "./board";
import { computeLunarShieldTiles, damage, resolveEclipse } from "./eclipse";
import { important, log, logGroup } from "./log";
import { getValidMoves, getValidPurifyTargets, handSize, placementCost, purifyCost, validPlacement } from "./rules";
import { article, formatList, getKoreanArticle, pluralSuffix } from "../utils/grammar";
import { hashStringToSeed, mulberry32, randomSeedString } from "../utils/rng";
// Aliased to `tr` (not `t`) — this file uses `t` extensively as a local Tile variable name (e.g.
// `for (const t of row)`), which would otherwise shadow the translate function.
import { getLocale, t as tr } from "../i18n";
import { elementLabel } from "../i18n/gameText";

export function drawCards(s: GameState, p: Player, n: number) {
  for (let i = 0; i < n; i++) {
    if (!s.starDeck.length) {
      s.starDeck = shuffle(s.starDiscard);
      s.starDiscard = [];
      s.starDeckShuffleSeq += 1;
    }
    const c = s.starDeck.shift();
    if (!c) break;
    p.hand.push(c);
  }
}

const asteroidShiftInterval = (playerCount: number) => ASTEROID_SHIFT_INTERVAL[playerCount] ?? 4;

/** A given seed always reproduces the exact same starting board (Orrery/node positions, asteroids,
 * shooting stars) and initial Star/Eclipse deck order — but NOT the rest of the game, since every
 * subsequent random event (deck reshuffles, Eclipse targeting, asteroid shifts) still uses
 * Math.random(). "Replay this board" means the same starting scenario, not a full deterministic
 * replay of an entire playthrough (which would also require identical player actions throughout).
 * `locale` drives the Korean-vs-English phrasing of the "Orrery awakens" opening message (via
 * formatList's locale-aware list-joining) and defaults to the reactive global i18n locale — ad-hoc
 * callers (tests, mainly) that don't care which language the opening message renders in can omit
 * it, matching the same "sane default for callers that don't need this" pattern makeBoard's own
 * `activeElements` default already uses. */
export function initGame(setup: PlayerSetup[], locale: string = getLocale(), seed?: string): GameState {
  const usedSeed = seed && seed.trim() ? seed.trim() : randomSeedString();
  const rng = mulberry32(hashStringToSeed(usedSeed));
  // Only the elements actually in play (never duplicated across players — see SetupScreen) get
  // preferential shooting-star power-up placement in their own quadrant; see
  // assignShootingStarPowerUps in board.ts for why a 4-player game skips this entirely.
  const activeElements = Array.from(new Set(setup.map((cfg) => SIGNS[cfg.sign].element)));
  const { tiles, center, nodes } = makeBoard(rng, activeElements);
  const s: GameState = {
    phase: "playing",
    seed: usedSeed,
    tiles,
    center,
    nodes,
    players: setup.map((cfg, i) => {
      const element = SIGNS[cfg.sign].element;
      const pos = { x: nodes[element].x, y: nodes[element].y };
      return {
        id: i,
        name: cfg.name || `Guardian ${i + 1}`,
        sign: cfg.sign,
        element,
        hp: STARTING_HP,
        maxHp: MAX_HP,
        position: pos,
        isStasis: false,
        hand: [],
        visited: { [key(pos.x, pos.y)]: true }
      } as Player;
    }),
    active: 0,
    ap: STARTING_AP,
    starDeck: buildStarDeck(rng),
    starDiscard: [],
    eclipseDeck: buildEclipseDeck(rng, activeElements),
    eclipseDiscard: [],
    tracker: 0,
    turn: 1,
    log: [],
    messageLog: [],
    messageSeq: 0,
    ariesUsed: false,
    cancerShieldTurnsLeft: 0,
    libraUsed: false,
    taurusPurifyUsed: false,
    scorpioUsed: false,
    virgoShieldCooldown: 0,
    turnsUntilAsteroidShift: asteroidShiftInterval(setup.length),
    lossReason: null,
    lastActedPlayerId: null,
    apBonus: 0,
    handSizeBonus: 0,
    selfHealUnlocked: false,
    actedThisTurn: false,
    selfHealSeq: 0,
    lastSelfHealEvent: null,
    shootingStarSeq: 0,
    lastShootingStarEvent: null,
    eclipseEventSeq: 0,
    lastEclipseEvent: null,
    asteroidEventSeq: 0,
    lastAsteroidDestroyedTiles: [],
    starDeckShuffleSeq: 0,
    eclipseDeckShuffleSeq: 0,
    shieldBlockSeq: 0,
    lastShieldBlock: null,
    discardEventSeq: 0,
    chainEventSeq: 0,
    lastChainEvent: null,
    surgeEventSeq: 0,
    lastSurgeEvent: null
  };
  for (const p of s.players) drawCards(s, p, handSize(s, p));
  const names = formatList([...new Set(s.players.map((p) => p.name))], locale);
  const openingMsg = tr("log.orreryAwakens", { names, koreanArticle: getKoreanArticle(names[names.length - 1]) });
  log(s, openingMsg);
  important(s, openingMsg);
  log(s, tr("log.turnAnnounce", { name: s.players[0].name, ap: STARTING_AP }));
  return s;
}

function activateShootingStar(s: GameState, tile: Tile, p: Player) {
  const type = tile.powerUp;
  tile.isShootingStar = false;
  tile.powerUpFlash = true;
  s.shootingStarSeq += 1;
  s.lastShootingStarEvent = { type: type!, seq: s.shootingStarSeq };
  switch (type) {
    case "TRACKER_DOWN": {
      s.tracker = Math.max(0, s.tracker - SHOOTING_STAR_TRACKER_DOWN_PCT);
      const msg = tr("log.shootingStarTrackerDown", { pct: SHOOTING_STAR_TRACKER_DOWN_PCT });
      log(s, msg);
      important(s, msg);
      break;
    }
    case "BONUS_AP": {
      s.apBonus += SHOOTING_STAR_AP_BONUS;
      s.ap += SHOOTING_STAR_AP_BONUS;
      const msg = tr("log.shootingStarBonusAp", { amount: SHOOTING_STAR_AP_BONUS });
      log(s, msg);
      important(s, msg);
      break;
    }
    case "BONUS_HAND": {
      s.handSizeBonus += SHOOTING_STAR_HAND_BONUS;
      drawCards(s, p, SHOOTING_STAR_HAND_BONUS);
      const msg = tr("log.shootingStarBonusHand", { amount: SHOOTING_STAR_HAND_BONUS });
      log(s, msg);
      important(s, msg);
      break;
    }
    case "HEAL_UNLOCK": {
      s.selfHealUnlocked = true;
      const msg = tr("log.shootingStarHealUnlock", { amount: SHOOTING_STAR_SELF_HEAL_AMOUNT });
      log(s, msg);
      important(s, msg);
      break;
    }
  }
}

function triggerAsteroidShift(s: GameState) {
  const asteroids: { x: number; y: number }[] = [];
  for (const row of s.tiles) for (const t of row) if (t.isAsteroid) asteroids.push({ x: t.x, y: t.y });
  if (!asteroids.length) return;
  const source = asteroids[Math.floor(Math.random() * asteroids.length)];

  // Completed element paths (the ones that actually matter for winning) are never destroyed. Uses
  // crossCenter: false — the default (true) traversal would tunnel through the Orrery into whatever
  // OTHER element's network happens to share the hub, wrongly granting asteroid immunity to an
  // incomplete/impure path fragment just because it's also attached to the center (see CLAUDE.md's
  // isPathComplete note; this is the same crossCenter pitfall, just for the "protected tiles" set
  // rather than the completion check itself).
  const required = Array.from(new Set(s.players.map((p) => p.element)));
  const completedPathTiles = new Set<string>();
  for (const el of required) {
    if (isPathComplete(s.tiles, el, s.center, s.nodes)) {
      computeNetwork(s.tiles, el, s.center, s.nodes, false).forEach((k) => completedPathTiles.add(k));
    }
  }
  const cancerShieldTiles = computeLunarShieldTiles(s);
  const occupied = new Set<string>(s.players.map((q) => key(q.position.x, q.position.y)));

  const candidates: { x: number; y: number }[] = [];
  for (let x = 0; x < HEIGHT; x++) {
    for (let y = 0; y < WIDTH; y++) {
      const t = s.tiles[x][y];
      // isVoid excluded so an asteroid can never come to rest on an existing Black Hole tile —
      // Eclipse Void's own target filter already excludes isAsteroid tiles for the same reason, in
      // the other direction (see eclipse.ts's VOID branch).
      if (t.isAsteroid || t.isVoid || t.isCenter || t.node || t.isShootingStar || t.isEnclosed || t.isShielded) continue;
      const k = key(x, y);
      if (completedPathTiles.has(k) || cancerShieldTiles.has(k) || occupied.has(k)) continue;
      if (manhattan(source, { x, y }) < 3) continue;
      candidates.push({ x, y });
    }
  }
  if (!candidates.length) return;
  const dest = candidates[Math.floor(Math.random() * candidates.length)];

  // Built up in narrative order and flushed via logGroup at the end, so the header and its
  // per-tile follow-ups read top-to-bottom together instead of interleaving backwards (log()
  // unshifts, so calling log() directly here in order would show the LAST tile hit at the top).
  const messages: string[] = [tr("log.asteroidHeader", { sx: source.x, sy: source.y, dx: dest.x, dy: dest.y })];

  const destroyedTiles: Tile[] = [];
  const path = lineTiles(source, dest);
  path.forEach((pt, i) => {
    const t = s.tiles[pt.x][pt.y];
    t.asteroidHitStep = i;
    const k = key(pt.x, pt.y);

    if (completedPathTiles.has(k)) {
      messages.push(tr("log.asteroidPassesCompletedPath", { x: pt.x, y: pt.y }));
    } else if (t.isEnclosed) {
      messages.push(tr("log.asteroidGlancesEnclosed", { x: pt.x, y: pt.y }));
    } else if (cancerShieldTiles.has(k)) {
      messages.push(tr("log.asteroidShattersLunarShield", { x: pt.x, y: pt.y }));
    } else if (t.isShootingStar) {
      messages.push(tr("log.asteroidPassesShootingStar", { x: pt.x, y: pt.y }));
    } else if (t.isShielded) {
      messages.push(tr("log.asteroidDeflectsVirgoShield", { x: pt.x, y: pt.y }));
    } else if (occupied.has(k) && t.card) {
      // A Guardian standing on the tile still takes the impact (the damage loop below fires
      // unconditionally), but their card is spared — otherwise the asteroid could both damage them
      // AND rip out the ground they're standing on, stranding them with nothing to build from.
      messages.push(tr("log.asteroidGuardianHoldsGround", { x: pt.x, y: pt.y }));
    } else {
      if (t.card) {
        messages.push(tr("log.asteroidObliteratesCard", { elementPhrase: article(elementLabel(tr, t.card.element)), x: pt.x, y: pt.y }));
        destroyedTiles.push({ ...t });
        t.explosionStep = i;
      } else if (t.isCorrupted) {
        messages.push(tr("log.asteroidScoursCorruption", { x: pt.x, y: pt.y }));
      }
      t.card = null;
      t.isCorrupted = false;
      t.isLocked = false;
      t.isShielded = false;
      t.shieldOwner = null;
      t.isShootingStar = false;
      t.powerUp = null;
      t.isPurified = false;
      t.placedBy = null;
      t.corruptionTurnsLeft = null;
    }

    for (const q of s.players) {
      if (q.position.x === pt.x && q.position.y === pt.y) damage(s, q, HAZARD_DAMAGE, "the traveling asteroid", messages);
    }
  });
  s.tiles[source.x][source.y].isAsteroid = false;
  s.tiles[dest.x][dest.y].isAsteroid = true;
  messages.push(tr("log.asteroidComesToRest", { x: dest.x, y: dest.y }));
  logGroup(s, messages);
  // Only the header goes into the curated Message Log — the per-tile "↳" follow-ups are the kind
  // of verbose detail that belongs in the full Event Log, not the compact feed (mirrors how the
  // asteroid's own path sweep already treats its header vs. sub-lines differently for narrative
  // grouping — see logGroup's doc comment).
  important(
    s,
    destroyedTiles.length
      ? tr("log.asteroidDestroysSummary", { sx: source.x, sy: source.y, count: destroyedTiles.length, plural: pluralSuffix(destroyedTiles.length), dx: dest.x, dy: dest.y })
      : messages[0]
  );
  s.asteroidEventSeq += 1;
  s.lastAsteroidDestroyedTiles = destroyedTiles.map((t) => ({ x: t.x, y: t.y }));
  if (destroyedTiles.length) {
    s.starDiscard.push(...destroyedTiles.map((t) => t.card!));
  }
  checkLoss(s);
}

export function checkWin(s: GameState) {
  const required = Array.from(new Set(s.players.map((p) => p.element)));
  if (required.every((el) => isPathComplete(s.tiles, el, s.center, s.nodes))) {
    s.phase = "won";
    const msg = tr("log.win", { count: required.length });
    log(s, msg);
    important(s, msg);
  }
}

export function checkLoss(s: GameState) {
  if (s.tracker >= 100) {
    s.phase = "lost";
    s.lossReason = tr("log.lossTracker");
  } else if (s.players.every((p) => p.isStasis)) {
    s.phase = "lost";
    s.lossReason = tr("log.lossStasis");
  }
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === "START_GAME") return initGame(action.setup, action.locale, action.seed);
  if (action.type === "RESET") return { phase: "setup" } as unknown as GameState;
  if (state.phase !== "playing") return state;
  const s = clone(state);
  const p = s.players[s.active];
  const koreanArticle = getKoreanArticle(p.name);
  s.lastActedPlayerId = p.id;
  // Every action except END_TURN itself counts as "taking an action" for the HEAL_UNLOCK self-heal
  // check below — safe to set unconditionally here (rather than per-case) for the same reason
  // lastActedPlayerId above is: an invalid action's case returns the original, pre-clone `state`,
  // discarding this mutated `s` entirely, so it never sticks for a no-op dispatch.
  if (action.type !== "END_TURN") s.actedThisTurn = true;

  switch (action.type) {
    case "MOVE": {
      // A destination can be several tiles away in one click now (see getValidMoves) — the
      // reach's own cost (1 AP per tile stepped through, same rate as before) replaces the old
      // flat 1 AP deduction.
      const moves = getValidMoves(s);
      const destKey = key(action.x, action.y);
      const reach = moves.get(destKey);
      if (!reach || s.ap < reach.cost) return state;
      s.ap -= reach.cost;
      // Walk the path back to the player's starting tile, marking every INTERMEDIATE tile
      // visited too — a compressed multi-tile move is mechanically still several individual
      // moves, and Purify eligibility depends on having personally walked onto a tile, not just
      // landed on the final destination.
      let cur: string | null = destKey;
      while (cur !== null) {
        p.visited[cur] = true;
        cur = moves.get(cur)?.parent ?? null;
      }
      p.position = { x: action.x, y: action.y };
      log(s, reach.cost > 1 ? tr("log.moveMulti", { name: p.name, cost: reach.cost, x: action.x, y: action.y }) : tr("log.move", { name: p.name, x: action.x, y: action.y, koreanArticle }));
      return s;
    }
    case "PLACE": {
      const card: StarCard = p.hand[action.handIndex];
      if (!card) return state;
      const conn = validPlacement(s, p, card, action.x, action.y, action.rotation);
      if (!conn) return state;
      let cost = placementCost(p, action.x, action.y);
      const towardCenter = manhattan({ x: action.x, y: action.y }, s.center) < manhattan(p.position, s.center);
      let vanguard = false;
      if (p.sign === "ARIES" && !s.ariesUsed && towardCenter) {
        cost = 0;
        vanguard = true;
      }
      if (s.ap < cost) return state;
      s.ap -= cost;
      if (vanguard) s.ariesUsed = true;
      const completedBefore = ELEMENTS.filter((el) => isPathComplete(s.tiles, el, s.center, s.nodes));
      const rotated = conn !== card.connections;
      const placedTile = s.tiles[action.x][action.y];
      placedTile.card = { ...card, connections: conn };
      placedTile.placedBy = p.id;
      p.hand.splice(action.handIndex, 1);
      log(
        s,
        tr("log.place", { name: p.name, elementPhrase: article(elementLabel(tr, card.element)), x: action.x, y: action.y, koreanArticle }) +
        (rotated ? tr("log.placeRebelWave") : "") +
        (vanguard ? tr("log.placeVanguard") : "") +
        "."
      );
      const chainAfterGroup = computeSameElementChainGroup(s.tiles, card.element, action.x, action.y);
      const chainAfter = chainAfterGroup.size;
      // The animation/log/Message Log trigger — and the Tracker discount itself — fire on EVERY
      // placement that leaves a 3+ chain (chainAfter >= threshold), not just the one that first
      // crosses it: extending an already-3+ chain keeps discounting the Tracker further, scaling
      // with how far past the threshold the chain now sits (`chainExtraLength` below), so a longer
      // chain is worth progressively more each time it grows.
      if (chainAfter >= CHAIN_LENGTH_THRESHOLD) {
        // "Start" of the chain is whichever of its tiles sits closest to this element's own node —
        // a reasonable, well-defined anchor even for a chain that isn't a straight line. "End" is
        // simply the tile that was just placed.
        const chainNode = s.nodes[card.element];
        let chainStart = { x: action.x, y: action.y };
        let chainStartDist = Infinity;
        for (const k of chainAfterGroup) {
          const [tx, ty] = k.split(",").map(Number);
          const d = manhattan({ x: tx, y: ty }, chainNode);
          if (d < chainStartDist) {
            chainStartDist = d;
            chainStart = { x: tx, y: ty };
          }
        }
        const chainEnd = { x: action.x, y: action.y };
        s.chainEventSeq += 1;
        s.lastChainEvent = { tiles: Array.from(chainAfterGroup), start: chainStart, end: chainEnd };
        const chainExtraLength = chainAfter - CHAIN_LENGTH_THRESHOLD + 1;
        const reduction = (card.element === p.element ? CHAIN_TRACKER_DISCOUNT_OWN : CHAIN_TRACKER_DISCOUNT) + CHAIN_TRACKER_BONUS_DISCOUNT * chainExtraLength;
        s.tracker = Math.max(0, s.tracker - reduction);
        const trackerPhrase = tr("log.chainEased", { pct: reduction });
        const glyph = ELEMENT_META[card.element].glyph;
        // Capped so a very long chain (e.g. one that also happens to complete a whole path) doesn't
        // print a wall of repeated emoji into the log — the number/tracker text already conveys size.
        const glyphMsg = glyph.repeat(Math.min(chainExtraLength, 5));
        const chainMsg =
          tr("log.chain", { glyph: glyphMsg, label: elementLabel(tr, card.element), count: chainAfter, sx: chainStart.x, sy: chainStart.y, ex: chainEnd.x, ey: chainEnd.y }) +
          trackerPhrase;
        log(s, chainMsg);
        important(s, chainMsg);
      }
      if (card.element === p.element) {
        s.surgeEventSeq += 1;
        s.lastSurgeEvent = { x: action.x, y: action.y, element: card.element };
        switch (card.element) {
          case "AIR": {
            drawCards(s, p, 1);
            const msg = tr("log.airSurge", { name: p.name, koreanArticle });
            log(s, msg);
            important(s, msg);
            break;
          }
          case "FIRE": {
            let cleansed = false;
            for (const d of DIR_KEYS) {
              const [dx, dy] = DIRS[d];
              const nx = action.x + dx, ny = action.y + dy;
              if (inBounds(nx, ny) && s.tiles[nx][ny].isCorrupted) {
                s.tiles[nx][ny].isCorrupted = false;
                const msg = tr("log.fireSurgeCleanse", { x: nx, y: ny });
                log(s, msg);
                important(s, msg);
                cleansed = true;
                break;
              }
            }
            if (!cleansed) {
              const msg = tr("log.fireSurgeNoTarget");
              log(s, msg);
              important(s, msg);
            }
            break;
          }
          case "EARTH": {
            placedTile.isLocked = true;
            const msg = tr("log.earthSurge", { x: action.x, y: action.y });
            log(s, msg);
            important(s, msg);
            break;
          }
          case "WATER": {
            if (p.sign === "CANCER" && s.cancerShieldTurnsLeft < CANCER_SHIELD_TURN_LIMIT) {
              s.cancerShieldTurnsLeft = CANCER_SHIELD_TURN_LIMIT;
              const msg = tr("log.cancerShield", { name: p.name, count: CANCER_SHIELD_TURN_LIMIT - 1, plural: pluralSuffix(CANCER_SHIELD_TURN_LIMIT - 1) });
              log(s, msg);
              important(s, msg);
            }
            const wounded = s.players.filter((q) => !q.isStasis && q.hp < q.maxHp).sort((a, b) => a.hp - b.hp || (a.id === p.id ? -1 : 0));
            let msg: string;
            if (wounded.length) {
              wounded[0].hp += 1;
              msg = tr("log.waterSurgeHeal", { name: wounded[0].name, hp: wounded[0].hp });
            } else {
              msg = tr("log.waterSurgeNoTarget");
            }
            log(s, msg);
            important(s, msg);
            break;
          }
        }
      }
      for (const el of ELEMENTS) {
        if (!completedBefore.includes(el) && isPathComplete(s.tiles, el, s.center, s.nodes)) {
          // 4-player games need 4 separate completed paths to win, which is meaningfully harder
          // than 2-3 player games racing the same Eclipse Tracker — completing any one path there
          // eases the tracker as a direct balance offset (see ECLIPSE_EFFECT_SCALE_4P's comment).
          let msg = tr("log.pathComplete", { label: elementLabel(tr, el) });
          if (s.players.length === 4) {
            s.tracker = Math.max(0, s.tracker - PATH_COMPLETE_TRACKER_REDUCTION_4P);
            if (PATH_COMPLETE_TRACKER_REDUCTION_4P) {
              msg += tr("log.pathCompleteTrackerEase", { pct: PATH_COMPLETE_TRACKER_REDUCTION_4P });
            }
          }
          log(s, msg);
          important(s, msg);
        }
      }
      // A placement can newly close a loop in the connector graph (a rectangle being the simplest
      // shape) — any Star Card that helps form one becomes permanently immune to Eclipse Corruption
      // and the traveling asteroid from this point on. Only ever sets isEnclosed, never clears it,
      // so breaking the loop later (e.g. an asteroid elsewhere) doesn't strip already-earned immunity.
      let newlyEnclosed = 0;
      for (const k of findEnclosedTiles(s.tiles)) {
        const [ex, ey] = k.split(",").map(Number);
        if (!s.tiles[ex][ey].isEnclosed) {
          s.tiles[ex][ey].isEnclosed = true;
          newlyEnclosed++;
        }
      }
      if (newlyEnclosed > 0) {
        const msg = tr("log.enclosedLoop", { count: newlyEnclosed, plural: pluralSuffix(newlyEnclosed) });
        log(s, msg);
        important(s, msg);
      }
      if (placedTile.isShootingStar) activateShootingStar(s, placedTile, p);
      checkWin(s);
      return s;
    }
    case "PURIFY": {
      const targets = getValidPurifyTargets(s);
      const k = key(action.x, action.y);
      if (!targets.has(k)) return state;
      const cost = purifyCost(s, action.x, action.y);
      if (s.ap < cost) return state;
      const usedTaurus = p.sign === "TAURUS" && !s.taurusPurifyUsed;
      s.ap -= cost;
      if (usedTaurus) s.taurusPurifyUsed = true;
      s.tiles[action.x][action.y].isCorrupted = false;
      s.tiles[action.x][action.y].isPurified = true;
      s.tiles[action.x][action.y].corruptionTurnsLeft = null;
      log(s, tr("log.purify", { name: p.name, x: action.x, y: action.y, koreanArticle }) + (cost === 0 ? tr("log.purifyRootedForm") : "") + ".");
      if (p.sign === "LEO") {
        const route = tracePathBetween(s.tiles, p.position, { x: action.x, y: action.y });
        let flared = 0;
        for (const pt of route) {
          if (pt.x === action.x && pt.y === action.y) continue;
          const t = s.tiles[pt.x][pt.y];
          if (t.isCorrupted) {
            t.isCorrupted = false;
            t.isPurified = true;
            t.corruptionTurnsLeft = null;
            flared++;
          }
        }
        if (flared) log(s, tr("log.solarFlare", { count: flared, plural: pluralSuffix(flared) }));
      }
      checkWin(s);
      return s;
    }
    case "VIRGO_SHIELD": {
      if (p.sign !== "VIRGO" || s.virgoShieldCooldown > 0) return state;
      if (s.ap < 1) return state;
      if (!isValidShieldAnchor(s.tiles, action.x, action.y)) return state;
      s.ap -= 1;
      for (const pt of shieldTiles(action.x, action.y)) {
        const t = s.tiles[pt.x][pt.y];
        t.isShielded = true;
        t.shieldOwner = p.id;
      }
      s.virgoShieldCooldown = 2;
      log(s, tr("log.virgoShield", { name: p.name, x1: action.x, y1: action.y, x2: action.x + 1, y2: action.y + 1, koreanArticle }));
      return s;
    }
    case "SCORPIO_HEAL": {
      if (p.sign !== "SCORPIO" || s.scorpioUsed) return state;
      const card = p.hand[action.handIndex];
      if (!card) return state;
      const target = s.players.find((q) => q.id === action.targetId);
      if (!target || target.isStasis || target.hp >= target.maxHp) return state;
      p.hand.splice(action.handIndex, 1);
      s.starDiscard.push(card);
      s.discardEventSeq += 1;
      target.hp += 1;
      s.scorpioUsed = true;
      log(s, tr("log.scorpioHeal", { name: p.name, elementPhrase: article(elementLabel(tr, card.element)), targetName: target.name, hp: target.hp, koreanArticle }));
      return s;
    }
    case "CONVERT_HAND_EARTH": {
      if (p.sign !== "CAPRICORN") return state;
      if (s.ap < 1) return state;
      if (!p.hand.some((c) => c.element !== "EARTH")) return state;
      s.ap -= 1;
      let converted = 0;
      p.hand = p.hand.map((c) => {
        if (c.element === "EARTH") return c;
        converted++;
        return { ...c, element: "EARTH" };
      });
      log(s, tr("log.terraform", { name: p.name, count: converted, plural: pluralSuffix(converted), koreanArticle }));
      return s;
    }
    case "DISCARD": {
      if (!action.indices.length) return state;
      let cost = 1;
      let balanced = false;
      if (p.sign === "LIBRA" && !s.libraUsed) {
        cost = 0;
        balanced = true;
      }
      if (s.ap < cost) return state;
      s.ap -= cost;
      if (balanced) s.libraUsed = true;
      const idx = action.indices.slice().sort((a, b) => b - a);
      let n = 0;
      for (const i of idx) {
        const c = p.hand.splice(i, 1)[0];
        if (c) {
          s.starDiscard.push(c);
          n++;
        }
      }
      if (n > 0) s.discardEventSeq += 1;
      if (p.sign === "PISCES" && n > 0) {
        const healed = Math.min(p.maxHp, p.hp + Math.min(n, 2)) - p.hp;
        p.hp += healed;
        if (healed) log(s, tr("log.dreamWalk", { amount: healed, name: p.name }));
      }
      drawCards(s, p, handSize(s, p) - p.hand.length);
      log(s, tr("log.cosmicDiscard", { name: p.name, count: n, plural: pluralSuffix(n), koreanArticle }) + (balanced ? tr("log.cosmicDiscardBalanced") : "") + tr("log.cosmicDiscardSuffix"));
      return s;
    }
    case "END_TURN": {
      // Same "ticks only on the specific relevant player's own turn" pattern as the Virgo cooldown
      // below, but per-tile and keyed to whoever placed each corrupted card (Tile.placedBy) rather
      // than a single global cooldown. Runs FIRST, before resolveEclipse below can corrupt anything
      // new in this same dispatch — keying the decrement on `p` (the player who is ending THIS
      // turn, captured before reassignment) rather than `newActive` (the player about to start the
      // NEXT one) means a card that survives CORRUPTION_DECAY_TURNS of its own placer's turns
      // crumbles right after the end of the placer's own last chance to save it, not right before
      // their following turn even starts — the old newActive-keyed version destroyed the card
      // during the transition INTO the placer's next turn, so they'd see a countdown of 1 and then
      // the card would simply vanish before they ever got a turn where it read 0.
      for (const row of s.tiles) {
        for (const t of row) {
          if (!t.isCorrupted || t.corruptionTurnsLeft === null || t.placedBy !== p.id) continue;
          t.corruptionTurnsLeft -= 1;
          if (t.corruptionTurnsLeft <= 0) {
            const card = t.card;
            if (card) s.starDiscard.push(card);
            t.card = null;
            t.isCorrupted = false;
            t.isLocked = false;
            t.isShielded = false;
            t.shieldOwner = null;
            t.isPurified = false;
            t.placedBy = null;
            t.corruptionTurnsLeft = null;
            t.crumbleStep = s.turn;
            const msg = tr("log.corruptionDecay", { cardPhrase: card ? article(elementLabel(tr, card.element)) + " " : "a ", x: t.x, y: t.y });
            log(s, msg);
            important(s, msg);
          }
        }
      }
      // Self-heal (HEAL_UNLOCK shooting star): the player ending THIS turn rests and restores HP if
      // they took no other action all turn and aren't already at full HP. Checked against `p` (the
      // player ending their turn, captured before the active-player reassignment below) and BEFORE
      // `s.actedThisTurn` gets reset for whoever's about to become active — same "key it to the
      // player whose turn is actually ending" pattern as the corruption-decay sweep above.
      if (s.selfHealUnlocked && !s.actedThisTurn && p.hp < p.maxHp) {
        p.hp += SHOOTING_STAR_SELF_HEAL_AMOUNT;
        s.selfHealSeq += 1;
        s.lastSelfHealEvent = { playerId: p.id };
        const msg = tr("log.selfHeal", { name: p.name, amount: SHOOTING_STAR_SELF_HEAL_AMOUNT, hp: p.hp, maxHp: p.maxHp });
        log(s, msg);
        important(s, msg);
      }

      drawCards(s, p, handSize(s, p) - p.hand.length);
      resolveEclipse(s);
      checkWin(s);
      checkLoss(s);
      if (s.phase !== "playing") return s;
      for (const q of s.players) {
        if (q.isStasis && s.players.some((r) => !r.isStasis && r.id !== q.id && manhattan(r.position, q.position) <= 1)) {
          q.isStasis = false;
          q.hp = 1;
          const msg = tr("log.stasisReboot", { name: q.name });
          log(s, msg);
          important(s, msg);
        }
      }
      for (let i = 1; i <= s.players.length; i++) {
        const c = (s.active + i) % s.players.length;
        if (!s.players[c].isStasis) {
          s.active = c;
          break;
        }
      }
      const newActive = s.players[s.active];
      if (newActive.sign === "CANCER" && s.cancerShieldTurnsLeft > 0) {
        s.cancerShieldTurnsLeft -= 1;
        if (s.cancerShieldTurnsLeft === 0) {
          const msg = tr('log.cancerShieldDeactivated');
          log(s, msg);
          important(s, msg);
        }
      }
      // Ticks down only at the moment control returns to the Virgo player specifically (not once
      // per END_TURN globally), so it always represents "Virgo turns remaining until usable again"
      // regardless of how many other players' turns pass in between. Using the shield sets this to
      // 2: the first decrement (arriving back at THIS turn) leaves it at 1, so it's still disabled
      // for Virgo's very next turn; the second decrement (arriving at the turn after that) clears it
      // to 0. A value of 1 here would let it clear on Virgo's very next turn instead of the one after.
      if (newActive.sign === "VIRGO" && s.virgoShieldCooldown > 0) s.virgoShieldCooldown -= 1;
      s.ap = STARTING_AP + s.apBonus;
      s.ariesUsed = false;
      s.libraUsed = false;
      s.taurusPurifyUsed = false;
      s.scorpioUsed = false;
      s.actedThisTurn = false;
      s.turn += 1;
      s.turnsUntilAsteroidShift -= 1;
      if (s.turnsUntilAsteroidShift <= 0) {
        triggerAsteroidShift(s);
        s.turnsUntilAsteroidShift = asteroidShiftInterval(s.players.length);
        if (s.phase !== "playing") return s;
      }
      log(s, tr("log.turnAnnounce", { name: s.players[s.active].name, ap: s.ap }));
      return s;
    }
  }
  return s;
}
