import { load } from "js-yaml";
import { useSyncExternalStore } from "react";
import enRaw from "./en.yaml?raw";
import koRaw from "./ko.yaml?raw";

export interface LanguageOption {
  code: string;
  nativeLabel: string;
}

/** Adding a future language: create src/i18n/<code>.yaml (start as a copy of en.yaml so every key
 * exists — see ko.yaml's own header comment), `import <code>Raw from "./<code>.yaml?raw"` above,
 * add it to RESOURCES below, and add one entry here. Nothing else in the app needs to change —
 * every component/engine call site goes through the same t()/useTranslation() surface. */
export const LANGUAGES: LanguageOption[] = [
  { code: "en", nativeLabel: "English" },
  { code: "ko", nativeLabel: "한국어" }
];

type Dict = Record<string, unknown>;

const RESOURCES: Record<string, Dict> = {
  en: load(enRaw) as Dict,
  ko: load(koRaw) as Dict
};

const DEFAULT_LOCALE = "en";
const STORAGE_KEY = "celestial-alignment:locale";

/** All storage here is best-effort — a disabled/unavailable localStorage (private browsing,
 * embedded iframe, etc.) should never break the app, just silently fall back to the default. */
function loadStoredLocale(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && RESOURCES[stored] ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

let currentLocale = loadStoredLocale();
const listeners = new Set<() => void>();

export function getLocale(): string {
  return currentLocale;
}

export function setLocale(code: string) {
  if (!RESOURCES[code] || code === currentLocale) return;
  currentLocale = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore — the choice just won't persist across visits
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Looks up a dot-path key (e.g. "signs.ARIES.label") inside a parsed locale dict. */
function lookup(dict: Dict, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Dict)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Translates `key` (a dot-path into en.yaml/ko.yaml) using whichever locale is CURRENTLY active,
 * interpolating `{name}`-style placeholders from `params`. Falls back to English if the key is
 * missing in the active locale (e.g. a newer key Korean hasn't been translated for yet), and falls
 * back to the key itself if it's missing from every locale — this also means passing an arbitrary
 * literal string as `key` (not an actual YAML path) just returns that string verbatim, which is
 * deliberately relied on by engine unit tests that force a plain-English `EclipseCard.damageMessage`
 * onto a card and expect it to appear in the log unchanged (see reducer/eclipse test files).
 *
 * Plain function, not a hook — usable from pure engine code (reducer.ts/eclipse.ts have no React)
 * as well as components. A log message built this way is baked into `GameState.log` as a plain
 * string at the moment it's generated and is NOT retroactively re-translated if the player later
 * switches language — same as how most apps treat a historical log/toast feed. Components that need
 * to re-render when the locale changes should go through `useTranslation()` below instead, which
 * subscribes to locale changes; this plain `t` always reads whatever the CURRENT global locale is.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const raw = lookup(RESOURCES[currentLocale], key) ?? lookup(RESOURCES[DEFAULT_LOCALE], key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** React binding: re-renders the calling component whenever `setLocale` changes the active locale
 * (via `useSyncExternalStore`), and hands back the same `t`/`setLocale` every other call site uses —
 * components and engine code share one translation surface, just with/without the reactivity. */
export function useTranslation() {
  const locale = useSyncExternalStore(subscribe, getLocale);
  return { t, locale, setLocale };
}

/** Recursively collects every leaf (string-valued) dot-path key in a parsed locale dict. */
function collectKeys(dict: Dict, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [k, v] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") keys.add(path);
    else if (typeof v === "object" && v !== null) collectKeys(v as Dict, path).forEach((sub) => keys.add(sub));
  }
  return keys;
}

// Dev-time guard against key drift: every non-English locale file is a hand-maintained copy of
// en.yaml's structure (see ko.yaml's header) — if a future edit adds/removes/renames a key in one
// file but not the other, `t()` would silently fall back to English (or the raw key) rather than
// erroring, which is the right runtime behavior but an easy mistake to miss in review. This never
// throws, just warns, and only runs once at module load — cheap enough (a few hundred keys) to
// leave in for production too rather than gating it behind import.meta.env.DEV.
(function checkLocaleKeyParity() {
  const enKeys = collectKeys(RESOURCES.en);
  for (const [code, dict] of Object.entries(RESOURCES)) {
    if (code === DEFAULT_LOCALE) continue;
    const localeKeys = collectKeys(dict);
    const missing = [...enKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !enKeys.has(k));
    if (missing.length) console.warn(`[i18n] locale "${code}" is missing ${missing.length} key(s) present in en.yaml:`, missing);
    if (extra.length) console.warn(`[i18n] locale "${code}" has ${extra.length} extra key(s) not present in en.yaml:`, extra);
  }
})();
