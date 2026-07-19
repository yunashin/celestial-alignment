import { navigate } from "../hooks/useRoute";
import { useTranslation } from "../i18n";
import { playSound } from "../utils/sound";
import { setSettings, useSettings } from "../utils/settings";
import { LanguageSwitcher } from "./LanguageSwitcher";

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-bold tracking-widest uppercase" style={{ color: "#a99cd4" }}>
          {label}
        </label>
        <span className="text-sm font-bold tabular-nums" style={{ color: "#5eb3ff" }}>
          {pct}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full"
        style={{ accentColor: "#5eb3ff" }}
      />
    </div>
  );
}

/** `/settings` — the only place background-music and sound-effects volume can be changed, both
 * persisted to localStorage (see utils/settings.ts) and applied live: the music slider immediately
 * retunes whatever's currently playing (see useBackgroundMusic's own volume-sync effect — though in
 * practice nothing IS playing here, since that hook only mounts inside GameScreen), and the SFX
 * slider's own "Test" button plays a real cue through the exact same synthesized-audio path a game
 * event would, so there's still live feedback for it on this page. */
export function SettingsScreen() {
  const { t } = useTranslation();
  const { musicVolume, sfxVolume } = useSettings();
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
          ⚙ {t("home.settings")}
        </div>
      </div>

      <div className="rounded-lg border p-4 flex flex-col gap-5" style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.8)" }}>
        <VolumeSlider label={t("settings.musicVolume")} value={musicVolume} onChange={(musicVolume) => setSettings({ musicVolume })} />
        <div className="flex flex-col gap-1.5">
          <VolumeSlider label={t("settings.sfxVolume")} value={sfxVolume} onChange={(sfxVolume) => setSettings({ sfxVolume })} />
          <button
            type="button"
            onClick={() => playSound("PATH_COMPLETE")}
            className="self-start px-3 py-1 rounded border text-[11px] font-bold tracking-widest uppercase"
            style={{ borderColor: "#3b2d5e", color: "#c084fc" }}
          >
            ▶ {t("settings.testSound")}
          </button>
        </div>
      </div>
    </div>
  );
}
