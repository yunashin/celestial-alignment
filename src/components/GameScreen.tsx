import { useEffect, useMemo, useRef, useState } from "react";
import { BODY_FONT_SIZE, ELEMENT_META, ELEMENTS, HEIGHT, WIDTH } from "../constants";
import { computeNetwork, computeWinGlow, isPathComplete, isValidShieldAnchor, key, rotateN, shieldTiles } from "../engine/board";
import { computeLunarShieldTiles } from "../engine/eclipse";
import { gameReducer } from "../engine/reducer";
import { canConvertHandEarth, canPurify, canScorpioHeal, canUseVirgoShield, getAffordablePlacements, getAffordablePurifyTargets, getValidMoves, hasAnyAction, placementCost } from "../engine/rules";
import { useTranslation } from "../i18n";
import type { GameAction, GameState, PowerUp, UiMode } from "../types";
import { ActionButtons } from "./ActionButtons";
import { ApBadge } from "./ApBadge";
import { CardHand } from "./CardHand";
import { ControlPanel } from "./ControlPanel";
import { DeckTray } from "./DeckTray";
import { EclipseTracker } from "./EclipseTracker";
import { EndOverlay } from "./EndOverlay";
import { EndTurnConfirmModal } from "./EndTurnConfirmModal";
import { Flight, FlightLayer } from "./FlightLayer";
import { GridBoard } from "./GridBoard";
import { useIsMobileViewport } from "../hooks/useIsMobileViewport";
import { useIsPortraitViewport } from "../hooks/useIsPortraitViewport";
import { usePinchZoomPan } from "../hooks/usePinchZoomPan";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { SeedDisplay } from "./SeedDisplay";
import { StatusMessage } from "./StatusMessage";
import { Tooltip } from "./Tooltip";
import { WinBanner } from "./WinBanner";

interface EventBaseline {
  handLengths: Record<number, number>;
  eclipseEventSeq: number;
  asteroidEventSeq: number;
  discardEventSeq: number;
  starDeckShuffleSeq: number;
  eclipseDeckShuffleSeq: number;
  shieldBlockSeq: number;
  chainEventSeq: number;
  surgeEventSeq: number;
  selfHealSeq: number;
  messageSeq: number;
}

export function GameScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<UiMode>(null);
  const [selectedCard, setSelectedCard] = useState<number | null>(null);
  const [discardSel, setDiscardSel] = useState<Set<number>>(new Set());
  const [rotation, setRotation] = useState<number | null>(null);
  const [shieldPreview, setShieldPreview] = useState<{ x: number; y: number } | null>(null);
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false);
  const [dismissedEndOverlay, setDismissedEndOverlay] = useState(false);
  const [starFlash, setStarFlash] = useState<PowerUp | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [starShuffling, setStarShuffling] = useState(false);
  const [eclipseShuffling, setEclipseShuffling] = useState(false);
  const [shieldFlashPlayerId, setShieldFlashPlayerId] = useState<number | null>(null);
  const [selfHealFlashPlayerId, setSelfHealFlashPlayerId] = useState<number | null>(null);
  const [chainGlowTiles, setChainGlowTiles] = useState<Set<string> | null>(null);
  const [surgeTile, setSurgeTile] = useState<{ x: number; y: number } | null>(null);
  const [statusBatch, setStatusBatch] = useState<{ id: number; messages: string[] }>({ id: 0, messages: [] });
  const [boardCursor, setBoardCursor] = useState<{ x: number; y: number } | null>(null);
  // Mobile-only D-pad drawer — defaults open (the board cursor is the only way to place/move via
  // touch without tapping tiles directly), but collapsible so a player who prefers tapping the
  // board itself can slide it away to free that space for the scrollable top pane above.
  const [dpadVisible, setDpadVisible] = useState(false);
  // Mobile-only BOTTOM PANE drawer (hand panel, action buttons, ControlPanel) — defaults open since
  // it holds the actual controls needed to play, unlike the D-pad above. Collapsing it hands its
  // reclaimed height straight to the top pane's own `flex-1` (same mechanism as the D-pad's own
  // collapse), letting the board grow when a player wants to see more of it and isn't mid-action.
  const [bottomPaneVisible, setBottomPaneVisible] = useState(true);
  const active = state.players[state.active];
  // Named `boardRotated`, not `rotation`/`rotated`, to stay clearly distinct from Aquarius's own
  // per-card `rotation` state above (quarter-turns on a single hand card before placing it) — this
  // one is the whole-board 90° layout rotation for narrow/portrait viewports (see GridBoard).
  const boardRotated = useIsPortraitViewport();
  // Distinct from `boardRotated` above (which tracks aspect ratio, not width) — this is the JS
  // equivalent of the `md:` Tailwind breakpoint already used throughout this file's mobile/desktop
  // split, threaded into GridBoard so it can size the board by available WIDTH alone on mobile
  // (see useFitSize's `widthPriority` doc comment).
  const isMobile = useIsMobileViewport();
  // Pinch-to-zoom + drag-to-pan, scoped to just the board (see the hook's own doc comment for why
  // native page pinch-zoom had to be disabled site-wide, in index.html, in favor of this) — only
  // active on mobile, since desktop has no touch gestures to hijack in the first place. Resets
  // whenever `state.active` changes (a new turn) — otherwise a previous player's zoom/pan could
  // leave the new active player's own tile clipped out of view in a way the scroll-into-view
  // effect below has no way to undo on its own (that one only adjusts the top pane's native
  // scroll; it can't touch this hook's separate CSS-transform-based pan).
  const boardZoom = usePinchZoomPan(isMobile, state.active);

  // A fresh turn starts the keyboard board-cursor over: the previous player's arrow-key position
  // isn't a meaningful default for whoever's turn it is now. Also clears once the game leaves
  // "playing" (e.g. alignment completes) — the cursor outline has nothing left to select on a
  // win/loss screen and looks out of place there.
  useEffect(() => {
    setBoardCursor(null);
  }, [state.active, state.phase]);

  // Scrolls the new active player's own board tile into view whenever a turn starts, if it's
  // currently scrolled out of view (or hidden behind the sticky StatusMessage/DeckTray/Eclipse-
  // Tracker header) — the top pane's own vertical scroll (used to reach the board's bottom edge
  // when the board is taller than the available height, see the top pane's own doc comment
  // further down) doesn't otherwise track whose turn it is, so a player who scrolled down to see
  // a distant part of the board on someone else's turn could otherwise start their own turn
  // looking at a completely different part of the map.
  //
  // Deliberately NOT `tileEl.scrollIntoView(...)` — the native API only knows whether the tile is
  // within the scrollport's bounds, not that the sticky header visually covers the top slice of
  // that same scrollport (`position: sticky` stays in normal flow for scroll-visibility purposes,
  // it just overlays on top). `block: "nearest"` alone would happily leave the tile scrolled to
  // just past the container's top edge, technically "visible" but physically underneath the
  // header. This instead measures the sticky header's own live height and treats anything above
  // its bottom edge as obstructed, only nudging scroll the minimum needed to clear it (or to pull
  // a tile back up if it's below the container's own bottom edge) — a true no-op if the tile is
  // already fully unobstructed, same as the old `scrollIntoView("nearest")` was for the case that
  // didn't involve the header. Mobile only — desktop's top pane never scrolls
  // (`md:overflow-visible`) and has no sticky header, so this is an inert no-op there anyway.
  //
  // Vertical only, deliberately — never scrolls the container horizontally. The container is
  // `overflow-x-hidden`, so a horizontal `scrollBy` doesn't get undone by anything visible; it
  // just silently shifts the clipped viewport sideways with no way back (the same class of bug
  // already fixed once for the html/body white-gap issue — see styles.ts's own notes). Worse,
  // once the board is pinch-zoomed/panned (see usePinchZoomPan), `tileEl.getBoundingClientRect()`
  // reflects that CSS transform, so a zoomed-in tile can easily read as horizontally out-of-bounds
  // relative to the container even though nothing about the container's own scroll position is
  // actually wrong — "fixing" that by scrolling the container sideways would fight the zoom/pan
  // state instead of the (separate, transform-based) mechanism that actually controls it.
  useEffect(() => {
    if (!isMobile) return;
    const container = topPaneRef.current;
    const tileEl = document.querySelector<HTMLElement>(`[data-tile="${active.position.x},${active.position.y}"]`);
    if (!container || !tileEl) return;
    const containerRect = container.getBoundingClientRect();
    const tileRect = tileEl.getBoundingClientRect();
    const headerBottom = stickyHeaderRef.current?.getBoundingClientRect().bottom ?? containerRect.top;
    let dy = 0;
    if (tileRect.top < headerBottom) dy = tileRect.top - headerBottom;
    else if (tileRect.bottom > containerRect.bottom) dy = tileRect.bottom - containerRect.bottom;
    if (dy !== 0) container.scrollBy({ top: dy, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.active, isMobile]);

  const starDeckRef = useRef<HTMLDivElement>(null);
  const eclipseDeckRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const handMobileRef = useRef<HTMLDivElement>(null);
  const handDesktopRef = useRef<HTMLDivElement>(null);
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const topPaneRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const eventBaselineRef = useRef<EventBaseline | null>(null);

  useEffect(() => {
    if (!state.lastShootingStarEvent) return;
    setStarFlash(state.lastShootingStarEvent.type);
    const t = setTimeout(() => setStarFlash(null), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.lastShootingStarEvent?.seq]);

  const addFlight = (from: DOMRect | null | undefined, to: DOMRect | null | undefined, color: string, glyph: string) => {
    if (!from || !to) return;
    const id = `${Date.now()}-${Math.random()}`;
    setFlights((fs) => [
      ...fs,
      {
        id,
        from: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
        to: { x: to.left + to.width / 2, y: to.top + to.height / 2 },
        color,
        glyph
      }
    ]);
  };
  const removeFlight = (id: string) => setFlights((fs) => fs.filter((f) => f.id !== id));

  // Diffs a handful of "seq" counters the reducer bumps on draws/discards/eclipse/asteroid/shuffle
  // events (see types.ts's GameState) against the previous render's baseline, and turns each change
  // into a flying-card ghost or a brief flash. Skipped entirely on the render right after mount
  // (baseline is null) so the initial hand deal doesn't animate.
  useEffect(() => {
    const prev = eventBaselineRef.current;
    if (prev) {
      const handEl = handMobileRef.current?.offsetParent ? handMobileRef.current : handDesktopRef.current;

      const prevActiveLen = prev.handLengths[active.id] ?? active.hand.length;
      if (active.hand.length > prevActiveLen && handEl) {
        const drawn = active.hand.length - prevActiveLen;
        const toRect = handEl.getBoundingClientRect();
        for (let i = 0; i < drawn; i++) addFlight(starDeckRef.current?.getBoundingClientRect(), toRect, "#e2e8f0", "★");
      }

      if (state.discardEventSeq !== prev.discardEventSeq && handEl) {
        addFlight(handEl.getBoundingClientRect(), discardRef.current?.getBoundingClientRect(), "#6d5f94", "♻");
      }

      if (state.eclipseEventSeq !== prev.eclipseEventSeq && state.lastEclipseEvent) {
        const ev = state.lastEclipseEvent;
        let toRect: DOMRect | null = null;
        if (ev.x !== null && ev.y !== null) {
          const tileEl = document.querySelector(`[data-tile="${ev.x},${ev.y}"]`);
          if (tileEl) toRect = tileEl.getBoundingClientRect();
        }
        // No specific tile (Surge/Damage cards, or Corruption/Void's "no valid target" fallback) —
        // fly toward the Orrery's OWN tile, not the board wrapper's geometric center. The Orrery is
        // randomly placed within its center zone, so the wrapper's center (the whole 19x11 grid's
        // midpoint) rarely lines up with its actual position; this keeps the flight visually
        // landing on the real Orrery tile every time.
        if (!toRect) {
          const orreryEl = document.querySelector(`[data-tile="${state.center.x},${state.center.y}"]`);
          toRect = orreryEl?.getBoundingClientRect() ?? boardWrapRef.current?.getBoundingClientRect() ?? null;
        }
        const glyph = ev.kind === "CORRUPTION" ? "🌑" : ev.kind === "VOID" ? "🕳" : ev.kind === "DAMAGE" ? "💥" : "⚡";
        addFlight(eclipseDeckRef.current?.getBoundingClientRect(), toRect, "#c084fc", glyph);
      }

      if (state.asteroidEventSeq !== prev.asteroidEventSeq && state.lastAsteroidDestroyedTiles.length) {
        const toRect = discardRef.current?.getBoundingClientRect();
        for (const pt of state.lastAsteroidDestroyedTiles) {
          const tileEl = document.querySelector(`[data-tile="${pt.x},${pt.y}"]`);
          if (tileEl) addFlight(tileEl.getBoundingClientRect(), toRect, "#94a3b8", "🪨");
        }
      }

      if (state.starDeckShuffleSeq !== prev.starDeckShuffleSeq) {
        setStarShuffling(true);
        setTimeout(() => setStarShuffling(false), 550);
      }
      if (state.eclipseDeckShuffleSeq !== prev.eclipseDeckShuffleSeq) {
        setEclipseShuffling(true);
        setTimeout(() => setEclipseShuffling(false), 550);
      }

      if (state.shieldBlockSeq !== prev.shieldBlockSeq && state.lastShieldBlock) {
        setShieldFlashPlayerId(state.lastShieldBlock.playerId);
        setTimeout(() => setShieldFlashPlayerId(null), 1200);
      }

      if (state.chainEventSeq !== prev.chainEventSeq && state.lastChainEvent) {
        setChainGlowTiles(new Set(state.lastChainEvent.tiles));
        setTimeout(() => setChainGlowTiles(null), 3000);
      }

      if (state.surgeEventSeq !== prev.surgeEventSeq && state.lastSurgeEvent) {
        setSurgeTile({ x: state.lastSurgeEvent.x, y: state.lastSurgeEvent.y });
        setTimeout(() => setSurgeTile(null), 1000);
      }

      if (state.selfHealSeq !== prev.selfHealSeq && state.lastSelfHealEvent) {
        setSelfHealFlashPlayerId(state.lastSelfHealEvent.playerId);
        setTimeout(() => setSelfHealFlashPlayerId(null), 1200);
      }

    }

    // Unlike the flight/flash animations above (which would spuriously replay the initial hand
    // deal/board setup if not skipped on mount), the Status Message banner SHOULD surface the very
    // first batch of `important()` messages from game init (e.g. "The Orrery awakens...") — there's
    // no prior message on screen for it to jump away from, so this runs even when `prev` is null.
    const prevMessageSeq = prev ? prev.messageSeq : 0;
    if (state.messageSeq !== prevMessageSeq) {
      // messageLog is unshift-newest-first and capped at 20 — the delta tells us exactly how
      // many of its front entries are new since last render (a single dispatch can call
      // `important()` more than once), even across that cap.
      const newCount = Math.min(state.messageSeq - prevMessageSeq, state.messageLog.length);
      const fresh = state.messageLog.slice(0, newCount).reverse(); // oldest-of-the-new-batch first
      setStatusBatch((b) => ({ id: b.id + 1, messages: fresh }));
    }

    const handLengths: Record<number, number> = {};
    state.players.forEach((pl) => { handLengths[pl.id] = pl.hand.length; });
    eventBaselineRef.current = {
      handLengths,
      eclipseEventSeq: state.eclipseEventSeq,
      asteroidEventSeq: state.asteroidEventSeq,
      discardEventSeq: state.discardEventSeq,
      starDeckShuffleSeq: state.starDeckShuffleSeq,
      eclipseDeckShuffleSeq: state.eclipseDeckShuffleSeq,
      shieldBlockSeq: state.shieldBlockSeq,
      chainEventSeq: state.chainEventSeq,
      surgeEventSeq: state.surgeEventSeq,
      selfHealSeq: state.selfHealSeq,
      messageSeq: state.messageSeq
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const litKeys = useMemo(() => {
    const lit = new Set<string>();
    for (const el of ELEMENTS) {
      if (isPathComplete(state.tiles, el, state.center, state.nodes)) {
        // crossCenter: false — the default (true) traversal would tunnel through the Orrery into
        // whatever OTHER element's fragment happens to touch the center's other sides, wrongly
        // lighting up tiles that aren't actually part of THIS element's own node-to-Orrery path
        // (e.g. an unconnected, uncorrupted fragment that only touches center from another side).
        // Matches isPathComplete's own internal traversal exactly, so "lit" and "complete" always
        // agree on which tiles constitute the path.
        computeNetwork(state.tiles, el, state.center, state.nodes, false).forEach((k) => lit.add(k));
        lit.add(`node:${el}`);
        lit.add("center");
      }
    }
    return lit;
  }, [state.tiles, state.center, state.nodes]);

  const lunarShieldTiles = useMemo(() => computeLunarShieldTiles(state), [state.players]);

  const glow = useMemo(() => {
    if (state.phase !== "won") return undefined;
    return computeWinGlow(state.tiles, ELEMENTS, state.center, state.nodes);
  }, [state.tiles, state.phase, state.center, state.nodes]);

  const highlights = useMemo(() => {
    if (state.phase !== "playing") return new Set<string>();
    if (mode === "move") return new Set(getValidMoves(state).keys());
    if (mode === "place" && selectedCard !== null) return getAffordablePlacements(state, selectedCard, rotation ?? undefined);
    if (mode === "purify") return getAffordablePurifyTargets(state);
    if (mode === "virgoShield") {
      const res = new Set<string>();
      for (const row of state.tiles) for (const t of row) if (isValidShieldAnchor(state.tiles, t.x, t.y)) res.add(key(t.x, t.y));
      return res;
    }
    return new Set<string>();
  }, [state, mode, selectedCard, rotation]);

  const previewTiles = useMemo(() => {
    if (mode !== "virgoShield" || !shieldPreview) return undefined;
    return new Set(shieldTiles(shieldPreview.x, shieldPreview.y).map((pt) => key(pt.x, pt.y)));
  }, [mode, shieldPreview]);

  // AP-cost badges shown directly on the board for any highlighted tile costing more than 1 AP —
  // Sagittarius's remote (2 AP) placement tiles, and multi-tile Move destinations more than 1
  // step away. A tile is never simultaneously eligible for both (place vs. move are different
  // modes), so both share one Map keyed by tile, each entry carrying its own cost + tooltip text.
  const apCostTiles = useMemo(() => {
    const res = new Map<string, { cost: number; tooltip: string }>();
    if (mode === "place" && selectedCard !== null && active.sign === "SAGITTARIUS") {
      for (const k of highlights) {
        const [x, y] = k.split(",").map(Number);
        const cost = placementCost(active, x, y);
        if (cost > 1) res.set(k, { cost, tooltip: t("gameScreen.astralArrowTooltip", { cost }) });
      }
    } else if (mode === "move") {
      for (const [k, reach] of getValidMoves(state)) {
        if (reach.cost > 1) res.set(k, { cost: reach.cost, tooltip: t("gameScreen.moveCostTooltip", { cost: reach.cost }) });
      }
    }
    return res;
  }, [mode, selectedCard, active, highlights, state, t]);

  // Hand cards that have nowhere affordable to go right now (given current AP) — grayed out and
  // unselectable in CardHand rather than letting a player arm a card only to find zero highlighted
  // tiles. Deliberately NOT gated on `mode` here (CardHand itself only applies the grayed styling
  // while a tap would actually try to arm placement); recomputing this every render is cheap since
  // hand size is capped at MAX_HAND_SIZE.
  const unaffordableCardIndices = useMemo(() => {
    const res = new Set<number>();
    for (let i = 0; i < active.hand.length; i++) {
      if (getAffordablePlacements(state, i).size === 0) res.add(i);
    }
    return res;
  }, [state, active.hand]);

  // A ghost rendering of the tapped hand card, shown on whichever highlighted tile currently has
  // "focus" — the keyboard board cursor, or (via TileView's own group-hover) the mouse-hovered
  // tile — so a player can see roughly how/where the card will land before committing to a click.
  // Deliberately distinct from Virgo's gold previewTiles styling (a committed, tap-again-to-confirm
  // preview): this one is a lower-opacity ghost that just follows focus and confirms nothing.
  const cardPreview = useMemo(() => {
    if (mode !== "place" || selectedCard === null) return undefined;
    const card = active.hand[selectedCard];
    if (!card) return undefined;
    return {
      connections: rotation ? rotateN(card.connections, rotation) : card.connections,
      color: ELEMENT_META[card.element].color
    };
  }, [mode, selectedCard, rotation, active.hand]);

  const resetUi = () => {
    setMode(null);
    setSelectedCard(null);
    setDiscardSel(new Set());
    setRotation(null);
    setShieldPreview(null);
  };

  const onTileClick = (x: number, y: number) => {
    if (mode === "virgoShield") {
      if (!highlights.has(key(x, y))) return;
      if (shieldPreview && shieldPreview.x === x && shieldPreview.y === y) {
        dispatch({ type: "VIRGO_SHIELD", x, y });
        resetUi();
      } else {
        setShieldPreview({ x, y });
      }
      return;
    }
    if (!highlights.has(key(x, y))) return;
    if (mode === "move") {
      dispatch({ type: "MOVE", x, y });
      resetUi();
    } else if (mode === "place" && selectedCard !== null) {
      dispatch({ type: "PLACE", handIndex: selectedCard, x, y, rotation: rotation ?? undefined });
      resetUi();
    } else if (mode === "purify") {
      // Stay armed in purify mode when more corrupted tiles remain affordable, so a player
      // cleaning up several corrupted cards in a row doesn't have to re-click Purify between
      // each one. `gameReducer` is called here purely as a pure preview (its result is thrown
      // away except for the canPurify check) — the real, state-updating dispatch happens
      // separately right after, exactly as it always did.
      const next = gameReducer(state, { type: "PURIFY", x, y });
      dispatch({ type: "PURIFY", x, y });
      if (!canPurify(next)) resetUi();
    }
  };

  const onHandSelect = (i: number) => {
    if (mode === "discard") {
      setDiscardSel((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
      return;
    }
    if (mode === "scorpioHeal") {
      setSelectedCard((prev) => (prev === i ? null : i));
      return;
    }
    if (mode === "place" && selectedCard === i) {
      resetUi();
      return;
    }
    setMode("place");
    setSelectedCard(i);
    setRotation(null);
  };

  const healTargeting = mode === "scorpioHeal" && selectedCard !== null;

  const onPlayerHeal = (targetId: number) => {
    if (selectedCard === null) return;
    dispatch({ type: "SCORPIO_HEAL", handIndex: selectedCard, targetId });
    resetUi();
  };

  const setUiMode = (m: UiMode) => {
    setSelectedCard(null);
    setDiscardSel(new Set());
    setRotation(null);
    setShieldPreview(null);
    setMode(m);
  };

  const doBack = () => dispatch({ type: "RESET" });

  const doConfirmDiscard = () => {
    dispatch({ type: "DISCARD", indices: Array.from(discardSel) });
    resetUi();
  };

  const doEndTurn = () => {
    dispatch({ type: "END_TURN" });
    resetUi();
    setShowEndTurnConfirm(false);
  };

  const requestEndTurn = () => {
    if (hasAnyAction(state)) setShowEndTurnConfirm(true);
    else doEndTurn();
  };

  const doConvertHandEarth = () => dispatch({ type: "CONVERT_HAND_EARTH" });

  const showRotate = mode === "place" && selectedCard !== null && active.sign === "AQUARIUS";
  const onRotateCard = () => setRotation((r) => ((r ?? 0) + 1) % 4);

  // Steps the keyboard board-cursor one tile in a screen-relative direction — shared by the arrow
  // keys (below) and the mobile-only on-screen arrow buttons, so both drive the exact same cursor
  // state through the exact same rotation-aware remap. `dir` is always screen-relative ("up" always
  // means visually up), matching physical arrow keys; the boardRotated remap is what keeps that
  // true once the board itself is visually rotated 90° for portrait viewports.
  const moveBoardCursor = (dir: "up" | "down" | "left" | "right") => {
    if (state.phase !== "playing") return;
    // Reaching for the board means the user wants the board cursor now, not whatever action
    // button currently has focus — blur it so a subsequent Enter/Space (or, for the on-screen
    // buttons, the button's own retained focus) doesn't re-trigger that button instead of hitting
    // the board tile.
    if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    setBoardCursor((prev) => {
      const base = prev ?? { x: active.position.x, y: active.position.y };
      let { x, y } = base;
      // A rotated board (see GridBoard/boardRotated) visually swaps which data axis reads as
      // "up/down" vs "left/right" on screen — WATER (y=0) is now the top edge and EARTH
      // (x=HEIGHT-1) the left edge, not AIR (x=0)/WATER (y=0) as in the unrotated layout — so this
      // remap keeps the cursor moving the way it visually points, instead of silently stepping
      // "up" sideways once the board is rotated.
      if (boardRotated) {
        if (dir === "up") y -= 1;
        else if (dir === "down") y += 1;
        else if (dir === "left") x += 1;
        else if (dir === "right") x -= 1;
      } else {
        if (dir === "up") x -= 1;
        else if (dir === "down") x += 1;
        else if (dir === "left") y -= 1;
        else if (dir === "right") y += 1;
      }
      return { x: Math.max(0, Math.min(HEIGHT - 1, x)), y: Math.max(0, Math.min(WIDTH - 1, y)) };
    });
  };

  // Activates whatever tile the board cursor currently sits on — the mobile on-screen equivalent
  // of the Enter/Space case in the keydown handler below (`onTileClick` already no-ops on a
  // non-highlighted tile, so this is safe to call unconditionally once there IS a cursor). A no-op
  // if the D-pad hasn't been used yet this turn (no cursor to select), same as Enter/Space would be.
  const selectBoardCursor = () => {
    if (boardCursor) onTileClick(boardCursor.x, boardCursor.y);
  };

  useEffect(() => {
    if (state.phase !== "playing") return;
    const p = state.players[state.active];
    const discardCost = p.sign === "LIBRA" && !state.libraUsed ? 0 : 1;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();

      // While the confirmation modal is up, Enter/Escape drive IT (confirm/cancel) and nothing
      // else should leak through to board navigation or mode toggles underneath.
      if (showEndTurnConfirm) {
        if (k === "enter") doEndTurn();
        else if (k === "escape") setShowEndTurnConfirm(false);
        else return;
        e.preventDefault();
        return;
      }

      switch (k) {
        case "escape":
          // Escape resets the UI regardless, but if an action button (Move, Purify, a roster row,
          // etc.) currently has keyboard focus, also blur it — otherwise the very next Enter/Space
          // would just re-activate that same button instead of doing nothing / hitting the board.
          if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
          resetUi();
          setBoardCursor(null);
          break;
        case "m":
          if (state.ap >= 1) setUiMode(mode === "move" ? null : "move");
          break;
        case "p":
          if (canPurify(state)) setUiMode(mode === "purify" ? null : "purify");
          break;
        case "v":
          if (canUseVirgoShield(state)) setUiMode(mode === "virgoShield" ? null : "virgoShield");
          break;
        case "h":
          if (canScorpioHeal(state)) setUiMode(mode === "scorpioHeal" ? null : "scorpioHeal");
          break;
        case "t":
          if (canConvertHandEarth(state)) doConvertHandEarth();
          break;
        case "r":
          if (mode === "place" && selectedCard !== null && p.sign === "AQUARIUS") onRotateCard();
          break;
        case "c":
          if (mode === "discard") {
            if (discardSel.size > 0 && state.ap >= discardCost) doConfirmDiscard();
          } else if (state.ap >= discardCost) {
            setUiMode("discard");
          }
          break;
        // Arrow keys drive a keyboard-only board cursor (see cursorFocused/TileView) — first press
        // snaps it to the active player's own tile, subsequent presses step it one tile at a time.
        // The actual step logic lives in `moveBoardCursor` (shared with the mobile on-screen arrow
        // buttons, see the section right above the board's hand panel).
        case "arrowup":
          moveBoardCursor("up");
          break;
        case "arrowdown":
          moveBoardCursor("down");
          break;
        case "arrowleft":
          moveBoardCursor("left");
          break;
        case "arrowright":
          moveBoardCursor("right");
          break;
        // Enter/Space activate the cursor's tile exactly like clicking it — freeing Enter up from
        // End Turn (now "E") is what makes on-board keyboard selection possible at all. BUT if a
        // real <button> currently has keyboard focus (e.g. a roster row reached via Tab while
        // heal-targeting, or any NeonButton/hand card), defer to the browser's native Enter/Space
        // activation for THAT button instead — otherwise preventDefault() below would swallow the
        // keydown before the browser ever gets to synthesize its click, and a focused button could
        // never be activated by keyboard at all.
        case "enter":
        case " ":
          if (document.activeElement instanceof HTMLButtonElement) return;
          if (boardCursor) onTileClick(boardCursor.x, boardCursor.y);
          break;
        case "e":
          requestEndTurn();
          break;
        case "b":
          doBack();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6": {
          const i = Number(e.key) - 1;
          const placementDisabled = mode !== "discard" && mode !== "scorpioHeal" && !!unaffordableCardIndices?.has(i);
          if (i < p.hand.length && !placementDisabled) onHandSelect(i);
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, mode, discardSel, selectedCard, rotation, boardCursor, showEndTurnConfirm, shieldPreview, boardRotated]);

  return (
    // Fixed `h-dvh` + `overflow-hidden` on ALL breakpoints now (not just `md:`) — mobile used to let
    // this root grow past one viewport and rely on App.tsx's ancestor `overflow-y-auto` to scroll
    // the whole page, but the layout below is now a two-pane split instead: a top pane (header,
    // status/deck tray, D-pad, board) and a bottom pane (hand panel, Eclipse Tracker, action
    // buttons, ControlPanel) each own their own internal scroll, pinned to roughly the top-2/3 and
    // bottom-1/3 of the screen respectively, rather than the whole page scrolling as one unit. This
    // means the bottom controls stay reachable within a fixed-size strip regardless of how tall the
    // board gets (see the board wrapper's own `widthPriority` comment), while the top pane can still
    // be scrolled on its own to reach the board's bottom edge if it's taller than its 2/3 share.
    <div className="w-full h-dvh flex flex-col md:flex-row gap-3 md:gap-4 p-2 md:p-3 overflow-hidden">
      {/* Low-HP screen-edge flash — an FPS-style "you're about to die" damage indicator for the
          currently active player. `fixed inset-0` (not tied to this root's own layout) so it
          covers the whole viewport regardless of which pane/breakpoint is active, `pointer-events-
          none` so it never blocks board/UI interaction, and `z-40` — below EndOverlay's `z-50` so a
          loss screen still reads cleanly on top, though the `phase === "playing"` gate below makes
          that ordering moot in practice since the two can't actually coexist. Gated on the active
          player specifically (not "any player") since this is a first-person "your own health is
          critical" indicator, mirroring how a pass-and-play turn only ever centers on one player's
          perspective at a time — `!active.isStasis` guards against a state that shouldn't normally
          coexist with `hp === 1` anyway (stasis triggers at 0 HP), kept for correctness/safety. */}
      {state.phase === "playing" && active.hp === 1 && !active.isStasis && (
        <div
          className="fixed inset-0 z-40 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, transparent 45%, rgba(220,38,38,0.65) 100%)",
            animation: "caLowHpPulse 1.1s ease-in-out infinite"
          }}
        />
      )}
      {/* TOP PANE: header, status/deck tray, win banner, D-pad, board. `overflow-y-auto` (mobile
          only — desktop reverts to its original non-scrolling natural sizing) is what keeps the
          board's bottom edge reachable even though the bottom pane below permanently claims its own
          ~1/3 of the screen instead of letting this section grow into that space. `gap-1.5` (not
          `gap-3`) below `md:` — every bit of vertical chrome above the board is space the board
          doesn't get. */}
      <div ref={topPaneRef} className="flex-1 min-h-0 flex flex-col gap-1.5 md:gap-3 overflow-y-auto md:overflow-visible overflow-x-hidden">
        {/* A 3-column grid (not the earlier centered-flex + absolute-positioned-siblings layout)
            so the left/right clusters can never overlap the title: each sibling gets its own
            track instead of being pulled out of flow to float over it. The outer two tracks share
            remaining space equally and may wrap their contents, but can't intrude into the
            center track no matter how narrow the viewport gets. Back/Language/Seed all shrink a
            notch below `md:` for the same "every pixel of chrome competes with the board" reason. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1 shrink-0">
          {/* side="right" (not the default centered "bottom") since this button sits flush at the
              left edge of a container with overflow-hidden — a horizontally-centered popup would
              overflow off-screen to the left and get clipped invisible. */}
          <Tooltip className="relative inline-flex justify-self-start" text={t("gameScreen.backTooltip")} side="right">
            <button
              onClick={doBack}
              className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded border text-[11px] md:text-[${BODY_FONT_SIZE}px] font-bold tracking-widest uppercase`}
              style={{ borderColor: "#3b2d5e", color: "#a99cd4" }}
            >
              <span>◂ <span style={{ textDecoration: 'underline' }}>B</span>ack</span>
            </button>
          </Tooltip>
          <div className="text-center leading-tight justify-self-center">
            <div className="text-xs md:text-base font-bold tracking-[0.3em] uppercase" style={{ color: "#f1eeff", textShadow: "0 0 10px #5eb3ff88" }}>
              {t("common.appNameLine1")}
            </div>
            <div className="text-xs md:text-base font-bold tracking-[0.3em] uppercase" style={{ color: "#5eb3ff", textShadow: "0 0 10px #5eb3ff88" }}>
              {t("common.appNameLine2")}
            </div>
          </div>
          {/* side="bottom" — this badge sits flush at the right edge, so the default centered
              popup would overflow off-screen to the right and top and get clipped by the root's
              overflow-hidden, same reasoning as the Back button's side="right" above. */}
          <div className="justify-self-end flex flex-wrap items-center justify-end gap-1 md:gap-1.5">
            <LanguageSwitcher className="flex gap-1" />
            <SeedDisplay
              seed={state.seed}
              className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded border text-[11px] md:text-[${BODY_FONT_SIZE}] font-bold tracking-widest`}
              style={{ borderColor: "#3b2d5e" }}
              side="bottom"
            />
          </div>
        </div>

        {/* StatusMessage + DeckTray + Eclipse Tracker share ONE header block — a single live
            instance of each (not a duplicated mobile/desktop pair like CardHand/ActionButtons
            below), since none of them need fundamentally different JSX per breakpoint, just
            different chrome/grouping around them. On mobile this whole block becomes a `sticky
            top-0` card (border/background/padding all gated `md:`-off below) so it pins to the top
            of the TOP PANE's own scroll container once the page scrolls past it, rather than
            scrolling away with the board underneath — a solid-ish background is needed there
            since, once stuck, the board scrolls beneath it and would otherwise show through. On
            desktop, the TOP PANE never scrolls internally (`md:overflow-visible`), so
            `sticky`/`z-20` are inert there regardless — the `md:static md:z-auto md:border-0
            md:bg-transparent md:backdrop-blur-none md:rounded-none md:p-0` resets are just
            belt-and-suspenders so the desktop row renders with zero card chrome. */}
        <div
          ref={stickyHeaderRef}
          className="flex flex-col gap-1.5 shrink-0 sticky top-0 z-20 md:static md:z-auto rounded-lg md:rounded-none border border-[#2a2340] md:border-0 px-1.5 py-1.5 md:p-0 bg-black/35 md:bg-transparent backdrop-blur-sm md:backdrop-blur-none"
        >
          {/* `flex-col md:flex-row` outer + `md:contents` on the DeckTray/Tracker wrapper is what
              lets StatusMessage claim the FULL card width on its own row on mobile (far less text
              wrapping, so its worst-case measured height — see StatusMessage's own doc comment —
              stays much smaller than when it had to squeeze beside DeckTray) while desktop stays
              pixel-identical to the original single-row [StatusMessage, DeckTray] layout: at `md:`
              the wrapper vanishes from the box model (`contents`) and promotes its children back
              up to be direct flex items of THIS row, and since the Eclipse Tracker div inside it is
              itself `md:hidden`, only DeckTray survives into that row at desktop — exactly the two
              original children, in the original order. */}
          <div className="flex flex-col md:flex-row items-stretch gap-1.5 md:gap-2">
            <StatusMessage batchId={statusBatch.id} messages={statusBatch.messages} />
            <div className="flex items-center gap-1.5 md:contents">
              <DeckTray
                starCount={state.starDeck.length}
                eclipseCount={state.eclipseDeck.length}
                discardCount={state.starDiscard.length}
                starShuffling={starShuffling}
                eclipseShuffling={eclipseShuffling}
                starRef={starDeckRef}
                eclipseRef={eclipseDeckRef}
                discardRef={discardRef}
              />
              <div
                className="flex-1 min-w-0 md:hidden"
                style={{ animation: starFlash === "TRACKER_DOWN" ? "caStarFlash 3s ease-out" : undefined }}
              >
                <EclipseTracker value={state.tracker} />
              </div>
            </div>
          </div>
        </div>

        {state.phase === "won" && <WinBanner onReset={doBack} />}

        {/* Below `md:` (mobile), no min-height/flex-grow drives this box at all — `widthPriority`
            (passed to GridBoard, see useFitSize's own doc comment) sizes the board to the full
            available WIDTH instead, deriving height from the aspect ratio, so the board — and each
            tile in it — is as large as the viewport's width allows rather than being squeezed
            narrower by a height budget. The page already scrolls on mobile (see the root div's own
            comment above), so the extra height that comes with a full-width board is exactly the
            trade this makes: width (and therefore tile size) wins, height follows and the rest of
            the page moves down to make room. `md:min-h-[420px] md:flex-1` restores the ORIGINAL
            height-first fit on desktop, where the layout is a fixed-viewport row (`md:h-dvh
            md:overflow-hidden`) and a stable height genuinely matters there. */}
        {/* `my-7` (mobile only) reserves clearance for the edge labels (AIR/EARTH/WATER/FIRE, or
            their rotated equivalents), which are positioned via absolute overflow OUTSIDE this
            wrapper's own box (see GridBoard's EdgeLabel, `calc(100% + 0.6rem)`) — without it, a
            board sized to the full available width (see `widthPriority` above) sits close enough
            to its neighboring sections that a top/bottom edge label's overflow bleeds through their
            semi-transparent backgrounds. Not needed on desktop, where the wrapper already had
            plenty of surrounding slack from its `md:min-h-[420px]` floor. */}
        <div ref={boardWrapRef} className="md:flex-1 md:min-h-[420px] my-7 md:my-0 flex items-center justify-center">
          {/* Pinch-zoom container/content split (see usePinchZoomPan's own doc comment) — only
              the board itself sits inside `contentRef`, deliberately NOT the sticky
              StatusMessage/DeckTray/Eclipse-Tracker header above (a transformed ancestor breaks
              `position: sticky` on descendants) and NOT the bottom pane below (a separate sibling
              entirely, outside this wrapper's DOM subtree, so it's structurally impossible for the
              zoom transform to reach it). `containerRef` clips zoomed content to this box and is
              where the touch listeners live; `contentRef` is what actually gets scaled/panned. */}
          {/* `w-full h-full` on BOTH of these is load-bearing, not decorative — GridBoard's own
              `useFitSize` measures `ref.current.parentElement.clientWidth/clientHeight` (see that
              hook's doc comment), which after this wrapping is `contentRef`'s div. A plain
              unstyled `<div>` shrink-wraps to its own content's size by default (exactly the "looks
              right, silently sizes to fit-content instead of available space" gotcha CLAUDE.md's
              own known-CSS-gotcha section documents for this same board) — without an explicit
              `w-full h-full` chain all the way from `boardWrapRef` (which DOES have a genuinely
              definite size from its own ancestors) down through `containerRef` to `contentRef`,
              GridBoard would measure a collapsed 0×0 (or min-content) box instead of the real
              available space, rendering the whole board tiny. */}
          <div ref={boardZoom.containerRef} className="relative w-full h-full" style={boardZoom.containerStyle}>
            {/* `flex items-center justify-center` here (not on `containerRef`) is what actually
                centers GridBoard's own (smaller, explicitly pixel-sized) box within this now-
                full-size wrapper — `containerRef`'s own centering would otherwise be inert, since
                `contentRef` fills 100% of it either way. */}
            <div ref={boardZoom.contentRef} className="w-full h-full flex items-center justify-center pb-4" style={boardZoom.contentStyle}>
              <GridBoard
                state={state}
                highlights={highlights}
                previewTiles={previewTiles}
                litKeys={litKeys}
                glow={glow}
                lunarShieldTiles={lunarShieldTiles}
                chainGlowTiles={chainGlowTiles ?? undefined}
                surgeTile={surgeTile}
                cardPreview={cardPreview}
                apCostTiles={apCostTiles}
                cursorTile={boardCursor}
                rotated={boardRotated}
                widthPriority={isMobile}
                onTileClick={onTileClick}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop hand column — unchanged from before, still its own sidebar between the board
          column and ControlPanel. Placed here (before the bottom pane in DOM order) so that once
          the bottom pane "dissolves" via `md:contents` below, this still visually precedes
          ControlPanel exactly like it always has. */}
      <div
        ref={handDesktopRef}
        className="hidden md:flex md:flex-col md:w-24 shrink-0 rounded-xl border p-2 gap-2"
        style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.85)", animation: starFlash === "BONUS_HAND" ? "caStarFlash 3s ease-out" : undefined }}
      >
        <span className={`text-[12px] font-bold tracking-widest uppercase text-center leading-snug`} style={{ color: "#6d5f94" }}>
          {mode !== 'discard' && mode !== 'scorpioHeal' && <ApBadge cost="1" color="#6d5f94" />}
          {mode === "discard" ? t("gameScreen.tapToDiscard") : mode === "scorpioHeal" ? t("gameScreen.pickACard") : t("gameScreen.tapToChannel")}
        </span>
        <CardHand player={active} mode={mode} selectedIndex={selectedCard} discardSel={discardSel} rotation={rotation} unaffordableIndices={unaffordableCardIndices} boardRotated={boardRotated} onSelect={onHandSelect} />
      </div>

      {/* Mobile-only handle that collapses/reveals the BOTTOM PANE below — a small circular chevron
          centered directly ON the divider line rather than its own full handle row (unlike the
          D-pad's own handle further down, which has no divider to piggyback on). The divider needs
          to exist here regardless, so anchoring the toggle to it costs zero extra vertical space.
          The button's own hit area (`p-2`) is bigger than the visible 24px circle for an easier
          tap target without visually bulking up the indicator. The chevron points DOWN while the
          pane is visible (tap sends it away/down) and flips to UP once collapsed (tap brings it
          back up) — same convention as the D-pad's own handle chevron below. */}
      <div className="relative md:hidden shrink-0" style={{ marginTop: '-12px' }}>
        <hr style={{ borderColor: "#3b2d5e" }} />
        <button
          onClick={() => setBottomPaneVisible((v) => !v)}
          aria-label={bottomPaneVisible ? t("gameScreen.bottomPaneHide") : t("gameScreen.bottomPaneShow")}
          aria-expanded={bottomPaneVisible}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-2 flex items-center justify-center"
        >
          <span
            className="w-8 h-8 rounded-full border flex items-center justify-center"
            style={{ borderColor: "#3b2d5e", background: "#140f24", color: "#a99cd4" }}
          >
            <span
              className="inline-block text-[20px] leading-none"
              style={{ transition: "transform 300ms ease-in-out", transform: bottomPaneVisible ? "rotate(0deg)" : "rotate(180deg)" }}
            >
              ▾
            </span>
          </span>
        </button>
      </div>

      {/* BOTTOM PANE: everything below the board — hand panel, Eclipse Tracker, action buttons,
          ControlPanel (tabs/status card/roster) — pinned to roughly the bottom 1/3 of the screen on
          mobile and scrollable internally there as ONE continuous region, instead of the page
          scrolling as a whole. `md:contents` makes this wrapper itself disappear from the box model
          at `md:` — its children (all individually `md:hidden` except the ControlPanel wrapper) then
          fall back into the root's row layout exactly where ControlPanel already sat before this
          change, restoring the original 3-column desktop layout untouched. The `height`/`transition`
          inline style (mobile only — gated on `isMobile` so it never fights the `md:h-auto`/
          `md:contents` classes at desktop) is what makes the pane genuinely slide shut instead of
          just popping — collapsing it to `0` hands the reclaimed space straight to the top pane's
          own `flex-1`, exactly like the D-pad's own collapse further down. */}
      <div
        className="shrink-0 flex flex-col gap-1.5 md:gap-3 overflow-y-auto md:contents md:h-auto"
        style={isMobile ? { height: bottomPaneVisible ? "34dvh" : 0, transition: "height 300ms ease-in-out" } : undefined}
      >
        {/* Mobile-only copy of the action buttons (Move/Purify/.../End Turn) — see ActionButtons'
            own doc comment for why this is a second live copy rather than the desktop one
            repositioned via CSS alone (ControlPanel's own copy is `hidden md:block`, the mirror
            image of this `md:hidden`). This whole block only ever renders below `md:`, so its own
            classes need no responsive prefix of their own — there's no "desktop" state for them to
            distinguish from. */}
        <div className="rounded-xl border p-2 shrink-0 md:hidden" style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.85)" }}>
          <ActionButtons
            state={state}
            mode={mode}
            onMode={setUiMode}
            discardCount={discardSel.size}
            onConfirmDiscard={doConfirmDiscard}
            onEndTurn={requestEndTurn}
            onConvertHandEarth={doConvertHandEarth}
            showRotate={showRotate}
            onRotate={onRotateCard}
            shieldPreviewActive={mode === "virgoShield" && shieldPreview !== null}
            healTargeting={healTargeting}
          />
        </div>

        {/* Mobile-only card hand */}
        <div
          ref={handMobileRef}
          className="rounded-xl border p-2 shrink-0 md:hidden"
          style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.85)", animation: starFlash === "BONUS_HAND" ? "caStarFlash 3s ease-out" : undefined }}
        >
          <div className={`text-[10px] font-bold tracking-widest uppercase text-center mb-1`} style={{ color: "#6d5f94" }}>
            {mode === "discard" ? t("gameScreen.handHeaderDiscard", { name: active.name }) : t("gameScreen.handHeaderChannel", { name: active.name })}
          </div>
          <CardHand player={active} mode={mode} selectedIndex={selectedCard} discardSel={discardSel} rotation={rotation} unaffordableIndices={unaffordableCardIndices} boardRotated={boardRotated} onSelect={onHandSelect} />
        </div>

        <div className="w-full md:w-72 shrink-0 md:overflow-y-auto">
          <ControlPanel
            state={state}
            mode={mode}
            discardCount={discardSel.size}
            onMode={setUiMode}
            onConfirmDiscard={doConfirmDiscard}
            onEndTurn={requestEndTurn}
            onConvertHandEarth={doConvertHandEarth}
            healTargeting={healTargeting}
            onPlayerHeal={onPlayerHeal}
            showRotate={showRotate}
            onRotate={onRotateCard}
            shieldPreviewActive={mode === "virgoShield" && shieldPreview !== null}
            starFlash={starFlash}
            shieldFlashPlayerId={shieldFlashPlayerId}
            selfHealFlashPlayerId={selfHealFlashPlayerId}
          />
        </div>
      </div>

      {/* Mobile-only D-pad drawer. A always-visible handle bar sits on top (tap to toggle); the
          D-pad card itself slides open/closed beneath it via a `max-height` transition — collapsing
          it reclaims that space for the scrollable top pane above (`flex-1`), letting the board
          grow into it for a player who doesn't need on-screen navigation right now. The D-pad's own
          content/styling is otherwise unchanged: same outer card look as the hand panel, each
          button sized/shaped like a Star Card in hand (see CardHand's own button className). The 4
          arrows drive the same `moveBoardCursor` the arrow keys use, remapped for `boardRotated` the
          same way, so a tap always moves the cursor the direction it visually points regardless of
          board orientation. The 5th button (right of ▶, visually set apart in cyan) is the touch
          equivalent of Enter/Space — activates whatever tile the cursor is currently on, exactly
          like the keyboard does. */}
      <div className="shrink-0 md:hidden">
        <button
          onClick={() => setDpadVisible((v) => !v)}
          aria-label={dpadVisible ? t("gameScreen.dpadHide") : t("gameScreen.dpadShow")}
          aria-expanded={dpadVisible}
          className="w-full flex items-center justify-center gap-1.5 py-1 rounded-t-lg border border-b-0 text-[11px] font-bold tracking-widest uppercase"
          style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.85)", color: "#a99cd4" }}
        >
          <span
            className="inline-block"
            style={{ transition: "transform 300ms ease-in-out", transform: dpadVisible ? "rotate(0deg)" : "rotate(180deg)" }}
          >
            ▾
          </span>
          {dpadVisible ? t("gameScreen.dpadHide") : t("gameScreen.dpadShow")}
        </button>
        {/* `overflow-hidden` + `max-height` (not `height`, which can't be transitioned to/from
            `auto`) is what makes this genuinely slide open/closed instead of just popping — the
            fixed max value (96px) just needs to comfortably exceed the D-pad's real content height
            (5 buttons at h-[2.5rem]/40px plus padding), never to match it exactly. */}
        <div className="overflow-hidden transition-[max-height] duration-300 ease-in-out" style={{ maxHeight: dpadVisible ? 96 : 0 }}>
          <div className="rounded-b-xl border border-t-0 p-2" style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.85)" }}>
            <div className="flex gap-2 justify-center">
              {(
                [
                  { dir: "left", glyph: "◀" },
                  { dir: "up", glyph: "▲" },
                  { dir: "down", glyph: "▼" },
                  { dir: "right", glyph: "▶" }
                ] as const
              ).map(({ dir, glyph }) => (
                <button
                  key={dir}
                  onClick={() => moveBoardCursor(dir)}
                  aria-label={t(`gameScreen.boardCursor${dir[0].toUpperCase()}${dir.slice(1)}`)}
                  className="relative w-14 h-[2.5rem] shrink-0 rounded-lg border-2 p-1.5 flex items-center justify-center text-2xl"
                  style={{
                    borderColor: "#3b2d5e",
                    background: "linear-gradient(160deg, rgba(30,22,52,0.95), rgba(11,9,20,0.95))",
                    boxShadow: "0 0 6px #3b2d5e55",
                    color: "#a99cd4"
                  }}
                >
                  {glyph}
                </button>
              ))}
              <button
                onClick={selectBoardCursor}
                disabled={!boardCursor}
                aria-label={t("gameScreen.boardCursorSelect")}
                className="relative w-14 h-[2.5rem] shrink-0 rounded-lg border-2 p-1.5 flex items-center justify-center text-2xl"
                style={{
                  borderColor: boardCursor ? "#5eb3ff" : "#3b2d5e",
                  background: "linear-gradient(160deg, rgba(30,22,52,0.95), rgba(11,9,20,0.95))",
                  boxShadow: boardCursor ? "0 0 10px #5eb3ff88" : "none",
                  color: boardCursor ? "#5eb3ff" : "#3b2d5e",
                  opacity: boardCursor ? 1 : 0.5,
                  cursor: boardCursor ? "pointer" : "not-allowed"
                }}
              >
                ✓
              </button>
            </div>
          </div>
        </div>
      </div>

      {state.phase === "lost" && !dismissedEndOverlay && (
        <EndOverlay reason={state.lossReason} onReset={doBack} onClose={() => setDismissedEndOverlay(true)} />
      )}
      {showEndTurnConfirm && <EndTurnConfirmModal onConfirm={doEndTurn} onCancel={() => setShowEndTurnConfirm(false)} />}
      <FlightLayer flights={flights} onDone={removeFlight} />
    </div>
  );
}
