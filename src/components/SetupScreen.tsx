import { useEffect, useState } from "react";
import { BODY_FONT_SIZE, DEFAULT_SIGNS, ELEMENT_META, RECOMMENDED_SEEDS, SIGNS } from "../constants";
import { navigate } from "../hooks/useRoute";
import { useTranslation } from "../i18n";
import { elementDescription, elementLabel, signAbility, signDesc, signLabel, surgeText, type TFunc } from "../i18n/gameText";
import type { PlayerSetup, Sign } from "../types";
import {
  addFavoriteSeed,
  clearLastSetup,
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
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Select } from "./Select";
import { Tooltip } from "./Tooltip";

const defaultSlots = (numSlots: 2 | 3 | 4): PlayerSetup[] => DEFAULT_SIGNS[numSlots].map((sign, i) => ({ name: `Guardian ${i + 1}`, sign }));

function FavoriteSeedRow({
  fav,
  isFav = true,
  seed,
  t,
  onUse,
  onRemove,
  onRename
}: {
  fav: FavoriteSeed;
  isFav?: boolean;
  seed: string;
  t: TFunc;
  onUse: (seed: string) => void;
  onRemove?: (id: string) => void;
  onRename?: (id: string, nickname: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fav.nickname);
  const isDefaultRecommendedSeed = Boolean(!onRename);
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
        <Tooltip className="flex-1 min-w-0 text-left text-xs truncate" title={isDefaultRecommendedSeed ? t("setup.recommendedSeedTooltipTitle") : undefined} text={isDefaultRecommendedSeed ? t("setup.recommendedSeedTooltipText", { difficultyStarNumber: fav.difficultyStarNumber || 1 }) : t("setup.favoriteSeedTooltip", { seed: fav.seed })} side="right">
          <button type="button" onClick={() => onUse(fav.seed)} className="w-full text-left" style={{ color: "#c084fc" }}>
            {isFav ? "★" : "☆"} {fav.nickname} {isDefaultRecommendedSeed && "✦".repeat(fav.difficultyStarNumber || 1)}
          </button>
        </Tooltip>
      )}
      {!isDefaultRecommendedSeed && !editing && (
        <Tooltip text={t("setup.renameSeedTooltip")}>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs px-1" style={{ color: "#c0b5de" }} aria-label="Rename">
            ✎
          </button>
        </Tooltip>
      )}
      {onRemove && <Tooltip text={t("setup.removeSeedTooltip")}>
        <button type="button" onClick={() => onRemove(fav.id)} className="shrink-0 text-xs px-1" style={{ color: "#c0b5de" }} aria-label="Remove favorite">
          ✕
        </button>
      </Tooltip>}
    </div>
  );
}

export function SetupScreen({ onStart }: { onStart: (setup: PlayerSetup[], seed?: string) => void }) {
  const { t } = useTranslation();
  const [count, setCount] = useState<2 | 3 | 4>(() => loadLastCount() ?? 2);
  const [slots, setSlots] = useState<PlayerSetup[]>(() => {
    const stored = loadLastSetups()[count] ?? defaultSlots(count);
    return Array.from({ length: 4 }, (_, i) => stored[i] ?? defaultSlots(count)[i]);
  });
  const [seed, setSeed] = useState(() => loadLastSeed());
  const [favorites, setFavorites] = useState<FavoriteSeed[]>(() => loadFavoriteSeeds());
  const [referenceExpanded, setReferenceExpanded] = useState(false);
  const activeSlots = slots.slice(0, count);
  const elements = activeSlots.map((s) => SIGNS[s.sign].element);
  const duplicateElements = new Set(elements).size !== elements.length;
  const update = (i: number, patch: Partial<PlayerSetup>) => {
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  };
  const changeCount = (n: 2 | 3 | 4) => {
    setCount(n);
    const stored = loadLastSetups()[n];
    if (stored) setSlots((prev) => prev.map((s, i) => stored[i] ?? s));
    else setSlots(defaultSlots(n));
  };
  const start = () => {
    saveLastSetup(count, activeSlots);
    saveLastSeed(seed);
    onStart(activeSlots, seed);
  };
  const resetToDefaults = () => {
    clearLastSetup(count);
    setSlots((prev) => prev.map((s, i) => (i < count ? defaultSlots(count)[i] : s)));
  };

  useEffect(() => {
    if (duplicateElements) return;

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
  }, [duplicateElements, start]);

  const trimmedSeed = seed.trim();
  const alreadyFavorited = favorites.some((f) => f.seed === trimmedSeed);
  const removeFavorite = (id: string) => setFavorites(removeFavoriteSeed(id));
  const saveCurrentAsFavorite = () => {
    if (!trimmedSeed) return;
    const matchingSavedFavorite = favorites.find((f) => f.seed === trimmedSeed);
    if (matchingSavedFavorite) {
      removeFavorite(matchingSavedFavorite.id);
    } else {
      setFavorites(addFavoriteSeed(trimmedSeed));
    }
  };
  const renameFavorite = (id: string, nickname: string) => setFavorites(renameFavoriteSeed(id, nickname));
  const filteredFavorites = favorites.filter((f) => !RECOMMENDED_SEEDS.some((r) => r.seed === f.seed));

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4 py-8 px-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("home")}
          className="px-2 py-1 rounded border text-xs font-bold tracking-widest uppercase"
          style={{ borderColor: "#3b2d5e", color: "#a99cd4" }}
        >
          ◂ {t("common.backToHome")}
        </button>
        <LanguageSwitcher />
      </div>

      <div className="text-center">
        <div className="text-2xl md:text-3xl font-bold tracking-[0.3em] uppercase" style={{ color: "#f1eeff", textShadow: "0 0 12px #5eb3ff, 0 0 30px #ff00ff" }}>
          {t("common.appNameLine1")}
        </div>
        <div className="text-2xl md:text-3xl font-bold tracking-[0.3em] uppercase" style={{ color: "#5eb3ff", textShadow: "0 0 12px #5eb3ff" }}>
          {t("common.appNameLine2")}
        </div>
        <div className={`mt-2 text-[${BODY_FONT_SIZE}] tracking-widest uppercase`} style={{ color: "#6d5f94", padding: "0px 80px" }}>
          {t("common.tagline")}
        </div>
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        {([2, 3, 4] as (2 | 3 | 4)[]).map((n) => (
          <button
            key={n}
            onClick={() => changeCount(n)}
            className="px-4 py-1.5 rounded border text-sm font-bold"
            style={{
              borderColor: count === n ? "#ff00ff" : "#3b2d5e",
              color: count === n ? "#0b0914" : "#c084fc",
              background: count === n ? "#ff00ff" : "transparent",
              boxShadow: count === n ? "0 0 14px #ff00ff" : "none"
            }}
          >
            {t("setup.guardianCount", { count: n })}
          </button>
        ))}
      </div>

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
              <Tooltip text={alreadyFavorited ? t("setup.removeSeedTooltip") : t("setup.saveSeedTooltip")}>
                <button
                  type="button"
                  onClick={saveCurrentAsFavorite}
                  disabled={!trimmedSeed}
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
            {(filteredFavorites.length > 0 || RECOMMENDED_SEEDS.length > 0) && (
              <div className="flex flex-col gap-1 mt-1">
                {filteredFavorites.length > 0 && filteredFavorites.map((fav) => (
                  <FavoriteSeedRow key={fav.id} fav={fav} seed={seed} t={t} onUse={setSeed} onRemove={removeFavorite} onRename={renameFavorite} />
                ))}
                {RECOMMENDED_SEEDS.length > 0 && (
                  RECOMMENDED_SEEDS.map((recommendation) => {
                    const recommendedSeed = recommendation.seed;
                    const matchingSavedFavorite = favorites.find((f) => f.seed === recommendedSeed);
                    const isFav = Boolean(matchingSavedFavorite);
                    return (
                      <FavoriteSeedRow
                        key={recommendedSeed}
                        fav={{
                          id: isFav ? matchingSavedFavorite.id : recommendedSeed,
                          seed: recommendation.seed,
                          nickname: recommendation.nickname,
                          difficultyStarNumber: recommendation.difficultyStarNumber
                        }}
                        isFav={isFav}
                        seed={seed}
                        t={t}
                        onUse={setSeed}
                        onRemove={isFav ? removeFavorite : undefined}
                      />
                    )
                  })
                )}
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
                        <div className="py-1">
                          <div className="font-bold px-6" style={{ fontSize: "20px", color: c }}>
                            {t("setup.elementGuardiansHeading", { glyph: ELEMENT_META[element].glyph, label })}
                          </div>
                          <div className="text-[14px] px-6 pb-0.5 pl-12" style={{ color: "#a99cd4", fontStyle: 'italic' }}>
                            {elementDescription(t, element)}
                          </div>
                          <div className={`text-[${BODY_FONT_SIZE}] leading-snug pb-1 px-6 pl-12`} style={{ textIndent: '-1.2em' }}>
                            <span className="font-bold" style={{ color: c, fontStyle: 'italic' }}>
                              {t("setup.surgeHeading", { label })}
                            </span>
                            <span style={{ color: "#a99cd4" }}> — {t("setup.surgeSentence", { article: article(label), surgeText: surgeText(t, element) })}</span>
                          </div>
                        </div>
                      )}
                      <div className={`text-[${BODY_FONT_SIZE}] leading-snug py-1 px-6 pl-12`} style={{ textIndent: '-1.2em' }}>
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

          <div className="flex justify-end">
            <Tooltip text={t("setup.resetToDefaultsTooltip")}>
              <button
                type="button"
                onClick={resetToDefaults}
                className="text-[11px] uppercase tracking-widest font-bold px-2.5 py-1 rounded border"
                style={{ borderColor: "#3b2d5e", color: "#6d5f94" }}
              >
                ↺ {t("setup.resetToDefaults")}
              </button>
            </Tooltip>
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
                  <Select
                    value={slot.sign}
                    onChange={(sign) => update(i, { sign })}
                    ariaLabel={t("setup.playerSignSelectLabel", { n: i + 1 })}
                    className="rounded border px-2 py-1.5 text-sm whitespace-nowrap"
                    style={{ borderColor: c, background: "#0b0914", color: c, fontWeight: "bold" }}
                    options={(Object.keys(SIGNS) as Sign[]).map((k) => ({
                      value: k,
                      color: ELEMENT_META[SIGNS[k].element].color,
                      label: (
                        <>
                          {SIGNS[k].glyph} {signLabel(t, k)} · {elementLabel(t, SIGNS[k].element)}
                        </>
                      )
                    }))}
                  />
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
    </div>
  );
}
