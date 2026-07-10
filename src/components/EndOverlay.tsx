import { useTranslation } from "../i18n";
import { Tooltip } from "./Tooltip";

export function EndOverlay({ reason, onReset, onClose }: { reason: string | null; onReset: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const c = "#ff00ff";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(11,9,20,0.88)" }}>
      <Tooltip className="absolute top-4 right-4" text={t("endOverlay.closeTooltip")} side="left">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full border flex items-center justify-center text-lg leading-none"
          style={{ borderColor: c, color: c, boxShadow: `0 0 10px ${c}66` }}
        >
          ✕
        </button>
      </Tooltip>
      <div className="text-center max-w-sm">
        <div
          className="text-3xl font-bold tracking-[0.25em] uppercase mb-3"
          style={{ color: c, textShadow: `0 0 16px ${c}, 0 0 40px ${c}`, animation: "caPulse 1.6s ease-in-out infinite" }}
        >
          {t("endOverlay.title")}
        </div>
        <div className="text-sm mb-6" style={{ color: "#d9d2f0" }}>
          {reason}
        </div>
        <button onClick={onReset} className="px-6 py-2 rounded border text-xs font-bold tracking-[0.25em] uppercase" style={{ borderColor: c, color: c, boxShadow: `0 0 12px ${c}66` }}>
          {t("common.newRun")}
        </button>
      </div>
    </div>
  );
}
