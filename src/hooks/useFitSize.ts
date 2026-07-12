import { useLayoutEffect, useRef, useState } from "react";

/**
 * Measures the parent element's box and returns the largest {width, height} that fits inside it
 * while preserving the given aspect ratio, capped at maxWidth/maxHeight. CSS alone can't express
 * "fit this ratio inside whatever space is left" without container query units, and aspect-ratio
 * auto-sizing shrinks to content instead of growing to fill a flex/grid cell — so we measure
 * directly via ResizeObserver.
 */
export function useFitSize(aspectW: number, aspectH: number, maxWidth: number, maxHeight: number, reservePx = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: maxWidth, height: maxHeight });

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!parent) return;
    const measure = () => {
      // Clamped to at least 1px rather than bailing out when the parent's box has collapsed to
      // zero (or gone negative after `reservePx`) — a real scenario on a short mobile viewport,
      // where a `flex-1 min-h-0` sibling can genuinely get squeezed to 0 by other content that
      // doesn't shrink. Bailing out here used to leave `size` at its *initial* fallback
      // (`{width: maxWidth, height: maxHeight}`) — a real, previously-latent bug: that fallback is
      // sized for "plenty of room on a big screen," so on a container with no room at all it
      // rendered oversized and off-screen instead of just very small. Always computing a real
      // (if tiny) fit means the board stays correctly proportioned and on-screen no matter how
      // little space it's actually given, and the page's own scroll handles the rest.
      const availW = Math.max(parent.clientWidth - reservePx, 1);
      const availH = Math.max(parent.clientHeight - reservePx, 1);
      let width = Math.min(availW, maxWidth);
      let height = (width * aspectH) / aspectW;
      if (height > Math.min(availH, maxHeight)) {
        height = Math.min(availH, maxHeight);
        width = (height * aspectW) / aspectH;
      }
      setSize({ width, height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [aspectW, aspectH, maxWidth, maxHeight, reservePx]);

  return { ref, ...size };
}
