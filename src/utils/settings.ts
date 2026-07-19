import { useSyncExternalStore } from "react";

export interface Settings {
  /** 0-1, applied directly to the background-music <audio> element's volume — see
   * hooks/useBackgroundMusic.ts. */
  musicVolume: number;
  /** 0-1, multiplied into every synthesized sound cue's own gain at play time — see
   * utils/sound.ts's playSound(). */
  sfxVolume: number;
}

// Matches the game's own long-standing hardcoded volume (see useBackgroundMusic.ts's original
// VOLUME constant) and a reasonable default for sound effects, which had no volume control at all
// before this settings screen existed.
const DEFAULT_SETTINGS: Settings = { musicVolume: 0.25, sfxVolume: 0.6 };
const STORAGE_KEY = "celestial-alignment:settings";

/** All storage here is best-effort — a disabled/unavailable localStorage (private browsing,
 * embedded iframe, etc.) should never break the app, just silently fall back to the defaults and
 * never persist, matching the same convention as i18n/index.ts and utils/setupStorage.ts. */
function loadStoredSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      musicVolume: clamp01(parsed.musicVolume, DEFAULT_SETTINGS.musicVolume),
      sfxVolume: clamp01(parsed.sfxVolume, DEFAULT_SETTINGS.sfxVolume)
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

let current: Settings = loadStoredSettings();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

/** Merges `patch` into the current settings, persists, and notifies every subscriber — same
 * "plain function + module-level store" shape as i18n/index.ts's setLocale, so both React
 * components (via useSettings() below) and non-reactive call sites (utils/sound.ts's playSound,
 * which isn't a hook) can read the live value without prop-drilling. */
export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore — the choice just won't persist across visits
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Re-renders the calling component whenever settings change, from this tab (the Settings screen
 * itself) or another one (localStorage doesn't fire a "storage" event in the SAME tab that wrote
 * it, so cross-tab sync isn't attempted here — out of scope for a single-player-at-a-time game). */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings);
}
