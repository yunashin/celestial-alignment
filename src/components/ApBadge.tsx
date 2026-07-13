import type { CSSProperties } from "react";

/** The small AP-cost diamond used on action buttons — mirrors ApPips' rotated-square motif, with
 * the cost (a plain number, or a range like "1-2" for cost-varying actions) centered inside.
 *
 * `isForTileView` sizes the badge as a fraction of the surrounding board tile (via `cqw`, i.e.
 * "% of the nearest ancestor with `containerType` set" — see TileView's badges wrapper, which is
 * exactly the tile's own rendered width) instead of a fixed px size or a `md:` breakpoint jump.
 * Board tile size is driven by `useFitSize`'s continuous ResizeObserver measurement, not by the
 * `md:` viewport breakpoint, so a two-step breakpoint size visibly mismatches the actual tile at
 * plenty of real window sizes in between — confirmed by direct measurement, the same board's
 * tiles rendered anywhere from ~16px to ~43px across different desktop window heights alone, with
 * no correlation to `md:` at all. `cqw`-based sizing tracks the tile continuously instead.
 * Deliberately set via inline `style`, not a Tailwind `text-[Ncqw]` class — Tailwind's JIT only
 * generates a class for an arbitrary value that appears as a literal string somewhere in the
 * source; a runtime-computed value like this would silently fail to generate a class at all. */
export function ApBadge({ cost, color = "#00ffff", isForTileView = false }: { cost: number | string; color?: string; isForTileView?: boolean }) {
  const boxStyle: CSSProperties = isForTileView ? { width: "58cqw", height: "58cqw" } : {};
  const fontSize = isForTileView ? "34cqw" : "10px";
  return (
    <span
      className={`inline-flex items-center justify-center ${isForTileView ? "" : "w-3 h-3"} rotate-45 border shrink-0 m-1`}
      style={{ ...boxStyle, borderColor: color, background: isForTileView ? "#043434" : `${color}22`, boxShadow: `0 0 6px ${color}88` }}
    >
      <span className="-rotate-45 font-bold leading-none whitespace-nowrap" style={{ color, fontSize }}>
        {cost}
      </span>
    </span>
  );
}
