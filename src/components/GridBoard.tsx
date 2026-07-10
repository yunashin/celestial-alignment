import { useLayoutEffect, useState } from "react";
import { BODY_FONT_SIZE, ELEMENT_META, HEIGHT, WIDTH } from "../constants";
import { key } from "../engine/board";
import type { GlowInfo } from "../engine/board";
import { totalTurnsUntilCorruptionDecay } from "../engine/rules";
import { useFitSize } from "../hooks/useFitSize";
import { useTranslation } from "../i18n";
import { elementLabel } from "../i18n/gameText";
import type { Connections, Element, GameState } from "../types";
import { TileView } from "./TileView";

function EdgeLabel({
  element,
  vertical,
  edge,
  percent
}: {
  element: Element;
  vertical?: boolean;
  edge: "top" | "bottom" | "left" | "right";
  percent: number;
}) {
  const { t } = useTranslation();
  const meta = ELEMENT_META[element];
  const edgeStyle =
    edge === "top"
      ? { left: `${percent}%`, top: 0, transform: "translate(-50%, calc(-100% - 0.6rem))" }
      : edge === "bottom"
        ? { left: `${percent}%`, bottom: 0, transform: "translate(-50%, calc(100% + 0.6rem))" }
        : edge === "left"
          ? { top: `${percent}%`, left: 0, transform: "translate(calc(-100% - 0.6rem), -50%)" }
          : { top: `${percent}%`, right: 0, transform: "translate(calc(100% + 0.6rem), -50%)" };

  return (
    <div
      className={`absolute text-[${BODY_FONT_SIZE}] sm:text-xs font-bold tracking-[0.3em] uppercase whitespace-nowrap`}
      style={{ color: meta.color, textShadow: `0 0 6px ${meta.color}`, writingMode: vertical ? "vertical-rl" : undefined, ...edgeStyle }}
    >
      {elementLabel(t, element)}
    </div>
  );
}

export function GridBoard({
  state,
  highlights,
  previewTiles,
  litKeys,
  glow,
  lunarShieldTiles,
  chainGlowTiles,
  surgeTile,
  cardPreview,
  apCostTiles,
  cursorTile,
  onTileClick
}: {
  state: GameState;
  highlights: Set<string>;
  previewTiles?: Set<string>;
  litKeys: Set<string>;
  glow?: Map<string, GlowInfo>;
  lunarShieldTiles?: Set<string>;
  chainGlowTiles?: Set<string>;
  surgeTile?: { x: number; y: number } | null;
  cardPreview?: { connections: Connections; color: string };
  apCostTiles?: Map<string, { cost: number; tooltip: string }>;
  cursorTile?: { x: number; y: number } | null;
  onTileClick: (x: number, y: number) => void;
}) {
  const { ref, width, height } = useFitSize(WIDTH, HEIGHT, 1240, 720, 44);

  // Edge labels are positioned as a percentage of this outer wrapper's box, but a node tile's
  // center does NOT fall at a uniform (index / (WIDTH-1))*100 percentage of it — the inner grid
  // has its own padding, border, and inter-tile gaps (all responsive via Tailwind breakpoints),
  // which a formula derived purely from the node's index would have to reverse-engineer per
  // breakpoint (and would drift the moment any of those classes change). Measuring the actual
  // rendered tile's position directly sidesteps all of that and stays correct regardless.
  const [edgePercents, setEdgePercents] = useState({ air: 50, earth: 50, water: 50, fire: 50 });

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const measure = () => {
      const box = container.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const centerPercent = (x: number, y: number, axis: "horizontal" | "vertical") => {
        const el = container.querySelector<HTMLElement>(`[data-tile="${x},${y}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return axis === "horizontal" ? ((r.left + r.width / 2 - box.left) / box.width) * 100 : ((r.top + r.height / 2 - box.top) / box.height) * 100;
      };
      setEdgePercents((prev) => ({
        air: centerPercent(state.nodes.AIR.x, state.nodes.AIR.y, "horizontal") ?? prev.air,
        earth: centerPercent(state.nodes.EARTH.x, state.nodes.EARTH.y, "horizontal") ?? prev.earth,
        water: centerPercent(state.nodes.WATER.x, state.nodes.WATER.y, "vertical") ?? prev.water,
        fire: centerPercent(state.nodes.FIRE.x, state.nodes.FIRE.y, "vertical") ?? prev.fire
      }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, state.nodes]);

  return (
    <div ref={ref} className="relative mx-auto" style={{ width, height }}>
      <EdgeLabel element="AIR" edge="top" percent={edgePercents.air} />
      <EdgeLabel element="EARTH" edge="bottom" percent={edgePercents.earth} />
      <EdgeLabel element="WATER" vertical edge="left" percent={edgePercents.water} />
      <EdgeLabel element="FIRE" vertical edge="right" percent={edgePercents.fire} />

      <div
        className="grid gap-0.5 sm:gap-1 p-1.5 sm:p-2.5 rounded-xl border w-full h-full"
        style={{
          gridTemplateColumns: `repeat(${WIDTH}, 1fr)`,
          gridTemplateRows: `repeat(${HEIGHT}, 1fr)`,
          borderColor: "#3b2d5e",
          background: "rgba(11,9,20,0.7)",
          boxShadow: "0 0 24px rgba(124,58,237,0.15), inset 0 0 40px rgba(0,0,0,0.5)"
        }}
      >
        {state.tiles.map((row) =>
          row.map((tile) => {
            const k = key(tile.x, tile.y);
            const lit = litKeys.has(k) || (tile.node !== null && litKeys.has(`node:${tile.node}`)) || (tile.isCenter && litKeys.has("center"));
            const tileGlow = glow?.get(k) ?? (tile.node ? glow?.get(`node:${tile.node}`) : undefined) ?? (tile.isCenter ? glow?.get("center") : undefined);
            const cursorFocused = cursorTile?.x === tile.x && cursorTile?.y === tile.y;
            const corruptionTotalTurns =
              tile.isCorrupted && tile.placedBy !== null && tile.corruptionTurnsLeft !== null
                ? totalTurnsUntilCorruptionDecay(state, tile.placedBy, tile.corruptionTurnsLeft)
                : null;

            return (
              <TileView
                key={k}
                tile={tile}
                players={state.players}
                highlighted={highlights.has(k)}
                previewed={previewTiles?.has(k)}
                lunarShielded={lunarShieldTiles?.has(k)}
                chainGlow={chainGlowTiles?.has(k)}
                surging={surgeTile?.x === tile.x && surgeTile?.y === tile.y}
                cardPreview={highlights.has(k) ? cardPreview : undefined}
                apCostBadge={apCostTiles?.get(k)}
                corruptionTotalTurns={corruptionTotalTurns}
                cursorFocused={cursorFocused}
                lit={lit}
                glow={tileGlow}
                activeId={state.players[state.active].id}
                lastActedId={state.lastActedPlayerId}
                onClick={() => onTileClick(tile.x, tile.y)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
