import { useEffect, useState } from "react";

/**
 * True whenever the viewport is taller than it is wide (`innerWidth < innerHeight`) — the signal
 * GameScreen uses to rotate the board 90° for narrow/portrait screens, where the board's native
 * 19x11 (WIDTH x HEIGHT) landscape shape would otherwise have to shrink to fit the narrow width,
 * leaving tiles tiny with wasted vertical space. Tracks `resize` only (not `orientationchange` —
 * modern mobile browsers already fire `resize` on rotation) so a live window resize toggles it too,
 * which matters for testing this on desktop by just resizing the browser window.
 */
export function useIsPortraitViewport(): boolean {
  const [portrait, setPortrait] = useState(() => typeof window !== "undefined" && window.innerWidth < window.innerHeight);

  useEffect(() => {
    const update = () => setPortrait(window.innerWidth < window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return portrait;
}
