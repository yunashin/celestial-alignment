import { BODY_FONT_SIZE } from "../constants";
import { useTranslation } from "../i18n";

export function WinBanner({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  const c = "#3dd68c";
  return (
    // `mb-6` — the board's top edge label (e.g. "Water") pokes up ABOVE the board wrapper's own
    // box via GridBoard's EdgeLabel (`transform: translate(-50%, calc(-100% - 0.6rem))`), poking up
    // by its own rendered height plus 0.6rem — more than the parent flex container's own `gap-1.5
    // md:gap-3` between this banner and the board wrapper below it. Without this margin the label
    // actually overlaps the bottom of this banner (confirmed by measuring both boxes' rects — the
    // label's top edge sat above this banner's bottom edge by several px), not just sit close to
    // it. `mb-6` clears that overlap with a bit of genuine visible gap left over, at both the
    // mobile (10px label font) and desktop (16px label font, taller so it pokes up further) sizes.
    <div
      className="rounded-xl border px-4 py-3 mb-6 flex items-center justify-between gap-4 flex-wrap"
      style={{ borderColor: c, background: "rgba(16,12,30,0.9)", boxShadow: `0 0 20px ${c}66` }}
    >
      <div>
        <div className="text-lg font-bold tracking-[0.2em] uppercase" style={{ color: c, textShadow: `0 0 10px ${c}`, animation: "caPulse 1.6s ease-in-out infinite" }}>
          {t("winBanner.title")}
        </div>
        <div className={`text-[${BODY_FONT_SIZE}]`} style={{ color: "#d9d2f0" }}>
          {t("winBanner.text")}
        </div>
      </div>
      <button onClick={onReset} className="px-5 py-2 rounded border text-xs font-bold tracking-[0.25em] uppercase shrink-0" style={{ borderColor: c, color: c, boxShadow: `0 0 12px ${c}66` }}>
        {t("common.newRun")}
      </button>
    </div>
  );
}
