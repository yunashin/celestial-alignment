import { GameScreen } from "./components/GameScreen";
import { SetupScreen } from "./components/SetupScreen";
import { useGameEngine } from "./hooks/useGameEngine";
import { GLOBAL_CSS, STARFIELD } from "./styles";

export default function App() {
  const { state, dispatch } = useGameEngine();
  return (
    <div className="relative min-h-dvh w-full overflow-y-auto">
      <div className="fixed inset-0 -z-10" style={STARFIELD} />
      <style>{GLOBAL_CSS}</style>
      {state.phase === "setup" ? (
        <SetupScreen onStart={(setup, seed) => dispatch({ type: "START_GAME", setup, seed })} />
      ) : (
        <GameScreen state={state} dispatch={dispatch} />
      )}
    </div>
  );
}
