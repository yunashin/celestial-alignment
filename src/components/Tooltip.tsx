import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "left" | "right";

// Deliberately omits the arrow's own centering position (`left-1/2`/`top-1/2`) — that's supplied
// per-render as an inline style instead, so it can be nudged to keep pointing at the trigger when
// the popup itself gets clamped back on-screen (see the `clamp` state below). The translate classes
// stay here since they just center the arrow ON that inline-styled point and compose fine with the
// rotate classes via Tailwind's shared transform custom properties either way.
const ARROW_STYLE: Record<Side, string> = {
  top: "top-full -translate-x-1/2 -mt-[5px]",
  bottom: "bottom-full -translate-x-1/2 -mb-[5px] rotate-180",
  left: "left-full -translate-y-1/2 -ml-[5px] -rotate-90",
  right: "right-full -translate-y-1/2 -mr-[5px] rotate-90"
};

const GAP = 8; // px between trigger and popup — matches the old mb-2/mt-2/mr-2/ml-2 (0.5rem)
const EDGE_MARGIN = 8; // px kept clear of the viewport edge when clamping an overflowing popup

// Popup position is computed from the trigger's live viewport rect (not CSS anchoring) because the
// popup is portaled straight to <body> — see the doc comment below for why.
function popupStyle(rect: DOMRect | null, side: Side, visible: boolean): CSSProperties {
  if (!rect) return { opacity: 0, left: -9999, top: -9999 };
  const scale = visible ? 1 : 0.95;
  switch (side) {
    case "top":
      return { opacity: visible ? 1 : 0, left: rect.left + rect.width / 2, top: rect.top - GAP, transform: `translate(-50%, -100%) scale(${scale})` };
    case "bottom":
      return { opacity: visible ? 1 : 0, left: rect.left + rect.width / 2, top: rect.bottom + GAP, transform: `translate(-50%, 0) scale(${scale})` };
    case "left":
      return { opacity: visible ? 1 : 0, left: rect.left - GAP, top: rect.top + rect.height / 2, transform: `translate(-100%, -50%) scale(${scale})` };
    case "right":
      return { opacity: visible ? 1 : 0, left: rect.right + GAP, top: rect.top + rect.height / 2, transform: `translate(0, -50%) scale(${scale})` };
  }
}

/**
 * Shared hover/focus tooltip — replaces the native `title=` attribute (small, slow to appear,
 * unstyled) with a themed popup matching the app's neon/cosmic look.
 *
 * The popup is rendered via a `createPortal` straight to `document.body`, positioned with
 * `position: fixed` from the trigger's live `getBoundingClientRect()`, rather than CSS-anchored
 * (`absolute` + `group-hover`) inside the trigger's own DOM subtree. Several triggers live inside
 * scrolling/clipped ancestors (ControlPanel's `overflow-y-auto` sidebar, TileView's clipped tile
 * wrapper) — a CSS-anchored popup gets silently cut off by those ancestors' overflow the moment it
 * extends past their box, no matter which `side` is chosen. Portaling escapes that entirely.
 *
 * Visibility shows on real mouse hover AND on keyboard focus, but deliberately NOT on a mouse
 * click that merely happens to focus the trigger (e.g. clicking a roster row button) — checked via
 * `:focus-visible`, which browsers already suppress for pointer-triggered focus. Without this, a
 * tooltip opened by hovering-then-clicking a button would stay stuck open (via naive focus
 * tracking) even after the mouse moves away, since the button keeps DOM focus after being clicked.
 *
 * `className` replaces the wrapper's own positioning/display entirely (default `"relative
 * inline-flex"`) rather than merging with it — callers that need the trigger itself absolutely
 * positioned (e.g. a tile status badge pinned to a corner) should pass the full class string
 * (`"absolute top-0 right-0 z-10"`) here instead of putting it on `children`, since wrapping an
 * already-absolutely-positioned child in a plain `relative` wrapper would reposition it relative
 * to the wrapper instead of the tile.
 *
 * `openWhen` lets a caller drive the popup open/closed from outside (e.g. PlayerTokens auto-opens
 * a Guardian's name tooltip on their own turn) WITHOUT permanently overriding normal hover/focus
 * behavior — the moment the user directly interacts with this specific tooltip (hovers or
 * keyboard-focuses it for real), that auto-open/close is retired for the rest of this tooltip's
 * mounted lifetime, and `visible` goes back to being owned entirely by the mouse/focus handlers
 * below, exactly as if `openWhen` had never been passed.
 */
export function Tooltip({
  text,
  title,
  children,
  className,
  style,
  side = "top",
  openWhen = false
}: {
  text?: string;
  title?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  side?: Side;
  openWhen?: boolean;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  const idRef = useRef<number>(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [userInteracted, setUserInteracted] = useState(false);
  // How far the popup's ideal (trigger-centered) position had to be nudged to stay on-screen — see
  // the clamping useLayoutEffect below. Reset to zero whenever the popup re-anchors so a stale
  // offset from a previous trigger/position never leaks into a new one.
  const [clamp, setClamp] = useState({ dx: 0, dy: 0 });

  const show = () => {
    if (!wrapperRef.current) return;
    setRect(wrapperRef.current.getBoundingClientRect());
    setClamp({ dx: 0, dy: 0 });
    setVisible(true);
  };
  const hide = () => setVisible(false);
  const interact = (fn: () => void) => () => {
    setUserInteracted(true);
    fn();
  };

  useEffect(() => {
    if (!text || userInteracted) return;
    if (!openWhen) {
      hide();
      return;
    }
    // Polls the trigger's own position every animation frame and only calls `show()` once it's
    // stayed put for two consecutive frames, instead of calling `show()` synchronously here.
    // `openWhen` can (and for PlayerTokens' auto-open on the very first active Guardian, always
    // does) go true on the SAME commit as initial mount, before layout has necessarily finished
    // settling — a trigger positioned by a ResizeObserver-driven hook (e.g. GridBoard's
    // useFitSize, which sizes the whole board and everything on it) can keep shifting for several
    // more frames after this component's own effects have already run once, since ResizeObserver
    // callbacks are their own async batch, not part of React's commit. Measuring
    // `getBoundingClientRect()` immediately reliably captured a stale pre-settle position that
    // then never got refreshed (nothing else calls `show()` again until the user manually
    // hovers/focuses this specific tooltip) — a real bug reported against Guardian 1's auto-opened
    // token tooltip landing over a hundred pixels away from the actual token. A FIXED number of
    // deferred frames was tried first and wasn't robust: instrumenting the actual trigger position
    // frame-by-frame on a real board showed it can take 6+ frames to stop moving, and that count
    // isn't guaranteed stable across boards/devices — so this polls for real settling instead of
    // guessing a delay, capped at MAX_SETTLE_FRAMES so a trigger that's continuously animating for
    // some unrelated reason can't keep the popup from ever opening.
    let cancelled = false;
    let last: { x: number; y: number } | null = null;
    let stableFrames = 0;
    let frame = 0;
    const MAX_SETTLE_FRAMES = 60;
    const tick = () => {
      if (cancelled || !wrapperRef.current) return;
      const r = wrapperRef.current.getBoundingClientRect();
      if (last && r.x === last.x && r.y === last.y) stableFrames++;
      else stableFrames = 0;
      last = { x: r.x, y: r.y };
      frame++;
      if (stableFrames >= 2 || frame >= MAX_SETTLE_FRAMES) {
        show();
        return;
      }
      idRef.current = requestAnimationFrame(tick);
    };
    idRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(idRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWhen, userInteracted, text]);

  // A trigger near a viewport edge (e.g. a player token on the board's leftmost column) would
  // otherwise render its popup partly or entirely off-screen, since popupStyle always centers/abuts
  // the popup on the trigger with no awareness of the viewport — a real bug reported against the
  // Water node's player token tooltip. This recomputes the popup's IDEAL box in JS (mirroring
  // popupStyle's own anchor math) using `rect` (the trigger's already-fresh position) plus the
  // popup's own measured width/height, then nudges it back on-screen by `dx`/`dy`.
  //
  // Deliberately does NOT read the popup's currently-*rendered* left/top via
  // `getBoundingClientRect()` to find the "ideal" position (an earlier version of this did) — under
  // React 18 StrictMode's dev-only double-invocation of effects, this layout effect can run one
  // extra time while the popup's style attribute still reflects the previous render's position
  // (e.g. the `!rect` placeholder anchored at (-9999, -9999)), producing a wildly wrong ~10000px
  // "clamp" that then stuck around for every subsequent real position — a real bug hit while
  // building this fix, not a hypothetical. Measuring only width/height sidesteps this entirely,
  // since those are intrinsic to the popup's content and don't depend on its current left/top at all.
  useLayoutEffect(() => {
    if (!visible || !rect || !popupRef.current) return;
    const { width, height } = popupRef.current.getBoundingClientRect();
    let left: number;
    let top: number;
    switch (side) {
      case "top":
        left = rect.left + rect.width / 2 - width / 2;
        top = rect.top - GAP - height;
        break;
      case "bottom":
        left = rect.left + rect.width / 2 - width / 2;
        top = rect.bottom + GAP;
        break;
      case "left":
        left = rect.left - GAP - width;
        top = rect.top + rect.height / 2 - height / 2;
        break;
      case "right":
        left = rect.right + GAP;
        top = rect.top + rect.height / 2 - height / 2;
        break;
    }
    let dx = 0;
    let dy = 0;
    if (left < EDGE_MARGIN) dx = EDGE_MARGIN - left;
    else if (left + width > window.innerWidth - EDGE_MARGIN) dx = window.innerWidth - EDGE_MARGIN - (left + width);
    if (top < EDGE_MARGIN) dy = EDGE_MARGIN - top;
    else if (top + height > window.innerHeight - EDGE_MARGIN) dy = window.innerHeight - EDGE_MARGIN - (top + height);
    if (dx !== clamp.dx || dy !== clamp.dy) setClamp({ dx, dy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rect, side]);

  // A portaled/fixed popup doesn't move with the page, so a scroll or resize while it's open
  // would leave it pointing at a spot the trigger no longer occupies — just dismiss it instead of
  // tracking position continuously, since these are momentary hover/focus popups, not persistent UI.
  useEffect(() => {
    if (!visible) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [visible]);

  // The wrapper (and any position/style the caller passed for it) always renders, even without
  // `text` — some callers rely on this span purely for layout (e.g. PlayerTokens positions each
  // stacked token via this same className/style), and silently dropping that when there's no
  // tooltip text would break their positioning, not just skip the popup.
  return (
    <span
      ref={wrapperRef}
      tabIndex={-1}
      className={className ?? "relative inline-flex"}
      style={style}
      onMouseEnter={text ? interact(show) : undefined}
      onMouseLeave={text ? hide : undefined}
      onFocus={
        text
          ? (e) => {
            if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) interact(show)();
          }
          : undefined
      }
      onBlur={text ? hide : undefined}
    >
      {children}
      {text &&
        createPortal(
          <span
            ref={popupRef}
            role="tooltip"
            className="pointer-events-none fixed z-50 w-max max-w-[220px] whitespace-normal text-left text-sm leading-snug font-medium transition-all duration-100 rounded-lg border px-2.5 py-1.5"
            style={(() => {
              const base = popupStyle(rect, side, visible);
              return {
                ...base,
                left: typeof base.left === "number" ? base.left + clamp.dx : base.left,
                top: typeof base.top === "number" ? base.top + clamp.dy : base.top,
                borderColor: "#5eb3ff66",
                background: "rgba(11,9,20,0.97)",
                color: "#f1eeff",
                boxShadow: "0 0 14px rgba(94,179,255,0.35), 0 4px 12px rgba(0,0,0,0.5)"
              };
            })()}
          >
            {title && <div style={{ fontWeight: "bolder", marginBottom: '8px' }}>{title}</div>}
            {text}
            <span
              className={`absolute w-2.5 h-2.5 rotate-45 border-l border-t ${ARROW_STYLE[side]}`}
              style={{
                borderColor: "#5eb3ff66",
                background: "#0d0a17",
                // Keeps the arrow pointing at the trigger even when the popup itself got nudged
                // on-screen by `clamp` — the popup moved by (dx, dy), so re-centering the arrow on
                // the ORIGINAL anchor means shifting it back by the same amount, in the opposite
                // direction, relative to the popup's own box. Wrapped in `clamp()` so a very large
                // nudge (a trigger right in a corner) can't push the arrow past the popup's own
                // edges — it just settles at the nearest edge instead of visually detaching.
                ...(side === "top" || side === "bottom"
                  ? { left: `clamp(10px, calc(50% - ${clamp.dx}px), calc(100% - 10px))` }
                  : { top: `clamp(10px, calc(50% - ${clamp.dy}px), calc(100% - 10px))` })
              }}
            />
          </span>,
          document.body
        )}
    </span>
  );
}
