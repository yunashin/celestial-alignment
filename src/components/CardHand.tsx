import { BODY_FONT_SIZE, DEFAULT_HAND_SIZE, ELEMENT_META, MAX_HAND_SIZE } from "../constants";
import { rotateN } from "../engine/board";
import { useTranslation } from "../i18n";
import type { Player, UiMode } from "../types";
import { CardGlyph } from "./CardGlyph";
import { Tooltip } from "./Tooltip";

export function CardHand({
  player,
  mode,
  selectedIndex,
  discardSel,
  rotation,
  unaffordableIndices,
  boardRotated,
  onSelect
}: {
  player: Player;
  mode: UiMode;
  selectedIndex: number | null;
  discardSel: Set<number>;
  rotation?: number | null;
  // Hand indices with no affordable placement anywhere on the board right now, given current AP —
  // only relevant while tapping a card would ARM it for placement (mode null/"move"/"purify"/
  // "virgoShield"/"place" itself), not while it means something else entirely ("discard" marks it
  // for Cosmic Draw, "scorpioHeal" picks it to spend on a heal).
  unaffordableIndices?: Set<number>;
  // Whether GridBoard is currently rendering its whole-grid 90° visual rotation (see
  // useIsPortraitViewport/GridBoard's own doc comments). A placed card's connector glyph inherits
  // that rotation automatically (it's a rigid transform on the whole grid), but a card sitting in
  // the hand tray is NOT a descendant of the rotated grid — without this, the hand shows a card's
  // connectors in their un-rotated orientation while the SAME card, once placed, visually appears
  // rotated 90° on screen. A player reading the hand card as e.g. "horizontal" would then find it
  // only actually connects vertically once placed — confusing, and exactly backwards from what the
  // hand is supposed to preview. Rotating just the glyph (not the whole card button) here keeps the
  // element badge/number legible while making the connector shape shown in hand match how it will
  // really look once placed on a rotated board.
  boardRotated?: boolean;
  onSelect: (i: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2 sm:gap-3 justify-center flex-wrap md:flex-col md:flex-nowrap md:justify-start md:items-center md:overflow-y-auto md:h-full">
      {player.hand.map((card, i) => {
        const c = ELEMENT_META[card.element].color;
        // Armed styling applies both when placing (mode "place") AND when a card has been picked
        // to discard-and-heal (mode "scorpioHeal") — onHandSelect sets selectedIndex in both modes,
        // but only checking "place" here left the Scorpio flow's selection invisible even though
        // the underlying state (and the "tap a Guardian to heal" prompt) was already correct.
        const armed = (mode === "place" || mode === "scorpioHeal") && selectedIndex === i;
        const marked = mode === "discard" && discardSel.has(i);
        // Graying out only makes sense while tapping this card would try to ARM it for placement —
        // in "discard"/"scorpioHeal" modes, tapping it means something else entirely (mark for
        // Cosmic Draw / spend on a heal) that isn't gated on placement affordability at all.
        const placementDisabled = mode !== "discard" && mode !== "scorpioHeal" && !!unaffordableIndices?.has(i);
        // While Aquarius previews a manual rotation, show the ACTUAL orientation that will be
        // placed, not the card's original printed connectors — this is the whole point of a
        // "preview," not just an indirect hint via which board tiles happen to light up.
        const connections = armed && rotation ? rotateN(card.connections, rotation) : card.connections;
        const button = (
          <button
            key={card.id}
            onClick={() => onSelect(i)}
            disabled={placementDisabled}
            className={`relative w-14 h-[4.5rem] md:w-16 md:h-20 shrink-0 rounded-lg border-2 p-1.5 transition-transform ${placementDisabled
              ? ""
              : armed || marked
                ? "-translate-y-2 md:translate-y-0 md:-translate-x-2"
                : "hover:-translate-y-1 md:hover:translate-y-0 md:hover:-translate-x-1"
              }`}
            style={{
              borderColor: placementDisabled ? "#3b2d5e" : marked ? "#a855f7" : c,
              background: "linear-gradient(160deg, rgba(30,22,52,0.95), rgba(11,9,20,0.95))",
              boxShadow: placementDisabled ? "none" : armed ? `0 0 16px ${c}` : marked ? "0 0 14px #a855f7" : `0 0 6px ${c}55`,
              opacity: placementDisabled ? 0.4 : 1,
              cursor: placementDisabled ? "not-allowed" : "pointer"
            }}
          >
            <div className="w-full h-full" style={{ transform: boardRotated ? "rotate(90deg)" : undefined }}>
              <CardGlyph connections={connections} color={placementDisabled ? "#6d5f94" : c} lit={armed} />
            </div>
            <span className={`absolute top-0.5 left-1 text-[${BODY_FONT_SIZE}px]`} style={{ filter: placementDisabled ? undefined : `drop-shadow(0 0 3px ${c})` }}>
              {ELEMENT_META[card.element].glyph}
            </span>
            {i < MAX_HAND_SIZE && (
              <span
                className={`absolute bottom-0.5 right-1 text-[${BODY_FONT_SIZE}] font-bold leading-none`}
                style={{ color: "#6d5f94" }}
              >
                {i + 1}
              </span>
            )}
            {marked && (
              <span className="absolute top-0 right-1 text-xs font-bold" style={{ color: "#c084fc", textShadow: "0 0 6px #a855f7" }}>
                ✕
              </span>
            )}
          </button>
        );
        return placementDisabled ? (
          <Tooltip key={card.id} text={t("cardHand.placementDisabledTooltip")}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
      {player.hand.length === 0 && (
        <div className="text-xs tracking-widest uppercase py-6" style={{ color: "#6d5f94" }}>
          {t("cardHand.handEmpty")}
        </div>
      )}
    </div>
  );
}
