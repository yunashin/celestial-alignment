import { useEffect, useState } from "react";

const DISPLAY_MS = 4500; // how long each message stays fully visible before the next one advances
const FADE_MS = 200; // brief fade so consecutive messages read as distinct beats, not a jump-cut

/** A single, larger "what just happened" banner — replaces a scrollable multi-line log with one
 * legible message at a time. Sits to the left of DeckTray, above the board, matching that row's
 * height so the two read as one header row.
 *
 * `batchId`/`messages` come from GameScreen's seq-diffing effect: `batchId` changes only when
 * `GameState.messageSeq` has advanced since the last render, and `messages` is that batch's new
 * entries in chronological order (a single dispatch can call `important()` more than once — e.g. a
 * placement that both crosses the chain-of-4 threshold and triggers an Element Surge — so more
 * than one message can arrive at once). Driving the enqueue effect off `batchId` rather than the
 * `messages` array's own referential identity avoids the classic "new empty array literal every
 * render" trap that would otherwise re-fire the effect on every unrelated re-render.
 *
 * New messages are queued and shown one at a time (each held for DISPLAY_MS) rather than
 * overwriting whatever's currently on screen — simultaneous events still each get their own
 * legible turn instead of only the last one surviving. */
export function StatusMessage({ batchId, messages }: { batchId: number; messages: string[] }) {
  const [queue, setQueue] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (batchId === 0 || messages.length === 0) return;
    setQueue((q) => [...q, ...messages]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setCurrent(next);
  }, [queue, current]);

  // Deliberately a SEPARATE effect from the one above, even though both react to `current`
  // becoming non-null — that one also SETS `current`, so if this fade-in timer lived inside it,
  // its own dependency array (which includes `current`) would see `current` change on the very
  // next render and immediately run this effect's cleanup, canceling the just-started timer
  // before its 20ms ever elapsed. Depending on `current` alone here means this only re-fires when
  // `current` genuinely changes (a new message arrives, or it's cleared), not as a side effect of
  // this same render's other state updates.
  useEffect(() => {
    if (current === null) return;
    // Let the "current" swap land in the DOM at opacity 0 first, then fade in — otherwise back-to-
    // back messages would just pop straight from one to the next with no visible transition.
    setVisible(false);
    const showTimer = setTimeout(() => setVisible(true), 20);
    const hideTimer = setTimeout(() => setVisible(false), DISPLAY_MS);
    const clearTimer = setTimeout(() => setCurrent(null), DISPLAY_MS + FADE_MS);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(clearTimer);
    };
  }, [current]);

  return (
    // `md:ml-[164px]` (not applied below `md:`) is what visually centers this against the board on
    // desktop, where it sits in a wide row next to DeckTray — on a narrow mobile screen that same
    // fixed offset would just shove the text into (or past) DeckTray's own column, so it's dropped
    // entirely below `md:`. Sizing (padding/min-height/font-size) is also scaled down below `sm:`/
    // `md:` — this row directly competes with the board for vertical space on a short mobile
    // viewport, so keeping it as compact as legibly possible there matters more than on desktop.
    <div
      className="flex-1 min-w-0 rounded-lg px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 flex items-center justify-center min-h-[34px] sm:min-h-[44px] md:min-h-[56px] md:ml-[164px]"
    >
      <span
        className="text-sm sm:text-base md:text-[20px] font-semibold leading-snug transition-opacity text-center"
        style={{
          animation: "caPulse 1s ease-in-out infinite",
          color: "#f1eeff",
          opacity: current && visible ? 1 : 0,
          transitionDuration: `${FADE_MS}ms`,
          textShadow: `0 0 8px #b77a00`
        }}
      >
        {current}
      </span>
    </div>
  );
}
