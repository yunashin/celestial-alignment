import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

const MIN_SCALE = 1;
const MAX_SCALE = 3;
// Below this cumulative movement (px), a single-finger touch on already-zoomed content is still
// treated as a potential tap rather than a pan drag — without this, every touch on a zoomed board
// would immediately start "panning" by a few sub-pixel jitters and never let a tap-to-select-tile
// click fire.
const DRAG_THRESHOLD = 8;
// A second tap within this window and this close together counts as a double-tap, which resets
// zoom back to 1 — the common "pinch zoom" escape hatch also seen in photo/map apps.
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST = 24;

interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

const REST: ZoomState = { scale: 1, x: 0, y: 0 };

function dist(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
function mid(a: Touch, b: Touch): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

/**
 * Pinch-to-zoom + drag-to-pan scoped to a single container, entirely independent of the browser's
 * own page zoom (disabled site-wide via index.html's viewport meta `user-scalable=no` — there's no
 * CSS-only way to exempt one region from native pinch-zoom, so this reimplements it manually just
 * for whatever `containerRef`/`contentRef` the caller attaches, e.g. GameScreen's board wrapper,
 * leaving the rest of the page — notably the bottom pane's hand/action/ControlPanel controls —
 * completely unaffected since they sit outside this hook's DOM subtree entirely).
 *
 * `containerRef` is both the clipping viewport (its `overflow` toggles to `hidden` once zoomed,
 * `visible` at rest so it never clips anything — see the edge-label overflow note in CLAUDE.md,
 * which this must not break) and the element native touch listeners are attached to imperatively
 * (see below for why). `contentRef` is the actual content that gets the CSS transform — usually
 * larger than the container once zoomed in.
 *
 * Listeners are attached via `addEventListener(..., { passive: false })` in a `useEffect`, NOT via
 * JSX `onTouchMove` props — React registers touch listeners as passive by default, which silently
 * makes `preventDefault()` a no-op inside them, so a pinch or pan gesture would otherwise fight the
 * page's own native touch handling (scrolling, in particular) instead of fully overriding it.
 *
 * Deliberately leaves `transform` entirely UNSET on `contentRef` while at rest
 * (`scale===1 && x===0 && y===0`), rather than set to an identity `scale(1)` — any non-`none`
 * `transform` on an ancestor becomes that ancestor's containing block for `position: sticky`/
 * `fixed` descendants, breaking their pinning even at scale 1. This only matters if a caller nests
 * sticky content inside the zoomed region; GameScreen deliberately does NOT (only the board itself,
 * not the sticky StatusMessage/DeckTray/Eclipse-Tracker header, sits inside `contentRef`) but the
 * hook stays correct regardless.
 *
 * Re-clamps (not resets) the current zoom/pan whenever the container resizes (board rotation,
 * window resize, the D-pad/bottom-pane drawers collapsing and freeing space) so a player who's
 * zoomed in doesn't get silently snapped back to 1x just because the available space changed —
 * only an explicit double-tap, `enabled` turning false (e.g. leaving mobile width), or `resetKey`
 * changing identity resets it outright.
 *
 * `resetKey` (optional) is compared by `===` across renders — pass something like `state.active`
 * so a new turn always resets any zoom/pan the PREVIOUS player left behind, ensuring the new
 * active player's own tile is at least reachable by GameScreen's own scroll-into-view effect
 * (which only adjusts the top pane's native scroll, and has no way to undo a leftover CSS
 * transform pan on its own).
 */
export function usePinchZoomPan(
  enabled: boolean,
  resetKey?: unknown
): {
  containerRef: RefObject<HTMLDivElement>;
  contentRef: RefObject<HTMLDivElement>;
  containerStyle: CSSProperties;
  contentStyle: CSSProperties | undefined;
  isZoomed: boolean;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomState>(REST);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const gestureRef = useRef<{
    mode: "none" | "pinch" | "pan";
    startDist: number;
    startZoom: ZoomState;
    startTouch: { x: number; y: number };
    dragged: boolean;
  }>({ mode: "none", startDist: 0, startZoom: REST, startTouch: { x: 0, y: 0 }, dragged: false });

  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  const clamp = useCallback((next: ZoomState): ZoomState => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return next;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale));
    if (scale <= MIN_SCALE) return REST;
    const containerRect = container.getBoundingClientRect();
    // `content`'s own rect already reflects whatever transform is CURRENTLY committed to the DOM
    // (from the last render) — dividing that out by the last-committed scale recovers the natural,
    // unscaled size regardless of how far into an in-flight gesture this clamp() call happens.
    const prevScale = zoomRef.current.scale || 1;
    const contentRect = content.getBoundingClientRect();
    const naturalW = contentRect.width / prevScale;
    const naturalH = contentRect.height / prevScale;
    const renderedW = naturalW * scale;
    const renderedH = naturalH * scale;
    const clampAxis = (value: number, rendered: number, containerSize: number) => {
      // Content smaller than the container in this axis: center it rather than letting it be
      // dragged to one edge, matching how the board already sits centered at rest.
      if (rendered <= containerSize) return (containerSize - rendered) / 2;
      return Math.min(0, Math.max(containerSize - rendered, value));
    };
    return {
      scale,
      x: clampAxis(next.x, renderedW, containerRect.width),
      y: clampAxis(next.y, renderedH, containerRect.height)
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;

    const onTouchStart = (e: TouchEvent) => {
      const touches = e.touches;
      if (touches.length === 2) {
        gestureRef.current = {
          mode: "pinch",
          startDist: dist(touches[0], touches[1]),
          startZoom: zoomRef.current,
          startTouch: mid(touches[0], touches[1]),
          dragged: true
        };
      } else if (touches.length === 1) {
        const t = touches[0];
        // A quick double-tap resets zoom — checked on touchstart (not touchend) so it's decided
        // before this same touch could also be mistaken for the start of a new pan gesture.
        const last = lastTapRef.current;
        const now = Date.now();
        if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(t.clientX - last.x, t.clientY - last.y) < DOUBLE_TAP_DIST) {
          lastTapRef.current = null;
          setZoom(REST);
          gestureRef.current = { mode: "none", startDist: 0, startZoom: REST, startTouch: { x: 0, y: 0 }, dragged: false };
          return;
        }
        lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
        gestureRef.current = {
          mode: zoomRef.current.scale > 1 ? "pan" : "none",
          startDist: 0,
          startZoom: zoomRef.current,
          startTouch: { x: t.clientX, y: t.clientY },
          dragged: false
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gestureRef.current;
      if (g.mode === "pinch" && e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const m = mid(e.touches[0], e.touches[1]);
        const newScale = (g.startZoom.scale * d) / g.startDist;
        // Keep the content point that was under the pinch's starting midpoint anchored under the
        // CURRENT midpoint, so zooming feels like it's happening at your fingers, and simultaneous
        // pinch+drag (fingers drifting while pinching) reads as one continuous motion.
        const contentX = (g.startTouch.x - g.startZoom.x) / g.startZoom.scale;
        const contentY = (g.startTouch.y - g.startZoom.y) / g.startZoom.scale;
        setZoom(clamp({ scale: newScale, x: m.x - contentX * newScale, y: m.y - contentY * newScale }));
      } else if (g.mode === "pan" && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - g.startTouch.x;
        const dy = t.clientY - g.startTouch.y;
        if (!g.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        g.dragged = true;
        e.preventDefault();
        setZoom(clamp({ scale: g.startZoom.scale, x: g.startZoom.x + dx, y: g.startZoom.y + dy }));
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        gestureRef.current = { mode: "none", startDist: 0, startZoom: REST, startTouch: { x: 0, y: 0 }, dragged: false };
      } else if (e.touches.length === 1) {
        // Pinch ending down to one remaining finger hands off into a pan instead of dropping the
        // gesture, so a slow pinch-then-drag reads as one continuous motion rather than two.
        const t = e.touches[0];
        gestureRef.current = {
          mode: zoomRef.current.scale > 1 ? "pan" : "none",
          startDist: 0,
          startZoom: zoomRef.current,
          startTouch: { x: t.clientX, y: t.clientY },
          dragged: true
        };
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, clamp]);

  // Re-clamp (not reset) whenever the container's own size changes — a board rotation, window
  // resize, or the D-pad/bottom-pane drawers collapsing/expanding all change how much space is
  // available, and a stale pixel offset computed for the old size could otherwise leave the view
  // stuck showing the wrong region (or an out-of-bounds gap) until the next touch gesture.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setZoom((z) => clamp(z)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [clamp]);

  // Resets outright (not just re-clamps) when this hook is disabled — e.g. the viewport crossing
  // back above the mobile breakpoint — so a leftover zoomed state can't silently persist unseen
  // and then reappear if the viewport narrows back to mobile again later.
  useEffect(() => {
    if (!enabled) setZoom(REST);
  }, [enabled]);

  // Resets whenever `resetKey` changes identity (e.g. a new turn) — skipped on the very first
  // render (the `undefined` -> initial-value transition isn't a "change" worth resetting for,
  // and would otherwise fire a pointless setState on mount every time).
  const resetKeyRef = useRef(resetKey);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current && resetKeyRef.current !== resetKey) setZoom(REST);
    resetKeyRef.current = resetKey;
    mountedRef.current = true;
  }, [resetKey]);

  const atRest = zoom.scale === 1 && zoom.x === 0 && zoom.y === 0;

  return {
    containerRef,
    contentRef,
    containerStyle: {
      overflow: atRest ? "visible" : "hidden",
      touchAction: enabled ? (zoom.scale > 1 ? "none" : "pan-y") : undefined
    },
    contentStyle: atRest
      ? undefined
      : { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`, transformOrigin: "0 0", willChange: "transform" },
    isZoomed: !atRest
  };
}
