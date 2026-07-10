import { forwardRef } from "react";
import { Tooltip } from "./Tooltip";
import { BODY_FONT_SIZE } from "../constants";
import { useTranslation } from "../i18n";

const PileIcon = forwardRef<HTMLDivElement, { glyph: string; count: number; color: string; shuffling?: boolean; tooltip: string }>(
  ({ glyph, count, color, shuffling, tooltip }, ref) => (
    <Tooltip text={tooltip} side="bottom">
      <div
        ref={ref}
        className="flex flex-col items-center gap-1.5 px-2 py-1 rounded-lg border"
        style={{
          borderColor: `${color}66`,
          background: `linear-gradient(180deg, ${color}2e, rgba(16,12,30,0.85) 70%)`,
          boxShadow: `0 0 8px ${color}33`,
          animation: shuffling ? "caDeckShuffle 0.5s ease-in-out" : undefined,
          width: '40px',
        }}
      >
        <span className="text-sm sm:text-base leading-none" style={{ color, filter: `drop-shadow(0 0 4px ${color})` }}>
          {glyph}
        </span>
        <span className={`text-[${BODY_FONT_SIZE}] font-bold tabular-nums leading-none`} style={{ color }}>
          {count}
        </span>
      </div>
    </Tooltip>
  )
);
PileIcon.displayName = "PileIcon";

export function DeckTray({
  starCount,
  eclipseCount,
  discardCount,
  starShuffling,
  eclipseShuffling,
  starRef,
  eclipseRef,
  discardRef
}: {
  starCount: number;
  eclipseCount: number;
  discardCount: number;
  starShuffling: boolean;
  eclipseShuffling: boolean;
  starRef: React.RefObject<HTMLDivElement>;
  eclipseRef: React.RefObject<HTMLDivElement>;
  discardRef: React.RefObject<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-1.5 sm:gap-2 shrink-0">
      <PileIcon ref={starRef} glyph="★" count={starCount} color="#e2e8f0" shuffling={starShuffling} tooltip={t("deckTray.starDeckTooltip", { count: starCount })} />
      <PileIcon ref={eclipseRef} glyph="☽" count={eclipseCount} color="#c084fc" shuffling={eclipseShuffling} tooltip={t("deckTray.eclipseDeckTooltip", { count: eclipseCount })} />
      <PileIcon ref={discardRef} glyph="♻" count={discardCount} color="#6d5f94" tooltip={t("deckTray.discardTooltip", { count: discardCount })} />
    </div>
  );
}
