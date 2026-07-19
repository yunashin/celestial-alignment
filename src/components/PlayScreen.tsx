import { useGameEngine } from "../hooks/useGameEngine";
import { useTranslation } from "../i18n";
import { GameScreen } from "./GameScreen";
import { SetupScreen } from "./SetupScreen";

/** `/play` — everything that used to be the entire app: the setup form, then (once `state.phase`
 * leaves "setup") the game itself. Deliberately owns its own `useGameEngine()` instance rather than
 * App.tsx holding it — there's no mid-game persistence anyway (see CLAUDE.md), so navigating away
 * from `/play` and back always starts at a fresh Setup form, matching how the game already behaved
 * before this route even existed (Back → RESET already dropped straight to Setup, discarding
 * whatever game was in progress). */
export function PlayScreen() {
  const { state, dispatch } = useGameEngine();
  const { locale } = useTranslation();
  return state.phase === "setup" ? (
    <SetupScreen onStart={(setup, seed) => dispatch({ type: "START_GAME", setup, locale, seed })} />
  ) : (
    <GameScreen state={state} dispatch={dispatch} />
  );
}
