import { useEffect, useState } from "react";

// Matches Tailwind's `md:` breakpoint (768px) — the same boundary GameScreen already uses
// throughout (`md:hidden`/`hidden md:flex`) to split the mobile single-column layout from the
// desktop sidebar layout. Kept separate from `useIsPortraitViewport` (which tracks aspect ratio,
// not width) since the two questions are independent: a narrow phone in landscape is still
// "mobile" for layout purposes even though it isn't portrait, and a resized-narrow desktop browser
// window could be portrait without being "mobile" in the Tailwind-breakpoint sense.
const MOBILE_BREAKPOINT = 768;

/**
 * True whenever the viewport is narrower than Tailwind's `md:` breakpoint — the JS-readable
 * equivalent of the `md:` prefix used throughout GameScreen's own CSS, for the rare cases (like
 * GridBoard's width-first sizing) that need the same boundary in JS rather than CSS.
 */
export function useIsMobileViewport(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT);

  useEffect(() => {
    const update = () => setMobile(window.innerWidth < MOBILE_BREAKPOINT);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return mobile;
}
