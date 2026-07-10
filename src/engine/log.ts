import type { GameState } from "../types";

/** Formats a number for display in a log message: whole when the value is (effectively) an
 * integer, otherwise rounded to 1 decimal place. Several tracker-related values are deliberately
 * left as raw floats in state (see CLAUDE.md's 4-player-balance note — `s.tracker` and Eclipse
 * card amounts scaled by `ECLIPSE_EFFECT_SCALE_4P` are non-integer by design), which prints ugly
 * floating-point noise like "2.0999999999999996%" if interpolated directly. Every log message
 * that embeds a tracker delta or running total should route it through this first. */
export function fmtNum(n: number): string {
  const rounded1 = Math.round(n * 10) / 10;
  return Number.isInteger(rounded1) ? String(rounded1) : rounded1.toFixed(1);
}

export function log(s: GameState, msg: string) {
  s.log.unshift(msg);
  if (s.log.length > 40) s.log.pop();
}

/** Logs a batch of messages so they read top-to-bottom in the given (narrative) order, despite
 * `log`'s unshift-to-front convention — the last message in `messages` is logged first so the
 * first ends up on top. Use this for grouped events (e.g. an asteroid's header + per-tile lines)
 * where the individual `log` calls would otherwise interleave backwards. */
export function logGroup(s: GameState, messages: string[]) {
  for (let i = messages.length - 1; i >= 0; i--) log(s, messages[i]);
}

/** Surfaces a message in the compact, curated `GameState.messageLog` alongside the full Event Log
 * — genuinely notable events only (Eclipse cards resolving, shooting stars, asteroid shifts,
 * chain-of-4+, path completions, closed loops, Element Surge, Stasis reboots, win/loss),
 * deliberately excluding routine per-turn narration (whose turn it is, a Guardian moving,
 * channeling a card, purifying, healing). Call this IN ADDITION to `log`/`logGroup` with the same
 * call site's message — it never substitutes for the full Event Log, it only mirrors select
 * entries into the shorter, curated feed. `messageSeq` increments on every call, uncapped (unlike
 * `messageLog` itself, capped at 20) — `StatusMessage`'s `GameScreen` wiring diffs it against the
 * previous render to know exactly how many entries at the front of `messageLog` are new since last
 * time, since a single dispatch can call `important` more than once (e.g. a placement that both
 * completes a chain-of-4 and triggers an Element Surge). */
export function important(s: GameState, msg: string) {
  s.messageLog.unshift(msg);
  if (s.messageLog.length > 20) s.messageLog.pop();
  s.messageSeq += 1;
}
