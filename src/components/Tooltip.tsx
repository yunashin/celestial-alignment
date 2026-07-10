import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Side = "top" | "bottom" | "left" | "right";

const ARROW_STYLE: Record<Side, string> = {
  top: "top-full left-1/2 -translate-x-1/2 -mt-[5px]",
  bottom: "bottom-full left-1/2 -translate-x-1/2 -mb-[5px] rotate-180",
  left: "left-full top-1/2 -translate-y-1/2 -ml-[5px] -rotate-90",
  right: "right-full top-1/2 -translate-y-1/2 -mr-[5px] rotate-90"
};

const GAP = 8; // px between trigger and popup — matches the old mb-2/mt-2/mr-2/ml-2 (0.5rem)

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
 */
export function Tooltip({
  text,
  title,
  children,
  className,
  style,
  side = "top"
}: {
  text?: string;
  title?: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  side?: Side;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const show = () => {
    if (!wrapperRef.current) return;
    setRect(wrapperRef.current.getBoundingClientRect());
    setVisible(true);
  };
  const hide = () => setVisible(false);

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
      onMouseEnter={text ? show : undefined}
      onMouseLeave={text ? hide : undefined}
      onFocus={
        text
          ? (e) => {
            if (e.target instanceof HTMLElement && e.target.matches(":focus-visible")) show();
          }
          : undefined
      }
      onBlur={text ? hide : undefined}
    >
      {children}
      {text &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-50 w-max max-w-[220px] whitespace-normal text-left text-sm leading-snug font-medium transition-all duration-100 rounded-lg border px-2.5 py-1.5"
            style={{
              ...popupStyle(rect, side, visible),
              borderColor: "#5eb3ff66",
              background: "rgba(11,9,20,0.97)",
              color: "#f1eeff",
              boxShadow: "0 0 14px rgba(94,179,255,0.35), 0 4px 12px rgba(0,0,0,0.5)"
            }}
          >
            {title && <div style={{ fontWeight: "bolder", marginBottom: '8px' }}>{title}</div>}
            {text}
            <span
              className={`absolute w-2.5 h-2.5 rotate-45 border-l border-t ${ARROW_STYLE[side]}`}
              style={{ borderColor: "#5eb3ff66", background: "#0d0a17" }}
            />
          </span>,
          document.body
        )}
    </span>
  );
}
