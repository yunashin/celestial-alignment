import boardImage from "../assets/how-to-play/story.png";
import corruptionImage from "../assets/how-to-play/corrupted-star-card.png";
import { navigate } from "../hooks/useRoute";
import { useTranslation } from "../i18n";
import { HowToPlay } from "./HowToPlay";
import { LanguageSwitcher } from "./LanguageSwitcher";

/** Standalone `/how-to-play` page — just a header (Back-to-home + language switcher) over the same
 * <HowToPlay> content that used to live behind SetupScreen's "How to Play" tab. Deliberately no
 * player-count/guardian-count buttons here (those drove which tab showed on the old combined setup
 * screen; this page only ever shows the guide, so there's nothing left for them to switch between). */
export function HowToPlayScreen() {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4 py-8 px-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("home")}
          className="px-2 py-1 rounded border text-xs font-bold tracking-widest uppercase"
          style={{ borderColor: "#3b2d5e", color: "#a99cd4" }}
        >
          ◂ {t("common.backToHome")}
        </button>
        <LanguageSwitcher />
      </div>

      <div className="text-center">
        <div className="text-xl md:text-2xl font-bold tracking-[0.3em] uppercase" style={{ color: "#5eb3ff", textShadow: "0 0 10px #5eb3ff88" }}>
          ✦ {t("home.howToPlay")}
        </div>
      </div>

      <div className="rounded-lg border p-3" style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.8)" }}>
        <HowToPlay t={t} screenshots={{ board: boardImage, corruption: corruptionImage }} />
      </div>
    </div>
  );
}
