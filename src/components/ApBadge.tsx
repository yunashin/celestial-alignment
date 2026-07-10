/** The small AP-cost diamond used on action buttons — mirrors ApPips' rotated-square motif, with
 * the cost (a plain number, or a range like "1-2" for cost-varying actions) centered inside. */
export function ApBadge({ cost, color = "#00ffff", isForTileView = false }: { cost: number | string; color?: string; isForTileView?: boolean }) {
  const sizeClassNames = !isForTileView ? 'w-3 h-3' : 'w-7 h-7';
  const fontSize = !isForTileView ? '10px' : '14px';
  return (
    <span
      className={`inline-flex items-center justify-center ${sizeClassNames} rotate-45 border shrink-0 m-1`}
      style={{ borderColor: color, background: isForTileView ? "#043434" : `${color}22`, boxShadow: `0 0 6px ${color}88` }}
    >
      <span className={`-rotate-45 text-[${fontSize}] font-bold leading-none whitespace-nowrap`} style={{ color }}>
        {cost}
      </span>
    </span>
  );
}
