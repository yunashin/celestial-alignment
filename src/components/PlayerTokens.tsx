import { BODY_FONT_SIZE, ELEMENT_META, SIGNS } from "../constants";
import { useTranslation } from "../i18n";
import { signLabel } from "../i18n/gameText";
import type { Player } from "../types";
import { Tooltip } from "./Tooltip";

export function PlayerTokens({
  playersHere,
  activeId,
  lastActedId
}: {
  playersHere: Player[];
  activeId: number;
  lastActedId: number | null;
}) {
  const { t } = useTranslation();
  if (!playersHere.length) return null;

  const stacked = playersHere.length > 1;
  const topId = playersHere.some((pl) => pl.id === activeId)
    ? activeId
    : playersHere.some((pl) => pl.id === lastActedId)
      ? lastActedId
      : playersHere[0].id;
  // Top token sits leftmost and frontmost; the rest peek out to its right, each one progressively
  // further back so it's only visible where it isn't covered by the tokens closer to the front.
  const ordered = stacked
    ? [playersHere.find((pl) => pl.id === topId)!, ...playersHere.filter((pl) => pl.id !== topId)]
    : playersHere;
  const offset = 6;
  const width = 20 + (ordered.length - 1) * offset;
  const height = 20;

  return (
    <div className="group absolute bottom-1 left-1 z-10" style={{ width, height }}>
      {ordered.map((pl, i) => {
        const c = ELEMENT_META[pl.element].color;
        const active = pl.id === activeId;
        return (
          <Tooltip
            key={pl.id}
            text={!stacked ? t("playerTokens.tooltip", { name: pl.name, sign: signLabel(t, pl.sign) }) + (pl.isStasis ? t("playerTokens.stasisSuffix") : "") : undefined}
            className="absolute w-3 h-3 md:w-5 md:h-5"
            style={{ left: stacked ? i * offset : undefined, bottom: 0, zIndex: ordered.length - 1 - i }}
          >
            <div
              className="w-full h-full rounded-full border flex items-center justify-center leading-none"
              style={{
                borderColor: "#0b0914",
                color: "#0b0914",
                background: c,
                boxShadow: active ? `0 0 8px ${c}` : `0 0 3px ${c}66`,
                animation: active ? "caPulse 1.4s ease-in-out infinite" : undefined,
                opacity: pl.isStasis ? 0.35 : 1
              }}
            >
              <span className={`text-[${BODY_FONT_SIZE}] md:text-sm leading-none`} style={{ paddingTop: "2px" }}>{SIGNS[pl.sign].glyph}</span>
            </div>
          </Tooltip>
        );
      })}

      {stacked && (
        <div
          className="hidden group-hover:flex flex-col gap-1 absolute bottom-full left-0 mb-1.5 p-2 rounded-lg border whitespace-nowrap"
          style={{
            borderColor: "#3b2d5e",
            background: "rgba(11,9,20,0.96)",
            boxShadow: "0 0 12px rgba(0,0,0,0.6)",
            zIndex: 30
          }}
        >
          {playersHere.map((pl) => {
            const c = ELEMENT_META[pl.element].color;
            return (
              <div key={pl.id} className="flex items-center gap-1.5 text-[10px]">
                <span style={{ color: c }}>{SIGNS[pl.sign].glyph}</span>
                <span className="font-bold" style={{ color: "#f1eeff" }}>
                  {pl.name}
                </span>
                <span style={{ color: "#6d5f94" }}>({signLabel(t, pl.sign)})</span>
                {pl.isStasis && <span style={{ color: "#7dd3fc" }}>· {t("common.stasisLabel")}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
