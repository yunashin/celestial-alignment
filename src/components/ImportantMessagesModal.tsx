import { useTranslation } from "../i18n";

/** Replaces the old always-on StatusMessage banner: every batch of `important()` messages a single
 * dispatch produced (a full player turn — corruption decay, self-heal, the resolved Eclipse card,
 * a stasis reboot — or, mid-turn, a placement's own path-complete/chain/surge/loop events) is shown
 * together in one centered modal instead of trickling through a small banner one message at a time.
 * `GameScreen` queues each new batch (see its seq-diffing effect) and only advances to the next once
 * this one is dismissed, so simultaneous events from different dispatches never visually overlap.
 *
 * `title` is resolved by GameScreen from the batch's own `messageKindLog` slice via
 * `pickTitleKind` (engine/messageKinds.ts) — whichever MessageKind ranks highest in
 * MESSAGE_TITLE_PRIORITY wins the title for the whole batch, falling back to the generic
 * `eventModal.title` if the batch's kind couldn't be resolved (shouldn't normally happen).
 *
 * Dismissed via the Continue button, clicking anywhere on the backdrop, or Space/Enter — the latter
 * handled by GameScreen's own keydown effect (mirroring EndTurnConfirmModal's pattern) rather than a
 * listener owned by this component, so it can't double-fire alongside the board-cursor's own
 * Enter/Space handling. */
export function ImportantMessagesModal({ title, messages, onContinue }: { title: string; messages: string[]; onContinue: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{ background: "rgba(11,9,20,0.8)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onContinue();
      }}
    >
      <div
        className="max-w-sm w-full rounded-xl border p-5 text-center"
        style={{ borderColor: "#c084fc", background: "rgba(16,12,30,0.97)", boxShadow: "0 0 24px rgba(192,132,252,0.3)" }}
      >
        <div className="text-sm font-bold tracking-widest uppercase mb-3" style={{ color: "#f1eeff", textShadow: "0 0 8px #c084fc88" }}>
          {title}
        </div>
        <div className="flex flex-col gap-2 mb-4 max-h-[55vh] overflow-y-auto text-left">
          {messages.map((msg, i) => (
            <div key={i} className="text-xs leading-snug" style={{ color: "#d9d2f0" }}>
              {msg}
            </div>
          ))}
        </div>
        <button
          onClick={onContinue}
          className="px-5 py-2 rounded border text-xs font-bold tracking-widest uppercase"
          style={{ borderColor: "#c084fc", color: "#c084fc", boxShadow: "0 0 12px #c084fc66" }}
        >
          {t("eventModal.continue")}
          <div className="text-[11px] font-normal opacity-70">Space / Enter</div>
        </button>
      </div>
    </div>
  );
}
