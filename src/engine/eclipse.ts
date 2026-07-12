import { CORRUPTION_DECAY_TURNS, DIRS, DIR_KEYS, ECLIPSE_EFFECT_SCALE_4P, ECLIPSE_NO_TARGET_TRACKER_BUMP, ECLIPSE_SURGE_CORRUPTION_SCALING, ELEMENT_META, ELEMENTS, HAZARD_DAMAGE, ECLIPSE_VOID_TRACKER_BUMP, ECLIPSE_CORRUPTION_TRACKER_BUMP } from "../constants";
import type { GameState, Player } from "../types";
import { computeNetwork, inBounds, isPathComplete, key, manhattan, shuffle } from "./board";
import { fmtNum, important, log, logGroup, trackerDelta } from "./log";
import { pluralSuffix } from "../utils/grammar";
// Aliased to `tr` (not `t`) — this file uses `t` extensively as a local Tile variable name (e.g.
// `for (const t of row)`), which would otherwise shadow the translate function.
import { t as tr } from "../i18n";
import { elementLabel } from "../i18n/gameText";

/** 4-player games need 4 separate completed paths to win, so every Eclipse card's tracker effect
 * is scaled down to compensate — see PATH_COMPLETE_TRACKER_REDUCTION_4P for the other half of this
 * balance pass (applied on path completion, in reducer.ts's PLACE case). */
function eclipseEffectScale(s: GameState): number {
  return s.players.length === 4 ? ECLIPSE_EFFECT_SCALE_4P : 1;
}

export function isShielded(s: GameState, target: Player): boolean {
  return s.players.some(
    (p) => !p.isStasis && p.sign === "CANCER" && manhattan(p.position, target.position) <= 1 && s.cancerShieldTurnsLeft > 0
  );
}

function findShieldingCancer(s: GameState, target: Player): Player | undefined {
  return s.players.find((p) => !p.isStasis && p.sign === "CANCER" && manhattan(p.position, target.position) <= 1 && s.cancerShieldTurnsLeft > 0);
}

/** Tiles on or adjacent to a (non-Stasis) Cancer Guardian — the same radius `isShielded` uses for
 * player damage, exposed here so the board can render it and so asteroids know not to destroy
 * cards inside it (see reducer.ts's triggerAsteroidShift). */
export function computeLunarShieldTiles(s: GameState): Set<string> {
  const tiles = new Set<string>();
  for (const p of s.players) {
    if (p.isStasis || p.sign !== "CANCER" || s.cancerShieldTurnsLeft === 0) continue;
    tiles.add(key(p.position.x, p.position.y));
    for (const d of DIR_KEYS) {
      const [dx, dy] = DIRS[d];
      const nx = p.position.x + dx, ny = p.position.y + dy;
      if (inBounds(nx, ny)) tiles.add(key(nx, ny));
    }
  }
  return tiles;
}

/** `out`, when passed, collects messages instead of logging them immediately — used by callers
 * (e.g. the asteroid's per-tile sweep) that need to interleave this in narrative order via logGroup.
 * Only standalone calls (no `out`) mirror their message into the curated Message Log — a grouped
 * call already has its own header message marked important by the caller (see triggerAsteroidShift
 * in reducer.ts), so per-tile damage lines within that group would just be redundant sub-line
 * clutter in the compact feed. */
export function damage(s: GameState, target: Player, amt: number, source: string, out?: string[]) {
  if (target.isStasis) return;
  const emit = (msg: string) => {
    if (out) out.push(msg);
    else {
      log(s, msg);
      important(s, msg);
    }
  };
  const shieldingCancer = findShieldingCancer(s, target);
  if (shieldingCancer) {
    emit(tr("log.lunarShieldAbsorbs", { source, name: target.name }));
    s.shieldBlockSeq += 1;
    s.lastShieldBlock = { playerId: shieldingCancer.id, kind: "CANCER" };
    return;
  }
  target.hp = Math.max(0, target.hp - amt);
  emit(tr("log.damageTaken", { name: target.name, amount: amt, source, hp: target.hp }));
  if (target.hp === 0) {
    target.isStasis = true;
    emit(tr("log.knockedIntoStasis", { name: target.name }));
  }
}

export function resolveEclipse(s: GameState) {
  if (!s.eclipseDeck.length) {
    s.eclipseDeck = shuffle(s.eclipseDiscard);
    s.eclipseDiscard = [];
    s.eclipseDeckShuffleSeq += 1;
  }
  const c = s.eclipseDeck.shift();
  if (!c) return;
  s.eclipseDiscard.push(c);

  const emitEvent = (x: number | null, y: number | null) => {
    s.eclipseEventSeq += 1;
    s.lastEclipseEvent = { kind: c.type, x, y };
  };

  if (c.type === "CORRUPTION") {
    // crossCenter: false — see triggerAsteroidShift's identical fix in reducer.ts for why: the
    // default (true) traversal tunnels through the Orrery into another element's network, wrongly
    // sealing an incomplete/impure path fragment against Corruption just because it also touches
    // the center hub.
    const sealed = new Set<string>();
    for (const el of ELEMENTS) {
      if (isPathComplete(s.tiles, el, s.center, s.nodes)) computeNetwork(s.tiles, el, s.center, s.nodes, false).forEach((k) => sealed.add(k));
    }
    const targets = [];
    for (const row of s.tiles) for (const t of row) {
      if (t.card && t.card.element === c.element && !t.isCorrupted && !t.isLocked && !t.isShielded && !t.isEnclosed && !t.isPurified && !sealed.has(key(t.x, t.y))) {
        targets.push(t);
      }
    }
    if (targets.length) {
      const t = targets[Math.floor(Math.random() * targets.length)];
      t.isCorrupted = true;
      t.corruptionTurnsLeft = CORRUPTION_DECAY_TURNS;
      const trackerBefore = s.tracker;
      s.tracker = s.tracker + ECLIPSE_CORRUPTION_TRACKER_BUMP;
      const msg = tr("log.corruptionSeize", { glyph: ELEMENT_META[c.element!].glyph, label: elementLabel(tr, c.element!), x: t.x, y: t.y, pct: ECLIPSE_CORRUPTION_TRACKER_BUMP });
      log(s, msg + trackerDelta(trackerBefore, s.tracker));
      important(s, msg);
      emitEvent(t.x, t.y);
      for (const p of s.players) {
        if (p.position.x === t.x && p.position.y === t.y) damage(s, p, HAZARD_DAMAGE, tr("log.damageSourceCorruption"));
      }
    } else {
      const bump = ECLIPSE_NO_TARGET_TRACKER_BUMP * eclipseEffectScale(s);
      const trackerBefore = s.tracker;
      s.tracker = Math.min(100, s.tracker + bump);
      const msg = tr("log.corruptionNoTarget", { label: elementLabel(tr, c.element!), pct: fmtNum(bump) });
      log(s, msg + trackerDelta(trackerBefore, s.tracker));
      important(s, msg);
      emitEvent(null, null);
    }
  } else if (c.type === "VOID") {
    const empties = [];
    for (const row of s.tiles) for (const t of row) {
      if (!t.card && !t.node && !t.isCenter && !t.isAsteroid && !t.isVoid && !t.isShielded && !t.isShootingStar) empties.push(t);
    }
    if (empties.length) {
      const t = empties[Math.floor(Math.random() * empties.length)];
      t.isVoid = true;
      const trackerBefore = s.tracker;
      s.tracker = s.tracker + ECLIPSE_VOID_TRACKER_BUMP;
      const msg = tr("log.voidForms", { x: t.x, y: t.y, pct: ECLIPSE_VOID_TRACKER_BUMP });
      log(s, msg + trackerDelta(trackerBefore, s.tracker));
      important(s, msg);
      emitEvent(t.x, t.y);
      for (const p of s.players) {
        if (manhattan(p.position, t) === 1) damage(s, p, HAZARD_DAMAGE, tr("log.damageSourceVoidGravity"));
      }
    } else {
      const bump = ECLIPSE_NO_TARGET_TRACKER_BUMP * eclipseEffectScale(s);
      const trackerBefore = s.tracker;
      s.tracker = Math.min(100, s.tracker + bump);
      const msg = tr("log.voidNoSpace", { pct: fmtNum(bump), total: fmtNum(s.tracker) });
      log(s, msg + trackerDelta(trackerBefore, s.tracker));
      important(s, msg);
      emitEvent(null, null);
    }
  } else if (c.type === "SURGE") {
    let corrupted = 0;
    for (const row of s.tiles) for (const t of row) if (t.isCorrupted) corrupted++;
    const scaling = ECLIPSE_SURGE_CORRUPTION_SCALING * corrupted;
    const amt = (c.amount! + scaling) * eclipseEffectScale(s);
    const trackerBefore = s.tracker;
    s.tracker = Math.min(100, s.tracker + amt);
    const msg =
      tr("log.eclipseSurge", { amt: fmtNum(amt) }) +
      (corrupted ? tr("log.eclipseSurgeScaling", { pct: fmtNum(scaling * eclipseEffectScale(s)), count: corrupted, plural: pluralSuffix(corrupted) }) : ".");
    log(s, msg + trackerDelta(trackerBefore, s.tracker));
    important(s, msg);
    emitEvent(null, null);
  } else {
    // DAMAGE — unlike Corruption/Void (which pick ONE random tile/target), this hits EVERY living
    // Guardian of the card's own element(s) directly, by design ("target damaging players directly
    // rather than by random chance"). The header carries the card's own flavor text with the
    // standard "🌒 Eclipse:" prefix applied here (not stored on the card itself — see EclipseCard's
    // own doc comment); each victim's own damage line is collected via `damage()`'s `out` param and
    // flushed together with logGroup so they read top-to-bottom under the header instead of
    // reversed (log() unshifts — see CLAUDE.md's note on this exact pattern, used identically by
    // the asteroid's per-tile sweep). `c.damageMessage` holds a translation KEY (see DamageCardMeta
    // in types.ts), resolved here via tr() at the moment the card actually resolves.
    const damageElementsList = c.damageElements!.reduce((elements, element) => elements += ELEMENT_META[element].glyph, "");
    const headerMsg = tr("log.eclipseDamageHeader", { glyphs: damageElementsList, message: tr(c.damageMessage!) });
    const messages: string[] = [headerMsg];
    const victims = s.players.filter((p) => !p.isStasis && c.damageElements!.includes(p.element));
    for (const p of victims) damage(s, p, c.damageHpLost!, tr("log.damageSourceEclipse"), messages);
    logGroup(s, messages);
    important(s, headerMsg);
    emitEvent(null, null);
  }
}
