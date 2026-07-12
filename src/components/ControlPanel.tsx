import { useEffect, useRef, useState } from "react";
import { BODY_FONT_SIZE, ELEMENT_META, SHOOTING_STAR_SELF_HEAL_AMOUNT, SIGNS } from "../constants";
import { canConvertHandEarth, canPurify, canScorpioHeal, canSelfHeal, canUseVirgoShield, hasAnyAction, purifyDisabledReason } from "../engine/rules";
import { useTranslation } from "../i18n";
import { elementLabel, signAbility, signDesc, signLabel, surgeText, type TFunc } from "../i18n/gameText";
import type { GameState, Player, PowerUp, UiMode } from "../types";
import { article } from "../utils/grammar";
import { ApPips } from "./ApPips";
import { EclipseTracker } from "./EclipseTracker";
import { NeonButton } from "./NeonButton";
import { Tooltip } from "./Tooltip";

type Tab = "status" | "log";

function AbilityBlock({ player, t }: { player: Player; t: TFunc }) {
  const elc = ELEMENT_META[player.element].color;
  const label = elementLabel(t, player.element);
  return (
    <>
      <div className={`mt-2 text-[${BODY_FONT_SIZE}] leading-snug`} style={{ color: "#a99cd4" }}>
        <Tooltip text={t("controlPanel.abilityTooltip")}>
          <span className="font-bold" style={{ color: elc }}>
            {signAbility(t, player.sign)}:
          </span>
        </Tooltip>
        {" "}{signDesc(t, player.sign)}
      </div>
      <div className={`mt-1.5 text-[${BODY_FONT_SIZE}] leading-snug`} style={{ color: "#a99cd4" }}>
        <Tooltip text={t("controlPanel.surgeTooltip", { label })}>
          <span className="font-bold" style={{ color: elc }}>
            {t("controlPanel.elementSurgeLabel", { label })}
          </span>
        </Tooltip>
        {" "}{t("controlPanel.surgeSentence", { article: article(label), surgeText: surgeText(t, player.element) })}
      </div>
    </>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 px-3 py-1.5 rounded-lg border text-xs font-bold tracking-widest uppercase transition-colors"
      style={
        active
          ? { borderColor: "#00ffff", color: "#00ffff", background: "rgba(0,255,255,0.08)", boxShadow: "0 0 10px rgba(0,255,255,0.25)" }
          : { borderColor: "#2a2340", color: "#6d5f94", background: "transparent" }
      }
    >
      {label}
    </button>
  );
}

export function ControlPanel({
  state,
  mode,
  discardCount,
  onMode,
  onConfirmDiscard,
  onEndTurn,
  onConvertHandEarth,
  healTargeting,
  onPlayerHeal,
  showRotate,
  onRotate,
  shieldPreviewActive,
  starFlash,
  shieldFlashPlayerId,
  selfHealFlashPlayerId
}: {
  state: GameState;
  mode: UiMode;
  discardCount: number;
  onMode: (m: UiMode) => void;
  onConfirmDiscard: () => void;
  onEndTurn: () => void;
  onConvertHandEarth: () => void;
  healTargeting: boolean;
  onPlayerHeal: (targetId: number) => void;
  showRotate: boolean;
  onRotate: () => void;
  shieldPreviewActive: boolean;
  starFlash: PowerUp | null;
  shieldFlashPlayerId?: number | null;
  selfHealFlashPlayerId?: number | null;
}) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("status");
  const p = state.players[state.active];
  const meta = SIGNS[p.sign];
  const elc = ELEMENT_META[p.element].color;
  const discardCost = p.sign === "LIBRA" && !state.libraUsed ? 0 : 1;
  const purifyAvailable = canPurify(state);
  const virgoShieldAvailable = canUseVirgoShield(state);
  const scorpioHealAvailable = canScorpioHeal(state);
  const convertHandAvailable = canConvertHandEarth(state);
  const selfHealAvailable = canSelfHeal(state);
  const anyoneInStasis = state.players.some((q) => q.isStasis);
  const nothingLeftToDo = state.phase === "playing" && !hasAnyAction(state);
  const isScorpioHealTargeting = mode === "scorpioHeal" && healTargeting;
  const scorpioHealTargetingStyle = isScorpioHealTargeting
    ? {
      "--glow-c": "#00ffff",
      animation: "caUrgentGlow 1.3s ease-in-out infinite",
      borderColor: "#00ffff"
    }
    : {};
  const usedTaurus = p.sign === "TAURUS" && !state.taurusPurifyUsed;
  const rosterRef = useRef<HTMLDivElement>(null);
  // Fires once on the rising edge of "heal mode armed with a card selected" (not on every render
  // where it stays true, and not again if the user manually navigates away and back) — jumps to
  // the Guardian tab if the roster isn't currently visible (it only renders under "status"), then
  // focuses the first eligible heal target so a keyboard player doesn't have to Tab all the way
  // down to the roster themselves.
  const prevHealTargetingRef = useRef(false);
  useEffect(() => {
    const justStarted = isScorpioHealTargeting && !prevHealTargetingRef.current;
    prevHealTargetingRef.current = isScorpioHealTargeting;
    if (!justStarted) return;
    setTab("status");
    const id = requestAnimationFrame(() => {
      rosterRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [isScorpioHealTargeting]);

  return (
    <div
      className="rounded-xl border p-3 sm:p-4 flex flex-col gap-3 w-full h-full md:overflow-y-auto md:max-h-dvh"
      style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.85)", boxShadow: "0 0 24px rgba(0,255,255,0.08)" }}
    >
      <div className="flex gap-1.5 shrink-0">
        <TabButton label={t("controlPanel.tabGuardian")} active={tab === "status"} onClick={() => setTab("status")} />
        <TabButton label={t("controlPanel.tabLog", { turn: state.turn })} active={tab === "log"} onClick={() => setTab("log")} />
      </div>

      {tab === "status" && (
        <div className="flex flex-col gap-5 sm:gap-6 flex-1 min-h-0">
          <div className="rounded-lg" style={{ animation: starFlash === "TRACKER_DOWN" ? "caStarFlash 3s ease-out" : undefined }}>
            <EclipseTracker value={state.tracker} />
          </div>

          <div className="rounded-lg border p-3" style={{ borderColor: `${elc}66`, background: ELEMENT_META[p.element].soft }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-2xl" style={{ color: elc, textShadow: `0 0 8px ${elc}` }}>
                    {meta.glyph}
                  </span>
                  <div className="min-w-0">
                    <div className="text-lg font-bold truncate" style={{ color: "#f1eeff" }}>
                      {p.name}
                    </div>
                    <div className="text-[12px] tracking-widest uppercase" style={{ color: elc }}>
                      {signLabel(t, p.sign)} · {t("controlPanel.elementGuardianLabel", { label: elementLabel(t, p.element) })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <Tooltip title={t("controlPanel.hpTooltipTitle")} text={t("controlPanel.hpTooltipText")} side="left">
                  <div
                    className="text-base tracking-wider"
                    style={{
                      color: "#ff5f9e",
                      textShadow: "0 0 6px #ff5f9e",
                      animation: p.id === selfHealFlashPlayerId ? "caHeartRestore 1.2s ease-out" : p.hp === 1 ? "caPulse 1.3s ease-in-out infinite" : undefined
                    }}
                  >
                    {"♥".repeat(p.hp)}
                    <span style={{ opacity: 0.25 }}>{"♥".repeat(p.maxHp - p.hp)}</span>
                  </div>
                </Tooltip>
                <div className="rounded" style={{ animation: starFlash === "BONUS_AP" ? "caStarFlash 3s ease-out" : undefined }}>
                  <Tooltip title={t("controlPanel.apTooltipTitle")} text={t("controlPanel.apTooltipText")} side="left">
                    <ApPips ap={state.ap} max={3 + state.apBonus} />
                  </Tooltip>
                </div>
              </div>
            </div>
            <AbilityBlock player={p} t={t} />
            {anyoneInStasis && (
              <div className={`mt-2 text-[${BODY_FONT_SIZE}] leading-snug`} style={{ color: "#7dd3fc" }}>
                {t("controlPanel.stasisNote")}
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap gap-2" style={{ justifyContent: "center" }}>
              <NeonButton label={<span><span style={{ textDecoration: "underline" }}>M</span>ove</span>} apCost={1} active={mode === "move"} disabled={state.ap < 1} onClick={() => onMode(mode === "move" ? null : "move")} />
              <NeonButton
                label={<span><span style={{ textDecoration: "underline" }}>P</span>urify</span>}
                apCost={usedTaurus ? undefined : 1}
                color="#3dd68c"
                active={mode === "purify"}
                disabled={!purifyAvailable}
                tooltip={purifyAvailable ? undefined : purifyDisabledReason(state) ?? undefined}
                onClick={() => onMode(mode === "purify" ? null : "purify")}
              />
              {p.sign === "VIRGO" && (
                <NeonButton
                  label={<span>Protecti<span style={{ textDecoration: "underline" }}>v</span>e Precision</span>}
                  apCost={1}
                  color="#7dd3fc"
                  active={mode === "virgoShield"}
                  disabled={!virgoShieldAvailable}
                  onClick={() => onMode(mode === "virgoShield" ? null : "virgoShield")}
                />
              )}
              {p.sign === "SCORPIO" && (
                <NeonButton
                  label={<span>Discard to <span style={{ textDecoration: "underline" }}>H</span>eal</span>}
                  color="#ff5f9e"
                  active={mode === "scorpioHeal"}
                  disabled={!scorpioHealAvailable}
                  onClick={() => onMode(mode === "scorpioHeal" ? null : "scorpioHeal")}
                />
              )}
              {p.sign === "CAPRICORN" && (
                <NeonButton label={<span><span style={{ textDecoration: "underline" }}>T</span>erraform Hand</span>} apCost={1} color="#3dd68c" disabled={!convertHandAvailable} onClick={onConvertHandEarth} />
              )}
              {showRotate && <NeonButton label={<span><span style={{ textDecoration: "underline" }}>R</span>otate ↻</span>} color="#e2e8f0" onClick={onRotate} />}
              <NeonButton
                label={mode === "discard" ? <span><span style={{ textDecoration: "underline" }}>C</span>onfirm x{discardCount}</span> : <span><span style={{ textDecoration: "underline" }}>C</span>osmic Draw</span>}
                apCost={discardCost}
                tooltip={t("controlPanel.cosmicDrawTooltip")}
                color="#c084fc"
                disabled={state.ap < discardCost || (mode === "discard" && discardCount === 0)}
                active={mode === "discard"}
                onClick={() => (mode === "discard" ? onConfirmDiscard() : onMode("discard"))}
              />
              <NeonButton
                label={
                  selfHealAvailable ? (
                    <span>
                      H<span style={{ textDecoration: "underline" }}>e</span>al {SHOOTING_STAR_SELF_HEAL_AMOUNT} HP
                    </span>
                  ) : (
                    <span>
                      <span style={{ textDecoration: "underline" }}>E</span>nd Turn
                    </span>
                  )
                }
                color="#ff00ff"
                urgent={nothingLeftToDo}
                onClick={onEndTurn}
              />
            </div>
            <div className={`text-[${BODY_FONT_SIZE}] leading-snug mt-2.5`} style={{ color: "#6d5f94", fontWeight: "bolder" }}>
              {mode === "move" && t("controlPanel.modeMove")}
              {mode === "place" && t("controlPanel.modePlace") + (showRotate ? t("controlPanel.modePlaceRebelWave") : "")}
              {mode === "discard" && t("controlPanel.modeDiscard")}
              {mode === "purify" && t("controlPanel.modePurify") + (p.sign === "TAURUS" && !state.taurusPurifyUsed ? t("controlPanel.modePurifyFree") : "") + "."}
              {mode === "virgoShield" && (shieldPreviewActive ? t("controlPanel.modeVirgoConfirm") : t("controlPanel.modeVirgoSelect"))}
              {mode === "scorpioHeal" && (healTargeting ? t("controlPanel.modeScorpioTarget") : t("controlPanel.modeScorpioSelect"))}
              {mode === null && t("controlPanel.modeDefault")}
            </div>
          </div>

          <div ref={rosterRef} className={`flex flex-col gap-1.5 ${isScorpioHealTargeting ? "rounded border" : ""}`} style={scorpioHealTargetingStyle}>
            {state.players.map((q) => {
              const c = ELEMENT_META[q.element].color;
              const isActive = q.id === state.players[state.active].id;
              const expanded = expandedId === q.id;
              const clickable = healTargeting ? !q.isStasis && q.hp < q.maxHp : !isActive;
              const hasOneHpLeft = q.hp === 1;
              return (
                <div
                  key={q.id}
                  className="rounded border"
                  style={{
                    borderColor: isActive ? c : hasOneHpLeft ? "rgb(167, 62, 62)" : "#2a2340",
                    background: hasOneHpLeft ? "rgb(62, 25, 25)" : isActive ? ELEMENT_META[q.element].soft : "transparent",
                    animation: q.id === shieldFlashPlayerId ? "caShieldBlock 1.2s ease-out" : undefined
                  }}
                >
                  <Tooltip
                    className="relative flex w-full"
                    text={
                      healTargeting
                        ? clickable
                          ? t("controlPanel.healGuardianTooltip")
                          : undefined
                        : q.isStasis
                          ? t("controlPanel.stasisRosterTooltip")
                          : undefined
                    }
                  >
                    <button
                      type="button"
                      disabled={!clickable}
                      className="flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-left"
                      style={{ opacity: q.isStasis ? 0.45 : 1, cursor: clickable ? "pointer" : "default" }}
                      onClick={() => {
                        if (healTargeting) {
                          if (clickable) onPlayerHeal(q.id);
                        } else if (!isActive) {
                          setExpandedId(expanded ? null : q.id);
                        }
                      }}
                    >
                      <span style={{ color: "#d9d2f0" }}>
                        <Tooltip text={signLabel(t, q.sign)}>
                          <span style={{ color: c }}>{SIGNS[q.sign].glyph}</span>
                        </Tooltip>{" "}
                        {q.name}
                        {hasOneHpLeft && <span style={{ color: "rgb(167, 62, 62)" }}> · {t("controlPanel.hpLow")}</span>}
                        {q.isStasis && <span style={{ color: "#7dd3fc" }}> · {t("common.stasisLabel")}</span>}
                      </span>
                      <span style={{ color: "#ff5f9e", animation: q.id === selfHealFlashPlayerId ? "caHeartRestore 1.2s ease-out" : undefined }}>
                        {"♥".repeat(q.hp)}
                        <span style={{ opacity: 0.25 }}>{"♥".repeat(q.maxHp - q.hp)}</span>
                      </span>
                    </button>
                  </Tooltip>
                  {expanded && (
                    <div className="px-2.5 pb-2.5">
                      <AbilityBlock player={q} t={t} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "log" && (
        <div className={`rounded-lg border p-2.5 flex-1 min-h-0 overflow-y-auto text-[${BODY_FONT_SIZE}] leading-relaxed`} style={{ borderColor: "#2a2340", background: "rgba(0,0,0,0.35)", color: "#a99cd4" }}>
          {state.log.map((line, i) => (
            <div key={i}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
