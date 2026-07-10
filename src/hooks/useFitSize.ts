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
      const availW = parent.clientWidth - reservePx;
      const availH = parent.clientHeight - reservePx;
      if (availW <= 0 || availH <= 0) return;
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
