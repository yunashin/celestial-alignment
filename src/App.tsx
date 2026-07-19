import { HomeScreen } from "./components/HomeScreen";
import { HowToPlayScreen } from "./components/HowToPlayScreen";
import { PlayScreen } from "./components/PlayScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { useBackgroundMusic } from "./hooks/useBackgroundMusic";
import { useRoute } from "./hooks/useRoute";
import { GLOBAL_CSS, STARFIELD } from "./styles";

export default function App() {
  const route = useRoute();
  // Mounted once here (not inside any individual screen) so it plays continuously across every
  // route and never restarts when a player starts a new game — see the hook's own doc comment.
  useBackgroundMusic();
  return (
    <div className="relative min-h-dvh w-full overflow-y-auto overflow-x-hidden overscroll-x-none touch-pan-y">
      <div className="fixed inset-0 -z-10" style={STARFIELD} />
      <style>{GLOBAL_CSS}</style>
      {route === "home" && <HomeScreen />}
      {route === "play" && <PlayScreen />}
      {route === "how-to-play" && <HowToPlayScreen />}
      {route === "settings" && <SettingsScreen />}
    </div>
  );
}
