import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getNamespaceTemplates, t, useTranslation } from "../i18n";

const DISPLAY_MS = 4500; // how long each message stays fully visible before the next one advances
const FADE_MS = 200; // brief fade so consecutive messages read as distinct beats, not a jump-cut

// A generic stand-in for a longer interpolated value (a name, a source phrase, an element label) —
// sized past the common case so the measured worst case doesn't undershoot typical content, without
// going as far as the mathematically longest possible value (e.g. 4 players who each type the
// maximum 20-character name — SetupScreen's `maxLength={20}` — joined together in the opening
// message's `{names}`). That extreme is real but rare enough, and would dominate the whole
// measurement enough to permanently inflate the box for every ordinary short message, that it's
// better left as a case where the box simply grows past `minHeight` just that once (a `<div>` with
// a `minHeight` style never clips taller content, it only stops shrinking below the floor) than
// baked into the floor itself.
const GENERIC_FILLER = "XXXXXXXXXXXX"; // 12 chars

// Board coordinates ({x}/{y} and their chain/asteroid/shield variants) are always 1-2 digits (the
// board is WIDTH×HEIGHT = 19×11 tiles) — several messages interpolate up to 4 of them at once (e.g.
// Virgo's shield cast, an asteroid's start→destination), so treating them as short numbers instead
// of the generic filler above matters a lot for not wildly over-measuring those messages.
const COORDINATE_FILLER = "18";
const COORDINATE_TOKENS = new Set(["x", "y", "sx", "sy", "ex", "ey", "x1", "y1", "x2", "y2", "dx", "dy"]);
// Small numeric readouts (a percentage, an HP/AP amount, a card count) are likewise short relative
// to a name or phrase.
const NUMBER_FILLER = "99.9";
const NUMBER_TOKENS = new Set(["pct", "count", "amount", "hp", "maxHp", "ap", "total"]);

function fillTemplate(template: string): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (COORDINATE_TOKENS.has(name)) return COORDINATE_FILLER;
    if (NUMBER_TOKENS.has(name)) return NUMBER_FILLER;
    return GENERIC_FILLER;
  });
}

// Several curated messages are built by joining two YAML keys together at the call site rather
// than living as one string (e.g. a chain-of-3+ message plus its own "Eclipse Tracker eases by X%"
// suffix, or a path completion plus its 4-player tracker-ease suffix — see reducer.ts/eclipse.ts's
// `important()` call sites). Listed explicitly here (rather than guessed by pairing "the two
// longest templates in the whole dict," which produced a wildly unrealistic worst case — pairing
// two messages, e.g. Virgo's shield cast and an asteroid summary, that are never actually shown
// together) so the measured worst case reflects combinations that can ACTUALLY appear. If you add
// a new important()-eligible concatenation, add its key pair here too.
const CONCATENATED_LOG_KEYS: [string, string][] = [
  ["log.chain", "log.chainEased"],
  ["log.pathComplete", "log.pathCompleteTrackerEase"],
  ["log.eclipseSurge", "log.eclipseSurgeScaling"]
];

/** The worst-case text StatusMessage could ever need to render, derived from the CURRENT locale's
 * actual `log`/`damageCards` templates rather than a separately hand-maintained list of message
 * text (so it can't silently drift as YAML copy changes). `log.eclipseDamageHeader` gets its own
 * candidate with the longest `damageCards.*` text substituted for its `{message}` token (rather
 * than the generic filler), since that's a real, bounded nesting the generic single-token pass
 * would otherwise underestimate. */
function worstCaseCandidates(): string[] {
  const templates = getNamespaceTemplates("log", "damageCards").map(fillTemplate);
  const concatenated = CONCATENATED_LOG_KEYS.map(([a, b]) => fillTemplate(t(a)) + fillTemplate(t(b)));
  const damageCardTemplates = getNamespaceTemplates("damageCards");
  const longestDamageCard = damageCardTemplates.reduce((longest, cur) => (cur.length > longest.length ? cur : longest), "");
  const eclipseDamageWorst = fillTemplate(t("log.eclipseDamageHeader", { message: longestDamageCard }));
  return [...templates, ...concatenated, eclipseDamageWorst];
}

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
  const { locale } = useTranslation();
  const [queue, setQueue] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [minHeight, setMinHeight] = useState(34); // sensible one-line fallback before the first measurement lands

  // Sizes the box to the tallest it could EVER need to be, instead of a fixed per-breakpoint
  // min-height — measured for real (see CLAUDE.md's useFitSize note on why "measure the actual DOM"
  // beats a guessed constant) by rendering every worst-case candidate into an offscreen twin that
  // shares the live box's exact width/padding/font classes, so it wraps exactly the same way the
  // real message would. Re-measures on container resize (viewport resize, board rotation, sidebar
  // breakpoint change) and on locale switch (different languages render at different lengths).
  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const candidates = worstCaseCandidates();
    const recompute = () => {
      const width = container.clientWidth;
      if (width <= 0) return;
      measure.style.width = `${width}px`;
      let tallest = 0;
      for (const text of candidates) {
        measure.textContent = text;
        tallest = Math.max(tallest, measure.getBoundingClientRect().height);
      }
      if (tallest > 0) setMinHeight(tallest);
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [locale]);

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
    // entirely below `md:`. Padding/font-size is also scaled down below `sm:`/`md:` — this row
    // directly competes with the board for vertical space on a short mobile viewport, so keeping it
    // as compact as legibly possible there matters more than on desktop. `minHeight` (measured, see
    // the layout effect above) replaces what used to be a fixed `min-h-[34px] sm:...` guess.
    <div
      ref={containerRef}
      className="flex-1 min-w-0 rounded-lg px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 flex items-center justify-center md:ml-[164px]"
      style={{ minHeight }}
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
      {/* Offscreen measuring twin: same padding (matches the CONTAINER's box, not just the span, so
          the measured height includes the vertical padding that contributes to the real box's
          height) and font/wrap classes as the visible content above, its width kept in sync with
          the live container so text wraps identically — never shown, never hit-testable, purely a
          DOM ruler for the layout effect. Tailwind's border-box reset means setting `width` here
          to the container's own `clientWidth` (which already includes ITS padding) lines up the
          two elements' available text-wrapping width exactly. */}
      <div
        ref={measureRef}
        aria-hidden
        className="px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 text-sm sm:text-base md:text-[20px] font-semibold leading-snug text-center"
        style={{ position: "fixed", top: 0, left: -99999, visibility: "hidden", pointerEvents: "none", whiteSpace: "normal" }}
      />
    </div>
  );
}
