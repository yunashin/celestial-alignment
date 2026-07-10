import { SHOOTING_STAR_AP_BONUS, SHOOTING_STAR_HAND_BONUS, SHOOTING_STAR_SELF_HEAL_AMOUNT, SHOOTING_STAR_TRACKER_DOWN_PCT, STARTING_HP } from "../constants";
import type { Element, PowerUp, Sign } from "../types";

/** Matches both the plain `t` exported from ./index and the one `useTranslation()` returns —
 * every helper below just needs *some* translate function, reactive or not, so callers can pass
 * whichever fits their context (a React component's hook-bound `t`, or the plain engine-side one). */
export type TFunc = (key: string, params?: Record<string, string | number>) => string;

// Small wrappers around a dot-path lookup so call sites read as "give me this sign's label" rather
// than hand-assembling `signs.${sign}.label` strings inline everywhere — keeps the YAML key shape
// as an implementation detail of this one file.
export const signLabel = (t: TFunc, sign: Sign): string => t(`signs.${sign}.label`);
export const signAbility = (t: TFunc, sign: Sign): string => t(`signs.${sign}.ability`);
export const signDesc = (t: TFunc, sign: Sign): string => t(`signs.${sign}.desc`);
export const elementLabel = (t: TFunc, element: Element): string => t(`elements.${element}.label`);
export const elementDescription = (t: TFunc, element: Element): string => t(`elements.${element}.description`);
export const surgeText = (t: TFunc, element: Element): string => t(`surge.${element}`);

/** The shooting-star power-up payoff blurb, with the relevant SHOOTING_STAR_ and STARTING_HP
 * tuning constants folded in as interpolation params — these numbers live in constants.ts
 * (difficulty tuning), not duplicated into the translation files, so changing a constant
 * automatically updates the blurb in every locale without touching en.yaml/ko.yaml at all. */
export function powerUpText(t: TFunc, powerUp: PowerUp): string {
  switch (powerUp) {
    case "TRACKER_DOWN":
      return t("powerUps.TRACKER_DOWN", { pct: SHOOTING_STAR_TRACKER_DOWN_PCT });
    case "BONUS_AP":
      return t("powerUps.BONUS_AP", { amount: SHOOTING_STAR_AP_BONUS });
    case "BONUS_HAND":
      return t("powerUps.BONUS_HAND", { amount: SHOOTING_STAR_HAND_BONUS });
    case "HEAL_UNLOCK":
      return t("powerUps.HEAL_UNLOCK", { healAmount: SHOOTING_STAR_SELF_HEAL_AMOUNT, threshold: STARTING_HP - 1 });
  }
}
