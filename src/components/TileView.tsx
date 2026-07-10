import type { CSSProperties } from "react";
import { BODY_FONT_SIZE, ELEMENT_META } from "../constants";
import type { GlowInfo } from "../engine/board";
import { useTranslation } from "../i18n";
import { powerUpText } from "../i18n/gameText";
import type { Connections, Player, Tile } from "../types";
import { lerpColor } from "../utils/colors";
import { pluralSuffix } from "../utils/grammar";
import { ApBadge } from "./ApBadge";
import { CardGlyph } from "./CardGlyph";
import { PlayerTokens } from "./PlayerTokens";
import { Tooltip } from "./Tooltip";

// Small fixed debris-chip offsets for the asteroid explosion burst — a handful of directions is
// enough to read as "debris" without needing per-tile randomness (which would also fight the
// one-shot-animation-on-value-change trick, since a re-render must produce the identical style
// string for the browser to NOT restart the animation — see asteroidHitStep's own doc comment).
const EXPLOSION_DEBRIS: [number, number][] = [
  [-13, -13], [13, -13], [-13, 13], [13, 13], [0, -17], [0, 17]
];

// Crumble debris drifts DOWNWARD (all positive dy) rather than radiating outward like the asteroid
// explosion's — this is meant to read as "dissolving/sinking to dust," not "bursting apart."
const CRUMBLE_DEBRIS: [number, number][] = [
  [-9, 11], [9, 11], [-5, 17], [5, 17], [0, 21]
];

export function TileView({
  tile,
  players,
  highlighted,
  previewed,
  lunarShielded,
  chainGlow,
  surging,
  cardPreview,
  apCostBadge,
  corruptionTotalTurns,
  cursorFocused,
  lit,
  glow,
  activeId,
  lastActedId,
  onClick
}: {
  tile: Tile;
  players: Player[];
  highlighted: boolean;
  previewed?: boolean;
  lunarShielded?: boolean;
  chainGlow?: boolean;
  surging?: boolean;
  cardPreview?: { connections: Connections; color: string };
  // A small AP-cost badge for a highlighted tile costing more than 1 AP — Sagittarius's remote
  // placements, or a multi-tile Move destination more than 1 step away.
  apCostBadge?: { cost: number; tooltip: string };
  // Total END_TURN dispatches (every player's turns combined) remaining before this corrupted
  // card crumbles — null if that can't be resolved (placer stuck in Stasis indefinitely).
  corruptionTotalTurns?: number | null;
  cursorFocused?: boolean;
  lit: boolean;
  glow?: GlowInfo;
  activeId: number;
  lastActedId: number | null;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const playersHere = players?.filter((p) => p.position.x === tile.x && p.position.y === tile.y);
  const activePlayerHere = playersHere.find((pl) => pl.id === activeId);
  const placedByPlayerName = players.find((pl) => pl.id === tile.placedBy)?.name ?? "";
  const glowColor = glow?.color;
  let borderColor = "#2a2340";
  let bg = "rgba(18,14,32,0.85)";
  let shadow = "inset 0 0 8px rgba(0,0,0,0.6)";
  let outline: string | undefined = undefined;
  let outlineOffset: string | undefined = undefined;

  if (tile.node) {
    const c = glowColor ?? ELEMENT_META[tile.node].color;
    borderColor = c;
    bg = ELEMENT_META[tile.node].soft;
    shadow = `0 0 ${lit ? 16 : 7}px ${c}66`;
  }
  if (tile.isCenter) {
    const c = glowColor ?? "#ffffff";
    borderColor = c;
    shadow = lit ? `0 0 20px ${c}aa` : "0 0 12px #ffffff44";
  }
  if (tile.isVoid) {
    borderColor = "#7c3aed";
    bg = "rgba(50,10,80,0.7)";
    shadow = "0 0 14px #7c3aed99";
  }
  if (tile.isShootingStar) {
    borderColor = "#ffd166";
    shadow = "0 0 14px #ffd16699";
  }
  if (tile.isShielded) {
    borderColor = "#7dd3fc";
    shadow = "0 0 14px #7dd3fc99";
  }
  if (tile.isEnclosed) {
    borderColor = "#fbbf24";
    shadow = "0 0 14px #fbbf2499";
  }
  if (lit && glowColor && tile.card) {
    borderColor = glowColor;
    shadow = `0 0 16px ${glowColor}aa`;
  }
  if (highlighted) {
    borderColor = "#00ffff";
    shadow = "0 0 12px #00ffffaa";
  }
  if (previewed) {
    borderColor = "#ffd166";
    bg = "rgba(255,209,102,0.28)";
    shadow = "0 0 16px #ffd166aa";
  }
  if (chainGlow) {
    borderColor = "#fde047";
  }
  if (cursorFocused) {
    outline = "2px dashed #ffffff";
    outlineOffset = "1px";
  }

  // Each entry's delay (where it needs one) is folded directly into its own shorthand string
  // rather than set via a separate `animationDelay` style property — mixing the `animation`
  // shorthand with the `animationDelay` longhand on the same element makes React warn on rerender
  // ("don't mix shorthand and non-shorthand properties"), and would also be semantically wrong
  // here anyway: a single `animationDelay` applies to EVERY animation in the shorthand list, not
  // just the win-sweep one it's meant for.
  const animations = [
    lit ? "caPulse 2s ease-in-out infinite" : null,
    glow ? `caWinSweep 0.9s ease-out ${glow.t * 1.1}s both` : null,
    chainGlow ? "caChainGlow 1.1s ease-in-out infinite" : null,
    cursorFocused ? "caCursorPulse 1s ease-in-out infinite" : null,
    activePlayerHere ? "caPulse 1.4s ease-in-out infinite" : null
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      onClick={onClick}
      data-tile={`${tile.x},${tile.y}`}
      className={`group/tile relative w-full h-full rounded sm:rounded-md border flex items-center justify-center select-none ${highlighted ? "cursor-pointer" : ""}`}
      style={{
        borderColor,
        borderStyle: (highlighted && !previewed) || cursorFocused ? "dashed" : "solid",
        background: bg,
        boxShadow: shadow,
        animation: animations || undefined,
        outline,
        outlineOffset
      }}
    >
      {/* Visual effects that should stay clipped to the tile's rounded box. PlayerTokens renders
          outside this wrapper so its hover tooltip can pop up past the tile's own bounds. */}
      <div className="absolute inset-0 overflow-hidden rounded sm:rounded-md flex items-center justify-center">
        {glow?.gradient && !tile.isCenter && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: glow.gradient, opacity: 0.55, mixBlendMode: "screen", animation: `caWinSweep 0.9s ease-out ${glow.t * 1.1}s both` }}
          />
        )}

        {tile.powerUpFlash && (
          <div
            className="absolute inset-0 pointer-events-none rounded-full"
            style={{ background: "radial-gradient(circle, #fff8dc 0%, #ffd166 40%, transparent 70%)", animation: "caStarShimmer 1.1s ease-out both" }}
          />
        )}

        {tile.isCenter && (
          <Tooltip className="relative w-full h-full flex items-center justify-center" title={t("tileView.orreryTitle")} text={t("tileView.orreryText")}>
            <div
              className="w-4/5 h-4/5 rounded-full border-2 border-dashed flex items-center justify-center"
              style={{
                borderColor: glowColor ?? "#ffffff",
                background: glow?.gradient,
                animation: "caSpin 14s linear infinite",
                boxShadow: `0 0 16px ${glowColor ?? "#ffffff"}55, inset 0 0 10px ${glowColor ?? "#ffffff"}33`
              }}
            >
              <span style={{ color: "#fff", textShadow: "0 0 10px #fff", animation: "caSpin 14s linear infinite reverse" }}>✦</span>
            </div>
          </Tooltip>
        )}

        {tile.node && (
          <div className="flex items-center justify-center w-full h-full">
            <span className="text-xs sm:text-lg" style={{ filter: `drop-shadow(0 0 5px ${glowColor ?? ELEMENT_META[tile.node].color})` }}>
              {ELEMENT_META[tile.node].glyph}
            </span>
          </div>
        )}

        {tile.card && (
          <div className={`absolute inset-0 p-0.5 ${playersHere.length > 0 ? "group-hover/tile:z-20" : ""}`}>
            <CardGlyph
              connections={tile.card.connections}
              // Purified cards render a touch lighter (blended toward white) as a permanent visual
              // cue that this specific card can never be seized by Corruption again — distinct from
              // the transient `lit`/glow-color states, which still take priority when active.
              color={glowColor ?? (tile.isPurified ? lerpColor(ELEMENT_META[tile.card.element].color, "#ffffff", 0.35) : ELEMENT_META[tile.card.element].color)}
              lit={lit}
              dim={tile.isCorrupted}
            />
          </div>
        )}

        {/* A ghost preview of the tapped hand card — shown on whichever highlighted tile currently
            has "focus" (the keyboard board cursor, always; the mouse-hovered tile, via this same
            group-hover trick TileView already uses elsewhere). Kept visually distinct from Virgo's
            committed, tap-again-to-confirm gold `previewed` styling: this one is a low-opacity,
            dashed-outline ghost that just follows focus/hover and confirms nothing on its own. */}
        {!tile.card && cardPreview && (
          <div
            className={`absolute inset-0 p-0.5 pointer-events-none rounded transition-opacity duration-150 ${cursorFocused ? "opacity-70" : "opacity-0 group-hover/tile:opacity-60"
              }`}
            style={{ outline: `1.5px dashed ${cardPreview.color}`, outlineOffset: "-2px" }}
          >
            <CardGlyph connections={cardPreview.connections} color={cardPreview.color} />
          </div>
        )}

        {tile.isCorrupted && (() => {
          // The number shown centered on the card is the TOTAL countdown across every Guardian's
          // turns (not just the placer's own) — a player watching the board wants to know "how
          // long until this vanishes," which depends on whose turn is coming up next, not just how
          // many of the placer's own turns remain. That placer-specific breakdown lives in the
          // tooltip instead, alongside the total. Falls back to the placer-only count (or "?") if
          // the total can't be resolved (e.g. the placer is stuck in Stasis indefinitely).
          const displayed = corruptionTotalTurns ?? tile.corruptionTurnsLeft ?? "?";
          const placedByPlayer = players.find((pl) => pl.id === tile.placedBy);
          const tooltipText =
            corruptionTotalTurns !== null && corruptionTotalTurns !== undefined
              ? t("tileView.corruptionTooltipTotal", {
                total: corruptionTotalTurns,
                totalPlural: pluralSuffix(corruptionTotalTurns),
                name: placedByPlayerName,
                left: tile.corruptionTurnsLeft ?? "?",
                leftPlural: pluralSuffix(tile.corruptionTurnsLeft ?? 0)
              })
              : tile.corruptionTurnsLeft !== null && tile.corruptionTurnsLeft !== undefined
                ? t("tileView.corruptionTooltipSingle", { name: placedByPlayerName, left: tile.corruptionTurnsLeft })
                : t("tileView.corruptionTooltipUnknown", { name: placedByPlayer?.name ?? "" });
          // Purify is path-based (only tiles a player has personally walked onto via MOVE), and
          // placing a card at a tile does NOT count as visiting it — the pawn didn't walk there. A
          // card placed at range (Sagittarius, or any sign's own spawn-adjacent placements before
          // ever moving) can easily end up corrupted somewhere its own placer has never set foot,
          // meaning THEY specifically can't be the one to purify it even on their own turn.
          const placedByPlayerHasNotVisited = placedByPlayer && !placedByPlayer.visited[`${tile.x},${tile.y}`];
          const showDanger = typeof corruptionTotalTurns === "number" ? corruptionTotalTurns <= 3 : typeof tile.corruptionTurnsLeft === "number" ? tile.corruptionTurnsLeft <= 1 : true;
          return (
            <Tooltip
              className={`relative inline-flex w-full h-full${playersHere.length > 0 ? " group-hover/tile:z-20" : ""}`}
              title={placedByPlayerHasNotVisited ? t("tileView.corruptionCantPurifyTitle", { name: placedByPlayerName }) : undefined}
              text={tooltipText}
              side="right"
            >
              <div className="absolute inset-0 rounded-lg flex items-center justify-center" style={{ background: "rgba(120,0,180,0.35)", animation: "caGlitch 0.5s steps(2) infinite" }}>
                <span className={`text-[${BODY_FONT_SIZE}] sm:text-sm font-bold`} style={{ color: showDanger ? "#ff6767" : "#c084fc", textShadow: showDanger ? "0 0 8px #9c2626" : "0 0 8px #a855f7" }}>
                  {displayed}
                </span>
              </div>
            </Tooltip>
          );
        })()}

        {tile.asteroidHitStep !== null && (
          <div
            className="absolute inset-0 pointer-events-none rounded"
            style={{
              background: "radial-gradient(circle, #fca5a5 0%, #7c2d12 55%, transparent 75%)",
              animation: `caAsteroidHit 4s ease-out ${tile.asteroidHitStep * 0.12}s both`
            }}
          />
        )}

        {/* A stronger, distinct burst on top of the sweep flash above — only for tiles whose card
            was actually destroyed, not every tile the asteroid merely passed over. Timed with the
            same per-tile stagger delay as asteroidHitStep so it lands exactly when the sweep
            "reaches" this tile. */}
        {tile.explosionStep !== null && (
          <>
            <div
              className="absolute inset-0 pointer-events-none rounded-full"
              style={{
                background: "radial-gradient(circle, #fff4d6 0%, #ff8a3d 35%, #7c2d12 65%, transparent 80%)",
                animation: `caExplosionFlash 4s ease-out ${tile.explosionStep * 0.12}s both`
              }}
            />
            <div
              className="absolute inset-0 pointer-events-none rounded-full border-2"
              style={{ borderColor: "#ffb347", animation: `caExplosionRing 4s ease-out ${tile.explosionStep * 0.12}s both` }}
            />
            {EXPLOSION_DEBRIS.map(([dx, dy], i) => (
              <div
                key={i}
                className="absolute left-1/2 top-1/2 w-1 h-1 rounded-sm pointer-events-none"
                style={{
                  background: "#ffb347",
                  ["--dx" as string]: `${dx}px`,
                  ["--dy" as string]: `${dy}px`,
                  animation: `caExplosionDebris 4s ease-out ${tile.explosionStep * 0.12 + 0.05}s both`
                } as CSSProperties}
              />
            ))}
          </>
        )}

        {/* A corrupted card that decays away (see reducer.ts's END_TURN corruption-decay sweep)
            gets its own distinct "dissolving to dust" animation — a purple-tinted fade/shrink plus
            debris drifting DOWNWARD, deliberately different from the asteroid's outward-bursting
            explosion above, so the two destruction causes read as visually different events. */}
        {tile.crumbleStep !== null && (
          <>
            <div
              className="absolute inset-0 pointer-events-none rounded-full"
              style={{
                background: "radial-gradient(circle, #c084fc99 0%, #6d28a9 40%, #1a0b2e 70%, transparent 85%)",
                animation: "caCrumbleFlash 2s ease-out both"
              }}
            />
            {CRUMBLE_DEBRIS.map(([dx, dy], i) => (
              <div
                key={i}
                className="absolute left-1/2 top-1/2 w-1 h-1 rounded-sm pointer-events-none"
                style={{
                  background: "#a855f7",
                  ["--dx" as string]: `${dx}px`,
                  ["--dy" as string]: `${dy}px`,
                  animation: `caCrumbleDust 1.8s ease-out ${i * 0.06}s both`
                } as CSSProperties}
              />
            ))}
          </>
        )}

        {surging && tile.card && (
          <>
            <div
              className="absolute inset-0 pointer-events-none rounded-full"
              style={{
                background: `radial-gradient(circle, ${ELEMENT_META[tile.card.element].color}ee 0%, ${ELEMENT_META[tile.card.element].color}55 45%, transparent 75%)`,
                animation: "caElementSurgeFlash 1s ease-out both"
              }}
            />
            <div
              className="absolute inset-0 pointer-events-none rounded-full border-2"
              style={{ borderColor: ELEMENT_META[tile.card.element].color, animation: "caElementSurgeRing 1s ease-out both" }}
            />
          </>
        )}

        {lunarShielded && (
          <div
            className="absolute inset-0 rounded sm:rounded-md pointer-events-none"
            style={{ boxShadow: "inset 0 0 8px #5eb3ffaa", border: "1px solid #5eb3ff66" }}
          />
        )}

        {tile.isEnclosed && (
          <div
            className="absolute inset-0 rounded sm:rounded-md pointer-events-none"
            style={{ boxShadow: "inset 0 0 8px #fbbf24aa", border: "1px solid #fbbf2466" }}
          />
        )}

        {tile.isPurified && !tile.isEnclosed && (
          <div
            className="absolute inset-0 rounded sm:rounded-md pointer-events-none"
            style={{ boxShadow: "inset 0 0 8px #f1eeff99", border: "1px solid #f1eeff44" }}
          />
        )}

        {activePlayerHere && (
          <div
            className="absolute inset-0 rounded sm:rounded-md pointer-events-none"
            style={{
              border: `2px solid ${ELEMENT_META[activePlayerHere.element].color}`,
              boxShadow: `0 0 10px ${ELEMENT_META[activePlayerHere.element].color}aa`
            }}
          />
        )}

        {cursorFocused && (
          <div
            className="absolute inset-0 rounded sm:rounded-md pointer-events-none"
          />
        )}
      </div>

      {/* Centered icons and corner badges below render as direct children of the tile root (NOT
          the clipped wrapper above), specifically so their Tooltip popups can escape the tile's
          own tiny, `overflow-hidden` bounding box instead of being clipped invisible inside it —
          the root div has no overflow restriction of its own. The root's `flex items-center
          justify-center` (otherwise inert, since every other direct child is absolutely
          positioned) is what centers the asteroid/void/shooting-star icons here without needing
          their own centering wrapper. */}
      {tile.isAsteroid && (
        <Tooltip title={t("tileView.asteroidTitle")} text={t("tileView.asteroidText")}>
          <span className="text-xs sm:text-lg" style={{ filter: "grayscale(0.7) drop-shadow(0 0 3px #94a3b8)" }}>
            🪨
          </span>
        </Tooltip>
      )}

      {tile.isVoid && (
        <Tooltip title={t("tileView.voidTitle")} text={t("tileView.voidText")}>
          <span className="text-xs sm:text-lg" style={{ animation: "caSpin 5s linear infinite", filter: "drop-shadow(0 0 8px #a855f7)" }}>
            🕳️
          </span>
        </Tooltip>
      )}

      {tile.isShootingStar && (
        <Tooltip title={t("tileView.shootingStarTitle")} text={tile.powerUp ? powerUpText(t, tile.powerUp) : undefined}>
          <span className="text-xs sm:text-lg" style={{ animation: "caPulse 1.3s ease-in-out infinite", filter: "drop-shadow(0 0 8px #ffd166)" }}>
            💫
          </span>
        </Tooltip>
      )}

      {tile.isShootingStar && tile.powerUp === "TRACKER_DOWN" && (
        <Tooltip className="absolute right-0 z-10" text={powerUpText(t, tile.powerUp)} style={{ top: -6 }}>
          <span className="leading-none text-[8px] sm:text-xs" style={{ color: "#ffd166", filter: "drop-shadow(0 0 4px #ffd166)" }}>
            ☽
          </span>
        </Tooltip>
      )}
      {tile.isShootingStar && tile.powerUp === "BONUS_AP" && (
        <Tooltip className="absolute right-0 z-10" text={powerUpText(t, tile.powerUp)} style={{ top: -6 }}>
          <span className="leading-none text-[8px] sm:text-xs" style={{ color: "#ffd166", filter: "drop-shadow(0 0 4px #ffd166)" }}>
            ◇
          </span>
        </Tooltip>
      )}
      {tile.isShootingStar && tile.powerUp === "BONUS_HAND" && (
        <Tooltip className="absolute right-0 z-10" text={powerUpText(t, tile.powerUp)} style={{ top: -6 }}>
          <span className="leading-none text-[8px] sm:text-xs" style={{ color: "#ffd166", filter: "drop-shadow(0 0 4px #ffd166)" }}>
            ☆
          </span>
        </Tooltip>
      )}
      {tile.isShootingStar && tile.powerUp === "HEAL_UNLOCK" && (
        <Tooltip className="absolute right-0 z-10" text={powerUpText(t, tile.powerUp)} style={{ top: -6 }}>
          <span className="leading-none text-[8px] sm:text-xs" style={{ color: "#ffd166", filter: "drop-shadow(0 0 4px #ffd166)" }}>
            ♡
          </span>
        </Tooltip>
      )}

      {apCostBadge && (
        <Tooltip className="absolute left-1/2 -translate-x-1/2 z-10" text={apCostBadge.tooltip}>
          <ApBadge color="#00ffff" cost={apCostBadge.cost} isForTileView={true} />
        </Tooltip>
      )}

      {tile.isLocked && (
        <Tooltip className="absolute right-0 z-10" title={t("tileView.lockedTitle")} text={t("tileView.lockedText")} style={{ top: -6 }}>
          <span className="leading-none text-[7px] sm:text-[10px]" style={{ color: "#3dd68c", textShadow: "0 0 5px #3dd68c" }}>
            ◈
          </span>
        </Tooltip>
      )}

      {tile.isShielded && (
        <Tooltip className="absolute left-0 z-10" title={t("tileView.shieldedTitle")} text={t("tileView.shieldedText")} style={{ top: -6 }}>
          <span className="leading-none text-[8px] sm:text-xs" style={{ filter: "drop-shadow(0 0 4px #7dd3fc)" }}>
            🛡️
          </span>
        </Tooltip>
      )}

      {lunarShielded && (
        <Tooltip
          className="absolute bottom-0 right-0 z-10"
          side="right"
          title={t("tileView.lunarShieldTitle")}
          text={t("tileView.lunarShieldText")}
        >
          <span className="leading-none text-[7px] sm:text-[10px]" style={{ filter: "drop-shadow(0 0 4px #5eb3ff)" }}>
            🌊
          </span>
        </Tooltip>
      )}

      {tile.isEnclosed && (
        <Tooltip
          className="absolute bottom-0 left-0 z-10"
          side="right"
          title={t("tileView.enclosedTitle")}
          text={t("tileView.enclosedText")}
        >
          <span className="leading-none text-[7px] sm:text-[10px]" style={{ filter: "drop-shadow(0 0 4px #fbbf24)" }}>
            🔒
          </span>
        </Tooltip>
      )}

      <PlayerTokens playersHere={playersHere} activeId={activeId} lastActedId={lastActedId} />
    </div>
  );
}
