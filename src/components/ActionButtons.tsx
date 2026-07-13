import { BODY_FONT_SIZE, SHOOTING_STAR_SELF_HEAL_AMOUNT } from "../constants";
import { canConvertHandEarth, canPurify, canScorpioHeal, canSelfHeal, canUseVirgoShield, hasAnyAction, purifyDisabledReason } from "../engine/rules";
import { useTranslation } from "../i18n";
import type { GameState, UiMode } from "../types";
import { NeonButton } from "./NeonButton";

/** The row of mode-toggle/action buttons (Move/Purify/sign-specific ability/Cosmic Draw/End Turn)
 * plus the one-line "what's currently armed" description beneath it. Extracted out of ControlPanel
 * so it can be rendered TWICE — once inside ControlPanel for desktop, once in GameScreen's own
 * mobile-only section below the hand panel — toggled via Tailwind `md:` classes at each call site
 * rather than conditional mounting, the same "render twice, one hidden" pattern CardHand already
 * uses (see CLAUDE.md's own note on that). A single source of truth for this markup regardless of
 * which copy is currently visible, instead of two copies drifting apart over time. */
export function ActionButtons({
  state,
  mode,
  onMode,
  discardCount,
  onConfirmDiscard,
  onEndTurn,
  onConvertHandEarth,
  showRotate,
  onRotate,
  shieldPreviewActive,
  healTargeting
}: {
  state: GameState;
  mode: UiMode;
  onMode: (m: UiMode) => void;
  discardCount: number;
  onConfirmDiscard: () => void;
  onEndTurn: () => void;
  onConvertHandEarth: () => void;
  showRotate: boolean;
  onRotate: () => void;
  shieldPreviewActive: boolean;
  healTargeting: boolean;
}) {
  const { t } = useTranslation();
  const p = state.players[state.active];
  const discardCost = p.sign === "LIBRA" && !state.libraUsed ? 0 : 1;
  const purifyAvailable = canPurify(state);
  const virgoShieldAvailable = canUseVirgoShield(state);
  const scorpioHealAvailable = canScorpioHeal(state);
  const convertHandAvailable = canConvertHandEarth(state);
  const selfHealAvailable = canSelfHeal(state);
  const nothingLeftToDo = state.phase === "playing" && !hasAnyAction(state);
  const usedTaurus = p.sign === "TAURUS" && !state.taurusPurifyUsed;

  return (
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
      <div className={`text-[11px] md:text-[${BODY_FONT_SIZE}] leading-snug mt-2.5`} style={{ color: "#6d5f94", fontWeight: "bolder" }}>
        {mode === "move" && t("controlPanel.modeMove")}
        {mode === "place" && t("controlPanel.modePlace") + (showRotate ? t("controlPanel.modePlaceRebelWave") : "")}
        {mode === "discard" && t("controlPanel.modeDiscard")}
        {mode === "purify" && t("controlPanel.modePurify") + (p.sign === "TAURUS" && !state.taurusPurifyUsed ? t("controlPanel.modePurifyFree") : "") + "."}
        {mode === "virgoShield" && (shieldPreviewActive ? t("controlPanel.modeVirgoConfirm") : t("controlPanel.modeVirgoSelect"))}
        {mode === "scorpioHeal" && (healTargeting ? t("controlPanel.modeScorpioTarget") : t("controlPanel.modeScorpioSelect"))}
        {mode === null && t("controlPanel.modeDefault")}
      </div>
    </div>
  );
}
