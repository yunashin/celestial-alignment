import { useTranslation } from "../i18n";

/** Shown whenever the player tries to leave an in-progress game via the in-app Back button or the
 * browser's own back button (see GameScreen's own leave-guard effect) — refreshing or closing the
 * tab instead trigger the browser's native `beforeunload` prompt, which can't be styled/replaced,
 * so this modal only ever covers the two IN-APP-interceptable paths. Visually mirrors
 * EndTurnConfirmModal (same overlay/card/button shape) but in a warning pink rather than magenta,
 * since leaving mid-game is a more final, harder-to-walk-back action than ending a turn. */
export function LeaveGameConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(11,9,20,0.75)" }}>
      <div
        className="max-w-sm w-full rounded-xl border p-5 text-center"
        style={{ borderColor: "#ff5f9e", background: "rgba(16,12,30,0.97)", boxShadow: "0 0 24px rgba(255,95,158,0.25)" }}
      >
        <div className="text-sm font-bold tracking-widest uppercase mb-2" style={{ color: "#f1eeff" }}>
          {t("leaveGameModal.title")}
        </div>
        <div className="text-xs mb-4 leading-snug" style={{ color: "#a99cd4" }}>
          {t("leaveGameModal.text")}
        </div>
        <div className="flex justify-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded border text-xs font-bold tracking-widest uppercase"
            style={{ borderColor: "#3b2d5e", color: "#c084fc" }}
          >
            {t("leaveGameModal.stay")}
            <div className="text-[11px] font-normal opacity-70">Esc</div>
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded border text-xs font-bold tracking-widest uppercase"
            style={{ borderColor: "#ff5f9e", color: "#ff5f9e", boxShadow: "0 0 10px #ff5f9e66" }}
          >
            {t("leaveGameModal.leave")}
            <div className="text-[11px] font-normal opacity-70">Enter</div>
          </button>
        </div>
      </div>
    </div>
  );
}
