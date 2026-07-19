import { navigate } from "../hooks/useRoute";
import { useTranslation } from "../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

/** The app's landing page (`/celestial-alignment`, or `/` in dev) — just a centered title/tagline
 * and the three top-level destinations, stacked vertically with Play weighted as the obviously
 * primary action. Setup/gameplay itself lives entirely under the "play" route now (see
 * PlayScreen in App.tsx); this screen never touches game state. */
export function HomeScreen() {
  const { t } = useTranslation();
  return (
    <div className="relative w-full max-w-xl mx-auto min-h-dvh flex flex-col items-center justify-center gap-8 py-8 px-4">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="text-center">
        <div className="text-3xl md:text-4xl font-bold tracking-[0.3em] uppercase" style={{ color: "#f1eeff", textShadow: "0 0 12px #5eb3ff, 0 0 30px #ff00ff" }}>
          {t("common.appNameLine1")}
        </div>
        <div className="text-3xl md:text-4xl font-bold tracking-[0.3em] uppercase" style={{ color: "#5eb3ff", textShadow: "0 0 12px #5eb3ff" }}>
          {t("common.appNameLine2")}
        </div>
        <div className={`mt-3 text-sm tracking-widest uppercase`} style={{ color: "#6d5f94", padding: "0px 40px" }}>
          {t("common.tagline")}
        </div>
      </div>

      <div className="w-full max-w-xs flex flex-col gap-4">
        <button
          onClick={() => navigate("play")}
          className="px-8 py-4 rounded border text-lg font-bold uppercase tracking-[0.25em]"
          style={{ borderColor: "#5eb3ff", color: "#0b0914", background: "#5eb3ff", boxShadow: "0 0 24px #5eb3ff" }}
        >
          {t("home.play")} ▸
        </button>
        <button
          onClick={() => navigate("how-to-play")}
          className="px-6 py-2.5 rounded border text-sm font-bold uppercase tracking-widest"
          style={{ borderColor: "#c084fc", color: "#c084fc", background: "transparent" }}
        >
          ✦ {t("home.howToPlay")}
        </button>
        <button
          onClick={() => navigate("settings")}
          className="px-6 py-2.5 rounded border text-sm font-bold uppercase tracking-widest"
          style={{ borderColor: "#3b2d5e", color: "#a99cd4", background: "transparent" }}
        >
          ⚙ {t("home.settings")}
        </button>
      </div>
    </div>
  );
}
