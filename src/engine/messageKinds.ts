/** Every distinct category of `important()` event the engine can raise, tagged at each call site
 * (see reducer.ts/eclipse.ts) alongside the message text itself. `GameState.messageKindLog` mirrors
 * `GameState.messageLog` entry-for-entry (same unshift/cap-20 shape, kept in lockstep by
 * `important()` — see log.ts) so a UI surface that only sees resolved message TEXT can still know
 * what kind of thing produced each one, e.g. to pick a title or a sound cue. */
export type MessageKind =
  | "GAME_START"
  | "WIN"
  | "PATH_COMPLETE"
  | "SHOOTING_STAR"
  | "ASTEROID"
  | "ECLIPSE_CORRUPTION"
  | "ECLIPSE_VOID"
  | "ECLIPSE_SURGE"
  | "ECLIPSE_DAMAGE"
  | "CHAIN"
  | "ELEMENT_SURGE"
  | "ENCLOSED_LOOP"
  | "CORRUPTION_DECAY"
  | "STASIS_REBOOT"
  | "SELF_HEAL"
  | "CANCER_SHIELD"
  | "DAMAGE";

/** ============================================================================================
 * MODAL TITLE PRIORITY — edit this freely to change which event "wins" the ImportantMessagesModal
 * title when a single batch (one dispatch's worth of `important()` calls — see GameScreen's
 * seq-diffing effect) contains more than one kind of event at once (e.g. an END_TURN dispatch that
 * both decays a corrupted card AND resolves an Eclipse card). FIRST entry = highest priority. A
 * kind not listed here falls back to the lowest priority (shown only if nothing else in the batch
 * is ranked). The actual title TEXT per kind lives in i18n (`eventModal.titles.<KIND>` in
 * en.yaml/ko.yaml), not here — this array only decides WHICH kind's title wins.
 * ============================================================================================ */
export const MESSAGE_TITLE_PRIORITY: MessageKind[] = [
  "GAME_START", // always alone (only ever raised once, at initGame) — kept first for clarity anyway
  "WIN",
  "PATH_COMPLETE",
  "SHOOTING_STAR",
  "ECLIPSE_DAMAGE",
  "ASTEROID",
  "ECLIPSE_CORRUPTION",
  "STASIS_REBOOT",
  "ECLIPSE_VOID",
  "CHAIN",
  "ECLIPSE_SURGE",
  "ELEMENT_SURGE",
  "ENCLOSED_LOOP",
  "CORRUPTION_DECAY",
  "CANCER_SHIELD",
  "SELF_HEAL",
  "DAMAGE"
];

/** Picks whichever kind present in `kinds` sits highest in MESSAGE_TITLE_PRIORITY. Falls back to
 * the batch's first (chronologically earliest) kind if none of them appear in the priority list at
 * all — shouldn't normally happen since the list above covers every MessageKind, but keeps this
 * total rather than throwing if the two ever drift apart. */
export function pickTitleKind(kinds: MessageKind[]): MessageKind | null {
  if (!kinds.length) return null;
  let best: MessageKind = kinds[0];
  let bestRank = MESSAGE_TITLE_PRIORITY.indexOf(best);
  if (bestRank === -1) bestRank = Infinity;
  for (const k of kinds.slice(1)) {
    let rank = MESSAGE_TITLE_PRIORITY.indexOf(k);
    if (rank === -1) rank = Infinity;
    if (rank < bestRank) {
      best = k;
      bestRank = rank;
    }
  }
  return best;
}
