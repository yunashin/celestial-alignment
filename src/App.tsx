import { GameScreen } from "./components/GameScreen";
import { SetupScreen } from "./components/SetupScreen";
import { useGameEngine } from "./hooks/useGameEngine";
import { useTranslation } from "./i18n";
import { GLOBAL_CSS, STARFIELD } from "./styles";

export default function App() {
  const { state, dispatch } = useGameEngine();
  const { locale } = useTranslation();
  return (
    <div className="relative min-h-dvh w-full overflow-y-auto overflow-x-hidden overscroll-x-none touch-pan-y">
      <div className="fixed inset-0 -z-10" style={STARFIELD} />
      <style>{GLOBAL_CSS}</style>
      {state.phase === "setup" ? (
        <SetupScreen onStart={(setup, seed) => dispatch({ type: "START_GAME", setup, locale, seed })} />
      ) : (
        <GameScreen state={state} dispatch={dispatch} />
      )}
    </div>
  );
}
