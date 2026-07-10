import { useEffect, useState } from "react";
import { BODY_FONT_SIZE, DEFAULT_SIGNS, ELEMENT_META, SIGNS } from "../constants";
import { useTranslation } from "../i18n";
import { elementDescription, elementLabel, signAbility, signDesc, signLabel, surgeText, type TFunc } from "../i18n/gameText";
import type { PlayerSetup, Sign } from "../types";
import {
  addFavoriteSeed,
  loadFavoriteSeeds,
  loadLastCount,
  loadLastSeed,
  loadLastSetups,
  removeFavoriteSeed,
  renameFavoriteSeed,
  saveLastSeed,
  saveLastSetup,
  type FavoriteSeed
} from "../utils/setupStorage";
import { article } from "../utils/grammar";
import { HowToPlay } from "./HowToPlay";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Tooltip } from "./Tooltip";
import boardImage from "../assets/how-to-play/story.png";
import corruptionImage from '../assets/how-to-play/corrupted-star-card.png';

const defaultSlots = (): PlayerSetup[] => DEFAULT_SIGNS.map((sign, i) => ({ name: `Guardian ${i + 1}`, sign }));

function FavoriteSeedRow({
  fav,
  seed,
  t,
  onUse,
  onRemove,
  onRename
}: {
  fav: FavoriteSeed;
  seed: string;
  t: TFunc;
  onUse: (seed: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, nickname: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fav.nickname);
  const commit = () => {
    onRename(fav.id, draft);
    setEditing(false);
  };
  const favIsCurrentSeed = fav.seed === seed;
  return (
    <div className="flex items-center gap-1.5 rounded border px-2 py-1" style={{ borderColor: "#3b2d5e", backgroundColor: favIsCurrentSeed ? "#3b2d5e" : undefined }}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              setDraft(fav.nickname);
              setEditing(false);
            }
          }}
          className="flex-1 min-w-0 rounded border px-1.5 py-0.5 text-xs outline-none"
          style={{ borderColor: "#5eb3ff", background: "#0b0914", color: "#f1eeff" }}
        />
      ) : (
        <button type="button" onClick={() => onUse(fav.seed)} className="flex-1 min-w-0 text-left text-xs truncate" style={{ color: "#c084fc" }}>
          <Tooltip text={t("setup.favoriteSeedTooltip", { seed: fav.seed })} side="left">
            ★ {fav.nickname}
          </Tooltip>
        </button>
      )}
      {!editing && (
        <Tooltip text={t("setup.renameSeedTooltip")}>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-[10px] px-1" style={{ color: "#6d5f94" }} aria-label="Rename">
            ✎
          </button>
        </Tooltip>
      )}
      <Tooltip text={t("setup.removeSeedTooltip")}>
        <button type="button" onClick={() => onRemove(fav.id)} className="shrink-0 text-[10px] px-1" style={{ color: "#6d5f94" }} aria-label="Remove favorite">
          ✕
        </button>
      </Tooltip>
    </div>
  );
}

export function SetupScreen({ onStart }: { onStart: (setup: PlayerSetup[], seed?: string) => void }) {
  const { t } = useTranslation();
  const [count, setCount] = useState(() => loadLastCount() ?? 2);
  const [slots, setSlots] = useState<PlayerSetup[]>(() => {
    const stored = loadLastSetups()[count] ?? defaultSlots();
    return Array.from({ length: 4 }, (_, i) => stored[i] ?? defaultSlots()[i]);
  });
  const [seed, setSeed] = useState(() => loadLastSeed());
  const [favorites, setFavorites] = useState<FavoriteSeed[]>(() => loadFavoriteSeeds());
  const [referenceExpanded, setReferenceExpanded] = useState(false);
  // "How to Play" sits as a 4th tab to the left of the 2/3/4-Guardian count tabs — selecting a
  // count always jumps back to the "setup" tab (see changeCount below) so there's no dead-end
  // where a count button looks selectable but silently does nothing while the guide is showing.
  const [activeTab, setActiveTab] = useState<"setup" | "howToPlay">("setup");
  const activeSlots = slots.slice(0, count);
  const elements = activeSlots.map((s) => SIGNS[s.sign].element);
  const duplicateElements = new Set(elements).size !== elements.length;
  const update = (i: number, patch: Partial<PlayerSetup>) => {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  };
  const changeCount = (n: number) => {
    setCount(n);
    setActiveTab("setup");
    const stored = loadLastSetups()[n];
    if (stored) setSlots((prev) => prev.map((s, i) => stored[i] ?? s));
  };
  const start = () => {
    saveLastSetup(count, activeSlots);
    saveLastSeed(seed);
    onStart(activeSlots, seed);
  };

  useEffect(() => {
    if (activeTab !== 'setup' || duplicateElements) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (k === "enter" && e.shiftKey) {
        start();
        e.preventDefault();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, duplicateElements, start]);

  const trimmedSeed = seed.trim();
  const alreadyFavorited = favorites.some((f) => f.seed === trimmedSeed);
  const saveCurrentAsFavorite = () => {
    if (!trimmedSeed) return;
    setFavorites(addFavoriteSeed(trimmedSeed));
  };
  const removeFavorite = (id: string) => setFavorites(removeFavoriteSeed(id));
  const renameFavorite = (id: string, nickname: string) => setFavorites(renameFavoriteSeed(id, nickname));

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4 py-8 px-4">
      <div className="flex justify-end">
        <LanguageSwitcher />
      </div>

      <div className="text-center">
        <div className="text-2xl sm:text-3xl font-bold tracking-[0.3em] uppercase" style={{ color: "#f1eeff", textShadow: "0 0 12px #5eb3ff, 0 0 30px #ff00ff" }}>
          {t("common.appNameLine1")}
        </div>
        <div className="text-2xl sm:text-3xl font-bold tracking-[0.3em] uppercase" style={{ color: "#5eb3ff", textShadow: "0 0 12px #5eb3ff" }}>
          {t("common.appNameLine2")}
        </div>
        <div className={`mt-2 text-[${BODY_FONT_SIZE}] tracking-widest uppercase`} style={{ color: "#6d5f94", padding: "0px 80px" }}>
          {t("common.tagline")}
        </div>
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveTab("howToPlay")}
          className="px-4 py-1.5 rounded border text-sm font-bold"
          style={{
            borderColor: activeTab === "howToPlay" ? "#5eb3ff" : "#3b2d5e",
            color: activeTab === "howToPlay" ? "#0b0914" : "#5eb3ff",
            background: activeTab === "howToPlay" ? "#5eb3ff" : "transparent",
            boxShadow: activeTab === "howToPlay" ? "0 0 14px #5eb3ff" : "none"
          }}
        >
          {t("setup.howToPlayTab")}
        </button>
        {[2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => changeCount(n)}
            className="px-4 py-1.5 rounded border text-sm font-bold"
            style={{
              borderColor: activeTab === "setup" && count === n ? "#ff00ff" : "#3b2d5e",
              color: activeTab === "setup" && count === n ? "#0b0914" : "#c084fc",
              background: activeTab === "setup" && count === n ? "#ff00ff" : "transparent",
              boxShadow: activeTab === "setup" && count === n ? "0 0 14px #ff00ff" : "none"
            }}
          >
            {t("setup.guardianCount", { count: n })}
          </button>
        ))}
      </div>

      {activeTab === "howToPlay" && (
        <div className="rounded-lg border p-3" style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.8)" }}>
          <HowToPlay t={t} screenshots={{ board: boardImage, corruption: corruptionImage }} />
        </div>
      )}

      {activeTab === "setup" && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex" style={{ alignItems: "baseline" }}>
              <label className={`text-[${BODY_FONT_SIZE}] font-bold tracking-widest uppercase px-1`} style={{ color: "#6d5f94" }}>
                {t("setup.boardSeedLabel")}
              </label>
              <span
                className="text-[12px] uppercase font-bold px-2"
                style={{
                  marginLeft: "6px",
                  borderRadius: "12px",
                  fontStyle: "italic",
                  color: "#6d5f94",
                  border: "0.5px solid #2f215a"
                }}
              >
                {t("setup.boardSeedOptional")}
              </span>
            </div>
            <div className="flex gap-1.5">
              <input
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                className={`flex-1 min-w-0 rounded border px-2 py-1.5 text-[${BODY_FONT_SIZE}] outline-none`}
                style={{ borderColor: "#3b2d5e", background: "#0b0914", color: "#f1eeff" }}
                placeholder={t("setup.boardSeedPlaceholder")}
              />
              <Tooltip text={alreadyFavorited ? t("setup.alreadySavedTooltip") : t("setup.saveSeedTooltip")}>
                <button
                  type="button"
                  onClick={saveCurrentAsFavorite}
                  disabled={!trimmedSeed || alreadyFavorited}
                  className="shrink-0 px-2 rounded border text-sm"
                  style={{
                    borderColor: alreadyFavorited ? "#ffd166" : "#3b2d5e",
                    color: !trimmedSeed ? "#4c3f73" : "#ffd166",
                    cursor: !trimmedSeed || alreadyFavorited ? "default" : "pointer"
                  }}
                >
                  {alreadyFavorited ? "★" : "☆"}
                </button>
              </Tooltip>
            </div>
            {favorites.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                {favorites.map((fav) => (
                  <FavoriteSeedRow key={fav.id} fav={fav} seed={seed} t={t} onUse={setSeed} onRemove={removeFavorite} onRename={renameFavorite} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-2 pb-4" style={{ borderColor: "#3b2d5e", background: "rgba(16,12,30,0.8)" }}>
            <button
              type="button"
              onClick={() => setReferenceExpanded((v) => !v)}
              className={`w-full flex items-center justify-between text-[${BODY_FONT_SIZE}] font-bold tracking-widest uppercase px-1`}
              style={{ color: "#6d5f94" }}
              aria-expanded={referenceExpanded}
            >
              <span>✦ {t("setup.referenceTitle")}</span>
              <span style={{ display: "inline-block" }}>{referenceExpanded ? "-" : "+"}</span>
            </button>
            {referenceExpanded && (
              <div className="flex flex-col gap-1.5 overflow-y-scroll px-1 mt-1.5" style={{ paddingRight: "12px", maxHeight: "400px" }}>
                {(Object.keys(SIGNS) as Sign[]).map((k, idx) => {
                  const element = SIGNS[k].element;
                  const c = ELEMENT_META[element].color;
                  const label = elementLabel(t, element);
                  return (
                    <div key={k}>
                      {idx % 3 === 0 && (
                        <div className="py-2">
                          <div className="font-bold" style={{ fontSize: "20px", color: c }}>
                            {t("setup.elementGuardiansHeading", { glyph: ELEMENT_META[element].glyph, label })}
                          </div>
                          <div className="font-bold text-[14px]" style={{ marginLeft: "25px", color: "#a99cd4" }}>
                            {elementDescription(t, element)}
                          </div>
                          <div className="text-[14px] pt-3 pb-1" style={{ paddingLeft: "10px", textIndent: "-0.5px", color: c }}>
                            <div className="font-bold" style={{ color: c }}>
                              {t("setup.surgeHeading", { label })}
                            </div>
                            <div style={{ color: "#a99cd4", paddingLeft: "15px" }}>{t("setup.surgeSentence", { article: article(label), surgeText: surgeText(t, element) })}</div>
                          </div>
                        </div>
                      )}
                      <div className={`text-[${BODY_FONT_SIZE}] leading-snug py-1`} style={{ marginLeft: "21px" }}>
                        <span className="font-bold" style={{ color: c }}>
                          {SIGNS[k].glyph} {signLabel(t, k)} · {signAbility(t, k)}
                        </span>
                        <span style={{ color: "#a99cd4" }}> — {signDesc(t, k)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {activeSlots.map((slot, i) => {
            const el = SIGNS[slot.sign].element;
            const c = ELEMENT_META[el].color;
            return (
              <div key={i} className="rounded-lg border p-3 flex flex-col gap-2" style={{ borderColor: `${c}55`, background: "rgba(16,12,30,0.8)" }}>
                <div className="flex gap-2">
                  <input
                    value={slot.name}
                    onChange={(e) => update(i, { name: e.target.value ? e.target.value : `Guardian ${i + 1}` })}
                    className="flex-1 min-w-0 rounded border px-2 py-1.5 text-sm outline-none"
                    style={{ borderColor: "#3b2d5e", background: "#0b0914", color: "#f1eeff" }}
                    placeholder={t("setup.playerNamePlaceholder", { n: i + 1 })}
                    maxLength={20}
                  />
                  <select
                    value={slot.sign}
                    onChange={(e) => update(i, { sign: e.target.value as Sign })}
                    className="rounded border px-2 py-1.5 text-sm"
                    style={{ borderColor: c, background: "#0b0914", color: c, fontWeight: "bold" }}
                  >
                    {(Object.keys(SIGNS) as Sign[]).map((k) => (
                      <option key={k} value={k}>
                        {SIGNS[k].glyph} {signLabel(t, k)} · {elementLabel(t, SIGNS[k].element)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={`text-[${BODY_FONT_SIZE}] leading-snug`} style={{ color: "#a99cd4" }}>
                  <span style={{ color: c, fontWeight: "bold" }}>{signAbility(t, slot.sign)}:</span> {signDesc(t, slot.sign)}
                </div>
              </div>
            );
          })}

          {duplicateElements && (
            <div className={`text-center text-[${BODY_FONT_SIZE}]`} style={{ color: "#ff5f9e" }}>
              {t("setup.duplicateElementsWarning")}
            </div>
          )}

          <button
            onClick={start}
            disabled={duplicateElements}
            className="mx-auto px-8 py-2.5 rounded border text-sm font-bold uppercase"
            style={{
              borderColor: duplicateElements ? "#3b2d5e" : "#5eb3ff",
              color: duplicateElements ? "#4c3f73" : "#0b0914",
              background: duplicateElements ? "transparent" : "#5eb3ff",
              boxShadow: duplicateElements ? "none" : "0 0 20px #5eb3ff",
              cursor: duplicateElements ? "not-allowed" : "pointer"
            }}
          >
            <div className="tracking-[0.25em]">Start ▸</div>
            <div className="text-[11px] tracking-widest opacity-70">Shift + Enter</div>
          </button>
        </>
      )}
    </div>
  );
}
