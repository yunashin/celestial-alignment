import { useTranslation } from "../i18n";

export function EndTurnConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(11,9,20,0.75)" }}>
      <div
        className="max-w-sm w-full rounded-xl border p-5 text-center"
        style={{ borderColor: "#ff00ff", background: "rgba(16,12,30,0.97)", boxShadow: "0 0 24px rgba(255,0,255,0.25)" }}
      >
        <div className="text-sm font-bold tracking-widest uppercase mb-2" style={{ color: "#f1eeff" }}>
          {t("endTurnModal.title")}
        </div>
        <div className="text-xs mb-4 leading-snug" style={{ color: "#a99cd4" }}>
          {t("endTurnModal.text")}
        </div>
        <div className="flex justify-center gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded border text-xs font-bold tracking-widest uppercase"
            style={{ borderColor: "#3b2d5e", color: "#c084fc" }}
          >
            {t("endTurnModal.keepPlaying")}
            <div className="text-[11px] font-normal opacity-70">Esc</div>
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded border text-xs font-bold tracking-widest uppercase"
            style={{ borderColor: "#ff00ff", color: "#ff00ff", boxShadow: "0 0 10px #ff00ff66" }}
          >
            {t("endTurnModal.confirm")}
            <div className="text-[11px] font-normal opacity-70">Enter</div>
          </button>
        </div>
      </div>
    </div>
  );
}
