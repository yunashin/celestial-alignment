import { type ReactNode, useState } from "react";
import { ASTEROID_SHIFT_INTERVAL, BODY_FONT_SIZE, CHAIN_LENGTH_THRESHOLD, CORRUPTION_DECAY_TURNS, SHOOTING_STAR_COUNT, STARTING_AP } from "../constants";
import { powerUpText, type TFunc } from "../i18n/gameText";
import type { PowerUp } from "../types";
import { boldify } from "../utils/richText";

// Each of the four Shooting Star power-ups gets the same glyph TileView already uses for its own
// corner badge on a shooting-star tile — reusing the established icon language here (rather than
// inventing new ones) is what lets a player recognize the same bonus on the board later.
const POWER_UP_ICONS: Record<PowerUp, string> = {
  TRACKER_DOWN: "☽",
  BONUS_AP: "◇",
  BONUS_HAND: "☆",
  HEAL_UNLOCK: "♡"
};
const POWER_UP_ORDER: PowerUp[] = ["TRACKER_DOWN", "BONUS_AP", "BONUS_HAND", "HEAL_UNLOCK"];

// Both Section and Entry accept either a plain translated string (the common case, auto-run
// through boldify() so a YAML value's `<b>...</b>` markers become real emphasis) or already-
// composed JSX (the few Sections that nest multiple Entry children instead of a single sentence)
// — checking typeof lets every existing plain-string call site pick up bolding for free, without
// having to wrap each one individually.
const richChildren = (children: ReactNode): ReactNode => (typeof children === "string" ? boldify(children) : children);

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-bold tracking-widest uppercase text-sm" style={{ color: "#5eb3ff", textShadow: "0 0 8px #5eb3ff55" }}>
        {heading}
      </div>
      <div className={`text-[${BODY_FONT_SIZE}] leading-relaxed`} style={{ color: "#c9c0e8" }}>
        {richChildren(children)}
      </div>
    </div>
  );
}

// A labeled sub-entry within a Section (a deck/hazard/action type) — the colored left rule ties
// each entry back to that concept's real in-game color (corruption purple, void violet, shooting
// star gold, etc.) so the guide's palette isn't just decorative, it's the same visual language the
// board itself already uses.
function Entry({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return (
    <div className="pl-3 py-0.5 border-l-2" style={{ borderColor: `${color}66` }}>
      <span className="font-bold" style={{ color }}>
        {label}
      </span>
      <span style={{ color: "#a99cd4" }}> — {richChildren(children)}</span>
    </div>
  );
}

function ShortcutRow({ keyLabel, desc }: { keyLabel: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="shrink-0 text-center rounded border font-bold text-[11px] px-1.5 py-0.5"
        style={{ borderColor: "#3b2d5e", color: "#5eb3ff", background: "#0b0914", minWidth: "44px" }}
      >
        {keyLabel}
      </span>
      <span className={`text-[${BODY_FONT_SIZE}]`} style={{ color: "#a99cd4" }}>
        {boldify(desc)}
      </span>
    </div>
  );
}

function ShortcutCategory({ label, rows }: { label: string; rows: { keyLabel: string; desc: string }[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] font-bold tracking-widest uppercase pt-2 pb-0.5" style={{ color: "#6d5f94" }}>
        {label}
      </div>
      {rows.map((r) => (
        <ShortcutRow key={r.keyLabel} {...r} />
      ))}
    </div>
  );
}

export function HowToPlay({ t, screenshots }: { t: TFunc; screenshots?: { board: string; corruption: string } }) {
  const [shortcutsExpanded, setShortcutsExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className={`text-[${BODY_FONT_SIZE}] leading-relaxed`} style={{ color: "#a99cd4" }}>
        {boldify(t("howToPlay.intro"))}
      </div>

      <div className="rounded-lg border p-2 pb-3" style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.8)" }}>
        <button
          type="button"
          onClick={() => setShortcutsExpanded((v) => !v)}
          className={`w-full flex items-center justify-between text-[${BODY_FONT_SIZE}] font-bold tracking-widest uppercase px-1`}
          style={{ color: "#6d5f94" }}
          aria-expanded={shortcutsExpanded}
        >
          <span>{t("howToPlay.shortcutsToggle")}</span>
          <span style={{ display: "inline-block" }}>{shortcutsExpanded ? "-" : "+"}</span>
        </button>
        {shortcutsExpanded && (
          <div className="px-1 mt-1">
            <ShortcutCategory
              label={t("howToPlay.shortcuts.categoryGeneral")}
              rows={[
                { keyLabel: "Tab", desc: t("howToPlay.shortcuts.focusNext") },
                { keyLabel: "Shift + Tab", desc: t("howToPlay.shortcuts.focusPrev") },
                { keyLabel: "Shift + Enter", desc: t("howToPlay.shortcuts.start") },
                { keyLabel: "B", desc: t("howToPlay.shortcuts.back") },
                { keyLabel: "Esc", desc: t("howToPlay.shortcuts.escape") },
                { keyLabel: "E", desc: t("howToPlay.shortcuts.endTurn") }
              ]}
            />
            <ShortcutCategory
              label={t("howToPlay.shortcuts.categoryBoard")}
              rows={[
                { keyLabel: "↑ ↓ ← →", desc: t("howToPlay.shortcuts.arrows") },
                { keyLabel: "Enter / Space", desc: t("howToPlay.shortcuts.confirm") },
                { keyLabel: "1 – 6", desc: t("howToPlay.shortcuts.handSelect") }
              ]}
            />
            <ShortcutCategory
              label={t("howToPlay.shortcuts.categoryActions")}
              rows={[
                { keyLabel: "M", desc: t("howToPlay.shortcuts.move") },
                { keyLabel: "P", desc: t("howToPlay.shortcuts.purify") },
                { keyLabel: "C", desc: t("howToPlay.shortcuts.cosmicDraw") }
              ]}
            />
            <ShortcutCategory
              label={t("howToPlay.shortcuts.categorySign")}
              rows={[
                { keyLabel: "R", desc: t("howToPlay.shortcuts.rotate") },
                { keyLabel: "T", desc: t("howToPlay.shortcuts.terraform") },
                { keyLabel: "H", desc: t("howToPlay.shortcuts.scorpioHeal") },
                { keyLabel: "V", desc: t("howToPlay.shortcuts.virgoShield") }
              ]}
            />
          </div>
        )}
      </div>

      <Section heading={t("howToPlay.story.heading")}>{t("howToPlay.story.text")}</Section>

      {screenshots && (
        <figure className="flex flex-col gap-1">
          <img src={screenshots.board} alt="A Celestial Alignment board mid-game, showing Star Card paths built out from several edge nodes toward the Orrery" className="w-full rounded-lg border" style={{ borderColor: "#3b2d5e" }} />
          <figcaption className="text-[11px] text-center" style={{ color: "#6d5f94" }}>
            {t("howToPlay.boardImgCaption")}
          </figcaption>
        </figure>
      )}

      <Section heading={t("howToPlay.objective.heading")}>{t("howToPlay.objective.text")}</Section>
      <Section heading={t("howToPlay.players.heading")}>{t("howToPlay.players.text")}</Section>
      <Section heading={t("howToPlay.actionPoints.heading")}>{t("howToPlay.actionPoints.text", { ap: STARTING_AP })}</Section>

      <Section heading={t("howToPlay.decks.heading")}>
        <div className="flex flex-col gap-1.5">
          <Entry label={t("howToPlay.decks.starDeck.label")} color="#e2e8f0">
            {t("howToPlay.decks.starDeck.text")}
          </Entry>
          <div>
            <Entry label={t("howToPlay.decks.eclipseDeck.label")} color="#c084fc">
              {t("howToPlay.decks.eclipseDeck.intro")}
            </Entry>
            <div className="flex flex-col gap-1 mt-1 ml-3">
              <Entry label={t("howToPlay.decks.eclipseDeck.corruption.label")} color="#a855f7">
                {t("howToPlay.decks.eclipseDeck.corruption.text", { decayTurns: CORRUPTION_DECAY_TURNS })}
              </Entry>
              <Entry label={t("howToPlay.decks.eclipseDeck.voidCard.label")} color="#7c3aed">
                {t("howToPlay.decks.eclipseDeck.voidCard.text")}
              </Entry>
              <Entry label={t("howToPlay.decks.eclipseDeck.surge.label")} color="#c084fc">
                {t("howToPlay.decks.eclipseDeck.surge.text")}
              </Entry>
              <Entry label={t("howToPlay.decks.eclipseDeck.damage.label")} color="#ff5f9e">
                {t("howToPlay.decks.eclipseDeck.damage.text")}
              </Entry>
            </div>
          </div>
        </div>
      </Section>

      {screenshots && (
        <figure className="flex flex-col gap-1">
          <img src={screenshots.corruption} alt="A corrupted Star Card tile on the board with its countdown tooltip open, next to an asteroid and a shooting star" className="w-full rounded-lg border" style={{ borderColor: "#3b2d5e" }} />
          <figcaption className="text-[11px] text-center" style={{ color: "#6d5f94" }}>
            {t("howToPlay.corruptionImgCaption")}
          </figcaption>
        </figure>
      )}

      <Section heading={t("howToPlay.environmentFactors.heading")}>
        <div className="flex flex-col gap-1.5">
          <Entry label={t("howToPlay.environmentFactors.asteroids.label")} color="#94a3b8">
            {t("howToPlay.environmentFactors.asteroids.text", {
              interval2: ASTEROID_SHIFT_INTERVAL[2],
              interval3: ASTEROID_SHIFT_INTERVAL[3],
              interval4: ASTEROID_SHIFT_INTERVAL[4]
            })}
          </Entry>
          <div>
            <Entry label={t("howToPlay.environmentFactors.shootingStars.label")} color="#ffd166">
              {t("howToPlay.environmentFactors.shootingStars.text", { shootingStarCount: SHOOTING_STAR_COUNT })}
            </Entry>
            <div className="flex flex-col gap-0.5 mt-1 ml-3">
              {POWER_UP_ORDER.map((pu) => (
                <div key={pu} className={`text-[${BODY_FONT_SIZE}]`} style={{ color: "#a99cd4" }}>
                  <span style={{ color: "#ffd166" }}>{POWER_UP_ICONS[pu]}</span> {boldify(powerUpText(t, pu))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section heading={t("howToPlay.turnActions.heading")}>
        <div className="flex flex-col gap-1.5">
          <Entry label={t("howToPlay.turnActions.channel.label")} color="#00ffff">
            {t("howToPlay.turnActions.channel.text")}
          </Entry>
          <Entry label={t("howToPlay.turnActions.move.label")} color="#00ffff">
            {t("howToPlay.turnActions.move.text")}
          </Entry>
          <Entry label={t("howToPlay.turnActions.purify.label")} color="#00ffff">
            {t("howToPlay.turnActions.purify.text")}
          </Entry>
          <Entry label={t("howToPlay.turnActions.cosmicDraw.label")} color="#00ffff">
            {t("howToPlay.turnActions.cosmicDraw.text")}
          </Entry>
          <div className="pt-1" style={{ color: "#a99cd4" }}>
            {boldify(t("howToPlay.turnActions.abilitiesNote"))}
          </div>
        </div>
      </Section>

      <Section heading={t("howToPlay.winLoss.heading")}>{t("howToPlay.winLoss.text")}</Section>

      <Section heading={t("howToPlay.rules.heading")}>
        <ul className="list-disc pl-5 flex flex-col gap-1">
          <li>{boldify(t("howToPlay.rules.asteroidProtection"))}</li>
          <li>{boldify(t("howToPlay.rules.loopImmunity"))}</li>
          <li>{boldify(t("howToPlay.rules.purifiedImmunity"))}</li>
          <li>{boldify(t("howToPlay.rules.chainDiscount", { chainThreshold: CHAIN_LENGTH_THRESHOLD }))}</li>
        </ul>
      </Section>
    </div>
  );
}
