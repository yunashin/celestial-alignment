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
  rotated,
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
  // Visually rotates the board 90° clockwise for narrow/portrait viewports (see
  // useIsPortraitViewport) — a pure presentation change, the underlying WIDTH x HEIGHT tile data
  // and node/edge assignments are untouched. Achieved by rotating the whole (unchanged) grid as a
  // rigid CSS transform rather than remapping grid-row/grid-column per tile, so every tile's own
  // connector shapes (drawn via logical top/right/bottom/left in CardGlyph) automatically rotate
  // along with their real neighbors and stay visually connected — see TileView's own `rotated` doc
  // comment for how it counter-rotates everything EXCEPT the card connectors back upright.
  rotated?: boolean;
  onTileClick: (x: number, y: number) => void;
}) {
  // Swapping which axis is the "aspect width" vs "aspect height" (and which max-size cap applies to
  // which) is what makes the fitted box itself portrait-shaped when rotated — HEIGHT (11) becomes
  // the effective width and WIDTH (19) the effective height, matching the board's actual on-screen
  // footprint once rotated 90°.
  const { ref, width, height } = useFitSize(rotated ? HEIGHT : WIDTH, rotated ? WIDTH : HEIGHT, rotated ? 720 : 1240, rotated ? 1240 : 720, 44);

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
      // A rotated board keeps measuring the SAME tiles' real (now-rotated) rendered positions — the
      // measurement itself needs no rotation-specific logic — but AIR/EARTH move from the top/bottom
      // edges (whose label position varies along the horizontal axis) to the right/left edges
      // (varies along the vertical axis) instead, and WATER/FIRE do the reverse; see the `edge`
      // props below for the full rotated mapping.
      setEdgePercents((prev) => ({
        air: centerPercent(state.nodes.AIR.x, state.nodes.AIR.y, rotated ? "vertical" : "horizontal") ?? prev.air,
        earth: centerPercent(state.nodes.EARTH.x, state.nodes.EARTH.y, rotated ? "vertical" : "horizontal") ?? prev.earth,
        water: centerPercent(state.nodes.WATER.x, state.nodes.WATER.y, rotated ? "horizontal" : "vertical") ?? prev.water,
        fire: centerPercent(state.nodes.FIRE.x, state.nodes.FIRE.y, rotated ? "horizontal" : "vertical") ?? prev.fire
      }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, state.nodes, rotated]);

  return (
    <div ref={ref} className="relative mx-auto" style={{ width, height }}>
      {/* A 90° clockwise rotation shifts every edge one position clockwise: AIR (top) → right,
          FIRE (right) → bottom, EARTH (bottom) → left, WATER (left) → top. `vertical` (which
          switches the label to sideways `writing-mode: vertical-rl` text) flips along with it —
          AIR/EARTH need it once they're on a left/right edge, WATER/FIRE stop needing it once
          they're on a top/bottom edge. */}
      <EdgeLabel element="AIR" edge={rotated ? "right" : "top"} vertical={rotated} percent={edgePercents.air} />
      <EdgeLabel element="EARTH" edge={rotated ? "left" : "bottom"} vertical={rotated} percent={edgePercents.earth} />
      <EdgeLabel element="WATER" vertical={!rotated} edge={rotated ? "top" : "left"} percent={edgePercents.water} />
      <EdgeLabel element="FIRE" vertical={!rotated} edge={rotated ? "bottom" : "right"} percent={edgePercents.fire} />

      {/* The grid itself is NEVER remapped internally — same WIDTH x HEIGHT tile order, same
          gridTemplateColumns/Rows as always. Rotation is achieved by physically rotating this
          whole (unchanged) grid 90° as a rigid CSS transform, so every tile's connector shapes
          rotate right along with their real neighbors and stay visually attached — the
          alternative (remapping which grid-row/grid-column each tile lands in) would leave card
          connectors pointing at the wrong screen edge relative to where their neighbor actually
          ended up. When rotated, the grid's own box is sized to the pre-rotation (swapped)
          dimensions and centered + rotated within the wrapper via `translate(-50%,-50%)
          rotate(90deg)`, so its rotated bounding box exactly fills the wrapper's (already
          portrait-shaped, from useFitSize above) box. */}
      <div
        className="grid gap-0.5 sm:gap-1 p-1.5 sm:p-2.5 rounded-xl border"
        style={{
          gridTemplateColumns: `repeat(${WIDTH}, 1fr)`,
          gridTemplateRows: `repeat(${HEIGHT}, 1fr)`,
          position: "absolute",
          ...(rotated
            ? { width: height, height: width, top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(90deg)" }
            : { inset: 0 }),
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
                rotated={rotated}
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
